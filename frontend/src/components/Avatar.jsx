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
  
  // Audio & Physics Refs
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const currentViseme = useRef({ open: 0, smile: 0 }); // Smooths multiple values

  // --- 1. CLEAN ANIMATIONS ---
  // Fixes head tilt by only removing face morphs, keeping neck/spine data.
  useEffect(() => {
    if (animations) {
      animations.forEach((clip) => {
        clip.tracks = clip.tracks.filter((track) => {
            const name = track.name.toLowerCase();
            return !name.includes("morph") && !name.includes("jaw");
        });
      });
    }
  }, [animations]);

  // --- 2. SETUP PARTS & FIX TEETH PLACEMENT ---
  const { headMesh, teethMesh, jawBone } = useMemo(() => {
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;
    let jaw = null;

    // Find Jaw Bone
    scene.traverse((child) => {
        if (child.isBone && child.name.toLowerCase().includes("jaw")) jaw = child;
    });

    // FIX TEETH GEOMETRY
    if (teeth) {
        if (teeth.material) {
            teeth.material = teeth.material.clone();
            teeth.material.transparent = false;
            teeth.material.side = THREE.FrontSide;
            teeth.material.depthTest = true;
        }
        // Lock teeth position (Down & Forward) to ensure visibility
        if (!teeth.userData.fixed) {
            teeth.position.y -= 0.02; // Drop 2cm (Centers teeth in mouth)
            teeth.position.z += 0.01; // Forward 1cm (Pulls out of throat)
            teeth.scale.set(1.1, 1.1, 1.1); // Slightly larger
            teeth.userData.fixed = true;
        }
    }

    return { headMesh: head, teethMesh: teeth, jawBone: jaw };
  }, [nodes, scene]);

  // --- 3. ANIMATION PLAYBACK ---
  useEffect(() => {
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
  }, [message, loading, actions]);

  // --- 4. AUDIO SETUP ---
  useEffect(() => {
    if (!analyserRef.current) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024; // Higher res for spectral analysis
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      source.connect(audioContext.destination);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  // --- 5. AUDIO PLAYBACK TRIGGER ---
  useEffect(() => {
    if (!message) return;
    if (!message.audio) { setTimeout(onMessagePlayed, 3000); return; }

    const audio = audioRef.current;
    audio.src = message.audio.startsWith("data:audio") ? message.audio : "data:audio/mp3;base64," + message.audio;
    audio.volume = 1.0;
    
    // Resume context if needed (browsers block auto-audio)
    if (analyserRef.current && analyserRef.current.context.state === 'suspended') {
        analyserRef.current.context.resume();
    }
    
    audio.play().catch(e => { 
        console.error("Audio Play Error:", e);
        onMessagePlayed(); 
    });
    audio.onended = onMessagePlayed;
  }, [message]);

  // --- 6. SPECTRAL LIP SYNC LOOP ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;
    let targetSmile = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      
      // Calculate energy in frequency bands
      // Low (Bass) = Vowels like O/U
      // High (Treble) = S/T/E sounds
      let bass = 0, mid = 0, high = 0;
      for (let i = 0; i < 20; i++) bass += dataArrayRef.current[i]; // 0-800Hz
      for (let i = 20; i < 100; i++) mid += dataArrayRef.current[i]; // 800-4000Hz
      for (let i = 100; i < 300; i++) high += dataArrayRef.current[i]; // 4k+

      bass /= 20; mid /= 80; high /= 200;

      // Noise gate
      if (bass < 20 && mid < 20) {
          bass = 0; mid = 0; high = 0;
      }

      // Logic:
      // Mids drive the main opening (A, E, O)
      // Highs drive the "Smile" (S, T, I)
      targetOpen = (mid / 255) * 2.0; 
      targetSmile = (high / 255) * 1.5;

      if (targetOpen > 1) targetOpen = 1;
      if (targetSmile > 1) targetSmile = 1;
    } 

    // Smooth Damping (Physics)
    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 20, delta);
    currentViseme.current.smile = THREE.MathUtils.damp(currentViseme.current.smile, targetSmile, 20, delta);

    const vOpen = currentViseme.current.open;
    const vSmile = currentViseme.current.smile;

    const setMorph = (mesh, name, val) => {
        if (mesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            const idx = mesh.morphTargetDictionary[name];
            if (idx !== undefined) mesh.morphTargetInfluences[idx] = val;
        }
    };

    // A. HEAD ANIMATION
    if (headMesh) {
        // Speech Shapes
        setMorph(headMesh, "viseme_aa", vOpen);
        setMorph(headMesh, "mouthOpen", vOpen);
        setMorph(headMesh, "mouthSmile", vSmile * 0.5); // Add smile on "S" sounds
        
        // Lip Curtain Reveal (Vertical Pull)
        setMorph(headMesh, "mouthUpperUp_C", vOpen * 0.8);
        setMorph(headMesh, "mouthLowerDown_C", vOpen * 0.8);
    }

    // B. TEETH ANIMATION (Sync with Head)
    if (teethMesh) {
        setMorph(teethMesh, "mouthOpen", vOpen);
        setMorph(teethMesh, "mouthSmile", vSmile * 0.5);
    }

    // C. JAW BONE (Physical Drop)
    if (jawBone) {
        // Rotate down ~12 degrees (0.2 rad)
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, vOpen * 0.2, 0.2);
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