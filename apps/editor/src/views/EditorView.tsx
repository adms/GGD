/** Editing view: schema-generated form + save/revert + inline & server errors. */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zodIssues, type FieldIssue } from "@ggd/shared/content";
import { api, ApiValidationError } from "../api/client";
import { collectionEntry } from "../collections";
import { FormRenderer } from "../form/FormRenderer";
import { walkZod } from "../form/walk";
import { issuesToErrorMap, useEditorStore, type ErrorMap } from "../store";
import { authorWarnings } from "../authorWarnings";
import { PreviewPanel } from "../preview/PreviewPanel";
import { AiFillProvider } from "../ai/AiFillContext";
import { sourceWriteBlockers } from "../sourcePolicy";
// NOTE: the AI icon panel (../ai/AiIconPanel) is deliberately NOT rendered here.
// The owner does not want CLOUD image generation — 「我不追求雲端生圖，只留本機端
// SD 生圖」 — and this panel's Generate button is the one UI surface that POSTs to
// the platform's /ai/icon cloud endpoint. Icon generation is on-device only, via
// tools/icon-gen/local/ (the admin 自動產圖 strip → /icon-api → the local SD
// daemon). The backend /ai/icon route and provider code are left in place but
// UNREACHABLE from any UI, because that path shares one Go package, one API key
// and one HTTP layer with the music/TTS/form-fill capabilities, so deleting it is
// a risky carve for no benefit — un-wiring the button is enough. AiIconPanel.tsx
// itself is kept (unimported) so the change is trivially reversible.

export function EditorView() {
  const qc = useQueryClient();
  const { collection, docId, draft, dirty, serverErrors, past, future, update, undo, redo, markSaved, setServerErrors } =
    useEditorStore();
  const [saveState, setSaveState] = useState<string | null>(null);

  // the status line belongs to ONE doc — clear it when the selection changes
  useEffect(() => setSaveState(null), [collection, docId]);

  useEffect(() => {
    if (typeof globalThis.addEventListener !== "function") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) { event.preventDefault(); redo(); }
      else if (key === "z") { event.preventDefault(); undo(); }
      else if (key === "y") { event.preventDefault(); redo(); }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const entry = collection ? collectionEntry(collection) : null;
  const ui = useMemo(() => (entry ? walkZod(entry.schema, "", entry.label) : null), [entry]);
  const source = useQuery({
    queryKey: ["editor-source", collection, docId],
    queryFn: () => api.editorSource(collection!, docId!),
    enabled: collection === "abilities" && docId !== null,
    retry: false,
  });

  // inline validation with the SAME shared Zod schema on every draft change
  const inlineErrors: ErrorMap = useMemo(() => {
    if (!entry || draft === null) return {};
    const res = entry.schema.safeParse(draft);
    return res.success ? {} : issuesToErrorMap(zodIssues(res.error) as FieldIssue[]);
  }, [entry, draft]);

  /**
   * ⭐ GH#480 —— Zod 收得下但遊戲裡不會發生的那一族（說明↔JSON、空效果、台詞裡的機制數字）。
   * ⛔ 它**不**進 `errorCount`，所以 save 照樣按得下去（owner：「只是個警告標記，並不會擋」）。
   */
  const warnings = useMemo(() => authorWarnings(collection, docId, draft), [collection, docId, draft]);
  const writeBlockers = useMemo(
    () => collection ? sourceWriteBlockers(collection, draft, source.data ?? null) : [],
    [collection, draft, source.data],
  );

  if (!collection || !docId || !entry || !ui || draft === null) {
    return <main className="editor-empty">Pick a document.</main>;
  }

  const errors: ErrorMap = { ...inlineErrors };
  for (const [path, msgs] of Object.entries(serverErrors)) {
    errors[path] = [...(errors[path] ?? []), ...msgs];
  }
  const errorCount = Object.keys(errors).length;

  const save = async () => {
    if (writeBlockers.length > 0) {
      setSaveState(`blocked: ${writeBlockers[0]}`);
      return;
    }
    setSaveState("saving…");
    try {
      const res = await api.put(collection, docId, draft);
      markSaved(draft);
      setSaveState(`saved · hash ${res.hash} · ${res.contentVersion}`);
      void qc.invalidateQueries({ queryKey: ["index", collection] });
      void qc.invalidateQueries({ queryKey: ["preview-champions"] });
      void qc.invalidateQueries({ queryKey: ["preview3d-model"] });
    } catch (e) {
      if (e instanceof ApiValidationError) {
        setServerErrors(e.issues);
        setSaveState(`rejected by server validation (${e.issues.length} issue(s))`);
      } else {
        setSaveState(String(e));
      }
    }
  };

  return (
    <main className="editor-main">
      <div className="editor-form">
        <header className="editor-head">
          <h2>
            {collection}/{docId}
            {dirty ? <em className="dirty"> ● unsaved</em> : null}
          </h2>
          <div className="editor-actions">
            <span className="save-state">{saveState}</span>
            <button type="button" disabled={past.length === 0} onClick={undo} title="復原（Ctrl/Cmd+Z）">undo</button>
            <button type="button" disabled={future.length === 0} onClick={redo} title="重做（Ctrl/Cmd+Shift+Z）">redo</button>
            <button type="button" disabled={!dirty} onClick={() => useEditorStore.getState().select(collection, docId, useEditorStore.getState().original)}>
              revert
            </button>
            <button type="button" disabled={!dirty || errorCount > 0 || writeBlockers.length > 0} onClick={() => void save()}>
              save
            </button>
          </div>
        </header>
        {errorCount > 0 ? <p className="error">⚠ {errorCount} field(s) invalid</p> : null}
        {warnings.length > 0 ? (
          <ul className="author-warnings" data-testid="author-warnings">
            {warnings.map((w, i) => (
              <li key={`${w.rule}:${w.field}:${i}`}>
                <code>{w.field}</code> <em>[{w.rule}]</em> {w.message}
              </li>
            ))}
          </ul>
        ) : null}
        {writeBlockers.length > 0 ? (
          <section className="source-write-blockers" role="alert">
            <b>⛔ 來源安全保護</b>
            <ul>{writeBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          </section>
        ) : null}
        <AiFillProvider>
          <FormRenderer node={ui} value={draft} dataPath="" errors={errors} onChange={update} />
        </AiFillProvider>
      </div>
      <PreviewPanel collection={collection} doc={draft} />
    </main>
  );
}
