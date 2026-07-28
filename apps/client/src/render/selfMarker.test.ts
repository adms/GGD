/**
 * GUARD — 「玩家自己角色可否更顯眼」 (owner, 2026-07-28, task #268).
 *
 * WHAT WAS ACTUALLY MISSING, and why this file asserts on Babylon nodes rather
 * than on a pure function: the defect was not "the highlight is too subtle", it
 * was that THERE WAS NO SELF HIGHLIGHT IN THE 3D SCENE AT ALL. The local
 * champion's only distinction was a bold NAME in the DOM overlay; the team ring
 * under its feet is the identical torus in the identical colour on all three
 * members of your team. So the thing that has to be proved is that geometry
 * exists, is enabled, and is somewhere a camera can see it — which means
 * driving the real `EntityViewRegistry` on Babylon's NullEngine, exactly as
 * `EntityViewRegistry.test.ts` already does.
 *
 * THE TWO FAILURE SHAPES THIS IS AIMED AT:
 *   ① 「畫在畫面外或地板下」 — a ground mark z-fighting the floor or a caret
 *      buried inside the model is indistinguishable from no marker at all, so
 *      the heights are asserted against the OTHER ground marks and against the
 *      #150 normalised champion height, not against a magic number.
 *   ⑤ 「受測的東西不是出貨的東西」 — nothing here constructs a ChampionView by
 *      hand; every marker in this file got there through `registry.sync`, the
 *      same call GameApp makes every frame.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { ChampionView, TARGET_HEIGHT } from "./views/ChampionView";
import { AssetManager } from "./AssetManager";

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

const champ = (id: number, opts: Partial<EntityViewState> = {}): EntityViewState => ({
  id,
  kind: 0,
  seatId: 0,
  key: "champ.sela",
  teamId: 1,
  x: 0,
  z: 0,
  fx: 1,
  fz: 0,
  alive: true,
  ...opts,
});

const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x,
  z: e.z,
  fx: e.fx,
  fz: e.fz,
});

function syncOnce(
  registry: EntityViewRegistry,
  entities: EntityViewState[],
  nowMs = 0,
): void {
  registry.sync({ entities, poseFor: passthrough, nowMs, dtMs: 16, loadModels: false });
}

describe("self marker (task #268)", () => {
  it("the LOCAL champion gets a marker and the others do not", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    syncOnce(registry, [champ(1, { isLocal: true }), champ(2), champ(3, { x: 4 })]);

    const mine = registry.getChampionView(1)!;
    expect(mine.hasSelfMarker).toBe(true);
    expect(mine.isSelfMarked).toBe(true);
    // …and eleven other bodies never even allocate the meshes.
    expect(registry.getChampionView(2)!.hasSelfMarker).toBe(false);
    expect(registry.getChampionView(3)!.hasSelfMarker).toBe(false);
    registry.dispose();
  });

  it("an entity with NO isLocal flag is not marked — the default is 'not mine'", () => {
    // Every pre-#268 caller and every fixture omits the field. Absent must read
    // as false, or every champion in the match would wear the halo.
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    syncOnce(registry, [champ(1)]);
    expect(registry.getChampionView(1)!.isSelfMarked).toBe(false);
    registry.dispose();
  });

  it("the marker is REAL geometry, enabled, under the view's own root", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    syncOnce(registry, [champ(1, { isLocal: true })]);
    const view = registry.getChampionView(1)!;
    const meshes = view.root.getChildMeshes(false);
    const ring = meshes.find((m) => m.name.endsWith("-selfring"));
    const caret = meshes.find((m) => m.name.endsWith("-selfcaret"));
    expect(ring, "the halo ring was never built").toBeDefined();
    expect(caret, "the caret was never built").toBeDefined();
    expect(ring!.isEnabled()).toBe(true);
    expect(caret!.isEnabled()).toBe(true);
    // it must travel with the champion, not sit at the world origin
    syncOnce(registry, [champ(1, { isLocal: true, x: 12, z: -7 })], 16);
    expect(view.root.position.x).toBe(12);
    expect(ring!.getAbsolutePosition().x).toBeCloseTo(12, 5);
    registry.dispose();
  });

  it("FAILURE SHAPE ①: the ring is above every other ground mark, the caret above the head", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    syncOnce(registry, [champ(1, { isLocal: true })]);
    const meshes = registry.getChampionView(1)!.root.getChildMeshes(false);
    const ring = meshes.find((m) => m.name.endsWith("-selfring"))!;
    const caret = meshes.find((m) => m.name.endsWith("-selfcaret"))!;
    const teamRing = meshes.find((m) => m.name.endsWith("-teamring"))!;
    const shadow = meshes.find((m) => m.name.endsWith("-shadow"))!;

    // strictly above the floor, and above the two marks already down there —
    // equal heights z-fight, which on a real GPU flickers the halo in and out
    expect(ring.position.y).toBeGreaterThan(teamRing.position.y);
    expect(ring.position.y).toBeGreaterThan(shadow.position.y);
    expect(ring.position.y).toBeGreaterThan(0);

    // the caret clears the #150 normalised champion height for EVERY champion,
    // so it is derived from that constant rather than tuned to one model
    expect(caret.position.y).toBeGreaterThan(TARGET_HEIGHT);
    expect(ChampionView.SELF_CARET_Y).toBeGreaterThan(TARGET_HEIGHT);

    // and it is genuinely bigger than the team ring, or 「更顯眼」 is unmet
    expect(ChampionView.SELF_RING_DIAMETER).toBeGreaterThan(1.25);
    registry.dispose();
  });

  it("the caret bobs — and never sinks below the head while it does", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const P = ChampionView.SELF_CARET_PERIOD_MS;
    syncOnce(registry, [champ(1, { isLocal: true })], 0);
    const caret = registry
      .getChampionView(1)!
      .root.getChildMeshes(false)
      .find((m) => m.name.endsWith("-selfcaret"))!;

    const ys: number[] = [];
    for (const t of [0, P / 4, P / 2, (P * 3) / 4]) {
      syncOnce(registry, [champ(1, { isLocal: true })], t);
      ys.push(caret.position.y);
    }
    // it actually moves (a frozen caret reads as a stuck decal)…
    expect(new Set(ys.map((y) => y.toFixed(4))).size).toBeGreaterThan(1);
    // …and the whole travel stays clear of the champion's head
    for (const y of ys) expect(y).toBeGreaterThan(TARGET_HEIGHT);
    registry.dispose();
  });

  it("a DEAD local champion loses the marker, and gets it back on respawn", () => {
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    syncOnce(registry, [champ(1, { isLocal: true })]);
    const view = registry.getChampionView(1)!;
    const ring = view.root.getChildMeshes(false).find((m) => m.name.endsWith("-selfring"))!;

    syncOnce(registry, [champ(1, { isLocal: true, alive: false })], 32);
    expect(view.anim.state).toBe("death");
    expect(ring.isEnabled()).toBe(false);

    syncOnce(registry, [champ(1, { isLocal: true, alive: true })], 64);
    expect(ring.isEnabled()).toBe(true);
    registry.dispose();
  });

  it("clearing the flag hides the marker without destroying it", () => {
    // The entity id is re-issued on respawn, so a body can stop being 'mine'
    // mid-match. Hiding must be reversible and must not leak a second ring.
    cover("client-model-fallback");
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    syncOnce(registry, [champ(1, { isLocal: true })]);
    const view = registry.getChampionView(1)!;
    const rings = (): number =>
      view.root.getChildMeshes(false).filter((m) => m.name.endsWith("-selfring")).length;
    expect(rings()).toBe(1);

    syncOnce(registry, [champ(1, { isLocal: false })], 16);
    expect(view.isSelfMarked).toBe(false);
    expect(
      view.root.getChildMeshes(false).find((m) => m.name.endsWith("-selfring"))!.isEnabled(),
    ).toBe(false);

    syncOnce(registry, [champ(1, { isLocal: true })], 32);
    expect(rings()).toBe(1); // re-flagging must not build a second one
    expect(
      view.root.getChildMeshes(false).find((m) => m.name.endsWith("-selfring"))!.isEnabled(),
    ).toBe(true);
    registry.dispose();
  });
});
