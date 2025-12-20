import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

// --- 🔒 YOUR CALIBRATED VALUES ---
const TEETH_Y = 0.014;  
const TEETH_Z = 0.071;  
const TEETH_SCALE = 1.0; 

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

  const denturesRef = useRef(null);

  // --- 1. DENTURE SETUP & BRIGHTENING ---
  useEffect(() => {
    // A. Find Head Bone
    const faceMesh = nodes.Wolf3D_Head;
    let targetBone = null;
    if (faceMesh && faceMesh.skeleton && faceMesh.skeleton.bones) {
        targetBone = faceMesh.skeleton.bones.find(b => b.name.toLowerCase().includes("head"));
        if (!targetBone) targetBone = faceMesh.skeleton.bones[faceMesh.skeleton.bones.length - 1];
    }
    if (!targetBone) targetBone = scene;

    // B. Find Original Teeth
    const originalTeeth = nodes.Wolf3D_Teeth;
    if (!originalTeeth) return;

    // C. Create Bright Dentures
    if (!denturesRef.current) {
        // Clone & Center
        const geometry = originalTeeth.geometry.clone();
        geometry.center();

        // New Material: BRIGHTER & WHITER
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,       // Pure White
            roughness: 0.2,        // Glossy (like enamel)
            metalness: 0.0,
            emissive: 0x222222,    // Slight self-glow to prevent dark shadows
            side: THREE.DoubleSide
        });
        
        const dentures = new THREE.Mesh(geometry, material);
        dentures.name = "Final_Dentures";
        
        // Apply Calibration
        dentures.position.set(0, TEETH_Y, TEETH_Z);
        dentures.scale.set(TEETH_SCALE, TEETH_SCALE, TEETH_SCALE);
        
        // Attach & Hide Original
        targetBone.add(dentures);
        denturesRef.current = dentures;
        originalTeeth.visible = false;
    }
  }, [nodes, scene]);

  // --- 2. ANIMATION CLEANER ---
  useEffect(() => {
    if (animations) {
        animations.forEach((clip) => {
            clip.tracks = clip.tracks.filter((track) => {
                return !track.name.toLowerCase().includes("morph") && !track.name.toLowerCase().includes("jaw");
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

  // --- 3. AUDIO SETUP ---
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

  // --- 4. ANIMATION LOOP ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let mid = 0;
      for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
      mid /= 40;
      targetOpen = (mid / 255) * 2.5; // High sensitivity
      if (targetOpen > 1) targetOpen = 1;
    } 

    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 18, delta);
    const val = currentViseme.current.open;

    const setMorph = (obj, name, v) => {
        if (obj?.morphTargetDictionary && obj?.morphTargetInfluences) {
            const idx = obj.morphTargetDictionary[name];
            if (idx !== undefined) obj.morphTargetInfluences[idx] = v;
        }
    };

    // A. HEAD ANIMATION (Lip Overdrive)
    if (nodes.Wolf3D_Head) {
        // Base speech
        setMorph(nodes.Wolf3D_Head, "viseme_aa", val);
        setMorph(nodes.Wolf3D_Head, "mouthOpen", val);
        
        // 🚀 OVERDRIVE: Force lips to peel back 50% more than normal
        // This reveals the teeth that are hiding behind the lips
        setMorph(nodes.Wolf3D_Head, "mouthUpperUp_C", val * 1.5); 
        setMorph(nodes.Wolf3D_Head, "mouthLowerDown_C", val * 1.5); 
        
        // Subtle smile to widen mouth corners
        setMorph(nodes.Wolf3D_Head, "mouthSmile", val * 0.3);
    }
    
    // B. TEETH ANIMATION (The "Half-Drop" Fix)
    if (denturesRef.current) {
        // 🧠 TRICK: Only open the teeth 50% as much as the jaw.
        // This keeps the bottom teeth "floating" higher up, making them visible
        // above the lower lip!
        setMorph(denturesRef.current, "mouthOpen", val * 0.4);
    }
  });

  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
      {Object.keys(nodes).map((name) => {
        const node = nodes[name];
        if (name === "Wolf3D_Teeth") return null; // Hide Original
        
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
