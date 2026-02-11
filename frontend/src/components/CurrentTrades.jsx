import React, { useEffect, useState } from 'react';

// NOTE: Ensure this matches your backend URL
const PORTFOLIO_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000/api/portfolio"
    : "https://monika-ai-mjox.vercel.app/api/portfolio";

export default function CurrentTrades() {
    const [portfolio, setPortfolio] = useState({ balance: 1.46, active: [], history: [] });

    useEffect(() => {
        const fetchPortfolio = async () => {
            try {
                const res = await fetch(PORTFOLIO_URL);
                const json = await res.json();
                setPortfolio(json);
            } catch (e) { console.error("Portfolio offline"); }
        };
        fetchPortfolio();
        const interval = setInterval(fetchPortfolio, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col h-full p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                    Active Positions
                </h2>
                <span className="text-[10px] text-gray-500 font-mono">PAPER</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {portfolio.active.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 opacity-30">
                        <div className="w-8 h-8 border-2 border-dashed border-gray-400 rounded-full animate-spin-slow mb-2"></div>
                        <span className="text-[10px] text-gray-400">SCANNING MARKETS...</span>
                    </div>
                ) : (
                    portfolio.active.map((trade, i) => (
                        <div key={i} className="bg-gradient-to-r from-gray-800/40 to-gray-900/40 border-l-2 border-green-500 rounded p-3 flex justify-between items-center hover:bg-white/5 transition-all">
                            <div>
                                <div className="font-bold text-white text-sm tracking-tight">{(trade.symbol || "UNK").replace('-USD', '')}</div>
                                <div className="text-[9px] text-gray-400 font-mono mt-0.5">
                                    ENTRY: <span className="text-gray-300">${trade.entryPrice.toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`font-mono font-bold text-sm ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {trade.pnl >= 0 ? '+' : ''}{(trade.pnl || 0).toFixed(4)}
                                </div>
                                <div className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">LONG</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-end">
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">AVAILABLE CASH</span>
                    <span className="font-mono text-xl text-white font-bold tracking-tight">${portfolio.balance.toFixed(4)}</span>
                </div>
                {/* Optional: Show Total Asset Value if you want */}
            </div>
        </div>
    );
}
