import coverage from "../../../../docs/editor-contract/ggd-editor-coverage.json";

interface OwnerOnlyEntry {
  readonly name: string;
  readonly owner: string;
  readonly why: string;
}

const entries = (coverage as { ownerOnly?: OwnerOnlyEntry[] }).ownerOnly ?? [];

/** Contract-backed fields that the local editor may inspect but may not change. */
export function ownerOnlyReasons(owner: string | undefined): ReadonlyMap<string, string> {
  if (!owner) return new Map();
  return new Map(
    entries
      .filter((entry) => entry.owner === owner)
      .map((entry) => [entry.name, entry.why] as const),
  );
}

export function ownerOnlyEntries(): readonly OwnerOnlyEntry[] {
  return entries;
}
