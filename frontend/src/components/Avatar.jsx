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

  // --- 8. BALANCED LIP SYNC (High Skin / Low Bone) ---
  useFrame(() => {
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      // Lower Threshold (Sensitivity Boost)
      if (average < 10) average = 0; 

      // Math
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      targetOpen = value * value * 1.5; 
      if (targetOpen > 1) targetOpen = 1;
    } 
    else {
        targetOpen = 0;
    }

    // A. JAW BONE (Micro-Movement only)
    // We only rotate 0.05 radians. Just enough to separate the teeth.
    if (jawBone) {
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, targetOpen * 0.05, 0.9);
    }

    // B. LIP ANIMATION (Primary Movement)
    if (nodes.Wolf3D_Head) {
        const dictionary = nodes.Wolf3D_Head.morphTargetDictionary;
        
        // 1. Vertical Open (The main talking movement)
        const openIdx = dictionary["viseme_aa"] || dictionary["mouthOpen"];
        if (openIdx !== undefined) {
             const current = nodes.Wolf3D_Head.morphTargetInfluences[openIdx];
             nodes.Wolf3D_Head.morphTargetInfluences[openIdx] = THREE.MathUtils.lerp(current, targetOpen, 0.9);
        }

        // 2. Horizontal Shaping (Makes it look like talking, not biting)
        // We mix in a bit of "Smile" or "Viseme E" to widen the lips slightly when loud
        const shapeIdx = dictionary["mouthSmile"] || dictionary["viseme_E"];
        if (shapeIdx !== undefined) {
             const current = nodes.Wolf3D_Head.morphTargetInfluences[shapeIdx];
             // 0.3 influence is subtle but effective
             nodes.Wolf3D_Head.morphTargetInfluences[shapeIdx] = THREE.MathUtils.lerp(current, targetOpen * 0.3, 0.9);
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