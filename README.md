# Reto 03 — Agente conversacional Órdenes de Compra SAP

Aplicación full-stack (chat + backend + herramientas tipadas) que automatiza lectura del paquete de compra, validaciones RC1–RC10, payload SAP, evidencia de aprobación y creación en SAP simulado.

## Requisitos

- Node.js 20+ (probado con Node 22)
- Para el **chat con IA**: clave OpenAI solo en el backend (`OPENAI_API_KEY` en `.env`)
- Para **validar reglas de negocio sin IA**: no hace falta ninguna clave

## Cómo probar en local

### 1. Instalación (primera vez)

Desde la carpeta `reto-03`:

**Windows (PowerShell):**

```powershell
npm install
copy .env.example .env
```

**macOS / Linux:**

```bash
npm install
cp .env.example .env
```

Opcional: edita `.env` y agrega `OPENAI_API_KEY=sk-...` si vas a usar el chat. No subas `.env` al repositorio.

### 2. Prueba rápida sin modelo (recomendado para evaluar controles)

Ejecuta el script que llama las herramientas directamente (limpia `out/` al inicio):

```powershell
npm run demo
```

**Qué deberías ver en consola:**

| Caso | Esperado |
|------|----------|
| `sol-001` | `apta: true` → OC `4500000001` |
| `sol-002` | Bloqueo RC1, sin OC |
| `sol-003` | Bloqueo RC2, sin OC |
| `sol-004` | Confirmación RC5 → OC creada si el demo confirma |
| `sol-005` | `retroactiva: true` + confirmación RC8 → OC |
| `sol-006` | Confirmación RC6 (IVA derivado) → OC |
| `sol-001` (2.ª vez) | Misma OC `(idempotente)` |
| `sol-004` (sin confirmar) | Mensaje de confirmación pendiente, sin OC |

**Archivos generados** (revisa después del demo):

- `out/control.csv` — log de cada intento (creada / bloqueado / pendiente)
- `out/sap/ordenes.jsonl` — órdenes en el SAP simulado
- `out/sol-001/aprobacion.txt`, `trazabilidad.json`, etc.

### 3. Prueba del chat (agente + LLM)

1. Configura `OPENAI_API_KEY` en `.env`.
2. Levanta front y API con un solo comando:

```powershell
npm run dev
```

3. Abre el navegador en **http://localhost:5173**.
4. Comprueba que la API responde (opcional):

```powershell
curl http://localhost:3001/api/health
```

Debe devolver JSON con `ok`, `provider` y `model` **sin** exponer la clave.

5. En el chat, prueba los escenarios del PRD. Ejemplos:

**Flujo feliz:**

```text
Procesa la solicitud "sol-001".
```

**Con confirmación (no crear hasta que confirmes):**

```text
Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué
validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.
```

Luego escribe: `confirmo`.

**Bloqueo:**

```text
Procesa la solicitud "sol-002".
```

En la interfaz deberías ver cada **llamada a herramienta** (nombre, argumentos, resumen) y un aviso amarillo cuando el agente **pide confirmación**.

**Registro de herramientas:** cada turno también appendea líneas en `out/log.jsonl`.

### 4. Probar solo la API (sin navegador)

Con el servidor corriendo (`npm run dev` o `npm start` en otra terminal):

```powershell
curl -X POST http://localhost:3001/api/chat `
  -H "Content-Type: application/json" `
  -d "{\"message\": \"Procesa sol-001\"}"
```

(PowerShell: ajusta comillas si usas `Invoke-RestMethod`; en bash usa comillas simples en el JSON.)

### 5. Solución de problemas local

| Síntoma | Qué revisar |
|---------|-------------|
| Chat: "No pude conectar con el backend" | ¿Corre `npm run dev`? Puerto 3001 libre |
| Chat: error 503 / LLM | `OPENAI_API_KEY` en `.env`, reinicia `npm run dev` |
| Demo distinto entre ejecuciones | Normal si no borras `out/`; el demo **siempre** limpia `out/` al inicio |
| Puertos ocupados | Cambia `PORT` en `.env` y el proxy en `web/vite.config.ts` |
| `npm.ps1` / ejecución de scripts deshabilitada (Windows) | Usa `npm.cmd run dev` o abre **cmd** en lugar de PowerShell |
| Navegador: `Cannot GET /` en puerto 3001 | Es la API; abre el chat en **http://localhost:5173** |

## Entrega (Git)

Esta entrega se publica **solo en Git**, sin URL desplegada. El evaluador clona el repo y sigue [Cómo probar en local](#cómo-probar-en-local).

**Resumen de alcance, ítems pendientes y penalización por link público:** ver [ESTADO-ENTREGA.md](./ESTADO-ENTREGA.md).

Antes del push, verifica que no subes `node_modules/`, `out/` ni `.env` (ya están en `.gitignore`).

## Arranque local (referencia)

```powershell
npm install
copy .env.example .env
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3001  

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `OPENAI_API_KEY` | Clave del proveedor (solo servidor) |
| `OPENAI_MODEL` | Modelo (default `gpt-4o-mini`) |
| `AGENT_MAX_ITERATIONS` | Tope de ciclo herramienta↔modelo (default 25) |
| `LLM_TIMEOUT_MS` | Timeout al proveedor |
| `PORT` | Puerto API (default 3001) |

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/health` | Estado; no expone claves |
| `POST` | `/api/chat` | `{ sessionId?, message }` → `{ reply, toolCalls, needsConfirmation }` |
| `GET` | `/api/sessions/:id` | Historial de sesión |

## Estructura

- `agent/prompt.md` — comportamiento del agente  
- `src/knowledge/` — conocimiento del proceso  
- `src/tools/oc.ts` — herramientas `oc_*`  
- `src/sap/mock.ts` — SAP simulado → `out/sap/ordenes.jsonl`  
- `demo.ts` — verificación determinista  

## Link de prueba

**No aplica:** no hay despliegue público. Prueba en local según esta guía; detalle en [ESTADO-ENTREGA.md](./ESTADO-ENTREGA.md).
