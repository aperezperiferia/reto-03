import { z } from "zod";
import { ocTools, type OcToolName } from "./oc.js";
import type { ToolContext } from "../types.js";

export type RegisteredTool = {
  name: string;
  description: string;
  args: Record<string, z.ZodTypeAny>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
};

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodString) {
    return { type: "string", description: schema.description };
  }
  if (schema instanceof z.ZodNumber) {
    return { type: "number", description: schema.description };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean", description: schema.description };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(schema.element), description: schema.description };
  }
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(schema.shape)) {
      properties[key] = zodToJsonSchema(val as z.ZodTypeAny);
      if (!(val instanceof z.ZodOptional)) required.push(key);
    }
    return {
      type: "object",
      properties,
      required: required.length ? required : undefined,
      description: schema.description,
    };
  }
  return { type: "object", description: schema.description };
}

export function getRegisteredTools(): RegisteredTool[] {
  return (Object.entries(ocTools) as [OcToolName, (typeof ocTools)[OcToolName]][]).map(
    ([key, tool]) => ({
      name: `oc_${key}`,
      description: tool.description,
      args: tool.args as Record<string, z.ZodTypeAny>,
      execute: (args, ctx) =>
        (tool.execute as (a: Record<string, unknown>, c: ToolContext) => Promise<string>)(
          args,
          ctx,
        ),
    }),
  );
}

export function toolDefinitionsForLlm(): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return getRegisteredTools().map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(
        z.object(t.args as z.ZodRawShape),
      ),
    },
  }));
}

export async function runTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<{ name: string; args: unknown; result: string }> {
  const tool = getRegisteredTools().find((t) => t.name === name);
  if (!tool) {
    return {
      name,
      args: {},
      result: JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` }),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs || "{}");
  } catch {
    return {
      name,
      args: rawArgs,
      result: JSON.stringify({ ok: false, error: "Argumentos JSON inválidos" }),
    };
  }
  const shape = z.object(tool.args as z.ZodRawShape);
  const validated = shape.safeParse(parsed);
  if (!validated.success) {
    return {
      name,
      args: parsed,
      result: JSON.stringify({ ok: false, error: validated.error.message }),
    };
  }
  const result = await tool.execute(validated.data as Record<string, unknown>, ctx);
  return { name, args: validated.data, result };
}
