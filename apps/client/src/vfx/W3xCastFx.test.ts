/**
 * w3x-cast-rig-path — the combat renderer really reaches `W3xEmitterRig`, and
 * every way that path can fail lands on a PRIMITIVE instead of on nothing.
 *
 * Why this test is shaped the way it is: the bound content (30 abilities on the
 * map's own art) was inert, and the specific way "wiring it up" can be
 * green-but-dead is that the pooled `fx.prim` path still draws SOMETHING. A
 * cast would look fine, the rig would never be built, and the authored emission
 * stream, the effect-wide budget and the per-effect lifetime would all be
 * silently unused. So these assertions are on the RIG's own counters
 * (`rigBuilt` / `liveCount` / `systemCount` / `rigTotalSystems`), never on "a
 * particle system exists somewhere".
 *
 * The other half is the two regressions this path could reintroduce:
 *   · #131 — an emitter that outlives its cast. Asserted from THREE independent
 *     directions: the rig's own duration, the hard wall-clock ceiling, and a
 *     frame loop that stops pumping `tick()` entirely.
 *   · unbounded cost — 12 champions casting the WORST promoted family at once,
 *     asserted against the real `content/vfx` docs, not a synthetic doc.
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "../render/vfx/shippedAbilityArt.testkit";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import {
  MAX_SYSTEMS_PER_EFFECT,
  SCREEN_PARTICLE_BUDGET,
  SCREEN_SYSTEM_BUDGET,
} from "../render/vfx/emitterBudget";
import { w3xAbilityArtRows, primitiveFallbackFor } from "../render/vfx/w3xAbilityArt";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { MAX_LIVE_W3X_EFFECTS, W3X_CAST_MAX_SEC, W3xCastFx } from "./W3xCastFx";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
const loadAbility = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(`content/abilities/${id}.json`), "utf8")) as Record<string, unknown>;

/** 42-04 世界終結 — the owner's named acceptance case (4 frostnova emitters). */
const PROMOTED = "godie-n003.r";
/** 42-01 凍結的大地 — kept on its primitive, so it must NOT touch the rig. */
const PLAIN = "godie-n003.q";
/** 78-04 死亡噴射肘擊 — `boomnl`, the heaviest promoted family (5 emitters). */
const WORST = "godie-u00v.r";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  for (const id of [PROMOTED, PLAIN, WORST]) {
    Abilities.register(id as AbilityId, { ...(loadAbility(id) as object), id } as never);
  }
});
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

/** The real content docs of one promoted family, in play order. */
function familyDocs(abilityId: string): VfxDoc[] {
  const art = w3xAbilityArtRows()[abilityId]!;
  return [art.primary, ...art.extra].map(loadVfx);
}

function castFx(over: Partial<ConstructorParameters<typeof W3xCastFx>[1]> = {}): W3xCastFx {
  return new W3xCastFx(scene, { createTexture: () => null, getQualityScale: () => 1, ...over });
}

/**
 * A VfxSystem over the REAL content docs. `missing` makes named ids resolve to
 * null, which is how "the art did not ship" is reproduced without deleting a
 * file.
 */
function harness(missing: (key: string) => boolean = () => false): {
  sys: VfxSystem;
  played: string[];
} {
  const played: string[] = [];
  const ctx: VfxContext = {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key: string) => {
      if (missing(key)) return null;
      try {
        const d = loadVfx(key);
        played.push(key);
        return d;
      } catch {
        return null;
      }
    },
  };
  return { sys: new VfxSystem(scene, ctx), played };
}

const cast = (abilityId: string): EventMessage =>
  ({ type: "abilityCast", data: { abilityId, caster: 1 } }) as unknown as EventMessage;

describe("the combat renderer's path to the rig (w3x-cast-rig-path)", () => {
  it("a promoted cast plays its WHOLE emitter set through the rig", () => {
    cover("w3x-cast-rig-path");
    const { sys } = harness();
    sys.handleEvent(cast(PROMOTED), 1000);
    const rig = sys.w3xCastFx;
    expect(rig.rigBuilt, "the rig was never constructed — the cast took the pooled path").toBe(true);
    expect(rig.liveCount).toBe(1);
    // 4 frostnova emitters, none merged away (they are not byte-identical)
    expect(rig.systemCount).toBe(familyDocs(PROMOTED).length);
  });

  it("an ability with no promotion never touches the rig at all", () => {
    const { sys, played } = harness();
    sys.handleEvent(cast(PLAIN), 1000);
    expect(sys.w3xCastFx.rigBuilt).toBe(false);
    expect(played).toEqual(["fx.prim.ice.shockwave"]);
  });

  it("MISSING ART degrades to the primitive the row overrode, never to nothing", () => {
    // every w3x doc withdrawn (content not rebuilt / an older contentVersion)
    const { sys, played } = harness((k) => k.startsWith("fx.w3x.") || k.startsWith("godie-"));
    sys.handleEvent(cast(PROMOTED), 1000);
    const fallback = primitiveFallbackFor(PROMOTED);
    expect(fallback).toBe("fx.prim.ice.explosion-lg");
    expect(played, "the cast drew NOTHING — the exact failure this batch removes").toContain(
      fallback,
    );
    expect(sys.w3xCastFx.liveCount).toBe(0);
  });

  it("past the concurrency cap a cast falls back instead of being dropped", () => {
    const fx = castFx({ maxLiveEffects: 2 });
    const docs = familyDocs(PROMOTED);
    expect(fx.play("frostnova", docs, 0, 1, 0, 0)).toBe(true);
    expect(fx.play("frostnova", docs, 1, 1, 0, 0)).toBe(true);
    expect(fx.play("frostnova", docs, 2, 1, 0, 0)).toBe(false);
    expect(fx.liveCount).toBe(2);
    fx.dispose();
  });

  it("no art and no finite position are both a clean FALSE, never a throw", () => {
    const fx = castFx();
    expect(fx.play("empty", [], 0, 1, 0, 0)).toBe(false);
    expect(fx.play("nan", familyDocs(PROMOTED), Number.NaN, 1, 0, 0)).toBe(false);
    expect(fx.rigBuilt, "an impossible play must not even allocate the rig").toBe(false);
    fx.dispose();
  });

  it("12 champions casting the WORST family never exceed the screen particle budget", () => {
    // Without the headroom admission this sequence plans to 19,624 particles —
    // 2.45× the cap — because `planEffectBudget` divides by the effects live at
    // that moment and each one then KEEPS its allocation. That overshoot is
    // documented in `emitterBudget` and is what this bound closes.
    const fx = castFx();
    const docs = familyDocs(WORST); // boomnl — 5 emitters, 3400 authored particles/s
    expect(docs).toHaveLength(5);
    let admitted = 0;
    for (let i = 0; i < MAX_LIVE_W3X_EFFECTS; i++) {
      if (fx.play("boomnl", docs, i, 1, 0, 0)) admitted++;
    }
    expect(admitted, "no cast at all reached the rig").toBeGreaterThan(0);
    expect(admitted, "the heaviest family was admitted 12× — the budget is not enforced").toBeLessThan(
      MAX_LIVE_W3X_EFFECTS,
    );
    expect(fx.plannedParticles).toBeLessThanOrEqual(SCREEN_PARTICLE_BUDGET);
    expect(fx.systemCount).toBeLessThanOrEqual(SCREEN_SYSTEM_BUDGET);
    // the refused casts are the caller's cue to play the primitive, not a drop
    fx.dispose();
  });

  it("the SYSTEM budget binds too — 12 × holyawakening plans 70 draw calls", () => {
    // 6 emitters × 12 casts is the family that overruns `SCREEN_SYSTEM_BUDGET`
    // (64) rather than the particle budget: 70 systems, the +9% overshoot
    // `emitterBudget` documents. The same running-total admission holds it.
    const fx = castFx();
    const docs = familyDocs("godie-e002.e"); // holyawakening, 6 emitters
    expect(docs).toHaveLength(6);
    let admitted = 0;
    for (let i = 0; i < MAX_LIVE_W3X_EFFECTS; i++) {
      if (fx.play("holyawakening", docs, i, 1, 0, 0)) admitted++;
    }
    expect(admitted).toBeGreaterThan(0);
    expect(fx.systemCount).toBeLessThanOrEqual(SCREEN_SYSTEM_BUDGET);
    fx.dispose();
  });

  it("12 champions casting a LIGHT family all get the map's art, capped by count", () => {
    // The headroom bound must not become a stealth cap on cheap effects: at 260
    // planned particles a frostnova is 3% of the budget, so all 12 fit and the
    // COUNT cap is what binds.
    const fx = castFx();
    const docs = familyDocs(PROMOTED);
    for (let i = 0; i < MAX_LIVE_W3X_EFFECTS; i++) {
      expect(fx.play("frostnova", docs, i, 1, 0, 0)).toBe(true);
    }
    expect(fx.liveCount).toBe(MAX_LIVE_W3X_EFFECTS);
    expect(fx.play("frostnova", docs, 99, 1, 0, 0)).toBe(false);
    expect(fx.plannedParticles).toBeLessThanOrEqual(SCREEN_PARTICLE_BUDGET);
    expect(fx.systemCount).toBeLessThanOrEqual(SCREEN_SYSTEM_BUDGET);
    // …and well inside the count-only ceiling the cap alone would allow
    expect(fx.systemCount).toBeLessThanOrEqual(MAX_LIVE_W3X_EFFECTS * MAX_SYSTEMS_PER_EFFECT);
    fx.dispose();
  });

  it("the FIRST effect is admitted however expensive — never a silent no-op", () => {
    // `emitterBudget`'s own rule: an effect on screen always draws something.
    const fx = castFx({ getQualityScale: () => 0.05 }); // budget → 400 particles
    expect(fx.play("boomnl", familyDocs(WORST), 0, 1, 0, 0)).toBe(true);
    expect(fx.liveCount).toBe(1);
    fx.dispose();
  });

  it("every effect ENDS on its own duration, and replays reuse the pool", () => {
    const fx = castFx();
    const docs = familyDocs(PROMOTED);
    fx.play("frostnova", docs, 0, 1, 0, 0);
    for (let t = 0; t < 2000; t += 50) fx.tick(50, t);
    expect(fx.liveCount, "an emitter outlived its cast (task #131)").toBe(0);
    expect(fx.systemCount).toBe(0);
    const afterFirst = fx.rigTotalSystems;
    expect(afterFirst).toBeGreaterThan(0);
    // replay the same family 5×: pooled, so nothing new is ever built
    for (let n = 0; n < 5; n++) {
      fx.play("frostnova", docs, 0, 1, 0, 2000 + n * 2000);
      for (let t = 0; t < 2000; t += 50) fx.tick(50, 2000 + n * 2000 + t);
    }
    expect(fx.rigTotalSystems, "the rig leaked a system per replay").toBe(afterFirst);
    fx.dispose();
  });

  it("a frame loop that STOPS ticking still cannot leave an emitter running", () => {
    // The rig's duration and maxEffectSec both advance on tick(dt). This is the
    // third, independent guard: a wall-clock reap that runs inside play().
    const fx = castFx();
    const docs = familyDocs(PROMOTED);
    fx.play("frostnova", docs, 0, 1, 0, 0);
    expect(fx.liveCount).toBe(1);
    // …not one tick in between…
    fx.play("frostnova", docs, 0, 1, 0, W3X_CAST_MAX_SEC * 1000 + 1);
    expect(fx.liveCount, "the stale effect was never reaped").toBe(1);
    fx.dispose();
  });

  it("dispose leaves the rig owning ZERO Babylon objects", () => {
    const fx = castFx();
    const docs = familyDocs(PROMOTED);
    fx.play("frostnova", docs, 0, 1, 0, 0);
    expect(fx.rigTotalSystems).toBeGreaterThan(0);
    fx.dispose();
    expect(fx.liveCount).toBe(0);
    expect(fx.rigTotalSystems).toBe(0);
    // and it stays inert afterwards rather than resurrecting
    expect(fx.play("frostnova", docs, 0, 1, 0, 0)).toBe(false);
  });

  it("VfxSystem.dispose() takes the rig down with it", () => {
    const { sys } = harness();
    sys.handleEvent(cast(PROMOTED), 1000);
    const rig = sys.w3xCastFx;
    expect(rig.rigTotalSystems).toBeGreaterThan(0);
    sys.dispose();
    expect(rig.rigTotalSystems).toBe(0);
    expect(rig.liveCount).toBe(0);
  });

  it("VfxSystem.update() pumps the rig, so a cast drains without a manual tick", () => {
    const { sys } = harness();
    sys.handleEvent(cast(PROMOTED), 1000);
    expect(sys.w3xCastFx.liveCount).toBe(1);
    for (let t = 1000; t <= 4000; t += 50) sys.update(t);
    expect(sys.w3xCastFx.liveCount).toBe(0);
    sys.dispose();
  });
});
