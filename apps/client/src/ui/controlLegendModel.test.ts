/**
 * The control legend's whole reason to exist is that it must not be able to
 * LIE. These tests are the enforcement:
 *
 *   1. DERIVATION — every pad row really comes out of `mapGamepadFrame`, and
 *      every ability key really comes out of `SLOT_BY_CODE`. Move a binding and
 *      the legend moves with it, in the same commit.
 *   2. TWO-WAY SOURCE SCAN — the handful of bindings that are not exported
 *      tables (the order keys in InputCapture's switch, the mouse listeners,
 *      the touch JSX) are declared WITH a source token. Every declared token
 *      must exist in the file that owns it, AND every `case "Key…"` in that
 *      switch must be claimed by a legend row. Add a keyboard binding without
 *      a legend row and this file goes red.
 *   3. THE #107 CONTRACT — the legend cannot declare a hudLayout slot (it wants
 *      a flank, not a corner, and the registry is out of scope), so instead its
 *      rect is proven against EVERY slot's reserved rect on every guard
 *      viewport, for both pointer types.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BTN } from "../input/GamepadInput";
import { SLOT_BY_CODE } from "../input/InputCapture";
import {
  HUD_SLOTS,
  hudRectsOverlap,
  hudSlotRect,
  type HudSlotId,
  type HudViewport,
} from "./hud/hudLayout";
import {
  ABILITY_CLUSTER_H,
  ABILITY_CLUSTER_W,
  controlLegendRect,
  controlLegendVisible,
  gamepadLegend,
  keyboardLegend,
  keyCodeFace,
  KEYBOARD_ORDER_BINDINGS,
  LEGEND_COLUMN_W,
  legendActionLabel,
  legendRows,
  legendPillWidth,
  legendStripHeight,
  legendStripLines,
  type LegendRow,
  MOUSE_BINDINGS,
  padFace,
  probeGamepadButton,
  probeGamepadSticks,
  TOP_CENTRE_BAND_END,
  touchLegend,
  TOUCH_BINDINGS,
} from "./controlLegendModel";

const SRC = join(__dirname, "..");

/** strip comments so prose ABOUT a binding can never satisfy a scan */
function readSrc(rel: string): string {
  return readFileSync(join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const INPUT_CAPTURE = readSrc("input/InputCapture.ts");
const TOUCH_CONTROLS = readSrc("ui/TouchControls.tsx");

describe("legend rows are DERIVED from the pad mapping", () => {
  it("probes the real mapGamepadFrame, not a copy of its table", () => {
    // A is Q by SLOT_BY_BUTTON; the probe must find that by running the map.
    expect(probeGamepadButton(BTN.A)).toEqual({ kind: "cast", slot: "Q" });
    expect(probeGamepadButton(BTN.BACK)).toEqual({ kind: "cast", slot: "EX" });
    expect(probeGamepadButton(BTN.DPAD_UP)).toEqual({ kind: "cast", slot: "PASSIVE" });
    expect(probeGamepadButton(BTN.RB)).toEqual({ kind: "order", order: "stop" });
    expect(probeGamepadButton(BTN.LB)).toEqual({ kind: "command", command: "recall" });
    expect(probeGamepadButton(BTN.START)).toEqual({ kind: "command", command: "ready" });
  });

  it("finds NO bound button outside the BTN table (an unlisted binding fails)", () => {
    const declared = new Set<number>(Object.values(BTN));
    const stray: number[] = [];
    for (let i = 0; i < 24; i++) {
      if (!declared.has(i) && probeGamepadButton(i)) stray.push(i);
    }
    expect(stray).toEqual([]);
  });

  it("gives every bound pad button a printed face and a caption", () => {
    const rows = gamepadLegend();
    for (const [name, index] of Object.entries(BTN)) {
      if (!probeGamepadButton(index)) continue;
      const row = rows.find((r) => r.id === `btn-${name}`);
      expect(row, `pad button ${name} has no legend row`).toBeDefined();
      expect(row!.control).toBe(padFace(name));
      expect(row!.label.length).toBeGreaterThan(0);
    }
  });

  it("names both sticks off the mapping, and says release does not stop", () => {
    expect(probeGamepadSticks()).toEqual({ move: true, aim: true });
    const rows = gamepadLegend();
    expect(rows[0]?.id).toBe("stick-left");
    expect(rows[0]?.label).toContain("放開");
    expect(rows[1]?.id).toBe("stick-right");
  });

  it("covers the whole hero — six castable slots reachable on a pad", () => {
    const slots = gamepadLegend()
      .map((r) => r.label)
      .join(" ");
    for (const s of ["技能 Q", "技能 W", "技能 E", "技能 R", "EX 技能", "天生技"]) {
      expect(slots).toContain(s);
    }
  });

  it("refuses to caption an action nobody has named", () => {
    // a slot that does not exist -> loud, not a blank row
    expect(() => legendActionLabel({ kind: "cast", slot: "Z" as never })).toThrow();
    expect(() => padFace("GUIDE")).toThrow();
  });
});

describe("legend rows are DERIVED from the keyboard map", () => {
  it("takes every ability key straight out of SLOT_BY_CODE", () => {
    const rows = keyboardLegend();
    for (const code of Object.keys(SLOT_BY_CODE)) {
      const row = rows.find((r) => r.id === `key-${code}`);
      expect(row, `${code} has no legend row`).toBeDefined();
      expect(row!.control).toBe(keyCodeFace(code));
    }
    // F = EX and D = 天生技, the two the family will not guess
    expect(rows.find((r) => r.id === "key-KeyF")?.label).toBe("EX 技能");
    expect(rows.find((r) => r.id === "key-KeyD")?.label).toContain("天生");
  });

  it("prints KeyQ as Q and leaves Space/arrows alone", () => {
    expect(keyCodeFace("KeyQ")).toBe("Q");
    expect(keyCodeFace("Space")).toBe("Space");
  });
});

describe("source scan: the legend and InputCapture cannot drift (two-way)", () => {
  it("every declared keyboard/mouse binding exists in InputCapture", () => {
    const missing = [...KEYBOARD_ORDER_BINDINGS, ...MOUSE_BINDINGS]
      .filter((b) => !INPUT_CAPTURE.includes(b.source))
      .map((b) => `${b.id} (${b.source})`);
    expect(missing).toEqual([]);
  });

  it("every key InputCapture's switch handles is claimed by the legend", () => {
    const handled = [...INPUT_CAPTURE.matchAll(/case\s+"(Key[A-Z]|Space)"/g)].map((m) => m[1]!);
    expect(handled.length).toBeGreaterThan(3); // the scan really found the switch
    const claimed = new Set<string>([
      ...Object.keys(SLOT_BY_CODE),
      ...KEYBOARD_ORDER_BINDINGS.map((b) => b.id),
    ]);
    expect(handled.filter((code) => !claimed.has(code))).toEqual([]);
  });

  it("every pan key InputCapture reads is claimed too", () => {
    const pan = [...INPUT_CAPTURE.matchAll(/code\s*===\s*"(Arrow[A-Za-z]+)"/g)].map((m) => m[1]!);
    expect(pan.length).toBe(4);
    expect(KEYBOARD_ORDER_BINDINGS.some((b) => b.id === "Arrows")).toBe(true);
  });

  it("every declared touch control exists in TouchControls", () => {
    const missing = TOUCH_BINDINGS.filter((b) => !TOUCH_CONTROLS.includes(b.source)).map((b) => b.id);
    expect(missing).toEqual([]);
    expect(touchLegend()).toHaveLength(TOUCH_BINDINGS.length);
  });

  it("the two UNSLOTTED clusters still sit where the geometry assumes", () => {
    // Neither can be a corner slot (both are horizontally centred), so the
    // numbers the legend reserves for them are pinned to the real offsets.
    expect(readSrc("ui/components/PhaseTimer.tsx")).toContain("top: 10");
    expect(readSrc("ui/HudRoot.tsx")).toContain("top: 64"); // SpectatorHint
    expect(TOP_CENTRE_BAND_END).toBeGreaterThan(64 + 26);

    expect(readSrc("ui/components/AbilityBar.tsx")).toContain("bottom: 14");
    const bars = readSrc("ui/components/ResourceBars.tsx");
    expect(bars).toContain("bottom: 128");
    expect(bars).toContain("width: 260");
    expect(ABILITY_CLUSTER_H).toBeGreaterThan(128 + 46);
    // six 52px tiles + five 6px gaps, with headroom for the rank-up controls
    expect(ABILITY_CLUSTER_W).toBeGreaterThan(6 * 52 + 5 * 6);
  });
});

/* ── #107: the legend never covers HUD chrome ─────────────────────────────── */

const VIEWPORTS: readonly HudViewport[] = [
  { width: 1546, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 640 },
  { width: 812, height: 375 },
  { width: 667, height: 375 },
  { width: 375, height: 667 },
];

const PC = (touch: boolean, couchPlayers: number, rows: readonly LegendRow[]) => ({
  touch,
  couchPlayers,
  rows,
});

/**
 * The REAL binding sets, not synthetic row counts. The strip wraps, so its
 * height depends on how wide each caption actually is — sweeping over a count
 * is what let the 812x375 keyboard strip ship six lines of content in a box
 * sized for three.
 */
const MODES = ["keyboard", "gamepad", "touch"] as const;

describe("control legend placement obeys the safe-area contract (#107)", () => {
  for (const vp of VIEWPORTS) {
    for (const touch of [false, true]) {
      for (const couchPlayers of [1, 2, 4]) {
        for (const mode of MODES) {
        const rows = legendRows(mode);
        it(`clears every HUD slot @ ${vp.width}x${vp.height} touch=${touch} players=${couchPlayers} mode=${mode}`, () => {
          const rect = controlLegendRect(vp, { touch, couchPlayers, rows });
          if (!rect) return; // "no room" is a legal, safe answer
          const hits: string[] = [];
          for (const slot of HUD_SLOTS) {
            const r = hudSlotRect(slot.id as HudSlotId, vp, touch);
            if (hudRectsOverlap({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }, r)) {
              hits.push(slot.id);
            }
          }
          // the expanded perf overlay is a settings-gated dev tool that hudLayout
          // itself marks `transient` — everything else must be untouched.
          expect(hits.filter((id) => id !== "perf-panel")).toEqual([]);
          // …and the two centred clusters the corner registry cannot express
          const box = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
          expect(
            hudRectsOverlap(box, {
              x: (vp.width - ABILITY_CLUSTER_W) / 2,
              y: vp.height - ABILITY_CLUSTER_H,
              w: ABILITY_CLUSTER_W,
              h: ABILITY_CLUSTER_H,
            }),
            "covers the ability bar / resource bars / cast notice",
          ).toBe(false);
          expect(rect.y, "covers the phase timer or the spectator hint").toBeGreaterThanOrEqual(
            TOP_CENTRE_BAND_END,
          );
          expect(rect.x).toBeGreaterThanOrEqual(0);
          expect(rect.y).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.w).toBeLessThanOrEqual(vp.width);
          expect(rect.y + rect.h).toBeLessThanOrEqual(vp.height);
        });
        }
      }
    }
  }

  it("uses the left flank on a classic desktop viewport", () => {
    const rect = controlLegendRect({ width: 1546, height: 900 }, PC(false, 1, legendRows("keyboard")));
    expect(rect?.shape).toBe("column");
    expect(rect?.w).toBe(LEGEND_COLUMN_W);
    // below the top-left stack (☰ / 隊伍 / 復活 / 敵隊), not beside the ability bar
    expect(rect!.y).toBeGreaterThan(300);
  });

  it("switches to the top-gutter strip on touch and in couch play", () => {
    expect(controlLegendRect({ width: 812, height: 375 }, PC(true, 1, legendRows("touch")))?.shape).toBe("strip");
    expect(controlLegendRect({ width: 1546, height: 900 }, PC(false, 2, legendRows("gamepad")))?.shape).toBe("strip");
  });

  it("clears the top cells' mini-HUDs in a 2x2 couch, or shows nothing", () => {
    // a short TV/window has no room above the split; the honest answer is null
    expect(controlLegendRect({ width: 1280, height: 320 }, PC(false, 4, legendRows("gamepad")))).toBeNull();
    const ok = controlLegendRect({ width: 1280, height: 900 }, PC(false, 4, legendRows("gamepad")));
    expect(ok).not.toBeNull();
    expect(ok!.y + ok!.h).toBeLessThan(900 / 2 - 78);
  });

  it("shows nothing rather than overlapping on a portrait phone", () => {
    expect(controlLegendRect({ width: 375, height: 667 }, PC(true, 1, legendRows("touch")))).toBeNull();
  });
});

describe("the round-1 gate", () => {
  const base = { phase: "combat", round: 1, dismissed: false, panelCovering: false };

  it("shows in the first combat round only", () => {
    expect(controlLegendVisible(base)).toBe(true);
    expect(controlLegendVisible({ ...base, round: 0 })).toBe(true); // not stamped yet
    expect(controlLegendVisible({ ...base, round: 2 })).toBe(false);
  });

  it("stays out of every other phase", () => {
    for (const phase of ["champSelect", "intermission", "resolution", "matchEnd", "connecting"]) {
      expect(controlLegendVisible({ ...base, phase })).toBe(false);
    }
  });

  it("yields to a dismissal and to any corner-covering panel", () => {
    expect(controlLegendVisible({ ...base, dismissed: true })).toBe(false);
    expect(controlLegendVisible({ ...base, panelCovering: true })).toBe(false);
  });
});

describe("legendRows picks the binding set for the mode in play", () => {
  it("never shows a pad player keyboard keys, or vice versa", () => {
    const kb = legendRows("keyboard").map((r) => r.control);
    const pad = legendRows("gamepad").map((r) => r.control);
    expect(kb).toContain("Q");
    expect(kb.some((c) => c === "Back" || c === "十字鍵 ↑")).toBe(false);
    expect(pad).toContain("Back");
    expect(pad).toContain("十字鍵 ↑");
    expect(pad.some((c) => c === "Q" || c === "滾輪")).toBe(false);
    expect(legendRows("touch").map((r) => r.control)).toContain("左側搖桿");
  });

  it("every row has a control and a caption", () => {
    for (const mode of ["keyboard", "gamepad", "touch"] as const) {
      const rows = legendRows(mode);
      expect(rows.length).toBeGreaterThan(3);
      for (const r of rows) {
        expect(r.control.length).toBeGreaterThan(0);
        expect(r.label.length).toBeGreaterThan(0);
      }
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
  });
});

/**
 * THE STRIP MUST NOT CLIP. Found live, at 812x375: the strip's height was two
 * constants keyed on the row count (58 / 84), but the strip WRAPS, so its
 * height is a function of the width it wrapped into — which a row count cannot
 * know. The 14-row keyboard set needed six wrapped lines and was given a box
 * sized for three, and `overflow: hidden` quietly removed everything from
 * 「F EX 技能」 down. The legend showed a control list that stopped at R and
 * looked complete, which is the one failure mode it exists to prevent.
 */
describe("the strip is tall enough for what it actually wraps", () => {
  const MODES = ["keyboard", "gamepad", "touch"] as const;

  for (const vp of VIEWPORTS) {
    for (const touch of [false, true]) {
      for (const couchPlayers of [1, 2, 4]) {
        for (const mode of MODES) {
          const rows = legendRows(mode);
          it(`fits every row @ ${vp.width}x${vp.height} touch=${touch} players=${couchPlayers} ${mode}`, () => {
            const rect = controlLegendRect(vp, { touch, couchPlayers, rows });
            if (!rect || rect.shape !== "strip") return; // null / column are covered elsewhere
            // recompute the wrap from the width the placement actually chose
            const needed = legendStripHeight(rows, rect.w);
            expect(rect.h).toBeGreaterThanOrEqual(needed);
          });
        }
      }
    }
  }

  it("the 812x375 keyboard strip is no longer the old 84px three-liner", () => {
    const rows = legendRows("keyboard");
    const rect = controlLegendRect({ width: 812, height: 375 }, PC(false, 1, rows));
    if (rect && rect.shape === "strip") {
      // 14 rows cannot wrap into three lines at this width — if a rect comes
      // back at all it must be honestly tall
      expect(legendStripLines(rows, rect.w - 16)).toBeGreaterThan(3);
      expect(rect.h).toBeGreaterThan(84);
    }
    // (null is also acceptable: "no room" beats "half the controls")
  });

  it("a wider caption really does make a wider pill", () => {
    const short = legendPillWidth({ id: "a", control: "Q", label: "技能 Q" });
    const long = legendPillWidth({ id: "b", control: "左鍵點自己", label: "移動 / 攻擊點到的敵人" });
    expect(long).toBeGreaterThan(short * 2);
  });

  it("more rows in the same width means more lines", () => {
    const few = legendStripLines(legendRows("touch"), 600);
    const many = legendStripLines(legendRows("keyboard"), 600);
    expect(many).toBeGreaterThan(few);
  });

  it("the same rows in a narrower strip need more lines", () => {
    const rows = legendRows("keyboard");
    expect(legendStripLines(rows, 300)).toBeGreaterThan(legendStripLines(rows, 600));
  });
});
