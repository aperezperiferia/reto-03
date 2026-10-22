import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { SapAdapter } from "./adapter.js";
import type { OrdenCompra } from "../types.js";

const START_NUM = 4500000001;

function sapDir(root: string): string {
  return join(root, "out", "sap");
}

async function ensureSapDir(root: string): Promise<void> {
  await mkdir(sapDir(root), { recursive: true });
}

async function readOrders(root: string): Promise<Array<{ solicitud_id: string; numero_oc: string; fecha: string; orden: OrdenCompra }>> {
  const path = join(sapDir(root), "ordenes.jsonl");
  try {
    const raw = await readFile(path, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as { solicitud_id: string; numero_oc: string; fecha: string; orden: OrdenCompra });
  } catch {
    return [];
  }
}

export function createMockSapAdapter(root: string): SapAdapter {
  return {
    async consultarProveedor(nit: string) {
      const path = join(root, "fixtures", "reto-03", "maestros", "proveedores.json");
      const list = JSON.parse(await readFile(path, "utf8")) as Array<{
        codigo_sap: string;
        nit: string;
        activo: boolean;
      }>;
      const normalized = nit.replace(/\D/g, "");
      const found = list.find((p) => p.nit.replace(/\D/g, "") === normalized);
      return found ? { codigo_sap: found.codigo_sap, activo: found.activo } : null;
    },

    async buscarOrdenPorReferencia(solicitud_id: string) {
      const orders = await readOrders(root);
      const hit = orders.find((o) => o.solicitud_id === solicitud_id);
      return hit ? { numero_oc: hit.numero_oc } : null;
    },

    async crearOrden(orden: OrdenCompra) {
      await ensureSapDir(root);
      const existing = await this.buscarOrdenPorReferencia(orden.referencia.solicitud_id);
      if (existing) {
        const orders = await readOrders(root);
        const full = orders.find((o) => o.solicitud_id === orden.referencia.solicitud_id);
        return { numero_oc: existing.numero_oc, fecha: full?.fecha ?? new Date().toISOString().slice(0, 10) };
      }

      const orders = await readOrders(root);
      const nextNum = START_NUM + orders.length;
      const numero_oc = String(nextNum);
      const fecha = new Date().toISOString().slice(0, 10);
      const record = {
        solicitud_id: orden.referencia.solicitud_id,
        numero_oc,
        fecha,
        orden,
      };
      await appendFile(join(sapDir(root), "ordenes.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
      return { numero_oc, fecha };
    },
  };
}
