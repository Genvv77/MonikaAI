import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  const { nodes, scene } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();
  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions } = useAnimations(animations, group);
  
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const currentViseme = useRef({ open: 0 });

  // --- 1. AGGRESSIVE ANIMATION CLEANER ---
  useEffect(() => {
    if (animations) {
        animations.forEach((clip) => {
            // Remove ALL tracks that affect the Face (morphs) or jaw
            clip.tracks = clip.tracks.filter((track) => {
                const name = track.name.toLowerCase();
                return !name.includes("morph") && !name.includes("jaw");
            });
        });
    }
    
    let actionToPlay = actions["Standing_Idle"] || actions["Idle"] || Object.values(actions)[0];
    if (message && message.animation && actions[message.animation]) {
      actionToPlay = actions[message.animation];
    } else if (message && message.audio) {
       actionToPlay = actions["Talking_1"] || actions["Talking"];
    }
    if (actionToPlay) {
      actionToPlay.reset().fadeIn(0.5).play();
      return () => { actionToPlay.fadeOut(0.5); };
    }
  }, [message, loading, actions, animations]);

  // --- 2. AUDIO SETUP ---
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
    if (analyserRef.current?.context.state === 'suspended') analyserRef.current.context.resume();
    audio.play().catch(e => onMessagePlayed());
    audio.onended = onMessagePlayed;
  }, [message]);

  // --- 3. LIP SYNC LOOP ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let mid = 0;
      for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
      mid /= 40;
      targetOpen = (mid / 255) * 6.0; // Very strong sensitivity
      if (targetOpen > 1) targetOpen = 1;
    } 

    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 15, delta);
    const val = currentViseme.current.open;

    // Helper: Set morph targets
    const setMorph = (obj, names, v) => {
        if (!obj?.morphTargetDictionary || !obj?.morphTargetInfluences) return;
        const targets = Array.isArray(names) ? names : [names];
        targets.forEach(name => {
            const idx = obj.morphTargetDictionary[name];
            if (idx !== undefined) obj.morphTargetInfluences[idx] = v;
        });
    };

    // A. FACE ANIMATION
    if (nodes.Wolf3D_Head) {
        const head = nodes.Wolf3D_Head;

        // 1. Primary mouth opening - BALANCED
        setMorph(head, ["viseme_aa", "mouthOpen", "jawOpen"], val * 1.0);
        
        // 2. Upper lip lift - VERY STRONG (show top teeth)
        setMorph(head, ["mouthUpperUpLeft", "mouthUpperUpRight", "mouthUpperUp_C"], val * 2.5);
        
        // 3. Lower lip drop - VERY STRONG (show bottom teeth)
        setMorph(head, ["mouthLowerDownLeft", "mouthLowerDownRight", "mouthLowerDown_C"], val * 2.5);

        // 4. Mouth width - REDUCED
        setMorph(head, ["mouthSmile", "mouthStretchLeft", "mouthStretchRight"], val * 0.3);
        
        // 5. Additional shaping
        setMorph(head, ["mouthFunnel", "viseme_O"], val * 0.2);
    }
    
    // B. ORIGINAL TEETH ANIMATION
    if (nodes.Wolf3D_Teeth) {
        const teeth = nodes.Wolf3D_Teeth;
        // Apply same morphs to teeth if they exist
        setMorph(teeth, ["mouthOpen", "viseme_aa", "jawOpen"], val * 0.5);
    }
  });

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
