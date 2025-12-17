import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // --- 1. LOAD MODEL (Your Working Logic) ---
  const { nodes, materials } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();

  // --- 2. LOAD ANIMATIONS (Your Working Logic) ---
  // We use the single .glb file since you said this version worked before.
  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions } = useAnimations(animations, group);

  // Audio Refs for Client-Side Lip Sync
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- 3. ANIMATION CONTROLLER ---
  useEffect(() => {
    // Basic Fallback: Find an idle animation if specific names fail
    let actionToPlay = actions["Standing_Idle"] || actions["Idle"] || Object.values(actions)[0];

    // Priority Logic
    if (loading) {
       // Optional: actionToPlay = actions["Thinking"];
    }
    
    // Play requested animation
    if (message && message.animation && actions[message.animation]) {
      actionToPlay = actions[message.animation];
    } 
    else if (message && message.audio) {
       actionToPlay = actions["Talking_1"] || actions["Talking"];
    }

    // Play with fade
    if (actionToPlay) {
      actionToPlay.reset().fadeIn(0.5).play();
      return () => {
        actionToPlay.fadeOut(0.5);
      };
    }
  }, [message, loading, actions]);

  // --- 4. AUDIO SETUP (One Time) ---
  useEffect(() => {
    if (!analyserRef.current) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      source.connect(audioContext.destination);
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  // --- 5. AUDIO PLAYBACK HANDLING ---
  useEffect(() => {
    if (!message) return;

    if (!message.audio) {
        setTimeout(onMessagePlayed, 3000);
        return;
    }

    const audio = audioRef.current;
    if (message.audio.startsWith("data:audio")) {
        audio.src = message.audio;
    } else {
        audio.src = "data:audio/mp3;base64," + message.audio;
    }
    
    audio.volume = 1.0;
    audio.currentTime = 0;

    if (analyserRef.current && analyserRef.current.context.state === 'suspended') {
        analyserRef.current.context.resume();
    }

    audio.play().catch(e => { console.error("Audio Error:", e); onMessagePlayed(); });
    audio.onended = onMessagePlayed;

  }, [message]);

  // --- 6. LIP SYNC FRAME LOOP (The Missing Piece) ---
  useFrame(() => {
    // Safety check
    if (!nodes.Wolf3D_Head) return;

    // Find Morph Target
    const dictionary = nodes.Wolf3D_Head.morphTargetDictionary;
    const mouthIdx = dictionary["mouthOpen"] !== undefined ? dictionary["mouthOpen"] : dictionary["viseme_aa"];
    
    if (mouthIdx === undefined) return;

    const audio = audioRef.current;
    let targetOpen = 0;

    // Calculate Volume
    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 50; i++) sum += dataArrayRef.current[i];
      const average = sum / 40; 
      targetOpen = THREE.MathUtils.mapLinear(average, 0, 80, 0, 1); 
    }

    // Apply Smoothly
    const currentInfluence = nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx];
    const newValue = THREE.MathUtils.lerp(currentInfluence, targetOpen, 0.5);

    // Apply to Head
    nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx] = newValue;
    
    // Apply to Teeth
    if (nodes.Wolf3D_Teeth) {
        const teethDict = nodes.Wolf3D_Teeth.morphTargetDictionary;
        const teethIdx = teethDict["mouthOpen"] !== undefined ? teethDict["mouthOpen"] : teethDict["viseme_aa"];
        if (teethIdx !== undefined) {
            nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx] = newValue;
        }
    }
  });

  // --- 7. RENDERER (Your Working Version) ---
  return (
    <group {...props} dispose={null} ref={group}>
      {/* Skeleton Root */}
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
      {/* Render all meshes found in the file */}
      {Object.keys(nodes).map((name) => {
        if (nodes[name].isSkinnedMesh) {
          return (
            <skinnedMesh
              key={name}
              geometry={nodes[name].geometry}
              material={nodes[name].material}
              skeleton={nodes[name].skeleton}
              morphTargetDictionary={nodes[name].morphTargetDictionary}
              morphTargetInfluences={nodes[name].morphTargetInfluences}
              frustumCulled={false} // Force visibility
            />
          );
        }
        return null;
      })}
    </group>
  );
};

useGLTF.preload("/models/monika_v99.glb");
useGLTF.preload("/models/animations.glb");