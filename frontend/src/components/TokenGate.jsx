import React, { useState } from 'react';

const TokenGate = ({ children }) => {
  const [hasAccess, setHasAccess] = useState(false);
  const [entered, setEntered] = useState(false);

  const handleEnter = () => {
    setEntered(true);
    setTimeout(() => setHasAccess(true), 600);
  };

  // Success State -> Render Children
  if (hasAccess) {
    return React.cloneElement(children, {});
  }

  // Gate UI
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center h-screen bg-black text-white font-mono gap-6 overflow-hidden z-[100]">

      <div className={`z-10 bg-[#0D1117] border border-gray-800 p-8 rounded-2xl flex flex-col items-center gap-4 shadow-2xl max-w-md w-full transition-opacity duration-600 ${entered ? "opacity-0" : "opacity-100"}`}>
        <h1 className="text-2xl font-black text-green-500 tracking-tighter uppercase italic">TERMINAL ACCESS</h1>
        <p className="text-sm text-gray-500 text-center">
          Welcome to Monika Trading Terminal.
        </p>

        <button
          onClick={handleEnter}
          disabled={entered}
          className="w-full py-3 bg-green-600 hover:bg-green-500 text-black font-bold rounded uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {entered ? "Entering..." : "Enter"}
        </button>
      </div>

      {/* Background FX */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
    </div>
  );
};

export default TokenGate;