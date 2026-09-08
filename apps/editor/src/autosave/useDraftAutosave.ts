/**
 * 💾 接線層（GH#1023）—— 把引擎掛到編輯器的 store 上。
 *
 * ⭐ 刻意**不動 `store.ts`**：zustand 的 store 是別條 lane 也在讀的共用檔，
 * 而這裡要的東西（collection / docId / original / draft / dirty）它已經全部給了。
 * ⇒ 這一條線是**加上去的**，⛔ 不是插進去的 —— 拿掉這個 hook，編輯器行為
 *   逐位元組回到 2026-09-06 的樣子（一鍵 rollback 的第二層）。
 *
 * ⚠️ 存檔的觸發是「**停手** intervalMs 之後」，⛔ 不是「每 intervalMs 存一次」：
 * 打字中每一個按鍵都寫一次盤，是把 autosave 變成卡頓的最快方法。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../store";
import {
  createAutosave,
  DEFAULT_EDITOR_AUTOSAVE,
  installUnloadGuard,
  loadAutosaveSettings,
  type Autosave,
  type AutosaveSettings,
  type UnloadTarget,
} from "./autosave";
import { createIndexedDbDraftStore, type DraftStore } from "./draftStore";
import { draftKey, type DraftRecord } from "./model";

export interface DraftAutosaveView {
  restored: DraftRecord | null;
  blocked: string | null;
  savedAt: number | null;
  settings: AutosaveSettings;
  onSettings(next: AutosaveSettings): void;
  onDiscard(): void;
}

export function useDraftAutosave(store?: DraftStore): DraftAutosaveView {
  const { collection, docId, original, draft, dirty, replaceDraft, select } = useEditorStore();
  const [settings, setSettings] = useState<AutosaveSettings>(DEFAULT_EDITOR_AUTOSAVE);
  const [restored, setRestored] = useState<DraftRecord | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const backing = useMemo(() => store ?? createIndexedDbDraftStore(), [store]);
  const engine = useRef<Autosave>();
  if (!engine.current) engine.current = createAutosave(backing, DEFAULT_EDITOR_AUTOSAVE);

  // ① 開頁：把作者上次挑的那一格讀回來。
  useEffect(() => {
    let live = true;
    void loadAutosaveSettings(backing).then((next) => {
      if (!live) return;
      void engine.current!.writeSettings(next).then(() => { if (live) setSettings(next); });
    });
    return () => { live = false; };
  }, [backing]);

  // ② B：還沒投稿就關頁 ⇒ 瀏覽器問一次。
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // ⚠️ 瀏覽器裡 `globalThis` 就是 window；node/vitest 沒有 addEventListener，
  //    `installUnloadGuard` 自己會退成 no-op（⛔ 不是擲例外）。
  useEffect(
    () => installUnloadGuard(globalThis as unknown as UnloadTarget, () => dirtyRef.current),
    [],
  );

  // ③ C：換一份文件 ⇒ 試著接回那一份的草稿，並讓 banner 說出來。
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!collection || !docId) { setRestored(null); return; }
    const key = draftKey(collection, docId);
    if (restoredFor.current === key) return;
    restoredFor.current = key;
    setRestored(null);
    let live = true;
    void engine.current!.restore(collection, docId, original).then((outcome) => {
      if (!live) return;
      if (outcome.kind === "restored") { replaceDraft(outcome.doc); setRestored(outcome.record); }
      else if (outcome.kind === "blocked") setBlocked(outcome.message);
    });
    return () => { live = false; };
  }, [collection, docId, original, replaceDraft]);

  // ④ A：停手之後寫一次。
  useEffect(() => {
    if (!collection || !docId) return;
    const timer = setTimeout(() => {
      void engine.current!.save(collection, docId, original, draft).then((outcome) => {
        if (outcome.kind === "saved") { setSavedAt(outcome.record.savedAt); setBlocked(null); }
        else if (outcome.kind === "clean") setSavedAt(null);
        else if (outcome.kind === "blocked") setBlocked(outcome.message);
      });
    }, settings.intervalMs);
    return () => clearTimeout(timer);
  }, [collection, docId, original, draft, settings]);

  const onSettings = useCallback((next: AutosaveSettings) => {
    void engine.current!.writeSettings(next).then(setSettings);
  }, []);

  const onDiscard = useCallback(() => {
    if (!collection || !docId) return;
    void engine.current!.forget(collection, docId);
    setRestored(null);
    select(collection, docId, original);
  }, [collection, docId, original, select]);

  return { restored, blocked, savedAt, settings, onSettings, onDiscard };
}
