import { GoogleGenerativeAI } from '@google/generative-ai';
import ort from 'onnxruntime-node';
import path from 'path';

// =========================================================================
// DUAL BRAIN: LEFT (monika.onnx) + RIGHT (Gemini API)
// =========================================================================

// --- LEFT BRAIN: monika.onnx model ---
let onnxSession = null;

export async function loadLeftBrain(modelDir) {
    try {
        const modelPath = path.resolve(modelDir, 'monika.onnx');
        onnxSession = await ort.InferenceSession.create(modelPath);
        console.log("LEFT BRAIN: MONIKA NEURAL ENGINE ONLINE (monika.onnx loaded)");
    } catch (e) {
        console.error("LEFT BRAIN OFFLINE:", e.message);
    }
}

export function getOnnxSession() {
    return onnxSession;
}

export function getOrt() {
    return ort;
}

// --- RIGHT BRAIN: Gemini API ---
export const warmUpMicroGPT = async () => {
    console.log("RIGHT BRAIN: GEMINI API ONLINE");
    return true;
};

// --- CONTEXT CACHE: Fear & Greed + News (5 min TTL) ---
let contextCache = null;
let contextCacheTime = 0;
const CONTEXT_TTL = 5 * 60 * 1000;

const fetchMarketContext = async () => {
    if (contextCache && (Date.now() - contextCacheTime < CONTEXT_TTL)) {
        return contextCache;
    }

    let greedScore = "Neutral";
    let topHeadlines = "No breaking news.";

    try {
        const fgRes = await fetch('https://api.alternative.me/fng/?limit=1');
        const fgData = await fgRes.json();
        greedScore = fgData.data?.[0]?.value_classification || "Neutral";
    } catch (err) {
        console.warn("Fear & Greed fetch failed:", err.message);
    }

    try {
        const newsRes = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
        const newsData = await newsRes.json();
        topHeadlines = newsData.Data?.slice(0, 2).map(n => n.title).join(" | ") || "No breaking news.";
    } catch (err) {
        console.warn("News fetch failed:", err.message);
    }

    contextCache = { greedScore, topHeadlines };
    contextCacheTime = Date.now();
    return contextCache;
};

// --- CACHE FOR RIGHT BRAIN RESPONSES (5 Min TTL per symbol) ---
const llmCache = {};
const LLM_CACHE_TTL = 5 * 60 * 1000;

// --- MAIN EXPORT: Generate trading reasoning ---
export const generateTradingReasoning = async (onnxScore, rsi, price, symbol, fibTargets = { tp: price * 1.02, sl: price * 0.95 }) => {
    if (!process.env.GROQ_API_KEY) {
        return { opinion: "FLAT", reasoning: "Right Brain offline (API key missing)." };
    }

    // Return cached reasoning if valid
    const now = Date.now();
    if (llmCache[symbol] && (now - llmCache[symbol].timestamp < LLM_CACHE_TTL)) {
        return llmCache[symbol].data;
    }

    const externalData = await fetchMarketContext();

    const safeRSI = typeof rsi === 'number' ? rsi : 50;
    const safeScore = typeof onnxScore === 'number' ? onnxScore : 50;

    // Safely parse targets to avoid .toFixed() crashes on undefined
    const tpTarget = fibTargets?.tp || (price * 1.02);
    const slTarget = fibTargets?.sl || (price * 0.95);

    const prompt = `You are Monika, an elite quantitative crypto trading AI. Your Neural Brain scored this asset ${safeScore.toFixed(0)}/100 (${safeScore >= 55 ? 'Bullish' : safeScore <= 45 ? 'Bearish' : 'Neutral'}).
Data: Price=$${price}. RSI=${safeRSI.toFixed(0)}. Sentiment: ${externalData.greedScore}.
News: ${externalData.topHeadlines}.
Potential Fib Targets (if executed): Target=$${tpTarget.toFixed(2)}, SL=$${slTarget.toFixed(2)}.
CRITICAL INSTRUCTION: Do NOT assume we should buy just because a Target exists. The Fib levels are purely mathematical. You MUST weigh the Neural Score, RSI, and News. If the Neural Score is Bearish or Neutral, lean towards DUMP or FLAT to protect capital. Only PUMP if the data is highly favorable.
Reply exactly with PUMP, DUMP, or FLAT, followed by a 15-word reasoning:`;

    try {
        const payload = {
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_tokens: 60
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        if (data.error) {
            console.error("Groq API error (Detailed):", JSON.stringify(data.error, null, 2));
            return { opinion: "FLAT", reasoning: "API error." };
        }

        let opinion = "FLAT";
        let reasoning = "Analysis failed.";

        const responseText = data.choices[0].message.content.trim();

        // Strip markdown and extract Decision/Reasoning cleanly
        const cleanText = responseText.replace(/\\*/g, '').trim();

        // Match the first word to determine PUMP/DUMP/FLAT
        const firstWordMatch = cleanText.match(/^(PUMP|DUMP|FLAT)/i);
        if (firstWordMatch) {
            opinion = firstWordMatch[1].toUpperCase();
            // Extract the rest of the text as reasoning
            const reasonStart = cleanText.substring(opinion.length).replace(/^[\s.:-]+/, '').trim();
            if (reasonStart.length > 0) {
                reasoning = reasonStart;
            }
        } else {
            // Fallback: search anywhere in the first 20 chars
            const intro = cleanText.substring(0, 20).toUpperCase();
            if (intro.includes("PUMP")) opinion = "PUMP";
            else if (intro.includes("DUMP")) opinion = "DUMP";
            reasoning = cleanText;
        }

        const finalResult = { opinion, reasoning: reasoning.slice(0, 150) };

        // Save to cache
        llmCache[symbol] = {
            timestamp: now,
            data: finalResult
        };

        return finalResult;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`[Failsafe triggered] Groq API timeout (3s) for ${symbol}. Returning FLAT.`);
            return { opinion: "FLAT", reasoning: "API timeout (Failsafe)." };
        }
        console.error("Groq inference error:", err.message);
        return { opinion: "FLAT", reasoning: "Inference error." };
    }
};
