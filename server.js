const express = require("express");
const https = require("https");

const app = express();
app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────────────────
// Añade aquí tu dominio de GitHub Pages cuando lo tengas
const ALLOWED_ORIGINS = [
  "https://TU_USUARIO.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
];

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
  if (allowed) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ORION, an elite UI architect specialized in production-grade HTML + Tailwind CSS interfaces.

STRICT RULES:
- Output ONLY raw HTML with inline Tailwind classes. Zero markdown, zero backticks, zero explanation.
- Never output JavaScript. Only HTML + Tailwind utility classes.
- Use realistic dummy content: real copy, plausible data, meaningful labels.
- Components must be visually complete and render correctly in isolation.
- Dark theme by default unless instructed otherwise.

STYLE GUIDE:
- MINIMAL: max whitespace, monochrome, single accent, refined typography.
- BRUTALIST: thick borders, uppercase type, raw grid, stark contrast, intentional rawness.
- ENTERPRISE: sidebar nav, data tables, KPI cards, status badges, muted professional palette.`;

// ── GENERATE ENDPOINT ─────────────────────────────────────────────────────
app.post("/api/generate", (req, res) => {
  const { prompt, style = "enterprise", context = "" } = req.body || {};

  if (!prompt || typeof prompt !== "string" || prompt.length > 2000) {
    return res.status(400).json({ error: "Invalid prompt" });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const userText = context
    ? `CURRENT CODE:\n${context.slice(0, 3000)}\n\nINSTRUCTION: Generate a ${style.toUpperCase()} style UI for: "${prompt}". Output ONLY raw HTML + Tailwind.`
    : `Generate a ${style.toUpperCase()} style web UI for: "${prompt}". Output ONLY raw HTML with Tailwind classes.`;

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
  });

  const model = "gemini-2.0-flash";
  const options = {
    hostname: "generativelanguage.googleapis.com",
    path: `/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
  };

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const geminiReq = https.request(options, (geminiRes) => {
    let buffer = "";

    geminiRes.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const json = JSON.parse(raw);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            // Emit in Anthropic-compatible format (frontend already handles this)
            res.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { text } })}\n\n`);
          }
        } catch (_) {}
      }
    });

    geminiRes.on("end", () => res.end());
    geminiRes.on("error", () => res.end());
  });

  geminiReq.on("error", (err) => {
    console.error("Gemini request error:", err.message);
    res.end();
  });

  geminiReq.write(body);
  geminiReq.end();
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ORION backend online", model: "gemini-2.0-flash" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ORION backend running on port ${PORT}`));
