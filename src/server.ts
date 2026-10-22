import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runAgentTurn } from "./agent/runner.js";
import { createOpenAiAdapter } from "./llm/openai.js";
import type { LlmAdapter } from "./llm/adapter.js";
import {
  createSession,
  getSession,
  loadSession,
  persistSession,
} from "./sessions/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function getLlm(): LlmAdapter {
  return createOpenAiAdapter();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  try {
    const llm = getLlm();
    res.json({ ok: true, provider: llm.provider, model: llm.model });
  } catch {
    res.json({
      ok: true,
      provider: "openai",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      configured: Boolean(process.env.OPENAI_API_KEY),
    });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  const session = (await loadSession(ROOT, req.params.id)) ?? getSession(req.params.id);
  if (!session) {
    res.status(404).json({ ok: false, error: "Sesión no encontrada" });
    return;
  }
  res.json({ ok: true, session });
});

app.post("/api/chat", async (req, res) => {
  const body = req.body as { sessionId?: string; message?: string };
  const message = body.message?.trim();
  if (!message) {
    res.status(400).json({ ok: false, error: "message requerido" });
    return;
  }

  let session =
    (body.sessionId ? await loadSession(ROOT, body.sessionId) : undefined) ??
    (body.sessionId ? getSession(body.sessionId) : undefined);
  if (!session) {
    session = createSession(ROOT, body.sessionId);
  }

  let llm: LlmAdapter;
  try {
    llm = getLlm();
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: e instanceof Error ? e.message : "LLM no configurado",
    });
    return;
  }

  try {
    const turn = await runAgentTurn({
      root: ROOT,
      sessionId: session.id,
      userMessage: message,
      history: session.history,
      llm,
    });
    session.history = turn.history;
    session.turns.push({
      user: message,
      assistant: turn.reply,
      toolCalls: turn.toolCalls,
      needsConfirmation: turn.needsConfirmation,
      at: new Date().toISOString(),
    });
    await persistSession(ROOT, session);

    res.json({
      sessionId: session.id,
      reply: turn.reply,
      toolCalls: turn.toolCalls,
      needsConfirmation: turn.needsConfirmation,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : "Error en el agente",
    });
  }
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API agente OC escuchando en http://localhost:${port}`);
});
