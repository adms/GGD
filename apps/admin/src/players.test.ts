/** adminui-players-filter: the client-side players filter matches username,
 * email and id substrings case-insensitively; win-rate formats safely. */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { filterAccounts, winRate } from "./players";
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
