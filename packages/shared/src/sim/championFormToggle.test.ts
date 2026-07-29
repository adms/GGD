/**
 * 70-00 紮根 — THE FIRST SHIPPED TOGGLE (#249, owner ruling 2026-07-29
 * 「紮根 + 取代芬多精變形 => 紮根後有 5%回血光環」).
 *
 * ---------------------------------------------------------------------------
 * WHY A SEPARATE SUITE FROM championFormAdoption.test.ts
 * ---------------------------------------------------------------------------
 * That suite owns the three TIMED transforms: `to: "alternate"` on a Q/W/E/R
 * slot, with a rank-1 `ahdu` that makes the body lapse on its own clock. 紮根
 * is the other shape entirely, and every difference is a place the timed suite
 * would have been vacuously green:
 *
 *   · it is a TOGGLE (`to: "toggle"`) — one authored effect that must resolve
 *     against the CURRENT body, so the same button leaves AND enters the form;
 *   · it NEVER EXPIRES (w3a `A0O6` has an empty `ahdu`), so the thing the timed
 *     suite proves — that the form lapses — must here be proven NOT to happen;
 *   · it lives in the SIXTH SLOT (天生技, `slot: "PASSIVE"`), which is castable
 *     only for `innateKind: "active"` and reaches `runEffects` through
 *     `abilityInstanceFor` → `passiveSlot`, a path no other transform uses;
 *   · both halves resolve to the SAME `modelKey` (`champ.sela`), so "did the
 *     model change?" — the timed suite's visibility check — is FALSE here by
 *     design and can prove nothing. What the player actually sees change is the
 *     STAT SHEET (armor 2 → 10, which is the w3a's own
 *     「初使裝甲增加為10點」) plus the snapshot's FORM bit.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS UNDER TEST — the shipped path, not a constructed effect
 * ---------------------------------------------------------------------------
 * Nothing here builds an `EffectDef`. Every transform in this file happens
 * because `castAbility(world, id, "PASSIVE", { type: "self" })` was called —
 * the same entry point an intent frame off the wire reaches — and then the
 * ordinary gate ladder, `CastResolveSystem` and `runEffects` do the rest. Delete
 * the `championForm` entry from `content/abilities/godie-e00s.passive.json` and
 * this suite goes red; author it as `innateKind: "passive"` and the cast is
 * refused with "passive" and it goes red; drop `to` back to `"alternate"` and
 * the return trip goes red.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SUITE DELIBERATELY DOES **NOT** CLAIM
 * ---------------------------------------------------------------------------
 * The owner's ruling has a second half — 「紮根之後才有回血光環」, a 250-radius
 * +5 % ally health-regen aura that exists ONLY in the rooted body. It is NOT
 * shipped, and this suite does not pretend otherwise. The reason is a real gap,
 * pinned by the last `it` below: a form swap rewrites `ChampionComp.championId`
 * and `StatsComp.championId` and NOTHING ELSE, so the entity keeps the BASE
 * champion's `AbilitiesComp` — including `passiveSlot`. An aura can only be
 * authored on `ability@1.passive.ranks[N].auras` (sim/aura/aura.ts), and
 * `syncAbilityPassives` refuses to attach a `passive` block on an
 * `innateKind: "active"` doc, which 紮根 must be to stay pressable. So there is
 * no surface, today, on which a modifier or an aura can be made conditional on
 * the form. See the final test for the exact tripwire.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Abilities, Champions } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { championFormIndex, FORM_NEVER_EXPIRES } from "./systems/ChampionFormSystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import type { StatBlock } from "./stats/statTypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/** 白木老樹精 - 白木卡迪那 #70. `E00S` ⇄ `E010`, trigger `A0O6`. */
const BASE = "godie-e00s" as ChampionId;
const ROOTED = "godie-e010" as ChampionId;
const INNATE = "godie-e00s.passive";
/** w3a `A0O6` `Cool1`. The description prints it, so the doc must carry it. */
const COOLDOWN_SEC = 15;

/**
 * Docs BY PATH, not through `ContentLoader` — the same choice icons.test.ts and
 * championFormAdoption.test.ts make, so the suite is green both before and after
 * `pnpm content:build` rebuilds `_index.json`.
 */
function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

beforeAll(() => {
  const store = new ContentStore();
  // ability-templates first: `registerAll` expands 鑄技工坊 refs at registration
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
  ] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

function spawnOne(championId: ChampionId): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const id = spawnChampion(world, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  world.step(NO_INTENTS);
  return { world, id };
}

const sheetOf = (world: SimWorld, id: EntityId): StatBlock => ({ ...world.stats.get(id)!.final });

/**
 * Press the 天生技 and let the cast resolve. Asserts the press was ACCEPTED —
 * a refused press is the exact failure this suite exists to catch (the innate
 * slot answers "passive" for the wrong `innateKind`, "cooldown" if the caller
 * did not wait), and it must never read as "the transform did not happen".
 */
function pressInnate(world: SimWorld, id: EntityId, why: string): string[] {
  expect(castAbility(world, id, "PASSIVE", { type: "self" }), `press ${why}`).toBe("ok");
  // `world.events` is drained every step, so a refusal raised while the cast
  // resolves is only visible if it is collected AS the ticks go by.
  const seen: string[] = [...world.events.map((e) => e.type)];
  for (let i = 0; i < 20; i++) {
    world.step(NO_INTENTS);
    seen.push(...world.events.map((e) => e.type));
  }
  return seen;
}

/** Step until the innate's cooldown is spent. Returns the ticks it took. */
function waitOffCooldown(world: SimWorld, id: EntityId): number {
  const before = world.tick;
  // Generous cap (2 min of sim) so an operator cooldown multiplier cannot make
  // this loop the thing under test; the assertion is that it DID come off.
  for (let i = 0; i < 3600; i++) {
    if ((world.abilities.get(id)!.passiveSlot!.cooldownRemainingTicks ?? 0) <= 0) break;
    world.step(NO_INTENTS);
  }
  expect(
    world.abilities.get(id)!.passiveSlot!.cooldownRemainingTicks,
    "the innate came off cooldown",
  ).toBe(0);
  return world.tick - before;
}

describe("70-00 紮根 — the 天生技 toggle a player can actually press (#249)", () => {
  it("is AUTHORED as the w3x toggle — read off the registry, not the file", () => {
    cover("champion-form-toggle-uproot");
    const def = Abilities.get(INNATE as never) as {
      name: string;
      slot: string;
      innateKind?: string;
      castType: string;
      range: number;
      cooldown: number[];
      manaCost: number[];
      effects: Array<{ kind: string; to?: string; durationSec?: number }>;
      passive?: unknown;
    };

    expect(def.name, "the map's own A0O6 name (task #11 NN-0X convention)").toBe("70-00 紮根");
    expect(def.slot, "the sixth slot — 天生技, owned from level 1").toBe("PASSIVE");
    // The whole reachability of the feature: an innate is castable ONLY for
    // "active" (sim/abilities/innateActive.ts innateCastBlock).
    expect(def.innateKind, "紮根 is a button the player presses, not a buff").toBe("active");
    // WC3 `ANrg` (Robo-Goblin family) is a NO-TARGET self morph: pressable with
    // nothing selected, and a self-cast may not advertise a reach (#268).
    expect(def.castType).toBe("self");
    expect(def.range).toBe(0);
    expect(def.cooldown[0], "w3a A0O6 Cool1, and the number the tooltip prints").toBe(COOLDOWN_SEC);
    expect(def.manaCost[0], "w3a A0O6 has an empty mana column").toBe(0);
    // An active innate must never also carry a permanent block — syncAbilityPassives
    // skips it, so authoring one would be silently dead content.
    expect(def.passive, "an active innate grants no free permanent source").toBeUndefined();

    const form = def.effects.find((e) => e.kind === "championForm");
    expect(form, `${INNATE} carries the championForm effect`).toBeDefined();
    expect(form!.to, "one effect must serve BOTH directions").toBe("toggle");
    // ABSENT durationSec is what makes it a toggle rather than a 15-second buff:
    // ChampionFormSystem turns that into FORM_NEVER_EXPIRES.
    expect(form!.durationSec, "w3a A0O6 ahdu is empty — the body persists").toBeUndefined();

    // The hero's own w3x link is what the effect resolves through; without it
    // every press would answer `castRejected: no-form`.
    expect(Champions.get(BASE).transform?.counterpartId).toBe(ROOTED);
    expect(Champions.get(BASE).transform?.triggerAbility?.rawcode).toBe("A0O6");
  });

  it("PRESSING it roots the tree: body, form index and the whole stat sheet become godie-e010", () => {
    cover("champion-form-toggle-uproot");
    // What the rooted body's numbers ARE, measured by spawning it directly.
    const ref = spawnOne(ROOTED);
    const rootedSheet = sheetOf(ref.world, ref.id);

    const { world, id } = spawnOne(BASE);
    const baseSheet = sheetOf(world, id);
    // VACUITY GUARD: if the two halves' sheets were identical this test would
    // pass on a build where the swap did nothing at all.
    expect(JSON.stringify(baseSheet), "the two halves are numerically different").not.toBe(
      JSON.stringify(rootedSheet),
    );
    expect(rootedSheet.armor, "w3a: 初使裝甲增加為10點 — rooted armor is higher").toBeGreaterThan(
      baseSheet.armor,
    );

    const events = pressInnate(world, id, "紮根 from the base body");

    expect(events, "the effect ran and announced the swap").toContain("championForm");
    expect(events, "no `no-form` refusal on the way").not.toContain("castRejected");
    expect(championFormIndex(world, id), "entered the alternate body").toBe(1);
    expect(world.champion.get(id)!.championId, "ChampionComp id moved").toBe(ROOTED);
    expect(world.stats.get(id)!.championId, "StatsComp id moved TOO (the #249 trap)").toBe(ROOTED);
    // The numbers that fight are the rooted form's, not a relabelled base.
    expect(sheetOf(world, id), "the sheet IS godie-e010's").toEqual(rootedSheet);
    expect(world.championForm.get(id)!.baseId, "remembers the hero the player picked").toBe(BASE);
  });

  it("NEVER lapses on its own — a toggle is not a 15-second buff", () => {
    cover("champion-form-toggle-uproot");
    const { world, id } = spawnOne(BASE);
    pressInnate(world, id, "紮根");
    expect(world.championForm.get(id)!.expiresTick).toBe(FORM_NEVER_EXPIRES);

    // Two full minutes of sim — longer than any `ahdu` in the map and 8× the
    // ability's own cooldown. A duration that leaked in from anywhere would fire.
    for (let i = 0; i < 3600; i++) world.step(NO_INTENTS);
    expect(championFormIndex(world, id), "still rooted after 120 s").toBe(1);
    expect(world.champion.get(id)!.championId).toBe(ROOTED);
  });

  it("PRESSING IT AGAIN un-roots: the same button walks back to godie-e00s", () => {
    cover("champion-form-toggle-uproot");
    const { world, id } = spawnOne(BASE);
    const baseSheet = sheetOf(world, id);

    pressInnate(world, id, "紮根 (enter)");
    expect(championFormIndex(world, id), "rooted").toBe(1);
    const rootedArmor = sheetOf(world, id).armor;

    // The w3a cooldown is REAL — the second press is only legal once it is spent.
    expect(
      castAbility(world, id, "PASSIVE", { type: "self" }),
      "a second press inside the cooldown is refused",
    ).toBe("cooldown");
    const waited = waitOffCooldown(world, id);
    expect(waited, "the cooldown was a real wait, not a no-op").toBeGreaterThan(0);

    pressInnate(world, id, "紮根 (leave)");

    expect(championFormIndex(world, id), "back in the base body").toBe(0);
    expect(world.champion.get(id)!.championId).toBe(BASE);
    expect(world.stats.get(id)!.championId).toBe(BASE);
    expect(world.championForm.has(id), "the component is DELETED, not zeroed").toBe(false);
    // Directional, not just "changed": armor went up on the way in and back down
    // on the way out, to exactly the sheet the player picked.
    expect(rootedArmor).toBeGreaterThan(baseSheet.armor);
    expect(sheetOf(world, id), "restored its own sheet").toEqual(baseSheet);
  });

  it("GAP (owner's 回血光環): a form swap does NOT re-point the 天生技, so no aura can be form-conditional", () => {
    cover("champion-form-toggle-uproot");
    // This is a TRIPWIRE, not a feature test. It states the mechanism fact that
    // blocks 「紮根之後才有 5% 回血光環」 and will go RED the day someone gives
    // the form system ability adoption — which is the same day the aura becomes
    // authorable. Do not "fix" it by deleting it; author the aura instead.
    const { world, id } = spawnOne(BASE);
    const beforeSlot = world.abilities.get(id)!.passiveSlot!.abilityId;
    expect(beforeSlot).toBe(INNATE);

    pressInnate(world, id, "紮根");
    expect(championFormIndex(world, id), "the body really did swap").toBe(1);

    // …and yet the innate instance is untouched. `godie-e010.passive` is never
    // resolved, so anything authored on it — a `passive.ranks[N].auras` block
    // included — cannot reach the entity.
    expect(
      world.abilities.get(id)!.passiveSlot!.abilityId,
      "setBody writes the two championId copies and nothing else",
    ).toBe(INNATE);

    // The consequence, measured rather than asserted from the code: no aura
    // source exists on the rooted body, so an ally standing on top of it gains
    // nothing. (`kind: "aura"` is what sim/aura/aura.ts projects.)
    expect(world.stats.get(id)!.sources.filter((s) => s.kind === "aura")).toEqual([]);
  });
});
