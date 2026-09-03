import type { AbilityTemplateBinding } from "@ggd/shared/content";
import {
  mergeExpansion,
  type ExpandResult,
} from "@ggd/shared/content/templates/expand";
import { resolveRuntimeDraft } from "./resolveRuntimeDraft";
import type { RuntimeResolverConfigDocs } from "./skillTierCatalog";

const VISUAL_FIELDS = ["vfxKey", "vfxLayers"] as const;

/**
 * Build the ability consumed by the Forge's real Sim preview.
 *
 * The document returned by content-api is the authoring shape. It may legally
 * contain `spawnModelFx.preset`, tier names and combo-family names that only
 * `registerAll()` expands. Feeding that raw shape straight into Sim is a false
 * preview. Start from the already-registered runtime ability, apply the draft
 * template expansion, then copy the VFX-layer fields that this screen edits.
 * The authoring document itself remains untouched and is still what writeback
 * diffs against.
 */
export function runtimePreviewDoc(
  authoringDoc: Readonly<Record<string, unknown>>,
  registeredDoc: Readonly<Record<string, unknown>>,
  expansion: ExpandResult,
  binding: AbilityTemplateBinding,
  templates: ReadonlyMap<string, import("@ggd/shared/content").TemplateDoc>,
  configs: RuntimeResolverConfigDocs,
): Record<string, unknown> {
  const merged = mergeExpansion({ ...registeredDoc, template: binding }, expansion);
  for (const field of VISUAL_FIELDS) {
    if (authoringDoc[field] === undefined) delete merged[field];
    else merged[field] = authoringDoc[field];
  }
  return resolveRuntimeDraft(merged, templates, configs);
}
