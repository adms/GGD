import { z } from "zod";
import { NORMAL_BANDS, NORMALIZED_STAT_KEYS } from "../statNormalization";

/** Main's band-only override contract, shared with hero authoring. */
const zBandOverride = (key: string) => z.enum(NORMAL_BANDS, {
  errorMap: (_issue, ctx) => ({ message: typeof ctx.data === "number"
    ? `statOverrides.${key} 是算好的值（${ctx.data}）—— 這一格只收級別名（${NORMAL_BANDS.join("/")}），值在載入時從 stat-normalization 解析，⛔ 不烘進文件`
    : `statOverrides.${key} 只收級別名（${NORMAL_BANDS.join("/")}），收到 ${JSON.stringify(ctx.data)}` }),
}).optional();
export const zChampionStatOverrides = z.object(Object.fromEntries(
  NORMALIZED_STAT_KEYS.map((key) => [key, zBandOverride(key)]),
) as Record<(typeof NORMALIZED_STAT_KEYS)[number], ReturnType<typeof zBandOverride>>).strict();
export type ChampionStatOverrides = z.infer<typeof zChampionStatOverrides>;

/** Empty legacy containers carry no choices. Never quantize nonempty numbers. */
export function normalizeEmptyLegacyStatOverrides(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, entry]) => ["baseStats", "growth", "attributes"].includes(key)
    && entry !== null && typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0) ? {} : value;
}

export function hasLegacyStatOverrides(value: unknown): boolean {
  return !!value && typeof value === "object" && ["baseStats", "growth", "attributes"].some((key) => key in value);
}
