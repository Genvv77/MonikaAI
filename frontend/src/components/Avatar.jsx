import { useEffect, useRef, useMemo } from "react";
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
  
  // Smoothing
  const currentOpen = useRef(0);

  // --- 3. GENTLE CLEANER (Fixes Head Tilt) ---
  // We only remove FACIAL MORPHS. We leave the Head/Neck bones alone
  // so she stands straight and breathes.
  useEffect(() => {
    if (animations) {
      animations.forEach((clip) => {
        clip.tracks = clip.tracks.filter((track) => {
            // Only block morphTargetInfluences (Face shapes)
            // Allow "Head" and "Neck" rotations!
            return !track.name.includes("morphTargetInfluences") && 
                   !track.name.includes("Jaw") && 
                   !track.name.includes("Tongue");
        });
      });
    }
  }, [animations]);

  // --- 4. IDENTIFY PARTS & DEBUG TEETH ---
  const { headMesh, teethMesh } = useMemo(() => {
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;

    // DEBUG: Print available shapes on the teeth
    if (teeth && teeth.morphTargetDictionary) {
        console.log("🦷 TEETH SHAPES:", Object.keys(teeth.morphTargetDictionary));
    }

    return { headMesh: head, teethMesh: teeth };
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

  // --- 7. PLAY AUDIO ---
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

  // --- 8. SYNC LOOP (Posture & Teeth Fix) ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      if (average < 5) average = 0; 
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1) * 2.5;
      if (value > 1) value = 1;
      targetOpen = value;
    } 

    currentOpen.current = THREE.MathUtils.damp(currentOpen.current, targetOpen, 15, delta);
    const val = currentOpen.current;

    const applyMorph = (mesh, targetNames, value) => {
        if (!mesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
        targetNames.forEach((name) => {
            const idx = mesh.morphTargetDictionary[name];
            if (idx !== undefined) mesh.morphTargetInfluences[idx] = value;
        });
    };

    // A. HEAD ANIMATION
    if (headMesh) {
        applyMorph(headMesh, ["viseme_aa", "mouthOpen", "jawOpen"], val);
        applyMorph(headMesh, ["mouthSmile", "viseme_E"], val * 0.3);
        applyMorph(headMesh, ["mouthUpperUp_C", "mouthUpperUp"], val * 0.5); // Shows Upper Teeth
    }

    // B. TEETH ANIMATION (Fixing the "Empty Bottom Jaw")
    if (teethMesh) {
        // We apply the "Open" morph to the teeth. 
        // This *should* drop the bottom teeth.
        applyMorph(teethMesh, ["viseme_aa", "mouthOpen", "jawOpen"], val);
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