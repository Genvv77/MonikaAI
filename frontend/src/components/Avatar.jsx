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
  
  // Physics State
  const currentOpen = useRef(0);

  // --- 3. ANIMATION CLEANER (Posture Fix) ---
  useEffect(() => {
    if (animations) {
      animations.forEach((clip) => {
        clip.tracks = clip.tracks.filter((track) => {
            // Remove face morphs & Jaw rotation tracks
            return !track.name.toLowerCase().includes("morph") && 
                   !track.name.toLowerCase().includes("jaw");
        });
      });
    }
  }, [animations]);

  // --- 4. IDENTIFY PARTS & FORCE TEETH VISIBILITY ---
  const { headMesh, teethMesh, jawBone } = useMemo(() => {
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;
    
    // FORCE TEETH MATERIAL FIX
    if (teeth && teeth.material) {
        teeth.material.side = THREE.DoubleSide; // Render both sides
        teeth.material.transparent = false;     // Make sure they are solid
        teeth.frustumCulled = false;            // Never hide them
    }

    // Find Jaw Bone
    let jaw = null;
    scene.traverse((child) => {
        if (child.isBone && child.name.toLowerCase().includes("jaw")) {
            jaw = child;
        }
    });

    return { headMesh: head, teethMesh: teeth, jawBone: jaw };
  }, [nodes, scene]);

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

  // --- 8. THE "NUCLEAR" SYNC LOOP ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;
      if (average < 5) average = 0; 
      
      // EXTREME SENSITIVITY
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1) * 3.0; 
      if (value > 1.0) value = 1.0; // Cap at 1.0 (Full Open)
      targetOpen = value;
    } 

    currentOpen.current = THREE.MathUtils.damp(currentOpen.current, targetOpen, 15, delta);
    const val = currentOpen.current;

    const setMorph = (mesh, name, value) => {
        if (!mesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
        const idx = mesh.morphTargetDictionary[name];
        if (idx !== undefined) mesh.morphTargetInfluences[idx] = value;
    };

    // A. HEAD: FIRE EVERYTHING
    if (headMesh) {
        // 1. Jaw/Mouth Open
        setMorph(headMesh, "viseme_aa", val);
        setMorph(headMesh, "mouthOpen", val);
        setMorph(headMesh, "jawOpen", val); // Just in case
        
        // 2. Lift Lips (The "Curtain")
        // We force the skin to pull back aggressively
        setMorph(headMesh, "mouthUpperUp_C", val);
        setMorph(headMesh, "mouthUpperUp", val);
        setMorph(headMesh, "mouthLowerDown_C", val);
        setMorph(headMesh, "mouthLowerDown", val);
        
        // 3. Widen (Smile)
        setMorph(headMesh, "mouthSmile", val * 0.3);
    }

    // B. TEETH: SYNC & OFFSET
    if (teethMesh) {
        // Force Teeth Open
        setMorph(teethMesh, "mouthOpen", val);
        setMorph(teethMesh, "viseme_aa", val);

        // HACK: Move teeth slightly forward when talking to prevent clipping
        // teethMesh.position.z = val * 0.002; 
    }

    // C. JAW BONE: PHYSICAL ROTATION
    if (jawBone) {
        // Rotate down X axis. 0.3 radians is VERY wide.
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, val * 0.3, 0.2);
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
              frustumCulled={false} // CRITICAL
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