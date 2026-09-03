import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECK_KEYS, parseReviewRequest, type ModelResult } from "./contracts.js";
import { localLlmEnabled, selectReviewFrames, shouldEscalate } from "./batchCore.js";
import {
  assertLoopbackApiRoot,
  classifyModelResult,
  disabledReviewReport,
  prepareReview,
  runReview,
  stripOwnerDialogue,
  unavailableReviewReport,
} from "./review.js";

describe("VFX visual review guardrails", () => {
  it("defaults local inference off and bounds the temporal sample to four frames", () => {
    expect(localLlmEnabled(false, undefined)).toBe(false);
    expect(localLlmEnabled(false, "1")).toBe(true);
    expect(localLlmEnabled(true, undefined)).toBe(true);
    const frames = Array.from({ length: 10 }, (_, index) => ({
      file: `${index}.webp`, atMs: index * 100, label: `phase ${index}`,
    }));
    expect(selectReviewFrames(frames).map((frame) => frame.atMs)).toEqual([0, 300, 600, 900]);
    expect(selectReviewFrames(frames, 2).map((frame) => frame.atMs)).toEqual([0, 900]);
    expect(selectReviewFrames([{ ...frames[0]!, diagnosticOnly: true }, frames[1]!])).toEqual([frames[1]]);
  });

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

    const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:1234/api/v1/chat");
      const sent = JSON.parse(String(init?.body)) as { input: Array<Record<string, unknown>>; reasoning: string; store: boolean };
      expect(sent.reasoning).toBe("low");
      expect(sent.store).toBe(false);
      expect(JSON.stringify(sent.input)).not.toContain("別站著發呆");
      const encoded = JSON.stringify(sent.input);
      expect(encoded).toContain("data:image/png;base64,iVBORw0KGgoAAAAA");
      const percentageResult = {
        ...result,
        confidence: 70,
        checks: {
          ...result.checks,
          effectPresence: { ...result.checks.effectPresence, evidenceFrames: ["Candidate 0"] },
        },
      };
      return new Response(JSON.stringify({
        model_instance_id: "qwen3.8-local",
        output: [
          { type: "reasoning", content: "private reasoning" },
          { type: "message", content: JSON.stringify(percentageResult) },
        ],
        stats: { input_tokens: 100, total_output_tokens: 20 },
      }));
    }) as typeof fetch;
    const report = await runReview(prepared, {
      baseUrl: "http://127.0.0.1:1234/v1", model: "qwen/qwen3.8-27b",
    }, fetchMock);
    expect(report.classification).toBe("needs-human-review");
    expect(report.authority).toBe("advisory-only");
    expect(report.model.responseChannel).toBe("native-message");
    expect(report.model.usage?.totalTokens).toBe(120);
    expect(report.contractWarnings.some((warning) => warning.includes("normalized"))).toBe(true);
    expect(shouldEscalate(report)).toBe(true);
  });

  it("keeps an absent local model advisory and never accepts a remote endpoint", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-vfx-review-"));
    writeFileSync(join(dir, "impact.png"), Buffer.from("89504e470d0a1a0a00000000", "hex"));
    const request = parseReviewRequest({
      schema: "ggd-vfx-visual-review-request@1",
      subject: { kind: "ability", id: "offline.q" },
      expectation: { summary: "可人工檢查的命中特效" },
      candidateFrames: [{ path: "impact.png", atMs: 320, phase: "impact" }],
    });
    const prepared = prepareReview(request, dir);
    const report = unavailableReviewReport(prepared, {
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "local-only",
    }, new Error("connect ECONNREFUSED"));
    expect(report.classification).toBe("needs-human-review");
    expect(report.authority).toBe("advisory-only");
    expect(report.reason.code).toBe("LOCAL_MODEL_UNAVAILABLE");
    expect(unavailableReviewReport(prepared, {
      baseUrl: "http://127.0.0.1:1234/v1", model: "local-only",
    }, new Error("invalid structured result")).reason.code).toBe("LOCAL_MODEL_ERROR");
    expect(disabledReviewReport(prepared, {
      baseUrl: "http://127.0.0.1:1234/v1", model: "local-only",
    }).reason.code).toBe("LOCAL_MODEL_DISABLED");
    expect(() => assertLoopbackApiRoot("https://example.com/v1"))
      .toThrow("refusing to send images to non-loopback host");
  });
});
