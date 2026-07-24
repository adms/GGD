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
import { controlLegendRect, legendRows, type LegendRect } from "./controlLegendModel";

const DESKTOP = { width: 1546, height: 900 };
const PHONE = { width: 812, height: 375 };

function rectFor(
  viewport: { width: number; height: number },
  touch: boolean,
  couchPlayers: number,
  rowCount: number,
): LegendRect {
  const rect = controlLegendRect(viewport, { touch, couchPlayers, rowCount });
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
  const rect = rectFor(DESKTOP, false, 1, rows.length);
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

describe("the touch / couch top-gutter strip", () => {
  it("paints the pad bindings, and only those", () => {
    const rows = legendRows("gamepad");
    const rect = rectFor(DESKTOP, false, 4, rows.length);
    const out = html(rect, "gamepad", "手把");
    expect(out).toContain('data-control-legend="strip"');
    expect(out).toContain(`height:${rect.h}px`);
    expect(out).toContain("十字鍵 ↑"); // 天生技 lives on the d-pad
    expect(out).toContain("左類比");
    expect(out).toContain("Start");
    expect(out).not.toContain("滾輪"); // no keyboard/mouse row leaked in
    expect(out).not.toContain("右鍵");
  });

  it("fits a phone and stays inert there too", () => {
    const rows = legendRows("touch");
    const rect = rectFor(PHONE, true, 1, rows.length);
    const out = html(rect, "touch", "觸控");
    expect(out).toContain('data-control-legend="strip"');
    expect(out).toContain("左側搖桿");
    expect(out).toContain("pointer-events:none");
    expect(out.match(/pointer-events:auto/g)).toHaveLength(1);
    expect(out).not.toContain("Back"); // a touch player is never shown pad faces
    expect(out).not.toContain("十字鍵");
  });
});
