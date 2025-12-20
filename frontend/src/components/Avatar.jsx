import { useEffect, useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
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

  // --- CALIBRATION STATE ---
  const [teethY, setTeethY] = useState(-0.02); 
  const [teethZ, setTeethZ] = useState(0.01);  
  const [teethScale, setTeethScale] = useState(1.2);
  const [manualOpen, setManualOpen] = useState(0.05);
  const [debugMsg, setDebugMsg] = useState("Initializing...");

  // Ref for teeth mesh (original, kept skinned)
  const teethRef = useRef(null);

  // --- 1. SURGICAL PROCEDURE (Run Once) ---
  useEffect(() => {
    // A. Find the HEAD Bone (Strict Search)
    let headBone = null;
    scene.traverse((child) => {
        // Look for exact "Head" name to avoid grabbing the Hips/Root
        if (child.isBone && child.name === "Head") {
            headBone = child;
        }
    });

    // Backup: If "Head" not found, look for anything containing "Head"
    if (!headBone) {
        scene.traverse((child) => {
             if (child.isBone && child.name.includes("Head")) headBone = child;
        });
    }

    if (!headBone) {
        setDebugMsg("❌ ERROR: Could not find Head Bone!");
        return;
    }

    setDebugMsg(`✅ Attached to: ${headBone.name}`);

    // B. Find Original Teeth
    const oldTeeth = nodes.Wolf3D_Teeth;
    if (!oldTeeth) {
        setDebugMsg("❌ ERROR: Could not find Wolf3D_Teeth!");
        return;
    }

    // C. Keep the original teeth (skinned) and make sure they render
    teethRef.current = oldTeeth;
    oldTeeth.frustumCulled = false;
    oldTeeth.material.transparent = false;
    oldTeeth.material.side = THREE.DoubleSide;

  }, [nodes, scene]);

  // --- 2. ANIMATION PLAYBACK ---
  useEffect(() => {
    if (animations) {
        // Clean facial animations
        animations.forEach((clip) => {
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

  // --- 3. AUDIO ---
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

  // --- 4. FRAME LOOP (Controls Dentures) ---
  useFrame((state, delta) => {
    // A. MOVE DENTURES (Sliders)
    if (teethRef.current) {
        // Adjust teeth in local space of the head to avoid clipping
        teethRef.current.position.set(0, teethY, teethZ);
        teethRef.current.scale.set(teethScale, teethScale, teethScale);
    }

    // B. LIP SYNC
    const audio = audioRef.current;
    let audioOpen = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let mid = 0;
      for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
      mid /= 40;
      audioOpen = (mid / 255) * 1.4; 
      if (audioOpen > 1) audioOpen = 1;
    }

    // Manual slider is now an offset, audio drives the rest
    let targetOpen = Math.min(1, manualOpen + audioOpen);

    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 18, delta);
    const val = currentViseme.current.open;

    // C. MORPH TARGETS (Face + Dentures)
    const setMorph = (obj, name, v) => {
        if (obj?.morphTargetDictionary && obj?.morphTargetInfluences) {
            const idx = obj.morphTargetDictionary[name];
            if (idx !== undefined) obj.morphTargetInfluences[idx] = v;
        }
    };

    if (nodes.Wolf3D_Head) {
        setMorph(nodes.Wolf3D_Head, "mouthOpen", val);
        setMorph(nodes.Wolf3D_Head, "mouthSmile", val * 0.25);
    }

    // Apply speech morph to our new dentures too!
    if (teethRef.current) {
        setMorph(teethRef.current, "mouthOpen", val);
        setMorph(teethRef.current, "mouthSmile", val * 0.25);
    }
  });

  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      {Object.keys(nodes).map((name) => {
        const node = nodes[name];
        // Use the skinned teeth we already keep in the scene graph
        if (name === "Wolf3D_Teeth") {
          return null;
        }
        
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
      
      {/* UI PANEL */}
      <Html position={[0, 0, 0]} zIndexRange={[100, 0]}>
        <div style={{
            position: "fixed", top: "10px", right: "10px", 
            background: "rgba(0,0,0,0.8)", padding: "15px", 
            color: "white", borderRadius: "8px", width: "250px",
            fontFamily: "monospace", fontSize: "12px", border: "1px solid yellow"
        }}>
            <h3 style={{margin:"0 0 10px 0", color: "yellow"}}>🔧 FINAL FIXER</h3>
            <div style={{marginBottom:"10px", fontWeight:"bold"}}>{debugMsg}</div>

            <label>MOUTH OPEN: {manualOpen.toFixed(2)}</label>
            <input type="range" min="0" max="1" step="0.01" value={manualOpen} onChange={(e)=>setManualOpen(parseFloat(e.target.value))} style={{width:"100%"}} />
            <br/><br/>

            <label>UP / DOWN (Y): {teethY.toFixed(3)}</label>
            <input type="range" min="-0.2" max="0.2" step="0.001" value={teethY} onChange={(e)=>setTeethY(parseFloat(e.target.value))} style={{width:"100%"}} />
            <br/><br/>

            <label>FWD / BACK (Z): {teethZ.toFixed(3)}</label>
            <input type="range" min="-0.1" max="0.1" step="0.001" value={teethZ} onChange={(e)=>setTeethZ(parseFloat(e.target.value))} style={{width:"100%"}} />
            <br/><br/>
            
            <label>SCALE: {teethScale.toFixed(2)}</label>
            <input type="range" min="0.5" max="2.0" step="0.01" value={teethScale} onChange={(e)=>setTeethScale(parseFloat(e.target.value))} style={{width:"100%"}} />
        </div>
      </Html>
    </group>
  );
};

useGLTF.preload("/models/monika_v99.glb");
useGLTF.preload("/models/animations.glb");
