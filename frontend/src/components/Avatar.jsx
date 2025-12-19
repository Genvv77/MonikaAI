import { useEffect, useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // --- 1. LOAD MODEL ---
  const { nodes, scene } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();

  // --- 2. LOAD ANIMATIONS ---
  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions } = useAnimations(animations, group);

  // Audio Refs
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- 3. FIND THE JAW BONE ---
  // We search for the bone that controls the jaw.
  const jawBone = useMemo(() => {
    let jaw = null;
    scene.traverse((child) => {
      if (child.isBone && (child.name.includes("Jaw") || child.name.includes("jaw"))) {
        jaw = child;
      }
    });
    return jaw;
  }, [scene]);

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

  // --- 7. HYBRID LIP SYNC (Bone + Morph) ---
  useFrame(() => {
    const audio = audioRef.current;
    let targetOpen = 0;

    // A. Calculate Volume
    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      // Noise Gate
      if (average < 20) average = 0; 
      
      // Map & Square
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      targetOpen = value * value * 1.5; 
      if (targetOpen > 1) targetOpen = 1;
    }

    // B. ROTATE JAW BONE (Fixes Teeth Issue)
    // If we found a jaw bone, we rotate it downwards based on volume.
    if (jawBone) {
        // Standard rotation for Ready Player Me / Mixamo jaws is usually X or Z axis.
        // We gently rotate it open. (0.2 radians is usually enough for an open mouth)
        const targetRotation = targetOpen * 0.2; 
        
        // Lerp rotation for smoothness
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, targetRotation, 0.5);
    }

    // C. ALSO DO MORPH TARGETS (For Lips)
    if (nodes.Wolf3D_Head) {
        const dictionary = nodes.Wolf3D_Head.morphTargetDictionary;
        // Prioritize "viseme_aa" (Lip shape) over "mouthOpen" (Jaw shape)
        const mouthIdx = dictionary["viseme_aa"] || dictionary["mouthOpen"];
        
        if (mouthIdx !== undefined) {
             const current = nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx];
             nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx] = THREE.MathUtils.lerp(current, targetOpen, 0.5);
        }
    }
  });

  // --- 8. ROBUST RENDERER ---
  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
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