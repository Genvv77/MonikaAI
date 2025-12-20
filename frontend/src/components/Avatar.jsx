import { useEffect, useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";
import { Html } from "@react-three/drei"; // Allows HTML overlay

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
  const currentViseme = useRef({ open: 0, smile: 0 });

  // --- CALIBRATION STATE ---
  // These control the position in real-time
  const [teethY, setTeethY] = useState(-0.02); // Start 2cm down
  const [teethZ, setTeethZ] = useState(0.01);  // Start 1cm forward
  const [teethScale, setTeethScale] = useState(1.2);
  const [manualOpen, setManualOpen] = useState(0); // For testing without audio

  // --- 1. CLEAN ANIMATIONS ---
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

  // --- 2. TEETH SETUP ---
  const { headMesh, teethMesh, jawBone } = useMemo(() => {
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;
    let jaw = null;

    scene.traverse((child) => {
        if (child.isBone && child.name.toLowerCase().includes("jaw")) jaw = child;
    });

    if (teeth) {
        if (teeth.material) {
            teeth.material = teeth.material.clone();
            teeth.material.transparent = false;
            teeth.material.side = THREE.FrontSide;
            teeth.material.depthTest = true; 
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
      analyser.fftSize = 512; 
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      source.connect(audioContext.destination);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  // --- 5. AUDIO TRIGGER ---
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

  // --- 6. RENDER LOOP ---
  useFrame((state, delta) => {
    // A. APPLY SLIDER VALUES INSTANTLY
    if (teethMesh) {
        teethMesh.position.y = teethY;
        teethMesh.position.z = teethZ;
        teethMesh.scale.set(teethScale, teethScale, teethScale);
    }

    // B. CALCULATE OPENING (Audio vs Manual Slider)
    const audio = audioRef.current;
    let targetOpen = manualOpen; // Default to slider
    let targetSmile = 0;

    if (manualOpen === 0 && !audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let mid = 0, high = 0;
      for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
      for (let i = 50; i < 150; i++) high += dataArrayRef.current[i];
      mid /= 40; high /= 100;

      targetOpen = (mid / 255) * 2.5; 
      targetSmile = (high / 255) * 1.5;
      if (targetOpen > 1) targetOpen = 1;
    } 

    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 18, delta);
    currentViseme.current.smile = THREE.MathUtils.damp(currentViseme.current.smile, targetSmile, 18, delta);

    const val = currentViseme.current.open;
    const smileVal = currentViseme.current.smile;

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
        setMorph(headMesh, "mouthSmile", smileVal * 0.4);
        
        // Lift upper lip to show top teeth
        setMorph(headMesh, "mouthUpperUp_C", val * 1.0);
        // Drop lower lip to show bottom teeth
        setMorph(headMesh, "mouthLowerDown_C", val * 1.0);
    }

    if (teethMesh) {
        setMorph(teethMesh, "mouthOpen", val);
    }

    if (jawBone) {
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, val * 0.15, 0.2);
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
      
      {/* --- CALIBRATION UI OVERLAY --- */}
      <Html position={[0, 0, 0]} zIndexRange={[100, 0]}>
        <div style={{
            position: "fixed", top: "10px", right: "10px", 
            background: "rgba(0,0,0,0.8)", padding: "15px", 
            color: "white", borderRadius: "8px", width: "250px",
            fontFamily: "monospace", fontSize: "12px"
        }}>
            <h3 style={{margin:"0 0 10px 0"}}>🦷 TEETH CALIBRATOR</h3>
            
            <label>MOUTH OPEN (Test): {manualOpen.toFixed(2)}</label>
            <input type="range" min="0" max="1" step="0.01" value={manualOpen} onChange={(e)=>setManualOpen(parseFloat(e.target.value))} style={{width:"100%"}} />

            <div style={{height:"10px"}}></div>

            <label>UP / DOWN (Y): {teethY.toFixed(3)}</label>
            <input type="range" min="-0.08" max="0.05" step="0.001" value={teethY} onChange={(e)=>setTeethY(parseFloat(e.target.value))} style={{width:"100%"}} />
            
            <div style={{height:"10px"}}></div>

            <label>FORWARD / BACK (Z): {teethZ.toFixed(3)}</label>
            <input type="range" min="-0.05" max="0.05" step="0.001" value={teethZ} onChange={(e)=>setTeethZ(parseFloat(e.target.value))} style={{width:"100%"}} />

            <div style={{height:"10px"}}></div>
            
            <label>SCALE (Size): {teethScale.toFixed(2)}</label>
            <input type="range" min="0.5" max="2.0" step="0.01" value={teethScale} onChange={(e)=>setTeethScale(parseFloat(e.target.value))} style={{width:"100%"}} />
        </div>
      </Html>
    </group>
  );
};

useGLTF.preload("/models/monika_v99.glb");
useGLTF.preload("/models/animations.glb");