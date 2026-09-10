import { z } from "zod";
import { zId } from "../schema/common";

const actor = z.object({
  x: z.number().finite().min(-20).max(20),
  z: z.number().finite().min(-20).max(20),
  hp: z.number().finite().min(1).max(100),
  mana: z.number().finite().min(0).max(100),
  statuses: z.array(zId).max(8),
}).strict();
/** Test setup is session state, never authored into or approved as hero content. */
export const zHeroScenarioSetup = z.object({
  level: z.number().int().min(1).max(18),
  rank: z.number().int().min(1).max(4),
  resourceSetup: z.enum(["ready", "empty"]).optional(),
  priorCast: z.object({
    slot: z.enum(["Q", "W", "E", "R"]),
    waitSec: z.number().finite().min(0.1).max(10),
  }).strict().optional(),
  caster: actor,
  target: actor,
}).strict();
export type HeroScenarioSetup = z.infer<typeof zHeroScenarioSetup>;
export const DEFAULT_HERO_SCENARIO_SETUP: HeroScenarioSetup = {
  level: 18, rank: 1, resourceSetup: "ready",
  caster: { x: -3, z: 0, hp: 50, mana: 100, statuses: [] },
  target: { x: 3, z: 0, hp: 50, mana: 50, statuses: [] },
};
