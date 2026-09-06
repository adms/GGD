import { z } from "zod";
import { zPartialStatBlock } from "./common";

/** Only author choices are stored. The origin profile resolves everything else. */
export const zChampionStatOverrides = z.object({
  baseStats: zPartialStatBlock.default({}),
  growth: zPartialStatBlock.default({}),
  attributes: z.object({
    str: z.number().finite().min(0).max(1000).optional(),
    agi: z.number().finite().min(0).max(1000).optional(),
    int: z.number().finite().min(0).max(1000).optional(),
    strGrowth: z.number().finite().min(0).max(100).optional(),
    agiGrowth: z.number().finite().min(0).max(100).optional(),
    intGrowth: z.number().finite().min(0).max(100).optional(),
  }).strict().default({}),
}).strict();
export type ChampionStatOverrides = z.infer<typeof zChampionStatOverrides>;
