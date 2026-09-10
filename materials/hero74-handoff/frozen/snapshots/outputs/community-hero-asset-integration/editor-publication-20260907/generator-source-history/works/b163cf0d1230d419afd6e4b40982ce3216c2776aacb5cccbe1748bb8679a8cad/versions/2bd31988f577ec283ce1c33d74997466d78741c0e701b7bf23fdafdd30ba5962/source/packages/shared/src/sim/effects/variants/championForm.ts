/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { RankScalar } from "../../perRank";

/**
 * championForm (task #249 變身) — the map's own WC3 **Metamorphosis** pair,
 * `Eme1` (normal unit) ⇄ `Emeu` (alternate unit), as a sim primitive.
 *
 * WHY IT IS A BODY SWAP AND NOT A BUFF. All 26 transforms in
 * `src_gogodieEX227s.w3x` are a COMPLETE second unit definition in
 * `war3map.w3u` — its own hp/armor/attack speed/range/model/ability list —
 * never a modifier stack on the first (see content/championForms.ts). An
 * `applyBuff` could not express 40萬解's melee→ranged change or 30變態紳士's
 * ground→flying body at all, so the primitive swaps WHICH CHAMPION DOC the
 * entity resolves through, in place, keeping the entity id, HP, level, items
 * and cooldowns (see systems/ChampionFormSystem.ts for the swap contract).
 *
 * `to` is a DIRECTION, not an id: the counterpart is read from the champion
 * doc's own `transform.counterpartId`, so one authored effect works for every
 * hero and the id can never be typo'd into a body that does not exist.
 *
 * `durationSec` is the w3a `ahdu` (HERO duration) of the transform ability.
 * ABSENT = the form does not time out — 20-01 風王結界 and 70-00 紮根 are
 * TOGGLES and 61-00 百連我殺 is a death-state morph. Three of 26; an absent
 * duration is a recovered fact, not missing data.
 */
export interface ChampionFormVariant {
  kind: "championForm";
  to: "alternate" | "base" | "toggle";
  /** ⭐ G2 —— 逐階可以是陣列（rank 4 的變身活得比 rank 1 久）。 */
  durationSec?: RankScalar;
}
