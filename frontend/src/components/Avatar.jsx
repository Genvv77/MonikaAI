import { useEffect, useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useFBX, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // --- 1. LOAD MODEL ---
  // We rely on the nodes map which you confirmed works
  const { nodes, materials } = useGLTF("/models/monika_v99.glb");
  const { message, onMessagePlayed, loading } = useChat();

  // --- 2. LOAD ANIMATIONS (FBX Method) ---
  const { animations: idleAnim } = useFBX("/animations/Standing Idle.fbx");
  const { animations: angryAnim } = useFBX("/animations/Angry.fbx");
  const { animations: cryingAnim } = useFBX("/animations/Crying.fbx");
  const { animations: laughingAnim } = useFBX("/animations/Laughing.fbx");
  const { animations: rumbaAnim } = useFBX("/animations/Rumba Dancing.fbx");
  const { animations: terrifiedAnim } = useFBX("/animations/Terrified.fbx");
  const { animations: talking0Anim } = useFBX("/animations/Talking_0.fbx");
  const { animations: talking1Anim } = useFBX("/animations/Talking_1.fbx");
  const { animations: talking2Anim } = useFBX("/animations/Talking_2.fbx");

  // Name animations for easy access
  idleAnim[0].name = "Standing_Idle";
  angryAnim[0].name = "Angry";
  cryingAnim[0].name = "Crying";
  laughingAnim[0].name = "Laughing";
  rumbaAnim[0].name = "Rumba_Dancing";
  terrifiedAnim[0].name = "Terrified";
  talking0Anim[0].name = "Talking_0";
  talking1Anim[0].name = "Talking_1";
  talking2Anim[0].name = "Talking_2";

  const allAnimations = useMemo(() => [
    idleAnim[0], angryAnim[0], cryingAnim[0], laughingAnim[0], rumbaAnim[0], 
    terrifiedAnim[0], talking0Anim[0], talking1Anim[0], talking2Anim[0]
  ], [idleAnim, angryAnim, cryingAnim, laughingAnim, rumbaAnim, terrifiedAnim, talking0Anim, talking1Anim, talking2Anim]);

  // --- 3. ANIMATION & AUDIO SETUP ---
  const group = useRef();
  const { actions } = useAnimations(allAnimations, group);

  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- 4. PLAY ANIMATION ---
  useEffect(() => {
    // Default fallback
    let actionToPlay = actions["Standing_Idle"]; 
    if (!actionToPlay) actionToPlay = Object.values(actions)[0];

    // Logic to pick animation
    if (message && message.animation && actions[message.animation]) {
      actionToPlay = actions[message.animation];
    } 
    else if (message && message.audio) {
       actionToPlay = actions["Talking_1"];
    }

    // Play with fade
    if (actionToPlay) {
      actionToPlay.reset().fadeIn(0.5).play();
      return () => {
        actionToPlay.fadeOut(0.5);
      };
    }
  }, [message, loading, actions]);

  // --- 5. SETUP AUDIO ANALYZER (One Time) ---
  useEffect(() => {
    if (!analyserRef.current) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      source.connect(audioContext.destination);
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  // --- 6. HANDLE MESSAGE PLAYBACK ---
  useEffect(() => {
    if (!message) return;

    // Safety: If message has no audio, skip after 3s
    if (!message.audio) {
        const timer = setTimeout(onMessagePlayed, 3000);
        return () => clearTimeout(timer);
    }

    const audio = audioRef.current;
    
    // Handle Base64 audio
    if (message.audio.startsWith("data:audio")) {
        audio.src = message.audio;
    } else {
        audio.src = "data:audio/mp3;base64," + message.audio;
    }

    audio.volume = 1.0;
    audio.currentTime = 0;

    // Resume context if suspended (Browser policy fix)
    if (analyserRef.current && analyserRef.current.context.state === 'suspended') {
        analyserRef.current.context.resume();
    }

    audio.play().catch(e => {
        console.error("Audio Playback Error:", e);
        onMessagePlayed(); 
    });

    audio.onended = onMessagePlayed;

  }, [message]);

  // --- 7. LIP SYNC FRAME LOOP ---
  useFrame(() => {
    // We use the node mapping logic below, but we access the head specifically for morphs
    if (!nodes.Wolf3D_Head) return;

    // Identify the correct Morph Target
    const dictionary = nodes.Wolf3D_Head.morphTargetDictionary;
    // Try "mouthOpen" first (standard), fallback to "viseme_aa" (RPM default)
    const mouthIdx = dictionary["mouthOpen"] !== undefined ? dictionary["mouthOpen"] : dictionary["viseme_aa"];
    
    if (mouthIdx === undefined) return;

    const audio = audioRef.current;
    let targetOpen = 0;

    // A. Calculate Volume
    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      // Focus on voice frequencies
      for (let i = 10; i < 50; i++) sum += dataArrayRef.current[i];
      const average = sum / 40; 
      // Map volume to mouth open (0.0 to 1.0)
      targetOpen = THREE.MathUtils.mapLinear(average, 0, 80, 0, 1); 
    }

    // B. Apply Smoothly
    const currentInfluence = nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx];
    const newValue = THREE.MathUtils.lerp(currentInfluence, targetOpen, 0.5);

    // Apply to Head
    nodes.Wolf3D_Head.morphTargetInfluences[mouthIdx] = newValue;
    
    // Apply to Teeth (if they exist)
    if (nodes.Wolf3D_Teeth) {
        const teethDict = nodes.Wolf3D_Teeth.morphTargetDictionary;
        const teethIdx = teethDict["mouthOpen"] !== undefined ? teethDict["mouthOpen"] : teethDict["viseme_aa"];
        if (teethIdx !== undefined) {
            nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx] = newValue;
        }
    }
  });

  // --- 8. RENDER LOOP (This is the Safe Method!) ---
  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips} />
      {Object.keys(nodes).map((name) => {
        if (nodes[name].isSkinnedMesh) {
          return (
            <skinnedMesh
              key={name}
              geometry={nodes[name].geometry}
              material={nodes[name].material}
              skeleton={nodes[name].skeleton}
              morphTargetDictionary={nodes[name].morphTargetDictionary}
              morphTargetInfluences={nodes[name].morphTargetInfluences}
              frustumCulled={false} // <--- FORCE VISIBILITY
            />
          );
        }
        return null;
      })}
    </group>
  );
};

useGLTF.preload("/models/monika_v99.glb");