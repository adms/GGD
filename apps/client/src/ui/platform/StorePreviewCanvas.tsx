/**
 * StorePreviewCanvas — plain component boundary around render/StorePreview:
 * the @babylonjs import stays in render/ (client-08); this file only owns the
 * <canvas> element + lifecycle and fetches the model doc for a modelKey.
 *
 * TWO ADDITIONS FOR THE LOBBY 英靈殿 (task #258), both opt-in so the store and
 * champ-select behave exactly as before:
 *   · `paused` — suspends drawing (background tab / card scrolled out of view)
 *     without destroying the WebGL context, so a parked lobby stops burning GPU.
 *   · `onStatus` — reports loading / ready / failed. A caller that must never
 *     show a hole (the showcase) can then swap in the champion's portrait
 *     instead of leaving an empty black stage, which is what this component
 *     did on a 404 before.
 */
import { useEffect, useRef, useState } from "react";
import { StorePreview } from "../../render/StorePreview";
import type { ModelDoc } from "@ggd/shared/content";
import { TEXT_DIM } from "../theme";

/** What the 3D stage is currently doing, for callers that need a fallback. */
export type PreviewStatus = "idle" | "loading" | "ready" | "failed";

async function fetchModelDoc(modelKey: string): Promise<ModelDoc | null> {
  try {
    const res = await fetch(`/content/models/${encodeURIComponent(modelKey)}.json`);
    if (!res.ok) return null;
    return (await res.json()) as ModelDoc;
  } catch {
    return null;
  }
}

export function StorePreviewCanvas(props: {
  modelKey: string | null;
  /** suspend rendering (tab hidden / off-screen) — the engine is kept alive */
  paused?: boolean;
  /** hide the built-in "select a skin to preview" hint (the showcase has its own) */
  hideEmptyHint?: boolean;
  /**
   * Floor for the canvas box. 260 is the store/champ-select default and stays
   * that way; the lobby showcase shrinks it on short viewports, where a 260px
   * floor would shove 「一鍵開打」 off a 390px-tall phone-landscape screen.
   */
  minHeight?: number;
  onStatus?: (status: PreviewStatus) => void;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<StorePreview | null>(null);
  // WebGL can be missing entirely (software-blocked GPU, locked-down browser);
  // `new Engine()` throws there, and an unhandled throw in an effect would take
  // the whole lobby down. Caught → reported as "failed" → the caller degrades.
  const [engineFailed, setEngineFailed] = useState(false);
  // keep the latest callback without making it an effect dependency (a caller
  // passing an inline arrow must not re-create the WebGL context every render)
  const statusRef = useRef(props.onStatus);
  statusRef.current = props.onStatus;

  useEffect(() => {
    if (!canvasRef.current) return;
    let preview: StorePreview;
    try {
      preview = new StorePreview(canvasRef.current);
    } catch {
      setEngineFailed(true);
      statusRef.current?.("failed");
      return;
    }
    previewRef.current = preview;
    return () => {
      previewRef.current = null;
      preview.dispose();
    };
  }, []);

  useEffect(() => {
    previewRef.current?.setPaused(props.paused === true);
  }, [props.paused]);

  useEffect(() => {
    if (engineFailed) return;
    if (!props.modelKey) {
      statusRef.current?.("idle");
      return;
    }
    let cancelled = false;
    statusRef.current?.("loading");
    void fetchModelDoc(props.modelKey).then(async (doc) => {
      if (cancelled) return;
      const preview = previewRef.current;
      if (!doc || !preview) {
        statusRef.current?.("failed");
        return;
      }
      await preview.show(doc);
      if (cancelled) return;
      // `show()` never throws: a glb that 404s or fails to parse simply leaves
      // no model node. That is the honest signal — report it rather than
      // pretending a black stage is a loaded champion.
      statusRef.current?.(preview.modelNode ? "ready" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [props.modelKey, engineFailed]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: props.minHeight ?? 260 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", borderRadius: 10, outline: "none" }}
      />
      {!props.modelKey && props.hideEmptyHint !== true && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: TEXT_DIM,
            fontSize: 12,
          }}
        >
          select a skin to preview
        </div>
      )}
    </div>
  );
}
