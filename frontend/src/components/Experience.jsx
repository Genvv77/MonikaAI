import { Environment, CameraControls } from "@react-three/drei";
import { Avatar } from "./Avatar";
import { useEffect, useRef, useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";

export const Experience = ({ zoom, started }) => {
  const cameraControls = useRef();
  const { camera } = useThree();

  // 1. Initialisation Native (Avant le rendu)
  useLayoutEffect(() => {
    // On force la caméra à regarder le visage (Y=0.55) dès la création
    camera.lookAt(0, 0.55, 0);
  }, [camera]);

  // 2. Gestion Dynamique
  useEffect(() => {
    if (!cameraControls.current) return;

    if (zoom) {
      // MODE LIBRE
      cameraControls.current.setLookAt(0, 0.55, 1.5, 0, 0.55, 0, true);
      cameraControls.current.dollyToCursor = true;
      cameraControls.current.infinityDolly = true;
      cameraControls.current.minDistance = 0.3;
      cameraControls.current.maxDistance = 10;
    } else {
      // MODE PORTRAIT (Fixe)
      // On réinitialise proprement
      cameraControls.current.setLookAt(
        0, 0.55, 1.5, // Position
        0, 0.55, 0,   // Cible
        true          // Animation fluide
      );
      cameraControls.current.dollyToCursor = false;
    }
  }, [zoom, started]);

  return (
    <>
      <CameraControls 
        ref={cameraControls} 
        makeDefault 
      />
      
      <Environment preset="sunset" />
      
      <group position-y={-1}>
        <Avatar /> 
      </group>
    </>
  );
};