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

  // --- 3. THE CLEANER (CRITICAL FIX) ---
  // This removes any face movement from the downloaded animations.
  // This stops the animation from forcing the mouth open.
  useEffect(() => {
    if (animations) {
      animations.forEach((clip) => {
        clip.tracks = clip.tracks.filter((track) => {
            // Keep body parts, DELETE anything related to the face/morphs
            return !track.name.includes("morphTargetInfluences") && 
                   !track.name.includes("Jaw") && 
                   !track.name.includes("Tongue");
        });
      });
    }
  }, [animations]);

  // --- 4. DYNAMIC TEETH FINDER ---
  // Finds any mesh that looks like teeth (Wolf3D_Teeth, Teeth, etc.)
  const teethNode = useMemo(() => {
    return Object.values(nodes).find((node) => 
        (node.name.includes("Teeth") || node.name.includes("teeth")) && 
        node.morphTargetDictionary && 
        node.morphTargetInfluences
    );
  }, [nodes]);

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

  // --- 7. LIP SYNC FRAME LOOP ---
  useFrame(() => {
    if (!nodes.Wolf3D_Head) return;

    // A. SETUP TARGETS
    // We prioritize 'viseme_aa' because 'mouthOpen' is often too huge/scary
    const headDict = nodes.Wolf3D_Head.morphTargetDictionary;
    let headIdx = headDict["viseme_aa"];
    if (headIdx === undefined) headIdx = headDict["mouthOpen"];
    
    if (headIdx === undefined) return; // No mouth targets found

    // B. CALCULATE VOLUME
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      // Noise Gate (Prevents hanging open)
      if (average < 20) average = 0; 

      // Math for snappiness
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      targetOpen = value * value * 2.0; // Boosted for visibility
      if (targetOpen > 1) targetOpen = 1;
    } 
    else {
        // FORCE CLOSED if no audio (Fixes "Wide Open" bug)
        targetOpen = 0;
    }

    // C. APPLY TO HEAD
    const currentHead = nodes.Wolf3D_Head.morphTargetInfluences[headIdx];
    // 0.8 is fast/snappy. 
    const newHeadValue = THREE.MathUtils.lerp(currentHead, targetOpen, 0.8);
    nodes.Wolf3D_Head.morphTargetInfluences[headIdx] = newHeadValue;

    // D. APPLY TO TEETH (Sync)
    if (teethNode) {
        let teethIdx = teethNode.morphTargetDictionary["viseme_aa"];
        if (teethIdx === undefined) teethIdx = teethNode.morphTargetDictionary["mouthOpen"];
        
        if (teethIdx !== undefined) {
             teethNode.morphTargetInfluences[teethIdx] = newHeadValue;
        }
    }
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