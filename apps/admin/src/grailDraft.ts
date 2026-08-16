/**
 * 🏆 **聖杯顯現** —— `content/config/arena-rules.json` 的 `grailDraft` 區塊。
 *
 * 為什麼掛在「傳說武器三選一」那一頁而不是自成一頁：那一頁問的問題逐字就是
 * 「**這一場的三選一可以發哪些東西出來**」，而這四格問的是同一件事的另一半
 * （願望那一半）。兩者共用同一份 arena-rules 文件、同一個存檔路徑。
 *
 * ⛔ 四格全部是**決策**不是數值 —— 第一守則說決策點才是 owner 最常改、也最常
 * 被寫死的東西。型別與出貨值住在
 * `@ggd/shared/sim/economy/grailVocabulary` 的 `DEFAULT_GRAIL_DRAFT`，
 * 這裡只有中文標籤與「它影響什麼」，⛔ 不抄第二份預設值。
 */
import { DEFAULT_GRAIL_DRAFT } from "@ggd/shared/sim/economy/grailVocabulary";
import type { GrailDraftRules } from "@ggd/shared/sim/economy/grailVocabulary";

export type GrailDraftField = keyof GrailDraftRules;

/** 這一組的欄位，**順序就是畫面順序**。 */
export const GRAIL_DRAFT_FIELD_ORDER: readonly GrailDraftField[] = [
  "eligibilityEnabled",
  "slotDiversityEnabled",
  "preferenceBonus",
  "legacyPool",
];

/**
 * 出貨值。⛔ **不是**在這裡重打一份 —— 直接引用 sim 端那一份，
 * 所以「三個住處」少掉一個會漂走的抄本（`content/config/arena-rules.json` ·
 * `DEFAULT_GRAIL_DRAFT` · 這裡指向同一個物件）。
 */
export const SHIPPED_GRAIL_DRAFT: Readonly<GrailDraftRules> = Object.freeze({ ...DEFAULT_GRAIL_DRAFT });

/** 鏡射 `zGrailDraftConfig.preferenceBonus` 的上下界。 */
export const PREFERENCE_BONUS_MIN = 1;
export const PREFERENCE_BONUS_MAX = 10;

export interface GrailFieldLabel {
  zh: string;
  /** 它**影響什麼** —— 不是複述欄位名（第一守則）。 */
  note: string;
}

/**
 * EXHAUSTIVE `Record<GrailDraftField, …>` —— schema 多一格就是型別錯誤，
 * 不是悄悄畫出一個沒有說明的輸入框。
 */
export const GRAIL_DRAFT_LABELS: Readonly<Record<GrailDraftField, GrailFieldLabel>> = Object.freeze({
  eligibilityEnabled: {
    zh: "靈基適性條件",
    note:
      "開（出貨）＝ 一張願望的觸發機制你身上沒有，它就不會發給你。" +
      "量到的實例：全 repo 只有 1 支技能產得出【反彈】，所以「成功反彈時⋯」那一族" +
      "對其他英雄是一張整場按不到的卡。關掉 ＝ 每張願望都可能發給任何人（會出現死願望）。",
  },
  slotDiversityEnabled: {
    zh: "三張要有差異",
    note:
      "開（出貨）＝ 顯現時優先湊齊「與你的 build 連動 / 泛用防守 / 改變戰術方向」三種，" +
      "湊不到才照權重補。關掉 ＝ 純照權重抽，三張可能都是同一種玩法。",
  },
  preferenceBonus: {
    zh: "連動加權",
    note:
      "一張願望標了「與現有 build 連動」而你身上真的有那個機制時，它的抽中權重乘幾倍。" +
      "1 ＝ 這一格等於關掉。⚠️ 只乘一次，命中兩個不會乘兩次。",
  },
  legacyPool: {
    zh: "舊增益卡",
    note:
      "舊的 31 張增益卡進不進卡池。「只發聖杯願望」（出貨）的理由是設計規則 §8" +
      "「⛔ 禁止純屬性增益」，而舊池 31 張裡有 16 張是純屬性（含被 §8 逐字點名的" +
      "「破限超頻：攻速上限 4→10」）。⛔ 舊的 JSON 一份都沒有刪，切成「兩批一起發」" +
      "就整批回來。",
  },
});

/** 下拉選項 —— 每一個都寫「玩家會看到什麼」。 */
export const LEGACY_POOL_OPTIONS: readonly { value: GrailDraftRules["legacyPool"]; zh: string; note: string }[] = [
  {
    value: "exclude",
    zh: "只發聖杯願望（出貨值）",
    note: "卡池 = 60 張聖杯願望。舊的 31 張增益卡留在 repo 裡但不會被抽到。",
  },
  {
    value: "include",
    zh: "兩批一起發",
    note: "60 張願望 + 31 張舊增益卡同池加權。⚠️ 舊池 16 張是純屬性，與設計規則 §8 衝突。",
  },
];

/** 這份 arena-rules 文件的 `grailDraft`；讀不到就回出貨值（同 `itemDraft` 的規矩）。 */
export function extractGrailDraft(doc: unknown): GrailDraftRules {
  const block = (doc as { grailDraft?: unknown } | null)?.grailDraft;
  if (block === null || typeof block !== "object") return { ...SHIPPED_GRAIL_DRAFT };
  const b = block as Partial<GrailDraftRules>;
  return {
    eligibilityEnabled: b.eligibilityEnabled ?? SHIPPED_GRAIL_DRAFT.eligibilityEnabled,
    slotDiversityEnabled: b.slotDiversityEnabled ?? SHIPPED_GRAIL_DRAFT.slotDiversityEnabled,
    preferenceBonus: b.preferenceBonus ?? SHIPPED_GRAIL_DRAFT.preferenceBonus,
    legacyPool: b.legacyPool ?? SHIPPED_GRAIL_DRAFT.legacyPool,
  };
}

/**
 * 把這一組接回**整份** arena-rules 文件。
 *
 * ⛔ 同 `patchItemDraft`：存檔一定寫整份，因為 overlay 是**取代**不是合併 ——
 * 只寫這一格會讓 rounds / mobWaves / flowers 全部消失，而畫面上一切正常。
 */
export function patchGrailDraft(doc: Record<string, unknown>, next: GrailDraftRules): Record<string, unknown> {
  return { ...doc, grailDraft: { ...next } };
}

/** 一句話摘要，給頁面標題列用。 */
export function grailDraftSummary(cfg: GrailDraftRules): string {
  const pool = cfg.legacyPool === "exclude" ? "只發聖杯願望" : "願望＋舊增益卡";
  const gate = cfg.eligibilityEnabled ? "靈基適性條件開" : "⚠️ 靈基適性條件關（會出現死願望）";
  const div = cfg.slotDiversityEnabled ? "三張湊差異" : "三張純權重";
  return `${pool} · ${gate} · ${div} · 連動加權 ×${cfg.preferenceBonus}`;
}

/** 這一組哪幾格已經被改離出貨值（畫面上標「已改」用）。 */
export function changedGrailFields(cfg: GrailDraftRules): GrailDraftField[] {
  return GRAIL_DRAFT_FIELD_ORDER.filter((f) => cfg[f] !== SHIPPED_GRAIL_DRAFT[f]);
}
