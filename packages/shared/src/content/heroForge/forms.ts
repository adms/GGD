import type { AbilityDoc } from "../schema/ability";
import type { ChampionDoc } from "../schema/champion";
import { zIdFor } from "../schema/ref";
import type { ChampionId } from "../../ids";
import { contentSha256 } from "../import/jcs";

/** Stable within the work; never borrows a shipping champion's identity. */
export function heroCounterpartId(heroId: string): string {
  return `${heroId.slice(0, 46)}-alt-${contentSha256(heroId).slice(-12)}`;
}

/** Inspect executable nodes, not template names or authoring metadata. */
export function heroNeedsCounterpart(abilities: readonly AbilityDoc[]): boolean {
  const contains = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(contains);
    if (!value || typeof value !== "object") return false;
    const node = value as Record<string, unknown>;
    return node.kind === "championForm" || Object.values(node).some(contains);
  };
  return abilities.some((ability) => contains([ability.effects, ability.passive, ability.marks]));
}

/** A generated form inherits the kit and appearance; buffs remain skill effects. */
export function instantiateHeroBodies(source: ChampionDoc, needsCounterpart: boolean): {
  champion: ChampionDoc; relatedChampions: ChampionDoc[];
} {
  const { transform: _generatedLink, ...base } = source;
  if (!needsCounterpart) return { champion: base, relatedChampions: [] };
  const alternateId = zIdFor<ChampionId>().parse(heroCounterpartId(base.id));
  return {
    champion: { ...structuredClone(base), transform: { role: "base", counterpartId: alternateId } },
    relatedChampions: [{
      ...structuredClone(base), id: alternateId, name: `${base.name}（變身）`,
      transform: { role: "alternate", counterpartId: base.id },
    }],
  };
}
