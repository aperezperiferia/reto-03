import { z } from "zod";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  dateOnly,
  fail,
  fixturesRoot,
  loadCentrosCosto,
  loadProveedores,
  normalizeNombre,
  normalizeNit,
  ok,
  outCaseDir,
  parseCotizacion,
  parseFactura,
  readJsonFile,
  readTextFile,
  sha256,
} from "./helpers.js";
import { appendControlRow } from "./control.js";
import { createMockSapAdapter } from "../sap/mock.js";
import {
  OrdenCompraSchema,
  type Confirmacion,
  type Derivados,
  type OrdenCompra,
  type Paquete,
  type Solicitud,
  type ToolContext,
  type ValidacionResult,
} from "../types.js";

const PaqueteInputSchema = z.object({
  correo: z
    .object({
      id: z.string(),
      de: z.string(),
      asunto: z.string(),
      fecha: z.string(),
    })
    .nullable(),
  solicitud: z.custom<Solicitud>().nullable(),
  cotizacion: z
    .object({
      proveedor: z.string(),
      nit: z.string().nullable(),
      total: z.number(),
      moneda: z.string(),
      validez_hasta: z.string().nullable(),
      texto: z.string(),
    })
    .nullable(),
  aprobacion: z
    .object({
      de: z.string(),
      fecha: z.string(),
      aprobado: z.boolean(),
      texto: z.string(),
    })
    .nullable(),
  factura: z
    .object({
      numero: z.string(),
      fecha: z.string(),
      total: z.number(),
    })
    .nullable(),
  faltantes: z.array(z.string()).optional(),
});

function inferUnidad(descripcion: string): "UN" | "H" | "MES" {
  const d = descripcion.toLowerCase();
  if (d.includes("hora")) return "H";
  if (d.includes("mes") || d.includes("mensual") || d.includes("vigencia")) return "MES";
  return "UN";
}

function truncateSapText(text: string, max = 40): string {
  return text.length <= max ? text : text.slice(0, max);
}

export const leer_paquete = {
  description:
    "Lee correo, solicitud, cotización, aprobación y factura opcional de un caso en fixtures y devuelve el paquete normalizado.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-03/solicitudes/"),
  },
  async execute(args: { caso: string }, ctx: ToolContext): Promise<string> {
    try {
      const base = fixturesRoot(ctx, args.caso);
      const faltantes: string[] = [];

      const correoRaw = await readJsonFile<{
        id: string;
        de: string;
        asunto: string;
        fecha: string;
      }>(join(base, "correo.json"));
      if (!correoRaw) faltantes.push("correo.json");

      const solicitud = await readJsonFile<Solicitud>(join(base, "solicitud.json"));
      if (!solicitud) faltantes.push("solicitud.json");

      const cotText = await readTextFile(join(base, "cotizacion.txt"));
      if (!cotText) faltantes.push("cotizacion.txt");

      const aprobRaw = await readJsonFile<{
        de: string;
        para?: string;
        fecha: string;
        asunto: string;
        cuerpo: string;
      }>(join(base, "aprobacion.json"));
      if (!aprobRaw) faltantes.push("aprobacion.json");

      const factText = await readTextFile(join(base, "factura.txt"));

      let cotizacion: Paquete["cotizacion"] = null;
      if (cotText) {
        const parsed = parseCotizacion(cotText);
        cotizacion = { ...parsed, texto: cotText };
      }

      let aprobacion: Paquete["aprobacion"] = null;
      if (aprobRaw) {
        aprobacion = {
          de: aprobRaw.de,
          fecha: aprobRaw.fecha,
          aprobado: /aprobado/i.test(aprobRaw.cuerpo),
          texto: aprobRaw.cuerpo,
        };
      }

      let factura: Paquete["factura"] = null;
      if (factText) {
        factura = parseFactura(factText);
      }

      const paquete: Paquete = {
        correo: correoRaw
          ? {
              id: correoRaw.id,
              de: correoRaw.de,
              asunto: correoRaw.asunto,
              fecha: correoRaw.fecha,
            }
          : null,
        solicitud,
        cotizacion,
        aprobacion,
        factura,
        faltantes,
      };

      return ok(paquete);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Error leyendo paquete");
    }
  },
};

async function runValidacion(
  root: string,
  paquete: Paquete,
): Promise<ValidacionResult> {
  const bloqueos: ValidacionResult["bloqueos"] = [];
  const confirmaciones: Confirmacion[] = [];
  const derivados: Derivados = {};
  let retroactiva = false;

  if (!paquete.solicitud) {
    bloqueos.push({ codigo: "PAQ-001", mensaje: "Falta solicitud.json en el paquete." });
    return { apta: false, bloqueos, confirmaciones, derivados, retroactiva };
  }

  const sol = paquete.solicitud;
  const proveedores = await loadProveedores(root);
  const nitSol = normalizeNit(sol.proveedor_nit);
  let proveedor = nitSol
    ? proveedores.find((p) => normalizeNit(p.nit) === nitSol)
    : undefined;
  if (!proveedor) {
    const nn = normalizeNombre(sol.proveedor_nombre);
    proveedor = proveedores.find((p) => normalizeNombre(p.nombre) === nn);
  }

  if (!proveedor) {
    bloqueos.push({
      codigo: "RC1",
      mensaje: `Proveedor no encontrado en maestro (${sol.proveedor_nombre}${nitSol ? ` NIT ${nitSol}` : ""}). Solicite alta o corrección al solicitante.`,
    });
  } else if (!proveedor.activo) {
    bloqueos.push({
      codigo: "RC1",
      mensaje: `Proveedor ${proveedor.nombre} existe pero está inactivo en SAP.`,
    });
  } else {
    derivados.proveedor = {
      codigo_sap: proveedor.codigo_sap,
      nit: proveedor.nit,
      nombre: proveedor.nombre,
      fuente: "maestro.proveedores",
    };
  }

  const centros = await loadCentrosCosto(root);
  const centro = centros.find((c) => c.centro_costo === sol.centro_costo);
  if (!centro) {
    bloqueos.push({
      codigo: "RC4",
      mensaje: `Centro de costo ${sol.centro_costo} no existe en maestro.`,
    });
  } else if (!centro.subareas.includes(sol.subarea)) {
    bloqueos.push({
      codigo: "RC4",
      mensaje: `Subárea "${sol.subarea}" no pertenece al centro ${sol.centro_costo}.`,
    });
  }

  const calc = sol.cantidad * sol.valor_unitario;
  if (Math.abs(calc - sol.valor_total) > 1) {
    bloqueos.push({
      codigo: "RC10",
      mensaje: `Inconsistencia aritmética: cantidad×unitario=${calc} ≠ valor_total=${sol.valor_total}.`,
    });
  }

  if (!paquete.aprobacion) {
    bloqueos.push({ codigo: "RC2", mensaje: "No hay correo de aprobación en el paquete." });
  } else {
    if (!paquete.aprobacion.aprobado) {
      bloqueos.push({
        codigo: "RC2",
        mensaje: 'La aprobación no contiene la palabra "Aprobado".',
      });
    }
    const email = paquete.aprobacion.de.toLowerCase();
    const aprobadoresCentro = centro?.aprobadores ?? [];
    const aprobador = aprobadoresCentro.find((a) => a.email.toLowerCase() === email);
    if (!aprobador) {
      bloqueos.push({
        codigo: "RC2",
        mensaje: `${email} no es aprobador autorizado para ${sol.centro_costo}.`,
      });
    } else if (sol.valor_total > aprobador.tope) {
      bloqueos.push({
        codigo: "RC3",
        mensaje: `Monto ${sol.valor_total} supera tope ${aprobador.tope} de ${aprobador.email}.`,
      });
    }

    if (dateOnly(paquete.aprobacion.fecha) < dateOnly(sol.fecha_solicitud)) {
      confirmaciones.push({
        codigo: "RC9",
        mensaje: "Fecha de aprobación anterior a la solicitud.",
        detalle: `Aprobación: ${dateOnly(paquete.aprobacion.fecha)}, solicitud: ${sol.fecha_solicitud}`,
      });
    }
  }

  if (!paquete.cotizacion) {
    confirmaciones.push({
      codigo: "RC5",
      mensaje: "No hay cotización adjunta; confirme si procede sin cotización.",
    });
  } else if (sol.valor_total > 0) {
    const diff =
      Math.abs(paquete.cotizacion.total - sol.valor_total) / sol.valor_total;
    if (diff > 0.02) {
      confirmaciones.push({
        codigo: "RC5",
        mensaje: "Diferencia entre solicitud y cotización supera 2%.",
        detalle: `Solicitud: ${sol.valor_total}, cotización: ${paquete.cotizacion.total}`,
      });
    }
  }

  if (proveedor && proveedor.activo) {
    if (!sol.condiciones_pago) {
      derivados.condiciones_pago = {
        codigo: proveedor.condiciones_pago_default,
        fuente: "maestro.proveedores (default)",
      };
    }
    if (!sol.indicador_iva) {
      derivados.indicador_iva = {
        codigo: proveedor.indicador_iva_default,
        fuente: "maestro.proveedores (default)",
      };
      confirmaciones.push({
        codigo: "RC6",
        mensaje: "Indicador IVA no informado; se derivó del proveedor.",
        detalle: `Propuesto: ${proveedor.indicador_iva_default}`,
      });
    }
  }

  if (paquete.factura && paquete.factura.fecha && sol.fecha_solicitud) {
    if (dateOnly(paquete.factura.fecha) < dateOnly(sol.fecha_solicitud)) {
      retroactiva = true;
      confirmaciones.push({
        codigo: "RC8",
        mensaje: "Factura con fecha anterior a la solicitud (OC retroactiva).",
        detalle: `Factura: ${paquete.factura.fecha}, solicitud: ${sol.fecha_solicitud}`,
      });
    }
  }

  const apta = bloqueos.length === 0;
  return { apta, bloqueos, confirmaciones, derivados, retroactiva };
}

export const validar = {
  description:
    "Valida el paquete contra maestros y reglas RC1–RC10; devuelve apta, bloqueos, confirmaciones, derivados y retroactiva.",
  args: {
    caso: z.string().describe("Identificador del caso (carpeta en fixtures)"),
    paquete: PaqueteInputSchema.describe("Paquete normalizado devuelto por oc_leer_paquete"),
  },
  async execute(
    args: { caso: string; paquete: Paquete },
    ctx: ToolContext,
  ): Promise<string> {
    try {
      const result = await runValidacion(ctx.directory, args.paquete);
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Error en validación");
    }
  },
};

export const construir_payload = {
  description:
    "Construye el payload OrdenCompra para SAP, valida con zod y escribe trazabilidad en out/<caso>/trazabilidad.json.",
  args: {
    caso: z.string().describe("Carpeta del caso"),
    paquete: PaqueteInputSchema,
    derivados: z
      .object({
        proveedor: z
          .object({
            codigo_sap: z.string(),
            nit: z.string(),
            nombre: z.string(),
            fuente: z.string(),
          })
          .optional(),
        condiciones_pago: z.object({ codigo: z.string(), fuente: z.string() }).optional(),
        indicador_iva: z.object({ codigo: z.string(), fuente: z.string() }).optional(),
      })
      .describe("Valores derivados de oc_validar"),
    evidencia_sha256: z
      .string()
      .optional()
      .describe("SHA256 de la evidencia; si falta, se lee de out/<caso>/aprobacion.txt"),
    confirmaciones_resueltas: z
      .array(z.string())
      .optional()
      .describe("Códigos RC confirmados por el analista"),
    confirmado_por: z.string().optional().describe("Email o nombre de quien confirmó excepciones"),
  },
  async execute(
    args: {
      caso: string;
      paquete: Paquete;
      derivados: Derivados;
      evidencia_sha256?: string;
      confirmaciones_resueltas?: string[];
      confirmado_por?: string;
    },
    ctx: ToolContext,
  ): Promise<string> {
    try {
      const sol = args.paquete.solicitud;
      if (!sol || !args.paquete.correo || !args.paquete.aprobacion) {
        return fail("Paquete incompleto para construir payload.");
      }
      const prov = args.derivados.proveedor;
      if (!prov) {
        return fail("Falta proveedor derivado; ejecute oc_validar primero.");
      }

      let hash = args.evidencia_sha256;
      if (!hash) {
        const evPath = join(outCaseDir(ctx, args.caso), "aprobacion.txt");
        try {
          const content = await readFile(evPath, "utf8");
          hash = sha256(content);
        } catch {
          return fail("Genere evidencia con oc_generar_evidencia antes del payload.");
        }
      }

      const cond =
        sol.condiciones_pago ?? args.derivados.condiciones_pago?.codigo ?? "Z030";
      const iva =
        sol.indicador_iva ?? args.derivados.indicador_iva?.codigo ?? "C1";

      const excepciones: OrdenCompra["excepciones"] = (args.confirmaciones_resueltas ?? []).map(
        (codigo) => ({
          codigo,
          detalle: "Confirmado por analista en flujo conversacional",
          confirmado_por: args.confirmado_por ?? "analista",
        }),
      );

      const payload: OrdenCompra = {
        referencia: {
          solicitud_id: sol.solicitud_id,
          correo_id: args.paquete.correo.id,
          cotizacion_ref: args.paquete.cotizacion
            ? args.paquete.cotizacion.texto.split("\n")[0]?.trim() ?? null
            : null,
        },
        sociedad: "1000",
        organizacion_compras: "1000",
        proveedor: {
          codigo_sap: prov.codigo_sap,
          nit: prov.nit,
          nombre: prov.nombre,
        },
        moneda: sol.moneda === "USD" ? "USD" : "COP",
        condiciones_pago: cond,
        aprobador: {
          email: args.paquete.aprobacion.de,
          fecha_aprobacion: args.paquete.aprobacion.fecha,
          evidencia_sha256: hash,
        },
        posiciones: [
          {
            numero: 10,
            descripcion: truncateSapText(sol.descripcion),
            cantidad: sol.cantidad,
            unidad: inferUnidad(sol.descripcion),
            precio_unitario: sol.valor_unitario,
            centro_costo: sol.centro_costo,
            subarea: sol.subarea,
            indicador_iva: iva,
          },
        ],
        excepciones,
      };

      const parsed = OrdenCompraSchema.safeParse(payload);
      if (!parsed.success) {
        return fail(parsed.error.message);
      }

      const trazabilidad: Record<string, { valor: unknown; fuente: string }> = {
        "referencia.solicitud_id": { valor: sol.solicitud_id, fuente: "solicitud" },
        "referencia.correo_id": { valor: args.paquete.correo.id, fuente: "correo" },
        "proveedor.codigo_sap": { valor: prov.codigo_sap, fuente: prov.fuente },
        condiciones_pago: {
          valor: cond,
          fuente: sol.condiciones_pago
            ? "solicitud"
            : (args.derivados.condiciones_pago?.fuente ?? "derivado"),
        },
        indicador_iva: {
          valor: iva,
          fuente: sol.indicador_iva ? "solicitud" : (args.derivados.indicador_iva?.fuente ?? "derivado"),
        },
        "posiciones[0].precio_unitario": { valor: sol.valor_unitario, fuente: "solicitud" },
        "aprobador.evidencia_sha256": { valor: hash, fuente: "oc_generar_evidencia" },
      };

      const outDir = outCaseDir(ctx, args.caso);
      await mkdir(outDir, { recursive: true });
      const trazPath = join(outDir, "trazabilidad.json");
      await writeFile(trazPath, JSON.stringify(trazabilidad, null, 2), "utf8");

      return ok({ payload: parsed.data, trazabilidad_ruta: trazPath });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Error construyendo payload");
    }
  },
};

export const generar_evidencia = {
  description:
    "Genera out/<caso>/aprobacion.txt con encabezados del correo de aprobación y calcula sha256 del contenido.",
  args: {
    caso: z.string().describe("Carpeta del caso en fixtures"),
  },
  async execute(args: { caso: string }, ctx: ToolContext): Promise<string> {
    try {
      const base = fixturesRoot(ctx, args.caso);
      const aprob = await readJsonFile<{
        de: string;
        para: string;
        fecha: string;
        asunto: string;
        cuerpo: string;
      }>(join(base, "aprobacion.json"));
      if (!aprob) {
        return fail("No existe aprobacion.json para generar evidencia.");
      }
      const content = [
        `De: ${aprob.de}`,
        `Para: ${aprob.para}`,
        `Fecha: ${aprob.fecha}`,
        `Asunto: ${aprob.asunto}`,
        "",
        aprob.cuerpo,
      ].join("\n");

      const outDir = outCaseDir(ctx, args.caso);
      await mkdir(outDir, { recursive: true });
      const ruta = join(outDir, "aprobacion.txt");
      await writeFile(ruta, content, "utf8");
      const digest = sha256(content);
      return ok({ ruta, sha256: digest });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Error generando evidencia");
    }
  },
};

export const crear = {
  description:
    "Crea la OC en SAP simulado si apta=true y no hay confirmaciones pendientes o confirmado=true; idempotente por solicitud_id.",
  args: {
    caso: z.string().describe("Carpeta del caso"),
    payload: OrdenCompraSchema.describe("Payload validado de oc_construir_payload"),
    confirmado: z
      .boolean()
      .optional()
      .describe("true si el analista confirmó las excepciones pendientes"),
    validacion: z
      .object({
        apta: z.boolean(),
        bloqueos: z.array(z.object({ codigo: z.string(), mensaje: z.string() })),
        confirmaciones: z.array(
          z.object({
            codigo: z.string(),
            mensaje: z.string(),
            detalle: z.string().optional(),
          }),
        ),
        retroactiva: z.boolean(),
      })
      .describe("Resultado reciente de oc_validar"),
  },
  async execute(
    args: {
      caso: string;
      payload: OrdenCompra;
      confirmado?: boolean;
      validacion: ValidacionResult;
    },
    ctx: ToolContext,
  ): Promise<string> {
    try {
      const { validacion: v } = args;
      const solicitud_id = args.payload.referencia.solicitud_id;

      if (!v.apta) {
        await appendControlRow(ctx.directory, {
          solicitud_id,
          resultado: "bloqueado",
          numero_oc: "",
          retroactiva: v.retroactiva,
          bloqueos: v.bloqueos.map((b) => b.codigo),
          confirmaciones: v.confirmaciones.map((c) => c.codigo),
        });
        return fail(`Creación bloqueada: ${v.bloqueos.map((b) => b.mensaje).join(" ")}`);
      }

      if (v.confirmaciones.length > 0 && !args.confirmado) {
        await appendControlRow(ctx.directory, {
          solicitud_id,
          resultado: "pendiente_confirmacion",
          numero_oc: "",
          retroactiva: v.retroactiva,
          bloqueos: [],
          confirmaciones: v.confirmaciones.map((c) => c.codigo),
        });
        return fail(
          "Requiere confirmación del analista antes de crear la OC. Informe las confirmaciones y espere respuesta afirmativa.",
        );
      }

      const sap = createMockSapAdapter(ctx.directory);
      const prev = await sap.buscarOrdenPorReferencia(solicitud_id);
      const created = await sap.crearOrden(args.payload);
      const idempotente = Boolean(prev);

      await appendControlRow(ctx.directory, {
        solicitud_id,
        resultado: "creada",
        numero_oc: created.numero_oc,
        retroactiva: v.retroactiva,
        bloqueos: [],
        confirmaciones: v.confirmaciones.map((c) => c.codigo),
      });

      return ok({ ...created, idempotente });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Error creando OC");
    }
  },
};

export const leer_excel = {
  description: "Opcional P1: lee un archivo Excel de solicitud (no implementado en fixtures).",
  args: {
    ruta: z.string().describe("Ruta relativa al proyecto del archivo .xlsx"),
  },
  async execute(_args: { ruta: string }, _ctx: ToolContext): Promise<string> {
    return fail("Lectura de Excel no implementada; use solicitud.json en fixtures.");
  },
};

export const ocTools = {
  leer_paquete,
  validar,
  construir_payload,
  generar_evidencia,
  crear,
  leer_excel,
};

export type OcToolName = keyof typeof ocTools;
