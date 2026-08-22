import { z } from "zod";
import { zId } from "../common";
import { zAudioAssetPath } from "./_shared";

/**
 * config.champion-voices@1 — per-CHAMPION voice bindings
 * (`config/champion-voices.json`): the clip pool played when the player clicks
 * their own hero in battle. `select` lists w3x map quip clips extracted for
 * that champion (`source: "map-quip"`); champions with no map quip get an
 * empty pool (`source: "none"`) plus a `soundset` hint — the WC3 unit
 * soundset name the blizzard-local overlay can resolve to Blizzard click
 * lines on machines that staged `content/assets/blizzard-local/`. Missing
 * clips / null soundsets degrade to silence — never an error.
 */
export const zChampionVoiceEntry = z
  .object({
    /** click-quip clip pool, e.g. ["assets/audio/sfx/pikakill.mp3"] */
    select: z.array(zAudioAssetPath),
    /** where the pool came from: extracted map quips, or nothing authored */
    source: z.enum(["map-quip", "none"]),
    /** WC3 soundset name (blizzard-local overlay fallback hint) or null */
    soundset: z.string().min(1).nullable(),
  })
  .strict();

export const zConfigChampionVoicesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.champion-voices@1"),
    /** championId -> voice entry (every champion doc gets exactly one) */
    champions: z.record(zId, zChampionVoiceEntry),
  })
  .strict();
export type ChampionVoiceEntry = z.infer<typeof zChampionVoiceEntry>;
export type ConfigChampionVoicesDoc = z.infer<typeof zConfigChampionVoicesDoc>;
