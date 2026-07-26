/** adminui-players-filter: the client-side players filter matches username,
 * email and id substrings case-insensitively; win-rate formats safely. */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SEEN_ACTIVE_MS, agoText, filterAccounts, seenState, winRate } from "./players";
import type { AccountRow } from "./types";

function row(over: Partial<AccountRow>): AccountRow {
  return {
    id: "id",
    username: "user",
    email: "user@x.io",
    mmr: 1000,
    games: 0,
    wins: 0,
    mcoin: 0,
    banned: false,
    roles: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("players filter (adminui-players-filter)", () => {
  const rows = [
    row({ id: "01A", username: "Shadow", email: "shadow@ggd.gg" }),
    row({ id: "01B", username: "sela_main", email: "s@example.com" }),
    row({ id: "01C", username: "thorne", email: "t@example.com" }),
  ];

  it("empty query returns everything", () => {
    cover("adminui-players-filter");
    expect(filterAccounts(rows, "")).toHaveLength(3);
    expect(filterAccounts(rows, "   ")).toHaveLength(3);
  });

  it("matches username case-insensitively", () => {
    cover("adminui-players-filter");
    const out = filterAccounts(rows, "SHADOW");
    expect(out.map((r) => r.username)).toEqual(["Shadow"]);
  });

  it("matches email and id substrings", () => {
    cover("adminui-players-filter");
    expect(filterAccounts(rows, "example.com").map((r) => r.username)).toEqual(["sela_main", "thorne"]);
    expect(filterAccounts(rows, "01c").map((r) => r.username)).toEqual(["thorne"]);
  });

  it("win-rate is safe for zero games", () => {
    cover("adminui-players-filter");
    expect(winRate(row({ games: 0 }))).toBe("—");
    expect(winRate(row({ games: 4, wins: 3 }))).toBe("75%");
  });
});

/**
 * adminui-players-seen: the #246 上線燈號.
 *
 * The owner asked for「1小時內曾經有動作的玩家」, and the two ways to get this
 * wrong are both silent: showing a dark light for an account the server said
 * nothing about, and showing one confident 「目前連線中」 for someone who is idling
 * on the lobby menu rather than playing.
 */
describe("online light (adminui-players-seen)", () => {
  const NOW = Date.parse("2026-07-26T12:00:00Z");
  const at = (minsAgo: number): string => new Date(NOW - minsAgo * 60_000).toISOString();

  it("no lastSeenAt at all reads as 'never', never as 'offline just now'", () => {
    cover("adminui-players-seen");
    const s = seenState(row({}), NOW);
    expect(s.level).toBe("never");
    expect(s.tone).toBe("off");
    expect(s.label).toBe("—");
    expect(s.tooltip).toContain("沒有任何連線動作記錄");
    // presence absent too → the console says NOTHING about connectivity
    expect(s.presence).toBe("unknown");
    expect(s.tooltip).not.toContain("連線中");
  });

  it("the threshold is exactly one hour, and it is inclusive at the boundary", () => {
    cover("adminui-players-seen");
    expect(SEEN_ACTIVE_MS).toBe(60 * 60 * 1000);
    expect(seenState(row({ lastSeenAt: at(59) }), NOW).level).toBe("active");
    expect(seenState(row({ lastSeenAt: at(60) }), NOW).level).toBe("active");
    expect(seenState(row({ lastSeenAt: at(61) }), NOW).level).toBe("stale");
  });

  it("a live socket outranks the timestamp and names the REAL state", () => {
    cover("adminui-players-seen");
    const inMatch = seenState(row({ lastSeenAt: at(2), presence: "in-match" }), NOW);
    expect(inMatch.label).toBe("對戰中");
    expect(inMatch.tone).toBe("live");
    expect(inMatch.tooltip).toBe("最後動作 2 分鐘前\n目前連線中 · 對戰中");

    // The one that matters: an idle lobby tab is CONNECTED but NOT playing, and
    // the copy must not let those read the same.
    const inLobby = seenState(row({ lastSeenAt: at(2), presence: "in-lobby" }), NOW);
    expect(inLobby.label).toBe("大廳中");
    expect(inLobby.tooltip).toContain("在大廳");
    expect(inLobby.tooltip).not.toContain("對戰中");
  });

  it("presence 'offline' is an answer; a MISSING presence is not", () => {
    cover("adminui-players-seen");
    // the server read Redis and said no socket
    expect(seenState(row({ lastSeenAt: at(5), presence: "offline" }), NOW).tooltip).toContain("目前沒有連線");
    // the server could not read Redis — fail open, say only what is known
    const blind = seenState(row({ lastSeenAt: at(5) }), NOW);
    expect(blind.tooltip).toBe("最後動作 5 分鐘前");
    expect(blind.tone).toBe("active"); // the last-seen half still works
    // an unrecognised value is treated as unknown rather than rendered raw
    expect(seenState(row({ lastSeenAt: at(5), presence: "banana" }), NOW).presence).toBe("unknown");
  });

  it("an unparseable timestamp degrades to 'never' instead of NaN 分鐘前", () => {
    cover("adminui-players-seen");
    const s = seenState(row({ lastSeenAt: "not-a-date" }), NOW);
    expect(s.level).toBe("never");
    expect(s.label).toBe("—");
  });

  it("agoText scales from 剛剛 to days", () => {
    cover("adminui-players-seen");
    expect(agoText(5_000)).toBe("剛剛");
    expect(agoText(3 * 60_000)).toBe("3 分鐘前");
    expect(agoText(2 * 3_600_000)).toBe("2 小時前");
    expect(agoText(50 * 3_600_000)).toBe("2 天前");
    expect(agoText(-1)).toBe("剛剛"); // clock skew must not print a negative
  });
});
