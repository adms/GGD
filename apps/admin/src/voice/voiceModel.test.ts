/**
 * adminui-voice-stub — THE load-bearing suite: no code path lets a STUB clip
 *                        reach 驗收. The state machine has no `stub → approved`
 *                        edge, `canApproveLine` refuses one from every angle
 *                        (state flag, current-clip flag, engine name),
 *                        `canPromoteTake` refuses to write one into the real
 *                        file, the parser DOWNGRADES a record that claims
 *                        "generated" while carrying stub bytes, and stub clips
 *                        are excluded from every 已完成 figure.
 * adminui-voice-gates — the three preconditions the daemon enforces are
 *                        pre-flighted here, WITH a reason, so a dead button is
 *                        never merely dim.
 * adminui-voice-counts — the counts partition exactly, the page can prove it,
 *                        and it says so when they do not.
 * adminui-voice-scale — 2,208 rows stay ~30 DOM nodes (windowSlice), and the
 *                        flat view never implies a fetch for a champion nobody
 *                        opened.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { BUNDLED_SCHEMA, expandLines } from "./categories";
import {
  EMPTY_COUNTS,
  LEGAL_TRANSITIONS,
  LINE_STATES,
  addCounts,
  canApproveLine,
  canGenerateLine,
  canPromoteTake,
  canTransition,
  countsFor,
  countsPartitionOk,
  etaMsOf,
  flattenLoaded,
  formatEta,
  inconsistentChampions,
  isDone,
  isStubPath,
  isStubState,
  jobPercent,
  needsWork,
  parseChampionStatus,
  parseJob,
  parseLine,
  parseRoster,
  progressOf,
  rosterSkipEstimate,
  rosterTotals,
  windowSlice,
  type ChampionStatus,
  type Job,
  type LineRecord,
  type LineState,
  type ReferenceRecord,
} from "./voiceModel";

const LINES = expandLines(BUNDLED_SCHEMA);

const GOOD_REF: ReferenceRecord = {
  sha256: "a".repeat(64),
  seconds: 8.4,
  sampleRate: 24000,
  source: "assets/audio/voices/quotes/godie-e001.mp3",
  sourceKind: "repo",
  licence: "",
  licenceUrl: "",
  note: "",
  addedAt: 1,
};

function line(over: Partial<LineRecord> = {}): LineRecord {
  return {
    lineId: "quote",
    categoryId: "quote",
    variant: null,
    text: "うー、かーわーいーいー！",
    textSource: "authored",
    lang: "ja-JP",
    state: "generated",
    current: {
      take: 3,
      engine: "indextts",
      engineVersion: "1.0",
      stub: false,
      bytes: 41233,
      seconds: 2.4,
      lufs: -16.1,
      hash: "h",
      at: 1,
    },
    takes: [],
    review: null,
    lastError: null,
    abilityId: null,
    abilityName: null,
    ...over,
  };
}

// ---------------------------------------------------------------- THE STUB ---

describe("a STUB clip can never be approved", () => {
  it("the state machine has no stub → approved edge, from anywhere", () => {
    cover("adminui-voice-stub");
    expect(LEGAL_TRANSITIONS.stub).not.toContain("approved");
    expect(canTransition("stub", "approved")).toBe(false);
    // exhaustive: `approved` is reachable ONLY from `generated`
    const sources = LINE_STATES.filter((s) => canTransition(s, "approved"));
    expect(sources).toEqual(["generated"]);
  });

  it("canApproveLine refuses a stub by state, by clip flag, and by engine name", () => {
    cover("adminui-voice-stub");
    const byState = canApproveLine(line({ state: "stub" }));
    expect(byState.ok).toBe(false);
    expect(byState.reason).toContain("STUB");

    // the record claims a normal state but the bytes are a stub — still refused
    const byClip = canApproveLine(
      line({ state: "generated", current: { ...line().current!, stub: true } }),
    );
    expect(byClip.ok).toBe(false);

    const byEngine = canApproveLine(
      parseLine("quote", {
        state: "generated",
        text: "x",
        current: { take: 1, engine: "stub", hash: "h" },
      }),
    );
    expect(byEngine.ok).toBe(false);

    // …and a real generated clip IS approvable, so the refusal is not vacuous
    expect(canApproveLine(line()).ok).toBe(true);
  });

  it("the parser downgrades a record that claims generated while carrying stub bytes", () => {
    cover("adminui-voice-stub");
    const rec = parseLine("quote", {
      state: "generated",
      text: "x",
      current: { take: 1, engine: "indextts", stub: true, hash: "h" },
    });
    // a disagreement between the layers must resolve to "fake", never to "real"
    expect(rec.state).toBe("stub");
    expect(canApproveLine(rec).ok).toBe(false);
  });

  it("a stub take can never be promoted into the real file", () => {
    cover("adminui-voice-stub");
    const stubTake = { take: 2, engine: "stub", stub: true, seconds: 2.1, at: 1, error: null };
    expect(canPromoteTake(stubTake).ok).toBe(false);
    // even if the record forgot the flag, the engine name gives it away
    expect(canPromoteTake({ ...stubTake, stub: false }).ok).toBe(false);
    expect(canPromoteTake({ take: 1, engine: "indextts", stub: false, seconds: 2, at: 1, error: null }).ok).toBe(true);
    // and the filename carries it too — `promote` must refuse any such path
    expect(isStubPath("takes/quote.t2.stub.mp3")).toBe(true);
    expect(isStubPath("takes/quote.t2.mp3")).toBe(false);
  });

  it("stub is a state of its own and is excluded from every 已完成 figure", () => {
    cover("adminui-voice-stub");
    expect(isStubState("stub")).toBe(true);
    expect(isStubState("generated")).toBe(false);
    expect(isDone("stub")).toBe(false);
    expect(isDone("approved")).toBe(true);
    // only `approved` counts as done — not generated, not stub
    expect(LINE_STATES.filter(isDone)).toEqual(["approved"]);

    const counts = { ...EMPTY_COUNTS, total: 10, approved: 4, stub: 6 };
    const p = progressOf(counts);
    expect(p.done).toBe(4);
    expect(p.stub).toBe(6);
    expect(p.percent).toBeCloseTo(40, 5);
  });

  it("an unknown engine defaults to STUB — the safe answer to 'is this real?'", () => {
    cover("adminui-voice-stub");
    const roster = parseRoster({ champions: [], engine: { name: "?" } });
    expect(roster?.engine.stub).toBe(true);
  });
});

// -------------------------------------------------------------- THE GATES ----

describe("generation preconditions are pre-flighted WITH a reason", () => {
  it("refuses without a reference clip", () => {
    cover("adminui-voice-gates");
    const g = canGenerateLine(null, line());
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("參考音");
  });

  it("refuses a reference whose hash was never recorded", () => {
    cover("adminui-voice-gates");
    expect(canGenerateLine({ ...GOOD_REF, sha256: "" }, line()).ok).toBe(false);
  });

  it("refuses an external reference with no licence — and allows a repo one", () => {
    cover("adminui-voice-gates");
    const unlicensed = { ...GOOD_REF, sourceKind: "upload" as const, licence: "   " };
    const g = canGenerateLine(unlicensed, line());
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("授權");
    expect(canGenerateLine({ ...unlicensed, licence: "CC0" }, line()).ok).toBe(true);
    // a clip that came out of this repo needs no extra paperwork
    expect(canGenerateLine(GOOD_REF, line()).ok).toBe(true);
  });

  it("refuses without a script, including whitespace-only", () => {
    cover("adminui-voice-gates");
    expect(canGenerateLine(GOOD_REF, line({ text: null })).ok).toBe(false);
    expect(canGenerateLine(GOOD_REF, line({ text: "   " })).ok).toBe(false);
    expect(canGenerateLine(GOOD_REF, line({ text: null })).reason).toContain("文稿");
  });

  it("every refusal carries a non-empty reason, and every pass carries none", () => {
    cover("adminui-voice-gates");
    const gates = [
      canGenerateLine(null, line()),
      canGenerateLine(GOOD_REF, line({ text: null })),
      canApproveLine(line({ state: "stub" })),
      canApproveLine(null),
      canPromoteTake(null),
    ];
    for (const g of gates) {
      expect(g.ok).toBe(false);
      expect(g.reason.length).toBeGreaterThan(0);
    }
    expect(canGenerateLine(GOOD_REF, line()).reason).toBe("");
  });
});

// -------------------------------------------------------------- THE COUNTS ---

describe("the counts partition, and the page can prove it", () => {
  it("counts every EXPECTED line — an absent record is 待撰稿, not a smaller denominator", () => {
    cover("adminui-voice-counts");
    const status: ChampionStatus = {
      championId: "godie-e001",
      lang: "ja-JP",
      gender: "female",
      reference: GOOD_REF,
      lines: { quote: line({ state: "approved" }), "skill-name.q": line({ state: "stub" }) },
    };
    const c = countsFor(LINES, status);
    expect(c.total).toBe(46);
    expect(c.approved).toBe(1);
    expect(c.stub).toBe(1);
    expect(c.noText).toBe(44);
    expect(countsPartitionOk(c)).toBe(true);
  });

  it("a null status is 46 × 待撰稿, never an empty page", () => {
    cover("adminui-voice-counts");
    const c = countsFor(LINES, null);
    expect(c.total).toBe(46);
    expect(c.noText).toBe(46);
    expect(countsPartitionOk(c)).toBe(true);
  });

  it("detects a rollup whose buckets do not add up, and names the champion", () => {
    cover("adminui-voice-counts");
    const roster = parseRoster({
      champions: [
        { championId: "ok-one", counts: { total: 46, approved: 46 } },
        { championId: "bad-one", counts: { total: 46, approved: 2 } },
      ],
    });
    expect(countsPartitionOk(roster!.champions[0]!.counts)).toBe(true);
    expect(countsPartitionOk(roster!.champions[1]!.counts)).toBe(false);
    expect(inconsistentChampions(roster)).toEqual(["bad-one"]);
  });

  it("roster totals are the sum of the rows", () => {
    cover("adminui-voice-counts");
    const roster = parseRoster({
      champions: [
        { championId: "a", counts: { total: 46, approved: 46 } },
        { championId: "b", counts: { total: 46, stub: 46 } },
      ],
    });
    const t = rosterTotals(roster);
    expect(t.total).toBe(92);
    expect(t.approved).toBe(46);
    expect(t.stub).toBe(46);
    expect(progressOf(t).percent).toBeCloseTo(50, 5);
    expect(rosterTotals(null)).toEqual(EMPTY_COUNTS);
    expect(addCounts(EMPTY_COUNTS, t)).toEqual(t);
  });

  it("reports what a whole-roster run will SKIP before it is started", () => {
    cover("adminui-voice-counts");
    const roster = parseRoster({
      champions: [
        { championId: "with-ref", hasReference: true, counts: { total: 46, approved: 40, noText: 6 } },
        { championId: "no-ref", hasReference: false, counts: { total: 46, noText: 46 } },
      ],
    });
    const skip = rosterSkipEstimate(roster);
    expect(skip.championsWithoutReference).toEqual(["no-ref"]);
    expect(skip.noReference).toBe(46);
    expect(skip.noText).toBe(52);
  });
});

// --------------------------------------------------------------- THE SCALE ---

describe("2,208 clips stay affordable to render", () => {
  it("windows a 2,208-row list down to a few dozen rows", () => {
    cover("adminui-voice-scale");
    const total = 48 * LINES.length;
    expect(total).toBe(2208);
    const w = windowSlice(total, 30, 0, 360);
    expect(w.start).toBe(0);
    expect(w.end - w.start).toBeLessThan(40);
    expect(w.padTop).toBe(0);
    expect(w.padTop + (w.end - w.start) * 30 + w.padBottom).toBe(total * 30);

    const mid = windowSlice(total, 30, 15_000, 360);
    expect(mid.start).toBeGreaterThan(400);
    expect(mid.end - mid.start).toBeLessThan(40);
    expect(mid.padTop + (mid.end - mid.start) * 30 + mid.padBottom).toBe(total * 30);

    // the end of the list does not overrun
    const end = windowSlice(total, 30, total * 30, 360);
    expect(end.end).toBe(total);
    expect(end.padBottom).toBe(0);
    expect(windowSlice(0, 30, 0, 360)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
  });

  it("the flat view lists only champions ALREADY loaded — it never implies a fetch", () => {
    cover("adminui-voice-scale");
    const roster = parseRoster({
      champions: [{ championId: "a", name: "A" }, { championId: "b", name: "B" }],
    });
    const loaded = new Map<string, ChampionStatus>([
      [
        "a",
        {
          championId: "a",
          lang: "",
          gender: "",
          reference: null,
          lines: { quote: line({ state: "pending" }) },
        },
      ],
    ]);
    const rows = flattenLoaded(roster, LINES, loaded, "all");
    expect(rows.every((r) => r.championId === "a")).toBe(true);
    expect(rows).toHaveLength(46);
    expect(flattenLoaded(roster, LINES, new Map(), "all")).toEqual([]);
    expect(flattenLoaded(null, LINES, loaded, "all")).toEqual([]);
  });

  it("需處理 is every state that needs a human, and no state that does not", () => {
    cover("adminui-voice-scale");
    expect(LINE_STATES.filter(needsWork).sort()).toEqual(
      (["failed", "noText", "pending", "rejected", "stub"] as LineState[]).sort(),
    );
    expect(needsWork("approved")).toBe(false);
    expect(needsWork("generating")).toBe(false);
  });
});

// ----------------------------------------------------------------- PROGRESS --

describe("job progress is measured, never guessed", () => {
  const job = (over: Partial<Job> = {}): Job =>
    ({
      jobId: "vj_1",
      kind: "voice",
      scope: "roster",
      state: "running",
      total: 2208,
      done: 0,
      ok: 0,
      failed: 0,
      skipped: 0,
      stub: 0,
      current: null,
      startedAt: 1_000,
      finishedAt: null,
      etaMs: null,
      errors: [],
      ...over,
    }) as Job;

  it("uses the daemon's ETA when it published one", () => {
    cover("adminui-voice-scale");
    expect(etaMsOf(job({ etaMs: 90_000, done: 5 }), 2_000)).toBe(90_000);
  });

  it("extrapolates from observed throughput, and refuses to guess before that", () => {
    cover("adminui-voice-scale");
    // nothing has finished: there is no basis for an estimate
    expect(etaMsOf(job({ done: 0 }), 5_000)).toBeNull();
    // 10 done in 10s over 2208 total ⇒ 2198 × 1s remaining
    expect(etaMsOf(job({ done: 10, total: 2208 }), 11_000)).toBeCloseTo(2_198_000, 0);
    // a finished job has no ETA at all
    expect(etaMsOf(job({ state: "done", done: 10 }), 11_000)).toBeNull();
  });

  it("formats an ETA a human can read, and says 「—」 when it does not know", () => {
    cover("adminui-voice-scale");
    expect(formatEta(null)).toBe("—");
    expect(formatEta(-1)).toBe("—");
    expect(formatEta(42_000)).toBe("42 秒");
    expect(formatEta(83_000)).toBe("1 分 23 秒");
    expect(formatEta(7_500_000)).toBe("2 小時 05 分");
  });

  it("never reports more than 100%, and survives a zero-total job", () => {
    cover("adminui-voice-scale");
    expect(jobPercent(job({ done: 3000, total: 2208 }))).toBe(100);
    expect(jobPercent(job({ total: 0 }))).toBe(0);
  });

  it("parses a job tolerantly and drops one with no id", () => {
    cover("adminui-voice-scale");
    expect(parseJob({ state: "running" })).toBeNull();
    const j = parseJob({ jobId: "vj_2", state: "nonsense", scope: "weird", errors: [{ message: "x" }] });
    expect(j?.state).toBe("queued");
    expect(j?.scope).toBe("roster");
    expect(j?.errors[0]?.message).toBe("x");
  });
});

describe("the readers never invent a champion", () => {
  it("drops rows with no championId and keeps the rest", () => {
    cover("adminui-voice-counts");
    const r = parseRoster({ champions: [{ name: "nameless" }, { championId: "a" }] });
    expect(r?.champions.map((c) => c.championId)).toEqual(["a"]);
    // a champion with no name falls back to its id, never to ""
    expect(r?.champions[0]?.name).toBe("a");
  });

  it("returns null rather than a hollow status for unusable bytes", () => {
    cover("adminui-voice-counts");
    expect(parseChampionStatus(null)).toBeNull();
    expect(parseChampionStatus({ lines: {} })).toBeNull();
    expect(parseRoster({})).toBeNull();
    const ok = parseChampionStatus({ championId: "a", lines: { quote: { state: "approved" } } });
    expect(ok?.lines["quote"]?.state).toBe("approved");
    // an empty script string is null (待撰稿), not an empty line that could be sent
    expect(parseChampionStatus({ championId: "a", lines: { quote: { text: "" } } })?.lines["quote"]?.text).toBeNull();
  });
});
