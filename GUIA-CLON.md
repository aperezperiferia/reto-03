# Guía rápida — Clonar y probar el reto

Para evaluadores o cualquier persona que clone **https://github.com/aperezperiferia/reto-03**.

## Requisitos

- **Node.js 20+** (probado con Node 22)
- Git
- (Opcional) Cuenta OpenAI solo si quieres chat con modelo real

---

## 1. Clonar e instalar

```powershell
git clone https://github.com/aperezperiferia/reto-03.git
cd reto-03
npm install
```

**Windows:** si PowerShell muestra error con `npm.ps1` (política de ejecución), usa:

```powershell
npm.cmd install
```

---

## 2. Configurar `.env`

```powershell
copy .env.example .env
```

Elige un modo:

| Objetivo | Configuración en `.env` |
|----------|-------------------------|
| **Chat sin OpenAI** (recomendado para empezar) | `LLM_PROVIDER=mock` y `OPENAI_API_KEY` vacía |
| **Chat con OpenAI** | `LLM_PROVIDER=openai` y `OPENAI_API_KEY=sk-...` (**con valor**, no vacío) |

**Error frecuente:** `OPENAI_API_KEY=` vacío + `LLM_PROVIDER=openai` → mensaje *OPENAI_API_KEY no configurada*. Usa `mock` o pega una clave real.

No subas `.env` a Git (ya está en `.gitignore`).

---

## 3. Opción A — Demo sin LLM (~1 min)

Valida reglas RC1–RC10 y los 6 casos del PRD:

```powershell
npm.cmd run demo
```

Revisa salidas en `out/control.csv`, `out/sap/ordenes.jsonl`, `out/sol-*/`.

---

## 4. Opción B — Chat en navegador

```powershell
npm.cmd run dev
```

| Servicio | URL |
|----------|-----|
| **Chat (UI)** | http://localhost:5173 |
| **API health** | http://localhost:3001/api/health |

En `/api/health` verás `"mode": "mock"` o `"openai"` (sin exponer la clave).

**Ejemplos en el chat:**

```text
Procesa la solicitud sol-001
```

```text
Procesa sol-004
```

(luego, si pide confirmación)

```text
confirmo
```

```text
Procesa sol-002
```

(debe bloquear por proveedor inexistente)

**Nota:** http://localhost:3001/ responde `Cannot GET /` — es normal; la UI está en el puerto **5173**.

---

## 5. Más documentación

| Archivo | Contenido |
|---------|-----------|
| [README.md](./README.md) | Instalación detallada y troubleshooting |
| [ESTADO-ENTREGA.md](./ESTADO-ENTREGA.md) | Alcance, pendientes, entrega Git |
| [SOLUCION.md](./SOLUCION.md) | Arquitectura, controles, diseño SAP |
| [PRD.md](./PRD.md) | Enunciado original del reto |

---

## 6. Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| `OPENAI_API_KEY no configurada` | `LLM_PROVIDER=mock` o clave `sk-...` + `LLM_PROVIDER=openai` |
| Chat no conecta al backend | ¿Corre `npm run dev`? Revisa puertos 3001 y 5173 |
| `npm` bloqueado en PowerShell | Usa `npm.cmd` o abre **cmd** |
| Sin URL pública | Entrega por Git; demo en local — ver [ESTADO-ENTREGA.md](./ESTADO-ENTREGA.md) |
