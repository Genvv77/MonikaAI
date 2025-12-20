import { useEffect, useRef, useMemo, useState } from "react";
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

  // --- 3. CLEAN ANIMATIONS ---
  useEffect(() => {
    if (animations) {
      animations.forEach((clip) => {
        clip.tracks = clip.tracks.filter((track) => {
            return !track.name.includes("morphTargetInfluences") && 
                   !track.name.includes("Jaw") && 
                   !track.name.includes("Tongue");
        });
      });
    }
  }, [animations]);

  // --- 4. FIND JAW BONE ---
  const jawBone = useMemo(() => {
    let jaw = null;
    scene.traverse((child) => {
      if (child.isBone && (child.name.includes("Jaw") || child.name.includes("jaw"))) {
        jaw = child;
      }
    });
    return jaw;
  }, [scene]);

  // --- 5. ANIMATION CONTROLLER ---
  useEffect(() => {
    let actionToPlay = actions["Standing_Idle"] || actions["Idle"] || Object.values(actions)[0];
    
    if (loading) { /* Optional */ }
    
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

  // --- 6. AUDIO SETUP ---
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

  // --- 7. AUDIO PLAYBACK ---
  useEffect(() => {
    if (!message) return;
    if (!message.audio) { setTimeout(onMessagePlayed, 3000); return; }

    const audio = audioRef.current;
    audio.src = message.audio.startsWith("data:audio") ? message.audio : "data:audio/mp3;base64," + message.audio;
    audio.volume = 1.0;
    audio.currentTime = 0;

    if (analyserRef.current && analyserRef.current.context.state === 'suspended') {
        analyserRef.current.context.resume();
    }
    audio.play().catch(e => { onMessagePlayed(); });
    audio.onended = onMessagePlayed;
  }, [message]);

  // --- 8. ORGANIC LIP SYNC LOOP ---
  useFrame((state) => {
    const audio = audioRef.current;
    let targetOpen = 0;
    let targetPucker = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      // 1. Boost Sensitivity (multiply by 2.0 so quieter sounds register)
      if (average < 5) average = 0; // Very low noise gate
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1) * 2.0;
      if (value > 1) value = 1;

      // 2. Add Jitter (Randomness) so it doesn't look robotic
      // We use sine waves based on time to oscillate the value slightly
      const jitter = Math.sin(state.clock.elapsedTime * 10) * 0.1;
      targetOpen = value + jitter;
      if (targetOpen < 0) targetOpen = 0;

      // 3. Calculate "Pucker" (O Shape)
      // When talking, we sometimes pucker lips. We do this when volume is MEDIUM.
      // If volume is LOUD (Ahhh), pucker goes down.
      targetPucker = value * 0.5 * (1 - value); 
    } 
    else {
        targetOpen = 0;
        targetPucker = 0;
    }

    // A. JAW BONE (Teeth Separation)
    // Rotate 0.1 radians max. Enough to see teeth, but not unhinge jaw.
    if (jawBone) {
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, targetOpen * 0.15, 0.2);
    }

    // B. LIP ANIMATION (Complex Mixing)
    if (nodes.Wolf3D_Head) {
        const dictionary = nodes.Wolf3D_Head.morphTargetDictionary;
        
        // 1. MAIN OPENING (Viseme AA)
        const openIdx = dictionary["viseme_aa"] || dictionary["mouthOpen"];
        if (openIdx !== undefined) {
             const current = nodes.Wolf3D_Head.morphTargetInfluences[openIdx];
             // 0.5 lerp = smoother, less jittery
             nodes.Wolf3D_Head.morphTargetInfluences[openIdx] = THREE.MathUtils.lerp(current, targetOpen, 0.5);
        }

        // 2. LIP SHAPING (Viseme U / O / Pucker)
        // This makes the mouth round instead of just wide
        const puckerIdx = dictionary["viseme_U"] || dictionary["viseme_O"] || dictionary["mouthPucker"];
        if (puckerIdx !== undefined) {
             const current = nodes.Wolf3D_Head.morphTargetInfluences[puckerIdx];
             nodes.Wolf3D_Head.morphTargetInfluences[puckerIdx] = THREE.MathUtils.lerp(current, targetPucker, 0.5);
        }

        // 3. TEETH FIX (Keep lips above teeth)
        // We slightly raise the upper lip if volume is high
        const upperLipIdx = dictionary["mouthUpperUpLeft"]; // Usually works on whole lip for RPM
        if (upperLipIdx !== undefined) {
             nodes.Wolf3D_Head.morphTargetInfluences[upperLipIdx] = THREE.MathUtils.lerp(
                 nodes.Wolf3D_Head.morphTargetInfluences[upperLipIdx], 
                 targetOpen * 0.3, 
                 0.5
             );
        }
    }
  });

  // --- 9. RENDERER ---
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