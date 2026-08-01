/**
 * [反彈] `damage.incomingPct` —— 「反彈剛剛打中我的那一發的 N%」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這條 seam 最容易的四種壞法,而且沒有一種會讓既有的任何一條測試變紅
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ① `combat/damage.ts` 忘了把封包傳進 `fireHooks` —— schema 收得下、後台看得到、
 *     道具卡上寫著 200%,而 `ctx.incoming` 永遠是 `undefined`,反彈永遠 0。
 *     這是失敗形態 ② 的教科書形狀,而且是這條 seam 的預設狀態(在這個 commit
 *     之前,`fireHooks` 的簽章根本沒有那個參數)。
 *  ② `damageSource` 過濾沒接上 —— 反射之盾變成「反彈**所有**傷害 200%」,
 *     一件強得多的、跟 owner 文案不同的道具。
 *  ③ `basis` 預設讀錯一個讀數 —— 一個 100 護甲的坦克反彈的數字差一倍,
 *     而所有「有反彈到」的斷言照樣綠(失敗形態 ④:斷言方向跟缺陷無關)。
 *  ④ 深度閘沒了 —— 兩個都戴反彈的人互毆變成指數爆炸的乒乓球,而且尾巴會溢到
 *     下一個 tick。**注意它不會讓測試「掛住」**,因為 `combatResolveSystem` 本來
 *     就有 4 輪的排空預算;它只會安靜地多打幾發、把殘留留在佇列裡。所以守衛
 *     不能靠 timeout,要數**封包數**與**佇列殘留**。
 *  ⑤ `combatEnv.damageDealt` 被乘**兩次** —— 2026-08-01 實測到的真缺陷。
 *     `TriggerDamage` 的三個讀數都在倍率之後,反彈封包再走一次排空迴圈那一行,
 *     反彈比就是 `pct × k` 而不是 `pct`。⚠️ 出貨 k = 1.0,所以**每一條把 k 釘在
 *     1 的測試對壞掉的實作都會照樣綠** —— 這一種只有參數化過 k 才抓得到,
 *     見「[反彈] 全域傷害倍率」那一段。
 *
 * 所以下面每一條量的都是**最終狀態**:攻擊者血條上少的那一格、`damage` 事件的
 * 條數、`world.damageQueue` 的殘留。沒有一條讀 `ctx.incoming`、`reflectDepth`
 * 這種內部欄位(失敗形態 ⑦)。
 *
 * 最後一個 describe 走**出貨的那份 JSON + 出貨的授予入口**(`grantItemFree`),
 * 因為上面每一條的 hook 都是測試自己手寫的 —— 失敗形態 ⑤。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { addShield, combatResolveSystem } from "../combat/damage";
import { normalizeCombatEnv } from "../combatEnv";
import { fireHooks } from "./hooks";
import type { HookDef } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import {
  DAMAGE_QUEUE_MAX_PASSES,
  INCOMING_PCT_MAX,
  REFLECT_MAX_CHAIN_DEPTH,
} from "./reflectLimits";
import { zItemDoc } from "../../content/schema/item";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Champions, Items } from "../content/registry";
import { grantItemFree } from "../economy/shop";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const CENTER = SKELETON_ARENA.zones[0]!.center;

/**
 * `damageDealt: 1` 讓算式看得懂,而且它**就是出貨值**
 * (`content/config/combat-env.json` 的 `multipliers.damageDealt`)。
 *
 * ⚠️ 這個檔頭以前寫「出貨值是 0.5,會把每個數字砍半但不改結論」—— 兩句都是假的:
 * 出貨是 1.0,而 k **會**改結論(失敗形態 ⑤,反彈被乘兩次,比例變成 `pct × k`)。
 * k = 1 是這個 seam 上**唯一看不見那個缺陷的值**,所以下面每一條把 k 釘在 1 的
 * 測試都對壞掉的實作照樣綠。真正在守它的是「[反彈] 全域傷害倍率」那一段,
 * 那裡的 k 是參數化的。後台戰鬥系統頁(#28)存在的意義就是動 k。
 */
function makeWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = normalizeCombatEnv({ damageDealt: 1 });
  return w;
}

function hero(w: SimWorld, seat: number, team: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: CENTER.x + seat, z: CENTER.z },
    zone: 0,
  });
}

/**
 * 一份反彈 hook。`damageType: "true"` 是刻意的:反彈**落地時**還會再吃一次
 * 攻擊者自己的護甲,用真實傷害才能讓斷言直接等於「反彈算出來的那個數」,
 * 而不是兩層減免疊在一起看不出誰錯。出貨的那件道具用的是 physical,
 * 最後一個 describe 會把那一層也算進去。
 */
function reflectHook(opts: {
  pct: number;
  basis?: "raw" | "mitigated" | "hpLost";
  damageSource?: "any" | "basic" | "nonBasic";
  maxChainDepth?: number;
}): HookDef {
  return {
    on: "onDamageTaken",
    ...(opts.damageSource !== undefined ? { damageSource: opts.damageSource } : {}),
    effects: [
      {
        kind: "damage",
        damageType: "true",
        amount: { flat: 0 },
        incomingPct: {
          ...(opts.basis !== undefined ? { basis: opts.basis } : {}),
          perRank: [opts.pct],
          ...(opts.maxChainDepth !== undefined ? { maxChainDepth: opts.maxChainDepth } : {}),
        },
      },
    ],
  };
}

/** 打一發,排空,回傳 [攻擊者掉的血, 受害者掉的血]。 */
function exchange(
  w: SimWorld,
  attacker: EntityId,
  victim: EntityId,
  amount: number,
  origin = "basic",
  type: "physical" | "magic" | "true" = "physical",
): [number, number] {
  const aBefore = w.health.get(attacker)!.hp;
  const vBefore = w.health.get(victim)!.hp;
  w.damageQueue.push({ source: attacker, target: victim, amount, type, crit: false, origin });
  combatResolveSystem(w);
  return [aBefore - w.health.get(attacker)!.hp, vBefore - w.health.get(victim)!.hp];
}

/** 一個身體對 physical 的減傷後量 —— 出貨的 100/(100+armor)。 */
function afterArmor(w: SimWorld, who: EntityId, raw: number): number {
  const armor = w.stats.get(who)!.final[Stat.Armor];
  return raw * (100 / (100 + Math.max(0, armor)));
}

describe("[反彈] incomingPct —— 傷害真的回到攻擊者身上", () => {
  it("★ 200% 反彈:攻擊者掉的血 = 我吃到的傷害 × 2", () => {
    const w = makeWorld();
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    attachSource(w, victim, { id: "src:reflect", kind: "item", hooks: [reflectHook({ pct: 2 })] });

    const onVictim = afterArmor(w, victim, 100);
    const [attackerLost, victimLost] = exchange(w, attacker, victim, 100);

    expect(victimLost).toBeCloseTo(onVictim, 5);
    // 真實傷害的反彈,所以攻擊者身上不再減免一次 —— 剛好兩倍。
    expect(attackerLost).toBeCloseTo(onVictim * 2, 5);
    // 這個身體有護甲,所以 raw(100)與 mitigated(72.8)真的分得開 ——
    // 少了這一條,下面 basis 的每一條都可能是在比較兩個一樣的數字。
    expect(onVictim).toBeLessThan(99);
  });

  it("★ 沒有反彈的人不會反彈(這條是上面那條的對照組)", () => {
    const w = makeWorld();
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    const [attackerLost] = exchange(w, attacker, victim, 100);
    expect(attackerLost).toBe(0);
  });

  it("★ `raw` 是**乘過 combatEnv.damageDealt 之後**的數字", () => {
    // 這是一個語意決定,不是巧合:`combat/damage.ts` 先乘倍率再組 TriggerDamage。
    // 這一條只量**分母**:進場 100、k = 0.5,身上吃到的是 50 不是 100。
    // (反彈端的數字是另一件事,見下一個 describe —— 這兩件事以前被綁在同一條
    //  測試裡,而那條測試把「乘兩次」當成正確答案寫死了。)
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatEnv = normalizeCombatEnv({ damageDealt: 0.5 });
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    attachSource(w, victim, {
      id: "src:reflect",
      kind: "item",
      hooks: [reflectHook({ pct: 2, basis: "raw" })],
    });
    const [attackerLost, victimLost] = exchange(w, attacker, victim, 100);
    expect(victimLost).toBeCloseTo(afterArmor(w, victim, 50), 5);
    // 分母是 50,所以 200% 的反彈是 100。一個在乘倍率**之前**取分母的實作會
    // 反彈 200 —— 兩個數字分得開。
    expect(attackerLost).toBeCloseTo(100, 5);
    expect(attackerLost).not.toBeCloseTo(200, 5);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * [反彈] 全域傷害倍率 —— 失敗形態 ⑤,而且出貨值剛好把它藏起來
 * ═══════════════════════════════════════════════════════════════════════════
 * `combatEnv.damageDealt`(= k)在排空迴圈裡對**每一發封包**乘一次。反彈的分母
 * (`TriggerDamage` 三個讀數)是那一行**之後**取的,所以反彈封包如果再走一次同
 * 一行,k 就進去了兩次 —— 反彈比 = `pct × k`。
 *
 * 出貨 k = 1.0,`1 × 1 = 1`,整個缺陷在出貨值上**完全不可見**。所以這一段的
 * 每一條都必須跑 k ≠ 1,而且斷言的是**比例**,不是某一個絕對數字:
 * 「攻擊者掉的血 ÷ 受害者吃到的傷害 = 文案寫的百分比」。
 *
 * 實測(2026-08-01,修好之前):k=0.25 → 0.5、k=0.5 → 1.0、k=1 → 2.0、k=2 → 4.0。
 */
describe("[反彈] 全域傷害倍率 —— 反彈比在任何 k 下都等於文案", () => {
  /** 回傳 [反彈比, 受害者吃到的量]。`basis: "raw"` 讓分母就是 100k,不摻護甲。 */
  function ratioAt(k: number, opts: { pct: number; applyGlobalDamageMult?: boolean }): number {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatEnv = normalizeCombatEnv({ damageDealt: k });
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    attachSource(w, victim, {
      id: "src:reflect",
      kind: "item",
      hooks: [
        {
          on: "onDamageTaken",
          effects: [
            {
              kind: "damage",
              damageType: "true",
              amount: { flat: 0 },
              incomingPct: {
                basis: "raw",
                perRank: [opts.pct],
                ...(opts.applyGlobalDamageMult !== undefined
                  ? { applyGlobalDamageMult: opts.applyGlobalDamageMult }
                  : {}),
              },
            },
          ],
        },
      ],
    });
    // 血拉高,免得 k=2 的時候有人在反彈落地之前就死了。
    for (const who of [attacker, victim]) w.health.get(who)!.hp = 1e6;
    const [attackerLost] = exchange(w, attacker, victim, 100, "basic", "true");
    return attackerLost / (100 * k); // 分母 = 受害者實際吃到的 raw
  }

  // 四個 k,兩個 <1、一個 =1、一個 >1。壞掉的實作在這裡是 0.5 / 1 / 2 / 4。
  for (const k of [0.25, 0.5, 1, 2]) {
    it(`★ k=${k}:反彈比 = 200%,不是 ${2 * k}`, () => {
      expect(ratioAt(k, { pct: 2 })).toBeCloseTo(2, 6);
    });
  }

  it("★ 不是只有 200% —— 100% 與 50% 在 k≠1 下也各自等於自己", () => {
    // 少了這一條,一個「反彈永遠 = 分母 × 2」的實作(把 perRank 寫死)也會過。
    expect(ratioAt(0.5, { pct: 1 })).toBeCloseTo(1, 6);
    expect(ratioAt(2, { pct: 0.5 })).toBeCloseTo(0.5, 6);
  });

  it("★ `applyGlobalDamageMult` 是欄位:開起來就真的跟著旋鈕走(= 舊行為)", () => {
    // 兩個方向都正向測,否則「預設不乘」可能只是「這條路根本沒接上」。
    // true 這一邊刻意保留 `pct × k`,那是一個一致的讀法(反彈是一個普通傷害
    // 來源,跟其他每一種來源一樣吃一次旋鈕),不是缺陷 —— 缺陷是它以前**沒得選**。
    expect(ratioAt(0.5, { pct: 2, applyGlobalDamageMult: true })).toBeCloseTo(1, 6);
    expect(ratioAt(2, { pct: 2, applyGlobalDamageMult: true })).toBeCloseTo(4, 6);
    // 顯式 false = 預設。
    expect(ratioAt(0.5, { pct: 2, applyGlobalDamageMult: false })).toBeCloseTo(2, 6);
  });
});

describe("[反彈] basis —— 三個讀數是欄位,不是我在 handler 裡挑的分支", () => {
  /**
   * 反彈 100%,分母由 `basis` 決定。身體自帶的護甲(出貨的 thorne 是 37.3)
   * 就足以讓 raw(100)與 mitigated(72.8)分得開,所以不需要外掛一份護甲來源
   * —— `attachSource` 的 `modifiers` 要等下一次重算才進 `final`,拿它當差異
   * 來源會量到一個假的 0 差距。
   */
  function pair(w: SimWorld, basis?: "raw" | "mitigated" | "hpLost"): [EntityId, EntityId] {
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    attachSource(w, victim, {
      id: "src:reflect",
      kind: "item",
      hooks: [reflectHook({ pct: 1, basis })],
    });
    return [attacker, victim];
  }

  it("★ 預設是 `mitigated`(護甲之後)—— 不是 `raw`", () => {
    const w = makeWorld();
    const [attacker, victim] = pair(w);
    const onVictim = afterArmor(w, victim, 100);
    const [attackerLost, victimLost] = exchange(w, attacker, victim, 100);
    expect(victimLost).toBeCloseTo(onVictim, 5);
    expect(attackerLost).toBeCloseTo(onVictim, 5);
    // 讀成 raw 的實作在這裡會是 100 —— 兩個數字必須分得開,不然這條測不到東西。
    expect(attackerLost).not.toBeCloseTo(100, 5);
  });

  it("★ `raw` 讀護甲**之前**的數字", () => {
    const w = makeWorld();
    const [attacker, victim] = pair(w, "raw");
    const [attackerLost] = exchange(w, attacker, victim, 100);
    expect(attackerLost).toBeCloseTo(100, 5);
  });

  it("★ `hpLost` 只算血條真的掉的那一格 —— 護盾全吃掉就反彈 0,而且不發封包", () => {
    const w = makeWorld();
    const [attacker, victim] = pair(w, "hpLost");
    addShield(w, victim, 999, 10, "test-shield");
    const [attackerLost, victimLost] = exchange(w, attacker, victim, 100);
    expect(victimLost).toBe(0);
    expect(attackerLost).toBe(0);
    // 反彈 0 **不可以**變成一發 0 傷害的封包:那會在攻擊者頭上跳一個 0,
    // 而且會白白再觸發一輪 hook。畫面上只該有受害者那一發。
    const dmgEvents = w.events.filter((e) => e.type === "damage");
    expect(dmgEvents).toHaveLength(1);
    expect(dmgEvents[0]!.data.target).toBe(victim);
  });
});

describe("[反彈] damageSource —— owner 的文案是「反彈**普通攻擊**傷害」", () => {
  function victimWith(w: SimWorld, damageSource: "any" | "basic" | "nonBasic"): [EntityId, EntityId] {
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    attachSource(w, victim, {
      id: "src:reflect",
      kind: "item",
      hooks: [reflectHook({ pct: 2, damageSource })],
    });
    return [attacker, victim];
  }

  it("★ `basic` 反彈普攻", () => {
    const w = makeWorld();
    const [a, v] = victimWith(w, "basic");
    const expected = afterArmor(w, v, 100) * 2;
    expect(exchange(w, a, v, 100, "basic")[0]).toBeCloseTo(expected, 5);
  });

  it("★ `basic` **不**反彈技能傷害(沒有這條,道具就變成另一件強得多的道具)", () => {
    const w = makeWorld();
    const [a, v] = victimWith(w, "basic");
    expect(exchange(w, a, v, 100, "ability:thorne.q")[0]).toBe(0);
  });

  it("★ `nonBasic` 是它的反面(兩邊都正向測,過濾才不會是「永遠通過」)", () => {
    const w1 = makeWorld();
    const [a1, v1] = victimWith(w1, "nonBasic");
    const expected = afterArmor(w1, v1, 100) * 2;
    expect(exchange(w1, a1, v1, 100, "ability:thorne.q")[0]).toBeCloseTo(expected, 5);

    const w2 = makeWorld();
    const [a2, v2] = victimWith(w2, "nonBasic");
    expect(exchange(w2, a2, v2, 100, "basic")[0]).toBe(0);
  });

  it("★ 事件沒帶封包時,一個帶 incomingPct 的效果**整條不執行**", () => {
    // 走 `onBasicAttack`(`fireHooks` 沒有 incoming 的那一條路)。
    // 一個「沒有 incoming 就只付 flat」的實作會在這裡打出 77 點傷害 ——
    // 那是一件文案沒有承諾過的東西。
    const w = makeWorld();
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    attachSource(w, attacker, {
      id: "src:reflect",
      kind: "item",
      hooks: [
        {
          on: "onBasicAttack",
          effects: [
            {
              kind: "damage",
              damageType: "true",
              amount: { flat: 77 },
              incomingPct: { perRank: [2] },
            },
          ],
        },
      ],
    });
    const before = w.health.get(victim)!.hp;
    fireHooks(w, attacker, "onBasicAttack", victim);
    combatResolveSystem(w);
    expect(before - w.health.get(victim)!.hp).toBe(0);
    expect(w.damageQueue).toHaveLength(0);
  });
});

describe("[反彈] 終止性 —— A 反彈給 B、B 再反彈回 A 不會變成無窮迴圈", () => {
  /**
   * ⚠️ 這裡的 hook **故意不帶** `damageSource: "basic"`。
   *
   * 帶了的話,反彈封包的 origin 是 `hook:...`,第二層自己就被過濾掉了 ——
   * 那條測試就算把深度閘整段刪掉也會照樣綠(失敗形態 ④)。深度閘必須是這裡
   * **唯一**擋在乒乓球前面的東西,否則它沒有被測到。
   */
  function mutualReflect(maxChainDepth?: number): { events: number; queued: number } {
    const w = makeWorld();
    const a = hero(w, 0, 0);
    const b = hero(w, 1, 1);
    for (const [who, sid] of [
      [a, "src:reflect-a"],
      [b, "src:reflect-b"],
    ] as const) {
      attachSource(w, who, {
        id: sid,
        kind: "item",
        hooks: [reflectHook({ pct: 1, damageSource: "any", ...(maxChainDepth !== undefined ? { maxChainDepth } : {}) })],
      });
    }
    // 血量拉高,免得有人在鏈跑完之前就死了 —— 死了會提早結束,讓數字看起來很乖。
    for (const who of [a, b]) w.health.get(who)!.hp = 1e6;
    w.damageQueue.push({ source: a, target: b, amount: 100, type: "true", crit: false, origin: "basic" });
    combatResolveSystem(w);
    return {
      events: w.events.filter((e) => e.type === "damage").length,
      queued: w.damageQueue.length,
    };
  }

  it("★ 預設 maxChainDepth = 0:剛好交換一次,佇列不留殘渣", () => {
    // 原始那一發 + B 反彈給 A 的那一發 = 2。A 的反彈看到深度 1 > 0 就停手。
    // 拿掉深度閘的話這裡是 4 發(排空預算用完)而且佇列還留著第 5 發 ——
    // 也就是**溢到下一個 tick**,一個 100% 反彈的乒乓球會永遠打下去。
    expect(mutualReflect()).toEqual({ events: 2, queued: 0 });
  });

  it("★ maxChainDepth 是欄位:設 1 就真的多換一輪(2 → 3 發),而且仍然收斂", () => {
    expect(mutualReflect(1)).toEqual({ events: 3, queued: 0 });
  });

  it("★ 上界一路做到頂也還是在同一個 tick 之內結束(不會溢出排空預算)", () => {
    const r = mutualReflect(REFLECT_MAX_CHAIN_DEPTH);
    expect(r.queued).toBe(0);
    expect(r.events).toBe(REFLECT_MAX_CHAIN_DEPTH + 2);
  });

  it("★ `REFLECT_MAX_CHAIN_DEPTH` 撐得住**最好的情況**(必要條件,不是充分條件)", () => {
    // 一條從第 0 輪起跳的鏈:深度 d 的封包在第 d 輪落地,能被生出來的最深封包是
    // maxChainDepth + 1,而排空只跑到第 DAMAGE_QUEUE_MAX_PASSES - 1 輪。
    // ⚠️ 這條不等式**只**證了「最好的情況塞得下」。它以前被當成「反彈一定在同一
    // 個 tick 落地」的證明,而那是錯的 —— 下一個 describe 就是反例。
    expect(REFLECT_MAX_CHAIN_DEPTH + 1).toBeLessThanOrEqual(DAMAGE_QUEUE_MAX_PASSES - 1);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * [反彈] 排空預算 —— 鏈不是都從第 0 輪起跳的
 * ═══════════════════════════════════════════════════════════════════════════
 * `reflectLimits.ts` 以前把 `REFLECT_MAX_CHAIN_DEPTH = DAMAGE_QUEUE_MAX_PASSES - 2`
 * 當成「反彈一定在同一個 tick 之內落地」的證明。那個推導有一個沒有人在守的前提:
 * **觸發反彈的那一發封包在第 0 輪落地**。
 *
 * 而一件 [On-Hit] 道具(`on: onDamageDealt`)排出來的封包在第 **1** 輪才落地,
 * 從它起跳的反彈鏈整條往後平移一輪 —— 尾巴就留在 `world.damageQueue` 裡等下一個
 * tick。49 件傳說裡 16 件是 [On-Hit],所以這是常態不是邊角,而
 * `reflectLimits.ts` 自己寫著「一個晚一 tick 才出現的反彈是 bug report,不是設計」。
 *
 * 實測(2026-08-01,修好之前):殘留 `{amount:10, origin:"hook:…", reflectDepth:3}`。
 *
 * 現在擋它的是**執行期**閘門(`TriggerDamage.resolvePass` + `whenTooLate`),
 * 不是那個不等式。所以下面兩條必須成對:一條證明預設真的不留殘渣,一條證明
 * `"spill"` 真的會留 —— 少了第二條,第一條可能只是「鏈根本沒跑到那麼深」。
 */
describe("[反彈] 排空預算 —— 從 hook 排出來的封包起跳也不會溢到下一個 tick", () => {
  /** 打一場 a→b,a 身上多一個 [On-Hit] proc,兩邊都戴深度到頂的反彈。 */
  function onHitChain(whenTooLate?: "drop" | "spill"): {
    queued: number;
    residue: readonly number[];
  } {
    const w = makeWorld();
    const a = hero(w, 0, 0);
    const b = hero(w, 1, 1);
    const reflect: HookDef = {
      on: "onDamageTaken",
      damageSource: "any",
      effects: [
        {
          kind: "damage",
          damageType: "true",
          amount: { flat: 0 },
          incomingPct: {
            basis: "raw",
            perRank: [1],
            maxChainDepth: REFLECT_MAX_CHAIN_DEPTH,
            ...(whenTooLate !== undefined ? { whenTooLate } : {}),
          },
        },
      ],
    };
    // 這就是 16 件 [On-Hit] 的形狀:命中時再排一發封包 —— 它第 1 輪才落地。
    const onHit: HookDef = {
      on: "onDamageDealt",
      damageSource: "basic",
      effects: [{ kind: "damage", damageType: "true", amount: { flat: 10 } }],
    };
    attachSource(w, a, { id: "src:a", kind: "item", hooks: [reflect, onHit] });
    attachSource(w, b, { id: "src:b", kind: "item", hooks: [reflect] });
    for (const who of [a, b]) w.health.get(who)!.hp = 1e6;
    w.damageQueue.push({
      source: a, target: b, amount: 100, type: "true", crit: false, origin: "basic",
    });
    combatResolveSystem(w);
    return {
      queued: w.damageQueue.length,
      residue: w.damageQueue.map((p) => p.reflectDepth ?? 0),
    };
  }

  it("★ 預設(`whenTooLate` 省略 = drop):佇列排空,沒有任何一發反彈落到下一個 tick", () => {
    // 修好之前這裡是 { queued: 1, residue: [3] } —— 一發深度 3 的反彈晚一 tick。
    expect(onHitChain()).toEqual({ queued: 0, residue: [] });
  });

  it("★ `whenTooLate: \"spill\"` 真的會留 —— 上面那條不是「鏈根本沒那麼深」", () => {
    // 這一條同時是上面那條的**對照組**:同一個場景、只換一個欄位,殘留就回來了。
    // 所以「排空」確實是閘門擋掉的,不是這個場景本來就到不了那個深度。
    const r = onHitChain("spill");
    expect(r.queued).toBe(1);
    expect(r.residue).toEqual([REFLECT_MAX_CHAIN_DEPTH + 1]);
  });

  it("★ drop 只丟掉**塞不下的那一發**,不是把整條鏈關掉", () => {
    // 失敗形態 ④ 的反面:一個「有殘留就整條不反彈」的實作在這裡也會 queued=0。
    // 所以要正向量到 drop 的那一場真的有反彈打出去,而且發數跟 spill 只差一發。
    const w = makeWorld();
    const a = hero(w, 0, 0);
    const b = hero(w, 1, 1);
    const reflect: HookDef = {
      on: "onDamageTaken",
      damageSource: "any",
      effects: [
        {
          kind: "damage",
          damageType: "true",
          amount: { flat: 0 },
          incomingPct: { basis: "raw", perRank: [1], maxChainDepth: REFLECT_MAX_CHAIN_DEPTH },
        },
      ],
    };
    attachSource(w, a, { id: "src:a", kind: "item", hooks: [reflect] });
    attachSource(w, b, { id: "src:b", kind: "item", hooks: [reflect] });
    for (const who of [a, b]) w.health.get(who)!.hp = 1e6;
    const aBefore = w.health.get(a)!.hp;
    w.damageQueue.push({
      source: a, target: b, amount: 100, type: "true", crit: false, origin: "basic",
    });
    combatResolveSystem(w);
    // 從第 0 輪起跳的鏈完全不受閘門影響:深度到頂,發數 = maxChainDepth + 2。
    expect(w.events.filter((e) => e.type === "damage")).toHaveLength(
      REFLECT_MAX_CHAIN_DEPTH + 2,
    );
    expect(aBefore - w.health.get(a)!.hp).toBeGreaterThan(0);
    expect(w.damageQueue).toHaveLength(0);
  });
});

describe("[反彈] 欄位兩端都有界 —— 打錯的數字要載不進來", () => {
  function itemWith(effect: Record<string, unknown>, hookExtra: Record<string, unknown> = {}) {
    return {
      id: "godie-test",
      schema: "item@1",
      name: "測試",
      cost: 0,
      tier: 1,
      tags: [],
      passive: [
        {
          on: "onDamageTaken",
          ...hookExtra,
          effects: [{ kind: "damage", damageType: "physical", amount: { flat: 0 }, ...effect }],
        },
      ],
    };
  }

  it("★ 出貨的 200% 載得進來,「200」(該寫 2.00)載不進來", () => {
    expect(zItemDoc.safeParse(itemWith({ incomingPct: { perRank: [2] } })).success).toBe(true);
    // 這正是 #277 的形態:在 diff 裡跟正確值長得一模一樣,上線後一發普攻秒殺。
    expect(zItemDoc.safeParse(itemWith({ incomingPct: { perRank: [200] } })).success).toBe(false);
    // 邊界本身是合法的,上界再高一點點就不是 —— 證明夾的是這個數字。
    expect(
      zItemDoc.safeParse(itemWith({ incomingPct: { perRank: [INCOMING_PCT_MAX] } })).success,
    ).toBe(true);
    expect(
      zItemDoc.safeParse(itemWith({ incomingPct: { perRank: [INCOMING_PCT_MAX + 0.01] } })).success,
    ).toBe(false);
    // 下界:負的反彈是治療,不是反彈。
    expect(zItemDoc.safeParse(itemWith({ incomingPct: { perRank: [-1] } })).success).toBe(false);
  });

  it("★ maxChainDepth 過不了排空預算就載不進來", () => {
    expect(
      zItemDoc.safeParse(
        itemWith({ incomingPct: { perRank: [1], maxChainDepth: REFLECT_MAX_CHAIN_DEPTH } }),
      ).success,
    ).toBe(true);
    expect(
      zItemDoc.safeParse(
        itemWith({ incomingPct: { perRank: [1], maxChainDepth: REFLECT_MAX_CHAIN_DEPTH + 1 } }),
      ).success,
    ).toBe(false);
  });

  it("★ 兩個新欄位載得進來,打錯的字串載不進來", () => {
    // `.strict()` 是這一條真正在守的東西:少了 Zod 那一半,一個拼錯的
    // `applyGlobalDamageMul`(少一個 t)會安靜地被丟掉,道具在 k≠1 下就是錯的。
    expect(
      zItemDoc.safeParse(
        itemWith({ incomingPct: { perRank: [2], applyGlobalDamageMult: true } }),
      ).success,
    ).toBe(true);
    expect(
      zItemDoc.safeParse(itemWith({ incomingPct: { perRank: [2], whenTooLate: "spill" } })).success,
    ).toBe(true);
    expect(
      zItemDoc.safeParse(itemWith({ incomingPct: { perRank: [2], whenTooLate: "drop" } })).success,
    ).toBe(true);
    // 不在 enum 裡的字串 / 拼錯的欄位名 / 型別不對,三種都要載不進來。
    expect(
      zItemDoc.safeParse(itemWith({ incomingPct: { perRank: [2], whenTooLate: "queue" } })).success,
    ).toBe(false);
    expect(
      zItemDoc.safeParse(
        itemWith({ incomingPct: { perRank: [2], applyGlobalDamageMul: true } }),
      ).success,
    ).toBe(false);
    expect(
      zItemDoc.safeParse(
        itemWith({ incomingPct: { perRank: [2], applyGlobalDamageMult: "yes" } }),
      ).success,
    ).toBe(false);
  });

  it("★ 掛到拿不到封包的事件上 = 解析錯誤,不是安靜的 0", () => {
    // 失敗形態 ②:schema 收得下、後台存得起來、卡片上看得到,而它一次都不會觸發。
    const onKill = { ...itemWith({ incomingPct: { perRank: [2] } }) };
    onKill.passive[0]!.on = "onKill";
    expect(zItemDoc.safeParse(onKill).success).toBe(false);

    const filterOnKill = {
      ...itemWith({}, { damageSource: "basic" }),
    };
    filterOnKill.passive[0]!.on = "onBasicAttack";
    expect(zItemDoc.safeParse(filterOnKill).success).toBe(false);

    // …而掛在帶封包的事件上就過得了(否則上面兩條可能只是「什麼都拒絕」)。
    expect(zItemDoc.safeParse(itemWith({}, { damageSource: "basic" })).success).toBe(true);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 出貨路徑 —— 上面每一份 hook 都是測試自己手寫的(失敗形態 ⑤)
 * ═══════════════════════════════════════════════════════════════════════════
 * 這一段讀**真的那份 JSON**,走**真的那個授予入口**(`grantItemFree`,三選一 /
 * 寶玉 / 任務獎勵共用的那一個),而且把文案裡的「200%」跟資料裡的 `perRank`
 * 對起來 —— 只改一邊就會紅。
 */
describe("反射之盾 godie-i03m —— 出貨的那份文件", () => {
  const SHIELD = "godie-i03m" as ItemId;
  let ready = false;

  beforeAll(async () => {
    for (const r of [Champions, Items]) r.clear();
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
    const result = await new ContentLoader(new FsContentSource(dir)).load();
    registerAll(result.store);
    ready = true;
  });

  it("★ 文案寫的百分比 = 資料裡的百分比(改一邊就紅)", () => {
    expect(ready).toBe(true);
    const def = Items.get(SHIELD);
    const hook = def.passive?.[0];
    expect(hook?.on).toBe("onDamageTaken");
    expect(hook?.damageSource).toBe("basic");
    const eff = hook?.effects[0];
    expect(eff?.kind).toBe("damage");
    const authored = eff?.kind === "damage" ? eff.incomingPct?.perRank[0] : undefined;

    // 從 owner 的文案把數字拆出來 —— 不是把 2 抄第二遍。
    // ⚠️ 文案讀的是**磁碟上那份 JSON**,不是 registry:`ItemDef`(sim 側的型別)
    // 根本沒有 `description` 這個欄位,它只活在 `zItemDoc` 與檔案裡。所以這一條
    // 真的把「玩家讀到的字」跟「sim 吃到的數」對了起來,而不是拿同一個來源
    // 比對自己。
    const raw = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/items/godie-i03m.json"),
        "utf8",
      ),
    ) as { description?: string };
    const m = /反彈普通攻擊傷害\s*(\d+(?:\.\d+)?)%/.exec(raw.description ?? "");
    expect(m, "文案的 [反彈] 那一行變了,資料要跟著變").not.toBeNull();
    expect(authored).toBeCloseTo(Number(m![1]) / 100, 6);
  });

  it("★ 真的裝上去、真的被普攻打到,攻擊者真的掉血", () => {
    expect(ready).toBe(true);
    const w = makeWorld();
    const ids = Champions.ids().slice().sort();
    const championId = ids[0]!;
    const spawn = (seat: number, team: number): EntityId =>
      spawnChampion(w, {
        championId,
        seatId: asSeatId(seat),
        teamId: asTeamId(team),
        pos: { x: CENTER.x + seat, z: CENTER.z },
        zone: 0,
      });
    const attacker = spawn(0, 0);
    const holder = spawn(1, 1);
    // ⚠️ 出貨入口,不是 attachSource —— shop.ts 三個掛載點漏一個,這裡就是 0。
    expect(grantItemFree(w, holder, SHIELD)).toBeGreaterThanOrEqual(0);

    const holderArmor = w.stats.get(holder)!.final[Stat.Armor];
    const attackerArmor = w.stats.get(attacker)!.final[Stat.Armor];
    const RAW = 100;
    const onHolder = RAW * (100 / (100 + Math.max(0, holderArmor)));
    // 出貨的那份文件反彈的是 physical,所以落地時再吃一次攻擊者自己的護甲。
    const backAtAttacker = onHolder * 2 * (100 / (100 + Math.max(0, attackerArmor)));

    const [attackerLost, holderLost] = exchange(w, attacker, holder, RAW, "basic");
    expect(holderLost).toBeCloseTo(onHolder, 5);
    expect(attackerLost).toBeCloseTo(backAtAttacker, 5);
    expect(attackerLost).toBeGreaterThan(0);
  });

  it("★ 出貨的那件道具在 k ≠ 1 下**還是** 200% —— 文案在後台調過旋鈕後仍為真", () => {
    expect(ready).toBe(true);
    // 這一條是「乘兩次」在**出貨路徑**上的守衛(失敗形態 ⑤ + ⑤ 是被測的不是
    // 出貨的那個)。上面那條 200% 的測試跑在 k=1,而 k=1 是唯一看不出缺陷的值:
    // 修好之前這裡 k=0.4 反彈的是 80%,k=2.5 反彈的是 500%,而卡片上寫 200%。
    //
    // 百分比從**磁碟上那份 JSON 的文案**拆出來,不是抄 2 —— 改文案就會紅。
    const raw = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/items/godie-i03m.json"),
        "utf8",
      ),
    ) as { description?: string };
    const m = /反彈普通攻擊傷害\s*(\d+(?:\.\d+)?)%/.exec(raw.description ?? "");
    expect(m, "文案的 [反彈] 那一行變了,守衛要跟著變").not.toBeNull();
    const authoredRatio = Number(m![1]) / 100;

    for (const k of [0.4, 1, 2.5]) {
      const w = new SimWorld(SKELETON_ARENA, 1);
      w.combatEnv = normalizeCombatEnv({ damageDealt: k });
      const ids = Champions.ids().slice().sort();
      const championId = ids[0]!;
      const mk = (seat: number, team: number): EntityId =>
        spawnChampion(w, {
          championId,
          seatId: asSeatId(seat),
          teamId: asTeamId(team),
          pos: { x: CENTER.x + seat, z: CENTER.z },
          zone: 0,
        });
      const attacker = mk(0, 0);
      const holder = mk(1, 1);
      expect(grantItemFree(w, holder, SHIELD)).toBeGreaterThanOrEqual(0);
      for (const who of [attacker, holder]) w.health.get(who)!.hp = 1e7;

      const holderArmor = w.stats.get(holder)!.final[Stat.Armor];
      const attackerArmor = w.stats.get(attacker)!.final[Stat.Armor];
      const RAW = 100;
      // 分母 = 持有者實際吃到的(basis 預設 mitigated:過了他的護甲)。
      const onHolder = RAW * k * (100 / (100 + Math.max(0, holderArmor)));
      const [attackerLost, holderLost] = exchange(w, attacker, holder, RAW, "basic");
      expect(holderLost).toBeCloseTo(onHolder, 5);
      // 出貨反彈的是 physical,落地時再吃一次攻擊者自己的護甲 —— 那一層跟 k 無關,
      // 除掉之後剩下的就是「反彈了我吃到的百分之幾」。
      const backRatio =
        attackerLost / (100 / (100 + Math.max(0, attackerArmor))) / onHolder;
      expect(backRatio, `k=${k}`).toBeCloseTo(authoredRatio, 5);
    }
  });

  it("★ 技能打他不會被反彈(出貨文件上的 `basic` 過濾真的生效)", () => {
    expect(ready).toBe(true);
    const w = makeWorld();
    const ids = Champions.ids().slice().sort();
    const championId = ids[0]!;
    const mk = (seat: number, team: number): EntityId =>
      spawnChampion(w, {
        championId,
        seatId: asSeatId(seat),
        teamId: asTeamId(team),
        pos: { x: CENTER.x + seat, z: CENTER.z },
        zone: 0,
      });
    const attacker = mk(0, 0);
    const holder = mk(1, 1);
    expect(grantItemFree(w, holder, SHIELD)).toBeGreaterThanOrEqual(0);
    expect(exchange(w, attacker, holder, 100, "ability:whatever")[0]).toBe(0);
  });
});
