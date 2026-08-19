/**
 * W3X FAMILY ART — the abilities whose art the ORIGINAL map PROVES, bound to a
 * parameterised family prototype instead of to a one-off effect.
 *
 * WHY THIS IS A SECOND TABLE AND NOT MORE ROWS IN `w3xAbilityArt`.
 * `w3xAbilityArtRows()` promotes the 34 abilities whose art SHIPPED as real emitter
 * docs (`fx.w3x.*` / `godie-*`), extracted byte-exact from models the map
 * imported. Those rows name a concrete doc and their content `vfxKey` is that
 * doc — `w3xAbilityArt.test.ts` asserts exactly that.
 *
 * Every family below is a BLIZZARD STOCK model (`WarStompCaster.mdl`,
 * `BlinkTarget.mdl`, …). This repo does not have those files and cannot ship
 * them (#81/#116), so there is no doc to name. What the import DOES prove is
 * WHICH stock effect the author reached for, and — this is the owner's own
 * reading — the author was reaching for a SHAPE he then rescaled and recoloured:
 *
 *   「WarStompCaster 常拿來放大/縮小、改變顏色/透明度後用於
 *     Saber 約束勝利之劍 等衝擊波特效」
 *   「請你盡量用編輯器的方式，彈性調整方式複用」
 *
 * So a row here binds an ability to a family PROTOTYPE (`w3xArtFamilies.ts`)
 * plus the per-invocation numbers the map really stored for that call site.
 * 33 stock models collapse into 21 prototypes; nothing here is a bespoke effect.
 *
 * PROVENANCE — every row is DERIVED, never guessed. Source:
 *   · `tools/w3x-import/out/vfx-census/MODEL_USAGE.json` (L1's model → reference
 *     inverse index: w3a/w3h/w3u overrides, JASS literals, JASS spawns, and
 *     Blizzard base-ability inheritance, with the map's 204 deliberately-CLEARED
 *     art cells excluded so inheritance cannot invent what the author deleted)
 *   · `tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json` `ggdDocIndex`
 *     (GGD ability doc id → w3x rawcode). ONLY `CONFIRMED` links are used;
 *     `INFERRED` ones are dropped.
 * ⭐ **GH#384：那 258 列住在 `content/config/vfx-ability-art.json` 的
 * `bindings.<id>.family`，⛔ 不再是這個檔裡的常數。** 它們是內容：改一支技能的
 * 特效以前要重建 client 映像（client 是 build 時烘進去的），而 `content/` 是
 * live bind-mount；而且**外部編輯器看不到 TypeScript 常數，也不會知道自己漏了**。
 *
 * ⭐ 反捏造守衛一格都沒有變，只是換了比對對象：推導本身抽成
 * `deriveW3xFamilyArt.ts`（⛔ 一份，兩個呼叫端），
 * `generateAbilityArtContent.ts` 用它**寫**content，
 * `w3xFamilyArt.test.ts` 用它**比對** content —— 手改一列就是紅的，
 * 而現在還多了一條 `--check`（⛔ 沒有時間戳，見那支腳本的檔頭）。
 *
 * WHAT THE NUMBERS MEAN.
 *   · `scale` / `tint` / `flyHeight` are the map's OWN per-invocation values
 *     (`SetUnitScalePercent`, the dummy unit's `uclr/uclg/uclb`, `SetUnitFlyHeight`).
 *     ABSENT means the map did not state one — NOT that it stated 1.0. The
 *     family default applies and the row says so via `paramSource`.
 *   · `paramSource: "ref"` = read off this call site. `"model"` = the model has
 *     exactly ONE distinct value across all 3682 references, so the call site is
 *     unambiguous even though this ref did not carry it. Anything with more than
 *     one candidate value is left ABSENT rather than averaged.
 *   · `anchor` is the WC3 attachment string as authored ("chest", "origin",
 *     "right,hand"), passed through verbatim.
 *
 * NO `@babylonjs/*`, no file I/O — importable from Node tests and from the doc
 * generator. The content doc arrives through `abilityArtContent`'s seam (the
 * same one `setFamilyTuning` uses), ⛔ this module never reads a file itself.
 */
import type { W3xArtFamily } from "./w3xArtFamilies";
import { abilityArtRows, onAbilityArtBindingsChanged } from "./abilityArtContent";

/** How the art reached the ability, strongest first. */
export type W3xArtProvenance =
  | "w3a-override"
  | "jass-literal"
  | "jass-spawn"
  | "w3h-override"
  | "stock-inherited";

/** One ability's evidence-bound family prototype + the map's own numbers. */
export interface W3xFamilyArtRow {
  /** the prototype in `w3xArtFamilies.ts` */
  readonly family: W3xArtFamily;
  /** the Blizzard stock model stem the evidence names */
  readonly model: string;
  /** the map's own ability rawcode the evidence hangs on (CONFIRMED link only) */
  readonly w3aId: string;
  readonly provenance: W3xArtProvenance;
  /** the exact channel: a w3a art slot, a buff record, or a JASS call */
  readonly via: string;
  /** WC3 attachment string, verbatim (absent = the effect is not attached) */
  readonly anchor?: string;
  /** the map's own scale multiplier for THIS call site (absent = not stated) */
  readonly scale?: number;
  /** the map's own vertex tint, 0..255 (absent = white, i.e. not stated) */
  readonly tint?: readonly [number, number, number];
  /** the map's own fly height in WC3 units (absent = not stated) */
  readonly flyHeight?: number;
  /** where scale/tint/flyHeight came from; absent when none was stated */
  readonly paramSource?: "ref" | "model";
}

/**
 * 技能 id → 證據列。**資料在 `content/config/vfx-ability-art.json` 的
 * `bindings.<id>.family`**（GH#384），這裡只做讀取與型別收窄。
 *
 * ⛔ 這個函式回的是「內容說了什麼」，⛔ 不是一張常數表 —— 內容還沒載入時它是空的，
 * 而 `abilityArtContent.setAbilityArtBindings` 在那種情況下已經吼過一行了。
 */
export function w3xFamilyArtRows(): Readonly<Record<string, W3xFamilyArtRow>> {
  if (cached) return cached;
  const out: Record<string, W3xFamilyArtRow> = {};
  for (const [abilityId, row] of Object.entries(abilityArtRows())) {
    const f = row.family;
    if (!f) continue;
    out[abilityId] = f as W3xFamilyArtRow;
  }
  cached = out;
  return out;
}

let cached: Readonly<Record<string, W3xFamilyArtRow>> | null = null;
onAbilityArtBindingsChanged(() => {
  cached = null;
});

/** The evidence row for an ability, or undefined when the map proves nothing. */
export function familyArtFor(abilityId: string | undefined): W3xFamilyArtRow | undefined {
  return abilityId ? w3xFamilyArtRows()[abilityId] : undefined;
}

/** How many bound abilities each family carries (for reports + the audition page). */
export function familyArtCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of Object.values(w3xFamilyArtRows())) out[row.family] = (out[row.family] ?? 0) + 1;
  return out;
}
