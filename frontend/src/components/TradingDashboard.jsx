import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

const TradingDashboard = ({ userAddress, handleConnect, handleDisconnect }) => {
    const {
        prices, rsiValues, candles, nativeBalance, usdcBalance, wallet, logs, neuralAnalysis,
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
                if (score >= 55) buySignal = true;
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
            <header className="h-16 border-b border-gray-800 bg-[#0A0E14] flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-6">
                    <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">
                        <span className="text-green-500">MONIKA</span><span className="text-white">TERMINAL</span>
                    </h1>
                </div>
                <div className="flex items-center gap-4 text-sm font-mono">
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
                        <div className="flex items-center gap-2 bg-green-900/20 text-green-400 border border-green-500/30 px-3 py-1.5 rounded">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            {walletAddress?.substring(0, 6)}...{walletAddress?.substring(walletAddress.length - 4)}
                        </div>
                    )}
                </div>
            </header>

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
                            {botActive ? "STOP ENGINE" : "START ENGINE"}
                        </button>

                        <div className="flex gap-2">
                            <button onClick={forceBuy} className="flex-1 py-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 rounded text-blue-400 text-[10px] font-bold uppercase tracking-wide transition-colors">Force Buy {selectedSymbol.replace('-USD', '')}</button>
                            <button id="panic-sell" onClick={handlePanicClick} className="flex-1 py-2 bg-red-900/20 hover:bg-red-500/20 border border-red-500/30 rounded text-red-500 text-[10px] font-bold uppercase tracking-wide transition-colors" title="SELL ALL">Panic Sell</button>
                        </div>
                    </div>
                </div>

                <div className="col-span-12 lg:col-span-9 flex flex-col gap-4 h-[850px]">
                    <div id="market-stats">
                        <MarketTicker activeTimeframe={timeframe} onSelectCoin={setSelectedSymbol} marketData={marketStats} />
                    </div>
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
                        <div className="flex flex-col gap-4 h-full min-h-0">
                            <div className="flex-1 bg-[#0D1117] border border-gray-800 rounded-xl overflow-hidden flex flex-col min-h-0 shadow-lg relative">

                                {/* FIX: Pass onClosePosition and onRowClick */}
                                <DetailedPositionsTable
                                    positions={wallet?.positions || []}
                                    marketStats={marketStats}
                                    botActive={botActive}
                                    onClosePosition={handleClosePosition}
                                    onRowClick={setSelectedSymbol}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 min-h-0 h-full">
                            <div id="price-chart" className="h-[480px] bg-[#0D1117] border border-gray-800 rounded-xl overflow-hidden relative shadow-2xl shrink-0">
                                <CustomChart key={selectedSymbol} symbol={selectedSymbol} position={activePosition} tradePlan={getTradePlan(selectedSymbol)} currentPrice={activeCoinData.price || prices[selectedSymbol]} candlesData={candles[selectedSymbol]} smaData={smaValues[selectedSymbol]} rsiValue={rsiValues[selectedSymbol]} markers={[]} activeTimeframe={timeframe} onTimeframeChange={changeTimeframe} availablePairs={[]} onSelectPair={setSelectedSymbol} />
                            </div>
                            <div id="logs-panel" className="flex-1 bg-[#0D1117] border border-gray-800 p-2 rounded-xl flex flex-col min-h-0 bg-opacity-50 backdrop-blur-sm">
                                <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1 ml-1 flex justify-between">
                                    <span>System Logs</span>
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
            <GrokChat
                marketStats={marketStats}
                selectedSymbol={selectedSymbol}
                wallet={wallet}
                neuralAnalysis={neuralAnalysis}
                rsiValues={rsiValues}
            />
        </div >
    );
};

export default TradingDashboard;
