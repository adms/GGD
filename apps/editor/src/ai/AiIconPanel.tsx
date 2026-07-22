/**
 * "AI 生成 icon" control shown on the champion / ability / item editors.
 *
 *   prompt textarea (prefilled from name + description + tags)
 *     -> Generate (POST /api/v1/ai/icon)
 *     -> preview the returned PNG
 *     -> Accept: save the PNG to content/assets/icons/<kind>/<docId>.png
 *        (content-api asset write) and set the doc's `icon` field.
 *
 * When the provider is unconfigured the proxy returns a placeholder with
 * stub:true; the panel still previews it, flags the "configure AI in admin"
 * state, and Accept still works — the whole flow is exercisable with no key.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useEditorStore } from "../store";
import {
  aiGenerateIcon,
  iconResultStatus,
  toDataUrl,
  type IconGenResult,
} from "./client";
import { acceptIcon } from "./accept";
import {
  DEFAULT_ICON_STYLE,
  buildIconPrompt,
  iconAssetPath,
  type IconKind,
} from "./prompt";

export function AiIconPanel({
  kind,
  docId,
  doc,
}: {
  kind: IconKind;
  docId: string;
  doc: unknown;
}) {
  const qc = useQueryClient();
  const update = useEditorStore((s) => s.update);

  // prompt is seeded from the doc but stays user-editable; it re-seeds only
  // when the selected doc changes (not on every keystroke in the form).
  const seed = useMemo(() => buildIconPrompt(kind, doc), [kind, docId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [prompt, setPrompt] = useState(seed);
  const [style, setStyle] = useState(DEFAULT_ICON_STYLE);
  const [size, setSize] = useState(256);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IconGenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  // reset the whole panel when the doc changes
  useEffect(() => {
    setPrompt(seed);
    setResult(null);
    setError(null);
    setAccepted(null);
  }, [seed]);

  const currentIcon =
    typeof (doc as { icon?: unknown } | null)?.icon === "string"
      ? ((doc as { icon: string }).icon)
      : null;
  const status = iconResultStatus(result, error);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setAccepted(null);
    try {
      const r = await aiGenerateIcon({ prompt, style: style || undefined, size });
      setResult(r);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const { assetPath } = await acceptIcon({
        collection: kind,
        docId,
        pngBase64: result.pngBase64,
        deps: {
          putAsset: (p, b64) => api.putAsset(p, b64),
          setField: (path, value) => update(path, value),
        },
      });
      setAccepted(assetPath);
      // the asset moved on disk — nudge any preview that reads it
      void qc.invalidateQueries({ queryKey: ["preview-champions"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const targetPath = iconAssetPath(kind, docId);

  return (
    <section className="ai-icon" aria-label="AI 生成 icon">
      <header className="ai-icon-head">
        <h3>AI 生成 icon</h3>
        <span className="ai-icon-target">
          → <code>{targetPath}</code>
        </span>
      </header>

      <label className="field ai-icon-prompt">
        <span className="field-label">Prompt (from name + description + tags — edit freely)</span>
        <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>

      <div className="ai-icon-opts">
        <label className="field">
          <span className="field-label">Style</span>
          <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Size</span>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            <option value={128}>128</option>
            <option value={256}>256</option>
            <option value={512}>512</option>
          </select>
        </label>
        <button type="button" disabled={busy || prompt.trim() === ""} onClick={() => void generate()}>
          {busy ? "…" : "Generate"}
        </button>
      </div>

      {status.label ? (
        <p className={`ai-icon-status ai-${status.tone}`}>
          {status.label}
          {status.hint ? <span className="ai-icon-hint"> — {status.hint}</span> : null}
        </p>
      ) : null}

      {result ? (
        <div className="ai-icon-preview">
          <img src={toDataUrl(result.pngBase64)} alt="generated icon preview" width={96} height={96} />
          <div className="ai-icon-accept">
            <button type="button" disabled={busy} onClick={() => void accept()}>
              Accept → set icon
            </button>
            {accepted ? (
              <p className="ai-icon-done">
                Saved <code>{accepted}</code>. Icon field set — Save the document to persist.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!result && currentIcon ? (
        <p className="ai-icon-current">
          Current icon: <code>{currentIcon}</code>
        </p>
      ) : null}
    </section>
  );
}
