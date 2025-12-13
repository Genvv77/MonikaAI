import { useEffect, useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useFBX, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // 1. LOAD THE AVATAR MESH
  const { nodes, materials } = useGLTF("/models/monika_v99.glb");

  // 2. LOAD YOUR FBX ANIMATIONS DIRECTLY
  // Note: We load the files you showed in the screenshot
  const { animations: idleAnim } = useFBX("/animations/Standing Idle.fbx");
  const { animations: angryAnim } = useFBX("/animations/Angry.fbx");
  const { animations: cryingAnim } = useFBX("/animations/Crying.fbx");
  const { animations: laughingAnim } = useFBX("/animations/Laughing.fbx");
  const { animations: rumbaAnim } = useFBX("/animations/Rumba Dancing.fbx");
  const { animations: terrifiedAnim } = useFBX("/animations/Terrified.fbx");
  const { animations: talking0Anim } = useFBX("/animations/Talking_0.fbx");
  const { animations: talking1Anim } = useFBX("/animations/Talking_1.fbx");
  const { animations: talking2Anim } = useFBX("/animations/Talking_2.fbx");

  // 3. NAME THEM CORRECTLY
  // We rename the clips so we can call them by simple names like "Idle" or "Talking_1"
  idleAnim[0].name = "Standing_Idle";
  angryAnim[0].name = "Angry";
  cryingAnim[0].name = "Crying";
  laughingAnim[0].name = "Laughing";
  rumbaAnim[0].name = "Rumba_Dancing";
  terrifiedAnim[0].name = "Terrified";
  talking0Anim[0].name = "Talking_0";
  talking1Anim[0].name = "Talking_1";
  talking2Anim[0].name = "Talking_2";

  // Combine all into one list
  const allAnimations = useMemo(() => [
    idleAnim[0], 
    angryAnim[0], 
    cryingAnim[0], 
    laughingAnim[0], 
    rumbaAnim[0], 
    terrifiedAnim[0], 
    talking0Anim[0], 
    talking1Anim[0], 
    talking2Anim[0]
  ], [idleAnim, angryAnim, cryingAnim, laughingAnim, rumbaAnim, terrifiedAnim, talking0Anim, talking1Anim, talking2Anim]);

  // 4. SETUP ANIMATION MIXER
  const group = useRef();
  const { actions } = useAnimations(allAnimations, group);

  const { message, onMessagePlayed, loading } = useChat();
  
  // Audio Setup
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- ANIMATION CONTROLLER ---
  useEffect(() => {
    // Default Animation
    let actionToPlay = actions["Standing_Idle"];

    // If waiting for response (Loading) -> You can make her think or look terrified?
    if (loading) {
       // Optional: actionToPlay = actions["Terrified"];
    }

    // If Monika sends a specific animation command (e.g. "Laughing")
    if (message && message.animation && actions[message.animation]) {
      actionToPlay = actions[message.animation];
    } 
    // If just talking normally, pick a random talking animation
    else if (message && message.audio) {
       actionToPlay = actions["Talking_1"]; // Default talk loop
    }

    // Play the animation
    if (actionToPlay) {
      actionToPlay.reset().fadeIn(0.5).play();
      return () => {
        actionToPlay.fadeOut(0.5);
      };
    }
  }, [message, loading, actions]);


  // --- AUDIO & LIP SYNC (Unchanged) ---
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

  useEffect(() => {
    if (message && message.audio) {
      const audio = audioRef.current;
      audio.src = message.audio;
      audio.currentTime = 0;
      if (analyserRef.current.context.state === 'suspended') analyserRef.current.context.resume();
      audio.play().catch(e => console.error("Playback error:", e));
      audio.onended = onMessagePlayed;
    }
  }, [message]);

  useFrame(() => {
    // LIP SYNC LOGIC
    if (!nodes.Wolf3D_Head) return;

    const audio = audioRef.current;
    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      // Calculate volume
      for (let i = 10; i < 50; i++) sum += dataArrayRef.current[i];
      const average = sum / 40; 
      const mouthOpenValue = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
      
      nodes.Wolf3D_Head.morphTargetInfluences[
        nodes.Wolf3D_Head.morphTargetDictionary["viseme_aa"]
      ] = THREE.MathUtils.lerp(
        nodes.Wolf3D_Head.morphTargetInfluences[
          nodes.Wolf3D_Head.morphTargetDictionary["viseme_aa"]
        ],
        mouthOpenValue,
        0.5
      );
    } else {
      nodes.Wolf3D_Head.morphTargetInfluences[
        nodes.Wolf3D_Head.morphTargetDictionary["viseme_aa"]
      ] = THREE.MathUtils.lerp(
        nodes.Wolf3D_Head.morphTargetInfluences[
          nodes.Wolf3D_Head.morphTargetDictionary["viseme_aa"]
        ],
        0,
        0.1
      );
    }
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={nodes.Hips} />
      <skinnedMesh
        name="Wolf3D_Head"
        geometry={nodes.Wolf3D_Head.geometry}
        material={materials.Wolf3D_Skin}
        skeleton={nodes.Wolf3D_Head.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
        morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
      />
      {/* Include Teeth and Clothes */}
      <skinnedMesh
        geometry={nodes.Wolf3D_Teeth.geometry}
        material={materials.Wolf3D_Teeth}
        skeleton={nodes.Wolf3D_Teeth.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
        morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Top.geometry}
        material={materials.Wolf3D_Outfit_Top}
        skeleton={nodes.Wolf3D_Outfit_Top.skeleton}
      />
       <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Bottom.geometry}
        material={materials.Wolf3D_Outfit_Bottom}
        skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Footwear.geometry}
        material={materials.Wolf3D_Outfit_Footwear}
        skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Body.geometry}
        material={materials.Wolf3D_Body}
        skeleton={nodes.Wolf3D_Body.skeleton}
      />
    </group>
  );
};

// Preload the files to prevent popping
useGLTF.preload("/models/monika_v99.glb");
useFBX.preload("/animations/Standing Idle.fbx");
useFBX.preload("/animations/Talking_1.fbx");