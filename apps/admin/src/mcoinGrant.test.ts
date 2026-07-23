/**
 * adminui-mcoin-grant: the M幣 admin-grant form (task #118) validates the
 * account id + amount, posts the grant through the injected API caller, and
 * surfaces the resulting balance (or a clean error).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { formatBalance, parseGrant, submitGrant, type GrantResult } from "./mcoinGrant";

describe("mcoin grant form (adminui-mcoin-grant)", () => {
  it("rejects a missing account id and a missing / zero / non-integer amount", () => {
    cover("adminui-mcoin-grant");
    expect(parseGrant({ accountId: "  ", amount: "100" }).ok).toBe(false);
    expect(parseGrant({ accountId: "acc", amount: "" }).ok).toBe(false);
    expect(parseGrant({ accountId: "acc", amount: "0" }).ok).toBe(false);
    expect(parseGrant({ accountId: "acc", amount: "12.5" }).ok).toBe(false);
    expect(parseGrant({ accountId: "acc", amount: "abc" }).ok).toBe(false);
  });

  it("accepts a whole positive / negative amount and trims the id", () => {
    cover("adminui-mcoin-grant");
    const pos = parseGrant({ accountId: "  01J7  ", amount: "500" });
    expect(pos).toEqual({ ok: true, value: { accountId: "01J7", amount: 500 } });
    const neg = parseGrant({ accountId: "01J7", amount: "-200" });
    expect(neg).toEqual({ ok: true, value: { accountId: "01J7", amount: -200 } });
  });

  it("submitGrant posts the parsed values and returns the resulting balance", async () => {
    cover("adminui-mcoin-grant");
    const calls: Array<{ accountId: string; amount: number }> = [];
    const fakeGrant = async (accountId: string, amount: number): Promise<GrantResult> => {
      calls.push({ accountId, amount });
      return { accountId, mcoin: 1500 };
    };

    const outcome = await submitGrant({ accountId: "01J7", amount: "500" }, fakeGrant);

    expect(calls).toEqual([{ accountId: "01J7", amount: 500 }]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toEqual({ accountId: "01J7", mcoin: 1500 });
      expect(formatBalance(outcome.result.mcoin)).toBe("Ⓜ 1,500");
    }
  });

  it("submitGrant never calls the API for invalid input", async () => {
    cover("adminui-mcoin-grant");
    let called = false;
    const outcome = await submitGrant({ accountId: "", amount: "10" }, async () => {
      called = true;
      return { accountId: "", mcoin: 0 };
    });
    expect(called).toBe(false);
    expect(outcome.ok).toBe(false);
  });

  it("surfaces a thrown API error (e.g. 403 non-admin) as a clean message", async () => {
    cover("adminui-mcoin-grant");
    const outcome = await submitGrant({ accountId: "01J7", amount: "500" }, async () => {
      throw new Error("admin role required");
    });
    expect(outcome).toEqual({ ok: false, error: "admin role required" });
  });
});
