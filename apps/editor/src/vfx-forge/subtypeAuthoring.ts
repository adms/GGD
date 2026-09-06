import type { VfxScriptAuthoredDoc, VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { VfxSubtypeDoc } from "@ggd/shared/content/schema/vfxSubtype";
import { expandVfxScriptDoc } from "@ggd/shared/content/vfxSubtypes/expand";

/** Map expanded tracks back to their authoring entry without replacing calls. */
export function authoredTimeline(script: VfxScriptAuthoredDoc, subtypes: readonly VfxSubtypeDoc[]) {
  const catalog = new Map(subtypes.map((doc) => [doc.id, doc]));
  const expanded: VfxScriptDoc = { ...script, segments: [] };
  const owners: number[] = [];
  const errors: string[] = [];
  script.segments.forEach((entry, index) => {
    try {
      const result = expandVfxScriptDoc({ ...script, segments: [entry] }, (id) => catalog.get(id));
      expanded.segments.push(...result.segments);
      owners.push(...result.segments.map(() => index));
    } catch (error) { errors.push(`第 ${index + 1} 段：${String(error)}`); }
  });
  return { expanded, owners, errors };
}
