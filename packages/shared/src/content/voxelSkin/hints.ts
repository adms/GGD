/**
 * voxelSkin/hints — the abstract SILHOUETTE WORD each champion's original w3x
 * hero row carried in its `model` field, baked at authoring time from
 * `tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json` (our own importer's
 * output) so the generator stays a pure browser-safe function with no file IO.
 *
 * WHAT THIS IS: 59 short strings like `PolarBear`, `BansheeGhost`,
 * `AncientProtector`, `VillagerKid`. They are read ONLY as English silhouette
 * WORDS by the keyword rules in rules.ts — "this hero was shaped like a bear /
 * a ghost / a tree" — which is why 維尼 gets fur and 貞子 gets pallor even
 * though neither says so in its own name.
 *
 * WHAT THIS IS NOT: it is not art, not a texture, not geometry, and nothing is
 * ever loaded from it. No Blizzard/Mojang asset is read, copied or derived at
 * any point in this pipeline; the word `PolarBear` is a noun, and the fur tone
 * it selects is one of our own twelve authored tones.
 *
 * GENERATED — do not hand-edit; regenerate from OBJECTS.json if the import
 * ever changes. 59 of 114 champions have a row (the rest are in-house
 * originals or map units whose row carried no model).
 */
export const W3X_SILHOUETTE_HINTS: Readonly<Record<string, string>> = Object.freeze({
  "godie-e001": "RenaRyugu2",
  "godie-e002": "HeroSaber",
  "godie-e007": "HeroLingTong",
  "godie-e008": "HeroShana",
  "godie-e00j": "ma",
  "godie-e00k": "HeroKunoichi",
  "godie-e00l": "HeroSaber",
  "godie-e00n": "RenaRyugu2",
  "godie-e00q": "HeroSaber",
  "godie-e00r": "SatyrTrickster",
  "godie-e00s": "AncientProtector",
  "godie-e00t": "BansheeGhost",
  "godie-e00u": "Runner",
  "godie-e00v": "PolarBear",
  "godie-e00w": "mfls",
  "godie-e00x": "mfls",
  "godie-e00z": "HeroKunoichi",
  "godie-e012": "HeroHimuraKenshin",
  "godie-e015": "HeroMountainKing",
  "godie-h00l": "linkstik",
  "godie-h01n": "HeroIchigo",
  "godie-h01o": "HeroIchigo",
  "godie-h01u": "LuBu",
  "godie-h020": "LinaInvers",
  "godie-h021": "VillagerKid",
  "godie-h022": "negi",
  "godie-h02k": "PandarenBrewmaster",
  "godie-h02r": "Bulbasaur",
  "godie-h02u": "horse",
  "godie-h02v": "horse",
  "godie-h02y": "ChaosHellscream",
  "godie-n003": "Long",
  "godie-n00b": "StormPandarenBrewmaster",
  "godie-n00p": "fox",
  "godie-n01c": "SD2",
  "godie-n01g": "Long",
  "godie-o00k": "pika",
  "godie-o00l": "HeroXelloss",
  "godie-o00x": "Goku",
  "godie-o01z": "niya",
  "godie-o02l": "picacugy",
  "godie-o02o": "ChaosWolfRider",
  "godie-o02p": "HeroMiku",
  "godie-o02s": "lgcr",
  "godie-o02v": "niya",
  "godie-o02w": "hzyn",
  "godie-u00h": "Herokyo",
  "godie-u00j": "HeroSephiroth",
  "godie-u00k": "EredarWarlock",
  "godie-u00l": "HeroPikachu",
  "godie-u00n": "Luffe",
  "godie-u00o": "Luffe",
  "godie-u00v": "rabbit",
  "godie-u010": "HeroHehi",
  "godie-u011": "collision",
  "godie-u01f": "Grunt",
  "godie-u01q": "HeroMusashiMiyamoto",
  "godie-u01u": "HeroMusashiMiyamoto",
  "godie-u034": "HeroBigGon",
});

/** The hint for a champion, or "" when the map row carried no model. */
export function silhouetteHint(championId: string): string {
  return W3X_SILHOUETTE_HINTS[championId] ?? "";
}
