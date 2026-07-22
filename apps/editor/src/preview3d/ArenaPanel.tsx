/**
 * ARENA 3D panel — `arenas` docs rendered as collision truth + visual decor:
 *   zone ground discs (groundStyle tint) + boundary rings,
 *   obstacles semi-transparent red (circle -> disc+cylinder, segment -> wall),
 *   spawn markers colored per side, decor props (GLB, rotQuarter*90°, scale).
 * The decor[] array in the form IS the placement editor: edits re-render the
 * scene debounced (~300ms). GLB containers are cached per model path so a
 * placement tweak never re-downloads props.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { zArenaDoc, type ArenaDoc } from "@ggd/shared/content";
import { BabylonCanvas, type BabylonStage } from "./BabylonCanvas";
import { loadGlbContainer } from "./loadGlb";
import { decorTransform, TEAM_SPAWN_COLORS } from "./decor";
import { createFlatDisc, createSegmentWall, flatColorMaterial } from "./stage";
import { useDebounced } from "./useDebounced";

const GROUND_COLORS: Record<ArenaDoc["groundStyle"], string> = {
  stone: "#3a3f4c",
  dirt: "#4a3b2c",
  wood: "#52402a",
  grass: "#39662f",
  sand: "#9a8253",
};

export function ArenaPanel({ doc }: { doc: unknown }) {
  // memoized on doc identity so the debounce settles between edits
  const parsedDoc = useMemo(() => {
    const r = zArenaDoc.safeParse(doc);
    return r.success ? r.data : null;
  }, [doc]);
  const debouncedDoc = useDebounced(parsedDoc, 300);

  const stageRef = useRef<BabylonStage | null>(null);
  /** everything rebuilt per doc change parents under this node */
  const layoutRef = useRef<TransformNode | null>(null);
  const containerCache = useRef(new Map<string, Promise<AssetContainer>>());
  const buildSeq = useRef(0);

  const onReady = useCallback((stage: BabylonStage) => {
    stageRef.current = stage;
    return () => {
      buildSeq.current++;
      layoutRef.current?.dispose();
      layoutRef.current = null;
      containerCache.current.clear();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !debouncedDoc) return;
    const seq = ++buildSeq.current;
    const scene = stage.scene;

    layoutRef.current?.dispose();
    const layout = new TransformNode("arena-layout", scene);
    layoutRef.current = layout;

    // ---- zones: ground disc + boundary ring + obstacles + spawns ----
    for (const zone of debouncedDoc.zones) {
      const ground = createFlatDisc(
        scene,
        `zone-${zone.id}`,
        zone.center,
        zone.boundaryRadius,
        GROUND_COLORS[debouncedDoc.groundStyle],
        { y: 0 },
      );
      ground.parent = layout;

      const ring = CreateTorus(
        `zone-${zone.id}-ring`,
        { diameter: zone.boundaryRadius * 2, thickness: 0.25, tessellation: 64 },
        scene,
      );
      ring.position.set(zone.center.x, 0.05, zone.center.z);
      ring.material = flatColorMaterial(scene, `zone-${zone.id}-ring-mat`, "#8b93a5", { alpha: 0.5 });
      ring.parent = layout;

      zone.obstacles.forEach((ob, i) => {
        if (ob.kind === "circle") {
          const disc = createFlatDisc(scene, `ob-${zone.id}-${i}`, ob.center, ob.radius, "#e02b2b", {
            alpha: 0.35,
            y: 0.06,
          });
          disc.parent = layout;
        } else {
          const wall = createSegmentWall(scene, `ob-${zone.id}-${i}`, ob.a, ob.b, "#e02b2b", {
            alpha: 0.35,
          });
          wall.parent = layout;
        }
      });

      zone.spawns.forEach((side, sideIdx) => {
        const color = TEAM_SPAWN_COLORS[sideIdx as 0 | 1] ?? "#ffffff";
        side.forEach((p, slot) => {
          const marker = createFlatDisc(
            scene,
            `spawn-${zone.id}-${sideIdx}-${slot}`,
            p,
            0.8,
            color,
            { alpha: 0.9, y: 0.07 },
          );
          marker.parent = layout;
        });
      });
    }

    // ---- decor props (visual only) ----
    for (const [i, d] of debouncedDoc.decor.entries()) {
      let promise = containerCache.current.get(d.model);
      if (!promise) {
        promise = loadGlbContainer(scene, d.model);
        containerCache.current.set(d.model, promise);
      }
      const t = decorTransform(d);
      void promise.then(
        (container) => {
          if (seq !== buildSeq.current || !layoutRef.current) return;
          const inst = container.instantiateModelsToScene((name) => `decor-${i}-${name}`, false, {
            doNotInstantiate: false,
          });
          for (const root of inst.rootNodes) {
            root.parent = layoutRef.current;
            if (root instanceof TransformNode) {
              root.position.set(t.x, t.y, t.z);
              root.rotationQuaternion = null;
              root.rotation.y = t.rotationY;
              root.scaling.setAll(t.scale);
            }
          }
        },
        () => containerCache.current.delete(d.model), // allow retry after typo fix
      );
    }

    // ---- fit camera to the arena's bounds ----
    const xs = debouncedDoc.zones.flatMap((z) => [
      z.center.x - z.boundaryRadius,
      z.center.x + z.boundaryRadius,
    ]);
    const zs = debouncedDoc.zones.flatMap((z) => [
      z.center.z - z.boundaryRadius,
      z.center.z + z.boundaryRadius,
    ]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    stage.camera.target.set(cx, 0, cz);
    stage.camera.radius = extent * 0.9;
    stage.camera.upperRadiusLimit = extent * 4;
  }, [debouncedDoc]);

  return (
    <div className="preview3d">
      <BabylonCanvas onReady={onReady} cameraRadius={60} cameraTarget={[0, 0, 0]} height={300} />
      {parsedDoc === null ? (
        <p className="preview-note preview3d-error">Doc invalid — showing the last valid arena.</p>
      ) : null}
      <p className="preview-note">
        red = collision truth (obstacles) · discs = spawns (blue side 0, amber side 1) · props are
        visual-only decor — edit <code>decor[]</code> in the form to place them
      </p>
    </div>
  );
}
