import { create } from "zustand";
import type { CollectionName } from "@ggd/shared/content";
import { DEFAULT_EDITOR_SETTINGS } from "@ggd/shared/content/schema/config/authoringRules";
import { api } from "../api/client";
import { collectionRegistry } from "../collections";
import { useEditorStore, type RawInputs } from "../store";
import { DraftAutosave, type AutosaveStatus } from "./autosave";
import { createLocalDraft, indexedDraftRepository, type DraftRecovery, type LocalDraft } from "./repository";

export interface DocumentDraft {
  collection: CollectionName;
  docId: string;
  original: unknown;
  draft: unknown;
  rawInputs: RawInputs;
}

export const useDraftSession = create<{
  ready: boolean;
  status: AutosaveStatus;
  drafts: LocalDraft[];
  recoveries: DraftRecovery[];
}>(() => ({ ready: false, status: { phase: "idle" }, drafts: [], recoveries: [] }));

const cache = new Map<string, LocalDraft>();
const publishDrafts = () => useDraftSession.setState({ drafts: [...cache.values()].sort((a, b) => b.updatedAt - a.updatedAt) });
export const autosave = new DraftAutosave({
  ...indexedDraftRepository,
  async put(draft, token) {
    await indexedDraftRepository.put(draft, token);
    // A newer in-memory revision must not be replaced by an older disk ack.
    if ((cache.get(draft.key)?.revision ?? -1) <= draft.revision) cache.set(draft.key, draft);
    publishDrafts();
  },
}, (status) => useDraftSession.setState({ status }), DEFAULT_EDITOR_SETTINGS.autosaveIntervalMs);

let initialization: Promise<void> | undefined;
export function initializeDraftSession(): Promise<void> {
  return initialization ??= initialize();
}

async function initialize(): Promise<void> {
  try {
    const [drafts, recoveries] = await Promise.all([indexedDraftRepository.list(), indexedDraftRepository.recoveries()]);
    for (const draft of drafts) cache.set(draft.key, draft);
    autosave.hydrate(drafts);
    publishDrafts();
    useDraftSession.setState({ recoveries });
  } catch (error) { reportDraftError(error); }
  useEditorStore.subscribe((state, previous) => {
    if (!state.collection || !state.docId || !state.draftKey || state.draft === null) return;
    if (state.draft === previous.draft && state.original === previous.original && state.rawInputs === previous.rawInputs && state.draftKey === previous.draftKey) return;
    if (!state.dirty && state.draftKey !== previous.draftKey) return;
    enqueueDraft(state.draftKey, "document", {
      collection: state.collection, docId: state.docId,
      original: state.original, draft: state.draft, rawInputs: state.rawInputs,
    } satisfies DocumentDraft);
  });
  window.addEventListener("beforeunload", (event) => autosave.beforeUnload(event));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void autosave.flush().catch(() => undefined);
  });
  const desktop = (window as Window & { ggdDesktopDrafts?: { onFlush: (flush: (operation: "flush" | "backup" | "restore" | "prepare-update" | "resume", payload?: string) => Promise<unknown>) => unknown } }).ggdDesktopDrafts;
  desktop?.onFlush(async (operation, payload) => {
    if (operation === "resume") { document.body.inert = false; return; }
    if (operation === "prepare-update") document.body.inert = true;
    try {
    await autosave.flush();
    if (autosave.unsaved) throw new Error("仍有未保存修改，已取消關閉。");
    if (["error", "conflict"].includes(useDraftSession.getState().status.phase)) {
      throw new Error(useDraftSession.getState().status.message ?? "草稿保存尚未完成，請先解決衝突或另存副本。");
    }
    if (operation === "backup" || operation === "prepare-update") {
      const snapshot = await (await import("./desktopBackup")).createDesktopBackup();
      if (autosave.unsaved) throw new Error("建立備份期間有新的修改，請稍後重試。");
      return snapshot;
    }
    if (operation === "restore") {
      if (typeof payload !== "string") throw new Error("備份內容不存在。");
      return (await import("./desktopBackup")).restoreDesktopBackup(payload);
    }
    } catch (error) { if (operation === "prepare-update") document.body.inert = false; throw error; }
  });
  useDraftSession.setState({ ready: true });
  // Local persistence stays available offline and while configuration loads.
  void api.doc("config", "authoring-rules").then((value) => {
    const interval = (value as { editor?: { autosaveIntervalMs?: unknown } }).editor?.autosaveIntervalMs;
    if (typeof interval === "number" && Number.isInteger(interval) && interval >= 100 && interval <= 5000) autosave.setInterval(interval);
  }).catch(() => undefined);
}

export function reportDraftError(error: unknown): void {
  useDraftSession.setState({ status: { phase: "error", message: error instanceof Error ? error.message : String(error) } });
}

export function enqueueDraft(key: string, kind: LocalDraft["kind"], payload: unknown): void {
  try {
    const revision = (cache.get(key)?.revision ?? 0) + 1;
    const draft = createLocalDraft(key, kind, revision, payload);
    cache.set(key, draft);
    publishDrafts();
    autosave.enqueue(key, kind, revision, payload);
  } catch (error) { reportDraftError(error); }
}

export function documentPayload(record: LocalDraft): DocumentDraft | null {
  const value = record.payload as Partial<DocumentDraft> | null;
  return record.kind === "document" && value && typeof value.docId === "string"
    && collectionRegistry.some((entry) => entry.name === value.collection) && "draft" in value
    ? { ...value, rawInputs: value.rawInputs ?? {} } as DocumentDraft : null;
}

export function restoreDocumentDraft(record: LocalDraft): void {
  const data = documentPayload(record);
  if (!data) throw new Error("這份本機草稿不是可開啟的內容文件。");
  useEditorStore.getState().restore(data.collection, data.docId, data.original, data.draft, record.key, data.rawInputs);
}

export async function openDocument(collection: CollectionName, docId: string): Promise<void> {
  await initializeDraftSession();
  const key = `document/${collection}/${docId}`;
  const saved = cache.get(key) ?? await indexedDraftRepository.get(key);
  if (saved) { restoreDocumentDraft(saved); return; }
  useEditorStore.getState().select(collection, docId, await api.doc(collection, docId));
}

export async function saveDraftCopy(key: string): Promise<LocalDraft> {
  const current = cache.get(key);
  if (!current) throw new Error("找不到記憶體中的草稿。");
  const copy = createLocalDraft(`${key}/copy-${crypto.randomUUID()}`, current.kind, 1, current.payload);
  await indexedDraftRepository.put(copy, null);
  autosave.hydrate([copy]);
  cache.set(copy.key, copy);
  // Persisted copy is safe before moving the live editor off the conflict key.
  autosave.forget(key);
  const latest = cache.get(key)!;
  if (useEditorStore.getState().draftKey === key) {
    restoreDocumentDraft({ ...copy, payload: latest.payload });
  } else if (latest.token !== current.token) {
    enqueueDraft(copy.key, copy.kind, latest.payload);
  }
  publishDrafts();
  useDraftSession.setState({ status: { phase: autosave.unsaved ? "pending" : "saved", key: copy.key, message: "已建立獨立副本；其他視窗的版本保留原樣。" } });
  return cache.get(copy.key)!;
}

export async function recoverDraft(backup: LocalDraft): Promise<LocalDraft> {
  const copy = createLocalDraft(`${backup.key}/recovered-${crypto.randomUUID()}`, backup.kind, 1, backup.payload);
  await indexedDraftRepository.put(copy, null);
  cache.set(copy.key, copy);
  autosave.hydrate([copy]);
  publishDrafts();
  return copy;
}
