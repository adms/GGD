/**
 * arenaSelect — resolve a room's `mapId` to the sim's collision geometry.
 * Looks the id up in the content Arenas registry (populated at boot by
 * registerAll) and converts the doc into an ArenaDef. Falls back to the
 * built-in SKELETON_ARENA when the id is absent, unknown, or the content tree
 * never loaded — so a match ALWAYS gets a valid, playable map.
 */
import { Arenas, Configs } from "@ggd/shared/content";
import {
  DEFAULT_ARENA_POOL,
  resolveArenaPoolConfig,
  type ConfigArenaPoolDoc,
} from "@ggd/shared/content/schema/arenaPoolDoc";
import { SKELETON_ARENA, ROYALE_ARENA, arenaDefFromDoc, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";

export function resolveArena(mapId?: string): ArenaDef {
  if (!mapId || mapId === SKELETON_ARENA.id) return SKELETON_ARENA;
  const doc = Arenas.tryGet(mapId);
  if (!doc) return SKELETON_ARENA;
  return arenaDefFromDoc(doc);
}

/**
 * The per-round arena ROTATION pool (task #145): every shipped arena, in a fixed
 * authored order so the seed→arena mapping is stable across server restarts (a
 * registry-iteration order would depend on content-load order). The MatchController
 * rotates through this deterministically each combat round.
 *
 * Fixed here rather than derived from `Arenas.ids()` on purpose: determinism must
 * not hinge on which docs happened to load or in what order. The skeleton is the
 * built-in fallback; the four themed maps come from content and are simply skipped
 * if a given install has not loaded them (so a bare boot still rotates over
 * whatever it has).
 */
/**
 * ⚠️ **這個陣列以前是寫死的，而那是一個真的缺陷。**
 *
 * 2026-08-14 產出七張動漫競技場、驗證過、上線之後，**玩家一場都碰不到** ——
 * 因為沒有人記得回來改它。那是失敗形態②（算出來了但從沒送到玩家面前），
 * 而且寫死本身違反第一守則。
 *
 * ⇒ 現在它從 `config.arena-pool@1` 讀（後台可調）。這個常數只是**出貨預設**的
 * 別名，留著是因為既有的測試與註解引用它。⛔ 不要在這裡加地圖 —— 加在 config。
 */
export const ARENA_ROTATION_IDS: readonly string[] = DEFAULT_ARENA_POOL.rotation;

/**
 * The FINALE map (`arena.royale`) — deliberately NOT in {@link ARENA_ROTATION_IDS}.
 *
 * It is a single 42-radius zone laid out for twelve champions in four spawn
 * clusters; rolling it into an ordinary 3v3 round would put two teams in a field
 * built for four and leave two thirds of it empty. The MatchController selects it
 * by name for round `FINAL_ROUND` and only then.
 *
 * Falls back to the built-in {@link ROYALE_ARENA} when the content tree is not
 * loaded (unit tests, skeleton boot). The shipped doc and the constant are pinned
 * to each other by `royaleArena.test.ts`, so the fallback is the same arena a
 * player sees — never a second, untested geometry.
 */
export function resolveRoyaleArena(): ArenaDef {
  const cfg = resolveArenaPoolConfig(
    (Configs.tryGet("arena-pool") ?? null) as Partial<ConfigArenaPoolDoc> | null,
  );
  const doc = Arenas.tryGet(cfg.finale) ?? Arenas.tryGet(ROYALE_ARENA.id);
  return doc ? arenaDefFromDoc(doc) : ROYALE_ARENA;
}

/**
 * Resolve {@link ARENA_ROTATION_IDS} to the loaded {@link ArenaDef}s, in order,
 * de-duplicated by id. Ids absent from the content registry are dropped (the
 * skeleton is always present as the built-in). An install with no themed arenas
 * loaded yields just `[SKELETON_ARENA]`, which the controller treats as "no
 * rotation" — behaviour identical to the pre-#145 fixed map.
 */
export function resolveArenaPool(): ArenaDef[] {
  // ⭐ 池子從 config 讀（後台可調）。讀不到就是出貨預設 —— ⛔ 不是空池。
  const cfg = resolveArenaPoolConfig(
    (Configs.tryGet("arena-pool") ?? null) as Partial<ConfigArenaPoolDoc> | null,
  );
  const pool: ArenaDef[] = [];
  const seen = new Set<string>();
  for (const id of cfg.rotation) {
    let def: ArenaDef | null = null;
    if (id === SKELETON_ARENA.id) def = SKELETON_ARENA;
    else {
      const doc = Arenas.tryGet(id);
      if (doc) def = arenaDefFromDoc(doc);
    }
    if (def && !seen.has(def.id)) {
      pool.push(def);
      seen.add(def.id);
    }
  }
  return pool;
}
