/**
 * 多層特效模板 · 執行期讀取端 (#205 / #230).
 *
 * `packages/shared/src/content/schema/abilityVfx.ts` 定義「一支技能可以疊哪些
 * 層」;這個檔案把那些層變成**真的送進 `VfxSystem.play()` 的東西** —— 一份
 * 改過參數的 `VfxDoc` + 一個世界座標 + 一個延遲。
 *
 * ---------------------------------------------------------------------------
 * 為什麼參數不是在這裡重新算一次
 * ---------------------------------------------------------------------------
 * `applyArtParams`(`./artParams.ts`, task #50)已經是「把 scale / tint /
 * alpha / timeScale 套到一份 VfxDoc 上」的那一份實作,而且它有 identity
 * fast-path:**沒有任何 doc 層級的參數時,原封不動回傳同一個物件**。
 * 這裡只做欄位翻譯(schema 的 `w3xScale` / `tint`(0–255)/ `flyHeight`
 * (WC3 單位)→ `ArtParams` 的 `scale` / `tint`(0–1)/ `heightY`),乘法本身
 * 一次都沒有被重寫。少一份實作 = 少一個會漂的地方。
 *
 * ⚠️ 向後相容靠的是 **identity**,不是靠比對欄位:646 支只有 `vfxKey` 的技能
 * 解析出來的層 `overrides === undefined`,`applyLayerOverrides` 直接
 * `return doc` —— 同一個物件 reference,所以 pool key、粒子參數、
 * `frontLoadDoc` 的 memo cache 全部命中原本那一格。升級前後一位元不差。
 * `abilityLayers.test.ts` 用 `toBe`(reference 相等)釘住這件事。
 */
import type { VfxDoc } from "@ggd/shared/content";
import {
  ABILITY_VFX_LAYER_OVERRIDE_FIELDS,
  clampMaxAbilityVfxLayers,
  resolveAbilityVfxLayers,
  type AbilityVfxLayerOverride,
  type AbilityVfxSource,
  type ResolvedVfxLayer,
} from "@ggd/shared/content/schema/abilityVfx";
import { applyArtParams, type ArtParams } from "./artParams";

export type { ResolvedVfxLayer };

/**
 * WC3 飛行高度 → 世界單位。128 WC3 單位 = 1 世界單位,和
 * `zVfxAbilityFamilyBinding.flyHeight` 的欄位說明同一個換算(那句話是 w3u 的
 * 事實,不是這裡挑的比例)。
 */
export const WC3_UNITS_PER_WORLD_UNIT = 128;

/**
 * 一層沒有講高度時播在哪 —— `VfxSystem.play()` 的 `y` 預設值,也就是升級前
 * 每一次施法特效的高度。動它就等於把 646 支技能的特效整體上下平移。
 */
export const DEFAULT_LAYER_HEIGHT_Y = 1.0;

/** schema 覆寫欄位 → `ArtParams`。這是唯一一處翻譯,乘法在 artParams 裡。 */
function artParamsOf(o: AbilityVfxLayerOverride): ArtParams {
  const p: ArtParams = {};
  if (o.w3xScale !== undefined) p.scale = o.w3xScale;
  if (o.alpha !== undefined) p.alpha = o.alpha;
  if (o.timeScale !== undefined) p.timeScale = o.timeScale;
  if (o.tint !== undefined) p.tint = [o.tint[0] / 255, o.tint[1] / 255, o.tint[2] / 255];
  if (o.flyHeight !== undefined) p.heightY = o.flyHeight / WC3_UNITS_PER_WORLD_UNIT;
  // #366 方位。⚠️ 這兩格**改 doc**(折進 `orient`),不像 `flyHeight` 只是空間參數 ——
  // 所以它們會走 `applyVfxOverrides` 的換 pool key 那條路,兩支朝不同方向的同一招
  // 才不會借到對方那個已經建好的 ParticleSystem(故障 ③)。
  if (o.facingDeg !== undefined) p.facingDeg = o.facingDeg;
  if (o.pitchDeg !== undefined) p.pitchDeg = o.pitchDeg;
  return p;
}

/**
 * 這一層要播的文件。零覆寫 → **回傳傳進來的那個物件本身**(見檔頭)。
 *
 * ⚠️ 有覆寫時 id 會被改成 `<id>#<簽章>`。這不是裝飾:`VfxSystem` 的粒子池是
 * **用 doc.id 當 key** 的,兩層若共用 id,第二層會借到第一層那個已經按舊參數
 * 建好的 `ParticleSystem`,結果就是「兩層設了不同大小、畫面上一模一樣」——
 * 故障 ③ 的完美形狀(刪掉覆寫,測試還是綠)。簽章由覆寫值本身算出來,所以同樣
 * 的覆寫仍然共用同一格池,不會每次施法都長一個新 system。
 */
export function applyLayerOverrides(doc: VfxDoc, layer: ResolvedVfxLayer): VfxDoc {
  const o = layer.overrides;
  if (o === undefined) return doc;
  return applyVfxOverrides(doc, o);
}

/**
 * 同一件事,但給**家族綁定那張表**的 per-ability 覆寫用 (#205).
 *
 * `config.vfx-families@1.abilities.<id>.alpha` / `.timeScale` 在 2026-07-30 之前
 * 是死旋鈕:後台驗了、存了,而 `W3xAbilityArt` 這個介面沒有欄位放它們,所以
 * `familyRow()` 一行之內就把它們丟掉了(第②號故障)。接上去的時候刻意**不**另寫
 * 一份乘法 —— 走的就是上面那一支,連「改過參數的 doc 要換 pool key」這條規則都
 * 共用。兩份實作 = 兩個會漂的地方。
 *
 * ⚠️ 全部欄位都 undefined 時**回傳同一個物件**(不是拷貝)。沒有被操作者碰過的
 * 技能因此走的是升級前一位元不差的那條路,而那是靠物件 identity 保證的。
 */
export function applyVfxOverrides(doc: VfxDoc, o: AbilityVfxLayerOverride): VfxDoc {
  const params = artParamsOf(o);
  const out = applyArtParams(doc, params);
  // applyArtParams 也有 identity 路徑(例如只給了 flyHeight —— 那是空間參數,
  // 不改 doc)。那種情況同樣不該改 id,否則會憑空多開一格池。
  if (out === doc) return doc;
  return { ...out, id: `${doc.id}#${overrideSignature(o)}` };
}

/** 覆寫值的穩定簽章 —— 同樣的覆寫得到同樣的池 key。 */
function overrideSignature(o: AbilityVfxLayerOverride): string {
  const parts: string[] = [];
  for (const f of ABILITY_VFX_LAYER_OVERRIDE_FIELDS) {
    const v = o[f];
    if (v === undefined) continue;
    parts.push(`${f}=${Array.isArray(v) ? v.join(".") : String(v)}`);
  }
  return parts.join(",");
}

/** 這一層播在哪個世界高度(`VfxSystem.play` 的 `y`)。 */
export function layerHeightY(layer: ResolvedVfxLayer): number {
  const fly = layer.overrides?.flyHeight;
  return fly === undefined ? DEFAULT_LAYER_HEIGHT_Y : fly / WC3_UNITS_PER_WORLD_UNIT;
}

/**
 * 這一層播在哪個 xz。
 *
 * `attachTo: "point"` 沒有落點時退回施法者 —— self / dash 這類 castType 的
 * `abilityCast` 事件本來就不帶 `point`,退回原點會把特效丟到地圖中央(#131 那
 * 類「畫在畫面外」的故障 ①)。
 */
export function layerPosition(
  layer: ResolvedVfxLayer,
  caster: { x: number; z: number },
  point: { x: number; z: number } | null | undefined,
): { x: number; z: number } {
  if (layer.attachTo === "point" && point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
    return point;
  }
  return caster;
}

/**
 * 一支技能施法時的完整層堆疊。
 *
 * `maxLayers` 來自後台(`config.vfx-families@1.maxAbilityVfxLayers`),經
 * `clampMaxAbilityVfxLayers` 夾進 [1, HARD_CAP] —— 所以後台打錯字也塞不爆
 * GPU,而 HARD_CAP 本身是釘在 `emitterBudget` 的畫面預算上的。
 */
export function castLayersFor(
  def: AbilityVfxSource | null | undefined,
  maxLayers?: number,
): ResolvedVfxLayer[] {
  return resolveAbilityVfxLayers(def, clampMaxAbilityVfxLayers(maxLayers));
}

// ---------------------------------------------------------------------------
// 後台可調的層數上限 —— 由組合根安裝,和 `setFamilyTuning` 同一條路
// ---------------------------------------------------------------------------

let activeMaxLayers: number | undefined;

/**
 * 裝上(或清掉)後台的層數上限。傳 undefined = 回到出貨預設。
 *
 * 和 `w3xAbilityArt.setFamilyTuning` 一樣由讀 `config.vfx-families@1` 的那個
 * 地方呼叫,所以後台存檔之後下一次施法就生效,不用重整。
 */
export function setMaxAbilityVfxLayers(v: number | undefined): void {
  activeMaxLayers = v;
}

/** 目前生效的層數上限(後台的值,沒有就是出貨預設)。 */
export function maxAbilityVfxLayers(): number {
  return clampMaxAbilityVfxLayers(activeMaxLayers);
}
