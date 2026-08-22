import { z } from "zod";
import { zId } from "../common";
import { ARCHETYPES, BAND_VALUE_MAX, SCALE_KEYS, BAND_VALUE_MIN, DEFAULT_STAT_NORMALIZATION, NORMAL_BANDS, NORMALIZED_STAT_KEYS, ORIGINS, STAT_NORMALIZATION_DOC_ID } from "../../statNormalization";

/** 三格的數值（小/中/大）。⛔ 極小/極大不在這裡 —— 它們是硬上下限，住 stat-caps。 */
const zBandName = () => z.enum(["極小", "小", "中", "大", "極大"] as const);

const zNormBandValues = z
  .object(Object.fromEntries(NORMAL_BANDS.map((b) => [b, z.number().finite().min(BAND_VALUE_MIN).max(BAND_VALUE_MAX)])) as Record<string, z.ZodNumber>)
  .strict();

/** 四個角色定位各落在哪一格。 */
const zNormArchetypeBands = z
  .object(Object.fromEntries(ARCHETYPES.map((a) => [a, zBandName()])) as Record<string, ReturnType<typeof zBandName>>)
  .strict();

/** 十格出身表的一列。⭐ 允許只填一部分（沒填的退回四格那張）。 */
const zNormOriginBands = z
  .object(Object.fromEntries(ORIGINS.map((o) => [o, zBandName().optional()])) as Record<string, z.ZodOptional<ReturnType<typeof zBandName>>>)
  .strict();

/**
 * config.stat-normalization@1 — 英雄屬性正規化（owner 2026-08-12，第三版）。
 *
 * ⭐ owner：「你要重新寫出**定位 10 種**如何影響**極小小中大極大**的**所有屬性**」
 * → 十格出身 × 十項屬性 × 五格級距。⛔ `range` 不在裡面（雙峰，型別不是級別）。
 *
 * ⚠️ 前兩版的說明（「只套用移速與魔抗」「極小/極大不是格是上下限」）**已經失效**，
 * 那是我把範圍讀窄了 —— owner 2026-08-12：「出身跟定位**是影響所有屬性**不是這幾項而已」。
 */
export const zConfigStatNormalizationDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stat-normalization@1"),
    note: z.string().optional(),
    mode: z.enum(["normalized", "legacy"]),
    /**
     * 這一版真的套用的屬性。
     * ⚠️ `range` 自 2026-08-16 起**在 `NORMALIZED_STAT_KEYS` 裡**（第 11 項），
     * 但要不要真的套用仍由這一格決定 —— 見 `statNormalization.ts` 的
     * `bandsByScale`（雙峰要兩把階梯）與 `DEFAULT_STAT_NORMALIZATION.appliesTo`。
     */
    appliesTo: z.array(z.enum(NORMALIZED_STAT_KEYS)).max(NORMALIZED_STAT_KEYS.length),
    /** 每一項的**五格**數值。⭐ 由「中」× 階梯推出來，⛔ 不手打。 */
    bands: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zNormBandValues])) as Record<string, typeof zNormBandValues>)
      .strict(),
    /**
     * ⭐ 分成**兩把階梯**的屬性（2026-08-16，今天只有 `range`）。
     * 查得到（而且 `scaleByOrigin` 說得出走哪一把）就優先於 `bands`；否則退回單尺。
     *
     * ⚠️ 鍵**只列真的有雙峰的那幾項**（從 `DEFAULT_STAT_NORMALIZATION` 推導），
     * ⛔ 不是全部 11 項都開一格。理由是誠實：對 `ad`／`maxHealth` 這種沒有雙峰的
     * 屬性開一格「近戰/遠程各一把」，等於在後台長出 100 個永遠不該被填的欄位，
     * 而操作者沒有任何線索知道哪些是真的。
     * ⭐ 要新增一項雙階梯屬性本來就得先量出它的兩組錨點（= 改 `DEFAULT`），
     * 所以「schema 跟著 DEFAULT 走」不會擋住任何真實需求。
     */
    bandsByScale: z
      .object(
        Object.fromEntries(
          Object.keys(DEFAULT_STAT_NORMALIZATION.bandsByScale).map((k) => [
            k,
            z
              .object(Object.fromEntries(SCALE_KEYS.map((t) => [t, zNormBandValues])) as Record<string, typeof zNormBandValues>)
              .strict(),
          ]),
        ) as Record<string, z.ZodObject<Record<string, typeof zNormBandValues>>>,
      )
      .partial()
      .strict(),
    /**
     * ⭐ **出身 → 走哪一把尺**（owner 2026-08-16：「依出身套用普攻距離」）。
     * 🔴 ⛔ 不是 `attackType`：owner 那張 49 位的表裡 **10 位**兩者相反。
     * 缺一格出身 ⇒ 那個出身退回單尺 `bands`。
     */
    scaleByOrigin: z
      .object(
        Object.fromEntries(
          Object.keys(DEFAULT_STAT_NORMALIZATION.scaleByOrigin).map((k) => [
            k,
            z
              .object(Object.fromEntries(ORIGINS.map((o) => [o, z.enum(SCALE_KEYS).optional()])) as Record<string, z.ZodOptional<z.ZodEnum<["melee", "ranged"]>>>)
              .strict(),
          ]),
        ) as Record<string, z.ZodObject<Record<string, z.ZodOptional<z.ZodEnum<["melee", "ranged"]>>>>>,
      )
      .partial()
      .strict(),
    /** 四格定位表 —— owner 2026-08-12 逐字給的，留著當退路。 */
    byArchetype: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zNormArchetypeBands])) as Record<string, typeof zNormArchetypeBands>)
      .strict(),
    /** ⭐ 十格出身表，**優先於**上面那張。 */
    byOrigin: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zNormOriginBands])) as Record<string, typeof zNormOriginBands>)
      .strict(),
    /** 每一項寫進哪個通道。⚠️ `ms` 出貨走 `baseStats` 是量出來的機制限制。 */
    channel: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, z.enum(["baseStats", "growth"] as const)])) as Record<string, z.ZodEnum<["baseStats", "growth"]>>)
      .strict(),
    referenceLevel: z.number().int().min(2).max(99),
    /** 變身態往上位移幾格。出貨 1（本體中 → 變身大）。⛔ 0 = 變身與本體同級。 */
    transformBandShift: z.number().int().min(-4).max(4),
    allowNegativeGrowth: z.boolean(),
    skipTransformedBodies: z.boolean(),
  })
  .strict();

export const DEFAULT_STAT_NORMALIZATION_DOC = {
  id: STAT_NORMALIZATION_DOC_ID,
  schema: "config.stat-normalization@1",
  mode: DEFAULT_STAT_NORMALIZATION.mode,
  appliesTo: DEFAULT_STAT_NORMALIZATION.appliesTo,
  bands: DEFAULT_STAT_NORMALIZATION.bands,
  byArchetype: DEFAULT_STAT_NORMALIZATION.byArchetype,
  channel: DEFAULT_STAT_NORMALIZATION.channel,
  referenceLevel: DEFAULT_STAT_NORMALIZATION.referenceLevel,
  allowNegativeGrowth: DEFAULT_STAT_NORMALIZATION.allowNegativeGrowth,
  skipTransformedBodies: DEFAULT_STAT_NORMALIZATION.skipTransformedBodies,
} as const;
