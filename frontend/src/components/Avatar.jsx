import { useEffect, useRef, useMemo } from "react";
import { useFrame, useGraph } from "@react-three/fiber";
import { useGLTF, useFBX, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

export const Avatar = (props) => {
  // 1. LOAD MODEL (And Clone it to be safe)
  const { scene } = useGLTF("/models/monika_v99.glb");
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone);

  // 2. LOAD ANIMATIONS
  const { animations: idleAnim } = useFBX("/animations/Standing Idle.fbx");
  const { animations: angryAnim } = useFBX("/animations/Angry.fbx");
  const { animations: cryingAnim } = useFBX("/animations/Crying.fbx");
  const { animations: laughingAnim } = useFBX("/animations/Laughing.fbx");
  const { animations: rumbaAnim } = useFBX("/animations/Rumba Dancing.fbx");
  const { animations: terrifiedAnim } = useFBX("/animations/Terrified.fbx");
  const { animations: talking0Anim } = useFBX("/animations/Talking_0.fbx");
  const { animations: talking1Anim } = useFBX("/animations/Talking_1.fbx");
  const { animations: talking2Anim } = useFBX("/animations/Talking_2.fbx");

  // 3. NAME ANIMATIONS
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

  // 4. SETUP MIXER
  const group = useRef();
  const { actions } = useAnimations(allAnimations, group);
  const { message, onMessagePlayed, loading } = useChat();
  
  // Audio Setup
  const audioRef = useRef(new Audio());
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  // --- ANIMATION CONTROLLER ---
  useEffect(() => {
    let actionToPlay = actions["Standing_Idle"];
    if (!actionToPlay) actionToPlay = Object.values(actions)[0];

    if (loading) {
       // Optional: actionToPlay = actions["Terrified"];
    }
    
    if (message && message.animation && actions[message.animation]) {
      actionToPlay = actions[message.animation];
    } 
    else if (message && message.audio) {
       actionToPlay = actions["Talking_1"];
    }

    if (actionToPlay) {
      actionToPlay.reset().fadeIn(0.5).play();
      return () => { actionToPlay.fadeOut(0.5); };
    }
  }, [message, loading, actions]);

  // --- AUDIO SETUP ---
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

  // --- LIP SYNC FRAME LOOP ---
  useFrame(() => {
    // Find the nodes in the CLONED scene
    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;

    if (!head || !teeth) return;

    // Fix Frustum Culling (Prevents flickering/disappearing)
    head.frustumCulled = false;
    teeth.frustumCulled = false;

    const audio = audioRef.current;
    let mouthOpenValue = 0;

    if (!audio.paused && !audio.ended && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 10; i < 50; i++) sum += dataArrayRef.current[i];
      const average = sum / 40; 
      mouthOpenValue = THREE.MathUtils.mapLinear(average, 0, 100, 0, 1);
    }

    // Apply Morph Targets
    const targetValue = THREE.MathUtils.lerp(
        head.morphTargetInfluences[head.morphTargetDictionary["viseme_aa"]],
        mouthOpenValue,
        0.5
    );

    head.morphTargetInfluences[head.morphTargetDictionary["viseme_aa"]] = targetValue;
    teeth.morphTargetInfluences[teeth.morphTargetDictionary["viseme_aa"]] = targetValue;
  });

  return (
    <group ref={group} {...props} dispose={null}>
      {/* RENDER THE ENTIRE SCENE AUTOMATICALLY */}
      <primitive object={clone} />
    </group>
  );
};

useGLTF.preload("/models/monika_v99.glb");