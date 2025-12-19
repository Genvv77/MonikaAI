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

  // --- 3. UNIVERSAL MORPH FINDER (The Fix) ---
  // Instead of guessing names, we find ALL meshes capable of opening their mouth.
  const morphTargets = useMemo(() => {
    const targets = [];
    scene.traverse((child) => {
      if (child.isSkinnedMesh && child.morphTargetDictionary) {
        // Check if this mesh has a "mouthOpen" or "viseme_aa" target
        const index = child.morphTargetDictionary["mouthOpen"] ?? child.morphTargetDictionary["viseme_aa"];
        if (index !== undefined) {
          targets.push({
            mesh: child,
            index: index
          });
        }
      }
    });
    return targets;
  }, [scene]);

  // --- 4. ANIMATION CONTROLLER ---
  useEffect(() => {
    let actionToPlay = actions["Standing_Idle"] || actions["Idle"] || Object.values(actions)[0];
    
    if (loading) { /* Optional: Thinking animation */ }
    
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
    // If no meshes found (bad model), exit
    if (morphTargets.length === 0) return;

    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      // Calculate Average Volume (Speech Range)
      for (let i = 10; i < 60; i++) {
          sum += dataArrayRef.current[i];
      }
      let average = sum / 50;

      // --- TUNING FOR REALISM ---
      // 1. High Noise Gate: Forces mouth closed for quiet sounds
      if (average < 20) average = 0; 

      // 2. Map Linear
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      
      // 3. Square it for "Pop" (Snappy syllables)
      targetOpen = value * value * 1.5;
      
      if (targetOpen > 1) targetOpen = 1;
    }

    // --- APPLY TO ALL MESHES (Head, Teeth, Gums) ---
    // We loop through everything we found in step 3
    morphTargets.forEach((target) => {
        const current = target.mesh.morphTargetInfluences[target.index];
        // 0.8 is fast speed for snappy talking
        target.mesh.morphTargetInfluences[target.index] = THREE.MathUtils.lerp(current, targetOpen, 0.8);
    });
  });

  // --- 8. RENDERER ---
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