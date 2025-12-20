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
  
  // Smoothing Refs
  const currentOpen = useRef(0);

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

  // --- 8. FULL ARTICULATION LOOP ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      if (average < 5) average = 0; // Noise Gate

      // Boost volume signal to make lips move more
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1) * 2.0;
      if (value > 1) value = 1;
      targetOpen = value;
    } 

    // Smooth the movement (Damping)
    // 0.1 = Very Snappy, 0.2 = Smooth. 0.12 is a good middle ground.
    currentOpen.current = THREE.MathUtils.damp(currentOpen.current, targetOpen, 25, delta);
    const val = currentOpen.current;

    // --- APPLY TO MESH (LIPS) ---
    if (nodes.Wolf3D_Head) {
        const dict = nodes.Wolf3D_Head.morphTargetDictionary;
        const influ = nodes.Wolf3D_Head.morphTargetInfluences;

        // 1. MAIN OPENER (Viseme AA / Jaw Open)
        const openIdx = dict["viseme_aa"] || dict["mouthOpen"] || dict["jawOpen"];
        if (openIdx !== undefined) influ[openIdx] = val;

        // 2. UPPER LIP RAISER (Shows Top Teeth) - CRITICAL
        // We look for standard ARKit names
        const upperCenter = dict["mouthUpperUp_C"] || dict["mouthUpperUp"];
        const upperLeft = dict["mouthUpperUpLeft"] || dict["mouthUpperUp_L"];
        const upperRight = dict["mouthUpperUpRight"] || dict["mouthUpperUp_R"];
        
        // Lift upper lip by 50% of the total volume volume
        if (upperCenter !== undefined) influ[upperCenter] = val * 0.5;
        if (upperLeft !== undefined) influ[upperLeft] = val * 0.5;
        if (upperRight !== undefined) influ[upperRight] = val * 0.5;

        // 3. LOWER LIP DEPRESSOR (Shows Bottom Teeth)
        const lowerCenter = dict["mouthLowerDown_C"] || dict["mouthLowerDown"];
        const lowerLeft = dict["mouthLowerDownLeft"] || dict["mouthLowerDown_L"];
        const lowerRight = dict["mouthLowerDownRight"] || dict["mouthLowerDown_R"];

        if (lowerCenter !== undefined) influ[lowerCenter] = val * 0.5;
        if (lowerLeft !== undefined) influ[lowerLeft] = val * 0.5;
        if (lowerRight !== undefined) influ[lowerRight] = val * 0.5;

        // 4. SMILE MIX (Widens lips so they don't look circular)
        const smileIdx = dict["mouthSmile"] || dict["mouthSmileLeft"];
        if (smileIdx !== undefined) influ[smileIdx] = val * 0.2;
    }

    // --- APPLY TO BONE (TEETH) ---
    if (jawBone) {
        // Rotate jaw downwards physically to separate teeth
        // 0.2 radians is a solid open mouth.
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, val * 0.2, 0.3);
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