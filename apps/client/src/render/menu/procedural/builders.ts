/**
 * Babylon scene-object builders for the DARK-EPIC isekai BOSS-BATTLE login
 * vista. Small, mostly-pure factories: each takes a `Scene` (+ a runtime
 * texture) and returns a handle the LoginScene animates. Everything is
 * procedural low-poly — no meshes or textures are loaded from disk.
 *
 * The look is built around EMISSIVE-against-dark: the sky, mist, lighting and
 * rock are near-black, and only the arenas, magic sigils, moon, light shafts
 * and the dynamic FX (dragons / beams / explosions — see ./fx) glow, so the
 * heavy bloom pass makes them pop.
 *
 * Per the architecture rule, only render/* and vfx/* may import @babylonjs/*;
 * this file lives under render/menu/ so that's fine.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { IslandSpec } from "./math";

const BILLBOARD_ALL = TransformNode.BILLBOARDMODE_ALL;

/**
 * Emissive accent hues cycled across the arenas / their beams — warm and cool
 * so the vista reads as several factions battling. Each is a bright HDR-ish rgb
 * that the bloom pass blows out.
 */
export const ARENA_ACCENTS: ReadonlyArray<readonly [number, number, number]> = [
  [1.0, 0.5, 0.16], // ember orange
  [0.28, 0.82, 1.0], // arc cyan
  [0.85, 0.4, 1.0], // arcane violet
  [1.0, 0.28, 0.34], // blood red
  [0.42, 1.0, 0.62], // toxic green
] as const;

/** Accent for arena `index` (wraps). */
export function arenaAccent(index: number): readonly [number, number, number] {
  return ARENA_ACCENTS[((index % ARENA_ACCENTS.length) + ARENA_ACCENTS.length) % ARENA_ACCENTS.length]!;
}

// ---------------------------------------------------------------------------
// sky dome
// ---------------------------------------------------------------------------

/**
 * A large inward-facing sphere carrying the dark boss-battle gradient as an
 * unlit emissive texture. `vScale = -1` flips the vertical so the near-black
 * void sits at the zenith and the ember horizon at the bottom.
 */
export function buildSky(scene: Scene, skyTex: Texture): Mesh {
  const dome = MeshBuilder.CreateSphere("login-sky", { diameter: 240, segments: 24 }, scene);
  const mat = new StandardMaterial("login-sky-mat", scene);
  skyTex.vScale = -1;
  skyTex.vOffset = 1;
  mat.emissiveTexture = skyTex;
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  mat.backFaceCulling = false; // we view it from the inside
  dome.material = mat;
  dome.isPickable = false;
  dome.infiniteDistance = true; // stays centred on the camera → seamless surround
  dome.freezeWorldMatrix();
  return dome;
}

// ---------------------------------------------------------------------------
// drifting mist (billboarded soft sprites — dark smoke across the void)
// ---------------------------------------------------------------------------

export interface CloudHandle {
  mesh: Mesh;
  speed: number; // units/sec drift on X
  minX: number;
  maxX: number;
}

/**
 * Scatter `count` billboarded soft planes across the sky as dim drifting
 * battle-smoke / mist. Deterministic layout (index-driven), tinted dark and
 * translucent so they veil the arenas without lighting up the scene.
 */
export function buildClouds(scene: Scene, cloudTex: Texture, count: number): CloudHandle[] {
  const out: CloudHandle[] = [];
  const mat = new StandardMaterial("login-mist-mat", scene);
  mat.diffuseTexture = cloudTex;
  mat.opacityTexture = cloudTex;
  mat.emissiveColor = new Color3(0.1, 0.11, 0.16); // dim cold smoke
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.useAlphaFromDiffuseTexture = true;
  mat.alpha = 0.45;
  for (let i = 0; i < count; i++) {
    const f = i / Math.max(1, count - 1);
    const size = 34 + ((i * 37) % 30);
    const plane = MeshBuilder.CreatePlane(`login-mist-${i}`, { size }, scene);
    plane.material = mat;
    plane.billboardMode = BILLBOARD_ALL;
    plane.isPickable = false;
    const depth = -60 - ((i * 17) % 46);
    const y = 4 + ((i * 23) % 30);
    const minX = -95;
    const maxX = 95;
    plane.position.set(minX + f * (maxX - minX), y, depth);
    const speed = 0.8 + f * 1.3 * (i % 2 === 0 ? 1 : -1);
    out.push({ mesh: plane, speed, minX, maxX });
  }
  return out;
}

// ---------------------------------------------------------------------------
// floating glowing arena islands
// ---------------------------------------------------------------------------

/**
 * A floating ARENA island: a dark rocky underside carrying a tiered colosseum
 * (concentric emissive-edged stands) around a glowing magic-circle floor, with
 * emissive-capped pillars on the rim and a soft light beam spilling up from the
 * floor. Built centred at its parent origin (scale 1) — the caller
 * positions/scales/animates the returned root. Each island takes a distinct
 * emissive accent (see {@link arenaAccent}) so the arenas read as rival camps.
 */
export function buildFloatingIsland(scene: Scene, spec: IslandSpec, index: number): TransformNode {
  const root = new TransformNode(`login-island-${index}`, scene);
  const [ar, ag, ab] = arenaAccent(index);

  // dark rocky underside (tapering spire)
  const rockMat = new StandardMaterial(`login-island-rock-${index}`, scene);
  rockMat.diffuseColor = new Color3(0.09, 0.08, 0.12);
  rockMat.emissiveColor = new Color3(0.02, 0.02, 0.03);
  rockMat.specularColor = new Color3(0, 0, 0);
  const rock = MeshBuilder.CreateCylinder(
    `login-island-rock-mesh-${index}`,
    { diameterTop: 6.2, diameterBottom: 0.7, height: 5.2, tessellation: 9 },
    scene,
  );
  rock.position.y = -2.9;
  rock.material = rockMat;
  rock.isPickable = false;
  rock.parent = root;

  // dark stone stands with an emissive top edge — tiered colosseum
  const standMat = new StandardMaterial(`login-island-stand-${index}`, scene);
  standMat.diffuseColor = new Color3(0.12, 0.12, 0.16);
  standMat.emissiveColor = new Color3(ar * 0.05, ag * 0.05, ab * 0.05);
  standMat.specularColor = new Color3(0, 0, 0);

  const edgeMat = new StandardMaterial(`login-island-edge-${index}`, scene);
  edgeMat.emissiveColor = new Color3(ar, ag, ab);
  edgeMat.diffuseColor = new Color3(0, 0, 0);
  edgeMat.disableLighting = true;

  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const outer = 6.4 - t * 1.35;
    const y = -0.1 + t * 0.52;
    const wall = MeshBuilder.CreateCylinder(
      `login-island-stand-${index}-${t}`,
      { diameterTop: outer - 0.5, diameterBottom: outer, height: 0.5, tessellation: 22 },
      scene,
    );
    wall.position.y = y;
    wall.material = standMat;
    wall.isPickable = false;
    wall.parent = root;
    // thin glowing lip on top of each tier
    const lip = MeshBuilder.CreateTorus(
      `login-island-lip-${index}-${t}`,
      { diameter: outer - 0.25, thickness: 0.09, tessellation: 30 },
      scene,
    );
    lip.position.y = y + 0.26;
    lip.material = edgeMat;
    lip.isPickable = false;
    lip.parent = root;
  }

  // glowing magic-circle arena floor
  const floorMat = new StandardMaterial(`login-island-floor-${index}`, scene);
  floorMat.emissiveColor = new Color3(ar, ag, ab);
  floorMat.diffuseColor = new Color3(0, 0, 0);
  floorMat.disableLighting = true;
  floorMat.alpha = 0.85;
  const floor = MeshBuilder.CreateDisc(
    `login-island-floor-mesh-${index}`,
    { radius: 2.4, tessellation: 40 },
    scene,
  );
  floor.rotation.x = Math.PI / 2; // lay flat
  floor.position.y = 0.42;
  floor.material = floorMat;
  floor.isPickable = false;
  floor.parent = root;

  // emissive-capped pillars around the rim
  const pillarMat = new StandardMaterial(`login-island-pillar-${index}`, scene);
  pillarMat.diffuseColor = new Color3(0.14, 0.14, 0.18);
  pillarMat.specularColor = new Color3(0, 0, 0);
  const pillarCount = 6;
  for (let k = 0; k < pillarCount; k++) {
    const a = (k / pillarCount) * Math.PI * 2 + index;
    const px = Math.cos(a) * 2.9;
    const pz = Math.sin(a) * 2.9;
    const pillar = MeshBuilder.CreateCylinder(
      `login-island-pillar-mesh-${index}-${k}`,
      { diameter: 0.34, height: 1.5, tessellation: 6 },
      scene,
    );
    pillar.position.set(px, 1.0, pz);
    pillar.material = pillarMat;
    pillar.isPickable = false;
    pillar.parent = root;
    const cap = MeshBuilder.CreateBox(`login-island-cap-${index}-${k}`, { size: 0.34 }, scene);
    cap.position.set(px, 1.85, pz);
    cap.material = edgeMat;
    cap.isPickable = false;
    cap.parent = root;
  }

  // soft light beam spilling up out of the arena floor
  const beamMat = new StandardMaterial(`login-island-beam-${index}`, scene);
  beamMat.emissiveColor = new Color3(ar, ag, ab);
  beamMat.diffuseColor = new Color3(0, 0, 0);
  beamMat.disableLighting = true;
  beamMat.alpha = 0.1;
  const beam = MeshBuilder.CreateCylinder(
    `login-island-beam-mesh-${index}`,
    { diameterTop: 2.4, diameterBottom: 1.1, height: 15, tessellation: 12 },
    scene,
  );
  beam.position.y = 7.8;
  beam.material = beamMat;
  beam.isPickable = false;
  beam.parent = root;

  root.scaling.setAll(spec.scale);
  root.position.set(spec.x, spec.y, spec.z);
  return root;
}

// ---------------------------------------------------------------------------
// magic circle / sky sigil
// ---------------------------------------------------------------------------

export interface MagicRing {
  node: TransformNode;
  spinSpeed: number; // rad/sec (signed)
  /** base emissive rgb for the pulse (multiplied by the glow factor) */
  baseR: number;
  baseG: number;
  baseB: number;
  mats: StandardMaterial[];
}

export interface MagicCircleHandle {
  root: TransformNode;
  rings: MagicRing[];
}

export interface MagicCircleOpts {
  /** lay flat (glow points up) — default true; false = a vertical sky portal */
  flat?: boolean;
  /** overall scale multiplier — default 1 */
  scale?: number;
  /** ring radii (largest → smallest) */
  radii?: number[];
  /** emissive palette cycled across the rings */
  palette?: Array<readonly [number, number, number]>;
  /** draw the faint backing disc under the rings — default true */
  disc?: boolean;
}

/**
 * A glowing magic circle: concentric emissive tori, each in its own spinnable
 * group with a ring of rune ticks so the counter-rotation is visible, plus a
 * faint glowing disc. Used both as an arena-centre circle (flat) and as a huge
 * vertical sky sigil / portal (flat:false, big scale). The caller spins the
 * ring nodes and pulses the emissive.
 */
export function buildMagicCircle(scene: Scene, center: Vector3, opts: MagicCircleOpts = {}): MagicCircleHandle {
  const flat = opts.flat ?? true;
  const scale = opts.scale ?? 1;
  const radii = opts.radii ?? [7.5, 5.2, 3.1];
  const palette = opts.palette ?? [
    [0.45, 0.85, 1.0], // cyan
    [1.0, 0.62, 0.3], // ember
    [0.8, 0.5, 1.0], // violet
  ];

  const root = new TransformNode("login-magic", scene);
  root.position.copyFrom(center);
  if (flat) root.rotation.x = Math.PI / 2; // lay flat (glow points up)
  root.scaling.setAll(scale);

  const rings: MagicRing[] = [];
  for (let r = 0; r < radii.length; r++) {
    const radius = radii[r]!;
    const [cr, cg, cb] = palette[r % palette.length]!;
    const node = new TransformNode(`login-ring-${r}`, scene);
    node.parent = root;
    const mats: StandardMaterial[] = [];

    const ringMat = new StandardMaterial(`login-ring-mat-${r}`, scene);
    ringMat.emissiveColor = new Color3(cr, cg, cb);
    ringMat.diffuseColor = new Color3(0, 0, 0);
    ringMat.disableLighting = true;
    mats.push(ringMat);

    const torus = MeshBuilder.CreateTorus(
      `login-torus-${r}`,
      { diameter: radius * 2, thickness: 0.12 + r * 0.03, tessellation: 48 },
      scene,
    );
    torus.material = ringMat;
    torus.isPickable = false;
    torus.parent = node;

    // rune ticks around the ring — make the spin legible
    const tickCount = 12 + r * 6;
    for (let k = 0; k < tickCount; k++) {
      const a = (k / tickCount) * Math.PI * 2;
      const tick = MeshBuilder.CreateBox(
        `login-tick-${r}-${k}`,
        { width: 0.14, height: 0.05, depth: 0.5 + (k % 3) * 0.18 },
        scene,
      );
      tick.material = ringMat;
      tick.isPickable = false;
      tick.parent = node;
      tick.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      tick.rotation.y = -a;
    }

    rings.push({
      node,
      spinSpeed: (r % 2 === 0 ? 1 : -1) * (0.18 + r * 0.1),
      baseR: cr,
      baseG: cg,
      baseB: cb,
      mats,
    });
  }

  if (opts.disc ?? true) {
    const discMat = new StandardMaterial("login-magic-disc", scene);
    discMat.emissiveColor = new Color3(0.3, 0.45, 0.8);
    discMat.diffuseColor = new Color3(0, 0, 0);
    discMat.disableLighting = true;
    discMat.alpha = 0.1;
    const disc = MeshBuilder.CreateDisc("login-magic-disc-mesh", { radius: radii[0]! + 0.7, tessellation: 48 }, scene);
    disc.material = discMat;
    disc.isPickable = false;
    disc.parent = root;
  }

  return { root, rings };
}

// ---------------------------------------------------------------------------
// blood-eclipse moon (huge glowing disc far in the sky)
// ---------------------------------------------------------------------------

export interface MoonHandle {
  mesh: Mesh;
  mat: StandardMaterial;
  baseR: number;
  baseG: number;
  baseB: number;
}

/** A large billboarded emissive disc — a blood-eclipse moon behind the arenas. */
export function buildMoon(scene: Scene, position: Vector3, radius = 26): MoonHandle {
  const mat = new StandardMaterial("login-moon-mat", scene);
  const baseR = 0.85;
  const baseG = 0.32;
  const baseB = 0.26;
  mat.emissiveColor = new Color3(baseR, baseG, baseB);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  const disc = MeshBuilder.CreateDisc("login-moon", { radius, tessellation: 48 }, scene);
  disc.position.copyFrom(position);
  disc.material = mat;
  disc.isPickable = false;
  disc.billboardMode = BILLBOARD_ALL;
  disc.infiniteDistance = true;
  return { mesh: disc, mat, baseR, baseG, baseB };
}

// ---------------------------------------------------------------------------
// volumetric-ish god-ray light shafts (static, additive)
// ---------------------------------------------------------------------------

/**
 * A few big translucent emissive cones angled down from the sky — cheap
 * fake-volumetric god rays. Static (very low alpha) so they read as shafts of
 * light without any strobing.
 */
export function buildLightShafts(scene: Scene, count = 4): Mesh[] {
  const out: Mesh[] = [];
  const mat = new StandardMaterial("login-shaft-mat", scene);
  mat.emissiveColor = new Color3(0.55, 0.62, 0.85);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  mat.alpha = 0.055;
  mat.backFaceCulling = false;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.4;
    const shaft = MeshBuilder.CreateCylinder(
      `login-shaft-${i}`,
      { diameterTop: 1.2, diameterBottom: 11 + (i % 2) * 4, height: 46, tessellation: 12 },
      scene,
    );
    shaft.material = mat;
    shaft.isPickable = false;
    shaft.position.set(Math.cos(a) * 20, 12, Math.sin(a) * 20 - 10);
    shaft.rotation.z = 0.22 * Math.cos(a);
    shaft.rotation.x = 0.22 * Math.sin(a);
    out.push(shaft);
  }
  return out;
}

// ---------------------------------------------------------------------------
// lighting — dark moonlit key + cold rim + warm arena underglow
// ---------------------------------------------------------------------------

export function buildLighting(scene: Scene): void {
  const hemi = new HemisphericLight("login-hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.22; // dark — emissive + bloom carry the look
  hemi.diffuse = new Color3(0.4, 0.5, 0.72); // cold moon sky
  hemi.groundColor = new Color3(0.05, 0.03, 0.06); // near-black ground bounce

  const moon = new DirectionalLight("login-moon-key", new Vector3(-0.4, -0.85, 0.3), scene);
  moon.intensity = 0.4;
  moon.diffuse = new Color3(0.62, 0.72, 1.0); // cold moonlight key

  const underglow = new DirectionalLight("login-underglow", new Vector3(0.2, 0.9, -0.2), scene);
  underglow.intensity = 0.28;
  underglow.diffuse = new Color3(1.0, 0.45, 0.28); // warm fire from the arenas below
}

// ---------------------------------------------------------------------------
// ambient particle systems — rising embers + drifting stars
// ---------------------------------------------------------------------------

/** Rising warm embers from a wide low emitter (additive glow). */
export function buildMotes(scene: Scene, dotTex: Texture, capacity = 220): ParticleSystem {
  const ps = new ParticleSystem("login-embers", capacity, scene);
  ps.particleTexture = dotTex;
  ps.emitter = new Vector3(0, -6, 0);
  ps.minEmitBox = new Vector3(-32, -2, -30);
  ps.maxEmitBox = new Vector3(32, 2, 20);
  ps.color1 = new Color4(1.0, 0.55, 0.2, 0.95);
  ps.color2 = new Color4(1.0, 0.3, 0.12, 0.85);
  ps.colorDead = new Color4(0.7, 0.18, 0.08, 0);
  ps.minSize = 0.1;
  ps.maxSize = 0.44;
  ps.minLifeTime = 4;
  ps.maxLifeTime = 9;
  ps.emitRate = 30;
  ps.direction1 = new Vector3(-0.18, 1, -0.18);
  ps.direction2 = new Vector3(0.18, 1, 0.18);
  ps.minEmitPower = 0.8;
  ps.maxEmitPower = 2.4;
  ps.gravity = new Vector3(0, 0.7, 0); // buoyant — embers rise
  ps.minAngularSpeed = -0.4;
  ps.maxAngularSpeed = 0.4;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  return ps;
}

/** Slow, tiny, cold drifting stars high in the void (additive twinkle). */
export function buildPetals(scene: Scene, dotTex: Texture, capacity = 160): ParticleSystem {
  const ps = new ParticleSystem("login-stars", capacity, scene);
  ps.particleTexture = dotTex;
  ps.emitter = new Vector3(0, 30, -20);
  ps.minEmitBox = new Vector3(-60, -6, -30);
  ps.maxEmitBox = new Vector3(60, 12, 10);
  ps.color1 = new Color4(0.85, 0.9, 1.0, 0.9);
  ps.color2 = new Color4(0.7, 0.78, 1.0, 0.8);
  ps.colorDead = new Color4(0.8, 0.85, 1.0, 0);
  ps.minSize = 0.06;
  ps.maxSize = 0.22;
  ps.minLifeTime = 10;
  ps.maxLifeTime = 20;
  ps.emitRate = 16;
  ps.direction1 = new Vector3(-0.05, -0.02, 0.05);
  ps.direction2 = new Vector3(0.05, 0.02, -0.05);
  ps.minEmitPower = 0.1;
  ps.maxEmitPower = 0.4;
  ps.gravity = new Vector3(0, -0.02, 0); // barely-there drift
  ps.minAngularSpeed = -0.6;
  ps.maxAngularSpeed = 0.6;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  return ps;
}
