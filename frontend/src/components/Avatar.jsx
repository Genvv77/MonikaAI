import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

// --- TUNING KNOBS ---
// We are DROPPING the teeth (-Y) to center them in the mouth
const TEETH_Z_OFFSET = 0.009; // Forward (9mm)
const TEETH_Y_OFFSET = -0.015; // DOWN (1.5cm) - Crucial for lower teeth visibility
const TEETH_SCALE = 1.05;      // Slight scale up

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
  
  const currentOpen = useRef(0);

  // --- 3. CLEAN ANIMATIONS ---
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

  // --- 4. PHYSICAL RELOCATION (Vertical Drop) ---
  const { headMesh, teethMesh, jawBone } = useMemo(() => {
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;
    
    if (teeth) {
        // A. Reset Material
        if (teeth.material) {
            teeth.material = teeth.material.clone();
            teeth.material.transparent = false;
            teeth.material.side = THREE.FrontSide;
        }

        // B. Apply Scale
        teeth.scale.set(TEETH_SCALE, TEETH_SCALE, TEETH_SCALE);

        // C. Apply Permanent Offset
        if (!teeth.userData.offsetApplied) {
            teeth.position.z += TEETH_Z_OFFSET;
            teeth.position.y += TEETH_Y_OFFSET; // Drops teeth down
            teeth.userData.offsetApplied = true;
        }
    }

    // Find Jaw
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

  // --- 8. SYNC LOOP ---
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
      if (value > 1.0) value = 1.0; 
      targetOpen = value;
    } 

    currentOpen.current = THREE.MathUtils.damp(currentOpen.current, targetOpen, 15, delta);
    const val = currentOpen.current;

    const setMorph = (mesh, name, val) => {
        if (mesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            const idx = mesh.morphTargetDictionary[name];
            if (idx !== undefined) mesh.morphTargetInfluences[idx] = val;
        }
    };

    // A. HEAD: Open & Reveal
    if (headMesh) {
        setMorph(headMesh, "viseme_aa", val);
        setMorph(headMesh, "mouthOpen", val);
        
        // AGGRESSIVE LIP PULL
        // We pull the lower lip DOWN hard to find those missing bottom teeth
        setMorph(headMesh, "mouthLowerDown_C", val * 1.5); 
        setMorph(headMesh, "mouthLowerDown", val * 1.2);
        
        // Pull upper lip UP
        setMorph(headMesh, "mouthUpperUp_C", val * 1.2);
        setMorph(headMesh, "mouthUpperUp", val * 1.0);
        
        setMorph(headMesh, "mouthSmile", val * 0.2);
    }

    // B. TEETH: Force Open
    if (teethMesh) {
        setMorph(teethMesh, "mouthOpen", val);
    }

    // C. JAW BONE: FROZEN
    // We intentionally DO NOT rotate the jaw bone.
    // If we rotate it, it might drag the teeth down into the chin skin again.
    // By keeping it frozen, the teeth stay "up" while the lips pull "down".
    // if (jawBone) jawBone.rotation.x = ... (DISABLED)
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