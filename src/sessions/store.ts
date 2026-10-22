import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionMessage } from "../agent/runner.js";

export type ChatSession = {
  id: string;
  createdAt: string;
  history: SessionMessage[];
  turns: Array<{
    user: string;
    assistant: string;
    toolCalls: unknown[];
    needsConfirmation: boolean;
    at: string;
  }>;
};

const memory = new Map<string, ChatSession>();

function sessionsDir(root: string): string {
  return join(root, "out", "sessions");
}

export function createSession(root: string, id?: string): ChatSession {
  const session: ChatSession = {
    id: id ?? randomUUID(),
    createdAt: new Date().toISOString(),
    history: [],
    turns: [],
  };
  memory.set(session.id, session);
  void persistSession(root, session);
  return session;
}

export function getSession(id: string): ChatSession | undefined {
  return memory.get(id);
}

export async function loadSession(root: string, id: string): Promise<ChatSession | undefined> {
  if (memory.has(id)) return memory.get(id);
  try {
    const raw = await readFile(join(sessionsDir(root), `${id}.json`), "utf8");
    const session = JSON.parse(raw) as ChatSession;
    memory.set(id, session);
    return session;
  } catch {
    return undefined;
  }
}

export async function persistSession(root: string, session: ChatSession): Promise<void> {
  memory.set(session.id, session);
  await mkdir(sessionsDir(root), { recursive: true });
  await writeFile(join(sessionsDir(root), `${session.id}.json`), JSON.stringify(session, null, 2), "utf8");
}
