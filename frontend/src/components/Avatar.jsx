import { useEffect, useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // --- 1. LOAD MODEL ---
  const { nodes, materials } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();

  // --- 2. LOAD ANIMATIONS ---
  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions } = useAnimations(animations, group);

  // Audio Refs
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- 3. DYNAMICALLY FIND TEETH ---
  // This finds the teeth node regardless of exact name (e.g. Wolf3D_Teeth)
  const teethNode = useMemo(() => {
    return Object.values(nodes).find((node) => node.name.includes("Teeth"));
  }, [nodes]);

  // --- 4. ANIMATION CONTROLLER ---
  useEffect(() => {
    let actionToPlay = actions["Standing_Idle"] || actions["Idle"] || Object.values(actions)[0];

    if (loading) {
       // Optional: actionToPlay = actions["Thinking"];
    }
    
    if (message && message.animation && actions[message.animation]) {
      actionToPlay = actions[message.animation];
    } 
    else if (message && message.audio) {
       actionToPlay = actions["Talking_1"] || actions["Talking"];
    }

    if (actionToPlay) {
      actionToPlay.reset().fadeIn(0.5).play();
      return () => {
        actionToPlay.fadeOut(0.5);
      };
    }
  }, [message, loading, actions]);

  // --- 5. AUDIO SETUP ---
  useEffect(() => {
    if (!analyserRef.current) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512; 
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      source.connect(audioContext.destination);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  // --- 6. AUDIO PLAYBACK ---
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

  // --- 7. SNAPPY LIP SYNC LOOP ---
  useFrame(() => {
    if (!nodes.Wolf3D_Head) return;

    const headDict = nodes.Wolf3D_Head.morphTargetDictionary;
    const headIdx = headDict["mouthOpen"] !== undefined ? headDict["mouthOpen"] : headDict["viseme_aa"];
    if (headIdx === undefined) return;

    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      // Calculate average volume (Speech Range)
      for (let i = 10; i < 60; i++) {
          sum += dataArrayRef.current[i];
      }
      let average = sum / 50;

      // --- TUNING FOR SNAPPY LIPS ---
      // 1. Hard Noise Gate: High threshold (20) forces mouth SHUT when not speaking loudly.
      // This prevents the "hanging open" look.
      if (average < 20) average = 0; 

      // 2. Map & Square:
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      targetOpen = value * value * 1.8; // Higher multiplier for "Pop"
      
      if (targetOpen > 1) targetOpen = 1;
    }

    // Apply to HEAD (0.8 = Snappy)
    const currentHead = nodes.Wolf3D_Head.morphTargetInfluences[headIdx];
    const newHeadValue = THREE.MathUtils.lerp(currentHead, targetOpen, 0.8);
    nodes.Wolf3D_Head.morphTargetInfluences[headIdx] = newHeadValue;

    // Apply to TEETH (Dynamic Find)
    if (teethNode && teethNode.morphTargetDictionary && teethNode.morphTargetInfluences) {
        const teethDict = teethNode.morphTargetDictionary;
        const teethIdx = teethDict["mouthOpen"] !== undefined ? teethDict["mouthOpen"] : teethDict["viseme_aa"];
        
        if (teethIdx !== undefined) {
             teethNode.morphTargetInfluences[teethIdx] = newHeadValue;
        }
    }
  });

  // --- 8. ROBUST RENDERER ---
  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
      {/* Renders EVERYTHING (Mesh AND SkinnedMesh) */}
      {Object.keys(nodes).map((name) => {
        const node = nodes[name];
        // We render it if it's ANY kind of mesh
        if (node.isMesh || node.isSkinnedMesh) {
          return (
            <skinnedMesh
              key={name}
              geometry={node.geometry}
              material={node.material}
              skeleton={node.skeleton}
              morphTargetDictionary={node.morphTargetDictionary}
              morphTargetInfluences={node.morphTargetInfluences}
              frustumCulled={false} // Prevents flickering/disappearing
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