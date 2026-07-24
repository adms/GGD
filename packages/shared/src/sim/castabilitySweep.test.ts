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
 * WHERE THE ROSTER COMES FROM. From TRACKED source: `starterChampions` in
 * apps/platform/internal/curation/starter.go, the hand-picked 48 a fresh
 * install seeds into the whitelist (see testkit/starterRoster.ts). It used to
 * read `data/curation/whitelist.json` — live operator state, `.gitignore`d —
 * which existed only on the owner's machine, so in every fresh clone, worktree
 * and CI run this suite died of ENOENT inside `beforeAll` and reported "1
 * skipped": it had never once verified a castability assertion off that
 * machine. The operator whitelist is still honoured where it exists, but only
 * ADDITIVELY: champions it enables beyond the tracked 48 are swept too and
 * flagged in the report, and they are excluded from the pinned counts so the
 * gates below mean the same thing everywhere.
 *
 * OUTPUT. The pass/fail matrix + summary + failure list is written to
 * docs/_castability-128.md every run, so the ability-fidelity / VFX owners have
 * a live diagnostic they can re-generate.
 *
 * WHAT GOES RED. This is a MEASUREMENT harness and it fixes nothing, but a
 * diagnostic that can never fail is the same dead weight as one that never
 * runs, so three gates hold over the tracked roster:
 *   1. the sweep runs end-to-end — all 48 champions, 6 cells each;
 *   2. EVERY champion spawns (a champion that cannot enter a SimWorld is not a
 *      content no-op, it is broken content or a broken loader);
 *   3. a RATCHET on working cells (✅ PASS + 🟣 verified PASSIVE) — the floor is
 *      today's measurement (287 of 288), so a regression that kills a slot goes
 *      red while the one known no-op stays in the report as a finding rather
 *      than as a failure. Raise the floor when the number improves; never lower
 *      it to make a red run green.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { readStarterRoster, STARTER_GO_REL } from "../../testkit/starterRoster";
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
import type { AbilityDef, CastType } from "./content/defs";
import type { AbilitySlot, CastTarget, CoreAbilitySlot } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../.."); // packages/shared/src/sim -> repo root
const CONTENT_DIR = join(ROOT, "content");
/** DEV-ONLY operator state (gitignored). Additive; never required — see below. */
const WHITELIST = join(ROOT, "data/curation/whitelist.json");
const REPORT = join(ROOT, "docs/_castability-128.md");

/** The tracked roster is pinned at 48 by Go's TestFirstOpenRoster. */
const ROSTER_SIZE = 48;
/**
 * RATCHET FLOOR — working cells (✅ PASS + 🟣 verified PASSIVE) over the 48
 * tracked champions × 6 slots = 288. Measured 2026-07-24 at 287/288 (280 PASS +
 * 7 PASSIVE), and the floor sits exactly there, so ANY slot that works today
 * and stops working goes red. The single gap (godie-u00n R — a ground cast
 * accepted with no measurable effect) is itemised in the FAIL table of
 * docs/_castability-128.md and belongs to the ability-fidelity / VFX owners.
 * Raise this to 288 when that one is fixed. Do NOT lower it to green a red run:
 * a drop means a slot that used to fire no longer does.
 */
const WORKING_CELL_FLOOR = 287;

const NO_INTENTS = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
/** North of the zone centre — clear of the three SKELETON_ARENA pillars. */
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
/** Adjacent spacing: bodies are r=0.6, so 1.35 keeps a 0.15u surface gap. */
const ADJ = 1.35;
/** A robust melee bruiser used as the enemy / ally punching bag. */
const DUMMY = "godie-hart" as ChampionId;
/** Max authored cast time is 0.6 s (18 ticks); step comfortably past it. */
const WINDOW = 26;
/** Ticks allowed for the FIRST basic-attack swing to land. */
const BASIC_WINDOW = 40;

const SLOTS: AbilitySlot[] = ["Q", "W", "E", "R", "EX"];
type SlotName = "Q" | "W" | "E" | "R" | "EX" | "basic";

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

const results: ChampResult[] = [];
/** Tracked 48; the operator-only extras swept on top; where each came from. */
let tracked: string[] = [];
let extras: string[] = [];
let rosterSource = "";

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

/**
 * Read the DEV-ONLY operator whitelist, or null when it is absent (every fresh
 * clone, worktree and CI run). Absence is NORMAL and never fails the sweep —
 * but a whitelist that exists and is unreadable/malformed is an operator-state
 * bug worth surfacing, so that throws rather than being swallowed as "absent".
 */
function readOperatorWhitelist(): string[] | null {
  let raw: string;
  try {
    raw = readFileSync(WHITELIST, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const champions = (JSON.parse(raw) as { champions?: unknown }).champions;
  if (!Array.isArray(champions)) {
    throw new Error(`data/curation/whitelist.json has no \`champions\` array — operator state is corrupt`);
  }
  return champions as string[];
}

/**
 * The roster to sweep: the tracked 48, plus anything the operator has enabled
 * beyond them. Throws with an explanation if the tracked source cannot be read
 * — called from inside the test, so that surfaces as a red assertion instead of
 * a collection-time crash that vitest reports as a SKIP.
 */
function resolveRoster(): string[] {
  tracked = readStarterRoster(ROOT);
  const operator = readOperatorWhitelist();
  extras = operator ? operator.filter((id) => !tracked.includes(id)) : [];
  rosterSource = operator
    ? `${STARTER_GO_REL}（${tracked.length}）＋ data/curation/whitelist.json 額外啟用（${extras.length}）`
    : `${STARTER_GO_REL}（${tracked.length}）— 本機無 data/curation/whitelist.json（正常：該檔為 gitignore 的營運狀態）`;
  return [...tracked, ...extras];
}

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

    for (let i = 0; i < WINDOW; i++) {
      world.step(NO_INTENTS);
      events.push(...world.events.map((e) => e.type));
      // re-pin the two dummies so a knockback / shove cannot carry them out of
      // a ground circle before it resolves (the caster is left free so a dash
      // effect can visibly move it).
      world.transform.get(foe)!.pos = { ...foePos };
      world.transform.get(ally)!.pos = { ...allyPos };
    }

    const after = snapshot(world);
    const moved =
      Math.hypot(
        world.transform.get(caster)!.pos.x - casterAnchor.x,
        world.transform.get(caster)!.pos.z - casterAnchor.z,
      ) > 0.2 || world.nav.get(caster)!.override != null;

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
    const roster = resolveRoster();
    expect(
      tracked.length,
      `the tracked first open roster in ${STARTER_GO_REL} is pinned at ${ROSTER_SIZE} ` +
        `champions (Go: TestFirstOpenRoster) but parsed to ${tracked.length}`,
    ).toBe(ROSTER_SIZE);

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

    writeReport();

    // ---- gate 1: the sweep ran end-to-end, every champion, every slot ----
    expect(results.length).toBe(roster.length);
    expect(results.filter((r) => tracked.includes(r.id)).length).toBe(ROSTER_SIZE);
    for (const r of results) {
      expect(Object.keys(r.cells).length).toBe(6);
    }

    // ---- gate 2: every TRACKED champion spawns ----
    // Not a content no-op — a champion that cannot enter a SimWorld is broken
    // content or a broken loader, and it is pickable in champ-select.
    const brokenSpawns = results
      .filter((r) => tracked.includes(r.id) && !r.spawnOk)
      .map((r) => `${r.id} (${r.name}): ${r.spawnError}`);
    expect(brokenSpawns, "first-open-roster champions that fail to spawn").toEqual([]);

    // ---- gate 3: the working-cell ratchet ----
    // Counted over the TRACKED roster only, so an operator's extra picks can
    // never move the number. The known gaps stay findings in the report; a
    // regression that kills a slot that works today goes red here.
    const cols: SlotName[] = ["Q", "W", "E", "R", "EX", "basic"];
    const working = results
      .filter((r) => tracked.includes(r.id))
      .reduce(
        (n, r) => n + cols.filter((s) => r.cells[s].verdict !== "FAIL").length,
        0,
      );
    expect(
      working,
      `working cells (PASS + verified PASSIVE) over ${ROSTER_SIZE}×6=${ROSTER_SIZE * 6} fell to ` +
        `${working}, below the ${WORKING_CELL_FLOOR} floor — see the FAIL table in ` +
        "docs/_castability-128.md for which slot regressed",
    ).toBeGreaterThanOrEqual(WORKING_CELL_FLOOR);
  });
});

// ------------------------------------------------------------------- reporting

function mark(c: Cell): string {
  if (c.verdict === "PASS") return "✅";
  if (c.verdict === "PASSIVE") return "🟣";
  return "❌";
}

function writeReport(): void {
  const cols: SlotName[] = ["Q", "W", "E", "R", "EX", "basic"];
  const totalCells = results.length * cols.length;
  let pass = 0;
  let passive = 0;
  let fail = 0;
  const failures: { id: string; name: string; slot: SlotName; cell: Cell; atk: string }[] = [];

  for (const r of results) {
    for (const slot of cols) {
      const c = r.cells[slot];
      if (c.verdict === "PASS") pass++;
      else if (c.verdict === "PASSIVE") passive++;
      else {
        fail++;
        failures.push({ id: r.id, name: r.name, slot, cell: c, atk: r.attackType });
      }
    }
  }

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
    `> 這是**診斷**：把 ${results.length} 位英雄每一格 Q/W/E/R/EX + 普攻在真的 SimWorld 裡按下去，量測有沒有真的產生效果` +
      "（傷害／投射物／狀態／護盾／補血／補魔／位移／特效），不修任何技能。",
  );
  L.push("");
  L.push(`> **名單來源**：${rosterSource}。`);
  L.push(
    "> 名單取自**版控內**的 `starterChampions`（新安裝套用的首發開放名單，Go 端 `TestFirstOpenRoster` 逐一釘死），" +
      "所以任何 clone／worktree／CI 都掃同一份 48 人；營運白名單 `data/curation/whitelist.json` 是 gitignore 的機器狀態，" +
      "存在時只**加掃**它額外開放的英雄，且不列入下方釘死的計數。",
  );
  if (extras.length) {
    L.push(`> 本機額外加掃（僅營運白名單開放、不在首發名單）：${extras.map((id) => `\`${id}\``).join("、")}。`);
  }
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
  L.push(`- **格數**：${results.length} 英雄 × 6 槽 = **${totalCells}**`);
  L.push(
    `- **✅ PASS：${pass} / ${totalCells}**（${((pass / totalCells) * 100).toFixed(1)}%）` +
      `　🟣 PASSIVE：${passive}　❌ FAIL：${fail}`,
  );
  L.push(
    `- 把「正確的永久被動」算進可接受行為：**${pass + passive} / ${totalCells}**` +
      `（${(((pass + passive) / totalCells) * 100).toFixed(1)}%）如預期運作，只有 **${fail}** 格是真正的缺口。`,
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
    `- 每次施放後步進 **${WINDOW} tick**（>最長施法前搖 0.6s=18 tick）讓有前搖的技能結算；普攻給 **${BASIC_WINDOW} tick** 讓第一次揮擊落地。`,
  );
  L.push(
    `- **完整跑遍全 ${results.length} 英雄 × 6 槽 = ${totalCells} 格，無抽樣**。`,
  );
  L.push(
    "- **會變紅的三道閘**（都只看版控名單那 48 人，營運額外開放的英雄不影響）：" +
      `(1) 掃描必須跑完 48×6；(2) 48 位英雄全部要能生成；(3) 可用格數（✅+🟣）不得低於 **${WORKING_CELL_FLOOR}**（棘輪下限）。` +
      "個別內容 no-op 不會使測試變紅（no-op 本身就是要回報的發現，列在下方 FAIL 清單），但既有可用的格子被改壞會。",
  );
  L.push("");

  writeFileSync(REPORT, L.join("\n"), "utf8");
}
