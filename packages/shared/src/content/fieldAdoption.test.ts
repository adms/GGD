/**
 * THE FIELD ADOPTION CENSUS — detection recipe **S8** as a standing CI guard.
 *
 * S8 (docs/_false-completions.md) is 「機制上線、內容 0 筆」: the schema, the sim
 * and the UI all ship, every test is green, and not one content document fills
 * the field — so the mechanism never happens in a match and nothing anywhere
 * says so. It is the quietest of the 27 false completions because there is no
 * error to find: the code is correct, it is simply never reached.
 *
 * WHAT MAKES THIS TEST WORTH KEEPING (and not just a restatement of the audit)
 * --------------------------------------------------------------------------
 * Both sides of the comparison are derived AT TEST TIME:
 *
 *   supply  ← `nameSchemas`/`register` walk the Zod schemas in ./schema
 *   demand  ← the real `content/` tree, loaded through the real loader
 *
 * Nothing below hard-codes what is currently wrong. A field is censused because
 * it EXISTS, on the commit that adds it — so the next S8, the one nobody has
 * thought of yet, fails this test the day it lands. The audit doc's own version
 * of the recipe was `grep -rl '"hitFeel"' content/ | wc -l`, and a grep can only
 * ever find what you already suspected.
 *
 * That is not a hypothetical distinction. Of the three zeroes the audit named:
 *   • `hitFeel` is now on 142 ability docs and 112 champion docs,
 *   • champion weapon tags are on 33 of 113 champions (katana 20, sword 8,
 *     greatsword 3, gun 1, bow 1 — so `attackKatana`/`attackGreatsword`/
 *     `gunshot` are all reachable now),
 *   • `evasion` reached content DURING the writing of this file (7 docs).
 * A test that asserted the audit's findings would have been wrong within hours.
 * This one recomputes them and reports whatever is true today.
 *
 * WHAT IT ASSERTS
 * ---------------
 *  1. Every registered, reachable, sufficiently-sampled key has at least one
 *     content doc using it — or a documented exemption saying why not.
 *  2. No exemption is STALE. An exemption whose key has since been adopted is
 *     a hard failure, because a permanently-true exemption list is how the
 *     guard rots into a rubber stamp (same discipline as
 *     apps/game-server/src/net/eventFanout.test.ts).
 *  3. No `landing` grace has expired. See THE NEW-FIELD PROBLEM below.
 *  4. The census actually measured the whole tree (guard the guard).
 *
 * THE NEW-FIELD PROBLEM
 * ---------------------
 * A brand-new field is legitimately at zero on the day it lands — the schema
 * change and the content migration are usually two commits, often two people.
 * Failing that is how a guard gets disabled. But "it's new" with no expiry is
 * how a guard gets useless: every S8 in the audit doc was new once.
 *
 * The answer here is a BOUNDED, SELF-EXPIRING grace: status `"landing"` with a
 * `since` date. It suppresses the failure for `GRACE_DAYS`, and then the test
 * fails and names the entry. The clock does the follow-up nobody remembers to
 * do. Deliberately not `"debt"`, which never expires but is printed as a loud
 * banner on every single run — a debt you have to look at is a debt you might
 * pay; a debt that is silent is the pathology itself.
 *
 * WHAT THIS DOES NOT CATCH (stated so nobody mistakes green for coverage)
 * ----------------------------------------------------------------------
 *  • ADOPTION > 0 BUT MEANINGLESS. One doc setting a field is enough to make
 *    this test green. `craftRole: "service"` on 2 of 214 items passes here; if
 *    that is too few to matter, that is a balance/curation question and needs
 *    its own guard. This test answers exactly one question: is it ZERO.
 *  • SMALL SAMPLES. `MIN_REACH` (3) mutes every `config@1` singleton and any
 *    container present in fewer than 3 docs — `projectiles.meshShape`'s `orb`
 *    and `shard`, the `gore.style` options, the per-hook `abilitySlot` filter.
 *    A dead option inside a one-doc container will not be reported.
 *  • REQUIRED FIELDS. Present in 100 % of docs by construction, so they cannot
 *    be an S8 — but a required field the SIM never reads is a different
 *    pathology this does not look for.
 *  • CURATION. A field adopted only by docs outside the operator's whitelist
 *    still counts as adopted. Whether the whitelist reaches it is P0-2's
 *    question, not this one.
 *  • FREE-TEXT VOCABULARIES the code reads out of `string[]` fields are only
 *    censused when declared in `TAG_VOCABULARIES`. `weaponClass` is declared;
 *    a future `if (tags.includes("…"))` in some system is invisible until
 *    someone adds it there. This is the one place the guard needs a human.
 *  • THE OTHER DIRECTION. Content that sets a field NO code reads (the mirror
 *    pathology) is not this test — see the `onLevelUp` note in EXEMPTIONS,
 *    which this census found only because the member also had zero adoption.
 *
 * COST: one `ContentLoader` pass over the real tree (~1450 docs) plus a paired
 * schema/value walk. Measured ~1.4 s wall for the load and ~90 ms for the
 * census itself on an M-series laptop — the same order as
 * castTimeCoverage.test.ts, which loads the identical tree. Cheap enough to
 * run on every commit; that is the point of it existing at all.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import {
  censusAdoption,
  formatCensus,
  unadopted,
  MIN_REACH,
  TAG_VOCABULARIES,
  type Census,
} from "./fieldAdoption";
import type { ContentStore } from "./store";
import { ALL_STATS } from "../sim/stats/statTypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../../..");
const CONTENT_DIR = join(REPO_ROOT, "content");

/**
 * How long a `"landing"` exemption may suppress a failure. 30 days is roughly
 * "the schema commit and the content commit are in the same月", and short
 * enough that a forgotten migration surfaces while the author still remembers
 * writing it.
 */
export const GRACE_DAYS = 30;

type ExemptionStatus =
  /** the behaviour ships from a CODE DEFAULT; the field only overrides it, so
   *  zero adoption means "nobody needed to override", not "mechanism dead". */
  | "default-live"
  /** the field is filled by code that SYNTHESIZES docs at runtime, so it can be
   *  live in a match while no doc on disk carries it. */
  | "runtime-authored"
  /** content CANNOT legally set it here — another schema rule forbids it. */
  | "schema-impossible"
  /** a dead field kept for compatibility; adopting it would be the bug. */
  | "superseded"
  /**
   * ⭐ 2026-08-13 —— the mechanism HAS content, and that content is sitting in
   * `content/_legacy/`. owner 2026-08-13 pulled 41 champions + 236 abilities out
   * of the operating tree («沒開放的英雄…預設不要再被讀取到了»), so a handful of
   * keys went to zero WITHOUT anything being new, broken, or defaulted.
   *
   * None of the other five statuses tells that truth: it is not `debt` (nothing
   * is broken — the doc is authored and correct), not `landing` (no migration is
   * in flight, and a 30-day alarm can only be cleared by inventing content
   * nobody asked for), and certainly not `default-live` (there is no code
   * default covering for the zero — the mechanism genuinely does not happen in
   * any shipped match right now).
   *
   * ⛔ It is NOT a free pass. Every entry must name a `witness` — the legacy doc
   * that adopts the key — and the well-formedness test below opens that file.
   * So the exemption dies the moment its evidence does, and the STALE test above
   * kills it the moment the champion is brought back into the roster.
   */
  | "legacy-parked"
  /** a REAL S8. Never expires, but is printed as a loud banner every run. */
  | "debt"
  /** brand new; adoption expected. EXPIRES after GRACE_DAYS — see above. */
  | "landing";

interface Exemption {
  readonly status: ExemptionStatus;
  /**
   * ⭐ GH#626 ② —— 原本是 TS 裡的**分節註解**（`// ── 2026-08-30 這一輪…`）。
   * 搬進 JSON 時 comment 會消失，⇒ 把它變成一個欄位，⛔ 不是丟掉。
   */
  readonly group?: string;
  /** why zero is acceptable, or (for `debt`) what is actually broken. */
  readonly why: string;
  /** ISO date. Required for `landing`; the grace counts from here. */
  readonly since?: string;
  /**
   * Required for `legacy-parked`: a repo-relative path under `content/_legacy/`
   * holding a doc that DOES adopt this key. Checked on disk, not trusted as
   * prose — see the well-formedness test.
   */
  readonly witness?: string;
}

/**
 * ===========================================================================
 * THE EXEMPTION LIST — every key the census reports at zero, with a reason.
 * ===========================================================================
 *
 * RULES OF THE ROAD
 *   • A key here must currently be at zero. If it gets adopted, this test goes
 *     red and the entry must be DELETED (test 2). That is the whole reason the
 *     list cannot quietly grow into a rubber stamp.
 *   • Never add a key to silence a failure you have not understood. The three
 *     honest outcomes are: fix the content, mark it `debt` with what is
 *     actually broken, or mark it `landing` and finish the migration.
 *   • The `why` is for a reader six months from now who has never seen the
 *     field. "not used" is not a reason.
 *
 * Sorted by key, matching the census output order.
 */
/**
 * ⭐⭐ GH#626 ② —— 豁免表**搬進 JSON**（在此之前它是 3,045 行資料穿著測試的衣服）。
 *
 * owner 2026-08-23（第〇·七守則的第二個觸發器，逐字）：
 * > 「另外一個優化拆分指標叫**撞車次數超過 10 次的重災區**
 * >  （多個 agent 工作流同時要存取修改的次數）」
 *
 * ⭐ 量到的：這個檔在 14 天內被動了 **77 次 —— 全 repo 第一名**。
 * ⛔ 而它不是「多職責」也不是「重複」病：它是**一份資料的唯一住處是一個測試檔**
 *（第〇·四守則的反例）⇒ 每條 lane 加一個欄位就要在這裡加一列 ⇒ 最高撞車率是必然的。
 *
 * ⭐ **分節註解沒有消失**：原本的 `// ── 2026-08-30 這一輪…` 那一族被搬成每一筆的
 * `group` 欄（332/336 筆有）—— ⛔ 「測試可以跟著設計走，知識不可以無聲消失」。
 *
 * ⚠️ ⭐ 這份 JSON **不是 `content/` 的出貨內容**，它是 ops 資料：
 * ⛔ 不進 bundle、⛔ 沒有 schema tag、⛔ 不被 `content:build` 掃到。
 * 它與這支測試同目錄，⭐ 就是為了讓「加一列豁免」不再需要碰一個 3,500 行的檔。
 */
import EXEMPTIONS_JSON from "./fieldAdoption.exemptions.json" with { type: "json" };

const EXEMPTIONS: Readonly<Record<string, Exemption>> = EXEMPTIONS_JSON as Readonly<
  Record<string, Exemption>
>;

let census: Census;
let store: ContentStore;

beforeAll(async () => {
  const result = await new ContentLoader(shippedContentSource(CONTENT_DIR)).load();
  store = result.store;
  census = censusAdoption(store);
}, 60_000);

/** Days between an ISO date and now, floored. */
function daysSince(iso: string, now: number): number {
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}

/** Entries whose `landing` grace has run out at `now`. */
function expiredGraces(now: number): string[] {
  return Object.entries(EXEMPTIONS)
    .filter(([, e]) => e.status === "landing")
    .filter(([, e]) => e.since === undefined || daysSince(e.since, now) > GRACE_DAYS)
    .map(([k]) => k);
}

describe("field adoption census (recipe S8: mechanism shipped, content 0)", () => {
  it("prints the census — this is the owner-facing report", () => {
    // Always emitted, pass or fail. The numbers ARE the deliverable: which
    // mechanisms content actually reaches, and how hard.
    // eslint-disable-next-line no-console
    console.log("\n" + formatCensus(census) + "\n");

    const debts = Object.entries(EXEMPTIONS).filter(([, e]) => e.status === "debt");
    if (debts.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        [
          `\n  ${"═".repeat(74)}`,
          `  KNOWN DEAD MECHANISMS — ${debts.length} registered features that never happen in a match.`,
          `  These are ACCEPTED FAILURES, not passing checks. They print every run on purpose.`,
          `  ${"═".repeat(74)}`,
          ...debts.map(([k, e]) => `   • ${k}\n     ${e.why}`),
          "",
        ].join("\n"),
      );
    }
    expect(census.rows.length).toBeGreaterThan(0);
  });

  it("every registered field / Stat / enum member / effect kind is adopted, or exempted", () => {
    const zeroes = unadopted(census);
    const unexplained = zeroes.filter((r) => EXEMPTIONS[r.key] === undefined);

    const message =
      unexplained.length === 0
        ? ""
        : [
            "",
            "S8 — A REGISTERED MECHANISM WITH ZERO CONTENT ADOPTION.",
            "",
            "These keys are offered by the schemas (or by a code vocabulary) and NOT ONE",
            "content document uses them. Nothing will error; the feature simply never",
            "happens in a match. That is exactly the shape docs/_false-completions.md",
            "catalogues as S8, and it is why this test exists.",
            "",
            ...unexplained.map(
              (r) => `  ${r.key}\n      0 of ${r.reach} docs that could have used it`,
            ),
            "",
            "THREE WAYS TO RESOLVE THIS — pick one deliberately:",
            "",
            "  1. AUTHOR THE CONTENT. Usually the right answer. Editing one doc in",
            "     content/ is enough to turn the row green, and that one doc is proof the",
            "     path works end to end.",
            "",
            "  2. IT IS NEW — add it to EXEMPTIONS in this file with",
            `     { status: "landing", since: "<today, ISO>", why: "…" }.`,
            `     That suppresses the failure for ${GRACE_DAYS} days and then fails again,`,
            "     so the migration cannot be forgotten.",
            "",
            "  3. ZERO IS CORRECT AND PERMANENT — add it to EXEMPTIONS with the status",
            `     that says WHY: "default-live" (the behaviour ships from a code default`,
            `     and the field only overrides it), "runtime-authored" (code synthesizes`,
            `     the doc), "schema-impossible" (another rule forbids setting it here),`,
            `     "superseded" (dead field kept for compat), "legacy-parked" (the only`,
            `     doc that adopts it moved to content/_legacy/ — name it as \`witness\`),`,
            `     or "debt" (it IS broken,`,
            "     you are recording it rather than fixing it now — debts print as a loud",
            "     banner on every run).",
            "",
            "Do NOT delete the field, the Stat, or the enum member just to make this",
            "pass unless you actually mean to remove the mechanism.",
            "",
          ].join("\n");

    expect(unexplained.map((r) => r.key), message).toEqual([]);
  });

  it("no exemption is STALE — an adopted key must lose its exemption", () => {
    // The self-cleaning half. Without it the list only ever grows, and a list
    // that is always true is a list nobody reads.
    const zeroKeys = new Set(unadopted(census).map((r) => r.key));
    const byKey = new Map(census.rows.map((r) => [r.key, r]));
    const stale = Object.keys(EXEMPTIONS).filter((k) => !zeroKeys.has(k));

    const message = [
      "",
      "STALE EXEMPTION(S) — these keys are no longer at zero, so their entries in",
      "EXEMPTIONS (packages/shared/src/content/fieldAdoption.test.ts) are now lies.",
      "DELETE the listed entries; that is the entire fix.",
      "",
      ...stale.map((k) => {
        const r = byKey.get(k);
        if (r === undefined) {
          return `  ${k}\n      no longer a registered key at all — the schema changed under it`;
        }
        if (r.reach < MIN_REACH) {
          return `  ${k}\n      reach fell to ${r.reach} (< MIN_REACH ${MIN_REACH}); the census no longer claims anything about it`;
        }
        return `  ${k}\n      now adopted by ${r.docs} doc(s), e.g. ${r.examples.join(", ")}`;
      }),
      "",
    ].join("\n");

    expect(stale, message).toEqual([]);
  });

  it("no `landing` grace has expired — a new field cannot stay new forever", () => {
    const expired = expiredGraces(Date.now());
    expect(
      expired,
      `\nThese exemptions were filed as "landing" (brand-new field, adoption imminent)\n` +
        `and are now older than ${GRACE_DAYS} days. Either finish the content migration,\n` +
        `or re-file them with an honest status — "debt" if the migration is not going to\n` +
        `happen soon, which at least keeps them visible in the banner every run.\n` +
        expired.map((k) => `  ${k}`).join("\n") +
        "\n",
    ).toEqual([]);
  });

  it("the grace really does expire (the mechanism, not today's data)", () => {
    // Exercised on synthetic entries so the assertion holds no matter what the
    // EXEMPTIONS table contains — otherwise this logic would be dead code the
    // day the table has no `landing` rows, which is most days.
    const now = Date.parse("2026-07-24T00:00:00Z");
    expect(daysSince("2026-07-24T00:00:00Z", now)).toBe(0);
    expect(daysSince("2026-06-24T00:00:00Z", now)).toBe(30);
    expect(daysSince("2026-06-23T00:00:00Z", now)).toBe(31);
    // …and a `landing` entry with no `since` is expired on sight, so it cannot
    // be used as an unbounded silencer.
    expect(daysSince("2026-06-23T00:00:00Z", now) > GRACE_DAYS).toBe(true);
    expect(daysSince("2026-06-24T00:00:00Z", now) > GRACE_DAYS).toBe(false);
  });

  it("every exemption is well-formed: a status, a real reason, and a date when required", () => {
    const bad: string[] = [];
    for (const [key, e] of Object.entries(EXEMPTIONS)) {
      if (!/^(field|enum|variant|tag):/.test(key)) bad.push(`${key}: not a census key`);
      // A reason short enough to be "n/a" is not a reason. This is the rule
      // that stops the list degrading into a list of keys.
      if (e.why.trim().length < 40) bad.push(`${key}: why is too short to be a reason`);
      if (e.status === "landing" && e.since === undefined) bad.push(`${key}: landing needs since`);
      if (e.since !== undefined && Number.isNaN(Date.parse(e.since))) {
        bad.push(`${key}: since is not a date`);
      }
      // ⭐ `legacy-parked` is the one status that claims a FACT about another
      // file ("the adopter is parked in content/_legacy/"), so it is the one
      // status that can be checked instead of believed. Open the witness and
      // look for the doc. A witness that vanished (deleted, or restored into the
      // operating roster) makes the exemption a lie, and this goes red before
      // anyone has to notice the census row.
      if (e.status === "legacy-parked") {
        if (e.witness === undefined) {
          bad.push(`${key}: legacy-parked needs a witness doc under content/_legacy/`);
        } else if (!e.witness.startsWith("content/_legacy/")) {
          bad.push(`${key}: witness ${e.witness} is not under content/_legacy/`);
        } else if (!existsSync(join(REPO_ROOT, e.witness))) {
          bad.push(`${key}: witness ${e.witness} does not exist — the exemption's evidence is gone`);
        } else {
          // …and the witness must actually MENTION the thing. A cheap textual
          // check on purpose: it costs one read and it is the difference between
          // "a path that resolves" and "a doc that adopts the key".
          const needle = key.slice(key.lastIndexOf(key.includes("=") ? "=" : ".") + 1);
          const text = readFileSync(join(REPO_ROOT, e.witness), "utf8");
          if (!text.includes(needle)) {
            bad.push(`${key}: witness ${e.witness} never mentions "${needle}"`);
          }
        }
      }
      if (e.status !== "legacy-parked" && e.witness !== undefined) {
        bad.push(`${key}: witness only means something for legacy-parked`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("GUARD THE GUARD: the census measured the whole tree, not three documents", () => {
    // Every assertion above is vacuously true against an empty census. These
    // are the numbers that make a green run mean something. They are floors,
    // not pins, so authoring content never breaks them.
    expect(census.totalDocs).toBeGreaterThan(1400);
    expect(census.rows.length).toBeGreaterThan(250);

    const kinds = new Set(census.rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["enum", "field", "tag", "variant"]);

    // The four things the recipe names must each be genuinely reachable, or a
    // refactor could silently stop censusing one of them and still pass.
    const reachable = census.rows.filter((r) => r.reach >= MIN_REACH);
    expect(reachable.filter((r) => r.kind === "field").length).toBeGreaterThan(80);
    expect(reachable.filter((r) => r.kind === "enum").length).toBeGreaterThan(60);
    expect(reachable.filter((r) => r.kind === "variant").length).toBeGreaterThan(10);
    expect(reachable.filter((r) => r.kind === "tag").length).toBe(
      TAG_VOCABULARIES.reduce((n, v) => n + v.members.length, 0),
    );

    // Stats arrive through zStat as a nativeEnum; if that walk ever breaks,
    // "a Stat nothing references" stops being detectable and this test would
    // pass for the wrong reason. Counted against ALL_STATS rather than a
    // literal, so adding a Stat cannot quietly fall outside the census.
    //
    // ⚠️ THE SEGMENT IS `*`, NOT `stat`, AND THIS GUARD ONCE FAILED SILENTLY
    // BECAUSE OF IT. `zStatModifier` grew `from: zStat.optional()` on
    // 2026-07-31 (ModOp.PercentOf needs to name the stat the percentage is
    // taken OF). `unwrap()` strips the `.optional()`, so `stat` and `from` now
    // resolve to the SAME zStat instance, and the walker's sibling-collapse
    // renames BOTH segments to `*` (fieldAdoption.ts:256). The 16 rows are all
    // still there — only their key changed — but the old `"].stat="` filter
    // matched NOTHING, so `statRows` went empty and every assertion below it
    // became vacuous. That is this guard's own failure mode, caught by itself.
    //
    // ⚠️ AND IT HAPPENED A SECOND TIME ON 2026-08-10, FOR A DIFFERENT REASON —
    // which is why the site is no longer written down anywhere. `applyBuff`
    // grew `maxStat: { stat: zStat, … }` (S4b, the absolute stat ceiling). The
    // walker names each schema INSTANCE at exactly one path and prefers the
    // lexicographically smaller one (fieldAdoption.ts:238), and
    // `applyBuff.maxStat.stat` sorts before `applyBuff.modifiers[].*` — so all
    // 16 rows moved to the new field's path. Nothing about the census broke
    // (the rows are instance-anchored: `docs`/`reach` still count every
    // occurrence anywhere), but a hard-coded prefix pointed at a site that no
    // longer holds them. The general lesson: ANY new field that reuses an
    // existing zod instance can relocate that instance's rows, so a literal
    // path in this file is a guard with an expiry date.
    //
    // So the site is DISCOVERED, not asserted: find the enum site that carries
    // the complete Stat set. That excludes the narrower stat enums on the
    // CONDITION path (`condition|0|1|1.stat`, a 10-member subset) by counting
    // rather than by prefix, and the `.op=` rows by membership in ALL_STATS
    // (flat/pctAdd/… are not Stats). It fails, loudly, exactly when it should:
    // when no site in the whole census enumerates every Stat.
    const isStat = new Set<string>(ALL_STATS);
    const statSites = new Map<string, Set<string>>();
    for (const r of census.rows) {
      if (r.kind !== "enum") continue;
      const cut = r.key.lastIndexOf("=");
      const value = r.key.slice(cut + 1);
      if (!isStat.has(value)) continue;
      const site = r.key.slice(0, cut);
      let vals = statSites.get(site);
      if (!vals) statSites.set(site, (vals = new Set()));
      vals.add(value);
    }
    const fullSites = [...statSites].filter(([, vals]) => vals.size === ALL_STATS.length);
    expect(
      fullSites.map(([site]) => site),
      `no census site enumerates all ${ALL_STATS.length} Stats — the zStat walk broke, ` +
        `so "a Stat nothing references" is no longer detectable. Sites seen: ` +
        [...statSites].map(([s, v]) => `${s} (${v.size})`).join(", "),
    ).not.toEqual([]);
    // `evasion` is the canary: it was the audit's headline zero, and it landed
    // in content while this file was being written. The row must EXIST; this
    // test deliberately does not assert what its count is.
    expect(fullSites.every(([, vals]) => vals.has("evasion"))).toBe(true);
  });

  it("THE CASCADE RULE: a child of an unadopted container is not an independent finding", () => {
    // hitFeel has ten optional children. If `hitFeel` itself were unset the
    // report would name eleven problems that are one problem. Anything with
    // reach 0 is suppressed, so adopting the parent is what makes the children
    // visible — one finding at a time, outermost first.
    const suppressed = census.rows.filter((r) => r.reach === 0);
    for (const r of suppressed) expect(r.docs).toBe(0);
    // There must actually BE some, or this rule is untested. Today's example
    // is everything under `passive.ranks[].auras`, whose container has zero
    // adoption: the aura's own radius/affects/lingerSec are ONE finding, not
    // four. Adopting the container is what makes its children visible.
    expect(suppressed.length).toBeGreaterThan(0);
    // Suppressed rows appear in neither the report nor the failure set.
    const report = formatCensus(census);
    const zeroKeys = new Set(unadopted(census).map((r) => r.key));
    for (const r of suppressed) {
      expect(report, `${r.key} should be cascade-suppressed`).not.toContain(r.key);
      expect(zeroKeys.has(r.key), `${r.key} must not be a reported failure`).toBe(false);
    }
  });

  it("the census is deterministic — same store, same rows, same order", () => {
    // Key stability is what lets EXEMPTIONS be written down at all. The schema
    // naming walk picks shortest-path names with a lexicographic tiebreak, so a
    // second pass over the same store must reproduce the keys byte for byte.
    // (A Map-iteration-order dependency here would make the exemption list
    // flap between runs, which is worse than having no guard.)
    const again = censusAdoption(store);
    expect(again.rows.map((r) => `${r.key}:${r.docs}:${r.reach}`)).toEqual(
      census.rows.map((r) => `${r.key}:${r.docs}:${r.reach}`),
    );
  });
});
