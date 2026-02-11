import { atom, useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useChat } from "../hooks/useChat";
import { useNavigate } from "react-router-dom";

// États globaux
export const zoomAtom = atom(false);
export const backgroundModeAtom = atom("default");
export const userModeAtom = atom("girlfriend");
export const backgroundImageAtom = atom(null);

export const UI = ({ hidden, ...props }) => {
  const navigate = useNavigate(); // Hook for navigation
  const [zoom, setZoom] = useAtom(zoomAtom);

  const [bgMode, setBgMode] = useAtom(backgroundModeAtom);
  const [mode, setMode] = useAtom(userModeAtom);
  const [, setBgImage] = useAtom(backgroundImageAtom);

  const fileInputRef = useRef();
  const input = useRef();
  const chatContainerRef = useRef(null);

  const { chat, loading, history, deleteMessage, resetChat } = useChat();
  const prevHistoryLength = useRef(history.length);

  const [flash, setFlash] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false); // Mobile Menu State

  const sendMessage = (textOverride = null) => {
    const text = textOverride || input.current.value;
    if (!loading && text.trim()) {
      chat(text);
      if (!textOverride) input.current.value = "";
    }
  };

  const quickAction = (action) => {
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    let message = "";
    switch (action) {
      case "kiss": message = "*Blows you a passionate kiss* 💋"; break;
      case "hug": message = "*Gives you a warm, tight hug* 🤗"; break;
      case "dance": message = "*Do a cute pose for me!* 💃"; break;
      case "wave": message = "*Waves hello excitedly* 👋"; break;
      default: return;
    }
    sendMessage(message);
  };

  const handleReset = () => {
    const confirmReset = window.confirm(
      "WARNING: Are you sure you want to restart?\n\nMonika's memory of you will be completely wiped."
    );
    if (confirmReset) resetChat();
  };

  useEffect(() => {
    if (history.length > prevHistoryLength.current) {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }
    prevHistoryLength.current = history.length;
  }, [history]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setBgImage(url);
      setBgMode("image");
    }
  };

  if (hidden) return null;

  // Restore UI Button (if hidden)
  if (!uiVisible) {
    return (
      <button
        onClick={() => setUiVisible(true)}
        className="fixed top-4 right-4 z-50 bg-white/50 backdrop-blur-md p-3 rounded-full hover:bg-white transition-all shadow-lg text-pink-500"
        title="Show UI"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <div className={`fixed inset-0 bg-white pointer-events-none z-50 transition-opacity duration-300 ${flash ? "opacity-30" : "opacity-0"}`} />

      {/* --- MENU OVERLAY (DRAWER) --- */}
      <div className={`fixed inset-0 z-[60] flex transition-all duration-300 ${menuOpen ? "visible opacity-100" : "invisible opacity-0 pointer-events-none"}`}>

        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMenuOpen(false)}></div>

        {/* Le Menu (Drawer) */}
        <div className={`absolute md:top-6 md:left-7 top-5 left-5 w-72 bg-white/90 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-white/60 flex flex-col gap-4 transition-all duration-300 ${menuOpen ? "translate-x-0 scale-100" : "-translate-x-10 scale-95"}`}>

          {/* Header du Menu */}
          <div className="flex justify-between items-center border-b border-gray-100 pb-4">
            <h2 className="font-black text-xl text-gray-800">Menu</h2>
            <button onClick={() => setMenuOpen(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Liste des Pages */}
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">

            {/* Chat */}
            <button onClick={() => setMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 text-white shadow-lg shadow-pink-200 transition-transform active:scale-95">
              <div className="bg-white/20 p-2 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg></div>
              <span className="font-bold">Chat</span>
            </button>

            {/* Trading Terminal - NEW */}
            <button onClick={() => navigate("/trading")} className="flex items-center gap-4 p-4 rounded-2xl bg-gray-900 text-green-400 shadow-lg shadow-green-900/20 transition-transform active:scale-95 border border-green-500/30">
              <div className="bg-green-500/20 p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                </svg>
              </div>
              <span className="font-bold">Trading Terminal</span>
            </button>

            {/* Hangman */}
            <button className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 text-gray-400 border border-gray-100 cursor-not-allowed group">
              <div className="bg-gray-200 p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 21h4m-2 0v-14h8v3" />
                  <circle cx="16" cy="11" r="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 13v3" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <span className="font-bold block text-sm">Hangman Game</span>
                <span className="text-[10px] uppercase tracking-wider font-bold">Coming Soon</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </button>

            {/* Hot or Not */}
            <button className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 text-gray-400 border border-gray-100 cursor-not-allowed group">
              <div className="bg-gray-200 p-2 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" /></svg></div>
              <div className="flex-1 text-left"><span className="font-bold block text-sm">Hot or Not</span><span className="text-[10px] uppercase tracking-wider font-bold">Coming Soon</span></div>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </button>

            {/* MonikaFans */}
            <button className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 text-gray-400 border border-gray-100 cursor-not-allowed group">
              <div className="bg-gray-200 p-2 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg></div>
              <div className="flex-1 text-left"><span className="font-bold block text-sm">MonikaFans</span><span className="text-[10px] uppercase tracking-wider font-bold">Coming Soon</span></div>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </button>
          </div>

          {/* CUSTOMIZATION IN MENU (VISIBLE ONLY ON MOBILE MENU) */}
          <div className="md:hidden mt-auto border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Customization</p>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={handleReset} className="w-12 h-12 rounded-full bg-gray-50 text-red-500 flex items-center justify-center hover:bg-red-50" title="Reset"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></button>

              <button onClick={() => setUiVisible(false)} className="w-12 h-12 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-gray-100" title="Hide UI"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg></button>

              <button onClick={() => setMode("girlfriend")} className={`w-12 h-12 rounded-full flex items-center justify-center ${mode === "girlfriend" ? "bg-pink-100 text-pink-500" : "bg-gray-50 text-gray-400"}`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.75 3c1.995 0 3.805 1.005 4.83 2.573C13.645 4.005 15.455 3 17.45 3 20.486 3 23 5.322 23 8.25c0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" /></svg></button>

              <button onClick={() => setZoom(!zoom)} className={`w-12 h-12 rounded-full flex items-center justify-center ${zoom ? "bg-pink-100 text-pink-500" : "bg-gray-50 text-gray-400"}`}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg></button>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <button onClick={() => setBgMode("default")} className="w-12 h-12 rounded-full border border-white/50 shadow-sm" style={{ background: "linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)" }} />
              <button onClick={() => setBgMode("green")} className="w-12 h-12 rounded-full transition-all duration-200 shadow-sm border border-white/50" style={{ backgroundColor: "#00FF00" }} title="Green Screen" />
              <button onClick={() => setBgMode("camera")} className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-white border border-gray-200"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg></button>
              <button onClick={() => fileInputRef.current.click()} className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-white border border-gray-200"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg></button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
            </div>
          </div>
        </div>
      </div>

      {/* MAIN WRAPPER (Flexbox Column for Mobile)
        - h-[100dvh]: This uses dynamic viewport height, which reacts to the mobile keyboard and address bar. 
        - flex flex-col: Stacks Header -> Chat -> Input vertically.
        - pointer-events-none: Allows clicking "through" the layout to spin the 3D model.
      */}

      <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between h-[100dvh]">

        {/* HEADER + HAMBURGER BUTTON (VISIBLE ON ALL SCREENS) */}
        <div className="flex-shrink-0 flex items-center gap-4 ml-1 md:ml-4 mt-2 pointer-events-auto animate-fade-in-down z-50 absolute left-4 md:left-4 top-2">

          {/* --- HAMBURGER MENU BUTTON --- */}
          {/* Removed md:hidden so it shows on Desktop too, as requested */}
          <button
            onClick={() => setMenuOpen(true)}
            className="bg-white/60 backdrop-blur-md p-3 rounded-2xl shadow-sm border border-white/50 hover:bg-white transition-all text-gray-700 h-[60px] w-[60px] flex items-center justify-center shrink-0"
            title="Open Menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Titre */}
          <div className="backdrop-blur-xl bg-white/60 px-6 rounded-2xl shadow-sm border border-white/50 flex flex-col justify-center h-[60px] min-w-[140px]">
            <h1 className="font-black text-xl text-gray-800 tracking-tight leading-none">Monika</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Online • v1.0</p>
            </div>
          </div>
        </div>

        {/* --- DESKTOP SIDEBAR (DOCK) - HIDDEN ON MOBILE --- */}
        <div className="hidden md:flex fixed left-7 top-1/2 -translate-y-1/2 z-50 pointer-events-auto animate-fade-in-left">
          <div className="bg-white/40 backdrop-blur-xl border border-white/40 shadow-2xl shadow-purple-500/10 rounded-full p-2 flex flex-col items-center gap-3">
            <button onClick={handleReset} className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white text-gray-600 transition-all duration-300 group relative" title="Reset Memory"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></button>
            <button onClick={() => setUiVisible(false)} className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-gray-800 hover:text-white text-gray-600 transition-all duration-300" title="Hide UI"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg></button>
            <div className="w-12 h-[2px] bg-gray-500/20 my-1"></div>
            <button onClick={() => setMode("girlfriend")} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${mode === "girlfriend" ? "bg-gradient-to-tr from-pink-500 to-rose-400 text-white shadow-pink-300" : "bg-white/50 text-gray-400 hover:bg-white"}`} title="Girlfriend"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.75 3c1.995 0 3.805 1.005 4.83 2.573C13.645 4.005 15.455 3 17.45 3 20.486 3 23 5.322 23 8.25c0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" /></svg></button>
            <button onClick={() => navigate("/trading")} className={`w-12 h-12 rounded-full shadow-xl transition-all duration-300 border border-white/50 flex items-center justify-center bg-gray-900 text-green-400 hover:bg-black hover:text-green-300 hover:scale-110 ring-2 ring-green-500/50`} title="Trading Terminal"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436h.003c-.384.25-.615.69-.615 1.164v2.7c0 .28.163.535.418.665l2.07 1.035a.75.75 0 0 1 .133 1.254l-4.5 2.25a.75.75 0 0 1-1.072-.983l1.373-3.66a.75.75 0 0 0-.272-.857l-1.92-1.37a.75.75 0 0 0-.857.27l-3.66 1.374a.75.75 0 0 1-.983-1.072l2.25-4.5a.75.75 0 0 1 1.254.133l1.035 2.07c.13.255.385.418.665.418h2.7c.474 0 .914-.23 1.164-.615V7.584Zm-2.33 3.43a2.25 2.25 0 1 0-3.182-3.182 2.25 2.25 0 0 0 3.182 3.182Z" clipRule="evenodd" /></svg></button>
            <div className="w-12 h-[2px] bg-gray-500/20 my-1"></div>
            <button onClick={() => setZoom(!zoom)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${zoom ? "bg-white text-pink-500 ring-2 ring-pink-500" : "bg-white/50 text-gray-600 hover:bg-white hover:text-pink-500"}`} title="Zoom"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg></button>
            <div className="flex flex-col gap-2 mt-1">
              <button onClick={() => setBgMode("default")} className={`w-12 h-12 rounded-full transition-all duration-300 shadow-sm border border-white/50 ${bgMode === "default" ? "ring-2 ring-pink-500 scale-100" : "opacity-70 hover:opacity-100 hover:scale-105"}`} style={{ background: "linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)" }} title="Default Background" />

              <button onClick={() => setBgMode("green")} className={`w-12 h-12 rounded-full transition-all duration-300 shadow-sm border border-white/50 ${bgMode === "green" ? "ring-2 ring-pink-500 scale-100" : "opacity-70 hover:opacity-100 hover:scale-105"}`} style={{ backgroundColor: "#00FF00" }} title="Green Screen" />

              <button onClick={() => setBgMode("camera")} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm border border-white/50 ${bgMode === "camera" ? "bg-white text-pink-500 ring-2 ring-pink-500" : "bg-white/50 text-gray-600 hover:bg-white hover:text-pink-500"}`} title="Webcam Background">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
              </button>

              <button onClick={() => fileInputRef.current.click()} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm border border-white/50 ${bgMode === "image" ? "bg-white text-pink-500 ring-2 ring-pink-500" : "bg-white/50 text-gray-600 hover:bg-white hover:text-pink-500"}`} title="Upload Image">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
              </button>

              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
            </div>
          </div>
        </div>

        {/* CHAT CONTAINER - Increased Padding Top (pt-28) to fix overlapping issues on all screens */}
        <div
          className="flex-1 absolute md:top-6 md:bottom-32 top-24 bottom-24 left-1 right-1 md:left-auto md:right-0 w-full md:w-1/3 max-w-md p-4 pt-28 flex flex-col gap-3 overflow-y-auto pointer-events-none no-scrollbar"
          ref={chatContainerRef}
          style={{ maskImage: 'linear-gradient(to bottom, transparent, black 5%, black 95%, transparent)' }}
        >

          {/* Spacer div to push messages to bottom on mobile when chat is empty/short */}
          <div className="flex-1 md:hidden"></div>
          {history.map((msg, index) => (
            <div
              key={index}
              className={`relative group p-4 rounded-2xl text-sm backdrop-blur-md shadow-sm border border-white/40 animate-fade-in-up pointer-events-auto ${msg.role === "user"
                ? "bg-gradient-to-br from-pink-500 to-rose-500 text-white self-end rounded-tr-sm ml-12 shadow-pink-200"
                : "bg-white/80 text-gray-800 self-start rounded-tl-sm mr-12"
                }`}
            >
              {msg.text}
              <button
                onClick={(e) => { e.stopPropagation(); deleteMessage(index); }}
                className="absolute -top-2 -right-2 bg-white text-red-500 border border-red-100 w-5 h-5 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm hover:scale-110 hover:bg-red-50 cursor-pointer z-50"
                title="Delete"
              >✕</button>
            </div>
          ))}
        </div>


        {/* --- ZONE DU BAS (INPUTS + ACTIONS RAPIDES) --- */}
        <div className="pointer-events-auto max-w-screen-md w-full mx-auto absolute bottom-4 left-1/2 -translate-x-1/2 px-4">

          <div className="flex items-end gap-2 w-full">

            {/* BOUTON MICRO (Gauche) */}
            <button
              onClick={() => alert("Voice mode is coming soon!")}
              className="bg-white/80 backdrop-blur-md hover:bg-white text-gray-500 hover:text-pink-500 p-4 rounded-2xl shadow-lg border border-white/50 transition-all active:scale-95 h-[60px] w-[60px] flex items-center justify-center shrink-0 group"
              title="Voice Chat (Beta)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 group-hover:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
            </button>

            {/* COLONNE CENTRALE */}
            <div className="flex-1 flex flex-col justify-end relative z-10">


              {/* INPUT TEXTE */}
              <input
                className="w-full h-[60px] placeholder:text-gray-400 text-gray-800 px-6 rounded-2xl bg-white/80 backdrop-blur-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-300/50 shadow-lg border border-white/50 transition-all"
                placeholder="Say something to Monika..."
                ref={input}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    sendMessage();
                  }
                }}
              />
            </div>

            {/* BOUTON SEND (Droite) */}
            <button
              disabled={loading}
              onClick={() => sendMessage()}
              className={`h-[60px] px-8 rounded-2xl shadow-lg font-bold text-white transition-all flex items-center justify-center shrink-0 ${loading ? "bg-pink-400 cursor-wait" : "bg-gradient-to-r from-pink-500 to-rose-500 hover:shadow-pink-500/30 hover:scale-105 active:scale-95"
                }`}
            >
              {loading ? (
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-75"></span>
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-150"></span>
                </span>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>
        </div>

      </div>
    </>
  );
};
