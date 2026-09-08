import { sha256Hex } from "@ggd/shared/content/sha256";

const DATABASE = "ggd-editor-drafts";
const STORE = "drafts";
const BACKUPS = "backups";

export interface LocalDraft {
  schema: "ggd-local-draft@1";
  key: string;
  kind: "document" | "hero";
  revision: number;
  updatedAt: number;
  payload: unknown;
  token: string;
}

export interface DraftRepository {
  list(): Promise<LocalDraft[]>;
  get(key: string): Promise<LocalDraft | null>;
  put(draft: LocalDraft, expectedToken: string | null): Promise<void>;
}

export interface DraftRecovery { key: string; backup: LocalDraft | null }

export class DraftConflictError extends Error {
  constructor(readonly current: LocalDraft) { super("另一個視窗已更新這份草稿；本次修改仍在記憶體，請另存副本後比較。"); }
}

export function createLocalDraft(key: string, kind: LocalDraft["kind"], revision: number, payload: unknown): LocalDraft {
  const copy = structuredClone(payload);
  return { schema: "ggd-local-draft@1", key, kind, revision, payload: copy, updatedAt: Date.now(), token: draftFingerprint(copy) };
}

// Raw drafts can include unset values and incomplete numeric input. Type tags
// prevent undefined/null/NaN from colliding in the change detector.
export function draftFingerprint(value: unknown): string {
  const encode = (v: unknown): unknown => {
    if (v === null) return ["null"];
    if (Array.isArray(v)) return ["array", Array.from(v, encode)];
    if (typeof v === "object") return ["object", Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, entry]) => [k, encode(entry)])];
    return [typeof v, String(v)];
  };
  return sha256Hex(JSON.stringify(encode(value)));
}

function valid(value: unknown): value is LocalDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as LocalDraft;
  return draft.schema === "ggd-local-draft@1" && typeof draft.key === "string"
    && ["document", "hero"].includes(draft.kind) && Number.isSafeInteger(draft.revision)
    && Number.isFinite(draft.updatedAt) && draft.token === draftFingerprint(draft.payload);
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("無法使用 IndexedDB；草稿尚未保存。請允許本機資料儲存後重試。"));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      for (const name of [STORE, BACKUPS]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("無法開啟本機草稿儲存"));
    request.onblocked = () => reject(new Error("本機草稿資料庫被舊視窗占用，請關閉舊視窗後重試。"));
  });
}

/** Data is acknowledged only after the IDB transaction commits. */
export const indexedDraftRepository = {
  async list(): Promise<LocalDraft[]> {
    const db = await open();
    return new Promise<LocalDraft[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      tx.oncomplete = () => {
        db.close();
        const values = request.result as unknown[];
        resolve(values.filter(valid).sort((a, b) => b.updatedAt - a.updatedAt));
      };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? request.error ?? new Error("讀取草稿失敗")); };
    });
  },
  async get(key) {
    const db = await open();
    return new Promise<LocalDraft | null>((resolve, reject) => {
      const tx = db.transaction([STORE, BACKUPS], "readonly");
      const current = tx.objectStore(STORE).get(key);
      const backup = tx.objectStore(BACKUPS).get(key);
      tx.oncomplete = () => {
        db.close();
        if (current.result === undefined) return resolve(null);
        if (valid(current.result)) return resolve(current.result);
        if (valid(backup.result)) return reject(new Error("草稿毀損但恢復備份仍完整；請先匯出原資料，再從備份恢復。"));
        reject(new Error("草稿與備份無法驗證；已保留原資料。"));
      };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error("讀取草稿失敗")); };
    });
  },
  async recoveries(): Promise<DraftRecovery[]> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, BACKUPS], "readonly");
      const values = tx.objectStore(STORE).getAll();
      const keys = tx.objectStore(STORE).getAllKeys();
      const backups = tx.objectStore(BACKUPS).getAll();
      tx.oncomplete = () => {
        db.close();
        const validBackups = (backups.result as unknown[]).filter(valid);
        resolve((values.result as unknown[]).flatMap((value, index) => valid(value) ? [] : [{
          key: String(keys.result[index]), backup: validBackups.find((entry) => entry.key === keys.result[index]) ?? null,
        }]));
      };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error("無法檢查恢復備份")); };
    });
  },
  async exportRaw(key: string): Promise<{ current: unknown; backup: unknown }> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, BACKUPS], "readonly");
      const current = tx.objectStore(STORE).get(key);
      const backup = tx.objectStore(BACKUPS).get(key);
      tx.oncomplete = () => { db.close(); resolve({ current: current.result, backup: backup.result }); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error("無法匯出原始資料")); };
    });
  },
  async put(draft, expectedToken): Promise<void> {
    if (!valid(draft)) throw new Error("草稿完整性檢查失敗，未寫入。");
    const db = await open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, BACKUPS], "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(draft.key);
      let failure: Error | null = null;
      request.onsuccess = () => {
        const current: unknown = request.result;
        if (current !== undefined && !valid(current)) { failure = new Error("現有草稿無法驗證，拒絕覆寫。"); tx.abort(); return; }
        if ((current?.token ?? null) !== expectedToken) {
          failure = current ? new DraftConflictError(current) : new Error("草稿已被其他視窗移除，請另存。");
          tx.abort(); return;
        }
        if (current) tx.objectStore(BACKUPS).put(current, draft.key);
        store.put(draft, draft.key);
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = tx.onerror = () => { db.close(); reject(failure ?? tx.error ?? request.error ?? new Error("保存草稿失敗；可能是空間不足或儲存被封鎖。")); };
    });
  },
} satisfies DraftRepository & {
  recoveries(): Promise<DraftRecovery[]>;
  exportRaw(key: string): Promise<{ current: unknown; backup: unknown }>;
};
