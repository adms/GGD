/**
 * `convertTeam` handler —— 「把一隻單位借到我這一隊」的那一刻（大師球）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它擁有什麼、不擁有什麼
 *
 * 這一支只負責**一次捕獲**：誰、幾隻、借多久。狀態、記帳、歸位、到期全部在
 * `sim/mindControl.ts` —— 與 `effects/taunt.ts` ↔ `sim/taunt.ts` 逐字相同的
 * 分工，理由也相同：合法性與歸位在**每一 tick** 被重新問，寫入只發生一次。
 *
 * ⚠️ 它**不**發傷害、不回血。卡片上「並回復牠 50% 生命」是同一個 `effects[]`
 * 裡的下一格 `restore{applyTo:"target", healthPct:0.5}` —— ⛔ 不要把它搬進來，
 * 那會變成「陣營轉換」這個機制自帶一段沒有人授權的治療（第〇·五守則：引擎做
 * 機制、JSON 做技能）。
 *
 * PURITY：不抽 rng（沒有籤可以抽）、不看時鐘。到期換算走 `world.dt`，
 * 結果是**絕對 tick**。
 */
import type { EffectKindSpec } from "./effectKind";
import { shapeTargets } from "./shapeTargets";
import { captureUnit } from "../mindControl";

/**
 * schema 上那幾格 `.optional()` 的**出貨預設**，逐字對應
 * `content/schema/effect.ts` 的 `convertTeam` 分支註解。
 *
 * ⛔ 三個都不是「隨便挑一個」：`maxHeld` 2 是 schema 寫著的那個數字，
 * `oncePerRoundPerVictim` 的 true 是「這條機制落地之前的行為」那一側。
 * ⭐ `countsForOriginalTeam` 的預設在 2026-08-18 被 **owner 翻成 false** ——
 * 「物理意義上⋯實質上這個單位就是我方單位」。第〇·六守則：高層級（owner 的
 * 新裁決）贏而且預設啟動，`true` 留著只是為了一鍵回頭。
 */
const DEFAULT_MAX_HELD = 2;

export const mindControlEffect: EffectKindSpec<"convertTeam"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const maxHeld = e.maxHeld ?? DEFAULT_MAX_HELD;
    // 圓形時**只**抓敵人：`convertTeam` 沒有 `side` 那一格（借走自己人是
    // 一個沒有意義的動作），所以這裡把它釘死而不是讓 `shapeTargets` 的
    // 「缺席＝友方圓」預設接手 —— 那個預設是替 `carry` 寫的。
    // `maxTargets` 給 `maxHeld` 是為了讓「近的先」那一刀切在對的地方：
    // 少了它，一個 8 人的圓會按 id 而不是按距離決定誰被抓走。
    const victims = shapeTargets(
      { shape: e.shape, radius: e.radius, side: "enemies", maxTargets: maxHeld },
      ctx,
    );
    if (victims.length === 0) return;

    // 到期：**絕對 tick**（sim 硬性約束）。`death` / `roundEnd` 沒有時間軸 ——
    // 前者由 `DeathSystem` 歸位、後者由 `MatchController.enterCombat()`，
    // 所以它們在時間上是「永不到期」而不是「一個很大的數字」。
    let expiresAtTick = Number.POSITIVE_INFINITY;
    if (e.until === "duration") {
      const ticks = Math.round((e.durationSec ?? 0) / world.dt);
      // ⛔ 0 tick 的捕獲不寫進去：它會在同一 tick 內被到期掃描還回去，而畫面上
      // 是一次什麼都沒發生的閃爍。一份沒填 `durationSec` 的 `until:"duration"`
      // 文件因此是**明確的不生效**，不是一次無限期的捕獲。
      if (ticks <= 0) return;
      expiresAtTick = world.tick + ticks;
    }

    const opts = {
      expiresAtTick,
      maxHeld,
      oncePerRoundPerVictim: e.oncePerRoundPerVictim ?? true,
      // ⭐ owner 2026-08-18：「實質上這個單位就是我方單位」⇒ 預設 **false**
      //（被借走的英雄不再替原隊活著）。`true` 是一鍵回頭。
      countsForOriginalTeam: e.countsForOriginalTeam ?? false,
    };

    // ② 玩家看得見這件事發生了嗎？**看得見，而且不是靠事件**：被借走的那一格
    // 在 snapshot 上點著 `ENTITY_FLAG.TEAM_OVERRIDE{,_A,_B}`，客戶端整條隊伍色
    // /小地圖/死亡觀戰去飽和都從那一個擴散點分出去，所以那具身體**當場換顏色**。
    //
    // ⛔ 這裡刻意**不** `world.emit("convertTeam", …)`：那會是一個沒有任何客戶端
    // handler 的新事件型別（`eventFanout.ts` 的 `immune` 就正躺在那個狀態 ——
    // 過了網、沒有人讀），而且會逼這一條 lane 去改一個共用的白名單檔。
    // 要加播報/音效的那一天，事件與**讀它的那一端**一起加。
    for (const victim of victims) captureUnit(world, victim, ctx.caster, opts);
  },
};
