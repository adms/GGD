/**
 * The shop's idle performance, END TO END — on real Babylon objects under a
 * NullEngine, plus the two seams a scene test alone cannot reach.
 *
 * owner 2026-07-27: 「在商店 shop 時，玩家角色會隨機輪播動作跟語音」.
 *
 * WHAT THIS FILE EXISTS TO CATCH. The standing failure mode on this project is
 * a feature that is "done" but that the player never receives. For this feature
 * the four ways that could happen are all pinned below, deliberately:
 *
 *   ① the clip is chosen but never PLAYED       → assert on the live
 *                                                  AnimationGroup's isPlaying
 *   ② the kind is computed but never DELIVERED  → assert the scene calls
 *                                                  onPerform, AND that
 *                                                  IntermissionStage wires it
 *                                                  to the voice layer at all
 *   ③ the loop is never DUE                     → drive real frames on a
 *                                                  controlled clock and assert
 *                                                  a performance actually fires
 *   ④ the hero is left STUCK                    → assert idle resumes, and that
 *                                                  a rig with no clip still
 *                                                  moves (the nod) and comes
 *                                                  back to its grounded height
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { AssetManager } from "../AssetManager";
import { IntermissionScene, type IntermissionSceneOptions } from "./IntermissionScene";
import {
  FIRST_PERFORM_SEC,
  PERFORM_GAP_MAX_SEC,
  type PerformKind,
  type PerformOption,
} from "./idlePerform";

// --- OffscreenCanvas 2D stub (the dust motes need a DynamicTexture) ---------
class StubGradient {
  addColorStop(): void {}
}
class StubCtx {
  fillStyle: unknown = "";
  globalAlpha = 1;
  createRadialGradient(): StubGradient {
    return new StubGradient();
  }
  createLinearGradient(): StubGradient {
    return new StubGradient();
  }
  clearRect(): void {}
  fillRect(): void {}
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(4) };
  }
  putImageData(): void {}
}
class StubCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): StubCtx {
    return new StubCtx();
  }
}
if (!("OffscreenCanvas" in globalThis)) {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = StubCanvas;
}

interface ScenePrivate {
  championRoot: TransformNode | null;
  championGroups: AnimationGroup[];
  championIdle: AnimationGroup | null;
  championReaction: AnimationGroup | null;
  championPulse: { start: number; dur: number; amp: number; lift: number } | null;
  championBaseScale: number;
  championBaseY: number;
  performPool: PerformOption[];
  performIndex: number;
  nextPerformAt: number;
  frame(): void;
}

function makeScene(extra: Partial<IntermissionSceneOptions> = {}): IntermissionScene {
  return new IntermissionScene(null as unknown as HTMLCanvasElement, {
    engineFactory: () => new NullEngine() as unknown as Engine,
    autoStart: false,
    now: () => 0,
    ...extra,
  });
}

/**
 * A REAL, playable AnimationGroup. `new AnimationGroup(name)` with no
 * targeted animations reports `isPlaying === false` even after `play()`, so an
 * empty group cannot tell "the clip was chosen" from "the clip was played" —
 * which is precisely failure shape ①. Every group here owns one keyframed
 * animation on a throwaway node, so `isPlaying` means what it says.
 */
function playableGroup(name: string, scene: IntermissionScene): AnimationGroup {
  const target = new TransformNode(`t-${name}`, scene.scene);
  const anim = new Animation(`a-${name}`, "position.x", 30, Animation.ANIMATIONTYPE_FLOAT);
  anim.setKeys([
    { frame: 0, value: 0 },
    { frame: 30, value: 1 },
  ]);
  const group = new AnimationGroup(name, scene.scene);
  group.addTargetedAnimation(anim, target);
  return group;
}

/** Install a hero with the given clip names; returns the live groups. */
function giveChampion(
  s: IntermissionScene,
  names: string[],
  idleName: string,
): { priv: ScenePrivate; groups: AnimationGroup[] } {
  const priv = s as unknown as ScenePrivate;
  const groups = names.map((n) => playableGroup(n, s));
  priv.championRoot = new TransformNode("im-champion", s.scene);
  priv.championGroups = groups;
  priv.championIdle = groups.find((g) => g.name === idleName) ?? null;
  priv.championIdle?.play(true);
  return { priv, groups };
}

describe("shop idle performance — the hero actually performs", () => {
  it("plays one of his OWN clips, and the clip is really running", () => {
    cover("shop-idle-perform");
    const s = makeScene({ performRand: () => 0.5 });
    const { priv, groups } = giveChampion(s, ["Stand", "cheer", "Attack"], "Stand");
    // the pool is what the scene resolves from the .glb names; inject it the
    // way setChampion would (headless cannot fetch a model)
    priv.performPool = [
      { clip: "cheer", kind: "celebrate" },
      { clip: "Attack", kind: "attack" },
    ];

    const kind = s.performOnce();

    expect(kind === "celebrate" || kind === "attack").toBe(true);
    const played = groups.find((g) => g.name === (kind === "celebrate" ? "cheer" : "Attack"))!;
    expect(played.isPlaying, "the chosen clip was never actually played").toBe(true);
    expect(priv.championReaction).toBe(played);
    // the resting idle yielded the body to it
    expect(priv.championIdle!.isPlaying).toBe(false);
    expect(priv.championPulse).toBeNull(); // no fallback nod when a clip exists
    s.dispose();
  });

  it("hands the body back to idle when the performance ends", () => {
    cover("shop-idle-perform");
    const s = makeScene({ performRand: () => 0.5 });
    const { priv, groups } = giveChampion(s, ["Stand", "cheer"], "Stand");
    priv.performPool = [{ clip: "cheer", kind: "celebrate" }];

    s.performOnce();
    const cheer = groups.find((g) => g.name === "cheer")!;
    expect(cheer.isPlaying).toBe(true);
    // …the clip reaching its end is what returns the hero to his idle
    cheer.onAnimationGroupEndObservable.notifyObservers(cheer);
    expect(priv.championReaction).toBeNull();
    expect(priv.championIdle!.isPlaying, "the hero never went back to idle").toBe(true);
    s.dispose();
  });

  it("REPORTS every performance to the caller — the voice hook", () => {
    cover("shop-idle-perform-voice");
    // failure shape ②: the action happens on screen and the line never fires.
    const seen: PerformKind[] = [];
    const s = makeScene({ performRand: () => 0.5, onPerform: (k) => seen.push(k) });
    const { priv } = giveChampion(s, ["Stand", "cheer", "Attack"], "Stand");
    priv.performPool = [
      { clip: "cheer", kind: "celebrate" },
      { clip: "Attack", kind: "attack" },
    ];
    s.performOnce();
    s.performOnce();
    expect(seen).toHaveLength(2);
    // and the kind reported is the kind of the clip that played — the pairing
    // in shopPerformVoice is keyed on it
    expect(seen.every((k) => k === "celebrate" || k === "attack")).toBe(true);
    s.dispose();
  });

  it("never repeats the same performance twice running", () => {
    cover("shop-idle-perform");
    const s = makeScene({ performRand: () => 0.5 });
    const { priv } = giveChampion(s, ["Stand", "cheer", "Attack", "Spell"], "Stand");
    priv.performPool = [
      { clip: "cheer", kind: "celebrate" },
      { clip: "Attack", kind: "attack" },
      { clip: "Spell", kind: "spell" },
    ];
    let last: string | null = null;
    for (let i = 0; i < 12; i++) {
      s.performOnce();
      const now = priv.championReaction?.name ?? null;
      expect(now, "a performance repeated back-to-back").not.toBe(last);
      last = now;
    }
    s.dispose();
  });
});

describe("shop idle performance — it becomes due on its own", () => {
  /**
   * Failure shape ③: everything above passes when `performOnce` is CALLED, and
   * the player still sees a statue because nothing ever calls it. This drives
   * the scene's real frame loop on a controlled clock.
   */
  it("fires from the render loop after the authored delay, and repeats", () => {
    cover("shop-idle-perform");
    let now = 0;
    const seen: PerformKind[] = [];
    const s = makeScene({ now: () => now, performRand: () => 0.5, onPerform: (k) => seen.push(k) });
    const { priv } = giveChampion(s, ["Stand", "cheer", "Attack"], "Stand");
    priv.performPool = [
      { clip: "cheer", kind: "celebrate" },
      { clip: "Attack", kind: "attack" },
    ];
    priv.nextPerformAt = FIRST_PERFORM_SEC;

    // …run ~35 s of a 40 s shop at 20 ms per frame (the scene's own soft fps cap
    // rejects anything faster), ending each clip as it finishes so the next one
    // can be due — exactly what the observable does in the browser.
    const step = 20;
    for (let t = 0; t < 35_000; t += step) {
      now = t;
      priv.frame();
      const live = priv.championReaction;
      if (live) live.onAnimationGroupEndObservable.notifyObservers(live);
    }

    expect(seen.length, "the shop ran for 35 s and the hero never performed").toBeGreaterThan(0);
    // 3–5 in a 40 s visit is the authored cadence; 35 s at the mid gap is 3–4
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.length).toBeLessThanOrEqual(5);
    s.dispose();
  });

  it("does not perform before the entry beat is over", () => {
    cover("shop-idle-perform");
    let now = 0;
    const seen: PerformKind[] = [];
    const s = makeScene({ now: () => now, performRand: () => 0.5, onPerform: (k) => seen.push(k) });
    const { priv } = giveChampion(s, ["Stand", "cheer"], "Stand");
    priv.performPool = [{ clip: "cheer", kind: "celebrate" }];
    priv.nextPerformAt = FIRST_PERFORM_SEC;
    // the camera ease is 900 ms; run 2 s of frames — the merchant's greeting
    // must not be stepped on
    for (let t = 0; t < 2_000; t += 20) {
      now = t;
      priv.frame();
    }
    expect(seen).toEqual([]);
    s.dispose();
  });

  it("a purchase pushes the next performance out instead of stacking on it", () => {
    cover("shop-idle-perform");
    // the one place the two systems collide: the buy quip and a performance
    // line would otherwise be able to land in the same beat.
    const s = makeScene({ performRand: () => 0.5 });
    const { priv } = giveChampion(s, ["Stand", "cheer"], "Stand");
    priv.performPool = [{ clip: "cheer", kind: "celebrate" }];
    priv.nextPerformAt = 0.1; // due almost immediately

    s.playChampionReaction({ celebratoryOnly: true });

    expect(priv.nextPerformAt).toBeGreaterThan(0.1);
    expect(priv.nextPerformAt).toBeLessThanOrEqual(PERFORM_GAP_MAX_SEC);
    s.dispose();
  });

  it("never cuts into a performance / reaction that is still running", () => {
    cover("shop-idle-perform");
    // The belt to the purchase-reschedule's braces. If a one-shot's end
    // observable never arrives (a stalled engine, a clip with no keyframes) the
    // due tick must RE-ARM, not stop the running clip and start another —
    // otherwise the hero twitches through a new pose every gap and, worse, a
    // performance can talk straight over the purchase quip.
    let now = 0;
    const seen: PerformKind[] = [];
    const s = makeScene({ now: () => now, performRand: () => 0.5, onPerform: (k) => seen.push(k) });
    const { priv, groups } = giveChampion(s, ["Stand", "cheer", "Attack"], "Stand");
    priv.performPool = [
      { clip: "cheer", kind: "celebrate" },
      { clip: "Attack", kind: "attack" },
    ];
    // a reaction is mid-flight and will never report its end
    const held = groups.find((g) => g.name === "cheer")!;
    priv.championReaction = held;
    priv.nextPerformAt = 0.1;

    for (let t = 0; t < 30_000; t += 20) {
      now = t;
      priv.frame();
    }
    expect(priv.championReaction, "a due performance stole the body mid-clip").toBe(held);
    expect(seen, "a performance fired while another was still running").toEqual([]);
    // …and it kept re-arming rather than latching to "due" forever
    expect(priv.nextPerformAt).toBeGreaterThan(0.1);
    s.dispose();
  });

  it("stops dead once the scene is disposed", () => {
    cover("shop-idle-perform");
    const seen: PerformKind[] = [];
    const s = makeScene({ performRand: () => 0.5, onPerform: (k) => seen.push(k) });
    const { priv } = giveChampion(s, ["Stand", "cheer"], "Stand");
    priv.performPool = [{ clip: "cheer", kind: "celebrate" }];
    s.dispose();
    expect(s.performOnce()).toBeNull();
    expect(seen).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE PRODUCTION SEAM: setChampion
// ---------------------------------------------------------------------------

/**
 * A real, playable AssetContainer whose animation groups carry a REAL rig's
 * clip names — the one input `setChampion` actually receives in the browser.
 *
 * Everything above this line injects `priv.performPool` and `priv.championIdle`
 * by hand, which is fine for testing what the scene DOES with a pool but proves
 * nothing about where the pool comes from. `setChampion` is the only production
 * line that turns .glb clip names into a rotation, and it was reachable by no
 * test at all: `this.performPool = []` and reverting the idle pick to main's
 * `groups.find(/idle|stand/)` both left the whole suite green while the feature
 * silently died on screen.
 *
 * NOTE the `im-` prefix on every asserted name: `place()` instantiates the
 * container with `(n) => \`im-${n}\``, so the names the rule actually sees in
 * production are prefixed. Asserting the prefixed names is deliberate — it is
 * what the shipped code compares against.
 */
function makeRigContainer(scene: Scene, clipNames: readonly string[]): AssetContainer {
  const container = new AssetContainer(scene);
  const rig = new TransformNode("rig", scene);
  container.rootNodes.push(rig);
  container.transformNodes.push(rig);
  for (const name of clipNames) {
    const anim = new Animation(`a-${name}`, "position.x", 30, Animation.ANIMATIONTYPE_FLOAT);
    anim.setKeys([
      { frame: 0, value: 0 },
      { frame: 30, value: 1 },
    ]);
    const group = new AnimationGroup(name, scene);
    group.addTargetedAnimation(anim, rig);
    container.animationGroups.push(group);
  }
  return container;
}

/** An AssetManager that hands `setChampion` one prepared rig. */
function rigAssets(container: AssetContainer): AssetManager {
  return {
    load: () => Promise.resolve(container),
  } as unknown as AssetManager;
}

/**
 * Two REAL rigs, verbatim from their .glb `animations[]` (parse them yourself
 * with idlePerform.test.ts's `glbAnimationNames`). Both are picked because they
 * break a DIFFERENT naive rule:
 *
 *  • sesshomaru lists its alternate pose FIRST, so "the first /idle|stand/
 *    match" rests 犬妖-殺生丸 in "Stand - 2" (29 of 115 champions change idle
 *    under that rule; this is the canonical one).
 *  • heromusashimiyamoto lists "Attack Walk Stand Spin" — a walk/attack
 *    composite — BEFORE its clean "Stand" AND before its clean "Attack", so it
 *    is both the first /stand/ match and an early attack-tier candidate. It is
 *    the rig that proves the unshowable-clip ban is load-bearing rather than
 *    shadowed by the per-kind cap.
 */
const SESSHOMARU_CLIPS = [
  "Stand - 2",
  "Attack",
  "Attack Slam",
  "Death",
  "Walk",
  "Stand",
  "Attack 2",
  "Dissipate",
] as const;
const MUSASHI_CLIPS = [
  "Spell",
  "Death",
  "Walk",
  "Dissipate",
  "Attack Walk Stand Spin",
  "Stand",
  "Stand 2",
  "Stand Ready",
  "Attack",
  "Attack Slam",
  "Attack 2",
  "Spell Slam",
] as const;

describe("shop idle performance — the production seam (setChampion)", () => {
  it("builds a REAL rotation from a real rig's clips — not an empty pool", async () => {
    cover("shop-idle-perform");
    const s = makeScene({ performRand: () => 0.5 });
    const container = makeRigContainer(s.scene, MUSASHI_CLIPS);
    (s as unknown as { assets: AssetManager }).assets = rigAssets(container);

    await s.setChampion("assets/models/champions/heromusashimiyamoto.glb", 1);

    const priv = s as unknown as ScenePrivate;
    // ① the pool is POPULATED — `this.performPool = []` dies here
    expect(priv.performPool.length, "setChampion produced no rotation at all").toBeGreaterThan(0);
    // ② …and it is the RIGHT pool: two poses, two spells, two swings, capped
    expect(priv.performPool).toEqual([
      { clip: "im-Stand 2", kind: "pose" },
      { clip: "im-Stand Ready", kind: "pose" },
      { clip: "im-Spell", kind: "spell" },
      { clip: "im-Spell Slam", kind: "spell" },
      { clip: "im-Attack", kind: "attack" },
      { clip: "im-Attack Slam", kind: "attack" },
    ]);
    // ③ every entry names a clip this rig really owns, or performOnce nods
    const live = new Set(priv.championGroups.map((g) => g.name));
    for (const option of priv.performPool) expect(live.has(option.clip)).toBe(true);
    // ④ …and the first performance is ARMED, not left at ∞
    expect(priv.nextPerformAt).toBeCloseTo(FIRST_PERFORM_SEC, 6);
    s.dispose();
  });

  it("the rotation it built actually RUNS a clip on the render loop", async () => {
    cover("shop-idle-perform");
    // The pool assertions above are state; this is the behaviour. An empty pool
    // does not crash — it degrades to the nod — so "the hero still moves" is NOT
    // enough. What must be true is that he moves by playing one of HIS clips.
    let now = 0;
    const seen: PerformKind[] = [];
    const s = makeScene({ now: () => now, performRand: () => 0.5, onPerform: (k) => seen.push(k) });
    (s as unknown as { assets: AssetManager }).assets = rigAssets(
      makeRigContainer(s.scene, MUSASHI_CLIPS),
    );
    await s.setChampion("assets/models/champions/heromusashimiyamoto.glb", 1);
    const priv = s as unknown as ScenePrivate;

    const played: string[] = [];
    for (let t = 0; t < 20_000; t += 20) {
      now = t;
      priv.frame();
      const live = priv.championReaction;
      if (live) {
        played.push(live.name);
        live.onAnimationGroupEndObservable.notifyObservers(live);
      }
    }

    expect(seen.length, "a real rig stood still for 20 s").toBeGreaterThan(0);
    expect(seen, "every performance degraded to the procedural nod").not.toContain("nod");
    const poolClips = priv.performPool.map((p) => p.clip);
    expect(new Set(played).size).toBeGreaterThan(0);
    for (const name of played) expect(poolClips).toContain(name);
    s.dispose();
  });

  it("rests the hero in his BASE stand at the seam, not the first /stand/ match", async () => {
    cover("shop-idle-perform");
    // REGRESSION GUARD. `pickIdleClip` is unit-tested next door, but the defect
    // it fixes lives on the CALL SITE: reverting this one line of setChampion to
    // main's `groups.find((g) => /idle|stand/i.test(g.name))` used to leave every
    // test in the repo green while 29 of 115 champions changed pose.
    for (const clips of [SESSHOMARU_CLIPS, MUSASHI_CLIPS]) {
      const s = makeScene({ performRand: () => 0.5 });
      (s as unknown as { assets: AssetManager }).assets = rigAssets(
        makeRigContainer(s.scene, clips),
      );
      await s.setChampion("assets/models/champions/rig.glb", 1);
      const priv = s as unknown as ScenePrivate;

      expect(priv.championIdle?.name, `wrong resting pose for [${clips.join(", ")}]`).toBe(
        "im-Stand",
      );
      expect(priv.championIdle?.isPlaying, "the resting clip is not looping").toBe(true);
      // …and only that one: every other clip was stopped before it started
      const running = priv.championGroups.filter((g) => g.isPlaying).map((g) => g.name);
      expect(running).toEqual(["im-Stand"]);
      // the rotation inherits the choice — it must not offer the pose he holds
      expect(priv.performPool.map((p) => p.clip)).not.toContain("im-Stand");
      s.dispose();
    }
  });

  it("refuses the walking composite at the seam, in BOTH slots", async () => {
    cover("shop-idle-perform");
    // The unshowable-clip ban, on the real production path. "Attack Walk Stand
    // Spin" is the first /stand/ match on this rig (so it reached the resting
    // slot) AND an attack-tier match that appears at index 4, BEFORE the clean
    // "Attack" at index 8 (so the per-kind cap cannot be what keeps it out).
    const s = makeScene({ performRand: () => 0.5 });
    (s as unknown as { assets: AssetManager }).assets = rigAssets(
      makeRigContainer(s.scene, MUSASHI_CLIPS),
    );
    await s.setChampion("assets/models/champions/heromusashimiyamoto.glb", 1);
    const priv = s as unknown as ScenePrivate;

    expect(priv.championIdle?.name).not.toBe("im-Attack Walk Stand Spin");
    expect(priv.performPool.map((p) => p.clip)).not.toContain("im-Attack Walk Stand Spin");
    // …and it is genuinely reachable: the swings that DID fill the attack slots
    // are listed AFTER it, so only the ban stands between it and the rotation
    const order = MUSASHI_CLIPS.map((n) => `im-${n}`);
    const attacks = priv.performPool.filter((p) => p.kind === "attack");
    expect(attacks.length).toBeGreaterThan(0);
    for (const a of attacks) {
      expect(order.indexOf(a.clip)).toBeGreaterThan(order.indexOf("im-Attack Walk Stand Spin"));
    }
    s.dispose();
  });

  it("a champion SWAP re-derives the rotation instead of keeping the old hero's", async () => {
    cover("shop-idle-perform");
    // setChampion is called again whenever the HUD's champion changes; a pool
    // left over from the previous rig names clips this one does not own, and
    // every performance would silently degrade to the nod.
    const s = makeScene({ performRand: () => 0.5 });
    const priv = s as unknown as ScenePrivate;
    const box = { current: makeRigContainer(s.scene, MUSASHI_CLIPS) };
    (s as unknown as { assets: AssetManager }).assets = {
      load: () => Promise.resolve(box.current),
    } as unknown as AssetManager;

    await s.setChampion("assets/models/champions/heromusashimiyamoto.glb", 1);
    expect(priv.performPool.map((p) => p.clip)).toContain("im-Spell");
    priv.performIndex = 3; // mid-rotation on the old hero

    box.current = makeRigContainer(s.scene, SESSHOMARU_CLIPS);
    await s.setChampion("assets/models/champions/sesshomaru.glb", 1);

    expect(priv.performPool).toEqual([
      { clip: "im-Stand - 2", kind: "pose" },
      { clip: "im-Attack", kind: "attack" },
      { clip: "im-Attack Slam", kind: "attack" },
    ]);
    expect(priv.performIndex, "the new hero inherited the old one's cursor").toBe(-1);
    const live = new Set(priv.championGroups.map((g) => g.name));
    for (const option of priv.performPool) expect(live.has(option.clip)).toBe(true);
    s.dispose();
  });
});

describe("shop idle performance — graceful degradation", () => {
  it("a hero with NO rotatable clip still moves, and lands back on the floor", () => {
    cover("shop-idle-perform");
    // failure shape ④, and the #111 regression in one: 皮卡丘's bind box dips to
    // y = −0.58, so he is LIFTED onto the paving. A pulse that sprang back to a
    // hard-coded 0 would bury him — and the rotation fires this several times a
    // visit, not once per purchase.
    let now = 0;
    const seen: PerformKind[] = [];
    const s = makeScene({ now: () => now, performRand: () => 0.5, onPerform: (k) => seen.push(k) });
    const { priv } = giveChampion(s, ["Stand"], "Stand");
    priv.performPool = []; // nothing legible — the census's worst case
    const GROUNDED_Y = 0.58;
    priv.championRoot!.position.y = GROUNDED_Y;
    priv.championBaseY = GROUNDED_Y;
    priv.championBaseScale = 1.4;
    priv.championRoot!.scaling.setAll(1.4);

    expect(s.performOnce()).toBe("nod");
    expect(seen).toEqual(["nod"]); // still speaks: an action, not silence
    expect(priv.championPulse).not.toBeNull();

    // 50 ms steps: the scene clamps per-frame dt at MAX_DT (0.1 s) so a hidden
    // tab cannot fast-forward it, which means big jumps advance `elapsed` more
    // slowly than wall-clock. Step small enough that the clamp never bites.
    for (let t = 0; t <= 200; t += 50) {
      now = t;
      priv.frame();
    }
    // mid-arch: he is visibly doing something, and doing it ABOVE the floor
    expect(priv.championRoot!.scaling.x).toBeGreaterThan(1.4);
    expect(priv.championRoot!.position.y).toBeGreaterThan(GROUNDED_Y);

    for (let t = 250; t <= 1400; t += 50) {
      now = t;
      priv.frame();
    }
    expect(priv.championPulse).toBeNull();
    expect(priv.championRoot!.scaling.x).toBeCloseTo(1.4, 6);
    expect(priv.championRoot!.position.y, "the nod sank the hero into the paving").toBeCloseTo(
      GROUNDED_Y,
      6,
    );
    s.dispose();
  });

  it("the idle nod is gentler than the purchase pop", () => {
    cover("shop-idle-perform");
    // it fires 3–5× a visit; a full squash-hop that often reads as a bouncing toy
    const s = makeScene({ performRand: () => 0.5 });
    const { priv } = giveChampion(s, ["Stand"], "Stand");
    priv.performPool = [];
    s.performOnce();
    const nod = priv.championPulse!;
    priv.championPulse = null;
    s.playChampionReaction();
    const pop = priv.championPulse!;
    expect(nod.amp).toBeLessThan(pop.amp);
    expect(nod.lift).toBeLessThan(pop.lift);
    s.dispose();
  });

  it("a pool entry whose clip has vanished degrades to the nod, never throws", () => {
    cover("shop-idle-perform");
    const s = makeScene({ performRand: () => 0.5 });
    const { priv } = giveChampion(s, ["Stand"], "Stand");
    priv.performPool = [{ clip: "NotOnThisRig", kind: "celebrate" }];
    expect(s.performOnce()).toBe("nod");
    expect(priv.championPulse).not.toBeNull();
    s.dispose();
  });

  it("no hero in frame at all is a silent no-op", () => {
    cover("shop-idle-perform");
    const seen: PerformKind[] = [];
    const s = makeScene({ onPerform: (k) => seen.push(k) });
    expect(s.performOnce()).toBeNull();
    expect(seen).toEqual([]);
    s.dispose();
  });
});

/**
 * THE WIRING. The scene emits a kind; something has to turn that into a voice.
 * A NullEngine test can never see that seam — `IntermissionStage.tsx` is a
 * React component and this suite only runs `src/**\/*.test.ts` — so it is
 * asserted at source level, the same way settlementStay.test.ts pins its
 * navigation rule. Without this, deleting the `onPerform` argument leaves every
 * other test in this file green and the shop silent.
 */
describe("shop idle performance — the voice is actually wired up", () => {
  const STAGE = join(__dirname, "../../ui/IntermissionStage.tsx");
  const code = (): string =>
    readFileSync(STAGE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  it("IntermissionStage passes onPerform into the scene and it reaches the voice layer", () => {
    cover("shop-idle-perform-voice");
    const c = code();
    expect(c).toContain("playShopPerformVoice");
    // the callback must be handed to the scene, not merely imported
    expect(c).toMatch(/onPerform\s*:\s*\(/);
    // …and it must speak for the CURRENT champion, not a stale closure capture
    expect(c).toMatch(/playShopPerformVoice\(\s*championIdRef\.current/);
  });

  it("the champion ref is kept fresh, or every line would be mute", () => {
    cover("shop-idle-perform-voice");
    // The scene is built once per intermission; championId arrives later. A
    // constructor closure over it would pin "" for the whole visit — the action
    // would play and nothing would ever be said.
    const c = code();
    expect(c).toMatch(/championIdRef\.current\s*=\s*championId/);
  });
});
