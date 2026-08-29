/**
 * ⭐【技能說明 = **從 JSON 推導**的模板】說明推導（票號待開）
 *
 * owner 2026-08-20 逐字：
 *
 * > 「**後台設定及說明、JSON 及 script、創建英雄出身模板推導、codex編輯器契約與
 * >  說明文件**等 都要一起更新喔 **（全部都是推導動態即時產生）**」
 *
 * ── 量到的起點（2026-08-21）────────────────────────────────────────────────
 *
 * 420 份技能說明裡，含**動態佔位符**的：**0 份**；含**手打機制數字**的（已剝
 * 「…」台詞）：**407 份**。也就是說卡面上每一個秒數、每一點耗魔、每一發傷害
 * 都是一段**靜態文字** —— 級距一改、倍率一轉，407 份同時變成謊話，而
 * ⛔ **沒有任何東西會紅**（`content:build` 綠、Zod 綠、全套測試綠）。
 *
 * 這正是第一·五守則那個形狀的**規模版**：每一個零件都是對的，只有它們的
 * 關係是壞的 —— 而關係沒有守衛。
 *
 * ── ⭐ 這一支是**唯一**的算繪處（⛔ 不是前端一份、後台一份）────────────────
 *
 * 佔位符在 **`registerAll` 的 `withTiers` 接縫正上方**被代入
 *（`registries.ts`），與 `resolveRangeTier` / `resolveDamageTier` /
 * `resolveCooldownTier` 站在同一格。⇒ 任何讀**註冊表**的人（遊戲內卡片 /
 * 選人畫面 / 商店 / 後台預覽 / codex / 文件產生器 / `descriptionClaims` 閘）
 * 拿到的都已經是算好的字，⛔ 沒有第二份算繪程式可以跟它說反話。
 *
 * ⚠️ 這是刻意**不**做成 `apps/client` 的一支 helper：那樣後台與文件產生器就得
 * 各自再寫一份，而「兩份算繪」正是這一支要消滅的東西。
 *
 * ── 佔位符語法（⭐ 外部編輯器會照著寫，見 codex 契約 §0.4）─────────────────
 *
 *   `{{cd}}`      冷卻秒數      ← `cooldown[]`（逐階；全階相同就收成一個數字）
 *   `{{mp}}`      耗魔          ← `manaCost[]`（同上）
 *   `{{dmg}}`     基礎傷害      ← 效果樹上**第 1 個**傷害葉（`{{dmg2}}` = 第 2 個…）
 *   `{{range}}`   施法距離      ← `range` → **級距詞**
 *   `{{radius}}`  有效半徑      ← 效果樹 `radius` → **級距詞**
 *   `{{travel}}`  位移距離      ← dash/leap/blink 的距離 → **級距詞**
 *   `{{push}}`    擊退距離      ← knockback 的距離 → **級距詞**
 *   `{{msb}}`     移速加成%     ← 效果樹上第 1 個 `ms` 的 % modifier（GH#789
 *                                `msBonusTier` 解析後；逐階以 / 分隔；⛔ 不含 % 記號，
 *                                卡面自己寫「提昇{{msb}}%速度」）
 *
 * ⭐ 結尾加 `!` = **實際值**（`{{cd!}}` = 玩家真的等到的秒數 = 卡面 ×
 * `combatEnv.cooldown`，出貨 0.2 ⇒ 45 秒的技能實際只轉 9 秒）。哪幾軸有實際值、
 * 其餘為什麼**刻意沒有**，住在 {@link ./renderAbilityText}，⛔ 不在這一份。
 *
 * ⭐ 為什麼**傷害/冷卻/耗魔是數字、幾何是級距詞** —— owner 2026-08-19 逐字：
 * 「所有**卡面範圍跟距離說明**都應該要跟著改五級距（**傷害/冷卻/耗魔要明確數值**
 *  不然很難讓玩家判斷取捨）」。⛔ 這不是排版偏好，是玩家要拿來算取捨的東西。
 *
 * ⚠️ **解不開的佔位符原樣印出來**（`{{dmg3}}` 就是 `{{dmg3}}`），⛔ 不退回一個
 * 看起來合理的數字。fail-open 沒錯，**靜默**才是缺陷 —— 卡面上一個裸的
 * `{{dmg3}}` 是刺眼的，一個憑空生出來的「0 點傷害」不是。閘
 * （`abilityProse.test.ts`）也直接對這件事紅。
 *
 * ── ⛔ 三條不可以違反的 ────────────────────────────────────────────────────
 *
 * ① `「…」` 是**角色對白不是效果**（第〇·六守則②）。剝／保護的是**整段**
 *    （含跨行、含行中），⛔ 不是「行首是「的那幾行」。台詞裡的數字一個字都不動
 *    —— 44-04 心臟麻痺的「在35秒後宣布勝利吧」曾被讀成一支有 35 秒時序的技能。
 * ② `（GGD 註記 …）` 同樣受保護：那是**當初為什麼這樣做**的紀錄，機械改寫它
 *    等於把歷史改成看起來像現在的樣子。
 * ③ 代換只在**逐位元組相等**時發生（見 {@link placeholderizeAbilityText}）——
 *    `render(佔位符) === 原本那串字`。⇒ 這次轉換對玩家看到的字是
 *    **零變動**，⛔ 不可能夾帶一次無聲的平衡改動。幾何是唯一的例外，
 *    而它是 owner 明說要換成級距詞的那一軸。
 */
import { DUEL_ZONE_RADIUS_REF, SKILL_TIER_NAMES, snapToTier, type SkillTierName } from "./skillTiers";
import { DEFAULT_RANGE_TIERS } from "./rangeTiers";
import { DEFAULT_AOE_TIERS } from "./aoeTiers";
import { DEFAULT_DISPLACEMENT_TIERS } from "./displacementTiers";

/* ───────────────────────────── 佔位符詞彙 ───────────────────────────── */

/**
 * 佔位符的鍵。⭐ **這是唯一一份清單** —— codex 契約、後台欄位說明、
 * 閘的訊息全部從它推導，⛔ 不要在別處重打一份字串陣列。
 */
export const PROSE_SLOT_KEYS = [
  "cd",
  "mp",
  "dmg",
  "range",
  "radius",
  "travel",
  "push",
  "msb",
] as const;
export type ProseSlotKey = (typeof PROSE_SLOT_KEYS)[number];

/** 一格佔位符的人話說明（codex 契約與後台欄位說明從這裡長出來）。 */
export const PROSE_SLOT_DOC: Readonly<Record<ProseSlotKey, { zh: string; from: string; renders: string }>> =
  Object.freeze({
    cd: { zh: "冷卻秒數", from: "ability@1.cooldown[]", renders: "數字（逐階以 / 分隔）" },
    mp: { zh: "耗魔", from: "ability@1.manaCost[]", renders: "數字（逐階以 / 分隔）" },
    dmg: { zh: "基礎傷害", from: "效果樹上的傷害葉（flat + perRank）", renders: "數字（逐階以 / 分隔）" },
    range: { zh: "施法距離", from: "ability@1.range / rangeTier", renders: "五級距詞（極小…極大／全場）" },
    radius: { zh: "有效半徑", from: "效果樹 radius / radiusTier", renders: "五級距詞（極小…極大／全場）" },
    travel: { zh: "位移距離", from: "dash / leap / blink 的距離", renders: "五級距詞（極小…極大／全場）" },
    push: { zh: "擊退距離", from: "knockback 的距離", renders: "五級距詞（極小…極大／全場）" },
  });

/** 可以帶序號的那幾格（`{{dmg2}}` = 效果樹上第 2 個傷害葉）。 */
export const INDEXED_SLOTS: readonly ProseSlotKey[] = ["dmg"];

/**
 * 一個佔位符。⚠️ `\{\{key[N][!]\}\}` —— 鍵是小寫英文，序號是選填的十進位，
 * 結尾的 `!` 是**實際值**（見 {@link ./renderAbilityText}）。
 * ⛔ 刻意不吃空白（`{{ cd }}` 不算）：一個寬鬆的語法會讓「這是不是佔位符」
 * 變成兩個實作各自的判斷，而外部編輯器抄的是這一行。
 *
 * ⭐ **為什麼要有第二種值**：卡面的「45秒冷卻」與玩家真的等到的秒數**不是同一個
 * 數字** —— 出貨 `combatEnv.cooldown` 是 0.2，所以那一支實際只轉 9 秒。
 * 兩個都是真的，而它們住在**不同的空間**（`cooldownTiers.ts`：「這三張表是卡面秒」）。
 * ⇒ 語法要表達得出兩種，⛔ 不然想寫實際值的作者只能手打回去，
 * 而手打正是這一整支要消滅的東西。
 */
export const PLACEHOLDER_RE = /\{\{([a-z]+)(\d*)(!?)\}\}/g;

/**
 * 解析一個佔位符鍵。回 `undefined` = 不在詞彙裡（閘會對它紅）。
 * @param live 第三個捕獲群組（`"!"` = 要**實際值**那一種）。
 */
export function parseSlot(
  key: string,
  index: string,
  live = "",
): { slot: ProseSlotKey; i: number; live: boolean } | undefined {
  if (!(PROSE_SLOT_KEYS as readonly string[]).includes(key)) return undefined;
  const slot = key as ProseSlotKey;
  if (index !== "" && !INDEXED_SLOTS.includes(slot)) return undefined;
  const i = index === "" ? 0 : Number.parseInt(index, 10) - 1;
  return i >= 0 ? { slot, i, live: live === "!" } : undefined;
}

/* ─────────────────────── 受保護段落 · 數字字樣 ─────────────────────── */

/**
 * ⛔ **不可以被改寫的兩種段落**（見檔頭①②）。
 * ⚠️ 與 `descriptionClaims.mechanicsText()` / `batch1.py::_mechanics_text()`
 * 逐字同構 —— 差別只在那兩支是**刪掉**台詞，這一支要**保留**它（輸出要寫回卡片）。
 */
export const PROTECTED_RE = /「[^」]*」|（GGD 註記[\s\S]*?(?=\n\n|$)/gs;

/** 對**受保護段落以外**的每一段套用 `f`，保護段原封不動送回去。 */
export function mapOutsideQuotes(text: string, f: (s: string) => string): string {
  const out: string[] = [];
  let i = 0;
  for (const m of text.matchAll(PROTECTED_RE)) {
    out.push(f(text.slice(i, m.index)));
    out.push(m[0]);
    i = m.index + m[0].length;
  }
  out.push(f(text.slice(i)));
  return out.join("");
}

/**
 * 一個數字，**而且必須整個吃完**。
 *
 * ⚠️ 尾巴那個 `(?![\d.])` 不是裝飾，它擋的是**回溯**造成的假匹配（兩個都真的
 * 踩到過）：「加速**移動1.5倍**」會回溯成 `1` 而躲過「不是倍」的 lookahead；
 * 「**範圍1200點傷害**」會回溯成 `120` 而把一發傷害讀成一個範圍。
 * ⇒ 任何「數字後面不可以接 X」的 lookahead，都要先把數字**釘死**。
 */
export const N = String.raw`\d+(?:\.\d+)?(?![\d.])`;
/** 逐階斜線串：`350/450/550/650`（允許斜線兩側有空白）。 */
export const RANKS = `${N}(?:\\s*/\\s*${N})*`;

/* ────────────────────────────── 幾何字樣 ────────────────────────────── */

/** 引擎值 ≥ 決鬥區半徑時卡面寫的字。⛔ 不是級距詞 —— 級距最大只到 R/2。 */
export const WHOLE_ZONE_WORD = "全場";
export type TierWord = SkillTierName | typeof WHOLE_ZONE_WORD;

/** 幾何軸。四軸各自有自己的級距表。 */
export type GeoAxis = "range" | "radius" | "travel" | "push";

/** 級別欄位的合法值（`rangeTier` / `radiusTier` / `distanceTier`）。 */
const SKILL_TIER_SET: ReadonlySet<SkillTierName> = new Set(SKILL_TIER_NAMES);

/**
 * 一個引擎幾何值 → 級距詞。⭐ 超過決鬥區半徑就是「全場」，⛔ 不是「極大」。
 * @param zoneRadius 決鬥區半徑（從 `Arenas` 推導，⛔ 不抄字面值）
 */
export function tierWordFor(
  value: number,
  table: Readonly<Record<SkillTierName, number>>,
  zoneRadius: number,
): TierWord {
  if (!(value > 0)) return WHOLE_ZONE_WORD;
  if (value >= zoneRadius) return WHOLE_ZONE_WORD;
  return snapToTier(value, table);
}

/**
 * 幾何字樣。⚠️ **順序就是優先序** —— `施法距離N` 必須在裸的 `距離N` 之前，
 * 否則後者會把前者切一半。
 *
 * ⛔ 每一條都刻意保守（寧可漏報）。已經量到的三種誤報，各有一條防線：
 *   · 「大**範圍**2500點傷害」（38-002）→ `範圍N` 加上「後面不是傷害」的 lookahead
 *   · 「加速**移動**1.5倍」（21-01）  → `移動N` 加上「後面不是倍/%」的 lookahead
 *   · 「**距離**550交叉在X中」（08-04）→ 裸 `距離N` 走 `range` 軸，引擎沒有就不改
 */
export interface GeoPattern {
  readonly axis: GeoAxis;
  readonly re: RegExp;
  /**
   * 把整個 match 換成帶級距**詞位**的寫法。`word` 在算繪時是級距詞、
   * 在轉檔時是 `{{range}}` 這類佔位符 —— 同一份形狀服務兩個方向。
   *
   * ⚠️ `standalone` = 這一處**自己佔滿一整行**（規格區塊那幾行，例如
   * `施法距離14`）。它與行內出現的同一個字樣要寫成**不同的樣子**：
   *   規格行 → `施法距離：中`（有冒號，是一格欄位）
   *   行 內 → `中範圍內的敵人`（沒有冒號，是一句話）
   * ⛔ 共用一個寫法會產出「範圍：全場 內的敵人」這種句子。
   */
  readonly rewrite: (m: RegExpMatchArray, word: string, standalone: boolean) => string;
}

export const GEO_PATTERNS: readonly GeoPattern[] = [
  // 施法距離14 / 施法距離：14
  {
    axis: "range",
    re: new RegExp(String.raw`施法距離\s*[:：]?\s*${N}(?:\s*/\s*${N})*`, "g"),
    rewrite: (_m, t, solo) => (solo ? `施法距離：${t}` : `施法距離${t}`),
  },
  // 有效半徑6.05 / 半徑 24
  {
    axis: "radius",
    re: new RegExp(String.raw`(有效)?半徑\s*[:：]?\s*${N}`, "g"),
    rewrite: (m, t, solo) => `${m[1] ?? ""}半徑${solo ? "：" : ""}${t}`,
  },
  // 有效範圍為1600 / 範圍1800  ⛔ 但不吃「大範圍2500點傷害」
  {
    axis: "radius",
    re: new RegExp(String.raw`範圍\s*[為:：]?\s*${N}(?!\s*點?\s*(?:傷害|損害))`, "g"),
    rewrite: (m, t, solo) =>
      m[0].includes("為") ? `範圍為${t}` : solo ? `有效範圍：${t}` : `${t}範圍`,
  },
  // 400範圍內 / 350範圍造成 / 250範圍的部隊
  {
    axis: "radius",
    re: new RegExp(String.raw`${N}\s*範圍`, "g"),
    rewrite: (_m, t) => `${t}範圍`,
  },
  // 移動850的距離 / 傳送3300距離
  {
    axis: "travel",
    re: new RegExp(String.raw`(瞬間移動|傳送|移動|衝刺|突進)\s*${N}\s*(?:的)?距離`, "g"),
    rewrite: (m, t) => `${m[1]}${t}距離`,
  },
  // 擊退1000距離 / 擊退1000
  {
    axis: "push",
    re: new RegExp(String.raw`擊退\s*${N}\s*(?:距離)?`, "g"),
    rewrite: (_m, t) => `擊退${t}距離`,
  },
  // 加速移動1.5倍 ⛔ 排除；裸的 移動850
  {
    axis: "travel",
    re: new RegExp(String.raw`移動\s*${N}(?!\s*[倍%％])`, "g"),
    rewrite: (_m, t) => `移動${t}距離`,
  },
  // 距離550（裸；一定排在 施法距離 之後）
  {
    axis: "range",
    re: new RegExp(String.raw`距離\s*[:：]?\s*${N}`, "g"),
    rewrite: (_m, t, solo) => (solo ? `施法距離：${t}` : `${t}距離`),
  },
];

/** 這一處是不是**自己佔滿一整行**（規格區塊那幾行）。 */
export function isStandalone(seg: string, offset: number, match: string): boolean {
  const from = seg.lastIndexOf("\n", offset) + 1;
  const to = seg.indexOf("\n", offset);
  const line = seg.slice(from, to === -1 ? seg.length : to);
  return line.trim() === match.trim();
}

export const AXIS_LABEL: Readonly<Record<GeoAxis, string>> = Object.freeze({
  range: "施法距離",
  radius: "有效半徑",
  travel: "位移距離",
  push: "擊退距離",
});

/* ─────────────────────── 冷卻 / 耗魔 / 傷害字樣 ─────────────────────── */

/**
 * 三軸的字樣，每一條都把**數字那一段**單獨括起來（`num` 指出是第幾個群組）。
 * ⚠️ 只換數字、⛔ 不動它前後的字 —— 一條會重寫整句的規則就是一次無聲的改稿。
 */
interface NumPattern {
  readonly slot: "cd" | "mp" | "dmg";
  readonly re: RegExp;
  /** 數字那一段是第幾個捕獲群組（1-based）。 */
  readonly num: number;
  /**
   * ⛔ 這一處**不是**那一軸的量 —— 整個 match 命中就跳過。
   * 量到的兩種誤報：`造成自身力量*3+…`（3 是**係數**不是點數，25-01 北斗懺悔拳
   * 被讀成「卡面 3 點 vs 引擎 300」＝ 300 倍落差）與
   * `造成範圍內敵人減少3點護甲`（那是**減益**不是傷害，92-03 消化液）。
   */
  readonly reject?: RegExp;
}

const MANA_UNIT = String.raw`(?:\[MP]|MP|魔力|法力)`;

export const NUM_PATTERNS: readonly NumPattern[] = [
  // 45秒冷卻 / 60/50/40/30秒冷卻時間
  { slot: "cd", re: new RegExp(`(${RANKS})(\\s*秒\\s*冷卻(?:時間)?)`, "g"), num: 1 },
  // 冷卻時間30秒 / 冷卻 30/25/20/15 秒
  { slot: "cd", re: new RegExp(`(冷卻(?:時間)?\\s*[:：]?\\s*)(${RANKS})(\\s*秒)`, "g"), num: 2 },
  // 消耗MP150/250/350/450 / 耗[MP] 50
  {
    slot: "mp",
    re: new RegExp(`((?:消耗|花費|耗)\\s*${MANA_UNIT}\\s*[:：]?\\s*)(${RANKS})`, "g"),
    num: 2,
  },
  // 消耗 250 點魔力（單位在後）
  {
    slot: "mp",
    re: new RegExp(`((?:消耗|花費|耗)\\s*)(${RANKS})(\\s*(?:點)?\\s*${MANA_UNIT})`, "g"),
    num: 2,
  },
  // 造成350/450/550/650+50% [AP]傷害 / 造成瞬間550點傷害
  {
    slot: "dmg",
    re: new RegExp(`(造成[^。，、\\n]{0,10}?)(${RANKS})(\\s*(?:點|\\+))`, "g"),
    num: 2,
    reject: /[*×]|減少|降低|下降/,
  },
  // 造成300傷害（w3x 匯入的另一種寫法：**沒有「點」**）
  // ⚠️ 尾巴刻意是 `(?:點\\s*)?傷害` 而不是 `.*?傷害` —— 「造成1.25**倍的**傷害」
  //    那個 1.25 是倍率不是點數，中間隔著「倍」就不該被吃掉。
  {
    slot: "dmg",
    re: new RegExp(`(造成[^。，、\\n]{0,10}?)(${RANKS})(\\s*(?:點\\s*)?傷害)`, "g"),
    num: 2,
    reject: /[*×]|減少|降低|下降/,
  },
  // 650點傷害（沒有「造成」的那一種寫法）
  // ⚠️ `(?<![*×])` 擋的是**係數**：「+[敏捷]*5點傷害」「力量*3點傷害」裡那個
  //    5 / 3 是倍率不是點數。量到 11 支被這樣誤讀（77-00 / 70-01 / 04-04 …），
  //    而誤讀的結果是把一個**成長係數**綁成一發基礎傷害 —— 那正是
  //    `descriptionClaims.damageClaims` 用 `[*×]` 排除掉的同一類，
  //    ⛔ 只是那一支排的是「造成…」那一條，這一條當時沒有防線。
  { slot: "dmg", re: new RegExp(`(?<![*×])(${RANKS})(\\s*點\\s*傷害)`, "g"), num: 1 },
];

/* ──────────────────────────── 引擎側的量 ──────────────────────────── */

/** 級距表 + 決鬥區半徑。⛔ 全部從出貨 config / arenas 推導，不抄字面值。 */
export interface ProseTables {
  readonly range: Readonly<Record<SkillTierName, number>>;
  readonly radius: Readonly<Record<SkillTierName, number>>;
  readonly travel: Readonly<Record<SkillTierName, number>>;
  readonly push: Readonly<Record<SkillTierName, number>>;
  readonly zoneRadius: number;
}

/**
 * ⛔ **沒有出貨 config 時的退路** —— 用 Zod 的 `DEFAULT_*`（第一守則的住處②），
 * ⛔ 不是一份手抄的數字。
 *
 * 誰會走這條路：後台「創建新英雄」與 `newHeroChecks` 拿的是**磁碟形狀**的草稿，
 * 那時 `Configs` 還沒被載進來。⭐ 出貨路徑（`registerAll`）永遠餵真表，
 * 所以這一份**不會**影響任何一張玩家看得到的卡片。
 */
export const DEFAULT_PROSE_TABLES: ProseTables = Object.freeze({
  range: DEFAULT_RANGE_TIERS.range,
  radius: DEFAULT_AOE_TIERS.radius,
  travel: Object.fromEntries(
    Object.entries(DEFAULT_DISPLACEMENT_TIERS.travel).map(([k, v]) => [k, v.distance]),
  ) as Readonly<Record<SkillTierName, number>>,
  push: Object.fromEntries(
    Object.entries(DEFAULT_DISPLACEMENT_TIERS.push).map(([k, v]) => [k, v.distance]),
  ) as Readonly<Record<SkillTierName, number>>,
  zoneRadius: DUEL_ZONE_RADIUS_REF,
});

/** 一支技能上**引擎真的有**的量，已經算成卡面上那串字。 */
export interface AbilityQuantities {
  /** `undefined` = 引擎沒有這一軸 ⇒ ⛔ 不改寫（換了只會讓一句做不到的宣稱更像真的）。 */
  readonly cd?: string;
  readonly mp?: string;
  /** 效果樹上的傷害葉，深度優先。`{{dmg}}` = `[0]`、`{{dmg2}}` = `[1]`… */
  readonly dmg: readonly string[];
  readonly range?: TierWord;
  readonly radius?: TierWord;
  readonly travel?: TierWord;
  readonly push?: TierWord;
  /**
   * ⭐ 每一軸**可以接受的寫法**（收合形 `45` 與展開形 `45/45/45/45`）。
   * 兩種在語意上逐字相同，所以卡面用哪一種都算「說的就是 JSON 那個數字」，
   * 而算繪一律吐收合形（＝出貨卡面的寫法）。
   */
  readonly forms: Readonly<{ cd: readonly string[]; mp: readonly string[]; dmg: readonly (readonly string[])[] }>;
  /**
   * ⭐ 每一軸的**逐階單值**（只有逐階不同的那些才列）。
   * w3x 匯入的卡面有一個舊慣例：多階技能只印**其中一階**那個數字
   *（「造成瞬間350點傷害」而 JSON 是 `[350,500,650,800]`；
   *  42-01 凍結的大地更印的是**第 3 階** 250）——
   * 它與整串**不是**同一件事，所以走 {@link ProseRewriteOptions.partial} 那一格決定。
   */
  readonly ranks: Readonly<{
    cd: readonly string[];
    mp: readonly string[];
    dmg: readonly (readonly string[])[];
  }>;
  /** 級距詞背後那個引擎值（GGD 單位）。⭐ 只進報表訊息。 */
  readonly raw: Partial<Record<GeoAxis, number>>;
}

const fmtNum = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * 逐階數列 → 卡面那串字。**全階相同就收成一個數字**（`[45,45,45,45]` → `45`），
 * 這正是出貨卡面的寫法。
 */
export function fmtRanks(xs: readonly number[]): string | undefined {
  const ns = xs.filter((n) => Number.isFinite(n));
  if (ns.length === 0) return undefined;
  const parts = ns.map(fmtNum);
  return new Set(parts).size === 1 ? parts[0]! : parts.join("/");
}

/**
 * 一段字**可以接受的兩種寫法**。⭐ 收合形（`45`）與展開形（`45/45/45/45`）
 * 在語意上逐字相同，所以兩種都算「這一處說的就是 JSON 那個數字」。
 */
function acceptedForms(xs: readonly number[]): string[] {
  const ns = xs.filter((n) => Number.isFinite(n));
  if (ns.length === 0) return [];
  const parts = ns.map(fmtNum);
  // ⛔ **只有全階相同**時，單一數字才等價於整串。
  // ⚠️ 這一行踩過：原本無條件收 `parts[0]`，於是卡面的「造成瞬間350點傷害」
  //    對上 JSON `[350,500,650,800]` 被判定為「說的就是同一件事」——
  //    而算繪回去會變成「350/500/650/800」，一次**無聲改掉玩家看到的字**。
  //    那正是這一支要消滅的東西，⛔ 不可以由這一支自己製造。
  return new Set(parts).size === 1 ? [parts.join("/"), parts[0]!] : [parts.join("/")];
}

/** 逐階**不同**時的每一階；全階相同就是空的（那時 `forms` 已經收了它）。 */
function rankListOf(xs: readonly number[]): string[] {
  const parts = xs.filter((n) => Number.isFinite(n)).map(fmtNum);
  return parts.length > 1 && new Set(parts).size > 1 ? parts : [];
}

function* walk(n: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(n)) {
    for (const v of n) yield* walk(v);
  } else if (n !== null && typeof n === "object") {
    yield n as Record<string, unknown>;
    for (const v of Object.values(n as Record<string, unknown>)) yield* walk(v);
  }
}

const pos = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;

/**
 * 一格傷害量 → 逐階數列。`flat` 與 `perRank` **相加**（`sim/effects/effect.ts`
 * 的 `Scaling` 就是這樣結算的），⛔ 不是二選一。
 * ⚠️ `ratios` / `attrRatios` 是**成長**不是基礎值，刻意不進來 —— 卡面上它們
 * 本來就寫成「+50% [AP]」那種文字，⛔ 沒有一個數字可以代它。
 */
function damageRanks(v: unknown): number[] | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? [v] : undefined;
  if (v === null || typeof v !== "object") return undefined;
  const o = v as { flat?: unknown; perRank?: unknown };
  const flat = typeof o.flat === "number" ? o.flat : 0;
  if (Array.isArray(o.perRank)) {
    const rs = o.perRank.filter((n): n is number => typeof n === "number").map((n) => n + flat);
    return rs.length > 0 ? rs : undefined;
  }
  return typeof o.flat === "number" ? [o.flat] : undefined;
}

/** 帶「一發傷害量」語意的欄位名（與 `descriptionClaims.DAMAGE_KEYS` 同一份）。 */
const DAMAGE_KEYS = ["amount", "base", "damage", "bonusDamage", "perHit"] as const;

/**
 * ⛔ **只有真的在打人的節點才算傷害葉。**
 *
 * ⚠️ 這一行踩過：`amount` 這個欄位名**治療也在用** —— 99-04 世界第一的公主殿下
 * 的效果樹只有一格 `{"kind":"heal","amount":{"perRank":[200,275,350]}}`，
 * 而卡面寫「每秒受到100點傷害」。少了這一行，`{{dmg}}` 會綁到那組**治療量**上，
 * 於是卡片印出「200/275/350 點傷害」—— 一句引擎從來不會做的事，而且看起來完全正常。
 *
 * 判準是**節點自己說得出傷害型別**（`damageType`），或它的 kind 就叫傷害。
 * ⛔ 不是一張 kind 白名單：白名單漏掉下一個傷害 kind 的那天不會有東西紅。
 */
const isDamageNode = (n: Record<string, unknown>): boolean =>
  typeof n["damageType"] === "string" || /^damage/i.test(String(n["kind"] ?? ""));

/** 一棵樹上的傷害葉（深度優先），每一片是它自己的逐階數列。 */
function damageLeaves(root: unknown): number[][] {
  const out: number[][] = [];
  const seen = new Set<unknown>();
  for (const node of walk(root)) {
    if (!isDamageNode(node)) continue;
    for (const k of DAMAGE_KEYS) {
      if (!(k in node) || seen.has(node[k])) continue;
      seen.add(node[k]);
      const rs = damageRanks(node[k]);
      if (rs !== undefined) out.push(rs);
    }
  }
  return out;
}

/**
 * ⭐ **`passive.ranks[]` 的逐階要橫著讀，⛔ 不是直著讀。**
 *
 * 一支被動技的四階寫成四個 rank 物件，每一個自己帶一發 400 / 700 / 1000 ——
 * 直著讀會得到**三片各自單值**的葉子（`{{dmg}}`=400、`{{dmg2}}`=700…），
 * 而卡面寫的是「400/700/1000」那一串。⇒ 橫著讀才對得上：
 * 第 j 片葉子的逐階值 = 每一階的第 j 片葉子。
 *
 * ⚠️ 只有**每一階都有第 j 片**時才橫著併；階數不齊就退回直著讀
 *（那代表各階的效果樹形狀不同，橫著併會把不同的東西湊成一串）。
 */
function passiveDamageLeaves(passive: unknown): number[][] {
  const ranks = (passive as { ranks?: unknown } | null | undefined)?.ranks;
  if (!Array.isArray(ranks) || ranks.length === 0) return damageLeaves(passive);
  const perRank = ranks.map((r) => damageLeaves(r));
  const width = Math.max(...perRank.map((a) => a.length));
  const out: number[][] = [];
  for (let j = 0; j < width; j++) {
    const col = perRank.map((a) => a[j]);
    if (col.every((c) => c !== undefined && c.length === 1)) out.push(col.map((c) => c![0]!));
    else for (const c of col) if (c !== undefined) out.push(c);
  }
  return out;
}

/**
 * 把一份**登錄表裡的** `AbilityDef` 攤平成「引擎真的有的量」。
 *
 * ⚠️ 輸入必須是註冊之後那一份（`Abilities.get(id)`），⛔ 不是磁碟 JSON：
 * 104 支技能的 `effects` 在磁碟上是空的、真正的內容住在 `template.ref` 裡
 * （失敗形態⑤：被測的不是出貨的那個）。
 */
export function abilityQuantities(
  def: unknown,
  t: ProseTables = DEFAULT_PROSE_TABLES,
): AbilityQuantities {
  const d = (def ?? {}) as Record<string, unknown>;
  const dmg: string[] = [];
  const dmgForms: string[][] = [];
  const dmgRanks: string[][] = [];
  let radius: number | undefined = pos(d["radius"]);
  let travel: number | undefined;
  let push: number | undefined;
  for (const node of walk([d["effects"], d["passive"], d["marks"], d["toggle"]])) {
    if (radius === undefined) radius = pos(node["radius"]);
    const kind = String(node["kind"] ?? "");
    if (travel === undefined && ["dash", "leap", "blink"].includes(kind)) {
      travel = pos(node["maxDistance"]) ?? pos(node["distance"]) ?? pos(node["throwDistance"]);
    }
    if (push === undefined && kind === "knockback") push = pos(node["distance"]);
  }
  for (const rs of [
    ...damageLeaves([d["effects"], d["marks"], d["toggle"]]),
    ...passiveDamageLeaves(d["passive"]),
  ]) {
    const s = fmtRanks(rs);
    if (s === undefined) continue;
    dmg.push(s);
    dmgForms.push(acceptedForms(rs));
    dmgRanks.push(rankListOf(rs));
  }
  const range = pos(d["range"]);
  const word = (v: number | undefined, table: Readonly<Record<SkillTierName, number>>) =>
    v === undefined ? undefined : tierWordFor(v, table, t.zoneRadius);
  /**
   * ⭐ **級別欄位直接就是那個詞** —— 它比數字可靠：`resolveRangeTier` 的規則是
   * 「兩格都填 → **級別贏**」，而出貨內容裡有 20 支的原始 `range`/`radius` 與級別
   * 對不上（44-01 死神之眼寫 2、級別是極大＝12）。⛔ 從數字反推會印出退路值。
   * ⚠️ 這也讓**磁碟形狀**的草稿（後台創建新英雄，那時 `range` 還沒被解析）算得出來。
   */
  const tierField = (k: string): TierWord | undefined => {
    const v = d[k];
    return typeof v === "string" && (SKILL_TIER_SET as ReadonlySet<string>).has(v)
      ? (v as SkillTierName)
      : undefined;
  };
  const raw: Partial<Record<GeoAxis, number>> = {};
  for (const [k, v] of [
    ["range", range],
    ["radius", radius],
    // ⭐ 位移退回施法距離是刻意的：地面瞬移（09-02 瞬間移動）的「移動多遠」
    //   逐字就是它的施法距離，⛔ 不是效果樹上另一個數字。
    ["travel", travel ?? range],
    ["push", push],
  ] as const) {
    if (v !== undefined) raw[k] = v;
  }
  const cdRanks = Array.isArray(d["cooldown"]) ? (d["cooldown"] as number[]) : [];
  const mpRanks = Array.isArray(d["manaCost"]) ? (d["manaCost"] as number[]) : [];
  return {
    cd: fmtRanks(cdRanks),
    mp: fmtRanks(mpRanks),
    dmg,
    range: tierField("rangeTier") ?? word(range, t.range),
    radius: tierField("radiusTier") ?? word(radius, t.radius),
    travel: tierField("distanceTier") ?? word(travel ?? range, t.travel),
    push: word(push, t.push),
    forms: { cd: acceptedForms(cdRanks), mp: acceptedForms(mpRanks), dmg: dmgForms },
    ranks: { cd: rankListOf(cdRanks), mp: rankListOf(mpRanks), dmg: dmgRanks },
    raw,
  };
}

/** 一格佔位符算出來的字；`undefined` = 引擎沒有這一軸 ⇒ ⛔ 原樣印出來。 */
export function slotValue(q: AbilityQuantities, slot: ProseSlotKey, i: number): string | undefined {
  if (slot === "dmg") return q.dmg[i];
  if (i !== 0) return undefined;
  switch (slot) {
    case "cd":
      return q.cd;
    case "mp":
      return q.mp;
    case "range":
      return q.range;
    case "radius":
      return q.radius;
    case "travel":
      return q.travel;
    case "push":
      return q.push;
  }
}

/* ──────────────────────────────  算繪  ────────────────────────────── */

/**
 * ⭐ **唯一的算繪處。** 把一段帶佔位符的說明算成玩家看到的字。
 *
 * ⚠️ 解不開的佔位符**原樣送回去**（見檔頭）：一個裸的 `{{dmg3}}` 印在卡面上
 * 是刺眼的，一個憑空生出來的「0」不是。閘會對它紅。
 * ⚠️ 台詞與（GGD 註記）裡的 `{{…}}`：⛔ 不特別排除 —— 一段台詞裡不會有佔位符，
 * 而真的有的話它也該被算出來（作者刻意寫的）。剝台詞是給**讀數字**的人用的。
 */
export function renderAbilityText(
  text: string,
  q: AbilityQuantities,
  live?: LiveValues,
): string {
  if (!text.includes("{{")) return text;
  return text.replace(PLACEHOLDER_RE, (whole, key: string, index: string, bang: string) => {
    const s = parseSlot(key, index, bang);
    if (s === undefined) return whole;
    // ⛔ `{{cd!}}` 拿不到實際值時**原樣印出來**，⛔ 不退回卡面值 ——
    //    退回去的話卡面會印一個「實際 45 秒」，而玩家等的是 9 秒（同檔頭的 fail-loud）。
    if (s.live) return (s.i === 0 ? live?.[s.slot] : undefined) ?? whole;
    return slotValue(q, s.slot, s.i) ?? whole;
  });
}

/**
 * 一支技能上**實際值**那一半（`{{cd!}}` 這一族）。
 *
 * ⚠️ 型別刻意寫成一張純字串表，⛔ 不 import `./renderAbilityText` ——
 * 那一支要 import 這一支的詞彙，兩邊互相 import 就是一個模組初始化循環。
 * ⭐ 誰**算**它、哪幾軸算得出來、為什麼其餘幾軸刻意算不出來：全部住在
 * {@link ./renderAbilityText}（`LIVE_RULES`），⛔ 不在這裡。
 */
export type LiveValues = Readonly<Partial<Record<ProseSlotKey, string>>>;

/**
 * 把每一個佔位符換成一顆**不含數字**的私用區字元。
 * 掃「還有沒有手打數字」之前一定要先跑它，否則 `{{dmg2}}` 裡那個 `2`
 * 有機會被下一條新字樣讀成一個手打數字。
 */
export const maskPlaceholders = (text: string): string =>
  text.replace(PLACEHOLDER_RE, PLACEHOLDER_MASK);

/** 遮罩用的私用區字元。⛔ 不可以換成空字串 —— 那會把兩側黏起來，造出假匹配。 */
export const PLACEHOLDER_MASK = "\uE000";

/** 這一段字裡的佔位符，逐個列出來（閘用）。 */
export function placeholdersIn(
  text: string,
): { raw: string; key: string; index: string; live: string }[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => ({
    raw: m[0]!,
    key: m[1]!,
    index: m[2]!,
    live: m[3]!,
  }));
}

/* ─────────────────────────────  轉檔  ────────────────────────────── */

export type ProseFindingRule =
  | "num-bound" // 手打數字 → 佔位符（render 逐位元組相同）
  | "num-partial" // 卡面只印**其中一階**，JSON 是逐階數列 ⇒ 綁上去之後卡面**多印**其餘幾階
  | "num-unbound" // 手打數字，但 JSON 沒有一個值等於它 ⇒ ⛔ 不動（它是既有的說謊）
  | "geo-tiered" // 幾何數字 → 級距詞佔位符
  | "geo-no-engine-value"; // 卡面寫了幾何，引擎這一軸是空的 ⇒ ⛔ 不動

export interface ProseFinding {
  readonly rule: ProseFindingRule;
  readonly slot: ProseSlotKey;
  readonly before: string;
  readonly after?: string;
  readonly why: string;
}

export interface ProseRewrite {
  readonly next: string;
  readonly findings: readonly ProseFinding[];
}

/**
 * ⭐ **一格決策開關**（第一守則：拿不定主意的決策兩種都做，⛔ 不是挑一個然後在
 * 註解裡辯護）。
 *
 * w3x 匯入的卡面有一個舊慣例：一支四階技能的說明只印**其中一階**那個數字
 *（「造成瞬間350點傷害」而 JSON 是 `[350,500,650,800]`）。把它綁成 `{{dmg}}`
 * 之後，卡面會印出**整串** —— 玩家看到的字**變了**（變多了）。
 *
 * · `"bind"`（**預設**）—— 綁。理由是 owner 2026-08-19 的裁決逐字：
 *   「傷害/冷卻/耗魔要**明確數值** 不然**很難讓玩家判斷取捨**」。一張只印
 *   rank 1 的卡片正是「看不出取捨」的那一種，所以照第〇·六守則，
 *   **優先權大的那一邊預設啟動**。
 * · `"keep"` —— 不綁，留手打數字。⛔ 留著的那些會被閘點名（它們正是「級距一改
 *   就變成謊話」的那一批），所以這一格是**回頭用的**，不是觀望用的。
 */
export interface ProseRewriteOptions {
  readonly partial?: "bind" | "keep";
}

/**
 * 把一段手打數字的說明轉成佔位符版。
 *
 * ⭐ **三軸（冷卻／耗魔／傷害）只在逐位元組相等時代換** ——
 * `render({{cd}}) === 原本那串數字`。⇒ 玩家看到的字**零變動**，
 * ⛔ 這次轉檔不可能夾帶一次無聲的平衡改動。對不上的那些一律留原樣，
 * 並且以 `num-unbound` 報出來 —— 它們是**既有的**「卡面說 A、引擎跑 B」，
 * 修它們要動平衡資料，那是 owner 的排序（第零守則⑧）。
 *
 * ⭐ **幾何是唯一會改變字的那一軸**，而那是 owner 2026-08-19 明說的裁決
 * （範圍與距離改五級距詞）。引擎沒有那一軸就 ⛔ 不動。
 */
export function placeholderizeAbilityText(
  text: string,
  q: AbilityQuantities,
  opts: ProseRewriteOptions = {},
): ProseRewrite {
  const findings: ProseFinding[] = [];
  let out = text;

  // ── ① 幾何 → 級距詞佔位符 ─────────────────────────────────────────────
  for (const p of GEO_PATTERNS) {
    out = mapOutsideQuotes(out, (seg) =>
      seg.replace(p.re, (...args) => {
        const offset = args[args.length - 2] as number;
        const m = args.slice(0, -2) as unknown as RegExpMatchArray;
        m[0] = args[0] as string;
        const word = q[p.axis];
        if (word === undefined) {
          findings.push({
            rule: "geo-no-engine-value",
            slot: p.axis,
            before: m[0],
            why: `文案寫了${AXIS_LABEL[p.axis]}，但引擎這一軸是空的 —— ⛔ 不換佔位符（換了只會讓一句做不到的宣稱更像真的，第一·五守則）`,
          });
          return m[0];
        }
        const after = p.rewrite(m, `{{${p.axis}}}`, isStandalone(seg, offset, m[0]));
        findings.push({
          rule: "geo-tiered",
          slot: p.axis,
          before: m[0],
          after,
          why: `${AXIS_LABEL[p.axis]}改用級距詞（引擎值 ${q.raw[p.axis] ?? "?"} ⇒ ${word}；⛔ 級距**不是**從文案那個數字算的）`,
        });
        return after;
      }),
    );
  }

  // ── ② 冷卻／耗魔／傷害 → 數字佔位符（只在相等時）─────────────────────
  for (const p of NUM_PATTERNS) {
    out = mapOutsideQuotes(out, (seg) =>
      seg.replace(p.re, (...args) => {
        const groups = args.slice(0, -2) as string[];
        const whole = groups[0]!;
        if (p.reject?.test(whole)) return whole;
        const literal = groups[p.num]!;
        const norm = literal.replace(/\s+/g, "");
        let key = matchSlot(q, p.slot, norm);
        let rule: ProseFindingRule = "num-bound";
        if (key === undefined && (opts.partial ?? "bind") === "bind") {
          const partial = matchAnyRank(q, p.slot, norm);
          if (partial !== undefined) {
            key = partial;
            rule = "num-partial";
          }
        }
        if (key === undefined) {
          findings.push({
            rule: "num-unbound",
            slot: p.slot,
            before: whole.trim(),
            why: `JSON 這一軸是 ${describeSlot(q, p.slot)} —— 卡面這個數字對不上，⛔ 不換佔位符（換了等於無聲改掉玩家看到的字）`,
          });
          return whole;
        }
        const after = groups
          .slice(1)
          .map((g, i) => (i + 1 === p.num ? key : (g ?? "")))
          .join("");
        findings.push({
          rule,
          slot: p.slot,
          before: whole.trim(),
          after: after.trim(),
          why:
            rule === "num-bound"
              ? `${PROSE_SLOT_DOC[p.slot].zh}改由 ${PROSE_SLOT_DOC[p.slot].from} 推導（算繪結果逐位元組相同）`
              : `卡面只印了其中一階（${norm}），JSON 是 ${describeSlot(q, p.slot)} ⇒ 綁上去之後卡面印出整串（owner：傷害/冷卻/耗魔要明確數值，⛔ 不然很難讓玩家判斷取捨）`,
        });
        return after;
      }),
    );
  }
  return { next: out, findings };
}

/** 這串字對得上引擎的哪一格？回傳佔位符（`{{dmg2}}`）或 `undefined`。 */
function matchSlot(q: AbilityQuantities, slot: "cd" | "mp" | "dmg", literal: string): string | undefined {
  if (slot === "dmg") {
    const i = q.forms.dmg.findIndex((fs) => fs.includes(literal));
    return i < 0 ? undefined : i === 0 ? "{{dmg}}" : `{{dmg${i + 1}}}`;
  }
  return q.forms[slot].includes(literal) ? `{{${slot}}}` : undefined;
}

/** 這串字是不是那一軸的**某一階**（多階技能的舊卡面慣例）。 */
function matchAnyRank(q: AbilityQuantities, slot: "cd" | "mp" | "dmg", literal: string): string | undefined {
  if (slot === "dmg") {
    const i = q.ranks.dmg.findIndex((rs) => rs.includes(literal));
    return i < 0 ? undefined : i === 0 ? "{{dmg}}" : `{{dmg${i + 1}}}`;
  }
  return (slot === "cd" ? q.ranks.cd : q.ranks.mp).includes(literal) ? `{{${slot}}}` : undefined;
}

function describeSlot(q: AbilityQuantities, slot: "cd" | "mp" | "dmg"): string {
  if (slot === "dmg") return q.dmg.length > 0 ? q.dmg.join(" / ") : "（效果樹上一發傷害都沒有）";
  return (slot === "cd" ? q.cd : q.mp) ?? "（空）";
}

/* ─────────────────────────────  閘  ────────────────────────────── */

/** 閘上的一處。`rule` 穩定，豁免表用它比對。 */
export interface ProseViolation {
  readonly rule: "hand-typed-number" | "unresolved-placeholder" | "unknown-placeholder";
  readonly slot: string;
  readonly text: string;
  readonly why: string;
}

/**
 * 一支技能的說明上，**還沒被佔位符包住的機制數字**與**解不開的佔位符**。
 *
 * ⭐ 允許留下來的那幾類（⛔ 每一類都要說得出「為什麼它不是級距量」）：
 *   · **持續秒數**、**層數**、**百分比**、**係數**（`+50% [AP]`、`力量*3`）——
 *     它們在 JSON 裡沒有一個**唯一**的住處（散在效果樹的每一片葉子上），
 *     一個序號定址的 `{{dur3}}` 會比手打數字更容易錯。
 *     ⭐ 反駁方式：`descriptionClaims` 的 `duration-absent` 已經在守「持續」
 *     那一半 —— 如果有人量到一支「卡面持續 8 秒、引擎 3 秒」而那條沒紅，
 *     這條理由就被推翻了，該回來把 `{{dur}}` 做出來。
 *   · **台詞裡的數字**（第〇·六守則②）—— 44-04「在35秒後宣布勝利吧」。
 *     ⭐ 反駁方式：把台詞從 `「…」` 裡拿出來，它就會被算成機制數字。
 */
export function proseViolations(
  text: string,
  q: AbilityQuantities,
  live?: LiveValues,
): ProseViolation[] {
  const out: ProseViolation[] = [];
  for (const ph of placeholdersIn(text)) {
    const s = parseSlot(ph.key, ph.index, ph.live);
    if (s === undefined) {
      out.push({
        rule: "unknown-placeholder",
        slot: ph.key,
        text: ph.raw,
        why: `⛔ 不在詞彙裡。合法的是 ${PROSE_SLOT_KEYS.map((k) => `{{${k}}}`).join(" / ")}（只有 ${INDEXED_SLOTS.join(" / ")} 可以帶序號）`,
      });
      continue;
    }
    // ⭐ `{{cd!}}` 問的是**實際值**那一張表，⛔ 不是 `slotValue` —— 引擎有卡面值
    //    ⛔ 不代表那一軸算得出實際值（多數軸刻意算不出來，理由在 `LIVE_RULES`）。
    const resolved = s.live
      ? s.i === 0
        ? live?.[s.slot]
        : undefined
      : slotValue(q, s.slot, s.i);
    if (resolved === undefined) {
      out.push({
        rule: "unresolved-placeholder",
        slot: s.slot,
        text: ph.raw,
        why: s.live
          ? `這一軸沒有**實際值**（見 renderAbilityText.ts 的 LIVE_RULES：多數軸刻意沒有，因為「實際」不是一個單一因子）—— 這個佔位符會**原樣印在卡片上**`
          : `引擎這一軸是空的（${describeSlotAny(q, s.slot)}）—— 這個佔位符會**原樣印在卡片上**`,
      });
    }
  }
  // ⚠️ 掃之前先把**已經是佔位符**的地方遮掉。今天的字樣一條都咬不到 `{{dmg2}}`
  //    裡那個 `2`（後面接的是 `}}` 不是「點」或「+」），但那是**巧合正確** ——
  //    有人加一條新字樣的那天，這一行是唯一擋得住「佔位符被當成手打數字」的東西。
  const { findings } = placeholderizeAbilityText(maskPlaceholders(text), q);
  for (const f of findings) {
    if (f.rule !== "num-bound" && f.rule !== "num-partial" && f.rule !== "geo-tiered") continue;
    out.push({
      rule: "hand-typed-number",
      slot: f.slot,
      text: f.before,
      why: `⛔ 手打的機制數字 —— 改成 ${f.after}（${f.why}）`,
    });
  }
  return out;
}

function describeSlotAny(q: AbilityQuantities, slot: ProseSlotKey): string {
  if (slot === "dmg") return q.dmg.length > 0 ? q.dmg.join(" / ") : "效果樹上一發傷害都沒有";
  return slotValue(q, slot, 0) ?? "空";
}
