# SOLUCION.md — Reto 03

## 1. Problema en una frase

La analista administrativa pierde horas digitando órdenes de compra en SAP y validando controles de memoria; le duele a **Administración** y a **Auditoría** (evidencia y trazabilidad).

## 2. Arquitectura

```
Chat (React/Vite) ──HTTP──▶ Express (ciclo agente)
                              ├─ agent/prompt.md
                              ├─ src/knowledge/ordenes-compra.md
                              ├─ src/tools/oc.ts (zod + execute)
                              ├─ src/llm/openai.ts
                              └─ src/sap/mock.ts
fixtures/ (lectura)          out/ (control.csv, sap, evidencias, log.jsonl)
```

- **Comportamiento**: `agent/prompt.md`
- **Conocimiento**: `src/knowledge/ordenes-compra.md`
- **Ejecución / reglas**: `src/tools/oc.ts` (RC1–RC10)

## 3. Ciclo del agente

Bucle con tope `AGENT_MAX_ITERATIONS` (25): modelo → tool calls → resultados JSON → modelo hasta respuesta final. Confirmación humana: si `oc_validar` o `oc_crear` indican confirmaciones pendientes, el front marca `needsConfirmation` y el prompt exige pregunta explícita antes de `oc_crear` con `confirmado: true`.

## 4. Elección del modelo

- **Proveedor**: OpenAI  
- **Modelo**: `gpt-4o-mini` (balance costo/calidad para tool calling)  
- **Costo estimado por caso**: ~2–4k tokens → USD 0.001–0.003 por solicitud (orden de magnitud).

## 5. Matriz de controles

| Regla | Implementación |
|-------|----------------|
| RC1 | Match NIT o nombre normalizado + `activo` |
| RC2 | Email aprobador ∈ matriz del centro + "Aprobado" |
| RC3 | `valor_total` ≤ `tope` |
| RC4 | `subarea` en maestro del centro |
| RC5 | Diff relativo cotización vs solicitud > 2 % → confirmación |
| RC6 | IVA default proveedor + confirmación |
| RC7 | Condiciones pago default (derivado informado) |
| RC8 | `factura.fecha` < `fecha_solicitud` → retroactiva + confirmación |
| RC9 | Fecha aprobación < solicitud → confirmación |
| RC10 | `cantidad × unitario` vs `valor_total` ±1 COP |

**Más difícil**: RC5 + RC8 juntos en casos reales (montos con IVA incluido en cotización vs base en solicitud); en fixtures el total de cotización ya es comparable.

## 6. Diseño adaptador SAP real

**Opción preferida**: OData `API_PURCHASEORDER_PROCESS_SRV` sobre SAP S/4 o ECC expuesto vía SAP Gateway, por mantenimiento estándar y payload JSON cercano al modelo 7.4.

**Mapeo**: `OrdenCompra.proveedor.codigo_sap` → `Supplier`; posiciones → `PurchaseOrderItem` con `AccountAssignment` (centro/subárea); `condiciones_pago` → `CashDiscount1Days` / payment terms; evidencia → anexo GOS o ArchiveLink con `sha256` en metadatos.

**Autenticación**: OAuth2 client credentials o certificado mTLS en un **connectors service** fuera del agente; secretos en vault (Azure Key Vault / SAP BTP Destination).

**Idempotencia**: clave `solicitud_id` en campo referencia (`ExternalReference`); antes de POST consultar por referencia; errores parciales → compensación con cancelación de ítems creados o estado `PENDIENTE_SAP` en cola.

**Plan B**: export CSV/Excel de carga masiva (ME59N) + PDF de evidencia; el agente elimina digitación aunque SAP sea batch.

## 7. OC retroactivas (dirección)

El log `out/control.csv` permite medir % retroactivas (`retroactiva=true`). Propondría política: tolerar solo con confirmación explícita y reporte mensual; objetivo de proceso: OC antes de factura, con alerta si llega factura sin OC.

## 8. Decisiones y trade-offs

1. **OpenAI vs local**: descarté modelo local por tiempo de setup; OpenAI acelera tool calling estable.  
2. **Validación en herramientas vs prompt**: toda regla en `oc_validar`; el LLM no calcula montos.  
3. **Sesiones en archivo vs DB**: archivos en `out/sessions` suficientes para el reto; DB descartada por alcance.

## 9. Supuestos

- Totales de cotización en texto son comparables a `valor_total` de solicitud.  
- Un ítem por OC (posición 10) salvo ampliación futura.  
- Confirmación del analista basta como `confirmado_por` en excepciones.

## 10. Cobertura HU

| HU | Estado | Falta producción |
|----|--------|------------------|
| HU-1 Leer paquete | Hecho | Excel/PDF binarios |
| HU-2 Validar | Hecho | Maestros en tiempo real SAP |
| HU-3 Payload + trazabilidad | Hecho | Más posiciones, textos SAP |
| HU-4 Evidencia | Hecho (txt) | PDF P1 |
| HU-5 Crear OC | Hecho | SAP real |
| HU-6 Errores | Hecho | Observabilidad centralizada |

**Prueba en local:** paso a paso (instalación, `npm run demo` sin API key, chat con `npm run dev`, archivos en `out/`, troubleshooting) en [README.md](./README.md) — sección *Cómo probar en local*.

## 11. Uso de IA

- **Cursor / Claude**: generación inicial de estructura, herramientas y front; revisión manual de reglas RC y prueba con `demo.ts`.

## 12. Riesgos producción

| Riesgo | Mitigación |
|--------|------------|
| SAP no disponible | Plan B carga masiva |
| Alucinaciones del modelo | Solo datos de tools |
| Costo LLM | Topes de iteración y tokens |
| Evidencia insuficiente | Firma digital / workflow formal |

## 13. Entrega y alcance de este repositorio

- **Medio:** Git único (sin zip salvo requerimiento del proceso).
- **Sin link público:** se asume demo en defensa en local (−10 puntos PRD 9.3).
- **Lista explícita** de lo completado vs pendiente/opcional: [ESTADO-ENTREGA.md](./ESTADO-ENTREGA.md).

Pendiente deliberado para una v2: despliegue, `modulo/` (bonus), PDF de evidencia, `oc_leer_excel`, tope de tokens por sesión.
