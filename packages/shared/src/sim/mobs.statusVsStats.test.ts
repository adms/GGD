/**
 * 【破甲 / 破防 / 破魔】打在殭屍身上（GH#301-6）—— **屬性無效，但 buff 掛得上**。
 *
 * owner 2026-08-09：「這三個雖然是無效，但**還是可以有 buff 被 check**，
 * 讓後續追加效果可以發動」。
 *
 * ── 量出來的結果（2026-08-09，不是推測）──────────────────────────────────
 * 引擎的兩條路對殭屍有**相反**的答案，而它們常常寫在同一張卡上：
 *
 *   `applyStatus`（標記）→ 殭屍**吃得到**。`sim/mobs.ts::spawnMobBody` 從
 *                          2026-08-04 起替每一隻殭屍建 `StatusComp`（A3a）。
 *   `applyBuff`（屬性）  → 殭屍**吃不到**，而且是**靜默**的：
 *                          `stats/statPipeline.ts::attachSource` 第一句
 *                          `const sc = world.stats.get(id); if (!sc) return;`
 *                          沒有事件、沒有 log、畫面上跟「有效但抗性很高」一樣。
 *
 * ⭐ 所以 owner 要的東西**今天就成立**，前提是那張卡把標記寫成 `applyStatus`
 * 而不是只寫 `applyBuff`。這一檔把那個前提釘住 —— 它會在有人「順手」把標記
 * 改寫成一格 `applyBuff` 欄位、或有人把 `spawnMobBody` 那一行拿掉的時候紅。
 *
 * ⚠️ **兩個方向一起讀，而且缺一不可**：只驗「小兵查得到狀態」的話，「小兵也開始
 * 吃屬性了」也會全綠 —— 而那是**錯的**（owner 逐字：「屬性照樣無效」），
 * 它會讓一發破甲把殭屍波的難度整段抽掉，而且沒有任何東西會說一句話。
 *
 * ⛔ 「查得到」是走**出貨的條件葉**（`fireHooks` → `condition.status` →
 * `runEffects` → 傷害佇列）讀真的血量差，不是讀 `StatusComp.effects.length`
 * （失敗形態 ⑦：掃屬性代替掃行為）。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * M1 `sim/mobs.ts` 刪掉 `world.status.set(id, { effects: [] })`
 *    → ①「殭屍身上查得到破甲」FAIL（加成沒落下去）；② 仍綠。
 * 改回來 → 2/2 綠。（M1 與 `mobs.status.test.ts` 的 M1 是同一行，兩檔問的是
 * 不同的下游：那一檔問走不走得動，這一檔問條件查不查得到。）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { spawnMob, type MobRules } from "./mobs";
import { runEffects } from "./effects/effectRunner";
import { fireHooks } from "./effects/hooks";
import { attachSource } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../ids";

const TAG = "mob-status-vs-stats";
/** 夾具：一份「破甲」形狀的標記。不是出貨 id。 */
const SHRED = "test-armor-shred" as StatusId;
const BONUS = 400;

/** 一份最小的殭屍波設定 —— `boss/special: null` 讓 `spawnMob` 一顆 rng 都不抽。 */
const RULES: MobRules = {
  fromRound: 3,
  firstWaveTicks: 1,
  waveIntervalTicks: 100000,
  mobsPerWaveCap: 1,
  maxAlivePerZone: 8,
  level: 3,
  maxHp: 4000,
  moveSpeed: 5,
  hpRegenPerSec: 0,
  modelKey: "mob-test",
  sizeMult: 1,
  tintStrength: 0,
  attackDamage: 20,
  attackRangeSq: 1.8 * 1.8,
  attackCdTicks: 3,
  radius: 0.6,
  rewardGold: 1,
  rewardXp: 1,
  killsPerLevel: 0,
  boss: null,
  special: null,
};

beforeAll(() => registerSkeletonContent());

function siege(): { world: SimWorld; mob: EntityId; hero: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 11);
  world.combatActive = true;
  world.mobRules = RULES;
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 2, z: c.z },
    zone: 0,
  });
  const mob = spawnMob(world, 0, RULES, 1, 0);
  return { world, mob, hero };
}

/** 一張「破甲」卡的真實形狀：標記（applyStatus）＋ 屬性（applyBuff）同時下。 */
function shred(world: SimWorld, hero: EntityId, mob: EntityId): void {
  runEffects(
    [
      { kind: "applyStatus", statusId: SHRED, duration: 8 },
      {
        kind: "applyBuff",
        duration: 8,
        polarity: "debuff",
        modifiers: [{ stat: Stat.Armor, op: ModOp.PercentMult, value: -0.5 }],
      },
    ],
    { world, caster: hero, rank: 1, targets: [mob], origin: "ability:test-shred", rng: world.rng },
  );
}

describe("破甲類打在殭屍身上 (mob-status-vs-stats)", () => {
  it("★ ① 標記掛得上，而且**後續追加效果**查得到（owner 要的那一半）", () => {
    cover(TAG);
    // 一條「目標帶著破甲才追加真傷」的 proc —— 出貨的條件葉，出貨的 hook 路徑。
    const withShred = (on: boolean): number => {
      const s = siege();
      if (on) shred(s.world, s.hero, s.mob);
      attachSource(s.world, s.hero, {
        id: "test:proc",
        kind: "item",
        hooks: [
          {
            on: "onBasicAttack",
            effects: [{ kind: "damage", damageType: "true", amount: { flat: BONUS } }],
            condition: { kind: "status", subject: "target", statusId: SHRED },
          },
        ],
      });
      const before = s.world.health.get(s.mob)!.hp;
      fireHooks(s.world, s.hero, "onBasicAttack", s.mob);
      s.world.step(new Map());
      return before - s.world.health.get(s.mob)!.hp;
    };
    // 對照組先跑：沒有破甲時追加**不該**發動，否則下面那條對任何實作都會過。
    expect(withShred(false), "條件閘從不擋 —— 先修測試").toBe(0);
    expect(withShred(true), "殭屍身上查不到破甲 → 追加效果整族發不動").toBeGreaterThan(0);
  });

  it("★ ② 屬性那一半照樣無效 —— 殭屍不會因為一發破甲長出屬性表", () => {
    cover(TAG);
    const s = siege();
    expect(s.world.stats.has(s.mob), "夾具本身錯了：殭屍一開始就有屬性表").toBe(false);
    shred(s.world, s.hero, s.mob);
    // owner 逐字：「屬性照樣無效」。這一條擋的是「順手讓小兵也吃屬性」——
    // 那會讓一發破甲把整段殭屍波的難度抽掉，而且沒有任何東西會說一句話。
    expect(s.world.stats.has(s.mob), "殭屍開始吃屬性了 —— 那不是 owner 要的").toBe(false);
  });
});
