import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

// --- 🔒 LOCKED CALIBRATION VALUES ---
const TEETH_Y = 0.014;  // Up/Down
const TEETH_Z = 0.071;  // Forward/Back
const TEETH_SCALE = 1.0; 

export const Avatar = (props) => {
  const { nodes, scene } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();
  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions } = useAnimations(animations, group);
  
  // Audio Refs
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const currentViseme = useRef({ open: 0 });

  // New "Dentures" Reference
  const denturesRef = useRef(null);

  // --- 1. THE "GEOMETRY TRANSPLANT" (Run Once) ---
  useEffect(() => {
    // A. Find the Head Bone (Dynamic Search)
    const faceMesh = nodes.Wolf3D_Head;
    let targetBone = null;

    if (faceMesh && faceMesh.skeleton && faceMesh.skeleton.bones) {
        targetBone = faceMesh.skeleton.bones.find(b => b.name.toLowerCase().includes("head"));
        if (!targetBone) {
            targetBone = faceMesh.skeleton.bones[faceMesh.skeleton.bones.length - 1];
        }
    }
    if (!targetBone) targetBone = scene; // Fallback

    // B. Find Original Teeth
    const originalTeeth = nodes.Wolf3D_Teeth;
    if (!originalTeeth) return;

    // C. Create Final Dentures
    if (!denturesRef.current) {
        // 1. Clone & Center Geometry
        const geometry = originalTeeth.geometry.clone();
        geometry.center(); // Reset origin to (0,0,0)

        // 2. Create Mesh
        const material = originalTeeth.material.clone();
        material.side = THREE.DoubleSide;
        material.depthTest = true;
        
        const dentures = new THREE.Mesh(geometry, material);
        dentures.name = "Final_Dentures";
        
        // 3. Apply Calibration (Hardcoded)
        dentures.position.set(0, TEETH_Y, TEETH_Z);
        dentures.scale.set(TEETH_SCALE, TEETH_SCALE, TEETH_SCALE);
        dentures.rotation.set(0, 0, 0);

        // 4. Attach to Head Bone
        targetBone.add(dentures);
        denturesRef.current = dentures;

        // 5. Hide Original
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

  // --- 4. PLAY AUDIO ---
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

  // --- 5. LIP SYNC LOOP ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let mid = 0;
      for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
      mid /= 40;
      targetOpen = (mid / 255) * 2.2; 
      if (targetOpen > 1) targetOpen = 1;
    } 

    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 18, delta);
    const val = currentViseme.current.open;

    // Helper for applying morphs
    const setMorph = (obj, name, v) => {
        if (obj?.morphTargetDictionary && obj?.morphTargetInfluences) {
            const idx = obj.morphTargetDictionary[name];
            if (idx !== undefined) obj.morphTargetInfluences[idx] = v;
        }
    };

    // A. FACE ANIMATION
    if (nodes.Wolf3D_Head) {
        setMorph(nodes.Wolf3D_Head, "viseme_aa", val);
        setMorph(nodes.Wolf3D_Head, "mouthOpen", val);
        // Exaggerate lip movement to show your newly placed teeth!
        setMorph(nodes.Wolf3D_Head, "mouthUpperUp_C", val * 1.0); 
        setMorph(nodes.Wolf3D_Head, "mouthLowerDown_C", val * 1.0);
    }
    
    // B. TEETH ANIMATION (Sync)
    if (denturesRef.current) {
        setMorph(denturesRef.current, "mouthOpen", val);
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
