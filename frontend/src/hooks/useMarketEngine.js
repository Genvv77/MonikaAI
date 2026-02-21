import { useState, useEffect, useRef, useCallback } from 'react';
import { JsonRpcProvider, Contract, Wallet, formatEther, formatUnits, parseUnits, parseEther, MaxUint256, solidityPacked } from 'ethers';
import { RSI, SMA } from 'technicalindicators';

// --- ENDPOINTS & CONSTANTS ---
const COINBASE_WS = "wss://ws-feed.exchange.coinbase.com";
const MONAD_RPC = "https://rpc.monad.xyz";
const TOKENS = {
    MON: "NATIVE",
    WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A", // Mainnet WMON
    USDC: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    BTC: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c", // WBTC Mainnet
    ETH: "0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242", // WETH Mainnet
    XAUT: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071",
    XAUt: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071",
    XAUT0: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071",
    XAUt0: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071",
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
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external returns (uint[] amounts)",
    "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)",
    "function factory() view returns (address)"
];

// ERC20 ABI
const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const WALLET_DATA_KEY = 'power_wallet_data';
const ENCRYPTED_WALLET_KEY = 'power_encrypted_wallet';

export const useMarketEngine = (initialBalance = 1000) => {
    // --- STATE ---
    const [marketStats, setMarketStats] = useState({});
    const [prices, setPrices] = useState({ "BTC-USD": 96500, "ETH-USD": 3200, "CAKE-USD": 1.37, "MON-USD": 0.0185, "XAUT-USD": 2300 });
    const [candles, setCandles] = useState({});
    const [autoPilot, setAutoPilot] = useState(false);
    const [slippageTolerance, setSlippageTolerance] = useState(0.5); // Integrated Slippage

    const [wallet, setWallet] = useState(() => {
        try {
            const parsed = JSON.parse(localStorage.getItem(WALLET_DATA_KEY));
            if (parsed) {
                return { ...parsed, tradeHistory: parsed.tradeHistory || [] };
            }
            return { usdc: 0, monGas: 0, positions: [], tradeHistory: [] };
        } catch (e) {
            return { usdc: 0, monGas: 0, positions: [], tradeHistory: [] };
        }
    });

    // Core Wallet State
    const [walletAddress, setWalletAddress] = useState(null);
    const [activeWallet, setActiveWallet] = useState(null);
    const [walletLocked, setWalletLocked] = useState(true);

    // UI State
    const [logs, setLogs] = useState([]);
    const [toasts, setToasts] = useState([]);
    const [changes24h, setChanges24h] = useState({ "BTC-USD": 0, "ETH-USD": 0, "CAKE-USD": 0, "MON-USD": 0, "XAUT-USD": 0 });
    const [rsiValues, setRsiValues] = useState({});
    const [smaValues, setSmaValues] = useState({});
    const [nativeBalance, setNativeBalance] = useState(0);
    const [usdcBalance, setUsdcBalance] = useState(0);
    const [rawBalances, setRawBalances] = useState({});
    const [timeframe, setTimeframe] = useState('1H');

    // Refs for safe async access
    const pricesRef = useRef(prices);
    const walletRef = useRef(wallet);
    const autoPilotRef = useRef(autoPilot);
    const aggregators = useRef({});
    const priceBuffers = useRef({ "BTC-USD": [], "ETH-USD": [], "CAKE-USD": [], "MON-USD": [], "XAUT-USD": [] });

    useEffect(() => { pricesRef.current = prices; }, [prices]);
    useEffect(() => { walletRef.current = wallet; }, [wallet]);
    useEffect(() => { autoPilotRef.current = autoPilot; }, [autoPilot]);
    useEffect(() => { localStorage.setItem(WALLET_DATA_KEY, JSON.stringify(wallet)); }, [wallet]);
    useEffect(() => { localStorage.setItem('power_logs', JSON.stringify(logs.slice(-50))); }, [logs]);

    // --- STRATEGY: FIBONACCI RETRACEMENT ---
    // 1. Fractal Pivot Detection (Ignores rogue wicks)
    const findStructuralPivots = (candles) => {
        let trueSwingHigh = -Infinity;
        let trueSwingLow = Infinity;

        // Skip the last 2 candles because a pivot needs right-side confirmation
        for (let i = 2; i < candles.length - 2; i++) {
            const current = candles[i];

            // Pivot High: Higher than 2 candles before AND 2 candles after
            const isPivotHigh = current.high > candles[i - 1].high && current.high > candles[i - 2].high &&
                current.high > candles[i + 1].high && current.high > candles[i + 2].high;

            // Pivot Low: Lower than 2 candles before AND 2 candles after
            const isPivotLow = current.low < candles[i - 1].low && current.low < candles[i - 2].low &&
                current.low < candles[i + 1].low && current.low < candles[i + 2].low;

            if (isPivotHigh && current.high > trueSwingHigh) trueSwingHigh = current.high;
            if (isPivotLow && current.low < trueSwingLow) trueSwingLow = current.low;
        }

        return { trueSwingHigh, trueSwingLow };
    };

    // 2. Dynamic Fibonacci Calculation
    const calculateDynamicFibStrategy = (currentPrice, candles) => {
        // Failsafe: Fallback if not enough chart data
        if (!candles || candles.length < 20) {
            return { tp: currentPrice * 1.02, dca1: currentPrice * 0.98, dca2: currentPrice * 0.95, sl: currentPrice * 0.92, isDynamic: false };
        }

        // Get true pivots from the recent chart
        const recentCandles = candles.slice(-50);
        const { trueSwingHigh, trueSwingLow } = findStructuralPivots(recentCandles);

        // Failsafe: If no valid pivots found in window, use absolute highs/lows
        const swingHigh = trueSwingHigh !== -Infinity ? trueSwingHigh : Math.max(...recentCandles.map(c => c.high || c.close));
        const swingLow = trueSwingLow !== Infinity ? trueSwingLow : Math.min(...recentCandles.map(c => c.low || c.close));

        const range = swingHigh - swingLow;
        if (range === 0) return { tp: currentPrice * 1.02, dca1: currentPrice * 0.98, dca2: currentPrice * 0.95, sl: currentPrice * 0.92, isDynamic: false };

        // Calculate Pro Levels
        const tpLevel = swingHigh + (range * 0.272);     // 1.272 Extension
        const dca1Level = swingHigh - (range * 0.382);   // 0.382 Retracement
        const dca2Level = swingHigh - (range * 0.618);   // 0.618 Golden Pocket
        const slLevel = swingLow - (swingLow * 0.02);    // Structural break + 2% buffer

        return {
            tp: Math.max(tpLevel, currentPrice * 1.01),
            dca1: Math.min(dca1Level, currentPrice * 0.99),
            dca2: Math.min(dca2Level, currentPrice * 0.97),
            sl: Math.min(slLevel, currentPrice * 0.95),
            isDynamic: true
        };
    };

    // --- HELPERS ---
    const addLog = (msg) => {
        const time = new Date().toLocaleTimeString([], { hour12: false });
        setLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
    };

    const addToast = (message, type = 'info', txHash = null) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type, txHash }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    };

    const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));



    // --- EXECUTION CORE: PRESERVED ROUTING + SLIPPAGE ---
    const executeTrade = async (symbol, side, amountUSDC) => {
        try {
            if (walletLocked || !activeWallet) return addLog("Wallet Locked.");
            addLog(`EXECUTE: ${side} ${symbol} ($${amountUSDC})`);
            console.log(`EXECUTE START: ${side} ${symbol}`, { amountUSDC, walletLocked, activeWallet });

            const provider = new JsonRpcProvider(MONAD_RPC);
            const signer = activeWallet.connect(provider);
            const currentPrice = pricesRef.current[symbol];

            // Check Gas
            let balance;
            try {
                balance = await provider.getBalance(activeWallet.address);
                addLog(`Gas Balance: ${parseFloat(formatEther(balance)).toFixed(4)} MON`);
            } catch (rpcError) {
                console.warn("Gas check failed. Assuming gas ok.");
                balance = parseEther("1.0");
            }
            if (balance < parseEther("0.01")) {
                addLog(`Low Gas (< 0.01 MON).`);
                addToast("Not enough MON for gas", "error");
                return;
            }

            // Slippage Config
            const tokenKey = symbol.replace('-USD', '');
            const DECIMALS = { 'USDC': 6, 'BTC': 8, 'XAUT': 6, 'ETH': 18, 'WMON': 18, 'CAKE': 18 };
            const decimals = DECIMALS[tokenKey] || 18;
            // --- Phase 4: HARDCAPPED SLIPPAGE MODULE ---
            // Override UI slippage settings to restrict MEV sandwiching
            const isLiquidAsset = ['BTC', 'ETH', 'MON', 'WMON', 'XAUT'].includes(tokenKey);
            const hardCap = isLiquidAsset ? 0.5 : 1.5;
            const effectiveSlippage = Math.min(slippageTolerance, hardCap);
            const slippageFactor = (100 - effectiveSlippage) / 100;

            if (slippageTolerance > hardCap) {
                addLog(`⚙️ Slippage auto-capped to ${hardCap}% (Liquid: ${isLiquidAsset}) to prevent MEV bleed.`);
            }

            const router = new Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
            const usdc = new Contract(TOKENS.USDC, ERC20_ABI, signer);
            let tx;
            const isXaut = symbol.toUpperCase().includes('XAUT');

            const tokenAddress = TOKENS[tokenKey] || TOKENS[tokenKey.toUpperCase()] || TOKENS[tokenKey.toLowerCase()] || TOKENS[tokenKey.charAt(0).toUpperCase() + tokenKey.slice(1).toLowerCase()];
            if (!tokenAddress) { addLog(`Token not supported: ${symbol}`); return; }

            let tokenIn, tokenOut, amountIn, amountInDecimals, amountOutDecimals;
            let tradeSizeUsdc = 0;

            if (side === 'BUY') {
                tradeSizeUsdc = parseFloat(amountUSDC);
                if (isNaN(tradeSizeUsdc) || tradeSizeUsdc <= 0) tradeSizeUsdc = (wallet.usdc || 0) * 0.10;
                if (tradeSizeUsdc < 0.1) tradeSizeUsdc = 0.1;

                if (isXaut && tradeSizeUsdc < 5.0) {
                    addLog(`XAUt requires a minimum of 5 USDC to route via Kuru (Attempted: $${tradeSizeUsdc.toFixed(2)})`);
                    addToast("XAUt buy size too small (min $5)", "error");
                    return;
                }

                tokenIn = TOKENS.USDC;
                tokenOut = symbol === 'MON-USD' ? TOKENS.WMON : tokenAddress;
                amountInDecimals = 6;
                amountOutDecimals = decimals;
                amountIn = parseUnits(tradeSizeUsdc.toFixed(6), 6);
            } else if (side === 'SELL') {
                const posIdx = wallet.positions.findIndex(p => p.symbol === symbol);
                if (posIdx === -1) return;

                const targetToken = symbol === 'MON-USD' ? TOKENS.WMON : tokenAddress;
                const tContract = new Contract(targetToken, ERC20_ABI, signer);
                amountIn = await tContract.balanceOf(signer.address); // Sell ALL
                if (amountIn == 0n) {
                    addLog("No token balance to sell.");
                    return;
                }

                tokenIn = targetToken;
                tokenOut = TOKENS.USDC;
                amountInDecimals = decimals;
                amountOutDecimals = 6;
            }

            // --- KURU FLOW AGGREGATOR INTEGRATION ---
            addLog(`Fetching Kuru Smart Route...`);

            // 1. Get JWT Auth Token
            const authRes = await fetch('https://ws.kuru.io/api/generate-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_address: signer.address })
            });
            const authData = await authRes.json();
            if (!authData.token) {
                addLog("Kuru JWT auth failed."); return;
            }

            // 2. Get Quote
            const slippageBps = Math.floor(effectiveSlippage * 100);
            const quotePayload = {
                userAddress: signer.address,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amount: amountIn.toString(),
                slippageTolerance: slippageBps,
                autoSlippage: isXaut ? true : false
            };
            console.log("KURU REQUEST PAYLOAD:", quotePayload);

            const quoteRes = await fetch('https://ws.kuru.io/api/quote', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authData.token}`
                },
                body: JSON.stringify(quotePayload)
            });
            const quoteData = await quoteRes.json();
            console.log("KURU RESPONSE:", quoteData);

            let expectedOutToken = 0;
            let transactionUsed = false;

            if (quoteData.status === 'success' && quoteData.transaction) {
                expectedOutToken = parseFloat(formatUnits(quoteData.output, amountOutDecimals));
                addLog(`Optimal Route Found: Expected ≈ ${expectedOutToken.toFixed(4)} ${side === 'BUY' ? tokenKey : 'USDC'}`);

                // 3. Approvals for Kuru
                const routerAddress = quoteData.transaction.to;
                if (tokenIn !== TOKENS.MON && tokenIn !== "NATIVE") {
                    const inContract = new Contract(tokenIn, ERC20_ABI, signer);
                    const allowance = await inContract.allowance(signer.address, routerAddress);
                    if (allowance < amountIn) {
                        addLog(`Approving token for Kuru Aggregator...`);
                        let appTx;
                        let retries = 0;
                        while (retries < 4) {
                            try {
                                appTx = await inContract.approve(routerAddress, MaxUint256);
                                break;
                            } catch (err) {
                                if (err.message && (err.message.includes('limit reached') || err.message.includes('429'))) {
                                    retries++;
                                    addLog(`⚠️ RPC Limit Hit (Approval). Retrying in ${retries}s...`);
                                    await new Promise(r => setTimeout(r, 1000 * retries));
                                } else throw err;
                            }
                        }
                        if (appTx) await appTx.wait();
                    }
                }

                // 4. Execution via Kuru
                const rawTxData = quoteData.transaction.data || quoteData.transaction.calldata;
                const txData = {
                    to: routerAddress,
                    data: rawTxData.startsWith('0x') ? rawTxData : "0x" + rawTxData,
                    value: quoteData.transaction.value ? BigInt(quoteData.transaction.value) : 0n
                };

                try {
                    const gasEstimate = await provider.estimateGas({ ...txData, from: signer.address });
                    txData.gasLimit = (gasEstimate * 15n) / 10n; // 50% buffer padding
                } catch (e) {
                    console.warn("Gas estimate failed, trying hardcoded limit. Error:", e.message);
                    txData.gasLimit = 3000000n;
                }

                let txRetries = 0;
                while (txRetries < 4) {
                    try {
                        tx = await signer.sendTransaction(txData);
                        break;
                    } catch (err) {
                        if (err.message && (err.message.includes('limit reached') || err.message.includes('429') || err.code === 'UNKNOWN_ERROR')) {
                            txRetries++;
                            addLog(`RPC Limit Hit (Swap). Retrying in ${txRetries}s...`);
                            await new Promise(r => setTimeout(r, 1000 * txRetries));
                        } else throw err;
                    }
                }

                if (!tx) throw new Error("Trade failed after retries due to RPC rate limits.");
                transactionUsed = true;
            }

            if (!transactionUsed) {
                addLog(`Trade failed via Aggregator.`);
                addToast("Trade failed — no route", "error");
                return;
            }

            // --- STATE UPDATES & PNL ---
            addLog(`Tx Sent: ${tx.hash}`);
            addToast("Order Submitted", "info", tx.hash);

            // Custom Polling to bypass tx.wait() spamming eth_getTransactionByHash
            let receipt = null;
            let checks = 0;
            while (checks < 20) {
                try {
                    receipt = await provider.getTransactionReceipt(tx.hash);
                    if (receipt && receipt.status === 1) break;
                    if (receipt && receipt.status === 0) throw new Error("Transaction reverted on-chain.");
                } catch (err) {
                    if (err.message && (err.message.includes('limit reached') || err.message.includes('429'))) {
                        addLog(`RPC Limit Hit (Receipt). Delaying check...`);
                    } else if (err.message.includes('reverted')) {
                        throw err;
                    }
                }
                checks++;
                await new Promise(r => setTimeout(r, 3000));
            }
            if (!receipt) throw new Error("Transaction confirmation timed out.");
            addLog(`Trade Confirmed: ${tx.hash}`);
            addToast("Trade Confirmed", "success", tx.hash);

            if (side === 'BUY') {
                const fibPlan = calculateDynamicFibStrategy(currentPrice, candles[symbol] || []);
                setWallet(prev => {
                    const existingIdx = prev.positions.findIndex(p => p.symbol === symbol);
                    if (existingIdx !== -1) {
                        const existing = prev.positions[existingIdx];
                        const totalSize = existing.size + expectedOutToken;
                        const avgEntry = ((existing.entry * existing.size) + (currentPrice * expectedOutToken)) / totalSize;
                        const newPositions = [...prev.positions];
                        newPositions[existingIdx] = {
                            ...existing, entry: avgEntry, size: totalSize,
                            dcaCount: (existing.dcaCount || 0) + 1,
                            fibPlan, timestamp: Date.now(), txHash: tx.hash
                        };
                        return { ...prev, usdc: prev.usdc - tradeSizeUsdc, positions: newPositions };
                    }
                    return {
                        ...prev, usdc: prev.usdc - tradeSizeUsdc,
                        positions: [...prev.positions, {
                            symbol, entry: currentPrice, size: expectedOutToken,
                            fibPlan, timestamp: Date.now(), txHash: tx.hash
                        }]
                    };
                });
            } else if (side === 'SELL') {
                setWallet(prev => {
                    const idx = prev.positions.findIndex(p => p.symbol === symbol);
                    if (idx === -1) return prev;
                    const pos = prev.positions[idx];
                    const newPositions = [...prev.positions];
                    newPositions.splice(idx, 1);
                    const pnl = (currentPrice - pos.entry) * pos.size;
                    return {
                        ...prev,
                        usdc: prev.usdc + expectedOutToken, // Token represents USDC output here
                        positions: newPositions,
                        tradeHistory: [{
                            symbol, side: 'SELL', entry: pos.entry, exit: currentPrice,
                            size: pos.size, pnl, timestamp: Date.now(), txHash: tx.hash
                        }, ...(prev.tradeHistory || [])].slice(0, 100)
                    };
                });
            }
        } catch (e) {
            addLog(`Trade Failed: ${e.message}`);
            setWalletLocked(false);
        }
    };

    // --- EXECUTION LOCKS ---
    const pendingTradesRef = useRef(new Set());
    // Critical lock for race conditions: prevents the interval loop from double-buying 
    // before the wallet state has a chance to update with the new position.
    const recentEntriesRef = useRef({});

    // --- AUTONOMOUS LOOP: BRAIN + FIB ---
    useEffect(() => {
        if (autoPilot && walletAddress) {
            const nowTime = Date.now();

            // 1. Entry Logic (DUAL BRAIN) — 10% of balance
            Object.values(marketStats).forEach(async (asset) => {
                const opinion = (asset.aiOpinion || "NEUTRAL").toUpperCase();
                const symbol = Object.keys(marketStats).find(key => marketStats[key] === asset);

                if (!symbol || pendingTradesRef.current.has(symbol)) return;

                // Check Cooldown Lock: Don't attempt to enter if we just entered within the last 60 seconds
                const lastEntryTime = recentEntriesRef.current[symbol] || 0;
                if (nowTime - lastEntryTime < 60000) return;

                // Mathematical Baseline
                const isMathBuySignal = (asset.signal || "HOLD") === "BUY";

                // AI Holistic Override (Groq Llama-3.1)
                const isAIPump = opinion.includes("PUMP");
                const isAIDump = opinion.includes("DUMP");

                // Execution Decision: AI opinion is absolute law.
                // If it says PUMP, buy. If it says DUMP, abort. 
                // If it's FLAT, fall back to the raw math score (BUY signal).
                let executeBuy = false;
                if (isAIPump) {
                    executeBuy = true;
                } else if (!isAIDump && isMathBuySignal) {
                    executeBuy = true;
                }

                if (executeBuy && !wallet.positions.some(p => p.symbol === symbol) && usdcBalance > 0) {
                    const entrySize = parseFloat((usdcBalance * 0.10).toFixed(2));
                    if (entrySize >= 0.1) {
                        // ENGAGE ALL LOCKS IMMEDIATELY
                        pendingTradesRef.current.add(symbol);
                        recentEntriesRef.current[symbol] = nowTime;

                        const reasonLog = isAIPump ? 'AI [PUMP] Override' : 'AI [FLAT] Math Approval';
                        addLog(`DUAL BRAIN ACTION: ${symbol} — ${reasonLog} (Entry: $${entrySize})`);

                        await executeTrade(symbol, 'BUY', entrySize);

                        pendingTradesRef.current.delete(symbol); // Release general lock (but keep cooldown)
                    }
                }
            });

            // 2. Exit Logic (Fibonacci TP/SL)
            wallet.positions.forEach(async (pos) => {
                if (!pos.fibPlan || pendingTradesRef.current.has(pos.symbol)) return;

                const currentPrice = pricesRef.current[pos.symbol];
                if (!currentPrice) return;

                if (currentPrice >= pos.fibPlan.tp) {
                    pendingTradesRef.current.add(pos.symbol);
                    addLog(`Fib TP Hit: Selling ${pos.symbol} @ $${currentPrice.toFixed(2)}`);
                    await executeTrade(pos.symbol, 'SELL', pos.size);
                    pendingTradesRef.current.delete(pos.symbol);
                } else if (currentPrice <= pos.fibPlan.sl) {
                    pendingTradesRef.current.add(pos.symbol);
                    addLog(`Fib SL Hit: Selling ${pos.symbol} @ $${currentPrice.toFixed(2)}`);
                    await executeTrade(pos.symbol, 'SELL', pos.size);
                    pendingTradesRef.current.delete(pos.symbol);
                }
                // 3. DCA Logic: 5% of balance at Fibonacci levels (max 2 DCAs per position)
                else if (pos.dcaCount < 2 && usdcBalance > 0) {
                    const dcaSize = parseFloat((usdcBalance * 0.05).toFixed(2));
                    if (dcaSize >= 0.1) {
                        if (currentPrice <= pos.fibPlan.dca2 && (pos.dcaCount || 0) < 2) {
                            pendingTradesRef.current.add(pos.symbol);
                            addLog(`DCA2 Hit: Adding $${dcaSize} to ${pos.symbol} @ $${currentPrice.toFixed(2)}`);
                            await executeTrade(pos.symbol, 'BUY', dcaSize);
                            pendingTradesRef.current.delete(pos.symbol);
                        } else if (currentPrice <= pos.fibPlan.dca1 && (pos.dcaCount || 0) < 1) {
                            pendingTradesRef.current.add(pos.symbol);
                            addLog(`DCA1 Hit: Adding $${dcaSize} to ${pos.symbol} @ $${currentPrice.toFixed(2)}`);
                            await executeTrade(pos.symbol, 'BUY', dcaSize);
                            pendingTradesRef.current.delete(pos.symbol);
                        }
                    }
                }
            });
        }
    }, [marketStats, autoPilot, walletAddress, wallet.positions, usdcBalance]);

    // --- DATA SYNC (ALL FROM COINBASE) ---
    const PROXY_MAP = {
        'XAUT-USD': 'PAXG-USD'
    };
    const SYMBOLS = ['BTC-USD', 'ETH-USD', 'CAKE-USD', 'MON-USD', 'XAUT-USD'];

    // FAST: Coinbase price-only update (every 2s, 5 requests = 2.5 req/s, well under 10/s limit)
    const fetchPrices = async () => {
        const newStats = {};
        await Promise.allSettled(SYMBOLS.map(async (symbol) => {
            try {
                const proxy = PROXY_MAP[symbol] || symbol;
                const response = await fetch(`https://api.exchange.coinbase.com/products/${proxy}/stats`);
                if (response.ok) {
                    const data = await response.json();
                    const last = parseFloat(data.last);
                    const open = parseFloat(data.open);
                    const change24h = open ? (((last - open) / open) * 100) : 0;

                    newStats[symbol] = {
                        price: last,
                        change: change24h.toFixed(2),
                        change1d: parseFloat(change24h.toFixed(2)),
                        vol: parseFloat(data.volume).toFixed(2),
                    };
                    setPrices(prev => ({ ...prev, [symbol]: last }));
                }
            } catch (e) { }
        }));
        // MERGE: preserve AI data + timeframe changes
        setMarketStats(prev => {
            const updated = { ...prev };
            Object.entries(newStats).forEach(([sym, stats]) => {
                updated[sym] = { ...(prev[sym] || {}), ...stats };
            });
            return updated;
        });
    };

    // SLOW: Backend AI brain data (every 10s)
    const fetchBrainData = async () => {
        const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "https://monikaai-production.up.railway.app";
        try {
            const res = await fetch(`${API_BASE}/api/market-status`);
            const backendData = await res.json();
            setMarketStats(prev => {
                const updated = { ...prev };
                SYMBOLS.forEach(sym => {
                    const brain = backendData[sym] || {};
                    updated[sym] = {
                        ...(prev[sym] || {}),
                        score: brain.score || (prev[sym]?.score || 50),
                        aiOpinion: brain.aiOpinion || (prev[sym]?.aiOpinion || 'NEUTRAL'),
                        aiConfidence: brain.aiConfidence || 0,
                        aiReasoning: brain.aiReasoning || (prev[sym]?.aiReasoning || ''),
                        signal: brain.signal || (prev[sym]?.signal || 'HOLD'),
                        details: brain.details || (prev[sym]?.details || {}),
                    };
                });
                return updated;
            });
        } catch (e) { }
    };

    // Fetch real per-timeframe changes from Coinbase candles (staggered to avoid burst)
    const fetchTimeframeChanges = async () => {
        const timeframes = [
            { key: 'change1h', granularity: 300, seconds: 3600 },
            { key: 'change4h', granularity: 900, seconds: 14400 },
            { key: 'change1d', granularity: 3600, seconds: 86400 },
            { key: 'change1w', granularity: 21600, seconds: 604800 },
            { key: 'change1m', granularity: 86400, seconds: 2592000 },
        ];

        const allChanges = {};
        const now = new Date();

        // Stagger: process one symbol at a time to avoid 429 rate limits
        for (const symbol of SYMBOLS) {
            const proxy = PROXY_MAP[symbol] || symbol;
            allChanges[symbol] = {};

            for (const { key, granularity, seconds } of timeframes) {
                try {
                    const start = new Date(now.getTime() - (seconds * 1000)).toISOString();
                    const end = now.toISOString();
                    const response = await fetch(
                        `https://api.exchange.coinbase.com/products/${proxy}/candles?granularity=${granularity}&start=${start}&end=${end}`
                    );
                    if (response.ok) {
                        const data = await response.json();
                        if (data && Array.isArray(data) && data.length >= 2) {
                            data.sort((a, b) => a[0] - b[0]);
                            const oldestOpen = data[0][3];
                            const latestClose = data[data.length - 1][4];
                            const pctChange = oldestOpen ? ((latestClose - oldestOpen) / oldestOpen) * 100 : 0;
                            allChanges[symbol][key] = parseFloat(pctChange.toFixed(2));
                        }
                    } else if (response.status === 429) {
                        console.warn(`[Rate Limit] Coinbase 429 on timeframe ${key} for ${symbol}`);
                    }
                } catch (e) { }
                // 200ms delay between requests to respect Coinbase 10 req/s limit
                await new Promise(r => setTimeout(r, 200));
            }
        }

        setMarketStats(prev => {
            const updated = { ...prev };
            Object.entries(allChanges).forEach(([symbol, tfChanges]) => {
                updated[symbol] = { ...(updated[symbol] || {}), ...tfChanges };
            });
            return updated;
        });
    };

    const fetchHistory = async (period) => {
        // True Period mapping (how far back in time to look, in seconds)
        const periodSeconds = {
            '1H': 3600,         // 1 Hour
            '4H': 14400,        // 4 Hours
            '1D': 86400,        // 1 Day
            '1W': 604800,       // 1 Week
            '1M': 2592000       // 30 Days
        };

        // Optimal Granularity for the period (Coinbase limits to 300 candles max per request)
        const granularityMap = {
            '1H': 60,           // 1-min candles (60 candles)
            '4H': 60,           // 1-min candles (240 candles)
            '1D': 300,          // 5-min candles (288 candles)
            '1W': 3600,         // 1-hour candles (168 candles)
            '1M': 21600         // 6-hour candles (120 candles)
        };

        const secondsAgo = periodSeconds[period] || 86400;
        const granularity = granularityMap[period] || 300;

        const end = Math.floor(Date.now() / 1000);
        const start = end - secondsAgo;
        const newCandles = {};

        // Sequential loop with 200ms delay to prevent 429s on history fetch
        for (const symbol of SYMBOLS) {
            try {
                const fetchSymbol = PROXY_MAP[symbol] || symbol;
                const response = await fetch(`https://api.exchange.coinbase.com/products/${fetchSymbol}/candles?granularity=${granularity}&start=${start}&end=${end}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data && Array.isArray(data) && data.length > 0) {
                        data.sort((a, b) => a[0] - b[0]);
                        const formattedCandles = data.map(k => ({ time: k[0], open: k[3], high: k[2], low: k[1], close: k[4], value: k[5] })).filter(c => Number.isFinite(c.close));
                        if (formattedCandles.length > 0) {
                            newCandles[symbol] = formattedCandles;
                        }
                    }
                } else if (response.status === 429) {
                    console.warn(`[Rate Limit] Coinbase 429 on history for ${symbol}`);
                }
            } catch (error) { }
            await new Promise(r => setTimeout(r, 200));
        }

        setCandles(prev => ({ ...prev, ...newCandles }));

        // Compute RSI(14) per symbol from the freshly fetched candles
        const rsiUpdates = {};
        Object.entries(newCandles).forEach(([symbol, data]) => {
            if (data && data.length >= 15) {
                const closes = data.map(c => c.close);
                let gains = 0, losses = 0;
                for (let i = 1; i <= 14; i++) {
                    const diff = closes[closes.length - i] - closes[closes.length - i - 1];
                    if (diff > 0) gains += diff; else losses -= diff;
                }
                let avgGain = gains / 14;
                let avgLoss = losses / 14;
                if (avgLoss === 0) { rsiUpdates[symbol] = 100; }
                else {
                    const rs = avgGain / avgLoss;
                    rsiUpdates[symbol] = parseFloat((100 - (100 / (1 + rs))).toFixed(1));
                }
            }
        });
        setRsiValues(prev => ({ ...prev, ...rsiUpdates }));
    };

    // Mount: Core intervals (prices + brain) — NOT tied to timeframe
    useEffect(() => {
        fetchPrices();
        fetchBrainData();
        fetchTimeframeChanges();

        const priceInterval = setInterval(fetchPrices, 5000); // Decelerated from 2000
        const brainInterval = setInterval(fetchBrainData, 15000); // Decelerated from 10000
        const changesInterval = setInterval(fetchTimeframeChanges, 60000); // 1 minute is fine

        return () => {
            clearInterval(priceInterval);
            clearInterval(brainInterval);
            clearInterval(changesInterval);
        };
    }, []);

    // Timeframe effect: fetch chart candles when timeframe changes
    useEffect(() => {
        fetchHistory(timeframe);
        const chartInterval = setInterval(() => fetchHistory(timeframe), 30000);
        return () => clearInterval(chartInterval);
    }, [timeframe]);

    // --- WALLET HELPERS ---
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
        } catch (e) { return { success: false, error: e.message }; }
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
        } catch (e) { return { success: false, error: "Incorrect Password" }; }
    };

    const lockWallet = () => { setActiveWallet(null); setWalletLocked(true); addToast("Wallet Locked", "info"); };

    // Balance Polling
    const fetchBalances = async () => {
        if (!walletAddress || walletLocked) return;
        try {
            const provider = new JsonRpcProvider(MONAD_RPC);
            const monBalance = await provider.getBalance(walletAddress);
            const monFormatted = parseFloat(formatEther(monBalance));
            setNativeBalance(monFormatted);

            const newPositions = [];
            const newRawBalances = {};
            const symbols = Object.keys(TOKENS).filter(k => k !== 'MON' && k !== 'XAUt');

            for (const sym of symbols) {
                const tokenAddress = TOKENS[sym];
                if (!tokenAddress) continue;
                try {
                    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
                    const bal = await contract.balanceOf(walletAddress);
                    const DECIMALS = { 'USDC': 6, 'BTC': 8, 'XAUT': 6, 'ETH': 18, 'WMON': 18, 'CAKE': 18, 'aUSD': 6 };
                    const decimals = DECIMALS[sym] || 18;
                    const formatted = parseFloat(formatUnits(bal, decimals));

                    if (formatted > 0) {
                        newRawBalances[sym] = formatted;

                        if (sym === 'USDC') { setUsdcBalance(formatted); continue; }
                        if (sym === 'aUSD') continue;

                        let priceKey = `${sym}-USD`;
                        if (sym === 'WMON') priceKey = 'MON-USD';
                        if (sym === 'XAUT') priceKey = 'XAUT-USD';

                        const currentPrice = pricesRef.current[priceKey] || prices[priceKey] || 0;
                        const value = formatted * currentPrice;

                        // Ignore dust (less than $0.05 value)
                        if (value > 0.05) {
                            // Preserve existing entry/fibPlan if matching position exists
                            const existingPos = walletRef.current.positions.find(p => p.symbol === priceKey);
                            const entryPrice = existingPos ? existingPos.entry : (currentPrice > 0 ? currentPrice : 0);
                            let fibPlan = existingPos?.fibPlan;
                            if (!fibPlan || !fibPlan.isDynamic) {
                                fibPlan = calculateDynamicFibStrategy(entryPrice, candles[priceKey] || []);
                            }

                            newPositions.push({
                                symbol: priceKey, size: formatted, entry: entryPrice,
                                pnl: (currentPrice - entryPrice) * formatted,
                                fibPlan: fibPlan // CRITICAL for persistence
                            });
                        }
                    }
                } catch (e) { }
                await new Promise(r => setTimeout(r, 200)); // Stagger RPC calls to prevent 429
            }
            setRawBalances(newRawBalances);
            setWallet(prev => ({
                ...prev, usdc: usdcBalance, monGas: monFormatted, positions: newPositions
            }));
        } catch (error) { }
    };
    useEffect(() => { if (!walletAddress || walletLocked) return; fetchBalances(); const interval = setInterval(fetchBalances, 11000); return () => clearInterval(interval); }, [walletAddress, walletLocked]);

    // Persist Wallet state continuously
    useEffect(() => {
        if (wallet) {
            localStorage.setItem(WALLET_DATA_KEY, JSON.stringify(wallet));
        }
    }, [wallet]);

    return {
        marketStats, prices, wallet, setWallet,
        activeWallet, walletLocked, walletAddress,
        logs, toasts, removeToast, addLog,
        autoPilot, setAutoPilot, slippageTolerance, setSlippageTolerance,
        executeTrade,
        createWallet, unlockWallet, lockWallet, walletExists,
        nativeBalance, usdcBalance, rawBalances,
        getTradePlan: (sym, price) => calculateDynamicFibStrategy(price, candles[sym] || []),
        rsiValues, smaValues, candles, changes24h,
        timeframe, changeTimeframe: (tf) => setTimeframe(tf),
        neuralAnalysis: {},
        exportPrivateKey: () => activeWallet ? activeWallet.privateKey : null
    };
};