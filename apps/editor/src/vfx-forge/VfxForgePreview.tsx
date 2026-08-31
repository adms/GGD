import { useEffect, useRef, useState } from "react";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import {
  decodeAssetDrag,
  type AssetDrop,
  type AssetPlacement,
  type ForgeAbility,
  type TriggerCue,
} from "./model";
import { VfxForgeStage, type ForgeOverlay } from "./VfxForgeStage";

export function VfxForgePreview({
  script,
  ability,
  cues,
  durationMs,
  playheadMs,
  playing,
  onTime,
  onStop,
  onDropAsset,
}: {
  script: VfxScriptDoc;
  ability: ForgeAbility;
  cues: readonly TriggerCue[];
  durationMs: number;
  playheadMs: number;
  playing: boolean;
  onTime(ms: number): void;
  onStop(): void;
  onDropAsset(asset: AssetDrop, placement?: AssetPlacement): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<VfxForgeStage | null>(null);
  const playheadRef = useRef(playheadMs);
  const [overlay, setOverlay] = useState<ForgeOverlay>({ flash: null, texts: [], status: "準備中" });
  const [calibration, setCalibration] = useState("量尺未校準");

  useEffect(() => { playheadRef.current = playheadMs; }, [playheadMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new VfxForgeStage(canvas, script, ability, cues, { onOverlay: setOverlay });
    stageRef.current = stage;
    const resize = new ResizeObserver(() => stage.resize());
    resize.observe(canvas);
    return () => { resize.disconnect(); stage.dispose(); stageRef.current = null; };
    // Stage ownership follows the selected ability. Draft changes use setContent below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ability.id]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setContent(script, ability, cues);
    stage.seek(playheadRef.current);
  }, [ability, cues, script]);

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
    const stage = stageRef.current;
    if (stage && Math.abs(stage.timeMs - playheadMs) > 1) stage.seek(playheadMs);
  }, [playheadMs, playing]);

  return (
    <div
      className="vfx-stage"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={(e) => {
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
      <div className="vfx-stage-badge">真 CameraRig · 真地板 · 1/60 frame-step</div>
      <div className="vfx-stage-status">{overlay.status}</div>
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
  );
}

const FRAME_MS = 1000 / 60;
