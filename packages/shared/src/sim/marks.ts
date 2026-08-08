/**
 * 具名標記（層數）—— 【試煉】【風王結界】【縮地】共用的**同一個**機制。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 這支存在的理由：引擎裡「層數」一格都放不下
 *
 * 2026-08-08 對照 owner 的技能重製需求時量到的：想寫「初始 12 層試煉，受到
 * 致命傷害時消耗一層」，現有詞彙**三條路全部不通**：
 *
 *   · `applyBuff.stackKey` —— 是**加法**計數（每次套用 +1），不是扣減；而且層數
 *     住在一個帶 `expiresAtTick` 的 `ModifierSource` 上，一定會過期。
 *   · `applyStatus` —— 同 `statusId` + 同來源是「取 max 到期、**不疊層**」
 *     （`applyStatus.ts:45-51`），天生就沒有層數；而且 `duration` 硬夾 0.034~20 秒。
 *   · `grantAttribute` —— 只認 str/agi/int，發不出 ad / maxHealth。
 *
 * 所以這不是「把三個現成的東西接起來」，是一個真的空洞。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⭐ 標記的**身分是借來的**，不是一個新的文件型別
 *
 * owner 2026-08-08：「[試煉] 可以是任意技能的標記 like [風王結界] [縮地]」、
 * 「都可以任意替換設定為 [技能編號/buff/debuff狀態]」。
 *
 * 所以 {@link MarkId} 就是**一個既有文件的 id**：
 *   · 一個技能編號 —— `godie-hapm.passive`（十二道試煉）、`godie-e00l.w`（風王結界）
 *   · 或一個 status-effect id —— 任何 buff / debuff
 *
 * 這樣做的代價是零：名稱、圖示、描述**全部跟著那份文件走**，標記不需要自己的
 * 一套。而好處是 owner 要換的時候換的是**一個字串**，不是新增一份文件。
 *
 * ⛔ 這裡刻意**不驗證**那個 id 存不存在。驗證住在 `content/schema/mark.ts` 的
 * Zod（載入時，作者還在現場）—— CLAUDE.md 的 `buildIndexesValidates` 教訓：
 * 「只在遠離現場的地方響的警報不是守衛」。sim 端在跑的時候再拒絕一次，只會
 * 讓一場比賽中途壞掉而沒有人知道為什麼。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ ⚠️ 到期與重置是**兩根獨立的軸**，這是這支最容易被寫錯的地方
 *
 *   · `expiresAtTick` —— 「這一層什麼時候自己消失」（-1 = 永不）
 *   · `resetOn`       —— 「回合邊界要不要把它補回初始值」
 *
 * 十二道試煉是 `durationSec: -1` + `resetOn: "match"` ——
 * **永久，而且跨回合共享那 12 次**。
 * 把兩者混成一個數字的話（例如用「99999 秒」代表永久），
 * 「永久但每回合重置」這一格就永遠寫不出來。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ 純度
 *
 * 不抽 rng、不看時鐘、沒有三角函式、沒有 `**`。到期一律是**絕對 tick**，
 * 沒有任何遞減計數器（CLAUDE.md 硬性技術約束，`sim/purity.test.ts` 在守）。
 * 對外的迭代（{@link forEachMark}）**明確排序**，不吃 Map 插入序。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { StatModifier } from "./stats/modifiers";
import type { MarkLethalRule } from "./combat/lethalSave";
import {
  MARK_NEVER_EXPIRES,
  MARK_DURATION_PERMANENT,
  clampMarkCount,
  markExpired,
} from "./markLimits";

/**
 * 一個標記的身分 = 一份既有文件的 id（技能編號 或 status-effect id）。
 *
 * 刻意是**裸字串**而不是 branded type：它橫跨兩個 registry，任何一個 brand
 * 都會在另一邊需要一次 cast，而那個 cast 本身就是謊話。
 */
export type MarkId = string;

/** 回合邊界要怎麼處理這個標記。 */
export type MarkResetPolicy =
  /** 跨回合共享 —— 一場比賽發一次，用掉就是用掉了（十二道試煉）。 */
  | "match"
  /** 每回合重置回 `initial`（大多數「這一場的」層數）。 */
  | "round"
  /** 從不自動補 —— 只有內容明寫 `grantMark` 才會長回來。 */
  | "never";

/**
 * 一個標記在**某個實體身上**的狀態。
 *
 * ⚠️ spec 的欄位（`initial` / `resetOn` / `perStackLost`）**複製**在這裡，
 * 而不是查一張全域表。理由：兩個英雄可以用同一個 `markId` 但給不同的初始層數
 * （例如兩個都掛 `godie-hapm.passive` 的變體），全域表表達不了這件事，而且
 * 全域表在實體死亡/重生時的生命週期跟這裡不一樣，遲早會不同步。
 */
export interface MarkState {
  /** 現在還剩幾層。永遠是 [0, MARK_MAX_COUNT] 的整數。 */
  count: number;
  /** 絕對 tick；{@link MARK_NEVER_EXPIRES} = 永不過期。 */
  expiresAtTick: number;
  /** 回合邊界的行為。 */
  resetOn: MarkResetPolicy;
  /** `resetOn: "round"` 補回來的值，也是 `spent` 的分母。 */
  initial: number;
  /**
   * **累計**失去過幾層 —— 「每失去一層，永久提升 10% 攻擊力與 10% 最大生命」
   * 的乘數就是它。
   *
   * ⚠️ 不是 `initial - count`。那個算法在 `grantMark` 把層數加回去之後會**倒退**，
   * 於是「永久」提升就變成可以被還原的 —— 而文案說的是永久。
   */
  spent: number;
  /** 每失去一層給的永久加成。空陣列 = 沒有這個機制。 */
  perStackLost: readonly StatModifier[];
  /**
   * 「這個標記是一張免死牌」。缺席 = 純計數標記（風王結界 / 縮地），
   * 在傷害管線上完全不存在。整套語意見 `combat/lethalSave.ts`。
   */
  lethal?: MarkLethalRule;
  /** 上一次免死真的觸發的**絕對 tick**（內部冷卻的記帳）。 */
  lastSavedTick?: number;
}

/** 內容層宣告一個標記時填的東西（由模板參數或技能文件產生）。 */
export interface MarkSpec {
  readonly markId: MarkId;
  readonly initial: number;
  readonly max: number;
  /** 秒；{@link MARK_DURATION_PERMANENT}(-1) = 永久。 */
  readonly durationSec: number;
  readonly resetOn: MarkResetPolicy;
  readonly perStackLost?: readonly StatModifier[];
  readonly lethal?: MarkLethalRule;
}

/**
 * 把「每失去一層的永久加成」同步成一筆 `ModifierSource`。
 *
 * ⛔ **這裡自己乘 `spent`，不靠 `ModifierSource.stacks`，而那是量出來的必要**：
 * `stats/statPipeline.ts:126-127` 的 `ModOp.PercentMult` 是
 * `pctMult *= 1 + m.value;` —— 旁邊的 `Flat` 與 `PercentAdd` 都有 `* stacks`，
 * **只有 `PercentMult` 沒有**。所以一個寫成 `pctMult` 的「每層 +10%」會永遠
 * 只有一層的效果，而面板／商店預覽／codex 會**一致地**顯示那個小數字 ——
 * 三個地方互相印證同一個錯誤，畫面上看不出來（失敗形態④）。
 *
 * 自己乘之後，作者寫 `pctAdd` 或 `pctMult` 都是對的，而不是「其中一個會靜默
 * 失效」。
 *
 * ⚠️ `attachSource` **不去重**（`statPipeline.ts:233-249` 只有 `push`），
 * 所以這裡走 find-or-create：同一個 `src.id` push 兩次會疊兩份，而
 * `detachSource` 只拔第一筆。
 */
export function syncPerStackSource(
  world: SimWorld,
  id: EntityId,
  markId: MarkId,
  st: MarkState,
): void {
  if (st.perStackLost.length === 0) return;
  const sc = world.stats.get(id);
  if (sc === undefined) return;
  const srcId = `mark:${markId}`;
  const scaled = st.perStackLost.map((m) => ({ ...m, value: m.value * st.spent }));
  const existing = sc.sources.find((s) => s.id === srcId);
  if (existing !== undefined) {
    existing.modifiers = scaled;
  } else {
    sc.sources.push({ id: srcId, kind: "passive", modifiers: scaled });
  }
  sc.dirty = true;
}

/** 內容層的 `durationSec`（秒，-1 = 永久）→ 執行期的絕對到期 tick。 */
export function markExpiryTick(world: SimWorld, durationSec: number): number {
  if (durationSec === MARK_DURATION_PERMANENT) return MARK_NEVER_EXPIRES;
  return world.tick + Math.round(durationSec / world.dt);
}

/** 這個實體身上這個標記還剩幾層。不存在 / 已過期 = 0。 */
export function markCount(world: SimWorld, id: EntityId, markId: MarkId): number {
  const st = world.marks.get(id)?.get(markId);
  if (st === undefined) return 0;
  if (markExpired(st.expiresAtTick, world.tick)) return 0;
  return st.count;
}

/** 這個實體累計失去過幾層（永久加成的乘數）。 */
export function markSpent(world: SimWorld, id: EntityId, markId: MarkId): number {
  return world.marks.get(id)?.get(markId)?.spent ?? 0;
}

/**
 * 依 spec 在一個實體身上**建立**標記。已經有同 id 的就整個換掉。
 *
 * 用在「英雄進場時，把技能宣告的標記發下去」。⚠️ 它會把 `spent` 歸零 ——
 * 這是 `resetOn: "round"` 每回合重新發時**正確**的語意嗎？不是，所以回合重置
 * 走 {@link resetMarksForRound}，不走這裡。
 */
export function installMark(world: SimWorld, id: EntityId, spec: MarkSpec): void {
  let bag = world.marks.get(id);
  if (bag === undefined) {
    bag = new Map<MarkId, MarkState>();
    world.marks.set(id, bag);
  }
  bag.set(spec.markId, {
    count: clampMarkCount(Math.min(spec.initial, spec.max)),
    expiresAtTick: markExpiryTick(world, spec.durationSec),
    resetOn: spec.resetOn,
    initial: clampMarkCount(spec.initial),
    spent: 0,
    perStackLost: spec.perStackLost ?? [],
    ...(spec.lethal !== undefined ? { lethal: spec.lethal } : {}),
  });
  world.emit("markChanged", { id, markId: spec.markId, count: bag.get(spec.markId)!.count });
}

/**
 * 加 N 層。回傳**實際**加了幾層（撞到 `max` 會少於請求值）。
 *
 * ⚠️ 回傳實際值而不是 void，是因為 `grantLevels` 那個前科：靜默截斷但面板報
 * 請求值（CLAUDE.md 失敗形態②）。呼叫端拿得到真相才有機會說實話。
 */
export function grantMark(
  world: SimWorld,
  id: EntityId,
  markId: MarkId,
  amount: number,
  max: number,
): number {
  const st = world.marks.get(id)?.get(markId);
  if (st === undefined) return 0;
  if (markExpired(st.expiresAtTick, world.tick)) return 0;
  const before = st.count;
  st.count = clampMarkCount(Math.min(st.count + Math.trunc(amount), max));
  const added = st.count - before;
  if (added !== 0) world.emit("markChanged", { id, markId, count: st.count });
  return added;
}

/**
 * 消耗 N 層。**全有全無**：不夠就一層都不扣並回 false。
 *
 * 全有全無而不是「能扣多少扣多少」，是因為唯一的消費端是「用一層換一次免死」——
 * 扣一半等於玩家付了錢沒拿到東西。
 */
export function consumeMark(
  world: SimWorld,
  id: EntityId,
  markId: MarkId,
  amount: number,
): boolean {
  const need = Math.max(1, Math.trunc(amount));
  const st = world.marks.get(id)?.get(markId);
  if (st === undefined) return false;
  if (markExpired(st.expiresAtTick, world.tick)) return false;
  if (st.count < need) return false;
  st.count -= need;
  st.spent += need;
  // 「每失去一層，永久提升 X」—— 消耗的同一刻就要生效，不能等下一個系統。
  syncPerStackSource(world, id, markId, st);
  world.emit("markChanged", { id, markId, count: st.count });
  return true;
}

/**
 * 回合邊界的重置。**只動 `resetOn: "round"` 的**。
 *
 * ⛔ `spent` **不歸零**，而這是刻意的：`resetOn: "round"` 說的是「層數每回合
 * 補回來」，不是「永久加成每回合還原」。兩者要一起還原的話那是第三種政策，
 * 到時候加一個 enum 成員，不是在這裡多一行。
 */
export function resetMarksForRound(world: SimWorld): void {
  for (const id of sortedMarkHolders(world)) {
    const bag = world.marks.get(id);
    if (bag === undefined) continue;
    for (const markId of [...bag.keys()].sort()) {
      const st = bag.get(markId)!;
      if (st.resetOn !== "round") continue;
      if (st.count === st.initial) continue;
      st.count = st.initial;
      world.emit("markChanged", { id, markId, count: st.count });
    }
  }
}

/**
 * 掃掉過期的標記。由 `systems/MarkSystem.ts` 每 tick 呼叫。
 *
 * 永久標記（絕大多數）在這裡是一次比較就跳過，所以這支對現況幾乎免費。
 */
export function expireMarks(world: SimWorld): void {
  for (const id of sortedMarkHolders(world)) {
    const bag = world.marks.get(id);
    if (bag === undefined) continue;
    for (const markId of [...bag.keys()].sort()) {
      const st = bag.get(markId)!;
      if (!markExpired(st.expiresAtTick, world.tick)) continue;
      if (st.count !== 0) world.emit("markChanged", { id, markId, count: 0 });
      bag.delete(markId);
    }
    if (bag.size === 0) world.marks.delete(id);
  }
}

/** 實體死亡/離場時清掉它的標記。 */
export function clearMarks(world: SimWorld, id: EntityId): void {
  world.marks.delete(id);
}

/**
 * 排序後的持有者列表。
 *
 * ⚠️ **每一個**會 emit 事件或改狀態的迴圈都要走這裡。Map 插入序在兩個 replica
 * 上可能不同（實體建立順序受網路影響），而事件順序會進 replay ——
 * 那正是「同一場重播結果不同」的那一族缺陷。
 */
function sortedMarkHolders(world: SimWorld): EntityId[] {
  return [...world.marks.keys()].sort((a, b) => a - b);
}

/** 唯讀走訪（UI / 快照用）。同樣明確排序。 */
export function forEachMark(
  world: SimWorld,
  id: EntityId,
  fn: (markId: MarkId, st: Readonly<MarkState>) => void,
): void {
  const bag = world.marks.get(id);
  if (bag === undefined) return;
  for (const markId of [...bag.keys()].sort()) fn(markId, bag.get(markId)!);
}
