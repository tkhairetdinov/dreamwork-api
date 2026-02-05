globalThis.__DW_STORE__ = globalThis.__DW_STORE__ || new Map();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const sid = String(req.query?.sid || "").trim();
  if (!sid) return res.status(400).json({ error: "Missing sid" });

  const entry = globalThis.__DW_STORE__.get(sid);
  if (!entry) return res.status(404).json({ error: "Not found or expired" });

  return res.status(200).json(entry.data);
}
