import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { api, type WriteResult } from "../api/client";

export interface VfxScriptWriter {
  put(collection: "vfx-scripts", id: string, doc: VfxScriptDoc): Promise<WriteResult>;
  create?(collection: "vfx-scripts", id: string, doc: VfxScriptDoc): Promise<WriteResult>;
}

/** The only write seam owned by VFX Forge. Its collection cannot be varied. */
export async function writeVfxScript(
  input: unknown,
  writer: VfxScriptWriter = api as VfxScriptWriter,
  mode: "put" | "create" = "put",
): Promise<WriteResult> {
  const doc = zVfxScriptDoc.parse(input);
  if (mode === "create") {
    if (!writer.create) throw new Error("VFX script writer does not support create");
    return writer.create("vfx-scripts", doc.id, doc);
  }
  return writer.put("vfx-scripts", doc.id, doc);
}
