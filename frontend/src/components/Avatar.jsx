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
  const currentViseme = useRef({ open: 0, smile: 0 });

  // --- CALIBRATION STATE ---
  // Start with these values. Now that teeth are un-rigged, they WILL move.
  const [teethY, setTeethY] = useState(-0.02); // Up/Down
  const [teethZ, setTeethZ] = useState(0.01);  // Forward/Back
  const [teethScale, setTeethScale] = useState(1.2);
  const [manualOpen, setManualOpen] = useState(1.0); // Start OPEN so you can see

  // --- 1. DENTAL EXTRACTION (The Critical Fix) ---
  const { headMesh, teethMesh, headBone } = useMemo(() => {
    const head = nodes.Wolf3D_Head;
    let teeth = nodes.Wolf3D_Teeth;
    let hBone = null;

    // A. FIND HEAD BONE (To attach dentures to)
    scene.traverse((child) => {
        if (child.isBone && (child.name === "Head" || child.name.includes("Head"))) {
            hBone = child;
        }
    });

    // B. CONVERT TEETH TO "DENTURES" (Un-Rigging)
    if (teeth && hBone) {
        // 1. Create a CLONE that is a simple Mesh, NOT a SkinnedMesh
        // This removes the skeleton's control so we can move it manually.
        const dentures = new THREE.Mesh(teeth.geometry.clone(), teeth.material.clone());
        dentures.name = "Dentures";
        
        // 2. Enable Morphs on the new dentures so they still open/close
        dentures.morphTargetDictionary = teeth.morphTargetDictionary;
        dentures.morphTargetInfluences = teeth.morphTargetInfluences;

        // 3. Attach Dentures to the Head Bone
        hBone.add(dentures);
        
        // 4. Hide original rigged teeth
        teeth.visible = false;
        
        // 5. Use the new dentures for our logic
        teeth = dentures;
        
        // Fix Material
        teeth.material.transparent = false;
        teeth.material.side = THREE.FrontSide;
        teeth.material.depthTest = true;
    }

    return { headMesh: head, teethMesh: teeth, headBone: hBone };
  }, [nodes, scene]);

  // --- 2. ANIMATION PLAYBACK ---
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

  // --- 4. AUDIO TRIGGER ---
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

  // --- 5. RENDER LOOP ---
  useFrame((state, delta) => {
    // A. APPLY SLIDERS TO DENTURES (Now this will work!)
    if (teethMesh) {
        teethMesh.position.set(0, teethY, teethZ); // Local position inside Head Bone
        teethMesh.scale.set(teethScale, teethScale, teethScale);
        
        // Rotation fix: Ensure teeth face forward (Head bone usually rotates them)
        // You might not need this, but if teeth face UP, uncomment:
        // teethMesh.rotation.set( -Math.PI / 2, 0, 0 ); 
    }

    // B. CALCULATE OPENING
    const audio = audioRef.current;
    let targetOpen = manualOpen; // Default to slider

    if (manualOpen === 0 && !audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let mid = 0;
      for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
      mid /= 40;
      targetOpen = (mid / 255) * 2.5; 
      if (targetOpen > 1) targetOpen = 1;
    } 

    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 18, delta);
    const val = currentViseme.current.open;

    const setMorph = (mesh, name, v) => {
        if (mesh?.morphTargetDictionary && mesh?.morphTargetInfluences) {
            const idx = mesh.morphTargetDictionary[name];
            if (idx !== undefined) mesh.morphTargetInfluences[idx] = v;
        }
    };

    // C. ANIMATE FACE
    if (headMesh) {
        setMorph(headMesh, "viseme_aa", val);
        setMorph(headMesh, "mouthOpen", val);
        setMorph(headMesh, "mouthUpperUp_C", val * 1.0);
        setMorph(headMesh, "mouthLowerDown_C", val * 1.0);
    }

    // D. ANIMATE DENTURES
    if (teethMesh) {
        setMorph(teethMesh, "mouthOpen", val);
    }
  });

  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      
      {/* Draw the rest of the body normally */}
      {Object.keys(nodes).map((name) => {
        const node = nodes[name];
        // Don't draw original teeth (we hid them manually, but this is double safety)
        if (name === "Wolf3D_Teeth") return null;

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
      
      {/* --- CALIBRATION UI --- */}
      <Html position={[0, 0, 0]} zIndexRange={[100, 0]}>
        <div style={{
            position: "fixed", top: "10px", right: "10px", 
            background: "rgba(0,0,0,0.8)", padding: "15px", 
            color: "white", borderRadius: "8px", width: "250px",
            fontFamily: "monospace", fontSize: "12px"
        }}>
            <h3 style={{margin:"0 0 10px 0"}}>🦷 DENTURE CALIBRATOR</h3>
            <div style={{color:"yellow", marginBottom:"10px"}}>TEETH ARE NOW UN-RIGGED. SLIDERS WILL WORK.</div>

            <label>MOUTH OPEN (Test): {manualOpen.toFixed(2)}</label>
            <input type="range" min="0" max="1" step="0.01" value={manualOpen} onChange={(e)=>setManualOpen(parseFloat(e.target.value))} style={{width:"100%"}} />

            <div style={{height:"10px"}}></div>

            <label>UP / DOWN (Y): {teethY.toFixed(3)}</label>
            <input type="range" min="-0.15" max="0.15" step="0.001" value={teethY} onChange={(e)=>setTeethY(parseFloat(e.target.value))} style={{width:"100%"}} />
            
            <div style={{height:"10px"}}></div>

            <label>FORWARD / BACK (Z): {teethZ.toFixed(3)}</label>
            <input type="range" min="-0.10" max="0.10" step="0.001" value={teethZ} onChange={(e)=>setTeethZ(parseFloat(e.target.value))} style={{width:"100%"}} />

            <div style={{height:"10px"}}></div>
            
            <label>SCALE: {teethScale.toFixed(2)}</label>
            <input type="range" min="0.5" max="2.0" step="0.01" value={teethScale} onChange={(e)=>setTeethScale(parseFloat(e.target.value))} style={{width:"100%"}} />
        </div>
      </Html>
    </group>
  );
};

useGLTF.preload("/models/monika_v99.glb");
useGLTF.preload("/models/animations.glb");