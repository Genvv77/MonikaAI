import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // --- 1. LOAD MODEL ---
  const { nodes, materials } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();

  // --- 2. LOAD ANIMATIONS (The method that worked for you) ---
  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions } = useAnimations(animations, group);

  // Audio Refs
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- 3. ANIMATION CONTROLLER ---
  useEffect(() => {
    // Basic Fallback
    let actionToPlay = actions["Standing_Idle"] || actions["Idle"] || Object.values(actions)[0];

    // Priority Logic
    if (loading) {
       // Optional: actionToPlay = actions["Thinking"];
    }
    
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

  // --- 4. AUDIO SETUP ---
  useEffect(() => {
    if (!analyserRef.current) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      // FFT 512 = Good balance of speed and accuracy
      analyser.fftSize = 512; 
      
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      source.connect(audioContext.destination);
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  // --- 5. AUDIO PLAYBACK ---
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

  // --- 6. LIP SYNC LOOP (CRASH PROOF VERSION) ---
  useFrame(() => {
    // 1. SAFETY: If head missing, stop.
    if (!nodes.Wolf3D_Head) return;

    // 2. FIND TARGETS: Safely check for standard names
    const dictionary = nodes.Wolf3D_Head.morphTargetDictionary;
    // Tries "mouthOpen", falls back to "viseme_aa" (RPM standard)
    const mouthIdx = dictionary["mouthOpen"] !== undefined ? dictionary["mouthOpen"] : dictionary["viseme_aa"];
    
    // If no mouth shape found, we can't animate, so return.
    if (mouthIdx === undefined) return;

    // 3. CALCULATE VOLUME
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      let count = 0;
      
      // Focus on voice range (10-80)
      for (let i = 10; i < 80; i++) {
          sum += dataArrayRef.current[i];
          count++;
      }
      let average = sum / count;

      // --- TUNING FOR SNAPPY TALKING ---
      // A. Noise Gate (Ignore breathing/background)
      if (average < 10) average = 0; 

      // B. Map to 0-1
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      
      // C. Square it (Makes loud sounds pop, quiet sounds subtle)
      targetOpen = value * value * 1.5;
      if (targetOpen > 1) targetOpen = 1;
    }

    // 4. APPLY TO HEAD
    // 0.8 Lerp = Fast/Snappy response
    const currentInfluence = nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx];
    const newValue = THREE.MathUtils.lerp(currentInfluence, targetOpen, 0.8);
    nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx] = newValue;
    
    // 5. APPLY TO TEETH (SAFE MODE)
    // We try to find the teeth. If they don't exist, we skip them. No crash.
    if (nodes.Wolf3D_Teeth) {
        const teethDict = nodes.Wolf3D_Teeth.morphTargetDictionary;
        const teethIdx = teethDict["mouthOpen"] !== undefined ? teethDict["mouthOpen"] : teethDict["viseme_aa"];
        // Only apply if the teeth actually HAVE the morph target
        if (teethIdx !== undefined) {
            nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx] = newValue;
        }
    }
  });

  // --- 7. RENDERER (Your Proven Working Logic) ---
  return (
    <group {...props} dispose={null} ref={group}>
      {/* Finds the root bone automatically */}
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
      {/* Renders every mesh in the file safely */}
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
              frustumCulled={false} // Forces visibility
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