/**
 * archetypes — the five parameter sets the generator bakes.
 *
 * FOUR ARCHETYPES + ONE UNDEAD, not 44 files. The 44 champions that resolve to
 * these meshes do so through FOUR frozen model-doc ids (`champ.sela`,
 * `champ.thorne`, `champ.skin.barbarian`, `champ.skin.rogue`), two of which are
 * pinned in `packages/shared/src/sim/**` and are off-limits. Giving each
 * champion its own modelKey would also silently change `championIdentity`'s
 * "shared name component AND same mesh" clause and re-split champion pairs that
 * the login marquee, the curation starter set and the codex currently merge.
 * So the per-champion look is applied at RUNTIME instead
 * (`apps/client/src/render/views/voxelLook.ts` seeds palette, proportions and
 * prop mask off the championId), and these five files are the archetype
 * DEFAULTS that render when no champion id is available.
 *
 * The undead set is the #217 follow-up's target: the zombie falls out of the
 * generator as PARAMETERS (palette + prop mask + pose bias + a slower clip
 * rate), not as new code.
 *
 * NO ASSET IS INVOLVED. Every number below was written for this project.
 */
import type { PropGroup } from "./boxman";
import type { DrivenJoint, Euler } from "./clips";

/** 8 palette slots as #rrggbb, in `SLOT` order: skin, cloth1, cloth2, accent, trim, boot, eye, prop. */
export type Palette = readonly [string, string, string, string, string, string, string, string];

export interface Archetype {
  /** output basename, i.e. `blocky-<key>.glb` */
  key: string;
  /** what it is, for the generator's report and the credits entry */
  note: string;
  palette: Palette;
  /** prop groups baked VISIBLE; everything else ships collapsed to scale 0 */
  props: readonly Exclude<PropGroup, "core" | "face">[];
  /**
   * Constant euler offset added to EVERY keyframe of EVERY clip for this joint.
   * Baking the bias into the curves (rather than into the node's rest pose) is
   * required because every clip drives every rotation channel — a rest-pose
   * tilt would be overwritten on the first frame.
   */
  poseBias?: Partial<Record<DrivenJoint, Euler>>;
  /** multiplies every clip duration. >1 = slower, the undead shamble. */
  clipRate?: number;
  /**
   * Joints baked at a non-unit scale. The undead's missing right hand is a
   * scale-0 forearm; nothing else uses it. Runtime per-champion scales
   * multiply on top of nothing — they REPLACE this, so an undead look applied
   * to a living archetype still works.
   */
  jointScale?: Readonly<Record<string, readonly [number, number, number]>>;
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    key: "mage",
    note: "robed caster — brimmed hat, back-slung cloak, staff",
    palette: ["#e0b48c", "#4b2f7a", "#6a46a3", "#8b5cd6", "#d8b24a", "#3a2a4a", "#1a1522", "#8a6136"],
    props: ["hat", "pack", "belt", "weapon"],
  },
  {
    key: "knight",
    note: "armoured melee — helm, cape, pauldrons, sword",
    palette: ["#e6c19a", "#3f5a86", "#9aa6b8", "#a63232", "#c8ccd4", "#2c3340", "#151a22", "#6b5236"],
    props: ["hat", "pack", "belt", "pauldron", "weapon"],
  },
  {
    key: "barbarian",
    note: "bare-headed bruiser — fur wrap, shoulder guards, axe",
    palette: ["#d9a066", "#7a4a2a", "#a8703c", "#b5502a", "#a8763c", "#3a281a", "#181008", "#7d5a33"],
    props: ["belt", "pauldron", "weapon"],
  },
  {
    key: "rogue",
    note: "hooded skirmisher — hood, pack, dagger",
    palette: ["#e8cbaa", "#2f4034", "#3c3f45", "#3f6b48", "#b4923f", "#1c1f24", "#101318", "#9aa2ad"],
    props: ["hat", "pack", "belt", "weapon"],
  },
  {
    // #217 target. Desaturated green-grey flesh, muted browns, a dim glow in
    // the eye slot, no props at all (the bare-ribcage read), a forward lean and
    // a shamble rate. Its right forearm is scaled away entirely.
    key: "undead",
    note: "undead shambler — asymmetric, no props, 0.62x clip rate (#217)",
    palette: ["#7e9276", "#4a4436", "#5c5240", "#6b6a58", "#7a6a4a", "#221f1a", "#c8e05a", "#b9b39a"],
    props: [],
    poseBias: {
      chest: [0.18, 0, 0],
      head: [0.1, 0, 0.22],
      handLeft: [0.38, 0, -0.12],
      handRight: [0.3, 0, 0.1],
      footLeft: [0.05, 0, 0],
    },
    clipRate: 1 / 0.62,
    jointScale: { handRight: [0.85, 0.6, 0.85] },
  },
];

/**
 * The archetype each shipped model doc points at. The mapping was verified
 * against the champion roster, NOT guessed:
 *   champ.sela           → mage      (18 champions)
 *   champ.thorne         → knight    (11 champions + the #215 zombie mob)
 *   champ.skin.barbarian → barbarian ( 9 champions + a 750-Mcoin skin)
 *   champ.skin.rogue     → rogue     ( 6 champions + a 750-Mcoin skin)
 */
export const DOC_ARCHETYPE: Readonly<Record<string, string>> = {
  "champ.sela": "mage",
  "champ.thorne": "knight",
  "champ.skin.barbarian": "barbarian",
  "champ.skin.rogue": "rogue",
  "champ.blocky.undead": "undead",
};
