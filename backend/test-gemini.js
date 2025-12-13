import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";

async function main() {
  if (!apiKey) {
    console.error("Pas de GEMINI_API_KEY dans .env");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = "Dis juste: Bonjour, je suis ta copine virtuelle 💕";

  try {
    const result = await model.generateContent(prompt);
    console.log("Réponse brute Gemini:\n", result.response.text());
  } catch (err) {
    console.error("Erreur Gemini:", err);
  }
}

main();
