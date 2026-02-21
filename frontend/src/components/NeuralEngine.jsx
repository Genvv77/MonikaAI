import React, { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.DEV
    ? "http://localhost:3000/api/market-status"
    : "https://monikaai-production.up.railway.app/api/market-status";

export default function NeuralEngine({ selectedSymbol }) {
    const [marketData, setMarketData] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch(BACKEND_URL);
                const json = await res.json();
                const dataObject = Array.isArray(json)
                    ? json.reduce((acc, item) => ({ ...acc, [item.symbol]: item }), {})
                    : json;
                setMarketData(dataObject);
                setLoading(false);
            } catch (e) {
                console.error("NeuralEngine fetch error:", e);
                setLoading(false); // Fix for infinite "Syncing..." hang
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000); // Reduced polling stress
        return () => clearInterval(interval);
    }, []);

    const activeSymbol = selectedSymbol || 'BTC-USD';
    let coinData = marketData[activeSymbol] || marketData[`${activeSymbol}-USD`];
    if (!coinData && marketData) {
        const fuzzyKey = Object.keys(marketData).find(k => k.startsWith(activeSymbol.split('-')[0]));
        if (fuzzyKey) coinData = marketData[fuzzyKey];
    }

    const details = coinData?.details || { h1: 50, h4: 50, d1: 50, trend: 'neutral', macro: 'NEUTRAL' };
    const displayName = (coinData?.symbol || activeSymbol).replace('-USD', '').replace('USD', '');
    const finalScore = coinData?.score || 50;
    const isUptrend = details.trend === 'bullish';
    const isGoldenCross = details.macro === 'GOLDEN_CROSS';

    // --- UNIFIED COLOR LOGIC ---
    let sentimentText = "NEUTRAL";
    let sentimentColor = "text-[#5F6FFF]";
    let glowColor = "bg-[#5F6FFF]";
    let borderColor = "border-white/10";

    if (finalScore >= 55) {
        sentimentText = "BULLISH";
        sentimentColor = "text-green-400";
        glowColor = "bg-green-500";
    } else if (finalScore < 40) {
        sentimentText = "BEARISH";
        sentimentColor = "text-red-500";
        glowColor = "bg-red-500";
    } else if (finalScore < 48) {
        sentimentText = "WEAK";
        sentimentColor = "text-orange-400";
        glowColor = "bg-orange-500";
    }

    if (isGoldenCross) {
        borderColor = "border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]";
    }

    return (
        <div className={`bg-[#0b0f19] border ${borderColor} rounded-xl p-5 flex flex-col items-center justify-center min-h-[190px] relative overflow-hidden group transition-all duration-500`}>
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 opacity-10 blur-[60px] ${glowColor} transition-colors duration-1000`}></div>
            <div className="z-10 w-full flex flex-col items-center gap-4">
                <div className="w-full flex flex-col items-center border-b border-white/5 pb-2 gap-1">
                    <div className="flex justify-between items-center w-full">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                            MARKET_STRUCTURE <span className="text-gray-700">|</span> <span className="text-white">{displayName}</span>
                        </span>
                        {isGoldenCross && (
                            <span className="text-[8px] font-black text-yellow-400 bg-yellow-400/10 border border-yellow-500/30 px-1.5 py-0.5 rounded animate-pulse">
                                GIGA BULLISH
                            </span>
                        )}
                    </div>
                    <div className="w-full flex justify-between items-center mt-1">
                        <span className="text-[9px] font-mono text-gray-600 uppercase">Trend (SMA50)</span>
                        <span className={`text-[9px] font-bold font-mono uppercase px-1.5 py-0.5 rounded ${isUptrend ? 'bg-green-900/20 text-green-400 border border-green-500/20' : 'bg-red-900/20 text-red-400 border border-red-500/20'}`}>
                            {isUptrend ? "SAFE" : "RISKY"}
                        </span>
                    </div>
                </div>

                {/* Visualizer reused with unified colors logic inside if needed */}
                <div className="flex items-end justify-center gap-6 h-20 w-full px-2 mt-2">
                    <EnergyBar label="H1" value={details.h1} />
                    <EnergyBar label="H4" value={details.h4} />
                    <EnergyBar label="D1" value={details.d1} />
                </div>

                <div className={`text-lg font-black tracking-[0.2em] uppercase ${sentimentColor} drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] transition-colors duration-500`}>
                    {loading ? "SYNCING..." : sentimentText}
                </div>
            </div>
        </div>
    );
}

const EnergyBar = ({ label, value }) => {
    // Standardized Energy Bar Colors
    let activeColor = "bg-[#5F6FFF] shadow-[0_0_8px_rgba(95,111,255,0.6)]"; // Default Blue
    if (value >= 55) activeColor = "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]";
    if (value < 40) activeColor = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]";
    if (value >= 40 && value < 48) activeColor = "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]";

    const segments = Array.from({ length: 10 }).map((_, i) => {
        const threshold = (i + 1) * 10;
        const isActive = value >= threshold;
        return <div key={i} className={`w-full h-1 rounded-[1px] mb-[2px] transition-all duration-300 ${isActive ? activeColor : 'bg-gray-800/50'}`}></div>;
    });

    return (
        <div className="flex flex-col items-center gap-2 w-8">
            <div className="flex flex-col-reverse w-full h-16">{segments}</div>
            <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-gray-500 font-mono">{label}</span>
                <span className="text-[8px] font-mono text-gray-400">{value.toFixed(0)}%</span>
            </div>
        </div>
    );
};
