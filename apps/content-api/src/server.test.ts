/**
 * content-08 (content-api-validate-write): PUT validates with the shared Zod
 * schemas BEFORE the atomic write; invalid docs 422 with field errors and
 * never touch disk. content-09 (content-api-path-traversal): ids/collections
 * that try to escape content/ are rejected. Plus CRUD/manifest/SSE/prod-refusal
 * items from docs/todo/content-api.md.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { cover } from "@ggd/shared/testkit/cover";
import { hashDoc } from "@ggd/shared/content";
import { rebuildAllIndexes, writeDocAtomic } from "@ggd/shared/content/node";
import { buildServer } from "./server";
import { SseHub } from "./sse";
import { VFX_FORGE_ACCEPTANCE_IDS } from "./aiReview";

const ITEM = {
  id: "ember-rod",
  schema: "item@1",
  name: "Ember Rod",
  cost: 900,
  tier: 2,
  modifiers: [{ stat: "ap", op: "flat", value: 45 }],
  tags: ["ap"],
};

const FRAME_AUDIT = {
  litShare: 0.1,
  highlightShare: 0.02,
  brightShare: 0.01,
  nearWhiteShare: 0,
  dominantBrightShare: 0.005,
  dominantNonBackgroundShare: 0.02,
  localWhiteCardShare: 0,
  diagnosticCheckerShare: 0,
  unsafe: false,
} as const;

const VISUAL_EVIDENCE = [
  { label: "impact side", dataUrl: "data:image/webp;base64,AA==", atMs: 900, view: "side", frameAudit: FRAME_AUDIT },
  { label: "impact top", dataUrl: "data:image/webp;base64,AQ==", atMs: 900, view: "top", frameAudit: FRAME_AUDIT },
];

const VISUAL_AUDIT = {
  schema: "ggd-vfx-visual-audit@3",
  safe: true,
  autoVisualScore: 8,
  sampledFrames: 30,
  peakParticleCount: 120,
  peakSystemCount: 4,
  worstAtMs: 900,
  worst: FRAME_AUDIT,
  suspects: [],
} as const;

let root: string;
let app: FastifyInstance;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "ggd-content-api-"));
  writeDocAtomic(root, "items", ITEM);
  rebuildAllIndexes(root);
  // undo store inside the tmp dir so the suite cleans up after itself (the real
  // default is <content>/../data/content-backups — outside the deployable tree)
  app = buildServer({ contentDir: root, backupDir: join(root, ".backups"), reviewDir: join(root, ".review") });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

describe("reads (capi-01)", () => {
  it("serves manifest, _index and objects", async () => {
    cover("content-api-get-endpoints");
    const manifest = await app.inject({ url: "/content-api/manifest" });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.json().contentVersion).toMatch(/^cv_[0-9a-f]{12}$/);

    const index = await app.inject({ url: "/content-api/items/_index" });
    expect(index.statusCode).toBe(200);
    expect(index.json().entries).toHaveLength(1);
    expect(index.json().entries[0]).toMatchObject({ id: "ember-rod", path: "items/ember-rod.json" });

    const doc = await app.inject({ url: "/content-api/items/ember-rod" });
    expect(doc.statusCode).toBe(200);
    expect(doc.json()).toEqual(ITEM);

    expect((await app.inject({ url: "/content-api/items/nope" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/content-api/nonsense/_index" })).statusCode).toBe(404);
  });
});

describe("validate-on-write (content-08)", () => {
  it("PUT rejects an invalid doc with 422 field errors and writes NOTHING", async () => {
    cover("content-api-validate-write");
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/bad-item",
      payload: {
        id: "bad-item",
        schema: "item@1",
        name: "", // min(1)
        cost: -5, // min(0)
        tier: 99, // max(5)
        bogus: true, // strict()
        tags: [],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { errors: { path: string; message: string }[] };
    const paths = body.errors.map((e) => e.path);
    expect(paths).toContain("name");
    expect(paths).toContain("cost");
    expect(paths).toContain("tier");
    // the invalid doc must never have been written
    expect(existsSync(join(root, "items", "bad-item.json"))).toBe(false);
    // and the index/manifest are untouched
    const index = JSON.parse(readFileSync(join(root, "items", "_index.json"), "utf8"));
    expect(index.entries).toHaveLength(1);
  });

  it("PUT with mismatched url/doc id or wrong schema tag is a 422", async () => {
    const wrongId = await app.inject({
      method: "PUT",
      url: "/content-api/items/other-id",
      payload: { ...ITEM },
    });
    expect(wrongId.statusCode).toBe(422);
    expect(wrongId.json().errors.map((e: { path: string }) => e.path)).toContain("id");

    const wrongTag = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      payload: { ...ITEM, schema: "augment@1" },
    });
    expect(wrongTag.statusCode).toBe(422);
    expect(wrongTag.json().errors.map((e: { path: string }) => e.path)).toContain("schema");
  });

  it("valid PUT atomically writes, returns hashes, and reindexes", async () => {
    const updated = { ...ITEM, cost: 950 };
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      payload: updated,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { hash: string; collectionHash: string; contentVersion: string };
    expect(body.hash).toBe(hashDoc(updated));
    expect(body.contentVersion).toMatch(/^cv_[0-9a-f]{12}$/);

    // file really changed + index picked up the new hash (incremental reindex)
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(950);
    const index = JSON.parse(readFileSync(join(root, "items", "_index.json"), "utf8"));
    expect(index.entries[0].hash).toBe(body.hash);
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
    expect(manifest.contentVersion).toBe(body.contentVersion);
    // editing a doc must CHANGE the collection hash and contentVersion
    expect(index.hash).toBe(body.collectionHash);
    // no tmp litter from the atomic write
    expect(readdirSync(join(root, "items")).filter((f) => f.includes(".tmp"))).toEqual([]);
  });
});

describe("AI change control", () => {
  it("closes the ordinary CRUD bypass for vfx-scripts", async () => {
    const candidate = {
      id: "skill.ai",
      schema: "vfx-script@1",
      abilityId: "skill.ai",
      segments: [{ kind: "floatingText", on: "castStart", text: "candidate" }],
    };
    const direct = await app.inject({
      method: "PUT",
      url: "/content-api/vfx-scripts/skill.ai",
      payload: candidate,
    });
    expect(direct.statusCode).toBe(409);
    expect(direct.json().error).toContain("人工核准");
    expect(existsSync(join(root, "vfx-scripts", "skill.ai.json"))).toBe(false);
  });

  it("keeps candidates non-live until an exact human-approved hash is explicitly promoted", async () => {
    const candidate = { ...ITEM, cost: 975 };
    const submitted = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "items", id: ITEM.id },
        purpose: "production-candidate",
        candidate,
        summary: "AI balance proposal",
      },
    });
    expect(submitted.statusCode).toBe(201);
    const proposal = submitted.json().proposal as {
      key: string;
      candidateHash: string;
      reviewHash: string;
      promotable: boolean;
    };
    expect(proposal.promotable).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "items", `${ITEM.id}.json`), "utf8")).cost).toBe(900);

    const early = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/promote",
      payload: { key: proposal.key, candidateHash: proposal.candidateHash, reviewHash: proposal.reviewHash },
    });
    expect(early.statusCode).toBe(409);

    const approved = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: proposal.key,
        candidateHash: proposal.candidateHash,
        reviewHash: proposal.reviewHash,
        verdict: "approve",
        reviewer: "Owner",
        note: "數值與演出均已人工確認",
      },
    });
    expect(approved.statusCode).toBe(200);

    const promoted = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/promote",
      payload: { key: proposal.key, candidateHash: proposal.candidateHash, reviewHash: proposal.reviewHash },
    });
    expect(promoted.statusCode).toBe(200);
    expect(JSON.parse(readFileSync(join(root, "items", `${ITEM.id}.json`), "utf8")).cost).toBe(975);
    expect((await app.inject({ url: "/content-api/ai-review/proposals" })).json().items[0].status).toBe("promoted");
  });

  it("invalidates approval when live content drifts after submission", async () => {
    const submitted = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "items", id: ITEM.id },
        purpose: "production-candidate",
        candidate: { ...ITEM, cost: 980 },
      },
    });
    const proposal = submitted.json().proposal as { key: string; candidateHash: string; reviewHash: string };
    await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: proposal.key,
        candidateHash: proposal.candidateHash,
        reviewHash: proposal.reviewHash,
        verdict: "approve",
        reviewer: "Owner",
        note: "ok",
      },
    });
    await app.inject({ method: "PUT", url: `/content-api/items/${ITEM.id}`, payload: { ...ITEM, cost: 901 } });
    const promoted = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/promote",
      payload: { key: proposal.key, candidateHash: proposal.candidateHash, reviewHash: proposal.reviewHash },
    });
    expect(promoted.statusCode).toBe(409);
    expect(promoted.json().error).toContain("送審後已變更");
    expect(JSON.parse(readFileSync(join(root, "items", `${ITEM.id}.json`), "utf8")).cost).toBe(901);
  });

  it("forces all eight acceptance IDs to non-promotable fixtures", async () => {
    let proposal!: {
      key: string;
      candidateHash: string;
      reviewHash: string;
      purpose: string;
      promotable: boolean;
    };
    for (const id of VFX_FORGE_ACCEPTANCE_IDS) {
      const candidate = {
        id,
        schema: "vfx-script@1",
        abilityId: id,
        segments: [{ kind: "floatingText", on: "castStart", text: "fixture" }],
      };
      const submitted = await app.inject({
        method: "POST",
        url: "/content-api/ai-review/proposals",
        payload: {
          target: { collection: "vfx-scripts", id },
          // Deliberately lie about the purpose: the server, not the UI, owns
          // the fixture classification and must override all eight IDs.
          purpose: "production-candidate",
          candidate,
          visualEvidence: VISUAL_EVIDENCE,
          visualAudit: VISUAL_AUDIT,
          autoVisualScore: VISUAL_AUDIT.autoVisualScore,
        },
      });
      expect(submitted.statusCode, id).toBe(201);
      proposal = submitted.json().proposal as typeof proposal;
      expect(proposal, id).toMatchObject({ purpose: "editor-capability-fixture", promotable: false });
      expect(submitted.json().proposal.visualEvidence, id).toHaveLength(2);
      expect(existsSync(join(root, "vfx-scripts", `${id}.json`)), id).toBe(false);
    }

    const noScore = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: proposal.key,
        candidateHash: proposal.candidateHash,
        reviewHash: proposal.reviewHash,
        verdict: "pass",
        reviewer: "Owner",
        note: "looks right",
      },
    });
    expect(noScore.statusCode).toBe(400);
    const passed = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: proposal.key,
        candidateHash: proposal.candidateHash,
        reviewHash: proposal.reviewHash,
        verdict: "pass",
        reviewer: "Owner",
        note: "Editor can express this scene",
        humanVisualScore: 4,
      },
    });
    expect(passed.statusCode).toBe(200);
    const promoted = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/promote",
      payload: { key: proposal.key, candidateHash: proposal.candidateHash, reviewHash: proposal.reviewHash },
    });
    expect(promoted.statusCode).toBe(409);
    expect(promoted.json().error).toContain("永遠不能 Promote");
  });

  it("requires candidate-bound visual evidence for VFX and rejects malformed image payloads", async () => {
    const candidate = {
      id: "skill.ai",
      schema: "vfx-script@1",
      abilityId: "skill.ai",
      segments: [{ kind: "floatingText", on: "castStart", text: "candidate" }],
    };
    const missing = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: { target: { collection: "vfx-scripts", id: candidate.id }, purpose: "production-candidate", candidate },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toContain("至少需要 1 張");

    const malformed = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "vfx-scripts", id: candidate.id },
        purpose: "production-candidate",
        candidate,
        visualEvidence: [{ ...VISUAL_EVIDENCE[0], dataUrl: "https://example.com/proof.png" }],
      },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error).toContain("PNG/WebP data URL");

    const missingAudit = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "vfx-scripts", id: candidate.id },
        purpose: "production-candidate",
        candidate,
        visualEvidence: [VISUAL_EVIDENCE[0]],
      },
    });
    expect(missingAudit.statusCode).toBe(400);
    expect(missingAudit.json().error).toContain("GPU 視覺稽核收據");

    const legacyAudit = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "vfx-scripts", id: candidate.id },
        purpose: "production-candidate",
        candidate,
        visualEvidence: [VISUAL_EVIDENCE[0]],
        visualAudit: {
          ...VISUAL_AUDIT,
          schema: "ggd-vfx-visual-audit@1",
          worst: Object.fromEntries(Object.entries(VISUAL_AUDIT.worst)
            .filter(([key]) => key !== "diagnosticCheckerShare")),
        },
        autoVisualScore: VISUAL_AUDIT.autoVisualScore,
      },
    });
    expect(legacyAudit.statusCode).toBe(400);
    expect(legacyAudit.json().error).toContain("棋盤貼圖");

    const missingFrameAudit = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "vfx-scripts", id: candidate.id },
        purpose: "production-candidate",
        candidate,
        visualEvidence: [{
          label: VISUAL_EVIDENCE[0]!.label,
          dataUrl: VISUAL_EVIDENCE[0]!.dataUrl,
          atMs: VISUAL_EVIDENCE[0]!.atMs,
          view: VISUAL_EVIDENCE[0]!.view,
        }],
        visualAudit: VISUAL_AUDIT,
        autoVisualScore: VISUAL_AUDIT.autoVisualScore,
      },
    });
    expect(missingFrameAudit.statusCode).toBe(400);
    expect(missingFrameAudit.json().error).toContain("每張關鍵格");

    const submitted = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "vfx-scripts", id: candidate.id },
        purpose: "production-candidate",
        candidate,
        visualEvidence: [VISUAL_EVIDENCE[0]],
        visualAudit: VISUAL_AUDIT,
        autoVisualScore: VISUAL_AUDIT.autoVisualScore,
      },
    });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json().proposal.visualEvidence).toEqual([VISUAL_EVIDENCE[0]]);
    expect(submitted.json().proposal.visualAudit).toEqual(VISUAL_AUDIT);
    const proposal = submitted.json().proposal as { key: string; candidateHash: string; reviewHash: string };
    const noScore = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: proposal.key,
        candidateHash: proposal.candidateHash,
        reviewHash: proposal.reviewHash,
        verdict: "approve",
        reviewer: "Owner",
        note: "looks right",
      },
    });
    expect(noScore.statusCode).toBe(400);
    expect(noScore.json().error).toContain("VFX 候選必須填");
  });

  it("allows an old @1 VFX receipt to be failed but never approved", async () => {
    const candidate = {
      id: "skill.legacy",
      schema: "vfx-script@1",
      abilityId: "skill.legacy",
      segments: [{ kind: "floatingText", on: "castStart", text: "legacy" }],
    };
    const submitted = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "vfx-scripts", id: candidate.id },
        purpose: "production-candidate",
        candidate,
        visualEvidence: [VISUAL_EVIDENCE[0]],
        visualAudit: VISUAL_AUDIT,
        autoVisualScore: VISUAL_AUDIT.autoVisualScore,
      },
    });
    expect(submitted.statusCode).toBe(201);
    const file = join(root, ".review", "ai-proposals", "vfx-scripts--skill.legacy.json");
    const stored = JSON.parse(readFileSync(file, "utf8"));
    stored.visualAudit.schema = "ggd-vfx-visual-audit@1";
    delete stored.visualAudit.worst.diagnosticCheckerShare;
    writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    const item = (await app.inject({ url: "/content-api/ai-review/proposals" })).json().items[0];

    const approve = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: item.key,
        candidateHash: item.candidateHash,
        reviewHash: item.reviewHash,
        verdict: "approve",
        reviewer: "Owner",
        note: "must not pass legacy audit",
        humanVisualScore: 8,
      },
    });
    expect(approve.statusCode).toBe(400);
    expect(approve.json().error).toContain("棋盤貼圖");

    const reject = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: item.key,
        candidateHash: item.candidateHash,
        reviewHash: item.reviewHash,
        verdict: "reject",
        reviewer: "Owner",
        note: "legacy audit is insufficient",
        humanVisualScore: 0,
      },
    });
    expect(reject.statusCode).toBe(200);
  });

  it("invalidates a verdict when screenshots or GPU review material change without changing candidate JSON", async () => {
    const candidate = {
      id: "skill.review-hash",
      schema: "vfx-script@1",
      abilityId: "skill.review-hash",
      segments: [{ kind: "floatingText", on: "castStart", text: "same candidate" }],
    };
    const first = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "vfx-scripts", id: candidate.id },
        purpose: "production-candidate",
        candidate,
        summary: "first frame",
        visualEvidence: [VISUAL_EVIDENCE[0]],
        visualAudit: VISUAL_AUDIT,
        autoVisualScore: VISUAL_AUDIT.autoVisualScore,
      },
    });
    expect(first.statusCode).toBe(201);
    const reviewed = first.json().proposal as { key: string; candidateHash: string; reviewHash: string };
    const verdict = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: reviewed.key,
        candidateHash: reviewed.candidateHash,
        reviewHash: reviewed.reviewHash,
        verdict: "approve",
        reviewer: "Owner",
        note: "reviewed the first evidence",
        humanVisualScore: 8,
      },
    });
    expect(verdict.statusCode).toBe(200);

    const changed = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "vfx-scripts", id: candidate.id },
        purpose: "production-candidate",
        candidate,
        summary: "second frame",
        visualEvidence: [VISUAL_EVIDENCE[1]],
        visualAudit: { ...VISUAL_AUDIT, worstAtMs: 1_200 },
        autoVisualScore: VISUAL_AUDIT.autoVisualScore,
      },
    });
    expect(changed.statusCode).toBe(201);
    const resubmitted = changed.json().proposal as { key: string; candidateHash: string; reviewHash: string };
    expect(resubmitted.candidateHash).toBe(reviewed.candidateHash);
    expect(resubmitted.reviewHash).not.toBe(reviewed.reviewHash);

    const queue = (await app.inject({ url: "/content-api/ai-review/proposals" })).json();
    expect(queue.items[0].status).toBe("changed-after-review");
    const stale = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: resubmitted.key,
        candidateHash: resubmitted.candidateHash,
        reviewHash: reviewed.reviewHash,
        verdict: "approve",
        reviewer: "Owner",
        note: "must not carry over",
        humanVisualScore: 8,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toContain("擷圖／稽核收據已變更");

    const stalePromotion = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/promote",
      payload: {
        key: resubmitted.key,
        candidateHash: reviewed.candidateHash,
        reviewHash: reviewed.reviewHash,
      },
    });
    expect(stalePromotion.statusCode).toBe(409);
    expect(stalePromotion.json().error).toContain("審查材料已變更");
  });

  it("recomputes candidateHash from proposal bytes instead of trusting a manually stale stored hash", async () => {
    const submitted = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/proposals",
      payload: {
        target: { collection: "items", id: ITEM.id },
        purpose: "production-candidate",
        candidate: { ...ITEM, cost: 970 },
        summary: "original",
      },
    });
    expect(submitted.statusCode).toBe(201);
    const original = submitted.json().proposal as { key: string; candidateHash: string; reviewHash: string };
    const proposalFile = join(root, ".review", "ai-proposals", "items--ember-rod.json");
    const stored = JSON.parse(readFileSync(proposalFile, "utf8"));
    stored.candidate.cost = 5_000;
    // Deliberately leave both stored hashes unchanged to simulate an unsafe
    // manual edit or a stale external writer.
    writeFileSync(proposalFile, `${JSON.stringify(stored, null, 2)}\n`, "utf8");

    const queue = (await app.inject({ url: "/content-api/ai-review/proposals" })).json();
    expect(queue.items[0].candidateHash).not.toBe(original.candidateHash);
    expect(queue.items[0].reviewHash).not.toBe(original.reviewHash);
    const staleVerdict = await app.inject({
      method: "POST",
      url: "/content-api/ai-review/verdicts",
      payload: {
        key: original.key,
        candidateHash: original.candidateHash,
        reviewHash: original.reviewHash,
        verdict: "approve",
        reviewer: "Owner",
        note: "must not authorize edited bytes",
      },
    });
    expect(staleVerdict.statusCode).toBe(409);
    expect(staleVerdict.json().error).toContain("候選內容已變更");
  });
});

describe("path traversal (content-09)", () => {
  it("blocks ids and collections that try to escape content/", async () => {
    cover("content-api-path-traversal");
    const attempts = [
      { method: "GET" as const, url: "/content-api/items/..%2f..%2fmanifest" },
      { method: "PUT" as const, url: "/content-api/items/..%2f..%2fpwn" },
      { method: "PUT" as const, url: "/content-api/items/%2e%2e%2fpwn" },
      { method: "DELETE" as const, url: "/content-api/items/..%2f_index" },
      { method: "PUT" as const, url: "/content-api/..%2f..%2fdata/pwn" },
      { method: "PUT" as const, url: "/content-api/items/.hidden" },
      { method: "PUT" as const, url: "/content-api/items/UPPER" },
    ];
    for (const a of attempts) {
      const res = await app.inject({
        method: a.method,
        url: a.url,
        ...(a.method === "PUT" ? { payload: { id: "pwn", schema: "item@1" } } : {}),
      });
      expect([400, 404], `${a.method} ${a.url} -> ${res.statusCode}`).toContain(res.statusCode);
    }
    // nothing escaped the root: parent tmp dir only contains our content root
    expect(existsSync(join(root, "..", "pwn.json"))).toBe(false);
    expect(existsSync(join(root, "pwn.json"))).toBe(false);
  });
});

describe("assets route (editor 3D preview: editor-asset-route)", () => {
  const GLB = Buffer.concat([Buffer.from("glTF"), Buffer.from([2, 0, 0, 0, 42, 0, 0, 0, 9, 9])]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it("serves GLB models and particle textures with correct content types", async () => {
    cover("editor-asset-route");
    mkdirSync(join(root, "assets/models/champions"), { recursive: true });
    mkdirSync(join(root, "assets/textures/particles"), { recursive: true });
    writeFileSync(join(root, "assets/models/champions/blocky-mage.glb"), GLB);
    writeFileSync(join(root, "assets/textures/particles/flame_01.png"), PNG);

    const glb = await app.inject({ url: "/content-api/assets/models/champions/blocky-mage.glb" });
    expect(glb.statusCode).toBe(200);
    expect(glb.headers["content-type"]).toBe("model/gltf-binary");
    expect(glb.rawPayload.equals(GLB)).toBe(true);
    expect(glb.rawPayload.subarray(0, 4).toString()).toBe("glTF");

    const png = await app.inject({ url: "/content-api/assets/textures/particles/flame_01.png" });
    expect(png.statusCode).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.rawPayload.equals(PNG)).toBe(true);
  });

  it("404s missing assets and refuses to escape content/assets", async () => {
    const missing = await app.inject({ url: "/content-api/assets/models/props/nope.glb" });
    expect(missing.statusCode).toBe(404);

    const attempts = [
      "/content-api/assets/../items/ember-rod.json",
      "/content-api/assets/%2e%2e%2fitems/ember-rod.json",
      "/content-api/assets/..%2f..%2fmanifest.json",
      "/content-api/assets/models//x.glb",
      "/content-api/assets/.",
    ];
    for (const url of attempts) {
      const res = await app.inject({ url });
      expect([400, 404], `${url} -> ${res.statusCode}`).toContain(res.statusCode);
      // never leaks a JSON doc through the asset route
      expect(res.headers["content-type"]).not.toContain("model/");
      expect(String(res.body)).not.toContain('"Ember Rod"');
    }
  });
});

describe("asset write route (editor AI-icon Accept: content-api-asset-write)", () => {
  // 1x1 transparent PNG
  const PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  it("writes a base64 PNG under content/assets, creating parent dirs (atomic)", async () => {
    cover("content-api-asset-write");
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/assets/icons/champions/hero.png",
      payload: { base64: PNG_B64 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { path: string; bytes: number };
    expect(body.path).toBe("assets/icons/champions/hero.png");
    expect(body.bytes).toBeGreaterThan(0);

    const file = join(root, "assets/icons/champions/hero.png");
    expect(existsSync(file)).toBe(true);
    // real PNG magic bytes landed on disk
    expect(readFileSync(file).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    // no tmp litter from the atomic write
    expect(readdirSync(join(root, "assets/icons/champions")).filter((f) => f.includes(".tmp"))).toEqual([]);

    // and it is now readable back through the GET asset route
    const get = await app.inject({ url: "/content-api/assets/icons/champions/hero.png" });
    expect(get.statusCode).toBe(200);
    expect(get.headers["content-type"]).toBe("image/png");
  });

  it("accepts a data: URL prefix and strips it before decoding", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/assets/icons/items/rod.png",
      payload: { base64: `data:image/png;base64,${PNG_B64}` },
    });
    expect(res.statusCode).toBe(200);
    expect(readFileSync(join(root, "assets/icons/items/rod.png")).subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("rejects non-image extensions, missing body, and path escapes", async () => {
    const badExt = await app.inject({
      method: "PUT",
      url: "/content-api/assets/icons/x.json",
      payload: { base64: PNG_B64 },
    });
    expect(badExt.statusCode).toBe(400);

    const noBody = await app.inject({
      method: "PUT",
      url: "/content-api/assets/icons/champions/y.png",
      payload: { notBase64: true },
    });
    expect(noBody.statusCode).toBe(422);

    for (const url of [
      "/content-api/assets/..%2f..%2fpwn.png",
      "/content-api/assets/%2e%2e%2fpwn.png",
      "/content-api/assets/icons//z.png",
    ]) {
      const res = await app.inject({ method: "PUT", url, payload: { base64: PNG_B64 } });
      expect([400, 404], `${url} -> ${res.statusCode}`).toContain(res.statusCode);
    }
    // nothing escaped the content root
    expect(existsSync(join(root, "..", "pwn.png"))).toBe(false);
  });
});

describe("create/delete/dry-run (capi-02..04)", () => {
  it("POST creates (201) and rejects duplicates (409)", async () => {
    cover("content-api-create-conflict");
    const doc = { id: "swift-boots", schema: "item@1", name: "Swift Boots", cost: 600, tier: 1, tags: [] };
    const created = await app.inject({ method: "POST", url: "/content-api/items/swift-boots", payload: doc });
    expect(created.statusCode).toBe(201);
    const dup = await app.inject({ method: "POST", url: "/content-api/items/swift-boots", payload: doc });
    expect(dup.statusCode).toBe(409);
  });

  it("DELETE removes the doc and reindexes", async () => {
    cover("content-api-delete-reindex");
    const res = await app.inject({ method: "DELETE", url: "/content-api/items/ember-rod" });
    expect(res.statusCode).toBe(200);
    expect(existsSync(join(root, "items", "ember-rod.json"))).toBe(false);
    const index = JSON.parse(readFileSync(join(root, "items", "_index.json"), "utf8"));
    expect(index.entries).toHaveLength(0);
    expect((await app.inject({ method: "DELETE", url: "/content-api/items/ember-rod" })).statusCode).toBe(404);
  });

  it("dry-run validate returns field errors / hash without writing", async () => {
    cover("content-api-dry-validate");
    const bad = await app.inject({
      method: "POST",
      url: "/content-api/items/new-item/validate",
      payload: { id: "new-item", schema: "item@1", name: "X", cost: "not-a-number", tier: 1, tags: [] },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().errors.map((e: { path: string }) => e.path)).toContain("cost");
    expect(existsSync(join(root, "items", "new-item.json"))).toBe(false);

    const good = await app.inject({
      method: "POST",
      url: "/content-api/items/new-item/validate",
      payload: { id: "new-item", schema: "item@1", name: "X", cost: 100, tier: 1, tags: [] },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().hash).toMatch(/^[0-9a-f]{12}$/);
    expect(existsSync(join(root, "items", "new-item.json"))).toBe(false);
  });
});

describe("production refusal (capi-05)", () => {
  it("buildServer throws when NODE_ENV=production", () => {
    cover("content-api-prod-refusal");
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => buildServer({ contentDir: root })).toThrow(/refuses/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("SSE hub (capi-06)", () => {
  it("streams content:changed frames to subscribers; writes publish to the hub", async () => {
    cover("content-api-sse-events");
    const hub = new SseHub();
    const chunks: string[] = [];
    const unsub = hub.subscribe({ write: (c) => chunks.push(c) });
    hub.publish({ type: "content:changed", collection: "items", id: "x", change: "change" });
    expect(chunks.join("")).toContain("event: content:changed");
    expect(chunks.join("")).toContain('"collection":"items"');
    unsub();
    hub.publish({ type: "content:changed", collection: "items", id: "y", change: "add" });
    expect(chunks.join("")).not.toContain('"id":"y"');

    // the server's hub receives an event on every successful write
    const seen: string[] = [];
    app.sseHub.subscribe({ write: (c) => seen.push(c) });
    await app.inject({ method: "PUT", url: "/content-api/items/ember-rod", payload: { ...ITEM, cost: 901 } });
    expect(seen.join("")).toContain('"id":"ember-rod"');
  });
});

/**
 * The content bundle (content/bundle.json) is a WHOLE-TREE artifact produced by
 * `pnpm content:build`. This service rewrites ONE doc at a time, so any bundle
 * on disk goes stale the instant a write lands — and a stale bundle is worse
 * than no bundle: the client would hydrate old docs AND an old contentVersion,
 * so the version gate would not even fire, while the game-server (which reads
 * the filesystem directly) already has the new ones. Every mutating verb must
 * therefore delete it, dropping the client back to the always-fresh per-doc path.
 */
describe("content bundle staleness guard", () => {
  const bundleFile = (): string => join(root, "bundle.json");

  it("PUT deletes a stale bundle", async () => {
    expect(existsSync(bundleFile())).toBe(true); // rebuildAllIndexes emitted it
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      payload: { ...ITEM, cost: 1000 },
    });
    expect(res.statusCode).toBe(200);
    expect(existsSync(bundleFile())).toBe(false);
  });

  it("POST (create) deletes a stale bundle", async () => {
    expect(existsSync(bundleFile())).toBe(true);
    const res = await app.inject({
      method: "POST",
      url: "/content-api/items/frost-rod",
      payload: { ...ITEM, id: "frost-rod", name: "Frost Rod" },
    });
    expect(res.statusCode).toBe(201);
    expect(existsSync(bundleFile())).toBe(false);
  });

  it("DELETE deletes a stale bundle", async () => {
    expect(existsSync(bundleFile())).toBe(true);
    const res = await app.inject({
      method: "DELETE",
      url: "/content-api/items/ember-rod",
    });
    expect(res.statusCode).toBe(200);
    expect(existsSync(bundleFile())).toBe(false);
  });

  it("a REJECTED write leaves the bundle alone (nothing became stale)", async () => {
    expect(existsSync(bundleFile())).toBe(true);
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      payload: { ...ITEM, cost: "free" },
    });
    expect(res.statusCode).toBe(422);
    expect(existsSync(bundleFile())).toBe(true);
  });

  it("reads never touch the bundle", async () => {
    await app.inject({ url: "/content-api/manifest" });
    await app.inject({ url: "/content-api/items/_index" });
    await app.inject({ url: "/content-api/items/ember-rod" });
    expect(existsSync(bundleFile())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 鑄技工坊 (#141/#205) — the LINE-EDIT member patches
// ---------------------------------------------------------------------------
//
// PUT round-trips the whole doc through JSON.stringify, which renormalises the
// Python exporter's `30.0` to `30` across the ENTIRE file. These routes splice
// one member's bytes and leave everything else alone — so the assertions here
// are as much about what did NOT change as about what did.

const ABILITY = {
  id: "hero-x.q",
  schema: "ability@1",
  name: "01-01 Test Strike",
  slot: "Q",
  castType: "self",
  maxRank: 5,
  cooldown: [8, 8, 8, 8, 8],
  manaCost: [50, 50, 50, 50, 50],
  range: 6,
  effects: [],
};

/** A champion written the way the Python exporter writes one: `X.0` floats. */
const PY_CHAMPION_TEXT = `{
  "id": "hero-x",
  "schema": "champion@1",
  "name": "Test Hero",
  "role": "fighter",
  "attackType": "melee",
  "modelKey": "champ.test",
  "baseStats": { "maxHealth": 600.0, "ad": 55.0 },
  "growth": { "maxHealth": 80.0, "ad": 3.0 },
  "abilities": {
    "Q": {
      "id": "hero-x.q",
      "name": "01-01 Test Strike",
      "slot": "Q",
      "castType": "self",
      "maxRank": 5,
      "cooldown": [8, 8, 8, 8, 8],
      "manaCost": [50, 50, 50, 50, 50],
      "range": 6.0,
      "effects": []
    },
    "W": {
      "id": "hero-x.w",
      "name": "01-02 Two",
      "slot": "W",
      "castType": "self",
      "maxRank": 5,
      "cooldown": [30, 30, 30, 30, 30],
      "manaCost": [50, 50, 50, 50, 50],
      "range": 9.17,
      "effects": []
    },
    "E": {
      "id": "hero-x.e",
      "name": "01-03 Three",
      "slot": "E",
      "castType": "self",
      "maxRank": 5,
      "cooldown": [12, 12, 12, 12, 12],
      "manaCost": [50, 50, 50, 50, 50],
      "range": 3.0,
      "effects": []
    },
    "R": {
      "id": "hero-x.r",
      "name": "01-04 Four",
      "slot": "R",
      "castType": "self",
      "maxRank": 3,
      "cooldown": [100, 100, 100],
      "manaCost": [100, 100, 100],
      "range": 12.0,
      "effects": []
    }
  },
  "skillOrder": ["Q", "W", "E", "R"],
  "buildPriority": [],
  "tags": []
}
`;

describe("鑄技工坊 member patches (content-api-member-patch)", () => {
  const championFile = (): string => join(root, "champions", "hero-x.json");
  const abilityFile = (): string => join(root, "abilities", "hero-x.q.json");

  beforeEach(() => {
    mkdirSync(join(root, "champions"), { recursive: true });
    writeFileSync(championFile(), PY_CHAMPION_TEXT);
    writeDocAtomic(root, "abilities", ABILITY);
    rebuildAllIndexes(root);
  });

  it("PATCHes one champion slot and leaves every other byte — floats included", async () => {
    cover("content-api-member-patch");
    const before = readFileSync(championFile(), "utf8");
    const res = await app.inject({
      method: "PATCH",
      url: "/content-api/champions/hero-x/abilities/Q",
      payload: {
        ...ABILITY,
        schema: undefined,
        castType: "targeted",
        targetsEnemies: true,
        template: { ref: "tpl-single-strike", params: { damageType: "magic" } },
        effects: [{ kind: "damage", damageType: "magic", amount: { perRank: [100] } }],
      },
    });
    expect(res.statusCode).toBe(200);
    const after = readFileSync(championFile(), "utf8");

    // the OTHER slots' bytes are untouched: W's 9.17, E's 3.0, R's 12.0 and the
    // top-level 600.0/55.0 — a whole-doc PUT would have rewritten all of them
    expect(after).toContain('"range": 9.17');
    expect(after).toContain('"range": 3.0');
    expect(after).toContain('"range": 12.0');
    expect(after).toContain('"maxHealth": 600.0');
    expect(after).toContain('"ad": 55.0');
    // …and the patch landed
    const parsed = JSON.parse(after) as { abilities: { Q: { castType: string } } };
    expect(parsed.abilities.Q.castType).toBe("targeted");
    // the change is CONFINED: the E/W/R spans are byte-identical to before
    const span = (t: string, slot: string): string =>
      t.slice(t.indexOf(`"${slot}": {`), t.indexOf("}", t.indexOf(`"effects": []`, t.indexOf(`"${slot}": {`))));
    for (const slot of ["W", "E", "R"]) {
      expect(span(after, slot)).toBe(span(before, slot));
    }
  });

  it("PATCHes only the named members of a standalone ability doc", async () => {
    cover("content-api-member-patch");
    const res = await app.inject({
      method: "PATCH",
      url: "/content-api/abilities/hero-x.q",
      payload: {
        castType: "targeted",
        effects: [{ kind: "damage", damageType: "magic", amount: { perRank: [100] } }],
      },
    });
    expect(res.statusCode).toBe(200);
    const doc = JSON.parse(readFileSync(abilityFile(), "utf8")) as {
      castType: string;
      effects: unknown[];
      name: string;
    };
    expect(doc.castType).toBe("targeted");
    expect(doc.effects).toHaveLength(1);
    expect(doc.name).toBe("01-01 Test Strike"); // untouched members survive
  });

  it("rejects an unknown slot with 404 and writes nothing", async () => {
    cover("content-api-member-patch");
    const before = readFileSync(championFile(), "utf8");
    const res = await app.inject({
      method: "PATCH",
      url: "/content-api/champions/hero-x/abilities/Z",
      payload: { id: "hero-x.z" },
    });
    expect(res.statusCode).toBe(404);
    expect(readFileSync(championFile(), "utf8")).toBe(before);
  });

  it("rejects a patch that would make the WHOLE champion invalid, leaving the file untouched", async () => {
    cover("content-api-member-patch");
    const before = readFileSync(championFile(), "utf8");
    const res = await app.inject({
      method: "PATCH",
      url: "/content-api/champions/hero-x/abilities/Q",
      // slot "W" in the Q position — zChampionDoc's superRefine rejects it
      payload: { ...ABILITY, schema: undefined, slot: "W" },
    });
    expect(res.statusCode).toBe(422);
    expect(readFileSync(championFile(), "utf8")).toBe(before);
  });

  it("rejects an ability patch that would make the doc invalid", async () => {
    cover("content-api-member-patch");
    const before = readFileSync(abilityFile(), "utf8");
    const res = await app.inject({
      method: "PATCH",
      url: "/content-api/abilities/hero-x.q",
      payload: { castType: "not-a-cast-type" },
    });
    expect(res.statusCode).toBe(422);
    expect(readFileSync(abilityFile(), "utf8")).toBe(before);
  });

  it("snapshots the file for undo before patching", async () => {
    cover("content-api-member-patch");
    await app.inject({
      method: "PATCH",
      url: "/content-api/abilities/hero-x.q",
      payload: { castType: "targeted" },
    });
    const backups = await app.inject({ url: "/content-api/abilities/hero-x.q/backups" });
    expect(backups.statusCode).toBe(200);
    expect((backups.json() as { entries: unknown[] }).entries.length).toBeGreaterThan(0);
  });

  it("POST /rebuild regenerates the indexes + manifest (content:build as an endpoint)", async () => {
    cover("content-api-member-patch");
    const res = await app.inject({ method: "POST", url: "/content-api/rebuild", payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { collections: number; contentVersion: string };
    expect(body.collections).toBeGreaterThan(0);
    expect(body.contentVersion).toMatch(/[0-9a-f]/);
    expect(existsSync(join(root, "champions", "_index.json"))).toBe(true);
  });

  it("PATCH is a MUTATING verb — a non-loopback peer is refused by the guard", async () => {
    cover("content-api-member-patch");
    const res = await app.inject({
      method: "PATCH",
      url: "/content-api/abilities/hero-x.q",
      payload: { castType: "targeted" },
      remoteAddress: "10.1.2.3",
    });
    expect(res.statusCode).toBe(403);
  });
});
