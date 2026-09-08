import { zHeroProject } from "../heroForge/schema";
import { zEditorImportPackage } from "./packageSchema";
import type { HeroPackageCatalog } from "./heroPackage";
import { uploadedHeroModelPath } from "../modelUpload/heroModelSchema";
import { verifyUploadedHeroModel } from "../modelUpload/heroModel";

/** Per-request catalog overlay. No global approval, disk write, or shipping mutation. */
export async function withUploadedHeroModel(catalog: HeroPackageCatalog, rawProject: unknown, rawPackage: unknown): Promise<HeroPackageCatalog> {
  const project = zHeroProject.parse(rawProject), model = project.presentation.uploadedModel;
  if (!model) return catalog;
  const pkg = zEditorImportPackage.parse(rawPackage), path = uploadedHeroModelPath(model);
  const candidates = pkg.assets.filter((asset) => asset.path.startsWith("assets/models/community/"));
  const asset = candidates[0];
  if (candidates.length !== 1 || !asset || asset.path !== path || !(asset.bytes instanceof Uint8Array)) throw new Error("完整英雄需包含唯一且相符的上傳 GLB。");
  const verified = await verifyUploadedHeroModel(model, asset.bytes);
  if (project.presentation.modelKey !== verified.document.id) throw new Error("英雄模型身分與動作對應不符。");
  if (catalog.documents.has(`models/${verified.document.id}`)) throw new Error("上傳模型不能覆蓋既有內容目錄。");
  const documents = new Map(catalog.documents);
  documents.set(`models/${verified.document.id}`, verified.document);
  const bytes = asset.bytes.slice();
  return { ...catalog, documents, validatedUploadedModel: { projectId: project.projectId, model: verified.model }, readAsset: (requested) => requested === path ? bytes : catalog.readAsset(requested) };
}
