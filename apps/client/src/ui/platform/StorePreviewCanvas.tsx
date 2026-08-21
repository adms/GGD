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
 *
 * `championId` (task #263) rides alongside `modelKey` because the w3x vertex
 * tint is a per-CHAMPION field while `modelKey` is many-to-one: without it this
 * stage cannot tell 黑化Saber from any other champion on the same mesh. It is
 * passed through as a plain string and RESOLVED inside render/StorePreview, so
 * no @babylonjs (nor the content registry the resolve walks) leaks into ui/.
 */
import { useEffect, useRef, useState } from "react";
import { blizzardOverlayModels } from "../../render/views/blizzardOverlay";
import { standinSizes } from "../../render/views/standinSizes";
import { StorePreview } from "../../render/StorePreview";
import type { ModelDoc } from "@ggd/shared/content";
import { TEXT_DIM } from "../theme";

/** What the 3D stage is currently doing, for callers that need a fallback. */
export type PreviewStatus = "idle" | "loading" | "ready" | "failed";

/**
 * THE MODEL THIS PREVIEW SHOWS — and the ONE place three scenes get it wrong.
 *
 * owner, 2026-07-28:「別忘了 英雄殿 選擇英雄 戰鬥 結算 四個場景都要替換喔」.
 *
 * WHY THIS FUNCTION IS THE WHOLE FIX. GH#31 (v0.9.6) opened the door for the 40
 * stand-in champions whose real Warcraft III model was already extracted — but
 * it opened it in `EntityViewRegistry` → `ChampionView.tryUpgradeToGlb`, which
 * is the ARENA path. Settlement rides that same path (it is only a camera over
 * the live arena, see render/settlementCamera.ts), so 戰鬥 and 結算 were both
 * covered by that change.
 *
 * The other two were not. 選擇英雄 (panels/champselect/ProfileBlock) and 英靈殿
 * (platform/ValhallaPanel) — plus 商店 (platform/StoreScreen) — all render
 * through THIS component, and it fetched the shipped model doc and handed it
 * straight to Babylon. A champion on a shared stand-in therefore kept showing
 * the borrowed body in three of the four places the player looks at it.
 *
 * ⚠️ THIS IS FAILURE SHAPE ⑤ AT THE SCENE LEVEL: the subject under test was the
 * arena, and the arena was genuinely fixed. Every guard was green and three
 * screens were still wrong. `championId` was already threaded in for the #263
 * tint, so the resolver had everything it needed — nobody had asked it.
 *
 * DEGRADATION IS UNCHANGED: `resolve` returns the shipped doc when the overlay
 * is disabled, absent, or has no entry for this champion, and `null` only while
 * the manifest probe is still in flight — which this component already renders
 * as 「loading」 rather than as a failure.
 */
async function fetchModelDoc(
  modelKey: string,
  championId: string | null | undefined,
): Promise<ModelDoc | null> {
  try {
    const res = await fetch(`/content/models/${encodeURIComponent(modelKey)}.json`);
    if (!res.ok) return null;
    const shipped = (await res.json()) as ModelDoc;
    // ⚠️ AWAIT THE PROBE FIRST, do not just call `resolve`.
    //
    // `resolve` returns null while the manifest is still in flight — a signal
    // the ARENA reads as 「not yet, ask me next frame」 because it retries every
    // frame. This component does NOT retry: it treats a null doc as `failed`
    // and stops. And the lobby never runs GameApp, which is the only place that
    // primes the probe — so without this await, the FIRST preview a player ever
    // opens would report failure and stay black.
    //
    // `load()` is a cached single-flight, so awaiting it here costs one fetch
    // for the whole session and is a no-op once the arena has already primed it.
    await blizzardOverlayModels.load();
    // GH#368 — the per-champion SIZE sidecar, on the same single-flight terms.
    // The lobby has no ContentDb, so this is the only route by which 小叮噹's
    // authored 0.65 reaches the stage; without it `StorePreview` normalizes
    // every champion to the identical height and the exceptions vanish.
    await standinSizes.load();
    return blizzardOverlayModels.resolve(shipped, championId);
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
  /** whose art colour to paint on this model; absent = leave it untinted */
  championId?: string | null;
  /**
   * Player-driven turntable angle, in DEGREES either side of the pose this
   * model was framed at. Absent = nobody is steering, and the stage keeps its
   * own idle auto-orbit.
   *
   * ⭐ WHY A NUMBER AND NOT A DRAG (第一·五守則). The store's caption promised
   * 「拖曳可旋轉檢視」, and dragging really does work — through Babylon's
   * `attachControl`, which reads POINTER events. A pad emits none: the focus
   * layer moves focus and clicks, so that sentence described, to a pad player,
   * a gesture that does not exist. An angle can come from a slider, and #505
   * taught the pad to step sliders, so the same promise is now keepable on a
   * pad, a mouse and a keyboard through one prop.
   */
  yawDeg?: number;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<StorePreview | null>(null);
  /** The framed pose `yawDeg` is measured FROM; re-read after each `show()`. */
  const baseAlphaRef = useRef<number | null>(null);
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

  // Steering the turntable. `undefined` means the caller renders no control at
  // all (champ-select, the 英靈殿 showcase), and those stages must behave
  // EXACTLY as before — hence the early return rather than a `?? 0` default,
  // which would silently switch off their auto-orbit on mount.
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || props.yawDeg === undefined) return;
    if (baseAlphaRef.current === null) baseAlphaRef.current = preview.camera.alpha;
    // Taking the wheel stops the idle spin, the same way a mouse drag does —
    // otherwise the stage would keep rotating away from the angle just asked for.
    preview.camera.useAutoRotationBehavior = false;
    preview.camera.alpha = baseAlphaRef.current + (props.yawDeg * Math.PI) / 180;
  }, [props.yawDeg]);

  useEffect(() => {
    if (engineFailed) return;
    if (!props.modelKey) {
      statusRef.current?.("idle");
      return;
    }
    let cancelled = false;
    statusRef.current?.("loading");
    const championId = props.championId ?? null;
    void fetchModelDoc(props.modelKey, championId).then(async (doc) => {
      if (cancelled) return;
      const preview = previewRef.current;
      if (!doc || !preview) {
        statusRef.current?.("failed");
        return;
      }
      // GH#368 — the size exception rides the RESOLVED doc's glbPath, because
      // which body actually loaded decides which of the sidecar's two numbers
      // applies (see standinSizes.relativeScaleFor).
      await preview.show(doc, {
        championId,
        relativeScale: standinSizes.relativeScaleFor(championId, doc.glbPath),
      });
      if (cancelled) return;
      // `show()` re-frames the camera, so the angle a player dialled in for the
      // PREVIOUS model no longer describes this one. Forget the base pose; the
      // next steer re-reads it.
      baseAlphaRef.current = null;
      // `show()` never throws: a glb that 404s or fails to parse simply leaves
      // no model node. That is the honest signal — report it rather than
      // pretending a black stage is a loaded champion.
      statusRef.current?.(preview.modelNode ? "ready" : "failed");
    });
    return () => {
      cancelled = true;
    };
    // championId is a dep too (#263): two champions can share one modelKey, so
    // hovering from a tinted to an untinted one changes NOTHING but the colour.
    // It also makes the #258 status round-trip fire on a same-model rotation,
    // which is what keeps the showcase's 「載入中」 overlay from sticking.
  }, [props.modelKey, props.championId, engineFailed]);

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
