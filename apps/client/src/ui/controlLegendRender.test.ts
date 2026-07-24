/**
 * The legend, actually RENDERED. `controlLegendModel.test.ts` proves the rows
 * and the rectangle; this proves the view wires them to real pixels — which is
 * where a "correct" legend can still be wrong:
 *
 *   • it paints at the derived offsets, not somewhere else entirely;
 *   • the layer is `pointer-events: none` — a hint box that swallowed a click
 *     mid-fight would be worse than the confusion it exists to remove;
 *   • exactly ONE element opts back in, the ✕, so it stays dismissible;
 *   • the pad view shows pad bindings and no keyboard row leaks into it.
 *
 * `renderToStaticMarkup` in the node env: no DOM, no effects, no browser.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlLegendView } from "./ControlLegend";
import {
  controlLegendRect,
  legendRows,
  type LegendRect,
  type LegendRow,
} from "./controlLegendModel";

const DESKTOP = { width: 1546, height: 900 };
const PHONE = { width: 812, height: 375 };

function rectFor(
  viewport: { width: number; height: number },
  touch: boolean,
  couchPlayers: number,
  rows: readonly LegendRow[],
): LegendRect {
  const rect = controlLegendRect(viewport, { touch, couchPlayers, rows });
  if (!rect) throw new Error("expected a placement for this viewport");
  return rect;
}

function html(rect: LegendRect, mode: "keyboard" | "gamepad" | "touch", label: string): string {
  return renderToStaticMarkup(
    createElement(ControlLegendView, {
      rect,
      rows: legendRows(mode),
      modeLabel: label,
      onDismiss: () => {},
    }),
  );
}

describe("the desktop left-flank column", () => {
  const rows = legendRows("keyboard");
  const rect = rectFor(DESKTOP, false, 1, rows);
  const out = html(rect, "keyboard", "鍵盤 / 滑鼠");

  it("paints at the derived offsets", () => {
    expect(out).toContain('data-control-legend="column"');
    expect(out).toContain(`left:${rect.x}px`);
    expect(out).toContain(`top:${rect.y}px`);
    expect(out).toContain(`width:${rect.w}px`);
    expect(out).toContain(`max-height:${rect.h}px`);
  });

  it("prints every derived row — key cap AND caption", () => {
    for (const row of rows) {
      expect(out, `missing key cap ${row.control}`).toContain(row.control);
      expect(out, `missing caption ${row.label}`).toContain(row.label);
    }
    expect(out).toContain("操作說明");
    expect(out).toContain("鍵盤 / 滑鼠");
  });

  it("says F and D out loud — the two nobody guesses", () => {
    expect(out).toContain("EX 技能");
    expect(out).toContain("天生技");
  });

  it("never eats a click; only the ✕ does", () => {
    expect(out).toContain("pointer-events:none");
    expect(out.match(/pointer-events:auto/g)).toHaveLength(1);
    expect(out).toContain("關閉操作說明");
  });
});

/**
 * CONTRAST, against the worst backdrop the arena can put behind the box.
 *
 * This test exists because the first live playtest caught the legend being
 * literally unreadable: the Skeleton arena's white rock formations sit exactly
 * under the left flank, and at the original 0.44 panel alpha the captions
 * composited to 1.18:1 against them. Every other test passed — the rows were
 * right, the rect was right, the markup was right — and the thing was still
 * useless, because "semi-transparent" had been traded against "readable"
 * without anyone measuring.
 *
 * The backdrop is a live 3D scene, so the only safe assumption is the WORST
 * one: pure white behind the panel. WCAG AA (4.5:1) on that is the bar.
 */
describe("readability over the arena", () => {
  const srgbToLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: number[]): number =>
    0.2126 * srgbToLinear(r!) + 0.7152 * srgbToLinear(g!) + 0.0722 * srgbToLinear(b!);
  const contrast = (a: number[], b: number[]): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  const hex = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgba = (css: string): { rgb: number[]; a: number } => {
    const n = css.match(/[\d.]+/g)!.map(Number);
    return { rgb: n.slice(0, 3), a: n[3] ?? 1 };
  };
  /** the panel's translucent fill composited over an opaque backdrop */
  const over = (fill: { rgb: number[]; a: number }, backdrop: number[]): number[] =>
    fill.rgb.map((c, i) => Math.round(fill.a * c + (1 - fill.a) * backdrop[i]!));

  const rows = legendRows("keyboard");
  const out = html(rectFor(DESKTOP, false, 1, rows), "keyboard", "鍵盤 / 滑鼠");

  /**
   * Pull the declared colours out of the rendered markup, not out of a copy of
   * it. The colour under test is the DIMMEST one the legend paints — picking
   * "the first colour in the markup" would silently measure the bright header
   * and pass while the captions stayed unreadable, which is the exact shape of
   * the bug this test is here to catch.
   */
  const panelFill = rgba(out.match(/background:(rgba\([^)]+\))/)![1]!);
  const textColours = [...out.matchAll(/color:(#[0-9a-f]{6})/gi)].map((m) => hex(m[1]!));
  const dimmestText = textColours.reduce((a, b) => (luminance(a) <= luminance(b) ? a : b));

  const WHITE_ROCK = [235, 235, 235];

  it("the panel is still genuinely see-through", () => {
    // it is a hint, not a panel: it must stay under the real panels' 0.88
    expect(panelFill.a).toBeLessThan(0.8);
    expect(panelFill.a).toBeGreaterThan(0.5);
  });

  it("the dimmest text still clears WCAG AA over the arena's white rock", () => {
    expect(textColours.length).toBeGreaterThan(1); // sanity: we really scraped colours
    const composited = over(panelFill, WHITE_ROCK);
    expect(contrast(dimmestText, composited)).toBeGreaterThanOrEqual(4.5);
  });

  it("every caption carries a shadow, so a VFX flash cannot erase it", () => {
    // one per caption + the header pair + the ✕
    expect(out.match(/text-shadow/g)!.length).toBeGreaterThanOrEqual(rows.length);
  });
});

describe("the touch / couch top-gutter strip", () => {
  it("paints the pad bindings, and only those", () => {
    const rows = legendRows("gamepad");
    const rect = rectFor(DESKTOP, false, 4, rows);
    const out = html(rect, "gamepad", "手把");
    expect(out).toContain('data-control-legend="strip"');
    // minHeight, not height: the wrap is estimated, so real text must be able
    // to push the box taller rather than be clipped by it
    expect(out).toContain(`min-height:${rect.h}px`);
    expect(out).not.toContain("overflow:hidden");
    expect(out).toContain("十字鍵 ↑"); // 天生技 lives on the d-pad
    expect(out).toContain("左類比");
    expect(out).toContain("Start");
    expect(out).not.toContain("滾輪"); // no keyboard/mouse row leaked in
    expect(out).not.toContain("右鍵");
  });

  it("fits a phone and stays inert there too", () => {
    const rows = legendRows("touch");
    const rect = rectFor(PHONE, true, 1, rows);
    const out = html(rect, "touch", "觸控");
    expect(out).toContain('data-control-legend="strip"');
    expect(out).toContain("左側搖桿");
    expect(out).toContain("pointer-events:none");
    expect(out.match(/pointer-events:auto/g)).toHaveLength(1);
    expect(out).not.toContain("Back"); // a touch player is never shown pad faces
    expect(out).not.toContain("十字鍵");
  });
});
