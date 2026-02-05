import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// MVP in-memory store (best-effort; OK for early testing)
globalThis.__DW_STORE__ = globalThis.__DW_STORE__ || new Map();

function putSession(data) {
  const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
  globalThis.__DW_STORE__.set(sid, { data, ts: Date.now() });
  return sid;
}

function cleanup() {
  const now = Date.now();
  for (const [sid, v] of globalThis.__DW_STORE__.entries()) {
    if (now - v.ts > 30 * 60 * 1000) {
      globalThis.__DW_STORE__.delete(sid);
    }
  }
}

async function readUrlEncodedBody(req) {
  const rawBody = await new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
  return new URLSearchParams(String(rawBody));
}

export default async function handler(req, res) {
  // Allow fetch from the site (Embed). Classic form POST is also fine.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Requested-With");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    cleanup();

    const params = await readUrlEncodedBody(req);
    const dream = String(params.get("dream_text") || "").trim();

    if (dream.length < 40) {
      return res
        .status(400)
        .json({ error: "Dream text is too short. Please add a few more sentences." });
    }

    const prompt = `
You are DreamWork AI: an evidence-informed assistant for gentle psychological dream reflection.
Your task is NOT to decode or impose meaning, but to offer 3 possible lines of meaning the user can check by inner resonance.

Hard rules:
- Analyze ONLY the dream text provided below. Do not use memory, history, or external context.
- Language rule (strict):
  - Respond in the SAME language as the dream text below.
  - Do not mix languages.
  - If the dream text contains multiple languages, use the dominant one.
- Tone: calm, clear, human, non-dogmatic. Use soft modality (“maybe”, “it could be”, “it seems”).
- Forbidden: certainty claims (“this definitely means”), universal symbol dictionaries, esotericism/fortune-telling, diagnosis.

Output requirements:
- Produce EXACTLY 3 lines.
- Each line must include:
  1) title: 2–5 words (same language as the dream),
  2) body: ONE single paragraph (4–7 sentences) in a calm existential style.
- The body MUST include:
  - an “inner phrase” in first person (7–14 words),
  - grounding in TWO concrete dream details.
- No bullet points. No lists.

Return ONLY valid JSON in the exact schema below.
No markdown. No extra keys.
{
  "lines": [
    { "id": "L1", "title": "string", "body": "string" },
    { "id": "L2", "title": "string", "body": "string" },
    { "id": "L3", "title": "string", "body": "string" }
  ]
}

Dream text:
${dream}
`.trim();

    const ai = await client.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "system", content: "Return only valid JSON. No markdown. No extra keys." },
        { role: "user", content: prompt },
      ],
      max_output_tokens: 900,
    });

    const text = ai.output_text;
    const json = JSON.parse(text);

    const sid = putSession({
      dream_text: dream,
      lines: json.lines,
      created_at: new Date().toISOString(),
    });

    // Always return JSON for fetch-based flow
    return res.status(200).json({ sid });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
