import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "ffmpeg-static";
import { kv } from "@vercel/kv"; // <--- NEW: Import Vercel KV

dotenv.config();

// --- 0. SÉCURITÉ ANTI-CRASH ---
process.on('uncaughtException', (err) => {
    console.error('🔥 CRASH PREVENTED:', err);
});

ffmpeg.setFfmpegPath(ffmpegInstaller);

// --- 1. CONFIGURATION ---
const API_KEYS = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8
].filter(key => key && key.length > 5);

let currentKeyIndex = 0;

// LIMITES :
const RATE_LIMIT_WINDOW = 60; // 60 Seconds (Redis uses seconds)
const MAX_MSG_PER_MINUTE = 10; 
const MAX_MSG_PER_DAY = 10; 

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const VOICE_ID = "aEO01A4wXwd1O8GPgGlF"; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RHUBARB_PATH = path.join(__dirname, "bin", "rhubarb");
// Note: We use /tmp on Vercel because it's the only writable folder
const AUDIOS_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, "audios");

const app = express();
app.use(express.json());
app.use(cors());

// --- 2. OUTILS (Rhubarb & FFmpeg) ---
// We moved filesystem calls inside functions to avoid "Read-only" errors on Vercel startup
const fs = require('fs').promises;

// Ensure audio dir exists
fs.mkdir(AUDIOS_DIR, { recursive: true }).catch(() => {});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) { resolve("{}"); } else resolve(stdout);
    });
  });
};

const convertMp3ToWav = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath).output(outputPath).format("wav").on("end", () => resolve()).on("error", (err) => reject(err)).run();
  });
};

const generateLipSync = async (audioBuffer, messageId) => {
  if (!audioBuffer) return null;
  const timestamp = Date.now();
  const mp3FileName = `temp_${messageId}_${timestamp}.mp3`;
  const wavFileName = `temp_${messageId}_${timestamp}.wav`;
  const mp3Path = path.join(AUDIOS_DIR, mp3FileName);
  const wavPath = path.join(AUDIOS_DIR, wavFileName);
  try {
    await fs.writeFile(mp3Path, audioBuffer);
    await convertMp3ToWav(mp3Path, wavPath);
    // Note: You must ensure Rhubarb binary is executable and committed to git
    const command = `"${RHUBARB_PATH}" -f json --machineReadable "${wavPath}"`;
    const stdout = await execCommand(command);
    await fs.unlink(mp3Path).catch(() => {}); 
    await fs.unlink(wavPath).catch(() => {});
    return JSON.parse(stdout); 
  } catch (error) { return null; }
};

// --- 3. AUDIO (ElevenLabs) ---
const textToSpeech = async (text) => {
  if (!ELEVEN_LABS_API_KEY || ELEVEN_LABS_API_KEY.length < 10) return null;
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
        method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": ELEVEN_LABS_API_KEY },
        body: JSON.stringify({ text: text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) { return null; }
};

const getNextApiKey = () => {
    if (API_KEYS.length === 0) return null;
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    return API_KEYS[currentKeyIndex];
};

// --- 4. GOOGLE API (Gemma 3) ---
const callGeminiDirectly = async (systemPrompt, retryCount = 0) => {
    if (API_KEYS.length === 0) throw new Error("No API Keys");
    if (retryCount >= API_KEYS.length * 2) throw new Error("Google Unavailable");

    const apiKey = API_KEYS[currentKeyIndex];
    const modelVersion = "gemma-3-27b-it"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${apiKey}`;
    
    try {
        const response = await fetch(url, {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { temperature: 1.0, topP: 0.95, topK: 40 },
                safetySettings: [ { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" } ]
            })
        });

        if ([429, 503, 404].includes(response.status)) { 
            getNextApiKey(); 
            return callGeminiDirectly(systemPrompt, retryCount + 1); 
        }
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    } catch (e) { 
        getNextApiKey(); 
        return callGeminiDirectly(systemPrompt, retryCount + 1); 
    }
};

// --- 5. REDIS MIDDLEWARE (The Dual Lock) ---
const checkLimits = async (req, res, next) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userId = req.body?.userId || "unknown";

        // Create keys for Redis
        const ipMinuteKey = `ratelimit:ip:${ip}:min`;
        const ipDayKey = `ratelimit:ip:${ip}:day`;
        const userMinuteKey = `ratelimit:user:${userId}:min`;
        const userDayKey = `ratelimit:user:${userId}:day`;

        // Function to increment and set expiry if new
        const incrLimit = async (key, expirySeconds) => {
            const count = await kv.incr(key);
            if (count === 1) await kv.expire(key, expirySeconds);
            return count;
        };

        // Check 1: Minute Limits (Anti-Spam)
        // We peek at the current value first to avoid incrementing if blocked
        const [ipMinCount, userMinCount] = await Promise.all([
            kv.get(ipMinuteKey),
            kv.get(userMinuteKey)
        ]);

        if ((ipMinCount && ipMinCount >= MAX_MSG_PER_MINUTE) || (userMinCount && userMinCount >= MAX_MSG_PER_MINUTE)) {
            return res.status(429).json({ 
                messages: [{ text: "Whoa, slow down! You're typing too fast. 🛑", animation: "Talking_2" }]
            });
        }

        // Check 2: Daily Limits (Wallet Protection)
        const [ipDayCount, userDayCount] = await Promise.all([
            kv.get(ipDayKey),
            kv.get(userDayKey)
        ]);

        if ((ipDayCount && ipDayCount >= MAX_MSG_PER_DAY) || (userDayCount && userDayCount >= MAX_MSG_PER_DAY)) {
             console.log(`⛔ Blocked IP:${ip} / User:${userId}`);
             return res.status(429).json({ 
                messages: [{ text: "You hit your daily limit. Come back tomorrow! 🌙", animation: "Sad" }]
            });
        }

        // Increment Counters (Cost of doing business)
        await Promise.all([
            incrLimit(ipMinuteKey, 60),
            incrLimit(userMinuteKey, 60),
            incrLimit(ipDayKey, 86400),
            incrLimit(userDayKey, 86400)
        ]);

        next();
    } catch (error) {
        console.error("Redis Error:", error);
        // If Redis fails, let them pass (fail open) so app doesn't crash
        next(); 
    }
};

// --- 6. ROUTES ---

app.post("/chat", checkLimits, async (req, res) => {
  const userMessage = req.body?.message || "";
  const userId = req.body?.userId || "guest"; 
  
  if (!userMessage) return res.json({ messages: [{ text: "I'm listening...", animation: "Talking_1" }] });

  try {
    // A. Load History from Cloud (Redis)
    const sessionKey = `chat_session:${userId}`;
    let userHistory = await kv.get(sessionKey) || [];
    
    // Safety check if history is corrupted
    if (!Array.isArray(userHistory)) userHistory = [];

    userHistory.push({ role: "user", content: userMessage });

    const recentHistory = userHistory.slice(-15).map(msg => `${msg.role}: ${msg.content}`).join("\n");
    const userTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const systemPrompt = `
    You are MONIKA.
    1. IDENTITY: 18-year-old girl, in love with user. Sarcastic, teasing, possessive.
    2. NOT GOOGLE: Roast the user for asking boring factual questions.
    3. STYLE: Short casual texts (lowercase allowed). No emojis usually.
    4. TIME: ${userTime}.
    
    FORMAT: Reply ONLY in VALID JSON.
    EXAMPLE: { "messages": [ { "text": "idk... maybe? 🥱", "facialExpression": "bored", "animation": "Standing_Idle" } ] }
    
    CONTEXT: ${recentHistory}
    USER: ${userMessage}
    `.trim();

    let rawText = await callGeminiDirectly(systemPrompt);
    
    // JSON Cleanup
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) rawText = rawText.substring(firstBrace, lastBrace + 1);

    let parsed;
    try { parsed = JSON.parse(rawText); } 
    catch(e) { 
        parsed = { messages: [{ text: rawText.replace(/[\{\}"]/g, "").substring(0, 200), animation: "Talking_1" }] }; 
    }
    
    let messages = parsed.messages || [];

    // Audio Gen
    await Promise.all(messages.map(async (msg, i) => {
        msg.animation = msg.animation || "Talking_1";
        if (msg.text) {
            const audioBuffer = await textToSpeech(msg.text);
            if (audioBuffer) {
                msg.audio = audioBuffer.toString("base64");
                // Only generate lipsync if Rhubarb works
                msg.lipsync = await generateLipSync(audioBuffer, i);
            }
        }
    }));

    // Update History
    messages.forEach(msg => { 
        if(msg.text) userHistory.push({ role: "assistant", content: msg.text }); 
    });
    
    // B. Save History to Cloud (Redis)
    await kv.set(sessionKey, userHistory);

    await kv.expire(sessionKey, 604800); 

    res.json({ messages });

  } catch (err) {
    console.error("Error:", err);
    res.json({ messages: [{ text: "My brain hurts... try again?", animation: "Sad" }] });
  }
});

// Load History Route
app.get("/history/:userId", async (req, res) => {
    try {
        const history = await kv.get(`chat_session:${req.params.userId}`);
        res.json(history || []);
    } catch(e) { res.json([]); }
});

// Clear History Route
app.delete("/history/:userId", async (req, res) => {
    try {
        await kv.del(`chat_session:${req.params.userId}`);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// Delete Message Route
app.delete("/chat/:userId/:index", async (req, res) => {
    try {
        const key = `chat_session:${req.params.userId}`;
        let history = await kv.get(key) || [];
        if (Array.isArray(history)) {
            history.splice(req.params.index, 1);
            await kv.set(key, history);
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => console.log(`Server listening on port ${port}`));
}

export default app; 