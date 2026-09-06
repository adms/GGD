/**
 * 💾 草稿的儲存層（GH#1023）—— ⭐ 一個**可注入的介面**，出貨走 IndexedDB。
 *
 * 票文 Implementation constraints 逐字：「⭐ IndexedDB，⛔ 不是 `localStorage`」
 * ＋「照抄既有模式（`local-icons/storage.ts`）—— ⛔ 不發明第二套本機儲存」。
 * ⇒ 下面那支 `createIndexedDbDraftStore()` 與 `local-icons/storage.ts:36-68`
 *   是同一個 open/transaction/requestResult 形狀，⛔ 不是另一套。
 *
 * ⭐ 介面化的理由（⛔ 不是為了測試方便）：jsdom 與 node 都**沒有** IndexedDB，
 * 而「為了測試改出貨行為」是這份守則明文禁止的。
 * ⇒ 出貨端注入 IndexedDB 實作、測試端注入記憶體實作，
 *   ⭐ 兩邊跑的是**同一支引擎**（`autosave.ts`），⛔ 不是兩條路。
 *
 * ⚠️ 失敗一律**往上丟**，⛔ 不在這一層吞掉 —— 無痕視窗／封鎖站台資料時
 * `indexedDB.open()` 本身就擲例外，而票文驗收第 4 條要的是
 * 「⭐ **看得見的提示**，⛔ 不是靜默失敗」。誰要說話由 `autosave.ts` 決定。
 */
import { isCurrentDraftRecord, type DraftRecord } from "./model";

const DB_NAME = "ggd-editor-drafts";
const DB_VERSION = 1;
const STORE = "drafts";

/** 設定與草稿同一個 object store；這個鍵刻意不是一個合法的 `collection/docId`。 */
const SETTINGS_KEY = "\u0000autosave-settings";

export interface DraftStore {
  put(key: string, record: DraftRecord): Promise<void>;
  get(key: string): Promise<DraftRecord | null>;
  all(): Promise<DraftRecord[]>;
  drop(key: string): Promise<void>;
  readSettings(): Promise<unknown>;
  writeSettings(value: unknown): Promise<void>;
}

/**
 * 測試用的實作。⛔ 不是出貨路徑。
 *
 * ⭐ `cells` 是**傳進來的** —— 這樣「關掉分頁再重開」才模擬得出來：
 * 丟掉引擎、留下這張 Map，再開一個新的 store 蓋在同一張 Map 上
 * ＝ 程式重來一次而磁碟還在。⛔ 一個自己 new 一張 Map 的實作驗不到重載。
 */
export function createMemoryDraftStore(cells = new Map<string, unknown>()): DraftStore {
  return {
    async put(key, record) { cells.set(key, JSON.parse(JSON.stringify(record)) as DraftRecord); },
    async get(key) { const v = cells.get(key); return isCurrentDraftRecord(v) ? v : null; },
    async all() { return [...cells.values()].filter(isCurrentDraftRecord); },
    async drop(key) { cells.delete(key); },
    async readSettings() { return cells.get(SETTINGS_KEY) ?? null; },
    async writeSettings(value) { cells.set(SETTINGS_KEY, value); },
  };
}

export function createIndexedDbDraftStore(): DraftStore {
  return {
    put: async (key, record) => { await transaction("readwrite", (s) => s.put(record, key)); },
    get: async (key) => {
      const value = await requestResult<unknown>(await transaction("readonly", (s) => s.get(key)));
      return isCurrentDraftRecord(value) ? value : null;
    },
    all: async () => {
      const values = await requestResult<unknown[]>(await transaction("readonly", (s) => s.getAll()));
      return values.filter(isCurrentDraftRecord)
        .sort((a, b) => b.savedAt - a.savedAt);
    },
    drop: async (key) => { await transaction("readwrite", (s) => s.delete(key)); },
    readSettings: async () =>
      requestResult<unknown>(await transaction("readonly", (s) => s.get(SETTINGS_KEY))),
    writeSettings: async (value) => { await transaction("readwrite", (s) => s.put(value, SETTINGS_KEY)); },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("瀏覽器未提供 IndexedDB，本機草稿不可用"));
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("無法開啟本機草稿暫存"));
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
    tx.onerror = () => { db.close(); reject(tx.error ?? request.error ?? new Error("本機草稿交易失敗")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("本機草稿交易中止")); };
  });
}

function requestResult<T>(request: IDBRequest): Promise<T> {
  if (request.readyState === "done") return Promise.resolve(request.result as T);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("讀取本機草稿失敗"));
  });
}
