import { useEffect, useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // --- 1. LOAD MODEL ---
  const { nodes, materials, scene } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();

  // --- 2. LOAD ANIMATIONS ---
  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions } = useAnimations(animations, group);

  // Audio Refs
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- 3. DEBUG & TARGET FINDER ---
  // We log what we find to the console so we know if teeth are missing
  useEffect(() => {
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;
    
    console.log("🔍 AVATAR DEBUG:");
    if (head && head.morphTargetDictionary) {
        console.log("HEAD Targets:", Object.keys(head.morphTargetDictionary));
    }
    if (teeth && teeth.morphTargetDictionary) {
        console.log("TEETH Targets:", Object.keys(teeth.morphTargetDictionary));
    } else {
        console.warn("⚠️ TEETH MESH NOT FOUND OR HAS NO MORPHS!");
    }
  }, [nodes]);

  // --- 4. ANIMATION CONTROLLER ---
  useEffect(() => {
    let actionToPlay = actions["Standing_Idle"] || actions["Idle"] || Object.values(actions)[0];
    
    if (loading) { /* Optional: Thinking */ }
    
    if (message && message.animation && actions[message.animation]) {
      actionToPlay = actions[message.animation];
    } else if (message && message.audio) {
       actionToPlay = actions["Talking_1"] || actions["Talking"];
    }

    if (actionToPlay) {
      actionToPlay.reset().fadeIn(0.5).play();
      return () => { actionToPlay.fadeOut(0.5); };
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

    // A. IDENTIFY TARGETS (PRIORITY: Viseme > Jaw > Mouth)
    const headDict = nodes.Wolf3D_Head.morphTargetDictionary;
    
    // We strictly prefer 'viseme_aa' because 'mouthOpen' is often too wide
    let headIdx = headDict["viseme_aa"];
    if (headIdx === undefined) headIdx = headDict["jawOpen"];
    if (headIdx === undefined) headIdx = headDict["mouthOpen"];

    if (headIdx === undefined) return;

    // B. CALCULATE VOLUME
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      // Focus on voice range
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      // --- TUNING ---
      // 1. Noise Gate: Increased to 30 to fix "Hanging Mouth"
      // The mouth will SNAP shut if the sound isn't loud enough.
      if (average < 30) average = 0; 

      // 2. Map & Square
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      targetOpen = value * value * 1.5; 
      
      if (targetOpen > 1) targetOpen = 1;
    }

    // C. APPLY TO HEAD (Snappy speed 0.8)
    const currentHead = nodes.Wolf3D_Head.morphTargetInfluences[headIdx];
    const newHeadValue = THREE.MathUtils.lerp(currentHead, targetOpen, 0.8);
    nodes.Wolf3D_Head.morphTargetInfluences[headIdx] = newHeadValue;

    // D. FORCE TEETH SYNC
    // We search for ANY mesh with "Teeth" in the name and force it to match
    Object.keys(nodes).forEach((key) => {
        if (key.includes("Teeth")) {
            const teethNode = nodes[key];
            if (teethNode.morphTargetDictionary && teethNode.morphTargetInfluences) {
                // Try to find matching target on teeth
                let teethIdx = teethNode.morphTargetDictionary["viseme_aa"];
                if (teethIdx === undefined) teethIdx = teethNode.morphTargetDictionary["jawOpen"];
                if (teethIdx === undefined) teethIdx = teethNode.morphTargetDictionary["mouthOpen"];

                if (teethIdx !== undefined) {
                    teethNode.morphTargetInfluences[teethIdx] = newHeadValue;
                }
            }
        }
    });
  });

  // --- 8. ROBUST RENDERER ---
  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
      {/* Renders EVERYTHING safely */}
      {Object.keys(nodes).map((name) => {
        const node = nodes[name];
        if (node.isSkinnedMesh || node.isMesh) {
          return (
            <skinnedMesh
              key={name}
              geometry={node.geometry}
              material={node.material}
              skeleton={node.skeleton}
              morphTargetDictionary={node.morphTargetDictionary}
              morphTargetInfluences={node.morphTargetInfluences}
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