/**
 * cooldownView — the cooldown READ every HUD surface shares (task #219).
 *
 * THE BUG THIS LOCKS OUT, and it is a number bug, not a paint bug. The sim
 * charges `authored × (1 - cdr) × combatEnv.cooldown` seconds
 * (packages/shared/src/sim/abilities/abilitySystem.ts) and the shipped table
 * has `cooldown: 0.2`. Every HUD surface divided the REMAINING seconds by the
 * RAW AUTHORED cooldown, so the progress fraction was mathematically capped at
 * 0.20 — a ~10px band at the bottom of a 52px tile, inside the strip the
 * ability-name scrim already owns. 「技能冷卻進度不容易從圖示上看到」 was literally
 * true: the indicator never left the scrim.
 *
 * The maths is asserted here (pure, no DOM); that the three surfaces actually
 * render the new chrome and feed it the ENV-SCALED max is asserted by
 * components/cooldownChrome.test.ts.
 */
import { describe, it, expect } from "vitest";
import { TICK_HZ } from "@ggd/shared/constants";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import { displayFinal } from "./displayFinal";
import {
  cooldownFrac,
  cooldownLabel,
  cooldownSeconds,
  cooldownView,
  isReadyEdge,
  cooldownNumberStyle,
  cooldownReadyStyle,
  cooldownWipeStyle,
  SUBSEC_AT,
} from "./cooldownView";

describe("cooldownView: ticks → seconds → progress (cooldown-legibility)", () => {
  it("converts wire ticks to seconds at the sim rate", () => {
    cover("cooldown-legibility");
    expect(cooldownSeconds(TICK_HZ)).toBe(1);
    expect(cooldownSeconds(TICK_HZ * 7)).toBe(7);
    expect(cooldownSeconds(0)).toBe(0);
    // a negative / garbage tick count must not paint a negative wedge
    expect(cooldownSeconds(-5)).toBe(0);
    expect(cooldownSeconds(Number.NaN)).toBe(0);
  });

  it("is a real 0..1 progress fraction, clamped at both ends", () => {
    cover("cooldown-legibility");
    expect(cooldownFrac(10, 10)).toBe(1);
    expect(cooldownFrac(5, 10)).toBe(0.5);
    expect(cooldownFrac(0, 10)).toBe(0);
    // remaining > max (CDR shrank the real cooldown, or a rank changed): clamp,
    // never overflow the wedge past a full turn
    expect(cooldownFrac(30, 10)).toBe(1);
    // no usable max → "full while it runs", never a silently invisible 0
    expect(cooldownFrac(4, 0)).toBe(1);
    expect(cooldownFrac(0, 0)).toBe(0);
  });

  it("THE #219 ROOT CAUSE: the max is the env-scaled final, not the authored base", () => {
    cover("cooldown-legibility");
    // A 35 s authored cooldown under the shipped `cooldown: 0.2` really fires
    // at 7 s. The instant it is cast the wire says 7 s remaining.
    const authored = 35;
    const env = { ...DEFAULT_COMBAT_ENV, cooldown: 0.2 };
    const realMax = displayFinal(authored, "cooldown", env);
    expect(realMax).toBeCloseTo(7, 6);

    const justCast = cooldownView(Math.round(7 * TICK_HZ), realMax);
    expect(justCast.frac).toBeCloseTo(1, 6); // a FULL tile, the whole point

    // the pre-fix denominator — what every surface used to pass
    expect(cooldownFrac(7, authored)).toBeCloseTo(0.2, 6);

    // and it decays honestly through the whole cooldown
    expect(cooldownView(Math.round(3.5 * TICK_HZ), realMax).frac).toBeCloseTo(0.5, 6);
    expect(cooldownView(0, realMax).frac).toBe(0);
  });

  it("labels whole seconds normally and sub-seconds at the end", () => {
    cover("cooldown-legibility");
    expect(cooldownLabel(12.4)).toBe("13"); // ceil: "13" until it really is 12
    expect(cooldownLabel(3.6)).toBe("4");
    expect(cooldownLabel(SUBSEC_AT)).toBe("3.0"); // boundary belongs to sub-second
    expect(cooldownLabel(2.9)).toBe("2.9");
    expect(cooldownLabel(0.1)).toBe("0.1"); // the old Math.ceil froze a "1" here
    expect(cooldownLabel(0)).toBe("");
    // monotone: the label never grows as the cooldown drains
    const seq = [3.4, 3.0, 2.5, 1.2, 0.4].map(cooldownLabel);
    expect(seq).toEqual(["4", "3.0", "2.5", "1.2", "0.4"]);
  });

  it("onCd is the single truth the deny cue and the chrome both read", () => {
    cover("cooldown-legibility");
    expect(cooldownView(1, 10).onCd).toBe(true);
    expect(cooldownView(0, 10).onCd).toBe(false);
    expect(cooldownView(0, 10).label).toBe("");
  });

  it("isReadyEdge fires once, on the transition, never while idle", () => {
    cover("cooldown-legibility");
    expect(isReadyEdge(0.4, 0)).toBe(true);
    expect(isReadyEdge(0, 0)).toBe(false); // already ready — no bloom every frame
    expect(isReadyEdge(2, 1)).toBe(false); // still cooling
    expect(isReadyEdge(0, 5)).toBe(false); // a fresh cast is not "ready"
  });
});

describe("cooldown chrome styles are legible by construction (cooldown-legibility)", () => {
  it("the progress wipe is a ROTATION, so it cannot be confused with the cast fill", () => {
    cover("cooldown-legibility");
    const bg = String(cooldownWipeStyle(0.5).background);
    // rotational geometry — the cast fill is a bottom-anchored linear RISE, and
    // the pre-fix cooldown rect used that identical shape in the same corner
    expect(bg).toContain("conic-gradient");
    expect(bg).toContain("0.5000turn");
    expect(cooldownWipeStyle(0.5).position).toBe("absolute");
    expect(cooldownWipeStyle(0.5).inset).toBe(0);
    // and a flat dim over the WHOLE tile, so a nearly-ready tile still reads
    // "not ready" instead of showing a sliver nobody notices
    expect(bg).toContain("linear-gradient");
    // out-of-range fractions clamp rather than wrapping past a full turn
    expect(String(cooldownWipeStyle(9).background)).toContain("1.0000turn");
    expect(String(cooldownWipeStyle(-1).background)).toContain("0.0000turn");
  });

  it("the number carries a shadow/stroke and tabular digits", () => {
    cover("cooldown-legibility");
    const s = cooldownNumberStyle(20);
    // the pre-fix number was color:#fff with NOTHING behind it, so on a bright
    // w3x icon it disappeared as soon as the dark rect fell below it
    expect(String(s.textShadow)).toContain("rgba(0,0,0");
    expect(String(s.WebkitTextStroke)).toContain("rgba(0,0,0");
    // a decimal must not make the digits jitter width
    expect(s.fontVariantNumeric).toBe("tabular-nums");
    expect(s.fontSize).toBe(20);
    expect(s.pointerEvents).toBe("none");
  });

  it("the ready bloom is a one-shot animation on a CHILD element", () => {
    cover("cooldown-legibility");
    const s = cooldownReadyStyle();
    // the keyframes live in ui/cooldown.css; the tile's own transform/filter are
    // the press + deny-shake channel and must not be touched
    expect(String(s.animation)).toContain("ggd-cd-ready");
    expect(String(s.animation)).toContain("forwards");
    expect(s.position).toBe("absolute");
    expect(s.pointerEvents).toBe("none");
  });
});
