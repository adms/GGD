/**
 * championIdentity — THE single rule for "are these two roster entries the same
 * character?", and the only place that rule may live.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS (the 黑化Saber bug)
 * ---------------------------------------------------------------------------
 * `godie-e002` 亞瑟王 - Saber and `godie-e00q` 英靈-亞瑟王 - 黑化Saber share ONE
 * mesh (`imported.herosaber`) and one extracted portrait PNG. Two different
 * heuristics — "same model ⇒ duplicate" and "same portrait bytes ⇒ duplicate" —
 * therefore both concluded they were the same hero, and 黑化Saber silently
 * vanished from the roster. It is not a skin: its ability names carry hero
 * number **69** (力量強化 / 黑泥召喚 / 約束與勝利之劍 / 魔力增幅) against Saber's
 * **20** (風王結界 / 感知能力 / 約束與勝利之劍 / Avalon), and 黑泥 (the corrupted
 * Grail mud) is a bespoke kit that exists nowhere else in the map.
 *
 * IDENTITY IS THE HERO NUMBER, NOT THE MODEL AND NOT THE PORTRAIT.
 * Per the task #11 convention every imported ability is named `NN-0X 技能名`
 * (EX: `NN-00X`), where `NN` is the map author's hero 編號. 80 of 113 champions
 * wear one of four CC0 stand-in meshes because their WC3 model was a Blizzard
 * built-in we cannot ship — `champ.sela` alone is worn by 18 unrelated heroes
 * (哆拉A夢, 貞子, 鬼王達, 臭作, 異形, 斑剎 …). A shared mesh is a MISSING-ART
 * fact; it says nothing about who the character is.
 *
 * ---------------------------------------------------------------------------
 * GOVERNING POLICY — the user ruled on this explicitly (2026-07-22):
 *   「遇到疑慮一律判斷寬鬆為多英雄」 — WHEN IN DOUBT, TREAT THEM AS SEPARATE HEROES.
 * ---------------------------------------------------------------------------
 * The costs are ASYMMETRIC, which is the whole reason the rule leans this way:
 *   • a wrongly-MERGED champion DISAPPEARS from the game and its bespoke kit is
 *     lost — a silent, hard-to-notice content regression (the 黑化Saber bug);
 *   • a wrongly-KEPT duplicate is merely cosmetic — one extra tile in a
 *     showcase, trivially removed later once someone notices.
 * So `isSameCharacter` only ever returns true on POSITIVE, STRONG evidence.
 * Absence of evidence is NOT evidence of duplication:
 *   • no parseable hero number on either side ⇒ NOT the same character. The five
 *     numberless roster entries (godie-e00u 十六夜Sakuya, godie-u01f 黑化張飛,
 *     godie-h02n 打我阿笨蛋, and the two non-w3x originals `sela` / `thorne`,
 *     plus the test hero godie-u01q) therefore each stay DISTINCT — they are
 *     never merged into each other and never merged into a numbered hero.
 *   • ability names that disagree about the number ⇒ ambiguous ⇒ NOT the same.
 *   • same number but different names AND different meshes ⇒ NOT the same
 *     (a skin/variant relationship, e.g. hero 25 拳四郎 exists as both
 *     `godie-umal` 北斗神拳掌門人 on a stand-in and `godie-u00l` 北斗之鼠 on
 *     `imported.heropikachu`).
 *   • same number but nothing else in common ⇒ NOT the same; that is a
 *     SOURCE-DATA COLLISION to surface, not to silently resolve. Four exist:
 *       05 — godie-hblm 慈悲的王者-賈修貝爾  vs godie-h021 破銅爛鐵-阿強一號
 *       53 — godie-o00l 獸神官-傑洛士        vs godie-o02s 憂鬱少女-涼宮八ㄦ匕
 *       61 — godie-u012 重金屬樂團的怪物-克勞薩II世 vs godie-u011 死亡老二-克勞薩先生
 *       91 — godie-h02s 死亡騎士             vs godie-h02z 不良少年
 *     (In the w3x each pair literally shares the same four ability rawcodes —
 *     the author cloned a hero and never renumbered it. Both stay playable.)
 * `heroNumberCollisions()` reports these so a human can decide; the SHIPPED
 * behaviour is always "keep both".
 *
 * `championIdentity.test.ts` PINS this policy so a later refactor cannot
 * quietly tighten it back into over-merging.
 *
 * ---------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------
 * `isSameCharacter(a, b)` is true iff BOTH carry the SAME hero number AND
 *   (1) their display names are identical  — the strongest signal there is; a
 *       mesh or tint difference does NOT split such a pair, because the split
 *       is art variance (one entry got the real import, its twin a stand-in);
 *       e.g. 06 職業獵人-傑 富力士 = godie-ucrl (champ.thorne) + godie-u034
 *       (imported.herobiggon), and 18 妖狐藏馬-南野秀一 = godie-nsjs
 *       (imported.fox2) + godie-n00p (imported.fox); OR
 *   (2) they share a NAME COMPONENT (the map writes 稱號 - 角色名) AND wear the
 *       SAME mesh — the shared mesh is the corroborating evidence that turns a
 *       partial name match into a positive one. This is what collapses the
 *       re-worded twins: 09 超級賽亞人-悟空 / 賽亞人-悟空, 79 開外掛的死神 /
 *       外掛開很大的死神-黑崎一護, 81 魔砲少女 / 白色惡魔-高町奈葉, 90
 *       種子神奇寶貝-妙蛙種子 / -妙蛙花. Without the mesh check a shared
 *       component alone would wrongly merge the 25 拳四郎 and 58 皮卡丘 skins.
 *
 * @see tools/w3x-import/out/GoDieEX22s-src/HERO_NUMBERS.json — the importer's
 *      own record of hero numbers. The test cross-checks every champion doc
 *      against it (they agree on all 107 numbered champions today).
 */

/**
 * `NN-0X` / `NN-00X` ability-name prefix (task #11). The trailing `(?!\d)`
 * makes the 2-vs-3 digit index unambiguous and rejects anything longer.
 * NOTE some imported names have NO space after the prefix (`61-01惡魔球`), so
 * a separator must not be required.
 */
// Hero 編號 is 2 digits historically (00-99); the roster now also mints 3-digit
// numbers (owner directive: next id auto-fills the max, e.g. 喪標麥可 = 100). The
// "-" delimiter keeps "100-00" (hero 100) unambiguous from "10-000".
export const HERO_NUMBER_RE = /^(\d{2,3})-(\d{2,3})(?!\d)/;

/** Meshes whose key starts with this are the four shared CC0 stand-ins. */
const STAND_IN_MODEL_PREFIX = "champ.";

/** The minimal ability shape identity needs: its display name. */
export interface IdentityAbility {
  readonly name?: string | undefined;
}

/**
 * The minimal champion shape identity needs. Every field beyond `id`/`name` is
 * optional so callers with a partial view (the login marquee, an admin table)
 * can still ask — but note that omitting evidence can only ever make two
 * entries look MORE distinct, never less, which is the safe direction.
 */
export interface IdentityChampion {
  readonly id: string;
  /** Chinese combined 稱號 - 角色名 as shipped in the champion doc. */
  readonly name: string;
  /** `modelKey` from the champion doc; omit if unknown. */
  readonly modelKey?: string | null | undefined;
  /** Embedded Q/W/E/R abilities (any keyed record works). */
  readonly abilities?: Readonly<Record<string, IdentityAbility | undefined>> | undefined;
  /** Display name of the standalone EX ability, when the caller has it. */
  readonly exAbilityName?: string | null | undefined;
  /** Pre-resolved hero number, when the caller computed it elsewhere. */
  readonly heroNumber?: string | null | undefined;
}

/** A resolved character: one or more roster ids that are the SAME hero. */
export interface CharacterGroup {
  /** Stable key: `hero:NN` for a numbered character, else `id:<championId>`. */
  readonly key: string;
  /** The id to show/keep when only one entry may be rendered. */
  readonly canonicalId: string;
  /** Every roster id in the group, canonical first. */
  readonly ids: readonly string[];
  /** The shared hero number, or null for the numberless entries. */
  readonly heroNumber: string | null;
}

/** A hero number claimed by two or more DIFFERENT characters. */
export interface HeroNumberCollision {
  readonly heroNumber: string;
  /** One entry per distinct character sharing the number. */
  readonly characters: readonly CharacterGroup[];
  /**
   * `true` when the colliding entries at least share a name component — a
   * SKIN/VARIANT relationship (hero 25 拳四郎 and hero 58 皮卡丘 each exist on
   * two different meshes with two different 稱號). `false` is the harder case:
   * unrelated characters that merely carry the same 編號 because the map author
   * cloned a hero and never renumbered it (05, 53, 61, 91 — each pair literally
   * shares the same four ability rawcodes in the w3x). Either way the shipped
   * behaviour is identical — KEEP BOTH — the flag only helps a human triage.
   */
  readonly related: boolean;
}

/** `"20-01 風王結界"` → `"20"`; `null` when the name carries no valid prefix. */
export function heroNumberFromAbilityName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const m = HERO_NUMBER_RE.exec(name.trim());
  return m ? (m[1] ?? null) : null;
}

/**
 * The champion's hero 編號, or null when there is NO evidence.
 *
 * Returns null both when nothing parses AND when the abilities DISAGREE — a
 * champion whose kit mixes numbers is ambiguous, and per the governing policy
 * ambiguity means "cannot prove sameness", never "assume sameness".
 */
export function heroNumberOf(c: IdentityChampion): string | null {
  if (typeof c.heroNumber === "string") {
    return /^\d{2,3}$/.test(c.heroNumber) ? c.heroNumber : null;
  }
  const found = new Set<string>();
  for (const ability of Object.values(c.abilities ?? {})) {
    const n = heroNumberFromAbilityName(ability?.name);
    if (n !== null) found.add(n);
  }
  const ex = heroNumberFromAbilityName(c.exAbilityName);
  if (ex !== null) found.add(ex);
  return found.size === 1 ? (found.values().next().value ?? null) : null;
}

/** Trim + collapse internal whitespace so formatting never splits a pair. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * The map writes champion names as `稱號 - 角色名` (ASCII hyphen or a dash,
 * SPACE-DELIMITED). Split on that separator only — an unspaced hyphen is part
 * of the token itself (`英靈-亞瑟王 - 黑化Saber` → `英靈-亞瑟王`, `黑化Saber`).
 */
export function nameComponents(name: string): string[] {
  return normalizeName(name)
    .split(/\s+[-–—]\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/** True when the two names share at least one whole `稱號`/`角色名` component. */
export function sharesNameComponent(a: string, b: string): boolean {
  const left = new Set(nameComponents(a));
  return nameComponents(b).some((part) => left.has(part));
}

/** True when `modelKey` is one of the four shared CC0 stand-in meshes. */
export function isStandInModel(modelKey: string | null | undefined): boolean {
  return typeof modelKey === "string" && modelKey.startsWith(STAND_IN_MODEL_PREFIX);
}

/**
 * **The identity rule.** True only on positive, strong evidence that `a` and
 * `b` are the SAME character — see the file header for the full policy and the
 * asymmetric-cost rationale. Reflexive, symmetric, and (because every branch
 * requires an equal hero number) transitive within a number bucket.
 */
export function isSameCharacter(a: IdentityChampion, b: IdentityChampion): boolean {
  if (a.id === b.id) return true;

  // 1. No number on either side ⇒ no evidence ⇒ DISTINCT (never "both unknown,
  //    so probably the same"). This is what keeps godie-e00u / godie-u01f /
  //    godie-h02n / sela / thorne five separate heroes.
  const na = heroNumberOf(a);
  if (na === null) return false;
  const nb = heroNumberOf(b);
  if (nb === null) return false;

  // 2. Different 編號 ⇒ different character, full stop. THE 黑化Saber GUARD:
  //    e00q is 69, e002/e00l are 20, so no amount of shared mesh or shared
  //    portrait can ever collapse them.
  if (na !== nb) return false;

  // 3. Identical display name ⇒ same character, even across meshes/tints.
  if (normalizeName(a.name) === normalizeName(b.name)) return true;

  // 4. Re-worded twin: a shared name component AND the same mesh. Both halves
  //    are required — a shared component alone is a franchise relation
  //    (拳四郎, 皮卡丘), and a shared mesh alone is just missing art.
  if (
    typeof a.modelKey === "string" &&
    a.modelKey !== "" &&
    a.modelKey === b.modelKey &&
    sharesNameComponent(a.name, b.name)
  ) {
    return true;
  }

  // 5. Same number, nothing else in common → a source-data COLLISION. Keep
  //    both; `heroNumberCollisions()` surfaces it for a human.
  return false;
}

/**
 * The map's 78-entry random-hero pool (`zv[1..78]` in war3map.j), as champion
 * ids.
 *
 * ⚠️ THIS IS **NOT** AN IDENTITY SIGNAL, AND MUST NEVER BECOME ONE. Reading
 * "not in the pool ⇒ duplicate" is precisely how 黑化Saber (absent from the
 * pool, yet unquestionably its own character) got erased. Its ONLY use here is
 * to ORDER an already-established group: once two ids are proven to be one
 * character, the pool tells us which id the map itself actually plays, so the
 * canonical pick matches what a WC3 player would recognise.
 *
 * Source: tools/w3x-import/out/GoDieEX22s/parsed/random_pool.json
 */
export const RANDOM_HERO_POOL_IDS: ReadonlySet<string> = new Set([
  "godie-hart", "godie-hvwd", "godie-hlgr", "godie-hjai", "godie-hblm", "godie-ucrl",
  "godie-hpb1", "godie-nbbc", "godie-ogrh", "godie-udre", "godie-ewar", "godie-efur",
  "godie-etyr", "godie-emfr", "godie-nplh", "godie-ewrd", "godie-nsjs", "godie-e00k",
  "godie-e002", "godie-e008", "godie-e001", "godie-ntin", "godie-nbst", "godie-umal",
  "godie-harf", "godie-naka", "godie-huth", "godie-oshd", "godie-orkn", "godie-othr",
  "godie-opgh", "godie-obla", "godie-osam", "godie-hpal", "godie-ubal", "godie-uvng",
  "godie-u00h", "godie-nman", "godie-h001", "godie-n003", "godie-uwar", "godie-emns",
  "godie-edem", "godie-hvsh", "godie-usyl", "godie-hapm", "godie-o00l", "godie-n00b",
  "godie-ofar", "godie-e00r", "godie-h00l", "godie-u012", "godie-ecen", "godie-udea",
  "godie-e00t", "godie-e00s", "godie-u00k", "godie-ogld", "godie-u00j", "godie-u00n",
  "godie-e00w", "godie-u00v", "godie-h01n", "godie-h01u", "godie-o01z", "godie-h022",
  "godie-e00v", "godie-o00k", "godie-h02k", "godie-hgam", "godie-h02s", "godie-h02v",
  "godie-ekee", "godie-e015", "godie-e00j", "godie-o02w", "godie-n01l", "godie-o02p",
]);

/**
 * Ordering WITHIN a proven-identical group (never across groups): the id the
 * map plays wins, then a real imported mesh beats a CC0 stand-in, then the
 * lexicographically first id so the choice is deterministic.
 */
function canonicalRank(c: IdentityChampion): [number, number, string] {
  return [
    RANDOM_HERO_POOL_IDS.has(c.id) ? 0 : 1,
    isStandInModel(c.modelKey) ? 1 : 0,
    c.id,
  ];
}

/**
 * Comparator for "which of these entries should represent the character?".
 * Exported so a UI that must pick ONE row out of several (the login marquee's
 * shared-portrait pass) ranks them exactly the way identity does, instead of
 * inventing a second, divergent notion of "the canonical one".
 */
export function compareCanonical(a: IdentityChampion, b: IdentityChampion): number {
  const [ap, am, ai] = canonicalRank(a);
  const [bp, bm, bi] = canonicalRank(b);
  if (ap !== bp) return ap - bp;
  if (am !== bm) return am - bm;
  return ai < bi ? -1 : ai > bi ? 1 : 0;
}

function betterCanonical(a: IdentityChampion, b: IdentityChampion): IdentityChampion {
  return compareCanonical(a, b) <= 0 ? a : b;
}

/**
 * Partition a roster into distinct CHARACTERS. Entries are only ever unioned
 * when `isSameCharacter` says so, and only within one hero-number bucket, so
 * the result is stable regardless of input order. Groups come back in
 * first-appearance order; `ids` inside a group are canonical-first.
 */
export function groupCharacters(roster: readonly IdentityChampion[]): CharacterGroup[] {
  const buckets = new Map<string, IdentityChampion[][]>();
  const order: { key: string; members: IdentityChampion[] }[] = [];

  for (const champ of roster) {
    const num = heroNumberOf(champ);
    // Numberless entries can never join anything — one group each, keyed by id.
    if (num === null) {
      order.push({ key: `id:${champ.id}`, members: [champ] });
      continue;
    }
    const bucket = buckets.get(num) ?? [];
    const hit = bucket.find((members) => members.some((m) => isSameCharacter(m, champ)));
    if (hit) {
      hit.push(champ);
      continue;
    }
    const members = [champ];
    bucket.push(members);
    buckets.set(num, bucket);
    order.push({ key: `hero:${num}`, members });
  }

  return order.map(({ key, members }) => {
    const canonical = members.reduce(betterCanonical);
    return {
      key,
      canonicalId: canonical.id,
      ids: [canonical.id, ...members.filter((m) => m.id !== canonical.id).map((m) => m.id)],
      heroNumber: key.startsWith("hero:") ? key.slice(5) : null,
    };
  });
}

/** `championId → canonicalId of its character`. Every roster id is a key. */
export function characterKeys(roster: readonly IdentityChampion[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const group of groupCharacters(roster)) {
    for (const id of group.ids) out.set(id, group.canonicalId);
  }
  return out;
}

/**
 * The roster with duplicate ENTRIES of the same character removed — one row per
 * character, input order preserved. This is the ONLY sanctioned way to dedupe a
 * champion list; do not reintroduce name-, model- or icon-based heuristics.
 */
export function distinctCharacters<T extends IdentityChampion>(roster: readonly T[]): T[] {
  const keep = new Set(groupCharacters(roster).map((g) => g.canonicalId));
  return roster.filter((c) => keep.has(c.id));
}

/** True when both entries resolve to the same character within `roster`. */
export function sameCharacterInRoster(
  roster: readonly IdentityChampion[],
  a: string,
  b: string,
): boolean {
  const keys = characterKeys(roster);
  const ka = keys.get(a);
  return ka !== undefined && ka === keys.get(b);
}

/**
 * Hero numbers claimed by two or more DISTINCT characters — something to
 * REPORT, never to silently resolve. Every listed character stays playable;
 * see `HeroNumberCollision.related` for the two flavours.
 */
export function heroNumberCollisions(roster: readonly IdentityChampion[]): HeroNumberCollision[] {
  const names = new Map(roster.map((c) => [c.id, c.name]));
  const byNumber = new Map<string, CharacterGroup[]>();
  for (const group of groupCharacters(roster)) {
    if (group.heroNumber === null) continue;
    const list = byNumber.get(group.heroNumber) ?? [];
    list.push(group);
    byNumber.set(group.heroNumber, list);
  }
  return [...byNumber.entries()]
    .filter(([, groups]) => groups.length > 1)
    .map(([heroNumber, characters]) => ({
      heroNumber,
      characters,
      related: characters.some((a, i) =>
        characters
          .slice(i + 1)
          .some((b) =>
            sharesNameComponent(names.get(a.canonicalId) ?? "", names.get(b.canonicalId) ?? ""),
          ),
      ),
    }))
    .sort((a, b) => a.heroNumber.localeCompare(b.heroNumber));
}
