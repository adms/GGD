/**
 * Revive circles — CLIENT world view (task #84, rev-13/rev-14): the pure
 * progress/urgency math, the team tint, and EntityState.kind 3 dispatching to
 * a pooled ReviveCircleView (never a champion/flower/projectile view). Runs on
 * Babylon's NullEngine.
 *
 * The lesson this locks in is task #22's: a ground effect that does not READ
 * from the fixed camera is a bug, so the tests pin the two things that make it
 * legible — the rim fills in step with progress (never silently at 0 while a
 * channel is running), and the ring is sized from the AUTHORITATIVE wire
 * radius rather than a client-side constant.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";
import {
  ReviveCircleView,
  burndown01,
  flicker01,
  litTongues,
  teamRgb,
  TONGUE_COUNT,
  BURNDOWN_FROM,
} from "./ReviveCircleView";
import { TEAM_COLORS } from "./ChampionView";
import { hasOverheadBar, KIND_REVIVE_CIRCLE } from "../overheadAnchors";

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

const circleEntity = (
  id: number,
  over: Partial<NonNullable<EntityViewState["revive"]>> = {},
  teamId = 1,
): EntityViewState => ({
  id,
  kind: KIND_REVIVE_CIRCLE,
  seatId: 3,
  key: "prop.revive-circle",
  teamId,
  x: 4,
  z: -9,
  fx: 1,
  fz: 0,
  alive: true,
  revive: {
    progress: 0,
    lifeLeft: 1,
    radius: 2,
    channelling: false,
    contested: false,
    ...over,
  },
});

const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x,
  z: e.z,
  fx: e.fx,
  fz: e.fz,
});

describe("ring progress math (rev-13)", () => {
  it("litTongues fills monotonically and shows the FIRST tick of any channel", () => {
    cover("revive-view-progress");
    expect(litTongues(0)).toBe(0);
    // the very first tick of a 90-tick channel is ~1.1% — it must still light
    // one tongue, or the ring reads as dead while somebody is standing in it
    expect(litTongues(1 / 90)).toBe(1);
    expect(litTongues(0.5)).toBe(TONGUE_COUNT / 2);
    expect(litTongues(1)).toBe(TONGUE_COUNT);
    // monotonic + clamped at both ends
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const n = litTongues(p);
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(n).toBeLessThanOrEqual(TONGUE_COUNT);
      prev = n;
    }
    expect(litTongues(-5)).toBe(0);
    expect(litTongues(9)).toBe(TONGUE_COUNT);
  });

  it("burndown01 is silent until the ring is genuinely running out, then ramps to 1", () => {
    cover("revive-view-progress");
    expect(burndown01(1)).toBe(0);
    expect(burndown01(BURNDOWN_FROM)).toBe(0);
    expect(burndown01(BURNDOWN_FROM / 2)).toBeCloseTo(0.5, 6);
    expect(burndown01(0)).toBe(1);
    // out-of-range inputs never produce a nonsense envelope
    expect(burndown01(-1)).toBe(1);
    expect(burndown01(4)).toBe(0);
  });

  it("flicker01 stays in [0,1] and two circles de-sync by phase", () => {
    cover("revive-view-progress");
    for (let t = 0; t < 4000; t += 37) {
      const v = flicker01(t, 0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(flicker01(1234, 0)).not.toBeCloseTo(flicker01(1234, 1.7), 3);
  });

  it("the tint is the SHARED 4-team palette, wrapping like every other team read", () => {
    cover("revive-view-progress");
    for (let team = 0; team < 4; team++) expect(teamRgb(team)).toEqual(TEAM_COLORS[team]);
    expect(teamRgb(5)).toEqual(TEAM_COLORS[1]);
    expect(teamRgb(-1)).not.toEqual(TEAM_COLORS[3]); // team-less falls back, not gold-by-accident
  });
});

describe("EntityViewRegistry revive dispatch (rev-14)", () => {
  it("kind 3 creates a pooled ReviveCircleView, never a champion/flower view", () => {
    cover("revive-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({
      entities: [circleEntity(21)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
    });
    expect(registry.reviveCircleCount).toBe(1);
    expect(registry.championCount).toBe(0);
    expect(registry.flowerCount).toBe(0);
    expect(registry.projectileCount).toBe(0);
    // the imperative pose landed
    expect(registry.posOf(21)).toEqual({ x: 4, z: -9 });
    registry.dispose();
  });

  it("recycles the view through the pool when the circle despawns and a new one drops", () => {
    cover("revive-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const sync = (entities: EntityViewState[]): void =>
      registry.sync({ entities, poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });

    sync([circleEntity(31)]);
    expect(registry.reviveCircleCount).toBe(1);
    sync([]); // expired
    expect(registry.reviveCircleCount).toBe(0);
    sync([circleEntity(32)]); // a later death drops another
    expect(registry.reviveCircleCount).toBe(1);
    registry.dispose();
  });

  it("coexists with champions and flowers in the same frame", () => {
    cover("revive-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const champ: EntityViewState = {
      id: 1, kind: 0, seatId: 0, key: "champ.test", teamId: 0,
      x: 0, z: 0, fx: 1, fz: 0, alive: true,
    };
    const flower: EntityViewState = {
      id: 2, kind: 2, seatId: -1, key: "prop.flower", teamId: -1,
      x: 3, z: 3, fx: 1, fz: 0, alive: true,
    };
    registry.sync({
      entities: [champ, flower, circleEntity(3)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
    });
    expect(registry.championCount).toBe(1);
    expect(registry.flowerCount).toBe(1);
    expect(registry.reviveCircleCount).toBe(1);
    registry.dispose();
  });

  it("a circle carries NO overhead bar — its progress is painted in the world", () => {
    cover("revive-view-dispatch");
    expect(hasOverheadBar(KIND_REVIVE_CIRCLE)).toBe(false);
    expect(hasOverheadBar(0)).toBe(true); // sanity: the rule is not vacuous
  });

  it("the rim fill tracks the wire progress, and the ring is sized from the wire radius", () => {
    cover("revive-view-dispatch");
    const view = new ReviveCircleView(scene);
    view.activate(9, 2, 3.5);
    expect(view.root.scaling.x).toBe(3.5); // authoritative radius, not a constant
    expect(view.root.scaling.z).toBe(3.5);

    view.update(0, { progress: 0, lifeLeft: 1, channelling: false, contested: false });
    expect(view.litCount).toBe(0);
    view.update(0, { progress: 0.5, lifeLeft: 1, channelling: true, contested: false });
    expect(view.litCount).toBe(TONGUE_COUNT / 2);
    view.update(0, { progress: 1, lifeLeft: 0.05, channelling: true, contested: false });
    expect(view.litCount).toBe(TONGUE_COUNT);
    // decay walks it back down (a sidestep is visible, not a silent reset)
    view.update(0, { progress: 0.25, lifeLeft: 0.05, channelling: false, contested: false });
    expect(view.litCount).toBe(TONGUE_COUNT / 4);
    view.dispose();
  });

  it("keeps the ember system inside its capacity cap in every state", () => {
    cover("revive-view-dispatch");
    const view = new ReviveCircleView(scene, "mobile");
    view.activate(1, 0, 2);
    const cap = view.emberSystem.getCapacity();
    for (const channelling of [true, false]) {
      view.update(500, { progress: 0.7, lifeLeft: 0.5, channelling, contested: false });
      expect(view.emberSystem.emitRate).toBeGreaterThan(0);
      expect(view.emberSystem.emitRate).toBeLessThanOrEqual(cap);
    }
    view.dispose();
  });
});
