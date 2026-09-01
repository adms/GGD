import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { ChampionDef } from "@ggd/shared/sim";
import {
  decodeAssetDrag,
  type AssetDrop,
  type AssetPlacement,
  type ForgeAbility,
  type ScheduledSimEvent,
} from "./model";
import {
  VfxForgeStage,
  type BackdropTimelineAudit,
  type ForgeOverlay,
  type VfxVisualEvidenceFrame,
  type VfxForgeStageMode,
} from "./VfxForgeStage";

export interface VfxForgePreviewHandle {
  auditBackdropTimeline(): Promise<BackdropTimelineAudit>;
  captureVisualEvidence(label: string): Promise<VfxVisualEvidenceFrame>;
}

interface VfxForgePreviewProps {
  script: VfxScriptDoc;
  ability: ForgeAbility;
  schedule: readonly ScheduledSimEvent[];
  durationMs: number;
  playheadMs: number;
  /** Increments for an explicit seek even when the numeric playhead is equal. */
  seekRevision?: number;
  playing: boolean;
  caster: ChampionDef | null;
  target: ChampionDef | null;
  mode?: VfxForgeStageMode;
  onTime(ms: number): void;
  onStop(): void;
  onDropAsset?(asset: AssetDrop, placement?: AssetPlacement): void;
}

export const VfxForgePreview = forwardRef<VfxForgePreviewHandle, VfxForgePreviewProps>(function VfxForgePreview({
  script,
  ability,
  schedule,
  durationMs,
  playheadMs,
  seekRevision = 0,
  playing,
  caster,
  target,
  mode = "script",
  onTime,
  onStop,
  onDropAsset,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<VfxForgeStage | null>(null);
  const playheadRef = useRef(playheadMs);
  const [overlay, setOverlay] = useState<ForgeOverlay>({
    flash: null,
    texts: [],
    status: "準備中",
    actors: { caster: "替身", target: "替身" },
  });
  const [calibration, setCalibration] = useState("量尺未校準");
  const [backdropAudit, setBackdropAudit] = useState("底板未檢查");
  const [focusPreview, setFocusPreview] = useState(false);
  const [sideReviewView, setSideReviewView] = useState(true);
  const firstPose = schedule.find((item) => item.actorPose)?.actorPose;
  const homePoseKey = firstPose
    ? `${firstPose.caster.x},${firstPose.caster.z}/${firstPose.target.x},${firstPose.target.z}`
    : "pending-pose";

  useImperativeHandle(ref, () => ({
    auditBackdropTimeline: async () => {
      const stage = stageRef.current;
      if (!stage) throw new Error("實際遊戲畫面尚未載入，禁止略過底板檢查");
      return stage.auditBackdropTimeline(durationMs);
    },
    captureVisualEvidence: async (label) => {
      const stage = stageRef.current;
      if (!stage) throw new Error("實際遊戲畫面尚未載入，無法擷取審查證據");
      return stage.captureVisualEvidence(label);
    },
  }), [durationMs]);

  useEffect(() => { playheadRef.current = playheadMs; }, [playheadMs]);
  useEffect(() => { setBackdropAudit("底板未檢查"); }, [ability.id, script]);

  // CSS fullscreen changes the canvas backing size after the current frame has
  // already been drawn. ResizeObserver updates Babylon's buffer, but resizing
  // clears WebGL; replay the selected frame once so visual-proof screenshots do
  // not capture a correctly resized yet completely black canvas.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      stage.resize();
      stage.seek(playheadRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPreview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new VfxForgeStage(canvas, script, ability, schedule, {
      actors: { caster, target },
      mode,
      onOverlay: setOverlay,
    });
    stageRef.current = stage;
    let resizeFrame = 0;
    const resize = new ResizeObserver(() => {
      // CSS layout settles after the observer callback.  Replaying in the same
      // task can therefore paint the old backing size and then be cleared by
      // the browser's final resize.  Coalesce to the next frame and restore the
      // exact authored playhead, so changing panels/modes never leaves a black
      // but otherwise live scene.
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        stage.resize();
        stage.seek(playheadRef.current);
      });
    });
    resize.observe(canvas);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(resizeFrame);
      stage.dispose();
      stageRef.current = null;
    };
    // Stage ownership follows the selected ability and the real Sim home pose.
    // Draft changes that keep the same world frame use setContent below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ability.id, caster?.id, homePoseKey, mode, target?.id]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let live = true;
    void stage.setContent(script, ability, schedule)
      .then((ready) => {
        if (live && ready) stage.seek(playheadRef.current);
      })
      .catch((error) => {
        if (!live) return;
        setOverlay((current) => ({ ...current, status: `⛔ 預載失敗：${String(error)}` }));
      });
    return () => { live = false; };
  }, [ability, schedule, script]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let lastWallMs: number | null = null;
    let accumulatorMs = 0;
    const run = (wallMs: number): void => {
      const stage = stageRef.current;
      if (!stage) return;
      if (lastWallMs === null) lastWallMs = wallMs;
      accumulatorMs += Math.min(250, wallMs - lastWallMs);
      lastWallMs = wallMs;
      let now = stage.timeMs;
      while (accumulatorMs >= FRAME_MS) {
        now = stage.advance();
        accumulatorMs -= FRAME_MS;
      }
      playheadRef.current = now;
      onTime(now);
      if (now >= durationMs) { onStop(); return; }
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, onStop, onTime, playing]);

  useEffect(() => {
    if (playing) return;
    // Paint on the next browser frame even when Babylon is already at this
    // exact timestamp.  CSS/layout can clear the backing buffer without
    // changing `stage.timeMs`; the old `> 1ms` shortcut then mistook a black
    // canvas for an up-to-date frame until the author clicked ±1f.
    const frame = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      stage.resize();
      stage.seek(playheadMs);
    });
    return () => cancelAnimationFrame(frame);
  }, [playheadMs, playing, seekRevision]);

  return (
    <div
      className={`vfx-stage${focusPreview ? " focused" : ""}`}
      onDragOver={onDropAsset ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } : undefined}
      onDrop={(e) => {
        if (!onDropAsset) return;
        e.preventDefault();
        const asset = decodeAssetDrag(e.dataTransfer.getData("application/x-ggd-vfx-asset"));
        if (!asset) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        const placement = rect
          ? stageRef.current?.placementAt(e.clientX - rect.left, e.clientY - rect.top)
          : undefined;
        onDropAsset(asset, placement);
      }}
    >
      <canvas ref={canvasRef} />
      {overlay.flash ? <div className="vfx-flash" style={{ background: `rgba(${overlay.flash.color.join(",")},${overlay.flash.alpha})` }} /> : null}
      <div className="vfx-floating-texts">{overlay.texts.map((t) => <b key={t.id}>{t.text}</b>)}</div>
      <div className="vfx-stage-badge">
        {mode === "runtime" ? "真 Sim → 真 VfxSystem" : "真 IntentFrame → VFX Script"}
        {" · "}雙方 3D Model · 真 CameraRig · 真地板 · 1/60 frame-step
      </div>
      <div className="vfx-stage-status">{overlay.status}</div>
      <div className="vfx-actor-status">施法者：{overlay.actors.caster}<br />目標：{overlay.actors.target}</div>
      <div className="vfx-stage-tools">
        <button type="button" onClick={() => setFocusPreview((current) => !current)}>
          {focusPreview ? "返回編輯" : "全螢幕預覽"}
        </button>
        <button
          type="button"
          onClick={() => setSideReviewView((current) => {
            const next = !current;
            stageRef.current?.setSideReviewView(next);
            return next;
          })}
        >
          {sideReviewView ? "切換實戰俯視" : "切換側向驗收"}
        </button>
        <button type="button" onClick={() => stageRef.current?.zoomBy(-100)}>鏡頭拉近</button>
        <button type="button" onClick={() => stageRef.current?.zoomBy(100)}>鏡頭拉遠</button>
        <button
          type="button"
          className={`vfx-calibrate${backdropAudit.startsWith("⛔") ? " failed" : ""}`}
          onClick={() => {
            setBackdropAudit("底板掃描中…");
            void stageRef.current?.auditBackdropTimeline(durationMs)
              .then((result) => setBackdropAudit(result.safe
                ? `底板通過 · ${result.sampledFrames}格`
                : `⛔ ${(result.worstAtMs / 1000).toFixed(3)}秒 · ${result.worst.reason ?? "畫面底板"}` +
                  (result.suspects.length ? ` · ${result.suspects.slice(0, 3).join(" | ")}` : "")))
              .catch((error) => setBackdropAudit(`⛔ 檢查失敗：${String(error)}`));
          }}
        >
          {backdropAudit}
        </button>
        <button
          type="button"
          className={`vfx-calibrate${calibration.startsWith("⛔") ? " failed" : ""}`}
          onClick={() => {
            setCalibration("校準中…");
            void stageRef.current?.calibrate()
              .then((bright) => setCalibration(`雙向校準通過 · control ${bright}`))
              .catch((e) => setCalibration(`⛔ 校準失敗：${String(e)}`));
          }}
        >
          {calibration}
        </button>
      </div>
    </div>
  );
});

const FRAME_MS = 1000 / 60;
