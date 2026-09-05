/**
 * Current low-level Main gaps that have already been isolated by visual proof.
 *
 * This module deliberately contains no React, fixture JSON or prose inference,
 * so both the browser capture and the Node proof merger/importer can apply the
 * same receipt.  A focused re-capture may update only one of 46 rows; these
 * deterministic annotations must still remain current for every untouched row.
 */
const SOLID_BEAM_GAP =
  "Main 缺少可重用、透明安全的連續實心寬光束視覺積木；現有 primitive 只能形成數條細 trace，無法用矩陣參數組成橫向氣功砲或直立終結光柱，禁止以逐招硬調或粒子珠串掩蓋。";

const GAPS_BY_ABILITY: Readonly<Record<string, readonly string[]>> = {
  "godie-hart.r": [SOLID_BEAM_GAP],
  "godie-nbbc.e": [SOLID_BEAM_GAP],
  "godie-ogrh.r": [SOLID_BEAM_GAP],
  "godie-o00x.r": [SOLID_BEAM_GAP],
  "godie-e002.ex": [SOLID_BEAM_GAP],
  "godie-e00l.ex": [SOLID_BEAM_GAP],
  "godie-hvsh.r": [SOLID_BEAM_GAP],
};

export function acceptanceFixtureVisualGaps(abilityId: string): readonly string[] {
  return GAPS_BY_ABILITY[abilityId] ?? [];
}

export function mergeAcceptanceFixtureVisualGaps(
  abilityId: string,
  blockers: readonly string[],
): string[] {
  return [...new Set([...blockers, ...acceptanceFixtureVisualGaps(abilityId)])];
}
