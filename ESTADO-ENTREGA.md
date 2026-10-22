# Estado de la entrega — Reto 03

Documento de cierre para evaluadores: qué se entrega, cómo probarlo y qué quedó **fuera de alcance** de esta entrega.

## Forma de entrega

| Aspecto | Decisión |
|---------|----------|
| **Medio** | Repositorio Git (historial de commits). No se entrega zip salvo que lo pida el proceso. |
| **Link público** | **No incluido.** El PRD permite demo en local durante la defensa con penalización de **−10 puntos** (sección 9.3). |
| **Demo en defensa** | Clonar → `npm install` → `npm run demo` **o** chat con `LLM_PROVIDER=mock` (sin OpenAI). Ver README *OpenAI vs mock*. |

### Qué no debe subirse a Git

- `node_modules/`
- `out/` (generado al ejecutar)
- `.env` (solo `.env.example`)

Están listados en `.gitignore`.

### Pasos para quien evalúa el repo

```powershell
git clone https://github.com/aperezperiferia/reto-03.git
cd reto-03
npm install
npm run demo
```

Chat sin OpenAI (mock):

```powershell
copy .env.example .env
# .env: LLM_PROVIDER=mock y OPENAI_API_KEY vacía
npm.cmd run dev
```

Chat con OpenAI real:

```powershell
# .env: LLM_PROVIDER=openai y OPENAI_API_KEY=sk-... (con valor, no vacío)
npm.cmd run dev
```

Abrir **http://localhost:5173** (no http://localhost:3001 — la API no sirve la UI en `/`).

En Windows, si PowerShell bloquea `npm`, usar `npm.cmd run demo` / `npm.cmd run dev`.

---

## Completado (criterios P0 del PRD)

| Ítem | Evidencia |
|------|-----------|
| Herramientas `oc_leer_paquete`, `oc_validar`, `oc_construir_payload`, `oc_generar_evidencia`, `oc_crear` | `src/tools/oc.ts` |
| Reglas RC1–RC10 | `oc_validar` + casos `sol-001` … `sol-006` |
| `demo.ts` determinista (idempotencia `sol-001`, confirmación `sol-004`) | `npm run demo` |
| SAP simulado + `control.csv` | `src/sap/mock.ts`, `out/` tras ejecutar |
| Backend API (`/api/chat`, `/api/health`, `/api/sessions/:id`) | `src/server.ts` |
| Front chat (historial, tool calls, confirmación) | `web/` |
| System prompt externo | `agent/prompt.md` |
| Conocimiento de proceso | `src/knowledge/ordenes-compra.md` |
| Adaptador LLM intercambiable | `src/llm/adapter.ts`, `openai.ts` |
| Documentación | `README.md`, `SOLUCION.md`, este archivo |

Objetivos O1–O4 del PRD cubiertos por `demo.ts` y diseño del agente.

---

## No implementado / pendiente (documentado a propósito)

Estos ítems **no bloquean** la entrega por Git ni la demo local, pero no están hechos o están parciales:

| Ítem | PRD | Estado | Notas |
|------|-----|--------|-------|
| **URL pública** | 9.3 | No | Entrega solo Git; defensa en local (−10 según rúbrica). |
| **Carpeta `modulo/`** | 9.4 bonus | No | Agente empaquetado reutilizable (+10 puntos). |
| **`aprobacion.pdf`** | HU-4 P1 | No | Solo `out/<caso>/aprobacion.txt` + SHA-256. |
| **`oc_leer_excel`** | P1 opcional | Stub | Devuelve error indicando usar `solicitud.json`. |
| **Streaming** en chat | 6.1 opcional | No | Respuesta JSON completa por turno. |
| **Tope de tokens por sesión** | 8 costo | No | Solo `AGENT_MAX_ITERATIONS`; sin contador de tokens. |
| **SAP real** | 7.5 | Solo diseño | Descrito en `SOLUCION.md`, no código de integración. |
| **Front servido desde API** | — | No | Dos puertos: Vite 5173, API 3001. |
| **Bun** | 6 | No usado | Node 20+ + `tsx` (equivalente permitido en PRD). |

---

## Mejoras futuras (si hubiera segunda iteración)

1. Despliegue (Render/Railway): API + front estático, URL en README.  
2. `pdf-lib` para evidencia PDF.  
3. Carpeta `modulo/` alineada con `agent/prompt.md` y `src/tools/oc.ts`.  
4. Límite de tokens por sesión en backend.  
5. Un solo puerto en producción (`vite build` + Express static).

---

## Referencias rápidas

- Prueba local detallada: [README.md](./README.md#cómo-probar-en-local)  
- Planteamiento y trade-offs: [SOLUCION.md](./SOLUCION.md)  
- Requisitos originales: [PRD.md](./PRD.md)
