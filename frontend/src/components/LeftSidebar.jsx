import React, { useEffect, useState } from 'react';

// AUTO-DETECT BACKEND URL
const BACKEND_URL = import.meta.env.DEV
    ? "http://localhost:3000/api/market-status"
    : "https://monika-ai-mjox.vercel.app/api/market-status";

export default function LeftSidebar({ selectedCoin }) {
    const [marketData, setMarketData] = useState({});

    // Fetch Data
    useEffect(() => {
        const fetchMarket = async () => {
            try {
                const res = await fetch(BACKEND_URL);
                const json = await res.json();

                // Ensure data is an object map
                const dataObject = Array.isArray(json)
                    ? json.reduce((acc, item) => ({ ...acc, [item.symbol]: item }), {})
                    : json;

                setMarketData(dataObject);
            } catch (e) { console.error("Sidebar Fetch Error:", e); }
        };
        fetchMarket();
        const interval = setInterval(fetchMarket, 2000); // Sync fast (2s)
        return () => clearInterval(interval);
    }, []);

    // 🕵️♂️ ROBUST LOOKUP STRATEGY (The Fix)
    // We try multiple variations to find the coin data
    const findCoinData = (symbol) => {
        if (!symbol) return null;
        if (marketData[symbol]) return marketData[symbol];
        if (marketData[`${symbol}-USD`]) return marketData[`${symbol}-USD`];

        // Brute force: find any key that starts with the symbol
        const foundKey = Object.keys(marketData).find(k => k.startsWith(symbol) || symbol.startsWith(k));
        if (foundKey) return marketData[foundKey];

        return null;
    };

    // Default to BTC if nothing selected
    const targetSymbol = selectedCoin || 'BTC';
    const coinData = findCoinData(targetSymbol) || {};
    const details = coinData.details || { h1: 50, h4: 50, d1: 50 };

    // Safety check for display name
    const rawSymbol = coinData.symbol || targetSymbol;
    const displayName = rawSymbol.replace('-USD', '').replace('USD', '');

    // Calculate Scores
    const avgScore = (details.h1 + details.h4 + details.d1) / 3;

    // Harmonized Sentiment Text
    let sentimentText = "NEUTRAL";
    let sentimentColor = "text-blue-500";

    if (avgScore >= 55) {
        sentimentText = "BULLISH";
        sentimentColor = "text-green-500";
    } else if (avgScore <= 45) {
        sentimentText = "BEARISH";
        sentimentColor = "text-red-500";
    }

    return (
        <div className="bg-[#0b0f19] border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center min-h-[200px] relative overflow-hidden transition-all duration-500">
            {/* Background Glow based on Sentiment */}
            <div className={`absolute inset-0 opacity-10 blur-3xl transition-colors duration-1000 ${sentimentColor.replace('text-', 'bg-')}`}></div>

            <div className="z-10 w-full flex flex-col items-center gap-6">

                {/* TITLE */}
                <div className="w-full flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        AI PATTERNS • <span className="text-white">{displayName}</span>
                    </span>

                    {/* Live Pulse Indicator */}
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-75"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse delay-150"></div>
                    </div>
                </div>

                {/* VISUALIZER DOTS */}
                <div className="flex items-end gap-6 h-24">
                    {/* H1 Bar */}
                    <div className="flex flex-col items-center gap-2 group">
                        <div className={`w-2 h-2 rounded-full mb-1 transition-colors ${details.h1 >= 55 ? 'bg-green-500' : details.h1 <= 45 ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                        <div className="w-2 h-16 bg-gray-800/50 rounded-full relative overflow-hidden">
                            <div
                                className={`absolute bottom-0 w-full transition-all duration-1000 ease-out ${details.h1 >= 55 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : details.h1 <= 45 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-blue-500'}`}
                                style={{ height: `${details.h1}%` }}
                            ></div>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">H1</span>
                    </div>

                    {/* H4 Bar */}
                    <div className="flex flex-col items-center gap-2 group">
                        <div className={`w-2 h-2 rounded-full mb-1 transition-colors ${details.h4 >= 55 ? 'bg-green-500' : details.h4 <= 45 ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                        <div className="w-2 h-16 bg-gray-800/50 rounded-full relative overflow-hidden">
                            <div
                                className={`absolute bottom-0 w-full transition-all duration-1000 ease-out ${details.h4 >= 55 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : details.h4 <= 45 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-blue-500'}`}
                                style={{ height: `${details.h4}%` }}
                            ></div>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">H4</span>
                    </div>

                    {/* D1 Bar */}
                    <div className="flex flex-col items-center gap-2 group">
                        <div className={`w-2 h-2 rounded-full mb-1 transition-colors ${details.d1 >= 55 ? 'bg-green-500' : details.d1 <= 45 ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                        <div className="w-2 h-16 bg-gray-800/50 rounded-full relative overflow-hidden">
                            <div
                                className={`absolute bottom-0 w-full transition-all duration-1000 ease-out ${details.d1 >= 55 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : details.d1 <= 45 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-blue-500'}`}
                                style={{ height: `${details.d1}%` }}
                            ></div>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">D1</span>
                    </div>
                </div>

                {/* MAIN SENTIMENT TEXT */}
                <div className={`text-xl font-black tracking-widest ${sentimentColor} drop-shadow-[0_0_15px_rgba(0,0,0,0.8)] transition-colors duration-500`}>
                    {sentimentText}
                </div>
            </div>
        </div>
    );
}
