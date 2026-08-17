/**
 * itemCardTheme — 道具卡片配色在客戶端的**唯一**一份,由 `ContentDb.load()` 餵。
 *
 * 形狀刻意抄 `render/damagePalette`:一個 module-level 變數 + 一個 `apply*Doc`
 * seam + 逐格防禦。三件事都是有理由的:
 *
 *   · **一份**:四個渲染點(商店 / 三選一 / 裝備欄 hover / 圖鑑)都讀這裡,所以
 *     同一個 `[焚身]` 在四個畫面上不可能是四個顏色。
 *   · **seam**:沒有 `applyItemCardDoc` 這一行,`content/config/item-card.json`
 *     就是一份沒人讀的檔案 —— owner 改了分類、玩家看到的還是舊的
 *     (失敗形態 ②「算出來了但從沒送到」)。`itemCardWiring.test.ts` 斷言的是
 *     那一行**呼叫**,不是那個檔案存在。
 *   · **逐格防禦**:durable overlay 的寫入路徑今天不跑 Zod(#283),所以一個
 *     手滑的 `"紅色"` 會原封不動走到這裡。一格壞掉不該賠掉另外三格。
 */
import {
  DEFAULT_ITEM_CARD,
  DEFAULT_ITEM_ICON_FILL_PCT,
  zConfigItemCardDoc,
  type ConfigItemCardDoc,
  type ItemCardCategory,
} from "@ggd/shared/content";

const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const CATEGORIES: readonly ItemCardCategory[] = ["stat", "active", "passive", "debuff"];

let card: ConfigItemCardDoc = DEFAULT_ITEM_CARD;

function acceptHex(candidate: unknown, fallback: string): string {
  return typeof candidate === "string" && HEX6.test(candidate) ? candidate : fallback;
}

function acceptLabel(candidate: unknown, fallback: string): string {
  return typeof candidate === "string" && candidate.length > 0 && candidate.length <= 12
    ? candidate
    : fallback;
}

function acceptCategory(candidate: unknown, fallback: ItemCardCategory): ItemCardCategory {
  return CATEGORIES.includes(candidate as ItemCardCategory)
    ? (candidate as ItemCardCategory)
    : fallback;
}

/**
 * 圖示佔一格的百分比(#338)。⚠️ 上下界**直接借 Zod 的那一格**,⛔ 不在這裡再抄
 * 一次數字 —— 抄一份就是第二個住處,而第二個住處沒有守衛在守(第零守則)。
 * 那一格是 `.optional()`,所以 `undefined` 也 parse 得過 → 還要確認拿到的
 * 真的是數字,否則就退回缺席時的預設。
 */
const zIconFillPct = zConfigItemCardDoc.shape.iconFillPct;

function acceptPct(candidate: unknown, fallback: number): number {
  const parsed = zIconFillPct.safeParse(candidate);
  return parsed.success && typeof parsed.data === "number" ? parsed.data : fallback;
}

function acceptStrings(candidate: unknown, fallback: readonly string[]): string[] {
  return Array.isArray(candidate) && candidate.every((s) => typeof s === "string" && s.length > 0)
    ? (candidate as string[])
    : [...fallback];
}

/**
 * 吃 `content/config/item-card.json`(或 null —— 檔案不在／schema 不合時,
 * 那是**出貨預設**,不是「沒有配色」)。
 *
 * ⚠️ `markers` 是**整批取代**而不是與出貨值合併。合併的話,owner 從表上刪掉一列
 * 之後那一列還會活著(來自預設),於是「我明明刪了」變成一個查不出來的鬼。
 * 一份合法的 markers 就是完整的那一份。
 */
export function applyItemCardDoc(doc: ConfigItemCardDoc | null | undefined): void {
  const d = doc ?? DEFAULT_ITEM_CARD;
  const S = DEFAULT_ITEM_CARD;
  const markers: Record<string, ItemCardCategory> = {};
  const rawMarkers = d.markers;
  if (rawMarkers && typeof rawMarkers === "object") {
    for (const [k, v] of Object.entries(rawMarkers)) {
      if (CATEGORIES.includes(v as ItemCardCategory)) markers[k] = v as ItemCardCategory;
    }
  }
  card = {
    id: S.id,
    schema: S.schema,
    categories: {
      stat: {
        label: acceptLabel(d.categories?.stat?.label, S.categories.stat.label),
        color: acceptHex(d.categories?.stat?.color, S.categories.stat.color),
      },
      active: {
        label: acceptLabel(d.categories?.active?.label, S.categories.active.label),
        color: acceptHex(d.categories?.active?.color, S.categories.active.color),
      },
      passive: {
        label: acceptLabel(d.categories?.passive?.label, S.categories.passive.label),
        color: acceptHex(d.categories?.passive?.color, S.categories.passive.color),
      },
      debuff: {
        label: acceptLabel(d.categories?.debuff?.label, S.categories.debuff.label),
        color: acceptHex(d.categories?.debuff?.color, S.categories.debuff.color),
      },
    },
    numberColor: acceptHex(d.numberColor, S.numberColor),
    loreColor: acceptHex(d.loreColor, S.loreColor),
    unknownCategory: acceptCategory(d.unknownCategory, S.unknownCategory),
    // 一列都沒過關 = 這份 markers 壞掉了 → 退回出貨表,而不是把每個標記都
    // 丟給 unknownCategory(那會讓整張卡片變成單色,看起來像「功能沒做」)。
    markers: Object.keys(markers).length > 0 ? markers : { ...S.markers },
    inlineValueMarkers: acceptStrings(d.inlineValueMarkers, S.inlineValueMarkers),
    efficacyHeadings: acceptStrings(d.efficacyHeadings, S.efficacyHeadings),
    loreHeadings: acceptStrings(d.loreHeadings, S.loreHeadings),
    // ⚠️ 退路刻意不是 `S.iconFillPct` —— 這一格不住在 DEFAULT_ITEM_CARD 裡
    //(那個物件被 itemCardShipped.test.ts 逐鍵釘死等於出貨 JSON),
    // 它的缺席預設是 config.ts 另外匯出的那個常數。
    iconFillPct: acceptPct(d.iconFillPct, DEFAULT_ITEM_ICON_FILL_PCT),
  };
}

/** 現在生效的那一份(出貨預設,或 `applyItemCardDoc` 餵進來的那一份)。 */
export function getItemCardConfig(): ConfigItemCardDoc {
  return card;
}

/**
 * 道具圖示佔一格的百分比(#338)。100 = 貼齊格子邊。
 *
 * ⚠️ 開一個函式而不是叫呼叫端自己寫 `?? DEFAULT_ITEM_ICON_FILL_PCT`:
 * 缺席時的退路只能有**一個**住處。`applyItemCardDoc` 還沒跑過(或那份 doc
 * 根本沒有這一格)時 `card.iconFillPct` 就是 undefined,而那是常態不是例外 ——
 * 出貨的 item-card.json 今天並沒有寫這一格。
 */
export function itemIconFillPct(): number {
  return card.iconFillPct ?? DEFAULT_ITEM_ICON_FILL_PCT;
}

/** 一個分類的顏色 —— 給不方便拿整份 config 的地方。 */
export function itemCardCategoryColor(c: ItemCardCategory): string {
  return card.categories[c].color;
}
