/** Editing view: schema-generated form + save/revert + inline & server errors. */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { zodIssues, type FieldIssue } from "@ggd/shared/content";
import { api, ApiValidationError } from "../api/client";
import { collectionEntry } from "../collections";
import { FormRenderer } from "../form/FormRenderer";
import { walkZod } from "../form/walk";
import { issuesToErrorMap, useEditorStore, type ErrorMap } from "../store";
import { PreviewPanel } from "../preview/PreviewPanel";
import { AiIconPanel } from "../ai/AiIconPanel";
import { AiFillProvider } from "../ai/AiFillContext";
import { iconKindFor } from "../ai/prompt";

export function EditorView() {
  const qc = useQueryClient();
  const { collection, docId, draft, dirty, serverErrors, update, markSaved, setServerErrors } =
    useEditorStore();
  const [saveState, setSaveState] = useState<string | null>(null);

  // the status line belongs to ONE doc — clear it when the selection changes
  useEffect(() => setSaveState(null), [collection, docId]);

  const entry = collection ? collectionEntry(collection) : null;
  const ui = useMemo(() => (entry ? walkZod(entry.schema, "", entry.label) : null), [entry]);

  // inline validation with the SAME shared Zod schema on every draft change
  const inlineErrors: ErrorMap = useMemo(() => {
    if (!entry || draft === null) return {};
    const res = entry.schema.safeParse(draft);
    return res.success ? {} : issuesToErrorMap(zodIssues(res.error) as FieldIssue[]);
  }, [entry, draft]);

  if (!collection || !docId || !entry || !ui || draft === null) {
    return <main className="editor-empty">Pick a document.</main>;
  }

  const errors: ErrorMap = { ...inlineErrors };
  for (const [path, msgs] of Object.entries(serverErrors)) {
    errors[path] = [...(errors[path] ?? []), ...msgs];
  }
  const errorCount = Object.keys(errors).length;
  const iconKind = iconKindFor(collection);

  const save = async () => {
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
            <button type="button" disabled={!dirty} onClick={() => useEditorStore.getState().select(collection, docId, useEditorStore.getState().original)}>
              revert
            </button>
            <button type="button" disabled={!dirty || errorCount > 0} onClick={() => void save()}>
              save
            </button>
          </div>
        </header>
        {errorCount > 0 ? <p className="error">⚠ {errorCount} field(s) invalid</p> : null}
        {iconKind ? <AiIconPanel kind={iconKind} docId={docId} doc={draft} /> : null}
        <AiFillProvider>
          <FormRenderer node={ui} value={draft} dataPath="" errors={errors} onChange={update} />
        </AiFillProvider>
      </div>
      <PreviewPanel collection={collection} doc={draft} />
    </main>
  );
}
