import { z } from "zod";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { MODEL_UPLOAD_LIMITS } from "@ggd/shared/content/modelUpload/glb";
import { HERO_MODEL_STATES, type UploadedHeroModel } from "@ggd/shared/content/modelUpload/heroModelSchema";
import { contentSha256 } from "@ggd/shared/content/import/jcs";

export const zHeroModelFile = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().min(1).max(255), bytes: z.number().int().positive().max(MODEL_UPLOAD_LIMITS.fileBytes) }).strict();
export type HeroModelFile = z.infer<typeof zHeroModelFile>;
export const zHeroModelDraft = z.object({
  active: z.boolean(), originals: z.array(zHeroModelFile).min(1).max(5), working: zHeroModelFile,
  selections: z.object({ idle: z.number().int().min(-1), run: z.number().int().min(-1), attack: z.number().int().min(-1), cast: z.number().int().min(-1), hurt: z.number().int().min(-1), death: z.number().int().min(-1) }).strict(),
  yawOffsetDeg: z.number().finite().min(-360).max(360), appliedFingerprint: z.string().optional(),
}).strict().refine((draft) => new Set(draft.originals.map((file) => file.sha256)).size === draft.originals.length && draft.originals.reduce((sum, file) => sum + file.bytes, 0) <= 64 * 1024 * 1024, "模型與動作庫原檔不得重複，合計最多 64 MiB。");
export type HeroModelDraft = z.infer<typeof zHeroModelDraft>;
export const emptyModelSelections = () => Object.fromEntries(HERO_MODEL_STATES.map((state) => [state, -1])) as HeroModelDraft["selections"];
export function modelDraftFingerprint(draft: HeroModelDraft): string { return contentSha256({ working: draft.working.sha256, selections: draft.selections, yawOffsetDeg: draft.yawOffsetDeg }); }
export function heroModelFileRefs(value: { modelDraft?: HeroModelDraft; project: { presentation: { uploadedModel?: UploadedHeroModel } } }): HeroModelFile[] {
  const draft = value.modelDraft ? zHeroModelDraft.parse(value.modelDraft) : undefined, model = value.project.presentation.uploadedModel;
  const refs = [...draft ? [...draft.originals, draft.working] : [], ...model ? [{ sha256: model.sha256, bytes: model.byteSize, name: "hero-body.glb" }] : []];
  const unique = new Map<string, HeroModelFile>();
  for (const raw of refs) { const ref = zHeroModelFile.parse(raw); if (unique.has(ref.sha256) && unique.get(ref.sha256)!.bytes !== ref.bytes) throw new Error("模型草稿中的同一版本大小不一致。"); unique.set(ref.sha256, ref); }
  return [...unique.values()];
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("瀏覽器未提供本機模型儲存功能。"));
    const request = indexedDB.open("ggd-editor-model-assets", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onerror = () => reject(request.error ?? new Error("無法開啟模型儲存空間。"));
    request.onblocked = () => reject(new Error("模型儲存空間正被其他分頁使用，請稍後重試。"));
    request.onsuccess = () => resolve(request.result);
  });
}
export async function saveHeroModelBytes(bytes: Uint8Array, name: string): Promise<HeroModelFile> {
  const ref = zHeroModelFile.parse({ sha256: sha256Bytes(bytes), name: name.slice(0, 255), bytes: bytes.length });
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(new Blob([Uint8Array.from(bytes)], { type: "model/gltf-binary" }), ref.sha256);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("模型保存失敗，請確認裝置儲存空間。")); };
  });
  return ref;
}
export async function loadHeroModelBytes(sha256: string): Promise<Uint8Array> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("模型版本格式錯誤。");
  const db = await database();
  const blob = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction("files", "readonly"), request = tx.objectStore("files").get(sha256);
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("無法讀取模型原檔。")); };
  });
  if (!(blob instanceof Blob) || blob.size > MODEL_UPLOAD_LIMITS.fileBytes) throw new Error("此模型尚未保存在本機，請開啟完整作品備份或重新選檔。");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (sha256Bytes(bytes) !== sha256) throw new Error("本機模型版本完整性檢查失敗。");
  return bytes;
}
