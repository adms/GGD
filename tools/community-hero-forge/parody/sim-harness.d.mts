import type { CompiledHeroDraft } from '../../../packages/shared/src/content/heroForge/generator.js';
import type { HeroSimulationBaseline } from '../../../packages/shared/src/content/heroForge/simulationBaseline.js';
export interface Step { kind: string; [key: string]: unknown }
export interface Options {
  baseline: HeroSimulationBaseline;
  relatedChampions?: readonly unknown[];
  setup?: Record<string, Record<string, unknown>>;
  steps?: Step[];
  [key: string]: unknown;
}
export interface Combo {
  source: string;
  target: string;
  metric: Record<string, unknown>;
  remove: unknown;
  expect?: string;
  [key: string]: unknown;
}
export interface ActorSnapshot {
  alive: boolean;
  hp: number;
  marks: Record<string, { count: number; [key: string]: unknown }>;
  [key: string]: unknown;
}
export interface SequenceResult {
  after: { caster: ActorSnapshot; ally: ActorSnapshot; foe: ActorSnapshot; far: ActorSnapshot };
  [key: string]: unknown;
}
export interface PassiveScenario { event: string; steps: Step[] }
export interface PassiveProbe { status: string; event: string; error?: string; [key: string]: unknown }
export function loadBaseline(): { docs: Map<string, Record<string, unknown>>; baseline: HeroSimulationBaseline };
export function evaluateCombo(draft: CompiledHeroDraft, combo: Combo, options: Options): {
  status: string; validationErrors: unknown[]; values: Record<string, number>; interaction: number; [key: string]: unknown;
};
export function runSequence(draft: CompiledHeroDraft, options: Options): SequenceResult;
export function probePassiveBehavior(draft: CompiledHeroDraft, options: Options, authored?: PassiveScenario[]): PassiveProbe[];
