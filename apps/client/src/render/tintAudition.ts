/**
 * tintAudition — the review scene behind `public/tint-audition.html` (task #263).
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------
 * #263 is a COLOUR change, and this project has been burnt twice by evidence
 * that could not have shown a colour change even if there were none: #93/#235
 * shipped screenshots through a camera the game does not have, and once shipped
 * two BYTE-IDENTICAL frames as before/after. So this page follows the rule
 * `presentationAudition` established, extended one step:
 *
 *      THE CAMERA IS THE REAL `CameraRig`, THE FLOOR IS THE REAL
 *      `buildZoneGround`, AND THE CHAMPION IS THE REAL `ChampionView` —
 *      voxel skin, .glb upgrade, team ring and all.
 *
 * The ONLY thing `?tint=off` changes is whether `applyModelTint` is called. It
 * is the same scene, the same mesh, the same frame index, so a diff between the
 * two captures is the tint and nothing else. `probe()` reports the measured
 * albedo/diffuse of a body material and of the team ring, so the capture script
 * can assert on numbers as well as pixels — and can prove the team colour did
 * NOT move, which is the regression this change most needs to rule out.
 *
 * Content is fetched one doc at a time off the dev server's `/content/**`
 * mount rather than booting ContentDb: the page needs exactly one ChampionDef
 * and one ModelDoc, and a full boot would drag the whole 1770-doc bundle in.
 *
 * Nothing in the shipped app imports this — `public/*.html` is not a build
 * entry, so it never reaches the bundle.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { Material } from "@babylonjs/core/Materials/material";

import type { ChampionId } from "@ggd/shared/ids";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ModelDoc } from "@ggd/shared/content";
import { Champions } from "@ggd/shared/sim/content/registry";

import { CameraRig } from "./CameraRig";
import { buildZoneGround } from "./ArenaGround";
import { AssetManager } from "./AssetManager";
import { ChampionView } from "./views/ChampionView";
import { ARCHETYPE_BY_MODEL_KEY, voxelLookFor } from "./views/voxelLook";
import { voxelSkinForId } from "./views/voxelSkinFor";
import { championTintForId } from "./views/championTint";
import { applyModelTint, releaseModelTint, UNTINTED_MESH_SUFFIXES } from "./views/modelTint";
import { combatCameraPose } from "./effectFraming";

export interface TintAuditionOptions {
  /** champion doc id, e.g. `godie-u00l`. */
  champ: string;
  /** `false` = the pre-#263 behaviour: load the same model, paint nothing. */
  tint?: boolean;
  /** team slot for the ring/band colour (0..3). */
  teamId?: number;
}

export interface TintAuditionHandle {
  stepTo(ms: number): void;
  readonly settled: boolean;
  probe(): Record<string, unknown>;
  dispose(): void;
}

/** Duck-typed colour slot, same shape `modelTint.colorSlot` reads. */
interface ColoredMaterial {
  diffuseColor?: Color3;
  albedoColor?: Color3;
  baseColor?: Color3;
}

function slotOf(mat: Material | null): Color3 | null {
  const m = mat as unknown as ColoredMaterial | null;
  return m ? (m.albedoColor ?? m.baseColor ?? m.diffuseColor ?? null) : null;
}

const hex = (c: Color3 | null): string | null =>
  c
    ? `#${[c.r, c.g, c.b]
        .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0"))
        .join("")}`
    : null;

/** Relative luminance of a colour slot — the readability number #231 clamps. */
const luma = (c: Color3 | null): number | null =>
  c ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : null;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function buildArena(scene: Scene): TransformNode {
  const root = new TransformNode("tint-aud-arena", scene);
  const hemi = new HemisphericLight("tint-aud-hemi", new Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.75;
  const sun = new DirectionalLight("tint-aud-sun", new Vector3(-0.4, -1, 0.35), scene);
  sun.intensity = 1.1;
  // THE REAL FLOOR, at the radius every shipped arena zone uses.
  buildZoneGround(scene, root, { center: { x: 0, z: 0 }, boundaryRadius: 24 }, 0, "stone");
  return root;
}

export function startTintAudition(
  canvas: HTMLCanvasElement,
  opts: TintAuditionOptions,
): TintAuditionHandle {
  const championId = opts.champ;
  const wantTint = opts.tint !== false;
  const teamId = opts.teamId ?? 0;

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.06, 0.1, 1);
  buildArena(scene);

  // THE REAL RIG — same class, same constants, same defaults a match uses.
  const rig = new CameraRig(scene, { x: 0, z: 0 });
  const camUpdate = (dtMs: number): void =>
    rig.update({
      dtMs,
      localPos: { x: 0, z: 0 },
      cursor: null,
      panKeys: null,
      viewportWidth: canvas.clientWidth || 1280,
      viewportHeight: canvas.clientHeight || 720,
    });
  // The subject stands at the origin, which is exactly where the shipped rig
  // looks (it tracks the local player's own feet) — so this IS the real shot,
  // with the rig owning pitch and dolly as it does in a match.
  camUpdate(16);

  const assets = new AssetManager(scene);
  let view: ChampionView | null = null;
  let painted = -1;
  let loadError: string | null = null;
  let champDoc: (ChampionDef & { modelKey: string }) | null = null;
  /**
   * The frame-step clock does not start until the champion is actually on the
   * stage. Without this the 600 ms target is reached in ~36 software frames —
   * long before the .glb has been fetched, parsed and painted — and the page
   * freezes on an EMPTY arena. A blank frame is not evidence; that is the whole
   * reason the freeze is gated rather than timed.
   */
  let mounted = false;
  /** true once a model doc was found, so the .glb upgrade is expected to land. */
  let expectGlb = false;
  /** frames spent waiting for that .glb before giving up (~5 s at 60 steps/s). */
  let glbWaitFrames = 0;
  const GLB_WAIT_BUDGET = 300;

  const mount = async (): Promise<void> => {
    const doc = await fetchJson<ChampionDef & { modelKey: string }>(
      `/content/champions/${encodeURIComponent(championId)}.json`,
    );
    if (!doc) {
      loadError = `no champion doc for ${championId}`;
      return;
    }
    champDoc = doc;
    // one champion is all the registry needs — `championTintForId` and
    // `voxelSkinForId` both resolve through it, exactly as in a real match
    Champions.register(doc.id as ChampionId, doc);

    const overrides = await fetchJson<{ overrides?: Record<string, { relativeScale?: number }> }>(
      "/content/models/_standin-overrides.json",
    );
    const relativeScale = overrides?.overrides?.[championId]?.relativeScale ?? 1;
    const modelDoc = await fetchJson<ModelDoc>(
      `/content/models/${encodeURIComponent(doc.modelKey)}.json`,
    );

    const skin = voxelSkinForId(championId) ?? null;
    const v = new ChampionView(scene, 1, doc.modelKey, teamId, { skin });
    // #226/#231: the four shared stand-in meshes take a per-champion generated
    // look; an imported champion wears its own art and must NOT be repainted.
    const archetype = ARCHETYPE_BY_MODEL_KEY[doc.modelKey];
    if (archetype) v.setVoxelLook(voxelLookFor(championId, archetype));
    if (modelDoc) v.tryUpgradeToGlb(assets, modelDoc, relativeScale);
    // A stand-in champion's recipe says `preferVoxelBody`, and `tryUpgradeToGlb`
    // DECLINES the swap for exactly those (adopting `champ.sela` would hide the
    // generated skin behind somebody else's body — #231). So `hasGlb` staying
    // false is the SHIPPED figure for those 44, not a failed load, and waiting
    // for a .glb that will never come would just stall the capture.
    expectGlb = modelDoc !== null && skin?.preferVoxelBody !== true;
    view = v;

    // THE ONE LINE UNDER TEST. `?tint=off` reproduces the pre-#263 screens.
    // The tint is resolved through the SAME `championTintForId` the arena, the
    // champ-select stage, the store and the intermission shop all call.
    painted = wantTint ? applyModelTint(v.root, championTintForId(championId) ?? null) : 0;
    mounted = true;
  };

  void mount();

  const STEP_MS = 1000 / 60;
  scene.useConstantAnimationDeltaTime = true;
  let stepTargetMs: number | null = null;
  let nowMs = 0;
  let frozen = false;

  engine.runRenderLoop(() => {
    if (frozen) return;
    // the .glb lands asynchronously; re-apply once it does, exactly as
    // EntityViewRegistry.applyTint does on `view.hasGlb`
    if (view && wantTint && view.hasGlb && painted >= 0) {
      // MAX, not last: `applyModelTint` is idempotent and reports 0 once every
      // mesh already wears this exact tint, so overwriting would report 0 on a
      // fully-painted model — the same number an unpainted one reports.
      painted = Math.max(painted, applyModelTint(view.root, championTintForId(championId) ?? null));
    }
    camUpdate(STEP_MS);
    scene.render();
    // the clock only advances once the subject is on stage (see `mounted`)
    if (!mounted) return;
    // …and, when a model doc exists, once its .glb has actually landed — the
    // arena shows the UPGRADED mesh, so a capture of the procedural fallback
    // would be a different figure. Bounded, so a missing asset degrades to the
    // fallback instead of hanging the page forever.
    if (expectGlb && !view?.hasGlb && glbWaitFrames++ < GLB_WAIT_BUDGET) return;
    if (stepTargetMs !== null && nowMs >= stepTargetMs) {
      frozen = true;
      return;
    }
    nowMs += STEP_MS;
  });

  /** Every mesh under the champion root, split into body vs team-colour. */
  const sample = (): {
    body: { name: string; color: string | null; luma: number | null }[];
    team: { name: string; color: string | null }[];
  } => {
    const body: { name: string; color: string | null; luma: number | null }[] = [];
    const team: { name: string; color: string | null }[] = [];
    for (const mesh of view?.root.getChildMeshes(false) ?? []) {
      const c = slotOf(mesh.material);
      if (UNTINTED_MESH_SUFFIXES.some((s) => mesh.name.endsWith(s))) {
        team.push({ name: mesh.name, color: hex(c) });
      } else if (c) {
        body.push({ name: mesh.name, color: hex(c), luma: luma(c) });
      }
    }
    return { body, team };
  };

  return {
    stepTo(ms: number): void {
      stepTargetMs = ms;
      frozen = false;
    },
    get settled(): boolean {
      // never freeze on an empty stage — a blank frame is not evidence
      return frozen && (view?.root.getChildMeshes(false).length ?? 0) > 0;
    },
    probe(): Record<string, unknown> {
      const s = sample();
      const cam = rig.camera;
      return {
        champion: championId,
        name: champDoc?.name ?? null,
        modelKey: champDoc?.modelKey ?? null,
        tintRequested: wantTint,
        tintValue: champDoc?.tint ?? null,
        // null here with `tintRequested: true` means the champion is untinted
        resolvedTint: championTintForId(championId) ?? null,
        meshesPainted: painted,
        hasGlb: view?.hasGlb ?? false,
        // >0 with hasGlb false means the .glb never landed and the capture is
        // of the PROCEDURAL fallback — say so rather than let it pass as the
        // shipped figure.
        glbWaitFrames,
        loadError,
        nowMs,
        frozen,
        // the real camera's shipped pose, for the record
        eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        fov: cam.fov,
        pose: combatCameraPose({ x: 0, z: 0 }),
        bodyMaterials: s.body,
        teamMaterials: s.team,
      };
    },
    dispose(): void {
      engine.stopRenderLoop();
      // hand the AssetManager's cached materials back before the view goes
      if (view) releaseModelTint(view.root);
      view?.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
