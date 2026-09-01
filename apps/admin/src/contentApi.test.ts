/**
 * content-admin-save (task #102) — the behaviour that keeps a content edit from
 * becoming data loss, tested against an injected fetch so no server is needed.
 *
 * THREE THINGS ARE LOAD-BEARING AND ALL THREE ARE TESTED HERE:
 *
 *   1. VALIDATE EVERYTHING BEFORE WRITING ANYTHING. An ability save is two
 *      writes (standalone + the champion's embedded twin). If the second one
 *      were to fail validation after the first had landed, content would be
 *      left internally inconsistent — the standalone doc saying one thing and
 *      the doc the SIM actually reads saying another. So every step is
 *      dry-run validated first and a single 422 aborts the whole save with
 *      zero PUTs.
 *
 *   2. THE MIRROR RULE IS NOT OPTIONAL. The sim reads `champion.abilities[slot]`,
 *      not `abilities/<id>.json`. A save that wrote only the standalone doc
 *      would appear to work and change nothing in game.
 *
 *   3. A PARTIAL FAILURE IS REPORTED, NOT SWALLOWED. If the second PUT fails
 *      after the first succeeded, the outcome carries what was written and the
 *      undo snapshot names, because this repo has no version control (#65) and
 *      a silent half-write is unrecoverable by any other means.
 *
 * Plus the contentVersion (cv_…) passthrough: client and server COMPARE that
 * hash, so a save must surface the NEW one rather than let a running match
 * silently desync.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { writePlan } from "@ggd/shared/content/editModel";
import {
  fetchDoc,
  listBackups,
  restoreBackup,
  deleteDoc,
  createContentEditApi,
  saveDocs,
  validateDoc,
  type EditFetch,
} from "./contentApi";

interface Call {
  url: string;
  method: string;
  body: unknown;
  /** recorded because a header sent on a BODYLESS verb is itself a bug — see
   *  the 刪除 regression at the bottom of this file */
  headers: Record<string, string>;
}

interface Canned {
  status: number;
  body: unknown;
}

/** Records every request and replies from a url-substring → response table. */
function stubFetch(table: readonly (readonly [RegExp, Canned])[]): {
  fetchFn: EditFetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchFn: EditFetch = (url, init) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: { ...((init.headers ?? {}) as Record<string, string>) },
    });
    const hit = table.find(([re]) => re.test(`${init.method ?? "GET"} ${url}`));
    const canned: Canned = hit?.[1] ?? { status: 200, body: {} };
    return Promise.resolve({
      status: canned.status,
      json: () => Promise.resolve(canned.body),
      text: () => Promise.resolve(JSON.stringify(canned.body)),
    });
  };
  return { fetchFn, calls };
}

const ABILITY = { id: "hero-x.q", schema: "ability@1", name: "Q", slot: "Q" };
const CHAMPION = {
  id: "hero-x",
  schema: "champion@1",
  name: "Hero X",
  abilities: { Q: { id: "hero-x.q", name: "Q", slot: "Q" } },
};

// ---------------------------------------------------------------------------

describe("saving one document", () => {
  it("dry-run validates before it writes, and reports the new contentVersion", async () => {
    cover("content-admin-save");
    const { fetchFn, calls } = stubFetch([
      [/POST .*\/validate$/, { status: 200, body: { ok: true } }],
      [/PUT /, { status: 200, body: { contentVersion: "cv_newhash", backup: "2026-07-22.json" } }],
    ]);
    const steps = writePlan("items", "ember-rod", { id: "ember-rod", schema: "item@1", cost: 350 });
    const out = await saveDocs(steps, { fetchFn });

    expect(out.ok).toBe(true);
    expect(out.contentVersion).toBe("cv_newhash");
    expect(out.written).toEqual([
      { collection: "items", id: "ember-rod", reason: "edit", backup: "2026-07-22.json" },
    ]);
    // order matters: validate strictly before write
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /content-api/items/ember-rod/validate",
      "PUT /content-api/items/ember-rod",
    ]);
  });

  it("a 422 surfaces field issues and writes NOTHING", async () => {
    cover("content-admin-save");
    const { fetchFn, calls } = stubFetch([
      [
        /POST .*\/validate$/,
        {
          status: 422,
          body: { errors: [{ path: "cost", message: "expected number", code: "invalid_type" }] },
        },
      ],
    ]);
    const out = await saveDocs(writePlan("items", "x", { id: "x" }), { fetchFn });

    expect(out.ok).toBe(false);
    expect(out.issues).toEqual([{ path: "cost", message: "expected number", code: "invalid_type" }]);
    expect(out.written).toEqual([]);
    expect(calls.every((c) => c.method !== "PUT")).toBe(true);
  });

  it("a transport failure is human-readable and still writes nothing", async () => {
    cover("content-admin-save");
    const { fetchFn, calls } = stubFetch([[/POST /, { status: 404, body: null }]]);
    const out = await saveDocs(writePlan("items", "x", { id: "x" }), { fetchFn });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/content-api/); // names the service that is down
    expect(calls.every((c) => c.method !== "PUT")).toBe(true);
  });
});

describe("the mirror rule (an ability is stored twice)", () => {
  it("plans BOTH writes and validates both before either lands", async () => {
    cover("content-admin-mirror-write");
    const { fetchFn, calls } = stubFetch([
      [/POST .*\/validate$/, { status: 200, body: { ok: true } }],
      [/PUT /, { status: 200, body: { contentVersion: "cv_x", backup: "b.json" } }],
    ]);
    const steps = writePlan("abilities", "hero-x.q", { ...ABILITY, name: "Q!" }, CHAMPION);
    expect(steps.map((s) => `${s.collection}/${s.id}:${s.reason}`)).toEqual([
      "abilities/hero-x.q:edit",
      "champions/hero-x:mirror",
    ]);

    const out = await saveDocs(steps, { fetchFn });
    expect(out.ok).toBe(true);
    // both validates precede both writes — not validate/write, validate/write
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /content-api/abilities/hero-x.q/validate",
      "POST /content-api/champions/hero-x/validate",
      "PUT /content-api/abilities/hero-x.q",
      "PUT /content-api/champions/hero-x",
    ]);
  });

  it("ONE invalid step aborts the pair — no half-applied mirror", async () => {
    cover("content-admin-mirror-write");
    const { fetchFn, calls } = stubFetch([
      [/POST \/content-api\/abilities\/.*\/validate$/, { status: 200, body: { ok: true } }],
      [
        /POST \/content-api\/champions\/.*\/validate$/,
        { status: 422, body: { errors: [{ path: "abilities.Q.slot", message: "bad slot" }] } },
      ],
    ]);
    const out = await saveDocs(writePlan("abilities", "hero-x.q", ABILITY, CHAMPION), { fetchFn });
    expect(out.ok).toBe(false);
    expect(out.issues.map((i) => i.path)).toEqual(["abilities.Q.slot"]);
    expect(calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  it("the embedded copy carries the edit and drops the schema discriminator", async () => {
    cover("content-admin-mirror-write");
    const steps = writePlan("abilities", "hero-x.q", { ...ABILITY, name: "改過的名字" }, CHAMPION);
    const mirror = steps[1]!.doc as { abilities: { Q: Record<string, unknown> } };
    expect(mirror.abilities.Q["name"]).toBe("改過的名字");
    // zAbilityDef is strict and forbids `schema` on the embedded shape
    expect(mirror.abilities.Q).not.toHaveProperty("schema");
    // and the champion is copied, never mutated
    expect(CHAMPION.abilities.Q.name).toBe("Q");
  });

  it("a partial failure reports what landed AND its undo snapshots", async () => {
    cover("content-admin-partial-write");
    const { fetchFn } = stubFetch([
      [/POST .*\/validate$/, { status: 200, body: { ok: true } }],
      [/PUT \/content-api\/abilities\//, { status: 200, body: { contentVersion: "cv_a", backup: "abil.bak" } }],
      [/PUT \/content-api\/champions\//, { status: 500, body: { error: "disk full" } }],
    ]);
    const out = await saveDocs(writePlan("abilities", "hero-x.q", ABILITY, CHAMPION), { fetchFn });
    expect(out.ok).toBe(false);
    expect(out.error).toContain("disk full");
    // the caller can tell the user EXACTLY what is now inconsistent and where
    // the bytes to undo it live — there is no git to fall back on (#65)
    expect(out.written).toEqual([
      { collection: "abilities", id: "hero-x.q", reason: "edit", backup: "abil.bak" },
    ]);
    expect(out.contentVersion).toBe("cv_a");
  });
});

describe("reads, validation and undo", () => {
  it("fetchDoc reads the LIVE bytes and rejects a non-object payload", async () => {
    cover("content-admin-save");
    const ok = stubFetch([[/GET /, { status: 200, body: ABILITY }]]);
    expect((await fetchDoc("abilities", "hero-x.q", { fetchFn: ok.fetchFn })).doc).toEqual(ABILITY);
    expect(ok.calls[0]!.url).toBe("/content-api/abilities/hero-x.q");

    const bad = stubFetch([[/GET /, { status: 200, body: [1, 2, 3] }]]);
    const r = await fetchDoc("abilities", "hero-x.q", { fetchFn: bad.fetchFn });
    expect(r.doc).toBeNull();
    expect(r.error).toMatch(/JSON 物件/);
  });

  it("validateDoc is a dry run: it never issues a mutating verb", async () => {
    cover("content-admin-save");
    const { fetchFn, calls } = stubFetch([[/POST /, { status: 200, body: { ok: true } }]]);
    const r = await validateDoc("items", "x", { id: "x" }, { fetchFn });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.url)).toEqual(["/content-api/items/x/validate"]);
    expect(calls.every((c) => c.method === "POST")).toBe(true);
  });

  it("listBackups tolerates a malformed body rather than throwing at the UI", async () => {
    cover("content-admin-save");
    const { fetchFn } = stubFetch([
      [
        /GET .*\/backups$/,
        { status: 200, body: { entries: [{ file: "a.json", at: 5, bytes: 9 }, { nope: true }, 42] } },
      ],
    ]);
    expect(await listBackups("items", "x", { fetchFn })).toEqual([
      { file: "a.json", at: 5, bytes: 9 },
    ]);
  });

  it("restoreBackup with no file means UNDO THE LAST SAVE, and returns the new cv_", async () => {
    cover("content-admin-save");
    const { fetchFn, calls } = stubFetch([
      [/POST .*\/restore$/, { status: 200, body: { restored: "b1.json", contentVersion: "cv_back" } }],
    ]);
    const r = await restoreBackup("champions", "hero-x", undefined, { fetchFn });
    expect(r).toEqual({ ok: true, restored: "b1.json", contentVersion: "cv_back", error: null });
    // an empty body is the server's "newest snapshot" signal
    expect(calls[0]!.body).toEqual({});
  });
});

// ---------------------------------------------------------------------------

/**
 * THE 刪除 BUTTON (task #70 rule 3 — 「移除一個三選一強化」).
 *
 * Found by actually clicking it in the console, not by reading the code: every
 * delete answered 「Bad Request」. `send()` set `content-type: application/json`
 * on EVERY verb, but DELETE carries no body, and fastify rejects that pairing
 * outright with 400 FST_ERR_CTP_EMPTY_JSON_BODY:
 *
 *     Body cannot be empty when content-type is set to 'application/json'
 *
 * So the console could CREATE an augment and never remove it. Nothing caught it
 * because the stub above did not record headers at all — a request could carry
 * any header and every assertion still passed. It records them now, and these
 * two tests pin both halves of the rule: no header without a body, the header
 * whenever there is one.
 */
describe("deleting a document (the 刪除 button)", () => {
  it("sends NO content-type on DELETE — the header alone is what fastify 400s on", async () => {
    cover("content-admin-save");
    const { fetchFn, calls } = stubFetch([
      [/DELETE /, { status: 200, body: { deleted: true, contentVersion: "cv_gone", backup: "b.json" } }],
    ]);
    const r = await deleteDoc("augments", "frost-bulwark-probe", { fetchFn });
    expect(r).toEqual({ ok: true, error: null, contentVersion: "cv_gone", backup: "b.json" });

    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.body).toBeUndefined();
    // the whole bug in one assertion
    expect(Object.keys(del.headers)).toEqual([]);
  });

  it("still sends content-type when there IS a body, so writes keep working", async () => {
    cover("content-admin-save");
    const { fetchFn, calls } = stubFetch([
      [/POST .*\/validate$/, { status: 200, body: { ok: true } }],
      [/POST /, { status: 200, body: { contentVersion: "cv_1" } }],
    ]);
    await saveDocs(writePlan("items", "x", { id: "x" }), { fetchFn });
    const write = calls.find((c) => c.body !== undefined)!;
    expect(write.headers["content-type"]).toBe("application/json");
  });
});

describe("AI change review uses the single guarded content-api authority", () => {
  it("reads proposals, records a hash-bound verdict, then promotes explicitly", async () => {
    cover("content-admin-gate");
    const { fetchFn, calls } = stubFetch([
      [/GET .*\/ai-review\/proposals$/, { status: 200, body: { counts: {}, items: [] } }],
      [/POST .*\/ai-review\/(verdicts|promote)$/, { status: 200, body: { ok: true } }],
    ]);
    const review = createContentEditApi().aiReview;

    await expect(review.proposals({ fetchFn })).resolves.toEqual({ counts: {}, items: [] });
    await review.verdict({
      key: "vfx-scripts/godie-hart.r",
      candidateHash: "sha256:candidate",
      verdict: "approve",
      reviewer: "Owner",
      note: "逐格視覺驗收通過",
      humanVisualScore: 8,
    }, { fetchFn });
    await review.promote({
      key: "vfx-scripts/godie-hart.r",
      candidateHash: "sha256:candidate",
    }, { fetchFn });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /content-api/ai-review/proposals",
      "POST /content-api/ai-review/verdicts",
      "POST /content-api/ai-review/promote",
    ]);
    expect(calls[1]!.body).toEqual({
      key: "vfx-scripts/godie-hart.r",
      candidateHash: "sha256:candidate",
      verdict: "approve",
      reviewer: "Owner",
      note: "逐格視覺驗收通過",
      humanVisualScore: 8,
    });
    expect(calls[2]!.body).toEqual({
      key: "vfx-scripts/godie-hart.r",
      candidateHash: "sha256:candidate",
    });
  });

  it("surfaces server refusal and never treats a rejected Promote as success", async () => {
    cover("content-admin-gate");
    const { fetchFn } = stubFetch([
      [/POST .*\/ai-review\/promote$/, { status: 409, body: { error: "候選送審後已變更" } }],
    ]);
    const review = createContentEditApi().aiReview;
    await expect(review.promote({
      key: "vfx-scripts/godie-hart.r",
      candidateHash: "sha256:stale",
    }, { fetchFn })).rejects.toThrow("候選送審後已變更");
  });
});
