import { useEffect, useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useFBX, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // --- 1. LOAD MODEL ---
  const { nodes, materials } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();

  // --- 2. LOAD ANIMATIONS ---
  const { animations: idleAnim } = useFBX("/animations/Standing Idle.fbx");
  const { animations: angryAnim } = useFBX("/animations/Angry.fbx");
  const { animations: cryingAnim } = useFBX("/animations/Crying.fbx");
  const { animations: laughingAnim } = useFBX("/animations/Laughing.fbx");
  const { animations: rumbaAnim } = useFBX("/animations/Rumba Dancing.fbx");
  const { animations: terrifiedAnim } = useFBX("/animations/Terrified.fbx");
  const { animations: talking0Anim } = useFBX("/animations/Talking_0.fbx");
  const { animations: talking1Anim } = useFBX("/animations/Talking_1.fbx");
  const { animations: talking2Anim } = useFBX("/animations/Talking_2.fbx");

  idleAnim[0].name = "Standing_Idle";
  angryAnim[0].name = "Angry";
  cryingAnim[0].name = "Crying";
  laughingAnim[0].name = "Laughing";
  rumbaAnim[0].name = "Rumba_Dancing";
  terrifiedAnim[0].name = "Terrified";
  talking0Anim[0].name = "Talking_0";
  talking1Anim[0].name = "Talking_1";
  talking2Anim[0].name = "Talking_2";

  const allAnimations = useMemo(() => [
    idleAnim[0], angryAnim[0], cryingAnim[0], laughingAnim[0], rumbaAnim[0], 
    terrifiedAnim[0], talking0Anim[0], talking1Anim[0], talking2Anim[0]
  ], [idleAnim, angryAnim, cryingAnim, laughingAnim, rumbaAnim, terrifiedAnim, talking0Anim, talking1Anim, talking2Anim]);

  // --- 3. ANIMATION SETUP ---
  const group = useRef();
  const { actions } = useAnimations(allAnimations, group);
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  useEffect(() => {
    let actionToPlay = actions["Standing_Idle"] || actions["Idle"] || Object.values(actions)[0];
    if (loading) { /* Optional: Thinking animation */ }
    
    if (message && message.animation && actions[message.animation]) {
      actionToPlay = actions[message.animation];
    } else if (message && message.audio) {
       actionToPlay = actions["Talking_1"];
    }

    if (actionToPlay) {
      actionToPlay.reset().fadeIn(0.5).play();
      return () => { actionToPlay.fadeOut(0.5); };
    }
  }, [message, loading, actions]);

  // --- 4. AUDIO SETUP ---
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

  // --- 5. ADVANCED LIP SYNC LOOP ---
  useFrame(() => {
    if (!nodes.Wolf3D_Head) return;

    // A. FIND TARGETS: We look for "viseme_aa" (Jaw Open) and "viseme_O" (Lip Pucker)
    const headDict = nodes.Wolf3D_Head.morphTargetDictionary;
    const teethDict = nodes.Wolf3D_Teeth ? nodes.Wolf3D_Teeth.morphTargetDictionary : {};

    // Prioritize "viseme_aa" because it opens the mouth properly for speech
    const openIdx = headDict["viseme_aa"] !== undefined ? headDict["viseme_aa"] : headDict["jawOpen"];
    const puckerIdx = headDict["viseme_O"] || headDict["mouthPucker"];
    
    // Teeth Indices
    const teethOpenIdx = teethDict["viseme_aa"] !== undefined ? teethDict["viseme_aa"] : teethDict["jawOpen"];

    if (openIdx === undefined) return;

    const audio = audioRef.current;
    let targetOpen = 0;
    let targetPucker = 0;

    // B. CALCULATE AUDIO ENERGY
    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      let count = 0;
      // Focus on vocal range
      for (let i = 10; i < 60; i++) {
          sum += dataArrayRef.current[i];
          count++;
      }
      let average = sum / count;

      // Noise Gate
      if (average < 10) average = 0; 

      // Calculate Open Value (Snappy)
      let norm = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      targetOpen = norm * norm * 1.2; // Square it for snappiness
      if (targetOpen > 1) targetOpen = 1;

      // Calculate Pucker Value (Adds randomness/articulation)
      // When talking loud, sometimes we "O" our lips
      targetPucker = (Math.sin(Date.now() / 100) * 0.3 + 0.3) * targetOpen;
    }

    // C. APPLY SMOOTHLY
    // 1. Jaw/Mouth Open
    const currentOpen = nodes.Wolf3D_Head.morphTargetInfluences[openIdx];
    const newOpen = THREE.MathUtils.lerp(currentOpen, targetOpen, 0.7); // 0.7 = fast response
    
    nodes.Wolf3D_Head.morphTargetInfluences[openIdx] = newOpen;
    
    // CRITICAL: Apply to Teeth so they move WITH the jaw
    if (nodes.Wolf3D_Teeth && teethOpenIdx !== undefined) {
        nodes.Wolf3D_Teeth.morphTargetInfluences[teethOpenIdx] = newOpen;
    }

    // 2. Lip Pucker (Variation)
    if (puckerIdx !== undefined) {
        const currentPucker = nodes.Wolf3D_Head.morphTargetInfluences[puckerIdx];
        const newPucker = THREE.MathUtils.lerp(currentPucker, targetPucker, 0.5);
        nodes.Wolf3D_Head.morphTargetInfluences[puckerIdx] = newPucker;
    }
  });

  // --- 6. RENDERER ---
  return (
    <group ref={group} {...props} dispose={null}>
      {/* Skeleton */}
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
      {/* Render all Meshes */}
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