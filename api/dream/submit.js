import OpenAI from "openai";
import { Redis } from "@upstash/redis";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, X-Requested-With"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // --- read form body ---
    const rawBody = await new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => resolve(body));
    });

    const params = new URLSearchParams(String(rawBody));
    const dreamText = String(params.get("dream_text") || "").trim();

    if (dreamText.length < 40) {
      return res.status(400).json({
        error: "Dream text is too short. Please add a few more sentences.",
      });
    }

    // --- AI prompt ---
    const prompt = `
You are DreamWork AI: an evidence-informed assistant for gentle psychological dream reflection.

Your task is NOT to decode or impose meaning, but to offer 3 possible lines of meaning the user can check by inner resonance.

Rules:
- Analyze ONLY the dream text below.
- Respond strictly in the SAME language as the dream text.
- Do NOT mix languages.
- Tone: calm, human, non-dogmatic.
- No certainty, no symbol dictionaries, no diagnosis.

Output:
- EXACTLY 3 lines
- Each line:
  - title: 2–5 words
  - body: ONE paragraph, 4–7 sentences
  - include a first-person inner phrase
  - include 2 concrete dream details

Return ONLY valid JSON:
{
  "lines": [
    { "id": "L1", "title": "string", "body": "string" },
    { "id": "L2", "title": "string", "body": "string" },
    { "id": "L3", "title": "string", "body": "string" }
  ]
}

Dream text:
${dreamText}
`.trim();

    const aiResponse = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      max_output_tokens: 900,
    });

    const parsed = JSON.parse(aiResponse.output_text);

    const sid =
      Math.random().toString(36).slice(2) + Date.now().toString(36);

    const payload = {
      dream_text: dreamText,
      lines: parsed.lines,
      created_at: new Date().toISOString(),
    };

    // --- WRITE TO REDIS (critical step) ---
    await redis.set(`dw:${sid}`, payload, { ex: 60 * 60 });

    return res.status(200).json({ sid });
  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: String(err?.message || err),
    });
  }
}
