/**
 * 卡面文案規則 —— **純函式那一半**（GH#461）。
 *
 * owner 2026-08-19：
 * > 「所有**卡面範圍跟距離說明**都應該要跟著改五級距
 * >  （**傷害/冷卻/耗魔要明確數值**不然很難讓玩家判斷取捨）」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這條規則只有**一句話**：一個量的住處，由「引擎會不會再乘它」決定
 *
 * 卡片上每一個數字都有兩個可能的住處：**靜態文案**（`description` 字串）與
 * **結構化欄位**（`cooldown[]` / `rangeTier` / 效果樹）。兩者的差別不是風格，
 * 是**能不能被乘**：文案是烘死的字，欄位是 render 時才算的值。
 *
 * | 量 | 引擎乘什麼 | 唯一住處 | 卡面長相 |
 * |---|---|---|---|
 * | 施法距離 | 級距表 → ×`abilityRange` 0.8 | `rangeTier` | **級距詞** |
 * | 有效半徑 | 級距表 → ×`abilityRange` 0.8 | `radiusTier` | **級距詞** |
 * | 位移／擊退 | 位移級距表 | `distanceTier` | **級距詞** |
 * | 冷卻 | ×`cooldown` 0.2 ×(1−cdr) ×暴走 → 夾地板 | `cooldown[]` | chip 印**實戰秒** |
 * | 耗魔 | ⛔ 不乘 | `manaCost[]` | chip 印數字 |
 * | 傷害 | ×`damageDealt`（今天 1.0） | 效果樹 | **文案**（唯一沒有 chip 的量） |
 * | 持續 | ⛔ 不乘 | 效果樹 `duration` | 文案 |
 *
 * ⇒ **判準（可以當場檢查）：一個數字如果會被 combat-env 乘，它就⛔不可以用靜態
 * 文字當住處。** 文字乘不動，chip 乘得動。這一條同時解掉 owner 點名的那個矛盾
 * （卡面 120 秒 vs 數字欄 24.0s）—— ⛔ 不是靠再補一條正則，是**把量搬回它唯一的
 * 住處**，讓兩個數字不可能不一致（因為只剩一個）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼級距詞的來源是**引擎值**，⛔ 不是文案上那個數字
 *
 * 371 支 w3x 匯入卡的幾何數字是 **w3x 單位**（「範圍1800」「移動3300」），而引擎
 * 是 GGD 單位（決鬥區半徑 24、最大 range 29.33）。那些數字**連單位都不對**，
 * 拿它去查級距表只會產出一個看起來有來源的假答案。
 * ⇒ 級距詞一律從 `rangeTier` / `radiusTier` / `distanceTier`（或它們解析出來的
 *   數字）推導；引擎那一半是空的 ⇒ ⛔ **不改寫**，列給 owner
 *   —— 那是第一·五守則的形狀（卡面說了一個引擎沒有的範圍），
 *   ⛔ 不是一個排版問題，換一個級距詞只會讓那句謊話更像真的。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 兩個 owner 已經裁決過的細則，這裡逐字遵守
 *
 * ① **「…」是角色對白，不是效果**（CLAUDE.md 第〇·六守則②）。所以本檔的每一個
 *    改寫都走 {@link mapOutsideQuotes} —— 台詞**一個字都不動**，⛔ 也不會被讀成
 *    一個要改寫的數字（44-04「在35秒後宣布勝利吧」曾被讀成一支有時序的技能）。
 * ② **極大與極小是「卡上下限的例外」，⛔ 不是線性規則的一部分**（owner 2026-08-19）。
 *    所以本檔⛔不自己做線性內插 —— 級距一律交給 `skillTiers.ts` 的
 *    `snapToTier`（「離哪一根橫木近就是哪一根」），兩端自然就是兩端。
 *
 * ⚠️ 還有一個**級距表本身管不到的上界**：引擎值 ≥ 決鬥區半徑時，語意是「**全場**」
 *    而不是任何一級（86-00 裝可愛 radius 24、30-00 攝影機 range 29.33）。
 *    「極大」＝ R/2 ＝ 12 會把「全場」縮寫成一半，所以那些寫 `WHOLE_ZONE_WORD`。
 */
import {
  snapToTier,
  type SkillTierName,
} from "../../packages/shared/src/content/skillTiers";

/** 引擎值 ≥ 決鬥區半徑時卡面寫的字。⛔ 不是級距詞 —— 級距最大只到 R/2。 */
export const WHOLE_ZONE_WORD = "全場";

/** 卡面上一個幾何量的級距詞，或「全場」。 */
export type TierWord = SkillTierName | typeof WHOLE_ZONE_WORD;

/** 幾何軸。四軸各自有自己的級距表（`skillTiers.ts` 的三個視窗）。 */
export type GeoAxis = "range" | "radius" | "travel" | "push";

/**
 * 一支技能上**引擎真的有的**幾何量，已經翻成級距詞。
 * `undefined` = 引擎沒有這一軸 ⇒ 文案上那個數字沒有對應物 ⇒ ⛔ 不改寫。
 */
export interface EngineGeo {
  readonly range?: TierWord;
  readonly radius?: TierWord;
  readonly travel?: TierWord;
  readonly push?: TierWord;
  /**
   * 級距詞背後那個引擎值（GGD 單位）。⭐ 只進報表訊息 —— 有它，
   * 「卡面寫 6 但引擎是 4.5」這種**同單位**的落差才看得見
   * （79-00 靈壓就是這樣被抓到的），⛔ 不必再開一支對帳腳本。
   */
  readonly raw?: Partial<Record<GeoAxis, number>>;
}

/** 一處改寫（或一處「不敢改」）。 */
export interface ProseFinding {
  /** 規則代號（穩定，報表分組用它） */
  readonly rule:
    | "geo-tiered"
    | "geo-no-engine-value"
    | "cooldown-removed"
    | "mana-removed";
  /** 原文片段 */
  readonly before: string;
  /** 改成什麼；`geo-no-engine-value` 沒有 */
  readonly after?: string;
  /** 為什麼 */
  readonly why: string;
}

export interface RuleOptions {
  /**
   * 冷卻／耗魔要不要從文案移除。⭐ **決策點，所以它是一格旗標而不是寫死的選擇**
   * （第一守則）。預設 `strip` —— 照第〇·六守則，優先權大的那一邊預設啟動。
   */
  readonly numbersPolicy?: "strip" | "keep";
}

export interface RuleResult {
  readonly next: string;
  readonly findings: readonly ProseFinding[];
}

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * 對**台詞以外**的每一段套用 `f`，`「…」` 原封不動送回去。
 * ⚠️ 整段（含跨行、含行中），與 `descriptionClaims.mechanicsText` /
 * `batch1.py::_mechanics_text()` 逐字同構 —— 差別只在那兩支是**刪掉**台詞，
 * 這一支要**保留**它，因為輸出是要寫回卡片的。
 */
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
 * ⛔ **不可以被改寫的兩種段落。**
 *
 * ① `「…」` —— 角色對白（第〇·六守則②）。
 * ② `（GGD 註記 …）` —— 那是**當初為什麼這樣做**的紀錄（GH#310/#373 的逐句對照
 *    就住在裡面）。機械改寫它＝把一份歷史紀錄改成看起來像現在的樣子，
 *    與「被取代的知識要另存，⛔ 不可以無聲消失」是同一條規矩。
 *    ⇒ 註記要不要跟著更新是**人**的決定，⛔ 不是正則的。
 */
const PROTECTED_RE = /「[^」]*」|（GGD 註記[\s\S]*?(?=\n\n|$)/gs;

/**
 * 一個數字，**而且必須整個吃完**。
 *
 * ⚠️ 尾巴那個 `(?![\d.])` 不是裝飾，它擋的是**回溯**造成的假匹配 —— 這是本檔
 * 第一版真的踩到的兩個誤報，而且兩個都長得像真的：
 *   · 「加速**移動1.5倍**」→ 貪婪吃到 `1.5`、被「不是倍」的 lookahead 擋下來，
 *     於是回溯成 `1`，後面是 `.` 不是「倍」⇒ 誤判出一個「移動1」的位移
 *   · 「**範圍1200點傷害**」→ 同一個形狀，回溯成 `120` ⇒ 把一發傷害讀成一個範圍
 * ⇒ 任何「數字後面不可以接 X」的 lookahead，都要先把數字**釘死**，否則那條
 *   lookahead 只是把匹配往左推一位，⛔ 不是拒絕它。
 */
const N = String.raw`\d+(?:\.\d+)?(?![\d.])`;

/**
 * 幾何字樣。⚠️ **順序就是優先序** —— `施法距離N` 必須在裸的 `距離N` 之前，
 * 否則後者會把前者切一半。
 *
 * ⛔ 每一條都刻意保守（寧可漏報）。已經量到的三種誤報，各有一條防線：
 *   · 「大**範圍**2500點傷害」（38-002）→ `範圍N` 加上「後面不是傷害」的 lookahead
 *   · 「加速**移動**1.5倍」（21-01）  → `移動N` 加上「後面不是倍/%」的 lookahead
 *   · 「**距離**550交叉在X中」（08-04）→ 裸 `距離N` 走 `range` 軸，引擎沒有就不改
 */
interface GeoPattern {
  readonly axis: GeoAxis;
  readonly re: RegExp;
  /**
   * 把整個 match 換成帶級距詞的寫法。
   *
   * ⚠️ `standalone` = 這一處**自己佔滿一整行**（＝規格區塊那幾行，例如
   * `施法距離14`）。它與行內出現的同一個字樣要寫成**不同的樣子**：
   *   規格行 → `施法距離：中`（有冒號，是一格欄位）
   *   行 內 → `中範圍內的敵人`（沒有冒號，是一句話）
   * ⛔ 兩者共用一個寫法會產出「範圍：全場 內的敵人」這種句子 —— 那是這支腳本
   *   第一版真的產出來的東西。
   */
  readonly rewrite: (m: RegExpMatchArray, tier: TierWord, standalone: boolean) => string;
}

const GEO_PATTERNS: readonly GeoPattern[] = [
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
function isStandalone(seg: string, offset: number, match: string): boolean {
  const from = seg.lastIndexOf("\n", offset) + 1;
  const to = seg.indexOf("\n", offset);
  const line = seg.slice(from, to === -1 ? seg.length : to);
  return line.trim() === match.trim();
}

const AXIS_LABEL: Record<GeoAxis, string> = {
  range: "施法距離",
  radius: "有效半徑",
  travel: "位移距離",
  push: "擊退距離",
};

/**
 * 冷卻／耗魔字樣。⚠️ 兩條**都**要吃得下逐階斜線串（`60/50/40/30秒冷卻`、
 * `消耗MP150/250/350/450`）—— 那正是 client 的 `rescaleAbilityProse` 認不得、
 * 於是今天就在卡面上說謊的兩支（13-01 / 44-03）。
 *
 * ⛔ 刻意**不**吃「冷卻縮短50%」「冷卻立即重置」—— 那是機制不是規格欄，
 * 兩條規則都要求數字後面直接接「秒」。
 */
const COOLDOWN_RE = new RegExp(
  [
    String.raw`${N}(?:\s*/\s*${N})*\s*秒\s*冷卻(?:時間)?`,
    String.raw`冷卻(?:時間)?\s*[:：]?\s*${N}(?:\s*/\s*${N})*\s*秒`,
  ].join("|"),
  "g",
);
const MANA_UNIT = String.raw`(?:\[MP]|MP|魔力|法力)`;
/**
 * ⚠️ 單位在**前或後**都可以，但⛔**不可以兩邊都沒有** —— 一條允許
 * 「消耗 N」裸寫的規則會把「消耗 100 點**生命**」也吃掉。
 */
const MANA_RE = new RegExp(
  [
    String.raw`(?:消耗|花費|耗)\s*${MANA_UNIT}\s*[:：]?\s*${N}(?:\s*/\s*${N})*\s*(?:點)?`,
    String.raw`(?:消耗|花費|耗)\s*${N}(?:\s*/\s*${N})*\s*(?:點)?\s*${MANA_UNIT}`,
  ].join("|"),
  "g",
);

/**
 * 拿掉的段落先留一顆**哨兵**，⛔ 不是直接刪成空字串。
 *
 * ⚠️ 直接刪會把「一整行只有這一段」的規格行變成**一行空白**，於是
 * `[主動][範圍][AP加成]` 與 `有效半徑：中` 中間憑空多一行 —— 那是這支腳本
 * 第一版真的產出來的版面。有哨兵才分得出「這一行是被清空的（整行拿掉）」
 * 與「這一行本來就是空的（版面的一部分，要留）」。
 */
const SENTINEL = "\u0000";

/**
 * 哨兵**連同它旁邊那一個分隔符號**一起消失。
 *
 * ⚠️ 只清行首行尾是不夠的 —— `[變身] 冷卻 60 秒 · 花費 390 法力 · 持續 20 秒`
 * 拿掉中間兩段之後留下 `[變身] · · 持續 20 秒`，而那兩顆孤兒點在**行中間**。
 * 先吃右邊的分隔符（列表前段被拿掉），再吃左邊的（列表末段被拿掉）。
 */
const absorbSeparators = (s: string): string =>
  s
    .replace(new RegExp(`${SENTINEL}\\s*[·・,，、]\\s*`, "g"), "")
    .replace(new RegExp(`\\s*[·・,，、]\\s*${SENTINEL}`, "g"), SENTINEL);

/** 收尾：把哨兵那幾行整行拿掉，並清掉留下來的孤兒標點。 */
function tidy(text: string): string {
  const kept: string[] = [];
  for (const line of absorbSeparators(text).split("\n")) {
    if (!line.includes(SENTINEL)) {
      kept.push(line);
      continue;
    }
    const rest = line
      .split(SENTINEL)
      .join("")
      .replace(/^[\s，,、。·・]+/, "")
      .replace(/[\s，,、·・]+$/, "")
      .replace(/\s*·\s*·\s*/g, " · ");
    // 整行都是被拿掉的東西 ⇒ 整行消失；還有殘句 ⇒ 留下清乾淨的殘句
    if (rest !== "") kept.push(rest);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * 把規則套到一段卡面文案上。
 *
 * @param desc  原文（含台詞、含標籤列）
 * @param geo   引擎真的有的幾何量，已翻成級距詞
 */
export function applyCardProseRule(
  desc: string,
  geo: EngineGeo,
  opts: RuleOptions = {},
): RuleResult {
  const findings: ProseFinding[] = [];
  let out = desc;

  // ── ① 幾何 → 級距詞 ────────────────────────────────────────────────────
  for (const p of GEO_PATTERNS) {
    out = mapOutsideQuotes(out, (seg) =>
      seg.replace(p.re, (...args) => {
        const offset = args[args.length - 2] as number;
        const m = args.slice(0, -2) as unknown as RegExpMatchArray;
        m[0] = args[0] as string;
        const solo = isStandalone(seg, offset, m[0]);
        const tier = geo[p.axis];
        if (tier === undefined) {
          findings.push({
            rule: "geo-no-engine-value",
            before: m[0],
            why: `文案寫了${AXIS_LABEL[p.axis]}，但引擎這一軸是空的 —— ⛔ 不自動換級距詞（換了只會讓一句做不到的宣稱更像真的，見第一·五守則）`,
          });
          return m[0];
        }
        const after = p.rewrite(m, tier, solo);
        const engineValue = geo.raw?.[p.axis];
        findings.push({
          rule: "geo-tiered",
          before: m[0],
          after,
          why: `${AXIS_LABEL[p.axis]}改用級距詞（引擎值 ${engineValue ?? "?"} ⇒ ${tier}；⛔ 級距**不是**從文案那個數字算的）`,
        });
        return after;
      }),
    );
  }

  // ── ② 冷卻／耗魔 → 移出文案 ────────────────────────────────────────────
  if ((opts.numbersPolicy ?? "strip") === "strip") {
    for (const [re, rule, why] of [
      [
        COOLDOWN_RE,
        "cooldown-removed" as const,
        "冷卻會被 combatEnv.cooldown 乘 ⇒ ⛔ 不可以住在靜態文字裡；卡面由 chip 從 cooldown[] 印實戰秒",
      ],
      [
        MANA_RE,
        "mana-removed" as const,
        "耗魔的唯一住處是 manaCost[]；文案再寫一份就是第二個住處，而它沒有守衛",
      ],
    ] as const) {
      out = mapOutsideQuotes(out, (seg) =>
        seg.replace(re, (m: string) => {
          findings.push({ rule, before: m.trimEnd(), why });
          // ⚠️ 換行**要還回去**：規格區塊的 `\s*` 會把行尾那個 `\n` 一起吃掉，
          //   吞了它就會把下一行黏上來（`消耗MP…` 吃掉換行後 `施法距離14` 上移）。
          return SENTINEL + (/\n+$/.exec(m)?.[0] ?? "");
        }),
      );
    }
    out = tidy(out);
  }

  return { next: out, findings };
}

/**
 * 一個引擎幾何值 → 級距詞。⭐ 超過決鬥區半徑就是「全場」，⛔ 不是「極大」。
 *
 * @param value      引擎值（GGD 單位）
 * @param table      那一軸的級距表
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
