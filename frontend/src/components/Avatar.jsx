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
  const [teethY, setTeethY] = useState(0); 
  const [teethZ, setTeethZ] = useState(0);  
  const [teethScale, setTeethScale] = useState(1.0);
  const [manualOpen, setManualOpen] = useState(1.0);
  const [debugMsg, setDebugMsg] = useState("Initializing...");

  // Ref for our new "Dentures"
  const denturesRef = useRef(null);

  // --- 1. DENTAL IMPLANT PROCEDURE ---
  useEffect(() => {
    // A. Find Head Bone
    let headBone = null;
    scene.traverse((child) => {
        if (child.isBone && (child.name === "Head" || child.name === "mixamorigHead")) {
            headBone = child;
        }
    });

    if (!headBone) {
        setDebugMsg("❌ ERROR: No Head Bone found!");
        return;
    }
    setDebugMsg(`✅ Attached to: ${headBone.name}`);

    // B. Find Original Teeth
    const oldTeeth = nodes.Wolf3D_Teeth;
    if (!oldTeeth) {
        setDebugMsg("❌ ERROR: No Wolf3D_Teeth found!");
        return;
    }

    // C. Create DENTURES (Clean Geometry)
    if (!denturesRef.current) {
        // Clone the geometry
        const geom = oldTeeth.geometry.clone();
        
        // --- CRITICAL FIX: CENTER THE GEOMETRY ---
        // This removes any weird offset built into the 3D model.
        // Now (0,0,0) is actually the center of the teeth.
        geom.center(); 

        const dentures = new THREE.Mesh(geom, oldTeeth.material.clone());
        
        // Setup Material
        dentures.material.transparent = false;
        dentures.material.side = THREE.FrontSide; // Normal render
        dentures.material.depthTest = true;
        
        // Add Green Debug Box (So you can see where they are!)
        const box = new THREE.BoxHelper(dentures, 0x00ff00);
        dentures.add(box);

        // Attach to Head Bone
        headBone.add(dentures);
        denturesRef.current = dentures;

        // Hide original
        oldTeeth.visible = false;
    }

  }, [nodes, scene]);

  // --- 2. ANIMATION PLAYBACK ---
  useEffect(() => {
    if (animations) {
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

  // --- 4. FRAME LOOP ---
  useFrame((state, delta) => {
    // A. MOVE DENTURES (Sliders)
    if (denturesRef.current) {
        denturesRef.current.position.set(0, teethY, teethZ);
        denturesRef.current.scale.set(teethScale, teethScale, teethScale);
    }

    // B. LIP SYNC
    const audio = audioRef.current;
    let targetOpen = manualOpen;

    if (manualOpen === 0 && !audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let mid = 0;
      for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
      mid /= 40;
      targetOpen = (mid / 255) * 2.0; 
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

    if (nodes.Wolf3D_Head) {
        setMorph(nodes.Wolf3D_Head, "viseme_aa", val);
        setMorph(nodes.Wolf3D_Head, "mouthOpen", val);
        setMorph(nodes.Wolf3D_Head, "mouthUpperUp_C", val);
        setMorph(nodes.Wolf3D_Head, "mouthLowerDown_C", val);
    }
    if (denturesRef.current) {
        setMorph(denturesRef.current, "mouthOpen", val);
    }
  });

  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips || nodes.mixamorigHips || nodes.root} />
      {Object.keys(nodes).map((name) => {
        const node = nodes[name];
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
      
      {/* DEBUG PANEL */}
      <Html position={[0, 0, 0]} zIndexRange={[100, 0]}>
        <div style={{
            position: "fixed", top: "10px", right: "10px", 
            background: "rgba(0,0,0,0.8)", padding: "15px", 
            color: "white", borderRadius: "8px", width: "250px",
            fontFamily: "monospace", fontSize: "12px", border: "2px solid #00ff00"
        }}>
            <h3 style={{margin:"0 0 10px 0", color: "#00ff00"}}>✅ GEOMETRY CENTERED</h3>
            <div style={{marginBottom:"10px", fontWeight:"bold"}}>{debugMsg}</div>
            <div style={{color:"yellow", fontSize:"10px", marginBottom:"10px"}}>Look for the GREEN BOX. That is your teeth.</div>

            <label>MOUTH OPEN: {manualOpen.toFixed(2)}</label>
            <input type="range" min="0" max="1" step="0.01" value={manualOpen} onChange={(e)=>setManualOpen(parseFloat(e.target.value))} style={{width:"100%"}} />
            <br/><br/>

            <label>UP / DOWN (Y): {teethY.toFixed(3)}</label>
            <input type="range" min="-0.2" max="0.2" step="0.001" value={teethY} onChange={(e)=>setTeethY(parseFloat(e.target.value))} style={{width:"100%"}} />
            <br/><br/>

            <label>FWD / BACK (Z): {teethZ.toFixed(3)}</label>
            <input type="range" min="-0.2" max="0.2" step="0.001" value={teethZ} onChange={(e)=>setTeethZ(parseFloat(e.target.value))} style={{width:"100%"}} />
            <br/><br/>
            
            <label>SCALE: {teethScale.toFixed(2)}</label>
            <input type="range" min="0.1" max="3.0" step="0.01" value={teethScale} onChange={(e)=>setTeethScale(parseFloat(e.target.value))} style={{width:"100%"}} />
        </div>
      </Html>
    </group>
  );
};

useGLTF.preload("/models/monika_v99.glb");
useGLTF.preload("/models/animations.glb");
