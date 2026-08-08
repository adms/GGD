/**
 * `eventValueConversion` —— 把**這次事件的一個數值**轉成另一種資源。
 *
 * 擋住兩支形狀相同、來源不同的技能：
 *   · 15-002 太陰道「將傷害轉化為自身魔力，以及短暫加成至 AP」
 *     → 來源 = 剛剛那一發傷害（`EffectContext.incoming`）
 *   · 59-01 吞噬「[回復]等同其剩餘生命的生命值」
 *     → 來源 = 目標**當下的**生命
 *
 * ── ⛔ 為什麼它不能是 `Scaling` 的一筆 ───────────────────────────────────
 * `Scaling` 只讀得到**施法者**的 `final` 屬性表。「剛剛打中我的那一下有多重」
 * 與「他現在剩多少血」都不是施法者的屬性，所以在這個 kind 之前這兩句文案
 * **根本寫不出來**（與 `TriggerDamage` 檔頭記錄的反射之盾同一種空卡）。
 *
 * ── ⚠️ 待 freeze 的決策點：基數 ─────────────────────────────────────────
 * 計畫 §16.12 明講 `raw | mitigated | hpLost` 三選一**還沒 freeze**。
 * 所以它是一格**欄位**，預設 `"mitigated"`（文件的建議，也與
 * `damage.incomingPct.basis` 的預設逐字相同 —— 兩處問的是同一個問題，
 * 答案不同的那一天沒有人會發現）。`editorCapabilities` 那一筆標 `partial`
 * 並寫明「待 owner freeze」。
 *
 * ── 沒有 `incoming` 時整條不執行 ────────────────────────────────────────
 * 與 `damage.incomingPct` 同一個立場：技能施放、投射物命中、DoT tick 都沒有
 * 「剛剛那一下」，退化成 0 會變成一發看起來有作用、實際上永遠給 0 的效果
 *（失敗形態 ②）。所以 `source:"incomingDamage"` 而 `ctx.incoming` 缺席時
 * **直接 return**。
 *
 * ── purity ────────────────────────────────────────────────────────────────
 * 無 rng、無時鐘、無三角函式；到期用**絕對 tick**（`world.tick + N`）。
 */
import type { EffectKindSpec } from "./effectKind";
import { ModOp } from "../stats/modifiers";
import { attachSource } from "../stats/statPipeline";
import { healTarget, restoreMana } from "../combat/restore";
import { shapeTargets } from "./shapeTargets";
import { CONVERT_BUFF_MAX_SEC, CONVERT_MAX_RATIO } from "./kindLimits";

export const eventValueConversionEffect: EffectKindSpec<"eventValueConversion"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const ratio = Math.max(-CONVERT_MAX_RATIO, Math.min(CONVERT_MAX_RATIO, e.ratio));
    const targets = shapeTargets(e, ctx);

    // ── 來源值 ───────────────────────────────────────────────────────────
    let value = 0;
    if ((e.source ?? "incomingDamage") === "incomingDamage") {
      const inc = ctx.incoming;
      if (!inc) return; // 「這一下」不存在 → 整條不執行（見檔頭）
      const basis = e.basis ?? "mitigated";
      value = basis === "raw" ? inc.raw : basis === "hpLost" ? inc.hpLost : inc.mitigated;
    } else {
      // `targetCurrentHealth` —— 59-01「等同其剩餘生命」。多目標時累加，
      // 因為「吞掉兩個人就回兩份」是這句話唯一自洽的推廣。
      for (const id of targets) value += world.health.get(id)?.hp ?? 0;
    }
    if (!(value > 0)) return;

    const converted = value * ratio;
    if (!(converted > 0)) return;

    // ── 收款人 ───────────────────────────────────────────────────────────
    const payees = (e.who ?? "self") === "self" ? [ctx.caster] : targets;

    for (const payee of payees) {
      const hp = world.health.get(payee);
      if (!hp?.alive) continue;
      if ((e.to ?? "mana") === "mana") {
        restoreMana(world, {
          source: ctx.caster,
          target: payee,
          amount: converted,
          origin: ctx.origin,
        });
      } else {
        // 走出貨的 `healTarget`，所以它自動吃 `combatEnv.healing` 與【重創】。
        healTarget(world, {
          source: ctx.caster,
          target: payee,
          amount: converted,
          origin: ctx.origin,
          score: true,
        });
      }

      // ── 「以及**短暫**加成至 AP」 ─────────────────────────────────────
      // 一個限時的 flat 屬性來源。⚠️ 它與上面的資源轉換是**同一個數值**的兩種
      // 用途（太陰道的文案就是「轉成魔力，並且加成 AP」），所以 ratio 分開一格
      // 是必要的 —— 否則 AP 加成的大小會被綁死在魔力回復的大小上。
      if (e.buff) {
        const dur = Math.min(e.buff.durationSec, CONVERT_BUFF_MAX_SEC);
        attachSource(world, payee, {
          id: `conv:${ctx.origin}#${world.tick}`,
          kind: "buff",
          modifiers: [
            { stat: e.buff.stat, op: ModOp.Flat, value: value * (e.buff.ratio ?? ratio) },
          ],
          // 絕對 tick（CLAUDE.md 硬約束：到期一律絕對 tick，不是遞減計數器）。
          expiresAtTick: world.tick + Math.round(dur / world.dt),
        });
      }
    }
  },
};
