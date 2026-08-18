/**
 * 型別連擊免疫 —— 「連續受到 N 次同型別傷害之後，免疫該型別」（史萊姆裝）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 它是一台**狀態機**，⛔ 不是第二個 `block`、也不是第二個 `invulnerable`
 *
 * `block` 是「每一發各抽一次骰」的機率門；`invulnerable` 是「這段時間內免疫」
 * 的到期 tick。這一條兩個都不是 —— 它的觸發條件是**歷史**：同一型別連續打中
 * 我幾發。所以它需要一張表（{@link SimWorld.damageStreak}），而那張表就是這支
 * 模組的全部狀態。
 *
 * 兩支解析器分別掛在傷害佇列的兩個位置（`combat/damage.ts`）：
 *   · {@link refusesByTypeStreak} —— **閘**，緊接在 `refusesDamage`（無敵）之後。
 *     `continue` 整發丟掉，逐字照無敵那一段的理由：被拒的封包不可以走護盾池、
 *     不可以發 `damage`，否則客戶端會演一發從來沒發生的攻擊。
 *   · {@link noteDamageStreak} —— **記帳**，在閃避之後、扣血之前。
 *     「連續受到 2 次」數的是**真的挨到**的那幾發，⛔ 不是被丟出來的那幾發。
 *
 * ⭐ 兩者的順序有一個不明顯但決定性的後果：**被免疫擋掉的那一發不會被記進
 * 連擊**（它在閘那裡就 `continue` 了）。所以連擊會**凍結**在門檻上，免疫持續
 * 到「來了另一種被列進 `damageTypes` 的傷害」為止 —— 那正是卡片上寫的那句話，
 * 也是這件寶具唯一的破解方式。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② 沒被列進 `damageTypes` 的型別**既不累計也不打斷**
 *
 * schema 的 `.describe()` 逐字寫著「哪幾種傷害會被**計進連擊**、並在達標後被
 * 免疫」。所以一發真傷（火圈 #270 就是真傷）落在兩發物理之間時，它不會把物理
 * 連擊打斷 —— 它根本不在這台狀態機的字母表裡。
 * ⛔ 反過來的讀法（「不同型別一律打斷」）會讓「真傷不列入」這句話變成一個
 * **負面**效果，而那不是任何一張卡片說過的話。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 多個來源共用**一張**紀錄，所以合併規則只有一條：⛔ 不可以讓任何一張卡少給
 *
 * `threshold` 與 `damageTypes` 在**閘**那一側是逐來源各問各的（每張卡對自己的
 * 門檻負責）。但 `resetMode` 與 `streakTimeoutSec` 影響的是**記帳**，而紀錄只有
 * 一份 —— 兩張規則不同的卡必須談出一個答案。合併方向由一句話決定：
 *
 *   **合併之後，⛔ 不可以有任何一張卡比它自己印的字更難觸發。**
 *
 * ⇒ `resetMode`：只要有一張是 `restart`（異型的那一發自己算新連擊第 1 發），
 *   結果就是 `restart`；全部都是 `zero` 才是 `zero`。反過來會讓 restart 那張卡
 *   多要一發，而卡片不會跟著改 —— 那正是第一·五守則要治的病。
 * ⇒ `streakTimeoutSec`：取**最長**的（缺席 = 無限長，直接勝出）。取最短會讓
 *   長逾時那張卡的連擊被別人的時鐘洗掉。
 *
 * ⛔ 這兩條合併**不需要**第四個欄位進 `DamageStreakState` —— 加欄位就要同時動
 * `SimWorld.digest()` 的折入段（詞彙包那一位的檔），而一個沒被折進 hash 的欄位
 * 就是一條 replica 之間可以無聲分家的路。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 已知落差（⛔ 不要當成 bug 修掉，它需要一個**數字**而那個數字是 owner 的）
 *
 * `streakTimeoutSec` 缺席時連擊**永不逾時**，於是它也**跨回合**：上一回合結束時
 * 凍結在門檻上的連擊，下一回合開打的第一秒就是免疫。`clearRoundScoped`
 * （`sim/clearPools.ts`）清的是 status/shields/dot/buffs 四池，⛔ 不含這張表，
 * 而那支函式與 `MatchController` 都是跨 lane 的共用檔。
 * ⇒ 填上任何一個 `streakTimeoutSec`（中場遠比它長）就同時修掉這件事。
 * 出貨要不要填、填多少，是平衡資料 ⇒ owner 決定（計畫書 §4-4 ②）。
 *
 * PURITY（sim/purity.test.ts）：不抽 rng、不看時鐘、到期一律走絕對 tick、
 * 沒有三角函式與 `**`。
 */
import { TICK_HZ } from "../../constants";
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { DamageType } from "../effects/effect";

/**
 * 一個來源授予的型別連擊免疫 —— `ModifierSource.typeStreakImmunity` 的值型別，
 * 與 `content/schema/effect.ts` 的 `zTypeStreakImmunityGrant` 逐欄鏡像。
 *
 * ⚠️ `resetMode` / `streakTimeoutSec` 缺席的語意寫在那一份 schema 的
 * `.describe()` 上（`restart` / 永不逾時），⛔ 不要在這裡寫第二份預設值。
 */
export interface TypeStreakImmunityGrant {
  readonly damageTypes: readonly DamageType[];
  readonly threshold: number;
  readonly resetMode?: "restart" | "zero";
  readonly streakTimeoutSec?: number;
}

/**
 * 一具身體現在的**同型連擊**紀錄 —— `SimWorld.damageStreak` 的值型別。
 *
 * 絕對 tick（`lastTick`），⛔ 不是遞減計數器：CLAUDE.md 的硬性約束，而
 * `streakTimeoutSec` 的逾時判定要靠它與 `world.tick` 相減。
 */
export interface DamageStreakState {
  /** 目前連續挨的是哪一型。 */
  type: DamageType;
  /** 連續幾發了（含這一發）。 */
  count: number;
  /** 最後一發是第幾個絕對 tick 落地的。 */
  lastTick: number;
}

/** 秒 → 絕對 tick 的間隔。缺席 = 永不逾時（`Infinity`，⛔ 不是一個大數字）。 */
function timeoutTicks(sec: number | undefined): number {
  return sec === undefined ? Number.POSITIVE_INFINITY : Math.round(sec * TICK_HZ);
}

/** 這個來源現在還算不算數（`applyBuff` 生出來的限時來源自己帶到期 tick）。 */
function sourceLive(world: SimWorld, expiresAtTick: number | undefined): boolean {
  return expiresAtTick === undefined || expiresAtTick > world.tick;
}

/**
 * 記帳側要用的**合併後**政策，⛔ 不是閘那一側用的（見檔頭 ③）。
 * `null` = 這具身體身上一份有效的授予都沒有 ⇒ 記帳整段不做事（ZERO GUARANTEE）。
 */
interface StreakPolicy {
  /** 會被計進連擊的型別（所有有效授予的**聯集**）。 */
  types: DamageType[];
  /** 合併後的逾時（取最長，見檔頭 ③）。 */
  timeout: number;
  /** 合併後的重置模式（restart 勝出，見檔頭 ③）。 */
  resetMode: "restart" | "zero";
}

function policyFor(world: SimWorld, victim: EntityId): StreakPolicy | null {
  const sc = world.stats.get(victim);
  if (sc === undefined) return null; // 建築/花/投射物沒有 StatsComp
  let out: StreakPolicy | null = null;
  for (const src of sc.sources) {
    const g = src.typeStreakImmunity;
    if (g === undefined) continue;
    if (!sourceLive(world, src.expiresAtTick)) continue;
    if (out === null) out = { types: [], timeout: 0, resetMode: "zero" };
    for (const t of g.damageTypes) if (!out.types.includes(t)) out.types.push(t);
    out.timeout = Math.max(out.timeout, timeoutTicks(g.streakTimeoutSec));
    if ((g.resetMode ?? "restart") === "restart") out.resetMode = "restart";
  }
  return out;
}

/**
 * 這一發封包會不會被「型別連擊免疫」整包拒收？
 *
 * ⚠️ **逐來源各問各的**：門檻與型別涵蓋是那一張卡的性質，⛔ 不可以先合併成一個
 * 數字再比 —— 「這一條門檻是 2 而那一條是 5」在加總的那一刻就沒了
 *（`ModifierSource.typeStreakImmunity` 的註解把同一個論證寫過第三次）。
 *
 * ZERO GUARANTEE：沒有紀錄、或紀錄的型別不是這一發的型別時，`world.stats` 連
 * 讀都不讀 ⇒ 對每一份既有內容是一次 Map lookup，⛔ 沒有 rng、沒有配置。
 */
export function refusesByTypeStreak(
  world: SimWorld,
  victim: EntityId,
  type: DamageType,
): boolean {
  const st = world.damageStreak.get(victim);
  if (st === undefined || st.type !== type) return false;
  const sc = world.stats.get(victim);
  if (sc === undefined) return false;
  for (const src of sc.sources) {
    const g = src.typeStreakImmunity;
    if (g === undefined) continue;
    if (!sourceLive(world, src.expiresAtTick)) continue;
    if (!g.damageTypes.includes(type)) continue;
    // 逾時的連擊不算 —— ⚠️ 這裡也要問一次，⛔ 不可以只在記帳那側問：閘跑在
    // 記帳**之前**，少了這一行，一發隔了三十秒才飛來的攻擊會被一條早就該死的
    // 連擊擋下來，而下一行才會把它歸零。
    if (world.tick - st.lastTick > timeoutTicks(g.streakTimeoutSec)) continue;
    if (st.count >= g.threshold) return true;
  }
  return false;
}

/**
 * 記一發**真的落地**的傷害進連擊計數（閃避之後、扣血之前）。
 *
 * ZERO GUARANTEE：`policyFor` 回 `null`（沒有任何來源授予）時直接返回，
 * 所以 `world.damageStreak` 對每一份既有內容**永遠是空的** ⇒ `digest()` 的
 * 條件式折入一格都不動，既有錄影 hash 逐位元不變。
 */
export function noteDamageStreak(world: SimWorld, victim: EntityId, type: DamageType): void {
  const p = policyFor(world, victim);
  if (p === null) return;
  // 檔頭 ②：沒被列進來的型別既不累計也不打斷。
  if (!p.types.includes(type)) return;
  const st = world.damageStreak.get(victim);
  if (st === undefined) {
    world.damageStreak.set(victim, { type, count: 1, lastTick: world.tick });
    return;
  }
  const stale = world.tick - st.lastTick > p.timeout;
  if (st.type === type && !stale) {
    st.count += 1;
  } else {
    // 異型（或逾時）⇒ 這一發是**新**連擊的起點。
    // `zero` 只在真的打斷一條活著的連擊時才有意義：逾時的那一條已經死了，
    // 沒有東西可以「歸零」，所以這一發照樣算第 1 發。
    st.type = type;
    st.count = !stale && p.resetMode === "zero" ? 0 : 1;
  }
  st.lastTick = world.tick;
}
