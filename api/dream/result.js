import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const sid = String(req.query?.sid || "").trim();

  if (!sid) {
    return res.status(400).json({ error: "Missing sid" });
  }

  try {
    const data = await redis.get(`dw:${sid}`);

    if (!data) {
      return res.status(404).json({ error: "Not found or expired" });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("RESULT ERROR:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: String(err?.message || err),
    });
  }
}
