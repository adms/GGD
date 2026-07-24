/**
 * THE ANTI-SILENT-FAILURE GATE for the MSG.EVENT wire (audit class S2).
 *
 * `FANNED_OUT_EVENT_TYPES` is a hard allowlist and the ONLY path from the sim to
 * a socket, so an event missing from it fails SILENTLY: the sim emits, the client
 * has a handler, nothing errors, and the feature simply never happens in a real
 * match. Nine events across eight features sat "complete, tested and shipping"
 * that way for months (docs/_false-completions.md).
 *
 * The guard is: EVERY `world.emit("x", …)` in packages/shared/src/sim must be in
 * EXACTLY ONE of the two sets in `eventFanout.ts` — fanned out (with a stated
 * consumer) or explicitly server-only (with a stated reason).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE IS PARANOID ABOUT ITS OWN SCRAPE
 *
 * A guard built on a source scrape has the SAME failure mode as the thing it
 * guards: if the scrape silently matches nothing, the test passes and nobody
 * learns anything. A green tick then actively certifies a lie. So the scrape is
 * not trusted — it is bounded from both ends:
 *
 *   • it must find emit sites at all, and roughly the number the sim has;
 *   • EVERY `.emit(` call site in the sim must resolve to a string literal. A
 *     `world.emit(name, …)` computed at runtime is invisible to any scrape, so
 *     it is rejected outright rather than skipped (see "the two blind spots");
 *   • EVERY `.emit(` receiver must be `world`. A second emitter appearing in the
 *     sim goes red so somebody decides whether its events need classifying,
 *     instead of it quietly falling outside the guard's field of view.
 *
 * The scrape is comment-stripped and whole-file (not line-by-line) so that
 * neither a doc comment mentioning `world.emit("foo")` nor a multi-line
 * `world.emit(\n  "foo",\n  …)` can fool it — the first would invent a phantom
 * event, the second would hide a real one.
 *
 * Ground truth is re-derived on every run from the sim sources and from
 * `eventFanout.ts`. Nothing about today's answer is hard-coded, so this goes red
 * on the NEXT event nobody has thought of yet, not just the nine already found.
 *
 * COST: reads 61 files / ~10.5k lines under packages/shared/src/sim once per
 * run, no sim construction and no I/O beyond that — single-digit milliseconds.
 * Cheap enough to stay in the default `pnpm -r test` path, which is what CI runs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FANNED_OUT_EVENT_TYPES, SERVER_ONLY_EVENT_TYPES, isFannedOutEvent } from "./eventFanout";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const SIM_DIR = join(REPO, "packages/shared/src/sim");
const FANOUT_FILE = join(HERE, "eventFanout.ts");

/** Repo-relative, so a failure message can be pasted straight into an editor. */
const rel = (p: string): string => relative(REPO, p);

/** Every `.ts` under packages/shared/src/sim, excluding tests. */
function simSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) simSources(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/**
 * Replace every comment with spaces, preserving length and newlines so byte
 * offsets still map to the original line numbers.
 *
 * Done with a real string/comment state machine rather than a regex: the sim is
 * full of string literals containing `//` (asset paths) and of doc comments
 * containing `world.emit("x")`, and a regex cannot tell those apart from code.
 */
function blankComments(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") out[i++] = " ";
    } else if (c === "/" && d === "*") {
      out[i++] = " ";
      out[i++] = " ";
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < n) {
        out[i++] = " ";
        out[i++] = " ";
      }
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join("");
}

const lineOf = (text: string, index: number): number =>
  text.slice(0, index).split("\n").length;

interface EmitSite {
  /** The event name, or null when the call site's name is not a literal. */
  readonly type: string | null;
  /** The receiver, e.g. `world` in `world.emit(...)`. */
  readonly receiver: string;
  readonly where: string;
}

/**
 * Every `<receiver>.emit(` call site in the sim, whether or not its event name
 * could be resolved. Callers assert on the unresolved ones rather than dropping
 * them — an invisible emit is exactly the bug class this file exists to catch.
 */
function emitSites(): EmitSite[] {
  const sites: EmitSite[] = [];
  for (const file of simSources(SIM_DIR)) {
    const raw = readFileSync(file, "utf8");
    const code = blankComments(raw);
    const call = /([A-Za-z_$][\w$]*)\s*\.emit\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = call.exec(code)) !== null) {
      const where = `${rel(file)}:${lineOf(code, m.index)}`;
      const receiver = m[1]!;
      // Read the first argument off the ORIGINAL text (the blanked copy has had
      // string contents removed) starting just past the `(`.
      const rest = raw.slice(m.index + m[0].length);
      const lit = /^\s*(["'])((?:[^\\]|\\.)*?)\1\s*[,)]/.exec(rest);
      const tpl = /^\s*`([^`$\\]*)`\s*[,)]/.exec(rest);
      sites.push({ type: lit?.[2] ?? tpl?.[1] ?? null, receiver, where });
    }
  }
  return sites;
}

const SITES = emitSites();

/** event name → every file:line that emits it. */
const EMITTED = ((): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const s of SITES) {
    if (s.type === null) continue;
    m.set(s.type, [...(m.get(s.type) ?? []), s.where]);
  }
  return m;
})();

/** How to fix an unclassified event — repeated verbatim in the failure text. */
const HOW_TO_FIX = [
  "Pick ONE of:",
  "  (a) FAN IT OUT — add it to FANNED_OUT_EVENT_TYPES in",
  "      apps/game-server/src/net/eventFanout.ts, with a comment naming the CLIENT",
  "      CONSUMER that renders it. Check cadence (a per-tick event is a wire flood),",
  "      payload field names against the consumer, and that audio/sfxEdges.ts does",
  "      not already derive the same cue from a schema edge (that would double-fire).",
  "  (b) KEEP IT SERVER-SIDE — add it to SERVER_ONLY_EVENT_TYPES in the same file,",
  "      with a comment stating WHY it never needs to reach a client.",
  "  (c) DELETE THE EMIT if nothing consumes it in either place.",
  "Leaving it out of both is not an option: the allowlist drops it in silence, so the",
  "feature is invisible in game and in replays with no error anywhere.",
].join("\n");

describe("eventFanout — the scrape can actually see the sim", () => {
  it("finds emit sites, and enough of them to be looking at the real tree", () => {
    expect(SITES.length, `scraped no .emit( call sites under ${rel(SIM_DIR)}`).toBeGreaterThan(50);
    expect(EMITTED.has("damage"), "did not find the `damage` emit — the scrape is broken").toBe(true);
    expect(EMITTED.size).toBeGreaterThan(30);
  });

  it("resolves EVERY emit site to a literal event name (a computed name is invisible)", () => {
    const opaque = SITES.filter((s) => s.type === null).map((s) => `${s.receiver}.emit(…) at ${s.where}`);
    expect(
      opaque,
      "These emit call sites do not name their event as a plain string literal, so NO static " +
        "check — this one included — can tell whether they are fanned out. Write the event name " +
        "as a literal at the call site (`world.emit(\"thing\", …)`). If the name genuinely must " +
        "be dynamic, the fan-out allowlist cannot protect it and the design needs revisiting.\n",
    ).toEqual([]);
  });

  it("sees only `world` as an emitter, so nothing emits outside the guard's view", () => {
    const foreign = [...new Set(SITES.filter((s) => s.receiver !== "world").map((s) => s.receiver))];
    expect(
      foreign,
      "A new `.emit(` receiver appeared in packages/shared/src/sim. This guard only classifies " +
        "`world.emit` events. Either route these through `world.emit` so they are covered, or " +
        "widen this test deliberately — do not let a second event channel sit outside it.\n",
    ).toEqual([]);
  });
});

describe("eventFanout — the sim's emit set is fully classified", () => {
  it("every emitted event is either fanned out or explicitly server-only", () => {
    const unclassified = [...EMITTED]
      .filter(([type]) => !FANNED_OUT_EVENT_TYPES.has(type) && !SERVER_ONLY_EVENT_TYPES.has(type))
      .map(([type, where]) => `  "${type}" emitted at ${where.join(", ")}`);
    expect(
      unclassified,
      `Unclassified sim event(s) — emitted but in neither set:\n${unclassified.join("\n")}\n\n${HOW_TO_FIX}\n`,
    ).toEqual([]);
  });

  it("no event is in both sets (a contradiction hides which one is meant)", () => {
    const both = [...FANNED_OUT_EVENT_TYPES].filter((t) => SERVER_ONLY_EVENT_TYPES.has(t));
    expect(
      both,
      "These events are BOTH fanned out and marked server-only. `isFannedOutEvent` reads " +
        "FANNED_OUT_EVENT_TYPES, so they do cross the wire and the server-only entry is a lie. " +
        "Delete whichever entry is wrong.\n",
    ).toEqual([]);
  });

  it("neither set names an event the sim no longer emits (stale entries hide real gaps)", () => {
    const stale = [...FANNED_OUT_EVENT_TYPES, ...SERVER_ONLY_EVENT_TYPES]
      .filter((t) => !EMITTED.has(t))
      .map((t) => `  "${t}"`);
    expect(
      stale,
      `These names are classified in eventFanout.ts but nothing in ${rel(SIM_DIR)} emits them:\n` +
        `${stale.join("\n")}\n\nEither the emit was renamed (update the entry to match, or the ` +
        "event silently stops crossing the wire) or it was deleted (drop the entry). A stale " +
        "entry makes the list look more complete than it is.\n",
    ).toEqual([]);
  });
});

describe("eventFanout — exemptions are explicit, not silent", () => {
  /**
   * Each server-only entry must sit under a comment. Read from the SOURCE, because
   * the reason is prose that no runtime value carries — and an exemption without a
   * stated reason is indistinguishable from the oversight this file exists to catch.
   *
   * The rule is per GROUP, not per line: entries are listed in runs under a shared
   * `// ──` heading, so walking up past sibling entries must reach a comment.
   *
   * WHAT THIS DOES NOT CATCH, stated plainly so nobody over-trusts it: a name
   * appended DIRECTLY under an existing group's last entry inherits that group's
   * comment and passes. Position cannot distinguish "belongs to this group" from
   * "parked here to silence the classification test" — only review can. What it
   * does catch is the realistic sloppy case: a new run (after a blank line) or a
   * whole list with no stated reason at all, including a bare `// ───` divider.
   */
  it("every SERVER_ONLY_EVENT_TYPES group states a reason", () => {
    const src = readFileSync(FANOUT_FILE, "utf8").split("\n");
    const start = src.findIndex((l) => l.includes("export const SERVER_ONLY_EVENT_TYPES"));
    expect(start, "eventFanout.ts no longer declares SERVER_ONLY_EVENT_TYPES").toBeGreaterThan(-1);
    const end = src.findIndex((l, i) => i > start && l.startsWith("]"));
    expect(end, "could not find the end of the SERVER_ONLY_EVENT_TYPES literal").toBeGreaterThan(start);

    const isEntry = (l: string): boolean => /^\s*"[A-Za-z][\w]*",\s*$/.test(l);
    const isComment = (l: string): boolean => l.trim().startsWith("//");
    const undocumented: string[] = [];
    for (let i = start + 1; i < end; i++) {
      if (!isEntry(src[i]!)) continue;
      // Walk up past SIBLING ENTRIES to the group's heading. Blank lines are NOT
      // skipped on purpose: a blank line starts a new group, so a run appended
      // below one must carry its own comment rather than inheriting the last
      // group's. (Verified: the current block has no blank lines inside it.)
      let j = i - 1;
      while (j > start && isEntry(src[j]!)) j--;
      // Accumulate the whole contiguous comment run, so a bare `// ────` divider
      // with no prose does not count as a reason.
      let prose = "";
      while (j > start && isComment(src[j]!)) {
        prose = src[j]!.trim().replace(/^\/\/\s*/, "").replace(/[─\-—]/g, "") + " " + prose;
        j--;
      }
      if (prose.trim().length < 40) undocumented.push(`  ${src[i]!.trim()} (line ${i + 1})`);
    }
    expect(
      undocumented,
      `These server-only exemptions carry no stated reason:\n${undocumented.join("\n")}\n\n` +
        "An exemption is a DECISION and has to read like one. Add a comment above the entry (or " +
        "above its group) saying why the event never needs to reach a client — cadence, no " +
        "consumer, already delivered via the replicated schema, etc. An uncommented name is " +
        "indistinguishable from the silent omission this whole guard exists to prevent.\n",
    ).toEqual([]);
  });
});

describe("eventFanout — both rooms use the one shared allowlist", () => {
  /**
   * The live room and the replay room must forward the IDENTICAL set, or a replay
   * renders a combat-mute version of the match. That holds only while both call
   * the shared predicate; a room growing its own inline list would drift silently.
   */
  for (const room of ["rooms/MatchRoom.ts", "rooms/ReplayRoom.ts"]) {
    it(`${room} filters via isFannedOutEvent, not a private list`, () => {
      const src = readFileSync(join(HERE, "..", room), "utf8");
      expect(
        src.includes("isFannedOutEvent("),
        `${room} no longer calls isFannedOutEvent — if it grew its own event allowlist, the live ` +
          "match and the replay will drift apart and the replay goes combat-mute.",
      ).toBe(true);
    });
  }
});

describe("eventFanout — the events the S2 audit found blocked", () => {
  // Regression pins for the nine names the audit turned up. These are the ONLY
  // hard-coded expectations in the file: everything above derives its answer from
  // the sources, so it fails on instances nobody has thought of yet. These six
  // each had a READY client consumer and were silently filtered out.
  for (const type of [
    "evade", // floating MISS text + replay (sim/combat/evasion.ts)
    "explosion", // combatSfx 爆裂 (abilitySystem + CastResolveSystem)
    "buffApply", // combatSfx 增益 (effects/effectRunner)
    "reviveChannel", // combatSfx 詠唱進行中 (systems/ReviveSystem)
    "fireRingStart", // combatSfx → fireRingLoop (systems/FireRingSystem)
    "rankUp", // combatSfx → abilityRankUp (abilities/abilitySystem)
  ]) {
    it(`fans out ${type}`, () => {
      expect(isFannedOutEvent({ type, tick: 0, data: {} })).toBe(true);
    });
  }

  // The per-tick twins stay off the wire on purpose — `fireRingTick` alone would
  // be 30 msg/s/client, `fireRingDamage` ~360/s. See eventFanout.ts.
  for (const type of ["fireRingTick", "fireRingDamage"]) {
    it(`does NOT fan out the per-tick ${type}`, () => {
      expect(isFannedOutEvent({ type, tick: 0, data: {} })).toBe(false);
    });
  }
});
