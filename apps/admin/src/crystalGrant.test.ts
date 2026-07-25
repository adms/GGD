/**
 * adminui-crystal-grant: the 藍水晶 admin-grant form (task #225) validates the
 * amount POSITIVE-only and capped (unlike the M幣 form, which allows negatives),
 * posts single and bulk grants through the injected API callers, and reports the
 * bulk run's per-account counts — including a partial failure, which is a
 * reportable outcome rather than an error.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  MAX_CRYSTAL_GRANT,
  formatCrystal,
  parseCrystalAmount,
  parseCrystalGrant,
  submitCrystalGrant,
  submitCrystalGrantAll,
  summarizeBulk,
  type CrystalBulkResult,
} from "./crystalGrant";

describe("crystal grant form (adminui-crystal-grant)", () => {
  it("rejects empty / non-integer / zero / NEGATIVE / over-cap amounts", () => {
    cover("adminui-crystal-grant");
    expect(parseCrystalAmount("").ok).toBe(false);
    expect(parseCrystalAmount("abc").ok).toBe(false);
    expect(parseCrystalAmount("12.5").ok).toBe(false);
    expect(parseCrystalAmount("1e6").ok).toBe(false);
    expect(parseCrystalAmount("1,000").ok).toBe(false);
    expect(parseCrystalAmount("0").ok).toBe(false);
    // The load-bearing difference from mcoinGrant, which ALLOWS negatives: the
    // server floors a crystal balance at 0, so -999999 would wipe a player
    // rather than deduct from them.
    expect(parseCrystalAmount("-100").ok).toBe(false);
    expect(parseCrystalAmount(String(MAX_CRYSTAL_GRANT + 1)).ok).toBe(false);
  });

  it("accepts a positive whole amount up to and including the cap", () => {
    cover("adminui-crystal-grant");
    expect(parseCrystalAmount(" 1000 ")).toEqual({ ok: true, value: 1000 });
    expect(parseCrystalAmount("+250")).toEqual({ ok: true, value: 250 });
    expect(parseCrystalAmount(String(MAX_CRYSTAL_GRANT))).toEqual({
      ok: true,
      value: MAX_CRYSTAL_GRANT,
    });
  });

  it("requires an account id for the single-account grant and trims it", () => {
    cover("adminui-crystal-grant");
    expect(parseCrystalGrant({ accountId: "   ", amount: "100" }).ok).toBe(false);
    expect(parseCrystalGrant({ accountId: "  01J7  ", amount: "100" })).toEqual({
      ok: true,
      value: { accountId: "01J7", amount: 100 },
    });
  });

  it("submitCrystalGrant posts the parsed values (with the reason) and returns the balance", async () => {
    cover("adminui-crystal-grant");
    const calls: Array<{ accountId: string; amount: number; reason: string }> = [];
    const outcome = await submitCrystalGrant(
      { accountId: " 01J7 ", amount: "500" },
      async (accountId, amount, reason) => {
        calls.push({ accountId, amount, reason });
        return { crystal: 1500 };
      },
      "compensation",
    );

    expect(calls).toEqual([{ accountId: "01J7", amount: 500, reason: "compensation" }]);
    expect(outcome).toEqual({ ok: true, result: { accountId: "01J7", crystal: 1500 } });
    if (outcome.ok) expect(formatCrystal(outcome.result.crystal)).toBe("💎 1,500");
  });

  it("never calls the API for an invalid amount — neither single nor bulk", async () => {
    cover("adminui-crystal-grant");
    let called = false;
    const single = await submitCrystalGrant({ accountId: "01J7", amount: "-5" }, async () => {
      called = true;
      return { crystal: 0 };
    });
    expect(called).toBe(false);
    expect(single.ok).toBe(false);

    const bulk = await submitCrystalGrantAll("0", async () => {
      called = true;
      return { accounts: 0, granted: 0, failed: 0 };
    });
    expect(called).toBe(false);
    expect(bulk.ok).toBe(false);
  });

  it("surfaces a thrown API error (e.g. 403 admin_required) as a clean message", async () => {
    cover("adminui-crystal-grant");
    const outcome = await submitCrystalGrant({ accountId: "01J7", amount: "500" }, async () => {
      throw new Error("admin role required");
    });
    expect(outcome).toEqual({ ok: false, error: "admin role required" });
  });

  it("submitCrystalGrantAll posts the amount once and returns the per-account counts", async () => {
    cover("adminui-crystal-grant");
    const calls: Array<{ amount: number; reason: string }> = [];
    const outcome = await submitCrystalGrantAll(
      "1000",
      async (amount, reason) => {
        calls.push({ amount, reason });
        return { accounts: 42, granted: 42, failed: 0 };
      },
      "新春發放",
    );

    expect(calls).toEqual([{ amount: 1000, reason: "新春發放" }]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toEqual({ accounts: 42, granted: 42, failed: 0 });
      expect(summarizeBulk(outcome.result)).toBe("已發放 42 / 42 個帳號 · granted 42 of 42");
    }
  });

  it("reports a PARTIAL bulk run as a result, not an error — the counts must reach the operator", async () => {
    cover("adminui-crystal-grant");
    const partial: CrystalBulkResult = {
      accounts: 901,
      granted: 900,
      failed: 1,
      firstError: "disk full",
    };
    const outcome = await submitCrystalGrantAll("1000", async () => partial);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.granted).toBe(900);
    // Re-running would double-grant the 900 that landed, so the summary has to
    // say how many landed rather than just "failed".
    expect(summarizeBulk(partial)).toBe("已發放 900 / 901 個帳號 · granted 900 of 901，失敗 1 個 · 1 failed");
  });
});
