/**
 * Task #37 — ranked-ladder panel view logic (pure half of LeaderboardPanel):
 *
 *   rank-ui-tabs          — the panel reducer: player/champion tab + 英雄榜/我的英雄
 *                           sub-view switching, picker open/close, no-op dedupe
 *   rank-ui-champ-pick     — selecting a champion records it (board view, picker
 *                           closed) AND loadChampionBoard fires the fetcher with
 *                           that championId (mock)
 *   rank-ui-me-highlight   — the "you" row-highlight predicate
 *   rank-ui-champ-fallback — picker options keep absent icons null (letter-tile
 *                           fallback) and sort by name; championInitial glyph
 *   rank-ui-paginate       — "load more" page merge (dedupe), hasMore, nextOffset
 *   rank-ui-mychamps-sort  — 我的英雄 sorted by points desc, deterministic ties
 *   rank-ui-mobile         — touch/narrow-viewport stylesheet (crest scaling,
 *                            tappable tabs, 1-column picker, stacked lobby) and
 *                            the class hooks the panel actually renders
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  appendPage,
  buildChampionOptions,
  championInitial,
  computeRankDelta,
  formatPointsDelta,
  hasMore,
  initialRankPanelState,
  isMeRow,
  loadChampionBoard,
  meInPage,
  nextOffset,
  rankPanelReducer,
  sortMyChampions,
  PAGE_SIZE,
  type ChampionBoardFetcher,
  type MyChampionRow,
  type RankLadderRow,
} from "./ranking";
import type { PlayerMeStanding } from "./types";

function row(accountId: string, rank: number, points: number): RankLadderRow {
  return { accountId, rank, points, username: accountId, tier: "gold", division: 2 };
}

function standing(points: number, rank: number, tier: string | number, division?: string | number): PlayerMeStanding {
  return { points, rank, tier, division: division ?? null, percentile: 0 };
}

describe("post-match rank delta (settle-delta)", () => {
  it("computes a positive point gain + climb when the player improved", () => {
    cover("settle-delta");
    const d = computeRankDelta(standing(1200, 40, "gold", 2), standing(1218, 33, "gold", 1));
    expect(d.pointsGain).toBe(18);
    expect(d.rankGain).toBe(7); // 40 → 33 = climbed 7 places
    expect(d.tierChanged).toBe(true); // division changed
    expect(formatPointsDelta(d.pointsGain)).toBe("+18");
  });

  it("handles a loss and a same-tier no-change", () => {
    cover("settle-delta");
    const loss = computeRankDelta(standing(1200, 40, "gold"), standing(1185, 44, "gold"));
    expect(loss.pointsGain).toBe(-15);
    expect(loss.rankGain).toBe(-4); // fell 4 places
    expect(loss.tierChanged).toBe(false);
    expect(formatPointsDelta(loss.pointsGain)).toBe("-15");
    expect(formatPointsDelta(0)).toBe("0");
  });

  it("returns nulls (and — labels) when a side is unplaced/offline", () => {
    cover("settle-delta");
    const before = computeRankDelta(null, standing(1000, 50, "silver"));
    expect(before.pointsGain).toBeNull();
    expect(before.rankGain).toBeNull();
    expect(before.pointsAfter).toBe(1000);
    expect(before.tierChanged).toBe(false);
    expect(formatPointsDelta(computeRankDelta(null, null).pointsGain)).toBe("—");
  });
});

describe("panel reducer / tab switching (rank-ui-tabs)", () => {
  it("switches the top tab and champion sub-view, toggling the picker closed", () => {
    cover("rank-ui-tabs");
    const s0 = initialRankPanelState;
    expect(s0.tab).toBe("player");

    const s1 = rankPanelReducer(s0, { type: "setTab", tab: "champion" });
    expect(s1.tab).toBe("champion");
    // same-tab dispatch is a no-op (identical reference → no re-render)
    expect(rankPanelReducer(s1, { type: "setTab", tab: "champion" })).toBe(s1);

    const opened = rankPanelReducer(s1, { type: "togglePicker" });
    expect(opened.pickerOpen).toBe(true);
    // switching sub-view closes an open picker
    const mine = rankPanelReducer(opened, { type: "setChampionView", view: "mine" });
    expect(mine.championView).toBe("mine");
    expect(mine.pickerOpen).toBe(false);
    // switching the top tab also closes the picker
    const reopened = rankPanelReducer(mine, { type: "setPicker", open: true });
    const backToPlayer = rankPanelReducer(reopened, { type: "setTab", tab: "player" });
    expect(backToPlayer.pickerOpen).toBe(false);
    // unknown action → same reference
    expect(rankPanelReducer(s0, { type: "bogus" } as never)).toBe(s0);
  });
});

describe("champion picker selection triggers a fetch (rank-ui-champ-pick)", () => {
  it("selecting a champion records it (board view, picker closed)", () => {
    cover("rank-ui-champ-pick");
    const opened = rankPanelReducer(
      { ...initialRankPanelState, tab: "champion", championView: "mine", pickerOpen: true },
      { type: "selectChampion", championId: "godie-arthas" },
    );
    expect(opened.selectedChampionId).toBe("godie-arthas");
    expect(opened.championView).toBe("board");
    expect(opened.pickerOpen).toBe(false);
  });

  it("loadChampionBoard calls the fetcher with the chosen championId + paging", async () => {
    cover("rank-ui-champ-pick");
    const fetcher = vi.fn<ChampionBoardFetcher>(async () => [row("a1", 1, 500), row("a2", 2, 300)]);
    const res = await loadChampionBoard("godie-arthas", {}, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("godie-arthas", PAGE_SIZE, 0);
    expect(res.rows.map((r) => r.accountId)).toEqual(["a1", "a2"]);
    expect(res.hasMore).toBe(false); // short page → no more

    // a full page → more remains; offset is forwarded
    const full = vi.fn<ChampionBoardFetcher>(async () => Array.from({ length: PAGE_SIZE }, (_, i) => row(`x${i}`, i + 1, 100)));
    const res2 = await loadChampionBoard("c", { offset: PAGE_SIZE }, full);
    expect(full).toHaveBeenCalledWith("c", PAGE_SIZE, PAGE_SIZE);
    expect(res2.hasMore).toBe(true);
  });
});

describe("you-row highlight (rank-ui-me-highlight)", () => {
  it("matches the caller's account id, ignores everyone else / no-session", () => {
    cover("rank-ui-me-highlight");
    const me = row("me-1", 4, 250);
    expect(isMeRow(me, "me-1")).toBe(true);
    expect(isMeRow(me, "other")).toBe(false);
    expect(isMeRow(me, null)).toBe(false);
    expect(isMeRow(me, undefined)).toBe(false);
    const page = [row("a", 1, 9), me, row("b", 5, 1)];
    expect(meInPage(page, "me-1")).toBe(true);
    expect(meInPage(page, "nope")).toBe(false);
    expect(meInPage(page, null)).toBe(false);
  });
});

describe("champion picker options + icon fallback (rank-ui-champ-fallback)", () => {
  it("keeps absent icons null and sorts options by name", () => {
    cover("rank-ui-champ-fallback");
    const opts = buildChampionOptions([
      { id: "z", name: "Zed", icon: "assets/icons/champions/zed.png" },
      { id: "a", name: "Ashe" }, // stock-art hero → no icon field
    ]);
    expect(opts.map((o) => o.id)).toEqual(["a", "z"]); // name-sorted
    const ashe = opts.find((o) => o.id === "a")!;
    expect(ashe.icon).toBeNull(); // absent → null → letter-tile fallback
    const zed = opts.find((o) => o.id === "z")!;
    expect(zed.icon).toBe("assets/icons/champions/zed.png");
  });

  it("championInitial yields the fallback glyph (incl. CJK / empty)", () => {
    cover("rank-ui-champ-fallback");
    expect(championInitial("Ashe")).toBe("A");
    expect(championInitial("亞瑟")).toBe("亞");
    expect(championInitial("   ")).toBe("?");
    expect(championInitial("")).toBe("?");
  });
});

describe("load-more pagination (rank-ui-paginate)", () => {
  it("appends pages, de-dupes by accountId, keeps first-seen order", () => {
    cover("rank-ui-paginate");
    const p1 = [row("a", 1, 9), row("b", 2, 8)];
    const p2 = [row("b", 2, 8), row("c", 3, 7)]; // b re-listed across the boundary
    const merged = appendPage(p1, p2);
    expect(merged.map((r) => r.accountId)).toEqual(["a", "b", "c"]);
  });

  it("hasMore only when a full page came back; nextOffset = loaded count", () => {
    cover("rank-ui-paginate");
    expect(hasMore(PAGE_SIZE, PAGE_SIZE)).toBe(true);
    expect(hasMore(PAGE_SIZE - 1, PAGE_SIZE)).toBe(false);
    expect(hasMore(0, PAGE_SIZE)).toBe(false);
    expect(nextOffset(0)).toBe(0);
    expect(nextOffset(50)).toBe(50);
  });
});

describe("my-champions sort (rank-ui-mychamps-sort)", () => {
  it("orders by points desc, breaking ties by rank then championId", () => {
    cover("rank-ui-mychamps-sort");
    const rows: MyChampionRow[] = [
      { championId: "c", points: 100, tier: "silver", division: 3, rank: 40 },
      { championId: "a", points: 900, tier: "diamond", division: 1, rank: 5 },
      { championId: "b", points: 100, tier: "silver", division: 3, rank: 12 }, // ties c on points, better rank
    ];
    const sorted = sortMyChampions(rows);
    expect(sorted.map((r) => r.championId)).toEqual(["a", "b", "c"]);
    // input not mutated
    expect(rows[0]!.championId).toBe("c");
  });
});

// The client vitest env is node (no DOM), so the mobile layer is gated the same
// way mobilePwa.test.ts gates ui/mobile.css: scan the stylesheet + the panel
// source and assert the media queries and their class hooks line up.
describe("touch / narrow-viewport layout (rank-ui-mobile)", () => {
  const read = (rel: string): string => readFileSync(join(__dirname, "..", "..", rel), "utf8");

  it("stylesheet: coarse-pointer crest scaling + tappable tabs + roomy rows", () => {
    cover("rank-ui-mobile");
    const css = read("ui/platform/ranking.css");
    expect(css).toContain("@media (pointer: coarse)");
    // tabs clear the 44px touch target
    expect(css).toMatch(/\.ggd-rank-tabs button[\s\S]*?min-height:\s*44px/);
    // the TierBadge crest scales up (svg width/height beats the 22px attribute)
    expect(css).toMatch(/\.ggd-rank-row svg[\s\S]*?width:\s*28px/);
    expect(css).toMatch(/\.ggd-rank-row svg[\s\S]*?height:\s*28px/);
    // champion picker tiles stay thumb-sized
    expect(css).toMatch(/\.ggd-rank-picker-grid button[\s\S]*?min-height:\s*48px/);
  });

  it("stylesheet: narrow viewports stack the lobby columns and single-column the picker", () => {
    cover("rank-ui-mobile");
    const css = read("ui/platform/ranking.css");
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toMatch(/\.ggd-lobby-body[\s\S]*?flex-wrap:\s*wrap/);
    // inline styles carry the column widths, so the override must be !important
    expect(css).toMatch(/\.ggd-lobby-col[\s\S]*?width:\s*100%\s*!important/);
    expect(css).toMatch(/\.ggd-rank-picker-grid[\s\S]*?grid-template-columns:\s*1fr/);
  });

  it("the panel + lobby render the class hooks the stylesheet targets", () => {
    cover("rank-ui-mobile");
    const panel = read("ui/platform/LeaderboardPanel.tsx");
    expect(panel).toContain('import "./ranking.css"');
    for (const cls of ["ggd-rank-tabs", "ggd-rank-row", "ggd-rank-pick", "ggd-rank-picker-grid"]) {
      expect(panel).toContain(`className="${cls}"`);
    }
    const lobby = read("ui/platform/LobbyScreen.tsx");
    expect(lobby).toContain('className="ggd-lobby-body"');
    expect(lobby).toContain('className="ggd-lobby-col"');
  });
});
