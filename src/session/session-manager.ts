/**
 * Manages persistent chat sessions. Each session is stored as a JSON file
 * under `{CODEDIR}/sessions/` and contains metadata plus the conversation
 * message history. Sessions are auto-saved by the REPL after every turn.
 *
 * Exports:
 * - `SessionManager` — class; create, load, save, and list sessions
 * - `sessionManager` — singleton instance
 * - `SessionData` — type for a persisted session object
 * - `SessionInfo` — lightweight metadata for listing sessions
 *
 * Used by:
 * - `src/cli/repl.ts` — auto-saves after every turn
 * - `src/agent/commands/new-session.ts` — `/new` command
 * - `src/agent/commands/list-sessions.ts` — `/list` command
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { CODEDIR } from "../utils/constants.js";
import { BaseMessage, HumanMessage, AIMessage } from "../types/messages.js";

export interface SessionData {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: Array<{ role: string; content: string }>;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messageCount: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function deserializeMessage(msg: { role: string; content: string }): BaseMessage {
  if (msg.role === "user") return new HumanMessage(msg.content);
  return new AIMessage(msg.content);
}

const SESSIONS_DIR = join(CODEDIR, "sessions");

export class SessionManager {
  private currentId: string | null = null;

  /** Create a new session, set it as current, persist to disk, return its ID. */
  createNew(): string {
    const id = generateId();
    const now = new Date().toISOString();
    const data: SessionData = {
      id,
      createdAt: now,
      updatedAt: now,
      title: "",
      messages: [],
    };
    this.writeSession(data);
    this.currentId = id;
    return id;
  }

  /** Load a session's message history by ID. Returns null if not found. */
  load(id: string): BaseMessage[] | null {
    const data = this.readSession(id);
    if (!data) return null;
    this.currentId = id;
    return data.messages.map(deserializeMessage);
  }

  /**
   * Save the current session's message history to disk. Updates the title
   * to the first user message if not yet set.
   */
  saveCurrent(messages: BaseMessage[]): void {
    if (!this.currentId) return;
    const data = this.readSession(this.currentId);
    if (!data) return;

    data.messages = messages.map((m) => ({ role: m.role, content: m.content }));
    data.updatedAt = new Date().toISOString();

    if (!data.title && messages.length > 0) {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) {
        data.title = firstUser.content.replace(/\n.*$/s, "").slice(0, 60);
      }
    }

    this.writeSession(data);
  }

  /** List all persisted sessions, most recent first. */
  list(): SessionInfo[] {
    if (!existsSync(SESSIONS_DIR)) return [];

    const entries = readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.readSession(f.replace(/\.json$/, "")))
      .filter((d): d is SessionData => d !== null);

    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return entries.map((d) => ({
      id: d.id,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      title: d.title,
      messageCount: d.messages.length,
    }));
  }

  /** Return the current session ID, or null. */
  getCurrentId(): string | null {
    return this.currentId;
  }

  /** Set the current session ID. */
  setCurrentId(id: string): void {
    this.currentId = id;
  }

  private sessionPath(id: string): string {
    return join(SESSIONS_DIR, `${id}.json`);
  }

  private readSession(id: string): SessionData | null {
    const filePath = this.sessionPath(id);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as SessionData;
    } catch {
      return null;
    }
  }

  private writeSession(data: SessionData): void {
    mkdirSync(SESSIONS_DIR, { recursive: true });
    writeFileSync(this.sessionPath(data.id), JSON.stringify(data, null, 2), "utf-8");
  }
}

export const sessionManager = new SessionManager();
