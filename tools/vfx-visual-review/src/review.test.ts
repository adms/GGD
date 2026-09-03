import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECK_KEYS, parseReviewRequest, type ModelResult } from "./contracts.js";
import { classifyModelResult, prepareReview, runReview, stripOwnerDialogue } from "./review.js";

describe("VFX visual review guardrails", () => {
  it("removes Owner dialogue and keeps low-confidence passes for humans", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-vfx-review-"));
    mkdirSync(join(dir, "frames"));
    writeFileSync(join(dir, "frames", "impact.png"), Buffer.from("89504e470d0a1a0a00000000", "hex"));
    const request = parseReviewRequest({
      schema: "ggd-vfx-visual-review-request@1",
      subject: { kind: "ability", id: "E002.w" },
      ownerDescription: "召喚雷擊。\n「別站著發呆！」\n命中點出現藍白爆光。",
      expectation: {
        summary: "藍白雷擊在命中點爆發",
        vfxFamily: "lightning",
        dominantColors: ["blue", "white"],
        impactPlacement: "target hit point",
      },
      candidateFrames: [{ path: "frames/impact.png", atMs: 320, phase: "impact" }],
    });
    const prepared = prepareReview(request, dir);
    expect(stripOwnerDialogue(request.ownerDescription ?? "")).toBe("召喚雷擊。 命中點出現藍白爆光。");
    expect(prepared.prompt).not.toContain("別站著發呆");
    expect(prepared.sourceDigest).toMatch(/^[a-f0-9]{64}$/);

    const checks = Object.fromEntries(CHECK_KEYS.map((key) => [key, {
      status: "pass", reason: "visible", evidenceFrames: [0],
    }])) as ModelResult["checks"];
    const result: ModelResult = { overall: "pass", confidence: 0.7, checks, notes: [] };
    expect(classifyModelResult(prepared, result)).toBe("needs-human-review");

    const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as { response_format?: unknown; messages: unknown[] };
      expect(sent.response_format).toBeTruthy();
      expect(JSON.stringify(sent.messages)).not.toContain("別站著發呆");
      const percentageResult = { ...result, confidence: 70 };
      return new Response(JSON.stringify({
        model: "qwen3.8-local",
        choices: [{ message: { content: JSON.stringify(percentageResult) } }],
      }));
    }) as typeof fetch;
    const report = await runReview(prepared, {
      baseUrl: "http://127.0.0.1:1234/v1", model: "qwen/qwen3.8-27b",
    }, fetchMock);
    expect(report.classification).toBe("needs-human-review");
    expect(report.authority).toBe("advisory-only");
    expect(report.contractWarnings[0]).toContain("normalized");
  });
});
