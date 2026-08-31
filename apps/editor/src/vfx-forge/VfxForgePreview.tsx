import { useEffect, useRef, useState } from "react";
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
  type ForgeOverlay,
  type VfxForgeStageMode,
} from "./VfxForgeStage";

export function VfxForgePreview({
  script,
  ability,
  schedule,
  durationMs,
  playheadMs,
  playing,
  caster,
  target,
  mode = "script",
  onTime,
  onStop,
  onDropAsset,
}: {
  script: VfxScriptDoc;
  ability: ForgeAbility;
  schedule: readonly ScheduledSimEvent[];
  durationMs: number;
  playheadMs: number;
  playing: boolean;
  caster: ChampionDef | null;
  target: ChampionDef | null;
  mode?: VfxForgeStageMode;
  onTime(ms: number): void;
  onStop(): void;
  onDropAsset?(asset: AssetDrop, placement?: AssetPlacement): void;
}) {
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
  const firstPose = schedule.find((item) => item.actorPose)?.actorPose;
  const homePoseKey = firstPose
    ? `${firstPose.caster.x},${firstPose.caster.z}/${firstPose.target.x},${firstPose.target.z}`
    : "pending-pose";

  useEffect(() => { playheadRef.current = playheadMs; }, [playheadMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new VfxForgeStage(canvas, script, ability, schedule, {
      actors: { caster, target },
      mode,
      onOverlay: setOverlay,
    });
    stageRef.current = stage;
    const resize = new ResizeObserver(() => stage.resize());
    resize.observe(canvas);
    return () => { resize.disconnect(); stage.dispose(); stageRef.current = null; };
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
    const stage = stageRef.current;
    if (stage && Math.abs(stage.timeMs - playheadMs) > 1) stage.seek(playheadMs);
  }, [playheadMs, playing]);

  return (
    <div
      className="vfx-stage"
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
        <button type="button" onClick={() => stageRef.current?.zoomBy(-100)}>鏡頭拉近</button>
        <button type="button" onClick={() => stageRef.current?.zoomBy(100)}>鏡頭拉遠</button>
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
}

const FRAME_MS = 1000 / 60;
