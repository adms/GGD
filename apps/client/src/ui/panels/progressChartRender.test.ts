/**
 * progressChartRender — the chart, ACTUALLY RENDERED.
 *
 * `progressChart.test.ts` proves the numbers. This proves a player can SEE
 * them, which is a different claim and the one this project keeps getting
 * wrong: 「畫在螢幕外／地板下」 and 「可以從渲染樹整個刪掉而測試全綠」 are two of
 * the five standing failure shapes.
 *
 * So every assertion here is about pixels reaching the canvas:
 *   · polylines EXIST and carry real coordinate pairs (not "", not NaN),
 *   · every coordinate lands INSIDE the viewBox, including in the degenerate
 *     cases where a naive scale divides by zero and throws the line to
 *     ±Infinity — off-canvas, invisible, silent,
 *   · the LOCAL player's line is visually distinguishable from the teammates',
 *     because 「自己要能一眼認出來」 is a requirement, not a nicety,
 *   · a BYE round BREAKS the line instead of drawing through it,
 *   · the advice text is really in the markup.
 *
 * `renderToStaticMarkup` in the node env: no DOM, no effects, no browser. It is
 * possible only because ProgressChartPanel takes every input as a prop.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RoundStatDelta, RoundStatsEntry } from "@ggd/shared/protocol/messages";
import { ProgressChartPanel } from "./ProgressChartPanel";
import { buildProgressSeries, type ProgressAdvice, type ProgressSeries } from "./progressChart";
import {
  CHART_BOX,
  plotBottom,
  plotLeft,
  plotRight,
  plotTop,
  plotX,
  plotY,
  polylineSegments,
  valueDomain,
} from "./progressChartGeometry";

// ─────────────────────────────────────────────────────────────── fixtures ──

function d(seatId: number, over: Partial<RoundStatDelta> = {}): RoundStatDelta {
  return {
    seatId,
    hpRatio: 0.5,
    kills: 0,
    deaths: 0,
    assists: 0,
    damageDealt: 500,
    damageTaken: 400,
    damageBlocked: 0,
    healingDone: 0,
    ccAppliedTicks: 0,
    timeAliveTicks: 900,
    revivesPerformed: 0,
    mobKills: 2,
    bye: false,
    ...over,
  };
}

function roundOf(round: number, over: Record<number, Partial<RoundStatDelta>> = {}): RoundStatsEntry {
  return { round, players: Array.from({ length: 12 }, (_, i) => d(i, over[i] ?? {})) };
}

const HISTORY: RoundStatsEntry[] = [
  roundOf(1, { 0: { damageDealt: 1800, mobKills: 0, hpRatio: 1 } }),
  roundOf(2, { 0: { damageDealt: 600, mobKills: 5 } }),
  // round 3: the local player's team drew the BYE
  roundOf(3, { 0: { bye: true }, 1: { bye: true }, 2: { bye: true } }),
  roundOf(4, { 0: { damageDealt: 3200, mobKills: 9, kills: 2, hpRatio: 1 } }),
];

const ADVICE: ProgressAdvice[] = [
  { key: "mob-low", tone: "tip", text: "你在第 1-4 回合只打倒 14 隻殭屍", evidence: "myMobKills=14" },
  { key: "revives", tone: "praise", text: "你救起隊友 2 次", evidence: "revivesPerformed=2" },
];

function html(series: ProgressSeries, advice: readonly ProgressAdvice[] = ADVICE): string {
  return renderToStaticMarkup(
    createElement(ProgressChartPanel, {
      series,
      advice,
      nameForSeat: (s: number) => `座位${s}`,
      onClose: () => {},
    }),
  );
}

/** Every `points="…"` attribute in the markup, as coordinate pairs. */
function polylineCoords(markup: string): { x: number; y: number }[][] {
  return [...markup.matchAll(/points="([^"]+)"/g)].map((m) =>
    (m[1] ?? "")
      .trim()
      .split(/\s+/)
      .map((pair) => {
        const [x, y] = pair.split(",").map(Number);
        return { x: x ?? NaN, y: y ?? NaN };
      }),
  );
}

const SERIES = buildProgressSeries(HISTORY, [0, 1, 2], 0);

// ──────────────────────────────────────────────────────────── the geometry ──

describe("geometry never escapes the viewBox", () => {
  const box = CHART_BOX;

  it("a normal series plots strictly inside the plotting area", () => {
    for (const line of [...SERIES.rank, ...SERIES.damage, ...SERIES.mobKills]) {
      const segs = polylineSegments(line.points, 0, 5000, box);
      for (const s of segs) {
        for (const c of s.coords) {
          expect(Number.isFinite(c.x), `x=${c.x}`).toBe(true);
          expect(Number.isFinite(c.y), `y=${c.y}`).toBe(true);
          expect(c.x).toBeGreaterThanOrEqual(plotLeft(box));
          expect(c.x).toBeLessThanOrEqual(plotRight(box));
          expect(c.y).toBeGreaterThanOrEqual(plotTop(box));
          expect(c.y).toBeLessThanOrEqual(plotBottom(box));
        }
      }
    }
  });

  it("a ONE-ROUND match centres its point instead of producing NaN", () => {
    // i/(n-1) is 0/0 here. NaN in a `points` attribute paints nothing at all.
    const x = plotX(0, 1, box);
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBeGreaterThan(plotLeft(box));
    expect(x).toBeLessThan(plotRight(box));
  });

  it("a FLAT axis (max === min) draws through the middle instead of dividing by zero", () => {
    // Every round scored identically, or an all-zero zombie chart in round 10.
    const y = plotY(7, 7, 7, box);
    expect(Number.isFinite(y)).toBe(true);
    expect(y).toBeGreaterThan(plotTop(box));
    expect(y).toBeLessThan(plotBottom(box));
  });

  it("an all-zero series still gets a usable domain", () => {
    const flat = buildProgressSeries([roundOf(1, { 0: { mobKills: 0 } })], [0], 0);
    const dom = valueDomain(flat.mobKills);
    expect(dom.max).toBeGreaterThan(dom.min);
  });

  it("RANK is inverted: rank 1 paints ABOVE rank 12", () => {
    // The single most invertible assertion in the file, and the one a reversed
    // sign would sail past if it only checked "the value changed".
    const yBest = plotY(1, 1, 12, box, true);
    const yWorst = plotY(12, 1, 12, box, true);
    expect(yBest).toBeLessThan(yWorst); // smaller y === higher on screen
  });

  it("a BYE breaks the polyline into separate segments", () => {
    // Round 3 is a bye for seat 0. Joining round 2 to round 4 would draw a line
    // through a round the player never played — an invented data point.
    const mine = SERIES.damage.find((l) => l.seatId === 0)!;
    const segs = polylineSegments(mine.points, 0, 5000, box);
    expect(segs.length).toBe(2);
    expect(segs[0]!.coords.length).toBe(2); // rounds 1-2
    expect(segs[1]!.coords.length).toBe(1); // round 4 alone
  });
});

// ─────────────────────────────────────────────────────────── the render ──

describe("the panel actually paints", () => {
  const out = html(SERIES);

  it("mounts, and is identifiable in the tree", () => {
    expect(out).toContain('data-testid="progress-chart-panel"');
  });

  it("renders all THREE charts the owner asked for", () => {
    expect(out).toContain("MVP 排名（1 最好）");
    expect(out).toContain("對英雄傷害");
    expect(out).toContain("殭屍擊殺");
  });

  it("emits real polylines with real coordinates — not empty, not NaN", () => {
    const polys = polylineCoords(out);
    expect(polys.length, "no polyline reached the markup at all").toBeGreaterThan(0);
    let drawn = 0;
    for (const coords of polys) {
      for (const c of coords) {
        expect(Number.isNaN(c.x), `NaN x in a rendered polyline`).toBe(false);
        expect(Number.isNaN(c.y), `NaN y in a rendered polyline`).toBe(false);
        drawn++;
      }
    }
    expect(drawn).toBeGreaterThan(6);
  });

  it("every rendered coordinate is inside the viewBox", () => {
    // The 「畫在螢幕外」 guard, stated on the ACTUAL markup rather than on the
    // helper the markup happens to call.
    for (const coords of polylineCoords(out)) {
      for (const c of coords) {
        expect(c.x, `x=${c.x} outside 0..${CHART_BOX.width}`).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThanOrEqual(CHART_BOX.width);
        expect(c.y, `y=${c.y} outside 0..${CHART_BOX.height}`).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThanOrEqual(CHART_BOX.height);
      }
    }
  });

  it("all three team seats are on the chart, and exactly one is flagged local", () => {
    for (const seat of [0, 1, 2]) expect(out).toContain(`data-seat="${seat}"`);
    expect((out.match(/data-local="1"/g) ?? []).length).toBe(3); // one per chart
  });

  it("the local line is visually distinguishable — not just tagged", () => {
    // 「自己要能一眼認出來」. A data attribute is invisible to a player, so the
    // assertion is on the paint: the gold stroke and the thicker width.
    expect(out).toContain("#f2c637"); // GOLD
    expect(out).toContain('stroke-width="2.2"'); // local
    expect(out).toContain('stroke-width="1.2"'); // teammates
    expect(out).toContain("（你）");
  });

  it("names every seat in the legend so the lines can be told apart", () => {
    expect(out).toContain("座位0");
    expect(out).toContain("座位1");
    expect(out).toContain("座位2");
  });

  it("prints the advice text verbatim", () => {
    expect(out).toContain("你在第 1-4 回合只打倒 14 隻殭屍");
    expect(out).toContain("你救起隊友 2 次");
  });

  it("says so plainly when there is no per-round history", () => {
    const empty = html(buildProgressSeries([], [0, 1, 2], 0), []);
    expect(empty).toContain("這場沒有逐回合紀錄");
    // …and does NOT draw an empty pair of axes that reads as a bug
    expect(polylineCoords(empty).length).toBe(0);
  });

  it("falls back to an honest line rather than inventing advice", () => {
    const none = html(SERIES, []);
    expect(none).toContain("這場沒有明顯的短板");
  });

  it("offers a way back — the panel collapses, it does not trap the player", () => {
    expect(out).toContain("收起");
  });

  it("scales to a phone: the svg is width:100% over a viewBox, never fixed pixels", () => {
    // A fixed pixel width is how a chart ends up cropped on a 390 px phone.
    expect(out).toContain(`viewBox="0 0 ${CHART_BOX.width} ${CHART_BOX.height}"`);
    expect(out).toContain('width="100%"');
    expect(out).not.toMatch(/<svg[^>]*width="\d+px"/);
  });
});
