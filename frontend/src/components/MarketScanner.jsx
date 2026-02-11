import React, { useEffect, useState } from 'react';

const BACKEND_URL = import.meta.env.DEV
    ? "http://localhost:3000/api/market-status"
    : "https://monika-ai-mjox.vercel.app/api/market-status";

export default function MarketScanner({ onSelectCoin }) {
    const [data, setData] = useState({});

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch(BACKEND_URL);
                const json = await res.json();
                const dataObject = Array.isArray(json)
                    ? json.reduce((acc, item) => ({ ...acc, [item.symbol]: item }), {})
                    : json;
                setData(dataObject);
            } catch (e) { }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-[#0b0f19] border border-white/10 rounded-xl p-3 flex flex-col h-full overflow-hidden min-h-[150px]">
            <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-1 shrink-0">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                    Global Sentiment
                </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1 flex-1 [&::-webkit-scrollbar]:hidden">
                {Object.entries(data).map(([symbol, info]) => {
                    const score = Math.round(info.score || 50);

                    // --- UNIFIED COLOR LOGIC ---
                    let barColor = "bg-[#5F6FFF]"; // Blue (Neutral 48-54)
                    if (score >= 55) barColor = "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]";
                    if (score < 40) barColor = "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]";
                    if (score >= 40 && score < 48) barColor = "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]";

                    const displayName = symbol.replace('USDT', '').replace('-USD', '');

                    return (
                        <div key={symbol}
                            onClick={() => onSelectCoin(symbol)}
                            className="bg-[#0f1422] border border-white/5 hover:border-blue-500/50 rounded p-2 flex flex-col items-center gap-2 cursor-pointer transition-all h-24 justify-end relative overflow-hidden group"
                        >
                            <span className="absolute top-1 right-1 text-[8px] font-mono text-gray-500 group-hover:text-white">
                                {score}
                            </span>
                            <div className="w-4 h-full bg-gray-800/30 rounded-sm relative overflow-hidden flex items-end translate-y-2 group-hover:translate-y-0 transition-transform">
                                <div className={`w-full ${barColor} transition-all duration-700 ease-out`} style={{ height: `${score}%` }} />
                            </div>
                            <span className="text-[9px] font-bold text-gray-400 group-hover:text-white font-mono truncate w-full text-center z-10 transition-colors">
                                {displayName}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
