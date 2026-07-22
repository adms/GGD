/**
 * The small "AI 填空" button rendered beside free-text fields (description /
 * name / …). Calls the platform AI-text proxy for this field, then hands the
 * result back to the widget's onChange so the user can edit before saving.
 * Renders nothing when there is no AI context or the field is not fillable.
 */
import { useState } from "react";
import { useAiFill } from "./AiFillContext";
import { isFillableField } from "./prompt";

export function AiFillButton({
  field,
  dataPath,
  onChange,
}: {
  /** the field's leaf key (e.g. "description") */
  field: string;
  dataPath: string;
  onChange(dataPath: string, value: unknown): void;
}) {
  const ai = useAiFill();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "stub" | "error"; text: string } | null>(null);

  if (!ai || !isFillableField(field)) return null;

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await ai.fill(field);
      onChange(dataPath, r.text);
      if (r.stub) {
        setNote({ tone: "stub", text: "stub — configure AI in admin for real text" });
      }
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="ai-fill">
      <button type="button" className="ai-fill-btn" disabled={busy} onClick={() => void run()}>
        {busy ? "…" : "✨ AI 填空"}
      </button>
      {note ? <span className={`ai-fill-note ai-${note.tone}`}>{note.text}</span> : null}
    </span>
  );
}
