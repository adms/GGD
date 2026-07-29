/**
 * 變身外觀 (form visuals) — 後台 → 變身外觀 的純邏輯 (task #249 / GH#288).
 *
 * ---------------------------------------------------------------------------
 * 這一頁在調什麼
 * ---------------------------------------------------------------------------
 * 26 對變身裡有 21 對 base 與 alternate **共用同一個 modelKey**,悟空(09) 與
 * Saber(20) 都在裡面。換句話說「換模型」對它們不成立,能讓玩家看出變身的只有
 * 三樣:顏色、大小、球體掛件。這一頁就是那三樣的唯一入口。
 *
 * ⚠️ **顏色與大小多半不是 w3x 抄來的**。悟空/Saber 兩對的 `uclr/uclg/uclb` 與
 * `usca` 在 `war3map.w3u` 裡兩半完全相同,`war3map.j` 也沒有對應的
 * `SetUnitVertexColor` —— 照抄的話變身在畫面上是零差異。所以這些是**美術決定**,
 * 出貨值只是一個起點,owner 想怎麼調就怎麼調。球體掛件那一欄則是真的 w3x 事實
 * (悟空 `A0MI` → `A0MJ`,`Gokuhead.mdx` → `Goku3head.mdx`)。
 *
 * ⚠️ **只有變身態(Emeu)那一半可以填**。`resolveFormVisual` 的第一道關卡是
 * `isAlternateForm`,所以就算後台把基本型寫進去,遊戲也不會採用 ——
 * 「基本型悟空不可以長出超三的頭」是資料層的性質,不是這一頁記得擋。
 * 這一頁連讓人填基本型的欄位都不生成。
 *
 * 寫入走 durable content overlay(和 體素身體 / 基礎加成 同一條路),因為那是
 * 唯一撐得過 `docker compose build` 的可寫表面。
 */
import {
  CHAMPION_FORM_PAIRS,
  FORM_VISUAL_BOUNDS,
  authoredFormVisual,
  resolveFormVisual,
  type FormVisual,
} from "@ggd/shared/content";
import {
  DEFAULT_FORM_VISUALS,
  type ConfigFormVisualsDoc,
  type FormVisualEntry,
} from "@ggd/shared/content/schema/config";

/** The `config` collection doc the console writes through the durable overlay. */
export const FORM_VISUALS_COLLECTION = "config";
export const FORM_VISUALS_DOC_ID = "form-visuals";
export const FORM_VISUALS_SCHEMA = "config.form-visuals@1";

/**
 * 出貨值 —— 面板的「預設」欄與「還原出貨版」讀的都是它。
 *
 * 刻意 **不是** 在這裡另寫一份 `SHIPPED_*` 常數:mobWaves 那一頁的教訓是
 * 兩份手抄的數字一定會 drift,而這份的權威副本已經在 shared(Zod 旁邊)了。
 * `formVisuals.test.ts` 仍然把它對 `content/config/form-visuals.json` 逐欄比對。
 */
export const SHIPPED_FORM_VISUALS: ConfigFormVisualsDoc = DEFAULT_FORM_VISUALS;

/** 全域旋鈕的四個 key —— 順序就是面板上的順序。 */
export const FORM_VISUAL_GLOBAL_FIELDS = [
  "enabled",
  "tintStrength",
  "scaleStrength",
  "attachmentsEnabled",
] as const;
export type FormVisualGlobalField = (typeof FORM_VISUAL_GLOBAL_FIELDS)[number];

/** 每一列可編輯的欄位 —— 順序就是面板上的順序。 */
export const FORM_VISUAL_ROW_FIELDS = [
  "tintR",
  "tintG",
  "tintB",
  "scaleMult",
  "attachModelKey",
  "attachBone",
  "attachScale",
  "attachOffsetY",
] as const;
export type FormVisualRowField = (typeof FORM_VISUAL_ROW_FIELDS)[number];

export const FORM_VISUAL_GLOBAL_LABEL: Record<FormVisualGlobalField, string> = {
  enabled: "總開關",
  tintStrength: "顏色濃度",
  scaleStrength: "大小濃度",
  attachmentsEnabled: "球體掛件",
};

export const FORM_VISUAL_GLOBAL_HINT: Record<FormVisualGlobalField, string> = {
  enabled: "關掉之後變身完全不改外觀（模型、顏色、大小、掛件都維持本體）",
  tintStrength: "0 = 不上色，1 = 完全照下表的顏色。插的是「離白色多遠」，所以 0 是關掉、不是變黑",
  scaleStrength: "0 = 不縮放，1 = 完全照下表的倍率。插的是「離 1.0 多遠」",
  attachmentsEnabled: "球體掛件要多載一顆 glb；低階機器可以只留顏色與大小",
};

export const FORM_VISUAL_ROW_LABEL: Record<FormVisualRowField, string> = {
  tintR: "紅",
  tintG: "綠",
  tintB: "藍",
  scaleMult: "大小倍率",
  attachModelKey: "球體模型",
  attachBone: "掛點",
  attachScale: "掛件縮放",
  attachOffsetY: "掛件高度",
};

export const FORM_VISUAL_ROW_HINT: Record<FormVisualRowField, string> = {
  tintR: "乘在材質上，1 = 不變、>1 打亮、<1 壓暗",
  tintG: "乘在材質上，1 = 不變",
  tintB: "乘在材質上，1 = 不變",
  scaleMult: "疊在身高正規化之上；1 = 和本體一樣高",
  attachModelKey: "models/ 的文件 id，例如 imported.goku3head。留白 = 沒有掛件",
  attachBone: "origin = 模型原點（w3x 對悟空兩顆球體記的就是這個）；其他值當骨頭名",
  attachScale: "把掛件的轉檔倍率換算回本體座標系；悟空是 0.3221",
  attachOffsetY: "沿 Y 微調；0 = 用 mdx 自己烘的高度",
};

/** 面板上一列 = 一個變身態。 */
export interface FormVisualRow {
  /** 變身態(Emeu)的 championId —— 這一列的 key */
  readonly alternateId: string;
  /** 基本型(Eme1)的 championId,只拿來顯示「誰變的」 */
  readonly baseId: string;
  readonly heroNumber: string;
  /** 觸發變身的技能名(w3a),例:「09-03 超級賽亞人」 */
  readonly abilityName: string;
  /** 操作者填的那一格(還沒填 = null) */
  readonly authored: FormVisualEntry | null;
  /** 出貨值(沒有出貨值 = null) */
  readonly shipped: FormVisualEntry | null;
  /** 套完全域濃度、算完中性化之後,遊戲**真的**會用的那個東西 */
  readonly effective: FormVisual | null;
}

/** 讀 API 回來的東西;schema 不對就當沒讀到(不會把 combat-env 當顏色表讀)。 */
export function extractFormVisuals(doc: unknown): ConfigFormVisualsDoc | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as { schema?: unknown };
  if (d.schema !== FORM_VISUALS_SCHEMA) return null;
  return doc as ConfigFormVisualsDoc;
}

/**
 * 26 列,依 w3x 英雄編號排序 —— 和 `CHAMPION_FORM_PAIRS` 同一個順序。
 *
 * **不是**只列出貨表裡有的那兩隻:剩下 24 對隨時可以被 owner 點亮,而一個
 * 「只有已經做過的才看得到」的面板等於把功能鎖在改程式碼上。
 */
export function formVisualRows(doc: ConfigFormVisualsDoc | null): FormVisualRow[] {
  return CHAMPION_FORM_PAIRS.map((p) => ({
    alternateId: p.alternateId,
    baseId: p.baseId,
    heroNumber: p.heroNumber,
    abilityName: p.abilityName,
    authored: doc ? (doc.forms[p.alternateId] ?? null) : null,
    shipped: authoredFormVisual(SHIPPED_FORM_VISUALS, p.alternateId),
    effective: resolveFormVisual(doc, p.alternateId),
  }));
}

// ------------------------------------------------------------ validation ----

const NUMERIC_ROW_BOUNDS: Record<string, readonly [number, number]> = {
  tintR: FORM_VISUAL_BOUNDS.tint,
  tintG: FORM_VISUAL_BOUNDS.tint,
  tintB: FORM_VISUAL_BOUNDS.tint,
  scaleMult: FORM_VISUAL_BOUNDS.scaleMult,
  attachScale: FORM_VISUAL_BOUNDS.attachScale,
  attachOffsetY: FORM_VISUAL_BOUNDS.attachOffsetY,
};

/**
 * 一格輸入的驗證,回中文訊息或 ""(合法)。
 *
 * ⚠️ **上界和下界一樣重要**(CLAUDE.md 2026-07-29):`validateField` 在那之前
 * 只檢查 `min`,所以 1.5 打成 15 會過後台、在 Zod 那一層才被拒(或更糟,被靜默
 * 夾掉)。這裡的每一組數字都直接來自 `FORM_VISUAL_BOUNDS`,和 Zod schema 是
 * 同一份,所以這一頁收得下的值就是遊戲收得下的值。
 */
export function validateFormVisualInput(field: FormVisualRowField, text: string): string {
  const t = text.trim();
  if (field === "attachModelKey" || field === "attachBone") {
    if (t === "") return ""; // 留白 = 這一格不填,合法
    if (/\s/.test(t)) return "不可以有空白";
    return "";
  }
  if (t === "") return ""; // 留白 = 用預設(顏色 1、大小 1)
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  const [min, max] = NUMERIC_ROW_BOUNDS[field]!;
  if (n < min) return `不能小於 ${min}`;
  if (n > max) return `不能大於 ${max}`;
  return "";
}

/** 全域旋鈕的驗證(布林欄位永遠合法,由核取方塊產生)。 */
export function validateFormVisualGlobal(field: FormVisualGlobalField, text: string): string {
  if (field === "enabled" || field === "attachmentsEnabled") return "";
  const t = text.trim();
  if (t === "") return "請輸入 0 ~ " + (field === "tintStrength" ? "1" : "2");
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  const [min, max] =
    field === "tintStrength" ? FORM_VISUAL_BOUNDS.tintStrength : FORM_VISUAL_BOUNDS.scaleStrength;
  if (n < min) return `不能小於 ${min}`;
  if (n > max) return `不能大於 ${max}`;
  return "";
}

// --------------------------------------------------------------- editing ----

function num(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const t = text.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** 面板一列的草稿(每一格都是字串,因為它們是 input 的值)。 */
export type FormVisualDraft = Partial<Record<FormVisualRowField, string>>;

/**
 * 草稿 → 文件裡的那一格。**全部留白就回 undefined**,呼叫端據此把 key 刪掉,
 * 而不是寫一個空物件進去 —— 空物件會讓「這一態沒有外觀」和「這一態被設定成
 * 沒有外觀」在資料上長得一樣,而它們在 `resolveFormVisual` 的走法不同。
 */
export function entryFromDraft(draft: FormVisualDraft, note?: string): FormVisualEntry | undefined {
  const r = num(draft.tintR);
  const g = num(draft.tintG);
  const b = num(draft.tintB);
  const entry: FormVisualEntry = {};
  // 三個顏色分量要嘛都給、要嘛都不給:少一個就不是顏色。缺的補 1(中性)。
  if (r !== undefined || g !== undefined || b !== undefined) {
    entry.tint = [r ?? 1, g ?? 1, b ?? 1];
  }
  const scale = num(draft.scaleMult);
  if (scale !== undefined) entry.scaleMult = scale;
  const key = draft.attachModelKey?.trim();
  if (key) {
    entry.attachModelKey = key;
    const bone = draft.attachBone?.trim();
    if (bone) entry.attachBone = bone;
    const as = num(draft.attachScale);
    if (as !== undefined) entry.attachScale = as;
    const oy = num(draft.attachOffsetY);
    if (oy !== undefined) entry.attachOffsetY = oy;
  }
  if (note) entry.note = note;
  return Object.keys(entry).length === 0 ? undefined : entry;
}

/** 現有那一格 → 草稿字串(給 input 的初值)。 */
export function draftFromEntry(entry: FormVisualEntry | null): FormVisualDraft {
  if (!entry) return {};
  const t = entry.tint;
  return {
    tintR: t ? String(t[0]) : "",
    tintG: t ? String(t[1]) : "",
    tintB: t ? String(t[2]) : "",
    scaleMult: entry.scaleMult === undefined ? "" : String(entry.scaleMult),
    attachModelKey: entry.attachModelKey ?? "",
    attachBone: entry.attachBone ?? "",
    attachScale: entry.attachScale === undefined ? "" : String(entry.attachScale),
    attachOffsetY: entry.attachOffsetY === undefined ? "" : String(entry.attachOffsetY),
  };
}

/**
 * 把一列寫回文件。`entry === undefined` = 把這一態整個拿掉。
 *
 * ⚠️ 一定要驗 `isAlternateForm`:這裡不擋的話,一個打錯的 id 會安靜地存進
 * overlay,面板顯示得好好的,而遊戲永遠不採用 —— 那是「後台改了沒反應」這
 * 一類最難查的 bug。名單來自 `CHAMPION_FORM_PAIRS`,不是自由字串。
 */
export function setFormEntry(
  doc: ConfigFormVisualsDoc,
  alternateId: string,
  entry: FormVisualEntry | undefined,
): ConfigFormVisualsDoc {
  if (!CHAMPION_FORM_PAIRS.some((p) => p.alternateId === alternateId)) return doc;
  const forms = { ...doc.forms };
  if (entry === undefined) delete forms[alternateId];
  else forms[alternateId] = entry;
  return { ...doc, forms };
}

/** 全域旋鈕的寫回(數值會夾進合法區間,和 Zod 同一份數字)。 */
export function setFormGlobal(
  doc: ConfigFormVisualsDoc,
  field: FormVisualGlobalField,
  value: number | boolean,
): ConfigFormVisualsDoc {
  if (field === "enabled") return { ...doc, enabled: value === true };
  if (field === "attachmentsEnabled") return { ...doc, attachmentsEnabled: value === true };
  const n = typeof value === "number" && Number.isFinite(value) ? value : 1;
  const [min, max] =
    field === "tintStrength" ? FORM_VISUAL_BOUNDS.tintStrength : FORM_VISUAL_BOUNDS.scaleStrength;
  const clamped = n < min ? min : n > max ? max : n;
  return field === "tintStrength"
    ? { ...doc, tintStrength: clamped }
    : { ...doc, scaleStrength: clamped };
}

/** 面板標題列的一句話摘要。 */
export function formVisualSummary(rows: readonly FormVisualRow[]): string {
  const live = rows.filter((r) => r.effective !== null);
  if (live.length === 0) return "目前沒有任何變身態會改外觀";
  const parts = live.map((r) => {
    const bits: string[] = [];
    if (r.effective!.tint) bits.push("顏色");
    if (r.effective!.scaleMult !== 1) bits.push(`大小 ×${r.effective!.scaleMult}`);
    if (r.effective!.attachment) bits.push("球體");
    return `${r.heroNumber} ${bits.join("+")}`;
  });
  return `${live.length} / ${rows.length} 個變身態看得出來：${parts.join(" · ")}`;
}

/** 要 PUT 的文件本體。永遠是面板正在顯示的那一整份。 */
export function formVisualsDocFor(doc: ConfigFormVisualsDoc): ConfigFormVisualsDoc {
  return { ...doc, id: FORM_VISUALS_DOC_ID, schema: FORM_VISUALS_SCHEMA };
}
