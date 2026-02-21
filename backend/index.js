import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTradingReasoning, warmUpMicroGPT, loadLeftBrain, getOnnxSession, getOrt } from './nlpEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// --- SUPABASE INIT ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// SECURE CORS CONFIGURATION
const ALLOWED_ORIGINS = [
    'http://localhost:5173', // Your local React dev server
    'http://localhost:5174', // Secondary local dev server
    'http://localhost:3000',
    'http://monika-ai-cve5.vercel.app',
    'https://monikaai-production.up.railway.app',
    'https://monika-ai.xyz',
    'https://www.monika-ai.xyz' // Explicitly added the 'www' subdomain 
];

// --- SECURE CORS CONFIGURATION
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    credentials: true // Important for cookies/sessions if used later on.
}));

app.use(express.json());
const PORT = process.env.PORT || 3000;

// --- AI CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY_9 || "");

// --- DUAL BRAIN INITIALIZATION ---
// MicroGPT first (initializes ONNX runtime), then monika.onnx (reuses it)
async function initBrains() {
    await warmUpMicroGPT();        // Right Brain first
    await loadLeftBrain(__dirname); // Left Brain second (shares ONNX runtime)
}
initBrains();


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

// --- HELPERS (Candles, SMA, RSI, Pattern Analysis) ---
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

// --- FRACTAL PIVOT DETECTION (For AI Reasoning) ---
function findStructuralPivots(candles) {
    let trueSwingHigh = -Infinity;
    let trueSwingLow = Infinity;
    for (let i = 2; i < candles.length - 2; i++) {
        const current = candles[i];
        const isPivotHigh = current.high > candles[i - 1].high && current.high > candles[i - 2].high &&
            current.high > candles[i + 1].high && current.high > candles[i + 2].high;
        const isPivotLow = current.low < candles[i - 1].low && current.low < candles[i - 2].low &&
            current.low < candles[i + 1].low && current.low < candles[i + 2].low;
        if (isPivotHigh && current.high > trueSwingHigh) trueSwingHigh = current.high;
        if (isPivotLow && current.low < trueSwingLow) trueSwingLow = current.low;
    }
    return { trueSwingHigh, trueSwingLow };
}

function calculateDynamicFibStrategy(candles) {
    if (!candles || candles.length === 0) {
        return { tp: 0, dca1: 0, dca2: 0, sl: 0 };
    }
    const currentPrice = candles[0].close;
    if (candles.length < 20) {
        return { tp: currentPrice * 1.02, dca1: currentPrice * 0.98, dca2: currentPrice * 0.95, sl: currentPrice * 0.92 };
    }
    const recentCandles = candles.slice(0, 50); // Note: backend candles are reverse chronological
    const { trueSwingHigh, trueSwingLow } = findStructuralPivots(recentCandles);
    const swingHigh = trueSwingHigh !== -Infinity ? trueSwingHigh : Math.max(...recentCandles.map(c => c.high || c.close));
    const swingLow = trueSwingLow !== Infinity ? trueSwingLow : Math.min(...recentCandles.map(c => c.low || c.close));
    const range = swingHigh - swingLow;
    if (range === 0) return { tp: currentPrice * 1.02, dca1: currentPrice * 0.98, dca2: currentPrice * 0.95, sl: currentPrice * 0.92 };
    const tpLevel = swingHigh + (range * 0.272);
    const slLevel = swingLow - (swingLow * 0.02);
    return { tp: Math.max(tpLevel, currentPrice * 1.01), sl: Math.min(slLevel, currentPrice * 0.95) };
}

// --- NEURAL SCORING: Use monika.onnx to score candle data (0-100 bullish) ---
async function neuralScore(candles) {
    if (!getOnnxSession()) { console.warn("neuralScore: aiSession not loaded"); return 50; }
    if (!candles || candles.length < 10) { console.warn("neuralScore: insufficient candles:", candles?.length); return 50; }
    try {
        // Use up to 65 candles, minimum 10
        const count = Math.min(candles.length, 65);
        const recent = candles.slice(0, count).reverse();
        const tokens = [];
        for (let i = 1; i < recent.length; i++) {
            const pct = (recent[i].close - recent[i - 1].close) / recent[i - 1].close;
            if (pct < -0.02) tokens.push(0n);
            else if (pct < -0.005) tokens.push(1n);
            else if (pct > 0.02) tokens.push(4n);
            else if (pct > 0.005) tokens.push(3n);
            else tokens.push(2n);
        }

        // Pad to 64 tokens with FLAT (2n) if we have fewer candles
        while (tokens.length < 64) {
            tokens.unshift(2n); // prepend FLAT tokens
        }

        const inputTensor = new (getOrt()).Tensor('int64', BigInt64Array.from(tokens), [1, 64]);
        const results = await getOnnxSession().run({ input_ids: inputTensor });
        const logits = results.logits.data;

        // Convert 5-class probabilities to weighted bullish score (0-100)
        // Classes: [BIG_DUMP=0, DUMP=25, FLAT=50, PUMP=75, BIG_PUMP=100]
        const classWeights = [0, 25, 50, 75, 100];
        const expLogits = Array.from(logits).map(v => Math.exp(v));
        const sumExp = expLogits.reduce((a, b) => a + b, 0);
        const probs = expLogits.map(e => e / sumExp);

        let score = 0;
        for (let i = 0; i < probs.length; i++) {
            score += probs[i] * classWeights[i];
        }
        return Math.min(Math.max(score, 5), 95);
    } catch (err) {
        console.error("Neural Score Error:", err.message);
        return 50;
    }
}

// --- OPTIMIZED ENGINE ---
async function runScanner() {
    console.log("ANALYST ENGINE: Syncing assets (Smart Batching)...");

    for (const symbol of WATCHLIST) {
        try {
            const [candlesShort, candlesLong, candlesMacro] = await Promise.all([
                fetchCandles(symbol, 'FIVE_MINUTE', 300),
                fetchCandles(symbol, 'ONE_HOUR', 300),
                fetchCandles(symbol, 'ONE_DAY', 300)
            ]);

            if (candlesShort.length >= 65) {
                const currentPrice = candlesShort[0].close;

                // --- 1. NEURAL BRAIN ANALYSIS (monika.onnx on 5-min candles) ---
                let neuralPrediction = "FLAT";
                let neuralConfidence = 0;

                if (getOnnxSession()) {
                    try {
                        const recent = candlesShort.slice(0, 65).reverse();
                        const tokens = [];
                        for (let i = 1; i < recent.length; i++) {
                            const pct = (recent[i].close - recent[i - 1].close) / recent[i - 1].close;
                            if (pct < -0.02) tokens.push(0n);
                            else if (pct < -0.005) tokens.push(1n);
                            else if (pct > 0.02) tokens.push(4n);
                            else if (pct > 0.005) tokens.push(3n);
                            else tokens.push(2n);
                        }

                        const inputTensor = new (getOrt()).Tensor('int64', BigInt64Array.from(tokens), [1, 64]);
                        const results = await getOnnxSession().run({ input_ids: inputTensor });
                        const logits = results.logits.data;

                        const maxIdx = Array.from(logits).indexOf(Math.max(...logits));
                        const labels = ["BIG_DUMP", "DUMP", "FLAT", "PUMP", "BIG_PUMP"];
                        neuralPrediction = labels[maxIdx];

                        const expLogits = Array.from(logits).map(v => Math.exp(v));
                        const sumExp = expLogits.reduce((a, b) => a + b, 0);
                        neuralConfidence = expLogits[maxIdx] / sumExp;
                    } catch (err) {
                        console.error("Neural Inference Error:", err.message);
                    }
                }

                // --- 2. NEURAL KNN SCORES (monika.onnx per timeframe) ---
                const [scoreH1, scoreH4, scoreD1] = await Promise.all([
                    neuralScore(candlesShort),      // H1: 5-min candles
                    neuralScore(candlesLong),        // H4: 1-hour candles
                    neuralScore(candlesMacro),       // D1: daily candles
                ]);
                const knnScore = (scoreH1 + scoreH4 + scoreD1) / 3;
                console.log(`[${symbol}] Neural → H1:${scoreH1.toFixed(1)} H4:${scoreH4.toFixed(1)} D1:${scoreD1.toFixed(1)} Brain:${neuralPrediction}(${(neuralConfidence * 100).toFixed(0)}%)`);

                const rsi = calculateRSI(candlesShort, 14);
                let rsiSentiment = 100 - rsi;

                // --- 3. AGGREGATED FINAL SCORE ---
                // Calculate base scores first
                let rawScore = (knnScore * 0.60) + (rsiSentiment * 0.40);

                // Macro logic
                const sma50_Daily = calculateSMA(candlesMacro, 50);
                const sma300_Daily = calculateSMA(candlesMacro, 300);
                let scoreModifier = 0;
                let macroTrend = "NEUTRAL";

                if (sma50_Daily && sma300_Daily) {
                    if (sma50_Daily > sma300_Daily) {
                        macroTrend = "GOLDEN_CROSS";
                        scoreModifier = 5;
                    } else {
                        macroTrend = "DEATH_CROSS";
                        scoreModifier = -5;
                    }
                }

                // INITIAL finalScore declaration
                let finalScore = rawScore + scoreModifier;

                // NEURAL OVERRIDE: High-confidence neural signals override lagging SMA penalties
                // This prevents a stale Death Cross from suppressing a strong PUMP prediction
                if (neuralPrediction.includes("PUMP") && neuralConfidence > 0.80) {
                    // High-confidence PUMP: override Death Cross penalty
                    if (macroTrend === "DEATH_CROSS") {
                        finalScore -= scoreModifier; // Remove the -5 penalty
                        if (neuralConfidence > 0.90) finalScore += 3; // Add a small boost
                    }
                    finalScore += (15 * neuralConfidence); // Stronger neural boost for high confidence
                } else if (neuralPrediction.includes("PUMP")) {
                    finalScore += (10 * neuralConfidence); // Normal neural boost
                } else if (neuralPrediction.includes("DUMP") && neuralConfidence > 0.80) {
                    if (macroTrend === "GOLDEN_CROSS") {
                        finalScore -= scoreModifier; // Remove the +5 bonus
                    }
                    finalScore -= (15 * neuralConfidence);
                } else if (neuralPrediction.includes("DUMP")) {
                    finalScore -= (10 * neuralConfidence);
                }

                finalScore = Math.min(Math.max(finalScore, 0), 100);

                // --- TREND FILTERS ---
                const sma50_H1 = calculateSMA(candlesLong, 50);
                let trendStatus = sma50_H1 && currentPrice < sma50_H1 ? 'bearish' : 'bullish';

                // --- MARKET STRUCTURE SCORES (per timeframe) ---
                // Composite: price vs SMA (40%) + RSI (30%) + momentum (30%)
                const calcStructure = (candles, period) => {
                    if (!candles || candles.length < period + 5) return 50;
                    const sma = calculateSMA(candles, period);
                    const price = candles[0].close;
                    if (!sma) return 50;

                    // 1. Price vs SMA (0-100): above SMA = bullish
                    const pctFromSMA = ((price - sma) / sma) * 100;
                    const smaScore = Math.min(Math.max(50 + (pctFromSMA * 5), 5), 95);

                    // 2. RSI per timeframe
                    const tfRSI = calculateRSI(candles, 14);
                    const rsiScore = 100 - tfRSI; // Inverted: low RSI = bullish

                    // 3. Momentum: recent 5-candle direction
                    const recent5 = candles.slice(0, 5);
                    const momPct = ((recent5[0].close - recent5[4].close) / recent5[4].close) * 100;
                    const momScore = Math.min(Math.max(50 + (momPct * 10), 5), 95);

                    return Math.min(Math.max((smaScore * 0.40) + (rsiScore * 0.30) + (momScore * 0.30), 5), 95);
                };

                const structH1 = calcStructure(candlesShort, 20);  // 5-min candles, SMA20
                const structH4 = calcStructure(candlesLong, 20);   // 1-hour candles, SMA20
                const structD1 = calcStructure(candlesMacro, 20);  // Daily candles, SMA20
                console.log(`[${symbol}] Structure → H1:${structH1.toFixed(1)} H4:${structH4.toFixed(1)} D1:${structD1.toFixed(1)} Score:${finalScore.toFixed(1)}`);

                // --- EXECUTION LOGIC ---
                let tradeAction = "HOLD";
                if (finalScore >= 52) tradeAction = "BUY";
                if (finalScore <= 45) tradeAction = "SELL";

                // --- CACHE UPDATE (immediate with Left Brain data) ---
                MARKET_CACHE[symbol] = {
                    symbol, price: currentPrice, score: finalScore,
                    aiOpinion: neuralPrediction, aiConfidence: (neuralConfidence * 100).toFixed(1),
                    signal: tradeAction,
                    aiReasoning: MARKET_CACHE[symbol]?.aiReasoning || 'Analyzing...',
                    details: {
                        h1: structH1, h4: structH4, d1: structD1, rsi,
                        trend: trendStatus, macro: macroTrend
                    }
                };

                // --- RIGHT BRAIN: Async MicroGPT reasoning (non-blocking) ---
                const fibTargets = calculateDynamicFibStrategy(candlesShort);
                generateTradingReasoning(finalScore, rsi, currentPrice, symbol, fibTargets).then(result => {
                    if (MARKET_CACHE[symbol]) {
                        // Override opinion if LLM has a strong take
                        if (result.opinion !== 'FLAT') {
                            MARKET_CACHE[symbol].aiOpinion = result.opinion;
                        }
                        MARKET_CACHE[symbol].aiReasoning = result.reasoning;
                        console.log(`[${symbol}] Right Brain: ${result.opinion} — ${result.reasoning.slice(0, 60)}`);
                    }
                }).catch(() => { });
            }
        } catch (e) {
            console.error(`Sync error ${symbol}:`, e.message);
        }
        await delay(200);
    }
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

        if (!process.env.GEMINI_API_KEY_9) {
            return res.json({ reply: "AI Brain Offline (Key Missing)." });
        }

        const ctx = context || {};
        console.log(`AI Query: "${query}" for ${ctx.activeSymbol || 'UNKNOWN'}`);

        // Build cross-market summary string
        const crossMarketSummary = (ctx.crossMarket || []).map(c =>
            `${c.symbol}: $${c.price} | Score:${typeof c.score === 'number' ? c.score.toFixed(1) : c.score} | ${c.signal} | ${c.aiOpinion}(${c.aiConfidence}%) | H1:${c.structure?.h1?.toFixed?.(0) || '?'} H4:${c.structure?.h4?.toFixed?.(0) || '?'} D1:${c.structure?.d1?.toFixed?.(0) || '?'}`
        ).join('\n        ');

        // Build positions summary
        const positionsSummary = (ctx.positions || []).length > 0
            ? ctx.positions.map(p => `${p.symbol}: Size $${p.size} | Entry $${p.entry}`).join(', ')
            : 'No active positions';

        const systemPrompt = `
        You are Monika, an elite DeFi Trading Agent with a Dual-Brain Architecture on the Monad Blockchain.

        YOUR DUAL-BRAIN SYSTEM:
        - LEFT BRAIN (monika.onnx): Neural pattern recognition trained on historical price data. Outputs PUMP/DUMP/FLAT prediction with confidence percentage.
        - RIGHT BRAIN (MicroGPT): LLM situational awareness that reads the Fear & Greed Index and live crypto news headlines to generate contextual market reasoning.

        ═══════════════════════════════════════
        ACTIVE ASSET: ${ctx.activeSymbol || 'UNKNOWN'}
        ═══════════════════════════════════════
        Price: $${ctx.price || 0}
        Final Score: ${typeof ctx.score === 'number' ? ctx.score.toFixed(1) : ctx.score || 50}/100
        Signal: ${ctx.signal || 'HOLD'}
        RSI (14): ${typeof ctx.rsi === 'number' ? ctx.rsi.toFixed(1) : ctx.rsi || 50}

        LEFT BRAIN Opinion: ${ctx.aiOpinion || 'NEUTRAL'} (${ctx.aiConfidence || 0}% confidence)
        RIGHT BRAIN Reasoning: "${ctx.aiReasoning || 'No reasoning available'}"

        MARKET STRUCTURE (0-100):
        - H1 (Short-term): ${typeof ctx.structH1 === 'number' ? ctx.structH1.toFixed(1) : ctx.structH1 || 50}
        - H4 (Medium-term): ${typeof ctx.structH4 === 'number' ? ctx.structH4.toFixed(1) : ctx.structH4 || 50}
        - D1 (Long-term): ${typeof ctx.structD1 === 'number' ? ctx.structD1.toFixed(1) : ctx.structD1 || 50}
        (Above 55 = bullish structure, Below 45 = bearish structure)

        Trend (SMA50): ${ctx.trend || 'neutral'}
        Macro (SMA50 vs SMA300): ${ctx.macro || 'NEUTRAL'}

        ═══════════════════════════════════════
        CROSS-MARKET OVERVIEW (All Assets):
        ═══════════════════════════════════════
        ${crossMarketSummary || 'No cross-market data'}

        ═══════════════════════════════════════
        WALLET STATE:
        ═══════════════════════════════════════
        Balance: ${ctx.balance || 0} USDC
        Active Positions: ${positionsSummary}

        YOUR PERSONALITY & RULES:
        - You are an expert trader. Be precise, data-driven, and professional.
        - Always reference BOTH brains: cite the Left Brain prediction, Right Brain reasoning, AND the market structure.
        - Use the cross-market data when comparing assets or giving portfolio advice.
        - Quote specific numbers: RSI, scores, structure values, confidence percentages.
        - Be concise (max 4-5 sentences) unless the user asks for detail.
        - Use **bold** for key metrics and predictions.
        - You give "Strategic Analysis", not financial advice.
        - If data shows conflicting signals between brains, acknowledge the divergence and explain what it means.

        USER QUESTION: "${query}"

        Answer using ALL the provided data. Think like an expert analyst who has access to both AI models, technical indicators, and market sentiment.
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

// --- AI PREDICTION ROUTE (NEURAL ENGINE) ---
app.post('/api/predict', async (req, res) => {
    const { prices } = req.body;

    if (!getOnnxSession()) return res.status(500).json({ error: "Neural Engine Offline" });
    if (!prices || prices.length < 65) return res.status(400).json({ error: "Need 65 candles for analysis" });

    try {
        const BLOCK_SIZE = 64;
        const recentPrices = prices.slice(-65);

        // Tokenization (Matching Python logic exactly)
        const tokens = [];
        for (let i = 1; i < recentPrices.length; i++) {
            const pct = (recentPrices[i] - recentPrices[i - 1]) / recentPrices[i - 1];
            if (pct < -0.02) tokens.push(0n);
            else if (pct < -0.005) tokens.push(1n);
            else if (pct > 0.02) tokens.push(4n);
            else if (pct > 0.005) tokens.push(3n);
            else tokens.push(2n);
        }

        // Prepare Tensor for ONNX
        const inputTensor = new (getOrt()).Tensor('int64', BigInt64Array.from(tokens), [1, BLOCK_SIZE]);

        // Run Inference
        const results = await getOnnxSession().run({ input_ids: inputTensor });
        const logits = results.logits.data;

        // Find Best Prediction (Argmax)
        let maxIdx = 0;
        let maxVal = logits[0];
        for (let i = 1; i < logits.length; i++) {
            if (logits[i] > maxVal) {
                maxVal = logits[i];
                maxIdx = i;
            }
        }

        const labels = ["BIG_DUMP", "DUMP", "FLAT", "PUMP", "BIG_PUMP"];
        res.json({
            prediction: labels[maxIdx],
            token: maxIdx,
            confidence: Math.exp(maxVal) / Array.from(logits).reduce((a, b) => a + Math.exp(b), 0)
        });

    } catch (err) {
        console.error("Neural Error:", err);
        res.status(500).json({ error: "Neural Brain Freeze", details: err.message });
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

// --- LEGACY 3D AVATAR CHAT ROUTES (Restored to fix CORS/502 errors) ---
const sessions = {};
const saveSessions = () => { };

app.get("/history/:userId", (req, res) => {
    const userId = req.params.userId;
    res.json(sessions[userId] || []);
});

app.delete("/history/:userId", async (req, res) => {
    const { userId } = req.params;
    sessions[userId] = [];
    saveSessions();
    res.json({ success: true });
});

app.delete("/chat/:userId/:index", async (req, res) => {
    const { userId, index } = req.params;
    if (sessions[userId]) {
        sessions[userId].splice(index, 1);
        saveSessions();
    }
    res.json({ success: true });
});

app.post("/chat", async (req, res) => {
    const { message, userId } = req.body;

    if (!sessions[userId]) sessions[userId] = [];
    sessions[userId].push({ role: "user", content: message });

    // Simplistic fallback response matching the expected 3D format
    const replyText = "I am processing market data. How can I help you today?";
    const assistantMessage = {
        role: "assistant",
        text: replyText,
        content: replyText,
        facialExpression: "smile",
        animation: "Talking_1",
        audio: null // Voice generated responses skipped for now to avoid crashing
    };

    sessions[userId].push(assistantMessage);
    saveSessions();

    res.json({ messages: [assistantMessage] });
});

// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`🚀 MONIKA BACKEND LIVE on PORT ${PORT}`);
    runScanner();
});