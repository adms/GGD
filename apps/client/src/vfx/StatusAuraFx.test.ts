/**
 * vfx-status-aura (task #39): stun / root / slow / dash body visuals.
 *
 * The authoritative CC bitmask has been on the wire since the protocol was
 * written and NOTHING on the client ever read it, so a stunned champion looked
 * identical to a healthy one. These auras decode that bitmask into pulsed,
 * pooled bursts:
 *   · the bit decoding matches protocol/schema.ts exactly;
 *   · a healthy entity costs nothing (no tracking, no pooled system);
 *   · a status pulses on a cadence, NOT every frame;
 *   · clearing the flags stops the pulses, and a despawned entity ages out.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { stopsAscending } from "./vfxPresets";
import { STATUS_FLAGS, STATUS_KINDS, statusAura, statusesFrom } from "./statusPresets";
import { StatusAuraFx, STALE_MS, MAX_AURA_SYSTEMS } from "./StatusAuraFx";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterAll(() => {
  scene.dispose();
  engine.dispose();
});

const NO_TEX = { createTexture: (): null => null };

describe("flag decoding (vfx-status-aura)", () => {
  it("matches the protocol bitmask: 1 dashing, 2 rooted, 4 stunned, 8 slowed", () => {
    cover("vfx-status-aura");
    expect(STATUS_FLAGS).toEqual({ dashing: 1, rooted: 2, stunned: 4, slowed: 8 });
    expect(statusesFrom(4)).toEqual(["stunned"]);
    expect(statusesFrom(2 | 8)).toEqual(["slowed", "rooted"]);
    expect(statusesFrom(15)).toEqual([...STATUS_KINDS]);
  });

  it("a healthy entity decodes to nothing", () => {
    cover("vfx-status-aura");
    expect(statusesFrom(0)).toEqual([]);
    expect(statusesFrom(-1)).toEqual([]);
    expect(statusesFrom(NaN)).toEqual([]);
  });
});

describe("aura recipes (vfx-status-aura)", () => {
  it("every status has a small, short, monotonic pulse", () => {
    cover("vfx-status-aura");
    for (const kind of STATUS_KINDS) {
      const a = statusAura(kind);
      expect(a.repeatMs).toBeGreaterThan(16); // never every frame
      expect(a.spec.count).toBeLessThanOrEqual(8); // a pulse, not a burst
      expect(a.spec.lifetimeSec.max).toBeLessThanOrEqual(0.5);
      expect(stopsAscending(a.spec.colorStops)).toBe(true);
      expect(stopsAscending(a.spec.sizeStops)).toBe(true);
      expect(a.spec.colorStops[a.spec.colorStops.length - 1]![1][3]).toBe(0);
    }
  });

  it("reads at the right height: stars overhead, roots at the feet", () => {
    cover("vfx-status-aura");
    expect(statusAura("stunned").y).toBeGreaterThan(2); // above the head
    expect(statusAura("rooted").y).toBeLessThan(0.3); // on the ground
    expect(statusAura("slowed").y).toBeGreaterThan(0.5);
  });
});

describe("pulsing (vfx-status-aura)", () => {
  it("a healthy entity is never tracked and allocates nothing", () => {
    cover("vfx-status-aura");
    const fx = new StatusAuraFx(scene, NO_TEX);
    fx.set(1, 0, 0, 0, 0);
    fx.update(0);
    expect(fx.activeCount).toBe(0);
    for (const k of STATUS_KINDS) expect(fx.countFor(k)).toBe(0);
    fx.dispose();
  });

  it("a stunned entity pulses on a cadence, not every frame", () => {
    cover("vfx-status-aura");
    const fx = new StatusAuraFx(scene, NO_TEX);
    const period = statusAura("stunned").repeatMs;
    // total queued across every pooled instance of this status (a pulse may
    // land on a fresh instance while the previous one's particles are alive)
    const queued = (): number =>
      scene.particleSystems
        .filter((p) => p.name.includes("status/stunned"))
        .reduce((n, p) => n + p.manualEmitCount, 0);
    const clear = (): void => {
      for (const p of scene.particleSystems) if (p.name.includes("status/stunned")) p.manualEmitCount = 0;
    };

    fx.set(1, STATUS_FLAGS.stunned, 2, 3, 0);
    fx.update(0);
    expect(fx.activeCount).toBe(1);
    expect(queued()).toBe(statusAura("stunned").spec.count);

    // a frame later, well inside the period: no new pulse queued
    clear();
    fx.set(1, STATUS_FLAGS.stunned, 2, 3, 16);
    fx.update(16);
    expect(queued()).toBe(0);

    // past the period: it pulses again
    fx.set(1, STATUS_FLAGS.stunned, 2, 3, period + 1);
    fx.update(period + 1);
    expect(queued()).toBeGreaterThan(0);
    fx.dispose();
  });

  it("several statuses on one entity each pulse independently", () => {
    cover("vfx-status-aura");
    const fx = new StatusAuraFx(scene, NO_TEX);
    fx.set(1, STATUS_FLAGS.rooted | STATUS_FLAGS.slowed, 0, 0, 0);
    fx.update(0);
    expect(fx.countFor("rooted")).toBe(1);
    expect(fx.countFor("slowed")).toBe(1);
    expect(fx.countFor("stunned")).toBe(0);
    fx.dispose();
  });

  it("clearing the flags stops the pulses", () => {
    cover("vfx-status-aura");
    const fx = new StatusAuraFx(scene, NO_TEX);
    const period = statusAura("stunned").repeatMs;
    fx.set(1, STATUS_FLAGS.stunned, 0, 0, 0);
    fx.update(0);
    const ps = scene.particleSystems.find((p) => p.name.includes("status/stunned"))!;
    ps.manualEmitCount = 0;
    fx.set(1, 0, 0, 0, period + 1); // stun expired
    fx.update(period + 1);
    expect(ps.manualEmitCount).toBe(0);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it("a despawned entity ages out instead of pulsing forever", () => {
    cover("vfx-status-aura");
    const fx = new StatusAuraFx(scene, NO_TEX);
    fx.set(7, STATUS_FLAGS.stunned, 0, 0, 0);
    fx.update(0);
    expect(fx.activeCount).toBe(1);
    fx.update(STALE_MS + 100); // never `set` again — the entity is gone
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it("forget() drops an entity immediately (death)", () => {
    cover("vfx-status-aura");
    const fx = new StatusAuraFx(scene, NO_TEX);
    fx.set(7, STATUS_FLAGS.rooted, 0, 0, 0);
    fx.update(0);
    expect(fx.activeCount).toBe(1);
    fx.forget(7);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it("many CC'd entities SHARE one pooled system per status", () => {
    cover("vfx-status-aura");
    const fx = new StatusAuraFx(scene, NO_TEX);
    for (let id = 0; id < 12; id++) fx.set(id, STATUS_FLAGS.slowed, id, 0, 0);
    fx.update(0);
    expect(fx.activeCount).toBe(12);
    expect(fx.countFor("slowed")).toBeLessThanOrEqual(MAX_AURA_SYSTEMS);
    fx.dispose();
  });
});
