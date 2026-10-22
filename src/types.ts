import { z } from "zod";

export const OrdenCompraSchema = z.object({
  referencia: z.object({
    solicitud_id: z.string(),
    correo_id: z.string(),
    cotizacion_ref: z.string().nullable(),
  }),
  sociedad: z.literal("1000"),
  organizacion_compras: z.literal("1000"),
  proveedor: z.object({
    codigo_sap: z.string(),
    nit: z.string(),
    nombre: z.string(),
  }),
  moneda: z.enum(["COP", "USD"]),
  condiciones_pago: z.string(),
  aprobador: z.object({
    email: z.string(),
    fecha_aprobacion: z.string(),
    evidencia_sha256: z.string(),
  }),
  posiciones: z.array(
    z.object({
      numero: z.number(),
      descripcion: z.string().max(40),
      cantidad: z.number(),
      unidad: z.enum(["UN", "H", "MES"]),
      precio_unitario: z.number(),
      centro_costo: z.string(),
      subarea: z.string(),
      indicador_iva: z.string(),
    }),
  ),
  excepciones: z.array(
    z.object({
      codigo: z.string(),
      detalle: z.string(),
      confirmado_por: z.string().nullable(),
    }),
  ),
});

export type OrdenCompra = z.infer<typeof OrdenCompraSchema>;

export type Solicitud = {
  solicitud_id: string;
  solicitante: string;
  proveedor_nombre: string;
  proveedor_nit?: string;
  descripcion: string;
  centro_costo: string;
  subarea: string;
  cantidad: number;
  valor_unitario: number;
  valor_total: number;
  moneda: string;
  indicador_iva?: string;
  condiciones_pago?: string;
  fecha_solicitud: string;
};

export type Paquete = {
  correo: { id: string; de: string; asunto: string; fecha: string } | null;
  solicitud: Solicitud | null;
  cotizacion: {
    proveedor: string;
    nit: string | null;
    total: number;
    moneda: string;
    validez_hasta: string | null;
    texto: string;
  } | null;
  aprobacion: { de: string; fecha: string; aprobado: boolean; texto: string } | null;
  factura: { numero: string; fecha: string; total: number } | null;
  faltantes: string[];
};

export type Bloqueo = { codigo: string; mensaje: string };
export type Confirmacion = { codigo: string; mensaje: string; detalle?: string };

export type Derivados = {
  proveedor?: {
    codigo_sap: string;
    nit: string;
    nombre: string;
    fuente: string;
  };
  condiciones_pago?: { codigo: string; fuente: string };
  indicador_iva?: { codigo: string; fuente: string };
};

export type ValidacionResult = {
  apta: boolean;
  bloqueos: Bloqueo[];
  confirmaciones: Confirmacion[];
  derivados: Derivados;
  retroactiva: boolean;
};

export type ToolContext = {
  directory: string;
  sessionId: string;
};

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };
