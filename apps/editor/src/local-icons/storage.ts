import type { LocalIconKey, StagedLocalIcon } from "./model";
import { isCurrentStagedLocalIcon, localIconStorageKey } from "./model";

const DB_NAME = "ggd-editor-local-assets";
const DB_VERSION = 1;
const STORE = "icons";
export const LOCAL_ICON_CHANGED_EVENT = "ggd-editor-local-icon-changed";

export async function putStagedLocalIcon(icon: StagedLocalIcon): Promise<void> {
  await transaction("readwrite", (store) => store.put(icon, localIconStorageKey(icon)));
  announce(icon);
}

export async function getStagedLocalIcon(key: LocalIconKey): Promise<StagedLocalIcon | null> {
  const value = await requestResult<unknown>(
    await transaction("readonly", (store) => store.get(localIconStorageKey(key))),
  );
  return isCurrentStagedLocalIcon(value) ? value : null;
}

export async function listStagedLocalIcons(): Promise<StagedLocalIcon[]> {
  const values = await requestResult<unknown[]>(await transaction("readonly", (store) => store.getAll()));
  return values.filter(isCurrentStagedLocalIcon)
    .sort((a, b) => localIconStorageKey(a).localeCompare(localIconStorageKey(b), "en"));
}

export async function deleteStagedLocalIcon(key: LocalIconKey): Promise<void> {
  await transaction("readwrite", (store) => store.delete(localIconStorageKey(key)));
  announce(key);
}

function announce(key: LocalIconKey): void {
  globalThis.dispatchEvent?.(new CustomEvent(LOCAL_ICON_CHANGED_EVENT, { detail: key }));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("瀏覽器未提供 IndexedDB，本機圖片暫存不可用"));
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("無法開啟本機圖片暫存"));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function transaction(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<IDBRequest> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request); };
    tx.onerror = () => { db.close(); reject(tx.error ?? request.error ?? new Error("本機圖片暫存交易失敗")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("本機圖片暫存交易中止")); };
  });
}

function requestResult<T>(request: IDBRequest): Promise<T> {
  if (request.readyState === "done") return Promise.resolve(request.result as T);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("讀取本機圖片暫存失敗"));
  });
}
