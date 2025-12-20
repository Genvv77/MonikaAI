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
  
  // Smoothing Refs (Physics for lips)
  const currentOpen = useRef(0);
  const currentPucker = useRef(0);

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
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;
    let targetPucker = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      // Noise Gate
      if (average < 5) average = 0; 

      // Input Gain (Boost volume signal)
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1) * 2.5;
      if (value > 1) value = 1;

      // A. Vowel Mixing (Ah vs Oh)
      // Low/Mid volume = Pucker (Oh/Uuu)
      // High volume = Open (Ahhh)
      targetOpen = value;
      targetPucker = value * 0.4 * (1 - value); // Peak pucker at mid-volume
    } 

    // --- PHYSICS DAMPING (Smoothness) ---
    // Instead of snapping, we move towards target using damp().
    // 0.15 is the smoothing time. Lower = snappier, Higher = floatier.
    const smoothTime = 0.12; 
    currentOpen.current = THREE.MathUtils.damp(currentOpen.current, targetOpen, 20, delta);
    currentPucker.current = THREE.MathUtils.damp(currentPucker.current, targetPucker, 20, delta);

    const openVal = currentOpen.current;
    const puckerVal = currentPucker.current;

    // --- APPLY TO MESH ---
    if (nodes.Wolf3D_Head) {
        const dict = nodes.Wolf3D_Head.morphTargetDictionary;
        const influ = nodes.Wolf3D_Head.morphTargetInfluences;

        // 1. PRIMARY: Jaw Open (viseme_aa)
        const aaIdx = dict["viseme_aa"] || dict["mouthOpen"];
        if (aaIdx !== undefined) influ[aaIdx] = openVal;

        // 2. SECONDARY: Pucker/Shape (viseme_U or mouthPucker)
        const uIdx = dict["viseme_U"] || dict["mouthPucker"];
        if (uIdx !== undefined) influ[uIdx] = puckerVal;

        // 3. TERTIARY: Muscle Engagement (The Anti-Robot Fix)
        // When we talk loudly, our cheeks raise and mouth corners tighten.
        
        // Cheek Squint (Subtle)
        const cheekIdx = dict["cheekSquintLeft"] || dict["cheekPuff"];
        if (cheekIdx !== undefined) influ[cheekIdx] = openVal * 0.3;

        // Upper Lip Raise (Shows teeth naturally)
        const upperLipIdx = dict["mouthUpperUpLeft"]; 
        if (upperLipIdx !== undefined) influ[upperLipIdx] = openVal * 0.4;
    }

    // --- APPLY TO JAW BONE ---
    if (jawBone) {
        // Rotate jaw downwards. 0.15 rads max.
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, openVal * 0.15, 0.3);
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