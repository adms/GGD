/**
 * AUTO-ATTACK CENSUS — every champion, spawned for real, given no orders.
 *
 * WHY THIS EXISTS, given that #221 already shipped with tests.
 * `autoAcquire.test.ts` proves the RULE (sim/targeting.ts) with a hand-built
 * `spawnFighter` probe: `championId: "probe"`, no ChampionDef in the registry,
 * `Stat.AttackSpeed` hard-set to 0.5, `Stat.AttackRange` passed in as an
 * argument. `castabilitySweep.test.ts` proves the SWING, but it force-writes
 * `world.nav.get(caster)!.attackTarget = foe` on every tick of its window —
 * i.e. it hands the champion the very target that auto-acquire is supposed to
 * find, so it can never observe an acquisition failure.
 *
 * Neither harness ever walks a REAL champion doc through the real
 * `spawnChampion` → `recomputeStats` → `orderSystem` → `basicAttackSystem`
 * path with an empty intent frame. That is exactly the gap the owner fell into
 * ("Saber 似乎不會自動攻擊"), so this file closes it: for EVERY registered
 * champion it spawns the real thing, puts one real enemy in front of it, sends
 * NO intents at all, and records whether a basic attack ever lands.
 *
 * TWO SCENARIOS PER CHAMPION
 *   IN-RANGE  — the enemy starts at 70% of the champion's own effective reach.
 *               A champion that does not damage it has an ACQUISITION or a
 *               SWING bug; no walking is involved.
 *   APPROACH  — the enemy starts just inside the acquisition radius but OUTSIDE
 *               reach. A champion that does not damage it never closed the gap
 *               (auto-attack must include auto-approach — see
 *               `targeting.ts MELEE_ACQUIRE_FLOOR`).
 *
 * The enemy is a real champion too (the same 麻婆 punching bag #128 uses),
 * pinned in place (MoveSpeed → epsilon) and topped back up to full HP every
 * tick so it can never die and end the measurement early.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { normalizeCombatEnv, type CombatEnvKey } from "./combatEnv";
import { Stat } from "./stats/statTypes";
import { reachTo } from "./systems/BasicAttackSystem";
import { acquireRadius } from "./targeting";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const CONTENT_DIR = join(ROOT, "content");
const REPORT = join(ROOT, "docs/_auto-attack-census.md");

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
/** The clear lane autoAcquire.test.ts uses: +12 z clears the r1.8 pillars. */
const LANE_Z = Z0.center.z + 12;
/** Punching bag: a robust melee bruiser with a real doc (same as #128). */
const DUMMY = "godie-hart" as ChampionId;
/** Ticks per scenario. 300 = 10 s at 30 Hz — several swings at any cadence. */
const TICKS = 300;
const IMMOBILE = 1e-9;

interface Row {
  id: string;
  name: string;
  attackType: string;
  /** effective Stat.AttackRange after the pipeline */
  range: number;
  attackSpeed: number;
  baseAttackTime: number;
  damagePointSec: number;
  ad: number;
  inRangeHits: number;
  approachHits: number;
  /** did it ever hold a target in the IN-RANGE run? */
  acquired: boolean;
  /** did a swing ever start (attackWindup / basicAttack) in the IN-RANGE run? */
  swung: boolean;
  error?: string;
}

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

/** The shipped operator table (content/config/combat-env.json), or defaults. */
function shippedEnv(): ReturnType<typeof normalizeCombatEnv> {
  const doc = Configs.tryGet("combat-env") as
    | { multipliers?: Partial<Record<CombatEnvKey, number>> }
    | undefined;
  return normalizeCombatEnv(doc?.multipliers);
}

interface Run {
  hits: number;
  acquired: boolean;
  swung: boolean;
  range: number;
  attackSpeed: number;
  ad: number;
}

/**
 * One scenario. `gapOf` receives the champion's own reach + acquisition radius
 * and answers where to plant the enemy.
 */
function run(
  championId: ChampionId,
  gapOf: (reach: number, radius: number) => number,
): Run {
  const world = new SimWorld(SKELETON_ARENA, 20260726);
  world.combatEnv = shippedEnv();
  world.combatActive = true;

  const me = spawnChampion(world, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: LANE_Z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: DUMMY,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x, z: LANE_Z },
    zone: 0,
  });

  const sc = world.stats.get(me)!;
  const myT = world.transform.get(me)!;
  const foeT = world.transform.get(foe)!;
  const reach = reachTo(sc, myT.radius, foeT.radius);
  const radius = acquireRadius(sc, myT.radius);
  const gap = gapOf(reach, radius);
  foeT.pos = { x: Z0.center.x + gap, z: LANE_Z };

  // pin the bag: it must not charge us, and it must not die
  world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
  const foeHp = world.health.get(foe)!;

  let hits = 0;
  let acquired = false;
  let swung = false;
  for (let i = 0; i < TICKS; i++) {
    foeHp.hp = foeHp.maxHp;
    world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
    world.step(NO_INTENTS);
    if (world.nav.get(me)!.attackTarget !== null) acquired = true;
    for (const e of world.events) {
      const d = e.data as { source?: EntityId; origin?: string };
      if (e.type === "basicAttack" && d.source === me) swung = true;
      if (e.type === "attackWindup" && d.source === me) swung = true;
      if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  return {
    hits,
    acquired,
    swung,
    range: sc.final[Stat.AttackRange],
    attackSpeed: sc.final[Stat.AttackSpeed],
    ad: sc.final[Stat.AttackDamage],
  };
}

const rows: Row[] = [];

describe("auto-attack census (every champion, no orders)", () => {
  it("sweeps every registered champion in both scenarios", () => {
    for (const def of Champions.all()) {
      try {
        const inRange = run(def.id, (reach) => reach * 0.7);
        const approach = run(def.id, (reach, radius) =>
          Math.max(reach * 1.15, Math.min(radius * 0.95, reach + 3)),
        );
        rows.push({
          id: def.id,
          name: def.name,
          attackType: def.attackType,
          range: inRange.range,
          attackSpeed: inRange.attackSpeed,
          baseAttackTime: def.baseAttackTime ?? 1.0,
          damagePointSec:
            def.attackDamagePoint ?? (def.attackType === "ranged" ? 0.3 : 0.25),
          ad: inRange.ad,
          inRangeHits: inRange.hits,
          approachHits: approach.hits,
          acquired: inRange.acquired,
          swung: inRange.swung,
        });
      } catch (err) {
        rows.push({
          id: def.id,
          name: def.name,
          attackType: def.attackType,
          range: 0,
          attackSpeed: 0,
          baseAttackTime: 0,
          damagePointSec: 0,
          ad: 0,
          inRangeHits: 0,
          approachHits: 0,
          acquired: false,
          swung: false,
          error: (err as Error).message,
        });
      }
    }
    expect(rows.length).toBeGreaterThan(100);

    const broken = rows.filter((r) => r.inRangeHits === 0);
    const noApproach = rows.filter((r) => r.inRangeHits > 0 && r.approachHits === 0);

    const lines: string[] = [];
    lines.push("# 自動攻擊普查 (auto-attack census)");
    lines.push("");
    lines.push(`- champions swept: **${rows.length}**`);
    lines.push(`- 射程內不會自動攻擊: **${broken.length}**`);
    lines.push(`- 射程內會打、但不會自動接近: **${noApproach.length}**`);
    lines.push(`- ticks per scenario: ${TICKS} (${TICKS / 30}s @30Hz)`);
    lines.push("");
    lines.push("| id | 名稱 | 類型 | 射程 | 攻速 | BAT | 傷害點(s) | AD | 射程內命中 | 接近後命中 | 取得目標 | 揮擊 |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rows.slice().sort((a, b) => a.inRangeHits - b.inRangeHits || a.id.localeCompare(b.id))) {
      lines.push(
        `| ${r.id} | ${r.name} | ${r.attackType} | ${r.range.toFixed(2)} | ${r.attackSpeed.toFixed(
          3,
        )} | ${r.baseAttackTime} | ${r.damagePointSec} | ${r.ad.toFixed(1)} | ${r.inRangeHits} | ${
          r.approachHits
        } | ${r.acquired ? "Y" : "N"} | ${r.swung ? "Y" : "N"} |${r.error ? ` ${r.error}` : ""}`,
      );
    }
    writeFileSync(REPORT, lines.join("\n") + "\n", "utf8");

    // THE GATE: no shipped champion may be unable to auto-attack an enemy that
    // is standing inside its own reach with nothing else going on.
    expect(broken.map((r) => `${r.id} ${r.name}`)).toEqual([]);
  }, 600_000);
});
