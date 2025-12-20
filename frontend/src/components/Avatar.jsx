import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";
import { useControls, button } from "leva"; // Import the debug tool

export const Avatar = (props) => {
  const { nodes, scene } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();
  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions } = useAnimations(animations, group);
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const currentOpen = useRef(0);

  // --- 🛠️ DEBUG CONTROLS ---
  // These sliders will appear on your screen!
  const { 
    teethY, 
    teethZ, 
    teethScale, 
    jawForce, 
    lipFactor,
    manualOpen 
  } = useControls("Teeth Debugger", {
    teethY: { value: -0.015, min: -0.05, max: 0.05, step: 0.001 },
    teethZ: { value: 0.01, min: -0.05, max: 0.05, step: 0.001 },
    teethScale: { value: 1.05, min: 0.5, max: 2.0, step: 0.01 },
    jawForce: { value: 0.2, min: 0, max: 1, step: 0.01 }, // Bone rotation
    lipFactor: { value: 1.5, min: 0, max: 3, step: 0.1 }, // Lip stretch
    manualOpen: { value: 0, min: 0, max: 1, label: "Test Mouth Open" }, // Slide this to test without talking!
    "Log Values": button(() => console.log({ teethY, teethZ, teethScale }))
  });

  // --- CLEAN ANIMATIONS ---
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

  // --- REAL-TIME ADJUSTMENTS ---
  const { headMesh, teethMesh, jawBone } = useMemo(() => {
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;
    let jaw = null;

    scene.traverse((child) => {
        if (child.isBone && child.name.toLowerCase().includes("jaw")) jaw = child;
    });

    // Reset material so it's not transparent/weird
    if (teeth && teeth.material) {
        teeth.material.transparent = false;
        teeth.material.side = THREE.FrontSide;
        teeth.material.depthTest = true;
    }

    return { headMesh: head, teethMesh: teeth, jawBone: jaw };
  }, [nodes, scene]);

  // Apply slider values instantly (every frame)
  useFrame(() => {
    if (teethMesh) {
        teethMesh.position.y = teethY;
        teethMesh.position.z = teethZ;
        teethMesh.scale.set(teethScale, teethScale, teethScale);
    }
  });

  // --- ANIMATION & AUDIO ---
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

  // Audio setup
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
    audio.play().catch(e => { onMessagePlayed(); });
    audio.onended = onMessagePlayed;
  }, [message]);

  // --- SYNC LOOP ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = manualOpen; // Start with slider value

    // If audio is playing, override slider
    if (!audio.paused && !audio.ended && analyserRef.current && manualOpen === 0) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 60; i++) sum += dataArrayRef.current[i];
      let average = sum / 50;
      if (average < 10) average = 0; 
      targetOpen = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1) * 2.5;
      if (targetOpen > 1) targetOpen = 1;
    } 

    currentOpen.current = THREE.MathUtils.damp(currentOpen.current, targetOpen, 15, delta);
    const val = currentOpen.current;

    const setMorph = (mesh, name, v) => {
        if (mesh?.morphTargetDictionary && mesh?.morphTargetInfluences) {
            const idx = mesh.morphTargetDictionary[name];
            if (idx !== undefined) mesh.morphTargetInfluences[idx] = v;
        }
    };

    if (headMesh) {
        setMorph(headMesh, "viseme_aa", val);
        setMorph(headMesh, "mouthOpen", val);
        setMorph(headMesh, "mouthSmile", val * 0.2);
        // Use the lipFactor slider to test how wide lips need to go
        setMorph(headMesh, "mouthLowerDown_C", val * lipFactor); 
        setMorph(headMesh, "mouthUpperUp_C", val * lipFactor);
    }

    if (teethMesh) {
        setMorph(teethMesh, "mouthOpen", val);
    }

    // Jaw rotation slider
    if (jawBone) {
        jawBone.rotation.x = val * jawForce; 
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