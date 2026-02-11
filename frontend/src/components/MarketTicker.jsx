import React, { useEffect, useState } from 'react';

const TF_MAP = {
    '1H': 'change1h', '4H': 'change4h', '1D': 'change1d', '1W': 'change1w', '1M': 'change1m'
};

export default function MarketTicker({ activeTimeframe = '1D', onSelectCoin }) {
    const [marketData, setMarketData] = useState({});

    // RESTORED INTERNAL FETCH: Fallback until Parent Data is robust
    useEffect(() => {
        const fetchMarket = async () => {
            try {
                const BACKEND_URL = import.meta.env.DEV
                    ? 'http://localhost:3000/api/market-status'
                    : 'https://monika-ai-mjox.vercel.app/api/market-status';
                const res = await fetch(BACKEND_URL);
                const data = await res.json();
                setMarketData(data);
            } catch (e) { console.error(e); }
        };
        fetchMarket();
        const interval = setInterval(fetchMarket, 2000);
        return () => clearInterval(interval);
    }, []);

    const getChange = (symbol) => {
        const data = marketData[symbol];
        if (!data) return 0;
        const key = TF_MAP[activeTimeframe] || 'change1d';
        return data[key] || 0;
    };

    const assets = ['MON-USD', 'BTC-USD', 'ETH-USD', 'CAKE-USD', 'XAUT-USD'];

    return (
        <div className="grid grid-cols-5 gap-4 mb-6">
            {assets.map((ticker) => {
                const data = marketData[ticker] || {}; // Fallback to empty object
                const price = data.price || 0;
                const change = getChange(ticker);
                const score = data.score || 50;
                const isPositive = parseFloat(change) >= 0;

                // --- RESTORED CALCS (KNN, RSI, FILTER) ---
                const details = data?.details || {};
                const h1 = details.h1 || 50;
                const h4 = details.h4 || 50;
                const d1 = details.d1 || 50;
                const knnAvg = ((h1 + h4 + d1) / 3).toFixed(0);
                const rsiVal = details.rsi ? details.rsi.toFixed(0) : 50;
                const isFiltered = details.filter === true;

                // --- COLOR LOGIC (Matching Global Sentiment) ---
                let signal = "NEUTRAL";
                let signalColor = "text-[#5F6FFF]"; // Monad Blue

                if (score >= 55) {
                    signal = "BUY";
                    signalColor = "text-green-400";
                } else if (score < 40) {
                    signal = "SELL";
                    signalColor = "text-red-400";
                } else if (score < 48) {
                    signal = "WEAK";
                    signalColor = "text-orange-400";
                }
                // 48-54 stays NEUTRAL (Blue)

                return (
                    <div
                        key={ticker}
                        onClick={() => onSelectCoin && onSelectCoin(ticker)}
                        // ULTRA Z-INDEX FIX: Exact same classes as your original file
                        className={`group relative p-4 rounded-xl border ${isPositive ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'} flex flex-col items-center justify-center transition-all hover:scale-105 hover:z-[999] cursor-pointer`}
                    >
                        {/* TECH TOOLTIP (Exact Original UI) */}
                        <div className="absolute opacity-0 group-hover:opacity-100 top-full mt-1 bg-[#0b0f19] border border-blue-500/30 text-white text-[9px] px-2 py-1 rounded-sm shadow-[0_0_50px_rgba(0,0,0,1)] pointer-events-none transition-opacity whitespace-nowrap flex flex-col gap-0.5 items-center backdrop-blur-md z-[999]">

                            <div className="flex items-center gap-3 font-mono">
                                <div><span className="text-blue-400 font-bold">KNN:</span> {knnAvg}%</div>
                                <div className="w-px h-3 bg-gray-700"></div>
                                <div><span className="text-purple-400 font-bold">RSI:</span> {rsiVal}</div>
                            </div>

                            {isFiltered && (
                                <div className="mt-1 w-full flex justify-center">
                                    <span className="bg-orange-500/10 border border-orange-500/50 text-orange-400 text-[9px] px-2 py-0.5 rounded uppercase tracking-wider font-bold">
                                        TREND FILTER ACTIVE
                                    </span>
                                </div>
                            )}

                            {/* CSS Arrow */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-blue-500/30"></div>
                        </div>

                        <div className="flex justify-between w-full mb-1">
                            <div className="text-xs font-bold text-gray-400">{ticker.replace('-USD', '')}</div>
                            <div className={`text-[9px] font-bold px-1.5 rounded ${isPositive ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                                {activeTimeframe}: {isPositive ? '+' : ''}{change.toFixed(2)}%
                            </div>
                        </div>
                        <div className="text-xl font-mono font-bold text-white w-full text-left">
                            ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </div>
                        <div className="w-full text-left mt-1 flex justify-between items-center">
                            <span className={`text-[10px] font-black tracking-widest ${signalColor}`}>{signal}</span>
                            <span className="text-[9px] text-gray-600 font-mono">AI: {score.toFixed(0)}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
