import { useEffect, useRef, useState } from "react";
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

  // --- 3. ANIMATION CONTROLLER ---
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

  // --- 4. AUDIO SETUP ---
  useEffect(() => {
    if (!analyserRef.current) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      // Lower FFT size makes it react faster to quick syllables
      analyser.fftSize = 512; 
      
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      source.connect(audioContext.destination);
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  // --- 5. PLAYBACK HANDLING ---
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

  // --- 6. REALISTIC LIP SYNC LOOP ---
  useFrame(() => {
    if (!nodes.Wolf3D_Head) return;

    const dictionary = nodes.Wolf3D_Head.morphTargetDictionary;
    const mouthIdx = dictionary["mouthOpen"] !== undefined ? dictionary["mouthOpen"] : dictionary["viseme_aa"];
    
    if (mouthIdx === undefined) return;

    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      // Focus on the "speech" frequency range (mid-highs)
      // Indexes 10 to 80 capture human voice fundamental frequencies well
      let count = 0;
      for (let i = 10; i < 80; i++) {
          sum += dataArrayRef.current[i];
          count++;
      }
      let average = sum / count;

      // --- TUNING FOR REALISM ---
      
      // 1. Noise Gate: If volume is low, force it to 0 so mouth shuts completely
      if (average < 15) average = 0; 

      // 2. Normalize (0 to 1)
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      
      // 3. Exaggerate Peaks (Squaring makes loud sounds bigger, quiet sounds smaller)
      targetOpen = value * value * 1.5; // 1.5 multiplier boosts the "pop"
      
      // Clamp to max 1.0
      if (targetOpen > 1.0) targetOpen = 1.0;
    }

    // --- APPLY WITH HIGH SPEED ---
    const currentInfluence = nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx];
    
    // Lerp factor 0.8 is VERY fast (snappy). 0.1 is slow (ghostly).
    const newValue = THREE.MathUtils.lerp(currentInfluence, targetOpen, 0.8);

    nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx] = newValue;
    
    if (nodes.Wolf3D_Teeth) {
        const teethDict = nodes.Wolf3D_Teeth.morphTargetDictionary;
        const teethIdx = teethDict["mouthOpen"] !== undefined ? teethDict["mouthOpen"] : teethDict["viseme_aa"];
        if (teethIdx !== undefined) {
            nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx] = newValue;
        }
    }
  });

  // --- 7. RENDERER ---
  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
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
              frustumCulled={false}
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