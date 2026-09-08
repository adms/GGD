import { inspectModelUpload } from "@ggd/shared/content/modelUpload/inspect";
import { mergeModelAnimations } from "@ggd/shared/content/modelUpload/compose";
import { prepareUploadedHeroModel, verifyUploadedHeroModel } from "@ggd/shared/content/modelUpload/heroModel";
import type { ModelUploadJob, ModelUploadResult } from "./modelUploadJob";

self.onmessage = async (event: MessageEvent<ModelUploadJob>) => {
  try {
    const job = event.data;
    let result: ModelUploadResult;
    if (job.kind === "inspect") result = { summary: await inspectModelUpload(job.bytes, job.assetKind), warnings: [] };
    else if (job.kind === "merge") { const merged = await mergeModelAnimations(job.bytes, job.library, job.selected); result = { summary: merged.inspected, bytes: merged.bytes, warnings: [] }; }
    else if (job.kind === "prepare") { const prepared = await prepareUploadedHeroModel(job.bytes, job.selections, job.yawOffsetDeg); result = { summary: prepared.inspected, bytes: prepared.bytes, model: prepared.model, document: prepared.document, warnings: prepared.warnings }; }
    else { const verified = await verifyUploadedHeroModel(job.model, job.bytes); result = { summary: verified.inspected, model: verified.model, document: verified.document, warnings: verified.warnings }; }
    const { sha256, clips, meshes, triangles } = result.summary;
    result.summary = { sha256, clips, meshes, triangles };
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
