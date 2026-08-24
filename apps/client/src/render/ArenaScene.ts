/**
 * ArenaScene — arena visuals in two passes:
 *   1. buildArena(): synchronous, DIRECTLY from the shared ArenaDef so what
 *      you see is exactly what the server collides against — floor + boundary
 *      rim per zone (render/ArenaGround.ts), a LOW-PROFILE marker per obstacle
 *      (stump + floor ring for circles, a low kerb slab for segments), spawn
 *      markers.
 *   2. dressArena(): async, from the authored arena doc — every decor prop
 *      instantiated with rotQuarter/scale, a contact shadow under each of them,
 *      OPTIONAL flame particles on torch tips (see below), water shimmer on hex
 *      water tiles (decor is visual-only; sim collision unchanged).
 *      Every placed prop is checked against the fixed camera's sightline
 *      (occluder audit #29): props that could fully hide a hero are Y-squashed
 *      to SIGHTLINE_HEIGHT_CAP, except FADE_MODELS which keep full height and
 *      auto-fade via the DecorFader when they block a camera→hero sightline.
 *
 * Everything a build/dress pass creates is parented under one `arenaRoot`
 * TransformNode (+ tracked flame ParticleSystems) so `disposeArena()` can tear
 * the whole map down for a clean rebuild when the match's mapId changes.
 *
 * ── 場地環境火焰是一格開關，不是一段程式碼 (GH#251) ─────────────────────────
 * owner 2026-08-01：「場地天空火焰很礙眼 請全部場地都去掉」。
 * 在此之前這裡寫死 `d.model.includes("torch")` → 一定掛火：skeleton（**預設
 * 場地**）16 支、castle 16 支、colosseum 16 支、royale 4 支，dota / godie 0 支，
 * 而且**後台一格都調不到**、一條測試都沒有。
 *
 * 現在它讀 `config/ambient-vfx@1` 的 `arenaFire`（出貨值 `enabled: false`），
 * 判斷集中在 shared 的 `decorModelBurns()`。**程式碼刻意留著**：「場地要不要有
 * 環境火」是一個決策點，owner 改主意時應該是後台打勾，不是再改一次程式＋重新
 * 部署（CLAUDE.md 第一守則）。
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import type {
  ArenaBackdropPolicy,
  ArenaDoc,
  ArenaFire,
  ArenaScenery,
  ArenaSceneryPolicy,
} from "@ggd/shared/content";
import {
  DEFAULT_ARENA_BACKDROP,
  DEFAULT_ARENA_FIRE,
  DEFAULT_ARENA_SCENERY_POLICY,
  decorModelBurns,
  expandSceneryProps,
  hexToRgb01,
  isOutlineShellMaterial,
} from "@ggd/shared/content";
import { groundStyleWallTint } from "@ggd/shared/content/schema/groundStyle";
import { buildBackdrop } from "./ArenaBackdrop";
import type { AssetManager } from "./AssetManager";
import { CAMERA_PITCH_RAD, DOLLY_MIN } from "./CameraRig";
import { DecorFader } from "./DecorFade";
import {
  buildContactShadows,
  buildZoneGround,
  CONTACT_SPREAD,
  detachGroundTextures,
  type ContactShadow,
  type GroundPalette,
  type WeatherGroundInput,
  type ZoneGround,
} from "./ArenaGround";
// ⭐ GH#610 第二批 —— 天氣（濕地面／積水）。⚠️ `setWeatherArena` 同時是**推進
// store 的唯一入口**：`Lighting` 的霧與雷擊補光靠它才知道這一場是哪一張圖。
import { prefersReducedMotion, setWeatherArena, weatherPolicy } from "./weather";
// ⭐ GH#610 —— 飄過去的那一片霧（局部層）。⚠️ 它吃的正是下面那個 `weather` 物件，
// ⛔ 不是第二份設定 —— `FogBankInput` 結構上等於 `WeatherGroundInput`。
import { buildFogBanks } from "./weatherFogBanks";
import { buildRain } from "../vfx/WeatherRainFx";

/**
 * ⭐ GH#362 —— `scenery.palette` 的地板／牆兩格 → 渲染層要的 0..1 rgb。
 * `undefined` 進、`undefined` 出：沒宣告 palette 的場地走的是 `ArenaGround` 裡
 * 那條原本的路（不染色 + `KERB_TINT`），逐像素不變。
 */
export function groundPaletteOf(scenery: ArenaScenery | undefined): GroundPalette | undefined {
  const p = scenery?.palette;
  return p === undefined ? undefined : { floor: hexToRgb01(p.floor), wall: hexToRgb01(p.wall) };
}

/**
 * ⭐ GH#345 —— 這張場地的**牆色**，一格資料，⛔ 不是七個 if。
 *
 * owner 2026-08-18：地板換了主題、牆還是水泥灰盒。牆＝場上那些 0.42u 的碰撞矮台
 * （圓柱樁 / graybox 方牆 / 線段矮牆），它們在此之前吃的是一個寫死的
 * `Color3(0.42, 0.4, 0.45)`，跟場地一點關係都沒有。
 *
 * 兩層，照第〇·六守則的階梯：
 *   1. 場地自己宣告的 `scenery.palette.wall`（GH#362 的編輯器欄位）—— **作者的設計**
 *   2. 沒宣告 → `groundStyleWallTint()`，地面材質配套的那一列 —— **引擎的推導**
 *
 * ⚠️ 回傳的是**要塗上去的顏色本身**，⛔ 不是乘數：矮台是無貼圖的純色塊，
 * 而同一格 hex 在 `ArenaGround` 那邊是乘在裙邊貼圖的 albedo 上 —— 一格資料、
 * 兩種用法，⛔ 不要為此再開第二格欄位。
 */
export function wallTintOf(
  scenery: ArenaScenery | undefined,
  groundStyle: string | undefined,
): Color3 {
  const hex = scenery?.palette?.wall ?? groundStyleWallTint(groundStyle);
  const { r, g, b } = hexToRgb01(hex);
  return new Color3(r, g, b);
}

/**
 * 碰撞邊（圓形障礙的地面環）永遠比牆**亮一階**。
 *
 * ⚠️ 這一條是 task #218 的遺產，⛔ 不是裝飾：矮台被壓到 0.42u 之後就不再有輪廓，
 * 「哪裡撞得到」只剩這一圈亮邊在講。所以它跟著牆色走**但保證更亮** ——
 * ⛔ 不開第二張表（第零守則⑨：那會變成一張要跟第一張同步的表）。
 */
function kerbEdgeOf(wall: Color3): Color3 {
  const k = 0.42;
  return new Color3(wall.r + (1 - wall.r) * k, wall.g + (1 - wall.g) * k, wall.b + (1 - wall.b) * k);
}

/** Decor rotation is authored in quarter-turns (0-3) — pure, unit-tested. */
export function rotQuarterToRadians(rotQuarter: number): number {
  return ((((rotQuarter % 4) + 4) % 4) * Math.PI) / 2;
}

// ---------------------------------------------------------------------------
// fixed-camera sightline math (occluder audit #29)
// ---------------------------------------------------------------------------
// The rig (CameraRig) has no yaw/orbit: it sits due SOUTH of its target at
//   (tx, dolly·sin(pitch), tz − dolly·cos(pitch)),   pitch = 68° (#161),
// looking north — so a prop occludes heroes standing NORTH (+Z) of it. A prop
// whose top is at height H fully hides a hero with head height h everywhere
// within
//   reach(H) = (H − h) · standoff / (eyeHeight − H)
// north of its silhouette, and UNBOUNDEDLY once H reaches the camera eye.
// The worst case inside the dolly clamp is the CLOSEST zoom — DOLLY_MIN = 10,
// (⚠️ GH#361: no longer also the default): eye ≈ 9.27u, standoff ≈ 3.75u. Capping
// visual tops at 2.4u keeps the full-hide band for a 1.7u hero under
//   (2.4 − 1.7) · 3.75 / (9.27 − 2.4) ≈ 0.38u
// — a body-contact band, never a vanished hero.
const SIGHTLINE_WORST_DOLLY = DOLLY_MIN;
export const SIGHTLINE_EYE_HEIGHT = SIGHTLINE_WORST_DOLLY * Math.sin(CAMERA_PITCH_RAD); // ≈ 9.27u
export const SIGHTLINE_STANDOFF = SIGHTLINE_WORST_DOLLY * Math.cos(CAMERA_PITCH_RAD); // ≈ 3.75u
/** shortest hero head height — reach() is worst for short heroes */
const HERO_HEAD_Y = 1.7;
/** visual height cap for anything standing where heroes fight (see above).
 *  This governs the DECOR squash in dressArena — it is a PERMISSION ceiling
 *  ("a 0.38u dead band is tolerable for an authored prop"), NOT the height the
 *  procedural obstacle markers are built at (see OBSTACLE_MARKER_TOP_Y). */
export const SIGHTLINE_HEIGHT_CAP = 2.4;
/**
 * Top of the procedural collision markers buildArena draws over every sim
 * obstacle — the SAME number, for the SAME reason, as ArenaGround's
 * `KERB_TOP_Y`: 0.42u is below the shortest hero's head, so
 * `fullHideReach(0.42) === 0` and a marker can never hide any part of a hero at
 * any zoom, while ~1/4 of a hero still reads clearly as a raised stone base
 * from the steep top-down camera.
 *
 * WHY NOT SIGHTLINE_HEIGHT_CAP (task #218). Obstacles used to be drawn as full
 * 2.4u grey drums, removed again only when the authored doc happened to carry
 * `pillar` decor to stand in for them. That made a CAMERA guarantee depend on
 * unrelated CONTENT: deleting arena.skeleton's pillar decor (59c634f) silently
 * switched the removal off and left 6 grey columns on skeleton, 20 on dota and
 * 55 on godie, plus a permanent set on the pre-match SKELETON_ARENA (which has
 * no doc at all, so the dress pass never runs). A 2.4u drum also eats the legs
 * of everyone within 2.4·3.75/(9.27−2.4) ≈ 1.31u north of it. Markers are now
 * built low UNCONDITIONALLY, so no content edit can ever re-arm that bug — and
 * the collision stays VISIBLE (no invisible walls): the sim geometry itself is
 * untouched, only its stand-in silhouette is.
 */
export const OBSTACLE_MARKER_TOP_Y = 0.42;
/** Floor ring drawn on the obstacle's exact collision radius, so the edge you
 *  bump into stays legible from a distance once the stump is this low. */
const OBSTACLE_RING_Y = 0.03;
const OBSTACLE_RING_THICKNESS = 0.18;
/** hero silhouette width the sightline has to get past (±0.5u of body) */
const HERO_WIDTH = 1.0;

/** How far NORTH of its silhouette a prop with top `topY` fully hides a
 *  1.7u hero, at the worst-case (closest) zoom. Pure — unit-tested. */
export function fullHideReach(topY: number): number {
  if (topY <= HERO_HEAD_Y) return 0;
  if (topY >= SIGHTLINE_EYE_HEIGHT) return Infinity;
  return ((topY - HERO_HEAD_Y) * SIGHTLINE_STANDOFF) / (SIGHTLINE_EYE_HEIGHT - topY);
}

/**
 * The narrowest X silhouette that could still FULLY hide a hero, for a prop
 * `depthZ` deep whose top is at `topY`.
 *
 * This replaces a flat `width < 1u ⇒ harmless` test, whose premise — a thing
 * narrower than a hero cannot cover one — is false twice over:
 *
 *  1. PERSPECTIVE. The rays that must all be blocked run from the eye to a 1u
 *     hero silhouette, so they CONVERGE going south: `d` units south of the
 *     hero that pencil of rays is only `1 − d/standoff` wide, pinching to a
 *     point at the eye. A prop standing on the sightline is magnified against
 *     what it hides, and needs correspondingly less width to cover it.
 *  2. DEPTH. A ray crosses the prop's whole Z extent and is blocked if it is
 *     inside the silhouette ANYWHERE in there — so the southernmost, most
 *     pinched face is the one that decides, and depth buys occlusion exactly
 *     like distance does. An edge-on banner 0.6u wide but 3.6u deep screens a
 *     long strip of ground down a 68° sightline, nothing like its plan width.
 *
 * `standoff` is only 3.75u, so anything whose reach plus depth covers that is
 * unconditionally an occluder: it needs no width at all. Pure — unit-tested.
 */
export function minFullHideWidth(depthZ: number, topY: number): number {
  // best case for the prop: the farthest-south hero it still reaches, screened
  // at its own south face — the most pinched point of the ray pencil.
  const span = Math.min(fullHideReach(topY), SIGHTLINE_STANDOFF) + depthZ;
  return Math.max(0, HERO_WIDTH * (1 - span / SIGHTLINE_STANDOFF));
}

/**
 * Could a prop with world AABB [minX..maxX]×[minZ..maxZ] and top `topY` fully
 * hide a hero anywhere heroes can stand? Its occlusion shadow is the footprint
 * extended `fullHideReach(topY)` units north; the prop offends when that
 * rectangle overlaps any zone's playable disc — unless it is too thin to cover
 * a hero at all (`minFullHideWidth`). Pure — unit-tested.
 */
export function occludesPlayArea(
  b: { minX: number; maxX: number; minZ: number; maxZ: number; topY: number },
  zones: readonly { center: { x: number; z: number }; boundaryRadius: number }[],
): boolean {
  if (b.topY <= SIGHTLINE_HEIGHT_CAP + 1e-6) return false;
  // too thin to cover a hero even at the point where the sightline pinches
  if (b.maxX - b.minX < minFullHideWidth(b.maxZ - b.minZ, b.topY)) return false;
  const reach = fullHideReach(b.topY);
  const shadowMaxZ = b.maxZ + (Number.isFinite(reach) ? reach : 1e6);
  for (const zone of zones) {
    // closest point of the shadow rectangle to the zone center vs its radius
    const nx = Math.min(Math.max(zone.center.x, b.minX), b.maxX);
    const nz = Math.min(Math.max(zone.center.z, b.minZ), shadowMaxZ);
    const dx = nx - zone.center.x;
    const dz = nz - zone.center.z;
    if (dx * dx + dz * dz <= zone.boundaryRadius * zone.boundaryRadius) return true;
  }
  return false;
}

/** Tall team-colored landmarks the audit marks "fade": keep full height for
 *  identity, auto-fade via DecorFader when they block a camera→hero sightline. */
const FADE_MODELS = ["tower_red", "tower_blue"];

export interface ArenaHandles {
  /** parent of EVERYTHING this arena created — dispose to tear the map down */
  root: TransformNode;
  /** every procedural collision marker — stump + floor ring for each CIRCLE
   *  obstacle, low slab for each SEGMENT obstacle. All of them are tracked
   *  (the segment slabs used to be built and then forgotten, so nothing could
   *  ever find them again); all of them are low-profile by construction. */
  obstacleMeshes: Mesh[];
  /** floor + boundary rim per zone (render/ArenaGround.ts) */
  grounds: ZoneGround[];
  /** torch flame particle systems (not TransformNodes → tracked separately) */
  flames: ParticleSystem[];
  /** auto-fade for the audit's "fade" props (GameApp drives it per frame) */
  fader: DecorFader;
  /**
   * ⭐ GH#559 —— **這一趟場地自己 new 出來的每一顆材質**。
   *
   * ⛔ 在此之前沒有這一格，而 `disposeArena` 靠的是
   * `mesh.dispose(false, /* disposeMaterialAndTextures *\/ true)` ——
   * 也就是說**只有被指派給某顆 mesh 的材質**才會被回收。
   *
   * ⚠️ 而 `obstacleMat` / `obstacleRimMat` 是在 zone 迴圈**外面**無條件 `new` 的，
   * 卻只在「這個 zone 真的有那一種障礙物」時才被指派：
   *   · `box` / `segment` 障礙 → 只用 `obstacleMat`
   *   · `circle` 障礙的地面環 → 只用 `obstacleRimMat`
   * ⇒ 一張**沒有圓形障礙**的場地，每次換圖就留下 2 顆沒有主人的 PBR/Standard 材質。
   *
   * ⭐ 量到的（`roundArenaGrowth.test.ts`,8 個回合逐輪換圖）：
   *   `mesh 0 / node 0 / particleSystem 0`（全部乾淨）而
   *   `scene.materials` = 1 → 3 → 5 → 7 → **9**，**單調成長、⛔ 沒有上界**。
   *   而地圖**每回合換**（task #145）⇒ 這就是 owner 說的「越玩越 LAG」。
   *
   * owner 2026-08-22 的裁決寫在這一格的存在理由上：
   * 「你**寧願多次清理乾淨開始回合 也不要漏清到**」
   * ⇒ 判準從「誰指派給了 mesh」換成「**這一趟建的，這一趟收**」——
   * ⛔ 後者不會因為某個分支沒跑到而靜默漏掉。
   */
  materials: Material[];
}

/**
 * Build the collision-truthful arena. `groundStyle` comes from the authored doc
 * and is optional ON PURPOSE: the pre-match placeholder arena is built before
 * any doc is loaded, and passing nothing there means the floor uses its flat
 * fallback colour and fetches NO texture set — otherwise every boot would
 * download a stone set that the real map is about to throw away.
 */
export function buildArena(
  scene: Scene,
  arena: ArenaDef,
  groundStyle?: string,
  /**
   * ⭐ GH#362 —— 這張場地的視覺身分。這裡只用得到 `palette`（地板／牆壁染色），
   * 因為它必須在**建材質的當下**就決定；燈走 `Lighting.applyScenery()`、
   * 散佈裝飾走 `dressArena()`。省略 = 出貨前的顏色。
   */
  scenery?: ArenaScenery,
): ArenaHandles {
  const palette = groundPaletteOf(scenery);
  // ⭐ GH#345 —— 場上矮台（牆）的顏色，一次算好給所有 zone 用。
  const wallTint = wallTintOf(scenery, groundStyle);
  // ⭐ GH#610 第二批 —— 這張圖是什麼天氣。**這裡是整個渲染側唯一拿得到 `arena.id`
  // 的地方**（`Lighting.applyScenery()` 只拿得到 scenery），所以由它推進 store，
  // 燈與霧那一側用 `subscribeWeather()` 接。見 `render/weather.ts` 的檔頭。
  const weather: WeatherGroundInput = {
    policy: weatherPolicy(),
    look: setWeatherArena(arena.id),
    reducedMotion: prefersReducedMotion(),
  };
  const root = new TransformNode(`arena-root-${arena.id}`, scene);
  const handles: ArenaHandles = {
    root,
    obstacleMeshes: [],
    grounds: [],
    flames: [],
    fader: new DecorFader(),
    // ⭐ GH#559 —— 見 `ArenaHandles.materials` 的註解：這一趟建的,這一趟收。
    materials: [],
  };

  arena.zones.forEach((zone, zi) => {
    handles.grounds.push(buildZoneGround(scene, root, zone, zi, groundStyle, palette, weather));

    // ⭐ GH#345 —— 牆色從場地讀，⛔ 不是寫死的水泥灰。見 `wallTintOf()`。
    const obstacleMat = new StandardMaterial(`zone-${zi}-obstacle-mat`, scene);
    handles.materials.push(obstacleMat);
    // ⚠️ `.clone()` —— 每個 zone 一顆材質，⛔ 不要讓 N 顆材質共用同一個 Color3
    //    實例（任何一處就地改色會靜默改到全部）。
    obstacleMat.diffuseColor = wallTint.clone();
    obstacleMat.specularColor = new Color3(0.05, 0.05, 0.05);
    // brighter rim so the collision EDGE reads against every shipped
    // groundStyle now that the marker is too low to throw a silhouette —
    // derived from the wall so it follows the theme without a second table.
    const obstacleRimMat = new StandardMaterial(`zone-${zi}-obstacle-rim-mat`, scene);
    handles.materials.push(obstacleRimMat);
    obstacleRimMat.diffuseColor = kerbEdgeOf(wallTint);
    obstacleRimMat.emissiveColor = new Color3(0.12, 0.11, 0.1);
    obstacleRimMat.specularColor = new Color3(0.08, 0.08, 0.08);

    // Every marker below tops out at OBSTACLE_MARKER_TOP_Y, UNCONDITIONALLY —
    // no doc/decor state can change that (task #218). Footprints are copied
    // straight off the sim obstacle, so what you see is still where you collide.
    zone.obstacles.forEach((ob, oi) => {
      if (ob.kind === "circle") {
        const stump = MeshBuilder.CreateCylinder(
          `zone-${zi}-ob-${oi}`,
          { diameter: ob.radius * 2, height: OBSTACLE_MARKER_TOP_Y, tessellation: 24 },
          scene,
        );
        stump.position.set(ob.center.x, OBSTACLE_MARKER_TOP_Y / 2, ob.center.z);
        stump.material = obstacleMat;
        stump.isPickable = false;
        stump.parent = root;
        stump.freezeWorldMatrix();
        handles.obstacleMeshes.push(stump);

        // ring ON the collision radius — tops out at 0.12u, well under the stump
        const ring = MeshBuilder.CreateTorus(
          `zone-${zi}-ob-${oi}-ring`,
          {
            diameter: ob.radius * 2,
            thickness: OBSTACLE_RING_THICKNESS,
            tessellation: 28,
          },
          scene,
        );
        ring.position.set(ob.center.x, OBSTACLE_RING_Y, ob.center.z);
        ring.material = obstacleRimMat;
        ring.isPickable = false;
        ring.parent = root;
        ring.freezeWorldMatrix();
        handles.obstacleMeshes.push(ring);
      } else if (ob.kind === "box") {
        // GH#324 —— graybox 的牆。⚠️ 高度**必須**是 OBSTACLE_MARKER_TOP_Y（0.42）：
        // 無條件畫出來的東西一旦高過 SIGHTLINE_HEIGHT_CAP，就重新武裝了 task #218
        // 拿掉的那個遮擋 bug。⭐ 這也是 owner「垂直感一律做成背景」在引擎裡的原因。
        const box = MeshBuilder.CreateBox(
          `zone-${zi}-ob-${oi}`,
          { width: ob.halfW * 2, height: OBSTACLE_MARKER_TOP_Y, depth: ob.halfD * 2 },
          scene,
        );
        box.position.set(ob.center.x, OBSTACLE_MARKER_TOP_Y / 2, ob.center.z);
        box.material = obstacleMat;
        box.isPickable = false;
        box.parent = root;
        // ⚠️ **一定要推進 obstacleMeshes。** 線段當年就是被建出來然後丟在地板上
        // （從沒推進這個陣列），於是視線守衛找不到它 —— 建了等於沒建。
        handles.obstacleMeshes.push(box);
      } else {
        const dx = ob.b.x - ob.a.x;
        const dz = ob.b.z - ob.a.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        // width/depth/rotation/centre are UNCHANGED — only the height drops, so
        // the slab still traces the sim segment exactly.
        const wall = MeshBuilder.CreateBox(
          `zone-${zi}-ob-${oi}`,
          { width: len, height: OBSTACLE_MARKER_TOP_Y, depth: 0.4 },
          scene,
        );
        wall.position.set((ob.a.x + ob.b.x) / 2, OBSTACLE_MARKER_TOP_Y / 2, (ob.a.z + ob.b.z) / 2);
        wall.rotation.y = Math.atan2(dz, dx);
        wall.material = obstacleMat;
        wall.isPickable = false;
        wall.parent = root;
        wall.freezeWorldMatrix();
        handles.obstacleMeshes.push(wall);
      }
    });

    // spawn pads
    const padMat = new StandardMaterial(`zone-${zi}-pad-mat`, scene);
    handles.materials.push(padMat);
    padMat.diffuseColor = new Color3(0.3, 0.34, 0.4);
    padMat.alpha = 0.65;
    zone.spawns.forEach((side, si) => {
      side.forEach((s, pi) => {
        const pad = MeshBuilder.CreateCylinder(
          `zone-${zi}-spawn-${si}-${pi}`,
          { diameter: 1.6, height: 0.04, tessellation: 20 },
          scene,
        );
        pad.position.set(s.x, 0.02, s.z);
        pad.material = padMat;
        pad.isPickable = false;
        pad.parent = root;
        pad.freezeWorldMatrix();
      });
    });
  });

  // ⭐ GH#610 —— **飄過去的那一片霧**。owner 2026-08-23：
  // 「**不是全場地都霧喔，而是像真實一樣會有一片飄過去，隨機產生不規則形狀霧**」。
  // ⚠️ 一定要在 zone 迴圈**之後**：霧片的互斥車道寬度是從**整張圖的佔地**反推的，
  //    ⛔ 不是逐 zone 各分一次（逐 zone 分的話兩個 zone 的霧會在中線重疊）。
  // ⚠️ 它與 `Lighting.write()` 的全域霧是**同一個機制的兩層** —— 同一格開關、
  //    同一個權重、同一條玩法界線。完整推導在 `render/weatherFogBanks.ts` 的檔頭。
  const fogBanks = buildFogBanks(scene, root, arena.id, arena.zones, weather);
  if (fogBanks) handles.materials.push(fogBanks.material);

  // 🌧️ GH#654 —— 天氣的**降水**那一層。owner 2026-08-24:「下雨跟起霧的天氣特效」。
  // ⭐ 它與上面那兩層（濕地面／積水、飄過去的那一片霧）是**同一個機制**：同一份政策、
  //    同一格總開關、同一張級別權重表 ⇒ ⛔ 不可能「天氣說晴朗、天上在下雨」。
  // ⚠️ GH#676：下不下 = 每場開賽的決定性擲骰（`rainChance` × matchSeed，室外才擲）。
  // ⚠️ 不用回傳值：它的生命週期綁在自己那顆看不見的 emitter mesh 上，而那顆是
  //    `root` 的子節點 ⇒ `disposeArena()` 收 root 的那一刻雨就停了。
  buildRain(scene, root, arena.id, arena.zones, weather);

  return handles;
}

/**
 * Tear down every mesh/material/particle a build+dress pass created (used to
 * rebuild the map when the match's mapId changes). Idempotent.
 */
export function disposeArena(_scene: Scene, handles: ArenaHandles): void {
  for (const ps of handles.flames) ps.dispose();
  handles.flames.length = 0;
  handles.fader.clear(); // fade materials dispose with their meshes below
  // ⭐ GH#536 —— 地面那四張圖是 `groundTextureCache` 跨回合共用的財產,⛔ 不是這一趟
  // 場地的。下面那行的第二個參數是 `disposeMaterialAndTextures` ⇒ 不先摘下來,
  // 每一次換圖都會把快取好的貼圖銷毀,而下一回合又從零抓一次(=「讀取不夠快」)。
  for (const g of handles.grounds) detachGroundTextures(g);
  // dispose all descendant meshes (with their materials/textures) then the root
  for (const m of handles.root.getChildMeshes(false)) m.dispose(false, true);
  handles.root.dispose();
  // ⭐ GH#559 —— 上面那行只收得到**被指派給某顆 mesh** 的材質。這一趟自己 new 出來
  // 的每一顆都要收,⛔ 不管它有沒有被用到（沒有圓形障礙的場地會留下兩顆孤兒,
  // 而地圖每回合換 ⇒ 單調成長）。
  // ⚠️ 順序刻意在 mesh 之後:已經被 mesh 收掉的那幾顆再 dispose 一次是 no-op
  // （babylon 的 `Material.dispose()` 會先 `scene.removeMaterial(this)`,找不到就回 -1）,
  // ⛔ 而反過來（先收材質）會讓 mesh 那一輪對著已釋放的 effect 再走一次。
  // owner 2026-08-22:「你**寧願多次清理乾淨開始回合 也不要漏清到**」——
  // 這一行就是那句話：⭐ 寧可重複 dispose,⛔ 不要靠「應該有人收過了」。
  for (const mat of handles.materials) mat.dispose();
  handles.materials.length = 0;
  handles.obstacleMeshes.length = 0;
  handles.grounds.length = 0;
}

// ---------------------------------------------------------------------------
// pass 2 — authored decor
// ---------------------------------------------------------------------------

const FLAME_TEXTURE = "/content/assets/textures/particles/flame_01.png";

let instCounter = 0;

/** Instance a loaded prop container at a world pose (returns the root).
 *  `uniqueMaterials` clones real meshes + materials (no instancing) so the
 *  prop can be faded per-instance — reserve it for the few FADE_MODELS. */
function placeInstance(
  scene: Scene,
  parent: TransformNode,
  container: AssetContainer,
  x: number,
  z: number,
  yawRad: number,
  scale: number,
  uniqueMaterials = false,
  /** ⭐ GH#386 ③ —— 架高（`decor[].y`）。0 = 站在地板上，也就是這格出現之前的唯一行為。 */
  y = 0,
): TransformNode {
  const inst = uniqueMaterials
    ? container.instantiateModelsToScene((n) => `decor-${instCounter++}-${n}`, true, {
        doNotInstantiate: true,
      })
    : container.instantiateModelsToScene((n) => `decor-${instCounter++}-${n}`, false);
  const root = new TransformNode(`decor-root-${instCounter}`, scene);
  root.parent = parent;
  for (const node of inst.rootNodes) node.parent = root;
  root.position.set(x, y, z);
  root.rotation.y = yawRad;
  root.scaling.setAll(scale);
  for (const mesh of root.getChildMeshes(false)) mesh.isPickable = false;
  return root;
}

/** Give hex water tiles a cheap, watery read: soft blue emissive + specular. */
function makeWaterish(root: TransformNode): void {
  for (const mesh of root.getChildMeshes(false)) {
    const mat = mesh.material as Material | null;
    if (mat instanceof StandardMaterial) {
      mat.emissiveColor = new Color3(0.05, 0.16, 0.28);
      mat.specularColor = new Color3(0.5, 0.6, 0.7);
      mat.specularPower = 64;
    } else if (mat && "emissiveColor" in mat) {
      // PBR (glTF) material — nudge emissive toward blue
      (mat as unknown as { emissiveColor: Color3 }).emissiveColor = new Color3(0.05, 0.16, 0.28);
    }
  }
}

/** Is a prop's whole contact blob inside some zone's floor disc? Props authored
 *  on or beyond the rim (banners, gate pieces) would otherwise cast a shadow
 *  onto the kerb and the empty apron behind it. Pure — unit-tested. */
export function standsOnFloor(
  x: number,
  z: number,
  footprint: number,
  zones: readonly { center: { x: number; z: number }; boundaryRadius: number }[],
): boolean {
  return zones.some((zone) => {
    const dx = x - zone.center.x;
    const dz = z - zone.center.z;
    const reach = zone.boundaryRadius - footprint * CONTACT_SPREAD;
    return reach > 0 && dx * dx + dz * dz <= reach * reach;
  });
}

/** Base flame particle size (world units) — `arenaFire.sizeScale` scales both. */
const FLAME_MIN_SIZE = 0.3;
const FLAME_MAX_SIZE = 0.6;

/** Small additive flame on a torch tip; returns the system so it's tracked. */
function attachFlame(
  scene: Scene,
  x: number,
  y: number,
  z: number,
  fire: ArenaFire,
): ParticleSystem {
  const ps = new ParticleSystem(`torch-flame-${instCounter++}`, 24, scene);
  ps.particleTexture = new Texture(FLAME_TEXTURE, scene);
  ps.emitter = new Vector3(x, y, z);
  ps.minEmitBox = new Vector3(-0.08, 0, -0.08);
  ps.maxEmitBox = new Vector3(0.08, 0.1, 0.08);
  ps.color1 = new Color4(1, 0.7, 0.25, 1);
  ps.color2 = new Color4(1, 0.45, 0.12, 0.9);
  ps.colorDead = new Color4(0.6, 0.1, 0.02, 0);
  ps.minSize = FLAME_MIN_SIZE * fire.sizeScale;
  ps.maxSize = FLAME_MAX_SIZE * fire.sizeScale;
  ps.minLifeTime = 0.35;
  ps.maxLifeTime = 0.7;
  ps.emitRate = fire.emitRate;
  ps.direction1 = new Vector3(-0.05, 0.8, -0.05);
  ps.direction2 = new Vector3(0.05, 1.2, 0.05);
  ps.minEmitPower = 0.3;
  ps.maxEmitPower = 0.7;
  ps.gravity = new Vector3(0, 0.6, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.start();
  return ps;
}

/**
 * Apply the authored arena doc: decor props, a contact shadow under each one,
 * torch flames, water shimmer. Any load failure leaves the procedural pass
 * untouched — and the procedural obstacle markers are never touched at all
 * (see the note at the end of this function, task #218).
 *
 * The floor itself is NO LONGER touched here. It used to be re-tinted from the
 * doc and, for stone/dirt/wood, buried under a square grid of instanced
 * `floor_tile_large.glb` clipped to the zone circle — the stair-stepped rim of
 * task #80. The floor is now real geometry built by buildArena from the same
 * `groundStyle`, so this pass only adds what stands ON it.
 */
export async function dressArena(
  scene: Scene,
  assets: AssetManager,
  arena: ArenaDef,
  doc: ArenaDoc,
  handles: ArenaHandles,
  /**
   * 場地環境火焰政策（`config/ambient-vfx@1` 的 `arenaFire`，GH#251）。
   * 省略 = `DEFAULT_ARENA_FIRE`，也就是**關的** —— 呼叫端忘了接線時的結果是
   * 「沒有火」而不是「有火」，因為 owner 明說要拿掉。
   */
  fire: ArenaFire = DEFAULT_ARENA_FIRE,
  /**
   * 圓盤外的 2D 景深背景政策（`config/ambient-vfx@1` 的 `backdrop`，GH#324）。
   * 省略 = `DEFAULT_ARENA_BACKDROP`（**開的**）—— 呼叫端忘了接線時的結果是
   * 「有背景」而不是「一片黑」，因為 owner 明說要填補場景外的空缺。
   */
  backdrop: ArenaBackdropPolicy = DEFAULT_ARENA_BACKDROP,
  /**
   * ⭐ GH#337 —— 「這一趟 dress 還算不算數？」（**in-flight 孤兒**的閘）。
   *
   * 下面那個 `await` 中間隔著整批 .glb 下載，而**地圖是每回合換的**（#145 +
   * GH#324 的七張新圖）。醒來的時候呼叫端很可能已經 `disposeArena()` 過、換上
   * 另一張圖了 —— 這時候繼續跑會把道具 parent 到**已經 dispose 的 root**、把
   * `attachFlame()` 的 ParticleSystem push 進**已經清空、而且再也不會被讀**的
   * `handles.flames`。Babylon 不會抱怨：它把孤兒留在 `scene.meshes` /
   * `scene.particleSystems` 裡，⛔ 永遠沒有人 dispose 得到它們。那正是 owner
   * 看到的「場地莫名其妙的特效」。
   *
   * 省略 = 用 `handles.root.isDisposed()`（呼叫端忘了接的結果是**仍然有閘**，
   * 不是沒有閘）。⛔ 判準不可以是 mapId 字串:隨機輪替本來就會連續抽到同一張，
   * 那時字串相等但 root 是新的一顆。
   */
  isStale: () => boolean = () => handles.root.isDisposed(),
  /**
   * ⭐ GH#362 —— 場景特色政策（`config/ambient-vfx@1` 的 `scenery`）。
   * 省略 = `DEFAULT_ARENA_SCENERY_POLICY`（**開的**）—— 呼叫端忘了接線時的結果是
   * 「有特色裝飾」而不是「沒有」，因為 owner 明說要更多場景裝飾。
   */
  sceneryPolicy: ArenaSceneryPolicy = DEFAULT_ARENA_SCENERY_POLICY,
): Promise<void> {
  // ---- 圓盤外的 2D 景深背景（GH#324 第三層）----
  // ⚠️ 先建，⛔ 不要在 await 之後 —— 道具 GLB 可能要好幾秒，而「圓盤外一片黑」
  //    正是這個功能要修掉的東西，它不該等模型下載完才消失。
  if (doc.backdrop) {
    buildBackdrop(scene, handles.root, arena.zones, doc.backdrop, arena.id, backdrop);
  }

  // ---- decor props ----
  // ⭐ GH#362 —— 散佈規則在這裡**展開成逐件的 decor**，然後就走原本那條路。
  // ⚠️ 這是刻意的：展開結果逐字是 `DecorDef`，所以視線壓扁、接觸陰影、火焰掛載、
  //    LOD、淡出全部原封不動吃到它 —— ⛔ 這條規則是 decor 的產生器，不是第二條
  //    渲染路徑。第二條路徑會在半年後長出自己那一套（漏掉的）遮擋規則。
  const decor = sceneryPolicy.enabled
    ? [
        ...doc.decor,
        ...expandSceneryProps(doc.scenery, arena.zones, sceneryPolicy.maxPropsPerZone),
      ]
    : doc.decor;
  const uniquePaths = [...new Set(decor.map((d) => d.model))];
  const containers = new Map<string, AssetContainer | null>();
  await Promise.all(
    uniquePaths.map(async (p) => {
      containers.set(p, await assets.load(p));
    }),
  );

  // ⭐ GH#337 —— `await` 之後的**第一件事**。從這一行往下的每一個副作用都寫進
  // `handles`，而 `handles` 可能已經被 `disposeArena()` 拆掉了。
  if (isStale()) return;

  const contacts: ContactShadow[] = [];
  for (const d of decor) {
    // 每一件道具之前再問一次。今天這個迴圈從上面那個 await 之後是**同步**的，
    // 所以它只有在有人日後把 await 搬進迴圈（分批載入）時才會真的擋下東西 ——
    // 留著的理由是那一天不會有人回頭重新推導這個不變量，而代價是一次布林呼叫。
    if (isStale()) return;
    const container = containers.get(d.model);
    if (!container) continue;
    const isFade = FADE_MODELS.some((m) => d.model.includes(m));
    const root = placeInstance(
      scene,
      handles.root,
      container,
      d.x,
      d.z,
      rotQuarterToRadians(d.rotQuarter),
      d.scale,
      isFade,
      d.y ?? 0,
    );
    // ⭐ GH#386 ② —— 下載來的 CC0 布景自帶的黑色描邊殼。後台一格開關，
    // 出貨值是**留著**（＝今天畫面上的樣子）。⛔ 判準是材質名不是檔名：
    // 只有描邊那幾個 primitive 消失，本體必須留著。
    if (!sceneryPolicy.outlineShells) {
      for (const mesh of root.getChildMeshes(false)) {
        if (isOutlineShellMaterial(mesh.material?.name)) mesh.setEnabled(false);
      }
    }
    // measure the PLACED hierarchy (world space, rot + scale applied)
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);
    let topY = max.y; // world top AFTER any sightline squash below
    if (isFade) {
      // audit "fade": full-height team landmark — ghost it when it blocks a
      // camera→hero sightline instead of lowering it (GameApp drives update).
      handles.fader.register(root, min, max);
    } else if (
      occludesPlayArea({ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z, topY: max.y }, arena.zones)
    ) {
      // audit "lower": VISUAL-ONLY squash so the top sits at the sightline
      // cap — footprint (and the sim obstacle underneath) stays exactly as
      // authored, so what you collide with is unchanged. A capped pillar
      // reads as a broken-column stump rather than disappearing.
      //
      // ⚠️ GH#386 ③ —— **架高的道具也要一起縮**。`scaling.y` 是繞著節點原點縮的，
      // 而那個原點現在可能被 `d.y` 抬離了地板：只縮 scaling 會讓世界最高點停在
      // `y + s·(max.y − y)`，仍然高過上限，於是一個作者填了 `y` 的屋頂就靜默地
      // 撤銷了攝影機保證（#218 的教訓：⛔ 不可以讓內容重新武裝這個 bug）。
      // 連 `position.y` 一起乘 = 整件朝地板等比縮小 ⇒ 世界最高點恰好落在上限，
      // 而 `y = 0` 時逐位元組等於這一行改動之前。
      const squash = SIGHTLINE_HEIGHT_CAP / max.y;
      root.scaling.y *= squash;
      root.position.y *= squash;
      topY = SIGHTLINE_HEIGHT_CAP;
    }
    if (decorModelBurns(fire, d.model) && handles.flames.length < fire.maxEmitters) {
      // ride the POST-squash tip so the flame never floats off a capped torch
      handles.flames.push(attachFlame(scene, d.x, Math.max(topY * 0.92, 0.5), d.z, fire));
    } else if (d.model.includes("water")) {
      makeWaterish(root);
    }
    // Contact shadow, sized from the placed footprint. Only for props standing
    // ON the floor — a rim banner's blob would spill over the kerb and float in
    // the void, so anything not comfortably inside a zone is skipped.
    // ⚠️ GH#386 ③ —— 架高的道具 ⛔ 不畫接觸陰影：那塊 blob 畫在地板上，而這件
    // 東西根本沒有碰到地板（它架在柱頂上）。讀的是**壓扁之後**的 `position.y`，
    // 所以 `y = 0` 的道具（今天的每一件）一如既往拿得到陰影。
    const footprint = Math.max(max.x - min.x, max.z - min.z) / 2;
    if (root.position.y <= 0.05 && footprint > 0 && standsOnFloor(d.x, d.z, footprint, arena.zones)) {
      contacts.push({ x: d.x, z: d.z, radius: footprint });
    }
  }
  buildContactShadows(scene, handles.root, contacts);

  // NOTE (task #218): there is deliberately NO "dispose the obstacle meshes
  // when pillar decor exists" branch here any more. It made a CAMERA guarantee
  // depend on CONTENT — deleting a doc's pillar rows silently re-armed the tall
  // grey columns — and it could never cover the doc-less pre-match arena. The
  // markers buildArena draws are low-profile unconditionally instead, and on
  // the arenas that DO carry pillar props those props stand exactly on the same
  // circles, so the marker simply disappears under the prop's base.
}
