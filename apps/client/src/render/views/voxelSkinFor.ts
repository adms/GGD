/**
 * voxelSkinFor — resolve a champion's generated voxel skin (task #231).
 *
 * PURE BY CONSTRUCTION, and for exactly the reason `championTint` states: this
 * file sits under render/, so it must never reach into the HUD store —
 * client-08 forbids render/** from importing RoomStore. The other half of the
 * lookup (entity → championId) is the CALLER's job; GameApp owns the seat table
 * and feeds the answer in through `ViewContentHooks.voxelSkinFor`, exactly as
 * it already does for `championTintFor` / `modelOverrideFor`.
 *
 * WHY A CHAMPION ID AND NOT THE MODEL KEY: the whole point of this task is that
 * `modelKey` is many-to-one (18 champions on `champ.sela`). Resolving the skin
 * through the modelKey would hand all 18 the same face again.
 *
 * `undefined` (champion not known yet) is distinct from `null` (resolved: this
 * champion has no generated skin) so the caller can retry until the seat table
 * fills in, mirroring the tint protocol byte for byte.
 *
 * RECIPES ARE GENERATED, NOT FETCHED. The generator is pure over fields the
 * `ChampionDef` already carries, so there is no per-champion asset to load and
 * no ordering hazard: the moment the registry knows the champion, the look is
 * knowable. The only network-borne input is the L1 override sidecar, which is
 * threaded in by the caller (ContentDb) and is absent for almost every hero.
 */
import type { ChampionId } from "@ggd/shared/ids";
import { Champions } from "@ggd/shared/sim/content/registry";
import {
  generateVoxelSkin,
  voxelSkinInputOf,
  type VoxelSkinOverride,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";

/**
 * The generated skin for `championId`.
 *   • `undefined` — not resolvable yet (seat not seated, or content still
 *     loading); ask again next frame.
 *   • `null` — resolved, and this champion renders with no generated skin.
 */
export function voxelSkinForId(
  championId: string | null,
  override?: VoxelSkinOverride | null,
): VoxelSkinRecipe | null | undefined {
  if (!championId) return undefined;
  const def = Champions.tryGet(championId as ChampionId);
  if (!def) return undefined; // content still loading
  return generateVoxelSkin(voxelSkinInputOf(def), { override: override ?? null });
}
