/**
 * 批 1 · Hook 詞彙加寬 —— 行為守衛（稜彩卡計畫 2026-08-04）。
 *
 * 三個新東西，一條硬約束：
 *
 *   A  `victim` 的 union 多了 `enemyChampion` / `allyChampion` / `enemy`
 *      —— 第一次真的**比隊伍**。
 *   B  `damageSource` 的 union 多了 `ability` / `other`
 *      —— 把 `nonBasic` 那一坨（技能＋DoT＋火圈＋守衛＋小怪）拆開。
 *   C  `internalCooldownScope` —— 同一條 hook 的 ICD 記在一格還是每槽位一格。
 *   ⛔ 兩個新過濾器必須留在 **ICD 閘與機率骰之前**：被擋掉的一發不可以抽籤。
 *
 * ── 這裡的每一條為什麼長這樣（對照 CLAUDE.md 的七種失敗形態）─────────────
 *
 *   ⑦ 掃屬性代替掃行為：**沒有一條**斷言長成「schema 有這個成員」或
 *     「union 收得下這個字串」。每一條都建一個真的 `SimWorld`、跑真的
 *      `fireHooks` → `runEffects` → `damageQueue` → `world.step()`，讀的是
 *      血條上真的少掉的血、或真的離開伺服器的 `buffApply` 事件。
 *   ④ 斷言方向跟缺陷無關：每一條都是 **A/B 對照** —— 同一份 hook、同一段
 *      tick，只差目標的隊伍 / 封包的 origin / 一格 scope。少了對照組，
 *      一個「永遠不觸發」的實作也會過。
 *   ⛔ **不抄出貨數值**：這一檔用的 ICD 秒數與傷害量都是本檔自己宣告的探針
 *      常數，斷言一律從 `PROBE_ICD_SEC` / `BONUS` 推導，不寫字面值。
 *      出貨內容今天一條新成員都還沒用，所以這裡沒有任何出貨數字可抄。
 *
 * ── ⚠️ 為什麼「火圈」那一條用的是 `origin: "fireRing"` 的封包而不是真的火圈
 *
 * 因為**真的火圈根本不走 hook**：`sim/fireRing.ts` 與 `systems/FireRingSystem.ts`
 * 都是 `hp.hp -= dmg` 直接扣血再發一個 `fireRingDamage` 事件，**沒有**進
 * `world.damageQueue`，所以 `onDamageTaken` 對它一次都不會發。拿它當受測輸入
 * 會讓這條守衛對任何實作都是綠的（失敗形態 ④）。
 * 所以這裡走的是**同一族的另一半**：一發 origin 是 `"fireRing"` 的封包丟進
 * `world.damageQueue`，由**真的** `combatResolveSystem` 在 `w.step()` 裡解算 ——
 * 那正是 `damageSource` 唯一的資料來源。`"fireRing"` 這個字串本身就是
 * `fireRing.ts:1177` / `FireRingSystem.ts:103` 寫的那一個。
 * 而「這一發真的抵達了 hook 層」由**對照組**證明：同一發封包對
 * `damageSource: "nonBasic"` 必須觸發。
 *
 * ── 突變紀錄（每一項都套用 → 跑 → 還原 → 再跑綠）──────────────────────────
 * 寫在 commit message 與交付報告裡。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { fireHooks } from "./hooks";
import { MOB_MODEL_KEY, spawnMob, type MobRules } from "../mobs";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import type { HookDef } from "../stats/modifiers";
import type { EffectDef } from "./effect";
import { normalizeAugmentEnemyFilter } from "../augmentEnemyFilter";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

/** 探針傷害。純真傷 → 沒有護甲/魔抗的變數要繞。 */
const BONUS = 500;
/** 探針 ICD。@30Hz = 30 tick，本檔所有節奏斷言都從它推導。 */
const PROBE_ICD_SEC = 1;

/** 一隻安靜的沙包殭屍：不動、不打人、不升級。 */
const MOB_RULES: MobRules = {
  fromRound: 1,
  firstWaveTicks: 1,
  waveIntervalTicks: 999,
  mobsPerWaveCap: 1,
  maxAlivePerZone: 9,
  level: 1,
  maxHp: 10_000,
  moveSpeed: 0,
  hpRegenPerSec: 0,
  modelKey: MOB_MODEL_KEY,
  sizeMult: 1,
  tintStrength: 0.65,
  attackDamage: 0,
  attackRangeSq: 0,
  attackCdTicks: 999,
  radius: 0.6,
  rewardGold: 0,
  rewardXp: 0,
  killsPerLevel: 999,
  boss: null,
  special: null,
};

interface Stage {
  world: SimWorld;
  /** hook 的持有者（隊伍 0） */
  hero: EntityId;
  /** 同隊的另一位英雄（隊伍 0）—— `enemyChampion` 必須放過他 */
  ally: EntityId;
  /** 敵方英雄（隊伍 1） */
  foe: EntityId;
  /** 殭屍（MONSTER_TEAM）—— 有隊伍，但沒有 ChampionComp */
  mob: EntityId;
}

/**
 * 兩位隊友 + 一位敵人 + 一隻殭屍，全部在同一個決鬥區。
 *
 * ⚠️ 先跑一 tick 再回傳：broad-phase 是在 `SimWorld.step` 開頭才 rebuild 的，
 * 少了這一步任何走 grid 的效果會在第一 tick 找不到人。
 */
function stage(seed = 7): Stage {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const ally = spawnChampion(world, {
    championId: THORNE.id,
    seatId: asSeatId(1),
    teamId: asTeamId(0),
    pos: { x: C.x + 1, z: C.z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: THORNE.id,
    seatId: asSeatId(2),
    teamId: asTeamId(1),
    pos: { x: C.x + 2, z: C.z },
    zone: 0,
  });
  const mob = spawnMob(world, 0, MOB_RULES, 1, 0);
  world.step(new Map());
  return { world, hero, ally, foe, mob };
}

const hp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;

/** 探針效果：+BONUS 真傷，打在 hook 解析出來的目標身上。 */
const HIT: EffectDef = { kind: "damage", damageType: "true", amount: { flat: BONUS } };

function arm(w: SimWorld, owner: EntityId, hook: HookDef, id = "test:probe"): void {
  attachSource(w, owner, { id, kind: "item", hooks: [hook] });
}

/**
 * 一格 tick 掉的血換算成「這條 hook 觸發了幾次」。
 *
 * ⚠️ 為什麼是換算而不是直接比血量：`RegenSystem` 在同一個 `step()` 裡把血回了
 * 一點回去（探針一發 500，回血約 0.05）。逐位元比血量等於把**回血公式**也
 * 釘進這條守衛 —— 那是第四個住處，而回血率是 owner 每週在調的東西。
 * 這裡量的是**機制發生了幾次**，不是傷害是多少（CLAUDE.md「驗機制不驗數字」）。
 */
const procsFrom = (delta: number): number => Math.round(delta / BONUS);

/** 揮一下（真的走 `fireHooks`），把 tick 跑完，回傳這條 hook 觸發了幾次。 */
function swing(s: Stage, event: "onBasicAttack" | "onAbilityCast", target: EntityId, slot?: "Q" | "W"): number {
  const before = hp(s.world, target);
  fireHooks(s.world, s.hero, event, target, slot);
  s.world.step(new Map());
  return procsFrom(before - hp(s.world, target));
}

// ===========================================================================
// ① victim —— 「敵方英雄」第一次真的比隊伍
// ===========================================================================
describe("① victim: enemyChampion 真的比隊伍", () => {
  it("★ 敵方英雄吃到、隊友完全沒事（同一份 hook、同一個事件）", () => {
    cover("hook-victim-enemy-champion");
    const s = stage();
    arm(s.world, s.hero, { on: "onBasicAttack", victim: "enemyChampion", effects: [HIT] });

    // 敵人：吃滿。這是對照組 —— 少了它，一個「永遠不觸發」的實作也會過。
    expect(swing(s, "onBasicAttack", s.foe)).toBe(1);
    // 隊友：一滴都不能掉。⚠️ 這一條就是「刪掉 world.team 比較那一行」的靶。
    expect(swing(s, "onBasicAttack", s.ally)).toBe(0);
    // 自己也是隊友（「敵方」不包含自己）。
    expect(swing(s, "onBasicAttack", s.hero)).toBe(0);
  });

  it("★ allyChampion 是完全相反的一格 —— 隊友吃到、敵人沒事", () => {
    cover("hook-victim-ally-champion");
    const s = stage();
    arm(s.world, s.hero, { on: "onBasicAttack", victim: "allyChampion", effects: [HIT] });
    expect(swing(s, "onBasicAttack", s.ally)).toBe(1);
    expect(swing(s, "onBasicAttack", s.foe)).toBe(0);
  });

  it("★ 舊成員 champion 不比隊伍 —— 這是加寬前的語意，一個位元都沒動", () => {
    cover("hook-victim-champion-unchanged");
    const s = stage();
    arm(s.world, s.hero, { on: "onBasicAttack", victim: "champion", effects: [HIT] });
    // 兩邊都吃到 —— 正是 `enemyChampion` 存在的理由。
    expect(swing(s, "onBasicAttack", s.foe)).toBe(1);
    expect(swing(s, "onBasicAttack", s.ally)).toBe(1);
  });

  it("★ enemy 收殭屍，enemyChampion 不收（那 9 張卡的活路）", () => {
    cover("hook-victim-enemy-includes-mobs");
    const a = stage();
    arm(a.world, a.hero, { on: "onBasicAttack", victim: "enemy", effects: [HIT] });
    expect(swing(a, "onBasicAttack", a.mob)).toBe(1);
    expect(swing(a, "onBasicAttack", a.ally)).toBe(0);

    const b = stage();
    arm(b.world, b.hero, { on: "onBasicAttack", victim: "enemyChampion", effects: [HIT] });
    expect(swing(b, "onBasicAttack", b.mob)).toBe(0);
  });

  it("★ 全域覆寫 mobsCountAsEnemy 打開之後，enemyChampion 也收殭屍", () => {
    cover("hook-victim-mobs-count-as-enemy");
    const s = stage();
    s.world.augmentEnemyFilter = normalizeAugmentEnemyFilter({ mobsCountAsEnemy: true });
    arm(s.world, s.hero, { on: "onBasicAttack", victim: "enemyChampion", effects: [HIT] });
    expect(swing(s, "onBasicAttack", s.mob)).toBe(1);
    // …而 allyChampion 永遠不受它影響（殭屍不會變成隊友）。
    const t = stage();
    t.world.augmentEnemyFilter = normalizeAugmentEnemyFilter({ mobsCountAsEnemy: true });
    arm(t.world, t.hero, { on: "onBasicAttack", victim: "allyChampion", effects: [HIT] });
    expect(swing(t, "onBasicAttack", t.mob)).toBe(0);
  });

  it("★ 沒有 TeamComp 的身體（客戶端預測影子世界）一律不通過", () => {
    cover("hook-victim-no-team-blocks");
    const s = stage();
    // 把敵人的隊伍拔掉 = 影子世界那些沒有 TeamComp 的身體。
    s.world.team.delete(s.foe);
    for (const v of ["enemyChampion", "allyChampion", "enemy"] as const) {
      const t = stage();
      t.world.team.delete(t.foe);
      arm(t.world, t.hero, { on: "onBasicAttack", victim: v, effects: [HIT] });
      expect(swing(t, "onBasicAttack", t.foe), `${v} 對無隊伍的身體通過了`).toBe(0);
    }
  });
});

// ===========================================================================
// ② damageSource —— 火圈燒到人不該算成技能傷害
// ===========================================================================

/** 這一發封包**真的**走完 `combatResolveSystem`，回傳 hook 觸發了幾次。 */
function procsOnPacket(origin: string, damageSource: HookDef["damageSource"]): number {
  const s = stage();
  // hook 掛在**受害者**身上：`onDamageTaken` 的主詞是被打的那個。
  arm(s.world, s.foe, {
    on: "onDamageTaken",
    damageSource,
    target: "self",
    effects: [
      {
        kind: "applyBuff",
        modifiers: [],
        duration: 999,
        stackKey: "damage-source-probe",
      },
    ],
  });
  s.world.damageQueue.push({
    source: s.hero,
    target: s.foe,
    amount: 10,
    type: "true",
    crit: false,
    origin,
  });
  s.world.step(new Map());
  let n = 0;
  for (const e of s.world.events) if (e.type === "buffApply" && e.data.target === s.foe) n++;
  return n;
}

describe("② damageSource: ability 只收技能", () => {
  it("★ 火圈真傷不算技能 —— 而同一發封包對 nonBasic 一定觸發", () => {
    cover("hook-damage-source-ability");
    // 靶：把 `originInScope` 換成 `origin !== "basic"` 會讓這一行變成 1。
    expect(procsOnPacket("fireRing", "ability")).toBe(0);
    // 對照組：證明這一發封包真的抵達了 hook 層（否則上面那 0 什麼都沒說）。
    expect(procsOnPacket("fireRing", "nonBasic")).toBe(1);
  });

  it("★ 技能封包會觸發 ability，普攻不會", () => {
    cover("hook-damage-source-ability");
    expect(procsOnPacket("ability:sela.q", "ability")).toBe(1);
    expect(procsOnPacket("basic", "ability")).toBe(0);
  });

  it("★ other 是「既不是普攻也不是技能」—— 三個 origin 三種答案", () => {
    cover("hook-damage-source-other");
    expect(procsOnPacket("fireRing", "other")).toBe(1);
    expect(procsOnPacket("basic", "other")).toBe(0);
    expect(procsOnPacket("ability:sela.q", "other")).toBe(0);
  });

  it("★ 舊成員 basic / nonBasic 的語意一個位元都沒動", () => {
    cover("hook-damage-source-unchanged");
    expect(procsOnPacket("basic", "basic")).toBe(1);
    expect(procsOnPacket("ability:sela.q", "basic")).toBe(0);
    expect(procsOnPacket("basic", "nonBasic")).toBe(0);
    expect(procsOnPacket("ability:sela.q", "nonBasic")).toBe(1);
  });
});

// ===========================================================================
// ③ internalCooldownScope —— Q 的冷卻不可以擋住 W 的第一次
// ===========================================================================

/** 同一 tick 內先 Q 後 W，回傳敵人總共掉了多少血。 */
function qThenW(scope: HookDef["internalCooldownScope"]): number {
  const s = stage();
  arm(s.world, s.hero, {
    on: "onAbilityCast",
    internalCooldown: PROBE_ICD_SEC,
    ...(scope !== undefined ? { internalCooldownScope: scope } : {}),
    effects: [HIT],
  });
  const before = hp(s.world, s.foe);
  fireHooks(s.world, s.hero, "onAbilityCast", s.foe, "Q");
  fireHooks(s.world, s.hero, "onAbilityCast", s.foe, "W");
  s.world.step(new Map());
  return procsFrom(before - hp(s.world, s.foe));
}

describe("③ internalCooldownScope: perAbilitySlot", () => {
  it("★ perAbilitySlot：Q 剛觸發過，W 的第一次照樣打得出來", () => {
    cover("hook-icd-scope-per-slot");
    // 靶：把 per-slot 記錄改回單一數字 → W 被 Q 的 ICD 擋掉 → 這裡變 BONUS。
    expect(qThenW("perAbilitySlot")).toBe(2);
  });

  it("★ 對照組：省略 = source = 今天的行為，W 被擋掉", () => {
    cover("hook-icd-scope-default-source");
    expect(qThenW(undefined)).toBe(1);
    // 明寫 "source" 與省略必須給出同一個答案（預設值不可以漂移）。
    expect(qThenW("source")).toBe(qThenW(undefined));
  });

  it("★ perAbilitySlot 仍然是一個真的冷卻 —— 同一格 Q 連兩發只算一發", () => {
    cover("hook-icd-scope-per-slot");
    const s = stage();
    arm(s.world, s.hero, {
      on: "onAbilityCast",
      internalCooldown: PROBE_ICD_SEC,
      internalCooldownScope: "perAbilitySlot",
      effects: [HIT],
    });
    const before = hp(s.world, s.foe);
    fireHooks(s.world, s.hero, "onAbilityCast", s.foe, "Q");
    fireHooks(s.world, s.hero, "onAbilityCast", s.foe, "Q");
    s.world.step(new Map());
    expect(procsFrom(before - hp(s.world, s.foe))).toBe(1);

    // …而 ICD 走完之後同一格又開得起來。從 def 推導 tick 數，不抄字面值。
    const icdTicks = Math.round(PROBE_ICD_SEC / s.world.dt);
    for (let i = 0; i < icdTicks; i++) s.world.step(new Map());
    const mid = hp(s.world, s.foe);
    fireHooks(s.world, s.hero, "onAbilityCast", s.foe, "Q");
    s.world.step(new Map());
    expect(procsFrom(mid - hp(s.world, s.foe))).toBe(1);
  });

  it("★ 無槽位事件上 perAbilitySlot 退化成全域（欄位說明講的那件事）", () => {
    cover("hook-icd-scope-no-slot-degrades");
    const s = stage();
    arm(s.world, s.hero, {
      on: "onBasicAttack",
      internalCooldown: PROBE_ICD_SEC,
      internalCooldownScope: "perAbilitySlot",
      effects: [HIT],
    });
    const before = hp(s.world, s.foe);
    fireHooks(s.world, s.hero, "onBasicAttack", s.foe);
    fireHooks(s.world, s.hero, "onBasicAttack", s.foe);
    s.world.step(new Map());
    // 兩次都沒有槽位 → 共用同一格 → 第二次被擋。
    expect(procsFrom(before - hp(s.world, s.foe))).toBe(1);
  });
});

// ===========================================================================
// ④ 順序硬約束 —— 被新過濾器擋掉的一發不可以消耗亂數
// ===========================================================================
describe("④ 新過濾器坐在骰子之前：擋掉的一發不抽籤", () => {
  it("★ victim 擋掉的那一下，world.rng 一個位元都沒動", () => {
    cover("hook-victim-before-roll");
    const s = stage();
    // `chance` 是抽籤的那一欄。過濾器若排在它後面，隊友那一下也會抽一次。
    arm(s.world, s.hero, {
      on: "onBasicAttack",
      victim: "enemyChampion",
      chance: 0.5,
      effects: [HIT],
    });

    const beforeAlly = s.world.rng.state;
    fireHooks(s.world, s.hero, "onBasicAttack", s.ally);
    // 靶：把 victim 閘移到機率骰之後 → 這一行變成不相等。
    expect(s.world.rng.state, "被 victim 擋掉的一發抽了籤 → 亂數流位移").toBe(beforeAlly);

    // 對照組：合格的目標**一定**抽一次。少了它，一個「永遠不抽」的實作也會過。
    fireHooks(s.world, s.hero, "onBasicAttack", s.foe);
    expect(s.world.rng.state).not.toBe(beforeAlly);
  });

  it("★ damageSource 擋掉的那一發也不抽籤", () => {
    cover("hook-damage-source-before-roll");
    const s = stage();
    arm(s.world, s.foe, {
      on: "onDamageTaken",
      damageSource: "ability",
      chance: 0.5,
      target: "self",
      effects: [{ kind: "applyBuff", modifiers: [], duration: 999, stackKey: "ds-rng-probe" }],
    });
    const before = s.world.rng.state;
    s.world.damageQueue.push({
      source: s.hero,
      target: s.foe,
      amount: 10,
      type: "true",
      crit: false,
      origin: "fireRing",
    });
    s.world.step(new Map());
    expect(s.world.rng.state, "被 damageSource 擋掉的一發抽了籤").toBe(before);
  });

  it("★ 條件樹的抽籤次數只由樹的形狀決定 —— 新過濾器沒有動到它", () => {
    cover("hook-filters-preserve-draw-count");
    // 同一顆種子、同一份 hook，兩種目標各跑一輪：合格那一輪的抽籤數必須
    // 剛好是「條件樹裡的 chance 葉子數 + chance 欄位那一次」，而被擋掉的
    // 那一輪必須是 0。這是 `sim/content/condition.ts` DECISION 1 的不變量，
    // 而批 1 的兩個新閘的全部安全性就建立在它上面。
    const run = (target: (s: Stage) => EntityId): number => {
      const s = stage(4242);
      arm(s.world, s.hero, {
        on: "onBasicAttack",
        victim: "enemyChampion",
        chance: 0.5,
        condition: { all: [{ kind: "chance", p: 0.5 }, { kind: "chance", p: 0.5 }] },
        effects: [HIT],
      });
      const before = s.world.rng.state;
      fireHooks(s.world, s.hero, "onBasicAttack", target(s));
      return s.world.rng.state === before ? 0 : 1;
    };
    expect(run((s) => s.ally), "隊友那一發動到了亂數流").toBe(0);
    expect(run((s) => s.foe), "敵人那一發完全沒抽籤").toBe(1);
  });

  it("★ 同 seed 兩次逐位元相同（決定性沒有被新閘破壞）", () => {
    cover("hook-filters-deterministic");
    const run = (): { rng: number; foe: number; ally: number } => {
      const s = stage(31337);
      arm(s.world, s.hero, {
        on: "onBasicAttack",
        victim: "enemyChampion",
        chance: 0.4,
        effects: [HIT],
      });
      for (let i = 0; i < 40; i++) {
        fireHooks(s.world, s.hero, "onBasicAttack", i % 2 === 0 ? s.foe : s.ally);
        s.world.step(new Map());
      }
      return { rng: s.world.rng.state, foe: hp(s.world, s.foe), ally: hp(s.world, s.ally) };
    };
    expect(run()).toEqual(run());
  });
});

// ===========================================================================
// ⑤ B2 —— `damageType` / `damageCrit`（2026-08-05）
//
// 這兩格解鎖【暴擊時】【這一發是 AP】【是 AD】【是真傷】四個標籤。
// 資料一直就在原地（`DamagePacket` 的第 44、45 個欄位），缺的只是
// `combat/damage.ts` 把它們抄進 `TriggerDamage` 的那兩行。
//
// ⚠️ 這裡**沒有一條**斷言長成「schema 收得下 `crit` 這個字串」（失敗形態 ⑦）。
// 每一條都推真的封包進 `world.damageQueue`，由真的 `combatResolveSystem` 在
// `w.step()` 裡解算 —— 那是 `TriggerDamage` 唯一的產地。
// ===========================================================================
describe("⑤ B2: damageType / damageCrit 真的過濾那一發封包", () => {
  /**
   * 一個**乾淨的舞台**推一發封包給 `foe`，回傳「掛在 foe 身上的那條 hook 觸發了幾次」。
   *
   * ⚠️ **每一發都自己開一個 stage**，不是在同一個世界連推。探針 `HIT` 打的是
   * `hero`（`onDamageTaken` 解析出來的對象＝攻擊者），一發 500 真傷，兩發就把
   * 他打死了 —— 第三發之後血條不動，而那看起來跟「過濾器擋掉了」**一模一樣**。
   * 第一版就是這樣紅的，而紅的訊息說「省略沒有變成不過濾」，是假的。
   *
   * ⚠️ `|| 0` 是在正規化 **`-0`**：`RegenSystem` 在同一個 `step()` 裡回了一點血，
   * 沒觸發時 delta 是個微負數，`Math.round` 給出 `-0`，而 `expect(-0).toBe(0)`
   * 在 `Object.is` 底下是**紅的**。這不是被測行為的一部分。
   */
  function probe(
    hook: Omit<HookDef, "effects">,
    pkt: { type: "physical" | "magic" | "true"; crit: boolean },
  ): number {
    const s = stage();
    arm(s.world, s.foe, { ...hook, effects: [HIT] } as HookDef);
    const before = hp(s.world, s.hero);
    s.world.damageQueue.push({
      source: s.hero,
      target: s.foe,
      amount: 10,
      type: pkt.type,
      crit: pkt.crit,
      origin: "basic",
    });
    s.world.step(new Map());
    return procsFrom(before - hp(s.world, s.hero)) || 0;
  }

  const TAKEN = { on: "onDamageTaken" } as const;

  it("★ damageCrit: crit —— 暴擊那一發觸發，非暴擊那一發完全不觸發", () => {
    cover("hook-damage-crit-filter");
    // 對照組先寫：暴擊**一定**要觸發。少了它，一個「永遠不觸發」的實作也會過
    //（失敗形態 ④）。
    expect(probe({ ...TAKEN, damageCrit: "crit" }, { type: "physical", crit: true })).toBe(1);
    // 靶：刪掉 `incoming.crit !== (hook.damageCrit === "crit")` 那一行 → 變 1 → 紅。
    expect(probe({ ...TAKEN, damageCrit: "crit" }, { type: "physical", crit: false })).toBe(0);
  });

  it("★ damageCrit: nonCrit 是完全相反的一格（擋「三值被當成 boolean」）", () => {
    cover("hook-damage-crit-noncrit");
    expect(probe({ ...TAKEN, damageCrit: "nonCrit" }, { type: "physical", crit: false })).toBe(1);
    expect(probe({ ...TAKEN, damageCrit: "nonCrit" }, { type: "physical", crit: true })).toBe(0);
  });

  it("★ damageType 三種型別各自只收自己那一種（3×3 全表）", () => {
    cover("hook-damage-type-filter");
    const KINDS = ["physical", "magic", "true"] as const;
    for (const want of KINDS) {
      for (const got of KINDS) {
        expect(probe({ ...TAKEN, damageType: want }, { type: got, crit: false }), `want=${want} got=${got}`).toBe(
          got === want ? 1 : 0,
        );
      }
    }
  });

  it("★ 省略 = 不過濾 —— 每一份既有文件逐位元不變", () => {
    cover("hook-damage-filter-absent-is-noop");
    // 這一條擋的是「新閘寫成 `!== undefined` 以外的形狀」——例如把 `undefined`
    // 當成一個要比對的值，那會把**每一條既有 hook** 安靜地關掉。
    expect(probe(TAKEN, { type: "physical", crit: false })).toBe(1);
    expect(probe(TAKEN, { type: "magic", crit: true })).toBe(1);
    expect(probe(TAKEN, { type: "true", crit: false })).toBe(1);
    // `"any"` 明寫出來也一樣。
    expect(
      probe({ ...TAKEN, damageType: "any", damageCrit: "any" }, { type: "magic", crit: false }),
    ).toBe(1);
  });

  it("★ 兩格是 AND 不是 OR —— 只對得上一半的封包不觸發", () => {
    cover("hook-damage-filter-and");
    const both = { ...TAKEN, damageType: "magic", damageCrit: "crit" } as const;
    expect(probe(both, { type: "magic", crit: true })).toBe(1); // 兩個都中
    expect(probe(both, { type: "magic", crit: false })).toBe(0); // 只中型別
    expect(probe(both, { type: "physical", crit: true })).toBe(0); // 只中暴擊
  });

  it("⛔ 被 damageType / damageCrit 擋掉的那一發不抽籤（順序硬約束）", () => {
    cover("hook-damage-filter-before-roll");
    // 與 `victim` / `damageSource` 那兩條是同一個主張：新過濾器必須坐在
    // **內部冷卻閘與機率骰之前**。靶：把這兩道閘搬到 `chance` 骰子後面 →
    // 被擋掉的一發也抽了籤 → `rng.state` 位移 → 紅。
    //
    // ⚠️ 探針效果用 `applyBuff` 而不是 `HIT`：這一條量的是**亂數流**，不是血量，
    // 而 `HIT` 會把血量的變化混進來讓失敗訊息變模糊。
    const cases = [
      ["damageType", { on: "onDamageTaken", damageType: "magic", chance: 0.5 }],
      ["damageCrit", { on: "onDamageTaken", damageCrit: "crit", chance: 0.5 }],
    ] as const;
    for (const [label, hook] of cases) {
      const s = stage();
      arm(s.world, s.foe, {
        ...hook,
        target: "self",
        effects: [{ kind: "applyBuff", modifiers: [], duration: 999, stackKey: `b2-${label}` }],
      } as HookDef);
      const before = s.world.rng.state;
      // 一發**不合格**的封包（物理、非暴擊）—— 兩條 hook 都應該擋掉它。
      s.world.damageQueue.push({
        source: s.hero,
        target: s.foe,
        amount: 10,
        type: "physical",
        crit: false,
        origin: "basic",
      });
      s.world.step(new Map());
      expect(s.world.rng.state, `被 ${label} 擋掉的一發抽了籤 → 亂數流位移`).toBe(before);
    }
  });

  it("⛔ 沒有封包的事件一律不通過（與 damageSource 的不對稱逐字相同）", () => {
    cover("hook-damage-filter-no-packet");
    // `onBasicAttack` 不帶封包。`victim` 在那裡退化成「不過濾」，但這一族**不行**：
    // 「沒有傷害」不可能是一發魔法傷害，也不可能是一次暴擊。
    // 靶：把 `if (incoming === undefined) continue;` 拿掉 → 觸發 → 紅。
    const s = stage();
    arm(s.world, s.hero, { on: "onBasicAttack", damageCrit: "crit", effects: [HIT] });
    expect(swing(s, "onBasicAttack", s.foe)).toBe(0);
    // 對照組：同一個事件、拿掉過濾器一定觸發 —— 證明這條路本來是通的，
    // 而不是 `onBasicAttack` 自己就發不出來。
    const t = stage();
    arm(t.world, t.hero, { on: "onBasicAttack", effects: [HIT] });
    expect(swing(t, "onBasicAttack", t.foe)).toBe(1);
  });
});
