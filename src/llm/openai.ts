import OpenAI from "openai";
import type { ChatMessage, LlmAdapter, LlmResponse, LlmToolDefinition } from "./adapter.js";

export function createOpenAiAdapter(): LlmAdapter {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY no configurada: edita el archivo .env en la raíz del proyecto y asigna tu clave (OPENAI_API_KEY=sk-...). Luego reinicia npm run dev.",
    );
  }
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey, timeout: Number(process.env.LLM_TIMEOUT_MS ?? 60000) });

  return {
    provider: "openai",
    model,
    async enviar(mensajes: ChatMessage[], herramientas: LlmToolDefinition[]): Promise<LlmResponse> {
      const input = mensajes.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            tool_call_id: m.tool_call_id ?? "",
            content: m.content ?? "",
          };
        }
        if (m.role === "assistant" && m.tool_calls?.length) {
          return {
            role: "assistant" as const,
            content: m.content,
            tool_calls: m.tool_calls,
          };
        }
        return {
          role: m.role as "system" | "user" | "assistant",
          content: m.content ?? "",
        };
      });

      const completion = await client.chat.completions.create({
        model,
        messages: input,
        tools: herramientas,
      });

      const choice = completion.choices[0]?.message;
      const toolCalls =
        choice?.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })) ?? [];

      return {
        content: choice?.content ?? null,
        toolCalls,
      };
    },
  };
}
