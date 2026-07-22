/**
 * The dragon clash (task #88): the serene login theme must keep the login
 * scene's dragons distant, WITHOUT muting the scripted transition roars and
 * without second-guessing the player's own mixer.
 *
 * The levels asserted here were chosen from a measured mix (see the module
 * docstring in ./loginAmbience) — this file pins the RULE, not the taste: that
 * the ceiling/duck/spacing actually apply, that they apply to exactly the right
 * roars, and that the mixer stays in charge.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CALM_ROAR_CEILING,
  CALM_ROAR_DUCK,
  CALM_ROAR_INITIAL,
  CALM_ROAR_MIN_GAP_MS,
  isCalmLoginTheme,
  stepCalmRoar,
  type CalmRoarState,
} from "./loginAmbience";
import { LOGIN_SEGMENT_MS, LOGIN_THEMES, loginThemeAt } from "./loginRotation";

/** The loudest ambient cry the real scene emits (headless 360 s measurement). */
const LOUDEST_CRY = 1.116;
/** The quietest. */
const QUIETEST_CRY = 0.373;

const epic = { scene: "menu", bgmAudible: true, nowMs: 0 };
const calm = { scene: "menuNocturne", bgmAudible: true, nowMs: 0 };

describe("login ambience — the serene theme hushes the dragons", () => {
  it("only the nocturne is a calm theme, and it is one of the rotation's own", () => {
    expect(isCalmLoginTheme("menuNocturne")).toBe(true);
    expect(isCalmLoginTheme("menu")).toBe(false);
    expect(isCalmLoginTheme("combat")).toBe(false);
    expect(isCalmLoginTheme(null)).toBe(false);
    // a calm theme must be a theme the rotation can actually reach
    expect(LOGIN_THEMES).toContain("menuNocturne");
  });

  it("leaves the epic theme's cries EXACTLY as the scene emitted them", () => {
    cover("login-calm-epic-untouched");
    for (const v of [QUIETEST_CRY, 0.6, LOUDEST_CRY]) {
      const { decision } = stepCalmRoar(CALM_ROAR_INITIAL, { volume: v, big: false }, epic);
      expect(decision.volume).toBe(v);
      expect(decision.calmed).toBe(false);
    }
  });

  it("clamps the nocturne's cries to the DISTANT level, then ducks them", () => {
    cover("login-calm-ambient-ducked");
    const { decision } = stepCalmRoar(CALM_ROAR_INITIAL, { volume: LOUDEST_CRY, big: false }, calm);
    expect(decision.calmed).toBe(true);
    // the loudest near cry is pulled all the way to far × duck
    expect(decision.volume).toBeCloseTo(CALM_ROAR_CEILING * CALM_ROAR_DUCK, 10);
    // that is a large, deliberate attenuation — not a nudge
    const dB = 20 * Math.log10(decision.volume! / LOUDEST_CRY);
    expect(dB).toBeLessThan(-18);
    // a cry that was ALREADY quieter than the ceiling keeps its own shape
    const quiet = stepCalmRoar(CALM_ROAR_INITIAL, { volume: QUIETEST_CRY, big: false }, calm);
    expect(quiet.decision.volume).toBeCloseTo(QUIETEST_CRY * CALM_ROAR_DUCK, 10);
    expect(quiet.decision.volume!).toBeLessThan(decision.volume!);
  });

  it("ducks a big roar on the calm nocturne, leaves it untouched on epic (task #88)", () => {
    cover("login-calm-big-roar-exempt");
    // epic theme: the big transition roar plays at its full designed level.
    const onEpic = stepCalmRoar(CALM_ROAR_INITIAL, { volume: 1.5, big: true }, epic);
    expect(onEpic.decision.volume).toBe(1.5);
    expect(onEpic.decision.calmed).toBe(false);
    // calm nocturne (now the OPENING theme): the roar is ducked to the ceiling
    // so it never blasts over the stillness — but it is never dropped.
    const onCalm = stepCalmRoar(CALM_ROAR_INITIAL, { volume: 1.5, big: true }, calm);
    expect(onCalm.decision.calmed).toBe(true);
    expect(onCalm.decision.volume).not.toBeNull();
    expect(onCalm.decision.volume!).toBeLessThan(1.5);
  });

  it("a big roar does not consume the ambient spacing budget", () => {
    // the swoop roar fires, then an ambient cry a moment later must still be
    // free to play — the two are different sounds with different rules
    const afterBig = stepCalmRoar(CALM_ROAR_INITIAL, { volume: 1.5, big: true }, { ...calm, nowMs: 1000 });
    const ambient = stepCalmRoar(afterBig.next, { volume: 0.9, big: false }, { ...calm, nowMs: 1100 });
    expect(ambient.decision.volume).not.toBeNull();
  });

  it("spaces the cries: at most 4 in a whole nocturne segment", () => {
    cover("login-calm-spacing");
    // the real scene emits a cry every ~5.9 s; feed exactly that
    let state: CalmRoarState = CALM_ROAR_INITIAL;
    let played = 0;
    for (let t = 0; t <= LOGIN_SEGMENT_MS; t += 5_900) {
      const r = stepCalmRoar(state, { volume: 0.8, big: false }, { ...calm, nowMs: t });
      state = r.next;
      if (r.decision.volume !== null) played++;
    }
    expect(played).toBeLessThanOrEqual(4);
    expect(played).toBeGreaterThanOrEqual(3); // still present — not silence
    // and the same timeline on the epic theme is NOT thinned
    let epicState: CalmRoarState = CALM_ROAR_INITIAL;
    let epicPlayed = 0;
    for (let t = 0; t <= LOGIN_SEGMENT_MS; t += 5_900) {
      const r = stepCalmRoar(epicState, { volume: 0.8, big: false }, { ...epic, nowMs: t });
      epicState = r.next;
      if (r.decision.volume !== null) epicPlayed++;
    }
    expect(epicPlayed).toBeGreaterThan(played * 2);
  });

  it("drops a cry inside the gap and allows the one just past it", () => {
    const first = stepCalmRoar(CALM_ROAR_INITIAL, { volume: 0.8, big: false }, { ...calm, nowMs: 0 });
    expect(first.decision.volume).not.toBeNull();
    const tooSoon = stepCalmRoar(first.next, { volume: 0.8, big: false }, {
      ...calm,
      nowMs: CALM_ROAR_MIN_GAP_MS - 1,
    });
    expect(tooSoon.decision.volume).toBeNull();
    expect(tooSoon.decision.calmed).toBe(true);
    expect(tooSoon.next).toBe(first.next); // a dropped cry does not re-arm the gap
    const justRight = stepCalmRoar(first.next, { volume: 0.8, big: false }, {
      ...calm,
      nowMs: CALM_ROAR_MIN_GAP_MS,
    });
    expect(justRight.decision.volume).not.toBeNull();
  });

  it("the FIRST cry of a visit is never held back", () => {
    // a player who arrives mid-nocturne still meets the dragons immediately
    const { decision } = stepCalmRoar(CALM_ROAR_INITIAL, { volume: 0.5, big: false }, {
      ...calm,
      nowMs: 1_234_567,
    });
    expect(decision.volume).not.toBeNull();
  });

  it("an epic-theme cry does not eat into the nocturne's first quiet window", () => {
    // loud cries during the epic segment must not leave the nocturne's opening
    // gated shut — the spacing clock only advances on cries it actually calmed
    let state: CalmRoarState = CALM_ROAR_INITIAL;
    for (let t = 0; t < LOGIN_SEGMENT_MS; t += 6_000) {
      state = stepCalmRoar(state, { volume: 1.0, big: false }, { ...epic, nowMs: t }).next;
    }
    const firstCalm = stepCalmRoar(state, { volume: 1.0, big: false }, {
      ...calm,
      nowMs: LOGIN_SEGMENT_MS,
    });
    expect(firstCalm.decision.volume).not.toBeNull();
  });

  // --- the mixer stays in charge (#14 toggle, #54 sliders) -------------------

  it("lifts the calm when the BGM bus is inaudible — no music, no stillness", () => {
    cover("login-calm-respects-mixer");
    const muted = { scene: "menuNocturne", bgmAudible: false, nowMs: 0 };
    const { decision } = stepCalmRoar(CALM_ROAR_INITIAL, { volume: LOUDEST_CRY, big: false }, muted);
    expect(decision.volume).toBe(LOUDEST_CRY);
    expect(decision.calmed).toBe(false);
  });

  it("only ever scales a volume — it never bypasses the mixer", () => {
    // the rule's whole output is a per-voice multiplier in [0, ev.volume]; the
    // master/bus/mute chain downstream is untouched, so muting still mutes.
    for (const v of [0, QUIETEST_CRY, 0.7, LOUDEST_CRY, 3]) {
      const { decision } = stepCalmRoar(CALM_ROAR_INITIAL, { volume: v, big: false }, calm);
      expect(decision.volume!).toBeGreaterThanOrEqual(0);
      expect(decision.volume!).toBeLessThanOrEqual(v);
    }
  });

  it("never emits a NaN or a negative into the mixer", () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      for (const input of [epic, calm]) {
        const { decision } = stepCalmRoar(CALM_ROAR_INITIAL, { volume: v, big: false }, input);
        expect(Number.isFinite(decision.volume ?? 0)).toBe(true);
        expect(decision.volume ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
    const badClock = stepCalmRoar(CALM_ROAR_INITIAL, { volume: 1, big: false }, {
      ...calm,
      nowMs: Number.NaN,
    });
    expect(Number.isFinite(badClock.decision.volume ?? 0)).toBe(true);
  });

  it("a backwards clock cannot latch the gate shut", () => {
    const first = stepCalmRoar(CALM_ROAR_INITIAL, { volume: 0.8, big: false }, { ...calm, nowMs: 100_000 });
    // clock jumped backwards (suspended tab / manual change): the next cry must
    // still be allowed rather than waiting out a negative interval forever
    const back = stepCalmRoar(first.next, { volume: 0.8, big: false }, { ...calm, nowMs: 5_000 });
    expect(back.decision.volume).not.toBeNull();
  });
});

describe("the scripted angry roar is ducked when it opens on the nocturne", () => {
  it("the rotation opens on the calm nocturne, and a big roar there is ducked (task #88)", () => {
    cover("login-calm-return-intro-epic");
    // task #88: a fresh visit now OPENS on the serene nocturne (index 0);
    // useLoginTheme resets the rotation on every visit, and AuthScreen fires
    // the return-from-app roar at MOUNT — so the big roar can land on the calm.
    expect(loginThemeAt(0)).toBe("menuNocturne");
    expect(isCalmLoginTheme(loginThemeAt(0))).toBe(true);
    // the test's old tripwire said "if this flips, the big roar needs its own
    // rule": it now HAS one — a big roar on the calm bed is ducked to the
    // ceiling (never blasted at full over the stillness), but never dropped.
    const { decision } = stepCalmRoar(
      { lastCalmRoarMs: null },
      { volume: 1, big: true },
      { scene: loginThemeAt(0), bgmAudible: true, nowMs: 0 },
    );
    expect(decision.calmed).toBe(true);
    expect(decision.volume).not.toBeNull();
    expect(decision.volume!).toBeLessThan(1);
  });
});
