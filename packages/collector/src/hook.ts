import type { NormalizedEvent } from "@esyion/vakatime-core";
import {
  adaptClaudeCode,
  adaptCodex,
  adaptCursor,
  adaptOpenCode,
  adaptGeminiCli,
  adaptZcode,
} from "@esyion/vakatime-core";
import type { HeartbeatPayload } from "./upload.js";

export type HookSource = "claude-code" | "codex" | "cursor" | "opencode" | "gemini-cli" | "zcode";

export function eventToHeartbeatPayload(
  event: NormalizedEvent,
): HeartbeatPayload {
  return {
    entity: `${event.agent}:${event.event_type}:${event.turn_id ?? event.session_id}`,
    type: "agent",
    category: "ai",
    time: event.ts,
    project: event.project,
    agent: event.agent,
    session_id: event.session_id,
    turn_id: event.turn_id,
    meta: {
      event_type: event.event_type,
      timezone: event.timezone,
      duration_sec: event.duration_sec,
      ...event.meta,
    },
  };
}

export function adaptHookPayload(
  source: HookSource,
  payload: Record<string, unknown>,
): HeartbeatPayload | null {
  const eventName = String(payload.hook_event_name ?? payload.event ?? "");
  let event: NormalizedEvent | null = null;

  switch (source) {
    case "codex":
      event = adaptCodex(payload, eventName);
      break;
    case "cursor":
      event = adaptCursor(payload, eventName);
      break;
    case "claude-code":
      event = adaptClaudeCode(payload, eventName);
      break;
    case "opencode":
      event = adaptOpenCode(payload, eventName);
      break;
    case "gemini-cli":
      event = adaptGeminiCli(payload, eventName);
      break;
    case "zcode":
      event = adaptZcode(payload, eventName);
      break;
  }

  return event ? eventToHeartbeatPayload(event) : null;
}

export async function readStdinJson(): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  const parsed = JSON.parse(raw) as unknown;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}
