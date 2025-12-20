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
  
  // Smoothing Physics
  const currentOpen = useRef(0);

  // --- 3. SURGICAL CLEANER (Fixes Head Tilt) ---
  // We ONLY remove the facial morph tracks. 
  // We keep the Rotation/Position tracks so she stands straight!
  useEffect(() => {
    if (animations) {
      animations.forEach((clip) => {
        clip.tracks = clip.tracks.filter((track) => {
            const name = track.name.toLowerCase();
            // Remove morphs (Face) and Jaw bone rotation (so we can drive it)
            return !name.includes("morphtarget") && !name.includes("jaw");
        });
      });
    }
  }, [animations]);

  // --- 4. IDENTIFY PARTS ---
  const { headMesh, teethMesh, jawBone } = useMemo(() => {
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;
    
    // Find Jaw Bone (Backup)
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

  // --- 8. SYNC LOOP (The Fix) ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;

      if (average < 5) average = 0; // Noise Gate
      
      // Boost Volume 2.5x so lips move more!
      let value = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1) * 2.5;
      if (value > 1) value = 1;
      targetOpen = value;
    } 

    // Smooth movement (Damping)
    currentOpen.current = THREE.MathUtils.damp(currentOpen.current, targetOpen, 15, delta);
    const val = currentOpen.current;

    // Helper to apply morphs safely
    const setMorph = (mesh, name, intensity) => {
        if (mesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            const idx = mesh.morphTargetDictionary[name];
            if (idx !== undefined) mesh.morphTargetInfluences[idx] = intensity;
        }
    };

    // A. HEAD ANIMATION (Skin)
    if (headMesh) {
        // 1. Open Mouth (Speech)
        // We trigger both viseme_aa AND mouthOpen to ensure maximum movement
        setMorph(headMesh, "viseme_aa", val);
        setMorph(headMesh, "mouthOpen", val);
        
        // 2. Smile (Shape)
        setMorph(headMesh, "mouthSmile", val * 0.2);

        // 3. Lift Upper Lip (Shows Top Teeth)
        setMorph(headMesh, "mouthUpperUp_C", val * 0.5);
        setMorph(headMesh, "mouthUpperUp", val * 0.5);
    }

    // B. TEETH ANIMATION (The Lower Teeth Fix)
    if (teethMesh) {
        // YOUR LOGS SAID TEETH ONLY HAVE "mouthOpen". 
        // So we MUST use "mouthOpen" here.
        setMorph(teethMesh, "mouthOpen", val);
    }

    // C. JAW BONE (Backup Physics)
    if (jawBone) {
        // Rotate downwards on X axis (approx 12 degrees)
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, val * 0.2, 0.2);
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
              frustumCulled={false} // Prevents flickering
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