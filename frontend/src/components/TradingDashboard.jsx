import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import CustomChart from './CustomChart';
import MarketTicker from './MarketTicker';
import CurrentTrades from './CurrentTrades';

import DetailedPositionsTable from './DetailedPositionsTable';
import { useMarketEngine } from '../hooks/useMarketEngine';
import { WalletSetupModal, UnlockModal, DisclaimerModal } from './WalletModals';
import { SettingsModal } from './SettingsModal';
import MarketScanner from './MarketScanner';
import WalletCard from './WalletCard';
import NeuralEngine from './NeuralEngine';
import GrokChat from './GrokChat';
import TutorialOverlay from './TutorialOverlay';

const TradeHistoryTable = ({ trades }) => {
    const handleShare = async (trade) => {
        const isProfit = trade.pnl >= 0;
        const color = isProfit ? '#22c55e' : '#ef4444';

        // Preload image to ensure html2canvas captures it
        await new Promise((resolve) => {
            const img = new Image();
            img.src = '/monika_bg2.png';
            img.onload = resolve;
            img.onerror = resolve;
        });

        // Create a stylized offscreen div
        const shareCard = document.createElement('div');
        shareCard.style.position = 'absolute';
        shareCard.style.left = '-9999px';
        shareCard.style.top = '-9999px';
        shareCard.style.width = '800px';
        shareCard.style.height = '800px';
        shareCard.style.backgroundImage = `linear-gradient(to top, rgba(10,14,20,1) 0%, rgba(10,14,20,0.9) 40%, rgba(10,14,20,0.3) 100%), url(/monika_bg2.png)`;
        shareCard.style.backgroundSize = 'cover';
        shareCard.style.backgroundPosition = 'center';
        shareCard.style.color = '#ffffff';
        shareCard.style.fontFamily = 'Inter, system-ui, sans-serif';
        shareCard.style.display = 'flex';
        shareCard.style.flexDirection = 'column';
        shareCard.style.justifyContent = 'flex-end';
        shareCard.style.padding = '60px';
        shareCard.style.boxSizing = 'border-box';
        shareCard.style.overflow = 'hidden';

        const dateStr = new Date(trade.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = new Date(trade.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        shareCard.innerHTML = `
            <div style="position: absolute; top: 50px; left: 50px; display: flex; align-items: center; gap: 15px;">
                <div style="font-size: 22px; font-weight: 800; letter-spacing: 4px; color: #ffffff;">MONIKA AI</div>
            </div>
            
            <div style="position: absolute; top: 50px; right: 50px; text-align: right; opacity: 0.8;">
                <div style="font-size: 14px; letter-spacing: 2px; color: #9ca3af; margin-bottom: 4px; font-weight: bold; text-transform: uppercase;">monika-ai.xyz/trading</div>
                <div style="font-size: 14px; color: #d1d5db; font-family: monospace;">${dateStr} ${timeStr}</div>
            </div>
            
            <div style="z-index: 10; width: 100%;">
                <div style="font-size: 42px; font-weight: 300; color: #e5e7eb; letter-spacing: 2px; margin-bottom: -5px;">
                    ${trade.symbol.replace('-USD', '')} <span style="color: #6b7280; font-weight: 200;">/ USD</span>
                </div>
                <div style="font-size: 130px; font-weight: 900; color: ${color}; text-shadow: 0 0 60px ${color}40, 2px 2px 0px rgba(0,0,0,0.5); margin-bottom: 40px; line-height: 1; letter-spacing: -2px;">
                    ${isProfit ? '+' : ''}$${Math.abs(trade.pnl).toFixed(2)}
                </div>
                
                <div style="display: flex; gap: 60px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 40px;">
                    <div style="flex: 1;">
                        <div style="color: #9ca3af; font-size: 14px; letter-spacing: 2px; margin-bottom: 8px; text-transform: uppercase; font-weight: bold;">Avg. Entry Price</div>
                        <div style="font-size: 36px; font-weight: 600; font-family: monospace; color: #f3f4f6;">$${trade.entry.toFixed(4)}</div>
                    </div>
                    <div style="flex: 1;">
                        <div style="color: #9ca3af; font-size: 14px; letter-spacing: 2px; margin-bottom: 8px; text-transform: uppercase; font-weight: bold;">Avg. Exit Price</div>
                        <div style="font-size: 36px; font-weight: 600; font-family: monospace; color: #f3f4f6;">$${trade.exit.toFixed(4)}</div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(shareCard);

        try {
            const canvas = await html2canvas(shareCard, { backgroundColor: '#0a0e14', scale: 2, useCORS: true, allowTaint: true });
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `Monika_Trade_${trade.symbol}.png`;
            link.href = url;
            link.click();
        } catch (e) {
            console.error("Failed to capture share card", e);
        } finally {
            document.body.removeChild(shareCard);
        }
    };

    return (
        <div className="bg-[#0b0f19] flex flex-col flex-1 border border-gray-800 rounded-xl overflow-hidden min-h-0 shadow-lg">
            <h2 className="bg-[#0A0E14] text-[10px] font-bold text-gray-500 uppercase tracking-widest p-3 border-b border-gray-800">
                Trade_History
            </h2>
            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs text-gray-400 bg-[#0b0f19]">
                    <thead className="bg-[#0D1117] sticky top-0 z-10 text-[9px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                        <tr>
                            <th className="p-3 font-semibold">Asset</th>
                            <th className="p-3 font-semibold">Entry / Exit</th>
                            <th className="p-3 font-semibold text-right">Net PNL</th>
                            <th className="p-3 font-semibold text-center">Share</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {(!trades || trades.length === 0) ? (
                            <tr><td colSpan="4" className="p-8 text-center text-gray-600 font-mono text-xs">No closed trades yet.</td></tr>
                        ) : trades.map((t, idx) => {
                            const isProfit = t.pnl >= 0;
                            return (
                                <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-3">
                                        <div className="font-bold text-gray-200">{t.symbol.replace('-USD', '')}</div>
                                        <div className="text-[10px] text-gray-600 font-mono">
                                            {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </td>
                                    <td className="p-3 font-mono text-gray-300">
                                        <div className="text-gray-500 text-[10px]">In: <span className="text-gray-300">${t.entry.toFixed(4)}</span></div>
                                        <div className="text-gray-500 text-[10px]">Out: <span className="text-gray-300">${t.exit.toFixed(4)}</span></div>
                                    </td>
                                    <td className={`p-3 font-mono text-right font-bold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                                        {isProfit ? '+' : ''}${(t.pnl).toFixed(2)}
                                    </td>
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => handleShare(t)}
                                            className="opacity-50 group-hover:opacity-100 hover:text-blue-400 text-gray-500 transition-all p-1"
                                            title="Share Trade as Image"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const TradingDashboard = ({ userAddress, handleConnect, handleDisconnect }) => {
    const {
        prices, rsiValues, candles, nativeBalance, usdcBalance, rawBalances, wallet, logs, neuralAnalysis,
        executeTrade, createWallet, unlockWallet, lockWallet, exportPrivateKey,
        walletExists, walletLocked, walletAddress, timeframe, changeTimeframe,
        marketStats, changes24h, smaValues, toasts, removeToast, getTradePlan
    } = useMarketEngine(1000);

    const [selectedSymbol, setSelectedSymbol] = useState('BTC-USD');
    const [botActive, setBotActive] = useState(false);
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const [showSetup, setShowSetup] = useState(false);
    const [showUnlock, setShowUnlock] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showWalletDropdown, setShowWalletDropdown] = useState(false);
    const walletDropdownRef = useRef(null);

    // --- CLICK OUTSIDE TO CLOSE WALLET ---
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (walletDropdownRef.current && !walletDropdownRef.current.contains(event.target)) {
                setShowWalletDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const isLockedView = showDisclaimer || showSetup || showUnlock;

    // --- AUTOPILOT STATE ---
    const lastTradeTime = useRef(0);
    const isTrading = useRef(false); // LOCK: Prevent Double-Entries

    // --- SAFETY UNLOCK ---
    useEffect(() => {
        const interval = setInterval(() => {
            if (isTrading.current && Date.now() - lastTradeTime.current > 15000) {
                console.warn("SAFETY UNLOCK: Engine was stuck. Resetting.");
                isTrading.current = false;
            }
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // --- AUTO-PILOT ENGINE ---
    useEffect(() => {
        const runAutoPilot = async () => {
            if (!botActive || walletLocked || !wallet) return;
            if (Date.now() - lastTradeTime.current < 10000) return;
            if (usdcBalance < 1) return;
            if (isTrading.current) return; // LOCKED

            console.log(`AUTO-PILOT SCANNING... (Active: ${botActive}, Locked: ${walletLocked}, Balance: ${usdcBalance})`);

            // A. MANAGE EXISTING POSITIONS
            if (wallet.positions && wallet.positions.length > 0) {
                // ... (existing logic)
            }

            // ⚡ DYNAMIC POSITION SIZING (Autopilot)
            const getTradeAmount = () => {
                const balance = parseFloat(wallet.usdc || 0);
                let amount = balance * 0.10; // 10% Risk
                if (amount < 0.10) amount = 0.10; // Min $0.10
                if (amount > balance) amount = balance; // Max Balance
                return amount;
            };

            // B. OPEN NEW POSITIONS
            for (const symbol of Object.keys(marketStats)) {

                // ... (signal checks) ... 
                const data = marketStats[symbol];
                const score = data.score || 50;
                const backendSignal = data.signal || 'HOLD';

                if (backendSignal === 'BUY') {
                    console.log(`SCANNING ${symbol}: Signal=${backendSignal}, Score=${score}`);
                }

                let buySignal = false;
                if (backendSignal === 'BUY') buySignal = true;
                // FALLBACK: TRUST THE SCORE (If Signal Lagging)
                if (score >= 52) buySignal = true;
                // 2. STANDARD BULLISH ENTRY (Legacy - Backup)
                if (data.trend === 'bullish' && score >= 70) buySignal = true;

                // 3. OVERSOLD BOUNCE (RISKY)
                if (data.trend === 'bearish' && (data.rsi || 50) < 30) buySignal = true;

                // 4. GOLDEN CROSS BOOST
                if (data.macro === 'GOLDEN_CROSS' && score >= 60) buySignal = true;

                const tradeSize = getTradeAmount();

                // CHECK IF WE ALREADY OWN IT
                const hasPosition = wallet.positions.find(p => p.symbol === symbol);

                if (buySignal && !hasPosition) {
                    if (usdcBalance >= tradeSize) {
                        isTrading.current = true; // 🔒 LOCK ENGINE
                        console.log(`BUY SIGNAL EXECUTING: ${symbol}`);
                        try {
                            await executeTrade(symbol, "BUY", tradeSize);
                        } catch (e) { console.error("Trade Failed", e); }

                        lastTradeTime.current = Date.now();
                        isTrading.current = false; // UNLOCK ENGINE
                        return;
                    } else {
                        console.log(`BUY SIGNAL IGNORED: ${symbol} (Insufficient Balance)`);
                    }
                }
            }
        };

        const interval = setInterval(runAutoPilot, 3000);
        return () => clearInterval(interval);
    }, [botActive, wallet, marketStats, usdcBalance]);

    const activeCoinData = marketStats[selectedSymbol] ||
        marketStats[`${selectedSymbol}-USD`] ||
        Object.values(marketStats).find(d => d.symbol && d.symbol.startsWith(selectedSymbol.split('-')[0])) || {};

    const activePosition = wallet?.positions?.find(p => {
        const pSym = (p.symbol || "").toUpperCase().trim();
        const selSym = (selectedSymbol || "").toUpperCase().trim();
        return pSym === selSym || selSym.includes(pSym) || pSym.includes(selSym);
    });

    useEffect(() => {
        if (!walletExists()) setShowDisclaimer(true);
        else if (walletLocked) setShowUnlock(true);
    }, []);

    const handleDisclaimerAccept = () => { setShowDisclaimer(false); setShowSetup(true); };
    const handleCreateWallet = async (pw) => await createWallet(pw);
    const handleUnlock = async (pw) => await unlockWallet(pw);

    const [showPanicConfirm, setShowPanicConfirm] = useState(false);

    const forceBuy = async () => {
        if (selectedSymbol && usdcBalance >= 0.1) { // Changed minimum to 0.1
            // Recalculate 10% amount
            const amount = Math.max(0.1, usdcBalance * 0.10); // Changed minimum to 0.1
            await executeTrade(selectedSymbol, "BUY", amount);
        }
    };

    const handlePanicClick = () => setShowPanicConfirm(true);

    const executePanicSell = async () => {
        if (!wallet?.positions) return;
        for (const position of wallet.positions) { await executeTrade(position.symbol, "SELL", 0); }
        setShowPanicConfirm(false);
    };


    const handleClosePosition = async (symbol) => {
        await executeTrade(symbol, "SELL", 0);
    };

    const handleExportWithPassword = async (password) => {
        const unlockResult = await unlockWallet(password);
        if (unlockResult.success) {
            return { success: true, privateKey: exportPrivateKey() };
        }
        return unlockResult;
    };

    if (!wallet) return (
        <div className="fixed inset-0 bg-black flex items-center justify-center text-green-500 font-mono flex-col gap-4">
            <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-xs uppercase tracking-widest animate-pulse">Initializing Core...</div>
        </div>
    );

    return (
        <div className="fixed inset-0 w-full h-screen bg-[#070B10] text-gray-300 font-sans selection:bg-green-500/30 overflow-hidden flex flex-col z-[100]">
            {!walletLocked && <TutorialOverlay />}

            {/* --- MENU OVERLAY (DRAWER) REMOVED --- */}

            {/* TOASTS */}
            <div className="fixed top-20 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div key={toast.id} onClick={() => removeToast(toast.id)} className={`pointer-events-auto min-w-[300px] flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border backdrop-blur-md transition-all ${toast.type === 'success' ? 'bg-[#0D1117] border-green-500/50 text-green-400' : 'bg-[#0D1117] border-red-500/50 text-red-400'}`}>
                        <span className="text-xs font-bold font-mono">{toast.message}</span>
                    </div>
                ))}
            </div>

            {/* MODALS */}
            {showDisclaimer && <DisclaimerModal onAccept={handleDisclaimerAccept} />}
            {showSetup && <WalletSetupModal onCreateWallet={handleCreateWallet} onClose={() => setShowSetup(false)} />}
            {showUnlock && !showDisclaimer && <UnlockModal onUnlock={handleUnlock} onClose={() => setShowUnlock(false)} />}

            {/* PANIC CONFIRMATION MODAL */}
            {showPanicConfirm && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#0D1117] border border-red-500/50 rounded-xl p-6 max-w-sm w-full shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                        <h3 className="text-red-500 font-black text-xl mb-2 flex items-center gap-2">
                            PANIC SELL MODE
                        </h3>
                        <p className="text-gray-400 text-xs mb-6 leading-relaxed">
                            Are you sure you want to <span className="text-white font-bold">CLOSE ALL {wallet?.positions?.length || 0} POSITIONS</span> immediately at market price?
                            <br /><br />
                            <span className="text-red-400/80 italic">This action cannot be undone.</span>
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowPanicConfirm(false)}
                                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded font-bold text-xs transition-colors"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={executePanicSell}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-xs shadow-lg shadow-red-900/20 transition-all border border-red-400/20 animate-pulse"
                            >
                                CONFIRM SELL ALL
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onExportKey={handleExportWithPassword} />}

            {/* HEADER */}
            {!isLockedView && (
                <header className="h-16 border-b border-gray-800 bg-[#0A0E14] flex items-center justify-between px-6 shrink-0 relative z-[50]">
                    {/* Radical Brutalist / Authentic Terminal Logo */}
                    <div className="flex items-center gap-4 w-1/4 select-none">
                        <div className="flex flex-col relative group cursor-default">
                            <h1 className="text-[22px] font-black tracking-tighter leading-none lowercase flex items-end">
                                <span className="text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">monika</span>
                                <span className="text-green-500 animate-pulse font-mono text-[16px] leading-none mb-0.5 mx-0.5">_</span>
                                <span className="text-gray-500 font-bold italic opacity-90">terminal</span>
                            </h1>
                            <div className="absolute -bottom-1.5 left-0 w-full h-[2px] bg-gradient-to-r from-green-500/50 via-white/10 to-transparent scale-x-0 origin-left group-hover:scale-x-100 transition-transform duration-500"></div>
                        </div>
                    </div>

                    {/* Brutalist Syntax Navigation */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center text-[10px] font-mono tracking-[0.2em] font-bold text-gray-600 select-none whitespace-nowrap">
                        <span className="text-gray-800 font-normal mr-3">{"//"}</span>

                        <a href="https://www.monika-ai.xyz/" className="hover:text-white transition-colors duration-300 lowercase">
                            sys.home
                        </a>

                        <span className="text-gray-800 font-normal mx-3">{"//"}</span>

                        <span className="text-green-400 lowercase border border-green-500/20 bg-[#0d1510] px-1.5 py-0.5">
                            exe.spot
                        </span>

                        <span className="text-gray-800 font-normal mx-3">{"//"}</span>

                        <span className="text-gray-700/50 lowercase line-through decoration-gray-800 cursor-not-allowed" title="Offline">
                            null.perps
                        </span>

                        <span className="text-gray-800 font-normal mx-3">{"//"}</span>

                        <span className="text-gray-700/50 lowercase line-through decoration-gray-800 cursor-not-allowed" title="Offline">
                            null.games
                        </span>
                    </div>
                    <div className="flex items-center justify-end gap-4 text-sm font-mono w-1/4">
                        {/* SETTINGS BUTTON RESTORED */}
                        <button
                            id="export-wallet"
                            onClick={() => setShowSettings(true)}
                            className="text-gray-500 hover:text-white transition-colors p-2"
                            title="Settings & Export"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>

                        {walletLocked ? (
                            <button onClick={() => setShowUnlock(true)} className="flex items-center gap-2 bg-yellow-900/20 text-yellow-400 border border-yellow-500/30 px-3 py-1.5 rounded font-bold">Unlock Wallet</button>
                        ) : (
                            <div className="relative" ref={walletDropdownRef}>
                                <button
                                    onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                                    className="flex items-center gap-2 bg-[#0d1510] hover:bg-[#121c16] text-green-400 border border-green-500/30 px-3 py-1.5 transition-all group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500/80 group-hover:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                    <span className="font-mono text-[10px] tracking-widest">{walletAddress?.substring(0, 6)}...{walletAddress?.substring(walletAddress.length - 4)}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-green-500/50 transition-transform ${showWalletDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>

                                {showWalletDropdown && (() => {
                                    let totalWorth = usdcBalance || 0;
                                    const monPrice = prices['MON-USD'] || marketStats['MON-USD']?.price || 0;
                                    totalWorth += (nativeBalance || 0) * monPrice;

                                    Object.entries(rawBalances || {}).forEach(([sym, amount]) => {
                                        if (sym !== 'USDC') {
                                            let p = prices[`${sym}-USD`] || marketStats[`${sym}-USD`]?.price || 0;
                                            if (sym === 'WMON') p = monPrice;
                                            if (sym === 'aUSD') p = 1.00;
                                            totalWorth += amount * p;
                                        }
                                    });

                                    return (
                                        <div className="absolute top-full right-0 mt-2 w-72 bg-[#05070a]/95 backdrop-blur-xl border border-gray-800 shadow-[0_0_30px_rgba(0,0,0,0.8)] p-0 flex flex-col z-[150] font-mono">
                                            {/* Header Section */}
                                            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gradient-to-b from-[#0d1510]/50 to-transparent">
                                                <div className="flex flex-col">
                                                    <span className="text-gray-500 text-[9px] uppercase tracking-[0.2em] font-bold mb-1">Total_Worth</span>
                                                    <span className="text-green-400 font-bold text-lg">${totalWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                                <button onClick={() => { lockWallet(); setShowWalletDropdown(false); }} className="text-[9px] tracking-widest border border-red-900/50 text-red-500 hover:bg-red-900/20 hover:text-red-400 px-2 py-1 transition-colors uppercase cursor-pointer z-10">
                                                    LOCK_SYS
                                                </button>
                                            </div>

                                            {/* Holdings Section */}
                                            <div className="flex flex-col p-4 gap-2 bg-[#0a0e14]/50">
                                                <span className="text-gray-600 text-[9px] uppercase tracking-[0.2em] font-bold mb-2">Active_Assets</span>

                                                <div className="flex justify-between items-center border-b border-gray-800/50 pb-2">
                                                    <span className="text-gray-300 text-xs font-bold">MON <span className="text-[9px] text-gray-600 font-normal">{"// GAS"}</span></span>
                                                    <span className="text-gray-400 text-xs">{nativeBalance?.toFixed(4)}</span>
                                                </div>

                                                {Object.keys(rawBalances || {}).length > 0 ? (
                                                    Object.entries(rawBalances).map(([sym, amount], idx) => {
                                                        const priceKey = sym === 'WMON' ? 'MON-USD' : `${sym}-USD`;
                                                        let currentPrice = prices[priceKey] || marketStats[priceKey]?.price || 0;
                                                        if (sym === 'aUSD' || sym === 'USDC') currentPrice = 1.00;
                                                        const usdValue = amount * currentPrice;

                                                        return (
                                                            <div key={sym} className={`flex justify-between items-center py-2 ${idx !== Object.keys(rawBalances).length - 1 ? 'border-b border-gray-800/50' : ''}`}>
                                                                <span className="text-gray-300 text-xs font-bold">{sym}</span>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-gray-400 text-xs">{amount.toFixed(4)}</span>
                                                                    <span className="text-[9px] text-green-500/60 mt-0.5">${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="text-gray-600 text-[10px] italic text-center py-4 bg-black/20 border border-gray-800/50">null_assets_found</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </header>
            )}

            {/* CONTENT */}
            <div className="flex-1 px-6 py-4 grid grid-cols-12 gap-4 h-[calc(100vh-80px)] overflow-y-auto scrollbar-hide">
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 h-full overflow-hidden">
                    <div className="shrink-0" id="gas-fee">
                        <WalletCard balance={wallet} nativeBalance={nativeBalance} usdcBalance={usdcBalance} isLocked={walletLocked} onLock={() => { lockWallet(); setShowUnlock(true); }} onUnlock={() => setShowUnlock(true)} marketStats={marketStats} address={walletAddress} />
                    </div>

                    <div className="shrink-0">
                        <NeuralEngine selectedSymbol={selectedSymbol} />
                    </div>

                    <div className="flex-1 min-h-0">
                        <MarketScanner onSelectCoin={setSelectedSymbol} />
                    </div>

                    <div className="shrink-0 flex flex-col gap-2" id="trading-terminal">
                        <button
                            onClick={() => setBotActive(!botActive)}
                            className={`w-full py-3 font-bold rounded shadow uppercase tracking-wider transition-all text-xs flex items-center justify-center gap-2 ${!botActive ? 'bg-green-500 hover:bg-green-400 text-black' : 'bg-red-500 hover:bg-red-400 text-black animate-pulse'}`}
                        >
                            {botActive ? "STOP_ENGINE" : "START_ENGINE"}
                        </button>

                        <div className="flex gap-2">
                            <button onClick={forceBuy} className="flex-1 py-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 rounded text-blue-400 text-[10px] font-bold uppercase tracking-wide transition-colors">Force_Buy_ {selectedSymbol.replace('-USD', '')}</button>
                            <button id="panic-sell" onClick={handlePanicClick} className="flex-1 py-2 bg-red-900/20 hover:bg-red-500/20 border border-red-500/30 rounded text-red-500 text-[10px] font-bold uppercase tracking-wide transition-colors" title="SELL ALL">Panic_Sell</button>
                        </div>
                    </div>
                </div>

                <div className="col-span-12 lg:col-span-9 flex flex-col gap-4 h-[850px]">
                    <div id="market-stats">
                        <MarketTicker activeTimeframe={timeframe} onSelectCoin={setSelectedSymbol} marketData={marketStats} />
                    </div>
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
                        <div className="flex flex-col gap-4 h-full min-h-0">
                            <div className="bg-[#0D1117] border border-gray-800 rounded-xl overflow-hidden flex flex-col shadow-lg relative shrink-0 h-[480px]">

                                {/* FIX: Pass onClosePosition and onRowClick */}
                                <DetailedPositionsTable
                                    positions={wallet?.positions || []}
                                    marketStats={marketStats}
                                    botActive={botActive}
                                    onClosePosition={handleClosePosition}
                                    onRowClick={setSelectedSymbol}
                                />
                            </div>
                            <TradeHistoryTable trades={wallet?.tradeHistory} />
                        </div>

                        <div className="flex flex-col gap-4 min-h-0 h-full">
                            <div id="price-chart" className="h-[480px] bg-[#0D1117] border border-gray-800 rounded-xl overflow-hidden relative shadow-2xl shrink-0">
                                <CustomChart key={selectedSymbol + '-' + timeframe} symbol={selectedSymbol} position={activePosition} tradePlan={getTradePlan(selectedSymbol, activeCoinData.price || prices[selectedSymbol])} currentPrice={activeCoinData.price || prices[selectedSymbol]} candlesData={candles[selectedSymbol]} smaData={smaValues[selectedSymbol]} rsiValue={rsiValues[selectedSymbol]} markers={[]} activeTimeframe={timeframe} onTimeframeChange={changeTimeframe} availablePairs={[]} onSelectPair={setSelectedSymbol} />
                            </div>
                            <div id="logs-panel" className="flex-1 bg-[#0D1117] border border-gray-800 p-2 rounded-xl flex flex-col min-h-0 bg-opacity-50 backdrop-blur-sm">
                                <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1 ml-1 flex justify-between">
                                    <span>System_Logs</span>
                                    <span className={botActive ? "text-green-500 animate-pulse" : "text-gray-600"}>{botActive ? "AUTO-PILOT ON" : "MANUAL MODE"}</span>
                                </h2>
                                <div className="flex-1 bg-black/20 rounded-lg p-2 text-[10px] font-mono text-gray-400 overflow-y-auto flex flex-col-reverse shadow-inner">
                                    {logs.map((log, i) => <p key={i} className="mb-0.5 border-b border-white/5 pb-0.5 break-all">{log}</p>)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <footer className="col-span-12 border-t border-gray-800 py-4 flex justify-center items-center gap-8 bg-[#070B10] mt-auto">
                    {/* X (Twitter) */}
                    <a href="https://x.com/monikamonad" className="text-gray-500 hover:text-white transition-colors group">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                    </a>

                    {/* Telegram */}
                    <a href="https://t.me/monika_monad" className="text-gray-500 hover:text-[#229ED9] transition-colors group">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                        </svg>
                    </a>

                    {/* GitBook */}
                    <a href="https://monika.gitbook.io/monika-docs" className="text-gray-500 hover:text-white transition-colors group">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M12.513 1.097c-.645 0-1.233.34-2.407 1.017L3.675 5.82A7.233 7.233 0 0 0 0 12.063v.236a7.233 7.233 0 0 0 3.667 6.238L7.69 20.86c2.354 1.36 3.531 2.042 4.824 2.042 1.292.001 2.47-.678 4.825-2.038l4.251-2.453c1.177-.68 1.764-1.02 2.087-1.579.323-.56.324-1.24.323-2.6v-2.63a1.04 1.04 0 0 0-1.558-.903l-8.728 5.024c-.587.337-.88.507-1.201.507-.323 0-.616-.168-1.204-.506l-5.904-3.393c-.297-.171-.446-.256-.565-.271a.603.603 0 0 0-.634.368c-.045.111-.045.282-.043.625.002.252 0 .378.025.494.053.259.189.493.387.667.089.077.198.14.416.266l6.315 3.65c.589.34.884.51 1.207.51.324 0 .617-.17 1.206-.509l7.74-4.469c.202-.116.302-.172.377-.13.075.044.075.16.075.392v1.193c0 .34.001.51-.08.649-.08.14-.227.224-.522.394l-6.382 3.685c-1.178.68-1.767 1.02-2.413 1.02-.646 0-1.236-.34-2.412-1.022l-5.97-3.452-.043-.025a4.106 4.106 0 0 1-2.031-3.52V11.7c0-.801.427-1.541 1.12-1.944a1.979 1.979 0 0 1 1.982-.001l4.946 2.858c1.174.679 1.762 1.019 2.407 1.02.645 0 1.233-.34 2.41-1.017l7.482-4.306a1.091 1.091 0 0 0 0-1.891L14.92 2.11c-1.175-.675-1.762-1.013-2.406-1.013Z" />
                        </svg>
                    </a>
                </footer>
            </div>

            {/* --- CHAT AGENT INTEGRATION --- */}
            {!isLockedView && (
                <GrokChat
                    marketStats={marketStats}
                    selectedSymbol={selectedSymbol}
                    wallet={wallet}
                    neuralAnalysis={neuralAnalysis}
                    rsiValues={rsiValues}
                />
            )}
        </div >
    );
};

export default TradingDashboard;
