/**
 * hitstop **按不按得住玩家的腳** —— owner 2026-08-23「被普攻的時候好像會被角色
 * 黏住走不了」的那一格（`config.combat-feel@1` 的 `hitstop`）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ── 量到的（⛔ 不是推測，`combat/attackStickiness.test.ts` 跑真的 `SimWorld`）──
 *
 * 「走不了」的定義是**淨位移**，⛔ 不是「身上有沒有狀態」。逐 tick 量一位被持續
 * 普攻的英雄（意圖位移 = 移速 × dt）得到的答案是：
 *
 *   · `world.status` 一筆都沒有掛上（⛔ 不是減速、⛔ 不是 root）
 *   · 碰撞推擠**不是**主因 —— 被四個人圍住往外走，淨位移 ≈ 意圖的 0.97
 *   · 真正歸零的是 `MovementSystem` 最上面那一段 hitstop：
 *     `t.vel = {0,0}; continue` —— 一發普攻凍 2–8 tick，而 `bumpFreeze` 取
 *     max、`combat/damage.ts` **每一發傷害**重新上值 ⇒ **連段**。
 *
 *   | 場景（100 tick 窗口）        | 完全動不了的 tick |
 *   |---|---:|
 *   | 1 個攻擊者、出貨攻速 0.571   |  4 / 100 |
 *   | 1 個攻擊者、攻速 4（上限 10）| 26 / 100 |
 *   | 8 個圍住、攻速 2             | 39 / 100 |
 *
 *   ⇒ 一群怪貼身時，將近**四成的 tick 玩家的方向盤是被拔掉的**。
 *   （`sim/combatFeel.ts` 的 `DEFAULT_AUTO_ENGAGE` 檔頭早就寫過同一句：
 *    「被兩三個單位輪流打的人 hitstop 是接續的，連起來超過 30 tick 一點都不難」。）
 *
 * ── 它是 owner 兩條路裡的**①「不該有的定身」** ──────────────────────────
 * owner 給了兩條互斥的路：① 是缺陷就修掉；② 真的是狀態就讓它**頭上看得見**。
 * 這一格判①，三個理由，⛔ 每一個都不是手感偏好：
 *
 *   1. ⭐ **它在客戶端結構上預測不到。** 快照裡**沒有** hitstop 的位元
 *      （`net/snapshot.ts` 的 `ROOTED`/`STUNNED` 只從 `status` 推導），而挨打
 *      這件事是**遠端**攻擊者觸發的 ⇒ `LocalPrediction` 的影子每一個 hitstop
 *      tick 都照走、然後被 `reconcile` 拉回來。那正是 GH#370（「原地小步來回」）
 *      的形狀，只是這一次**連 `predictionHold` 都救不了**：那條路要一顆
 *      `ENTITY_FLAG`，而且扣留期間玩家要多等一趟 RTT。
 *   2. **它沒有任何回饋。** 頭上沒有圖示、身上沒有狀態，畫面上和「網路卡了」
 *      一模一樣。
 *   3. **它連段。** 上表。單發 67 ms 是節拍，連起來 1.3 秒是拔方向盤。
 *
 * ── ⭐ 保留下來的那一半（⛔ 這不是「把 hitstop 拿掉」）────────────────────
 *   · **出手的人**照凍（`holdsAttackerWalk`，出貨 true）—— 他本來就得站定才打得
 *     出來（`combatFeel.standstill`），所以那一段凍住不花任何走位權。
 *   · **位移覆寫**（擊退／衝刺）照凍 —— 「先定格、再滑出去」是 #133 的節拍，
 *     而那一段位移本來就不是玩家的方向盤（`combatJuice.test.ts` 釘著它）。
 *   · `world.hitstop` / `world.hitstun` 兩張表**一格都沒動** ⇒ 出手前搖
 *     (`BasicAttackSystem`)、施法 (`CastResolveSystem`)、收招 (`RecoverySystem`)
 *     的暫停與 `digest` 全部照舊。改的只有「腳步」這一件事。
 *
 * ── 誰是「挨打的那一方」：⭐ 零新狀態的判準 ──────────────────────────────
 * `world.hitstun` 是**挨打者專屬**的那張表（`combat/damage.ts` 只對 `target`
 * 寫），而它恆 ≥ 同一發的 hitstop、且和 hitstop 在**同一個 `age()`** 裡遞減。
 * ⇒ 「這一格 hitstop 是不是因為挨打而來的」直接讀它就好，⛔ 不必新增第二張表
 * （新表要進 `digest`、要進快照、要多一個會漂走的住處）。
 * ⚠️ 唯一的邊角：內容授權 `hitFeel.hitstopTicks > 12` 時 hitstun 會先到期
 * （`HITSTUN_MAX_TICKS`），最後幾 tick 會被當成出手方。出貨內容授權的最大值是
 * **5**，所以今天碰不到；真的有人授權 20 時，那是他自己要的定格。
 *
 * ── purity ──────────────────────────────────────────────────────────────
 * 無 rng、無時鐘、無三角函式、無 `**`；只讀三張 Map 的單一 key。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";

export interface HitstopRules {
  /**
   * 決策點：hitstop 期間，**挨打的那一方**的腳步要不要一起被按住。
   *
   * false（出貨）= 不按。挨打不會把走位權拿走 —— 上面量到的那四成 tick 回到玩家手上。
   * true         = 這條缺陷被修之前的行為（雙方一起定格）。⭐ 留著它是為了**一鍵回頭**。
   */
  holdsVictimWalk: boolean;
  /**
   * 決策點：hitstop 期間，**出手的那一方**的腳步要不要被按住。
   *
   * true（出貨）= 按住。他本來就得站定才打得出來，所以這一段不花走位權，
   *              而「揮中的那一下雙方一起頓一格」是 #133 的節拍。
   */
  holdsAttackerWalk: boolean;
}

/**
 * 出貨值。⭐ owner 2026-08-23 說「沒做完以前別問我了自己判斷 但是留後台開關可以
 * 簡易 rollback」—— `holdsVictimWalk: false` 是**我挑的**那一邊，
 * 回頭的路就是把這一格改成 `true`（後台：戰鬥手感 → 命中定格）。
 */
export const DEFAULT_HITSTOP: HitstopRules = Object.freeze({
  holdsVictimWalk: false,
  holdsAttackerWalk: true,
});

/** 正規化操作者/文件給的表 —— 缺格一律回出貨預設。 */
export function normalizeHitstopRules(raw: unknown): HitstopRules {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return Object.freeze({
    holdsVictimWalk:
      typeof r.holdsVictimWalk === "boolean" ? r.holdsVictimWalk : DEFAULT_HITSTOP.holdsVictimWalk,
    holdsAttackerWalk:
      typeof r.holdsAttackerWalk === "boolean"
        ? r.holdsAttackerWalk
        : DEFAULT_HITSTOP.holdsAttackerWalk,
  });
}

/**
 * 這一份世界的規則。⚠️ 一律走這支，⛔ 不要直接讀 `world.combatFeel.hitstop!` ——
 * 那一格是選用的（半張手寫表的既有測試靠它編得過，理由與 `facing` 逐字相同）。
 */
export function hitstopRules(world: SimWorld): HitstopRules {
  return world.combatFeel.hitstop ?? DEFAULT_HITSTOP;
}

/**
 * 這一 tick，hitstop 要不要把**這具身體的腳**按住？
 *
 * ⛔ 這支不回答「身上有沒有 hitstop」（那是 `world.hitstop.get(id) > 0`），
 * 它回答的是那一格**要不要吃掉位移**。
 */
export function hitstopHoldsBody(world: SimWorld, id: EntityId): boolean {
  if ((world.hitstop.get(id) ?? 0) <= 0) return false;
  // 位移覆寫（擊退／衝刺）一律照舊定格：那一段位移不是玩家的方向盤。
  if (world.nav.get(id)?.override != null) return true;
  const rules = hitstopRules(world);
  return (world.hitstun.get(id) ?? 0) > 0 ? rules.holdsVictimWalk : rules.holdsAttackerWalk;
}
