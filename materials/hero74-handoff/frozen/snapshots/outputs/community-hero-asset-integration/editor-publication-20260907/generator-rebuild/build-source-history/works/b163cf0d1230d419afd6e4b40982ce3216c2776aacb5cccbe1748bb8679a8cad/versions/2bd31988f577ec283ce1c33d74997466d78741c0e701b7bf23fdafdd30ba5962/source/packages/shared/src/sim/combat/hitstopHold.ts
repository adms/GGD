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
// 保險絲要問「他是不是被**設計**按住的」—— 讀既有的唯一判準,⛔ 不抄第二份。
import { movementHold, type MovementHold } from "../movementHold";
// 釋放的可見回饋走 `floatingText` 這條**既有**的事件路（型別在 emit 站旁邊,
// GH#571 修好的那條）。`import type` —— 零 runtime 相依,不成環。
import type { FloatingTextEvent } from "../effects/clientCues";

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
  /**
   * ⭐ 定格**時長**倍率 0..1（GH#646, owner：「hitstop 先設定為0 求順暢為主」）。
   *
   * 上面兩格管「定格期間**誰的腳**被按住」，這一格管「定格**存不存在**」——
   * `combat/damage.ts` 在衝擊推導＋內容授權（`hf.hitstopTicks`）之後把
   * `hitstopTicks` 乘上它（`scaleHitstopTicks`）。0（出貨）= 攻守雙方都
   * **零凍結 tick**（hitstun 隨之歸零 —— 它只在 hitstop > 0 時才生成）；
   * 1 = #133 的完整節拍，逐位元舊行為（一鍵 rollback）。
   *
   * 選用的理由與 `stuckGuard` 逐字相同（手寫半張表的既有測試）；
   * ABSENT ⇒ 1 —— 舊文件與測試夾具不會突然失去定格。讀一律走
   * `hitstopScaleOf(world)`，⛔ 不要直接讀這一格。
   */
  scale?: number;
  /**
   * ⭐ 黏住累積**保險絲**（owner 2026-08-23：「請你最大程度解決黏住這個問題，
   * 包括有一個累積值，黏超過 2秒一定可以離開之類，這些機制做成後台開關」）。
   *
   * 選用的理由與 `CombatFeelRules.facing` 逐字相同（手寫半張表的既有測試）。
   * 讀的時候一律走 `stuckGuardRules(world)`。語意見 {@link StuckGuardRules}。
   */
  stuckGuard?: StuckGuardRules;
}

/**
 * ⭐ 黏住累積保險絲 —— 上面那兩格開關治的是「hitstop 該不該按腳」，這一格治的是
 * 「**不管誰在按**，挨打型的凍結累積超過門檻就一定放人」。
 *
 * ── 界線（⛔ 這是設計決定，寫清楚讓 owner 可以推翻）─────────────────────────
 *   · **治**：hitstop victim-hold（`holdsVictimWalk: true` 回開時）＋ 擊倒
 *     （`world.knockdown`）的 root 部分 —— 兩者都是「挨打」的副產品，沒有圖示、
 *     沒有狀態、玩家看不見。
 *   · **⛔ 不治**：stun／root／施法自鎖／recovery 鎖 —— 硬控是**設計**，有狀態、
 *     有圖示、可被【淨化】。保險絲只治「被普攻黏住」這一族。
 *   · 累積也只數**治得了的** tick：一個同時被 stun 按住的 tick 不數 ——
 *     數了只會在放不了人的時候喊「掙脫」。
 *
 * ── 累積語意（全部絕對 tick，決定性）────────────────────────────────────────
 *   「想動」（nav 有 moveTarget）而被挨打型凍結按住的 tick → `held + 1`；
 *   自由的 tick → `freeRun + 1`，連續自由滿 `windowSec` 就把 `held` 歸零。
 *   ⇒ 連段（打 5 tick、放 2 tick、再打…）**跨 gap 累積**，正常走路（偶爾挨一下）
 *   很快歸零。`held ≥ thresholdSec` ⇒ 釋放 `releaseSec`，並在頭上冒「掙脫」。
 */
export interface StuckGuardRules {
  /** 總開關。false = 保險絲整個不存在（回到 G1 之前的行為）。 */
  enabled: boolean;
  /** 累積黏住幾秒就放人。owner 的數字：2。 */
  thresholdSec: number;
  /** 連續自由走滿幾秒，累積歸零重數（0 = 一個自由 tick 就歸零 = 只認連續黏住）。 */
  windowSec: number;
  /** 釋放窗長度：這段期間挨打型凍結不按腳（0 = 只累積不放人 = 等於關）。 */
  releaseSec: number;
}

/**
 * 出貨值。⭐ owner 2026-08-23「沒做完以前別問我了自己判斷 但是留後台開關可以
 * 簡易 rollback」—— `thresholdSec: 2` 是他的原話（「黏超過 2秒一定可以離開」），
 * 其餘三格是**我挑的**，回頭的路就是後台那四格（戰鬥手感 → 命中定格）。
 */
export const DEFAULT_STUCK_GUARD: StuckGuardRules = Object.freeze({
  enabled: true,
  thresholdSec: 2,
  windowSec: 0.5,
  releaseSec: 1.5,
});

/** 正規化。夾限 0..10 與 Zod 的上下界**逐字相同**（admin 的鏡射測試會比對）。 */
export function normalizeStuckGuardRules(raw: unknown): StuckGuardRules {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const num = (v: unknown, fallback: number): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
    return v < 0 ? 0 : v > 10 ? 10 : v;
  };
  return Object.freeze({
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_STUCK_GUARD.enabled,
    thresholdSec: num(r.thresholdSec, DEFAULT_STUCK_GUARD.thresholdSec),
    windowSec: num(r.windowSec, DEFAULT_STUCK_GUARD.windowSec),
    releaseSec: num(r.releaseSec, DEFAULT_STUCK_GUARD.releaseSec),
  });
}

/**
 * 出貨值。⭐ owner 2026-08-23 說「沒做完以前別問我了自己判斷 但是留後台開關可以
 * 簡易 rollback」—— `holdsVictimWalk: false` 是**我挑的**那一邊，
 * 回頭的路就是把這一格改成 `true`（後台：戰鬥手感 → 命中定格）。
 */
export const DEFAULT_HITSTOP: HitstopRules = Object.freeze({
  holdsVictimWalk: false,
  holdsAttackerWalk: true,
  /**
   * ⚠️ 程式 fallback 是 **1**（舊行為），⛔ 不是出貨值 —— 出貨的 **0** 住在
   * `content/config/combat-feel.json`（真的被載入的那一份）。理由：這個常數
   * 只有「沒有 config 的世界」（＝測試夾具）讀得到，而既有的定格守衛
   * （`attackStickiness` 的儀器、`combatJuice` 的「先定格再滑出去」）全靠
   * 預設世界仍有定格才量得到機制還活著。
   */
  scale: 1,
  stuckGuard: DEFAULT_STUCK_GUARD,
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
    // ⚠️ 夾限 0..1 與 Zod 的上下界**逐字相同**（admin 的鏡射測試逐格比對）。
    scale:
      typeof r.scale === "number" && Number.isFinite(r.scale)
        ? r.scale < 0
          ? 0
          : r.scale > 1
            ? 1
            : r.scale
        : DEFAULT_HITSTOP.scale,
    stuckGuard: normalizeStuckGuardRules(r.stuckGuard),
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
 * 這一份世界的定格時長倍率 0..1（GH#646）。手寫的半張 `hitstop` 表（既有測試
 * 夾具）沒有這一格 ⇒ 回 1（舊行為），⛔ 不是回出貨值 —— 出貨值住在 config 文件。
 */
export function hitstopScaleOf(world: SimWorld): number {
  const s = hitstopRules(world).scale;
  if (typeof s !== "number" || !Number.isFinite(s)) return 1;
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

/**
 * 把一發命中的 `hitstopTicks` 乘上世界的定格倍率 —— `combat/damage.ts` 在
 * 衝擊推導＋內容授權之後、寫進 `world.hitstop`/組 ImpactProfile **之前**呼叫。
 *
 * scale 1 走 early-return ⇒ **逐位元**舊行為（不經過浮點乘法）；
 * scale 0 ⇒ 0 ⇒ `damage.ts` 的 `if (hitstopTicks > 0)` 整段跳過 ——
 * 攻守都不凍、hitstun 也不生成（owner：「hitstop 先設定為0 求順暢為主」）。
 */
export function scaleHitstopTicks(world: SimWorld, ticks: number): number {
  if (ticks <= 0) return 0;
  const s = hitstopScaleOf(world);
  if (s >= 1) return ticks;
  if (s <= 0) return 0;
  return Math.round(ticks * s);
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
  if ((world.hitstun.get(id) ?? 0) > 0) {
    // 挨打的那一方：保險絲的釋放窗內**不按**（挨打型凍結正是它治的東西）。
    return rules.holdsVictimWalk && !stuckReleaseActive(world, id);
  }
  return rules.holdsAttackerWalk;
}

// ═════════════════════════ 黏住累積保險絲（I1, owner 2026-08-23）═════════════

/** 這一份世界的保險絲規則。⛔ 不要直接讀 `world.combatFeel.hitstop!.stuckGuard!`。 */
export function stuckGuardRules(world: SimWorld): StuckGuardRules {
  return hitstopRules(world).stuckGuard ?? DEFAULT_STUCK_GUARD;
}

interface StuckState {
  /** 累積的「想動但被挨打型凍結按住」tick 數。 */
  held: number;
  /** 連續自由 tick 數 —— 滿 `windowSec` 就把 `held` 歸零。 */
  freeRun: number;
  /** 釋放窗的到期 tick（絕對 tick；0 = 沒有釋放窗）。 */
  releaseUntil: number;
  /** 上一次記帳的 tick —— 斷帳（死亡/被背走）超過 1 tick 就重數。 */
  lastTick: number;
}

/**
 * 逐 world 的保險絲狀態。WeakMap → 世界被丟掉時狀態跟著走；只做 key 存取，
 * ⛔ 永不迭代 ⇒ 決定性與 purity 都不受影響。刻意**不進 digest**：它是由同一串
 * 決定性輸入推導出來的，兩份重播必然算出同一份。
 */
const stuckStates = new WeakMap<SimWorld, Map<EntityId, StuckState>>();

function stuckState(world: SimWorld, id: EntityId): StuckState {
  let per = stuckStates.get(world);
  if (per === undefined) {
    per = new Map();
    stuckStates.set(world, per);
  }
  let st = per.get(id);
  if (st === undefined) {
    st = { held: 0, freeRun: 0, releaseUntil: 0, lastTick: world.tick };
    per.set(id, st);
  }
  return st;
}

/** 這一 tick，這具身體在保險絲的**釋放窗**內嗎？ */
export function stuckReleaseActive(world: SimWorld, id: EntityId): boolean {
  if (!stuckGuardRules(world).enabled) return false;
  const st = stuckStates.get(world)?.get(id);
  return st !== undefined && world.tick < st.releaseUntil;
}

/**
 * 「把擊倒遮掉之後，設計硬控（root/stun/施法鎖…）還按著他嗎？」
 *
 * ⚠️ 用「暫時 delete → 問 `movementHold` → set 回去」的方式遮，⛔ 不抄第二份
 * root 判斷 —— `movementHold` 是唯一判準（它的檔頭自己這麼說），抄一份就是兩份
 * 會漂走的程式。delete/set 在同一個同步區塊內完成；`world.knockdown` 只被逐 key
 * 讀（decay 的迭代逐條獨立，順序無關），插入序的擾動沒有任何讀者。
 */
function heldByDesignSansKnockdown(world: SimWorld, id: EntityId): boolean {
  const kd = world.knockdown.get(id);
  if (kd === undefined) return movementHold(world, id).rooted;
  world.knockdown.delete(id);
  const rooted = movementHold(world, id).rooted;
  world.knockdown.set(id, kd);
  return rooted;
}

/**
 * `MovementSystem` 讀移動限制的入口 —— 釋放窗內把**擊倒的 root 部分**遮掉
 * （stun／root／施法鎖原封不動），其餘時刻與 `movementHold` 逐位元相同。
 */
export function movementHoldWithStuckRelease(world: SimWorld, id: EntityId): MovementHold {
  if ((world.knockdown.get(id) ?? 0) > 0 && stuckReleaseActive(world, id)) {
    const kd = world.knockdown.get(id)!;
    world.knockdown.delete(id);
    const hold = movementHold(world, id);
    world.knockdown.set(id, kd);
    return hold;
  }
  return movementHold(world, id);
}

/**
 * 保險絲的逐 tick 記帳。`MovementSystem` 在 hitstop 的 `continue` **之前**呼叫
 * （被按住的 tick 正是要數的那些）。`wantsMove` = nav 有 moveTarget。
 *
 * ⛔ 只看英雄（`world.stats` —— 小怪刻意沒有 StatsComp，見 MovementSystem）：
 * 保險絲救的是**玩家的方向盤**，而且 1,000 隻殭屍逐 tick 各問一次 movementHold
 * 是每 tick 白燒的錢。
 */
export function stuckGuardTick(world: SimWorld, id: EntityId, wantsMove: boolean): void {
  const rules = stuckGuardRules(world);
  if (!rules.enabled) return;
  if (!world.stats.has(id)) return;
  const st = stuckState(world, id);
  if (world.tick - st.lastTick > 1) {
    // 斷帳（死亡那幾 tick / 被背走）→ 重數,別讓上一條命的累積借給這一條。
    st.held = 0;
    st.freeRun = 0;
  }
  st.lastTick = world.tick;
  if (world.tick < st.releaseUntil) return; // 釋放窗內不累積

  const overridden = world.nav.get(id)?.override != null; // 位移中 = 在動,不是黏住
  const hs = hitstopRules(world);
  const beatenHeld =
    !overridden &&
    ((world.knockdown.get(id) ?? 0) > 0 ||
      ((world.hitstop.get(id) ?? 0) > 0 && (world.hitstun.get(id) ?? 0) > 0 && hs.holdsVictimWalk));

  if (wantsMove && beatenHeld) {
    // 設計硬控同時在按的 tick：不累積也不歸零 —— 保險絲治不了它,數了只會在
    // 放不了人的時候喊「掙脫」。
    if (heldByDesignSansKnockdown(world, id)) return;
    st.held += 1;
    st.freeRun = 0;
    const thresholdTicks = Math.max(1, Math.round(rules.thresholdSec / world.dt));
    const releaseTicks = Math.round(rules.releaseSec / world.dt);
    if (st.held >= thresholdTicks && releaseTicks > 0) {
      st.releaseUntil = world.tick + releaseTicks;
      st.held = 0;
      st.freeRun = 0;
      emitStuckRelease(world, id);
    }
    return;
  }
  // 自由（或根本沒想動）的 tick：連續滿 windowSec 就把累積翻頁歸零。
  st.freeRun += 1;
  if (st.freeRun > Math.round(rules.windowSec / world.dt)) {
    st.held = 0;
    st.freeRun = 0;
  }
}

/**
 * 釋放的可見回饋 —— 頭上冒「掙脫」。走 `floatingText` 這條**既有**的事件路
 * （typed payload + fanout 已放行），⛔ 不開新協定欄位。
 *
 * ⚠️ **這一段在 2026-08-25 之前寫著「客戶端 `FloatingTextFx` 真的在畫」，而那是假的**
 * （第三守則）：那條事件路當時**沒有任何渲染消費端** —— 池子裡是 active 的，
 * 畫面上零像素。渲染那一半在 GH#701 才補上（`ui/WorldAnchorLayer.tsx`）。
 * ⛔ sim 這一側不替客戶端作證：閘在 `apps/client/src/ui/floatingTextRenders.test.ts`。
 */
function emitStuckRelease(world: SimWorld, id: EntityId): void {
  const t = world.transform.get(id);
  if (t === undefined) return;
  const payload: FloatingTextEvent = {
    text: "掙脫",
    colorRgb: [150, 230, 255],
    sizeScale: 1.2,
    durationSec: 1,
    subjects: [{ id, x: t.pos.x, z: t.pos.z }],
    caster: id,
    zone: t.zone,
  };
  world.emit("floatingText", payload as unknown as Record<string, unknown>);
}
