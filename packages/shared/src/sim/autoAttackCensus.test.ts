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
import { readdirSync, writeFileSync } from "node:fs";
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
/**
 * 母體 = `content/champions/` 裡真的出貨的那些文件,**推導出來的,不是一個數字**。
 *
 * 這條原本是 `expect(rows.length).toBeGreaterThan(100)`,而 100 是 2026-07 出貨
 * 頭數(119 位)的近似值。2026-08-13 未上架英雄整批搬進 `content/_legacy/`
 * (營運母體 119 → 78,而 `_legacy` 不在 `COLLECTION_NAMES` 裡、引擎讀不到)之後,
 * 那條就用「英雄變少了」這種和普查本身毫無關係的訊息紅掉 —— CLAUDE.md 講的
 * 「第四個住處」。
 *
 * 換成從內容目錄推導之後這條**變強**了:它不再只是「列數夠多」,而是
 * 「出貨的每一份英雄文件都真的被掃過」。兩種真故障都會在這裡紅 ——
 * 內容載入失敗退回骨架(2 位),或掃描迴圈中途少掃了誰。
 */
function shippedChampionDocCount(): number {
  return readdirSync(join(CONTENT_DIR, "champions")).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_"),
  ).length;
}
const Z0 = SKELETON_ARENA.zones[0]!;
/** The clear lane autoAcquire.test.ts uses: +12 z clears the r1.8 pillars. */
const LANE_Z = Z0.center.z + 12;
/** Punching bag: a robust melee bruiser with a real doc (same as #128). */
const DUMMY = "godie-hart" as ChampionId;
/** Ticks per scenario. 300 = 10 s at 30 Hz — several swings at any cadence. */
const TICKS = 300;
const SECONDS = TICKS / 30;
const IMMOBILE = 1e-9;

/**
 * THE RATE FLOOR (task #274).
 *
 * The gate used to be `inRangeHits === 0`, which is a LIVENESS test, not a
 * FUNCTIONING one: a champion that lands ONE blow in ten seconds — one in
 * sixty, even — passed it silently and was never named. Ten seconds is several
 * swings at every cadence on the roster, so the honest question is not "did it
 * swing at all" but "did it swing as often as its OWN attack speed says it
 * should".
 *
 * The expectation is therefore per-champion, derived from the champion's own
 * numbers rather than a global constant that would punish slow weapons:
 *
 *     interval  = baseAttackTime / AttackSpeed        (seconds between swings)
 *     expected  = floor((window - damagePoint) / interval) + 1
 *
 * `expected` is the number of damage points that fit in the window when nothing
 * goes wrong. `rate = inRangeHits / expected`.
 *
 * MEASURED DISTRIBUTION over the 113 shipped champions (2026-07-26, shipped
 * combat-env): median 0.88, max 1.00, p10 0.57, p05 0.43, min 0.14. The bulk of
 * the roster sits at or near 1.0, so 0.5 — "lands at least half the blows its
 * own cadence allows" — is well clear of ordinary variance and still catches
 * every champion that is functionally not attacking.
 */
const RATE_FLOOR = 0.5;

/**
 * The champions that are BELOW the floor today, with the rate measured when
 * this ratchet was written. They are NOT a whitelist of acceptable behaviour —
 * they are a debt list, and this file fails if it grows OR if an entry is
 * fixed and left behind.
 *
 * Root cause found while writing the gate (traced on godie-u011, the worst of
 * them): a committed melee wind-up is PAUSED by combat-juice hitstop/hitstun
 * while the target is simultaneously shoved out of reach by knockback, so
 * BasicAttackSystem cancels the swing at the damage point — after the FULL
 * attack interval has already been charged. Champions with a long
 * `attackDamagePoint` (0.4-0.5 s) sit at the bottom of the list for exactly
 * that reason. The fix belongs in BasicAttackSystem / the combat-juice
 * knockback, not here, and it is deliberately NOT part of #274.
 *
 * ---------------------------------------------------------------------------
 * 2026-07-28, GH#193 —— 六位剩一位
 * ---------------------------------------------------------------------------
 * 擊退改成「傷害佔受傷單位最大生命的百分比,再減掉攻守雙方距離」(sim/combatFeel.ts)
 * 之後,這份債務清單從 6 位掉到 1 位,而且最差的那位從 0.14 升到 0.43:
 *
 *     godie-zombiex  0.29 → 1.00     godie-naka  0.43 → 0.86
 *     godie-hpb1     0.43 → 1.00     godie-udea  0.43 → 0.86
 *     godie-h01u     0.43 → 0.71     godie-u011  0.14 → 0.43  ← 還在名單上
 *
 * 關鍵不只是新法則本身,還有「減距離要**套在作者的 hitFeel 覆寫之後**」:出貨
 * 內容裡 114/115 位英雄的普攻都帶著一個 `hitFeel.knockbackMag`,覆寫若跳過減法,
 * 這條新法則對普攻完全無效,這份清單一個人都不會好。
 *
 * u011 為什麼還在 —— 逐 tick 追蹤(工具在這一版的 commit 訊息裡)顯示,他剩下的
 * 兩次取消**不是**「普攻的碎屑擊退」,而是木樁一發 194.5 impact 的技能:
 *
 *     u011 的最大生命只有 537,所以那一下是 **36%**
 *       → 新法則算出 3.62 身位 − 1.2 的距離 = 2.42 的擊退(這是**對的**,
 *         打掉三分之一血的一擊本來就該把人轟開)
 *       → 同一發還帶 knockdown(13 tick)與 stun,兩者都會硬取消前搖
 *
 * 也就是說他的 0.43 現在是「被大招打斷」,不是「被自己打出的碎屑擊退卡死」。
 * 要再往上只能改控制技與前搖的交互(前搖被硬控取消時要不要退還冷卻),那是
 * 另一個題目,不在 #193 範圍,所以他留在這張清單上等人裁決。
 */
const KNOWN_BELOW_RATE = new Map<string, string>([
]);

/** Swings whose damage point fits in the window at this champion's cadence. */
function expectedHits(attackSpeed: number, baseAttackTime: number, damagePoint: number): number {
  const interval = baseAttackTime / Math.max(0.01, attackSpeed);
  if (!(interval > 0)) return 1;
  return Math.floor((SECONDS - damagePoint) / interval) + 1;
}

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
    // 儀器自檢:出貨的每一份英雄文件都被掃到了(見 `shippedChampionDocCount`)。
    const shipped = shippedChampionDocCount();
    expect(shipped).toBeGreaterThan(0); // 內容目錄不是空的
    expect(rows.length).toBe(shipped); // 一份都沒漏

    const broken = rows.filter((r) => r.inRangeHits === 0);
    const noApproach = rows.filter((r) => r.inRangeHits > 0 && r.approachHits === 0);
    const rated = rows.map((r) => {
      const exp = expectedHits(r.attackSpeed, r.baseAttackTime, r.damagePointSec);
      return { ...r, expected: exp, rate: exp > 0 ? r.inRangeHits / exp : 0 };
    });
    const slow = rated
      .filter((r) => r.rate < RATE_FLOOR)
      .sort((a, b) => a.rate - b.rate || a.id.localeCompare(b.id));

    const lines: string[] = [];
    lines.push("# 自動攻擊普查 (auto-attack census)");
    lines.push("");
    lines.push(`- champions swept: **${rows.length}**`);
    lines.push(`- 射程內不會自動攻擊: **${broken.length}**`);
    lines.push(`- 射程內會打、但不會自動接近: **${noApproach.length}**`);
    lines.push(
      `- 射程內攻擊**速率**低於自身節奏 ${Math.round(RATE_FLOOR * 100)}%: **${slow.length}**`,
    );
    lines.push(`- ticks per scenario: ${TICKS} (${SECONDS}s @30Hz)`);
    lines.push("");
    lines.push(
      "> 「期望」= 以該英雄自己的攻速算出、10 秒內放得下的傷害點數量：" +
        "`floor((10 - 傷害點) / (BAT / 攻速)) + 1`。速率 = 實際命中 / 期望。",
    );
    if (slow.length > 0) {
      lines.push("");
      lines.push(`## 未達速率門檻（<${RATE_FLOOR}）`);
      lines.push("");
      lines.push(
        "> 已知成因（以剩下的 godie-u011 逐 tick 追蹤取證，GH#193 之後重驗）：" +
          "**不再是**「自己打出的碎屑擊退把目標推出射程」—— 那個成因在擊退改成" +
          "「傷害佔最大生命的百分比、再減掉攻守雙方距離」之後就消失了（清單 6 位 → 1 位，" +
          "最差的從 0.14 升到 0.43）。u011 剩下的取消來自木樁一發 194.5 impact 的技能：" +
          "他只有 537 血，那一下是 36%，依法則推 2.42 身位是**對的**，但同一發還帶 " +
          "knockdown（13 tick）與 stun，兩者都會硬取消前搖，而整段攻擊間隔的冷卻早已扣掉。" +
          "也就是說他現在是「被大招打斷」，不是「被自己的碎屑擊退卡死」。" +
          "要再往上只能改硬控與前搖的交互（前搖被硬控取消時要不要退還冷卻），那是另一個題目。",
      );
      lines.push("");
      lines.push("| id | 名稱 | 傷害點(s) | 期望 | 實際 | 速率 |");
      lines.push("|---|---|--:|--:|--:|--:|");
      for (const r of slow) {
        lines.push(
          `| ${r.id} | ${r.name} | ${r.damagePointSec} | ${r.expected} | ${r.inRangeHits} | ${r.rate.toFixed(2)} |`,
        );
      }
    }
    lines.push("");
    lines.push("| id | 名稱 | 類型 | 射程 | 攻速 | BAT | 傷害點(s) | AD | 射程內命中 | 期望 | 速率 | 接近後命中 | 取得目標 | 揮擊 |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rated.slice().sort((a, b) => a.rate - b.rate || a.id.localeCompare(b.id))) {
      lines.push(
        `| ${r.id} | ${r.name} | ${r.attackType} | ${r.range.toFixed(2)} | ${r.attackSpeed.toFixed(
          3,
        )} | ${r.baseAttackTime} | ${r.damagePointSec} | ${r.ad.toFixed(1)} | ${r.inRangeHits} | ${
          r.expected
        } | ${r.rate.toFixed(2)} | ${r.approachHits} | ${r.acquired ? "Y" : "N"} | ${
          r.swung ? "Y" : "N"
        } |${r.error ? ` ${r.error}` : ""}`,
      );
    }
    writeFileSync(REPORT, lines.join("\n") + "\n", "utf8");

    // GATE 1 — LIVENESS: no shipped champion may be unable to auto-attack an
    // enemy standing inside its own reach with nothing else going on.
    expect(broken.map((r) => `${r.id} ${r.name}`)).toEqual([]);

    // GATE 2 — RATE (task #274). A shrink-only ratchet: the set of champions
    // below the floor must be EXACTLY the known-debt list.
    //   · a NEW id here is a regression — something made a champion stop
    //     swinging at its own cadence;
    //   · a MISSING id means somebody fixed one and left the entry behind, and
    //     leaving it would let the champion silently regress again later.
    const slowIds = slow.map((r) => r.id).sort();
    const knownIds = [...KNOWN_BELOW_RATE.keys()].sort();
    const regressed = slowIds.filter((id) => !KNOWN_BELOW_RATE.has(id));
    const stale = knownIds.filter((id) => !slowIds.includes(id));
    expect(
      regressed.map((id) => {
        const r = rated.find((x) => x.id === id)!;
        return `NEW below-rate champion ${id} ${r.name}: ${r.inRangeHits}/${r.expected} = ${r.rate.toFixed(2)}`;
      }),
    ).toEqual([]);
    expect(
      stale.map((id) => `FIXED — delete from KNOWN_BELOW_RATE: ${id} ${KNOWN_BELOW_RATE.get(id)}`),
    ).toEqual([]);
  }, 600_000);
});
