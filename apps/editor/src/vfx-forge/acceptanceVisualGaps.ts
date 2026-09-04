/**
 * Current low-level Main gaps that have already been isolated by visual proof.
 *
 * This module deliberately contains no React, fixture JSON or prose inference,
 * so both the browser capture and the Node proof merger/importer can apply the
 * same receipt.  A focused re-capture may update only one of 46 rows; these
 * deterministic annotations must still remain current for every untouched row.
 */
const MODEL_FX_EMITTER_INSTANCE_GAP =
  "Main 缺少 modelFx 自帶 fxEmitters 繼承該次 instance 的 scale/scaleAxis/yaw/tint/alpha；目前固定黃色核心無法由 Editor 組成藍白／黃藍光束，禁止以逐招硬調或第二套假粒子掩蓋。";

const GAPS_BY_ABILITY: Readonly<Record<string, readonly string[]>> = {
  "godie-nbbc.e": [MODEL_FX_EMITTER_INSTANCE_GAP],
  "godie-ogrh.r": [MODEL_FX_EMITTER_INSTANCE_GAP],
  "godie-o00x.r": [MODEL_FX_EMITTER_INSTANCE_GAP],
  "godie-e002.ex": [MODEL_FX_EMITTER_INSTANCE_GAP],
  "godie-e00l.ex": [MODEL_FX_EMITTER_INSTANCE_GAP],
  "godie-hvsh.r": [MODEL_FX_EMITTER_INSTANCE_GAP],
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
