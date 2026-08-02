/**
 * vfxLayerModel — 鑄技工坊的「特效多重選取」純模型。
 *
 * owner 2026-08-02：「鑄技工坊 也請一起更新，包括**多重選取模板及特效**的設定部分」
 * owner 2026-07-30：「保有**彈性設定特效各種參數**跟**模板複數可被套用於技能中**」
 *
 * ── 這個檔案補的是哪一半 ─────────────────────────────────────────────────
 *
 * 兩半機制**都早就存在**，工坊只接了一半：
 *
 * | | 資料模型 | 後台 | 鑄技工坊 |
 * |---|---|---|---|
 * | 模板複數套用 | `expandStack` / `TEMPLATE_STACK_MAX_CARDS` | — | ✅ `ForgeStudio` 的卡片列 |
 * | 特效多層 | `zAbilityVfxLayer` / `resolveAbilityVfxLayers` | ✅ `admin/vfxLayers.ts` | ❌ **一個 vfx 字都沒有** |
 *
 * 所以工坊可以編出一支效果完全正確、但**視覺是通用替身**的技能，而那正是 #230
 * 量到的現況：491 支從原作抽出來的發射器裡只有 58 支被引用，**433 支閒置**。
 * 它們不缺技術（不卡 #98 的零幾何模型，那是不相干的東西），只缺一個能填 id 的地方。
 *
 * ── 為什麼是純模型，不是直接寫在元件裡 ───────────────────────────────────
 *
 * 第二守則：守衛要驗**行為**不是 UI。把加層/移動/移除/上限/驗證放在這裡，
 * `forgeStudioVfx.test.ts` 就能對真的 Zod 與真的上限做斷言，而不是去點按鈕。
 *
 * ⚠️ **界限一律從 shared 的 Zod 讀，這裡不重抄。**
 * `zAbilityVfxLayer` 自己是 `zVfxAbilityFamilyBinding.pick(...)` 出來的，
 * 也就是說 min/max 全 repo 只有一份定義。這裡再抄一份 `delayMs: 0..8000`
 * 就是在製造第二份會漂開的真相 —— 而 CLAUDE.md 的「四處 combat-env 倍率宣稱
 * 是假的」就是這樣來的。
 */
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  ABILITY_VFX_LAYER_OVERRIDE_FIELDS,
  zAbilityVfxLayer,
  type AbilityVfxLayer,
} from "@ggd/shared/content/schema/abilityVfx";

export { ABILITY_VFX_LAYER_HARD_CAP, ABILITY_VFX_LAYER_OVERRIDE_FIELDS };

/**
 * 編輯中的一層。**允許暫時不合法**（操作者正在打字），所以每一格是字串；
 * `layerFromDraft` 才把它變回真的 `AbilityVfxLayer`。
 *
 * ⚠️ ABSENT ≠ ZERO（和 `schema/abilityVfx.ts` 同一條規則）：一格是空字串代表
 * 「這一層不覆寫這個參數，用文件自己的值」，**不是 0**。`alpha: 0` 是「明確要求
 * 完全透明」，也就是看不見。所以 `layerFromDraft` 對空字串是**整個 key 拿掉**。
 */
export interface VfxLayerDraft {
  vfxKey: string;
  attachTo: "" | "caster" | "point";
  delayMs: string;
  enabled: boolean;
  /** 五個覆寫格，空字串 = 不覆寫。`tint` 是 "r,g,b" 三個 0-255。 */
  w3xScale: string;
  tint: string;
  flyHeight: string;
  alpha: string;
  timeScale: string;
}

export function emptyVfxLayerDraft(vfxKey = ""): VfxLayerDraft {
  return {
    vfxKey,
    attachTo: "",
    delayMs: "",
    enabled: true,
    w3xScale: "",
    tint: "",
    flyHeight: "",
    alpha: "",
    timeScale: "",
  };
}

const num = (v: unknown): string => (typeof v === "number" ? String(v) : "");

/** 出貨文件的一層 → 編輯草稿。 */
export function draftFromLayer(l: AbilityVfxLayer): VfxLayerDraft {
  return {
    vfxKey: l.vfxKey,
    attachTo: l.attachTo ?? "",
    delayMs: num(l.delayMs),
    enabled: l.enabled !== false,
    w3xScale: num(l.w3xScale),
    tint: Array.isArray(l.tint) ? l.tint.join(",") : "",
    flyHeight: num(l.flyHeight),
    alpha: num(l.alpha),
    timeScale: num(l.timeScale),
  };
}

/**
 * 一份技能 doc → 編輯草稿列。
 *
 * · 有 `vfxLayers` → 照抄
 * · 只有 `vfxKey`（646 支的現況）→ **一層、零覆寫**，也就是
 *   `resolveAbilityVfxLayers` 對舊 doc 做的同一件事。所以打開工坊看到的第一層
 *   就是這支技能現在真的在播的那個特效，不是空白。
 * · 兩個都沒有 → 空列（＝這支技能施法不畫東西，維持原樣）
 */
export function draftsFromDoc(doc: Record<string, unknown> | null | undefined): VfxLayerDraft[] {
  if (!doc) return [];
  const layers = doc["vfxLayers"];
  if (Array.isArray(layers) && layers.length > 0) {
    return layers.map((l) => draftFromLayer(l as AbilityVfxLayer));
  }
  const key = doc["vfxKey"];
  return typeof key === "string" && key !== "" ? [emptyVfxLayerDraft(key)] : [];
}

/** 草稿 → 真的一層。回傳 null = 這一格還不能存（`vfxKey` 是空的）。 */
export function layerFromDraft(d: VfxLayerDraft): AbilityVfxLayer | null {
  if (d.vfxKey.trim() === "") return null;
  const out: Record<string, unknown> = { vfxKey: d.vfxKey.trim() };
  if (d.attachTo !== "") out["attachTo"] = d.attachTo;
  if (d.delayMs.trim() !== "") out["delayMs"] = Number(d.delayMs);
  if (!d.enabled) out["enabled"] = false;
  for (const f of ["w3xScale", "flyHeight", "alpha", "timeScale"] as const) {
    if (d[f].trim() !== "") out[f] = Number(d[f]);
  }
  if (d.tint.trim() !== "") {
    const parts = d.tint.split(",").map((s) => Number(s.trim()));
    // 三格要嘛一起填、要嘛一起空 —— 後台 `validateLayerDraft` 的同一條規則。
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) out["tint"] = parts;
    else out["tint"] = d.tint; // 故意留壞值，讓下面的 Zod 指名它
  }
  const res = zAbilityVfxLayer.safeParse(out);
  return res.success ? res.data : null;
}

export type VfxLayerErrors = Record<string, string>;

/**
 * 驗一層，用**真的 Zod**，不是手寫的 if。
 *
 * 回傳 key = 欄位名，value = 給操作者看的訊息。空物件 = 這一層可以存。
 */
export function validateVfxLayerDraft(d: VfxLayerDraft): VfxLayerErrors {
  const errs: VfxLayerErrors = {};
  if (d.vfxKey.trim() === "") {
    errs["vfxKey"] = "要選一個特效 —— 空的層存下去就是一層看不見的東西";
    return errs;
  }
  const out: Record<string, unknown> = { vfxKey: d.vfxKey.trim() };
  if (d.attachTo !== "") out["attachTo"] = d.attachTo;
  if (!d.enabled) out["enabled"] = false;
  const numeric = ["delayMs", "w3xScale", "flyHeight", "alpha", "timeScale"] as const;
  for (const f of numeric) {
    const raw = d[f].trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errs[f] = "不是一個數字";
      continue;
    }
    out[f] = n;
  }
  if (d.tint.trim() !== "") {
    const parts = d.tint.split(",").map((s) => s.trim());
    if (parts.length !== 3 || parts.some((s) => s === "" || !Number.isFinite(Number(s)))) {
      errs["tint"] = "要填三個 0-255 的數字，用逗號分開（例如 90,170,255）—— 三格一起填或一起空";
    } else {
      out["tint"] = parts.map(Number);
    }
  }
  const res = zAbilityVfxLayer.safeParse(out);
  if (!res.success) {
    for (const i of res.error.issues) {
      const k = String(i.path[0] ?? "vfxKey");
      errs[k] ??= i.message;
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 列的編輯 —— 順序就是語意（由上往下依序播），所以移動要能做
// ---------------------------------------------------------------------------

/** 加一層。已經到硬上限就原封不動回傳（呼叫端據此把按鈕變灰）。 */
export function addLayer(ls: readonly VfxLayerDraft[], vfxKey = ""): VfxLayerDraft[] {
  if (ls.length >= ABILITY_VFX_LAYER_HARD_CAP) return [...ls];
  return [...ls, emptyVfxLayerDraft(vfxKey)];
}

/**
 * 移除一層。
 *
 * ⚠️ **可以移到 0 層，而且那是有意義的** —— 跟模板卡片列不一樣。
 * 空的層列代表「這支技能不用多層，回到單值 `vfxKey`」，
 * `patchForDoc` 會把 `vfxLayers` 整個拿掉而不是寫一個空陣列
 * （`zAbilityVfxLayers` 的 `.min(1)` 本來就擋空陣列）。
 */
export function removeLayer(ls: readonly VfxLayerDraft[], i: number): VfxLayerDraft[] {
  return ls.filter((_, j) => j !== i);
}

/** 把第 i 層往 dir 方向移一格。越界就原封不動。 */
export function moveLayer(ls: readonly VfxLayerDraft[], i: number, dir: -1 | 1): VfxLayerDraft[] {
  const j = i + dir;
  if (i < 0 || i >= ls.length || j < 0 || j >= ls.length) return [...ls];
  const out = [...ls];
  const a = out[i]!;
  out[i] = out[j]!;
  out[j] = a;
  return out;
}

export function patchLayer(
  ls: readonly VfxLayerDraft[],
  i: number,
  patch: Partial<VfxLayerDraft>,
): VfxLayerDraft[] {
  return ls.map((l, j) => (j === i ? { ...l, ...patch } : l));
}

// ---------------------------------------------------------------------------
// 寫回
// ---------------------------------------------------------------------------

export interface VfxPatch {
  /** 主要特效 —— 普查頁 / CodexDetail / 工坊自己都讀這一格。 */
  readonly vfxKey?: string;
  /** 多層堆疊。`undefined` = 這支技能沒有多層（欄位要從 doc 上拿掉）。 */
  readonly vfxLayers?: readonly AbilityVfxLayer[];
}

/**
 * 草稿列 → 要寫進 doc 的兩個欄位。
 *
 * 規則（和 `schema/abilityVfx.ts` 的檔頭一致）：
 * · 0 層  → 兩個都不寫；呼叫端負責把舊的 `vfxLayers` 刪掉
 * · 1 層且零覆寫 → **只寫 `vfxKey`**，不寫 `vfxLayers`。
 *   這一條不是省位元組：`resolveAbilityVfxLayers` 對「只有 vfxKey」的 doc 走
 *   identity 路徑，**原封不動回傳同一個 VfxDoc 物件**。寫成一層的 `vfxLayers`
 *   在行為上等價，但會讓 646 支現存技能全部離開那條被守衛釘住的相容路徑。
 * · ≥2 層，或 1 層但有覆寫 → 兩個都寫。`vfxKey` 取第一層 —— 檔頭說的
 *   「第一層通常就把原本的 vfxKey 再寫一次」，這裡把它變成保證而不是慣例。
 */
export function patchForDoc(ls: readonly VfxLayerDraft[]): VfxPatch {
  const layers = ls.map(layerFromDraft).filter((l): l is AbilityVfxLayer => l !== null);
  if (layers.length === 0) return {};
  const first = layers[0]!;
  const soloPlain =
    layers.length === 1 &&
    first.attachTo === undefined &&
    first.delayMs === undefined &&
    first.enabled === undefined &&
    ABILITY_VFX_LAYER_OVERRIDE_FIELDS.every((f) => first[f] === undefined);
  if (soloPlain) return { vfxKey: first.vfxKey };
  return { vfxKey: first.vfxKey, vfxLayers: layers };
}

/** 這一列有沒有任何一層擋著存檔。 */
export function vfxLayerBlockers(ls: readonly VfxLayerDraft[]): string[] {
  const out: string[] = [];
  ls.forEach((d, i) => {
    const errs = validateVfxLayerDraft(d);
    for (const [field, msg] of Object.entries(errs)) {
      out.push(`第 ${i + 1} 層的「${field}」：${msg}`);
    }
  });
  return out;
}
