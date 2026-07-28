/**
 * 喪標麥可（殭屍小怪）控場稽核 —— task #271
 * 「檢查殭屍 喪標麥克 是否有控制技影響英雄施展技能 影響順手度」
 *
 * 這不是一句假設性的斷言，是一次**量測**：用出貨的 `content/config/arena-rules.json`
 * 的 mobWaves 設定，在第 9 場（排程裡最兇的一場：每波 25 隻、單區同時 50 隻上限）
 * 跑 30 秒真戰鬥，數玩家英雄有幾個 tick 落在「不能施法／不能出手」的狀態。
 *
 * 為什麼這四個通道就是「順手度」的全部：
 *   · `castAbility` 只有三個硬閘 —— 死亡、status 的 `stun`、`knockdown > 0`；
 *   · `basicAttackSystem` 另外會被 `hitstun` / `hitstop` 卡住；
 *   · `movementSystem` 被 `root`/`stun` 定住、被 `moveSpeedMult` 減速。
 * 殭屍能對玩家造成的一切影響，只可能經由其中之一。
 *
 * 量測結果（2026-07-28，seed 1234，30 秒 / 900 tick）：
 *   殭屍打中玩家 158 次 → stun 0、root 0、slow 0、knockdown 0、hitstun 0、
 *   而且每一次的 ImpactProfile 都是 hitstop 0 / knockback 0。
 *   玩家被凍住的 51 tick（5.7%）**全部**來自他自己砍殭屍的命中硬直
 *   （17 次命中 × 3 tick，combat-juice #3/#133 的雙方共同硬直，是刻意的手感，
 *   不是殭屍的控制）。所以答案是：查過了，沒有。
 *
 * ⚠️ 範圍：本測試量的是**小怪**（`spawnMob` 那條路徑：無 AbilitiesComp、無
 * StatsComp、無 ChampionComp）。玩家自己選 喪標麥可 當英雄時，他的 Q（減速 30%
 * / 1.5 秒）與 E（定身 1.0 秒）是真的控制技 —— 那是 PvP，不在這條測試範圍內。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { mobRulesFromConfig, type MobWavesConfigLike } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import type { ImpactProfile } from "./combat/damage";
import { TICK_HZ } from "../constants";

beforeAll(() => registerSkeletonContent());

/** 出貨的 arena-rules 來源檔（不是 bundle）—— 稽核必須量真正上線的數字。 */
const ARENA_RULES = join(__dirname, "../../../../content/config/arena-rules.json");

function shippedMobWaves(): MobWavesConfigLike {
  const doc = JSON.parse(readFileSync(ARENA_RULES, "utf8")) as { mobWaves?: MobWavesConfigLike };
  if (!doc.mobWaves) throw new Error("arena-rules.json 沒有 mobWaves —— 稽核失去對象");
  return doc.mobWaves;
}

interface HitImpactData {
  source: EntityId;
  target: EntityId;
  profile: ImpactProfile;
}

/** 一個放了殭屍波、英雄站中央、且英雄不會被打死的戰場。 */
function zombieSiege(round: number, seed: number): { w: SimWorld; hero: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  const zc = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: zc.x, z: zc.z },
    zone: 0,
  });
  beginCombatMobs(w, mobRulesFromConfig(shippedMobWaves(), w.dt, round), [0]);
  return { w, hero };
}

describe("喪標麥可小怪的控場量測 (#271)", () => {
  it("第 9 場 30 秒滿載殭屍：玩家被殭屍控住 0 tick、被減速 0 tick", () => {
    cover("mob-cc-audit");
    const { w, hero } = zombieSiege(9, 1234);
    const hp = w.health.get(hero)!;
    let lastHp = hp.hp;

    const TICKS = TICK_HZ * 30;
    let ccTicks = 0;
    let slowTicks = 0;
    let freezeTicks = 0;
    let peakMobs = 0;
    let damageTaken = 0;
    // 殭屍打在玩家身上的每一發，以及玩家打出去的每一發（對照組）。
    const onHero: ImpactProfile[] = [];
    const byHero: ImpactProfile[] = [];

    for (let i = 0; i < TICKS; i++) {
      w.step(new Map());
      for (const ev of w.events) {
        if (ev.type !== "hitImpact") continue;
        const d = ev.data as unknown as HitImpactData;
        if (d.target === hero) onHero.push(d.profile);
        if (d.source === hero) byHero.push(d.profile);
      }
      // 英雄被打死 mobSystem 就會停手，量測會被腰斬 —— 這條測試量的是「被控多久」
      // 不是「活多久」，所以每 tick 補滿血把他釘在戰場上。
      if (hp.hp < lastHp) damageTaken += lastHp - hp.hp;
      hp.hp = hp.maxHp;
      hp.alive = true;
      lastHp = hp.hp;

      const st = w.status.get(hero);
      if (st?.effects.some((e) => (e.stun || e.root) && e.expiresAtTick > w.tick)) ccTicks++;
      if (
        st?.effects.some(
          (e) => e.expiresAtTick > w.tick && e.moveSpeedMult !== undefined && e.moveSpeedMult < 1,
        )
      ) {
        slowTicks++;
      }
      if ((w.knockdown.get(hero) ?? 0) > 0) ccTicks++;
      if ((w.hitstun.get(hero) ?? 0) > 0) ccTicks++;
      if ((w.hitstop.get(hero) ?? 0) > 0) freezeTicks++;
      if (w.mob.size > peakMobs) peakMobs = w.mob.size;
    }

    // ── 反空轉證據：殭屍真的湧到上限，也真的一直在打他 ───────────────────
    // 少了這三條，下面的 0 可能只是「根本沒有殭屍出現」。
    expect(peakMobs).toBeGreaterThanOrEqual(50);
    expect(onHero.length).toBeGreaterThan(50);
    expect(damageTaken).toBeGreaterThan(0);

    // ── 稽核結論一：殭屍給不出任何控制 ────────────────────────────────
    expect(ccTicks).toBe(0);
    expect(slowTicks).toBe(0);
    // 每一發殭屍打在玩家身上的傷害，硬直/受擊鎖/擊退都是 0：它的 1.2 點傷害在
    // 減傷後遠低於 combat/damage.ts 的 HITSTOP_MIN_IMPACT（12）門檻。
    for (const p of onHero) {
      expect(p.hitstopTicks).toBe(0);
      expect(p.hitstunTicks).toBe(0);
      expect(p.knockbackMag).toBe(0);
    }

    // ── 稽核結論二：那 51 tick 的凍結是玩家**自己**打出來的 ───────────────
    // 對照組。少了這條，「殭屍造成 0 硬直」可能只是因為硬直通道整條是死的。
    expect(byHero.length).toBeGreaterThan(0);
    expect(byHero.some((p) => p.hitstopTicks > 0)).toBe(true);
    expect(freezeTicks).toBeGreaterThan(0);
  });

  it("小怪在結構上不可能施法：沒有 AbilitiesComp / StatsComp / ChampionComp", () => {
    cover("mob-has-no-abilities");
    const { w } = zombieSiege(9, 99);

    let sawMob = false;
    for (let i = 0; i < TICK_HZ * 10; i++) {
      w.step(new Map());
      for (const mobId of w.mob.keys()) {
        sawMob = true;
        // `castAbility` 的第一行就是 `world.abilities.get(caster)`，拿不到就回
        // "bad-target"。沒有 AbilitiesComp 的實體施法是型別以外的不可能。
        expect(w.abilities.has(mobId)).toBe(false);
        expect(w.stats.has(mobId)).toBe(false);
        expect(w.champion.has(mobId)).toBe(false);
      }
      // 這 10 秒內場上不存在任何一發 `abilityCast`（唯一的英雄不下任何指令）。
      expect(w.events.some((e) => e.type === "abilityCast")).toBe(false);
    }
    expect(sawMob).toBe(true);
  });
});
