import type { LlmAdapter } from "./adapter.js";
import { createMockLlmAdapter } from "./mock.js";
import { createOpenAiAdapter } from "./openai.js";

export function createLlmAdapter(): LlmAdapter {
  const provider = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "mock") {
    return createMockLlmAdapter();
  }
  if (provider === "openai" || process.env.OPENAI_API_KEY?.trim()) {
    return createOpenAiAdapter();
  }
  return createMockLlmAdapter();
}

export function llmConfiguredLabel(): { provider: string; model: string; mode: "openai" | "mock" } {
  const adapter = createLlmAdapter();
  return {
    provider: adapter.provider,
    model: adapter.model,
    mode: adapter.provider === "mock" ? "mock" : "openai",
  };
}
