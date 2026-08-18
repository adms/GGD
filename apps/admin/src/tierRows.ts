/**
 * ⭐ **隨戰況升級的階級表** —— `config.arena-rules@1` 的 `weaponTiers` /
 * `augmentTiers` / `disadvantageWeights`（GH#355）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三個區塊一個檔，因為它們是**同一個機制**
 * ════════════════════════════════════════════════════════════════════════════
 * `sim/economy/weaponTiers.ts` 的 `pickWeaponTable()` 是唯一那支逐階骰的程式，
 * 寶具（`weaponTiers`）與聖杯願望（`augmentTiers`）共用它，而 `disadvantageWeights`
 * 是餵給它的那個劣勢值 `D` 怎麼算。⛔ 拆成三頁會讓操作者以為是三個系統，
 * 於是把「[EX∅ 根源] 抽不到」誤診成獎池問題（那正是 2026-08-18 的實況）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 這裡沒有第二份界，也沒有第二份出貨值
 * ════════════════════════════════════════════════════════════════════════════
 * · 界／型別／選項 ← `configRows.ts` 從**出貨 Zod**（`zWeaponTier` /
 *   `zAugmentTierRule`）走出來
 * · 出貨值 ← 直接引用 `DEFAULT_WEAPON_TIERS` / `DEFAULT_AUGMENT_TIERS` /
 *   `DEFAULT_DISADVANTAGE_WEIGHTS`，⛔ 不抄
 *
 * 手寫的只有**人話**，而 `configRows.test.ts` 斷言「Zod 的每一欄都有一筆」。
 */
import {
  DEFAULT_AUGMENT_TIERS,
  DEFAULT_DISADVANTAGE_WEIGHTS,
  DEFAULT_WEAPON_TIERS,
  zAugmentTierRule,
  zWeaponTier,
  type DisadvantageWeights,
} from "@ggd/shared/content/schema/config";
import type { ConfigRowColumn, ConfigRowsSpec } from "./configRows";

/** 兩張表共用的六欄人話 —— ⛔ 兩份就是兩份會分岔的說明（第零守則⑨）。 */
const SHARED_COLUMNS: Readonly<Record<string, ConfigRowColumn>> = Object.freeze({
  id: {
    zh: "內部 id",
    note: "只有卡片的 tier 標記（`weapon:<id>`）與這一頁看得到它，玩家看不到。改它等於換一階 —— 「每名英雄最多一件」是按 id 記的，所以改名會讓已經拿過的人再拿一次。",
    width: 110,
  },
  label: { zh: "階級名", note: "玩家在三選一卡片上看到的那個字（「EX解放」）。⛔ 它不影響任何機率。", width: 90 },
  minRound: {
    zh: "第幾回合起",
    note: "這一階最早在第幾回合的**商店階段**可能出現。⚠️ 填得比最終回合（第 10 回合）大 = 這一階整場不會出現，而畫面上完全看不出來 —— 它會安靜地讓給下一階。",
    width: 80,
  },
  maxRound: {
    zh: "到第幾回合",
    note: "最後一次可能出現的回合（含）。留白 = 沒有上界。⚠️ 填得比「第幾回合起」小 = 這一階永遠不會中。",
    width: 80,
  },
  basePct: {
    zh: "平手方機率 %",
    note: "劣勢值 D = 0（打平）的玩家抽到這一階的百分比。⛔ 不要填 0：owner 2026-08-17「避免系統看起來像直接補償敗方」—— 領先方也要摸得到，只是機率低。",
    width: 90,
  },
  underdogFactor: {
    zh: "劣勢加權強度",
    note: "最終機率 = 平手方機率 ×（1 + 這個數 × D^曲線）。0 = 劣勢完全不加權。⚠️ 有填「保底門檻」的那一階**不看這一格**（保底走另一條曲線）。",
    width: 100,
  },
  underdogExponent: {
    zh: "劣勢曲線",
    note: "1 = 線性（小輸也馬上補償）；2 = 平方（owner：「讓小幅落後只得到有限補償，真正瀕臨淘汰的隊伍才明顯提高機率」）。⛔ 它和上一格調的不是同一件事，不要合成一個數字。",
    width: 90,
  },
  guaranteeAtD: {
    zh: "劣勢保底門檻",
    note: "劣勢值 D 到這個數以上就**必得**這一階（100%）。留白 = 沒有保底。出貨 [EX∅ 根源] 是 0.6 ⇒ 真的在挨打的隊伍第 10 回合一定拿得到，領先方仍然只有平手方機率。⚠️ 填了之後「劣勢加權強度」那一格就不參與了。",
    width: 100,
  },
  limitScope: {
    zh: "限制算在誰頭上",
    note: "champion = 每名英雄各自計數（出貨）；team = 整隊共用。⚠️ team 在保底路徑上會讓同隊三個座位裡的兩個**靜默拿不到** —— owner 2026-08-18 為此撤掉了根源的 team 限制。",
    optionZh: { champion: "每名英雄", team: "整隊共用" },
    width: 110,
  },
  limitCount: {
    zh: "最多幾件",
    note: "同一個計數範圍內最多拿幾件這一階；達到之後這一階對他不再出現（會讓給下一階）。",
    width: 80,
  },
});

/** ⚔️ 寶具階（`table` 指一張 loot table）。 */
export const WEAPON_TIERS_SPEC: ConfigRowsSpec = {
  path: "weaponTiers",
  zod: zWeaponTier,
  title: "寶具階級升級表",
  intro: [
    "三選一發寶具的那一回合，引擎**由上到下**逐階問「這一回合開放了嗎 × 骰中了嗎 × 這張池對這位玩家還有東西嗎」，第一個全中的就用它；全都沒中就發回合表原本排的那張池。",
    "⭐ 這張表**只會把玩家往上抬**（`pickWeaponTable` 的不可降級規則）：回合表排的池是**地板**，劣勢只會讓你抽到更高階，⛔ 不會把領先方壓低。",
    "⚠️ 「這一階的池」指向 `content/loot-tables/<id>.json`。指到一張不存在或空的池時，引擎會**安靜地讓給下一階** —— 畫面上、日誌裡都看不出來（守衛 `weaponTierTables.test.ts` 在管這件事）。",
    "⚠️ 存檔寫進的是耐久覆蓋層，**它會蓋掉 `content/config/arena-rules.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  columns: Object.freeze({
    ...SHARED_COLUMNS,
    table: {
      zh: "這一階的池",
      note: "`content/loot-tables/<id>.json` 的 id。出貨：[EX解放] → `ex-release-weapons`、[EX∅ 根源] → `ex-origin-weapons`。⚠️ 打錯一個字的後果是這一階**永遠不會中**，而不是任何錯誤訊息。",
      width: 150,
    },
  }),
  blank: {
    id: "new-tier",
    label: "新階",
    table: "ex-release-weapons",
    minRound: 1,
    basePct: 10,
    underdogFactor: 1.5,
    underdogExponent: 1,
    limitScope: "champion",
    limitCount: 1,
  },
  minRows: 0,
  maxRows: 8,
  ordered: true,
};

/** 🏆 聖杯願望階（`table` 是一個 tier 名，不是獎池）。 */
export const AUGMENT_TIERS_SPEC: ConfigRowsSpec = {
  path: "augmentTiers",
  zod: zAugmentTierRule,
  title: "聖杯願望階級升級表",
  intro: [
    "與上面那張**同一個引擎**，只是升級的是「這一回合發哪一個等級的願望」。空表 = 關掉（回合表排什麼就發什麼）。",
    "⭐ 同樣只往上升級：回合表的 `augmentTier` 是**地板**。⛔ `basePct` 不要填 0 —— 領先方也要摸得到高階（owner 2026-08-17）。",
  ],
  columns: Object.freeze({
    ...SHARED_COLUMNS,
    table: {
      zh: "升級到哪一級",
      note: "要發的願望等級。silver ＜ gold ＜ prismatic，⚠️ 只有比回合表排的那一級**更高**才會生效（同級與更低會被不可降級規則跳過）。",
      optionZh: { silver: "白銀", gold: "黃金", prismatic: "稜彩" },
      width: 120,
    },
  }),
  blank: {
    id: "grail-new",
    label: "新階",
    table: "gold",
    minRound: 1,
    basePct: 10,
    underdogFactor: 2,
    underdogExponent: 1,
    limitScope: "champion",
    limitCount: 6,
  },
  minRows: 0,
  maxRows: 8,
  ordered: true,
};

/** 出貨值。⛔ 不抄 —— 指向 schema 那一份。 */
export const SHIPPED_WEAPON_TIERS: readonly Record<string, unknown>[] = DEFAULT_WEAPON_TIERS as unknown as Record<string, unknown>[];
export const SHIPPED_AUGMENT_TIERS: readonly Record<string, unknown>[] = DEFAULT_AUGMENT_TIERS as unknown as Record<string, unknown>[];
export const SHIPPED_DISADVANTAGE_WEIGHTS: Readonly<DisadvantageWeights> = DEFAULT_DISADVANTAGE_WEIGHTS;

// ───────────────────────────────────── 誰算劣勢方（三格純量）─────────────

export type DisadvantageField = keyof DisadvantageWeights;

export const DISADVANTAGE_FIELD_ORDER: readonly DisadvantageField[] = [
  "roundGapPct",
  "itemValueGapPct",
  "recentFormPct",
];

/** EXHAUSTIVE —— schema 多一格就是型別錯誤，⛔ 不是悄悄畫出一個沒說明的框。 */
export const DISADVANTAGE_LABELS: Readonly<Record<DisadvantageField, { zh: string; note: string }>> =
  Object.freeze({
    roundGapPct: {
      zh: "回合／生命差距佔比",
      note: "劣勢值 D 裡「落後幾勝、隊伍血量差多少」佔多少（出貨 50）。⚠️ 三格加起來不必等於 100 —— 引擎會照比例正規化；但把某一格調成 0 等於那個訊號完全不看。",
    },
    itemValueGapPct: {
      zh: "裝備價值差距佔比",
      note: "「已完成裝備的價值差」佔多少（出貨 30）。⭐ owner 2026-08-17 特別要這一項：只看血量的話「容易被**刻意壓血**利用」。",
    },
    recentFormPct: {
      zh: "近三回合勝負佔比",
      note: "最近三回合的勝負差佔多少（出貨 20）。它讓「剛開始輸但已經追回來」的隊伍不會一直吃補償。",
    },
  });

/** 這份文件的 `disadvantageWeights`；讀不到／缺欄位 → 出貨值（同 `readDraftConflict` 的理由）。 */
export function readDisadvantageWeights(doc: unknown): DisadvantageWeights {
  const block = (doc as { disadvantageWeights?: unknown } | null)?.disadvantageWeights;
  if (!block || typeof block !== "object") return { ...SHIPPED_DISADVANTAGE_WEIGHTS };
  const b = block as Partial<DisadvantageWeights>;
  return {
    roundGapPct: b.roundGapPct ?? SHIPPED_DISADVANTAGE_WEIGHTS.roundGapPct,
    itemValueGapPct: b.itemValueGapPct ?? SHIPPED_DISADVANTAGE_WEIGHTS.itemValueGapPct,
    recentFormPct: b.recentFormPct ?? SHIPPED_DISADVANTAGE_WEIGHTS.recentFormPct,
  };
}

/** 逐格驗證。⚠️ 三格**全 0** 要擋：D 會變成常數 0，於是整張階級表只剩 basePct，而畫面上一切正常。 */
export function validateDisadvantage(w: DisadvantageWeights): Partial<Record<DisadvantageField, string>> {
  const errs: Partial<Record<DisadvantageField, string>> = {};
  for (const f of DISADVANTAGE_FIELD_ORDER) {
    const v = w[f];
    if (!Number.isInteger(v)) errs[f] = "要填 0～100 的整數";
    else if (v < 0 || v > 100) errs[f] = "要在 0～100 之間";
  }
  if (Object.keys(errs).length === 0 && DISADVANTAGE_FIELD_ORDER.every((f) => w[f] === 0)) {
    errs.roundGapPct = "三格不可以全部是 0 —— 那會讓劣勢值永遠是 0，劣勢加權與保底整個失效";
  }
  return errs;
}

export function patchDisadvantageWeights(
  doc: Record<string, unknown>,
  w: DisadvantageWeights,
): Record<string, unknown> {
  return { ...doc, disadvantageWeights: { ...w } };
}

/** 一句話摘要：**這一場實際上會發生什麼**。 */
export function disadvantageSummary(w: DisadvantageWeights): string {
  const total = DISADVANTAGE_FIELD_ORDER.reduce((s, f) => s + w[f], 0);
  return `回合/生命 ${w.roundGapPct} · 裝備 ${w.itemValueGapPct} · 近況 ${w.recentFormPct}（合計 ${total}）`;
}
