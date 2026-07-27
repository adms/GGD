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
import {
  buildProgressSeries,
  type ProgressAdvice,
  type ProgressSeries,
  type SeriesLine,
} from "./progressChart";
import {
  AXIS_LABEL_SIZE,
  CHART_BOX,
  MIN_CHART_COL_PX,
  MIN_READABLE_LABEL_PX,
  labelPxAt,
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

// ── reading the CHART, not the helpers it happens to call ───────────────────
//
// Everything below slices the rendered markup. That distinction is the whole
// point: `plotY(v, min, max, box, true)` proves the HELPER can invert, which
// says nothing about whether the rank <LineChart> ever passes `invert`. These
// readers only ever see what a browser would paint.

/** The one `<svg>…</svg>` whose `aria-label` is `title`. */
function chartOf(markup: string, title: string): string {
  const at = markup.indexOf(`aria-label="${title}"`);
  expect(at, `no chart labelled 「${title}」 in the markup`).toBeGreaterThan(-1);
  const start = markup.lastIndexOf("<svg", at);
  const end = markup.indexOf("</svg>", at);
  expect(start, `chart 「${title}」 has no <svg>`).toBeGreaterThan(-1);
  expect(end, `chart 「${title}」 is unterminated`).toBeGreaterThan(start);
  return markup.slice(start, end + "</svg>".length);
}

/** Everything one seat's `<g>` actually paints inside `chart`. */
function seatGroup(chart: string, seatId: number): string {
  const at = chart.indexOf(`<g data-seat="${seatId}"`);
  expect(at, `seat ${seatId} never reached this chart`).toBeGreaterThan(-1);
  const end = chart.indexOf("</g>", at);
  expect(end, `seat ${seatId}'s group is unterminated`).toBeGreaterThan(at);
  return chart.slice(at, end);
}

/** Every y-coordinate one seat's line PAINTS: polyline vertices and markers. */
function seatYs(chart: string, seatId: number): number[] {
  const g = seatGroup(chart, seatId);
  const ys = [
    ...polylineCoords(g)
      .flat()
      .map((c) => c.y),
    ...[...g.matchAll(/cy="([-\d.]+)"/g)].map((m) => Number(m[1])),
  ];
  expect(ys.length, `seat ${seatId} emitted a group but painted no geometry`).toBeGreaterThan(0);
  for (const y of ys) expect(Number.isFinite(y), `seat ${seatId} painted y=${y}`).toBe(true);
  return ys;
}

/**
 * Seat groups in the order the markup emits them — which IS the SVG paint
 * order. SVG has no z-index: the LAST sibling is the one drawn on top.
 */
function paintOrder(chart: string): { seatId: number; local: boolean }[] {
  return [...chart.matchAll(/<g data-seat="(\d+)" data-local="([01])"/g)].map((m) => ({
    seatId: Number(m[1]),
    local: m[2] === "1",
  }));
}

const RANK_TITLE = "MVP 排名（1 最好）";
const DAMAGE_TITLE = "對英雄傷害";
const MOB_TITLE = "殭屍擊殺";

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

  it("plotY CAN invert when asked — the helper's own contract, nothing more", () => {
    // NAMED CAREFULLY. This test passes `invert` in ITSELF, so all it can prove
    // is that the helper honours the flag. It says NOTHING about whether the
    // rank <LineChart> ever sets it — deleting the word `invert` from the panel
    // leaves this green. The guard that actually covers the chart is
    // 「the RANK chart really is drawn upside-down」 below, stated on the markup.
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

  it("a SPECTATOR gets its own explanation, not three empty pairs of axes", () => {
    // Rounds exist but no seat belongs to the viewer (spectator, or #130's
    // never-locked player). Falling through to the charts paints empty axes,
    // which reads as a rendering bug; and printing 「這場沒有逐回合紀錄」 would
    // send them looking for a server problem that is not there.
    const spectator = html(buildProgressSeries(HISTORY, [], null), []);
    expect(spectator).toContain("你這場沒有上場的隊伍");
    expect(spectator).not.toContain("這場沒有逐回合紀錄");
    expect(polylineCoords(spectator).length).toBe(0);
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

// ───────────────────────────────────── the y-axis really points the right way ──

describe("the RANK chart is drawn upside-down, and only the RANK chart", () => {
  // THE DEFECT THIS EXISTS FOR: delete the word `invert` from the rank
  // <LineChart> and the chart still renders — three tidy lines, correct
  // spacing, no NaN, everything inside the viewBox — but rank 1 lands at the
  // BOTTOM and a worse-placed teammate is painted ABOVE the player, under a
  // heading that says 「1 最好」. A chart that is confidently upside-down is
  // worse than a missing one, because the player believes it.
  //
  // The series is hand-built rather than run through buildProgressSeries so
  // the probe is about the AXIS and nothing else: two seats, one placed 1st and
  // one placed 12th, one round. The MVP arithmetic that would normally produce
  // those placements is progressChart.test.ts's job.
  const line = (seatId: number, isLocal: boolean, value: number): SeriesLine => ({
    seatId,
    isLocal,
    points: [{ round: 1, value }],
  });
  const PROBE: ProgressSeries = {
    rounds: [1],
    // rank 1 (best) for the local seat, rank 12 (worst) for the mate
    rank: [line(0, true, 1), line(1, false, 12)],
    // …and on the value axes the local seat is the BIG number, the mate small
    damage: [line(0, true, 4000), line(1, false, 100)],
    mobKills: [line(0, true, 30), line(1, false, 1)],
    maxRank: 12,
  };
  const probe = html(PROBE, []);
  const top = plotTop(CHART_BOX);
  const bottom = plotBottom(CHART_BOX);

  it("rank 1 paints ABOVE rank 12 in the emitted markup", () => {
    const chart = chartOf(probe, RANK_TITLE);
    const best = Math.max(...seatYs(chart, 0)); // rank 1
    const worst = Math.min(...seatYs(chart, 1)); // rank 12
    expect(
      best,
      `rank 1 painted at y=${best}, rank 12 at y=${worst} — the chart is upside-down ` +
        `while its title says 「${RANK_TITLE}」`,
    ).toBeLessThan(worst);
  });

  it("…and it is pinned to the ends of the axis, not merely ordered", () => {
    // Ordering alone would still pass if the whole line collapsed into a sliver
    // somewhere. rank 1 belongs ON the top gridline, rank 12 ON the bottom one.
    const chart = chartOf(probe, RANK_TITLE);
    for (const y of seatYs(chart, 0)) expect(y).toBeCloseTo(top, 5);
    for (const y of seatYs(chart, 1)) expect(y).toBeCloseTo(bottom, 5);
  });

  it("the axis labels agree with the paint: 「1」 sits at the top gridline", () => {
    // The tick labels are drawn by the same `invert`. If the paint flipped but
    // the labels did not (or vice-versa) the chart would contradict itself.
    const chart = chartOf(probe, RANK_TITLE);
    const ticks = [
      ...chart.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*text-anchor="end">(\d+)<\/text>/g),
    ].map((m) => ({ y: Number(m[1]), label: Number(m[2]) }));
    expect(ticks.length, "the rank chart printed no value labels").toBeGreaterThanOrEqual(2);
    const one = ticks.find((t) => t.label === 1);
    const twelve = ticks.find((t) => t.label === 12);
    expect(one, "no 「1」 label on the rank axis").toBeDefined();
    expect(twelve, "no 「12」 label on the rank axis").toBeDefined();
    expect(one!.y, "the rank axis prints 1 below 12").toBeLessThan(twelve!.y);
  });

  it("the VALUE charts are NOT inverted — more damage paints HIGHER", () => {
    // The other direction of the same defect: "fixing" the rank axis by
    // inverting every chart would make 4000 damage read as a collapse.
    for (const title of [DAMAGE_TITLE, MOB_TITLE]) {
      const chart = chartOf(probe, title);
      const big = Math.max(...seatYs(chart, 0));
      const small = Math.min(...seatYs(chart, 1));
      expect(big, `${title}: the bigger number painted BELOW the smaller one`).toBeLessThan(small);
      expect(big).toBeCloseTo(top, 5); // the max sits on the top gridline
    }
  });
});

// ────────────────────────────────────────── the local line paints on top ──

describe("the local player's line is painted LAST, so nothing covers it", () => {
  // 「自己要能一眼認出來」. SVG has no z-index: paint order IS sibling order, so
  // the gold line is only on top if its <g> is emitted last. Delete the sort in
  // LineChart and the markup still contains every line, every colour and every
  // stroke width — the player's own line just disappears under a teammate's
  // wherever the two cross. Nothing about "the tag is present" can see that.
  const out = html(SERIES);

  it("the fixture feeds local FIRST — otherwise this whole describe is vacuous", () => {
    // buildProgressSeries preserves the seatIds order it was given, and the
    // local seat is 0. If that ever changes, the sort is no longer being
    // exercised and these tests must be re-aimed rather than trusted.
    expect(SERIES.rank[0]!.isLocal, "local is already last in the input; the sort is untested").toBe(
      true,
    );
  });

  for (const title of [RANK_TITLE, DAMAGE_TITLE, MOB_TITLE]) {
    it(`${title}: the gold group is the last sibling`, () => {
      const order = paintOrder(chartOf(out, title));
      expect(order.length, `${title} drew ${order.length} seats, expected 3`).toBe(3);
      expect(
        order[order.length - 1]!.local,
        `${title} paint order = ${order.map((o) => `${o.seatId}${o.local ? "(me)" : ""}`).join(" → ")} ` +
          `— my line is painted under a teammate's`,
      ).toBe(true);
      expect(order.slice(0, -1).some((o) => o.local), `${title}: two seats claim to be local`).toBe(
        false,
      );
    });
  }

  it("and the group that paints last is the one carrying the gold stroke", () => {
    // Ties the ordering back to the pixels: 'last' only matters if 'last' is
    // the line the player is looking for.
    const chart = chartOf(out, RANK_TITLE);
    const order = paintOrder(chart);
    const last = seatGroup(chart, order[order.length - 1]!.seatId);
    expect(last, "the top-most line is not the gold one").toContain("#f2c637");
    expect(last).toContain('stroke-width="2.2"');
  });
});

describe("the axis labels are actually READABLE at every real viewport", () => {
  // A viewBox scales TEXT along with geometry, so `fontSize={9}` is not 9 px on
  // screen — it is 9 × columnWidth / viewBoxWidth. This was a REAL defect found
  // by computing it rather than by looking: at a 200 px grid minimum, THREE
  // charts fitted across the 760 px settlement card and the labels rendered at
  // 6.0 CSS px. And the worst case was the DESKTOP, not the phone — a 390 px
  // phone gets one wide column and was never in trouble. "It fits on mobile"
  // would have passed the whole time.
  //
  // The viewports are the ones the task names, minus the card's own chrome
  // (card padding 20 + panel padding 12, both sides).
  const CARD_CHROME = 2 * (20 + 12);
  const GAP = 10;

  /** Columns `repeat(auto-fit, minmax(MIN,1fr))` yields inside `inner` px. */
  function columns(inner: number): number {
    return Math.max(1, Math.floor((inner + GAP) / (MIN_CHART_COL_PX + GAP)));
  }
  function columnPx(inner: number): number {
    const n = columns(inner);
    return (inner - (n - 1) * GAP) / n;
  }

  const VIEWPORTS: { name: string; cardPx: number }[] = [
    // the settlement card is width: min(760px, 96vw)
    { name: "phone 390×844", cardPx: Math.min(760, 390 * 0.96) },
    { name: "handheld landscape 780×360", cardPx: Math.min(760, 780 * 0.96) },
    { name: "desktop", cardPx: 760 },
  ];

  for (const v of VIEWPORTS) {
    it(`${v.name}: labels render at ≥ ${MIN_READABLE_LABEL_PX} CSS px`, () => {
      const inner = v.cardPx - CARD_CHROME;
      const px = labelPxAt(columnPx(inner));
      expect(
        px,
        `${v.name}: ${columns(inner)} column(s) of ${columnPx(inner).toFixed(0)}px → ` +
          `axis labels at ${px.toFixed(1)} CSS px. Raise MIN_CHART_COL_PX or ` +
          `AXIS_LABEL_SIZE, or narrow CHART_BOX.width.`,
      ).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_PX);
    });
  }

  it("the round labels do not collide, even on a full 10-round match", () => {
    // 10 rounds is the longest a match can run (#215's round-10 clean final is
    // the last). Two-digit labels at AXIS_LABEL_SIZE must fit the x-spacing.
    const spacing = plotX(1, 10) - plotX(0, 10);
    const widest = 2 * AXIS_LABEL_SIZE * 0.6; // 2 digits, generous advance width
    expect(
      spacing,
      `10 rounds spaced ${spacing.toFixed(1)} apart cannot hold a ${widest.toFixed(1)}-wide label`,
    ).toBeGreaterThan(widest);
  });

  it("the value labels fit their gutter instead of spilling off the left edge", () => {
    // The widest label the damage axis can print is "12.3k" (5 chars), right-
    // anchored 4 units left of the axis. Spilling past x=0 clips it.
    const widest = 5 * AXIS_LABEL_SIZE * 0.6;
    const leftEdge = CHART_BOX.padLeft - 4 - widest;
    expect(leftEdge, `value labels start at x=${leftEdge.toFixed(1)} — off-canvas`).toBeGreaterThan(0);
  });
});
