/**
 * 平衡量測的**共用輸入** —— 出貨設定的讀取器與那兩條算術，住**一個**地方。
 *
 * ⭐ 為什麼它存在（GH#1224）：`gen.ts`（寫五級距的那一支）與
 * `card_template_census.ts`（量「74 張卡共用同一組模板屬性」的那一支）必須**用同一把尺**。
 * ⛔ 兩邊各自 `JSON.parse(combat-env.json)`、各自寫一個 `median()`，
 * 就是第〇·四守則說的**第二個住處** —— 而它們漂掉的那一天，
 * ⭐ 稽核報告會**看起來**在描述級距表的分母，而其實不是。
 *
 * ⚠️ `median()` 取的是**上中位**（偶數筆取右邊那個）—— ⛔ 不是兩個平均。
 * 級距表的五個數字掛在它身上，所以它是**契約**，⛔ 不是實作細節。
 *
 * ⛔ 這一支**不寫任何檔**，也不在 import 時做事 —— `gen.ts` 是 import 即執行的腳本，
 * 反過來 import 它會把產物寫出去。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import {
  COMBAT_ENV_DEFAULTS,
  STAT_ENV_CHAIN,
  statEnvFactor,
  type CombatEnvMultipliers,
} from "../../packages/shared/src/sim/combatEnv";

/** 出貨的戰鬥系統表 —— 引擎真的跑的那一份，⛔ 不是程式預設。 */
export function shippedEnv(repo: string): CombatEnvMultipliers {
  const doc = JSON.parse(readFileSync(join(repo, "content/config/combat-env.json"), "utf-8")) as {
    multipliers?: Record<string, number>;
  };
  return Object.freeze({
    ...COMBAT_ENV_DEFAULTS,
    ...(doc.multipliers ?? {}),
  }) as CombatEnvMultipliers;
}

/** 出貨的基礎加成 —— **倍率之外**的那一層扁平贈禮（owner #273）。 */
export function shippedBaseBonus(repo: string): Readonly<Record<string, number>> {
  const doc = JSON.parse(readFileSync(join(repo, "content/config/base-bonus.json"), "utf-8")) as {
    bonus?: Record<string, number>;
  };
  return Object.freeze({ ...(doc.bonus ?? {}) });
}

/**
 * ⭐ 從**出貨設定檔**讀固定錨點（owner 2026-09-12：「這些常數是**可被編輯的設定檔** 而非寫死」）。
 * ⛔ 不在程式裡寫死 —— 第一守則：owner 會改的東西住 `content/config/`。
 * ⭐ `enabled:false` ⇒ 回空 ⇒ 呼叫端退回取名單中位（＝一鍵 rollback）。
 */
export function shippedAnchors(repo: string): {
  baseHp?: Record<number, number>;
  baseMana?: Record<number, number>;
} {
  try {
    const d = JSON.parse(
      readFileSync(join(repo, "content/config/balance-anchors.json"), "utf-8"),
    ) as { enabled?: boolean; baseHp?: Record<string, number>; baseMana?: Record<string, number> };
    if (d.enabled === false) {
      console.log("⚠️ `balance-anchors.enabled:false` ⇒ ⛔ 錨點**回到取名單中位** —— 刻度會隨上架名單漂。");
      return {};
    }
    const n = (o?: Record<string, number>) =>
      o === undefined
        ? undefined
        : Object.fromEntries(Object.entries(o).map(([k, v]) => [Number(k), v]));
    return { baseHp: n(d.baseHp), baseMana: n(d.baseMana) };
  } catch {
    // ⭐ 設定檔不在（新分支／舊 checkout）⇒ 明說退回，⛔ 不靜默。
    console.log("⚠️ 讀不到 `content/config/balance-anchors.json` ⇒ ⛔ 退回取名單中位（明說，⛔ 不是靜默）。");
    return {};
  }
}

/** ⭐ **上**中位數 —— 偶數筆取右邊那一個，⛔ 不是兩個平均（級距表掛在這個定義上）。 */
export const median = (xs: number[]): number => {
  const b = [...xs].sort((a, z) => a - z);
  return b.length === 0 ? 0 : b[b.length >> 1]!;
};

/** env 鏈在這條屬性上的乘積 —— 純基礎 → 引擎最終的那**一次**倍率。 */
export function envChain(stat: Stat, env: CombatEnvMultipliers): number {
  let k = 1;
  for (const link of STAT_ENV_CHAIN[stat] ?? []) k *= statEnvFactor(link, env, undefined);
  return k;
}
