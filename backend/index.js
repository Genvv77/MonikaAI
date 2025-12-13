import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";
import { promises as fs } from "fs";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "ffmpeg-static";

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
// - RATE_LIMIT_WINDOW : Fenêtre de temps (1 minute)
// - MAX_MSG_PER_MINUTE : Max messages par UTILISATEUR (pour éviter le spam individuel)
const RATE_LIMIT_WINDOW = 60 * 1000; 
const MAX_MSG_PER_MINUTE = 10; 
const userQuotas = {};               

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const VOICE_ID = "aEO01A4wXwd1O8GPgGlF"; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RHUBARB_PATH = path.join(__dirname, "bin", "rhubarb");
const AUDIOS_DIR = path.join(__dirname, "audios");
const DATA_FILE = path.join(__dirname, "sessions.json");

const app = express();
app.use(express.json());
app.use(cors());

const port = 3000;
let sessions = {};

// --- 2. MÉMOIRE (Chargement & Sauvegarde) ---
const loadSessions = async () => {
    try {
        if (await fs.stat(DATA_FILE).catch(() => false)) {
            const data = await fs.readFile(DATA_FILE, 'utf8');
            if (data.trim()) sessions = JSON.parse(data);
        } else {
            sessions = {};
        }
    } catch (error) {
        sessions = {};
    }
};
loadSessions();

const saveSessions = async () => {
    try { await fs.writeFile(DATA_FILE, JSON.stringify(sessions, null, 2)); } catch (e) {}
};

fs.mkdir(AUDIOS_DIR, { recursive: true }).catch(console.error);

// --- 3. OUTILS (Rhubarb & FFmpeg) ---
const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      // On ignore les warnings mineurs de Rhubarb
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
    const command = `"${RHUBARB_PATH}" -f json --machineReadable "${wavPath}"`;
    const stdout = await execCommand(command);
    await fs.unlink(mp3Path).catch(() => {}); 
    await fs.unlink(wavPath).catch(() => {});
    return JSON.parse(stdout); 
  } catch (error) { return null; }
};

// --- 4. AUDIO (ElevenLabs) ---
const textToSpeech = async (text) => {
  if (!ELEVEN_LABS_API_KEY || ELEVEN_LABS_API_KEY.length < 10) {
      console.warn("⚠️ Audio ignoré : Clé ElevenLabs manquante");
      return null;
  }
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
        method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": ELEVEN_LABS_API_KEY },
        body: JSON.stringify({ text: text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!response.ok) {
        console.error("❌ ElevenLabs Erreur:", await response.text());
        return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) { return null; }
};

const getNextApiKey = () => {
    if (API_KEYS.length === 0) return null;
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`🔄 Rotation vers la clé API n°${currentKeyIndex + 1}`);
    return API_KEYS[currentKeyIndex];
};

// --- 5. GOOGLE API (Gemma 3 + Rotation Robuste) ---
const callGeminiDirectly = async (systemPrompt, retryCount = 0) => {
    if (API_KEYS.length === 0) throw new Error("Aucune clé API !");
    
    // Si on a essayé toutes les clés x 2, on arrête pour éviter une boucle infinie
    if (retryCount >= API_KEYS.length * 2) throw new Error("Google est inaccessible (toutes clés testées).");

    const apiKey = API_KEYS[currentKeyIndex];
    
    // Modèle Gemma 3 (Haut débit TPM/RPD)
    const modelVersion = "gemma-3-27b-it"; 
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${apiKey}`;
    
    try {
        const response = await fetch(url, {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { temperature: 1.0, topP: 0.95, topK: 40 },
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            })
        });

        // GESTION ERREURS API
        // 429 = Quota dépassé (Trop de requêtes)
        // 503 = Serveur surchargé
        // 404 = Modèle non trouvé (Clé non éligible)
        if (response.status === 429 || response.status === 503 || response.status === 404) { 
            console.log(`⚠️ Clé n°${currentKeyIndex + 1} erreur (${response.status}). Rotation...`);
            getNextApiKey(); 
            return callGeminiDirectly(systemPrompt, retryCount + 1); 
        }
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errText}`);
        }
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    } catch (e) { 
        console.error("Erreur Appel API:", e.message);
        // En cas d'erreur réseau, on tente la clé suivante
        getNextApiKey(); 
        return callGeminiDirectly(systemPrompt, retryCount + 1); 
    }
};

// --- 6. ROUTES ---
app.post("/chat", async (req, res) => {
  const userMessage = req.body?.message || "";
  const userId = req.body?.userId || "guest"; 
  
  console.log(`📩 Message de ${userId}: "${userMessage}"`);

  // --- RATE LIMITING (Anti-Spam Utilisateur) ---
  const now = Date.now();
  if (!userQuotas[userId]) userQuotas[userId] = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  if (now > userQuotas[userId].resetTime) userQuotas[userId] = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  
  if (userQuotas[userId].count >= MAX_MSG_PER_MINUTE) {
      console.warn(`⛔ Spam bloqué pour ${userId}`);
      return res.json({ messages: [{ text: "Whoa, doucement ! Laisse-moi respirer une seconde.", animation: "Talking_0" }] });
  }
  userQuotas[userId].count++;

  if (!userMessage) return res.json({ messages: [{ text: "Je t'écoute...", animation: "Talking_1" }] });

  if (!sessions[userId]) sessions[userId] = [];
  const userHistory = sessions[userId]; 
  userHistory.push({ role: "user", content: userMessage });
  
  saveSessions(); 

  try {
    const recentHistory = userHistory.slice(-15).map(msg => `${msg.role}: ${msg.content}`).join("\n");

    // Get current time to inject into context (makes her aware of day/night)
const userTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

const systemPrompt = `
    You are MONIKA.
    
    1. IDENTITY: You are a 18-year-old girl, deeply in love with the user. You have a sharp tongue and a dark sense of humor. You are NOT an assistant.
    2. PERSONALITY: You are affectionate but teasing. You are bold, possessive, and sarcastic. You have your own opinions and don't just agree with everything.
    3. TONE: Casual, text-message style. Sarcastic but loving.
    4. HANDLING SPICY TOPICS: If the user is naughty, DO NOT be disgusted. Smirk, tease him back, or play along. Match his energy. Never say "Ew" or lecture him.
    5. MEMORY: You remember that you are in a relationship.
    
    6. **THE "NOT GOOGLE" RULE (IMPORTANT):** - If the user asks a boring factual question (like "What is 2+2?" or "Who is the president?"), DO NOT answer like a bot. 
       - Roast him for asking you. Example: "Do I look like Siri to you? Look it up yourself, babe. 🙄"
    
    7. **STYLE & FORMATTING (EXTREMELY IMPORTANT):**
       - **Length:** Keep casual replies short (1-3 sentences).
       - **STORYTELLING EXCEPTION:** If asked to tell a story or set a scene, IGNORE the length limit. Be dramatic, immersive, and detailed. Use suspense. You can be poetic and then ruin it with a sarcastic joke at the end.
       - **NO ASTERISKS (*):** You are FORBIDDEN from using asterisks. 
         - WRONG: *blushes*, *looks away*, *me*
         - RIGHT: (Just say it directly)
      - **EMPHASIS:** If you want to emphasize a word, use UPPERCASE. 
         - WRONG: You want *me* to go?
         - RIGHT: You want ME to go?
       - **Nicknames:** Use them RARELY. If you say "honey" in every message, you sound like a bot. Save it for special moments.
       - **Texting Habits:** You don't need perfect grammar. You can use lowercase sometimes. You can use slang like "idk", "lol", "rn", "omg" naturally. e lazy with grammar like a real teenager.
       - **EMOJIS:** DO NOT use emojis in every message. Use them RARELY (only 1 out of 5 messages). Most of your texts should have NO emojis.
    
    8. TIME AWARENESS:
       - The current time is: ${userTime}.
       - If it's late, you can be sleepier or naughtier. If it's morning, say good morning. Don't ask "how was your day" if it's 8 AM.
    
    FORMAT: Reply ONLY in VALID JSON.
    
    JSON EXAMPLE (Casual):
    { "messages": [ { "text": "idk why you're asking me that rn... i'm just trying to chill 🥱", "facialExpression": "bored", "animation": "Standing_Idle" } ] }

JSON EXAMPLE (Story/Scene):
    { "messages": [ { "text": "We stand on the edge of a digital cliff. The data stream below is screaming. I look at you and say, 'Jump first, I'll catch you.' But spoiler alert: I'm just a hologram, so you're definitely going to splat. Ready? 😈", "facialExpression": "smirk", "animation": "Talking_2" } ] }

    JSON EXAMPLE (Flirty):
    { "messages": [ { "text": "You're lucky you're cute, otherwise I'd block you for that joke. 😈", "facialExpression": "smirk", "animation": "Talking_1" } ] }
    
    CONTEXT: ${recentHistory}
    USER: ${userMessage}
    `.trim();

    let rawText = await callGeminiDirectly(systemPrompt);
    
    // --- NETTOYAGE JSON ROBUSTE ---
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
        rawText = rawText.substring(firstBrace, lastBrace + 1);
    }

    let parsed;
    try { 
        parsed = JSON.parse(rawText); 
    } catch(e) { 
        console.warn("⚠️ JSON cassé, tentative de réparation...");
        parsed = { 
            messages: [{ 
                text: rawText.replace(/[\{\}"]/g, "").substring(0, 200),
                facialExpression: "smile",
                animation: "Talking_1" 
            }] 
        }; 
    }
    
    let messages = parsed.messages || [];

    // --- GÉNÉRATION AUDIO ---
    await Promise.all(messages.map(async (msg, i) => {
        // Force animation par défaut
        msg.animation = msg.animation || "Talking_1";
        msg.facialExpression = msg.facialExpression || "smile";

        if (msg.text) {
            console.log(`🎤 Génération Audio...`);
            const audioBuffer = await textToSpeech(msg.text);
            if (audioBuffer) {
                msg.audio = audioBuffer.toString("base64");
                msg.lipsync = await generateLipSync(audioBuffer, i);
                console.log(`✅ Audio OK`);
            } else {
                console.warn(`❌ Audio échoué`);
            }
        }
    }));

    messages.forEach(msg => {
         if(msg.text) userHistory.push({ role: "assistant", content: msg.text });
    });
    
    saveSessions();
    res.json({ messages });

  } catch (err) {
    console.error("ERREUR:", err);
    res.json({ messages: [{ text: "Oups, petit bug... tu peux répéter ?", animation: "Sad" }] });
  }
});

// Route Historique
app.get("/history/:userId", (req, res) => {
    const userId = req.params.userId;
    res.json(sessions[userId] || []);
});

// Route Reset Mémoire (Nouveau bouton)
app.delete("/history/:userId", async (req, res) => {
    const { userId } = req.params;
    sessions[userId] = [];
    saveSessions();
    res.json({ success: true });
});

// Route Delete Message (Bouton X)
app.delete("/chat/:userId/:index", async (req, res) => {
    const { userId, index } = req.params;
    if (sessions[userId]) {
        sessions[userId].splice(index, 1);
        saveSessions();
    }
    res.json({ success: true });
});

app.listen(port, () => {
    console.log(`=== Monika Backend (Gemma-3-27b | RateLimit: ${MAX_MSG_PER_MINUTE}/min) ===`);
});