/**
 * 下架名單 —— champion docs the owner has ruled OFF the selectable roster.
 *
 * 下架 IS NOT 刪除, AND IT IS NOT A RUNTIME GATE. Two separate things, and
 * conflating them is the whole reason this file needed a header:
 *
 *   · THE RUNTIME GATE IS THE OPERATOR WHITELIST, and it stays that way. What a
 *     deployment actually offers in champ-select is `data/curation/whitelist.json`
 *     — every id in it is a checkbox in 後台 → 內容白名單, and an operator who
 *     changes their mind about either champion below can re-enable it in one
 *     click with no code change. That is the 「編輯器可調優先」 contract, and
 *     NOTHING here overrides it. This module cannot disable a champion; it has
 *     no callers in the sim, the server or the client.
 *
 *   · THIS FILE IS ABOUT THE SHIPPED DEFAULT. The seed of that whitelist is
 *     `starterChampions` in apps/platform/internal/curation/starter.go, which a
 *     fresh install applies. An id that is absent from the seed today is absent
 *     BY ACCIDENT as far as any test can tell — nothing records that the
 *     absence was a DECISION, so a re-import, a merge, or a well-meaning
 *     「這支好像漏了」 puts it back and every gate stays green. The registry
 *     below is the decision, written down; `delistedChampions.test.ts` is what
 *     makes putting one back go red.
 *
 * WHY NOT DELETE THE DOCS. The owner has reversed curation calls before (the
 * 變身 roster swap moved ten slots and back). A deleted doc costs a re-import to
 * recover and takes its abilities, icon, voice lines and w3x provenance with it;
 * a delisted doc costs one checkbox. So the docs stay on disk, and the guard
 * below asserts they stay — a delist that quietly became a deletion is its own
 * regression.
 */

/** Why a champion is off the roster, and who decided. */
export interface DelistRecord {
  /** display name, so a failure message names a hero rather than a rawcode */
  readonly name: string;
  /** the ruling, verbatim where the owner gave one */
  readonly ruling: string;
  /** ISO date of the ruling */
  readonly ruledOn: string;
  /**
   * What is WRONG with the doc, for whoever reads this next. Deliberately
   * separate from `ruling`: the ruling is authority, this is evidence, and a
   * future re-list has to deal with the evidence.
   */
  readonly defects: readonly string[];
}

/**
 * The delist table. Keys are champion doc ids (= `content/champions/<id>.json`).
 *
 * ⚠️ ADDING A ROW HERE DOES NOT REMOVE ANYTHING. It records a decision and arms
 * the guard. If the id is currently in `starterChampions`, take it out of
 * starter.go in the same change — otherwise this file's own test fails, which
 * is exactly the point.
 */
export const DELISTED_CHAMPIONS: ReadonlyMap<string, DelistRecord> = new Map<string, DelistRecord>([
  [
    "godie-e00u",
    {
      name: "完全而瀟灑的女僕 - 十六夜Sakuya",
      ruling: "godie-e00u 十六夜Sakuya => 下架，連帶技能也不處理",
      ruledOn: "2026-07-30",
      defects: [
        // Verified against the content tree on 2026-07-30, not taken on trust.
        'all four of Q/W/E/R are placeholder docs named literally "none" — the ' +
          "importer found no WC3 ability for any slot (tools/w3x-import/out/" +
          "GoDieEX22s/import_report.json lines 20-27), so the hero has no kit at all",
        // The 天生技 lane owns content/abilities/*.passive.json, so this is
        // RECORDED here rather than fixed there — per the ruling it stays wrong.
        "godie-e00u.passive is 「44-00 機警」, which is hero 44 夜神月's innate: " +
          "a MIS-ASSIGNMENT (編號 44 ≠ this hero). NOT FIXED, on the owner's " +
          "「連帶技能也不處理」 — do not read it as correct just because it ships",
        "the champion doc's own 描述 names four abilities (離間之劍、千刃‧聚華、" +
          "血染的銀匕首、夜霧的殺人鬼) that no doc in the tree implements",
        "modelKey is champ.sela, a voxel stand-in — the map's units\\nightelf\\" +
          "Runner\\Runner.mdl was never recovered",
      ],
    },
  ],
  [
    "godie-u01f",
    {
      name: "萬夫莫敵 - 黑化張飛",
      ruling: "不是英雄，是地圖自己的世界王 —— 從英雄名單下架，改接成 #262 的殭屍王",
      ruledOn: "2026-07-30",
      defects: [
        // Every one of these was re-derived from the source map this session;
        // see the task report for the two claims that turned out to be wrong.
        "war3map.j:11821 spawns it with CreateNUnitsAtLoc(1,'U01F', " +
          "Player(PLAYER_NEUTRAL_AGGRESSIVE), …) — a NEUTRAL AGGRESSIVE creep, " +
          "never a player unit",
        "OBJECTS.heroes.U01F.hero_abilities is EMPTY: the map gives it no Q/W/E/R, " +
          "only 8 unit-level passives (AInv 物品欄 · Atru · A0MP · AHtb 摔技 · " +
          "A0FR · Arsk 抵抗外皮 · A0C7 迴避 · A087 暴擊)",
        "absent from udg_HeroType[1..78] (parsed/random_pool.json) — the map's own " +
          "and only pickable-hero list",
        "its four GGD Q/W/E/R docs are placeholders named 「none」, for the same " +
          "reason: there was never anything to import",
      ],
    },
  ],
]);

/** Champion ids that must not appear on any shipped selectable surface. */
export const DELISTED_CHAMPION_IDS: readonly string[] = [...DELISTED_CHAMPIONS.keys()].sort();

/**
 * Is this id off the shipped roster by decision?
 *
 * ⚠️ NOT AN AUTHORISATION CHECK — see the header. A caller that wants to know
 * 「can this player pick this champion」 must ask the curation whitelist, which
 * is the operator's to change. This answers only 「did we ship it deliberately
 * disabled」, which is a question about the DEFAULT.
 */
export function isDelistedChampion(id: string): boolean {
  return DELISTED_CHAMPIONS.has(id);
}
