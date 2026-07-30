/**
 * 鑄技工坊 · 多層特效堆疊的**綁定器** (task #205 / #230).
 *
 * ---------------------------------------------------------------------------
 * 這個檔補的是鑄技工坊少掉的那一半
 * ---------------------------------------------------------------------------
 * `./vfxForge.ts`(930 行)是一個**調參數**的編輯器:它能改 21 個家族原型的
 * 大小/顏色/透明度,也能把一支技能改綁到**另一個家族原型**。它做不到的是
 * owner 2026-07-30 要的那句話:
 *
 *   > 「保有彈性設定特效各種參數跟**模板複數可被套用於技能中**」
 *
 * 因為家族綁定那一頁的 `vfxKey` 是 `familyVfxKey(family, colour, scale)`
 * **合成**出來的,操作者選不到 `content/vfx/` 裡那 631 份模板的任何一份,更不用說
 * 一次疊好幾份。這個模組讓後台可以直接編輯技能文件自己的 `vfxLayers` ——
 * 選模板、疊層、排順序、每層各自的參數。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 631 份模板裡有 55 份**放進施法層會什麼都不畫**
 * ---------------------------------------------------------------------------
 * `content/vfx/` 這個 collection 混著兩種 schema:`vfx@1`(粒子,576 份)與
 * `ribbon@1`(緞帶拖尾,55 份)。`registries.ts:165` 把它們分進 **兩個不同的
 * registry**:
 *
 *     if (d.schema === "ribbon@1") RibbonDefs.register(d); else VfxDefs.register(d);
 *
 * 而施法層的解析走 `VfxSystem.doc()` → `ctx.vfxDoc` → `ContentDb.vfxFor` →
 * **`VfxDefs`**。所以一個 `ribbon@1` 的 id 填進 `vfxLayers[].vfxKey`,schema 收得
 * 下(`zRef("vfx")` 是整個 collection),存得進去,後台顯示 ✓,**執行期
 * `this.doc()` 回 null,那一層被靜靜跳過** —— 第②號故障,而且是操作者自己親手
 * 造出來的。
 *
 * 所以這裡的模板目錄帶著 `playable` 這一格,而且它**不是看 id 前綴猜的**,是讀
 * 每一份文件真正的 `schema` 欄位。不能播的模板預設不列出來,而且說得出理由 ——
 * 不是靜靜藏起來(藏起來 = 操作者以為 631 份只有 576 份存在)。
 * `vfxLayers.test.ts` 用**真的 registry 分流**釘住這件事,不是抄一份 id 清單。
 *
 * ---------------------------------------------------------------------------
 * 欄位與上下界都是 pick 出來的,不是這裡發明的
 * ---------------------------------------------------------------------------
 * 每一層的參數格 = `ABILITY_FIELDS` 減掉 `family` 與 `anchor`:
 *
 *   · `family` 是「家族綁定」那一頁的概念(選 21 個原型之一);層是直接選文件,
 *     兩者互斥。
 *   · `anchor` 是 `abilityVfx.ts` 檔頭明文**刻意不 pick** 的 —— pooled cast path
 *     沒有 bone parenting,開了就是「寫了會被吃掉的欄位」。
 *
 * 上下界直接沿用 `ABILITY_BOUNDS`(同一個物件,不是抄一份同名的),`delayMs` 的
 * 上下界則對 `zAbilityVfxLayer` 用真的 `safeParse` 驗四個點。
 *
 * ⚠️ ABSENT ≠ ZERO,和另外兩張表同一條規則:一格留白 = 這一層不覆寫這個參數,
 * **不是 0**。`alpha: 0` 是「明確要求完全透明」= 看不見。
 */
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  ABILITY_VFX_LAYER_OVERRIDE_FIELDS,
  DEFAULT_MAX_ABILITY_VFX_LAYERS,
  clampMaxAbilityVfxLayers,
  zAbilityVfxLayer,
  type AbilityVfxLayer,
} from "@ggd/shared/content/schema/abilityVfx";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { ABILITY_BOUNDS, ABILITY_FIELDS, validateAbilityField, type ForgeBound } from "./vfxForge";
import { parseIndex } from "./content";

export {
  ABILITY_VFX_LAYER_HARD_CAP,
  DEFAULT_MAX_ABILITY_VFX_LAYERS,
  clampMaxAbilityVfxLayers,
};

// ---------------------------------------------------------------------------
// 欄位
// ---------------------------------------------------------------------------

/**
 * 一層能覆寫的參數格。
 *
 * **推導出來的,不是手打的**:`ABILITY_FIELDS` 減掉兩個不屬於層的欄位。少寫一個
 * 會被 `vfxLayers.test.ts` 的集合等式抓到,多寫一個會被 `zAbilityVfxLayer`
 * 的 `.strict()` 擋掉。
 */
export const NON_LAYER_ABILITY_FIELDS: readonly string[] = ["family", "anchor"];

export const LAYER_PARAM_FIELDS = ABILITY_FIELDS.filter(
  (f) => !NON_LAYER_ABILITY_FIELDS.includes(f) && f !== "enabled",
) as readonly string[];

/** 一層的所有格子,畫面上的順序就是這個順序。 */
export const LAYER_FIELDS: readonly string[] = [
  "vfxKey",
  "enabled",
  "attachTo",
  "delayMs",
  ...LAYER_PARAM_FIELDS,
];

export type LayerDraft = Record<string, string>;

/**
 * `delayMs` 的上下界。**不是我挑的** —— `zAbilityVfxLayer.delayMs` 是
 * `.min(0).max(8000)`,而 `vfxLayers.test.ts` 對真的 schema 驗 min / min−ε /
 * max / max+ε 四個點,抄錯一個數字會紅。
 */
export const DELAY_BOUND: ForgeBound = { min: 0, max: 8000 };

/** 每一格的上下界:參數格沿用 `ABILITY_BOUNDS` 那一份,delayMs 用上面那條。 */
export const LAYER_BOUNDS: Readonly<Record<string, ForgeBound>> = {
  ...Object.fromEntries(
    LAYER_PARAM_FIELDS.map((f) => [f, ABILITY_BOUNDS[f]]).filter(([, b]) => b !== undefined),
  ),
  delayMs: DELAY_BOUND,
};

export const LAYER_FIELD_LABEL: Readonly<Record<string, string>> = {
  vfxKey: "特效模板",
  enabled: "這一層播不播",
  attachTo: "跟著誰",
  delayMs: "延遲（毫秒）",
};

export const LAYER_FIELD_HINT: Readonly<Record<string, string>> = {
  vfxKey:
    "這一層要播 content/vfx/ 裡的哪一份文件。只列得出 vfx@1（粒子）——" +
    "ribbon@1（緞帶）走的是另一條 registry，填進來執行期會被靜靜跳過",
  enabled: "關掉 = 這一層暫時不播，但設定留著（不用刪掉再重建）",
  attachTo:
    "caster = 施法者當下的位置（單一 vfxKey 時代唯一的行為）；point = 技能的落點。" +
    "self/dash 這類沒有落點的技能會自動退回 caster，不會畫到地圖中央",
  delayMs:
    "施法後幾毫秒才播這一層。這是「蓄力 → 爆炸 → 餘燼」的時間軸；0 = 和第一層同一幀",
};

export const ATTACH_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "（跟著施法者）" },
  { value: "caster", label: "施法者" },
  { value: "point", label: "技能落點" },
];

// ---------------------------------------------------------------------------
// 草稿 ⇄ 層
// ---------------------------------------------------------------------------

function numText(v: number | undefined): string {
  return v === undefined ? "" : String(v);
}

export function emptyLayerDraft(vfxKey = ""): LayerDraft {
  const d: LayerDraft = {};
  for (const f of LAYER_FIELDS) d[f] = "";
  d["vfxKey"] = vfxKey;
  return d;
}

export function layerDraftFrom(layer: AbilityVfxLayer): LayerDraft {
  const d = emptyLayerDraft(layer.vfxKey);
  d["enabled"] = layer.enabled === undefined ? "" : layer.enabled ? "1" : "0";
  d["attachTo"] = layer.attachTo ?? "";
  d["delayMs"] = numText(layer.delayMs);
  d["w3xScale"] = numText(layer.w3xScale);
  d["flyHeight"] = numText(layer.flyHeight);
  d["alpha"] = numText(layer.alpha);
  d["timeScale"] = numText(layer.timeScale);
  d["tintR"] = numText(layer.tint?.[0]);
  d["tintG"] = numText(layer.tint?.[1]);
  d["tintB"] = numText(layer.tint?.[2]);
  return d;
}

/**
 * 技能文件上目前的堆疊 → 草稿列。
 *
 * ⚠️ 沒有 `vfxLayers` 時回**空陣列**,不是「用 vfxKey 幫他生一層」。自動生一層會
 * 讓「只是打開來看一眼」變成一筆待寫入的改動(和 `OPTIONAL_GLOBAL_FIELDS` 檔頭
 * 講的是同一個病)。要開始疊層由操作者自己按那顆按鈕。
 */
export function layerDraftsFrom(doc: unknown): LayerDraft[] {
  const layers = (doc as { vfxLayers?: unknown } | null | undefined)?.vfxLayers;
  if (!Array.isArray(layers)) return [];
  return layers.map((l) => layerDraftFrom(l as AbilityVfxLayer));
}

/** 技能文件目前的單值 `vfxKey`(沒有就是 null)。 */
export function shippedVfxKeyOf(doc: unknown): string | null {
  const k = (doc as { vfxKey?: unknown } | null | undefined)?.vfxKey;
  return typeof k === "string" && k !== "" ? k : null;
}

export function validateLayerField(field: string, text: string): string {
  const t = text.trim();
  if (field === "vfxKey") return t === "" ? "必填：這一層要播哪一份特效文件" : "";
  if (field === "enabled") {
    if (t === "") return "";
    return t === "1" || t === "0" ? "" : "只能是開或關";
  }
  if (field === "attachTo") {
    if (t === "") return "";
    return t === "caster" || t === "point" ? "" : "只能是 caster 或 point";
  }
  if (field === "delayMs") {
    if (t === "") return "";
    const n = Number(t);
    if (!Number.isFinite(n)) return "必須是數字";
    if (n < DELAY_BOUND.min) return `不能小於 ${DELAY_BOUND.min}`;
    if (n > DELAY_BOUND.max) return `不能大於 ${DELAY_BOUND.max}`;
    return "";
  }
  // 參數格:**沿用家族綁定那張表的檢查**,不是另寫一份(上下界一定同步)
  return validateAbilityField(field as never, text);
}

export type LayerErrors = Record<string, string>;

export function validateLayerDraft(d: LayerDraft): LayerErrors {
  const errs: LayerErrors = {};
  for (const f of LAYER_FIELDS) {
    const e = validateLayerField(f, d[f] ?? "");
    if (e) errs[f] = e;
  }
  const filled = (["tintR", "tintG", "tintB"] as const).filter((f) => (d[f] ?? "").trim() !== "");
  if (filled.length > 0 && filled.length < 3) {
    for (const f of ["tintR", "tintG", "tintB"] as const) {
      if ((d[f] ?? "").trim() === "") errs[f] = "顏色要三格一起填（或三格都留白）";
    }
  }
  return errs;
}

/**
 * 一列草稿 → 一層。留白的格子**整個不寫進去**(ABSENT ≠ ZERO),最後再用 shared
 * 自己的 `zAbilityVfxLayer` 解一次 —— 後台的檢查漏了什麼,那裡會擋下來。
 */
export function layerFromDraft(d: LayerDraft): AbilityVfxLayer | null {
  if (Object.keys(validateLayerDraft(d)).length > 0) return null;
  const out: Record<string, unknown> = { vfxKey: (d["vfxKey"] ?? "").trim() };
  const en = (d["enabled"] ?? "").trim();
  if (en !== "") out["enabled"] = en === "1";
  const at = (d["attachTo"] ?? "").trim();
  if (at !== "") out["attachTo"] = at;
  const num = (f: string): number | undefined => {
    const t = (d[f] ?? "").trim();
    return t === "" ? undefined : Number(t);
  };
  for (const f of ["delayMs", "w3xScale", "flyHeight", "alpha", "timeScale"]) {
    const v = num(f);
    if (v !== undefined) out[f] = v;
  }
  const tr = num("tintR");
  const tg = num("tintG");
  const tb = num("tintB");
  if (tr !== undefined && tg !== undefined && tb !== undefined) out["tint"] = [tr, tg, tb];
  const parsed = zAbilityVfxLayer.safeParse(out);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// 排序 / 增刪
// ---------------------------------------------------------------------------

export function addLayer(drafts: readonly LayerDraft[], vfxKey = ""): LayerDraft[] {
  return [...drafts, emptyLayerDraft(vfxKey)];
}

export function removeLayer(drafts: readonly LayerDraft[], index: number): LayerDraft[] {
  return drafts.filter((_, i) => i !== index);
}

/**
 * 把第 `index` 層往上/往下挪一格。
 *
 * ⚠️ 順序**不是裝飾**:`resolveAbilityVfxLayers` 的截斷是「從後面砍」,所以層數
 * 上限調小的時候被丟掉的是最後面那幾層。而且 `playLayeredCast` 依序播,delay 0
 * 的層之間先播的先進粒子池。
 */
export function moveLayer(drafts: readonly LayerDraft[], index: number, delta: number): LayerDraft[] {
  const to = index + delta;
  if (index < 0 || index >= drafts.length || to < 0 || to >= drafts.length) return [...drafts];
  const out = [...drafts];
  const [moved] = out.splice(index, 1);
  if (moved) out.splice(to, 0, moved);
  return out;
}

// ---------------------------------------------------------------------------
// 層數上限
// ---------------------------------------------------------------------------

/**
 * 現在生效的層數上限 —— 後台 `config.vfx-families@1.maxAbilityVfxLayers`,
 * 沒設就是出貨預設,兩邊都再被 `ABILITY_VFX_LAYER_HARD_CAP` 夾一次。
 *
 * 這是**同一支** `clampMaxAbilityVfxLayers`,客戶端 `ContentDb` 裝上限用的也是它
 * —— 後台畫面上寫的「剩幾層」和場上真的會播幾層不可能對不起來。
 */
export function layerCapOf(familiesDoc: { maxAbilityVfxLayers?: number } | null | undefined): number {
  return clampMaxAbilityVfxLayers(familiesDoc?.maxAbilityVfxLayers);
}

export function layersRemaining(count: number, cap: number): number {
  return Math.max(0, cap - count);
}

export function capNoticeText(count: number, cap: number): string {
  const left = layersRemaining(count, cap);
  const over = count > cap ? `⚠️ 超過上限 ${count - cap} 層，多的那幾層場上不會播（從後面砍）。` : "";
  return (
    `${over}目前 ${count} 層 · 上限 ${cap} 層（還可以加 ${left} 層）。` +
    `上限是「特效總表」那一格 ${"maxAbilityVfxLayers"}，硬上限 ${ABILITY_VFX_LAYER_HARD_CAP} 層`
  );
}

// ---------------------------------------------------------------------------
// 草稿 → 要 PUT 的技能文件
// ---------------------------------------------------------------------------

export interface LayerDocResult {
  /** 可以 PUT 的整份技能文件（null = 有一列還不能存） */
  readonly doc: Record<string, unknown> | null;
  /** 讓頁面說得出「哪裡不能存」 */
  readonly error: string | null;
}

/**
 * 把草稿疊回**整份技能文件**。
 *
 * ⚠️ `base` 必須是**線上生效的那一份**(overlay 有就用 overlay),不是出貨那一份。
 * 用出貨的當底,等於把這支技能上一次在後台做的任何編輯靜靜還原掉 —— 那正是
 * GH#241 的形狀,而且畫面還會顯示 ✓。頁面那一側有一條守衛釘這件事。
 *
 * 空陣列 = 把 `vfxLayers` 這個 key **整個拿掉**(回到單值 `vfxKey` 的舊路),
 * 不是寫一個 `[]` —— schema 的 `.min(1)` 會拒絕 `[]`,而且「空堆疊」和「沒有
 * 堆疊」在讀取端是兩件不同的事。
 */
export function abilityDocWithLayers(
  base: unknown,
  drafts: readonly LayerDraft[],
): LayerDocResult {
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    return { doc: null, error: "讀不到這支技能的文件，沒有東西可以存" };
  }
  const layers: AbilityVfxLayer[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    if (!draft) continue;
    const layer = layerFromDraft(draft);
    if (!layer) {
      const errs = validateLayerDraft(draft);
      const first = Object.entries(errs)[0];
      return { doc: null, error: `第 ${i + 1} 層：${first ? `${first[0]} ${first[1]}` : "填錯了"}` };
    }
    layers.push(layer);
  }
  if (layers.length > ABILITY_VFX_LAYER_HARD_CAP) {
    return { doc: null, error: `最多 ${ABILITY_VFX_LAYER_HARD_CAP} 層（硬上限）` };
  }
  const { vfxLayers: _dropped, ...rest } = base as Record<string, unknown>;
  const next: Record<string, unknown> =
    layers.length === 0 ? { ...rest } : { ...rest, vfxLayers: layers };
  // shared 自己的 Zod —— 遊戲載入這份文件走的就是它。過不了就不准送出去。
  const parsed = zAbilityDoc.safeParse(next);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      doc: null,
      error: `這份技能文件過不了 ability@1 的 schema —— ${
        first ? `${first.path.join(".") || "(根)"}: ${first.message}` : "未知"
      }`,
    };
  }
  return { doc: next, error: null };
}

// ---------------------------------------------------------------------------
// 模板目錄
// ---------------------------------------------------------------------------

export type TemplateKind = "w3x-particle" | "w3x-orb" | "w3x-locust" | "family" | "prim" | "authored" | "ribbon";

export const TEMPLATE_KIND_LABEL: Readonly<Record<TemplateKind, string>> = {
  "w3x-particle": "原作 · 粒子",
  "w3x-orb": "原作 · 球體",
  "w3x-locust": "原作 · 蝗蟲群",
  family: "家族原型（合成）",
  prim: "通用替身（依名字猜的）",
  authored: "手寫／匯入",
  ribbon: "緞帶拖尾（施法層放不了）",
};

export interface VfxTemplate {
  readonly id: string;
  /** 文件自己的 schema —— 讀出來的，不是從 id 猜的 */
  readonly schema: string;
  /**
   * 這份模板放進 `vfxLayers[].vfxKey` 之後，執行期真的畫得出東西嗎。
   * false 的唯一原因就是 `ribbon@1`（走 RibbonDefs，不在 VfxDefs 裡）。
   */
  readonly playable: boolean;
  readonly unplayableReason: string | null;
  readonly kind: TemplateKind;
  /** 這份文件真正的樣子（畫在預覽卡上的每一個字都是從它讀的） */
  readonly summary: string;
  /** 顏色 swatch 的 #rrggbb —— 從 doc 的 color.start 讀，不是從 id 的元素名猜 */
  readonly colorHex: string;
  /** 搜尋用的小寫字串 */
  readonly search: string;
}

const HEX = (v: number): string =>
  Math.max(0, Math.min(255, Math.round(v * 255)))
    .toString(16)
    .padStart(2, "0");

/** doc 的起始顏色 → #rrggbb。讀不到就中性灰（不假裝知道）。 */
export function templateColorHex(doc: unknown): string {
  const c = (doc as { color?: { start?: unknown } } | null)?.color?.start;
  if (!Array.isArray(c) || c.length < 3) return "#8a95ad";
  const [r, g, b] = c as number[];
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return "#8a95ad";
  return `#${HEX(r)}${HEX(g)}${HEX(b)}`;
}

function round(n: number, p = 2): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

/**
 * 預覽卡上那一行字 —— **從文件本身讀出來的真實參數**。
 *
 * 這不是「長什麼樣」的替代品的藉口:後台沒有 Babylon 的粒子執行期(那一整層在
 * `apps/client/src/render/vfx/**`,而後台不可以 import 它),所以與其畫一個
 * 用別的程式碼算出來的假預覽 —— 那是第⑤號故障「被測的不是出貨的那個」的視覺版
 * —— 不如把出貨文件自己的形狀、模式、壽命、大小、顏色、混色模式**原封不動**
 * 攤在畫面上。這些數字就是 `toParticleSystem` 唯一會讀的東西。
 */
export function templateSummary(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "讀不到這份文件";
  const d = doc as Record<string, unknown>;
  if (d["schema"] === "ribbon@1") {
    const life = typeof d["lifespanSec"] === "number" ? `${round(d["lifespanSec"] as number)}s` : "?";
    return `緞帶 · 壽命 ${life} · 寬 ${String(d["widthAbove"] ?? "?")}/${String(d["widthBelow"] ?? "?")} · ${String(d["blendMode"] ?? "?")}`;
  }
  const parts: string[] = [];
  const em = d["emitter"] as { shape?: string; radius?: number } | undefined;
  if (em?.shape) parts.push(`${em.shape}${em.radius !== undefined ? ` r${round(em.radius)}` : ""}`);
  const mode = d["mode"];
  if (mode === "burst") parts.push(`一次爆發 ×${String(d["burstCount"] ?? "?")}`);
  else if (mode === "continuous") parts.push(`持續噴發 ${String(d["ratePerSec"] ?? "?")}/s`);
  const life = d["lifetimeSec"] as { min?: number; max?: number } | undefined;
  if (life?.min !== undefined) parts.push(`壽命 ${round(life.min)}–${round(life.max ?? life.min)}s`);
  const size = d["size"] as { start?: number; end?: number } | undefined;
  if (size?.start !== undefined) parts.push(`大小 ${round(size.start)}→${round(size.end ?? 0)}`);
  if (typeof d["blendMode"] === "string") parts.push(String(d["blendMode"]));
  if (typeof d["texture"] === "string") {
    const tex = String(d["texture"]).split("/").pop() ?? "";
    if (tex) parts.push(tex);
  }
  return parts.join(" · ") || "（這份文件沒有任何可顯示的參數）";
}

/** id → 分類。分類只影響**篩選**，能不能播一律看文件的 `schema`。 */
export function templateKind(id: string, schema: string): TemplateKind {
  if (schema === "ribbon@1") return "ribbon";
  if (id.startsWith("fx.w3x.particle.")) return "w3x-particle";
  if (id.startsWith("fx.w3x.orb.")) return "w3x-orb";
  if (id.startsWith("fx.w3x.locust.")) return "w3x-locust";
  if (id.startsWith("fx.fam.")) return "family";
  if (id.startsWith("fx.prim.")) return "prim";
  return "authored";
}

export const RIBBON_REASON =
  "這是 ribbon@1（緞帶拖尾）。它註冊在 RibbonDefs，而施法層解析走 VfxDefs —— 填進來存得進去，場上會被靜靜跳過";

export function templateFrom(id: string, doc: unknown): VfxTemplate {
  const schema = typeof (doc as { schema?: unknown } | null)?.schema === "string"
    ? String((doc as { schema: string }).schema)
    : "";
  const kind = templateKind(id, schema);
  const playable = schema === "vfx@1";
  const summary = templateSummary(doc);
  return {
    id,
    schema,
    playable,
    unplayableReason: playable
      ? null
      : schema === "ribbon@1"
        ? RIBBON_REASON
        : `schema 是「${schema || "讀不到"}」，不是 vfx@1 —— 施法層放不了`,
    kind,
    summary,
    colorHex: templateColorHex(doc),
    search: `${id} ${TEMPLATE_KIND_LABEL[kind]} ${summary}`.toLowerCase(),
  };
}

export interface TemplateFilter {
  readonly query?: string;
  readonly kind?: TemplateKind | "";
  /** 預設 true：不能播的模板不列出來（但總數那一行仍然說得出它們存在） */
  readonly playableOnly?: boolean;
}

export function filterTemplates(
  templates: readonly VfxTemplate[],
  f: TemplateFilter,
): VfxTemplate[] {
  const q = (f.query ?? "").trim().toLowerCase();
  const playableOnly = f.playableOnly !== false;
  return templates.filter((t) => {
    if (playableOnly && !t.playable) return false;
    if (f.kind && t.kind !== f.kind) return false;
    if (q === "") return true;
    return t.search.includes(q);
  });
}

export function templateCountText(templates: readonly VfxTemplate[], shown: number): string {
  const playable = templates.filter((t) => t.playable).length;
  const blocked = templates.length - playable;
  return (
    `content/vfx/ 共 ${templates.length} 份模板，其中 ${playable} 份是 vfx@1（施法層放得了）、` +
    `${blocked} 份是緞帶/其他（放不了，預設不列）。目前符合 ${shown} 份`
  );
}

/**
 * 抓 `content/vfx/` 的每一份文件。
 *
 * ⚠️ 必須真的把文件抓下來 —— `_index.json` 只有 id 和 path,**沒有 schema**,
 * 所以光看索引分不出 576 份粒子和 55 份緞帶,而那正是「選了會什麼都不畫」的
 * 那條線。631 份小檔案(合計約 700 KB),和這一頁本來就會抓的 696 份技能文件
 * 同一個量級。
 */
export async function loadVfxTemplates(
  opts: { fetchFn?: typeof fetch; base?: string; concurrency?: number } = {},
): Promise<VfxTemplate[]> {
  const fetchFn = opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = opts.base ?? "/content";
  const concurrency = Math.max(1, opts.concurrency ?? 16);

  const res = await fetchFn(`${base}/vfx/_index.json`);
  if (!res.ok) throw new Error(`${base}/vfx/_index.json → HTTP ${res.status}`);
  const entries = parseIndex((await res.json()) as unknown);

  const out: VfxTemplate[] = entries.map((e) => templateFrom(e.id, null));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const entry = entries[i];
      if (entry === undefined) return;
      try {
        const r = await fetchFn(`${base}/${entry.path}`);
        if (!r.ok) continue;
        out[i] = templateFrom(entry.id, (await r.json()) as unknown);
      } catch {
        // 讀不到就留「schema 讀不到」那一列 —— 它會被歸成不能播並說出理由,
        // 而不是被當成一份正常的粒子模板讓操作者選下去
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// 文案 —— 誠實在什麼時候生效
// ---------------------------------------------------------------------------

/**
 * ⚠️ 這一段是驗收條件的一部分,不是裝飾。
 *
 * 施法特效的整條決策鏈都在**瀏覽器**裡:`abilityCast` 事件 → `Abilities.tryGet`
 * → `castLayersFor` → `VfxSystem`。技能文件是客戶端**開機時**(`ensureContentLoaded`,
 * single-flight)把出貨樹 ⊕ overlay 合併起來載的,之後整場都不會再讀一次。
 *
 * 所以:**已經開著遊戲的玩家要重新整理頁面才會看到新的堆疊**;之後才進來的玩家
 * 一進來就是新的。對戰伺服器不需要重啟(它根本不讀 `vfxLayers` —— 特效不影響
 * 模擬)。把這句話寫在畫面上,是為了不要再造一個「看起來可調」的東西(#241)。
 */
export const LAYER_APPLY_NOTE =
  "儲存後寫進耐久覆蓋層。施法特效是純客戶端的決定，技能文件在瀏覽器開機時合併一次 —— " +
  "所以「已經開著遊戲的人要重新整理頁面才會看到」，之後才進來的玩家立刻就是新的。" +
  "對戰伺服器不必重啟（它不讀 vfxLayers，特效不參與模擬）。";

export const LAYER_OVERRIDE_NOTE =
  "⚠️ 一支技能只要有了堆疊，施法時畫的就完全是這張表 —— 上面那張「家族原型／技能綁定」對它不再生效" +
  "（VfxSystem 的第 0 級蓋過整條晉升階梯）。所以第一層通常就把原本的 vfxKey 再寫一次。";

export const LAYER_ABSENT_NOTE =
  "留白 ≠ 0：一格留白 = 這一層不覆寫這個參數，用模板自己的值。填 0 是明確要求 0（alpha 0 = 完全看不見）。";

export function layerSaveErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `寫入技能文件失敗：${msg}`;
}

/** 供 UI 直接顯示：這一層在畫面上的一句話摘要。 */
export function layerSummaryText(d: LayerDraft, tpl: VfxTemplate | undefined): string {
  const bits: string[] = [d["vfxKey"] || "（還沒選模板）"];
  if ((d["enabled"] ?? "") === "0") bits.push("停用");
  if ((d["delayMs"] ?? "").trim() !== "") bits.push(`+${d["delayMs"]}ms`);
  if ((d["attachTo"] ?? "") === "point") bits.push("落點");
  if ((d["w3xScale"] ?? "").trim() !== "") bits.push(`×${d["w3xScale"]}`);
  if ((d["alpha"] ?? "").trim() !== "") bits.push(`α${d["alpha"]}`);
  if ((d["timeScale"] ?? "").trim() !== "") bits.push(`t×${d["timeScale"]}`);
  if (tpl && !tpl.playable) bits.push("⚠️ 這份模板放不了");
  return bits.join(" · ");
}

/** 這一層宣告的覆寫欄位名（給守衛用：它必須和 schema pick 出來的那組對得上）。 */
export const DECLARED_OVERRIDE_FIELDS: readonly string[] = ABILITY_VFX_LAYER_OVERRIDE_FIELDS;
