/**
 * webui-04 (webui-lobby-reducer) + webui-05 (webui-lobby-reducer-junk):
 * the pure lobby WS reducer — presence/invite/chat/match_ready/error frames
 * project into store updates; malformed or unknown frames are ignored
 * without throwing and return the identical state reference.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CHAT_CAP,
  INVITE_CAP,
  initialLobbyWsState,
  reduceLobbyMessage,
  removeInvite,
} from "./lobbyReducer";

describe("lobby WS reducer (webui-04)", () => {
  it("presence deltas accumulate per account (and dedupe no-ops)", () => {
    cover("webui-lobby-reducer");
    const s0 = initialLobbyWsState();
    const s1 = reduceLobbyMessage(s0, { type: "presence", accountId: "a1", state: "in-lobby" });
    const s2 = reduceLobbyMessage(s1, { type: "presence", accountId: "a2", state: "in-match" });
    expect(s2.presence).toEqual({ a1: "in-lobby", a2: "in-match" });
    const s3 = reduceLobbyMessage(s2, { type: "presence", accountId: "a1", state: "in-lobby" });
    expect(s3).toBe(s2); // unchanged value → same reference (no re-render)
    const s4 = reduceLobbyMessage(s3, { type: "presence", accountId: "a1", state: "offline" });
    expect(s4.presence.a1).toBe("offline");
  });

  it("invites append, dedupe by token, and cap", () => {
    cover("webui-lobby-reducer");
    let s = initialLobbyWsState();
    const inv = { type: "invite", roomId: "r1", roomName: "Room", from: "a2", token: "tok-1" };
    s = reduceLobbyMessage(s, inv);
    s = reduceLobbyMessage(s, inv); // duplicate push
    expect(s.invites).toHaveLength(1);
    for (let i = 0; i < INVITE_CAP + 3; i++) {
      s = reduceLobbyMessage(s, { ...inv, token: `tok-x${i}` });
    }
    expect(s.invites.length).toBe(INVITE_CAP);
    // removal (accepted/dismissed)
    const last = s.invites[s.invites.length - 1]!.token;
    const removed = removeInvite(s, last);
    expect(removed.invites.some((i) => i.token === last)).toBe(false);
    expect(removeInvite(removed, "unknown")).toBe(removed);
  });

  it("chat appends in order and caps at CHAT_CAP", () => {
    cover("webui-lobby-reducer");
    let s = initialLobbyWsState();
    for (let i = 0; i < CHAT_CAP + 10; i++) {
      s = reduceLobbyMessage(s, {
        type: "chat",
        roomId: "r1",
        from: "a1",
        fromName: "alice",
        text: `msg ${i}`,
        at: i,
      });
    }
    expect(s.chat).toHaveLength(CHAT_CAP);
    expect(s.chat[s.chat.length - 1]!.text).toBe(`msg ${CHAT_CAP + 9}`);
    expect(s.chat[0]!.text).toBe("msg 10"); // oldest dropped
  });

  it("match_ready stores the seat token push (endpoint + seatToken + matchId)", () => {
    cover("webui-lobby-reducer");
    const s = reduceLobbyMessage(initialLobbyWsState(), {
      type: "match_ready",
      matchId: "m_01",
      endpoint: "ws://localhost:2567",
      seatToken: '{"room":{"roomId":"x"},"sessionId":"s"}',
    });
    expect(s.matchReady).toMatchObject({ matchId: "m_01", endpoint: "ws://localhost:2567" });
    expect(s.matchReady!.seatToken).toContain("sessionId");
  });

  it("error frames surface code+message (chat rejections etc.)", () => {
    cover("webui-lobby-reducer");
    const s = reduceLobbyMessage(initialLobbyWsState(), {
      type: "error",
      code: "rate_limited",
      message: "slow down",
    });
    expect(s.wsError).toEqual({ code: "rate_limited", message: "slow down" });
  });
});

describe("malformed / unknown WS frames (webui-05)", () => {
  it("ignores junk without throwing and returns the same reference", () => {
    cover("webui-lobby-reducer-junk");
    const s = reduceLobbyMessage(
      reduceLobbyMessage(initialLobbyWsState(), { type: "presence", accountId: "a1", state: "online" }),
      { type: "chat", roomId: "r", from: "a", fromName: "n", text: "hi", at: 1 },
    );
    const junk: unknown[] = [
      null,
      undefined,
      42,
      "presence",
      [],
      {},
      { type: 7 },
      { type: "presence" }, // missing fields
      { type: "invite", roomId: "r" }, // missing token
      { type: "match_ready", matchId: "m" }, // missing seatToken/endpoint
      { type: "chat", text: 9 },
      { type: "totally_new_thing", data: { nested: true } },
      { type: "heartbeat_ack" }, // known but stateless
    ];
    for (const j of junk) {
      expect(reduceLobbyMessage(s, j), JSON.stringify(j ?? "nullish")).toBe(s);
    }
  });
});
