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
  
  // Audio Refs
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  
  // Physics Refs (Smoothness)
  const currentViseme = useRef({ open: 0, smile: 0 });

  // --- 1. ANIMATION CLEANER ---
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

  // --- 2. TEETH PLACEMENT (Manual Fix) ---
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
        if (!teeth.userData.fixed) {
            // Drop 2cm, Forward 1cm
            teeth.position.y -= 0.02; 
            teeth.position.z += 0.01; 
            teeth.scale.set(1.1, 1.1, 1.1); 
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

  // --- 6. LIP ARTICULATION LOOP ---
  useFrame((state, delta) => {
    const audio = audioRef.current;
    let targetOpen = 0;
    let targetSmile = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      
      // Spectral Analysis (Bass vs Treble)
      let bass = 0, mid = 0, high = 0;
      for (let i = 0; i < 10; i++) bass += dataArrayRef.current[i];
      for (let i = 10; i < 50; i++) mid += dataArrayRef.current[i];
      for (let i = 50; i < 150; i++) high += dataArrayRef.current[i];

      bass /= 10; mid /= 40; high /= 100;
      if (bass < 20) bass = 0;

      // Logic: Mids open mouth, Highs widen it
      targetOpen = (mid / 255) * 2.2; 
      targetSmile = (high / 255) * 1.5;

      if (targetOpen > 1) targetOpen = 1;
    } 

    currentViseme.current.open = THREE.MathUtils.damp(currentViseme.current.open, targetOpen, 18, delta);
    currentViseme.current.smile = THREE.MathUtils.damp(currentViseme.current.smile, targetSmile, 18, delta);

    const val = currentViseme.current.open;
    const smileVal = currentViseme.current.smile;

    const setMorph = (mesh, name, v) => {
        if (mesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            const idx = mesh.morphTargetDictionary[name];
            if (idx !== undefined) mesh.morphTargetInfluences[idx] = v;
        }
    };

    // A. HEAD (The "Curtain Lift")
    if (headMesh) {
        setMorph(headMesh, "viseme_aa", val);
        setMorph(headMesh, "mouthOpen", val);
        setMorph(headMesh, "mouthSmile", smileVal * 0.4);

        // --- THE FIX IS HERE ---
        // We force the Upper Lip to lift HIGHER than the jaw drops.
        // This guarantees teeth visibility.
        setMorph(headMesh, "mouthUpperUp_C", val * 1.2); 
        setMorph(headMesh, "mouthUpperUp", val * 1.0);
        
        // We pull the Lower Lip DOWN to clear the bottom teeth
        setMorph(headMesh, "mouthLowerDown_C", val * 1.2);
    }

    // B. TEETH (Match Opening)
    if (teethMesh) {
        setMorph(teethMesh, "mouthOpen", val);
        setMorph(teethMesh, "mouthSmile", smileVal * 0.4);
    }

    // C. JAW BONE (Physics)
    if (jawBone) {
        // Rotate down ~12 degrees
        jawBone.rotation.x = THREE.MathUtils.lerp(jawBone.rotation.x, val * 0.2, 0.2);
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