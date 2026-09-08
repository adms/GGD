import { Models, type ModelDoc } from "@ggd/shared/content";
import { ensureContentLoaded } from "./bootContent";

/** Preview the same validated model version as combat. Restored instances exist
 * in the durable overlay, so fetching only the shipped JSON loses them. */
export async function readPreviewModelDoc(modelKey: string): Promise<ModelDoc | null> {
  await ensureContentLoaded();
  const current = Models.tryGet(modelKey);
  if (current) return current;
  // Standalone shop models can be outside the boot catalog.
  const response = await fetch(`/content/models/${encodeURIComponent(modelKey)}.json`);
  return response.ok ? await response.json() as ModelDoc : null;
}
