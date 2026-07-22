/**
 * MODEL INSPECTOR — real Babylon panel for `models` collection docs.
 *
 * Loads the doc's GLB through the content-api asset route, applies `scale`
 * live, lists every AnimationGroup in the file with play/pause/loop, offers
 * quick-play buttons for each clipMap state (missing mappings turn red so
 * typos are immediately visible), and overlays a wireframe cylinder showing
 * `collisionRadius` against the model. Form edits re-apply debounced.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { zModelDoc } from "@ggd/shared/content";
import { BabylonCanvas, type BabylonStage } from "./BabylonCanvas";
import { loadGlbContainer } from "./loadGlb";
import { clipMapStatus, resolveClip, CLIP_STATES, type ClipState } from "./clips";
import {
  createCollisionCylinder,
  createGroundGrid,
  setCollisionRadius,
} from "./stage";
import { useDebounced } from "./useDebounced";

interface ModelPanelProps {
  doc: unknown;
  /** clipMap state to auto-play once the GLB is in (champion embed: "idle") */
  autoPlay?: ClipState;
}

export function ModelPanel({ doc, autoPlay = "idle" }: ModelPanelProps) {
  // memoized on doc identity: a stable draft must yield a stable parsed value,
  // otherwise the debounce below re-fires forever on unrelated re-renders
  const parsedDoc = useMemo(() => {
    const r = zModelDoc.safeParse(doc);
    return r.success ? r.data : null;
  }, [doc]);
  const debouncedDoc = useDebounced(parsedDoc, 250);

  const stageRef = useRef<BabylonStage | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);
  const cylinderRef = useRef<Mesh | null>(null);
  const loadSeq = useRef(0);

  const [groups, setGroups] = useState<AnimationGroup[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [showCollision, setShowCollision] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onReady = useCallback((stage: BabylonStage) => {
    stageRef.current = stage;
    createGroundGrid(stage.scene, 8, 1);
    cylinderRef.current = createCollisionCylinder(stage.scene, 0.6);
    return () => {
      containerRef.current?.dispose();
      containerRef.current = null;
      stageRef.current = null;
    };
  }, []);

  const stopAll = (gs: AnimationGroup[]) => gs.forEach((g) => g.stop());

  const playClip = useCallback(
    (clipName: string, opts: { loop: boolean }) => {
      const gs = containerRef.current?.animationGroups ?? [];
      const g = resolveClip(gs, clipName);
      if (!g) return false;
      stopAll(gs);
      g.start(opts.loop, 1.0);
      setSelected(g.name);
      setPlaying(true);
      return true;
    },
    [],
  );

  // ---- GLB (re)load when the path changes ----
  const glbPath = debouncedDoc?.glbPath ?? null;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !glbPath) return;
    const seq = ++loadSeq.current;
    setLoadError(null);
    loadGlbContainer(stage.scene, glbPath).then(
      (container) => {
        if (seq !== loadSeq.current || !stageRef.current) {
          container.dispose();
          return;
        }
        containerRef.current?.dispose();
        containerRef.current = container;
        container.addAllToScene();
        stopAll(container.animationGroups);
        setGroups([...container.animationGroups]);
        applyScale(container, debouncedDoc?.scale ?? 1);
        const wanted = debouncedDoc?.clipMap[autoPlay];
        const started = wanted
          ? resolveClip(container.animationGroups, wanted)
          : null;
        const g = started ?? container.animationGroups[0] ?? null;
        if (g) {
          g.start(true, 1.0);
          setSelected(g.name);
          setPlaying(true);
        }
      },
      (e) => {
        if (seq === loadSeq.current) setLoadError(String(e?.message ?? e));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glbPath]);

  // ---- live scale ----
  useEffect(() => {
    if (containerRef.current && debouncedDoc) applyScale(containerRef.current, debouncedDoc.scale);
  }, [debouncedDoc?.scale, debouncedDoc]);

  // ---- live collision radius + toggle ----
  useEffect(() => {
    const cyl = cylinderRef.current;
    if (!cyl) return;
    if (debouncedDoc) setCollisionRadius(cyl, debouncedDoc.collisionRadius);
    cyl.setEnabled(showCollision);
  }, [debouncedDoc?.collisionRadius, showCollision, debouncedDoc]);

  const clipStatus = useMemo(
    () => (debouncedDoc ? clipMapStatus(debouncedDoc.clipMap, groups) : []),
    [debouncedDoc, groups],
  );

  const togglePlay = () => {
    const gs = containerRef.current?.animationGroups ?? [];
    const g = gs.find((x) => x.name === selected);
    if (!g) return;
    if (playing) {
      g.pause();
      setPlaying(false);
    } else {
      g.play(loop);
      setPlaying(true);
    }
  };

  return (
    <div className="preview3d">
      <BabylonCanvas onReady={onReady} cameraRadius={4} cameraTarget={[0, 0.9, 0]} />
      {parsedDoc === null ? (
        <p className="preview-note preview3d-error">Doc invalid — showing the last valid model.</p>
      ) : null}
      {loadError ? <p className="preview-note preview3d-error">GLB load failed: {loadError}</p> : null}
      <div className="preview3d-controls">
        <select
          value={selected}
          onChange={(e) => playClip(e.target.value, { loop })}
          title={`${groups.length} AnimationGroups in the GLB`}
        >
          {groups.length === 0 ? <option value="">(no clips loaded)</option> : null}
          {groups.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={togglePlay} disabled={!selected}>
          {playing ? "pause" : "play"}
        </button>
        <label className="preview3d-check">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          loop
        </label>
        <label className="preview3d-check">
          <input
            type="checkbox"
            checked={showCollision}
            onChange={(e) => setShowCollision(e.target.checked)}
          />
          hitbox
        </label>
      </div>
      <div className="preview3d-clipmap">
        {clipStatus.map((c) => (
          <button
            key={c.state}
            type="button"
            className={c.found ? "clip-ok" : "clip-missing"}
            title={c.found ? `plays "${c.clip}"` : `clip "${c.clip}" not in GLB`}
            onClick={() => playClip(c.clip, { loop: c.state === "idle" || c.state === "run" ? true : loop })}
            disabled={!c.found}
          >
            {c.state}
          </button>
        ))}
      </div>
      {CLIP_STATES.length > 0 && clipStatus.some((c) => !c.found) ? (
        <p className="preview-note preview3d-error">
          Missing clips: {clipStatus.filter((c) => !c.found).map((c) => `${c.state}→"${c.clip}"`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function applyScale(container: AssetContainer, scale: number): void {
  for (const root of container.rootNodes) {
    if ("scaling" in root) {
      (root as unknown as Mesh).scaling.setAll(scale);
    }
  }
}
