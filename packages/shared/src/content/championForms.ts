/**
 * championForms — every 變身 the source map declares, as shipped, testable
 * tables: 26 two-way `Eme1`/`Emeu` pairs (`CHAMPION_FORM_PAIRS`) plus the ONE
 * tiered Primal-Split form the pair table structurally cannot hold
 * (`CHAMPION_SPLIT_FORMS`, task #208).
 *
 * ⚠️ THE COMMENT BELOW USED TO SAY 「All 26 champion transforms in the map use
 * that one pattern」. That was false and it cost a hero. See
 * `CHAMPION_SPLIT_FORMS` at the bottom of this file.
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
 * 26 champion transforms use that pattern — NOT all of them (see the warning
 * above) — and every second form is a COMPLETE second unit definition in
 * `war3map.w3u`: its own model, scale, movement speed, stat block and ability
 * list, never a buff on the first.
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
    // 鳳凰蛋. The old comment here read 「`adur` is 0.01s (an instant swap), no
    // hero duration」 and was FALSE — it conflated the two duration fields.
    // `adur` (unit duration) really is 0.01s, but `ahdu` (HERO duration) is 10s,
    // and `ahdu` is the one that governs a hero morph. It read as absent only
    // because `extract_transform_forms.py` did not resolve the value through the
    // MPQ, so the fixture shipped `durationSecByLevel: {}` and this table copied
    // the hole — comment, extractor, fixture and table all self-consistently
    // wrong (CLAUDE.md rule 3). The extractor now reads it; 10s is the map's.
    durationSec: { 1: 10 },
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

// ---------------------------------------------------------------------------
// SPLIT FORMS — the family `CHAMPION_FORM_PAIRS` structurally cannot hold
// ---------------------------------------------------------------------------

/**
 * One rank of a TIERED split form: the single unit the caster becomes at that
 * ability level. Its numbers are the map's raw WC3 values, not game units —
 * this table is provenance, and converting here would hide the source.
 */
export interface SplitFormTier {
  /** Ability level this body belongs to (1-based). */
  readonly level: number;
  /** `Nef1` rawcode at that level, e.g. "u00D". */
  readonly unitRawcode: string;
  /** The `godie-*` id this unit WOULD have as a champion doc. */
  readonly championId: string;
  /** The map's `unsf` sub-name, e.g. "(LV2)". The tier proof. */
  readonly subName: string;
  /** Raw w3u numbers: `uhpm`, `umpm`, `udef`, `ua1b`, `umvs`. */
  readonly maxHealth: number;
  readonly maxMana: number;
  readonly armor: number;
  readonly attackDamageBase: number;
  readonly moveSpeedWc3: number;
  /** `uabi` — the unit's own ability rawcodes, in map order. GROWS per tier. */
  readonly abilityRawcodes: readonly string[];
}

/**
 * A caster-swap driven by WC3's **Primal Split** family (`ANef`), where the hero
 * is REMOVED and replaced by the unit(s) in `Nef1` for `durationSec`.
 */
export interface ChampionSplitForm {
  /** The task #11 hero 編號 of the CASTER, e.g. "37". */
  readonly heroNumber: string;
  /** Champion id of the caster — the pickable hero. */
  readonly baseId: string;
  /** `war3map.w3u` rawcode of the caster. */
  readonly casterUnitRawcode: string;
  /** w3a rawcode of the ability that performs the swap. */
  readonly abilityRawcode: string;
  /** The Blizzard base row it is a diff against — `ANef` for the only one. */
  readonly abilityBase: string;
  /** The map's own ability name. */
  readonly abilityName: string;
  /** `ahdu` (HERO duration) per level, seconds. */
  readonly durationSec: PerLevelSeconds;
  /** `acdn` per level, seconds. */
  readonly cooldownSec: PerLevelSeconds;
  /** One body per ability level, in level order. */
  readonly tiers: readonly SplitFormTier[];
  /** `false` when NO champion doc exists for a tier's `championId` yet. */
  readonly tiersInContent: boolean;
}

/**
 * The map's split forms. ONE entry — and finding it is the whole point of
 * task #208.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SECOND TABLE AND NOT A 27th PAIR
 * ---------------------------------------------------------------------------
 * `ChampionFormPair` is 1:1 by construction — one `normalUnitRawcode`, one
 * `alternateUnitRawcode` — because `Eme1`/`Emeu` are one unit each. 37-04
 * 魔界之王 is 1:3: `A01Z` writes `Nef1` at THREE LEVELS, a different unit each
 * time (lv1 `u001`, lv2 `u00D`, lv3 `u00E`). Squeezing that into the pair table
 * would mean either dropping two bodies or inventing three fake pairs that
 * share a base, and both lie about what the map says.
 *
 * ---------------------------------------------------------------------------
 * WHY IT WAS MISSED FOR SO LONG
 * ---------------------------------------------------------------------------
 * `extract_transform_forms.py` reads `Eme1`/`Emeu` and nothing else, and its
 * docstring generalised that to 「every champion transform」. `A01Z`'s base is
 * `ANef` (Brewmaster 「Storm, Earth and Fire」), which writes `Nef1` and NEVER
 * touches `Eme1`/`Emeu` — so no loosening of that search could ever find it.
 * The earlier theory that the extractor had a hero filter was also checked and
 * is false: removing a hero filter yields zero extra pairs.
 * `tools/w3x-import/extract_unit_swap_census.py` now classifies EVERY w3a entry
 * by the shape of its Blizzard base row, so the next unfamiliar family is
 * reported instead of silently skipped.
 *
 * ---------------------------------------------------------------------------
 * WHY "TIERED FORM" AND NOT "THREE CLONES AT ONCE"
 * ---------------------------------------------------------------------------
 * Blizzard's `ANef` puts its three images in ONE comma list at level 1
 * (`npn1,npn2,npn3`) — one cast, three bodies. `A01Z` instead writes ONE unit
 * per level, so a cast summons exactly one body and WHICH body depends on the
 * skill rank. The three units agree: same model
 * (`units\undead\Tichondrius\Tichondrius.mdl`) and same 1.85 scale, `unsf`
 * 「(LV1)」/「(LV2)」/「(LV3)」, and ability lists that GROW 3 → 4 → 5 exactly as
 * the map's own tooltip promises (lv1 災難終結 + 魔力操控, lv2 adds 凱薩之鷹,
 * lv3 adds 天地魔鬥). `A0SJ` 28-002 無限分裂 IS a real 5-clone split, and it is
 * deliberately NOT in this table: it is on no unit's ability list and appears
 * nowhere in war3map.j — a draft the author replaced with a Mirror Image
 * (`A03T`). The census fixture carries it with `live: false`.
 *
 * ---------------------------------------------------------------------------
 * SCOPE — DATA ONLY, AND THE BODIES ARE NOT SHIPPED YET
 * ---------------------------------------------------------------------------
 * `tiersInContent: false` is a fact, not a TODO marker: `content/champions`
 * has no `godie-u001` / `godie-u00d` / `godie-u00e`. Until it does, nothing may
 * transform into them — `sim/content/registry.ts` `Registry.get()` THROWS on an
 * unregistered id and `snapshot.ts` calls it every tick for every champion
 * entity, so a swap into a missing doc takes the room down rather than merely
 * failing to render. `championSplitForms.test.ts` pins the flag against the
 * real content directory, so it flips to `true` on its own the moment the three
 * docs land and goes red if they are half-landed.
 */
export const CHAMPION_SPLIT_FORMS: readonly ChampionSplitForm[] = [
  {
    heroNumber: "37",
    baseId: "godie-ubal",
    casterUnitRawcode: "Ubal",
    abilityRawcode: "A01Z",
    abilityBase: "ANef",
    abilityName: "37-04 魔界之王",
    durationSec: { "1": 35, "2": 35, "3": 35 },
    cooldownSec: { "1": 90, "2": 90, "3": 90 },
    tiers: [
      {
        level: 1,
        unitRawcode: "u001",
        championId: "godie-u001",
        subName: "(LV1)",
        maxHealth: 1600,
        maxMana: 500,
        armor: 5,
        attackDamageBase: 100,
        moveSpeedWc3: 350,
        // 攻擊速度限制 (A0F6) is an item-ability attack-speed clamp, not a
        // castable — it is kept because it is part of the unit as authored.
        abilityRawcodes: ["A0F6", "A01O", "A0OT"],
      },
      {
        level: 2,
        unitRawcode: "u00D",
        championId: "godie-u00d",
        subName: "(LV2)",
        maxHealth: 2600,
        maxMana: 750,
        armor: 10,
        attackDamageBase: 140,
        moveSpeedWc3: 390,
        abilityRawcodes: ["A0F6", "A01O", "A0OT", "A01X"],
      },
      {
        level: 3,
        unitRawcode: "u00E",
        championId: "godie-u00e",
        subName: "(LV3)",
        maxHealth: 3600,
        maxMana: 1150,
        armor: 15,
        attackDamageBase: 180,
        moveSpeedWc3: 430,
        abilityRawcodes: ["A0F6", "A01O", "A0OT", "A01X", "A01W"],
      },
    ],
    tiersInContent: false,
  },
];

/** `baseId → its split form`. */
export const SPLIT_FORM_BY_BASE_ID: ReadonlyMap<string, ChampionSplitForm> = new Map(
  CHAMPION_SPLIT_FORMS.map((f) => [f.baseId, f]),
);

/**
 * True when `id` is a SPLIT-FORM BODY (a `Nef1` tier), not a pickable hero.
 *
 * The roster, the marquee and the curation bundle must exclude these for the
 * same reason they exclude `isAlternateForm` ids — the owner's 2026-07-26
 * ruling 「換成本體，變身態改由技能觸發」 is about the SHAPE of a form, not about
 * which WC3 ability family happens to produce it.
 */
export function isSplitFormBody(id: string): boolean {
  return CHAMPION_SPLIT_FORMS.some((f) => f.tiers.some((t) => t.championId === id));
}

/**
 * True when `id` is a second-form body of ANY kind — `Emeu` alternate OR
 * `Nef1` split tier. This is the question callers actually mean when they ask
 * 「is this a hero or a transformed body?」, and asking only `isAlternateForm`
 * is what let 巴恩's three bodies stay invisible.
 */
export function isTransformedBody(id: string): boolean {
  return isAlternateForm(id) || isSplitFormBody(id);
}

/**
 * ALTERNATE-FORM BODY FACTS (task #214) — what the SECOND unit overrides.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AND WHY IT IS SEPARATE FROM THE PAIR TABLE
 * ---------------------------------------------------------------------------
 * `CHAMPION_FORM_PAIRS` answers "which two docs are a pair, and which ability
 * swaps them". It says NOTHING about how the second body behaves, and that hole
 * is where 悟空 #09 lost three of its four mechanics. `O00X`'s own `war3map.w3u`
 * entry overrides five fields on top of `Ogrh`:
 *
 *     ua1c  attack cooldown  1.90 -> 1.20  (+58 % attacks per second)
 *     umvs  movement speed    310 -> 400
 *     umvt  movement type    (ground) -> `hover`      ⎫ the SSJ3 body FLOATS
 *     umvh  fly height       (silent) -> 30.0         ⎭
 *     uabi  ability list     A0O1,A0NL,AInv,A0MI
 *                         -> A0S7,A0O1,A0NL,AInv,A017,A0MJ
 *
 * Two of those (cooldown, speed) reached the champion docs as `as` / `ms` when
 * #248 rebased the stat sheets — by accident of that job's scope, not because
 * anything connected them to the transform. The other three had NO home at all,
 * and the last line is the one no stat sweep could ever have seen: **`A0S7` is
 * a SPELLBOOK** (`Aspb`, `spb1 = A0SI`), the WC3 idiom for "give a unit a
 * passive without giving it a button". The entire 09-002a 悟空指令靈氣
 * (+25 % attack damage, `ACac` Command Aura, `Cac1 = 0.25`) hangs off it.
 *
 * So this table is the answer to ONE question — 「這個第二形態的身體，跟本體差
 * 在哪？」 — and it is deliberately a separate export rather than more fields on
 * `ChampionFormPair`: the pair table is consumed by identity, the roster and the
 * marquee, none of which want a body sheet, and this one is consumed by the
 * stat/render lanes, which do not want the link fields.
 *
 * ---------------------------------------------------------------------------
 * ABSENCE IS A FACT, AND IT IS NOT "NONE"
 * ---------------------------------------------------------------------------
 * A `war3map.w3u` entry is a DIFF against its `base_id`. Every field here is the
 * alternate unit's OWN write, so an absent field means **the map is silent on
 * this unit and it inherits the base's value** — never "the unit has none". Read
 * `attackCooldownSec` as "the second body re-declares its attack cadence", not
 * as "the second body's attack cadence". `godie-u011` (61 鳳凰蛋) writes no
 * `ua1c` at all and keeps 悟空-style 2.0 from `U012`; that is why the field is
 * missing there rather than 0.
 *
 * `baseAbilityRawcodes` rides along for exactly one reason: the DELTA is the
 * interesting quantity ("what does transforming ADD?"), and computing it needs
 * both lists. It is the base unit's own `uabi`, same contract.
 *
 * Generated from `tools/w3x-import/out/GoDieEX22s-src/TRANSFORM_FORMS.json` by
 * `extract_transform_forms.py`; `championFormGoku.test.ts` re-reads that fixture
 * and fails on any drift, so a hand-edit here is caught.
 */
export interface AlternateFormBody {
  /** the task #11 hero 編號 this body belongs to, e.g. "09". */
  readonly heroNumber: string;
  /** `ua1c` — seconds between attacks. Absent = inherited from the base unit. */
  readonly attackCooldownSec?: number;
  /** `umvs` — WC3 movement speed. Absent = inherited. */
  readonly moveSpeed?: number;
  /** `umvt` — WC3 movement type (`hover` / `fly` / `amph` / `foot`). Absent = inherited. */
  readonly moveType?: string;
  /**
   * `umvh` — WC3 fly height, the number of WC3 units the body floats above the
   * ground. TWO of the 26 forms declare one and BOTH conflict with task #168,
   * which treats a model sitting above the floor as a bug and grounds it:
   * `godie-o00x` 超級賽亞人 (hover, 30) and `godie-o030` 變態紳士 (fly, 300).
   * For these two the float is the DESIGN, not the defect.
   */
  readonly flyHeight?: number;
  /** `uabi` — the alternate unit's non-hero ability list. Absent = inherited. */
  readonly abilityRawcodes?: readonly string[];
  /** the BASE unit's `uabi`, so the delta can be computed without a second lookup. */
  readonly baseAbilityRawcodes?: readonly string[];
}

/** `alternateId -> its body sheet`. Keyed by the `Emeu` champion id. */
export const ALTERNATE_FORM_BODIES: ReadonlyMap<string, AlternateFormBody> = new Map([
  [
    "godie-h020",
    {
      heroNumber: "04",
      attackCooldownSec: 2,
      moveSpeed: 290,
      abilityRawcodes: ["AInv", "A0UH", "A0OE", "A023"],
      baseAbilityRawcodes: ["AInv", "A0UH", "A0OE"],
    },
  ],
  [
    "godie-u034",
    {
      heroNumber: "06",
      attackCooldownSec: 1.5,
      moveSpeed: 360,
      abilityRawcodes: ["AInv", "A08Y", "A025", "A017"],
      baseAbilityRawcodes: ["AInv", "A08Y", "A025"],
    },
  ],
  [
    "godie-n01c",
    {
      heroNumber: "08",
      attackCooldownSec: 2,
      moveSpeed: 305,
      abilityRawcodes: ["AInv", "A05V", "A0T1", "A0T0", "A0MB", "A05X", "A0C5"],
      baseAbilityRawcodes: ["AInv", "A05V", "A0T1"],
    },
  ],
  [
    "godie-o00x",
    {
      heroNumber: "09",
      attackCooldownSec: 1.2,
      moveSpeed: 400,
      moveType: "hover",
      flyHeight: 30,
      abilityRawcodes: ["A0S7", "A0O1", "A0NL", "AInv", "A017", "A0MJ"],
      baseAbilityRawcodes: ["A0O1", "A0NL", "AInv", "A0MI"],
    },
  ],
  [
    "godie-u01u",
    {
      heroNumber: "11",
      attackCooldownSec: 1.9,
      moveSpeed: 315,
      abilityRawcodes: ["AInv", "A10N", "A0OU", "A0C5", "A05X", "A10O"],
      baseAbilityRawcodes: ["AInv", "A0OU", "A10N"],
    },
  ],
  [
    "godie-e007",
    {
      heroNumber: "12",
      attackCooldownSec: 2,
      moveSpeed: 300,
      abilityRawcodes: ["AInv", "A04Z", "A0SQ"],
      baseAbilityRawcodes: ["AInv", "A04Z", "A0SQ"],
    },
  ],
  [
    "godie-n00p",
    {
      heroNumber: "18",
      attackCooldownSec: 1.9,
      moveSpeed: 300,
      abilityRawcodes: ["AInv", "A00N", "A0SE", "A0II"],
      baseAbilityRawcodes: ["AInv", "A002", "A0SE"],
    },
  ],
  [
    "godie-e00z",
    {
      heroNumber: "19",
      attackCooldownSec: 1.8,
      moveSpeed: 522,
      abilityRawcodes: ["AInv", "A0RH", "A0SZ"],
      baseAbilityRawcodes: ["AInv", "A0RG", "A0SZ"],
    },
  ],
  [
    "godie-e00l",
    {
      heroNumber: "20",
      attackCooldownSec: 1.9,
      moveSpeed: 300,
      abilityRawcodes: ["AInv", "A05M", "A0CQ", "A0M3", "A0SP"],
      baseAbilityRawcodes: ["AInv", "A0CQ", "A0SP"],
    },
  ],
  [
    "godie-e00n",
    {
      heroNumber: "22",
      attackCooldownSec: 1.5,
      moveSpeed: 400,
      abilityRawcodes: ["A0FR", "A0SB", "AInv", "A0CL", "A0SV"],
      baseAbilityRawcodes: ["AInv", "A0CL", "A0SU"],
    },
  ],
  [
    "godie-u00l",
    {
      heroNumber: "25",
      attackCooldownSec: 1.5,
      moveSpeed: 305,
      abilityRawcodes: ["AInv", "A07H", "A0HX", "A0FO", "A10Y"],
      baseAbilityRawcodes: ["AInv", "A07H", "A10Y"],
    },
  ],
  [
    "godie-h00w",
    {
      heroNumber: "26",
      attackCooldownSec: 1.6,
      moveSpeed: 305,
      abilityRawcodes: ["AInv", "A106", "A0F8"],
      baseAbilityRawcodes: ["AInv", "A106", "A0F8"],
    },
  ],
  [
    "godie-o030",
    {
      heroNumber: "30",
      attackCooldownSec: 1.7,
      moveSpeed: 295,
      moveType: "fly",
      flyHeight: 300,
      abilityRawcodes: ["AInv", "A029", "A0YT", "A02I", "A08K", "A0HN"],
      baseAbilityRawcodes: ["AInv", "A029", "A0YY"],
    },
  ],
  [
    "godie-u010",
    {
      heroNumber: "38",
      attackCooldownSec: 2,
      moveSpeed: 360,
      abilityRawcodes: ["AInv", "A0OH", "A0IW", "A0OI", "A0FR", "A0SO"],
      baseAbilityRawcodes: ["AInv", "A0OH", "A0SO"],
    },
  ],
  [
    "godie-n01b",
    {
      heroNumber: "40",
      attackCooldownSec: 1.9,
      moveSpeed: 310,
      abilityRawcodes: ["A10C", "AInv", "A07G", "A0NR", "A0NT"],
      baseAbilityRawcodes: ["A10C", "AInv", "A07G"],
    },
  ],
  [
    "godie-n01g",
    {
      heroNumber: "42",
      attackCooldownSec: 2,
      moveSpeed: 160,
      abilityRawcodes: ["AInv", "A059", "A06K"],
      baseAbilityRawcodes: ["AInv", "A059", "A06K"],
    },
  ],
  [
    "godie-o02l",
    {
      heroNumber: "58",
      attackCooldownSec: 1.5,
      abilityRawcodes: ["AInv", "A0R6", "A0AG", "A0FO", "A0SL"],
      baseAbilityRawcodes: ["AInv", "A0R6", "Alit", "A0SL"],
    },
  ],
  [
    "godie-u011",
    {
      heroNumber: "61",
      moveSpeed: 0,
      abilityRawcodes: ["AInv", "A0OA", "A0OM", "Aphx"],
      baseAbilityRawcodes: ["AInv", "A0OA", "A0OM", "Aphx"],
    },
  ],
  [
    "godie-e010",
    {
      heroNumber: "70",
      moveSpeed: 0,
      moveType: "foot",
      abilityRawcodes: ["AInv", "A0GM", "A0O6"],
      baseAbilityRawcodes: ["A0ZQ", "A0ZM", "A0G1", "AInv", "A0GM"],
    },
  ],
  [
    "godie-u00o",
    {
      heroNumber: "76",
      attackCooldownSec: 1.9,
      moveSpeed: 415,
      abilityRawcodes: ["AInv", "A0ZK", "A0IR", "A0IW", "A0IX"],
      baseAbilityRawcodes: ["AInv", "A0ZK", "A0IR"],
    },
  ],
  [
    "godie-e00x",
    {
      heroNumber: "77",
      attackCooldownSec: 1.7,
      moveSpeed: 522,
      abilityRawcodes: ["A10G", "AInv", "A0JD", "A0FI", "A0HP", "A0JI", "A0I0"],
      baseAbilityRawcodes: ["A10G", "AInv", "A0JD"],
    },
  ],
  [
    "godie-h01o",
    {
      heroNumber: "79",
      attackCooldownSec: 1.2,
      moveSpeed: 400,
      abilityRawcodes: ["AInv", "A0UV", "A0W5", "A0LS"],
      baseAbilityRawcodes: ["AInv", "A0LH", "A0W5", "A0LS"],
    },
  ],
  [
    "godie-o02v",
    {
      heroNumber: "81",
      attackCooldownSec: 2,
      moveSpeed: 305,
      abilityRawcodes: ["AInv", "A0NQ", "A0XP"],
      baseAbilityRawcodes: ["AInv", "A0NQ", "A0XP"],
    },
  ],
  [
    "godie-o02o",
    {
      heroNumber: "87",
      attackCooldownSec: 2,
      moveSpeed: 330,
      moveType: "amph",
      abilityRawcodes: ["AInv", "A05P", "A0DI", "A0DC", "ANht", "A0DR"],
      baseAbilityRawcodes: ["AInv", "ANht"],
    },
  ],
  [
    "godie-h02r",
    {
      heroNumber: "90",
      attackCooldownSec: 1.2,
      moveSpeed: 240,
      moveType: "amph",
      abilityRawcodes: ["AInv", "A0KV", "A0VG", "A0VH"],
      baseAbilityRawcodes: ["AInv", "A0KV", "A0VG"],
    },
  ],
  [
    "godie-h02u",
    {
      heroNumber: "92",
      attackCooldownSec: 2,
      moveSpeed: 0,
      abilityRawcodes: ["A0W6", "A0Z9", "A0W8", "AInv"],
      baseAbilityRawcodes: ["A0W6", "A0Z9", "AInv"],
    },
  ],
]);

/**
 * The rawcodes this form GAINS over its base — the 「變身多了什麼」 delta.
 *
 * Empty when either list is absent (the map was silent) or when the two lists
 * are equal. Order follows the alternate's own `uabi`, which is the order the
 * map's command card uses.
 */
export function formAbilityGain(alternateId: string): readonly string[] {
  const body = ALTERNATE_FORM_BODIES.get(alternateId);
  if (!body?.abilityRawcodes || !body.baseAbilityRawcodes) return [];
  const had = new Set(body.baseAbilityRawcodes);
  return body.abilityRawcodes.filter((code) => !had.has(code));
}
