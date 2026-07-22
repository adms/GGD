/**
 * championTint — resolve the w3x vertex tint (task #49) for a champion.
 *
 * PURE BY CONSTRUCTION: this file sits under render/, so it must never reach
 * into the HUD store — client-08 forbids render/** and vfx/** from importing
 * RoomStore, because per-frame code cannot read React state. The other half of
 * the lookup (entity → championId) is therefore the CALLER's job: GameApp owns
 * the seat table and feeds the answer in through
 * `ViewContentHooks.championTintFor`, exactly as it already does for
 * `modelDocFor` / `projectileVfxFor`.
 *
 * WHY A CHAMPION ID AND NOT THE MODEL KEY: `EntityViewState.key` is the MODEL
 * key, and `modelKey` is many-to-one — `champ.thorne` alone is shared by 10
 * champions, tinted and untinted ones together. The tint is a per-CHAMPION art
 * field, so it has to be resolved through the champion identity.
 *
 * `undefined` (champion not known yet) is distinct from `null` (resolved: this
 * champion is untinted) so the caller can retry until the seat table fills in
 * without re-walking the model every frame for the 93 untinted champions.
 */
import type { ChampionId } from "@ggd/shared/ids";
import { Champions } from "@ggd/shared/sim/content/registry";
import { resolveModelTint, type ModelTint } from "./modelTint";

/**
 * Tint for the champion `championId`.
 *   • `undefined` — not resolvable yet (seat not seated, or the champion is not
 *     registered because content is still loading); ask again next frame.
 *   • `null` — resolved, and this champion renders untinted.
 */
export function championTintForId(championId: string | null): ModelTint | null | undefined {
  if (!championId) return undefined;
  const def = Champions.tryGet(championId as ChampionId);
  if (!def) return undefined; // content still loading
  return resolveModelTint(def);
}
