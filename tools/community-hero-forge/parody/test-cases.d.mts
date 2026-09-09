import type { Combo, PassiveScenario } from './sim-harness.mjs';
export const passiveScenarios: Record<string, PassiveScenario[]>;
export function redesignedCases(): Array<[string, { signature: string; combos: Combo[]; passiveScenarios: PassiveScenario[] }]>;
