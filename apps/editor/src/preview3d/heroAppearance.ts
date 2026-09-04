import { resolveModelTint, type ModelTint } from "../../../client/src/render/views/modelTint";

export interface EffectiveHeroAppearance extends ModelTint {
  readonly modelKey: string;
  readonly relativeScale: number;
}

interface ChampionAppearanceSource extends ModelTint {
  readonly id: string;
  readonly modelKey: string;
  readonly bodyScale?: number;
}

interface SkinAppearanceSource extends ModelTint {
  readonly championId: string;
  readonly modelKey: string;
}

/**
 * The editor-side view of the same field-by-field composition the game draws.
 * A skin may replace tint without replacing alpha (or vice versa); spreading
 * the skin object wholesale would silently discard the surviving champion field.
 */
export function effectiveHeroAppearance(
  champion: ChampionAppearanceSource,
  skin?: SkinAppearanceSource | null,
): EffectiveHeroAppearance {
  if (skin && skin.championId !== champion.id) {
    throw new Error(`skin belongs to ${skin.championId}, not ${champion.id}`);
  }
  const tint = resolveModelTint(champion, skin);
  return {
    modelKey: skin?.modelKey ?? champion.modelKey,
    relativeScale: champion.bodyScale ?? 1,
    ...(tint ?? {}),
  };
}
