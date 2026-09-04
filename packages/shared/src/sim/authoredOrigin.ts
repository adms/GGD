/**
 * Resolve the authored ability that owns a presentation-event origin.
 *
 * This is intentionally broader than combat's `abilityIdOfOrigin`: a visual
 * event can be emitted by an ability directly, by its permanent passive, or by
 * a hook carried by a temporary buff.  All three are still authored by one
 * ability and therefore must select the same `vfx-script@1` document.
 *
 * Runtime source ids are nested rather than flattened:
 *
 *   ability:<id>
 *   hook:abilityPassive:<id>
 *   hook:buff:ability:<id>#<instance>
 *   hook:buff:hook:abilityPassive:<id>#<instance>
 *
 * We unwrap only the known source containers.  Item, augment and stack-key
 * origins deliberately return undefined instead of guessing from substrings.
 */
export function abilityIdOfAuthoredOrigin(origin: unknown): string | undefined {
  if (typeof origin !== "string" || origin.length === 0) return undefined;

  let source = origin;
  for (let depth = 0; depth < 8; depth++) {
    if (source.startsWith("ability:")) {
      return nonEmpty(source.slice("ability:".length));
    }
    if (source.startsWith("abilityPassive:")) {
      return nonEmpty(source.slice("abilityPassive:".length));
    }
    if (source.startsWith("abilityToggleOn:")) {
      return nonEmpty(source.slice("abilityToggleOn:".length));
    }
    if (source.startsWith("hook:")) {
      source = source.slice("hook:".length);
      continue;
    }
    if (source.startsWith("buff:")) {
      source = source.slice("buff:".length);
      const instance = source.lastIndexOf("#");
      if (instance >= 0) source = source.slice(0, instance);
      continue;
    }
    return undefined;
  }
  return undefined;
}

function nonEmpty(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}
