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
import {
  RESOURCE_ROW_W,
  SHIPPED_HUD_CLUSTER,
  hudClusterRects,
} from "./hud/hudBottomCluster";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BTN, GAMEPAD_LONG_PRESS_MS, GamepadInput } from "../input/GamepadInput";
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
  approxTextWidth,
  controlLegendRect,
  controlLegendLayer,
  controlLegendVisible,
  gamepadLegend,
  legendLayerRows,
  padMenuLegend,
  probeMenuNavButton,
  probeMenuNavScroll,
  probeMenuNavStick,
  PAD_COMBAT_EXTRA,
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
  probeGamepadLongPress,
  probeGamepadSticks,
  legendChipColumnWidth,
  legendColumnWidth,
  LEGEND_COLUMN_MAX_W,
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
    // (owner 2026-07-27: EX moved Back→LB, 天生技 moved d-pad↑→RB, and the
    // d-pad took over stop/recall. These are the new bindings, not a drift.)
    expect(probeGamepadButton(BTN.A)).toEqual({ kind: "cast", slot: "Q" });
    expect(probeGamepadButton(BTN.LB)).toEqual({ kind: "cast", slot: "EX" });
    expect(probeGamepadButton(BTN.RB)).toEqual({ kind: "cast", slot: "PASSIVE" });
    expect(probeGamepadButton(BTN.DPAD_UP)).toEqual({ kind: "order", order: "stop" });
    expect(probeGamepadButton(BTN.DPAD_DOWN)).toEqual({ kind: "command", command: "recall" });
    expect(probeGamepadButton(BTN.START)).toEqual({ kind: "command", command: "ready" });
    expect(probeGamepadButton(BTN.L3)).toEqual({ kind: "camera", camera: "toggleFollow" });
    expect(probeGamepadButton(BTN.R3)).toEqual({ kind: "camera", camera: "zoomCycle" });
    // Back is deliberately unbound now (its 記分板 job belongs to task #197)
    expect(probeGamepadButton(BTN.BACK)).toBeNull();
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * THE GUARD THAT MATTERS MOST (owner, 2026-07-27)
   * ════════════════════════════════════════════════════════════════════════
   * 長按升級 is not a button press. The legend's probe is press-shaped, so it
   * would have compiled, tested green, derived a legend — and left the gesture
   * COMPLETELY INVISIBLE, which for a binding nobody can guess is identical to
   * never shipping it. This asserts `gamepadLegend()`'s RETURN VALUE, not the
   * source text: delete the long-press rows (or the long press itself) and this
   * goes red.
   */
  it("the legend really TELLS the player about 長按 → 升級", () => {
    const rows = gamepadLegend();
    const rankRows = rows.filter((r) => r.control.includes("長按") && r.label.includes("升級"));
    expect(rankRows.length, "no 長按→升級 row: the gesture is unfindable").toBeGreaterThan(0);
    // …and it names the buttons a player can actually try
    const faces = rankRows.map((r) => r.control).join(" ");
    for (const f of ["A", "B", "X", "Y"]) expect(faces).toContain(f);
    // …and says what the SAME hold does with no point to spend
    expect(rankRows.some((r) => r.label.includes("說明"))).toBe(true);
    // the two slots that have no rank get their own honest row
    const infoRows = rows.filter((r) => r.control.includes("長按") && !r.label.includes("升級"));
    expect(infoRows.map((r) => r.control).join(" ")).toContain("LB");
    expect(infoRows.every((r) => r.label.includes("說明"))).toBe(true);
  });

  it("the long-press rows are PROBED, so a slot that moves takes its row with it", () => {
    // with a point: the hold ranks that button's own slot
    expect(probeGamepadLongPress(BTN.A, 1)).toEqual({ kind: "rankUp", slot: "Q" });
    expect(probeGamepadLongPress(BTN.Y, 1)).toEqual({ kind: "rankUp", slot: "R" });
    // without: the same hold explains it
    expect(probeGamepadLongPress(BTN.A, 0)).toEqual({ kind: "describe", slot: "Q" });
    // EX / 天生技 have no rank, so they describe even with points in hand
    expect(probeGamepadLongPress(BTN.LB, 9)).toEqual({ kind: "describe", slot: "EX" });
    expect(probeGamepadLongPress(BTN.RB, 9)).toEqual({ kind: "describe", slot: "PASSIVE" });
    // a button with no slot has no long press at all
    expect(probeGamepadLongPress(BTN.START, 9)).toBeNull();
  });

  /**
   * The probe above feeds `mapGamepadFrame` a SYNTHETIC long-press frame, which
   * proves the mapping — but not that a real pad can ever produce that frame.
   * Break the clock (threshold → Infinity) and the legend would happily keep
   * advertising a gesture no hold can reach. This closes that loop: a real
   * `GamepadInput`, a real hold, the real edge the probe assumes.
   */
  it("a REAL hold can actually produce the frame the long-press row promises", () => {
    let now = 0;
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === BTN.A }));
    const input = new GamepadInput(0, () => ({ connected: true, axes: [0, 0, 0, 0], buttons }), () => now);
    expect(input.poll()!.longPressed).toEqual([]);
    now += GAMEPAD_LONG_PRESS_MS;
    const held = input.poll()!;
    expect(held.longPressed, "no hold can ever reach the advertised 長按").toEqual([BTN.A]);
    expect(held.longHeld).toEqual([BTN.A]);
    expect(Number.isFinite(GAMEPAD_LONG_PRESS_MS)).toBe(true);
  });

  it("the camera rows exist too — L3/R3 are base bindings, not a lost layer", () => {
    const rows = gamepadLegend();
    const l3 = rows.find((r) => r.id === "btn-L3");
    const r3 = rows.find((r) => r.id === "btn-R3");
    expect(l3?.label).toContain("跟隨");
    expect(r3?.label).toContain("鏡頭");
    expect(rows.find((r) => r.id === "stick-right-pan")?.label).toContain("平移");
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

    // RE-POINTED (not deleted) 2026-07-30. The bar and the HP/MP plate no
    // longer pin themselves — they are flex rows of ONE container whose offset
    // and gap are bounded fields (ui/hud/hudBottomCluster), which is what made
    // 「緊鄰但不重疊」 expressible at all. So the legend's reservation is checked
    // against the RESOLVED column instead of against two strings in two files:
    // strictly stronger, because a restructure that moved the bar would change
    // these numbers rather than merely fail to match a regex.
    const cluster = hudClusterRects({ width: 1280, height: 800 }, false, {
      resources: true,
      abilities: true,
    });
    // 34 + 88 (ability row) + 6 (gap) = 128 — the plate's historical bottom edge
    expect(
      SHIPPED_HUD_CLUSTER.clusterBottomPx + cluster.abilities!.h + cluster.gapPx,
    ).toBe(128);
    expect(RESOURCE_ROW_W).toBe(278); // 260 content + 8px padding + 1px border, each side
    expect(ABILITY_CLUSTER_H).toBeGreaterThan(cluster.cluster.h + SHIPPED_HUD_CLUSTER.clusterBottomPx);
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
    expect(rect?.w).toBeGreaterThanOrEqual(LEGEND_COLUMN_W);
    // below the top-left stack (☰ / 隊伍 / 復活 / 敵隊), not beside the ability bar
    expect(rect!.y).toBeGreaterThan(300);
  });

  /**
   * The column paints captions `nowrap` + `textOverflow: ellipsis`, so a row
   * that does not fit is not "a bit tight" — it is SILENTLY TRUNCATED. That is
   * the same shape of failure as the strip clipping at 「F EX 技能」, and the
   * long-press rows ("長按 A" → "升級技能 Q（沒點數看說明）") are much wider than
   * the 218px the column used to be fixed at.
   */
  describe("no column row is ever ellipsised", () => {
    for (const mode of MODES) {
      it(`fits every ${mode} row inside the width it asks for`, () => {
        const rows = legendRows(mode);
        const w = legendColumnWidth(rows);
        const gutter = legendChipColumnWidth(rows);
        for (const row of rows) {
          // chip + gap + caption + the 9+9 padding must all be inside `w`
          const needed = gutter + 6 + approxTextWidth(row.label, 11) + 18;
          expect(needed, `「${row.control} ${row.label}」 does not fit`).toBeLessThanOrEqual(w);
        }
      });
    }

    it("a set too wide for the ceiling gets NO column (the strip wraps instead)", () => {
      const monster: LegendRow[] = [
        { id: "x", control: "長按 十字鍵 ←", label: "一段長得離譜的說明文字一段長得離譜的說明文字" },
      ];
      expect(legendColumnWidth(monster)).toBeGreaterThan(LEGEND_COLUMN_MAX_W);
      const rect = controlLegendRect({ width: 1546, height: 900 }, PC(false, 1, monster));
      expect(rect?.shape).not.toBe("column");
    });

    it("the gutter really grows with the widest chip", () => {
      const narrow = legendChipColumnWidth([{ id: "a", control: "A", label: "x" }]);
      const wide = legendChipColumnWidth([
        { id: "a", control: "A", label: "x" },
        { id: "b", control: "長按 十字鍵 ↑", label: "x" },
      ]);
      expect(wide).toBeGreaterThan(narrow);
    });
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
    expect(pad).toContain("十字鍵 ↑");
    expect(pad).toContain("十字鍵 ↓");
    expect(pad.some((c) => c === "Back")).toBe(false); // unbound since the remap
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

/**
 * GH#506 — THE CARD MAY NOT PRINT A KEY NOTHING BINDS, AND MAY NOT HIDE ONE
 * THAT IS BOUND. Two directions, because they fail differently: a printed-but-
 * unbound key sends a player pressing Back for an EX that moved to LB three
 * weeks ago; a bound-but-unprinted one is a feature nobody discovers.
 */
describe("GH#506 legend ↔ implementation reconcile BOTH ways", () => {
  const PAD_FOCUS_NAV = readSrc("ui/PadFocusNav.tsx");
  const chip = (c: string): string => c.replace(/^長按 /, "");
  const isDir = (a: unknown): boolean => ["up", "down", "left", "right"].includes(a as string);

  /** Faces the COMBAT map really binds, from the probes — never a copy. */
  const boundCombat = new Set<string>();
  for (const [n, i] of Object.entries(BTN)) {
    if (probeGamepadButton(i) ?? probeGamepadLongPress(i, 1) ?? probeGamepadLongPress(i, 0)) {
      boundCombat.add(padFace(n));
    }
  }
  if (probeGamepadSticks().move) boundCombat.add("左類比");
  if (probeGamepadSticks().aim) boundCombat.add("右類比");

  /** Faces the MENU nav really binds. Directions collapse to one 十字鍵 row. */
  const boundMenu = new Set<string>();
  for (const [n, i] of Object.entries(BTN)) {
    const a = probeMenuNavButton(i);
    if (!a) continue;
    boundMenu.add(isDir(a) ? "十字鍵" : padFace(n));
  }
  if (probeMenuNavStick()) boundMenu.add("左類比");
  if (probeMenuNavScroll()) boundMenu.add("右類比");

  it("prints no combat key the pad map does not bind", () => {
    expect(boundCombat.size).toBeGreaterThan(0);
    for (const row of legendLayerRows("combat", "gamepad")) {
      expect(boundCombat, `combat legend prints "${row.control}"`).toContain(chip(row.control));
    }
  });

  it("prints no menu key PadMenuNav does not bind", () => {
    expect(boundMenu.size).toBeGreaterThan(0);
    for (const row of legendLayerRows("menu", "gamepad")) {
      expect(boundMenu, `menu legend prints "${row.control}"`).toContain(chip(row.control));
    }
  });

  it("leaves no menu binding undocumented", () => {
    const printed = new Set(padMenuLegend().map((r) => chip(r.control)));
    for (const f of boundMenu) expect(printed, `menu binding "${f}" has no row`).toContain(f);
  });

  it("says START opens the pause menu, and that bridge really exists on BTN.START", () => {
    const extra = PAD_COMBAT_EXTRA.START!;
    expect(PAD_FOCUS_NAV).toContain(extra.source);
    // the bridge's own button index must BE the one the card prints against
    const declared = /START_BTN\s*=\s*(\d+)/.exec(PAD_FOCUS_NAV);
    expect(Number(declared?.[1])).toBe(BTN.START);
    const start = legendLayerRows("combat", "gamepad").find((r) => r.control === padFace("START"));
    expect(start?.label).toContain(extra.label);
  });

  it("shows the MENU card wherever the focus layer owns the pad — pad only", () => {
    const base = { round: 9, dismissed: false, panelCovering: false, mode: "gamepad" as const };
    for (const phase of ["champSelect", "intermission", "matchEnd"]) {
      expect(controlLegendLayer({ ...base, phase })).toBe("menu");
      expect(controlLegendLayer({ ...base, phase, mode: "keyboard" })).toBeNull();
    }
    expect(controlLegendLayer({ ...base, phase: "combat", round: 1 })).toBe("combat");
    expect(controlLegendLayer({ ...base, phase: "combat" })).toBeNull();
  });
});
