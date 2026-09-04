import { describe, expect, it } from "vitest";
import { simTraceReviewState } from "./simTraceReview";

describe("VFX Forge Sim trace review gate", () => {
  it("fails closed while the authoritative trace is loading", () => {
    expect(simTraceReviewState(null)).toEqual({
      ready: false,
      pending: true,
      reason: "等待真 Sim 事件與角色動作節點",
    });
  });

  it("rejects preview errors and rejected intent frames", () => {
    expect(simTraceReviewState(null, "content unavailable")).toMatchObject({ ready: false, pending: false });
    expect(simTraceReviewState({ accepted: false, reason: "mana" })).toEqual({
      ready: false,
      pending: false,
      reason: "真 IntentFrame 被拒：mana",
    });
  });

  it("rejects a reactive event that Main cannot consume", () => {
    expect(simTraceReviewState({
      accepted: true,
      runtimeCompatible: false,
      runtimeIssue: "missing provenance",
    })).toEqual({
      ready: false,
      pending: false,
      reason: "Main runtime 尚無法消費這個事件來源：missing provenance",
    });
  });

  it("allows accepted casts and runtime-compatible reactions", () => {
    expect(simTraceReviewState({ accepted: true }).ready).toBe(true);
    expect(simTraceReviewState({ accepted: true, runtimeCompatible: true }).ready).toBe(true);
  });
});
