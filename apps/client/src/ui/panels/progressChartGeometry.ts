/**
 * progressChartGeometry — the SVG MATH behind the 每回合戰績 line charts.
 *
 * Split out of progressChart.ts (which owns SCORING) and out of the component
 * (which owns JSX) for one reason: this project's most expensive recurring
 * defect is 「畫在螢幕外／地板下」 — a thing that is computed correctly and then
 * drawn where nobody can see it. Geometry that lives in a .tsx file can only be
 * checked by eyeballing a screenshot. Geometry in a pure module can be asserted:
 * `progressChartGeometry.test.ts` proves every plotted point lands INSIDE the
 * viewBox for degenerate inputs too (one round, all-equal values, a flat zero
 * series), which is exactly where a naive scale divides by zero and throws the
 * line to ±Infinity — off-canvas, invisible, and silent.
 *
 * The charts are hand-rolled SVG on purpose (no chart library): the artifact
 * ships self-contained, and three small line charts do not justify a dependency.
 */
import type { ChartPoint } from "./progressChart";

/**
 * The SVG user-space box every chart is drawn in. Rendered with
 * `width: 100%` + `viewBox`, so these are RELATIVE units, not pixels — the
 * chart scales to whatever column the responsive grid gives it, down to a
 * 390 px phone and a 780×360 landscape handheld.
 *
 * The paddings are the axis gutters: `left` holds the value labels, `bottom`
 * holds the round numbers. Nothing may be drawn into them.
 */
export interface ChartBox {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

export const CHART_BOX: ChartBox = {
  width: 300,
  height: 150,
  padLeft: 30,
  padRight: 10,
  padTop: 12,
  padBottom: 20,
};

/** Left edge of the plotting area. */
export function plotLeft(box: ChartBox): number {
  return box.padLeft;
}
/** Right edge of the plotting area. */
export function plotRight(box: ChartBox): number {
  return box.width - box.padRight;
}
/** Top edge of the plotting area. */
export function plotTop(box: ChartBox): number {
  return box.padTop;
}
/** Bottom edge of the plotting area. */
export function plotBottom(box: ChartBox): number {
  return box.height - box.padBottom;
}

/**
 * X for the i-th of `count` rounds, spread evenly across the plotting area.
 *
 * `count <= 1` CENTRES the single point rather than dividing by zero. A
 * one-round match is a real thing (a match decided in round 1), and `i/(n-1)`
 * is NaN there — which paints nothing at all.
 */
export function plotX(i: number, count: number, box: ChartBox = CHART_BOX): number {
  const l = plotLeft(box);
  const r = plotRight(box);
  if (count <= 1) return (l + r) / 2;
  return l + ((r - l) * i) / (count - 1);
}

/**
 * Y for `value` on a [min,max] axis. `invert` puts the MINIMUM at the TOP —
 * which is what the RANK chart needs, because rank 1 is the best result and
 * must read as the highest line on the chart.
 *
 * A degenerate domain (max === min: every round scored the same, or a series
 * that is flat zero) collapses to the MIDDLE of the plotting area instead of
 * dividing by zero. A flat line through the centre is a true picture of "this
 * never changed"; NaN is an invisible one.
 */
export function plotY(
  value: number,
  min: number,
  max: number,
  box: ChartBox = CHART_BOX,
  invert = false,
): number {
  const t = plotTop(box);
  const b = plotBottom(box);
  if (!(max > min)) return (t + b) / 2;
  const clamped = value < min ? min : value > max ? max : value;
  const frac = (clamped - min) / (max - min);
  return invert ? t + (b - t) * frac : b - (b - t) * frac;
}

/**
 * Split a series into CONTIGUOUS polyline segments, breaking at every null.
 *
 * A null is a round the player was not in (a BYE). Joining across it would draw
 * a straight line from round 7 to round 9 through a round-8 the player never
 * played — inventing a data point. Breaking the line says 「這裡沒有資料」,
 * which is the truth.
 *
 * Returns `points` strings ready for `<polyline points=…>`. A lone surviving
 * point becomes a one-element segment; the caller draws those as dots (a
 * one-point polyline renders nothing on its own).
 */
export function polylineSegments(
  points: readonly ChartPoint[],
  min: number,
  max: number,
  box: ChartBox = CHART_BOX,
  invert = false,
): { points: string; coords: { x: number; y: number }[] }[] {
  const out: { points: string; coords: { x: number; y: number }[] }[] = [];
  let run: { x: number; y: number }[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    out.push({
      points: run.map((c) => `${round2(c.x)},${round2(c.y)}`).join(" "),
      coords: run,
    });
    run = [];
  };
  points.forEach((p, i) => {
    if (p.value === null) {
      flush();
      return;
    }
    run.push({ x: plotX(i, points.length, box), y: plotY(p.value, min, max, box, invert) });
  });
  flush();
  return out;
}

/** 2-decimal rounding so the emitted SVG is compact and byte-stable. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The [min,max] domain for a value axis (damage / mob kills). Always anchored at
 * 0 — a damage chart whose baseline floats makes a 900-vs-1000 difference look
 * like a collapse. `+1` on an all-zero series so the axis is not degenerate.
 */
export function valueDomain(lines: readonly { points: readonly ChartPoint[] }[]): {
  min: number;
  max: number;
} {
  let max = 0;
  for (const l of lines) {
    for (const p of l.points) if (p.value !== null && p.value > max) max = p.value;
  }
  return { min: 0, max: max > 0 ? max : 1 };
}

/** Evenly spaced tick VALUES for an axis, inclusive of both ends. */
export function axisTicks(min: number, max: number, count = 3): number[] {
  if (count < 2 || !(max > min)) return [min];
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}
