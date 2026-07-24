/**
 * layout — the intermission market's STAGING, as plain numbers.
 *
 * Every position, yaw, scale and camera keyframe of the 中場 travelling-merchant
 * scene lives here, with no Babylon import, so the composition is unit-testable
 * (does the merchant stand behind his own counter? is the hero inside the free
 * half the shop card does not cover? does the awning clear his head?) and
 * `IntermissionScene.ts` stays a pure imperative shell over it.
 *
 * ── THE SHOP CARD MOVED TO THE LEFT, SO THE WHOLE SHOT IS MIRRORED ──────────
 * 「你的商店說明頁剛好檔到角色，請你把說明頁改到左半邊(目前是右半邊)」. The card
 * was right-docked and this scene was composed around that: the camera aimed
 * right of the pitch so the cast sat in the free LEFT 55%. Moving the card
 * alone would simply have covered the character from the other side — the free
 * space has to move with it.
 *
 * So every X below is authored EXACTLY AS IT WAS and then reflected through
 * `mirrorX` on the way out. Keeping the authored numbers intact keeps the
 * reasoning attached to them readable (why the cart sits at −1.9, why the aim
 * is 1.0 off the pitch), and makes the flip one reviewable decision instead of
 * fifteen silently-negated constants. Mirroring the CAMERA together with the
 * SET means the composition is preserved exactly, as its own reflection:
 * whatever framed well at screen-left now frames identically at screen-right.
 *
 * A reflection negates yaw as well as X — facing (fx, fz) becomes (−fx, fz),
 * and the project's convention is `rotation.y = atan2(fx, fz)`, so θ ↦ −θ.
 *
 * ── FRAME OF REFERENCE ──────────────────────────────────────────────────────
 * World units are the arena's: champions render normalised to 1.7 u
 * (`packages/shared/src/content/modelScale.fixture.json`), so 1 u ≈ 1 m. The
 * origin is the counter's front edge, +Z runs AWAY from the camera, and the
 * camera sits at negative Z looking back toward +Z. KayKit / Quaternius glTF
 * bakes forward = +Z (see render/views/glbFacing.ts, NATIVE_GLB_YAW_OFFSET = 0),
 * so a yaw of π turns a prop's face toward the camera.
 *
 * ── WHY THESE NUMBERS ───────────────────────────────────────────────────────
 * The three merchant scales are MEASURED, not eyeballed — Babylon 7.54
 * `LoadAssetContainerAsync` on a NullEngine with
 * `refreshBoundingInfo({applySkeleton:true})`, i.e. the client's own load path:
 *
 *   file                native height   scale    rendered   footprint (u)
 *   merchant_cart.glb      0.7961        3.20      2.548     1.48 × 2.97
 *   merchant_stall.glb     1.0421        2.00      2.084     1.03 × 2.31
 *   merchant.glb           1.8367        0.953     1.750     —
 *
 * The merchant at 1.750 u stands a hair above the 1.7 u heroes — the adult
 * behind the counter, not a giant. The awning at 2.084 u clears his head by
 * ~0.33 u so the camera never loses his face. The cart at 2.548 u is the
 * tallest silhouette and the scene's landmark. All three .glbs have their
 * origin on the ground plane (measured min-Y −0.0005 / −0.0029 / −0.0019), so
 * they drop onto y = 0 with no manual offset.
 *
 * TASK #29'S 2.4 u PROP CAP DOES NOT APPLY HERE. That sweep governs the
 * ARENA's standable points — 「中場是獨立於戰鬥場景外的一個新場景」, so nothing
 * in this file is ever loaded by ArenaScene, no hero ever stands among these
 * props, and the cart is free to exceed the cap. Nothing here needs the 35-ray
 * re-run.
 *
 * ── THE PAVING IS NOT TASK #80'S MISTAKE ────────────────────────────────────
 * Task #80 deleted a square grid of `floor_tile_large.glb` clipped to a circle
 * because the stair-stepped rim WAS the arena's visible boundary — the edge a
 * hero bumps into, drawn as jagged tiles. Here the same tiles are laid over a
 * continuous dark ground disc that extends far past them: the stepped edge is
 * simply WHERE THE PAVING STOPS AND THE DIRT BEGINS, which is what a real
 * market square looks like, and a grass ring plus the fog cover the transition.
 * There is no kerb, no boundary and nothing to collide with.
 */
import type { CameraDriftConfig, CameraPose } from "../menu/procedural/math";

/** Content-relative paths (AssetManager prefixes `/content/`). */
export const SHOP_MODELS = {
  stall: "assets/models/shop/merchant_stall.glb",
  cart: "assets/models/shop/merchant_cart.glb",
  merchant: "assets/models/shop/merchant.glb",
} as const;

/**
 * The 旅行商人's HEAD ICON (task #146/#148). The user asked for the merchant to
 * have a portrait 「頭圖」 "like a champion has one"; it is shown in his
 * intermission speech box (see ui/MerchantTipBox.tsx), which the owner wanted to
 * read UNMISTAKABLY as the merchant SPEAKING rather than a floating banner.
 *
 * This PNG NOW SHIPS. It was generated (task #148) with the repo's local
 * two-pass SD pipeline (tools/icon-gen/local, the 先特徵後風格 method): a jovial
 * hooded dusk-market traveling-merchant bust — warm smile, grey beard, a gold
 * coin and his wares — matching merchant.glb (the Quaternius "Hooded Adventurer"
 * rig), 128×128 PNG at content/assets/icons/shop/traveling-merchant.png. So
 * MerchantHeadIcon's raster branch lights up and the box shows a real merchant
 * FACE at 46px; the drawn vector bust stays as the never-404 fallback if the
 * file is ever missing on a fresh clone.
 */
export const MERCHANT_PORTRAIT = "assets/icons/shop/traveling-merchant.png";

/**
 * Meshes of `merchant.glb` to hide so the 店員 reads as a MERCHANT rather than
 * a rogue. The Quaternius "Hooded Adventurer" carries a sword on the same rig;
 * it is separate geometry, so `setEnabled(false)` on these is all it takes.
 */
export const MERCHANT_HIDDEN_MESH_PREFIX = "Sword";

/**
 * Clip names on Quaternius' shared `CharacterArmature` rig (all 24 are baked
 * into merchant.glb; these are the four the scene drives).
 */
export const MERCHANT_CLIPS = {
  idle: "CharacterArmature|Idle",
  wave: "CharacterArmature|Wave",
  interact: "CharacterArmature|Interact",
  walk: "CharacterArmature|Walk",
} as const;

const DEG = Math.PI / 180;

/** One placed prop: ground position, yaw in RADIANS, uniform scale. */
export interface Placement {
  readonly model: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

/**
 * Which half of the screen the shop card owns. The scene composes into the
 * OTHER half, and every framing test reads this rather than a literal side.
 */
export const SHOP_CARD_SIDE = "left" as const;

/**
 * Reflect a placement through the YZ plane. See the mirror note at the top:
 * this is what moves the free space from screen-left to screen-right when the
 * card is left-docked. X flips; yaw flips with it; Z, scale and model do not.
 */
export function mirrorX<T extends { x: number; yaw: number }>(p: T): T {
  return { ...p, x: -p.x, yaw: -p.yaw };
}

/** The same reflection for a bare point, which carries no facing. */
export function mirrorPoint<T extends { x: number }>(p: T): T {
  return { ...p, x: -p.x };
}

/**
 * Yaw that makes a native-glTF prop at `from` face `to`, in the project's
 * convention `rotation.y = atan2(fx, fz)`. Derived rather than hard-coded so
 * "the hero is looking at the merchant" is true by construction — move either
 * one and the gaze follows. Because it is derived, it needs no mirroring of its
 * own: mirror both endpoints and the gaze follows them.
 */
export function yawToward(
  from: { x: number; z: number },
  to: { x: number; z: number },
): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

// ---------------------------------------------------------------------------
// the pitch: stall + cart + merchant
// ---------------------------------------------------------------------------

/**
 * The counter the champion walks up to. Yaw π = counter faces the camera.
 *
 * ── OFF-CENTRE BY 0.5 u SO THE 店員 IS VISIBLE (task #103) ───────────────────
 * `merchant_stall.glb` is an awning booth whose camera-facing edge is a
 * full-height cloth wall + corner post, not an open counter. Centred at x 0 it
 * stood squarely on the eye→merchant line: the fixed shot's rays to the 店員's
 * head, chest AND feet all struck that near wall (measured live by #38, pinned
 * by int-28's triangle cast). Depth and facing are exactly as they were — the
 * booth still faces the camera, still overlaps the cart — but the whole stall
 * slides 0.5 u off the aim so its body no longer sits between the lens and the
 * shopkeeper. Sliding rather than rotating keeps the long booth's footprint
 * narrow in frame, so its far end never swings under the LEFT-docked shop card
 * (which rotating it to present a bay would have done). Authored −0.5; the
 * mirror carries it to the free right half with everything else.
 */
export const STALL: Placement = mirrorX({ model: SHOP_MODELS.stall, x: -0.5, z: 1.2, yaw: Math.PI, scale: 2.0 });

/**
 * The hand-cart — WHEELS and pull shafts are what make this a 旅行商人 pitch
 * rather than a town shop. Three-quarter, its canopy overlapping the stall's
 * awning so the two read as one built-up stand. Authored with the shafts
 * running off-frame left; after the mirror they run off-frame RIGHT, which is
 * now the open edge of the composition.
 */
export const CART: Placement = mirrorX({ model: SHOP_MODELS.cart, x: -1.9, z: 2.6, yaw: -25 * DEG, scale: 3.2 });

/**
 * The 店員, behind his own counter, facing the camera.
 *
 * ── AT THE COUNTER, NOT DEEP IN THE BOOTH (task #103) ───────────────────────
 * Paired with the stall's 0.5 u slide above, he steps forward from z 1.85 to
 * 1.70 — up to the open counter rather than tucked at the back where the roof
 * valance clipped his head — and across to x 0 so the whole of him (head at
 * y 1.62, chest 1.20, feet 0.15) clears the booth on the fixed camera's centre
 * line. He is still BEHIND the counter (MERCHANT.z 1.70 > STALL.z 1.20) and
 * still under the awning; his shins tuck behind the counter's front valance,
 * which is what a shopkeeper at his post looks like and is hidden by the
 * counter from the lens. Moving him this little (0.21 u) leaves the 車 and the
 * camera untouched and actually WIDENS the eye→merchant ray's clearance past
 * the champion's centre line (0.28 u → 0.41 u), so the thin margin the CAST
 * note guards is spent on, not consumed. int-28 casts the ray that proves it.
 */
export const MERCHANT: Placement = mirrorX({
  model: SHOP_MODELS.merchant,
  x: 0,
  z: 1.7,
  yaw: Math.PI,
  scale: 0.953,
});

/**
 * Where the player's own champion stands: three-quarter from behind, looking at
 * the merchant. You see your hero's BACK — classic JRPG shop framing, and it is
 * what makes 「這是我的英雄，我在買東西」 legible without a caption. The yaw is
 * derived from the merchant's position (see yawToward).
 *
 * ── TASK #146: HERO TO THE RIGHT OF THE CENTRED MERCHANT ────────────────────
 * With the merchant re-aimed to screen centre (~53 %, see CAMERA_TARGET), the
 * hero moves from world x −1.15 — which projected to ~53 %, i.e. LEFT of the
 * merchant, the exact thing the user complained about — to world x +0.15, which
 * projects to ~67 %: clearly to the merchant's RIGHT while staying fully in
 * shot, feet included. Authored −0.15 so the mirror carries it to +0.15.
 *
 * He stays in the FOREGROUND (z −0.7, closer to the lens than every prop), so he
 * occludes nothing behind him; and sitting 0.89 u to the +x side of the
 * eye→merchant ray (which crosses x −0.74 at his depth) he never steps in front
 * of the shopkeeper. The next person nudging him must NOT push him back toward
 * −0.74, where he would begin to hide the clerk (see sightline.test.ts / CAST).
 */
export const CHAMPION_STAND = mirrorPoint({ x: -0.15, z: -0.7 } as const);
export const CHAMPION_YAW = yawToward(CHAMPION_STAND, MERCHANT);

// ---------------------------------------------------------------------------
// dressing — every model already shipped and CC0 (KayKit props/hex packs)
// ---------------------------------------------------------------------------

const PROP = (name: string): string => `assets/models/props/${name}.glb`;
const HEX = (name: string): string => `assets/models/hex/${name}.glb`;

/** Torches double as the scene's practical warm lights (see LIGHT_RIG). */
export const TORCHES: readonly Placement[] = [
  { model: PROP("torch"), x: -3.6, z: 0.2, yaw: 0, scale: 1.5 },
  { model: PROP("torch"), x: 3.6, z: 0.2, yaw: 0, scale: 1.5 },
].map(mirrorX); // symmetric pair, so the mirror is a no-op — applied for uniformity

/** Crates / barrels / an open chest: goods that arrived on the cart. */
export const DRESSING: readonly Placement[] = [
  { model: PROP("crates_stacked"), x: 2.4, z: 2.2, yaw: -35 * DEG, scale: 1.1 },
  { model: PROP("barrel_small"), x: -3.2, z: 1.4, yaw: 20 * DEG, scale: 1.2 },
  { model: PROP("barrel_small"), x: 2.9, z: 3.0, yaw: -60 * DEG, scale: 1.2 },
  { model: PROP("chest"), x: -2.6, z: 0.6, yaw: Math.PI, scale: 1.2 }, // open toward camera
].map(mirrorX);

/** Team banner on a pole — the one prop that changes with the local team. */
const BANNER_COLORS = ["blue", "red", "green", "yellow"] as const;

export function bannerFor(teamId: number): Placement {
  const color = BANNER_COLORS[((teamId % BANNER_COLORS.length) + BANNER_COLORS.length) % BANNER_COLORS.length]!;
  return mirrorX({ model: PROP(`banner_shield_${color}`), x: 3.4, z: 2.8, yaw: Math.PI, scale: 1.6 });
}

/**
 * Dark tree/rock silhouettes on a 9–13 u ring — the market implies a place it
 * is standing IN. Deterministic (an index hash, no RNG) so the composition is
 * identical every boot and trivially testable, exactly like `islandLayout` in
 * the login scene. The arc deliberately skips the camera's own side.
 */
export function silhouettes(count = 11): Placement[] {
  const models = [HEX("tree_single"), HEX("trees_medium"), HEX("rock"), HEX("trees_large")];
  const out: Placement[] = [];
  for (let i = 0; i < count; i++) {
    // 200°..520° sweep: behind and to both sides, never between camera and stall
    const angle = (200 + (i * 320) / Math.max(1, count)) * DEG;
    const radius = 9 + ((i * 7) % 5); // 9..13, stable per index
    out.push(
      mirrorX({
        model: models[i % models.length]!,
        x: Math.sin(angle) * radius,
        z: Math.cos(angle) * radius,
        yaw: (i * 47) * DEG,
        scale: 1.3 + ((i * 3) % 4) * 0.18,
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// ground
// ---------------------------------------------------------------------------

/** Paving reaches this far from the origin; the grass ring starts here. */
export const PLAZA_RADIUS = 8;
/** `floor_tile_large.glb` is 4 × 4 u on disk, so scale 0.5 tiles a 2 u grid. */
export const TILE_STEP = 2;
export const TILE_SCALE = TILE_STEP / 4;
/** The dark earth under everything — far enough out that fog ends the scene. */
export const GROUND_RADIUS = 26;

/** Grid positions of the paving tiles, clipped to the plaza disc. */
export function pavingTiles(radius = PLAZA_RADIUS, step = TILE_STEP): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const n = Math.ceil(radius / step);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = i * step;
      const z = j * step;
      // a tile counts as inside when its CENTRE is, so the paving's edge is a
      // ragged 2 u step — deliberately: it is where stone gives way to dirt.
      if (x * x + z * z <= radius * radius) out.push({ x, z });
    }
  }
  return out;
}

/**
 * `hex_grass.glb` positions for the ring just outside the paving. Pointy-top
 * hexes (measured: 2.0 u flat-to-flat on X, 2.3094 u point-to-point on Z, top
 * face at y = 0), so columns step 2.0 on X, rows step 1.732 on Z with odd rows
 * offset by half a column.
 */
export function grassRing(inner = PLAZA_RADIUS - 1, outer = PLAZA_RADIUS + 3.5): { x: number; z: number }[] {
  const COL = 2.0;
  const ROW = 1.7321;
  const out: { x: number; z: number }[] = [];
  const rows = Math.ceil(outer / ROW);
  const cols = Math.ceil(outer / COL);
  for (let r = -rows; r <= rows; r++) {
    for (let c = -cols; c <= cols; c++) {
      const x = c * COL + (r % 2 === 0 ? 0 : COL / 2);
      const z = r * ROW;
      const d = Math.hypot(x, z);
      if (d >= inner && d <= outer) out.push({ x, z });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

/**
 * The fixed shot. NO user orbit: this is a composed frame, not a viewer. The
 * cart canopy lands upper-RIGHT, the merchant's head on the upper-third line
 * and the champion's silhouette anchors the lower-RIGHT — which keeps
 * everything that matters inside the free RIGHT 55% of the screen, because the
 * shop card now docks LEFT (see the mirror note at the top of this file).
 *
 * Mirrored from the authored (2.2, 2.35, −5.4): the eye moves to the other side
 * of the aim so the whole set is seen as its own reflection.
 */
export const CAMERA_POSITION = mirrorPoint({ x: 2.2, y: 2.35, z: -5.4 } as const);
/**
 * ── TASK #146: THE MERCHANT IS CENTRED BY RE-AIMING ─────────────────────────
 * The user asked for the 旅行商人 in the CENTRE of the scene with the player's
 * hero on the RIGHT (「旅行商人…3D model 在中央,玩家 model 在右方」). That is
 * done here by moving the AIM alone: authored x goes 1.0 → 0.5 (world −1.0 →
 * −0.5), which pans the whole cast further right so the merchant's head lands at
 * ~53 % of screen width — screen centre, and comfortably clear of the LEFT
 * card's 45 % edge — instead of the ~60 % it sat at before.
 *
 * Crucially this changes the AIM, not the EYE. CAMERA_POSITION is untouched, and
 * `arcPoseFor` reconstructs the same eye from the pivot regardless of where the
 * aim points, so the #103 clerk-sightline — a ray from the FIXED eye to the
 * FIXED merchant world position — is byte-for-byte unchanged and still clear.
 * Moving the aim rather than the props also keeps every distance in the pitch
 * intact. Mirrored, so the aim falls left of the pitch and the cast pans RIGHT.
 */
export const CAMERA_TARGET = mirrorPoint({ x: 0.5, y: 1.45, z: 1.1 } as const);
/** ~38° vertical field of view, in radians (Babylon `camera.fov`). */
export const CAMERA_FOV = 38 * DEG;
/** Fraction of the screen width the shop card occupies (LEFT-docked). */
export const SHOP_CARD_WIDTH_FRACTION = 0.45;

/**
 * Convert a (position, target) shot into ArcRotateCamera coordinates, which is
 * what `writeCameraDrift` speaks. Babylon places an ArcRotateCamera at
 *   target + radius * (cos α sin β, cos β, sin α sin β)
 * so the inversion is radius = |d|, β = acos(d.y / radius), α = atan2(d.z, d.x).
 */
export function arcPoseFor(
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): CameraPose {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const radius = Math.hypot(dx, dy, dz);
  return {
    alpha: Math.atan2(dz, dx),
    beta: radius > 0 ? Math.acos(Math.max(-1, Math.min(1, dy / radius))) : Math.PI / 2,
    radius,
    targetY: target.y,
  };
}

/** The resting pose the drift breathes around. */
export const CAMERA_POSE = arcPoseFor(CAMERA_POSITION, CAMERA_TARGET);

/**
 * A very slow BREATHING drift (±0.02 rad over ~20 s) on the fixed shot —
 * enough that the frame is alive, far too little to read as a camera move.
 * `orbitSpeed` is 0 on purpose: unlike the login vista this shot must not
 * rotate, or the composition (and the free right 55%) would not hold.
 */
export const CAMERA_DRIFT: CameraDriftConfig = {
  baseAlpha: CAMERA_POSE.alpha,
  baseBeta: CAMERA_POSE.beta,
  baseRadius: CAMERA_POSE.radius,
  baseTargetY: CAMERA_POSE.targetY,
  orbitSpeed: 0,
  alphaAmp: 0.02,
  alphaSpeed: (2 * Math.PI) / 20, // one breath per ~20 s
  betaAmp: 0.012,
  betaSpeed: (2 * Math.PI) / 27, // co-prime-ish with alpha so it never repeats
  radiusAmp: 0.07,
  radiusSpeed: (2 * Math.PI) / 33,
  targetYAmp: 0.03,
  targetYSpeed: (2 * Math.PI) / 24,
};

/**
 * ENTER pose: the shot starts a little further back and higher, then eases in
 * to CAMERA_POSE over the transition — the merchant "arrives" in frame. Reuses
 * the login scene's `enterCameraPose` interpolation (procedural/transition.ts).
 */
export const CAMERA_ENTER_POSE: CameraPose = {
  alpha: CAMERA_POSE.alpha - 0.18,
  beta: CAMERA_POSE.beta - 0.06,
  radius: CAMERA_POSE.radius + 3.2,
  targetY: CAMERA_POSE.targetY + 0.25,
};

/** Enter-transition duration (ms). Shorter than the login swoop — it repeats. */
export const ENTER_DURATION_MS = 900;

// ---------------------------------------------------------------------------
// light rig + atmosphere — 夕暮れ, evening market: warm, safe, the anti-arena
// ---------------------------------------------------------------------------

/** RGB in 0..1, so the scene file never parses a hex string in a hot path. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const rgb = (hex: number): Rgb => ({
  r: ((hex >> 16) & 0xff) / 255,
  g: ((hex >> 8) & 0xff) / 255,
  b: (hex & 0xff) / 255,
});

export const LIGHT_RIG = {
  /** hemispheric key: indigo sky over warm ground */
  hemiSky: rgb(0x2a2e52),
  hemiGround: rgb(0x4a3a2c),
  hemiIntensity: 0.45,
  /** "last light" — low warm sun from behind-left; casts the merchant's shadow */
  sun: rgb(0xffb877),
  sunIntensity: 0.9,
  sunElevationDeg: 25,
  sunAzimuthDeg: -125,
  shadowMapSize: 1024,
  /** cool rim from behind-right, so the hero's silhouette leaves the dark */
  rim: rgb(0x6fa8ff),
  rimIntensity: 0.35,
  /** the cart's hanging lantern: warm practical light with a slow flicker */
  lantern: rgb(0xffae55),
  lanternIntensity: 1.6,
  lanternRange: 7,
  lanternFlickerHz: 1.5,
  lanternFlickerAmp: 0.12,
  /** torch practicals (one per TORCHES entry) */
  torchLight: rgb(0xff9a3c),
  torchIntensity: 0.7,
  torchRange: 5,
} as const;

export const ATMOSPHERE = {
  fogDensity: 0.035,
  fogColor: rgb(0x171a2e),
  clearColor: rgb(0x141733),
  bloomWeight: 0.35,
  bloomThreshold: 0.85,
  /** slow dust motes drifting through the light cone */
  moteCount: 40,
} as const;

/**
 * World position of the cart's hanging lantern — the practical that anchors the
 * warm pool. Sits just under the canopy of the placed cart.
 *
 * The offset is taken from the ALREADY-MIRRORED cart, so it is negated too
 * (authored +0.35, applied −0.35). Mirroring the cart but not its lantern would
 * have hung the light off the open side of the canopy.
 */
export const LANTERN_POS = { x: CART.x - 0.35, y: 2.1, z: CART.z - 0.2 } as const;
