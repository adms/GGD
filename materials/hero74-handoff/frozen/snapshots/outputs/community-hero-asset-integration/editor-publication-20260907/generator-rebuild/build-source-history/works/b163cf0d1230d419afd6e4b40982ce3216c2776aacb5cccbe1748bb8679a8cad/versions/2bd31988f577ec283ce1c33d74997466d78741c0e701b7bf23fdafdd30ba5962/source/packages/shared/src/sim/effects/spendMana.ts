/**
 * `spendMana` — 消耗法力. The mirror of `restore.manaPct`, and the half of the
 * vocabulary that was missing until 20-01 風王結界 needed it.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS NOT `AbilityDef.manaCost`
 * ---------------------------------------------------------------------------
 * `manaCost` is charged ONCE, by `castAbility`, BEFORE the effects run, and a
 * caster who cannot pay is REFUSED the cast (abilities/abilitySystem.ts). A WC3
 * ORB — 風王結界's 「每次攻擊消耗 30 法力」 — is none of those three things: the
 * toggle is cast once and the charge recurs on every SWING, the charge is paid
 * from a hook rather than from a cast, and an empty pool must NOT stop the
 * swing, only the bonus. Modelling it as `manaCost` would have made Saber
 * unable to auto-attack at 29 mana, which is a different (and much worse)
 * ability than the one the card promises.
 *
 * ---------------------------------------------------------------------------
 * IT SPENDS; IT DOES NOT DECIDE
 * ---------------------------------------------------------------------------
 * Whether there is enough to spend is asked ONCE, by the hook's `condition`
 * (「自身法力 >= 30」, sim/content/condition.ts), BEFORE any effect in the list
 * runs. This module deliberately carries no threshold of its own:
 *
 *   · a second copy of the number could drift out of sync with the visible one,
 *     and the visible one is what the tooltip renders;
 *   · a built-in "refuse when short" would make 「把剩下的法力全部燒掉」
 *     un-authorable;
 *   · the condition gate ALSO suppresses the sibling `damage` effect in the
 *     same list, which is what 「法力不足就不觸發」 actually means. A gate
 *     living in here could only ever skip the spend, leaving the bonus damage
 *     free.
 *
 * What it DOES guarantee is that the pool cannot go negative: the withdrawal is
 * clamped to what is actually there. A partial payment is still a payment — an
 * authored `condition` is what makes that case unreachable for cards that care.
 *
 * ---------------------------------------------------------------------------
 * VISIBILITY (失敗形態 ②) —— ⭐ GH#411：那個「後續」到了
 * ---------------------------------------------------------------------------
 * 這一段以前寫著「不發事件不是疏漏，法力條每 tick 都投影過去了」，而那句話
 * 只對**自己付錢**的那一半成立。71-00 暗夜契約的靈氣讓**敵人**施法時有 12%
 * 機率現存法力歸零（`auras[] → hooks[onAbilityCast] → spendMana`），於是
 * 一整條藍條在一個 tick 內被清空，**而世界上沒有任何人說發生過什麼** ——
 * 玩家看到的是自己的法力莫名其妙不見了，跟一次掉包、一個 bug、或是自己記錯
 * 完全無法區分。⚠️ 那個洞在【魔力全失】被拆成純 JSON **之前就存在**：
 * 舊的 `nightPactBurn` 事件在整個 `apps/client` 樹裡是零個消費端。
 *
 * ⇒ 這裡發一則**通用**的 `manaSpend`，⛔ 不是一支技能專屬的事件名 ——
 * 它是 `manaRestore` 的鏡像，而**每一個** `spendMana` 的作者一起受惠
 * （20-01 風王結界的每擊扣魔、熾天使之弓削目標的 3%、光之杖的存款）。
 * 客戶端消費端與外送理由見 `apps/game-server/src/net/eventFanout.ts`。
 *
 * CADENCE：由作者掛的 hook 決定，⛔ 不是每 tick。出貨內容最密的一筆是
 * `godie-emfr.passive` 的 `onInterval` + `internalCooldown 1`（≤1/s/持有者），
 * 其餘全是 `onBasicAttack` / `onAbilityCast`（由攻速與施法次數 bound）。
 *
 * ⚠️ 發的是**實扣量**（`before - hp.mana`），⛔ 不是 `want`：付不出全額的時候
 * 螢幕上那個數字必須等於血條真的少掉的量，否則兩個來源會當著玩家的面打架。
 * 扣到 0 的那一次不發（`spent > 0` 才發），所以空魔的英雄不會每一刀噴一個 0。
 *
 * PURITY: two float writes on an existing component. No rng, no clock, no trig.
 * `world.events` 是每 tick 清空的呈現層記錄，⛔ 不進 digest ⇒ replay 逐位元不變。
 */
import type { EffectKindSpec } from "./effectKind";
import { resolveScaling } from "./effect";
import { casterAttrs, casterSlotRank, casterStats } from "./effectCommon";
import { scalingOracle } from "../content/condition";

export const spendManaEffect: EffectKindSpec<"spendMana"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // `applyTo` defaults to "self": the overwhelming case is a cost the ability's
    // OWNER pays. `ctx.targets` on a hook is the EVENT's entity (the unit you
    // just hit), so defaulting the other way would have turned every orb into a
    // mana burn on the victim — a different mechanic that this field can also
    // express, deliberately, but only when asked for.
    const payers = e.applyTo === "target" ? ctx.targets : [ctx.caster];
    // Resolved against the CASTER's stats even when the TARGET pays: `Scaling
    // .ratios` is defined as "ratios of the caster" everywhere else in the
    // union (see the `Scaling` doc comment), and a mana burn that scaled off the
    // victim's own AP would be the only effect in the game that inverts it.
    const flat = resolveScaling(casterStats(ctx), e.amount, ctx.rank, casterAttrs(ctx), scalingOracle(ctx.world, ctx.caster, ctx.targets[0]), casterSlotRank(ctx));
    for (const payer of payers) {
      const hp = world.health.get(payer);
      if (!hp?.alive) continue;
      // The percentage term reads the PAYER's own pool — that is the whole
      // point of a percentage cost, and it is the one number that cannot come
      // from the caster.
      const pct = (e.pctMaxMana ?? 0) * hp.maxMana;
      // 「削去**現存** MP 3%」(熾天使之弓 godie-i012,owner 2026-08-01 從 5% 調下來).
      // 同一句話的另一半:分母是
      // PAYER 自己的條,而且是**現在**的量,不是上限。跟 `pctMaxMana` 相加而不是
      // 二選一 —— 兩個欄位都在回答同一個問題(「這次要提多少」),而它們各自的
      // 名字都誠實。為什麼不是給 `pctMaxMana` 加一個 basis:見 `EffectDef` 上
      // `pctCurrentMana` 的說明(名字寫著 Max 的欄位不可以有時候是 current)。
      const pctCur = (e.pctCurrentMana ?? 0) * hp.mana;
      const want = flat + pct + pctCur;
      if (!(want > 0)) continue;
      // Clamped BOTH ways: never below 0 (a negative pool desyncs every
      // 「法力 >= N」 condition downstream and renders as a broken bar), and
      // never more than is there.
      const before = hp.mana;
      hp.mana = Math.max(0, hp.mana - want);
      // ⭐ GH#411 —— 「這條藍條剛剛少了多少」的唯一通道（檔頭 VISIBILITY）。
      // `target` 是**付錢的那個**（不一定是施法者:`applyTo:"target"` 的燒魔
      // 由受害者付），所以浮動文字掛在它身上;`source` 才是做這件事的人。
      if (before > hp.mana) {
        world.emit("manaSpend", {
          target: payer,
          source: ctx.caster,
          amount: before - hp.mana,
          remaining: hp.mana,
          origin: ctx.origin,
        });
      }
      // 存款 (`bankAs`) —— 記下**實扣量**,不是 `want`。付不出全額的時候玩家
      // 只付了 `before`,而他買到的傷害必須對應他真的付出去的東西;寫 `want`
      // 會讓一個空魔的英雄按下 EX 就領到滿額加成。
      const bank = e.bankAs;
      if (bank !== undefined) {
        const spent = before - hp.mana;
        if (spent > 0) {
          const st = world.status.get(payer) ?? { effects: [] };
          const expiresAtTick = world.tick + Math.round(bank.durationSec / world.dt);
          // Keyed on statusId + origin, exactly like applyStatus's refresh rule:
          // two different cards banking under the same marker must not overwrite
          // each other's deposit.
          const existing = st.effects.find(
            (s) => s.statusId === bank.statusId && s.sourceId === ctx.origin,
          );
          if (existing) {
            existing.expiresAtTick = expiresAtTick;
            existing.magnitude = spent;
          } else {
            st.effects.push({
              statusId: bank.statusId,
              sourceId: ctx.origin,
              expiresAtTick,
              magnitude: spent,
            });
          }
          world.status.set(payer, st);
        }
      }
    }
  },
};
