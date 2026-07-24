/**
 * #156 (second entry path) — the client never SENT a display name, so
 * MatchRoom's rename branch always fell through to "Player N" and the player
 * saw a generic label on their own seat. These tests mock colyseus.js and
 * assert the join payload of BOTH dev entry points (create + joinById), plus
 * the sanitiser that keeps the sent name a fixpoint of the server's rule.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const created: { name: string; options: Record<string, unknown> }[] = [];
const joined: { roomId: string; options: Record<string, unknown> }[] = [];

function fakeRoom(): unknown {
  return {
    roomId: "room-1",
    onMessage: () => {},
    onLeave: () => {},
    onStateChange: () => {},
    state: {},
  };
}

vi.mock("colyseus.js", () => ({
  Client: class {
    create(name: string, options: Record<string, unknown>): Promise<unknown> {
      created.push({ name, options });
      return Promise.resolve(fakeRoom());
    }
    joinById(roomId: string, options: Record<string, unknown>): Promise<unknown> {
      joined.push({ roomId, options });
      return Promise.resolve(fakeRoom());
    }
  },
}));

import {
  RoomConnection,
  sanitizeDisplayName,
  setLocalDisplayName,
  getLocalDisplayName,
  MAX_DISPLAY_NAME,
} from "./RoomConnection";

describe("RoomConnection display name (#156)", () => {
  beforeEach(() => {
    created.length = 0;
    joined.length = 0;
    setLocalDisplayName("");
  });

  it("connectDev sends the logged-in name in the create options", async () => {
    setLocalDisplayName("Takuro");
    await new RoomConnection("acct-1").connectDev(undefined, "ws://x");
    expect(created[0]!.name).toBe("match");
    expect(created[0]!.options).toEqual({ accountId: "acct-1", displayName: "Takuro" });
  });

  it("connectDev keeps mapId alongside the name", async () => {
    setLocalDisplayName("Takuro");
    await new RoomConnection("acct-1").connectDev("arena-2", "ws://x");
    expect(created[0]!.options).toEqual({
      accountId: "acct-1",
      displayName: "Takuro",
      mapId: "arena-2",
    });
  });

  it("connectDevJoin — the OTHER entry path — sends it too", async () => {
    setLocalDisplayName("Takuro");
    await new RoomConnection("acct-1").connectDevJoin("room-1", "ws://x");
    expect(joined[0]!.options).toEqual({ accountId: "acct-1", displayName: "Takuro" });
  });

  it("couch guests get the (2P)..(4P) suffix, the owner does not", () => {
    setLocalDisplayName("Takuro");
    expect(new RoomConnection("acct-1").displayName()).toBe("Takuro");
    expect(new RoomConnection("acct-1:p2").displayName()).toBe("Takuro (2P)");
    expect(new RoomConnection("acct-1:p4").displayName()).toBe("Takuro (4P)");
  });

  it("omits displayName entirely when nobody is logged in (server falls back)", async () => {
    await new RoomConnection("acct-1").connectDev(undefined, "ws://x");
    expect(created[0]!.options).toEqual({ accountId: "acct-1" });
    expect("displayName" in created[0]!.options).toBe(false);
  });

  it("logout clears the published name", () => {
    setLocalDisplayName("Takuro");
    expect(getLocalDisplayName()).toBe("Takuro");
    setLocalDisplayName("");
    expect(getLocalDisplayName()).toBe("");
  });

  it("an explicit per-connection name beats the published one", () => {
    setLocalDisplayName("Takuro");
    expect(new RoomConnection("acct-1", "Riko").displayName()).toBe("Riko");
  });

  // The name is player-supplied text rendered next to other players: mirror the
  // server's sanitizeText rule exactly so what we send is already a fixpoint.
  it("drops HTML-significant + control characters, keeps spaces and CJK", () => {
    expect(sanitizeDisplayName("<img src=x onerror=alert(1)>")).toBe("img src=x onerror=alert(1)");
    expect(sanitizeDisplayName("a\u0000b\u001fc\u007f")).toBe("abc");
    expect(sanitizeDisplayName("  小明 大俠  ")).toBe("小明 大俠");
    expect(sanitizeDisplayName("he said \"hi\" & 'bye' `x` \\y")).toBe("he said hi  bye x y");
    expect(sanitizeDisplayName(undefined)).toBe("");
    expect(sanitizeDisplayName(42)).toBe("");
  });

  it("bounds the length, suffix included", () => {
    const long = "x".repeat(80);
    setLocalDisplayName(long);
    expect(getLocalDisplayName()).toHaveLength(MAX_DISPLAY_NAME);
    const guest = new RoomConnection("acct-1:p3").displayName();
    expect(guest.length).toBeLessThanOrEqual(MAX_DISPLAY_NAME);
    expect(guest.endsWith(" (3P)")).toBe(true);
  });

  // #156 failed the first time because only ONE of two paths was wired. The
  // net layer can't reach the platform store, so the publish side is a source
  // scan (same spirit as architecture.test.ts): if login stops publishing the
  // username, every dev/LAN seat silently reverts to "Player N".
  it("the platform store publishes the username on login and clears it on logout", () => {
    const src = readFileSync(join(__dirname, "../ui/platform/store.ts"), "utf8");
    expect(src).toMatch(/import\s*\{\s*setLocalDisplayName\s*\}\s*from\s*"\.\.\/\.\.\/net\/RoomConnection"/);
    expect(src).toContain("setLocalDisplayName(account.username)");
    expect(src).toContain('setLocalDisplayName("")');
  });

  it("a name that sanitises to nothing sends no displayName at all", async () => {
    setLocalDisplayName("<<>>");
    await new RoomConnection("acct-1").connectDev(undefined, "ws://x");
    expect(created[0]!.options).toEqual({ accountId: "acct-1" });
  });
});
