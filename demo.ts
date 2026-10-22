import { rm, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { leer_paquete, validar, generar_evidencia, construir_payload, crear } from "./src/tools/oc.js";
import type { Paquete, ValidacionResult, OrdenCompra } from "./src/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const ctx = { directory: ROOT, sessionId: "demo" };

const CASOS = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"] as const;

function parseTool<T>(raw: string): { ok: true; data: T } | { ok: false; error: string } {
  return JSON.parse(raw) as { ok: true; data: T } | { ok: false; error: string };
}

async function procesarCaso(
  caso: string,
  opts: { confirmado?: boolean; repeat?: boolean } = {},
): Promise<void> {
  const leerRaw = await leer_paquete.execute({ caso }, ctx);
  const leer = parseTool<Paquete>(leerRaw);
  if (!leer.ok) {
    console.log(`\n=== ${caso} ===`);
    console.log("ERROR leer:", leer.error);
    return;
  }

  const valRaw = await validar.execute({ caso, paquete: leer.data }, ctx);
  const val = parseTool<ValidacionResult>(valRaw);
  if (!val.ok) {
    console.log(`\n=== ${caso} ===`);
    console.log("ERROR validar:", val.error);
    return;
  }

  console.log(`\n=== ${caso}${opts.repeat ? " (2da ejecución)" : ""} ===`);
  console.log("apta:", val.data.apta);
  console.log("bloqueos:", val.data.bloqueos.map((b) => b.codigo).join(", ") || "(ninguno)");
  console.log(
    "confirmaciones:",
    val.data.confirmaciones.map((c) => c.codigo).join(", ") || "(ninguna)",
  );
  console.log("retroactiva:", val.data.retroactiva);

  if (!val.data.apta) {
    console.log("OC:", "no creada —", val.data.bloqueos[0]?.mensaje ?? "bloqueada");
    return;
  }

  const needsConfirm = val.data.confirmaciones.length > 0;
  const confirmado = opts.confirmado ?? !needsConfirm;

  const evRaw = await generar_evidencia.execute({ caso }, ctx);
  const ev = parseTool<{ sha256: string }>(evRaw);
  if (!ev.ok) {
    console.log("OC:", "no creada —", ev.error);
    return;
  }

  const payloadRaw = await construir_payload.execute(
    {
      caso,
      paquete: leer.data,
      derivados: val.data.derivados,
      evidencia_sha256: ev.data.sha256,
      confirmaciones_resueltas: confirmado ? val.data.confirmaciones.map((c) => c.codigo) : [],
      confirmado_por: confirmado ? "demo-script" : undefined,
    },
    ctx,
  );
  const payloadResult = parseTool<{ payload: OrdenCompra }>(payloadRaw);
  if (!payloadResult.ok) {
    console.log("OC:", "no creada —", payloadResult.error);
    return;
  }

  const crearRaw = await crear.execute(
    {
      caso,
      payload: payloadResult.data.payload,
      confirmado,
      validacion: val.data,
    },
    ctx,
  );
  const crearResult = parseTool<{ numero_oc: string; idempotente: boolean }>(crearRaw);
  if (!crearResult.ok) {
    console.log("OC:", "no creada —", crearResult.error);
    return;
  }
  console.log(
    "OC:",
    crearResult.data.numero_oc,
    crearResult.data.idempotente ? "(idempotente)" : "",
  );
}

async function main(): Promise<void> {
  await rm(join(ROOT, "out"), { recursive: true, force: true });
  await mkdir(join(ROOT, "out"), { recursive: true });

  for (const caso of CASOS) {
    const confirmado =
      caso === "sol-004" || caso === "sol-005" || caso === "sol-006" ? true : undefined;
    await procesarCaso(caso, { confirmado });
  }

  await procesarCaso("sol-001", { repeat: true });
  await procesarCaso("sol-004", { confirmado: false });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
