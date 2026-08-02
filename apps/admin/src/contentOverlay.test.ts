/**
 * 內容覆蓋層 (task #189) — the console's half of the precedence contract.
 *
 * Two properties matter enough to pin:
 *
 *   A. the page NEVER paints a row green it does not understand. The whole
 *      point of the state machine is that "cannot tell" is louder than "fine";
 *      a console that fell back to `clean` on an unknown verdict would restore
 *      exactly the silent-drift failure #189 exists to end.
 *   B. the write path targets the PLATFORM, never /content-api. The dev editor's
 *      loopback-only posture is a standing owner rule and this second writer
 *      must not smuggle a hole into the production bundle.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  FLAGGED_STATES,
  OVERLAY_STATES,
  STATE_HINT,
  STATE_LABEL,
  STATE_TONE,
  emptyStatus,
  filterEntries,
  formatDoc,
  formatWhen,
  normalizeLog,
  normalizeStatus,
  parseDocInput,
  shortHash,
  sortEntries,
  summaryLine,
  validateKeyInput,
  type OverlayStatusEntry,
} from "./contentOverlay";
import { pageRequiresSession } from "./store";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

function entry(over: Partial<OverlayStatusEntry> = {}): OverlayStatusEntry {
  return {
    key: "champions/a",
    collection: "champions",
    id: "a",
    state: "clean",
    flagged: false,
    tombstone: false,
    baseHash: "aaaaaaaaaaaa",
    shippedHash: "aaaaaaaaaaaa",
    bytes: 10,
    editedAt: "2026-07-26T09:00:00Z",
    editedBy: "admin-1",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// A. the state machine never quietly says "fine"
// ---------------------------------------------------------------------------

describe("the precedence states are complete and never fail open", () => {
  it("labels, tones and hints cover EVERY state", () => {
    cover("content-overlay-console-states");
    for (const s of OVERLAY_STATES) {
      expect(STATE_LABEL[s], s).toBeTruthy();
      expect(STATE_TONE[s], s).toBeTruthy();
      expect(STATE_HINT[s], s).toBeTruthy();
    }
  });

  it("every flagged state's hint says the overlay STILL WINS", () => {
    cover("content-overlay-console-states");
    // A red badge that did not say so reads as "your edit is not applied",
    // which is the opposite of what the merge does — and would send the owner
    // re-editing a doc that is already live.
    for (const s of FLAGGED_STATES) {
      if (s === "unknown-base") continue; // "cannot judge" has its own wording
      expect(STATE_HINT[s], s).toMatch(/仍然生效/);
    }
    expect(STATE_HINT["unknown-base"]).toMatch(/無法判斷/);
  });

  it("an UNRECOGNISED state from the platform becomes unknown-base, never clean", () => {
    cover("content-overlay-console-states");
    const st = normalizeStatus({
      entries: [{ key: "items/x", collection: "items", id: "x", state: "some-future-verdict" }],
    });
    expect(st.entries[0]!.state).toBe("unknown-base");
    expect(st.entries[0]!.flagged).toBe(true);
  });

  it("a server row that claims flagged:false but carries a warn state is still flagged", () => {
    cover("content-overlay-console-states");
    const st = normalizeStatus({
      entries: [{ key: "items/x", collection: "items", id: "x", state: "stale", flagged: false }],
    });
    expect(st.entries[0]!.flagged).toBe(true);
  });

  it("garbage input degrades to the empty status rather than throwing", () => {
    cover("content-overlay-console-states");
    // The page must render even against an older/newer platform; a throw here
    // would blank the one screen that explains what is going on.
    for (const bad of [null, undefined, 42, "nope", [], { entries: "no" }]) {
      expect(() => normalizeStatus(bad)).not.toThrow();
    }
    expect(normalizeStatus(null)).toEqual(emptyStatus());
    expect(normalizeStatus({ entries: [1, null, "x"] }).entries).toEqual([]);
  });

  it("reads the degraded block and the shipped-tree availability", () => {
    cover("content-overlay-console-states");
    const st = normalizeStatus({
      generation: 4,
      degraded: { at: "2026-07-26T09:00:00Z", reason: "invalid character", bytes: 27, quarantine: "overlay.corrupt-ab" },
      shipped: { dir: "/srv/content", available: false, detail: "no such file" },
      counts: { stale: 2, clean: 1 },
      flaggedCount: 2,
      dataPath: "/data/content-overlay/overlay.json",
    });
    expect(st.degraded?.bytes).toBe(27);
    expect(st.degraded?.quarantine).toBe("overlay.corrupt-ab");
    expect(st.shipped.available).toBe(false);
    expect(st.shipped.detail).toBe("no such file");
    expect(st.counts.stale).toBe(2);
    expect(st.dataPath).toBe("/data/content-overlay/overlay.json");
  });

  it("summarises degraded / empty / clean / flagged distinctly", () => {
    cover("content-overlay-console-states");
    expect(summaryLine({ ...emptyStatus(), degraded: { at: "", reason: "x", bytes: 1, quarantine: "" } })).toMatch(/損毀/);
    expect(summaryLine(emptyStatus())).toMatch(/沒有任何覆蓋/);
    expect(summaryLine({ ...emptyStatus(), entries: [entry()] })).toMatch(/全部與出貨版一致/);
    expect(
      summaryLine({ ...emptyStatus(), entries: [entry({ state: "stale", flagged: true })], flaggedCount: 1 }),
    ).toMatch(/需要檢查/);
  });
});

describe("table behaviour", () => {
  it("puts flagged rows first, then sorts by key — stable across polls", () => {
    cover("content-overlay-console-states");
    const rows = [
      entry({ key: "z/clean" }),
      entry({ key: "a/clean" }),
      entry({ key: "m/stale", state: "stale", flagged: true }),
    ];
    expect(sortEntries(rows).map((e) => e.key)).toEqual(["m/stale", "a/clean", "z/clean"]);
    // sorting twice gives the same answer (no jitter between refreshes)
    expect(sortEntries(sortEntries(rows))).toEqual(sortEntries(rows));
    // …and it does not mutate the input
    expect(rows[0]!.key).toBe("z/clean");
  });

  it("filters on key, editor and state (label or slug)", () => {
    cover("content-overlay-console-states");
    const rows = [
      entry({ key: "champions/godie-e001", editedBy: "admin-1" }),
      entry({ key: "items/sword-01", editedBy: "admin-9", state: "stale", flagged: true }),
    ];
    expect(filterEntries(rows, "").length).toBe(2);
    expect(filterEntries(rows, "sword").map((e) => e.key)).toEqual(["items/sword-01"]);
    expect(filterEntries(rows, "admin-9").map((e) => e.key)).toEqual(["items/sword-01"]);
    expect(filterEntries(rows, "stale").map((e) => e.key)).toEqual(["items/sword-01"]);
    expect(filterEntries(rows, "出貨版已更新").map((e) => e.key)).toEqual(["items/sword-01"]);
  });
});

describe("the editor's input validation", () => {
  it("accepts a JSON object and rejects everything else with a readable reason", () => {
    cover("content-overlay-console-edit");
    const ok = parseDocInput('{"id":"x","dmg":2}');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.dmg).toBe(2);

    for (const bad of ["", "   ", "[1,2]", "42", '"str"', "{oops", "null"]) {
      const r = parseDocInput(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length, bad).toBeGreaterThan(4);
    }
  });

  it("mirrors the platform's collection/id shapes so a typo never becomes a 400", () => {
    cover("content-overlay-console-edit");
    expect(validateKeyInput("champions", "godie-e001")).toBeNull();
    // the dotted ability-slot suffix the curation whitelist uses must pass
    expect(validateKeyInput("abilities", "godie-e001.ex")).toBeNull();
    expect(validateKeyInput("Champions", "x")).not.toBeNull();
    expect(validateKeyInput("champions/../etc", "x")).not.toBeNull();
    expect(validateKeyInput("champions", "bad id!")).not.toBeNull();
    expect(validateKeyInput("champions", "../passwd")).not.toBeNull();
  });

  it("formats docs and timestamps without throwing on junk", () => {
    cover("content-overlay-console-edit");
    expect(formatDoc({ a: 1 })).toContain('"a": 1');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(formatDoc(cyclic)).toBe("");
    expect(formatWhen("")).toBe("—");
    expect(formatWhen("0001-01-01T00:00:00Z")).toBe("—");
    expect(formatWhen("not a date")).toBe("—");
    expect(formatWhen("2026-07-26T09:00:00Z")).not.toBe("—");
    expect(shortHash("")).toBe("—");
    expect(shortHash("abcdef123456")).toBe("abcdef12");
  });

  it("normalizes the generation log envelope", () => {
    cover("content-overlay-console-edit");
    expect(normalizeLog(null)).toEqual([]);
    expect(normalizeLog({ entries: "nope" })).toEqual([]);
    const lines = normalizeLog({
      entries: [{ generation: 3, at: "2026-07-26T09:00:00Z", by: "admin-1", op: "put", key: "items/x" }, null],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.op).toBe("put");
  });
});

// ---------------------------------------------------------------------------
// B. the write path is the PLATFORM, never the loopback content-api
// ---------------------------------------------------------------------------

describe("this writer does not weaken the loopback posture", () => {
  const MODULE = read("./contentOverlay.ts");
  const PAGE = read("./ui/ContentOverlayPage.tsx");
  const API = read("./api.ts");

  it("neither the module nor the page ever names /content-api or its port", () => {
    cover("content-overlay-console-not-content-api");
    // The repo's codexEditGate idiom: strip comments first, so the doc blocks
    // that EXPLAIN why this module is not the content-api writer cannot fail
    // the check that proves it. A `//` preceded by `:` is a URL scheme, not a
    // comment (contentGate.test.ts makes the same correction).
    const code = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const [name, src] of [["contentOverlay.ts", MODULE], ["ContentOverlayPage.tsx", PAGE]] as const) {
      // stricter than contentGate's `/content-api/`: the bare prefix, so a
      // "/content-api" with no trailing slash fails here too.
      expect(code(src), name).not.toMatch(/["'`]\/content-api/);
      expect(code(src), name).not.toContain("8787");
    }
  });

  it("every overlay wrapper goes through the platform ApiClient at /content-overlay/…", () => {
    cover("content-overlay-console-not-content-api");
    const at = API.indexOf("// ---- content overlay");
    expect(at, "the overlay section must exist in api.ts").toBeGreaterThan(0);
    const section = API.slice(at, API.indexOf("// ---- curation", at));
    const paths = [...section.matchAll(/api\s*\n?\s*\.?request<[^>]*>\(\s*[`"']([^`"']+)/g)].map(
      (m) => m[1] ?? "",
    );
    expect(paths.length).toBeGreaterThanOrEqual(6);
    for (const p of paths) {
      expect(p.startsWith("/content-overlay/"), p).toBe(true);
    }
    // no `auth: false` anywhere in this section: unlike the curation reads,
    // EVERY overlay call the console makes is admin-gated (the public head is
    // deliberately not wrapped, because it blanks updatedBy).
    expect(section).not.toContain("auth: false");
  });

  it("the page is STATICALLY imported by the shell — it must exist in a production build", () => {
    cover("content-overlay-console-not-content-api");
    const app = read("./ui/App.tsx");
    // The dev content suite is loaded through a guarded dynamic import; this one
    // is a plain top-level import, which is the whole difference: on ggd.adms.ai
    // it is the only content write path that exists at all.
    expect(app).toMatch(/^import \{ ContentOverlayPage \} from "\.\/ContentOverlayPage";$/m);
    expect(app).toContain('page === "contentOverlay"');
    // …and it must NOT be wrapped in a DEV guard by a later edit
    const at = app.indexOf('import { ContentOverlayPage }');
    expect(app.slice(Math.max(0, at - 200), at)).not.toContain("import.meta.env.DEV");
  });

  it("is session-gated: it writes what every player sees", () => {
    cover("content-overlay-console-not-content-api");
    // ⚠️ 2026-08-02：這一條**以前是掃原始碼字串**，而它從那天起就一直紅著，
    // 紅的理由還跟它想守的東西無關 —— 它做 `store.indexOf("SESSION_REQUIRED_PAGES")`
    // 取第一個出現位置，而第一個出現位置在 store.ts:46 的**註解裡**，
    // 於是它切出來的區塊是一段散文，永遠不含 `"contentOverlay"`。
    // 也就是說「contentOverlay 到底有沒有 session gate」這個問題它根本沒問過
    // （CLAUDE.md 失敗形態 ⑥：用掃原始碼字串代替行為）。
    // 而且一條常駐紅燈會稀釋整包的訊號 —— 下一個人看到「1 failed」會習慣。
    // 改成問**真的那支函式**：它讀的是真的 SESSION_REQUIRED_PAGES 集合。
    expect(pageRequiresSession("contentOverlay")).toBe(true);
    // 對照組：一個明確不需要 session 的頁必須回 false，否則「永遠回 true」
    // 的實作也會讓上面那條過（失敗形態 ④：斷言方向跟缺陷無關）。
    expect(pageRequiresSession("hub")).toBe(false);
  });
});
