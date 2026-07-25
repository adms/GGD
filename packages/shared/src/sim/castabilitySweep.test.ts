/**
 * Task #128 — IN-GAME CASTABILITY COVERAGE SWEEP (diagnostic).
 *
 * The question this answers is NOT "is the ability doc shaped correctly" (that
 * is #78's nativeFidelity suite) nor "does it have a VFX" (#79). It is the
 * blunt one the user actually asked: for EVERY pickable champion, does pressing
 * Q / W / E / R / EX — and swinging the basic attack — actually DO something in
 * the real SimWorld, or is the button a dead no-op?
 *
 * WHAT IT DOES. For each of the 48 whitelisted champions it spins up a fresh
 * deterministic SimWorld with a dummy enemy (and a dummy ally, for the
 * heal/shield/buff spells that only accept friendlies) placed adjacent, then for
 * each slot:
 *   1. ranks the ability through the real rank-up / EX-unlock path,
 *   2. resolves a target appropriate to its castType (targeted → the adjacent
 *      enemy; ground → a point on the enemy; skillshot/dash → aimed at the
 *      enemy; self → self; ally spells → the adjacent ally),
 *   3. issues the cast through the real castAbility(),
 *   4. steps the sim far enough for any cast-time wind-up to resolve, and
 *   5. checks that SOMETHING measurable happened — a damage packet, a heal /
 *      mana restore, a shield, a status, a buff source, a spawned projectile, a
 *      dash, or a VFX — with no exception thrown.
 *
 * A slot that throws, is rejected, or is accepted-but-produces-nothing = FAIL.
 * A permanent WC3 passive (native Cool=0, no castable effects) is not a bug: it
 * is reported as PASSIVE and we verify its ModifierSource actually attaches.
 *
 * OUTPUT. The pass/fail matrix + summary + failure list is written to
 * docs/_castability-128.md every run, so the ability-fidelity / VFX owners have
 * a live diagnostic they can re-generate.
 *
 * IT IS ALSO A RATCHET (added 2026-07-25). It used to be a pure diagnostic that
 * "deliberately does not go red on a content no-op" — which meant all 288 cells
 * could report FAIL and the suite still passed, because the only assertion that
 * could ever fail was `roster.length === 48`. The report was therefore the only
 * place the truth lived, and the todo ledger drifted away from it unnoticed.
 * Now the sweep pins a measured FLOOR (see MIN_PASS / MIN_WORKING below) and an
 * explicit KNOWN_FAILING set, so a regression shows up as a NAMED cell rather
 * than as a number nobody reads. Never lower the floor to make the suite green:
 * if a cell regresses, fix the cell or record it — with a reason — as known.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility, rankUpAbility, learnEx } from "./abilities/abilitySystem";
import { isPassiveOnly, abilityPassiveSourceId } from "./abilities/abilityPassives";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { TICK_HZ } from "../constants";
import type { AbilityDef, CastType } from "./content/defs";
import type { AbilitySlot, CastTarget, CoreAbilitySlot } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../.."); // packages/shared/src/sim -> repo root
const CONTENT_DIR = join(ROOT, "content");
const WHITELIST = join(ROOT, "data/curation/whitelist.json");
const REPORT = join(ROOT, "docs/_castability-128.md");

const NO_INTENTS = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
/** North of the zone centre — clear of the three SKELETON_ARENA pillars. */
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
/** Adjacent spacing: bodies are r=0.6, so 1.35 keeps a 0.15u surface gap. */
const ADJ = 1.35;
/** A robust melee bruiser used as the enemy / ally punching bag. */
const DUMMY = "godie-hart" as ChampionId;
/**
 * Post-resolution settle: ticks stepped AFTER the wind-up ends, so the effect
 * has room to land, spawn its projectile and emit its events.
 */
const SETTLE_TICKS = 8;
/** Lower bound on the step window — what an instant (castTimeSec 0) cast gets. */
const MIN_WINDOW = 26;
/**
 * Ticks stepped after each cast. DERIVED FROM CONTENT in `beforeAll`, never
 * hand-written: `maxAuthoredCastTicks + SETTLE_TICKS`.
 *
 * This used to be the hard-coded 26 with the comment "max authored cast time is
 * 0.6 s (18 ticks)". That comment went stale: `godie-u00n.r` (草帽小子 R) is
 * authored at `castTimeSec: 0.9` = 27 ticks, so the window ended ONE TICK before
 * the ability resolved and the sweep reported it as "cast accepted but produced
 * no measurable effect (no-op)" — a measurement artifact recorded in the ledger
 * as a content gap for two days. Deriving the window makes that class of lie
 * impossible; `expect(WINDOW).toBeGreaterThan(maxCastTicks)` re-proves it every
 * run, so nobody has to trust a comment.
 */
let WINDOW = MIN_WINDOW;
/** Longest authored cast, in ticks, over the whole ability registry. */
let maxCastTicks = 0;
/** Ticks allowed for the FIRST basic-attack swing to land. */
const BASIC_WINDOW = 40;

const SLOTS: AbilitySlot[] = ["Q", "W", "E", "R", "EX"];
type SlotName = "Q" | "W" | "E" | "R" | "EX" | "basic";
const COLS: SlotName[] = ["Q", "W", "E", "R", "EX", "basic"];

// ------------------------------------------------------------------ the floor
//
// MEASURED 2026-07-25 against contentVersion `cv_1e8298588746`, on the
// 48-champion roster (the operator's curation whitelist and the committed
// `castabilityRoster.fixture.json` are set-identical, so CI measures the same
// roster the operator does). Full run, no sampling: 48 × 6 = 288 cells.
//
//   280 ✅ PASS · 8 🟣 PASSIVE · 0 ❌ FAIL · 0 spawn failures.
//
// (Previous measurement, cv_ecff53279fad: 281 ✅ · 7 🟣. The −1/+1 is the JASS
// fidelity fix to 20-02 感知能力 `godie-e002.q` — its WC3 source `A0CM` is the
// native Evasion `AEev`, a Cool=0 permanent, so the invented castable armor
// buff became a verified passive:modifiers cell. Not a regression.)
//
// The 8 PASSIVE are verified WC3 permanents (native Cool=0) whose ModifierSource
// is confirmed attached — correct behaviour, not gaps; hence MIN_WORKING counts
// PASS + PASSIVE. The floors are a RATCHET, not a target: raise them when the
// measurement improves, and never lower them to make the suite green. If this
// header's contentVersion no longer matches `content/manifest.json`, the numbers
// below are stale — re-measure before trusting them (the run prints both).
const MEASURED_ON = "2026-07-25";
const MEASURED_CONTENT_VERSION = "cv_1e8298588746";
/** Minimum cells that must cast AND produce a measurable effect. */
const MIN_PASS = 280;
/** Minimum cells that must behave as intended (PASS + verified permanent PASSIVE). */
const MIN_WORKING = 288;
/**
 * Cells known to FAIL, as `<championId>:<slot>`, each with a reason. Asserted by
 * EXACT SET EQUALITY, deliberately: a blanket count-floor hides WHICH cell broke
 * (one cell regressing while another is fixed clears any floor), and a stale
 * allowlist is itself a lie. A new failure shows up here as a NAME; a fixed
 * failure also goes red, telling you to delete the entry and update
 * docs/todo/castability.md in the same commit.
 *
 * Empty as of 2026-07-25. The only prior entry, `godie-u00n:R`, was never a
 * content gap — it was the stale WINDOW cutting the cast off one tick early
 * (see WINDOW above).
 */
const KNOWN_FAILING: readonly string[] = [];

type Verdict = "PASS" | "FAIL" | "PASSIVE";
interface Cell {
  verdict: Verdict;
  channel?: string; // what fired (for PASS/PASSIVE); absent on FAIL
  castType?: CastType;
  reason?: string; // why it failed / extra note
}
interface ChampResult {
  id: string;
  name: string;
  attackType: "melee" | "ranged";
  spawnOk: boolean;
  spawnError?: string;
  cells: Record<SlotName, Cell>;
  /** observed basic-attack shape: did it launch a projectile? */
  basicProjectile?: boolean;
  basicRangedFlag?: boolean;
}

let roster: string[] = [];
const results: ChampResult[] = [];

/**
 * The sweep runs against the OPERATOR'S curation state, which is deliberately
 * not in git: `.gitignore` excludes `/data/**` because the whitelist is live
 * operational state, not a program constant (see README 開放名單). So the file
 * exists on a working machine and never in a fresh checkout — including CI,
 * where an unguarded read failed the whole suite at collection time with ENOENT.
 *
 * Falling back to a committed snapshot rather than skipping, because the TODO
 * runtime gate (`pnpm todo:runtime`) fails any `done` row whose beacon never
 * fires, and cast128-01 is done — a skipped sweep turns a red `unit` into a red
 * `regression`. The sweep is a SIM assertion (every champion spawns, every slot
 * fires), so a representative roster exercises exactly what it is there to
 * catch; the real whitelist still wins wherever it exists.
 */
const ROSTER_FIXTURE = join(HERE, "castabilityRoster.fixture.json");

const rosterSource = (): { champions: string[]; from: string } => {
  const [file, from] = existsSync(WHITELIST)
    ? [WHITELIST, "curation whitelist"]
    : [ROSTER_FIXTURE, "committed fixture"];
  return { champions: JSON.parse(readFileSync(file, "utf8")).champions as string[], from };
};

/** contentVersion of the bundle actually loaded, for staleness reporting. */
let contentVersion = "(unknown)";

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
  const src = rosterSource();
  roster = src.champions;

  // Size the step window to the CONTENT, not to a comment. `abilitySystem`
  // resolves a cast at Math.round(castTimeSec / dt) ticks; mirror that exactly.
  maxCastTicks = Math.max(
    0,
    ...Abilities.all().map((a) => Math.round((a.castTimeSec ?? 0) * TICK_HZ)),
  );
  WINDOW = Math.max(MIN_WINDOW, maxCastTicks + SETTLE_TICKS);

  try {
    contentVersion = (
      JSON.parse(readFileSync(join(CONTENT_DIR, "manifest.json"), "utf8")) as {
        contentVersion?: string;
      }
    ).contentVersion ?? "(unknown)";
  } catch {
    /* manifest is optional for the sweep; only used to report floor staleness */
  }

  console.log(
    `castability sweep: ${roster.length} champions from the ${src.from}; ` +
      `contentVersion ${contentVersion} (floor measured ${MEASURED_ON} against ` +
      `${MEASURED_CONTENT_VERSION}); longest authored cast ${maxCastTicks} ticks, ` +
      `step window ${WINDOW} ticks`,
  );
});

// --------------------------------------------------------------------- helpers

let seatCounter = 0;
function spawn(world: SimWorld, championId: string, team: number, dx: number): EntityId {
  return spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(seatCounter++),
    teamId: asTeamId(team),
    pos: { x: P.x + dx, z: P.z },
    zone: 0,
  });
}

/** Broad snapshot of the effect-bearing channels regen/movement cannot spoof. */
function snapshot(world: SimWorld): {
  shields: number;
  statuses: number;
  buffs: number;
  projectiles: number;
} {
  let shields = 0;
  for (const hp of world.health.values()) shields += hp.shields.length;
  let statuses = 0;
  for (const st of world.status.values()) statuses += st.effects.length;
  let buffs = 0;
  for (const sc of world.stats.values()) buffs += sc.sources.filter((s) => s.kind === "buff").length;
  return { shields, statuses, buffs, projectiles: world.projectile.size };
}

/** Events that constitute "a real effect happened" (excludes abilityCast/castBegin). */
const EFFECT_EVENTS = new Set([
  "damage",
  "heal",
  "manaRestore",
  "projectileSpawn",
  "vfxSpawn",
  "knockdown",
]);

function abilityForSlot(world: SimWorld, id: EntityId, slot: AbilitySlot): AbilityDef | null {
  const ab = world.abilities.get(id)!;
  const inst = slot === "EX" ? ab.exSlot : ab.slots[slot];
  if (!inst) return null;
  return Abilities.tryGet(inst.abilityId as never) as AbilityDef | undefined ?? null;
}

/** Raise a slot to rank 1 (EX via learnEx); returns false if it cannot be learned. */
function learnSlot(world: SimWorld, id: EntityId, slot: AbilitySlot): boolean {
  const ab = world.abilities.get(id)!;
  if (slot === "EX") {
    if (!ab.exSlot) return false;
    if (ab.exSlot.rank > 0) return true;
    return learnEx(world, id);
  }
  const inst = ab.slots[slot as CoreAbilitySlot];
  if (inst.rank >= 1) return true; // Q starts learned
  world.ultGateOverride = true;
  ab.unspentPoints = 1;
  return rankUpAbility(world, id, slot as CoreAbilitySlot);
}

/** Build a cast target appropriate to the ability's castType. */
function targetFor(
  def: AbilityDef,
  foe: EntityId,
  ally: EntityId,
  foePos: { x: number; z: number },
): CastTarget {
  switch (def.castType) {
    case "self":
      return { type: "self" };
    case "targeted":
      // ally-only spells (heals/shields/buffs) refuse enemies, so aim them right
      return def.targetsEnemies === false
        ? { type: "entity", entityId: ally }
        : { type: "entity", entityId: foe };
    case "ground":
      return { type: "point", point: { x: foePos.x, z: foePos.z } };
    case "skillshot":
    case "dash":
      return { type: "point", point: { x: foePos.x, z: foePos.z } };
  }
}

/**
 * Run one (champion, slot) cast in a fresh world and decide PASS/FAIL/PASSIVE.
 */
function testSlot(championId: string, slot: AbilitySlot): Cell {
  try {
    const world = new SimWorld(SKELETON_ARENA, 4242 + SLOTS.indexOf(slot));
    world.ultGateOverride = true;
    const caster = spawn(world, championId, 0, 0);
    const foe = spawn(world, DUMMY as unknown as string, 1, ADJ);
    const ally = spawn(world, DUMMY as unknown as string, 0, -ADJ);
    world.step(NO_INTENTS); // settle stats/health
    world.rebuildGrid();

    const def = abilityForSlot(world, caster, slot);
    if (!def) return { verdict: "FAIL", reason: "slot not present (no ability id)" };

    if (!learnSlot(world, caster, slot)) {
      return { verdict: "FAIL", castType: def.castType, reason: "could not be learned/unlocked" };
    }
    world.step(NO_INTENTS); // let rank-up passives settle
    world.rebuildGrid();

    // ---- permanent passive (native Cool=0, no castable effects) ----
    if (isPassiveOnly(def)) {
      const src = world.stats
        .get(caster)!
        .sources.find((s) => s.id === abilityPassiveSourceId(def.id));
      const rej = castAbility(world, caster, slot, { type: "self" });
      if (src) {
        return {
          verdict: "PASSIVE",
          castType: def.castType,
          channel: src.modifiers?.length ? "passive:modifiers" : "passive:hooks",
          reason: rej === "passive" ? undefined : `cast returned "${rej}" (expected "passive")`,
        };
      }
      return {
        verdict: "FAIL",
        castType: def.castType,
        reason: "passive-only but no modifier/hook source attaches (inert)",
      };
    }

    // ---- active cast ----
    const foePos = { ...world.transform.get(foe)!.pos };
    const allyPos = { ...world.transform.get(ally)!.pos };
    const casterAnchor = { ...world.transform.get(caster)!.pos };

    // Set every scene body to half HP/mana so heals/restores/shields have room;
    // give the caster exactly enough mana that the cast is never rejected for
    // cost yet self mana-restores still register.
    for (const e of [caster, foe, ally]) {
      const hp = world.health.get(e)!;
      hp.hp = hp.maxHp * 0.5;
      hp.mana = hp.maxMana * 0.5;
    }
    const cost = def.manaCost[0] ?? 0;
    world.health.get(caster)!.mana = cost + 1;

    const target = targetFor(def, foe, ally, foePos);
    const before = snapshot(world);
    const events: string[] = [];

    const res = castAbility(world, caster, slot, target);
    if (res !== "ok") {
      return { verdict: "FAIL", castType: def.castType, reason: `cast rejected: ${res}` };
    }
    events.push(...world.events.map((e) => e.type));

    // PEAK, not end-state. The window is sized to the longest authored wind-up,
    // so it now outlives short buffs/statuses/shields and in-flight projectiles;
    // sampling only at the end would let a real effect expire before we look and
    // read as a no-op. Take the max over the whole window instead.
    const after = { ...before };
    let moved = false;
    for (let i = 0; i < WINDOW; i++) {
      world.step(NO_INTENTS);
      events.push(...world.events.map((e) => e.type));
      const s = snapshot(world);
      after.shields = Math.max(after.shields, s.shields);
      after.statuses = Math.max(after.statuses, s.statuses);
      after.buffs = Math.max(after.buffs, s.buffs);
      after.projectiles = Math.max(after.projectiles, s.projectiles);
      moved ||=
        Math.hypot(
          world.transform.get(caster)!.pos.x - casterAnchor.x,
          world.transform.get(caster)!.pos.z - casterAnchor.z,
        ) > 0.2 || world.nav.get(caster)!.override != null;
      // re-pin the two dummies so a knockback / shove cannot carry them out of
      // a ground circle before it resolves (the caster is left free so a dash
      // effect can visibly move it).
      world.transform.get(foe)!.pos = { ...foePos };
      world.transform.get(ally)!.pos = { ...allyPos };
    }

    // pick the first channel that fired, for the report
    const fired = (t: string): boolean => events.includes(t);
    let channel = "";
    if (fired("damage")) channel = "damage";
    else if (fired("projectileSpawn")) channel = "projectile";
    else if (fired("heal")) channel = "heal";
    else if (fired("manaRestore")) channel = "manaRestore";
    else if (after.shields > before.shields) channel = "shield";
    else if (after.statuses > before.statuses) channel = "status";
    else if (after.buffs > before.buffs) channel = "buff";
    else if (moved) channel = "dash";
    else if (fired("vfxSpawn")) channel = "vfx";

    const anyEvent = events.some((t) => EFFECT_EVENTS.has(t));
    const anyState =
      after.shields > before.shields ||
      after.statuses > before.statuses ||
      after.buffs > before.buffs ||
      after.projectiles > before.projectiles ||
      moved;

    if (anyEvent || anyState) {
      return { verdict: "PASS", castType: def.castType, channel };
    }
    return {
      verdict: "FAIL",
      castType: def.castType,
      reason:
        def.effects.length === 0
          ? "no effects authored (empty effect list)"
          : "cast accepted but produced no measurable effect (no-op)",
    };
  } catch (err) {
    return { verdict: "FAIL", reason: `threw: ${(err as Error).message}` };
  }
}

/** Swing the basic attack at an adjacent enemy and confirm it lands / fires. */
function testBasic(championId: string): { cell: Cell; projectile: boolean; rangedFlag?: boolean } {
  try {
    const world = new SimWorld(SKELETON_ARENA, 9001);
    const caster = spawn(world, championId, 0, 0);
    const foe = spawn(world, DUMMY as unknown as string, 1, ADJ);
    world.step(NO_INTENTS);
    const cpos = { ...world.transform.get(caster)!.pos };
    const fpos = { ...world.transform.get(foe)!.pos };

    let basicEvent = false;
    let projectile = false;
    let damage = false;
    let rangedFlag: boolean | undefined;
    for (let i = 0; i < BASIC_WINDOW; i++) {
      world.nav.get(caster)!.attackTarget = foe;
      world.transform.get(caster)!.pos = { ...cpos };
      world.transform.get(foe)!.pos = { ...fpos };
      world.health.get(foe)!.hp = world.health.get(foe)!.maxHp; // keep it alive
      world.step(NO_INTENTS);
      for (const e of world.events) {
        if (e.type === "basicAttack") {
          basicEvent = true;
          rangedFlag = (e.data as { ranged?: boolean }).ranged;
        }
        if (e.type === "projectileSpawn") projectile = true;
        if (e.type === "damage" && (e.data as { origin?: string }).origin === "basic") damage = true;
      }
      if (basicEvent && (projectile || damage)) break;
    }

    if (basicEvent && (projectile || damage)) {
      return {
        cell: { verdict: "PASS", channel: projectile ? "projectile" : "damage" },
        projectile,
        rangedFlag,
      };
    }
    return {
      cell: {
        verdict: "FAIL",
        reason: basicEvent
          ? "swing fired but no damage/projectile resolved"
          : "no basic attack swing within window",
      },
      projectile,
      rangedFlag,
    };
  } catch (err) {
    return { cell: { verdict: "FAIL", reason: `threw: ${(err as Error).message}` }, projectile: false };
  }
}

// ------------------------------------------------------------------- the sweep

describe("task #128 — in-game castability coverage sweep", () => {
  it("spawns every whitelisted champion and fires every slot, writing docs/_castability-128.md", () => {
    cover("castability-sweep-128");
    expect(roster.length).toBeGreaterThanOrEqual(48); // owner-curated whitelist may add heroes (e.g. #100 喪標麥可)

    for (const id of roster) {
      let name = id;
      let attackType: "melee" | "ranged" = "melee";
      let spawnOk = true;
      let spawnError: string | undefined;
      try {
        const def = Champions.get(id as ChampionId);
        name = def.name;
        attackType = def.attackType;
        // smoke-spawn to confirm the champion boots at all
        const w = new SimWorld(SKELETON_ARENA, 1);
        spawn(w, id, 0, 0);
        w.step(NO_INTENTS);
      } catch (err) {
        spawnOk = false;
        spawnError = (err as Error).message;
      }

      const cells: Record<SlotName, Cell> = {
        Q: { verdict: "FAIL" },
        W: { verdict: "FAIL" },
        E: { verdict: "FAIL" },
        R: { verdict: "FAIL" },
        EX: { verdict: "FAIL" },
        basic: { verdict: "FAIL" },
      };
      let basicProjectile: boolean | undefined;
      let basicRangedFlag: boolean | undefined;

      if (spawnOk) {
        for (const slot of SLOTS) cells[slot] = testSlot(id, slot);
        const b = testBasic(id);
        cells.basic = b.cell;
        basicProjectile = b.projectile;
        basicRangedFlag = b.rangedFlag;
      } else {
        const failCell: Cell = { verdict: "FAIL", reason: "champion failed to spawn" };
        for (const slot of ["Q", "W", "E", "R", "EX", "basic"] as SlotName[]) cells[slot] = failCell;
      }

      results.push({
        id,
        name,
        attackType,
        spawnOk,
        spawnError,
        cells,
        basicProjectile,
        basicRangedFlag,
      });
    }

    // Regenerate the diagnostic FIRST, so the report on disk describes the run
    // even when the assertions below go red — that report is how you find out
    // which cell moved.
    writeReport();

    const t = tally();
    const stale =
      contentVersion === MEASURED_CONTENT_VERSION
        ? ""
        : ` (NOTE: floor was measured ${MEASURED_ON} against contentVersion ` +
          `${MEASURED_CONTENT_VERSION}; this run loaded ${contentVersion} — if the ` +
          `content legitimately changed, RE-MEASURE and move the floor, in the same ` +
          `commit as docs/todo/castability.md)`;

    // ---- the sweep must have actually run over the whole roster ----
    expect(roster.length).toBeGreaterThanOrEqual(48); // owner-curated whitelist may add heroes (e.g. #100 喪標麥可)
    expect(results.length).toBe(roster.length);
    expect(t.totalCells).toBe(roster.length * COLS.length);
    expect(results.filter((r) => !r.spawnOk).map((r) => r.id)).toEqual([]);

    // ---- the window must outlive the longest wind-up the content authors ----
    // Without this, a newly authored slower cast silently reads as a no-op (the
    // exact bug that put a phantom FAIL in the ledger for godie-u00n.r).
    expect(WINDOW).toBeGreaterThan(maxCastTicks);

    // ---- NAMED failures: exact set, so a regression arrives as a name ----
    expect(t.failing.join(", ") || "(none)").toBe(
      [...KNOWN_FAILING].sort().join(", ") || "(none)",
    );

    // ---- and the count floor, so nothing can rot underneath the name check ----
    expect(
      t.pass,
      `PASS cells dropped below the measured floor${stale}. See docs/_castability-128.md`,
    ).toBeGreaterThanOrEqual(MIN_PASS);
    expect(
      t.pass + t.passive,
      `working cells (PASS + verified permanent PASSIVE) dropped below the ` +
        `measured floor${stale}. See docs/_castability-128.md`,
    ).toBeGreaterThanOrEqual(MIN_WORKING);
  });
});

// ------------------------------------------------------------------- reporting

function mark(c: Cell): string {
  if (c.verdict === "PASS") return "✅";
  if (c.verdict === "PASSIVE") return "🟣";
  return "❌";
}

interface Failure {
  id: string;
  name: string;
  slot: SlotName;
  cell: Cell;
  atk: string;
}

/**
 * Single count of the matrix, shared by the assertions and the report so the
 * ledger and the ratchet can never be computed two different ways.
 * `failing` is the sorted `<championId>:<slot>` key set the assertions compare.
 */
function tally(): {
  totalCells: number;
  pass: number;
  passive: number;
  fail: number;
  failures: Failure[];
  failing: string[];
} {
  const totalCells = results.length * COLS.length;
  let pass = 0;
  let passive = 0;
  let fail = 0;
  const failures: Failure[] = [];
  for (const r of results) {
    for (const slot of COLS) {
      const c = r.cells[slot];
      if (c.verdict === "PASS") pass++;
      else if (c.verdict === "PASSIVE") passive++;
      else {
        fail++;
        failures.push({ id: r.id, name: r.name, slot, cell: c, atk: r.attackType });
      }
    }
  }
  return {
    totalCells,
    pass,
    passive,
    fail,
    failures,
    failing: failures.map((f) => `${f.id}:${f.slot}`).sort(),
  };
}

function writeReport(): void {
  const cols = COLS;
  const { totalCells, pass, passive, fail, failures } = tally();

  // channel tally over PASS cells — proves the sweep detects real gameplay
  // channels, not just the cosmetic vfxSpawn that most abilities also carry.
  const channelTally = new Map<string, number>();
  let vfxOnly = 0;
  for (const r of results) {
    for (const slot of cols) {
      const c = r.cells[slot];
      if (c.verdict === "PASS" && c.channel) {
        channelTally.set(c.channel, (channelTally.get(c.channel) ?? 0) + 1);
        if (c.channel === "vfx") vfxOnly++;
      }
    }
  }

  const spawnFails = results.filter((r) => !r.spawnOk);
  const melee = results.filter((r) => r.attackType === "melee");
  const ranged = results.filter((r) => r.attackType === "ranged");
  const rangedProj = ranged.filter((r) => r.basicProjectile === true).length;
  const meleeDirect = melee.filter((r) => r.basicProjectile === false && r.cells.basic.verdict === "PASS").length;

  // skillshot casts by attackType (the other place ranged/melee identity shows)
  let ssMelee = 0;
  let ssRanged = 0;
  for (const r of results) {
    for (const slot of ["Q", "W", "E", "R", "EX"] as SlotName[]) {
      if (r.cells[slot].castType === "skillshot") {
        if (r.attackType === "ranged") ssRanged++;
        else ssMelee++;
      }
    }
  }

  const L: string[] = [];
  L.push("# 技能 in-game 可施放覆蓋矩陣 — Task #128");
  L.push("");
  L.push(`> 生成於 \`packages/shared/src/sim/castabilitySweep.test.ts\`（每次跑測試即重算）。`);
  L.push(
    "> 這是**診斷**：把 48 位英雄每一格 Q/W/E/R/EX + 普攻在真的 SimWorld 裡按下去，量測有沒有真的產生效果" +
      "（傷害／投射物／狀態／護盾／補血／補魔／位移／特效），不修任何技能。",
  );
  L.push(
    `> 同時是**棘輪**：測試釘住已量測的下限（PASS ≥ ${MIN_PASS}、PASS+PASSIVE ≥ ${MIN_WORKING}）` +
      `與具名的已知失敗集合（目前${KNOWN_FAILING.length === 0 ? "為空" : "：" + KNOWN_FAILING.join("、")}），` +
      "任何一格退化都會讓測試變紅並指名是哪一格。",
  );
  L.push(`> 本次 contentVersion：\`${contentVersion}\`（下限量測基準 \`${MEASURED_CONTENT_VERSION}\`，${MEASURED_ON}）。`);
  L.push("");
  L.push("## 判定圖例");
  L.push("");
  L.push("| 標記 | 意義 |");
  L.push("| --- | --- |");
  L.push("| ✅ PASS | 施放被接受且量到實際效果，過程無例外 |");
  L.push("| 🟣 PASSIVE | WC3 永久被動（原生 Cool=0、無可施放效果）；已驗證其 ModifierSource 確實掛上，非 bug |");
  L.push("| ❌ FAIL | 被拒絕／丟例外／接受了卻沒有任何可量測效果（no-op）；或英雄無法生成 |");
  L.push("");
  L.push("## 總計");
  L.push("");
  L.push(`- **格數**：48 英雄 × 6 槽 = **${totalCells}**`);
  L.push(
    `- **✅ PASS：${pass} / ${totalCells}**（${((pass / totalCells) * 100).toFixed(1)}%）` +
      `　🟣 PASSIVE：${passive}　❌ FAIL：${fail}`,
  );
  L.push(
    `- 把「正確的永久被動」算進可接受行為：**${pass + passive} / ${totalCells}**` +
      `（${(((pass + passive) / totalCells) * 100).toFixed(1)}%）如預期運作，` +
      (fail === 0 ? "**沒有任何一格是缺口**。" : `只有 **${fail}** 格是真正的缺口。`),
  );
  L.push(`- 英雄生成失敗：**${spawnFails.length}**` + (spawnFails.length ? `（${spawnFails.map((r) => r.id).join(", ")}）` : "（無）"));
  L.push("");
  L.push("## 近戰 vs 遠程（attackType 維度）");
  L.push("");
  L.push(`- 名單：**近戰 ${melee.length}**、**遠程 ${ranged.length}**。`);
  L.push(
    `- **普攻形態**：遠程英雄中 **${rangedProj}/${ranged.length}** 的普攻確實射出投射物（\`projectileSpawn\`、事件 \`ranged:true\`）；` +
      `近戰英雄中 **${meleeDirect}/${melee.length}** 的普攻是貼身直接傷害（無投射物、\`ranged:false\`）。` +
      "這正是遠程與近戰在普攻上的行為差異，兩邊都被本次量到。",
  );
  L.push(
    `- **技能投射（skillshot castType）**：本名單中 skillshot 技能格 遠程 ${ssRanged} 格、近戰 ${ssMelee} 格；` +
      "skillshot 一律用施法方向生成投射物，與施法者是遠程或近戰無關（castType 獨立於 attackType）。",
  );
  L.push("");
  L.push("## PASS 觸發頻道分佈（驗證非橡皮圖章）");
  L.push("");
  L.push(
    "> 每個 ✅ 記錄它**第一個**被觸發的頻道（傷害＞投射物＞補血＞補魔＞護盾＞狀態＞buff＞位移＞特效）。" +
      "若全靠 `vfx` 過關代表量測太寬鬆；下表證明絕大多數是真正的 gameplay 頻道。",
  );
  L.push("");
  L.push("| 頻道 | PASS 格數 |");
  L.push("| --- | --: |");
  for (const [ch, n] of [...channelTally.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`| ${ch} | ${n} |`);
  }
  L.push("");
  L.push(`- 僅靠 \`vfx\`（純特效、無 gameplay 頻道）過關：**${vfxOnly}** 格` + (vfxOnly ? "（下方以註記標出）" : "。"));
  L.push("");
  L.push("## 矩陣");
  L.push("");
  L.push("| 英雄 | ID | 型 | Q | W | E | R | EX | 普攻 |");
  L.push("| --- | --- | --- | :-: | :-: | :-: | :-: | :-: | :-: |");
  for (const r of results) {
    const atk = r.attackType === "ranged" ? "遠" : "近";
    const row = cols.map((s) => mark(r.cells[s])).join(" | ");
    L.push(`| ${r.name} | \`${r.id}\` | ${atk} | ${row} |`);
  }
  L.push("");
  L.push("## FAIL 清單（英雄 + 槽 + 原因，交給技能保真／VFX 負責人）");
  L.push("");
  if (failures.length === 0) {
    L.push("（無 — 全部 ✅/🟣）");
  } else {
    L.push("| 英雄 | ID | 槽 | castType | 型 | 原因 |");
    L.push("| --- | --- | --- | --- | --- | --- |");
    for (const f of failures) {
      const atk = f.atk === "ranged" ? "遠" : "近";
      L.push(
        `| ${f.name} | \`${f.id}\` | ${f.slot} | ${f.cell.castType ?? "—"} | ${atk} | ${f.cell.reason ?? "—"} |`,
      );
    }
  }
  L.push("");
  L.push("## 🟣 永久被動清單（非 bug，僅供對照）");
  L.push("");
  const passives = results.flatMap((r) =>
    (["Q", "W", "E", "R", "EX"] as SlotName[])
      .filter((s) => r.cells[s].verdict === "PASSIVE")
      .map((s) => ({ r, s })),
  );
  if (passives.length === 0) {
    L.push("（無）");
  } else {
    L.push("| 英雄 | ID | 槽 | 掛載 |");
    L.push("| --- | --- | --- | --- |");
    for (const { r, s } of passives) {
      L.push(`| ${r.name} | \`${r.id}\` | ${s} | ${r.cells[s].channel} |`);
    }
  }
  L.push("");
  L.push("## 方法與抽樣說明");
  L.push("");
  L.push(
    "- 每一格用一個**全新的 SimWorld**（SKELETON_ARENA）跑，避免冷卻／增益／狀態互相污染；" +
      "施法者 + 一個敵方假人（射程內、貼身 1.35u）+ 一個友方假人（給只能指向友軍的補血／護盾／增益）。",
  );
  L.push(
    "- 依 castType 擺位：targeted→貼身敵人（友軍向技能→貼身友軍）、ground→敵人所在點、skillshot／dash→朝敵人、self→自己。",
  );
  L.push(
    "- 「有效果」= 下列任一頻道被觸發且無例外：`damage`／`heal`／`manaRestore`／`projectileSpawn`／`vfxSpawn`／`knockdown` 事件，" +
      "或全場護盾／狀態／buff 來源／投射物數量上升，或施法者位移（dash）。回血／回魔前先把目標降到半血半魔，確保有回復空間；" +
      "施法者法力設為剛好夠付，使自我回魔也量得到。被動回血（RegenSystem）不發 `heal` 事件，故不會誤判。",
  );
  L.push(
    `- 每次施放後步進 **${WINDOW} tick**＝**內容中最長施法前搖 ${maxCastTicks} tick**（\`${(maxCastTicks / TICK_HZ).toFixed(2)}s\`）＋ ${SETTLE_TICKS} tick 結算餘裕；` +
      `視窗由內容推導，不是寫死的常數（舊版寫死 26 tick，剛好比 0.9s 前搖短 1 tick，把 \`godie-u00n\` 的 R 誤判成 no-op）。` +
      `普攻給 **${BASIC_WINDOW} tick** 讓第一次揮擊落地。`,
  );
  L.push(
    "- 狀態面（護盾／狀態／buff／投射物）取**視窗內的峰值**而非結束時的值，避免短效果在視窗結束前就過期而被誤判成 no-op。",
  );
  L.push(
    `- **完整跑遍全 48 英雄 × 6 槽 = 288 格，無抽樣**。本測試同時是棘輪：任一格退化會讓 \`pnpm --filter @ggd/shared exec vitest run\` 變紅，` +
      `並具名指出是哪一格（下限：PASS ≥ ${MIN_PASS}、PASS+PASSIVE ≥ ${MIN_WORKING}；已知失敗集合以精確比對）。`,
  );
  L.push("");

  writeFileSync(REPORT, L.join("\n"), "utf8");
}
