/**
 * 💾 Editor 草稿自動存檔引擎（GH#1023）—— 存 → 關頁 → 重開 → 接回。
 *
 * ── ⭐ D：開關 `editor.autosave` 的住處，以及**為什麼不是後台三個住處** ──────
 *
 * 判準是 CLAUDE.md 第一守則那一條的**下半句**：⭐「誰會轉這一格？」
 *
 * | | |
 * |---|---|
 * | 會轉它的人 | ⭐ **正在用編輯器的作者**（Codex／設計者／UGC 玩家），⛔ 不是 owner |
 * | ⛔ 為什麼**不能**放 `content/config/*.json` | ⭐ **消費端讀不到它**（第四個住處）—— `apps/editor/src/api/client.ts:8-24` 逐字記著：`apps/editor/dist` 被烘進 `docker/edge.Dockerfile` 在**正式站**的 `/editor/` 出貨，而 `/content-api/` **只存在於 dev**。⇒ 一格住在 config 裡的編輯器開關，在編輯器真的出貨的那個 build 裡**永遠讀不到**，只會退回預設值 ⇒ 它就是 GH#1035 那一格「三個住處齊全而沒有人讀」的裝飾 |
 * | ⇒ 住哪 | ⭐ **作者本機**（與草稿同一個 IndexedDB store），⭐ 畫面上一格看得見的控制（`AutosaveBanner`）。預設 `DEFAULT_EDITOR_AUTOSAVE`（**開**，第〇·六守則：優先權大的更新預設啟動） |
 *
 * ⚠️ 同族前例（2026-09-06，#1019）：一格**閘的嚴格度**被做成後台 config，
 * 當場被 `configDecorationCensus` 的棘輪擋下 —— 理由一樣是
 * 「owner 一輩子不會去點它，而它換來三個住處的維護成本」。
 *
 * ── ⚠️ fail-open 但**不可靜默**（票文驗收第 4 條）────────────────────────
 * 無痕視窗／封鎖站台資料時 `indexedDB.open()` **本身就擲例外**（⛔ 不是回 null）。
 * ⇒ 這裡一律 try/catch 讓編輯器活著，⛔ 但回一個 `blocked` 狀態，
 *   而 `AutosaveBanner` 會把它畫出來。⛔ 一行沒有人讀的 console.warn 不算。
 */
import { createIndexedDbDraftStore, type DraftStore } from "./draftStore";
import { applyTweaks, diffTweaks, draftKey, DRAFT_RECORD_VERSION, type DraftRecord } from "./model";

export interface AutosaveSettings {
  enabled: boolean;
  /** ⭐ 停手多久才寫一次。⛔ 不是「每幾秒寫一次」—— 打字中不該寫盤。 */
  intervalMs: number;
}

/** ⭐ 出貨值。預設**開**（票文 D：「⛔ 預設 on」）。 */
export const DEFAULT_EDITOR_AUTOSAVE: AutosaveSettings = Object.freeze({
  enabled: true,
  intervalMs: 1500,
});

export const AUTOSAVE_SETTINGS_ID = "editor.autosave";

export function resolveAutosaveSettings(raw: unknown): AutosaveSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_EDITOR_AUTOSAVE;
  const r = raw as Partial<AutosaveSettings>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_EDITOR_AUTOSAVE.enabled,
    intervalMs: typeof r.intervalMs === "number" && r.intervalMs >= 200 && r.intervalMs <= 60_000
      ? r.intervalMs
      : DEFAULT_EDITOR_AUTOSAVE.intervalMs,
  };
}

export type SaveOutcome =
  | { kind: "off" }
  | { kind: "clean" }
  | { kind: "saved"; record: DraftRecord }
  | { kind: "blocked"; message: string };

export type RestoreOutcome =
  | { kind: "off" }
  | { kind: "none" }
  | { kind: "restored"; doc: unknown; record: DraftRecord }
  | { kind: "blocked"; message: string };

export interface Autosave {
  readonly settings: AutosaveSettings;
  save(collection: string, docId: string, original: unknown, draft: unknown): Promise<SaveOutcome>;
  restore(collection: string, docId: string, base: unknown): Promise<RestoreOutcome>;
  list(): Promise<DraftRecord[]>;
  forget(collection: string, docId: string): Promise<void>;
  writeSettings(next: AutosaveSettings): Promise<AutosaveSettings>;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const BLOCKED = "⛔ 本機草稿存不起來（無痕視窗，或瀏覽器封鎖了這個站台的資料）";

export function createAutosave(
  store: DraftStore = createIndexedDbDraftStore(),
  settings: AutosaveSettings = DEFAULT_EDITOR_AUTOSAVE,
  now: () => number = () => Date.now(),
): Autosave {
  let current = settings;
  return {
    get settings() { return current; },

    async save(collection, docId, original, draft) {
      if (!current.enabled) return { kind: "off" };
      const key = draftKey(collection, docId);
      const tweaks = diffTweaks(original, draft);
      try {
        if (Object.keys(tweaks).length === 0) {
          await store.drop(key);
          return { kind: "clean" };
        }
        const record: DraftRecord = { v: DRAFT_RECORD_VERSION, collection, docId, tweaks, savedAt: now() };
        await store.put(key, record);
        return { kind: "saved", record };
      } catch (error: unknown) {
        return { kind: "blocked", message: `${BLOCKED}：${reason(error)}` };
      }
    },

    async restore(collection, docId, base) {
      if (!current.enabled) return { kind: "off" };
      try {
        const record = await store.get(draftKey(collection, docId));
        if (!record) return { kind: "none" };
        return { kind: "restored", doc: applyTweaks(base, record.tweaks), record };
      } catch (error: unknown) {
        return { kind: "blocked", message: `${BLOCKED}：${reason(error)}` };
      }
    },

    async list() {
      if (!current.enabled) return [];
      try { return await store.all(); } catch { return []; }
    },

    async forget(collection, docId) {
      try { await store.drop(draftKey(collection, docId)); } catch { /* 存不起來就也刪不掉 */ }
    },

    async writeSettings(next) {
      current = resolveAutosaveSettings(next);
      try { await store.writeSettings(current); } catch { /* 這一格存不起來只影響下一次開頁 */ }
      return current;
    },
  };
}

/** 開頁時把作者上次挑的那一格讀回來；讀不到就用出貨預設（⭐ 開）。 */
export async function loadAutosaveSettings(store: DraftStore): Promise<AutosaveSettings> {
  try { return resolveAutosaveSettings(await store.readSettings()); }
  catch { return DEFAULT_EDITOR_AUTOSAVE; }
}

interface UnloadEventLike { preventDefault(): void; returnValue?: unknown }
export interface UnloadTarget {
  addEventListener(type: string, listener: (event: UnloadEventLike) => void): void;
  removeEventListener(type: string, listener: (event: UnloadEventLike) => void): void;
}

/**
 * B：有**還沒投稿**的變更時，關頁前讓瀏覽器問一次。
 *
 * ⚠️ `returnValue` 那一行是 Chrome 真正在讀的那一格（`preventDefault()` 單獨
 * 在部分版本不會跳）—— ⛔ 兩行都要，⛔ 不要只留看起來比較新的那一行。
 */
export function installUnloadGuard(
  target: UnloadTarget | undefined,
  hasUnsubmittedChanges: () => boolean,
): () => void {
  if (!target || typeof target.addEventListener !== "function") return () => {};
  const onBeforeUnload = (event: UnloadEventLike): void => {
    if (!hasUnsubmittedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  target.addEventListener("beforeunload", onBeforeUnload);
  return () => target.removeEventListener("beforeunload", onBeforeUnload);
}
