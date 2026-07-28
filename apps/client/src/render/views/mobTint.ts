/**
 * mobTint — 殭屍染黑 (GH#192, owner: 「只會會是染黑色的模型避免跟玩家混在一起」).
 *
 * WHY THIS EXISTS AT ALL. Since GH#192 a mob wears the MODEL OF A CHAMPION —
 * pick 喪標麥可 in the console and the zombies are 喪標麥可. That is what the
 * owner asked for, and it creates the exact problem the owner named in the same
 * sentence: a player who picked that champion now has twelve identical bodies
 * walking at them. Darkening the mob is what keeps 「那是敵人不是隊友」 readable
 * without giving up the 「選什麼英雄就長什麼樣」 that motivated the change.
 *
 * IT IS THE #49 PIPELINE, NOT A NEW ONE. `ModelTint.tint` is a per-material
 * MULTIPLY on the albedo/diffuse (see views/modelTint.ts), so a strength `s`
 * becomes the uniform multiply `[1-s, 1-s, 1-s]`:
 *   • 0   → `[1,1,1]`, which `isNeutralTint` recognises as the identity and
 *           `applyModelTint` skips entirely — 「關掉」 really is zero work;
 *   • 1   → `[0,0,0]`, a solid black silhouette;
 *   • 0.65 (shipped) → `[0.35,0.35,0.35]`.
 * Grey and not a colour cast on purpose: a hue would fight the per-champion w3x
 * tints that #49/#254 ported (Berserker is already near-black, 依文潔琳 is icy),
 * and those tints COMPOSE with this one — `applyModelTint` writes
 * `base × tint`, and `base` is whatever the champion's own paint left.
 *
 * NOT `alpha`. A translucent zombie would also read as 「不是玩家」, and it was
 * considered and rejected: the death-dissolve (#220) already owns alpha, so a
 * permanently translucent mob would have no way left to look like it was dying.
 *
 * WHAT 0.65 ACTUALLY LOOKS LIKE — measured, not asserted. Because the .glb
 * pipeline builds PBR materials, `paint()` pre-raises the multiply by the
 * display gamma, so the albedo lands at `0.35^2.2 ≈ 0.0975` of stock: about a
 * tenth of the champion's brightness, i.e. clearly a dark silhouette with the
 * shape still legible under scene lighting, not a black cut-out. On a
 * StandardMaterial (the procedural voxel figure, before the mesh arrives) there
 * is no gamma step and it is a straight 0.35. See `mobTint.test.ts`, which reads
 * the numbers back off real Babylon materials rather than trusting this comment.
 */
import type { ModelTint } from "./modelTint";
import { isNeutralTint } from "./modelTint";

/**
 * The 染黑 multiply for `strength`, or `null` when it would change nothing.
 *
 * `null` (not a neutral tint object) so callers can hand the result straight to
 * `applyModelTint` and, more importantly, so `EntityViewRegistry.applyTint` can
 * cache 「resolved: untinted」 instead of retrying every frame — `undefined` is
 * reserved there for 「not resolvable yet」.
 *
 * Out-of-range / non-finite input clamps into [0,1] rather than throwing: this
 * number arrives off the wire from an admin-editable table.
 */
export function mobTintFor(strength: number): ModelTint | null {
  const s = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  const c = 1 - s;
  const tint: [number, number, number] = [c, c, c];
  return isNeutralTint(tint) ? null : { tint };
}

/** `EntityState.kind` for a roguelite mob (protocol ENTITY_KIND.MOB). */
const KIND_MOB = 6;

/**
 * THE BRANCH `ViewContentHooks.championTintFor` actually needs (GH#192): a MOB
 * gets 染黑, everything else gets whatever the champion resolver says.
 *
 * Extracted from GameApp so the DECISION is testable. It cannot live inside the
 * registry — the champion half needs the seat table, which client-08 walls
 * render/** off from — and it must not be inlined at the call site either,
 * because 「a mob has no seat, so `championTintForId` answers `undefined`, so the
 * registry retries forever and the zombie renders in the champion's own
 * colours」 is precisely the silent failure this branch exists to prevent.
 *
 * `championTint` is a THUNK: resolving a champion id costs a registry lookup per
 * frame per entity, and a mob must not pay it.
 */
export function entityTintFor(
  e: { kind: number },
  mobTintStrength: number,
  championTint: () => ModelTint | null | undefined,
): ModelTint | null | undefined {
  return e.kind === KIND_MOB ? mobTintFor(mobTintStrength) : championTint();
}
