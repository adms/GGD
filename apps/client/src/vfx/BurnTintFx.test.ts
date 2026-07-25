/**
 * The burn tint (task #195) — 「角色被火燒到畫面會變半透明紅」.
 *
 * The intensity/decay arithmetic is pure (`postFxMath`) and the pass lifecycle
 * is driven off `ENTITY_FLAG.BURNING`, so both halves are testable without a
 * GPU: this file exercises the maths and the gate. What it deliberately proves
 * is TRANSLUCENT — a wash that hid the ring would punish the player for the
 * feedback meant to save them.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BURN_FULL_RATE,
  BURN_HALF_LIFE_MS,
  BURN_MAX,
  burnTintForRate,
  decayIntensity,
} from "./postFxMath";
import { BURN_COLOR, burnTintColor } from "./BurnTintFx";
import { FOCUS_FADE_OUT_MS } from "../render/deathFocus";

describe("burn tint intensity (firering-shrink)", () => {
  it("ramps with the burn rate and tops out at BURN_MAX — TRANSLUCENT, not opaque", () => {
    cover("firering-shrink");
    expect(burnTintForRate(0)).toBe(0);
    // the shipped ramp: 4 %/s at ignition → 20 %/s once the ring has closed
    const atIgnition = burnTintForRate(0.04);
    const atClosed = burnTintForRate(BURN_FULL_RATE);
    expect(atIgnition).toBeGreaterThan(0);
    expect(atIgnition).toBeLessThan(atClosed);
    expect(atClosed).toBeCloseTo(BURN_MAX, 12);
    // concave: the first seconds are unmistakable rather than subliminal
    expect(atIgnition).toBeGreaterThan(BURN_MAX * (0.04 / BURN_FULL_RATE));
    // half-transparent at most — the arena, the HP bars and the ring stay legible
    expect(BURN_MAX).toBeLessThan(0.5);
    expect(burnTintForRate(99)).toBe(BURN_MAX); // clamped, never runaway
    expect(burnTintForRate(Number.NaN)).toBe(0);
  });

  it("mixes toward a flame red, never a pure #f00 error state", () => {
    cover("firering-shrink");
    const [r, g, b] = BURN_COLOR;
    expect(r).toBeGreaterThan(0.6);
    expect(g).toBeGreaterThan(0); // a touch of orange — flame, not UI red
    expect(b).toBeLessThan(g + 0.05);
    // at full strength the source colour is still visible through the wash
    const mixed = burnTintColor([1, 1, 1], BURN_MAX);
    expect(mixed[0]).toBeGreaterThan(BURN_COLOR[0]);
    expect(mixed[1]).toBeGreaterThan(BURN_COLOR[1]);
    // burn = 0 is the identity
    expect(burnTintColor([0.2, 0.3, 0.4], 0)).toEqual([0.2, 0.3, 0.4]);
    // burn = 1 is the flame colour exactly
    const full = burnTintColor([0.2, 0.3, 0.4], 1);
    expect(full[0]).toBeCloseTo(BURN_COLOR[0], 12);
  });

  it("releases fast enough to read as relief, slowly enough not to strobe", () => {
    cover("firering-shrink");
    const start = burnTintForRate(BURN_FULL_RATE);
    // one 30 Hz snapshot (33 ms) must not visibly drop it — otherwise a
    // champion hovering on the boundary flickers between two ticks
    const oneTick = decayIntensity(start, 33, BURN_HALF_LIFE_MS);
    expect(oneTick / start).toBeGreaterThan(0.9);
    // …but half a second of safety must be most of the way out
    const halfSec = decayIntensity(start, 500, BURN_HALF_LIFE_MS);
    expect(halfSec / start).toBeLessThan(0.35);
    expect(decayIntensity(start, 100000, BURN_HALF_LIFE_MS)).toBe(0); // hard zero
  });

  it("the forced ramp-out shares the DEATH WASH's clock (crossfade, not stack)", () => {
    cover("firering-shrink");
    // FOCUS_FADE_OUT_MS is imported, not copied: a linear ramp over the same
    // duration DeathFocusFx fades in over is what makes the hand-over a
    // crossfade instead of a red film over a grey frame.
    const src = readFileSync(join(__dirname, "BurnTintFx.ts"), "utf8");
    expect(src).toMatch(/FOCUS_FADE_OUT_MS/);
    expect(src).toMatch(/from "\.\.\/render\/deathFocus"/);
    // and the constant is a real number, so the ramp actually terminates
    expect(FOCUS_FADE_OUT_MS).toBeGreaterThan(0);
    expect(BURN_MAX / (FOCUS_FADE_OUT_MS / 16)).toBeLessThan(0.1); // ~<0.1 per frame
  });
});

describe("burn tint reaches EVERY seat, not just desktop player 0 (firering-shrink)", () => {
  it("is its own per-viewport pass, deliberately NOT folded into CombatPostFx", () => {
    cover("firering-shrink");
    const src = readFileSync(join(__dirname, "BurnTintFx.ts"), "utf8");
    // one slot per local player, sized to its own viewport rect
    expect(src).toMatch(/adaptScaleToCurrentViewport/);
    expect(src).toMatch(/cameraFor\(player: number\)/);
    // CombatPostFx is desktop-only + primary camera only; if this ever routed
    // through it, the owner's phone and seats 1..3 would see nothing at all.
    // Strip comments first so this file's OWN doc-comment mention of the name
    // doesn't trip the guard — we only forbid a real code reference (import/use).
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/CombatPostFx/);
    // the gate is the replicated flag, never the event drain
    expect(src).toMatch(/BURNING/);
  });
});
