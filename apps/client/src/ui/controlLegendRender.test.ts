/**
 * The legend, actually RENDERED. `controlLegendModel.test.ts` proves the rows
 * and the rectangle; this proves the component wires them to real pixels —
 * which is where a "correct" legend can still be wrong:
 *
 *   • it paints at the derived offsets (not somewhere else entirely);
 *   • the layer is `pointer-events: none` — a hint box that swallowed a click
 *     mid-fight would be worse than the confusion it removes;
 *   • the ✕ opts back in, so it can still be dismissed;
 *   • the gate really hides it outside combat round 1 and after a dismissal.
 *
 * `renderToStaticMarkup` in the node env: no DOM, no effects, no browser. The
 * viewport therefore falls back to the component's own 1280x800 default, which
 * makes the expected geometry deterministic.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hudStore, resetHudStore } from "../net/RoomStore";
import { ControlLegend } from "./ControlLegend";
import {
  controlLegendRect,
  legendRows,
  writeLegendDismissed,
} from "./controlLegendModel";
import { inputModeStore } from "./inputMode";

const VIEWPORT = { width: 1280, height: 800 }; // the component's no-window default

function inCombatRound1(): void {
  hudStore.setState({ connected: true, phase: "combat", round: 1, localPlayers: [] });
}

function render(): string {
  return renderToStaticMarkup(createElement(ControlLegend));
}

beforeEach(() => {
  resetHudStore();
  writeLegendDismissed(false);
  inputModeStore.reset("keyboard");
});

afterEach(() => {
  resetHudStore();
  writeLegendDismissed(false);
});

describe("ControlLegend paints what the model derived", () => {
  it("renders the left flank column at the derived offsets", () => {
    inCombatRound1();
    const html = render();
    const rect = controlLegendRect(VIEWPORT, {
      touch: false,
      couchPlayers: 0,
      rowCount: legendRows("keyboard").length,
    })!;
    expect(html).toContain('data-control-legend="column"');
    expect(html).toContain(`left:${rect.x}px`);
    expect(html).toContain(`top:${rect.y}px`);
    expect(html).toContain(`width:${rect.w}px`);
  });

  it("prints every derived row, key cap and caption", () => {
    inCombatRound1();
    const html = render();
    for (const row of legendRows("keyboard")) {
      expect(html, `missing ${row.control}`).toContain(row.control);
      expect(html, `missing ${row.label}`).toContain(row.label);
    }
    expect(html).toContain("操作說明");
    expect(html).toContain("鍵盤 / 滑鼠");
  });

  it("shows the PAD bindings, and only those, once a pad is in play", () => {
    inCombatRound1();
    inputModeStore.reset("gamepad");
    const html = render();
    expect(html).toContain("手把");
    expect(html).toContain("十字鍵 ↑"); // 天生技 on the d-pad
    expect(html).toContain("左類比");
    expect(html).not.toContain("滾輪"); // no keyboard/mouse rows leaked in
  });

  it("never eats a click: the layer is inert, the ✕ is not", () => {
    inCombatRound1();
    const html = render();
    expect(html).toContain("pointer-events:none");
    // exactly one element opts back in — the dismiss control
    expect(html.match(/pointer-events:auto/g)).toHaveLength(1);
    expect(html).toContain("關閉操作說明");
  });
});

describe("ControlLegend gating, end to end", () => {
  it("is absent before combat and after round 1", () => {
    resetHudStore();
    hudStore.setState({ connected: true, phase: "intermission", round: 1 });
    expect(render()).toBe("");
    hudStore.setState({ phase: "combat", round: 2 });
    expect(render()).toBe("");
  });

  it("stays gone once dismissed", () => {
    inCombatRound1();
    expect(render()).not.toBe("");
    writeLegendDismissed(true);
    expect(render()).toBe("");
  });
});
