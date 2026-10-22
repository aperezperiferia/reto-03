import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ToolContext, ToolResult } from "../types.js";

export function ok(data: unknown): string {
  return JSON.stringify({ ok: true, data } satisfies ToolResult);
}

export function fail(error: string): string {
  return JSON.stringify({ ok: false, error } satisfies ToolResult);
}

export function fixturesRoot(ctx: ToolContext, caso: string): string {
  return join(ctx.directory, "fixtures", "reto-03", "solicitudes", caso);
}

export function outCaseDir(ctx: ToolContext, caso: string): string {
  return join(ctx.directory, "out", caso);
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export function normalizeNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeNit(nit: string | null | undefined): string | null {
  if (!nit) return null;
  const digits = nit.replace(/\D/g, "");
  return digits.length ? digits : null;
}

export function parseCotizacion(texto: string): {
  proveedor: string;
  nit: string | null;
  total: number;
  moneda: string;
  validez_hasta: string | null;
} {
  const proveedorMatch = texto.match(/Proveedor:\s*(.+)/i);
  const nitMatch = texto.match(/NIT:\s*([\d.\-]+)/i);
  const totalMatch =
    texto.match(/TOTAL\s*\(IVA incluido\):\s*COP\s*([\d.,]+)/i) ??
    texto.match(/TOTAL:\s*COP\s*([\d.,]+)/i);
  const fechaMatch = texto.match(/Fecha:\s*(\d{4}-\d{2}-\d{2})/i);
  const validezDiasMatch = texto.match(/Validez de la oferta:\s*(\d+)\s*d[ií]as/i);

  const parseMoney = (s: string): number => {
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    return Number.parseFloat(cleaned);
  };

  let validez_hasta: string | null = null;
  if (fechaMatch && validezDiasMatch) {
    const base = new Date(fechaMatch[1]);
    base.setDate(base.getDate() + Number.parseInt(validezDiasMatch[1], 10));
    validez_hasta = base.toISOString().slice(0, 10);
  }

  return {
    proveedor: proveedorMatch?.[1]?.trim() ?? "",
    nit: nitMatch ? normalizeNit(nitMatch[1]) : null,
    total: totalMatch ? parseMoney(totalMatch[1]) : 0,
    moneda: "COP",
    validez_hasta,
  };
}

export function parseFactura(texto: string): { numero: string; fecha: string; total: number } {
  const numeroMatch = texto.match(/No\.\s*([A-Z0-9\-]+)/i);
  const fechaMatch = texto.match(/Fecha de emisi[oó]n:\s*(\d{4}-\d{2}-\d{2})/i);
  const totalMatch = texto.match(/TOTAL:\s*COP\s*([\d.,]+)/i);
  const parseMoney = (s: string): number => {
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    return Number.parseFloat(cleaned);
  };
  return {
    numero: numeroMatch?.[1] ?? "SIN-NUMERO",
    fecha: fechaMatch?.[1] ?? "",
    total: totalMatch ? parseMoney(totalMatch[1]) : 0,
  };
}

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export type ProveedorMaestro = {
  codigo_sap: string;
  nit: string;
  nombre: string;
  condiciones_pago_default: string;
  indicador_iva_default: string;
  activo: boolean;
};

export async function loadProveedores(root: string): Promise<ProveedorMaestro[]> {
  const path = join(root, "fixtures", "reto-03", "maestros", "proveedores.json");
  return JSON.parse(await readFile(path, "utf8")) as ProveedorMaestro[];
}

export type CentroCostoMaestro = {
  centro_costo: string;
  subareas: string[];
  aprobadores: Array<{ email: string; tope: number; nombre?: string }>;
};

export async function loadCentrosCosto(root: string): Promise<CentroCostoMaestro[]> {
  const path = join(root, "fixtures", "reto-03", "maestros", "centros-costo.json");
  return JSON.parse(await readFile(path, "utf8")) as CentroCostoMaestro[];
}

export function dateOnly(isoOrDate: string): string {
  return isoOrDate.slice(0, 10);
}
