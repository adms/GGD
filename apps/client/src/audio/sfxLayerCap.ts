/**
 * audio/sfxLayerCap —— ⭐ 一次施法**最多疊幾層聲音**（GH#568）。
 *
 * owner 2026-08-23（逐字，這是**混合方案**，四件事缺一不可）：
 *
 * > 「音效層數：**混合 1+2**，**設定上限**但同時也**讓我知道哪些碰到上限**，
 * >  我可以**額外審查白名單**，但**疊超過又不是白名單雖然不會砍但也不會播出來
 * >  超過的音效**」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 「不會砍」是這一支存在的**全部**理由
 * ═══════════════════════════════════════════════════════════════════════════
 * 最直覺的做法是把超出的那幾格從 `content/vfx-families.json` 刪掉 —— ⛔ 而 owner
 * 明說**不要**。刪掉之後：① 上限一放寬，被刪的東西**回不來**（那份知識沒有第二個
 * 副本，第一·五守則的「另存，不是壓縮取代」）；② 白名單就變成一句空話，因為那支
 * 技能的第 4、5 層已經不存在了。
 *
 * ⇒ ⭐ **設定原封不動，夾住只發生在播放的那一刻。** 把 `enabled` 關掉、或把一支
 * 技能寫進 `whitelist`，聲音**逐位元回來**，⛔ 不必重建任何內容、⛔ 不必部署。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 層的順序是**固定**的，而且它與那張產生的表共用同一份宣告
 * ═══════════════════════════════════════════════════════════════════════════
 * `tools/sfx-bind/usage_table.ts`（owner 審查用的那張表）**import 這裡的
 * {@link CAST_LAYER_ORDER}**，⛔ 不是自己再抄一份順序 —— 兩份順序遲早會漂，
 * 而漂掉的那一天，表上寫「這支被夾掉消散音」而遊戲裡夾掉的是循環音，
 * 沒有任何東西會紅（第〇·四守則：同一份知識只有一個住處）。
 *
 * 超出上限的從**後面**開始不播，所以被丟掉的永遠是最邊緣的那幾層（消散 → 循環 →
 * 命中），⛔ 永遠不會是施法音本身：一支技能可以沒有特效音，⛔ 不可以無聲施放。
 */
import type { AudioCastLayerCap } from "@ggd/shared/content";
import type { VfxSoundCue } from "@ggd/shared/content/schema/vfx";

/** 一次施法會發出聲音的五層。名字與 owner 那張表上的欄位逐字相同。 */
export type CastSoundLayer = "施法音" | "特效發射" | "特效命中" | "特效循環" | "特效消散";

/**
 * ⭐ **唯一**的一份層序。從前往後是「離施法那一刻多遠」，也就是被夾掉的優先序
 * （從尾巴開始丟）。⛔ 不要在別的地方再寫一份。
 */
export const CAST_LAYER_ORDER: readonly CastSoundLayer[] = [
  "施法音",
  "特效發射",
  "特效命中",
  "特效循環",
  "特效消散",
];

/** 特效那四個時機 → 它在層序裡的名字。⛔ 施法音不在這裡（它不是特效層）。 */
export const VFX_CUE_LAYER: Readonly<Record<VfxSoundCue, CastSoundLayer>> = {
  launch: "特效發射",
  impact: "特效命中",
  loop: "特效循環",
  dissipate: "特效消散",
};

/**
 * 出貨值。⭐ `maxLayers: 5`（＝層序的長度）**刻意等於「今天一層都不夾」**。
 *
 * ⚠️ 為什麼不是 3：owner 的句子分成兩半 ——「讓我知道哪些**碰到**上限」（回報）與
 * 「**疊超過**⋯不會播出來超過的」（夾住）。⭐ 我做得出機制、⛔ 挑那個數字不是我的
 * （第一守則：「可調」≠「我可以轉」）。一個會當場砍掉聲音的預設值，等於我替他做了
 * 那個決定 —— 而且它砍掉的正好是 GH#390/#440 剛接上去的循環與消散音（那兩批的
 * 守衛會紅，而**紅在別人的檔案上**）。
 *
 * ⇒ 出貨這一版：**行為逐位元等於這一格出現之前**，而那張表照樣列出
 * 「已經頂到 5 層」的 15 支給 owner 審。他把這一格改成 4 或 3，被夾掉的那幾層
 * **設定仍然原封保留**，改回來就回來。
 *
 * 量到的分佈（出貨內容）：1 層 212 支 · 2 層 42 支 · 3 層 147 支 · 4 層 4 支 · 5 層 15 支。
 */
export const DEFAULT_CAST_LAYER_CAP: AudioCastLayerCap = {
  enabled: true,
  maxLayers: CAST_LAYER_ORDER.length,
  whitelist: [],
};

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;

/**
 * 把任意輸入解讀成一份政策。**逐格**降級，⛔ 不是整份二選一 —— 一份被截斷的後台
 * override（存了一半、或舊版本缺了新欄位）會有正確的形狀而少幾格，整份丟掉會連
 * owner 存過的那幾格一起丟掉（`vfx/feelFx.readFeelFx` 的檔頭記著同一個理由）。
 *
 * ⚠️ 上下界夾在這裡，因為出貨路徑上的 audio map 走的是**寬鬆**解析
 * （`audioMapFromDoc` 只挑欄位，不跑 Zod），所以一個界外的數字有可能走到這裡。
 */
export function readCastLayerCap(raw: unknown): AudioCastLayerCap {
  const d = raw as Partial<AudioCastLayerCap> | null | undefined;
  if (!d || typeof d !== "object") return DEFAULT_CAST_LAYER_CAP;
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_CAST_LAYER_CAP.enabled,
    maxLayers: clampInt(d.maxLayers, 1, 8, DEFAULT_CAST_LAYER_CAP.maxLayers),
    whitelist: Array.isArray(d.whitelist)
      ? d.whitelist.filter((s): s is string => typeof s === "string" && s.length > 0)
      : DEFAULT_CAST_LAYER_CAP.whitelist,
  };
}

/** 按 {@link CAST_LAYER_ORDER} 排序並去重 —— 呼叫端給的順序不算數。 */
function ordered(present: Iterable<CastSoundLayer>): CastSoundLayer[] {
  const set = new Set(present);
  return CAST_LAYER_ORDER.filter((l) => set.has(l));
}

/**
 * 這支技能**這一次**播得出來的層。
 *
 * `present` 是「設定上真的有東西」的那幾層（⛔ 不是全部五層）。回傳的是它的**前綴**：
 * 白名單上、或上限關掉、或本來就沒超過 ⇒ 原封不動；超過 ⇒ 砍尾巴。
 *
 * ⭐ `abilityId` 是 `ability@1.id`（例 `godie-e008.r`）。undefined（普攻 / DoT /
 * 道具 proc 那條路）永遠**不在白名單上**，但它們本來也只有一層。
 */
export function allowedCastLayers(
  present: Iterable<CastSoundLayer>,
  abilityId: string | undefined,
  cap: AudioCastLayerCap,
): Set<CastSoundLayer> {
  const list = ordered(present);
  if (!cap.enabled) return new Set(list);
  if (abilityId !== undefined && cap.whitelist.includes(abilityId)) return new Set(list);
  return new Set(list.slice(0, cap.maxLayers));
}

/**
 * 被夾掉的那幾層 —— ⭐ owner 要的「**讓我知道哪些碰到上限**」那一半。
 * `tools/sfx-bind/usage_table.ts` 用它產那張表；⛔ 它**不是**一行 console log。
 */
export function cappedCastLayers(
  present: Iterable<CastSoundLayer>,
  abilityId: string | undefined,
  cap: AudioCastLayerCap,
): CastSoundLayer[] {
  const allowed = allowedCastLayers(present, abilityId, cap);
  return ordered(present).filter((l) => !allowed.has(l));
}
