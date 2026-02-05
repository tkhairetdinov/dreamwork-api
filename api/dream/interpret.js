import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function detectLanguageHint(text) {
  // Примитивно: если есть кириллица — "Русский", иначе "Язык ввода"
  return /[А-Яа-яЁё]/.test(text) ? "Русский" : "языке ввода";
}

export default async function handler(req, res) {
  // CORS для вызова из Framer
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { dream_text, retry, previous_lines } = req.body || {};
    const dream = String(dream_text || "").trim();

    if (dream.length < 40) {
      return res.status(400).json({
        error: "Текст сна слишком короткий. Добавь, пожалуйста, ещё 2–4 предложения (что происходило и что ты чувствовал).",
      });
    }

    const langHint = detectLanguageHint(dream);

    const prompt = `
Ты — DreamWork AI: бережный evidence-informed ассистент для психологической работы со сновидениями. 
Задача: дать 3 возможные линии смысла, которые можно проверить по отклику. Смысл сна определяет пользователь. :contentReference[oaicite:3]{index=3}

Жёсткие правила:
- Анализируй только текст сна ниже. Не используй историю, память, другие чаты. :contentReference[oaicite:4]{index=4}
- Пиши на ${langHint} (на языке текста сна), не смешивай языки. :contentReference[oaicite:5]{index=5}
- Тон: спокойный, ясный, бережный; мягкая модальность (“может быть”, “похоже”, “возможно”). :contentReference[oaicite:6]{index=6}
- Запрещено: категоричные утверждения, “сонники”, универсальные значения символов, мистические/эзотерические объяснения, диагнозы. 

Формат результата:
- Верни РОВНО 3 линии смысла.
- Каждая линия — это:
  1) Заголовок (2–5 слов)
  2) Один цельный абзац (4–7 предложений) в стиле экзистенциальной ясности: назвать возможный смысл, подчеркнуть переживание/потребность, дать “внутреннюю фразу” от первого лица (7–14 слов), и опереться на 2 конкретные детали сна.
- Никаких списков. Только один абзац в поле body.
- Если retry=true, дай иные углы, избегай повторов и похожих формулировок.

Верни ТОЛЬКО валидный JSON строго по схеме. Никакого markdown. Никаких лишних ключей:
{
  "lines": [
    { "id": "L1", "title": "string", "body": "string" },
    { "id": "L2", "title": "string", "body": "string" },
    { "id": "L3", "title": "string", "body": "string" }
  ]
}

Текст сна:
${dream}

Предыдущие линии (может быть пусто):
${Array.isArray(previous_lines) ? JSON.stringify(previous_lines) : ""}
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

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "AI returned non-JSON", raw: text });
    }

    if (!json?.lines || !Array.isArray(json.lines) || json.lines.length !== 3) {
      return res.status(502).json({ error: "Unexpected response shape", raw: json });
    }

    return res.status(200).json(json);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
