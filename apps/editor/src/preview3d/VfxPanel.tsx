/**
 * VFX 3D panel — `vfx` collection docs rendered through the data-driven
 * toParticleSystem factory on a dark backdrop (additive particles need it).
 * Burst docs re-burst on a ~1.5s loop; edits re-instantiate the system
 * debounced (~300ms). Transport: play / pause / burst now.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { zVfxDoc, zRibbonDoc, type VfxDoc } from "@ggd/shared/content";
import { BabylonCanvas, type BabylonStage } from "./BabylonCanvas";
import { toParticleSystem, burstNow } from "./particles";
import { createFlatDisc, createGroundGrid } from "./stage";
import { useDebounced } from "./useDebounced";

const REBURST_MS = 1500;

export function VfxPanel({ doc }: { doc: unknown }) {
  // memoized on doc identity so the debounce settles between edits
  const parsedDoc = useMemo(() => {
    const r = zVfxDoc.safeParse(doc);
    return r.success ? r.data : null;
  }, [doc]);
  // ribbon@1 docs are VALID vfx-collection docs — they just have no particle
  // preview here yet (trails need an animated anchor; render/ship covers them)
  const isRibbon = useMemo(() => zRibbonDoc.safeParse(doc).success, [doc]);
  const debouncedDoc = useDebounced(parsedDoc, 300);

  const stageRef = useRef<BabylonStage | null>(null);
  const psRef = useRef<ParticleSystem | null>(null);
  const burstTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(true);
  runningRef.current = running;

  const clearBurstTimer = () => {
    if (burstTimer.current !== null) {
      clearInterval(burstTimer.current);
      burstTimer.current = null;
    }
  };

  const onReady = useCallback((stage: BabylonStage) => {
    stageRef.current = stage;
    createGroundGrid(stage.scene, 6, 1);
    createFlatDisc(stage.scene, "vfx-floor", { x: 0, z: 0 }, 3.2, "#151823", { y: 0 });
    return () => {
      clearBurstTimer();
      psRef.current?.dispose();
      psRef.current = null;
      stageRef.current = null;
    };
  }, []);

  // ---- (re)instantiate on debounced doc changes ----
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !debouncedDoc) return;
    psRef.current?.dispose();
    clearBurstTimer();
    const ps = toParticleSystem(debouncedDoc, stage.scene);
    psRef.current = ps;
    if (runningRef.current) startSystem(ps, debouncedDoc, burstTimer);
  }, [debouncedDoc]);

  const play = () => {
    const ps = psRef.current;
    if (!ps || !debouncedDoc) return;
    startSystem(ps, debouncedDoc, burstTimer);
    setRunning(true);
  };

  const pause = () => {
    psRef.current?.stop();
    clearBurstTimer();
    setRunning(false);
  };

  const doBurst = () => {
    const ps = psRef.current;
    if (!ps || !debouncedDoc) return;
    if (!running) {
      ps.start();
      setRunning(true);
    }
    burstNow(ps, debouncedDoc);
  };

  return (
    <div className="preview3d preview3d-dark">
      <BabylonCanvas
        onReady={onReady}
        clearColor={[0.03, 0.035, 0.05, 1]}
        cameraRadius={7}
        cameraTarget={[0, 1, 0]}
      />
      {parsedDoc === null ? (
        isRibbon ? (
          <p className="preview-note">ribbon@1 trail — no editor preview yet (renders in-game on its anchor bone).</p>
        ) : (
          <p className="preview-note preview3d-error">Doc invalid — showing the last valid effect.</p>
        )
      ) : null}
      <div className="preview3d-controls">
        {running ? (
          <button type="button" onClick={pause}>pause</button>
        ) : (
          <button type="button" onClick={play}>play</button>
        )}
        {debouncedDoc?.mode === "burst" ? (
          <button type="button" onClick={doBurst}>burst now</button>
        ) : null}
        {debouncedDoc ? (
          <span className="preview-note">
            {debouncedDoc.mode === "burst"
              ? `burst ×${debouncedDoc.burstCount ?? 0} every ${REBURST_MS / 1000}s`
              : `${debouncedDoc.rate ?? 0}/s continuous`}
            {debouncedDoc.texture ? "" : " · no texture (flat quads)"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function startSystem(
  ps: ParticleSystem,
  doc: VfxDoc,
  burstTimer: { current: ReturnType<typeof setInterval> | null },
): void {
  ps.start();
  if (doc.mode === "burst") {
    burstNow(ps, doc);
    burstTimer.current = setInterval(() => burstNow(ps, doc), REBURST_MS);
  }
}
