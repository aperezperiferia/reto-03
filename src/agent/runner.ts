import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { LlmAdapter, ChatMessage } from "../llm/adapter.js";
import { runTool, toolDefinitionsForLlm } from "../tools/registry.js";
import type { ToolContext } from "../types.js";

export type VisibleToolCall = {
  name: string;
  args: unknown;
  resultSummary: string;
  rawResult: string;
};

export type AgentTurnResult = {
  reply: string;
  toolCalls: VisibleToolCall[];
  needsConfirmation: boolean;
  history: SessionMessage[];
};

type SessionMessage =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "assistant_tools";
      content: string;
      toolCalls: Array<{ id: string; name: string; arguments: string }>;
    }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

function summarizeResult(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { ok: boolean; data?: unknown; error?: string };
    if (!parsed.ok) return `Error: ${parsed.error ?? "desconocido"}`;
    const data = parsed.data;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if ("numero_oc" in d) return `OC ${String(d.numero_oc)}`;
      if ("apta" in d) {
        const bloq = (d.bloqueos as unknown[])?.length ?? 0;
        const conf = (d.confirmaciones as unknown[])?.length ?? 0;
        return `apta=${String(d.apta)}, bloqueos=${bloq}, confirmaciones=${conf}`;
      }
      if ("payload" in d) return "Payload OC generado";
      if ("sha256" in d) return `Evidencia sha256 ${String(d.sha256).slice(0, 12)}…`;
    }
    return "ok";
  } catch {
    return raw.slice(0, 120);
  }
}

function detectNeedsConfirmation(toolCalls: VisibleToolCall[]): boolean {
  for (const tc of toolCalls) {
    if (tc.name !== "oc_validar" && tc.name !== "oc_crear") continue;
    try {
      const parsed = JSON.parse(tc.rawResult) as {
        ok: boolean;
        data?: { confirmaciones?: unknown[] };
        error?: string;
      };
      if (tc.name === "oc_validar" && parsed.ok && (parsed.data?.confirmaciones?.length ?? 0) > 0) {
        return true;
      }
      if (tc.name === "oc_crear" && !parsed.ok && parsed.error?.includes("confirmación")) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

async function appendLog(root: string, entry: unknown): Promise<void> {
  await mkdir(join(root, "out"), { recursive: true });
  await appendFile(join(root, "out", "log.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
}

function toLlmMessages(systemPrompt: string, history: SessionMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: systemPrompt }];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      out.push({ role: m.role, content: m.content });
    } else if (m.role === "assistant_tools") {
      out.push({
        role: "assistant",
        content: m.content || "",
        name: JSON.stringify(m.toolCalls),
      });
    } else {
      out.push({
        role: "tool",
        content: m.content,
        tool_call_id: m.tool_call_id,
        name: m.name,
      });
    }
  }
  return out;
}

export async function runAgentTurn(options: {
  root: string;
  sessionId: string;
  userMessage: string;
  history: SessionMessage[];
  llm: LlmAdapter;
}): Promise<AgentTurnResult> {
  const maxIter = Number(process.env.AGENT_MAX_ITERATIONS ?? 25);
  const ctx: ToolContext = { directory: options.root, sessionId: options.sessionId };
  const systemPrompt = await readFile(join(options.root, "agent", "prompt.md"), "utf8");
  const history: SessionMessage[] = [...options.history, { role: "user", content: options.userMessage }];
  const visibleTools: VisibleToolCall[] = [];

  const llmHistory = toLlmMessages(systemPrompt, history);
  let iterations = 0;
  let finalReply = "";

  while (iterations < maxIter) {
    iterations++;
    let response;
    try {
      response = await options.llm.enviar(llmHistory, toolDefinitionsForLlm());
    } catch (e) {
      finalReply =
        e instanceof Error
          ? `No pude contactar al modelo: ${e.message}`
          : "Error desconocido del proveedor LLM.";
      break;
    }

    if (response.toolCalls.length === 0) {
      finalReply = response.content?.trim() || "Listo.";
      history.push({ role: "assistant", content: finalReply });
      break;
    }

    const assistantNote = response.content ?? "";
    history.push({
      role: "assistant_tools",
      content: assistantNote,
      toolCalls: response.toolCalls,
    });

    llmHistory.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const call of response.toolCalls) {
      const executed = await runTool(call.name, call.arguments, ctx);
      visibleTools.push({
        name: executed.name,
        args: executed.args,
        resultSummary: summarizeResult(executed.result),
        rawResult: executed.result,
      });
      await appendLog(options.root, {
        ts: new Date().toISOString(),
        sessionId: options.sessionId,
        tool: executed.name,
        args: executed.args,
        result: executed.result,
      });
      history.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.name,
        content: executed.result,
      });
      llmHistory.push({
        role: "tool",
        content: executed.result,
        tool_call_id: call.id,
        name: call.name,
      });
    }

    if (iterations >= maxIter) {
      finalReply =
        "Alcancé el tope de iteraciones de herramientas. Resumo lo obtenido y quedo atento a instrucciones adicionales.";
      history.push({ role: "assistant", content: finalReply });
      break;
    }
  }

  if (!finalReply && iterations >= maxIter) {
    finalReply = "Tope de iteraciones alcanzado.";
  }

  return {
    reply: finalReply,
    toolCalls: visibleTools,
    needsConfirmation: detectNeedsConfirmation(visibleTools),
    history,
  };
}

export type { SessionMessage };
