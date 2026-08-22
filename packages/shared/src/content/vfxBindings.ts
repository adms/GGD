/**
 * VFX BINDINGS —— 在**載入時**把「這一支技能播原作的哪一組 emitter」從共用表解析出來。
 *
 * ============================================================================
 * 它補的洞(GH#529)
 * ============================================================================
 * owner 2026-08-22:「這些**全部連帶JASS都有跟技能綁定會顯示跟播放音效了嗎**?」
 *
 * 量到的(2026-08-22):420 支技能有 `vfxKey` 的 384 支裡,**342 支(89%)**綁的是
 * `fx.prim.*` 通用原型,只有 24 支綁原作 `fx.w3x.*`;而從 w3x 匯進來的 120 份
 * `fx.w3x.*` emitter 文件裡,只有 15 份被任何一支技能的 `vfxKey` 指到。
 *
 * ⭐ **但那 105 份不是接線漏掉的。** 逐份追下去(`tools/vfx-bind/scan.py`)只有
 * 兩種來源,而且兩種都不是「忘了接」:
 *
 *   · 原作地圖裡**沒有任何技能**引用那個模型(`referencedBy` 是空的)—— 它掛在
 *     單位/道具/裝飾物上。硬接 = 玩家看到一個原作裡根本不屬於這支技能的東西。
 *   · 既有的 **root-anchor 可渲染性閘**(`apps/client/src/render/vfx/w3xAbilityArt.ts`
 *     檔頭,逐字記著量測:`divinering` 20 顆 emitter 掛在 `BlizParticle*` 動畫節點
 *     上,用世界座標重播會**全部從同一點噴出** —— 一團而不是一圈)。
 *
 * ⇒ 這個模組做的事因此**不是**「把 105 份接上去」,而是把那道推導變成一張
 * **會過期就紅**的表:`scan.py --check` 逐位元組比對,證據一動、表就得重生成。
 *
 * ============================================================================
 * ⚠️ 四階覆蓋順序 —— 表是**第三順位**
 * ============================================================================
 * | 階 | 誰 | 為什麼在這 |
 * |---:|---|---|
 * | 1 | 技能文件的 `vfxLayers` | 作者已經明說了整個堆疊,⛔ 沒有任何推導可以覆蓋它 |
 * | 2 | 技能文件的**原作** `vfxKey`(`fx.w3x.*` / `godie-*`) | 那是**人挑過主 emitter** 的(例 `holyawakening` 挑 `p04` 不是 `p00`)。表贏過它 = 用機械規則推翻一個人的判斷 |
 * | 3 | **這張表** | 證據推導出來的整組 emitter |
 * | 4 | 技能文件的 `fx.prim.*` / 空 | 通用原型 / 下游的元素 fallback |
 *
 * ⚠️ 第 2 階的判準是「**是不是原作藝術**」,⛔ 不是「是不是 `fx.w3x.`」——
 * 舊的抽取批次產出的是 `godie-*` 文件(例 `godie-tectonicfury-p0`),出貨的 27 列
 * 裡有 5 列的技能文件正指著它們。漏掉 `godie-` 前綴 = 那 5 支被表換成**另一族**
 * 的特效,而且畫面上看起來完全正常(失敗形態 ②)。
 *
 * ============================================================================
 * ⭐ 沒有命中的一律**原封回傳同一個物件**
 * ============================================================================
 * `resolveAbilityVfxSource()` 在沒有覆蓋時回傳**傳進來的那一個 reference**,
 * ⛔ 不是一份拷貝。所以「這一版之前一位元不差」是靠**物件 identity** 保證的,
 * ⛔ 不是靠比對欄位(同 `abilityVfx.ts` 的 `applyLayerOverrides` 那條 identity 路徑)。
 */
import type { AbilityVfxLayer, AbilityVfxSource } from "./schema/abilityVfx";
import type {
  AbilityVfxBindingRow,
  ConfigAbilityVfxBindingsDoc,
} from "./schema/abilityVfxBindings";

/**
 * 原作藝術的兩個前綴。
 *
 * `fx.w3x.*` 是 #183 的再推導批次,`godie-*` 是更早那一批 —— **兩批都是從地圖模型
 * 逐位元抽出來的**,所以兩個都算「作者的東西」。⛔ 這裡只列前綴,不列 id:
 * 列 id 就是第二個住處。
 */
const ORIGINAL_ART_PREFIXES = ["fx.w3x.", "godie-"] as const;

/** 這個 vfx doc id 是不是**原作藝術**(而不是 `fx.prim.*` 那種通用原型)。 */
export function isOriginalArtVfxKey(key: string | undefined | null): boolean {
  if (!key) return false;
  return ORIGINAL_ART_PREFIXES.some((p) => key.startsWith(p));
}

/** 查表用的索引:技能 id → 那一列。`undefined`/空文件 → 空索引。 */
export type AbilityVfxBindingIndex = ReadonlyMap<string, AbilityVfxBindingRow>;

/** 空索引 —— 內容裡沒有這份 config 時就是它(⇒ 每一支技能都走 identity 路徑)。 */
export const EMPTY_ABILITY_VFX_BINDINGS: AbilityVfxBindingIndex = new Map();

/**
 * 把出貨文件變成查表索引。
 *
 * ⚠️ 同一支技能出現兩列時**保留第一列** —— 產生器已經去過重(一支技能只播一組),
 * 這裡靜靜覆蓋只會把「表壞了」變成「畫面怪怪的」。
 */
export function buildAbilityVfxBindingIndex(
  doc: ConfigAbilityVfxBindingsDoc | null | undefined,
): AbilityVfxBindingIndex {
  if (!doc || doc.bindings.length === 0) return EMPTY_ABILITY_VFX_BINDINGS;
  const out = new Map<string, AbilityVfxBindingRow>();
  for (const row of doc.bindings) {
    if (!out.has(row.abilityId)) out.set(row.abilityId, row);
  }
  return out;
}

/**
 * 一支技能載入時的特效來源 —— 四階覆蓋(見檔頭那張表)。
 *
 * 回傳值直接餵給既有的 `resolveAbilityVfxLayers()`,⛔ 這裡沒有第二套層解析。
 *
 * @param abilityId 技能文件 id
 * @param def       技能文件上的 `{ vfxKey, vfxLayers }`
 * @param index     `buildAbilityVfxBindingIndex()` 的結果
 */
export function resolveAbilityVfxSource<T extends AbilityVfxSource>(
  abilityId: string,
  def: T,
  index: AbilityVfxBindingIndex,
): T | AbilityVfxSource {
  // 階 1 —— 作者寫了整個堆疊
  if (def.vfxLayers && def.vfxLayers.length > 0) return def;
  // 階 2 —— 作者自己挑了原作那一份
  if (isOriginalArtVfxKey(def.vfxKey)) return def;
  // 階 3 —— 表
  const row = index.get(abilityId);
  if (!row) return def; // 階 4 —— `fx.prim.*` / 空,原封不動
  const layers: AbilityVfxLayer[] = row.vfxKeys.map((vfxKey) => ({ vfxKey }));
  return { vfxKey: row.vfxKeys[0]!, vfxLayers: layers };
}

/**
 * 這張表**實際上**會改變幾支技能的畫面 —— 也就是走到階 3 的那幾支。
 *
 * ⚠️ 這不是統計糖:一張 27 列的表如果 25 列都被階 1/2 擋掉,那它的**真實效果是 2**,
 * 而「27」會讓人以為做了 27 支。第一·五守則要的就是不准有「說了但不會發生」的數字。
 */
export function abilityVfxBindingsInEffect(
  defs: ReadonlyMap<string, AbilityVfxSource>,
  index: AbilityVfxBindingIndex,
): readonly string[] {
  const out: string[] = [];
  for (const [abilityId, def] of defs) {
    if (!index.has(abilityId)) continue;
    if (resolveAbilityVfxSource(abilityId, def, index) !== def) out.push(abilityId);
  }
  return out.sort();
}
