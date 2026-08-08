/**
 * `extendBuff` —— **受傷延長既有增益的剩餘時間**。
 *
 * 擋住一支：
 *   · 52-01 狂戰士之怒「期間每承受自身[最大生命] 5% 的傷害，
 *                       『狂怒』持續時間**延長 2 秒**」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① ⛔ 先問過了：現有詞彙**組不出來**（這一段是結論，不是猜測）
 *
 * 任務指定要先確認「applyBuff + onDamageTaken hook 能不能組出來」。逐條查過：
 *
 *   · `applyBuff.stackKey` 的既有路徑寫的是
 *     `existing.expiresAtTick = world.tick + duration`（`applyBuff.ts`）——
 *     那是**重設到滿**，不是**延長**。用它寫 52-01 的話，挨一下就回到 6 秒，
 *     挨十下還是 6 秒，而卡上寫的是「延長」。兩者在長時間對線裡差很多。
 *   · **沒有任何條件葉讀得到傷害量**：`condition@1` 今天的葉子是
 *     `chance` / `stat` / `kind` / `status` / `equipment`，一個都不是「剛剛那一下
 *     打了多少」。所以「每承受 5% 最大生命」這個門檻寫不出來。
 *   · `HookDef` 的過濾器（`victim` / `damageSource` / `damageType` / `chance` /
 *     `internalCooldown`）問的都是「**是誰、是什麼**」，沒有一格問「**多少**」。
 *
 * 三條路都不通，所以這是一個真的空洞，不是「把三個現成的東西接起來」。
 * ⭐ 但它是**最便宜**的一個空洞：見 ②。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⭐ 它**不需要任何新的狀態**，因為延長是**連續**的而不是階梯式的
 *
 * 直覺的作法是「累積一個計數器，滿 5% 就發 2 秒」。那需要一格累積器，而累積器
 * 只能住在 `ModifierSource` 上 —— 也就是一次跨檔接線。
 *
 * 但卡上那句話是一個**比率**：「每承受 X 的傷害延長 Y 秒」。連續讀法
 * （`延長 = Y × 這一發傷害 / X`）在**總量上與階梯式完全相同**，差別只有那 2 秒
 * 是一次到位還是分次到位 —— 而它不需要記住任何東西，因為每一發封包自己就帶著
 * 它該貢獻的那一份。
 *
 * ⛔ 我**沒有**做成 `granularity: "continuous" | "stepped"` 欄位。第一守則說
 * 決策點要做成欄位，但一個只有一半值真的會動的欄位是失敗形態 ②（欄位存在、
 * 沒有人餵它）—— `"stepped"` 要等累積器那一格接上才寫得出來。今天做連續、
 * 把理由寫在這裡，比放一個假旋鈕誠實。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ ⭐⭐ `maxRemainingSec` 是**必填**，因為這條是正回饋
 *
 * 「挨得越多、狂怒越久」在一個高血量、高減傷的身體上會自己咬住尾巴：
 * 延長 → 吸血更久 → 活更久 → 挨更多 → 再延長。沒有上界它會變成**永久**，
 * 而症狀是「這場回合就是打不完」—— 一個沒有錯誤訊息、也不會讓任何測試變紅的
 * 故障。所以上界不是選填的保險，是這個機制的一部分。
 *
 * 上界釘的是**延長後的剩餘時間**（`world.tick + maxRemainingSec`），不是
 * 「總共延長了幾秒」—— 後者需要記住原本多長（又是一格狀態），前者只要讀
 * `expiresAtTick`。兩者擋住的是同一件事，而只有一個是無狀態的。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ 沒有那一發傷害就**整條不執行**
 *
 * 與 `eventValueConversion` 逐字相同：`ctx.incoming` 只有 `fireHooks` 在
 * `onDamageTaken` / `onDamageDealt` 上會填。掛錯事件的文件不會「延長 0 秒」，
 * 它**什麼都不做** —— 早退比退化成一個半吊子的效果誠實。
 *
 * ⚠️ `basis` 預設 `"hpLost"` 而**不是** `"mitigated"`（`eventValueConversion`
 * 選的是後者）。兩者不同是刻意的：那一支問的是「這一下打出多少能量」，
 * 而 52-01 問的是「我**被打掉**多少血」——「每承受自身最大生命 5% 的傷害」
 * 裡的「承受」對照的是血條。護盾吃掉的那一份不該延長狂怒。
 * 三個讀數仍然是一格欄位（計畫 §16.12 未 freeze）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑤ purity
 *
 * 不抽 rng、不看時鐘、沒有三角函式、沒有 `**`；寫的是**絕對 tick**。
 * 來源以 `sources` 的插入序走訪，不迭代 Map。
 * **ZERO GUARANTEE**：找不到那個 `stackKey` 的來源（或沒有 `incoming`）時，
 * 它在改任何狀態之前就回來。
 */
import type { EntityId } from "../../ids";
import type { EffectKindSpec } from "./effectKind";
import { shapeTargets } from "./shapeTargets";
import { EXTEND_BUFF_MAX_ADD_SEC, EXTEND_BUFF_MAX_REMAINING_SEC } from "./kindLimits";

/**
 * `applyBuff.stackKey` 造出來的來源 id —— **一份**定義，兩邊共用。
 *
 * ⚠️ 這個字串格式是 `applyBuff.ts` 的堆疊路徑寫死的（`buff:stack:${stackKey}`）。
 * 抄第二份的那一天它們會分岔，而症狀是「延長對某些 buff 沒反應」，
 * 一個看起來像平衡問題的缺陷。
 */
export function stackedBuffSourceId(stackKey: string): string {
  return `buff:stack:${stackKey}`;
}

export const extendBuffEffect: EffectKindSpec<"extendBuff"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // ④ 沒有那一發就整條不執行。
    const inc = ctx.incoming;
    if (!inc) return;

    const basis = e.basis ?? "hpLost";
    const taken = basis === "raw" ? inc.raw : basis === "mitigated" ? inc.mitigated : inc.hpLost;
    if (!(taken > 0)) return;

    const bodies: EntityId[] =
      (e.who ?? "self") === "self" ? [ctx.caster] : shapeTargets(e, ctx);
    const addSec = Math.max(0, Math.min(EXTEND_BUFF_MAX_ADD_SEC, e.addSec));
    if (!(addSec > 0)) return;
    const capTicks =
      world.tick +
      Math.round(
        Math.max(0, Math.min(EXTEND_BUFF_MAX_REMAINING_SEC, e.maxRemainingSec)) / world.dt,
      );
    const id = stackedBuffSourceId(e.stackKey);

    for (const body of bodies) {
      const sc = world.stats.get(body);
      if (!sc) continue;
      const src = sc.sources.find((s) => s.id === id);
      // 那個 buff 不在身上（還沒開狂怒 / 已經到期）→ 什麼都不做。
      // ⛔ 不「順便幫他掛上」：這個 kind 的名字是「延長」，掛新的是 `applyBuff`。
      if (!src || src.expiresAtTick === undefined) continue;
      if (src.expiresAtTick <= world.tick) continue;

      // 門檻：優先讀百分比（52-01 的「自身最大生命 5%」），否則讀固定點數。
      let threshold = 0;
      if (e.perDamagePctOfMaxHealth !== undefined) {
        threshold = (world.health.get(body)?.maxHp ?? 0) * e.perDamagePctOfMaxHealth;
      } else if (e.perDamageFlat !== undefined) {
        threshold = e.perDamageFlat;
      }
      if (!(threshold > 0)) continue;

      // ② 連續讀法：這一發自己貢獻它該有的那一份。
      const addTicks = Math.round((addSec * (taken / threshold)) / world.dt);
      if (addTicks <= 0) continue;
      // ③ 上界釘在**延長後的剩餘時間**上。
      src.expiresAtTick = Math.min(capTicks, src.expiresAtTick + addTicks);
    }
  },
};
