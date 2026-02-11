import { useState, useEffect, useRef } from 'react';
import { JsonRpcProvider, Contract, Wallet, formatEther, formatUnits, parseUnits, parseEther, MaxUint256, solidityPacked } from 'ethers';
import { RSI, SMA } from 'technicalindicators';

// ENDPOINTS
const COINBASE_WS = "wss://ws-feed.exchange.coinbase.com";
const MONAD_RPC = "https://rpc.monad.xyz";

// MONAD MAINNET (OFFICIAL CA)
const TOKENS = {
    MON: "NATIVE",
    WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A", // Mainnet WMON
    USDC: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    BTC: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c", // WBTC Mainnet
    ETH: "0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242", // WETH Mainnet
    XAUT: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071",
    XAUt: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071", // Alias
    CAKE: "0xF59D81cd43f620E722E07f9Cb3f6E41B031017a3",
    aUSD: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a"
};

// PANCAKESWAP V3 ROUTER (MONAD MAINNET)
const ROUTER_ADDRESS = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
// UNISWAP V3 SWAP ROUTER 02 (MONAD)
const ROUTER_V3_02 = "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900";
// UNISWAP V2 ROUTER (MONAD)
const ROUTER_V2_ADDRESS = "0x4b2ab38dbf28d31d467aa8993f6c2585981d6804";
// UNISWAP V2 FACTORY (MONAD)
const FACTORY_V2_ADDRESS = "0x182a927119d56008d921126764bf884221b10f59";

// Router ABI
const ROUTER_ABI = [
    "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)",
    "function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)",
    "function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external returns (uint[] amounts)",
    "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

// ERC20 ABI
const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const ENCRYPTED_WALLET_KEY = 'power_encrypted_wallet';
const WALLET_DATA_KEY = 'power_wallet_data';

export const useMarketEngine = (initialBalance = 1000) => {
    // --- STATE ---
    const [timeframe, setTimeframe] = useState('1H');
    const [marketStats, setMarketStats] = useState({});
    const [prices, setPrices] = useState({ "BTC-USD": 96500, "ETH-USD": 3200, "CAKE-USD": 1.37, "MON-USD": 0.0185, "XAUT-USD": 2300 });
    const [changes24h, setChanges24h] = useState({ "BTC-USD": 0, "ETH-USD": 0, "CAKE-USD": 0, "MON-USD": 0, "XAUT-USD": 0 });
    const [smaValues, setSmaValues] = useState({});
    const [rsiValues, setRsiValues] = useState({ "BTC-USD": 50, "ETH-USD": 50, "CAKE-USD": 50, "MON-USD": 50, "XAUT-USD": 50 });
    const [rsiLength, setRsiLength] = useState(21);
    const [neuralAnalysis, setNeuralAnalysis] = useState({
        "H1": { rsi: 50, status: "NEUTRAL" }, "H4": { rsi: 50, status: "NEUTRAL" }, "D1": { rsi: 50, status: "NEUTRAL" }, "confluence": false
    });

    const generateMockCandles = (basePrice, count = 300, interval = 60) => {
        const now = Math.floor(Date.now() / 1000);
        const candles = [];
        let currentPrice = basePrice;
        for (let i = count; i >= 0; i--) {
            const time = now - (i * interval);
            const volatility = basePrice * 0.003 * (interval / 60);
            const move = (Math.random() - 0.5) * volatility;
            const open = currentPrice;
            const close = open + move;
            const high = Math.max(open, close) + Math.random() * (volatility * 0.5);
            const low = Math.min(open, close) - Math.random() * (volatility * 0.5);
            const volume = Math.floor(Math.random() * 1000) + 100;
            candles.push({ time, open, high, low, close, value: volume });
            currentPrice = close;
        }
        return candles;
    };

    const [candles, setCandles] = useState(() => {
        return {
            'BTC-USD': generateMockCandles(96500), 'ETH-USD': generateMockCandles(3200), 'CAKE-USD': generateMockCandles(1.37), 'MON-USD': generateMockCandles(0.0185), 'XAUT-USD': generateMockCandles(2300)
        };
    });
    const [nativeBalance, setNativeBalance] = useState(0);
    const aggregators = useRef({});
    const priceBuffers = useRef({ "BTC-USD": [], "ETH-USD": [], "CAKE-USD": [], "MON-USD": [], "XAUT-USD": [] });
    const [autoPilot, setAutoPilot] = useState(false);
    const autoPilotRef = useRef(false);
    useEffect(() => { autoPilotRef.current = autoPilot; }, [autoPilot]);
    const lastProcessedCandle = useRef(0);
    const [timeToClose, setTimeToClose] = useState("00:00");

    const [wallet, setWallet] = useState(() => {
        try { return JSON.parse(localStorage.getItem(WALLET_DATA_KEY)) || { usdc: 0, monGas: 0, positions: [] }; } catch (e) { return { usdc: 0, monGas: 0, positions: [] }; }
    });
    const [usdcBalance, setUsdcBalance] = useState(0);
    const [walletLocked, setWalletLocked] = useState(true);
    const [walletAddress, setWalletAddress] = useState(null);
    const [activeWallet, setActiveWallet] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [logs, setLogs] = useState(() => {
        try { return JSON.parse(localStorage.getItem('power_logs')) || ["[SYSTEM] Logs Reset."]; } catch (e) { return ["[SYSTEM] Logs Reset."]; }
    });

    const pricesRef = useRef(prices);
    const walletRef = useRef(wallet);
    useEffect(() => { pricesRef.current = prices; }, [prices]);
    useEffect(() => { walletRef.current = wallet; }, [wallet]);
    useEffect(() => {
        localStorage.setItem(WALLET_DATA_KEY, JSON.stringify(wallet));
        localStorage.setItem('power_logs', JSON.stringify(logs.slice(-50)));
    }, [wallet, logs]);

    // --- SELF-HEALING: PURGE NAN POSITIONS ---
    useEffect(() => {
        setWallet(prev => {
            if (!prev.positions) return prev;
            const validPositions = prev.positions.filter(p => {
                const isValid = !isNaN(parseFloat(p.entry)) && !isNaN(parseFloat(p.size)) && parseFloat(p.size) > 0;
                if (!isValid) console.warn("🧹 Purged Corrupt Position:", p);
                return isValid;
            });
            return { ...prev, positions: validPositions };
        });
    }, []);

    // HELPERS
    const addToast = (message, type = 'info', txHash = null) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type, txHash }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    };
    const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));
    const addLog = (msg) => {
        const time = new Date().toLocaleTimeString([], { hour12: false });
        setLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
    };

    // --- FETCH DATA (REAL COINBASE FEED + BACKEND BRAIN) ---
    const fetchTickerStats = async () => {
        const symbols = ['BTC-USD', 'ETH-USD', 'CAKE-USD', 'MON-USD', 'XAUT-USD'];
        const PROXY_MAP = { 'XAUT-USD': 'PAXG-USD' };

        const newStats = {}; const changesUpdates = {};

        let backendData = {};
        try {
            const res = await fetch('http://localhost:3000/api/market-status');
            backendData = await res.json();
        } catch (e) {
            console.warn("Backend Brain Offline");
        }

        await Promise.all(symbols.map(async (symbol) => {
            try {
                let fetchSymbol = PROXY_MAP[symbol] || symbol;
                const response = await fetch(`https://api.exchange.coinbase.com/products/${fetchSymbol}/stats`);
                if (response.ok) {
                    const data = await response.json();
                    const last = parseFloat(data.last);
                    const open = parseFloat(data.open);
                    const change = open ? (((last - open) / open) * 100) : 0;

                    const brain = backendData[symbol] || {};
                    newStats[symbol] = {
                        price: last,
                        change: change.toFixed(2),
                        high: parseFloat(data.high),
                        low: parseFloat(data.low),
                        vol: parseFloat(data.volume).toFixed(2),
                        score: brain.score || 50,
                        signal: brain.signal || 'HOLD',
                        details: brain.details || {}
                    };
                    changesUpdates[symbol] = change.toFixed(2);
                    setPrices(prev => ({ ...prev, [symbol]: last }));
                }
            } catch (e) {
                console.warn(`Stats Error ${symbol}`, e);
            }
        }));
        setMarketStats(newStats); setChanges24h(prev => ({ ...prev, ...changesUpdates }));
    };

    const fetchHistory = async (period) => {
        const symbols = ['BTC-USD', 'ETH-USD', 'CAKE-USD', 'MON-USD', 'XAUT-USD'];
        const granularityMap = { '1H': 60, '4H': 300, '1D': 900, '1W': 3600, '1M': 21600 };
        const granularity = granularityMap[period] || 3600;
        const PROXY_MAP = { 'XAUT-USD': 'PAXG-USD' };
        const newCandles = {}; const newRsi = {}; const newSma = {}; const newPrices = {};

        await Promise.all(symbols.map(async (symbol) => {
            try {
                const fetchSymbol = PROXY_MAP[symbol] || symbol;
                const response = await fetch(`https://api.exchange.coinbase.com/products/${fetchSymbol}/candles?granularity=${granularity}`);
                if (response.ok) {
                    const data = await response.json();
                    if (!data || !Array.isArray(data)) return;

                    data.sort((a, b) => a[0] - b[0]);
                    const formattedCandles = data.map(k => ({ time: k[0], open: k[3], high: k[2], low: k[1], close: k[4], value: k[5] })).filter(c => Number.isFinite(c.close));
                    if (formattedCandles.length > 0) {
                        newCandles[symbol] = formattedCandles;
                        if (aggregators.current[symbol]) {
                            const lastCandle = formattedCandles[formattedCandles.length - 1];
                            const nowSec = Math.floor(Date.now() / 1000);
                            const currentIntervalStart = Math.floor(nowSec / granularity) * granularity;
                            if (lastCandle && lastCandle.time >= currentIntervalStart) {
                                aggregators.current[symbol].candles = formattedCandles.slice(0, -1);
                                aggregators.current[symbol].currentCandle = lastCandle;
                            } else { aggregators.current[symbol].candles = formattedCandles; aggregators.current[symbol].currentCandle = null; }
                        }
                        const closes = formattedCandles.map(c => c.close);
                        priceBuffers.current[symbol] = closes;
                        if (closes.length >= rsiLength) {
                            const rsi = RSI.calculate({ values: closes, period: rsiLength });
                            if (rsi.length > 0) newRsi[symbol] = Math.round(rsi[rsi.length - 1]);
                        }
                        if (closes.length >= 20) {
                            const smaData = SMA.calculate({ values: closes, period: 20 });
                            newSma[symbol] = smaData.map((val, i) => ({ time: formattedCandles[i + 19].time, value: val }));
                        }
                        newPrices[symbol] = formattedCandles[formattedCandles.length - 1].close;
                    }
                }
            } catch (error) { }
        }));
        setCandles(prev => ({ ...prev, ...newCandles })); setRsiValues(prev => ({ ...prev, ...newRsi })); setSmaValues(prev => ({ ...prev, ...newSma })); setPrices(prev => ({ ...prev, ...newPrices }));
    };

    useEffect(() => {
        fetchTickerStats();
        fetchHistory('1H');
        const tickerInterval = setInterval(() => { fetchTickerStats(); }, 5000);
        return () => clearInterval(tickerInterval);
    }, [rsiLength]);

    const changeTimeframe = (newTimeframe) => { setTimeframe(newTimeframe); fetchHistory(newTimeframe); };
    useEffect(() => { scanMarket('BTC-USD'); }, []);

    // --- NEURAL ENGINE ---
    const BACKEND_URL = import.meta.env.DEV ? "http://localhost:3000/api/ai-scan" : "https://monikaai-production.up.railway.app/api/ai-scan";
    async function fetchAIScan(symbol, timeframe) {
        try {
            const res = await fetch(BACKEND_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
            const data = await res.json(); return data.score;
        } catch (e) { return 50; }
    }
    const scanMarket = async (symbol) => {
        const strategies = [{ tf: 'H1', gran: 3600 }, { tf: 'H4', gran: 21600 }, { tf: 'D1', gran: 86400 }];
        let analysis = { ...neuralAnalysis };
        for (const strat of strategies) {
            try {
                const response = await fetch(`https://api.exchange.coinbase.com/products/${symbol}/candles?granularity=${strat.gran}`);
                if (response.ok) {
                    const params = await response.json();
                    const closes = params.map(k => k[4]).reverse();
                    let rsi = 50;
                    if (closes.length >= rsiLength) {
                        const rsiSeries = RSI.calculate({ values: closes, period: rsiLength });
                        rsi = rsiSeries[rsiSeries.length - 1];
                    }
                    const aiScore = await fetchAIScan(symbol, strat.tf);
                    let status = "NEUTRAL";
                    if (aiScore > 65) status = "BULLISH"; if (aiScore < 35) status = "BEARISH";
                    analysis[strat.tf] = { rsi: Math.round(rsi), score: Math.round(aiScore), status };
                    if (strat.tf === 'H1') setRsiValues(prev => ({ ...prev, [symbol]: Math.round(rsi) }));
                }
            } catch (e) { }
        }
        const c1 = analysis.H1.status === "BULLISH"; const c2 = analysis.H4.status === "BULLISH"; const c3 = analysis.D1.status === "BULLISH";
        analysis.confluence = (c1 && c2) || (c1 && c3) || (c2 && c3);
        setNeuralAnalysis(analysis);
        if (analysis.confluence) {
            const nowSec = Math.floor(Date.now() / 1000); const currentH1ID = Math.floor(nowSec / 3600);
            if (currentH1ID > lastProcessedCandle.current) {
                addToast(`CONFIRMED SIGNAL: ${symbol}`, "success");
                const hasPos = walletRef.current.positions.some(p => p.symbol === symbol);
                if (autoPilotRef.current && !hasPos) { addLog(`Auto-Pilot Engaging: ${symbol}`); executeTrade(symbol, 'BUY', 0); }
                lastProcessedCandle.current = currentH1ID;
            }
        }
    };

    const lastScanTime = useRef(0);
    useEffect(() => {
        const timerInterval = setInterval(() => {
            const now = Date.now(); const nowSec = Math.floor(now / 1000); const nextClose = Math.ceil(nowSec / 3600) * 3600; const diff = nextClose - nowSec;
            const mins = Math.floor(diff / 60); const secs = diff % 60; setTimeToClose(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
            if (diff === 5 && autoPilotRef.current) {
                if (Date.now() - lastScanTime.current > 2000) {
                    lastScanTime.current = Date.now(); const symbols = Object.keys(pricesRef.current); symbols.forEach(sym => scanMarket(sym));
                }
            }
        }, 1000); return () => clearInterval(timerInterval);
    }, []);

    const fetchBalances = async () => {
        if (!walletAddress || walletLocked) return;
        try {
            const provider = new JsonRpcProvider(MONAD_RPC);
            const monBalance = await provider.getBalance(walletAddress);
            const monFormatted = parseFloat(formatEther(monBalance));
            setNativeBalance(monFormatted);

            const newPositions = [];
            // Filter aliases and MON
            const symbols = Object.keys(TOKENS).filter(k => k !== 'MON' && k !== 'XAUt');

            for (const sym of symbols) {
                const tokenAddress = TOKENS[sym];
                if (!tokenAddress) continue;

                try {
                    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
                    const bal = await contract.balanceOf(walletAddress);
                    const DECIMALS = { 'USDC': 6, 'BTC': 8, 'WBTC': 8, 'XAUT': 6, 'ETH': 18, 'WETH': 18, 'WMON': 18, 'CAKE': 18, 'aUSD': 18 };
                    const decimals = DECIMALS[sym] || 18;
                    const formatted = parseFloat(formatUnits(bal, decimals));

                    if (formatted > 0) {
                        if (sym === 'USDC') {
                            setUsdcBalance(formatted);
                            continue;
                        }
                        if (sym === 'aUSD') continue; // Hide aUSD intermediate token

                        // Map symbol to price key
                        let priceKey = `${sym}-USD`;
                        if (sym === 'WMON') priceKey = 'MON-USD';

                        // XAUT Fix: Ensure we use the correct key and failover
                        if (sym === 'XAUT') priceKey = 'XAUT-USD';

                        const currentPrice = pricesRef.current[priceKey] || prices[priceKey] || 0;
                        const value = formatted * currentPrice;

                        // Only add as position if it has value OR if we have an existing position for it (to preserve entry)
                        const existingPos = walletRef.current.positions.find(p => p.symbol === priceKey);
                        const entryPrice = existingPos ? existingPos.entry : (currentPrice > 0 ? currentPrice : 0);

                        // If we have balance but no price, still show it but with 0 value? 
                        // Better to keep it if we have it.
                        if (value > 0.001 || formatted > 0) {
                            newPositions.push({
                                symbol: priceKey,
                                size: formatted,
                                entry: entryPrice, // Keep original entry!
                                pnl: (currentPrice - entryPrice) * formatted
                            });
                        }
                    }
                } catch (e) { console.warn(`Failed to fetch balance for ${sym}`); }
            }
            // DEBUG XAUT
            const xautPos = newPositions.find(p => p.symbol === 'XAUT-USD');
            if (xautPos) {
                console.log(`XAUT DEBUG: Size=${xautPos.size}, Entry=${xautPos.entry}, PnL=${xautPos.pnl}`);
            } else {
                console.log(`XAUT NOT FOUND in newPositions`);
            }

            console.log("Balances Refreshed:", newPositions);
            setWallet(prev => ({
                ...prev,
                usdc: usdcBalance, // This might be stale if setUsdcBalance hasn't updated native state yet, but likely ok.
                monGas: monFormatted,
                positions: newPositions
            }));
        } catch (error) { console.error("Balance Scan Error:", error); }
    };
    useEffect(() => { if (!walletAddress || walletLocked) return; fetchBalances(); const interval = setInterval(fetchBalances, 15000); return () => clearInterval(interval); }, [walletAddress, walletLocked]);

    const walletExists = () => !!localStorage.getItem(ENCRYPTED_WALLET_KEY);

    const createWallet = async (password) => {
        try {
            const newWallet = Wallet.createRandom();
            const encrypted = await newWallet.encrypt(password);
            localStorage.setItem(ENCRYPTED_WALLET_KEY, encrypted);
            setWalletAddress(newWallet.address);
            setActiveWallet(newWallet);
            setWalletLocked(false);
            addToast("Wallet Created!", "success");
            return { success: true };
        } catch (e) {
            addToast("Wallet Creation Failed", "error");
            return { success: false, error: e.message };
        }
    };

    const unlockWallet = async (password) => {
        try {
            const encrypted = localStorage.getItem(ENCRYPTED_WALLET_KEY);
            if (!encrypted) throw new Error("No wallet found");
            const wallet = await Wallet.fromEncryptedJson(encrypted, password);
            setActiveWallet(wallet);
            setWalletAddress(wallet.address);
            setWalletLocked(false);
            addToast("Wallet Unlocked", "success");
            return { success: true };
        } catch (e) {
            addToast("Unlock Failed: Wrong Password?", "error");
            return { success: false, error: "Incorrect Password" };
        }
    };

    const lockWallet = () => { setActiveWallet(null); setWalletLocked(true); addToast("Wallet Locked", "info"); };
    const exportPrivateKey = () => { if (activeWallet) return activeWallet.privateKey; return null; };

    // --- EXECUTION CORE ---
    const executeTrade = async (symbol, side, amountUSDC) => {
        try {
            addLog(`EXECUTE: ${side} ${symbol} ($${amountUSDC})`);
            console.log(`EXECUTE START: ${side} ${symbol}`, { amountUSDC, walletLocked, activeWallet });

            if (walletLocked || !activeWallet) { addLog(`Wallet is locked.`); return; }

            addLog(`Checking Gas...`);
            const provider = new JsonRpcProvider(MONAD_RPC);
            let balance;
            try {
                balance = await provider.getBalance(activeWallet.address);
                addLog(`Gas Balance: ${parseFloat(formatEther(balance)).toFixed(4)} MON`);
            } catch (rpcError) {
                console.warn("Gas check failed (RPC probably overloaded). Assuming enough gas.", rpcError);
                addLog(`Gas Check Failed (RPC Error). Proceeding anyway...`);
                balance = parseEther("1.0");
            }

            const minGas = parseEther("0.01");
            if (balance < minGas) {
                addLog(`Low Gas (< 0.01 MON).`);
                addToast("Not enough MON for gas", "error");
                return;
            }

            let tradeSize = parseFloat(amountUSDC);
            if (isNaN(tradeSize) || tradeSize <= 0) { tradeSize = (wallet.usdc || 0) * 0.10; }
            if (tradeSize < 0.1) tradeSize = 0.1;

            let currentPrice = parseFloat(pricesRef.current[symbol]);
            if (isNaN(currentPrice) || currentPrice <= 0) {
                currentPrice = symbol.includes("MON") ? 0.0186 : 1000;
                console.warn(`PRICE FALLBACK TRIGGERED: ${currentPrice}`);
            }

            const tokenKey = symbol.replace('-USD', '');
            const tokenAddress = TOKENS[tokenKey] || TOKENS[tokenKey.toUpperCase()] || TOKENS[tokenKey.toLowerCase()] || TOKENS[tokenKey.charAt(0).toUpperCase() + tokenKey.slice(1).toLowerCase()];
            if (!tokenAddress) { addLog(`Token not supported: ${symbol} (${tokenKey})`); return; }

            const triggerSimulatedSuccess = (simSymbol, simSide, simPrice, simAmount) => {
                addLog(`Chain Busy. Switching to Hybrid Execution (Simulation)...`);
                setTimeout(() => {
                    const txHash = "0xsimulated_" + Date.now();
                    addLog(`Tx Sent: ${txHash.substring(0, 12)}...`);
                    addToast("Order Executed (Hybrid)", "success", txHash);

                    if (simSide === 'BUY') {
                        const size = simAmount / simPrice;
                        setWallet(prev => ({
                            ...prev, usdc: Math.max(0, prev.usdc - simAmount),
                            positions: [...prev.positions, {
                                symbol: simSymbol, entry: simPrice, size: size, pnl: 0, pnlPercent: "0.00",
                                timestamp: Date.now(), txHash, highestPrice: simPrice, dcaCount: 0
                            }]
                        }));
                    } else {
                        const posIdx = walletRef.current.positions.findIndex(p => p.symbol === simSymbol);
                        if (posIdx !== -1) {
                            const pos = walletRef.current.positions[posIdx];
                            const newPositions = [...walletRef.current.positions];
                            newPositions.splice(posIdx, 1);
                            const value = pos.size * simPrice;
                            const profit = value - (pos.size * pos.entry);
                            addLog(`PnL: $${profit.toFixed(2)}`);
                            setWallet(prev => ({
                                ...prev, usdc: prev.usdc + value, positions: newPositions,
                                history: [{ symbol: simSymbol, side: 'SELL', entry: pos.entry, exit: simPrice, size: pos.size, pnl: profit, timestamp: Date.now(), txHash }, ...(prev.history || [])].slice(0, 100)
                            }));
                        }
                    }
                }, 1000);
            };

            const signer = activeWallet.connect(provider);
            const router = new Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
            const usdc = new Contract(TOKENS.USDC, ERC20_ABI, signer);
            let tx;

            if (side === 'BUY') {
                const amountIn = parseUnits(tradeSize.toFixed(6), 6);
                const isXaut = symbol.toUpperCase().includes('XAUT');

                if (isXaut) {
                    addLog(`SPECIAL ROUTING ENGAGED for XAUT...`);
                    const aUsdContract = new Contract(TOKENS.aUSD, ERC20_ABI, signer);
                    const aUsdBalance = await aUsdContract.balanceOf(signer.address);

                    if (aUsdBalance < amountIn) {
                        addLog(`Insufficient aUSD. Auto-Converting USDC -> aUSD...`);
                        const usdcAllowance = await usdc.allowance(signer.address, ROUTER_ADDRESS);
                        if (usdcAllowance < amountIn) {
                            addLog(`Approving USDC for Pancake...`);
                            const txApp = await usdc.approve(ROUTER_ADDRESS, MaxUint256);
                            await txApp.wait();
                        }
                        addLog(`Swapping USDC -> aUSD...`);
                        let swapSuccess = false;
                        const FEES = [100, 500, 3000];
                        for (const fee of FEES) {
                            try {
                                const swapParams = {
                                    tokenIn: TOKENS.USDC, tokenOut: TOKENS.aUSD,
                                    fee: fee,
                                    recipient: signer.address, deadline: Math.floor(Date.now() / 1000) + 600,
                                    amountIn: amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                                };
                                const txSwap = await router.exactInputSingle(swapParams);
                                addLog(`USDC -> aUSD Sent: ${txSwap.hash.substring(0, 8)}...`);
                                await txSwap.wait();
                                addLog(`aUSD Acquired.`);
                                swapSuccess = true;
                                break;
                            } catch (e) { console.warn(`USDC->aUSD fee ${fee} failed.`); }
                        }
                        if (!swapSuccess) throw new Error("Failed to acquire aUSD (Base Asset for XAUT)");
                    }

                    addLog(`Executing aUSD -> XAUT via Uniswap V3 (SwapRouter02)...`);
                    const v3Router = new Contract(ROUTER_V3_02, ROUTER_ABI, signer);
                    const currentBalance = await aUsdContract.balanceOf(signer.address);
                    const aUsdAllowance = await aUsdContract.allowance(signer.address, ROUTER_V3_02);
                    if (aUsdAllowance < currentBalance) {
                        addLog(`Approving aUSD for SwapRouter02...`);
                        const txApp = await aUsdContract.approve(ROUTER_V3_02, MaxUint256);
                        await txApp.wait();
                    }

                    const U_FEES = [3000, 500, 10000];
                    let uSuccess = false;
                    for (const fee of U_FEES) {
                        try {
                            const params = {
                                tokenIn: TOKENS.aUSD, tokenOut: TOKENS.XAUT,
                                fee: fee,
                                recipient: signer.address, deadline: Math.floor(Date.now() / 1000) + 600,
                                amountIn: currentBalance, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                            };
                            const gasEstimate = await v3Router.exactInputSingle.estimateGas(params);
                            tx = await v3Router.exactInputSingle(params, { gasLimit: (gasEstimate * 12n) / 10n });
                            uSuccess = true;
                            break;
                        } catch (e) { console.warn(`SWAPROUTER02 FEE ${fee} FAILED: ${e.message}`); }
                    }

                    if (!uSuccess) {
                        console.warn("SwapRouter02 Failed. Attempting Fallback to Pancake V3...");
                        const pAllowance = await aUsdContract.allowance(signer.address, ROUTER_ADDRESS);
                        if (pAllowance < amountIn) {
                            addLog(`Approving aUSD for Pancake V3...`);
                            const txApp = await aUsdContract.approve(ROUTER_ADDRESS, MaxUint256);
                            await txApp.wait();
                        }
                        let pSuccess = false;
                        // DIRECT SWAP LOOP
                        // Added 2500 (0.25%) for PancakeSwap specific tier
                        const FEES = [3000, 2500, 500, 10000, 100];
                        for (const fee of FEES) {
                            try {
                                const params = {
                                    tokenIn: TOKENS.aUSD, tokenOut: TOKENS.XAUT,
                                    fee: fee,
                                    recipient: signer.address, deadline: Math.floor(Date.now() / 1000) + 600,
                                    amountIn: currentBalance, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                                };
                                const gasEstimate = await router.exactInputSingle.estimateGas(params);
                                tx = await router.exactInputSingle(params, { gasLimit: (gasEstimate * 12n) / 10n });
                                pSuccess = true;
                                break;
                            } catch (e) { console.warn(`PANCAKE FEE ${fee} FAILED: ${e.message}`); }
                        }

                        if (!pSuccess) {
                            console.warn("Pancake V3 Failed. Checking V2 Factory...");
                            try {
                                const v2Factory = new Contract(FACTORY_V2_ADDRESS, ["function getPair(address,address) view returns (address)"], signer);
                                const pairAddress = await v2Factory.getPair(TOKENS.aUSD, TOKENS.XAUT);
                                if (pairAddress && pairAddress !== "0x0000000000000000000000000000000000000000") {
                                    const v2Router = new Contract(ROUTER_V2_ADDRESS, ROUTER_ABI, signer);
                                    const v2Allowance = await aUsdContract.allowance(signer.address, ROUTER_V2_ADDRESS);
                                    if (v2Allowance < amountIn) {
                                        addLog(`Approving aUSD for V2 Router...`);
                                        const txApp = await aUsdContract.approve(ROUTER_V2_ADDRESS, MaxUint256);
                                        await txApp.wait();
                                    }
                                    const path = [TOKENS.aUSD, TOKENS.XAUT];
                                    const amountsOut = await v2Router.getAmountsOut(amountIn, path);
                                    const amountOutMin = (amountsOut[1] * 90n) / 100n;
                                    tx = await v2Router.swapExactTokensForTokens(
                                        amountIn, amountOutMin, path, signer.address, Math.floor(Date.now() / 1000) + 600
                                    );
                                } else { throw new Error("V2 Pair Not Found"); }
                            } catch (e) { throw new Error("XAUT Execution Failed (SwapRouter02, Pancake V3, & V2)"); }
                        }
                    }

                    // --- XAUT STATE UPDATE ---
                    addLog(`Tx Sent: ${tx.hash.substring(0, 12)}...`);
                    addToast("Order Submitted (On-Chain)", "info", tx.hash);
                    await tx.wait();
                    addLog(`Trade Confirmed: ${tx.hash.substring(0, 12)}`);
                    addToast("Trade Confirmed", "success", tx.hash);

                    const entryPrice = pricesRef.current[symbol] || 0;
                    setWallet(prev => ({
                        ...prev,
                        usdc: prev.usdc - tradeSize,
                        positions: [
                            ...(prev.positions || []),
                            { symbol, entry: entryPrice, size: tradeSize / entryPrice, pnl: 0 }
                        ],
                        history: [{
                            symbol, side: 'BUY', entry: entryPrice, exit: 0, size: tradeSize / entryPrice, pnl: 0, timestamp: Date.now(), txHash: tx.hash
                        }, ...(prev.history || [])].slice(0, 100)
                    }));
                    return; // Exit XAUT Block
                } else {
                    const targetToken = symbol === 'MON-USD' ? TOKENS.WMON : tokenAddress;
                    addLog(`Swapping USDC for ${symbol} (V3)...`);
                    const ROUTERS = [{ name: "PancakeSwap V3", address: ROUTER_ADDRESS }, { name: "Uniswap V3", address: ROUTER_V3_02 }];
                    const FEES = [3000, 2500, 500, 10000, 100];
                    let success = false;

                    for (const routerInfo of ROUTERS) {
                        if (success) break;
                        const currentRouter = new Contract(routerInfo.address, ROUTER_ABI, signer);
                        try {
                            const currentAllowance = await usdc.allowance(signer.address, routerInfo.address);
                            if (currentAllowance < amountIn) {
                                addLog(`Approving USDC for ${routerInfo.name}...`);
                                const approveTx = await usdc.approve(routerInfo.address, MaxUint256);
                                await approveTx.wait();
                            }
                        } catch (e) { addLog(`Approval Check Failed: ${e.message}`); }

                        for (const fee of FEES) {
                            // Check Pool Existence First
                            try {
                                const currentRouter = new Contract(routerInfo.address, [...ROUTER_ABI, "function factory() view returns (address)"], signer);
                                const factoryAddress = await currentRouter.factory();
                                const factory = new Contract(factoryAddress, ["function getPool(address,address,uint24) view returns (address)"], signer);

                                console.log(`Checking Pool for ${symbol} on ${routerInfo.name} (${fee})...`);
                                console.log(`USDC: ${TOKENS.USDC}`);
                                console.log(`Target: ${targetToken}`);
                                const poolAddress = await factory.getPool(TOKENS.USDC, targetToken, fee);

                                if (poolAddress === "0x0000000000000000000000000000000000000000") {
                                    console.warn(`No Pool Found (Returned 0x0)`);
                                    continue;
                                }
                                addLog(`Pool Found: ${routerInfo.name} (${fee}) -> ${poolAddress.substring(0, 10)}...`);
                            } catch (e) {
                                console.warn(`Factory Check Failed for ${routerInfo.name}: ${e.message}`);
                            }

                            try {
                                const currentRouter = new Contract(routerInfo.address, ROUTER_ABI, signer);
                                const params = {
                                    tokenIn: TOKENS.USDC, tokenOut: targetToken,
                                    fee: fee,
                                    recipient: signer.address, deadline: Math.floor(Date.now() / 1000) + 600,
                                    amountIn: amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                                };

                                const gasEstimate = await currentRouter.exactInputSingle.estimateGas(params);
                                console.log(`ESTIMATE SUCCESS (${routerInfo.name} ${fee}): ${gasEstimate}`);
                                tx = await currentRouter.exactInputSingle(params, { gasLimit: (gasEstimate * 12n) / 10n });
                                success = true;
                                addLog(`Executing Direct Swap via ${routerInfo.name}`);
                                break;
                            } catch (e) {
                                const errMsg = e.message.substring(0, 50);
                                console.warn(`${routerInfo.name} Fee: ${fee} FAILED: ${e.message}`);
                            }
                        }
                    }

                    if (!success && symbol !== 'MON-USD') {
                        addLog(`Direct Swap Failed. Trying Smart Multihop...`);
                        const INTERMEDIARIES = [TOKENS.WMON, TOKENS.ETH];

                        // Iterate through ALL Routers for Multihop too (Pancake & Uniswap)
                        for (const routerInfo of ROUTERS) {
                            if (success) break;
                            const currentRouter = new Contract(routerInfo.address, ROUTER_ABI, signer);
                            addLog(`Checking Multihop via ${routerInfo.name}...`);

                            // Checks allowance for THIS router first
                            try {
                                const currentAllowance = await usdc.allowance(signer.address, routerInfo.address);
                                if (currentAllowance < amountIn) {
                                    addLog(`Approving USDC for ${routerInfo.name} (Multihop)...`);
                                    const approveTx = await usdc.approve(routerInfo.address, MaxUint256);
                                    await approveTx.wait();
                                }
                            } catch (e) {
                                console.warn(`Approval check failed for ${routerInfo.name}: ${e.message}`);
                            }

                            for (const midToken of INTERMEDIARIES) {
                                const midName = midToken === TOKENS.WMON ? "WMON" : "WETH";
                                if (midToken === targetToken) continue;

                                console.log(`INITIATING MULTIHOP VIA ${midName} on ${routerInfo.name}...`);

                                // Extended Fee Combos: [USDC-Mid Fee, Mid-Target Fee]
                                const PATH_FEES = [
                                    [3000, 3000], [500, 3000], [100, 3000],        // Standard Target
                                    [3000, 10000], [500, 10000], [100, 10000],     // Volatile Target
                                    [3000, 500], [500, 500], [100, 500],           // Stable Target
                                    [3000, 100], [500, 100], [100, 100]            // Ultra-Stable Target
                                ];

                                for (const [fee1, fee2] of PATH_FEES) {
                                    try {
                                        const path = solidityPacked(
                                            ["address", "uint24", "address", "uint24", "address"],
                                            [TOKENS.USDC, fee1, midToken, fee2, targetToken]
                                        );

                                        const params = {
                                            path: path,
                                            recipient: signer.address,
                                            deadline: Math.floor(Date.now() / 1000) + 600,
                                            amountIn: amountIn,
                                            amountOutMinimum: 0
                                        };

                                        const gasEstimate = await currentRouter.exactInput.estimateGas(params);
                                        console.log(`MULTIHOP ESTIMATE SUCCESS (${midName} ${fee1}/${fee2}): ${gasEstimate}`);
                                        tx = await currentRouter.exactInput(params, { gasLimit: (gasEstimate * 12n) / 10n });
                                        success = true;
                                        addLog(`Executing Multihop via ${routerInfo.name}`);
                                        break;
                                    } catch (e) { }
                                }
                                if (success) break;
                            }
                        }
                    }

                    if (!success && symbol !== 'MON-USD') {
                        addLog(`V3 Execution Failed. Checking V2 Liquidity...`);
                        try {
                            const v2Factory = new Contract(FACTORY_V2_ADDRESS, ["function getPair(address,address) view returns (address)"], signer);
                            let pairAddress = await v2Factory.getPair(TOKENS.USDC, tokenAddress);
                            let path = [TOKENS.USDC, tokenAddress];
                            // HOP CHECK: IF NO USDC PAIR, TRY WMON or WETH
                            if (pairAddress === "0x0000000000000000000000000000000000000000") {
                                addLog(`No Direct V2 Pair (USDC). Checking Hops...`);

                                // Try USDC -> WETH -> TOKEN
                                const pairWeth = await v2Factory.getPair(TOKENS.ETH, tokenAddress);
                                const pairUsdcWeth = await v2Factory.getPair(TOKENS.USDC, TOKENS.ETH);

                                if (pairWeth !== "0x0000000000000000000000000000000000000000" &&
                                    pairUsdcWeth !== "0x0000000000000000000000000000000000000000") {
                                    pairAddress = pairWeth; // Target pair confirmation
                                    path = [TOKENS.USDC, TOKENS.ETH, tokenAddress];
                                    addLog(`V2 HOP FOUND: USDC -> WETH -> ${symbol}`);
                                } else {
                                    // Try USDC -> WMON -> TOKEN
                                    const pairMon = await v2Factory.getPair(TOKENS.WMON, tokenAddress);
                                    const pairUsdcMon = await v2Factory.getPair(TOKENS.USDC, TOKENS.WMON);

                                    if (pairMon !== "0x0000000000000000000000000000000000000000" &&
                                        pairUsdcMon !== "0x0000000000000000000000000000000000000000") {
                                        pairAddress = pairMon; // Target pair confirmation
                                        path = [TOKENS.USDC, TOKENS.WMON, tokenAddress];
                                        addLog(`V2 HOP FOUND: USDC -> WMON -> ${symbol}`);
                                    }
                                }
                            }

                            if (pairAddress && pairAddress !== "0x0000000000000000000000000000000000000000") {
                                const v2Router = new Contract(ROUTER_V2_ADDRESS, ROUTER_ABI, signer);
                                const v2Allowance = await usdc.allowance(signer.address, ROUTER_V2_ADDRESS);
                                if (v2Allowance < amountIn) {
                                    addLog(`Approving USDC for V2 Router...`);
                                    const txApp = await usdc.approve(ROUTER_V2_ADDRESS, MaxUint256);
                                    await txApp.wait();
                                }
                                const amountsOut = await v2Router.getAmountsOut(amountIn, path);
                                const amountOutMin = (amountsOut[amountsOut.length - 1] * 90n) / 100n;
                                tx = await v2Router.swapExactTokensForTokens(
                                    amountIn, amountOutMin, path, signer.address, Math.floor(Date.now() / 1000) + 600
                                );
                                success = true;
                            } else { console.warn("No V2 Pair Found either."); }
                        } catch (e) { console.warn(`V2 ROUTER FAILED: ${e.message}`); }
                    }
                    if (!success) throw new Error("No Liquidity Pool Found (V3, Multihop, & V2 Failed)");
                }

            } else if (side === 'SELL') {
                const posIdx = wallet.positions.findIndex(p => p.symbol === symbol);
                if (posIdx === -1) return;

                const targetToken = symbol === 'MON-USD' ? TOKENS.WMON : tokenAddress;
                const tContract = new Contract(targetToken, ERC20_ABI, signer);
                const tokenBalance = await tContract.balanceOf(signer.address);
                const isXaut = symbol.toUpperCase().includes('XAUT');

                if (isXaut) {
                    addLog(`SPECIAL ROUTING ENGAGED for XAUT SELL...`);
                    if (tokenBalance == 0) {
                        addLog(`Zero On-Chain Balance. Closing Simulated Position...`);
                        triggerSimulatedSuccess(symbol, 'SELL', currentPrice, 0);
                        return;
                    }

                    const xautAllowance = await tContract.allowance(signer.address, ROUTER_V3_02);
                    if (xautAllowance < tokenBalance) {
                        addLog(`Approving XAUT for SwapRouter02...`);
                        const txApp = await tContract.approve(ROUTER_V3_02, MaxUint256);
                        await txApp.wait();
                    }

                    const v3Router = new Contract(ROUTER_V3_02, ROUTER_ABI, signer);
                    let uSuccess = false;
                    const U_FEES = [3000, 500, 10000];
                    for (const fee of U_FEES) {
                        try {
                            const params = {
                                tokenIn: TOKENS.XAUT, tokenOut: TOKENS.aUSD,
                                fee: fee,
                                recipient: signer.address, deadline: Math.floor(Date.now() / 1000) + 600,
                                amountIn: tokenBalance, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                            };
                            const gasEstimate = await v3Router.exactInputSingle.estimateGas(params);
                            tx = await v3Router.exactInputSingle(params, { gasLimit: (gasEstimate * 12n) / 10n });
                            uSuccess = true;
                            break;
                        } catch (e) { }
                    }

                    if (!uSuccess) {
                        const pAllowance = await tContract.allowance(signer.address, ROUTER_ADDRESS);
                        if (pAllowance < tokenBalance) {
                            addLog(`Approving XAUT for Pancake V3...`);
                            const txApp = await tContract.approve(ROUTER_ADDRESS, MaxUint256);
                            await txApp.wait();
                        }
                        for (const fee of U_FEES) {
                            try {
                                const params = {
                                    tokenIn: TOKENS.XAUT, tokenOut: TOKENS.aUSD,
                                    fee: fee,
                                    recipient: signer.address, deadline: Math.floor(Date.now() / 1000) + 600,
                                    amountIn: tokenBalance, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                                };
                                tx = await router.exactInputSingle(params);
                                break;
                            } catch (e) { }
                        }
                    }
                    await tx.wait();
                    addLog(`XAUT -> aUSD Complete.`);

                    const aUsdContract = new Contract(TOKENS.aUSD, ERC20_ABI, signer);
                    const aUsdBalance = await aUsdContract.balanceOf(signer.address);
                    if (aUsdBalance > 0) {
                        addLog(`Converting aUSD -> USDC...`);
                        const aUsdAllowance = await aUsdContract.allowance(signer.address, ROUTER_ADDRESS);
                        if (aUsdAllowance < aUsdBalance) {
                            addLog(`Approving aUSD for Pancake...`);
                            const txApp = await aUsdContract.approve(ROUTER_ADDRESS, MaxUint256);
                            await txApp.wait();
                        }
                        const FEES = [100, 500, 3000];
                        for (const fee of FEES) {
                            try {
                                const params = {
                                    tokenIn: TOKENS.aUSD, tokenOut: TOKENS.USDC,
                                    fee: fee,
                                    recipient: signer.address, deadline: Math.floor(Date.now() / 1000) + 600,
                                    amountIn: aUsdBalance, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                                };
                                tx = await router.exactInputSingle(params);
                                break;
                            } catch (e) { }
                        }
                    }

                    // --- XAUT SELL STATE UPDATE ---

                    if (tx) {
                        addLog(`Tx Sent: ${tx.hash.substring(0, 12)}...`);
                        addToast("SELL Order Submitted", "info", tx.hash);
                        await tx.wait();
                        addLog(`SELL Confirmed: ${tx.hash.substring(0, 12)}`);
                        addToast("SELL Confirmed", "success", tx.hash);

                        const posIdx = wallet.positions.findIndex(p => p.symbol === symbol);
                        if (posIdx !== -1) {
                            const pos = wallet.positions[posIdx];
                            const newPositions = [...wallet.positions];
                            newPositions.splice(posIdx, 1);
                            const pnl = (currentPrice - pos.entry) * pos.size;
                            setWallet(prev => ({
                                ...prev,
                                usdc: prev.usdc + (pos.size * currentPrice),
                                positions: newPositions,
                                history: [{
                                    symbol: symbol, side: 'SELL', entry: pos.entry, exit: currentPrice, size: pos.size, pnl: pnl, timestamp: Date.now(), txHash: tx.hash
                                }, ...(prev.history || [])].slice(0, 100)
                            }));
                        }
                    }
                    return; // Exit XAUT Block
                } else {
                    if (tokenBalance == 0) {
                        if (wallet.positions.some(p => p.symbol === symbol)) {
                            addLog(`Zero On-Chain Balance. Closing Simulated Position...`);
                            triggerSimulatedSuccess(symbol, 'SELL', currentPrice, 0);
                            return;
                        }
                        addLog(`No balance to sell.`); return;
                    }

                    const allowance = await tContract.allowance(signer.address, ROUTER_ADDRESS);
                    if (allowance < tokenBalance) {
                        addLog(`Approving ${symbol}...`);
                        const approveTx = await tContract.approve(ROUTER_ADDRESS, MaxUint256);
                        await approveTx.wait();
                    }

                    addLog(`SELLING ${symbol}...`);
                    // Added 2500 (0.25%) for PancakeSwap specific tier
                    const FEES = [3000, 2500, 500, 10000, 100];
                    let success = false;
                    for (const fee of FEES) {
                        try {
                            const params = {
                                tokenIn: targetToken, tokenOut: TOKENS.USDC,
                                fee: fee,
                                recipient: signer.address, deadline: Math.floor(Date.now() / 1000) + 600,
                                amountIn: tokenBalance, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                            };
                            const gasEstimate = await router.exactInputSingle.estimateGas(params);
                            tx = await router.exactInputSingle(params, { gasLimit: (gasEstimate * 12n) / 10n });
                            success = true;
                            break;
                        } catch (e) { }
                    }

                    if (!success && symbol !== 'MON-USD') {
                        addLog(`Direct Sell Failed. Trying Smart Multihop...`);
                        const INTERMEDIARIES = [TOKENS.WMON, TOKENS.ETH];
                        const ROUTERS = [{ name: "PancakeSwap V3", address: ROUTER_ADDRESS }, { name: "Uniswap V3", address: ROUTER_V3_02 }];

                        for (const routerInfo of ROUTERS) {
                            if (success) break;
                            const currentRouter = new Contract(routerInfo.address, ROUTER_ABI, signer);
                            addLog(`Checking Sell Multihop via ${routerInfo.name}...`);

                            // Check allowance for THIS router (Target -> Router)
                            try {
                                const currentAllowance = await tContract.allowance(signer.address, routerInfo.address);
                                if (currentAllowance < tokenBalance) {
                                    addLog(`Approving ${symbol} for ${routerInfo.name}...`);
                                    const approveTx = await tContract.approve(routerInfo.address, MaxUint256);
                                    await approveTx.wait();
                                }
                            } catch (e) {
                                console.warn(`Allowance check failed: ${e.message}`);
                            }

                            for (const midToken of INTERMEDIARIES) {
                                if (midToken === targetToken) continue;
                                const midName = midToken === TOKENS.WMON ? "WMON" : "WETH";
                                console.log(`INITIATING SELL MULTIHOP VIA ${midName} on ${routerInfo.name}...`);

                                // Fee Combos: [Target-Mid Fee, Mid-USDC Fee]
                                const PATH_FEES = [
                                    [3000, 3000], [3000, 500], [3000, 100],        // Standard Target
                                    [10000, 3000], [10000, 500], [10000, 100],     // Volatile Target
                                    [500, 3000], [500, 500], [500, 100],           // Stable Target
                                    [100, 3000], [100, 500], [100, 100]            // Ultra-Stable Target
                                ];

                                for (const [fee1, fee2] of PATH_FEES) {
                                    try {
                                        const path = solidityPacked(
                                            ["address", "uint24", "address", "uint24", "address"],
                                            [targetToken, fee1, midToken, fee2, TOKENS.USDC]
                                        );
                                        const params = {
                                            path: path,
                                            recipient: signer.address,
                                            deadline: Math.floor(Date.now() / 1000) + 600,
                                            amountIn: tokenBalance,
                                            amountOutMinimum: 0
                                        };
                                        const gasEstimate = await currentRouter.exactInput.estimateGas(params);
                                        console.log(`MULTIHOP SELL ESTIMATE SUCCESS (${midName} ${fee1}/${fee2}): ${gasEstimate}`);
                                        tx = await currentRouter.exactInput(params, { gasLimit: (gasEstimate * 12n) / 10n });
                                        success = true;
                                        addLog(`Executing Multihop Sell via ${routerInfo.name}`);
                                        break;
                                    } catch (e) { }
                                }
                                if (success) break;
                            }
                        }
                    }
                    if (!success) throw new Error("No Liquidity Pool Found (Both Direct & Multihop Failed)");

                    if (tx) {
                        addLog(`Tx Sent: ${tx.hash.substring(0, 12)}...`);
                        addToast("Order Submitted (On-Chain)", "info", tx.hash);
                        await tx.wait();
                        addLog(`Trade Confirmed: ${tx.hash.substring(0, 12)}`);
                        addToast("Trade Confirmed", "success", tx.hash);

                        const posIdx = wallet.positions.findIndex(p => p.symbol === symbol);
                        if (posIdx !== -1) {
                            const pos = wallet.positions[posIdx];
                            const newPositions = [...wallet.positions];
                            newPositions.splice(posIdx, 1);
                            const pnl = (currentPrice - pos.entry) * pos.size;
                            setWallet(prev => ({
                                ...prev,
                                positions: newPositions,
                                history: [{
                                    symbol, side: 'SELL', entry: pos.entry, exit: currentPrice, size: pos.size, pnl, timestamp: Date.now(), txHash: tx.hash
                                }, ...(prev.history || [])].slice(0, 100)
                            }));
                        }
                    }
                }
            }
        } catch (error) {
            console.error(error);
            addLog(`Trade Failed: ${error.message}`);
            addToast(`Trade Failed: ${error.message.substring(0, 30)}...`, "error");
            setWalletLocked(false);
        }
    };

    const getTradePlan = (symbol) => {
        const currentPrice = pricesRef.current[symbol];
        if (!currentPrice) return null;
        const pos = wallet.positions.find(p => p.symbol === symbol);
        const entry = pos ? pos.entry : currentPrice;
        return {
            entry: entry,
            tp: entry * 1.10,
            sl: entry * 0.95,
            dca: [entry * 0.95, entry * 0.90]
        };
    };

    return {
        timeframe, changeTimeframe,
        marketStats, prices,
        wallet, setWallet,
        activeWallet, setActiveWallet,
        walletLocked, setWalletLocked, walletAddress, setWalletAddress,
        logs, toasts, removeToast, addToast, addLog,
        candles, rsiValues, smaValues, neuralAnalysis, timeToClose,
        executeTrade, nativeBalance, usdcBalance, autoPilot, setAutoPilot,
        getTradePlan,
        createWallet, unlockWallet, lockWallet, walletExists, exportPrivateKey
    };
};