import { abilityIdOfAuthoredOrigin } from "@ggd/shared/sim";

/**
 * Resolve the ability that owns a real SimWorld event provenance.
 *
 * Direct casts use `ability:<id>`. Hooks preserve their actual source so a
 * passive or temporary buff becomes `hook:abilityPassive:<id>` or
 * `hook:buff:ability:<id>#<instance>`. The editor recognises those shapes when
 * reading a trace, but never rewrites the event before runtime sees it.
 */
export function abilityIdOfEventOrigin(origin: unknown): string | null {
  return abilityIdOfAuthoredOrigin(origin) ?? null;
}

export function eventOriginBelongsToAbility(origin: unknown, abilityId: string): boolean {
  return abilityIdOfEventOrigin(origin) === abilityId;
}

/** The shipped player and editor both consume the shared provenance parser. */
export function currentPlayerCanResolveEventOrigin(origin: unknown): boolean {
  return abilityIdOfAuthoredOrigin(origin) !== undefined;
}
