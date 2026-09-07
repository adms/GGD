/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  【選擇性狀態免疫】—— 「這具身體不吃**某一類**狀態」（GH#656）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * owner 2026-08-24（逐字）：
 *
 * > 「殭屍王**免疫負面狀態** 包含**暈眩 緩慢 詛咒 致盲**
 * >  但**可被吸血、暴擊、淨化跟其他技能標記與疊層**」
 *
 * ── ① 為什麼既有的三個機制都答不出這一題 ──────────────────────────────────
 *
 * | 既有機制 | 為什麼不夠 |
 * |---|---|
 * | `invulnerable.blocksControl`（`sim/effects/invulnerable.ts`） | ⛔ 它是**一段時間**的授予（`durationSec` 必填），而 owner 要的是這具身體的**常駐身分**；（它的 isCc 判準在 GH#1041 之前漏掉詛咒與致盲 —— 2026-09-06 起 `missChance>0` 也算 CC，見 `effects/applyStatus.ts`）|
 * | `polarity: "debuff"` 一刀切 | ⛔ owner 明說要**保留**標記與疊層，而 GGD 的【破甲】【破魔】【禁療】【重創】全部是 `polarity: "debuff"` —— 一刀切會把他要留的那一半也擋掉 |
 * | 為殭屍王寫一個 `if` | ⛔ 第〇·五守則的紅線 |
 *
 * ── ② 資料上**分得開**（量出來的，2026-08-24，44 份出貨 status 文件）─────────
 *
 * `status-effect@1.tags` 已經把兩群分乾淨了，而且**逐字對上 owner 的四類**：
 *
 * | 帶 `cc` tag（16 份） | 不帶（28 份） |
 * |---|---|
 * | ⭐ 暈眩 `stun` `burnstun` `fang-stun` `ingredient` `omnislash-lock` `trial-stun` | 【破甲】`armor-break`・【破魔】`magic-break` |
 * | ⭐ 緩慢 `slow20`…`slow60` | 【禁療】`no-heal`・【重創】`grievous-wounds` |
 * | ⭐ 詛咒 `curse` ⭐ 致盲 `blind` | 連段窗 `moon-combo`・`octuple-slash-window` |
 * | 纏繞 `root`・恐懼 `fear`・魅惑 `charmed`・混亂 `confusion`・癱瘓 `paralysis`・麻痺 `numbness` | 存款/計數 `nen-banked`・`grief-seed-charge`・`light-wand-banked` |
 *
 * ⇒ ⭐ **`tags` 就是那一格「免疫分類」**，⛔ 不需要新開一個 `category` 欄位
 *（第〇·四守則：同一份知識不要有第二個住處）。
 *
 * ── ③ 為什麼是**騎在來源上的授予**（第 13 格），⛔ 不是殭屍王的一格設定 ──────
 *
 * `stats/sourceGrants.ts` 的檔頭已經把這個判例寫死了：引擎讀 `StatsComp.sources`
 * 而**不問 `kind`**，所以一格 schema + 一行轉發就同時落在**三個授權面**上：
 * 天生技 rank（切換技 `whileOn` 共用同一個 rank 形狀）／增益卡／
 * `applyBuff` 的限時來源。
 * ⇒ 殭屍王用的是天生技那一面（常駐），而「大招期間免疫減速」用的是
 * `applyBuff` 那一面（到期由那份 source 自己的 `expiresAtTick` 收掉，
 * ⛔ 不需要第二支掃描器）。⭐ 一個機制，⛔ 不是一支怪的特例。
 *
 * ⚠️ **道具那一面刻意留白**：`item@1` 是唯一**逐格手列**授予而不展開
 * `SOURCE_GRANT_SHAPE` 的授權面，所以「抗性靴」今天寫不出來。⛔ 那不是漏了 ——
 * 一個沒有任何內容的授權面就是 S8（機制上線、內容 0 筆）本身，
 * 等第一件抗控裝真的要做的那天再在 `schema/item.ts` 開一格。
 *
 * ── ④ 它**刻意不碰**的四件事（owner 逐字點名要保留的那一半）────────────────
 *
 *   · **吸血** —— 走 `combat/damage.ts` 的傷害管線，這裡一個字都沒改
 *   · **暴擊** —— 同上（`combat/critStrike.ts`）
 *   · **淨化** —— 走 `sim/clearPools.ts`；免疫擋的是**掛上來**，⛔ 不是**拔走**
 *   · **標記與疊層** —— 不帶 `cc` tag 的狀態一律照掛（見②的右欄），
 *     而且 `world.marks` 那條路（`adjustMarkCount`）在閘的**後面**
 *
 * ── ⑤ 純度 ────────────────────────────────────────────────────────────────
 * 純函式，讀 `StatsComp.sources` 與 `tick`；無 rng、無 `Date.now`、無三角函式、
 * 無 `**`（`sim/purity.test.ts`）。⛔ 沒有 Map 迭代（只走一個實體的陣列）。
 */
import type { ModifierSource } from "./stats/modifiers";

/**
 * 一份來源授予的免疫：**「帶著這些 tag 的狀態一律掛不上來」**。
 *
 * ⚠️ `tags` 而不是 `statusIds`：「暈眩」在出貨內容裡是**六份**不同的文件，
 * 而第七份上架的那一天，一份寫死 id 的清單會安靜地漏掉它
 *（`StatusMeta.tags` 的檔頭為同一件事寫過同一段話）。
 */
export interface StatusImmunityGrant {
  /** 要擋下的類別，逐字對 `status-effect@1.tags`。空陣列 = 什麼都不擋。 */
  tags: readonly string[];
  /**
   * ⭐ GH#1085 —— **擋幾次就消耗**（原作 `ANss` Spell Shield：擋**一次**負面法術）。
   *
   * 缺席 = 無限次 = 今天（殭屍王的常駐身分、`godie-e00r.ex` 的限時免疫逐位元不變）。
   * 帶數字的護盾每擋下一份就 −1，扣到 0 由消費端把**整份來源**拔掉（護盾被打破）。
   *
   * ⚠️ 兩條與無限次不同的語意，都是「一次性護盾」這個名詞自帶的：
   *   · 只對**敵方**施加的狀態反應（卡面的「對方」；WC3 Spell Shield 擋的是敵人的法術）——
   *     自己的代價型減益不會把自己的護盾打破；
   *   · 同一具身體同時有常駐免疫與一次性護盾時，**常駐的先答** —— 一份本來就掛不上來的
   *     狀態不該消耗護盾。
   * ⚠️ 這一格住在**來源實例**上（`sourceGrants()` 對帶次數的授予做淺拷貝），
   * ⛔ 不是內容文件那一份 —— 否則第一次擋下會把出貨 JSON 的次數扣掉。
   */
  charges?: number;
}

/**
 * `charges` 的上界 —— 誤植攔截，⛔ 不是設計政策（同 `STATUS_TAGS_MAX` 的理由）。
 * schema（`schema/effects/_shared.ts`）與引擎共用這一個數。
 */
export const STATUS_IMMUNITY_CHARGES_MAX = 99;

/**
 * ⭐ 哪一份來源**現在**擋下了這一份狀態（沒有 ⇒ `undefined` ⇒ 照掛）。
 *
 * @param sources  `StatsComp.sources`（呼叫端已經有它，⛔ 這裡不查 world）
 * @param tick     現在的 tick —— 過期的來源不算數（與 `sourceAttackType` /
 *                 `syncVisionGrants` 逐行相同的規矩）
 * @param statusTags 這一份**要掛上來**的狀態帶了哪些 tag（`StatusMeta.tags`）。
 *                 ⚠️ 查不到 tag（骨架內容、單元測試、沒填 tags 的文件）⇒
 *                 空陣列 ⇒ **一律放行**。退化方向刻意是「免疫失效」而不是
 *                 「全部擋下」：一隻誰都打不到的王比一隻沒有免疫的王難查得多。
 * @param fromHostile 施加者是不是**敵方**。只有帶 `charges` 的一次性護盾讀它
 *                 （無限次免疫是身體本身的性質，誰施加都一樣）。
 *
 * 先回無限次的那一份（⛔ 不消耗任何護盾），沒有才回第一份還有次數的護盾。
 */
export function blockingImmunitySource(
  sources: readonly ModifierSource[],
  tick: number,
  statusTags: readonly string[] | undefined,
  fromHostile: boolean,
): ModifierSource | undefined {
  if (statusTags === undefined || statusTags.length === 0) return undefined;
  let ward: ModifierSource | undefined;
  for (const src of sources) {
    const grant = src.statusImmunity;
    if (grant === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= tick) continue;
    let hit = false;
    for (const t of grant.tags) if (statusTags.includes(t)) hit = true;
    if (!hit) continue;
    if (grant.charges === undefined) return src;
    if (fromHostile && grant.charges > 0 && ward === undefined) ward = src;
  }
  return ward;
}

/**
 * ⭐ GH#1091 —— 這具身體**現在**帶著哪一份還有次數的法術護盾（沒有 ⇒ `undefined`）。
 *
 * ⚠️ 它與 {@link blockingImmunitySource} 問的**不是同一題**，而那個差別是這一格存在的
 * 全部理由：
 *
 * | | 問什麼 | 誰在問 |
 * |---|---|---|
 * | `blockingImmunitySource` | 「**這一份狀態**掛不掛得上來」（讀來襲狀態的 tags） | `effects/applyStatus.ts` |
 * | 這一支 | 「這具身體帶著護盾嗎」 | `spellWardCast.ts`（整發攔截） |
 *
 * ⭐ ⛔ **這裡刻意不問 tags** —— 一發還沒開始跑的法術**沒有 tag**。授予格上的
 * `tags` 管的是「溜過去的那一發掛不掛得上」（範圍技、開關關掉時的那條路），
 * 而整發攔截問的是「這是不是敵方的**指定目標**法術」，那一題由呼叫端回答。
 * ⛔ 硬把 tags 塞進來只會得到一個「看起來有判準」的近似：一支純傷害的法術永遠
 * 對不上任何 tag，於是原作最經典的那一發（Storm Bolt）會整個溜過去。
 *
 * ⚠️ ⛔ 不回無限次的那一族（`charges === undefined`，殭屍王的常駐身分）：
 * 那是**免疫**不是護盾，它沒有東西可以消耗，而整發攔截的定義就是「扣一次」。
 * 一具常駐免疫的身體照樣走傷害管線 —— 免疫擋的是狀態，⛔ 不是傷害。
 */
export function chargedWardSource(
  sources: readonly ModifierSource[],
  tick: number,
): ModifierSource | undefined {
  for (const src of sources) {
    const grant = src.statusImmunity;
    if (grant === undefined || grant.charges === undefined || grant.charges <= 0) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= tick) continue;
    return src;
  }
  return undefined;
}

/**
 * ⭐ 一次性護盾**扣一次**。回 `true` = 扣到 0 了，呼叫端要把那份來源拔掉。
 * ⛔ 只對帶 `charges` 的授予有意義；無限次的那一份呼叫它是 no-op（回 `false`）。
 */
export function spendImmunityCharge(grant: StatusImmunityGrant): boolean {
  if (grant.charges === undefined) return false;
  grant.charges = Math.max(0, grant.charges - 1);
  return grant.charges === 0;
}

/**
 * ⭐ 這個實體**現在**免不免疫這一份**敵方**施加的狀態（布林版，給守衛與舊呼叫端）。
 * 本體是 {@link blockingImmunitySource}。
 */
export function refusesStatusTags(
  sources: readonly ModifierSource[],
  tick: number,
  statusTags: readonly string[] | undefined,
): boolean {
  return blockingImmunitySource(sources, tick, statusTags, true) !== undefined;
}
