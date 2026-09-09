import type { CompiledHeroDraft } from '../../../packages/shared/src/content/heroForge/generator.js';
import type { Options } from './sim-harness.mjs';
export interface SlotProbe {
  slot: string; status: string; sourceAccepted: boolean; controlAccepted: boolean;
  differingTicks: number; firstDifferentTick: number | null;
}
export function probeSlots(number: string, draft: CompiledHeroDraft, options: Options): SlotProbe[];
