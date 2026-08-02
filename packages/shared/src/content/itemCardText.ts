/**
 * itemCardText — 把 owner 手寫的道具 description **解析**成可排版的 token,
 * 一個字都不改原文。純函式、零 DOM、零 React,在 node 直接測。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼是「渲染時解析」而不是「把文案改成結構化欄位」
 *
 * owner 2026-08-01 交來 49 支傳說武器,那些 description **就是規格**,而且
 * `legendary49OwnerText.test.ts` 逐位元組比對它們。所以任何「把 `[焚身]` 拆成
 * 一個 tag 欄位」的做法都會撞上那條守衛,而且是對的 —— 文案是 owner 的東西。
 *
 * 於是排版只能發生在渲染的那一刻:這個模組吃一段原文,吐出 token 陣列
 * (純文字 / 標籤 / 數值),由四個渲染點各自上色與斷行。原文原封不動。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 的抱怨是「連在一起不好閱讀」,所以斷行和上色一樣重要
 *
 * 在這個模組之前,商店那一列走的是 `apps/client/src/ui/panels/itemStats.effectLine`,
 * 它把效能區**每一行用 ` · ` 接成一整條**。黃金聖鬥衣五行效能會變成一條 60 字
 * 的長句,而那正是 owner 講的那個畫面。這裡的 `parseItemCard` 保留行,不接。
 *
 * 分段規則(對 49 支實測出來的,不是猜的):
 *   1. 第一行如果**不含數字、不含 `[`、也不是段落標題**,那是稀有度徽章
 *      (傳說 / 夢幻 / 神器 / 任務 / 積分獎勵 / 作者威能超神器…)。
 *      ⚠️ 刻意**不用白名單**:49 支裡有 `作者威能超神器` 這種一次性的字,白名單
 *      一定漏(`itemStats.RARITY_WORDS` 就漏了它)。判準是形狀,不是字典。
 *   2. `效能` / `效能：` 開一個效果區;`解說` / `歷史` 開一個解說區。
 *      ⚠️ 比對前先去掉結尾的全形/半形冒號 —— 狂暴軒轅劍(godie-i02e)寫的是
 *      `效能：`,而 `歷史` 是它拿來代替 `解說` 的標題。兩個都真的存在。
 *   3. 沒有任何標題的內文(死之王的意志 godie-i060 根本沒寫 `效能`)算效果區 ——
 *      對玩家而言「沒標題的機制描述」還是機制描述。
 *   4. 空行只是分隔,不進任何一區。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 數值 token 的形狀(逐一對著 49 支的原文列出來的)
 *
 *   `攻擊力+87`      → 文字「攻擊力」 + 數值「+87」
 *   `攻擊速度+30%`   → 文字 + 數值「+30%」
 *   `總移動速度*1.2` → 文字 + 數值「*1.2」
 *   `總生命-50%`     → 文字 + 數值「-50%」
 *   `7%機率`         → 數值「7%」 + 文字「機率」
 *   `冷卻1秒`        → 文字「冷卻」 + 數值「1秒」
 *   `持續0.6秒`      → 文字 + 數值「0.6秒」
 *   `10-1000 傷害`   → 數值「10-1000」 + 文字
 *   `(0~100)`        → 文字「(」 + 數值「0~100」 + 文字「)」
 *   `魔抗+66.7%`     → 文字 + 數值「+66.7%」
 *   `上限 160`       → 文字 + 數值「160」
 *
 * 單位只收 `%`/`％`/`秒`/`點`/`倍`/`層`/`金`,**不收「距離」「傷害」那種名詞** ——
 * 那些是句子的一部分,吞進數值 token 只會讓一整句話變成一坨黃色。
 */
import type { ConfigItemCardDoc, ItemCardCategory } from "./schema/config";
import { DEFAULT_ITEM_CARD } from "./schema/config";

/** 一段 description 拆出來的最小單位。 */
export type ItemCardToken =
  /** 一般文字,照原色畫。 */
  | { readonly kind: "text"; readonly text: string }
  /** `[xx]` 關鍵字標記,畫成分類色的 chip。`text` 是**方括號裡的原字**。 */
  | { readonly kind: "tag"; readonly text: string; readonly category: ItemCardCategory }
  /** 數值(含 `[...]` 裡的內嵌數值),畫成 `numberColor`。 */
  | { readonly kind: "num"; readonly text: string };

/** 效果區的一行 —— 保留成一行,就是 owner 要的「不要連在一起」。 */
export interface ItemCardLine {
  readonly tokens: readonly ItemCardToken[];
}

/** 一整張卡片的可排版結構。 */
export interface ItemCard {
  /** 稀有度徽章(`傳說` / `夢幻` / `作者威能超神器`…),沒有就是 null。 */
  readonly rarity: string | null;
  /** 效能區,**一行一列**。 */
  readonly efficacy: readonly ItemCardLine[];
  /** 解說區用的標題原字(`解說` / `歷史`),沒有就是 null。 */
  readonly loreHeading: string | null;
  /** 解說區的段落,一行一段;不解析數值(那是散文,不是規格)。 */
  readonly lore: readonly string[];
}

/** 去掉結尾的全形/半形冒號 —— `效能：` 與 `效能` 是同一個標題。 */
function stripHeadingColon(line: string): string {
  return line.replace(/[：:]\s*$/, "");
}

/**
 * 數值字面值。四段:
 *   ① 前置符號 `+ ＋ - − * ×`(可有可無)。原稿裡符號與數字之間**會有空白**
 *      (`AP + 87`、`MP + 600`、`總 AP 額外 + 100%`),所以空白收在符號那一組裡。
 *   ② 數字(整數或小數)。
 *   ③ 區間 `-` / `~` / `～` / `–` 接第二個數字(可有可無):`10-1000`、`0~100`。
 *   ④ 單位 `% ％ 秒 點 倍 層 金`(可有可無)。原稿裡數字與單位之間也會有空白
 *      (`冷卻 8 秒`),所以空白收在單位那一組裡。
 *
 * ⚠️ 每一段的空白都必須寫在**該段自己的 optional group 內**。寫成
 * `…\d+\s*(?:%|秒)?` 會出事:`\s*` 貪婪吃掉空白之後,可選的單位比對空字串也算成功,
 * 於是 `衝刺 4.5 距離` 的數值 token 變成 `"4.5 "` —— 尾巴多一個空白,畫面上那個
 * 空白會被塗成數值色,而「距離」兩個字卻不是。這是實測抓到的,不是假想。
 *
 * `\d` 只吃半形阿拉伯數字;掃過 49 支,原文裡沒有全形數字。
 */
const NUMBER_RE =
  /(?:[+＋\-−*×]\s*)?\d+(?:\.\d+)?(?:\s*[~～\-–]\s*\d+(?:\.\d+)?)?(?:\s*(?:%|％|秒|點|倍|層|金))?/g;

/** `[xx]` 標記。非貪婪、不允許巢狀(原文沒有巢狀)。 */
const TAG_RE = /\[([^\]]+)\]/g;

/**
 * 把一段**不含 `[` 的**文字切成 text / num token。
 * 空字串回空陣列(呼叫端就不會畫出一個空 span)。
 */
export function tokenizeValues(s: string): ItemCardToken[] {
  const out: ItemCardToken[] = [];
  let last = 0;
  NUMBER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUMBER_RE.exec(s)) !== null) {
    // 一個「只有符號沒有數字」的比對不可能發生(②是必要的),但零長度比對會無限
    // 迴圈,所以還是擋一下。
    if (m[0].length === 0) {
      NUMBER_RE.lastIndex++;
      continue;
    }
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    out.push({ kind: "num", text: m[0] });
    last = NUMBER_RE.lastIndex;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  return out;
}

/**
 * 把一整行切成 token:先切 `[標記]`,標記以外的部分再切數值。
 *
 * `[...]` 裡的字有兩種命運,由 config 決定,不是由這裡猜:
 *   · 在 `inlineValueMarkers` 上 → 它其實是一個內嵌數值(虛哭神去的
 *     `[自身已損失的生命百分比數值(0~100)]`),整段當 `num` 畫,不畫成 chip。
 *   · 其餘 → `tag`,分類查 `markers`,查不到落到 `unknownCategory`(卡片不會壞)。
 */
export function tokenizeCardLine(
  line: string,
  cfg: ConfigItemCardDoc = DEFAULT_ITEM_CARD,
): ItemCardToken[] {
  const inlineValues = new Set(cfg.inlineValueMarkers);
  const out: ItemCardToken[] = [];
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(line)) !== null) {
    if (m.index > last) out.push(...tokenizeValues(line.slice(last, m.index)));
    const inner = m[1]!;
    if (inlineValues.has(inner)) {
      out.push({ kind: "num", text: inner });
    } else {
      out.push({
        kind: "tag",
        text: inner,
        category: cfg.markers[inner] ?? cfg.unknownCategory,
      });
    }
    last = TAG_RE.lastIndex;
  }
  if (last < line.length) out.push(...tokenizeValues(line.slice(last)));
  return out;
}

/** 這一行是不是稀有度徽章 —— 判形狀,不查字典(見檔頭規則 1)。 */
function looksLikeRarity(line: string): boolean {
  return line.length > 0 && line.length <= 10 && !/[[\]\d]/.test(line);
}

/**
 * 把一段 description 解析成可排版的卡片結構。原文一個字都不動。
 *
 * 空 / 未定義的 description 回一張空卡(rarity null、零行),呼叫端就不必分支。
 */
export function parseItemCard(
  desc: string | null | undefined,
  cfg: ConfigItemCardDoc = DEFAULT_ITEM_CARD,
): ItemCard {
  const efficacyHeads = new Set(cfg.efficacyHeadings);
  const loreHeads = new Set(cfg.loreHeadings);
  const lines = (desc ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let rarity: string | null = null;
  let start = 0;
  if (lines.length > 0) {
    const first = stripHeadingColon(lines[0]!);
    // 標題本身不是稀有度(死之王的意志沒有稀有度行,第一行直接是 `傳說`… 但那
    // 個「傳說」確實是稀有度;真正要擋的是第一行就寫 `效能` 的文件)。
    if (!efficacyHeads.has(first) && !loreHeads.has(first) && looksLikeRarity(lines[0]!)) {
      rarity = lines[0]!;
      start = 1;
    }
  }

  const efficacy: ItemCardLine[] = [];
  const lore: string[] = [];
  let loreHeading: string | null = null;
  let mode: "efficacy" | "lore" = "efficacy";
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i]!;
    const head = stripHeadingColon(raw);
    if (efficacyHeads.has(head)) {
      mode = "efficacy";
      continue;
    }
    if (loreHeads.has(head)) {
      mode = "lore";
      loreHeading = head;
      continue;
    }
    if (mode === "lore") lore.push(raw);
    else efficacy.push({ tokens: tokenizeCardLine(raw, cfg) });
  }
  return { rarity, efficacy, loreHeading, lore };
}

/**
 * 這張卡片上出現過的分類,依 `stat → active → passive → debuff` 固定順序。
 * 給卡片頂端那排分類圖例用 —— 順序固定,所以同一張卡在四個介面上長得一樣。
 */
export const ITEM_CARD_CATEGORY_ORDER: readonly ItemCardCategory[] = [
  "stat",
  "active",
  "passive",
  "debuff",
];

/** 這張卡用到的分類(去重、固定順序)。 */
export function itemCardCategories(card: ItemCard): ItemCardCategory[] {
  const seen = new Set<ItemCardCategory>();
  for (const line of card.efficacy) {
    for (const t of line.tokens) if (t.kind === "tag") seen.add(t.category);
  }
  return ITEM_CARD_CATEGORY_ORDER.filter((c) => seen.has(c));
}

/**
 * 純文字回退 —— 給 `aria-label` 這種只吃字串的地方。
 *
 * ⚠️ 它把效果區用換行接起來,**不是** ` · `。這一點是刻意的:無障礙標籤和畫面
 * 上讀到的東西必須是同一組行,否則螢幕閱讀器聽到的是另一份排版。
 */
export function itemCardPlainText(card: ItemCard): string {
  const rows = card.efficacy.map((l) => l.tokens.map((t) => t.text).join(""));
  return rows.join("\n");
}
