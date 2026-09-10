/**
 * look — the PARAMETER OBJECT the 鑄形工坊 studio edits and the bake consumes.
 *
 * `boxman.ts` is the fixed vocabulary (which boxes exist, on which joints).
 * A `VoxelLook` is everything an author is allowed to VARY on top of it:
 * palette, which prop groups are worn, per-joint scale (this is what
 * "proportions" means on a rigidly-skinned box figure), per-joint offset, a
 * constant pose bias and the clip rate. Nothing else — and that closed set is
 * the point.
 *
 * WHY PROPORTIONS ARE JOINT SCALES AND NOT BOX SIZES. #226's design bakes ONE
 * mesh per archetype and reshapes it at runtime by writing joint scale/offset
 * (`voxelSkin.applyVoxelLook`), which is legal precisely because the skinning
 * is rigid at weight 1.0 and no animation channel targets scale. If the studio
 * instead edited raw box sizes it would be authoring a DIFFERENT mesh, which
 * could not be applied to a shipped .glb and would have forked the generator —
 * the one thing owner directive #229 forbids. So a slider here moves a joint
 * scale, the same number the client writes, and the studio preview is showing
 * the identical transform the game will apply.
 *
 * DETERMINISM IS THE CONTRACT. `lookForChampion()` must return the same look
 * for the same champion id in the admin, in the bake and in the client, or the
 * preview lies about what ships. It is therefore built on an integer FNV-1a
 * hash with no `Math.random`, no `Date`, no locale-sensitive call and no
 * floating-point accumulation over an unordered map. `look.test.ts` pins the
 * whole 44-champion roster as a golden vector.
 *
 * NO ASSET IS INVOLVED. Every colour below is a hex triple written for this
 * project; nothing is sampled, traced or derived from any Mojang/Microsoft
 * skin, model or texture.
 */
import { z } from "zod";
import { PROP_GROUPS, SLOT, type PropGroup, type SlotName } from "./boxman";
import { DRIVEN_ROTATION_JOINTS, type DrivenJoint, type Euler } from "./clips";
import { ARCHETYPES, DOC_ARCHETYPE, type Archetype, type Palette } from "./archetypes";

/** A prop group an author can toggle. (`core` and `face` are never optional.) */
export type PropKey = Exclude<PropGroup, "core" | "face">;

/** Palette slots in `SLOT` order — the index of a colour inside a `Palette`. */
export const SLOT_NAMES = Object.keys(SLOT) as readonly SlotName[];

/**
 * The joints an author may scale. Deliberately NOT every joint: `origin` would
 * scale the whole figure (that is `doc.scale`'s job and #150's), and the prop
 * carriers are driven by the prop mask instead, so exposing both would give two
 * controls for one outcome.
 */
export const SHAPED_JOINTS = [
  "hips",
  "chest",
  "head",
  "handLeft",
  "handRight",
  "footLeft",
  "footRight",
] as const;
export type ShapedJoint = (typeof SHAPED_JOINTS)[number];

export type Vec3 = readonly [number, number, number];

/**
 * The full authored look. All fields required — an optional field would mean
 * "the studio and the bake each pick their own default", which is how two
 * copies of a generator start to drift.
 */
export interface VoxelLook {
  /** which archetype's part/prop vocabulary this started from */
  readonly archetype: string;
  /** 8 `#rrggbb` colours in `SLOT` order (skin, cloth1, cloth2, accent, trim, boot, eye, prop) */
  readonly palette: Palette;
  /** prop groups worn; everything else collapses to joint scale 0 */
  readonly props: readonly PropKey[];
  /** per-joint scale — the PROPORTION controls */
  readonly jointScale: Readonly<Partial<Record<ShapedJoint, Vec3>>>;
  /** per-joint translation offset in VOXEL PX, added to the bind local */
  readonly jointOffset: Readonly<Partial<Record<ShapedJoint, Vec3>>>;
  /** constant euler added to every keyframe of every clip (the undead lean) */
  readonly poseBias: Readonly<Partial<Record<DrivenJoint, Euler>>>;
  /** multiplies every clip duration; >1 = slower (the undead shamble) */
  readonly clipRate: number;
  /** true ⇒ the model doc lists the palette material in `teamTintMaterials` */
  readonly teamTint: boolean;
  /** planar collision radius written into the model doc. AUTHORED, never derived. */
  readonly collisionRadius: number;
}

/** The single material every generated figure uses — one texture, one draw call. */
export const VOXEL_MATERIAL = "voxel-palette";

export const DEFAULT_COLLISION_RADIUS = 0.6;

const HEX = /^#[0-9a-f]{6}$/;

const zHex = z.string().regex(HEX, "顏色必須是 #rrggbb（小寫）");
const zVec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

/**
 * The schema the `model@1` doc embeds. `.strict()` throughout, so an unknown
 * key is a 422 rather than a silently-ignored control the operator thinks he
 * set. Scale bounds are generous but finite: 0 collapses a limb on purpose
 * (that is how #226 bakes the undead's missing forearm), 4 is far past any
 * readable silhouette.
 */
export const zVoxelLook: z.ZodType<VoxelLook, z.ZodTypeDef, unknown> = z
  .object({
    archetype: z.string().min(1),
    palette: z.tuple([zHex, zHex, zHex, zHex, zHex, zHex, zHex, zHex]),
    props: z.array(z.enum(["hat", "pack", "belt", "pauldron", "weapon"])),
    jointScale: z.record(z.enum(SHAPED_JOINTS), zVec3).optional().default({}),
    jointOffset: z.record(z.enum(SHAPED_JOINTS), zVec3).optional().default({}),
    poseBias: z.record(z.enum(DRIVEN_ROTATION_JOINTS), zVec3).optional().default({}),
    clipRate: z.number().positive().max(8),
    teamTint: z.boolean(),
    collisionRadius: z.number().positive().max(4),
  })
  .strict();

export const SCALE_MIN = 0;
export const SCALE_MAX = 4;

// ---------------------------------------------------------------------------
// archetype → look
// ---------------------------------------------------------------------------

export function archetypeByKey(key: string): Archetype | null {
  return ARCHETYPES.find((a) => a.key === key) ?? null;
}

/** Every archetype key, for the studio's preset picker. */
export const ARCHETYPE_KEYS: readonly string[] = ARCHETYPES.map((a) => a.key);

/**
 * The look an archetype ships with — i.e. exactly what `pnpm voxel:gen` bakes
 * for `blocky-<key>.glb` today. Opening the studio on a preset therefore shows
 * the CURRENT shipped character, which is the only starting point that lets an
 * operator tell "I changed this" from "it always looked like that".
 */
export function lookFromArchetype(key: string): VoxelLook {
  const a = archetypeByKey(key) ?? ARCHETYPES[0]!;
  const jointScale: Partial<Record<ShapedJoint, Vec3>> = {};
  for (const [joint, s] of Object.entries(a.jointScale ?? {})) {
    if ((SHAPED_JOINTS as readonly string[]).includes(joint)) {
      jointScale[joint as ShapedJoint] = [s[0], s[1], s[2]];
    }
  }
  return {
    archetype: a.key,
    palette: [...a.palette] as unknown as Palette,
    props: [...a.props],
    jointScale,
    jointOffset: {},
    poseBias: { ...(a.poseBias ?? {}) },
    clipRate: a.clipRate ?? 1,
    teamTint: false,
    collisionRadius: DEFAULT_COLLISION_RADIUS,
  };
}

/** The studio's opening state: the knight, the most neutral of the five. */
export const DEFAULT_LOOK: VoxelLook = lookFromArchetype("knight");

// ---------------------------------------------------------------------------
// deterministic per-champion looks
// ---------------------------------------------------------------------------

/**
 * FNV-1a, 32-bit, integer-only. Chosen over anything cryptographic because the
 * property required is REPRODUCIBILITY across three runtimes, not
 * unpredictability, and because `>>> 0` keeps every intermediate inside the
 * int32 range so no platform's float behaviour can enter the result.
 */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Successive independent draws from one seed string. */
function draw(seed: string, salt: string): number {
  return hash32(`${seed}\0${salt}`);
}

/** `[0,1)` from a hash draw. */
function unit(seed: string, salt: string): number {
  return draw(seed, salt) / 0x100000000;
}

/** Integer in `[0, n)`. */
function pick(seed: string, salt: string, n: number): number {
  return draw(seed, salt) % n;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Round to 3 decimals so a look survives a JSON round-trip byte-identically. */
function q3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function hex2(v: number): string {
  const c = clamp(Math.round(v), 0, 255);
  return c.toString(16).padStart(2, "0");
}

/** Nudge a `#rrggbb` by a per-channel signed fraction. Deterministic and pure. */
export function shiftHex(hex: string, seed: string, salt: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = (unit(seed, `${salt}r`) * 2 - 1) * amount * 255;
  const dg = (unit(seed, `${salt}g`) * 2 - 1) * amount * 255;
  const db = (unit(seed, `${salt}b`) * 2 - 1) * amount * 255;
  return `#${hex2(r + dr)}${hex2(g + dg)}${hex2(b + db)}`;
}

/**
 * How far a seeded champion look may wander from its archetype. Small on
 * purpose: the four archetypes are silhouettes the player learns to read at a
 * glance across an arena, and a generator free to make one champion twice as
 * wide as another would destroy that legibility while looking like variety.
 */
export const SEED_PALETTE_SHIFT = 0.1;
export const SEED_SCALE_SPREAD = 0.12;

/**
 * The look a champion id resolves to — THE function that must not diverge
 * between the admin preview, the offline bake and the client. It is seeded
 * ONLY by `championId`, so it is reproducible from the id alone with no
 * registry lookup, no content load and no ordering dependency.
 *
 * `archetypeKey` is passed in rather than looked up because the champion →
 * archetype mapping lives with the MODEL DOC (`DOC_ARCHETYPE`), not with the
 * champion, and this module must not reach into the content store.
 */
export function lookForChampion(championId: string, archetypeKey: string): VoxelLook {
  const base = lookFromArchetype(archetypeKey);
  const seed = championId;

  const palette = base.palette.map((hex, i) =>
    // the eye slot keeps its archetype value: it is the one slot whose job is
    // legibility (a dim glow vs a dark band), not identity
    i === SLOT.eye ? hex : shiftHex(hex, seed, `pal${i}`, SEED_PALETTE_SHIFT),
  ) as unknown as Palette;

  const jointScale: Partial<Record<ShapedJoint, Vec3>> = { ...base.jointScale };
  for (const joint of SHAPED_JOINTS) {
    if (jointScale[joint]) continue; // an archetype's own scale wins (the undead forearm)
    const s = 1 + (unit(seed, `sc${joint}`) * 2 - 1) * SEED_SCALE_SPREAD;
    // uniform per joint: a non-uniform seeded scale reads as a modelling bug,
    // not as a character, and it is the studio's job to author those on purpose
    jointScale[joint] = [q3(s), q3(s), q3(s)];
  }

  // One prop is added or removed relative to the archetype, never a reroll of
  // the whole mask: the archetype's silhouette must survive the seed.
  const props = new Set<PropKey>(base.props);
  const candidate = PROP_GROUPS[pick(seed, "prop", PROP_GROUPS.length)] as PropKey;
  if (base.props.length > 0 && props.has(candidate) && props.size > 1) props.delete(candidate);
  else props.add(candidate);

  return {
    ...base,
    palette,
    jointScale,
    props: PROP_GROUPS.filter((p) => props.has(p as PropKey)) as PropKey[],
  };
}

/**
 * The archetype a shipped model doc maps to, from #226's frozen table; `null`
 * for a doc that is not one of the five generated meshes.
 */
export function archetypeForModelDoc(modelId: string): string | null {
  return DOC_ARCHETYPE[modelId] ?? null;
}

// ---------------------------------------------------------------------------
// editing helpers (pure — the studio's reducer is built out of these)
// ---------------------------------------------------------------------------

export function withPaletteSlot(look: VoxelLook, slot: SlotName, hex: string): VoxelLook {
  const palette = [...look.palette] as string[];
  palette[SLOT[slot]] = hex.toLowerCase();
  return { ...look, palette: palette as unknown as Palette };
}

export function withProp(look: VoxelLook, prop: PropKey, on: boolean): VoxelLook {
  const set = new Set(look.props);
  if (on) set.add(prop);
  else set.delete(prop);
  return { ...look, props: PROP_GROUPS.filter((p) => set.has(p as PropKey)) as PropKey[] };
}

export function withJointScale(look: VoxelLook, joint: ShapedJoint, scale: Vec3): VoxelLook {
  return {
    ...look,
    jointScale: {
      ...look.jointScale,
      [joint]: [
        q3(clamp(scale[0], SCALE_MIN, SCALE_MAX)),
        q3(clamp(scale[1], SCALE_MIN, SCALE_MAX)),
        q3(clamp(scale[2], SCALE_MIN, SCALE_MAX)),
      ] as Vec3,
    },
  };
}

export function withJointOffset(look: VoxelLook, joint: ShapedJoint, offset: Vec3): VoxelLook {
  return {
    ...look,
    jointOffset: {
      ...look.jointOffset,
      [joint]: [q3(offset[0]), q3(offset[1]), q3(offset[2])] as Vec3,
    },
  };
}

/** The scale actually applied to a joint (1 when the author never touched it). */
export function jointScaleOf(look: VoxelLook, joint: ShapedJoint): Vec3 {
  return look.jointScale[joint] ?? [1, 1, 1];
}

export function jointOffsetOf(look: VoxelLook, joint: ShapedJoint): Vec3 {
  return look.jointOffset[joint] ?? [0, 0, 0];
}
