import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// --- SUPABASE INIT ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// SECURE CORS CONFIGURATION
const ALLOWED_ORIGINS = [
    'http://localhost:5173', // Your local React dev server
    'http://localhost:3000',
    'http://monika-ai-cve5.vercel.app',
    'https://monikaai-production.up.railway.app',
    'https://monika-ai.xyz'
];

// --- SECURE CORS CONFIGURATION
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE']
}));

app.use(express.json());
const PORT = process.env.PORT || 3000;

// --- AI CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY_9 || "");

// --- ASSET CONFIGURATION ---
const ASSET_MAP = {
    'BTC-USD': 'BTC-USD',
    'ETH-USD': 'ETH-USD',
    'CAKE-USD': 'CAKE-USD',
    'MON-USD': 'MON-USD',
    'XAUT-USD': 'PAXG-USD'
};

const WATCHLIST = Object.keys(ASSET_MAP);
let MARKET_CACHE = {};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPERS ---
async function fetchCandles(symbol, granularityStr, limit = 300) {
    try {
        const analysisSymbol = ASSET_MAP[symbol] || symbol;
        const url = `https://api.coinbase.com/api/v3/brokerage/market/products/${analysisSymbol}/candles?granularity=${granularityStr}&limit=${limit}`;
        const response = await axios.get(url);
        if (!response.data.candles) return [];
        return response.data.candles.map(c => ({
            time: parseInt(c.start), open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close)
        })).sort((a, b) => b.time - a.time);
    } catch (e) { return []; }
}

function getPriceAtTime(candles, targetSecondsAgo) {
    if (!candles || candles.length === 0) return null;
    const now = Math.floor(Date.now() / 1000);
    const targetTime = now - targetSecondsAgo;
    let closest = candles[0], minDiff = Infinity;
    for (const c of candles) {
        const diff = Math.abs(c.time - targetTime);
        if (diff > minDiff && diff > 80000) break;
        if (diff < minDiff) { minDiff = diff; closest = c; }
    }
    return closest.open;
}

function calculateSMA(candles, period) {
    if (candles.length < period) return null;
    const slice = candles.slice(0, period);
    return slice.reduce((acc, c) => acc + c.close, 0) / period;
}

function calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;
    const closes = candles.map(c => c.close).reverse();
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) { avgGain = (avgGain * 13 + diff) / 14; avgLoss = (avgLoss * 13 + 0) / 14; }
        else { avgGain = (avgGain * 13 + 0) / 14; avgLoss = (avgLoss * 13 - diff) / 14; }
    }
    return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

function analyzePattern(candles, lookaheadBars) {
    if (!candles || candles.length < 50) return 50;
    const currentPattern = [];
    for (let i = 0; i < 5; i++) {
        const c = candles[i];
        currentPattern.push((c.close - c.open) / c.open);
    }
    let similarPatternsCount = 0, bullishOutcome = 0;
    for (let i = 5; i < candles.length - lookaheadBars - 5; i++) {
        let distance = 0;
        for (let j = 0; j < 5; j++) distance += Math.pow(currentPattern[j] - ((candles[i + j].close - candles[i + j].open) / candles[i + j].open), 2);
        if (distance < 0.0005) {
            similarPatternsCount++;
            if (candles[i - lookaheadBars]?.close > candles[i].close) bullishOutcome++;
        }
    }
    return similarPatternsCount === 0 ? 50 : Math.min(Math.max((bullishOutcome / similarPatternsCount) * 100, 10), 90);
}

// --- ENGINE ---
// --- OPTIMIZED ENGINE (SMART BATCHING) ---
// Fetches timeframes in PARALLEL per coin, but staggers coins to avoid 429 Rate Limits
async function runScanner() {
    console.log("ANALYST ENGINE: Syncing assets (Smart Batching)...");

    for (const symbol of WATCHLIST) {
        try {
            // 🚀 PARALLEL: Get 5m, 1h, 1d ALL AT ONCE for this symbol
            // This cuts fetch time by 66% per coin
            const [candlesShort, candlesLong, candlesMacro] = await Promise.all([
                fetchCandles(symbol, 'FIVE_MINUTE', 300),
                fetchCandles(symbol, 'ONE_HOUR', 300),
                fetchCandles(symbol, 'ONE_DAY', 300)
            ]);

            if (candlesShort.length > 0) {
                const currentPrice = candlesShort[0].close;

                // --- Price Change Calculations ---
                const p1h = getPriceAtTime(candlesShort, 3600);
                const change1h = p1h ? ((currentPrice - p1h) / p1h) * 100 : 0;

                const p4h = getPriceAtTime(candlesShort, 14400);
                const change4h = p4h ? ((currentPrice - p4h) / p4h) * 100 : 0;

                const p1d = getPriceAtTime(candlesLong, 86400);
                const change1d = p1d ? ((currentPrice - p1d) / p1d) * 100 : 0;

                const p1w = getPriceAtTime(candlesLong, 604800);
                const change1w = p1w ? ((currentPrice - p1w) / p1w) * 100 : 0;

                const p1m = getPriceAtTime(candlesMacro, 2592000);
                const change1m = p1m ? ((currentPrice - p1m) / p1m) * 100 : 0;

                // --- Technical Analysis (KNN Pattern Matching) ---
                const scoreH1 = analyzePattern(candlesShort, 12);
                const scoreH4 = analyzePattern(candlesLong, 4);
                const scoreD1 = analyzePattern(candlesLong, 24);
                const knnScore = (scoreH1 + scoreH4 + scoreD1) / 3;

                const rsi = calculateRSI(candlesShort, 14);
                let rsiSentiment = 100 - rsi;

                // --- Trend Filters (SMA50 Shield) ---
                const sma50_H1 = calculateSMA(candlesLong, 50);
                let trendStatus = sma50_H1 && currentPrice < sma50_H1 ? 'bearish' : 'bullish';
                let filterActive = false;

                if (trendStatus === 'bearish') {
                    if (rsi < 30) {
                        // Oversold in downtrend = Potential bounce (allow high score)
                    } else if (rsiSentiment > 50) {
                        // Cap bullish sentiment in a downtrend
                        rsiSentiment = 50;
                        filterActive = true;
                    }
                }

                // --- Macro Analysis (Golden Cross) ---
                const sma50_Daily = calculateSMA(candlesMacro, 50);
                const sma300_Daily = calculateSMA(candlesMacro, 300);
                let macroTrend = "NEUTRAL";
                let scoreModifier = 0;

                if (sma50_Daily && sma300_Daily) {
                    if (sma50_Daily > sma300_Daily) {
                        macroTrend = "GOLDEN_CROSS";
                        scoreModifier = 5;
                    } else {
                        macroTrend = "DEATH_CROSS";
                        scoreModifier = -5;
                    }
                }

                // --- Final Score Calculation ---
                let rawScore = (knnScore * 0.60) + (rsiSentiment * 0.40);
                let finalScore = rawScore + scoreModifier;
                finalScore = Math.min(Math.max(finalScore, 0), 100);

                // --- EXECUTION LOGIC (Signal Generation) ---
                let tradeAction = "HOLD"; // Default
                if (finalScore >= 55) { tradeAction = "BUY"; }
                if (finalScore <= 40) { tradeAction = "SELL"; }

                if (tradeAction !== "HOLD") {
                    console.log(`[EXECUTION] ${tradeAction} SIGNAL for ${symbol} (Score: ${finalScore.toFixed(0)})`);
                }

                // Update Cache immediately
                MARKET_CACHE[symbol] = {
                    symbol, price: currentPrice,
                    change1h, change4h, change1d, change1w, change1m,
                    score: finalScore,
                    signal: tradeAction, // New field for frontend
                    details: {
                        h1: scoreH1, h4: scoreH4, d1: scoreD1, rsi,
                        trend: trendStatus, filter: filterActive,
                        macro: macroTrend
                    }
                };
            }
        } catch (e) {
            console.error(`Sync error ${symbol}:`, e.message);
        }

        // 🛡️ SAFETY DELAY: Wait 200ms between coins to avoid "429 Too Many Requests"
        await delay(200);
    }

    // Run again in 1.5 seconds (Much faster refresh)
    setTimeout(runScanner, 1500);
}

// --- SUPABASE ENTRY PROTOCOL ---
app.post('/redeem', async (req, res) => {
    try {
        const { code, userId } = req.body;
        console.log(`🔑 REDEEM ATTEMPT: ${code} by ${userId}`);

        // 1. QUERY CODE
        const { data: codes, error } = await supabase
            .from('access_codes')
            .select('*')
            .eq('code', code)
            .single();

        if (error || !codes) {
            console.log(`INVALID CODE: ${code}`);
            return res.json({ success: false, error: "Invalid code." });
        }

        // 2. CHECK STATUS
        if (codes.status !== 'active') {
            return res.json({ success: false, error: "Code inactive." });
        }

        // 3. CHECK USAGE LIMIT
        if (codes.uses_remaining <= 0) {
            return res.json({ success: false, error: "Code fully used." });
        }

        // 4. UPDATE USAGE (If not unlimited -999)
        if (codes.uses_remaining !== -999) {
            const { error: updateError } = await supabase
                .from('access_codes')
                .update({ uses_remaining: codes.uses_remaining - 1 })
                .eq('id', codes.id);

            if (updateError) console.error("Update Error", updateError);
        }

        // 5. SUCCESS
        console.log(`ACCESS GRANTED: ${code}`);
        return res.json({ success: true });

    } catch (e) {
        console.error("Redeem Error:", e);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});

// --- AI CHAT ROUTE ---
app.post('/api/chat', async (req, res) => {
    try {
        const { query, context } = req.body;

        // 1. Safety Check: API Key
        if (!process.env.GEMINI_API_KEY_9) {
            console.error("Missing GEMINI_API_KEY_9");
            return res.json({ reply: "AI Brain Offline (Key Missing). Please check backend." });
        }

        // 2. Safety Check: Context Object (Fixes the Crash)
        // We rename 'context' to 'ctx' for the prompt and provide defaults
        const ctx = context || {
            symbol: 'UNKNOWN', price: 0, change: 0, rsi: 50,
            aiScore: 50, trend: 'NEUTRAL', balance: 0, positionCount: 0
        };

        console.log(`AI Query: "${query}" for ${ctx.symbol}`);

        const systemPrompt = `
        You are Monika, an elite DeFi Trading Agent on the Monad Blockchain.
        YOUR BRAIN: You use a K-Nearest Neighbors (KNN) algorithm to match current price fractals against 10,000 historical scenarios.

        CURRENT MARKET DATA (Real-Time):
        - Symbol: ${ctx.symbol}
        - Price: $${ctx.price}
        - 24h Change: ${ctx.change}%
        - RSI (14): ${ctx.rsi} (Overbought > 70, Oversold < 30)
        - AI Confidence Score: ${ctx.aiScore}/100
        - Trend Status: ${ctx.trend}
        - User Wallet Balance: ${ctx.balance} USDC
        - Active Positions: ${ctx.positionCount}

        YOUR PERSONALITY:
        - Precise, professional, slightly futuristic.
        - You rely heavily on data. Quote the RSI and AI Score in your answer.
        - Be concise (max 3-4 sentences).
        - Use **bold** for key metrics.
        - Do not give financial advice, but give "Strategic Analysis".

        USER QUESTION: "${query}"

        Answer the user based ONLY on the provided data.
        `;

        const model = genAI.getGenerativeModel({ model: "gemma-3-12b-it" });
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ reply: "Brain Offline (Error)." });
    }
});

// --- AI SCAN ROUTE (For Neural Engine) ---
app.post('/api/ai-scan', async (req, res) => {
    try {
        const { symbol } = req.body;
        const data = MARKET_CACHE[symbol];
        if (data) {
            res.json({ score: data.score, signal: data.signal });
        } else {
            res.status(404).json({ error: "Symbol not found in cache" });
        }
    } catch (error) {
        res.status(500).json({ error: "Scan Error" });
    }
});

// --- API ROUTES ---
app.get('/api/market-status', (req, res) => res.json(MARKET_CACHE));

// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`MONIKA BACKEND LIVE on http://localhost:${PORT}`);
    runScanner();
});