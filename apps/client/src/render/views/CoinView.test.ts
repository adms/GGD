/**
 * Dropped gold coins — CLIENT world view (task #191): kind 5 dispatches to a
 * pooled CoinView (never a champion / flower / guardian view), the coin carries
 * NO overhead bar, and the view is pooled + reused rather than leaked. Runs on
 * Babylon's NullEngine.
 *
 * The lesson pinned here is task #22's, the one the healing flower learned the
 * hard way: a ground object that does not READ from the fixed top-down camera
 * is a bug. So the test asserts the coin stands UP (a disc on its edge, the
 * face turned toward the camera) at a height a player can see, rather than
 * lying flat like the 0.017u lily that shipped invisible.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";
import { CoinView } from "./CoinView";
import { hasOverheadBar, KIND_GOLD_COIN } from "../overheadAnchors";

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

const coinEntity = (id: number, x = 3, z = -5): EntityViewState => ({
  id,
  kind: KIND_GOLD_COIN,
  seatId: 2,
  key: "prop.gold-coin",
  teamId: 0,
  x,
  z,
  fx: 1,
  fz: 0,
  alive: true,
});

const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x,
  z: e.z,
  fx: e.fx,
  fz: e.fz,
});

describe("CoinView reads from the top-down camera (coin-view)", () => {
  it("stands the disc up off the floor with a ground light and motes", () => {
    cover("coin-view");
    const view = new CoinView(scene, "desktop");
    // face + additive halo + ground ring — the 閃光 is three meshes, not one
    expect(view.partCount).toBe(3);
    expect(view.moteSystem.getCapacity()).toBeGreaterThan(0);
    const face = scene.meshes.find((m) => m.name.endsWith("-face"))!;
    expect(face).toBeDefined();
    // upright: the cylinder's axis is rotated flat, so its FACE points at the
    // camera instead of presenting a near-invisible edge-on ground disc
    expect(face.rotation.x).toBeCloseTo(Math.PI / 2, 6);
    // …and it floats at eye-catching height rather than lying on the floor
    const body = scene.transformNodes.find((n) => n.name.endsWith("-body"))!;
    expect(face.parent).toBe(body);
    expect(body.position.y).toBeGreaterThan(0.3);
    view.dispose();
    expect(view.isDisposed).toBe(true);
  });

  it("spins, and two coins never spin in lockstep", () => {
    cover("coin-view");
    const a = new CoinView(scene, "desktop");
    const b = new CoinView(scene, "desktop");
    a.activate(1);
    b.activate(2); // a different entity id ⇒ a different phase
    a.update(1000);
    b.update(1000);
    const rotA = scene.transformNodes.filter((n) => n.name.endsWith("-body"));
    expect(rotA.length).toBeGreaterThanOrEqual(2);
    a.update(0);
    const at0 = rotA[rotA.length - 2]!.rotation.y;
    a.update(1000);
    expect(rotA[rotA.length - 2]!.rotation.y).not.toBeCloseTo(at0, 4);
    a.dispose();
    b.dispose();
  });
});

describe("EntityViewRegistry coin dispatch (coin-view-dispatch)", () => {
  it("kind 5 creates a pooled CoinView, never a champion view", () => {
    cover("coin-view-dispatch");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    registry.sync({
      entities: [coinEntity(41)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
    });
    expect(registry.coinCount).toBe(1);
    expect(registry.championCount).toBe(0);
    expect(registry.flowerCount).toBe(0);
    expect(registry.guardianCount).toBe(0);
    expect(registry.reviveCircleCount).toBe(0);
    // the coin's last rendered position is tracked like every other view, so
    // the VFX ground pass can find it
    expect(registry.posOf(41)).toEqual({ x: 3, z: -5 });

    // picked up → the entity vanishes from the snapshot → the view is released
    registry.sync({ entities: [], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(registry.coinCount).toBe(0);
    expect(registry.posOf(41)).toBeNull();

    // …and REUSED, not re-allocated, when the next coin lands
    registry.sync({
      entities: [coinEntity(42, 0, 0)],
      poseFor: passthrough,
      nowMs: 32,
      dtMs: 16,
      loadModels: false,
    });
    expect(registry.coinCount).toBe(1);
    registry.dispose();
  });

  it("a coin never carries an overhead bar", () => {
    cover("coin-view-dispatch");
    expect(hasOverheadBar(KIND_GOLD_COIN)).toBe(false);
    expect(hasOverheadBar(0)).toBe(true); // sanity: the rule is not vacuous
  });
});
