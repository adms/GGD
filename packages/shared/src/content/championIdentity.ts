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
 * ---------------------------------------------------------------------------
 * THE ONE EXCEPTION — w3x `Eme1`/`Emeu` EVIDENCE (owner ruling, 2026-07-26)
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE ADDING A SECOND ONE. THE LENIENT DEFAULT ABOVE IS UNCHANGED.
 *
 * The 2026-07-22 ruling 「疑慮一律判斷寬鬆為多英雄」 is about DOUBT. Task #249 took
 * the doubt away for exactly 26 pairs: the source map's ability table carries
 * the WC3 Metamorphosis field pair `Eme1` (normal-form unit) / `Emeu`
 * (alternate-form unit), which is the map author STATING, in data, that two
 * unit definitions are two bodies of one hero. That is not a resemblance and
 * not an inference — it is the same class of first-party evidence as the hero
 * 編號 itself. The owner ruled: where that evidence exists, it WINS.
 *
 * Three pins in this file's test suite were overturned by that ruling — heroes
 * 25 (拳四郎), 58 (皮卡丘) and 61 (克勞薩) had been recorded as hero-number
 * COLLISIONS with `sameCharacter() === false`, on the strength of differing
 * 稱號 and differing meshes. The w3x says otherwise in all three cases:
 *   25  A0HW 25-04 ChangeDNA        UMAL 北斗神拳掌門人 ⇄ U00L 北斗之鼠
 *   58  A040 58-04 瘋狂皮卡丘        OFAR 神奇寶貝兒     ⇄ O02L 神騎寶貝
 *   61  Aphx 61-00 百連我殺 效果      U012 克勞薩II世     ⇄ U011 克勞薩先生
 *
 * THE EXCEPTION IS A CLOSED TABLE, NOT A PRINCIPLE. It reads exactly one
 * source — `championForms.ts`'s 26 pairs, generated from the map by
 * `tools/w3x-import/extract_transform_forms.py` and pinned against that fixture
 * — and it can only ever fire for an id that appears in it. It is NOT licence
 * to merge lookalikes:
 *   • no `Eme1`/`Emeu` pair ⇒ the lenient default applies, unchanged. 05
 *     (賈修貝爾/阿強一號), 53 (傑洛士/涼宮八ㄦ匕) and 91 (死亡騎士/不良少年) carry no
 *     transform evidence and therefore STAY two heroes each;
 *   • it never crosses a hero number (the check runs AFTER the 編號 guard), so
 *     it can never resurrect the 黑化Saber bug — e00q is 69, e002 is 20;
 *   • "they look alike", "they share a mesh", "they share a portrait" and "the
 *     name is nearly the same" remain non-evidence. If you want to merge a pair
 *     that is not in the w3x table, that is a NEW owner ruling, not this one.
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
 * @see ./championForms.ts — the 26 `Eme1`/`Emeu` pairs the exception reads.
 */
import { baseFormIdOf, isAlternateForm, isW3xFormPair } from "./championForms";
import { STAND_IN_MODEL_KEYS } from "./voxelSkin/types";

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

/**
 * ⭐⭐ 2026-09-02（GH#933）—— **這裡本來是一條前綴 `"champ."`，而它比它自己的
 * 註解寬**：那句註解逐字寫著「the **four** shared CC0 stand-ins」，
 * ⛔ 而前綴同時吃進了 `champ.godie-zombiex` —— 那是**殭屍王自己的**網格，
 * ⛔ 不是共用替身。⇒ 對外契約 `resolved-appearance@1.isStandIn` 因此對它說謊
 * （外部編輯器被告知「這是共用替身，預覽可能不對」，而那顆就是它本人）。
 *
 * ⭐ 客戶端那一份（`apps/client/.../champselect/standIn.ts`）**早就修對了**，
 * 而且檔頭寫下了理由：「Two lists mean a fifth fallback added to the content
 * makes the renderer switch bodies while this badge stays silent」。
 * ⇒ ⭐ 共用這一份改成讀**同一張表**，⛔ 不再有第二套判準。
 */

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
  return typeof modelKey === "string" && STAND_IN_MODEL_KEYS.includes(modelKey);
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

  // 2b. THE ONE EXCEPTION (owner ruling 2026-07-26) — the source map's WC3
  //     Metamorphosis fields `Eme1`/`Emeu` name these two ids as the two BODIES
  //     of one hero, so the evidence wins over the lenient default. Closed
  //     table of 26 pairs (championForms.ts); runs AFTER the 編號 guard so it
  //     can never merge across hero numbers. Absent such evidence nothing
  //     changes — see the file header before extending this.
  if (isW3xFormPair(a.id, b.id)) return true;

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
 * Ordering WITHIN a proven-identical group (never across groups):
 *   0. a BASE form beats an ALTERNATE form. An alternate body is not a hero a
 *      player may pick (owner ruling 2026-07-26 —「換成本體，變身態改由技能觸發」),
 *      so it must never end up as the id that REPRESENTS the character. This
 *      key is first precisely because the other three are all weaker signals:
 *      the random-hero pool happens to list the base in every one of today's
 *      26 pairs, but that is a coincidence of the map's own pick list, not a
 *      rule, and relying on it is what let 妙蛙花 sit on the roster;
 *   1. then the id the map itself plays (the random-hero pool);
 *   2. then a real imported mesh over a CC0 stand-in;
 *   3. then the lexicographically first id, so the choice is deterministic.
 */
function canonicalRank(c: IdentityChampion): [number, number, number, string] {
  return [
    isAlternateForm(c.id) ? 1 : 0,
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
  const [af, ap, am, ai] = canonicalRank(a);
  const [bf, bp, bm, bi] = canonicalRank(b);
  if (af !== bf) return af - bf;
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
 *
 * WHAT A base+alt PAIR COUNTS AS (task #249). A transform pair is ONE
 * character, and the row that survives is always the BASE — the alternate is
 * the same hero's transformed body, not a second hero and not a skin. So the
 * count this returns is "how many heroes are there", and a 26-pair map
 * contributes 26 rows, not 52. The three pairs the owner overturned on
 * 2026-07-26 (25 拳四郎, 58 皮卡丘, 61 克勞薩) moved from two rows to one each,
 * which is the whole point: the roster count is now honest about the fact that
 * 北斗之鼠 is 拳四郎 mid-transform rather than a hero anyone can pick.
 */
export function distinctCharacters<T extends IdentityChampion>(roster: readonly T[]): T[] {
  const keep = new Set(groupCharacters(roster).map((g) => g.canonicalId));
  return roster.filter((c) => keep.has(c.id));
}

/**
 * The roster entries that are TRANSFORMED BODIES, not pickable heroes — the ids
 * the w3x `Emeu` field names (see `championForms.ts`).
 *
 * Exported so every surface asks the SAME question instead of each inventing
 * its own test. `starter.go`'s roster gate, the login marquee and any future
 * champ-select filter all mean this and only this; in particular none of them
 * should ever go back to reading a shared portrait or a shared mesh, both of
 * which have already produced the wrong answer here.
 */
export function alternateForms<T extends IdentityChampion>(roster: readonly T[]): T[] {
  return roster.filter((c) => isAlternateForm(c.id));
}

/**
 * `id`'s BASE form when `id` is a transformed body, otherwise `id` itself.
 * Re-exported from `championForms` so callers that already depend on identity
 * do not need a second import to answer "which id should I actually ship?".
 */
export const baseFormOf = baseFormIdOf;

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
