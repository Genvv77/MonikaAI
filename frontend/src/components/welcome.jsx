import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient"; // Make sure to import this!

export const Welcome = ({ onStart }) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState(""); 
  const [entered, setEntered] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 1. CHECK LOCAL STORAGE
    // If they verified before, skip the DB check entirely.
    const hasAccess = localStorage.getItem("monika_access_granted");
    if (hasAccess) {
        onStart(); 
    }
  }, [onStart]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const cleanCode = code.toUpperCase().trim();

    try {
        // --- STEP 1: CHECK THE CODE IN DB ---
        const { data: codeData, error: fetchError } = await supabase
            .from('access_codes')
            .select('*')
            .eq('code', cleanCode)
            .single();

        // 1. Database Error or Code Not Found
        if (fetchError || !codeData) {
            setError("ACCESS_DENIED: INVALID_KEY");
            setLoading(false);
            return;
        }

        // 2. Check if Expired (Global Limit)
        if (codeData.used_count >= codeData.max_uses) {
            setError("ACCESS_DENIED: KEY_EXPIRED (GLOBAL LIMIT REACHED)");
            setLoading(false);
            return;
        }

        // --- STEP 2: INCREMENT THE COUNTER ---
        const { error: updateError } = await supabase
            .from('access_codes')
            .update({ used_count: codeData.used_count + 1 })
            .eq('id', codeData.id);

        if (updateError) {
            setError("SYSTEM_ERROR: UNABLE_TO_VERIFY");
            setLoading(false);
            return;
        }

        // --- STEP 3: SUCCESS ---
        setEntered(true);
        localStorage.setItem("monika_access_granted", "true");

        setTimeout(() => {
            onStart();
        }, 1000);

    } catch (err) {
        console.error(err);
        setError("CONNECTION_FAILED");
        setLoading(false);
    }
  };

  // If logged in, hide component
  if (!entered && localStorage.getItem("monika_access_granted")) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-1000 ${entered ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
      
      {/* --- BACKGROUND --- */}
      <div className="absolute inset-0 z-[-2] overflow-hidden bg-black">
        <video 
            autoPlay 
            loop 
            muted 
            playsInline 
            className="w-full h-full object-cover opacity-60 filter blur-[3px] contrast-125"
        >
            <source src="/matrix_bg.mp4" type="video/MP4" />
        </video>
      </div>
      <div className="absolute inset-0 z-[-1] bg-gradient-to-b from-black/80 via-black/40 to-black/80"></div>

      {/* --- LOGIN BOX --- */}
      <div className="bg-black/40 backdrop-blur-xl p-6 md:p-10 rounded-3xl shadow-2xl w-[90%] max-w-md text-center border border-green-500/30 shadow-green-900/20 relative overflow-hidden ring-1 ring-white/10">
        
        {/* Animated Scan Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-green-500/50 shadow-[0_0_15px_rgba(74,222,128,0.5)] animate-scan-line opacity-30"></div>

        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 mb-2 tracking-tighter drop-shadow-sm">
            SYSTEM_INIT
        </h1>
        <p className="text-green-400/70 mb-8 font-mono text-[10px] md:text-xs tracking-[0.2em] uppercase">
            // Enter Limited Access Key
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="relative group">
            <input
              type="text"
              placeholder="ACCESS_CODE"
              value={code}
              onChange={(e) => {
                  setCode(e.target.value);
                  if(error) setError(""); 
              }}
              disabled={loading || entered}
              className={`w-full p-4 rounded-xl bg-black/60 border-2 outline-none transition-all text-center font-bold text-lg md:text-xl text-green-400 placeholder:text-green-900/50 font-mono tracking-widest uppercase
                ${error 
                  ? "border-red-500/80 animate-shake shadow-[0_0_20px_rgba(239,68,68,0.3)] text-red-400" 
                  : "border-green-500/30 focus:border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.1)] focus:shadow-[0_0_25px_rgba(74,222,128,0.3)]"
                }`}
            />
            {/* Error Message */}
            {error && (
                <p className="absolute -bottom-6 left-0 right-0 text-center text-[10px] font-bold text-red-500 tracking-widest uppercase animate-pulse">
                    [{error}]
                </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || entered}
            className={`w-full font-black py-4 rounded-xl shadow-lg transition-all tracking-widest uppercase border border-green-400/20 text-sm md:text-base
                ${loading 
                    ? "bg-green-900/20 text-green-500/50 cursor-wait" 
                    : "bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 text-black active:scale-95 hover:shadow-green-500/20"
                }`}
          >
            {loading ? "VERIFYING..." : "UNLOCK_PROTOCOL"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center">
            <p className="text-[9px] text-green-500/30 font-mono">
                SECURE CONNECTION v2.5
            </p>
            <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-pulse"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/30 animate-pulse delay-75"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/10 animate-pulse delay-150"></span>
            </div>
        </div>
      </div>
    </div>
  );
};