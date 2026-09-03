import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECK_KEYS, parseReviewRequest, type ModelResult } from "./contracts.js";
import { adaptiveReviewFrameBudget, selectReviewFrames } from "./batchCore.js";
import { summarizeBenchmark } from "./benchmarkCore.js";
import {
  GEMINI_API_ORIGIN,
  assertGeminiModel,
  disabledGeminiReport,
  geminiEndpoint,
  resolveGeminiEnablement,
  runGeminiReview,
  unavailableGeminiReport,
} from "./gemini.js";
import { classifyModelResult, prepareReview, stripOwnerDialogue } from "./review.js";

describe("VFX visual review guardrails", () => {
  it("orders and bounds temporal samples while adapting to scene complexity", () => {
    const frames = Array.from({ length: 10 }, (_, index) => ({
      file: `${index}.webp`, atMs: index * 100, label: `phase ${index}`,
    }));
    expect(selectReviewFrames(frames).map((frame) => frame.atMs)).toEqual(frames.map((frame) => frame.atMs));
    expect(selectReviewFrames(frames, 4).map((frame) => frame.atMs)).toEqual([0, 300, 600, 900]);
    expect(selectReviewFrames(frames, 2).map((frame) => frame.atMs)).toEqual([0, 900]);
    expect(selectReviewFrames([{ ...frames[0]!, diagnosticOnly: true }, frames[1]!])).toEqual([frames[1]]);
    expect(selectReviewFrames([
      { ...frames[9]! },
      { ...frames[0]! },
      { ...frames[3]! },
      { ...frames[3]!, file: "duplicate-time.webp" },
      { ...frames[6]! },
    ])).toEqual([frames[0], frames[3], frames[6], frames[9]]);
    expect(adaptiveReviewFrameBudget(frames, false)).toBe(8);
    expect(adaptiveReviewFrameBudget(frames, true)).toBe(10);
    expect(adaptiveReviewFrameBudget(frames, true, 8)).toBe(8);
    const longSequence = Array.from({ length: 24 }, (_, index) => ({
      file: `long-${index}.webp`, atMs: index * 100, label: `beat ${index}`,
    }));
    expect(adaptiveReviewFrameBudget(longSequence, true)).toBe(18);
    expect(selectReviewFrames(longSequence)).toHaveLength(18);
    expect(() => adaptiveReviewFrameBudget(frames, true, 19)).toThrow("between 2 and 18");
  });

  it("removes Owner dialogue and keeps low-confidence passes for humans", () => {
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

  });

  it("uses only the fixed Gemini host, strips Owner dialogue, and sends two bounded keyframes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-vfx-gemini-"));
    writeFileSync(join(dir, "windup.webp"), Buffer.from("5249464600000000574542500000", "hex"));
    writeFileSync(join(dir, "impact.webp"), Buffer.from("5249464600000000574542501111", "hex"));
    const request = parseReviewRequest({
      schema: "ggd-vfx-visual-review-request@1",
      subject: { kind: "ability", id: "gemini.r" },
      ownerDescription: "先蓄力。「這句不能送出去」然後命中。",
      expectation: { summary: "藍色光束由施法者射向目標" },
      candidateFrames: [
        { path: "windup.webp", atMs: 100, phase: "phase-label-must-stay-local-a" },
        { path: "impact.webp", atMs: 500, phase: "phase-label-must-stay-local-b" },
      ],
    });
    const prepared = prepareReview(request, dir);
    const result: ModelResult = {
      overall: "pass",
      confidence: 0.95,
      checks: Object.fromEntries(CHECK_KEYS.map((key) => [key, {
        status: "pass", reason: "模型聲稱可見", evidenceFrames: [0, 1],
      }])) as ModelResult["checks"],
      notes: [],
    };
    const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-goog-api-key")).toBe("test-secret-not-persisted");
      const sent = JSON.parse(String(init?.body)) as {
        contents: Array<{ parts: Array<Record<string, unknown>> }>;
        generationConfig: Record<string, unknown>;
      };
      const serialized = JSON.stringify(sent);
      expect(serialized).not.toContain("這句不能送出去");
      expect(serialized).not.toContain("phase-label-must-stay-local");
      expect(serialized).not.toContain("test-secret-not-persisted");
      expect(sent.contents[0]!.parts.filter((part) => "inline_data" in part)).toHaveLength(2);
      expect(sent.generationConfig.responseMimeType).toBe("application/json");
      expect(sent.generationConfig.responseJsonSchema).toBeTruthy();
      expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
      expect(sent.generationConfig).not.toHaveProperty("temperature");
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
        usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 30, totalTokenCount: 120 },
        modelVersion: "gemini-3.8-flash-001",
      }));
    }) as typeof fetch;

    const report = await runGeminiReview(prepared, {
      apiKey: "test-secret-not-persisted",
      model: "gemini-flash-latest",
      reasoningEffort: "low",
    }, fetchMock);
    expect(report.authority).toBe("advisory-only");
    expect(report.classification).toBe("needs-human-review");
    expect(report.model.provider).toBe("google-gemini");
    expect(report.model.reported).toBe("gemini-3.8-flash-001");
    expect(report.model.usage?.totalTokens).toBe(120);
    expect(report.contractWarnings).toContain("Google Gemini positive verdict is not calibrated; forced to human review");
    expect(JSON.stringify(report)).not.toContain("test-secret-not-persisted");
    expect(geminiEndpoint("gemini-flash-latest")).toMatch(new RegExp(`^${GEMINI_API_ORIGIN}`));
    expect(() => assertGeminiModel("other/model")).toThrow("plain gemini-* identifier");
  });

  it("enables Gemini from a configured key, while explicit disable always wins", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-vfx-gemini-"));
    writeFileSync(join(dir, "a.png"), Buffer.from("89504e470d0a1a0a00000000", "hex"));
    const request = parseReviewRequest({
      schema: "ggd-vfx-visual-review-request@1",
      subject: { kind: "ability", id: "offline.r" },
      expectation: { summary: "人工驗收" },
      candidateFrames: [{ path: "a.png", atMs: 0, phase: "start" }],
    });
    const prepared = prepareReview(request, dir);
    expect(resolveGeminiEnablement({})).toEqual({ enabled: false, reason: "api-key-missing" });
    expect(resolveGeminiEnablement({ apiKey: "configured" })).toEqual({ enabled: true, reason: "api-key-present" });
    expect(resolveGeminiEnablement({ apiKey: "configured", forceDisable: true })).toEqual({ enabled: false, reason: "explicitly-disabled" });
    expect(resolveGeminiEnablement({ apiKey: "configured", environment: "off" })).toEqual({ enabled: false, reason: "environment-disabled" });
    expect(disabledGeminiReport(prepared, "gemini-flash-latest").reason.code).toBe("GEMINI_DISABLED");
    expect(unavailableGeminiReport(prepared, "gemini-flash-latest", new Error("GEMINI_API_KEY is missing")).reason.code)
      .toBe("GEMINI_API_KEY_MISSING");
  });

  it("measures false accepts separately from availability and latency", () => {
    const summary = summarizeBenchmark("gemini-test", [
      { model: "gemini-test", caseId: "positive", expected: "pass", status: "completed", overall: "pass", durationMs: 100, totalTokens: 20 },
      { model: "gemini-test", caseId: "negative", expected: "not-pass", status: "completed", overall: "pass", durationMs: 300, totalTokens: 40 },
      { model: "gemini-test", caseId: "offline", expected: "pass", status: "unavailable" },
    ]);
    expect(summary.availability).toBeCloseTo(2 / 3);
    expect(summary.labelledAccuracy).toBe(0.5);
    expect(summary.falseAccepts).toBe(1);
    expect(summary.falseRejects).toBe(0);
    expect(summary.latencyMs).toEqual({ p50: 100, p95: 300, max: 300 });
    expect(summary.totalTokens.mean).toBe(30);
  });
});
