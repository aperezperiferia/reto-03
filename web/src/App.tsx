import { useEffect, useState } from "react";

type ToolCall = {
  name: string;
  args: unknown;
  resultSummary: string;
};

type Turn = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  needsConfirmation?: boolean;
};

export function App() {
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        'Hola, soy el agente de órdenes de compra. Puedes pedirme por ejemplo: Procesa la solicitud "sol-004".',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<string>("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { provider: string; model: string; configured?: boolean }) => {
        setHealth(
          `${d.provider} / ${d.model}${d.configured === false ? " (sin API key)" : ""}`,
        );
      })
      .catch(() => setHealth("API no disponible"));
  }, []);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setLoading(true);
    setTurns((t) => [...t, { role: "user", content: text }]);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        reply?: string;
        toolCalls?: ToolCall[];
        needsConfirmation?: boolean;
        error?: string;
      };
      if (data.sessionId) setSessionId(data.sessionId);
      if (!res.ok) {
        setTurns((t) => [
          ...t,
          { role: "assistant", content: data.error ?? "Error en el servidor." },
        ]);
      } else {
        setTurns((t) => [
          ...t,
          {
            role: "assistant",
            content: data.reply ?? "",
            toolCalls: data.toolCalls,
            needsConfirmation: data.needsConfirmation,
          },
        ]);
      }
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", content: "No pude conectar con el backend. ¿Está corriendo npm run dev?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>
          Órdenes de compra SAP
          {health ? <span className="badge">{health}</span> : null}
        </h1>
        <p>Sesión: {sessionId.slice(0, 8)}…</p>
      </header>

      <div className="chat">
        {turns.map((turn, i) => (
          <div key={i}>
            <div
              className={`msg ${turn.role}${turn.needsConfirmation ? " confirm" : ""}`}
            >
              {turn.content}
              {turn.needsConfirmation ? (
                <div style={{ marginTop: "0.5rem", fontWeight: 600, color: "#b45309" }}>
                  ⚠ Se requiere tu confirmación antes de crear la OC.
                </div>
              ) : null}
            </div>
            {turn.toolCalls?.map((tc, j) => (
              <div className="tool-block" key={j}>
                <strong>{tc.name}</strong>
                <div>Args: {JSON.stringify(tc.args)}</div>
                <div>→ {tc.resultSummary}</div>
              </div>
            ))}
          </div>
        ))}
        {loading ? <div className="thinking">Pensando…</div> : null}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Ej: Procesa "sol-001"'
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          Enviar
        </button>
      </form>
    </div>
  );
}
