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
 * | `invulnerable.blocksControl`（`sim/effects/invulnerable.ts`） | ⛔ 它是**一段時間**的授予（`durationSec` 必填），而 owner 要的是這具身體的**常駐身分**；⛔ 而且它的 `isCc` 判準讀的是**效果欄位**（`stun`/`root`/`feared`/`disarmed`/`moveSpeedMult<1`），⚠️ **漏掉詛咒與致盲** —— 那兩支走 `missChance`，實測不在那一行裡 |
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
}

/**
 * ⭐ 這個實體**現在**免不免疫這一份狀態。
 *
 * @param sources  `StatsComp.sources`（呼叫端已經有它，⛔ 這裡不查 world）
 * @param tick     現在的 tick —— 過期的來源不算數（與 `sourceAttackType` /
 *                 `syncVisionGrants` 逐行相同的規矩）
 * @param statusTags 這一份**要掛上來**的狀態帶了哪些 tag（`StatusMeta.tags`）。
 *                 ⚠️ 查不到 tag（骨架內容、單元測試、沒填 tags 的文件）⇒
 *                 空陣列 ⇒ **一律放行**。退化方向刻意是「免疫失效」而不是
 *                 「全部擋下」：一隻誰都打不到的王比一隻沒有免疫的王難查得多。
 */
export function refusesStatusTags(
  sources: readonly ModifierSource[],
  tick: number,
  statusTags: readonly string[] | undefined,
): boolean {
  if (statusTags === undefined || statusTags.length === 0) return false;
  for (const src of sources) {
    const grant = src.statusImmunity;
    if (grant === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= tick) continue;
    for (const t of grant.tags) if (statusTags.includes(t)) return true;
  }
  return false;
}
