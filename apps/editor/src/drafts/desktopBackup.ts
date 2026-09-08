import { sha256Hex, sha256Bytes } from "@ggd/shared/content/sha256";
import { MODEL_UPLOAD_LIMITS, parseUploadGlb } from "@ggd/shared/content/modelUpload/glb";
import { saveHeroModelBytes } from "../hero/modelAssets";
import { recoverDraft } from "./session";
import type { LocalDraft } from "./repository";
import { draftFingerprint } from "./repository";

const DATABASES = ["ggd-editor-drafts", "ggd-editor-local-assets", "ggd-editor-model-assets"] as const;
type Encoded = [string, unknown?];
interface DatabaseSnapshot { name: string; version: number; stores: Array<{ name: string; records: Array<{ key: Encoded; value: Encoded }> }> }
interface BackupPayload { schema: "ggd-editor-local-backup@1"; draftFormat: 1; databases: DatabaseSnapshot[] }

/** Preserve incomplete inputs, original icon bytes and future data without coercion. */
export async function encodeBackupValue(value: unknown, depth = 0): Promise<Encoded> {
  if (depth > 50) throw new Error("備份資料巢狀過深。");
  if (value === undefined) return ["undefined"];
  if (value === null) return ["null"];
  if (value instanceof Blob && value.type === "model/gltf-binary") {
    if (value.size > MODEL_UPLOAD_LIMITS.fileBytes) throw new Error("模型備份超過 32 MiB。");
    const bytes = new Uint8Array(await value.arrayBuffer()); let text = "";
    for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192));
    return ["model-glb-base64@1", btoa(text)];
  }
  if (value instanceof Blob) return ["blob", [value.type, Array.from(new Uint8Array(await value.arrayBuffer()))]];
  if (value instanceof ArrayBuffer) return ["bytes", Array.from(new Uint8Array(value))];
  if (value instanceof Date) return ["date", value.toISOString()];
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
  if (typeof value === "string" || typeof value === "boolean") return [typeof value, value];
  if (Array.isArray(value)) return ["array", await Promise.all(value.map((entry) => encodeBackupValue(entry, depth + 1)))];
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return ["object", await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await encodeBackupValue(entry, depth + 1)]))];
  throw new Error("備份遇到不支援的資料型別；原資料保持不變。");
}
export function decodeBackupValue(input: unknown, depth = 0): unknown {
  if (depth > 50 || !Array.isArray(input) || input.length > 2) throw new Error("備份資料格式無效。");
  const [type, value] = input;
  const bytes = (raw: unknown) => {
    if (!Array.isArray(raw) || raw.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) throw new Error("備份圖片格式無效。");
    return Uint8Array.from(raw);
  };
  if (type === "undefined") return undefined;
  if (type === "null") return null;
  if (type === "model-glb-base64@1" && typeof value === "string" && value.length <= Math.ceil(MODEL_UPLOAD_LIMITS.fileBytes / 3) * 4) return new Blob([Uint8Array.from(atob(value), (char) => char.charCodeAt(0))], { type: "model/gltf-binary" });
  if (type === "string" && typeof value === "string" || type === "boolean" && typeof value === "boolean") return value;
  if (type === "number" && typeof value === "string" && (Number.isFinite(Number(value)) || ["NaN", "Infinity", "-Infinity"].includes(value))) return value === "-0" ? -0 : Number(value);
  if (type === "bytes") return bytes(value).buffer;
  if (type === "blob" && Array.isArray(value) && typeof value[0] === "string") return new Blob([bytes(value[1])], { type: value[0] });
  if (type === "date" && typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value);
  if (type === "array" && Array.isArray(value)) return value.map((entry) => decodeBackupValue(entry, depth + 1));
  if (type === "object" && Array.isArray(value)) return Object.fromEntries(value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") throw new Error("備份物件格式無效。");
    return [entry[0], decodeBackupValue(entry[1], depth + 1)];
  }));
  throw new Error("備份資料型別無效。");
}
function openExisting(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error("備份資料庫不存在。")); };
  });
}
async function snapshot(name: string): Promise<DatabaseSnapshot> {
  const db = await openExisting(name);
  try {
    const stores = await new Promise<Array<{ name: string; keys: unknown[]; values: unknown[] }>>((resolve, reject) => {
      const names = Array.from(db.objectStoreNames);
      if (!names.length) return resolve([]);
      const tx = db.transaction(names, "readonly");
      const pending = names.map((name) => ({ name, keys: tx.objectStore(name).getAllKeys(), values: tx.objectStore(name).getAll() }));
      tx.oncomplete = () => resolve(pending.map((store) => ({ name: store.name, keys: store.keys.result, values: store.values.result })));
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("讀取草稿備份失敗。"));
    });
    return { name, version: db.version, stores: await Promise.all(stores.map(async (store) => ({ name: store.name,
      records: await Promise.all(store.keys.map(async (key, index) => ({ key: await encodeBackupValue(key), value: await encodeBackupValue(store.values[index]) }))) }))) };
  } finally { db.close(); }
}
export async function createDesktopBackup(): Promise<string> {
  const existing = new Set((await indexedDB.databases()).map((entry) => entry.name));
  const payload: BackupPayload = { schema: "ggd-editor-local-backup@1", draftFormat: 1,
    databases: await Promise.all(DATABASES.filter((name) => existing.has(name)).map(snapshot)) };
  const body = JSON.stringify(payload);
  if (body.length > 256 * 1024 ** 2) throw new Error("草稿備份超出 256 MB，請先另行匯出作品。");
  return JSON.stringify({ schema: "ggd-editor-backup-envelope@1", sha256: sha256Hex(body), body });
}
export function parseDesktopBackup(text: string): BackupPayload {
  if (text.length > 256 * 1024 ** 2) throw new Error("備份超出大小限制。");
  const envelope = JSON.parse(text);
  if (envelope.schema !== "ggd-editor-backup-envelope@1" || typeof envelope.body !== "string" || sha256Hex(envelope.body) !== envelope.sha256) throw new Error("備份完整性檢查失敗。");
  const payload = JSON.parse(envelope.body) as BackupPayload;
  if (payload.schema !== "ggd-editor-local-backup@1" || payload.draftFormat !== 1) throw new Error("這份備份來自不相容版本，已保留原資料，請使用原版本開啟。");
  if (!Array.isArray(payload.databases) || payload.databases.some((db) => !DATABASES.includes(db.name as never) || !Array.isArray(db.stores))) throw new Error("備份資料庫範圍無效。");
  return payload;
}
export async function restoreDesktopBackup(text: string): Promise<{ restored: number; retained: number }> {
  const payload = parseDesktopBackup(text);
  // Validate the entire input before writing. Unknown future drafts stay in the
  // original backup for read-only recovery; no existing draft is overwritten.
  const drafts: LocalDraft[] = [];
  const assets: Array<{ store: string; key: IDBValidKey; value: unknown }> = [];
  const models: Uint8Array[] = [];
  let retained = 0;
  for (const db of payload.databases) for (const store of db.stores) for (const record of store.records) {
    const key = decodeBackupValue(record.key), value = decodeBackupValue(record.value);
    if (db.name === "ggd-editor-drafts" && store.name === "drafts") {
      const draft = value as LocalDraft;
      const project = (draft?.payload as { project?: { schema?: string } } | null)?.project;
      if (draft?.schema === "ggd-local-draft@1" && ["document", "hero"].includes(draft.kind)
        && typeof draft.key === "string" && draft.token === draftFingerprint(draft.payload)
        && (draft.kind !== "hero" || ["ggd-hero-project@1", "ggd-hero-project@2"].includes(project?.schema ?? ""))) drafts.push(draft);
      else retained++;
    } else if (db.name === "ggd-editor-local-assets" && ["icons", "normalized-icons", "icon-versions"].includes(store.name)) {
      if (typeof key !== "string") throw new Error("圖片備份索引無效。");
      assets.push({ store: store.name, key, value });
    } else if (db.name === "ggd-editor-model-assets" && store.name === "files") {
      if (typeof key !== "string" || !(value instanceof Blob) || value.type !== "model/gltf-binary" || value.size > MODEL_UPLOAD_LIMITS.fileBytes) throw new Error("模型備份索引或格式無效。");
      const bytes = new Uint8Array(await value.arrayBuffer());
      if (sha256Bytes(bytes) !== key) throw new Error("模型備份完整性檢查失敗。");
      parseUploadGlb(bytes); models.push(bytes);
    }
  }
  if (assets.length) {
    // Initialize the shipping schema; its existing version guard also rejects
    // newer databases on downgrade, without trying to rewrite them.
    const { listStagedLocalIcons } = await import("../local-icons/storage");
    await listStagedLocalIcons();
    const db = await openExisting("ggd-editor-local-assets");
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["icons", "normalized-icons", "icon-versions"], "readwrite");
        for (const asset of assets) {
          const store = tx.objectStore(asset.store), current = store.get(asset.key);
          current.onsuccess = () => { if (current.result === undefined) store.put(asset.value, asset.key); };
        }
        tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  for (const bytes of models) await saveHeroModelBytes(bytes, "hero-body.glb");
  for (const draft of drafts) await recoverDraft(draft);
  return { restored: drafts.length, retained };
}
