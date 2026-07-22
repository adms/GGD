/**
 * The prep window's VISIBLE countdown (task #95) —
 * 「shop 頁面也是有限時，一樣進入要有倒數計時的畫面跟音效提示」.
 *
 * The two bugs this locks out are named in the task itself:
 *   1. "it keeps beeping after Ready" — a countdown that keeps nagging at a
 *      player who already committed. Covered here (the picture) and in
 *      audio/countdownCue.test.ts (the sound).
 *   2. "it never fires when the card is closed" — a countdown that lives inside
 *      the closable shop card and is therefore invisible exactly when it
 *      matters. Covered by the SURFACES block, which scans HudRoot / MerchantShop
 *      so the pill can never be moved back inside the card without failing.
 *
 * Plus the two decisions that make it survivable on round six: the ramp is
 * gentle and short, and the loud part is exactly the audio's own 5 s window.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { COUNTDOWN_LEAD_SEC, cueForSecond } from "../../audio/countdownCue";
import {
  PREP_CLOCK_BOTTOM,
  PREP_PHASE,
  PREP_TONE_COLOR,
  PREP_URGENT_SEC,
  PREP_WARN_SEC,
  READY_BLOCK_BOTTOM,
  READY_BLOCK_HEIGHT,
  prepClockFace,
  prepClockView,
  prepTone,
  shopClockChip,
} from "./prepCountdown";

const UI_DIR = join(__dirname, "..");

/** strip comments so prose about forbidden patterns can't trip a scan */
function readUi(rel: string): string {
  return readFileSync(join(UI_DIR, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const prep = (secondsLeft: number, ready = false): { phase: string; secondsLeft: number; ready: boolean } => ({
  phase: PREP_PHASE,
  secondsLeft,
  ready,
});

describe("prep countdown ramp (prep-countdown-ramp)", () => {
  it("is on screen for the WHOLE window — the user asked for a countdown on ENTRY", () => {
    cover("prep-countdown-ramp");
    for (const sec of [60, 45, 30, 11, 10, 5, 1, 0]) {
      expect(prepClockView(prep(sec)).visible, `${sec}s left`).toBe(true);
    }
    // nothing NEW appears at the deadline: the element the escalation happens to
    // is the same element that has been sitting there since the phase opened.
    expect(prepClockView(prep(60)).clock).toBe("1:00");
    expect(prepClockView(prep(5)).clock).toBe("0:05");
  });

  it("shows for the prep window ONLY — no other phase gets this pill", () => {
    cover("prep-countdown-ramp");
    for (const phase of ["champSelect", "combat", "resolution", "matchEnd", "connecting"]) {
      expect(prepClockView({ phase, secondsLeft: 3, ready: false }).visible, phase).toBe(false);
    }
  });

  it("ramps calm → warn → urgent, and the loud band is SHORT", () => {
    cover("prep-countdown-ramp");
    expect(prepTone(60, false)).toBe("calm");
    expect(prepTone(11, false)).toBe("calm");
    expect(prepTone(PREP_WARN_SEC, false)).toBe("warn");
    expect(prepTone(6, false)).toBe("warn");
    expect(prepTone(PREP_URGENT_SEC, false)).toBe("urgent");
    expect(prepTone(1, false)).toBe("urgent");
    expect(prepTone(0, false)).toBe("urgent");
    // 5 of a 60 s window is ~8 % — this fires every round, unlike champ select
    expect(PREP_URGENT_SEC).toBeLessThan(PREP_WARN_SEC);
    expect(PREP_WARN_SEC).toBeLessThan(30);
  });

  it("the URGENT band is exactly the audio's band — eye and ear cannot disagree", () => {
    cover("prep-countdown-ramp");
    expect(PREP_URGENT_SEC).toBe(COUNTDOWN_LEAD_SEC);
    for (let sec = 1; sec <= PREP_URGENT_SEC; sec++) {
      expect(prepTone(sec, false), `${sec}s is loud`).toBe("urgent");
      expect(cueForSecond(sec), `${sec}s rings`).not.toBeNull();
    }
  });

  it("the WARN band is colour only: no motion, no sound (the shop is a reading task)", () => {
    cover("prep-countdown-ramp");
    for (let sec = PREP_URGENT_SEC + 1; sec <= PREP_WARN_SEC; sec++) {
      const view = prepClockView(prep(sec));
      expect(view.tone, `${sec}s`).toBe("warn");
      expect(view.pulse, `${sec}s must not move`).toBe(false);
      expect(cueForSecond(sec), `${sec}s must stay silent`).toBeNull();
    }
    expect(PREP_TONE_COLOR.warn).not.toBe(PREP_TONE_COLOR.calm);
  });

  it("the number pops once per whole second, and stops moving at 0", () => {
    cover("prep-countdown-ramp");
    // `beat` is the animation's React key: a 20 Hz snapshot repeat of the same
    // second keeps the same key, so the pop cannot re-trigger mid-second.
    const repeats = [3, 3, 3, 3].map((s) => prepClockView(prep(s)));
    expect(new Set(repeats.map((v) => v.beat)).size).toBe(1);
    expect(repeats.every((v) => v.pulse)).toBe(true);
    expect(prepClockView(prep(2)).beat).not.toBe(prepClockView(prep(3)).beat);
    // 0 s holds the colour but stops moving — a pop landing on the scene cut
    // would read as a glitch, and there is nothing left to hurry for.
    const zero = prepClockView(prep(0));
    expect(zero.tone).toBe("urgent");
    expect(zero.pulse).toBe(false);
  });

  it("survives junk clocks without rendering junk", () => {
    cover("prep-countdown-ramp");
    expect(prepClockView(prep(-4)).clock).toBe("0:00");
    expect(prepClockView(prep(Number.NaN)).clock).toBe("0:00");
    expect(prepClockFace(125)).toBe("2:05");
    expect(prepClockFace(9)).toBe("0:09");
  });
});

describe("Ready ends the nagging (prep-countdown-ready)", () => {
  it("commits at ANY second: green, still, and a different sentence", () => {
    cover("prep-countdown-ready");
    for (const sec of [60, 10, 5, 3, 1, 0]) {
      const view = prepClockView(prep(sec, true));
      expect(view.tone, `${sec}s after Ready`).toBe("committed");
      expect(view.pulse, `${sec}s must not pulse after Ready`).toBe(false);
      expect(view.color).toBe(PREP_TONE_COLOR.committed);
    }
    expect(prepClockView(prep(3, true)).label).not.toBe(prepClockView(prep(3, false)).label);
  });

  it("keeps the CLOCK after Ready — you still want to know how long", () => {
    cover("prep-countdown-ready");
    // committed silences the pressure, it does not hide the information: the
    // phase can still run 40 more seconds because someone else has not readied.
    expect(prepClockView(prep(42, true)).clock).toBe("0:42");
    expect(prepClockView(prep(42, true)).visible).toBe(true);
    expect(shopClockChip(prep(42, true)).text).toContain("0:42");
  });

  it("un-readying is not a thing, but if it happened the ramp resumes honestly", () => {
    cover("prep-countdown-ready");
    // the server clears `ready` only on the NEXT intermission entry, i.e. with a
    // full clock — so the resumed ramp is calm, never a red flash out of nowhere.
    expect(prepClockView(prep(60, false)).tone).toBe("calm");
    expect(prepClockView(prep(4, false)).tone).toBe("urgent");
  });
});

describe("both card states, and the defeated shopper (prep-countdown-surfaces)", () => {
  it("the pill is HudRoot's, not the shop card's — a closed card cannot hide it", () => {
    cover("prep-countdown-surfaces");
    const hudRoot = readUi("HudRoot.tsx");
    expect(hudRoot).toContain("<PrepClock />");
    expect(hudRoot).toContain('from "./panels/PrepClock"');
    // THE BUG: if the countdown ever moves inside MerchantShop it dies with the
    // card, which is exactly when the player needs it most.
    const shop = readUi("panels/MerchantShop.tsx");
    expect(shop).not.toContain("PrepClock");
    // it also reads the clock straight from the store, not from the card
    expect(readUi("panels/PrepClock.tsx")).toContain("prepClockView");
  });

  it("the CLOSED re-open button carries the clock too (it used to show no time at all)", () => {
    cover("prep-countdown-surfaces");
    const shop = readUi("panels/MerchantShop.tsx");
    const closed = shop.slice(shop.indexOf("if (!open)"));
    expect(closed.length).toBeGreaterThan(0);
    // the closed branch renders the shared chip before the vertical button
    expect(closed.indexOf("clock.text")).toBeGreaterThanOrEqual(0);
    expect(closed.indexOf("clock.text")).toBeLessThan(closed.indexOf("gate.label"));
    // and it comes from THIS module, so the card can never drift from the pill
    expect(shop).toContain("shopClockChip");
  });

  it("open card and closed button show the SAME number in the SAME colour", () => {
    cover("prep-countdown-surfaces");
    const chip = shopClockChip(prep(7));
    const view = prepClockView(prep(7));
    expect(chip.text).toContain(view.clock);
    expect(chip.color).toBe(view.color);
    expect(chip.color).toBe(PREP_TONE_COLOR.warn);
  });

  it("the DEFEATED shopper gets a sentence, never a countdown", () => {
    cover("prep-countdown-defeated");
    // Combat, for a champion already down this round: their deadline is the last
    // enemy dying, at an unknowable moment — counting the combat clock down to a
    // draw-on-HP that usually never happens would be a lie.
    const chip = shopClockChip({ phase: "combat", secondsLeft: 4, ready: false });
    expect(chip.text).not.toMatch(/\d/);
    expect(chip.text).toContain("陣亡");
    expect(prepClockView({ phase: "combat", secondsLeft: 4, ready: false }).visible).toBe(false);
    // and combat still makes no sound, however few seconds are left
    expect(cueForSecond(4)).not.toBeNull(); // the WINDOW would match…
    expect(prepTone(4, false)).toBe("urgent"); // …the phase gate is what stops it
  });

  it("the pill clears the Ready block it is pinned above", () => {
    cover("prep-countdown-surfaces");
    expect(PREP_CLOCK_BOTTOM).toBeGreaterThanOrEqual(READY_BLOCK_BOTTOM + READY_BLOCK_HEIGHT);
    // …and the number it is measured against is still the one ReadyButton uses
    expect(readUi("panels/ReadyButton.tsx")).toContain(`bottom: ${READY_BLOCK_BOTTOM}`);
  });
});
