import { Canvas } from "@react-three/fiber";
import { Loader } from "@react-three/drei";
import { Experience } from "./components/Experience";
import { UI, zoomAtom, backgroundModeAtom, backgroundImageAtom } from "./components/UI";
import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Welcome } from "./components/welcome";
import { Leva } from "leva";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import TokenGate from './components/TokenGate';
import TradingDashboard from './components/TradingDashboard';

function MonikaExperience() {
  const [zoom] = useAtom(zoomAtom);
  const [bgMode] = useAtom(backgroundModeAtom);
  const [bgImage] = useAtom(backgroundImageAtom);

  const [started, setStarted] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let userId = localStorage.getItem("monika_user_id");
    if (!userId) {
      userId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("monika_user_id", userId);
    }
  }, []);

  useEffect(() => {
    if (started && bgMode === "camera") {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        })
        .catch(err => console.error("Erreur Webcam:", err));
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [bgMode, started]);

  return (
    <>
      <Loader />
      <Leva hidden />

      {!started && <Welcome onStart={() => setStarted(true)} />}

      <div className={`relative w-full h-screen transition-opacity duration-1000 ${started ? "opacity-100" : "opacity-0 pointer-events-none"}`}>

        <UI />

        {/* ARRIÈRE-PLAN */}
        <div className="fixed inset-0 -z-10">
          {bgMode === "green" && <div className="w-full h-full bg-[#00FF00]" />}
          {bgMode === "default" && <div className="w-full h-full bg-gradient-to-b from-pink-200 to-purple-300" />}
          {bgMode === "camera" && (
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
          )}
          {bgMode === "image" && bgImage && (
            <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${bgImage})` }} />
          )}
        </div>

        {/* SCÈNE 3D - Only load after welcome screen */}
        {started && (
          <Canvas
            shadows
            camera={{ position: [0, 0.55, 1.5], fov: 30 }}
            gl={{ alpha: true }}
            className="w-full h-full block"
          >
            <Experience zoom={zoom} started={started} key={started} />
          </Canvas>
        )}
        <div className="fixed bottom-0 left-0 w-full h-0 bg-gradient-to-t from-pink-200/80 to-transparent pointer-events-none z-0" />
      </div>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MonikaExperience />} />

        {/* 🔒 PROTECTED ROUTE */}
        <Route path="/trading" element={
          <TokenGate>
            <TradingDashboard />
          </TokenGate>
        } />

      </Routes>
    </BrowserRouter>
  );
}

export default App;