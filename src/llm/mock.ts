import type { ChatMessage, LlmAdapter, LlmResponse, LlmToolDefinition } from "./adapter.js";

function newToolId(): string {
  return `mock-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toolCall(name: string, args: Record<string, unknown>): LlmResponse {
  return {
    content: null,
    toolCalls: [{ id: newToolId(), name, arguments: JSON.stringify(args) }],
  };
}

function reply(text: string): LlmResponse {
  return { content: text, toolCalls: [] };
}

function parseJsonTool(content: string | null): { ok: boolean; data?: unknown; error?: string } {
  if (!content) return { ok: false, error: "sin contenido" };
  try {
    return JSON.parse(content) as { ok: boolean; data?: unknown; error?: string };
  } catch {
    return { ok: false, error: "json inválido" };
  }
}

function extractCaso(text: string): string | null {
  const m = text.match(/sol-\d{3}/i);
  return m ? m[0].toLowerCase() : null;
}

function userConfirmed(text: string): boolean {
  return /\b(confirmo|confirmar|s[ií]\s*,?\s*procede|procede|crear la oc)\b/i.test(text);
}

function toolsSinceLastUser(mensajes: ChatMessage[]): Array<{ name: string; content: string | null }> {
  let lastUserIdx = -1;
  for (let i = mensajes.length - 1; i >= 0; i--) {
    if (mensajes[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  const out: Array<{ name: string; content: string | null }> = [];
  for (let i = lastUserIdx + 1; i < mensajes.length; i++) {
    const m = mensajes[i];
    if (m.role === "tool" && m.name) {
      out.push({ name: m.name, content: m.content });
    }
  }
  return out;
}

function lastUserText(mensajes: ChatMessage[]): string {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    if (mensajes[i].role === "user") return mensajes[i].content ?? "";
  }
  return "";
}

export function createMockLlmAdapter(): LlmAdapter {
  return {
    provider: "mock",
    model: "scripted-local",
    async enviar(mensajes: ChatMessage[], _herramientas: LlmToolDefinition[]): Promise<LlmResponse> {
      const userText = lastUserText(mensajes);
      let caso: string | null = extractCaso(userText);
      if (!caso) {
        for (let i = mensajes.length - 1; i >= 0; i--) {
          if (mensajes[i].role !== "user") continue;
          caso = extractCaso(mensajes[i].content ?? "");
          if (caso) break;
        }
      }
      if (!caso) {
        return reply(
          'Modo mock: indica un caso, por ejemplo "Procesa la solicitud sol-001" o "sol-004". Sin OpenAI.',
        );
      }

      const tools = toolsSinceLastUser(mensajes);
      const called = (name: string) => tools.some((t) => t.name === name);

      const leer = tools.find((t) => t.name === "oc_leer_paquete");
      const validar = tools.find((t) => t.name === "oc_validar");
      const evidencia = tools.find((t) => t.name === "oc_generar_evidencia");
      const construir = tools.find((t) => t.name === "oc_construir_payload");
      const crear = tools.find((t) => t.name === "oc_crear");

      if (!called("oc_leer_paquete")) {
        return toolCall("oc_leer_paquete", { caso });
      }

      const leerParsed = parseJsonTool(leer?.content ?? null);
      if (!leerParsed.ok || !leerParsed.data) {
        return reply(`Error leyendo paquete: ${leerParsed.error ?? "desconocido"}`);
      }
      const paquete = leerParsed.data;

      if (!called("oc_validar")) {
        return toolCall("oc_validar", { caso, paquete });
      }

      const valParsed = parseJsonTool(validar?.content ?? null);
      if (!valParsed.ok || !valParsed.data) {
        return reply(`Error en validación: ${valParsed.error ?? "desconocido"}`);
      }
      const validacion = valParsed.data as {
        apta: boolean;
        bloqueos: Array<{ codigo: string; mensaje: string }>;
        confirmaciones: Array<{ codigo: string; mensaje: string; detalle?: string }>;
        derivados: Record<string, unknown>;
        retroactiva: boolean;
      };

      if (!validacion.apta) {
        const msgs = validacion.bloqueos.map((b) => `- ${b.codigo}: ${b.mensaje}`).join("\n");
        return reply(`No se puede crear la OC (${caso}). Bloqueos:\n${msgs}`);
      }

      const needsConfirm = validacion.confirmaciones.length > 0;
      const confirmed = userConfirmed(userText);

      if (needsConfirm && !confirmed && !called("oc_crear")) {
        const lines = validacion.confirmaciones
          .map((c) => `- ${c.codigo}: ${c.mensaje}${c.detalle ? ` (${c.detalle})` : ""}`)
          .join("\n");
        const retro = validacion.retroactiva ? "\n\n⚠ Caso marcado como **retroactivo**." : "";
        return reply(
          `Validación OK con excepciones pendientes (${caso}):\n${lines}${retro}\n\n¿Confirmas crear la OC? Responde "confirmo" para continuar.`,
        );
      }

      if (!called("oc_generar_evidencia")) {
        return toolCall("oc_generar_evidencia", { caso });
      }

      const evParsed = parseJsonTool(evidencia?.content ?? null);
      if (!evParsed.ok || !evParsed.data) {
        return reply(`Error generando evidencia: ${evParsed.error ?? "desconocido"}`);
      }
      const sha = (evParsed.data as { sha256: string }).sha256;

      if (!called("oc_construir_payload")) {
        return toolCall("oc_construir_payload", {
          caso,
          paquete,
          derivados: validacion.derivados,
          evidencia_sha256: sha,
          confirmaciones_resueltas: needsConfirm
            ? validacion.confirmaciones.map((c) => c.codigo)
            : [],
          confirmado_por: needsConfirm ? "analista-mock" : undefined,
        });
      }

      const payParsed = parseJsonTool(construir?.content ?? null);
      if (!payParsed.ok || !payParsed.data) {
        return reply(`Error construyendo payload: ${payParsed.error ?? "desconocido"}`);
      }
      const payload = (payParsed.data as { payload: unknown }).payload;

      if (!called("oc_crear")) {
        return toolCall("oc_crear", {
          caso,
          payload,
          validacion,
          confirmado: needsConfirm ? true : undefined,
        });
      }

      const crearParsed = parseJsonTool(crear?.content ?? null);
      if (!crearParsed.ok) {
        return reply(`Creación fallida: ${crearParsed.error ?? "error"}`);
      }
      const data = crearParsed.data as { numero_oc: string; fecha: string; idempotente?: boolean };
      return reply(
        `OC creada en SAP simulado para ${caso}.\n- Número: ${data.numero_oc}\n- Fecha: ${data.fecha}${
          data.idempotente ? "\n- (Idempotente: ya existía)" : ""
        }\n\nModo mock activo — mismas herramientas que con OpenAI.`,
      );
    },
  };
}
