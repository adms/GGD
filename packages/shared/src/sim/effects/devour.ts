/**
 * `devour` —— 【吞噬】（owner 2026-08-05）。
 *
 * owner 給的規格（初號機 EX）：
 *
 *     [主動][指向] [吸血][吞噬] 60秒冷卻 消耗MP 50/80/110/140 施法距離11
 *     初號機肚肚打雷了，可以直接吞噬生命剩餘 3/5/7/9% 敵方英雄(即死)，並回復等值生命。
 *
 * 也就是一發**處決**：目標剩餘生命低於門檻 → 立刻死，施法者回復「吞下去的那些血」。
 *
 * ── ⛔ 為什麼它走傷害佇列，而不是直接把 `hp.hp = 0` ────────────────────────
 * 因為「死」在這個引擎裡不是一個欄位，是一整條路：擊殺賞金（#90）· `onKill`
 * hooks · 掉金幣（#191）· 擊殺語音 · 回合結算 · MVP 統計 · 復活圈。
 * 直接寫 0 的話上面每一項都要在這裡重寫一次，而它們分岔的那一天沒有人會發現
 *（那正是這一批一直在修的形態）。所以這裡做的事是：算出致死量，推一發真實傷害
 * 進 `world.damageQueue`，剩下的交給出貨的那條路。
 *
 * ── ⛔ 護盾不可以靜默地讓「即死」失效 ─────────────────────────────────────
 * 一個帶護盾的目標，如果致死量只算 `hp.hp`，那一發會被護盾吃掉一部分 →
 * **他不會死**，而技能卡上寫著「即死」。這是七種失敗形態的第 ② 種最貴的一版：
 * 花了 60 秒冷卻 + 140 魔力，畫面上只看到「他掉了一點血」。
 *
 * 所以 `throughShields`（預設 **true**）把當下吃得到的護盾一起算進致死量。
 * 它是一格**欄位**而不是寫死，因為「處決穿不穿盾」是一個真的設計決定 ——
 * 一個「先破盾才吞得掉」的版本是合理的平衡手段，只是不是出貨的那一個。
 *
 * ⚠️ **回復的是「生命」，不是「生命＋護盾」**。owner 寫的是「回復等值生命」，
 * 而被吞掉的生命就是 `hp.hp`。穿盾只影響**打得死不死**，不影響回多少。
 *
 * ── 門檻讀的是「剩餘生命 ÷ 最大生命」 ────────────────────────────────────
 * 「生命剩餘 3%」= `hp.hp <= hp.maxHp * 0.03`。逐階一格（`perRank`），
 * 因為 owner 的規格本來就是 3/5/7/9。
 *
 * ── purity ──────────────────────────────────────────────────────────────
 * 無 rng、無時鐘、無三角函式；只讀被 `shapeTargets` 排好序的目標。
 */
import type { EntityId } from "../../ids";
import type { EffectKindSpec } from "./effectKind";
import { shapeTargets } from "./shapeTargets";
import { healTarget } from "../combat/restore";
import { eligibleShieldTotal } from "../combat/damage";
// ⛔ 直接 import `runEffects` 是這個檔案唯一會形成的環（devour → effectRunner →
// effectRegistry → devour），而 `randomArea` / `blink` / `weightedBranch` 三支已經
// 走同一條路：它們都是**在同一個 tick 之內**接著跑一段巢狀效果，而 `bakeList`
// 那條 seam 是給**延遲** payload（`leap.onLand`）用的。⛔ 不要為了避開這個環而
// 把 onDevour 做成延遲 payload —— 那會讓「吞噬成功」與「+1 AP」跨 tick，而中間
// 那一格裡目標可能已經被免死救回來。
import { runEffects } from "./effectRunner";

export const devourEffect: EffectKindSpec<"devour"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // 逐階門檻。夾在陣列兩端 —— 與 `incomingPct.perRank` 的規矩逐字相同。
    const pct =
      e.thresholdPctOfMax[Math.min(Math.max(1, ctx.rank), e.thresholdPctOfMax.length) - 1] ?? 0;
    if (!(pct > 0)) return;
    const healPct = e.healPct ?? 1;
    const throughShields = e.throughShields !== false;
    /**
     * ⭐ S9a —— **真的吞掉的那些人**。這一串就是「上一個效果成功了沒有」的答案：
     * 空的 = 一發都沒過處決線 = {@link EffectDef.onDevour} 整段不跑。
     *
     * ⛔ 「用 onKill 代替」不成立：`onKill` 的三個發射點都沒有 abilitySlot、沒有
     * incoming，所以「吞噬殺掉的」與「普攻殺掉的」在觸發器端分不出來 —— 一個
     * 「每吞噬一名永久 +1 AP」的天生技會在整場每一次補刀上發動。
     */
    const devouredIds: EntityId[] = [];

    for (const id of shapeTargets(e, ctx)) {
      const hp = world.health.get(id);
      if (!hp?.alive) continue;
      // 「敵方**英雄**單位」—— owner 的文案。做成欄位是因為第 3 回合之後場上
      // 大多數敵人是殭屍，而「吞不吞得掉殭屍」是平衡決定不是判斷式。
      if ((e.victim ?? "champion") === "champion" && !world.champion.has(id)) continue;
      if (!(hp.maxHp > 0)) continue;
      if (hp.hp > hp.maxHp * pct) continue; // 還沒進入處決線

      const devoured = hp.hp; // 吞下去的**生命**（回復讀它）
      // ⛔ `+ 1` 是刻意的，不是保險起見。實測（`devour.test.ts` 的護盾那條）：
      // 剛好等於「血 + 盾」的致死量在浮點下會讓血停在 **1.4e-14**，
      // 而 `deathSystem` 讀的是 `hp <= 0` —— 也就是「即死」在畫面上變成
      // 「血條空了但他還站著」。一點溢殺是這條線上唯一不用比較浮點的寫法。
      const lethal =
        devoured + (throughShields ? eligibleShieldTotal(hp.shields, world.tick, "true") : 0) + 1;
      if (!(devoured > 0)) continue;

      world.damageQueue.push({
        source: ctx.caster,
        target: id,
        amount: lethal,
        // 真實傷害：處決不吃護甲魔抗。吃的話「剩 3%」這條線在一個高護甲目標
        // 身上會變成「剩 3% 但我打不死他」—— 又一次「卡上寫了、遊戲裡沒有」。
        type: "true",
        crit: false,
        origin: ctx.origin,
        // ⛔ **不吃全域傷害倍率**。致死量是從這個身體**當下的血**算出來的，
        // 再被 `combatEnv.damageDealt` 乘一次就不再是致死量 —— k = 0.5 的那一天
        // 這發處決會變成「打掉一半殘血」，而卡上寫著即死。
        // （這也是為什麼 `damage.incomingPct` 有同名的旗標：同一類錯誤。）
        skipGlobalDamageMult: true,
      });

      if (healPct > 0) {
        // 走出貨的 `healTarget`，所以它自動吃 `combatEnv.healing`、
        // **也自動吃【重創】的 `healingTakenMult`**（A6）—— 那是對的：
        // 一個帶重創的人吞噬回的血本來就該打折。
        healTarget(world, {
          source: ctx.caster,
          target: ctx.caster,
          amount: devoured * healPct,
          origin: ctx.origin,
          score: true,
        });
      }
      devouredIds.push(id);
    }

    /**
     * ⭐ S9a —— **上一個效果真的成功了才跑下一個**（92-03「每吞噬一名敵人永久
     * +1 AP」）。
     *
     * ⚠️ 觸發時刻是「處決線通過、致死量已經排進佇列」那一刻，**不是**「屍體確認
     * 了」—— 一個帶【免死】的目標會被吞噬打到卻活下來，而這一段已經跑過。那是
     * 刻意的：等到死亡確認要跨相位（`combatResolveSystem` → `deathSystem`），
     * 而跨相位就要記住「剛剛是誰吞的、用哪一階吞的」= 一格新的世界狀態。
     * schema 的欄位說明逐字寫了同一句，所以作者看得到這個邊界。
     *
     * `onDevourPer` 省略 = `"victim"`（每吞掉一個人各跑一次）。對出貨唯一的形狀
     * （`shape: "single"`）兩個值完全等價 —— 也就是這個預設不替任何人做決定。
     * ⛔ 走 `runEffects` 而不是自己 `applyEffect`：巢狀那一段的 `condition` 閘、
     * rng 預算、per-target 過濾必須與第一層是**同一套**（`effectRunner` 檔頭）。
     */
    if (e.onDevour !== undefined && devouredIds.length > 0) {
      if ((e.onDevourPer ?? "victim") === "cast") {
        runEffects(e.onDevour, { ...ctx, targets: devouredIds });
      } else {
        for (const victim of devouredIds) {
          runEffects(e.onDevour, { ...ctx, targets: [victim] });
        }
      }
    }
  },
};
