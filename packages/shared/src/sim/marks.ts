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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑤ ⭐ 疊層的三條軸（GH#304，owner 2026-08-09：「隨觸發／隨時間／隨回合
 *     增加/減少」）—— **一個機制，三個觸發點**
 *
 * ⛔ 三條軸**不是**三個機制。真正的機制只有一個：{@link adjustMarkCount}
 * ——「這個計數器 ±N」。三條軸是**誰去呼叫它**：
 *
 * | 軸 | 誰觸發 | 引擎要做什麼 |
 * |---|---|---|
 * | ① 隨觸發 | `HookEvent` 的 15 個成員任一（`onBasicAttack` +1、`onDamageTaken` -1…） | **零** —— `applyStatus{stacks:±N}` 掛在 hook 上 |
 * | ② 隨時間 | `onInterval` + `HookDef.internalCooldown: N`（＝「每 N 秒」） | **零** —— 同上，`IntervalHookSystem` 已經在跑 |
 * | ③ 隨回合 | 回合邊界（{@link resetMarksForRound}，`MatchController.enterCombat`） | {@link MarkSpec.roundDelta} |
 *
 * ⭐ ①②需要的引擎程式是 **0 行新系統、0 個新 effect kind**：`applyStatus` 已經
 * 是一個可以掛在任何 hook 上的效果，這一批做的只是讓它的 `stacks` 能是**負數**、
 * 並且在 id 撞上一個標記時把增減**送進這裡**（`effects/applyStatus.ts` 的
 * 「一個 id 在一個身體上只有一個計數器」）。
 *
 * ⛔ 為什麼**不**在 `MarkSpec` 上開一格 `decayEverySec`：那會是**第二個**冷卻
 * 概念，與 `HookDef.internalCooldown` 平行、語意重疊、兩個都填得下 ——
 * 逐字就是 `systems/IntervalHookSystem.ts` 決策 1 拒絕過的那個欄位。而且它需要
 * 一個每 tick 掃 `world.marks` 的新系統，**而這個檔案裡已經有一支沒有人呼叫的
 * 掃描器**（見 {@link expireMarks} 的警告）—— 再加一支只會多一個假 ✅。
 *
 * ⚠️ ③沒辦法走同一條路，而理由是可查的：`HookEvent` 的 15 個成員裡**沒有**
 * 回合邊界（沒有 `onRoundStart` / `onRoundEnd`），所以「每回合 ±N」在內容側
 * 一個字都寫不出來。它是這一批唯一真的需要引擎程式的那條軸。
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
   * 疊到幾層封頂。
   *
   * ⚠️ GH#304 之前這一格**只活在 `MarkSpec` 上**，執行期的狀態不記得它 ——
   * 於是 `grantMark` 必須由呼叫端傳一個 `max` 進來，而全 repo 沒有任何呼叫端
   * （它是死程式）。「加層」這件事在此之前結構上就寫不出來：唯一知道上限的人
   * 是那份已經被丟掉的 spec。三條軸全部要加層，所以上限必須跟著狀態走。
   */
  max: number;
  /**
   * ⭐ 軸③【隨回合】—— 回合邊界的 ±N（0 = 不做，也就是這一格出現之前的每一份
   * 文件）。負數就是「每回合掉 N 層」，正數是「每回合長 N 層」。
   *
   * ⚠️ 與 `resetOn: "round"`（補回 `initial`）**互斥**，schema 在載入時擋
   * （`content/schema/mark.ts`）：一個「每回合補滿」又「每回合 -1」的計數器
   * 沒有可以寫出來的語意，而執行期靜默挑一邊就是失敗形態④。
   */
  roundDelta: number;
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
  /** ⭐ 軸③【隨回合】的 ±N。省略 = 0 = 回合邊界不動它。見 {@link MarkState.roundDelta}。 */
  readonly roundDelta?: number;
  readonly perStackLost?: readonly StatModifier[];
  readonly lethal?: MarkLethalRule;
}

/**
 * 把「每失去一層的永久加成」同步成一筆 `ModifierSource`。
 *
 * **這裡自己乘 `spent`，不寫 `ModifierSource.stacks`** —— 兩者今天算出來的數字
 * **完全相同**：`statPipeline` 的四個可縮放 op（`Flat` / `PercentAdd` /
 * `PercentMult` / `PercentOf`）都是「把 `value` 放大 `stacks` 倍」，而這裡放大的
 * 是同一個量。所以作者寫 `pctAdd` 或 `pctMult` 都是對的，沒有哪一個會靜默失效。
 *
 * ⚠️ 這段註解的前一版說「`PercentMult` 沒有乘 `stacks`，所以只能自己乘」——
 * 那是 GH#286 修好之前的事實（見 `stats/modifiers.ts` 的 `PercentMult`）。
 * 現在自己乘的理由只剩一個而且是弱的：`spent` 是標記狀態自己的累計數，
 * 寫在 `value` 上就只有一個真相，不用再讓 `stacks` 跟著它同步。
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
    max: clampMarkCount(spec.max),
    roundDelta: Math.trunc(spec.roundDelta ?? 0),
    spent: 0,
    perStackLost: spec.perStackLost ?? [],
    ...(spec.lethal !== undefined ? { lethal: spec.lethal } : {}),
  });
  world.emit("markChanged", { id, markId: spec.markId, count: bag.get(spec.markId)!.count });
}

/**
 * ⭐⭐ **三條軸唯一的寫入口** —— 這個計數器 ±N，回傳**實際**動了幾層（帶正負號）。
 *
 * ── 為什麼是一支函式而不是三支 ────────────────────────────────────────────
 * owner 說的「隨觸發／隨時間／隨回合，各自能增能減」在**寫入端**是同一件事：
 * 夾到 `[0, max]`、失去的層數要記進 `spent`、要重算永久加成、要發
 * `markChanged`。這四件事在 GH#304 之前**散在三個地方各抄一份**
 * （`grantMark` 只做了夾取與事件、`consumeMark` 四件都做、
 * `combat/lethalSave.ts:132-141` 又逐行抄了一次），而三份已經不一致：
 * `grantMark` 加層時不碰 `spent`（對的），`lethalSave` 那一份卻是唯一會
 * `syncPerStackSource` 的（也是對的）—— 只是沒有人保證第四個呼叫端會選對。
 * 三條軸都要寫這一格，所以它現在只有一個住處（第零守則⑨）。
 *
 * ── 三個刻意的決定 ────────────────────────────────────────────────────────
 * ① **加層夾 `max`，扣層夾 0**，兩邊都夾 —— `clampMarkCount` 只擋得住上面那半。
 * ② **只有真的失去的那幾層算 `spent`**（不是請求值）。撞到 0 之後再扣不算
 *    「失去一層」，否則「每失去一層永久 +10% AD」會在層數見底之後繼續長大，
 *    而畫面上完全看不出來（失敗形態②的鏡像：發了玩家沒付的錢）。
 * ③ **一層都沒動就不發事件**。`markChanged` 是客戶端計數器條的更新訊號，
 *    一個每 tick 掛在 `onInterval` 上、早就見底的衰減會變成每秒 30 則廣播。
 *
 * ⚠️ 過期的標記回 0 而不是「復活它」：到期的語意是「它不在身上了」
 * （`markCount` 讀出來也是 0），對一個不在身上的計數器 ±N 應該什麼都不做。
 *
 * PURE：不抽 rng、不看時鐘（`world.tick` 是狀態不是時鐘）、沒有 `**`。
 */
export function adjustMarkCount(
  world: SimWorld,
  id: EntityId,
  markId: MarkId,
  delta: number,
): number {
  const st = world.marks.get(id)?.get(markId);
  if (st === undefined) return 0;
  if (markExpired(st.expiresAtTick, world.tick)) return 0;
  const want = Math.trunc(delta);
  if (want === 0) return 0;
  // ① 兩邊都夾。`max` 自己也走一次 `clampMarkCount`，所以一份繞過 schema 的
  // override（後台是第二條寫入路徑）也上不了 999 以上。
  const ceiling = clampMarkCount(st.max);
  const next = Math.max(0, Math.min(ceiling, st.count + want));
  const applied = next - st.count;
  if (applied === 0) return 0; // ③
  st.count = next;
  if (applied < 0) {
    st.spent += -applied; // ②
    // 「每失去一層，永久提升 X」—— 失去的同一刻就要生效，不能等下一個系統。
    syncPerStackSource(world, id, markId, st);
  }
  world.emit("markChanged", { id, markId, count: st.count });
  return applied;
}

/**
 * 加 N 層。回傳**實際**加了幾層（撞到 `max` 會少於請求值）。
 *
 * ⚠️ 回傳實際值而不是 void，是因為 `grantLevels` 那個前科：靜默截斷但面板報
 * 請求值（CLAUDE.md 失敗形態②）。呼叫端拿得到真相才有機會說實話。
 *
 * ⚠️ GH#304 拿掉了 `max` 參數 —— 上限現在住在 {@link MarkState.max}，
 * 由 `installMark` 從 spec 抄一次。呼叫端自己帶一個 `max` 進來的形狀是
 * 「同一個上限有兩個住處」，而其中一個（呼叫端那個）沒有任何守衛。
 */
export function grantMark(
  world: SimWorld,
  id: EntityId,
  markId: MarkId,
  amount: number,
): number {
  return adjustMarkCount(world, id, markId, Math.max(0, Math.trunc(amount)));
}

/**
 * 消耗 N 層。**全有全無**：不夠就一層都不扣並回 false。
 *
 * 全有全無而不是「能扣多少扣多少」，是因為唯一的消費端是「用一層換一次免死」——
 * 扣一半等於玩家付了錢沒拿到東西。
 *
 * ⚠️ 「全有全無」是這一支與 {@link adjustMarkCount} 的**唯一**差別，所以它是
 * 一道前置檢查加一次委派，不是第二份扣層邏輯。
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
  return adjustMarkCount(world, id, markId, -need) === -need;
}

/**
 * ⭐ 軸③【隨回合】—— 回合邊界對每一個計數器做的事。由
 * `MatchController.enterCombat` 呼叫一次（不是中場，理由寫在那個呼叫點）。
 *
 * 兩種政策，**互斥**（schema 在載入時擋，見 {@link MarkState.roundDelta}）：
 *
 *   · `roundDelta !== 0` → **±N**（owner 2026-08-09 的軸③）。走
 *     {@link adjustMarkCount}，所以它跟另外兩條軸共用同一套夾取／`spent`／
 *     永久加成／事件 —— 「每回合掉一層試煉」與「打中掉一層」在帳面上是
 *     同一件事，這正是合併的意義。
 *   · `resetOn: "round"` → 補回 `initial`（這一格出現之前的唯一行為）。
 *
 * ⛔ 補回 `initial` **不是** delta 的特例，所以它沒有被改寫成一次 `adjustMarkCount`：
 * 「回到 12」與「+3」在 `spent` 上是相反的 —— 重置是**發新的一批**（不記帳），
 * delta 掉層是**失去**（要記帳、要長永久加成）。把重置寫成
 * `adjustMarkCount(initial - count)` 會讓每一次回合重置都倒著長一次永久加成。
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
      if (st.roundDelta !== 0) {
        adjustMarkCount(world, id, markId, st.roundDelta);
        continue;
      }
      if (st.resetOn !== "round") continue;
      if (st.count === st.initial) continue;
      st.count = st.initial;
      world.emit("markChanged", { id, markId, count: st.count });
    }
  }
}

/**
 * 掃掉過期的標記。
 *
 * ⛔⛔ **今天沒有任何人呼叫它**（`grep -rn expireMarks` 只有這裡與一條測試的
 * 註解）。上一版的這段註解寫著「由 `systems/MarkSystem.ts` 每 tick 呼叫」——
 * **那個檔案不存在**（CLAUDE.md 第三守則：註解會說謊，去驗證）。
 *
 * ⚠️ 它不是缺陷，是**沒有人需要它**：到期在**讀取端**執行（`markCount` /
 * `namedCounters` / `lethalSaveFor` / {@link adjustMarkCount} 都先問
 * `markExpired`），所以一個過期的標記對玩家已經是 0 層。這一支只是 GC。
 * ⛔ 但也因此，**不要**把「每 N 秒掉一層」做成這裡的一個新掃描器再指望它會被
 * 呼叫 —— 那正是這一支自己的處境。軸②走 `onInterval` hook，見檔頭⑤。
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
 * 拿掉**一個**標記 —— 給「授予它的那件道具被賣掉了」用（2026-08-18）。
 *
 * ⚠️ 它發 `markChanged {count: 0}`：那是客戶端計數器條的唯一更新訊號，
 * 少了它玩家的 HUD 上會留著一個已經不存在的「×3」，而遊戲裡按它會什麼都不發生
 * （失敗形態②的鏡像 —— 畫著一個沒有的東西）。
 *
 * ⛔ 它**不還原** `perStackLost` 累積的永久加成。那與 `resetOn` 三種政策的
 * 既有語意逐字相同（「那是照文案的『永久』」），⛔ 不要在這裡開第二種語意。
 */
export function removeMark(world: SimWorld, id: EntityId, markId: MarkId): boolean {
  const bag = world.marks.get(id);
  if (bag === undefined || !bag.has(markId)) return false;
  bag.delete(markId);
  if (bag.size === 0) world.marks.delete(id);
  world.emit("markChanged", { id, markId, count: 0 });
  return true;
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
