/**
 * WC3 ATTACHMENT POINTS → glb joint nodes.
 *
 * An imported WC3 effect is "a particle emitter + AN ATTACHMENT POINT" (#98).
 * The emitter half is `w3xEmitter.ts`; this file is the attachment half — how a
 * WC3 attach string like `right,hand` finds the right joint on a champion glb.
 *
 * THREE THINGS THAT LOOK LIKE DETAILS AND ARE NOT
 * -----------------------------------------------
 * 1. **`right,hand` is ONE attachment written as two comma tokens** (archaeology
 *    correction M6). Naive `split(",")` yields the attachments "right" and
 *    "hand", neither of which exists, so BOTH halves of the effect break. The
 *    same applies to `hand,left` / `weapon,left` / `chest,mount` / `sprite,first`.
 *    An ability that really has two attachments expresses it in two FIELDS
 *    (`Casterattach1` / `Casterattach2`) — see `parseAttachFields`.
 * 2. **A blank / `none.mdl` model is deliberately invisible.** That is a real
 *    WC3 idiom (an invisible carrier unit whose only job is to be a position).
 *    `isInvisibleModelPath` exists so nobody ever "fixes" one into a visible
 *    effect.
 * 3. **WC3 silently falls back to `origin` for an unknown attachment.** This is
 *    not defensive coding, it is the ORIGINAL behaviour: the map's own
 *    `A05B`/`A05C`/`A0EZ` carry `targetAttach = "cheat"` (a typo for `chest`)
 *    and WC3 renders them at the model origin. Reproducing the typo's outcome
 *    IS the faithful port ([[ggd-faithful-import-over-rescale]]).
 *
 * NODE-NAME MATCHING IS EVIDENCE-BASED, NOT GUESSED. The candidate ranking
 * below was derived from a census of all 337 `.glb` files in `content/assets/
 * models/**`, which contain, among others:
 *   `Origin Ref` ×158 · `Chest Ref` ×155 · `Hand Right Ref` ×148 ·
 *   `Bone_Chest` ×126 · `Weapon Ref` ×112 · `OverHead Ref` ×91 ·
 *   `Head - Ref` ×74 · `hand.r` ×13 · `bone right hand` ×6 · `handright` ×6
 * — i.e. at least six naming conventions, plus case variants (`OverHead` vs
 * `Overhead`) and trailing spaces (`'Hand Right Ref '` in billy.glb). So
 * matching is done on a NORMALISED TOKEN SET rather than a string alias list,
 * which is what makes all six conventions resolve with one rule.
 *
 * Pure — no Babylon import. `W3xEmitterRig` does the actual scene lookup.
 */

// ---------------------------------------------------------------------------
// Canonical attachment vocabulary
// ---------------------------------------------------------------------------

/** Base attachment nouns, LONGEST FIRST so `overhead` never splits into `over`+`head`. */
const BASE_WORDS = ["overhead", "weapon", "sprite", "origin", "chest", "mount", "head", "hand", "foot"] as const;

/** Qualifier words that pair with a base noun. */
const QUALIFIERS = ["left", "right", "first", "second", "third", "fourth", "fifth", "sixth", "rear", "mount", "medium", "large", "small"] as const;

/** Single-letter / abbreviated forms seen in the model census. */
const SYNONYMS: Readonly<Record<string, string>> = {
  l: "left",
  r: "right",
  lft: "left",
  rgt: "right",
  lt: "left",
  rt: "right",
};

/**
 * Tokens that carry no attachment meaning and are stripped before matching.
 * `ref` is the MDX attachment-node suffix (`Hand Right Ref`); `bone` is the
 * skeleton prefix (`Bone_Hand_R`); bare digits are index suffixes
 * (`Bone_Foot_L01`).
 */
const NOISE = new Set(["ref", "bone", "node", "joint", "b"]);

/** Split a glued token like `handright` into `hand` + `right` when it is one. */
function unglue(tok: string): string[] {
  for (const base of BASE_WORDS) {
    if (tok === base) return [tok];
    if (tok.startsWith(base)) {
      const rest = tok.slice(base.length);
      if (rest.length === 0) return [base];
      const q = SYNONYMS[rest] ?? rest;
      if ((QUALIFIERS as readonly string[]).includes(q)) return [base, q];
    }
    // the reverse order the map's authors also use: `rightHand`, `left,hand`
    for (const q of QUALIFIERS) {
      if (tok === q + base) return [base, q];
    }
  }
  return [tok];
}

/**
 * Normalise ANY name — a WC3 attach string, an MDX attachment node, a glb joint
 * — to a sorted, deduped token set. Two names refer to the same attachment iff
 * their token sets are equal.
 *
 * `"Hand Right Ref "` · `"Bone_Hand_R"` · `"hand.r"` · `"bone right hand"` ·
 * `"handright"` · `"right,hand"` all normalise to `["hand", "right"]`.
 */
export function normalizeAttachName(raw: string): string[] {
  const parts = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((s) => s.length > 0);
  const out: string[] = [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) continue; // index suffix (Bone_Foot_L01)
    const base = p.replace(/\d+$/, ""); // Foot_L01 → l
    const mapped = SYNONYMS[base] ?? base;
    if (NOISE.has(mapped)) continue;
    for (const t of unglue(mapped)) {
      if (NOISE.has(t)) continue;
      if (!out.includes(t)) out.push(t);
    }
  }
  return out.sort();
}

/** The canonical key for an attachment (its normalised tokens, space-joined). */
export function attachKey(raw: string): string {
  return normalizeAttachName(raw).join(" ");
}

/**
 * Parse ONE WC3 attach field (`Casterattach`, `Targetattach`, …) into its
 * canonical key. The whole field value is ONE attachment even when it contains
 * commas — that is correction M6, and it is the single most damaging place to
 * be naive.
 *
 * Returns `""` for a blank field (which means "no attachment specified", NOT
 * "origin" — the caller decides whether a missing field is an effect at all).
 */
export function parseAttachField(value: string | null | undefined): string {
  if (!value) return "";
  return attachKey(value);
}

/**
 * Parse the MULTI-COLUMN case: an ability with `Casterattach1 = "left,hand"`
 * and `Casterattach2 = "right,hand"` really does have two attachments (e.g.
 * `A09O Mirror`, which hangs `IllidanMissile.mdl` off both hands). Blank
 * columns are dropped; duplicates collapse.
 */
export function parseAttachFields(values: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const k = parseAttachField(v);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The WC3 fallback chain
// ---------------------------------------------------------------------------

/**
 * Where WC3 puts an effect when the requested attachment does not exist on the
 * model. Every chain terminates at `origin`, which every MDX model has.
 *
 * This is behaviour, not policy: `Weapon Left` on a model with only a plain
 * `Weapon Ref` renders at the weapon; a nonsense attachment like `cheat`
 * renders at the origin. Both are reproduced here.
 */
const FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  "hand left": ["weapon", "chest", "origin"],
  "hand right": ["weapon", "chest", "origin"],
  weapon: ["hand right", "chest", "origin"],
  "left weapon": ["weapon", "hand left", "chest", "origin"],
  "right weapon": ["weapon", "hand right", "chest", "origin"],
  head: ["overhead", "chest", "origin"],
  overhead: ["head", "chest", "origin"],
  chest: ["origin"],
  "foot left": ["origin"],
  "foot right": ["origin"],
  "chest mount": ["chest", "origin"],
  origin: [],
};

/** The ordered attachment keys to try for `attach`, most specific first. */
export function attachmentChain(attach: string): string[] {
  const key = attachKey(attach);
  if (!key) return ["origin"];
  const chain = FALLBACKS[key] ?? ["origin"];
  return [key, ...chain.filter((c) => c !== key)];
}

// ---------------------------------------------------------------------------
// Resolving against a real model's node names
// ---------------------------------------------------------------------------

export interface AttachResolution {
  /** the node name to parent to, or null when even `origin` is absent */
  node: string | null;
  /** the attachment key that actually matched (may be a fallback) */
  matched: string;
  /** true when the requested attachment itself was found */
  exact: boolean;
  /** human-readable, for the audition page and the fidelity report */
  reason: string;
}

/**
 * Resolve a WC3 attach string against a model's joint names.
 *
 * `nodeNames` may carry the glb-instantiation prefix Babylon adds
 * (`"<entityId>-Hand Right Ref"`); normalisation strips punctuation, so a
 * numeric prefix disappears on its own and the tokens still match.
 *
 * When nothing matches — not even `origin` — `node` is null and the caller
 * should parent to the model ROOT (which is what `AmbientVfx.findBoneNode`
 * already does). That is still WC3-correct: the origin attachment IS the model
 * root for a model that has no explicit `Origin Ref`.
 */
export function resolveAttachment(attach: string, nodeNames: readonly string[]): AttachResolution {
  // TWO PASSES, and the order matters. An MDX export lists the deforming BONES
  // first (`Bone_Hand_R`) and the authored ATTACHMENT POINTS after them
  // (`Hand Right Ref`) — verified on azunyan.glb / billy.glb. The attachment
  // point is where the artist meant the effect to sit (it carries the offset
  // and rotation for a held object); the bone is merely the nearest joint. So
  // `*Ref` nodes claim their key first, and bones only fill the gaps.
  const index = new Map<string, string>();
  const isRef = (n: string): boolean => /\bref\b/i.test(n);
  for (const n of nodeNames) {
    if (!isRef(n)) continue;
    const k = attachKey(n);
    if (k && !index.has(k)) index.set(k, n);
  }
  for (const n of nodeNames) {
    if (isRef(n)) continue;
    const k = attachKey(n);
    if (k && !index.has(k)) index.set(k, n);
  }
  const chain = attachmentChain(attach);
  for (let i = 0; i < chain.length; i++) {
    const key = chain[i]!;
    const hit = index.get(key);
    if (hit !== undefined) {
      return {
        node: hit,
        matched: key,
        exact: i === 0,
        reason:
          i === 0
            ? `attachment "${key}" found as node "${hit}"`
            : `attachment "${chain[0]}" is absent on this model; WC3 falls back to "${key}" (node "${hit}")`,
      };
    }
  }
  return {
    node: null,
    matched: "origin",
    exact: false,
    reason: `no node matched "${chain[0]}" or any fallback; parenting to the model root (the origin attachment IS the root when a model has no Origin Ref)`,
  };
}

// ---------------------------------------------------------------------------
// Model-path idioms
// ---------------------------------------------------------------------------

/**
 * True when a WC3 model field means "DELIBERATELY INVISIBLE".
 *
 * `none.mdl`, an empty string and the map's `" .mdl"` (a space) are all the
 * documented WC3 idiom for an effect slot that is intentionally blank — 35 of
 * the map's 231 `Aloc` carrier units use it. Never render one, and never
 * "repair" one into a visible effect: `godie-ubal.passive 37-00 鬼眼` currently
 * shows `void.pulse-lg` for exactly such a carrier, which is a fabricated
 * visual, not a port.
 */
export function isInvisibleModelPath(path: string | null | undefined): boolean {
  if (path == null) return true;
  const t = path.trim();
  if (t === "") return true;
  const low = t.toLowerCase();
  return low === "none.mdl" || low === "none.mdx" || low === ".mdl" || low === ".mdx" || low === "none";
}

/**
 * Split a multi-model WC3 art field into its model paths.
 *
 * `ftat` and friends may be a comma-joined LIST of models
 * (`"wuqi.MDX,Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile.mdl"`), which
 * stacks several effects on one slot. Only pieces that actually look like a
 * model path are returned, so an attach string that reached this function by
 * mistake yields nothing instead of two bogus "models" — the mirror image of
 * the M6 trap.
 */
export function splitModelList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /\.(mdl|mdx)$/i.test(s) && !isInvisibleModelPath(s));
}

/**
 * WC3 lightning-beam ids (`Lightning.slk`), which are NOT models. A repeated id
 * (`"AFOD,AFOD,AFOD"` on 41-01 吸血鬼之吻) means three STACKED PARALLEL BOLTS,
 * so the repetition is load-bearing and must not be deduped.
 */
export function parseLightningIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9]{4}$/.test(s));
}
