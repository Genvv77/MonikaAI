import { useEffect, useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

// --- 🔒 LOCKED CALIBRATION ---
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

  // Debug Pulse State
  const [isPulseTest, setIsPulseTest] = useState(true);

  // --- 1. THE "LOBOTOMY" (Animation Cleaner) ---
  useEffect(() => {
    if (!animations) return;

    // We aggressively delete ANY track that targets the Face Mesh
    animations.forEach((clip) => {
        clip.tracks = clip.tracks.filter((track) => {
            const name = track.name.toLowerCase();
            
            // 🚫 Block Morph Targets (Face Shapes)
            if (name.includes("morph")) return false;
            
            // 🚫 Block anything targeting the Head MESH (Skin)
            // (We want to keep the Head BONE, but not the Mesh animation)
            if (name.includes("wolf3d_head")) return false;
            
            // 🚫 Block Eye movement (optional, prevents crazy eyes)
            if (name.includes("eye")) return false;

            return true; // Keep body bones (Hips, Spine, Arms)
        });
    });
  }, [animations]);

  // --- 2. TEETH TRANSPLANT (Keep working logic) ---
  useEffect(() => {
    const faceMesh = nodes.Wolf3D_Head;
    let targetBone = null;
    if (faceMesh && faceMesh.skeleton && faceMesh.skeleton.bones) {
        targetBone = faceMesh.skeleton.bones.find(b => b.name.toLowerCase().includes("head"));
        if (!targetBone) targetBone = faceMesh.skeleton.bones[faceMesh.skeleton.bones.length - 1];
    }
    if (!targetBone) targetBone = scene;

    const originalTeeth = nodes.Wolf3D_Teeth;
    if (!originalTeeth) return;

    if (!denturesRef.current) {
        const geometry = originalTeeth.geometry.clone();
        geometry.center();
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,       
            roughness: 0.2,        
            emissive: 0x111111,    
            side: THREE.DoubleSide
        });
        const dentures = new THREE.Mesh(geometry, material);
        dentures.position.set(0, TEETH_Y, TEETH_Z);
        dentures.scale.set(TEETH_SCALE, TEETH_SCALE, TEETH_SCALE);
        targetBone.add(dentures);
        denturesRef.current = dentures;
        originalTeeth.visible = false;
    }
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

  // --- 5. VISUAL PULSE TEST (Runs for 2 seconds) ---
  useEffect(() => {
    setTimeout(() => {
        setIsPulseTest(false); // Stop pulsing after 2s
    }, 2000);
  }, []);

  // --- 6. FRAME LOOP ---
  useFrame((state, delta) => {
    let targetOpen = 0;

    if (isPulseTest) {
        // 🚨 PULSE TEST: Force mouth open/close to prove it works
        const time = state.clock.getElapsedTime();
        targetOpen = (Math.sin(time * 10) + 1) / 2; // Oscillate 0 to 1
    } else {
        // 🎤 REAL AUDIO SYNC
        const audio = audioRef.current;
        if (!audio.paused && !audio.ended && analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          let mid = 0;
          for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
          mid /= 40;
          targetOpen = (mid / 255) * 4.0; // Extreme Sensitivity
          if (targetOpen > 1) targetOpen = 1;
        }
    }

    // Smooth movement
    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 25, delta);
    const val = currentViseme.current.open;

    // Helper
    const setMorph = (obj, names, v) => {
        if (!obj?.morphTargetDictionary || !obj?.morphTargetInfluences) return;
        const targets = Array.isArray(names) ? names : [names];
        targets.forEach(name => {
            const idx = obj.morphTargetDictionary[name];
            if (idx !== undefined) obj.morphTargetInfluences[idx] = v;
        });
    };

    // A. FACE ANIMATION (With "Lip Overdrive")
    if (nodes.Wolf3D_Head) {
        const head = nodes.Wolf3D_Head;

        // 1. Open Mouth
        setMorph(head, ["viseme_aa", "mouthOpen", "jawOpen"], val);

        // 2. Lift Upper Lip (Clear top teeth)
        setMorph(head, ["mouthUpperUpLeft", "mouthUpperUpRight", "mouthUpperUp_C"], val * 1.5);
        
        // 3. Drop Lower Lip (Clear bottom teeth)
        setMorph(head, ["mouthLowerDownLeft", "mouthLowerDownRight", "mouthLowerDown_C"], val * 1.5);

        // 4. Smile (Widen)
        setMorph(head, ["mouthSmile", "mouthStretchLeft", "mouthStretchRight"], val * 0.5);
    }
    
    // B. TEETH ANIMATION (Half-Speed to show bottom teeth)
    if (denturesRef.current) {
        setMorph(denturesRef.current, ["mouthOpen", "viseme_aa"], val * 0.4);
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
