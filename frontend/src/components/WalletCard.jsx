import React, { useState } from 'react';

const WalletCard = ({ balance, nativeBalance, usdcBalance, isLocked, onLock, onUnlock, marketStats, address }) => {
    const [copied, setCopied] = useState(false);

    // 1. CALCULATE LIVE ASSETS & PNL
    let totalPositionValue = 0;
    let totalOpenPnL = 0;

    if (balance && balance.positions) {
        balance.positions.forEach(pos => {
            const size = parseFloat(pos.size) || 0;
            const entry = parseFloat(pos.entry) || 0;

            // Get live price from marketStats, fallback to entry if loading
            const currentPrice = marketStats && marketStats[pos.symbol]?.price
                ? parseFloat(marketStats[pos.symbol].price)
                : entry;

            const posValue = size * currentPrice;
            const posCost = size * entry;

            totalPositionValue += posValue;
            totalOpenPnL += (posValue - posCost);
        });
    }

    const totalAssets = (parseFloat(usdcBalance) || 0) + totalPositionValue;
    const pnlColor = totalOpenPnL >= 0 ? "text-emerald-400" : "text-rose-400";
    const pnlSign = totalOpenPnL >= 0 ? "+" : "";

    // 2. ADDRESS FORMATTING (Force Lowercase)
    const rawAddress = address || "";
    // Force lowercase display
    const displayAddress = rawAddress.toLowerCase();
    const shortAddr = displayAddress
        ? `${displayAddress.substring(0, 6)}...${displayAddress.substring(displayAddress.length - 4)}`
        : "0x...";

    const handleCopy = () => {
        if (!displayAddress) return;
        navigator.clipboard.writeText(displayAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Safe Number Display
    const safeUsdc = usdcBalance ? parseFloat(usdcBalance) : 0;
    const safeMon = nativeBalance ? parseFloat(nativeBalance) : 0;

    return (
        <div className="relative bg-gradient-to-br from-[#0b0f19] via-[#101423] to-[#0b0f19] border border-white/10 rounded-xl p-3 shadow-lg overflow-hidden group shrink-0">

            {/* Background Glows */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-700"></div>
            <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all duration-700"></div>

            {/* HEADER: LOCK BUTTON & ADDRESS + COPY */}
            <div className="flex justify-between items-center mb-2 relative z-10 border-b border-white/5 pb-2">

                {/* LOCK/UNLOCK BUTTON */}
                <button
                    onClick={isLocked ? onUnlock : onLock}
                    className="flex items-center gap-2 group/lock transition-all cursor-pointer hover:scale-105"
                    title={isLocked ? "Click to Unlock Wallet" : "Click to Lock Wallet"}
                >
                    <div className={`p-1 rounded-md border flex items-center gap-1.5 ${isLocked ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 group-hover/lock:bg-emerald-500/20'} transition-all`}>
                        {isLocked ? (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                        )}
                    </div>
                </button>

                {/* COPYABLE ADDRESS */}
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors group/btn"
                    title="Copy Address"
                >
                    <span className="text-[10px] text-gray-500 font-mono group-hover/btn:text-gray-300 transition-colors tracking-wide">
                        {copied ? "COPIED!" : shortAddr}
                    </span>
                    {!copied && (
                        <svg className="w-3 h-3 text-gray-600 group-hover/btn:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* DUAL CORE DISPLAY (USDC + MON) */}
            <div className="grid grid-cols-2 gap-3 relative z-10 mb-2">
                {/* LEFT: USDC CAPITAL */}
                <div className="bg-[#0b0f19]/50 rounded-lg p-2 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)] group hover:border-emerald-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1 opacity-80">
                        {/* SVG DOLLAR */}
                        <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider">Capital</span>
                    </div>
                    <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-emerald-200 font-sans tracking-tight">
                        {safeUsdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[8px] text-gray-600 block font-mono">USDC</span>
                </div>

                {/* RIGHT: MON GAS */}
                <div className="bg-[#0b0f19]/50 rounded-lg p-2 border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.05)] group hover:border-purple-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1 opacity-80">
                        {/* SVG LIGHTNING */}
                        <svg className="w-3 h-3 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider">Fuel</span>
                    </div>
                    <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-purple-200 font-sans tracking-tight">
                        {safeMon.toFixed(3)}
                    </span>
                    <span className="text-[8px] text-gray-600 block font-mono">MON</span>
                </div>
            </div>

            {/* STATS GRID */}
            <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-2 z-10">
                <div className="flex flex-col">
                    <span className="text-[8px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">Open PnL</span>
                    {balance?.positions?.length > 0 ? (
                        <span className={`text-sm font-bold font-mono ${pnlColor}`}>
                            {pnlSign}${totalOpenPnL.toFixed(3)}
                        </span>
                    ) : (
                        <span className="text-sm font-bold font-mono text-transparent select-none">-</span>
                    )}
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-[8px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">Net Assets</span>
                    <span className="text-sm font-bold text-gray-300 font-mono">
                        ${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default WalletCard;
