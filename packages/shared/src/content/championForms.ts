/**
 * championForms — the 26 base⇄alternate 變身 pairs the source map declares, as
 * one shipped, testable table.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS COMES FROM
 * ---------------------------------------------------------------------------
 * `src_gogodieEX227s.w3x` → `war3map.w3a`, the WC3 **Metamorphosis** field pair
 * read at ABILITY LEVEL 1:
 *
 *     Eme1  normal-form unit rawcode      → the champion a player picks
 *     Emeu  alternate-form unit rawcode   → the transformed body
 *
 * All 26 champion transforms in the map use that one pattern, so every second
 * form is a COMPLETE second unit definition in `war3map.w3u` — its own model,
 * scale, movement speed and ability list — never a buff on the first.
 *
 * `tools/w3x-import/extract_transform_forms.py` regenerates the fixture this
 * table is pinned against (`out/GoDieEX22s-src/TRANSFORM_FORMS.json`), and
 * `championForms.test.ts` fails if a pair is dropped, added, or REVERSED.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS (the live bug it closes)
 * ---------------------------------------------------------------------------
 * The importer whitelists ~30 of the map's 180 w3u field codes (task #56), so
 * `Eme1`/`Emeu` were dropped and NOTHING downstream could tell a hero from its
 * transformed body. 10 of the 50 first-open-roster slots therefore shipped the
 * ALTERNATE form as if it were the hero — including 草泥馬's lying-down 臥 body,
 * whose w3x movement speed is literally 0, and 妙蛙花 (the final evolution) from
 * round one. The owner ruled 2026-07-26:
 *
 *   「換成本體，變身態改由技能觸發」 — put the BASE on the roster; the second form
 *   becomes reachable only through the transform ability.
 *
 * ---------------------------------------------------------------------------
 * THE DIRECTION PROOF — why `Eme1` is the base and not the other way round
 * ---------------------------------------------------------------------------
 * Not inferred from the field names: the map states it. Every hero unit carries
 * a `unsf` sub-name, and the base's is the bare 編號 「(NN)」 while the
 * alternate's names the form 「(NN變身名)」 — Hgam「(90)」 → H02R「(90 妙蛙花)」,
 * H02V「(92)」 → H02U「(92 臥草)」. 26 of 26. The fixture carries both sub-names
 * so the pin test re-checks the proof rather than trusting this comment.
 *
 * ---------------------------------------------------------------------------
 * SCOPE — DATA ONLY
 * ---------------------------------------------------------------------------
 * Nothing here transforms anything. There is no form-swap system, no EffectDef
 * and no trigger (task #119 owns the mechanic, and the owner is still deciding
 * the auto-trigger conditions for the four passive-slot transforms). This table
 * exists so identity, the roster and the marquee can each ask ONE question —
 * "is this id an alternate form, and of what?" — instead of guessing.
 */
import type { ChampionId } from "../ids";

/** Per-level seconds off a WC3 ability, keyed by level ("1".."4"). Sparse. */
export type PerLevelSeconds = Readonly<Record<string, number>>;

/** One base⇄alternate pair exactly as `war3map.w3a` declares it. */
export interface ChampionFormPair {
  /** The task #11 hero 編號 both halves share, e.g. "90". */
  readonly heroNumber: string;
  /** Champion id of the NORMAL form (`Eme1`) — the pickable hero. */
  readonly baseId: string;
  /** Champion id of the ALTERNATE form (`Emeu`) — the transformed body. */
  readonly alternateId: string;
  /** `Eme1` rawcode as written in the map. */
  readonly normalUnitRawcode: string;
  /** `Emeu` rawcode as written in the map. */
  readonly alternateUnitRawcode: string;
  /** w3a rawcode of the ability that performs the transform, e.g. "A0VG". */
  readonly abilityRawcode: string;
  /** The map's own ability name (`NN-0X …`). */
  readonly abilityName: string;
  /**
   * `ahdu` (HERO duration) per level. EMPTY for the three that never time out —
   * 20-01 風王結界 and 70-00 紮根 are toggles, 61-00 百連我殺 is a death-state
   * morph. An empty map is a recovered fact, not missing data.
   */
  readonly durationSec: PerLevelSeconds;
  /** `acdn` per level. Empty on the two toggles. */
  readonly cooldownSec: PerLevelSeconds;
  /**
   * `false` when that half has NO champion doc in `content/champions`.
   *
   * Both flags are `true` on all 26 pairs today, and that is LOAD-BEARING, not
   * bookkeeping: `sim/content/registry.ts` `Registry.get()` THROWS on an
   * unregistered id, and `apps/game-server/src/net/snapshot.ts` calls it for
   * every champion entity every tick — so a transform into a body with no doc
   * would take the whole room down, not merely fail to render.
   *
   * Four alternate bodies were the last gap (H00W 26洨者狀態 / O030 30變態紳士 /
   * N01B 40萬解 / E010 70紮根). They were imported from `war3map.w3u` via
   * `RESOLVED_HERO_STATS.json`, the same source #248 rebased the roster from,
   * and `championFormsResolve.test.ts` now reads the real registry to prove
   * every id on this table resolves. The flags stay in the type because the
   * table is generated and a future map may again declare a form it does not
   * ship; `championForms.test.ts` keys the doc-link assertions off them.
   */
  readonly baseInContent: boolean;
  readonly alternateInContent: boolean;
}

/**
 * The 26 pairs, ordered by hero 編號. Generated from the w3x by
 * `tools/w3x-import/extract_transform_forms.py`; hand-edits are caught by
 * `championForms.test.ts`, which re-reads the fixture.
 */
export const CHAMPION_FORM_PAIRS: readonly ChampionFormPair[] = [
  {
    heroNumber: "04",
    baseId: "godie-hjai",
    alternateId: "godie-h020",
    normalUnitRawcode: "HJAI",
    alternateUnitRawcode: "H020",
    abilityRawcode: "A0OE",
    abilityName: "04-002 惡夢魔王的碎片",
    durationSec: { "1": 20, "2": 12, "3": 18, "4": 24 },
    cooldownSec: { "1": 70, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "06",
    baseId: "godie-ucrl",
    alternateId: "godie-u034",
    normalUnitRawcode: "UCRL",
    alternateUnitRawcode: "U034",
    abilityRawcode: "A0Y1",
    abilityName: "06-04 傑桑變化",
    durationSec: { "1": 7, "2": 14, "3": 21 },
    cooldownSec: { "1": 60, "2": 60, "3": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "08",
    baseId: "godie-nbbc",
    alternateId: "godie-n01c",
    normalUnitRawcode: "NBBC",
    alternateUnitRawcode: "N01C",
    abilityRawcode: "A0T1",
    abilityName: "08-002 龍魔人",
    durationSec: { "1": 20, "2": 15, "3": 21, "4": 27 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "09",
    baseId: "godie-ogrh",
    alternateId: "godie-o00x",
    normalUnitRawcode: "OGRH",
    alternateUnitRawcode: "O00X",
    abilityRawcode: "A09E",
    abilityName: "09-03 超級賽亞人",
    durationSec: { "1": 8, "2": 12, "3": 16, "4": 20 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "11",
    baseId: "godie-udre",
    alternateId: "godie-u01u",
    normalUnitRawcode: "UDRE",
    alternateUnitRawcode: "U01U",
    abilityRawcode: "A10N",
    abilityName: "11-002 武裝色霸氣",
    durationSec: { "1": 15, "2": 15, "3": 21, "4": 27 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "12",
    baseId: "godie-ewar",
    alternateId: "godie-e007",
    normalUnitRawcode: "EWAR",
    alternateUnitRawcode: "E007",
    abilityRawcode: "A02W",
    abilityName: "12-03 破凰之心-徒手空破山",
    durationSec: { "1": 12, "2": 18, "3": 24, "4": 30 },
    cooldownSec: { "1": 45, "2": 45, "3": 45, "4": 45 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "18",
    baseId: "godie-nsjs",
    alternateId: "godie-n00p",
    normalUnitRawcode: "NSJS",
    alternateUnitRawcode: "N00P",
    abilityRawcode: "A0IH",
    abilityName: "18-03 妖狐變化",
    durationSec: { "1": 8, "2": 12, "3": 16, "4": 20 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "19",
    baseId: "godie-e00k",
    alternateId: "godie-e00z",
    normalUnitRawcode: "E00K",
    alternateUnitRawcode: "E00Z",
    abilityRawcode: "A0SZ",
    abilityName: "19-002 紫色披風",
    durationSec: { "1": 10, "2": 15, "3": 21, "4": 27 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "20",
    baseId: "godie-e002",
    alternateId: "godie-e00l",
    normalUnitRawcode: "E002",
    alternateUnitRawcode: "E00L",
    abilityRawcode: "A0DZ",
    abilityName: "20-01 風王結界",
    // TOGGLE — no `ahdu`, no `acdn`: the 風王結界 body persists until re-cast.
    durationSec: {},
    cooldownSec: {},
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "22",
    baseId: "godie-e001",
    alternateId: "godie-e00n",
    normalUnitRawcode: "E001",
    alternateUnitRawcode: "E00N",
    abilityRawcode: "A02Q",
    abilityName: "22-04 雛見澤症候群L5",
    durationSec: { "1": 7, "2": 14, "3": 21, "4": 28 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 75 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "25",
    baseId: "godie-umal",
    alternateId: "godie-u00l",
    normalUnitRawcode: "UMAL",
    alternateUnitRawcode: "U00L",
    abilityRawcode: "A0HW",
    abilityName: "25-04 ChangeDNA",
    durationSec: { "1": 8, "2": 16, "3": 24, "4": 28 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 75 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "26",
    baseId: "godie-harf",
    alternateId: "godie-h00w",
    normalUnitRawcode: "HARF",
    alternateUnitRawcode: "H00W",
    abilityRawcode: "A0EW",
    abilityName: "26-04 開天闢地‧洨者聖臨",
    durationSec: { "1": 7, "2": 10.5, "3": 14 },
    cooldownSec: { "1": 75, "2": 75, "3": 75 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "30",
    baseId: "godie-orkn",
    alternateId: "godie-o030",
    normalUnitRawcode: "ORKN",
    alternateUnitRawcode: "O030",
    abilityRawcode: "A0YT",
    abilityName: "30-002 變態紳士",
    durationSec: { "1": 15, "2": 15, "3": 21, "4": 27 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "38",
    baseId: "godie-uvng",
    alternateId: "godie-u010",
    normalUnitRawcode: "UVNG",
    alternateUnitRawcode: "U010",
    abilityRawcode: "A0OH",
    abilityName: "38-00 邪眼全開",
    durationSec: { "1": 10 },
    cooldownSec: { "1": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "40",
    baseId: "godie-nman",
    alternateId: "godie-n01b",
    normalUnitRawcode: "NMAN",
    alternateUnitRawcode: "N01B",
    abilityRawcode: "A0ND",
    abilityName: "40-03 萬解-貓王胖虎",
    durationSec: { "1": 12, "2": 18, "3": 24, "4": 30 },
    cooldownSec: { "1": 75, "2": 75, "3": 75, "4": 75 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "42",
    baseId: "godie-n003",
    alternateId: "godie-n01g",
    normalUnitRawcode: "N003",
    alternateUnitRawcode: "N01G",
    abilityRawcode: "A06K",
    abilityName: "42-002 魔力印章",
    durationSec: { "1": 7, "2": 15, "3": 21, "4": 27 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "58",
    baseId: "godie-ofar",
    alternateId: "godie-o02l",
    normalUnitRawcode: "OFAR",
    alternateUnitRawcode: "O02L",
    abilityRawcode: "A040",
    abilityName: "58-04 瘋狂皮卡丘",
    durationSec: { "1": 6, "2": 12, "3": 18, "4": 24 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "61",
    baseId: "godie-u012",
    alternateId: "godie-u011",
    normalUnitRawcode: "U012",
    alternateUnitRawcode: "U011",
    abilityRawcode: "Aphx",
    abilityName: "61-00百連我殺 效果",
    // DEATH-STATE MORPH — `adur` is 0.01s (an instant swap), no hero duration.
    durationSec: {},
    cooldownSec: {},
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "70",
    baseId: "godie-e00s",
    alternateId: "godie-e010",
    normalUnitRawcode: "E00S",
    alternateUnitRawcode: "E010",
    abilityRawcode: "A0O6",
    abilityName: "70-00 紮根",
    // TOGGLE — rooted until re-cast; only the re-cast cooldown is authored.
    durationSec: {},
    cooldownSec: { "1": 15 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "76",
    baseId: "godie-u00n",
    alternateId: "godie-u00o",
    normalUnitRawcode: "U00N",
    alternateUnitRawcode: "U00O",
    abilityRawcode: "A0IR",
    abilityName: "76-00 二檔",
    durationSec: { "1": 20 },
    cooldownSec: { "1": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "77",
    baseId: "godie-e00w",
    alternateId: "godie-e00x",
    normalUnitRawcode: "E00W",
    alternateUnitRawcode: "E00X",
    abilityRawcode: "A0JG",
    abilityName: "77-03 GLADIARIA ALAT",
    durationSec: { "1": 6, "2": 12, "3": 18, "4": 24 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "79",
    baseId: "godie-h01n",
    alternateId: "godie-h01o",
    normalUnitRawcode: "H01N",
    alternateUnitRawcode: "H01O",
    abilityRawcode: "A0LN",
    abilityName: "79-04 卍解",
    durationSec: { "1": 8, "2": 16, "3": 24, "4": 25 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 30 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "81",
    baseId: "godie-o01z",
    alternateId: "godie-o02v",
    normalUnitRawcode: "O01Z",
    alternateUnitRawcode: "O02V",
    abilityRawcode: "A0XP",
    abilityName: "81-002 Exellion Mode",
    durationSec: { "1": 15, "2": 12, "3": 18, "4": 24 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "87",
    baseId: "godie-o02n",
    alternateId: "godie-o02o",
    normalUnitRawcode: "O02N",
    alternateUnitRawcode: "O02O",
    abilityRawcode: "A0DB",
    abilityName: "87-03 天下號令",
    durationSec: { "1": 6, "2": 12, "3": 18, "4": 24 },
    cooldownSec: { "1": 60, "2": 60, "3": 60, "4": 60 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "90",
    baseId: "godie-hgam",
    alternateId: "godie-h02r",
    normalUnitRawcode: "HGAM",
    alternateUnitRawcode: "H02R",
    abilityRawcode: "A0VG",
    abilityName: "90-002 超進化! 妙蛙花",
    // Sparse on purpose: the map authors only levels 1 and 4.
    durationSec: { "1": 18, "4": 25 },
    cooldownSec: { "1": 75, "4": 30 },
    baseInContent: true,
    alternateInContent: true,
  },
  {
    heroNumber: "92",
    baseId: "godie-h02v",
    alternateId: "godie-h02u",
    normalUnitRawcode: "H02V",
    alternateUnitRawcode: "H02U",
    abilityRawcode: "A0W9",
    abilityName: "92-01 臥草泥馬",
    durationSec: { "1": 10, "2": 10, "3": 5, "4": 5 },
    cooldownSec: { "1": 40, "2": 40, "3": 20, "4": 20 },
    baseInContent: true,
    alternateInContent: true,
  },
];

/** `alternateId → its pair`. Every alternate form in the map is a key. */
export const FORM_PAIR_BY_ALTERNATE_ID: ReadonlyMap<string, ChampionFormPair> = new Map(
  CHAMPION_FORM_PAIRS.map((p) => [p.alternateId, p]),
);

/** `baseId → its pair`. Every base form in the map is a key. */
export const FORM_PAIR_BY_BASE_ID: ReadonlyMap<string, ChampionFormPair> = new Map(
  CHAMPION_FORM_PAIRS.map((p) => [p.baseId, p]),
);

/**
 * True when `id` is a TRANSFORMED body rather than a hero.
 *
 * This is the ONE question the roster, the login marquee and the curation
 * bundle should ask before treating an id as a pickable champion. It is decided
 * by the map's `Eme1`/`Emeu` fields — never by a display name, a shared mesh or
 * a shared portrait, all three of which have already been wrong here.
 */
export function isAlternateForm(id: string): boolean {
  return FORM_PAIR_BY_ALTERNATE_ID.has(id);
}

/** True when `id` is the BASE (pickable) half of a transform pair. */
export function isBaseForm(id: string): boolean {
  return FORM_PAIR_BY_BASE_ID.has(id);
}

/** The other half of `id`'s pair, or null when `id` is in no pair. */
export function counterpartFormId(id: string): string | null {
  const asBase = FORM_PAIR_BY_BASE_ID.get(id);
  if (asBase) return asBase.alternateId;
  const asAlt = FORM_PAIR_BY_ALTERNATE_ID.get(id);
  return asAlt ? asAlt.baseId : null;
}

/**
 * True when `a` and `b` are the two halves of ONE w3x transform pair, in either
 * order. This is the positive w3x EVIDENCE the identity rule defers to — see
 * `championIdentity.ts`, and note that it is deliberately a closed table of 26
 * pairs and not a heuristic.
 */
export function isW3xFormPair(a: string, b: string): boolean {
  return counterpartFormId(a) === b && counterpartFormId(b) === a;
}

/** The base id to prefer for `id` — itself when `id` is not an alternate. */
export function baseFormIdOf(id: string): string {
  return FORM_PAIR_BY_ALTERNATE_ID.get(id)?.baseId ?? id;
}

/** Typed helper for callers holding a `ChampionId`. */
export const isAlternateFormId = (id: ChampionId): boolean => isAlternateForm(id as string);
