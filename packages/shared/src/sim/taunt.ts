/**
 * 嘲弄 (taunt) —— 「這一刻，我被迫打誰」，全 sim 唯一的一份答案。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 它為什麼存在
 *
 * 鍊金術之盾 (godie-i06q) 的出貨文案：
 *   「[嘲弄] 每秒吸引周圍敵人優先攻擊自己，持續 0.5秒」
 *
 * 在這一支之前，sim 裡**沒有任何東西**能強迫一個單位改打別人。索敵的三條路
 * (`OrderSystem` 的自動索敵、`Tier0Brain` 的 bot 迴圈、`MobSystem` 的殭屍
 * aggro) 各自算出自己的答案，而 `sim/targeting.ts` 的檔頭已經把「同一個問題在
 * 三個地方各自回答」的代價寫成血淚：召喚物落地時兩份 allow-list 都沒更新，
 * 於是整場遊戲沒有任何東西打得到它。
 *
 * 所以嘲弄**不是**三個 `if`。它是：
 *
 *   這一支      = 「誰嘲弄了我，到哪一 tick 為止」(狀態 + 規則)
 *   targeting.ts = `forcedTargetOf()` — 「那個人現在打不打得到」(合法性)
 *
 * 三個消費端全部只呼叫 `forcedTargetOf`，沒有任何一個自己去讀 `world.taunt`。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 決策 1 —— 狀態住在 `world.taunt`，**不是** `StatusEffect`
 *
 * 最順手的寫法是學 `berserk`：在 `StatusEffect` 上加一個欄位，白拿
 * `statusExpirySystem` 的清除。實測之後那是**錯的**，而且錯在一個具體的地方：
 *
 *     `StatusComp` 只由 `spawnChampion.ts` 與 `summons.ts` 掛上。
 *     **小怪沒有 StatusComp**（`spawnMobBody` 只給 transform/health/team/mob）。
 *
 * 也就是說，status 版本的嘲弄對整個殭屍波**完全無效**，而 `applyStatus` 對沒有
 * StatusComp 的目標是 `continue` —— 靜默略過。一件坦克盾的嘲弄拉不住殭屍，
 * 卡片上寫著「吸引周圍敵人」，遊戲裡半個敵人都吸不到：CLAUDE.md 失敗形態 ②。
 *
 * 所以它走 `world.invulnerable` 的形狀：自己一張 Map，**沒有 system**，到期是
 * 讀取時的絕對 tick 比較。任何有 transform 的身體都吃得到。
 *
 * ⭐ 決策 2 —— 到期是**絕對 tick**，而且「過期」只在讀取時判定
 *
 * `untilTick` 是絕對 tick，不是遞減計數器（sim 硬性約束）。沒有 system 去掃
 * 過期項目，因為 {@link tauntedBy} 每次讀都比一次 `world.tick`；一筆過期的紀錄
 * 留在 Map 裡是**惰性垃圾**，不是活著的效果。這讓「永遠拉不掉的嘲弄」在結構上
 * 不可能發生 —— 沒有一條路徑會延長 `untilTick` 而不經過 {@link applyTaunt}。
 *
 * ⭐ 決策 3 —— 每一個決策點都是 {@link TauntRules} 的欄位（第一守則）
 *
 * 尤其是 `overridesManualOrder`。「嘲弄要不要蓋掉玩家自己右鍵點的目標」是這條
 * 機制唯一真正會吵架的地方，而 owner 在**完全同一個題目**上推翻過一次：
 * `autoEngage` 上鎖之後不放手，實測 86.6% 的走位 tick 被系統搶走，於是
 * `respectLiveSteering` 出貨值改成 true。方向盤預設留在玩家手上，所以這一格
 * 出貨 **false**，激進的那一側是後台一個勾。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 只讀 `world.taunt` / `world.tick` 的比較與 `Math.round`。沒有 rng、沒有時鐘、
 * 沒有三角函式、沒有 `Math.pow`。唯一一次 Map 迭代在 {@link forgetTauntsBy}，
 * 而且走排序過的 key。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";

/** 文件的 schema 字串 —— sim 與後台共用這一個常數。 */
export const TAUNT_SCHEMA = "config.taunt@1";
/** 文件 id（`content/config/taunt.json`）。 */
export const TAUNT_DOC_ID = "taunt";

/**
 * 嘲弄規則 —— 這條機制settles 的每一個決策點，全部是欄位。
 *
 * 沒有任何一格的答案寫死在 sim 裡。
 */
export interface TauntRules {
  /**
   * 總開關。false = 嘲弄完全不存在：既有的紀錄讀不出來，新的也寫不進去，
   * 索敵回到這條機制落地之前的樣子。
   *
   * 這是**止血閥**：嘲弄是唯一一個會替玩家決定打誰的機制，如果它在線上出了
   * 手感問題，操作者要能在不重新部署的情況下把它整個關掉。
   */
  enabled: boolean;
  /**
   * ⭐ 決策點：嘲弄要不要蓋掉玩家**自己下的攻擊指令**。
   *
   * false（出貨）= 只接管**自動索敵**與 bot / 小怪的 aggro。玩家右鍵點名的
   *   那個目標一個 tick 都不會被動到 —— 他仍然可以選擇無視嘲弄他的人。
   * true = 嘲弄期間玩家手選的目標被清掉，身體改打嘲弄者。
   *
   * 出貨選保守的那一側，理由不是抽象的：owner 在**同一個題目**（系統要不要
   * 從玩家手上接管方向盤）上已經推翻過一次自己的預設 —— `autoEngage` 上鎖
   * 之後不放手，實測搶走 86.6% 的走位 tick，於是 `respectLiveSteering` 出貨
   * 值改成 true（見 `sim/combatFeel.ts`）。真正的 WC3 嘲弄的確會蓋掉玩家的
   * 指令，所以 `true` 是**保真**的那一側；但「保真」和「家用局手感」在這裡
   * 不同意，而 owner 已經表明過他要哪一種。要原作行為就把這一格打開。
   */
  overridesManualOrder: boolean;
  /**
   * ⭐ 決策點：`overridesManualOrder` 開著時，嘲弄過期之後**要不要把玩家原本
   * 點名的目標放回去**。
   *
   * true（出貨）= 放回去。被搶走的那個目標記在 `world.suspendedOrder`，嘲弄一
   *   失效（過期、嘲弄者死掉、離開牽引距離、規則被關掉）就原封不動還給玩家，
   *   而且還原成**手選**（`attackTargetAuto = false`）。
   * false = 不放回去，等於 WC3：嘲弄結束之後身體留在自動索敵手上。
   *
   * ⚠️ 這一格存在的理由是它**本來是偷渡在 `overridesManualOrder` 上的第二個
   * 行為**。舊實作把手選目標清成 null 之後，下面通用那條路會用
   * `attackTargetAuto = true` 重新填上 —— 也就是一次右鍵點名被**永久**轉成
   * 自動目標，嘲弄退了也回不來。一個布林值不可以同時決定兩件事：那是「接管」
   * 與「歸還」兩個決策，所以它們是兩格。出貨值選「歸還」，理由和
   * `overridesManualOrder` 出貨 false 同一條：方向盤預設回到玩家手上。
   */
  restoreManualOrderOnLapse: boolean;
  /**
   * ⭐ 決策點：小怪（殭屍 / 殭屍王）吃不吃嘲弄。
   *
   * true（出貨）= 吃。文案說的是「周圍**敵人**」，而第 3 場之後場上大多數敵人
   *   就是殭屍；一件坦克盾拉不住殭屍波，這件道具幾乎沒有用。
   * false = 只有英雄與召喚物會被拉走，殭屍照樣打它原本的目標。
   *
   * 和 `stealthRules.blocksMobAggro` 拆開是同一個理由：「英雄看得到但殭屍看
   * 不到」是一種合理設計，PvE 與 PvP 的答案不必相同，所以它們是兩格不是一格。
   *
   * ⚠️ 這一格在**讀取時**生效，不是寫入時。關掉之後場上已經掛著的嘲弄對小怪
   * 立刻失效，不用等它過期。
   */
  appliesToMobs: boolean;
  /**
   * ⭐ 決策點：小怪被嘲弄時，嘲弄者是**取代**牠原本的「最近的敵人」掃描，還是
   * 只是**偏袒**（進掃描當一個候選，仍然要比距離）。
   *
   * "replace"（出貨）= 取代。嘲弄就是一條拉繩，而「最近」正是它要推翻的答案。
   * "nearestFirst" = 偏袒。掃描照跑，嘲弄者只有在**沒有更近的敵人**時才贏
   *   （平手時嘲弄者贏 —— 那就是「偏袒」這個字唯一有意義的部分）。
   *
   * 兩側都不是預設就對的：取代讓一件坦克盾可以把整波殭屍從隊友身上撕下來，
   * 偏袒讓它只能改變已經朝你來的那幾隻。出貨選取代，因為 `appliesToMobs` 出貨
   * 開著的理由就是「第 3 場之後場上大多數敵人是殭屍」—— 偏袒等於把那一格again
   * 關掉一半，而那應該是操作者的選擇，不是這裡的預設。
   *
   * ⚠️ 兩種模式都吃 {@link TauntRules.leashUnits}。
   */
  mobTauntMode: MobTauntMode;
  /**
   * ⭐ 決策點：嘲弄在索敵比較器裡站哪一格。
   *
   * "absolute"（出貨）= sort key 0，壓過「敵方英雄優先」與「威脅」兩把 key。
   * "aboveThreatOnly" = 排在「敵方英雄優先」**之後**、「威脅」之前 —— 一個
   *   召喚物／小怪身上的嘲弄拉不走一個旁邊就有敵方英雄的人。
   *
   * 出貨值跟著 owner 親筆的卡面走：鍊金術之盾寫的是「吸引周圍敵人**優先攻擊
   * 自己**」，那句話本身就是 absolute。另一側存在是因為它真的會有人要 ——
   * 一個由**召喚物**發出的嘲弄在 absolute 底下可以把敵方英雄從你的隊友身上
   * 整個扯走，而那可能比操作者想要的強。
   *
   * ⚠️ 兩種模式差別**只有**在嘲弄者與另一個候選的 `kind` 不同時才看得到
   * （英雄 0 / 召喚物 1 / 小怪 2）。目前出貨內容裡唯一的嘲弄來源是玩家手上的
   * 盾，也就是一個英雄，所以這一格今天翻過去不會改變任何一場已出貨的戰鬥 ——
   * 它是替**下一件**帶嘲弄的內容準備的。
   */
  priority: TauntPriority;
  /**
   * ⭐ 決策點：一個被嘲弄的身體最多可以被拖多遠（GGD 單位，圓心到圓心）。
   *
   * 嘲弄**無視受害者自己的索敵半徑**（那是刻意的：半徑是「我看多遠」，嘲弄的
   * 射程是嘲弄者卡片上的 AoE），所以在這一格出現之前，**沒有任何東西**限制一
   * 個嘲弄者可以把一具身體拖多遠 —— 掛上之後跑掉，受害者就一路追。
   *
   * 出貨 24 = 一個決鬥區的半徑。出貨內容的嘲弄 AoE 是 9.17 × `abilityRange`
   * 0.6 ≈ 5.5，也就是說受害者被掛上的那一刻最遠只有 5.5 單位 —— 24 是它的四
   * 倍多，**任何一場已出貨的戰鬥行為都不會改變**，但「拖過半個地圖」在結構上
   * 不再可能。0 = 不限制（舊行為）。上界 100 是誤植守衛：區域直徑才 48。
   *
   * 和到期一樣是**讀取時**判定：跑遠了當場失效，跑回來又生效。
   */
  leashUnits: number;
  /**
   * ⭐ 決策點：一發**範圍**嘲弄最多拉幾個人。
   *
   * 這一個數字同時是兩件事，而且刻意合成一格：卡片沒寫 `maxTargets` 時用它，
   * 卡片寫了也**夾不過它**。兩個上限講同一句話一定會 drift（`TAUNT_MAX_TARGETS`
   * 的檔頭已經是這個教訓），而操作者要的是一句「不管誰寫的，一發最多拉幾個」。
   *
   * 出貨 20 = {@link TAUNT_MAX_TARGETS}，也就是這一格出現之前寫死的那個數字，
   * 所以出貨行為一格都沒動（鍊金術之盾自己寫 8，本來就在底下）。
   */
  maxTargetsCap: number;
  /**
   * ⭐ 決策點：`maxTargetsCap` 砍掉多出來的人時，**留下哪幾個**。
   *
   * "nearest"（出貨）= 由近到遠（平手比 id）。
   * "lowestHp" = 血最低的先被拉（平手比距離、再比 id）—— 想讓坦克盾去救那些
   *   快被打死的人時選這個。
   * "id" = 最小 entityId 先，也就是「先生成的先被拉」。它存在不是因為好玩：
   *   它是唯一一個**與位置和血量都無關**的順序，需要一個完全穩定的參照時用。
   *
   * 三種都是**全序**（最後一定比到 id），所以「五隻殭屍裡拉哪三隻」永遠不會
   * 變成 `Array.prototype.sort` 實作細節的副產品。
   */
  capOrder: TauntCapOrder;
  /**
   * ⭐ 決策點：同一個人被兩個敵人先後嘲弄時，誰贏。
   *
   * "newest"（出貨）= 最後喊的那個人贏。新的嘲弄**一定**生效。
   * "longest" = 剩餘時間長的那個贏；短的那一發被吃掉。
   *
   * 出貨選 newest 是因為另一側有一個具體的失敗形態：一發嘲弄放出去、動畫演
   * 完、冷卻照燒，而目標一動也不動 —— 因為身上還掛著別人比較長的嘲弄。
   * 「做了但玩家拿不到」比「兩個嘲弄互相蓋來蓋去」難除錯得多。
   */
  conflictMode: TauntConflictMode;
  /**
   * 全域持續時間倍率，乘在內容自己寫的秒數上（鍊金術之盾 = 0.5 秒）。
   * 1 = 照文件寫的。0 = 嘲弄立刻過期（等於關掉，但保留寫入路徑）。
   *
   * 存在的理由和 `stealthRules.fadeDelayMult` 一樣：操作者要能整體調快/調慢
   * 這條機制而**不必**逐件道具改文件。
   *
   * 上界 10 是**誤植守衛**不是平衡值（第一守則「欄位要有上界」）：0.5 秒的
   * 嘲弄乘上打錯的 40 就是 20 秒，也就是整整一波交戰玩家都在打同一個人，
   * 而畫面上看起來就是「索敵壞掉了」（#277 的形狀）。
   */
  durationMult: number;
}

/** 見 {@link TauntRules.conflictMode}。 */
export type TauntConflictMode = "newest" | "longest";
export const TAUNT_CONFLICT_MODES: readonly TauntConflictMode[] = ["newest", "longest"];

/** 見 {@link TauntRules.priority}。 */
export type TauntPriority = "absolute" | "aboveThreatOnly";
export const TAUNT_PRIORITIES: readonly TauntPriority[] = ["absolute", "aboveThreatOnly"];

/** 見 {@link TauntRules.mobTauntMode}。 */
export type MobTauntMode = "replace" | "nearestFirst";
export const MOB_TAUNT_MODES: readonly MobTauntMode[] = ["replace", "nearestFirst"];

/** 見 {@link TauntRules.capOrder}。 */
export type TauntCapOrder = "nearest" | "lowestHp" | "id";
export const TAUNT_CAP_ORDERS: readonly TauntCapOrder[] = ["nearest", "lowestHp", "id"];

/**
 * 一筆活著的嘲弄。`untilTick` 是**絕對 tick**（sim 硬性約束：到期一律用絕對
 * tick，不是遞減計數器）。
 */
export interface TauntState {
  /** 嘲弄我的那個人 */
  by: EntityId;
  /** 這一 tick（含）之後就過期了 */
  untilTick: number;
}

/** 全域上界：一發嘲弄最長幾秒（schema 與 sim 共用這一個數字）。 */
export const TAUNT_MAX_DURATION_SEC = 30;
/** 全域上界：一發範圍嘲弄最多拉幾個人。 */
export const TAUNT_MAX_TARGETS = 20;
/** 全域上界：`durationMult` 的誤植守衛。 */
export const TAUNT_DURATION_MULT_MAX = 10;
/**
 * 全域上界：`leashUnits` 的誤植守衛。決鬥區半徑 24、直徑 48，所以 100 已經是
 * 「整個區域再翻一倍」—— 500 打進去只會被夾成一個仍然有意義的數字，而不是
 * 悄悄變成「無限」。
 */
export const TAUNT_LEASH_MAX = 100;
/** 出貨牽引距離 = 一個決鬥區的半徑。見 {@link TauntRules.leashUnits}。 */
export const DEFAULT_TAUNT_LEASH = 24;

/**
 * 出貨預設。
 *
 * ⚠️ 缺文件 / 壞文件 → **回這一份**，不是空物件。空物件在 TypeScript 底下會讓
 * `enabled` 讀成 `undefined`（falsy），也就是嘲弄靜默消失：道具照樣買得到、
 * 描述照樣寫著、冷卻照樣在跑，而場上沒有任何人被拉走。這是 `statCaps` /
 * `stealthRules` 學過的同一課。
 */
export const DEFAULT_TAUNT_RULES: TauntRules = Object.freeze({
  enabled: true,
  // 方向盤預設留在玩家手上 —— 見 `TauntRules.overridesManualOrder`。
  overridesManualOrder: false,
  // …而萬一操作者把上面那格打開了，方向盤預設**還得回來**。
  restoreManualOrderOnLapse: true,
  appliesToMobs: true,
  mobTauntMode: "replace" as MobTauntMode,
  // owner 親筆卡面：「吸引周圍敵人**優先攻擊自己**」。
  priority: "absolute" as TauntPriority,
  leashUnits: DEFAULT_TAUNT_LEASH,
  maxTargetsCap: TAUNT_MAX_TARGETS,
  capOrder: "nearest" as TauntCapOrder,
  conflictMode: "newest" as TauntConflictMode,
  durationMult: 1,
});

// ───────────────────────────────────────────────────────────── 狀態讀寫 ────

/** 秒 → tick，走 world 自己的 dt。永遠不是浮點 tick。 */
function ticksOf(world: SimWorld, sec: number): number {
  const t = Math.round(sec / world.dt);
  return t > 0 ? t : 0;
}

/**
 * 掛一發嘲弄：`victim` 在接下來 `durationSec` 秒內優先攻擊 `taunter`。
 *
 * 回傳 true 代表真的寫進去了。以下情況回 false（而且**不會**動到既有紀錄）：
 *   · 規則關著；
 *   · 換算之後是 0 tick（`durationMult` 為 0，或秒數太短）；
 *   · 自己嘲弄自己；
 *   · `conflictMode: "longest"` 而身上那一發還比較長。
 *
 * ⚠️ 這裡**不**檢查隊伍/視線/距離。合法性是 `targeting.forcedTargetOf` 每一
 * tick 重新問的問題 —— 寫入時檢查一次就會在嘲弄者死掉、隱形、換區之後留下
 * 一筆錯的紀錄，而那正是「一個 tick 之後才修好」的那種缺陷。
 */
export function applyTaunt(
  world: SimWorld,
  victim: EntityId,
  taunter: EntityId,
  durationSec: number,
): boolean {
  const rules = world.tauntRules;
  if (!rules.enabled) return false;
  if (victim === taunter) return false;
  const mult = rules.durationMult > 0 ? rules.durationMult : 0;
  const ticks = ticksOf(world, durationSec * mult);
  if (ticks <= 0) return false;
  const untilTick = world.tick + ticks;
  const prev = world.taunt.get(victim);
  // 只有「還活著」的舊紀錄才有資格擋新的一發。過期的那一筆是惰性垃圾。
  if (
    prev !== undefined &&
    prev.untilTick > world.tick &&
    rules.conflictMode === "longest" &&
    prev.untilTick >= untilTick
  ) {
    return false;
  }
  world.taunt.set(victim, { by: taunter, untilTick });
  return true;
}

/**
 * 誰嘲弄了 `victim`，或 null。**只看紀錄，不判斷合不合法** —— 合法性在
 * `targeting.forcedTargetOf`（那裡才有 `isAutoTargetable` / `isMobTargetable`）。
 *
 * 分成兩層而不是一支函式，是為了讓這一支保持「沒有任何 targeting 相依」，
 * 否則 taunt.ts ↔ targeting.ts 就是一個 import 環。
 */
export function tauntedBy(world: SimWorld, victim: EntityId): EntityId | null {
  if (!world.tauntRules.enabled) return null;
  const st = world.taunt.get(victim);
  if (st === undefined) return null;
  // 到期判定：絕對 tick 比較，和 `isBerserk` / `refusesDamage` 同一個形狀。
  if (st.untilTick <= world.tick) return null;
  return st.by;
}

/**
 * 忘掉所有由 `taunter` 掛出去的嘲弄。
 *
 * ⚠️ 這**不是**多餘的清理。`SimWorld` 會**回收 entityId**，而檔案裡每一個
 * per-entity store 都在 `destroy()` 裡刪自己那一格，理由寫得很清楚：回收的 id
 * 不得繼承上一個單位的狀態。嘲弄比其它 store 多一個方向 —— 它同時被**受害者**
 * 和**嘲弄者**索引。只刪 `taunt.delete(id)` 的話，一個嘲弄者死掉、它的 id 被
 * 回收成一個新的敵人之後，受害者會被強迫去打那個完全無關的新單位，而且
 * `forcedTargetOf` 的每一項合法性檢查都會通過（活著、同區、敵隊）。
 *
 * 走**排序過的 key**（sim 硬性約束）。刪除本身與順序無關，排序是為了讓這一支
 * 的行為在每一個 replica 上逐字相同，不必讀者自己去推論。
 */
export function forgetTauntsBy(world: SimWorld, taunter: EntityId): void {
  const doomed: EntityId[] = [];
  for (const [victim, st] of world.taunt) {
    if (st.by === taunter) doomed.push(victim);
  }
  doomed.sort((a, b) => a - b);
  for (const v of doomed) world.taunt.delete(v);
}

/**
 * 忘掉所有**指向** `gone` 的暫存手選目標（`world.suspendedOrder`）。
 *
 * 和 {@link forgetTauntsBy} 完全同一個危險：那張表是 `受害者 → 他原本點名的
 * 那個人`，也就是它**同時被兩個方向索引**。只刪受害者那一格的話，一個被玩家
 * 點名的敵人死掉、entityId 被回收成一個新身體之後，嘲弄一退，玩家的英雄會被
 * 「還原」到一個他從來沒有點過的單位身上 —— 而且畫面上完全看不出來為什麼。
 *
 * 走**排序過的 key**（sim 硬性約束）。
 */
export function forgetSuspendedOrdersOn(world: SimWorld, gone: EntityId): void {
  const doomed: EntityId[] = [];
  for (const [victim, target] of world.suspendedOrder) {
    if (target === gone) doomed.push(victim);
  }
  doomed.sort((a, b) => a - b);
  for (const v of doomed) world.suspendedOrder.delete(v);
}

// ───────────────────────────────────────────────────────── 文件 → 規則 ────

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * 正規化操作者/文件給的表。每一格單獨退回出貨預設 —— 一格打錯不會把整張表
 * 丟掉，但也不會把 `NaN` 帶進 sim（`NaN` 會讓 `durationMult > 0` 是 false，
 * 嘲弄就靜默變成永遠 0 tick）。
 */
export function normalizeTauntRules(raw: unknown): TauntRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = r.conflictMode;
  /** enum 一格：認得就用，不認得就退回出貨值（絕不讓 undefined 進 sim）。 */
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  return Object.freeze({
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_TAUNT_RULES.enabled,
    overridesManualOrder:
      typeof r.overridesManualOrder === "boolean"
        ? r.overridesManualOrder
        : DEFAULT_TAUNT_RULES.overridesManualOrder,
    restoreManualOrderOnLapse:
      typeof r.restoreManualOrderOnLapse === "boolean"
        ? r.restoreManualOrderOnLapse
        : DEFAULT_TAUNT_RULES.restoreManualOrderOnLapse,
    appliesToMobs:
      typeof r.appliesToMobs === "boolean"
        ? r.appliesToMobs
        : DEFAULT_TAUNT_RULES.appliesToMobs,
    mobTauntMode: pick(r.mobTauntMode, MOB_TAUNT_MODES, DEFAULT_TAUNT_RULES.mobTauntMode),
    priority: pick(r.priority, TAUNT_PRIORITIES, DEFAULT_TAUNT_RULES.priority),
    leashUnits: num(r.leashUnits, DEFAULT_TAUNT_RULES.leashUnits, 0, TAUNT_LEASH_MAX),
    // ⚠️ `Math.round` 之後才夾：`maxTargetsCap` 是「幾個人」，2.5 個人不是一個
    // 合法答案，而 `found.length = cap` 對小數是靜默的錯（陣列長度會被截斷成
    // 你沒要求的那個數字）。
    maxTargetsCap: Math.round(
      num(r.maxTargetsCap, DEFAULT_TAUNT_RULES.maxTargetsCap, 1, TAUNT_MAX_TARGETS),
    ),
    capOrder: pick(r.capOrder, TAUNT_CAP_ORDERS, DEFAULT_TAUNT_RULES.capOrder),
    conflictMode:
      mode === "newest" || mode === "longest" ? mode : DEFAULT_TAUNT_RULES.conflictMode,
    durationMult: num(
      r.durationMult,
      DEFAULT_TAUNT_RULES.durationMult,
      0,
      TAUNT_DURATION_MULT_MAX,
    ),
  });
}

/**
 * 讀一份 `config.taunt@1` 文件。沒有文件 / schema 不對 → 出貨預設
 * （見 {@link DEFAULT_TAUNT_RULES} 上面那段警告）。
 */
export function tauntRulesFromDoc(doc: unknown): TauntRules {
  if (!doc || typeof doc !== "object") return DEFAULT_TAUNT_RULES;
  const d = doc as Record<string, unknown>;
  if (d.schema !== TAUNT_SCHEMA) return DEFAULT_TAUNT_RULES;
  return normalizeTauntRules(d);
}
