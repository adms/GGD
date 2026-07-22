/**
 * StorePreviewCanvas — plain component boundary around render/StorePreview:
 * the @babylonjs import stays in render/ (client-08); this file only owns the
 * <canvas> element + lifecycle and fetches the model doc for a modelKey.
 */
import { useEffect, useRef } from "react";
import { StorePreview } from "../../render/StorePreview";
import type { ModelDoc } from "@ggd/shared/content";
import { TEXT_DIM } from "../theme";

async function fetchModelDoc(modelKey: string): Promise<ModelDoc | null> {
  try {
    const res = await fetch(`/content/models/${encodeURIComponent(modelKey)}.json`);
    if (!res.ok) return null;
    return (await res.json()) as ModelDoc;
  } catch {
    return null;
  }
}

export function StorePreviewCanvas(props: { modelKey: string | null }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<StorePreview | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const preview = new StorePreview(canvasRef.current);
    previewRef.current = preview;
    return () => {
      previewRef.current = null;
      preview.dispose();
    };
  }, []);

  useEffect(() => {
    if (!props.modelKey) return;
    let cancelled = false;
    void fetchModelDoc(props.modelKey).then((doc) => {
      if (!cancelled && doc && previewRef.current) void previewRef.current.show(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [props.modelKey]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 260 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", borderRadius: 10, outline: "none" }}
      />
      {!props.modelKey && (
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
