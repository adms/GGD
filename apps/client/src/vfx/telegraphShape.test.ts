/**
 * telegraph-shape-derivation (task #228) — the geometry half, pure, no Babylon.
 *
 * WHAT THESE LOCK. Every rule here mirrors a specific line of sim, and the
 * point of testing them here (rather than by eye in a match) is that a
 * telegraph which disagrees with the hit query is WORSE than no telegraph: the
 * player learns a dodge that does not work and blames the game. So:
 *
 *   • the size is the post-#136 `abilityRange` size, matching
 *     `resolveAbilityRadius` / `resolveAbilityRange`;
 *   • the `ground` fallback radius is the SIM's `def.radius ?? 1`, not the
 *     `?? 1.2` VfxSystem used to invent (which matched nothing anywhere);
 *   • `targeted` draws a LOCK, never an area — the sim hits exactly one entity,
 *     so a circle would advertise a dodge that does not exist;
 *   • `dash` length is UNMULTIPLIED, because `startDash` takes the raw
 *     `maxDistance` and `abilityRange` never reaches it;
 *   • a shape that cannot be derived returns `null` — the single failure mode,
 *     and the thing telegraphCoverage.test.ts asserts against.
 *
 * The sim-constant claims are additionally PINNED against the real sim source
 * by a comment-stripped scan, so a future balance edit to `?? 1` or to the body
 * radius cannot silently make the drawn shape lie.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ WHERE THE GROUND `?? 1` WENT — GH#481, 2026-08-20. READ THIS BEFORE
 *    "FIXING" THE PIN BELOW BY DELETING IT.
 * ---------------------------------------------------------------------------
 * The ground PIN used to read the literal `def.radius ?? 1` out of BOTH
 * `abilities/abilitySystem.ts` (cast-begin) and `systems/CastResolveSystem.ts`
 * (the re-query when a wind-up elapses), because until today those two really
 * were two copies of the same expression.
 *
 * `87061c8c` (v0.21.5, the GH#458 fix) DELETED the second copy:
 *
 *     - enemiesInCircle(world, id, cast.point!, resolveAbilityRadius(world, def.radius ?? 1))
 *     + groundAoeTargets(world, id, def, cast.point!)
 *
 * The default did not change and it did not disappear — it MOVED, into the one
 * `groundAoeTargets()` both call sites now share (abilitySystem.ts). So the
 * old PIN went red while the drawn telegraph was still exactly right: a
 * source-string PIN cannot tell "the rule changed" from "the code moved"
 * (CLAUDE.md 失敗形態⑥ — the same trap already annotated on the skillshot PIN
 * below, which GH#289 sprang once before).
 *
 * ⭐ The PIN is therefore re-aimed at what the telegraph actually depends on,
 * which is a RELATIONSHIP rather than a literal: the ground default has ONE
 * home, and the resolve-time re-query REACHES that home instead of inventing
 * its own. That is strictly stronger than the old pair of literals — those two
 * would both have passed while silently drifting apart, which is precisely the
 * divergence GH#458 shipped (破法對咒 shielding the enemy team).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "@ggd/shared/content/registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "@ggd/shared/sim/content/registry";
import {
  BODY_RADIUS,
  SIM_GROUND_DEFAULT_RADIUS,
  deriveTelegraphGeometry,
  isPassiveOnlyAbility,
  placeTelegraph,
  resolveTelegraphShape,
  type TelegraphAbilityLike,
  type TelegraphEnv,
} from "./telegraphShape";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** Strip line + block comments so a prose mention can never satisfy a scan. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
function simSource(rel: string): string {
  return stripComments(readFileSync(join(REPO_ROOT, "packages/shared/src/sim", rel), "utf8"));
}

const MULT = 0.6; // the live content/config/combat-env.json abilityRange

const env = (over: Partial<TelegraphEnv> = {}): TelegraphEnv => ({
  abilityRange: MULT,
  projectile: (id) => (id === "p.bolt" ? { maxRange: 12, hitRadius: 0.5 } : null),
  ...over,
});

const ability = (over: Partial<TelegraphAbilityLike>): TelegraphAbilityLike => ({
  castType: "ground",
  range: 6,
  effects: [],
  ...over,
});

describe("telegraph geometry is derived from content, at the SIM's own size", () => {
  it("ground → a circle at `radius × abilityRange` (the enemiesInCircle disc)", () => {
    cover("telegraph-shape-derivation");
    const g = deriveTelegraphGeometry(ability({ castType: "ground", radius: 6 }), env());
    expect(g).toMatchObject({ kind: "circle", anchor: "point" });
    expect(g?.kind === "circle" ? g.radius : null).toBeCloseTo(6 * MULT, 6);
  });

  it("a ground ability with NO radius uses the sim's own `?? 1`, never an invented 1.2", () => {
    cover("telegraph-shape-derivation");
    // PIN, half 1 — the default has exactly ONE home: `groundAoeTargets`.
    expect(simSource("abilities/abilitySystem.ts")).toContain("def.radius ?? 1)");
    expect(SIM_GROUND_DEFAULT_RADIUS).toBe(1);
    // PIN, half 2 — the re-query at the END of a wind-up REACHES that home
    // instead of deriving its own radius. Both halves matter: a telegraph is
    // drawn at cast-BEGIN and the hit set is recomputed at cast-END, so the
    // instant these two stop sharing one function the picture the player
    // dodged and the circle that actually hit them are different circles.
    // Asserted as "calls it AND owns no radius of its own" so re-inlining the
    // query goes red even if the re-inlined copy happens to say `?? 1` today.
    const castResolve = simSource("systems/CastResolveSystem.ts");
    expect(castResolve).toContain("groundAoeTargets(");
    expect(castResolve).not.toMatch(/radius/);

    const g = deriveTelegraphGeometry(ability({ castType: "ground" }), env());
    expect(g?.kind === "circle" ? g.radius : null).toBeCloseTo(1 * MULT, 6);
    // the number VfxSystem used to draw — it belonged to nothing
    expect(g?.kind === "circle" ? g.radius : null).not.toBeCloseTo(1.2 * MULT, 6);
  });

  it("targeted → a LOCK on the victim, never a fabricated AoE circle", () => {
    cover("telegraph-shape-derivation");
    // PIN: a targeted cast's hit set is exactly one entity.
    expect(simSource("abilities/abilitySystem.ts")).toContain("targets = [target.entityId]");
    const g = deriveTelegraphGeometry(
      ability({ castType: "targeted", range: 8, radius: 4 }),
      env(),
    );
    expect(g!.kind).toBe("lock");
    // an authored `radius` on a single-target spell is decorative: the arc is
    // the champion's body, and a body is never scaled by abilityRange
    expect(g?.kind === "lock" ? g.radius : null).toBeCloseTo(BODY_RADIUS, 6);
  });

  it("skillshot → the PROJECTILE's corridor: BOTH maxRange and hitRadius × abilityRange", () => {
    cover("telegraph-shape-derivation");
    // PIN: the projectile's travel is abilityRange-scaled …
    // ⚠️ MOVED 2026-07-31. GH#289 split the one big `effectRunner.ts` switch
    // into a module per effect kind, and this PIN kept reading the old file —
    // which still EXISTS (it is now the four-line dispatcher), so the read did
    // not throw; it just silently stopped containing the line. A source-string
    // PIN cannot tell "the rule changed" from "the code moved", which is
    // exactly CLAUDE.md 失敗形態⑥ and is why the assertions that MATTER in this
    // file are the geometry ones below. These two PINs stay only as a
    // cheap "the sim still does what the telegraph assumes" tripwire.
    expect(stripComments(readFileSync(join(REPO_ROOT, "packages/shared/src/sim/effects/spawnProjectile.ts"), "utf8")))
      .toContain("remainingRange: resolveAbilityRange(world, def.maxRange)");
    // … and so is its HIT RADIUS. An earlier revision of this test asserted the
    // opposite ("hit radius really is not"), which made every skillshot
    // corridor 1/mult too narrow — a telegraph that lies about how wide it
    // hits. ProjectileSystem only skips the scale for BASIC attacks, and
    // spawnProjectile never marks an ability projectile basic.
    expect(stripComments(readFileSync(join(REPO_ROOT, "packages/shared/src/sim/systems/ProjectileSystem.ts"), "utf8")))
      .toContain("proj.basic ? proj.hitRadius : resolveAbilityRadius(world, proj.hitRadius)");
    const g = deriveTelegraphGeometry(
      ability({
        castType: "skillshot",
        range: 9,
        effects: [{ kind: "spawnProjectile", projectileId: "p.bolt" }],
      }),
      env(),
    );
    expect(g).toMatchObject({ kind: "line", anchor: "caster" });
    expect(g?.kind === "line" ? g.length : null).toBeCloseTo(12 * MULT, 6);
    expect(g?.kind === "line" ? g.width : null).toBeCloseTo(1.0 * MULT, 6);
    // a skillshot IS dangerous — it must stay in the enemy danger channel
    expect(g?.kind === "line" ? (g.harmless ?? false) : null).toBe(false);
  });

  it("a dash corridor is marked HARMLESS — it is movement, not damage", () => {
    cover("telegraph-shape-derivation");
    // PIN: startDash only redirects movement; nothing along the corridor is hit.
    expect(stripComments(readFileSync(join(REPO_ROOT, "packages/shared/src/sim/systems/MovementSystem.ts"), "utf8")))
      .toContain("nav.override");
    const g = deriveTelegraphGeometry(
      ability({ castType: "dash", range: 6, effects: [{ kind: "dash", maxDistance: 5 }] }),
      env(),
    );
    expect(g).toMatchObject({ kind: "line", anchor: "caster", harmless: true });
  });

  it("a skillshot whose projectile doc is missing returns NULL, not the cast range", () => {
    cover("telegraph-shape-derivation");
    const g = deriveTelegraphGeometry(
      ability({
        castType: "skillshot",
        effects: [{ kind: "spawnProjectile", projectileId: "p.nope" }],
      }),
      env(),
    );
    // failing loudly is the point: `range` is how far you may AIM, not how far
    // the missile flies, and drawing one as the other teaches a wrong dodge
    expect(g).toBeNull();
  });

  it("dash → a corridor of the RAW maxDistance (the sim applies no abilityRange)", () => {
    cover("telegraph-shape-derivation");
    expect(stripComments(readFileSync(join(REPO_ROOT, "packages/shared/src/sim/effects/dash.ts"), "utf8")))
      .toContain("startDash(world, ctx.caster, dir, e.speed, e.maxDistance)");
    const g = deriveTelegraphGeometry(
      ability({ castType: "dash", effects: [{ kind: "dash", maxDistance: 5 }] }),
      env(),
    );
    expect(g?.kind === "line" ? g.length : null).toBeCloseTo(5, 6);
    expect(g?.kind === "line" ? g.width : null).toBeCloseTo(BODY_RADIUS * 2, 6);
  });

  it("a dash with no maxDistance returns NULL rather than guessing a length", () => {
    cover("telegraph-shape-derivation");
    expect(
      deriveTelegraphGeometry(ability({ castType: "dash", effects: [{ kind: "applyBuff" }] }), env()),
    ).toBeNull();
  });

  it("self → a caster-centred body marker (the sim targets only the caster)", () => {
    cover("telegraph-shape-derivation");
    expect(simSource("abilities/abilitySystem.ts")).toContain("targets = [caster]");
    const g = deriveTelegraphGeometry(ability({ castType: "self", range: 0, radius: 9 }), env());
    expect(g).toMatchObject({ kind: "self", anchor: "caster" });
    expect(g?.kind === "self" ? g.radius : null).toBeCloseTo(BODY_RADIUS, 6);
  });

  it("BODY_RADIUS is the champion's real collision radius, not a look-alike", () => {
    cover("telegraph-shape-derivation");
    expect(stripComments(readFileSync(join(REPO_ROOT, "packages/shared/src/sim/spawnChampion.ts"), "utf8")))
      .toContain(`radius: ${BODY_RADIUS}`);
  });

  it("a non-finite or zero abilityRange derives nothing (never a 0-size ring)", () => {
    cover("telegraph-shape-derivation");
    expect(deriveTelegraphGeometry(ability({ radius: 4 }), env({ abilityRange: 0 }))).toBeNull();
    expect(deriveTelegraphGeometry(ability({ radius: 4 }), env({ abilityRange: NaN }))).toBeNull();
  });

  it("a passive-only ability is out of scope, not missing", () => {
    cover("telegraph-shape-derivation");
    expect(isPassiveOnlyAbility(ability({ passive: { ranks: [] }, effects: [] }))).toBe(true);
    expect(isPassiveOnlyAbility(ability({ passive: { ranks: [] }, effects: [{ kind: "damage" }] }))).toBe(
      false,
    );
    expect(isPassiveOnlyAbility(ability({}))).toBe(false);
  });
});

/**
 * ⭐ THE GROUND LASH — a `castType: "ground"` ability whose damage is a CAPSULE.
 *
 * WHY THE SAMPLE COMES OUT OF THE REGISTRY, not a hand-written fixture: the
 * whole failure being locked here is "the drawn shape disagrees with the shape
 * the sim tests", and a fixture I wrote agrees with whatever I believed while
 * writing it (失敗形態⑤). So the sweep runs over the SHIPPED abilities, after
 * `registerAll` has expanded templates and resolved the tier fields.
 *
 * The multiplier is deliberately NOT 1: `damageLine` is the one corridor the
 * sim does not scale (`sim/effects/damageLine.ts`: 「⚠️ NO
 * `combatEnv.abilityRange` FACTOR, deliberately」), so a derivation that
 * multiplied it would come out 2× narrow here and go red.
 */
describe("a ground cast carrying a damageLine draws the CAPSULE, not the picker disc", () => {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const lashEnv: TelegraphEnv = { abilityRange: 0.5, projectile: () => null };

  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(join(REPO, "content"))).load()).store);
  });

  it("every shipped one derives a LINE whose length/width are the node's own", () => {
    cover("telegraph-shape-derivation");
    const swept: string[] = [];
    for (const id of Abilities.ids()) {
      const def = Abilities.get(id) as unknown as TelegraphAbilityLike;
      if (def.castType !== "ground") continue;
      const lash = def.effects.find((e) => e.kind === "damageLine") as
        | { length: number; width: number }
        | undefined;
      if (!lash) continue;
      const g = deriveTelegraphGeometry(def, lashEnv);
      // circle = "you are safe outside this disc", which is the opposite of true:
      // the disc only picks who triggers the lash, the capsule is what cuts.
      expect(g?.kind, `${id} drew ${g?.kind} — the sim hits a capsule`).toBe("line");
      const line = g as { length: number; width: number };
      expect(line.width, `${id} width`).toBeCloseTo(lash.width, 6);
      expect(line.length, `${id} length`).toBeCloseTo(lash.length, 6);
      swept.push(id);
    }
    // a sweep that found nothing is a green test that proves nothing (#128)
    expect(swept.length, "no shipped ground+damageLine ability was swept").toBeGreaterThan(0);
  });

  it("a ground ability with NO damageLine still draws the enemiesInCircle disc", () => {
    cover("telegraph-shape-derivation");
    // the knob only re-shapes the lash family; it must not swallow the other 70-odd
    const g = deriveTelegraphGeometry(ability({ castType: "ground", radius: 4 }), lashEnv);
    expect(g?.kind).toBe("circle");
  });
});

describe("placement uses the cast event's own point / direction", () => {
  const at = { casterX: 2, casterZ: 3, point: { x: 9, z: 4 }, direction: { x: 0, z: 2 } };

  it("a ground circle sits at the CAST POINT, not under the caster", () => {
    cover("telegraph-shape-derivation");
    const s = resolveTelegraphShape(ability({ castType: "ground", radius: 3 }), at, env());
    expect(s).toMatchObject({ kind: "circle", x: 9, z: 4 });
  });

  it("a lock keeps BOTH ends: the victim's feet and the caster it came from", () => {
    cover("telegraph-shape-derivation");
    const s = resolveTelegraphShape(ability({ castType: "targeted" }), at, env());
    expect(s).toMatchObject({ kind: "lock", x: 9, z: 4, fromX: 2, fromZ: 3 });
  });

  it("a corridor's direction is NORMALISED before it is drawn", () => {
    cover("telegraph-shape-derivation");
    const s = resolveTelegraphShape(
      ability({ castType: "dash", effects: [{ kind: "dash", maxDistance: 4 }] }),
      at,
      env(),
    );
    expect(s?.kind === "line" ? Math.hypot(s.dirX, s.dirZ) : null).toBeCloseTo(1, 6);
    expect(s?.kind === "line" ? s.dirZ : null).toBeCloseTo(1, 6);
  });

  it("a ground circle with no point, and a corridor with no aim, both refuse to draw", () => {
    cover("telegraph-shape-derivation");
    const noPoint = { casterX: 0, casterZ: 0 };
    expect(
      placeTelegraph({ kind: "circle", radius: 2, anchor: "point", source: "" }, noPoint),
    ).toBeNull();
    expect(
      placeTelegraph({ kind: "line", length: 4, width: 1, anchor: "caster", source: "" }, noPoint),
    ).toBeNull();
  });

  it("a self marker needs neither a point nor an aim — it is the caster", () => {
    cover("telegraph-shape-derivation");
    const s = resolveTelegraphShape(ability({ castType: "self" }), { casterX: 5, casterZ: -1 }, env());
    expect(s).toMatchObject({ kind: "self", x: 5, z: -1 });
  });
});
