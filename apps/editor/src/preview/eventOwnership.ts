/**
 * Resolve the ability that owns a real SimWorld event provenance.
 *
 * Direct casts use `ability:<id>`. Hooks preserve their actual source so a
 * passive or temporary buff becomes `hook:abilityPassive:<id>` or
 * `hook:buff:ability:<id>#<instance>`. The editor recognises those shapes when
 * reading a trace, but never rewrites the event before runtime sees it.
 */
export function abilityIdOfEventOrigin(origin: unknown): string | null {
  if (typeof origin !== "string") return null;
  if (origin.startsWith("ability:")) return origin.slice("ability:".length) || null;
  if (origin.startsWith("hook:abilityPassive:")) {
    return origin.slice("hook:abilityPassive:".length) || null;
  }
  const buffPrefix = "hook:buff:ability:";
  if (origin.startsWith(buffPrefix)) {
    const source = origin.slice(buffPrefix.length);
    const instance = source.lastIndexOf("#");
    return (instance < 0 ? source : source.slice(0, instance)) || null;
  }
  return null;
}

export function eventOriginBelongsToAbility(origin: unknown, abilityId: string): boolean {
  return abilityIdOfEventOrigin(origin) === abilityId;
}

/** Current main VfxScriptPlayer only accepts this narrower provenance. */
export function currentPlayerCanResolveEventOrigin(origin: unknown): boolean {
  return typeof origin === "string" && origin.startsWith("ability:");
}
