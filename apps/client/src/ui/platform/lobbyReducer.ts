/**
 * Lobby WebSocket message reducer — PURE: (state, raw message) → next state.
 * The Zustand app store applies the result; this module knows nothing about
 * zustand/React so it is trivially unit-testable. Unknown/malformed messages
 * never throw — they return the previous state unchanged.
 */
import type { ChatMsg, InviteMsg, MatchReadyMsg, ServerWsMsg } from "./types";

export const CHAT_CAP = 100;
export const INVITE_CAP = 10;

export interface LobbyWsState {
  /** accountId -> presence state ("online"|"in-lobby"|"in-match"|"offline") */
  presence: Record<string, string>;
  /** pending room invites, newest last (deduped by token) */
  invites: InviteMsg[];
  /** room chat log, oldest first, capped at CHAT_CAP */
  chat: ChatMsg[];
  /** seat reservation push — set once when the room's match starts */
  matchReady: MatchReadyMsg | null;
  /** last error frame from the server (chat rejections etc.) */
  wsError: { code: string; message: string } | null;
}

export function initialLobbyWsState(): LobbyWsState {
  return { presence: {}, invites: [], chat: [], matchReady: null, wsError: null };
}

/** Runtime-narrow a parsed frame; null when it isn't a known server message. */
export function parseServerMsg(raw: unknown): ServerWsMsg | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.type !== "string") return null;
  switch (m.type) {
    case "presence":
      return typeof m.accountId === "string" && typeof m.state === "string" ? (m as unknown as ServerWsMsg) : null;
    case "invite":
      return typeof m.roomId === "string" && typeof m.token === "string" ? (m as unknown as ServerWsMsg) : null;
    case "chat":
      return typeof m.roomId === "string" && typeof m.text === "string" ? (m as unknown as ServerWsMsg) : null;
    case "match_ready": {
      if (typeof m.seatToken !== "string" || typeof m.endpoint !== "string") return null;
      // couch play: seatTokens[] is optional; a malformed array is dropped
      // (the compat seatToken field still launches a single-player join)
      if (m.seatTokens !== undefined) {
        const valid =
          Array.isArray(m.seatTokens) &&
          m.seatTokens.length > 0 &&
          m.seatTokens.every(
            (e: unknown) =>
              typeof e === "object" &&
              e !== null &&
              typeof (e as Record<string, unknown>).accountId === "string" &&
              typeof (e as Record<string, unknown>).seatToken === "string",
          );
        if (!valid) {
          const { seatTokens: _drop, ...rest } = m;
          return rest as unknown as ServerWsMsg;
        }
      }
      return m as unknown as ServerWsMsg;
    }
    case "error":
      return typeof m.code === "string" ? (m as unknown as ServerWsMsg) : null;
    case "heartbeat_ack":
      return m as unknown as ServerWsMsg;
    default:
      return null;
  }
}

/**
 * Apply one raw WS frame. Returns the SAME state reference when nothing
 * changed (unknown/malformed/heartbeat frames) so callers can skip re-renders.
 */
export function reduceLobbyMessage(state: LobbyWsState, raw: unknown): LobbyWsState {
  const msg = parseServerMsg(raw);
  if (!msg) return state;
  switch (msg.type) {
    case "presence": {
      if (state.presence[msg.accountId] === msg.state) return state;
      return { ...state, presence: { ...state.presence, [msg.accountId]: msg.state } };
    }
    case "invite": {
      if (state.invites.some((i) => i.token === msg.token)) return state;
      const invites = [...state.invites, msg].slice(-INVITE_CAP);
      return { ...state, invites };
    }
    case "chat": {
      const chat = [...state.chat, msg].slice(-CHAT_CAP);
      return { ...state, chat };
    }
    case "match_ready": {
      return { ...state, matchReady: msg };
    }
    case "error": {
      return { ...state, wsError: { code: msg.code, message: msg.message } };
    }
    case "heartbeat_ack":
      return state;
  }
}

/** Drop an invite (accepted or dismissed). */
export function removeInvite(state: LobbyWsState, token: string): LobbyWsState {
  if (!state.invites.some((i) => i.token === token)) return state;
  return { ...state, invites: state.invites.filter((i) => i.token !== token) };
}
