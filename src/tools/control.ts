import { appendFile, access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HEADER = "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts\n";

async function ensureControlFile(root: string): Promise<string> {
  await mkdir(join(root, "out"), { recursive: true });
  const path = join(root, "out", "control.csv");
  try {
    await access(path);
  } catch {
    await writeFile(path, HEADER, "utf8");
  }
  return path;
}

export async function appendControlRow(
  root: string,
  row: {
    solicitud_id: string;
    resultado: string;
    numero_oc: string;
    retroactiva: boolean;
    bloqueos: string[];
    confirmaciones: string[];
  },
): Promise<void> {
  const path = await ensureControlFile(root);
  const line = [
    row.solicitud_id,
    row.resultado,
    row.numero_oc,
    row.retroactiva ? "true" : "false",
    `"${row.bloqueos.join("; ")}"`,
    `"${row.confirmaciones.join("; ")}"`,
    new Date().toISOString(),
  ].join(",");
  await appendFile(path, line + "\n", "utf8");
}
