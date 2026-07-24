/**
 * Shop feedback (task #60's debt). The claim under test is narrow and total:
 * EVERY reason the sim can reject a shop action with produces a readable
 * sentence and an audible cue — none is silent, none leaks a raw token.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  BUY_SFX,
  DENY_SFX,
  REJECT_TEXT,
  SELL_SFX,
  boughtToast,
  rejectToast,
  soldToast,
  undoneToast,
  type ShopEventReason,
} from "./shopFeedback";

/**
 * The complete rejection vocabulary: `BuyResult` from sim/economy/shop.ts, the
 * `ShopDenyReason`s from sim/economy/shopAccess.ts, and the sell-specific one.
 * If the sim gains a reason and this list is not updated, the last case below
 * still guarantees the player sees a sentence rather than an identifier.
 */
const ALL_REASONS: ShopEventReason[] = [
  "no-gold",
  "no-slot",
  "unique-owned",
  "unknown-item",
  "empty-pool",
  "not-purchasable",
  "no-effect",
  "combat-alive",
  "phase-closed",
  "no-champion",
  "empty-slot",
  // UndoResult (task #121) — the two ways `undoLastShopStep` can come back "no"
  "nothing-to-undo",
  "stale",
];

describe("shop rejection feedback", () => {
  it("every reason yields a distinct, readable, AUDIBLE message", () => {
    cover("shop-reject-surfaced");
    const seen = new Set<string>();
    for (const reason of ALL_REASONS) {
      const toast = rejectToast(reason);
      expect(toast.tone, reason).toBe("deny");
      expect(toast.sfx, reason).toBe(DENY_SFX); // never silent — task #60
      expect(toast.text.length, reason).toBeGreaterThan(1);
      expect(toast.text, reason).not.toContain(reason); // no raw token in the HUD
      seen.add(toast.text);
    }
    expect(seen.size).toBe(ALL_REASONS.length); // each says something DIFFERENT
  });

  it("names the item when the caller knows it", () => {
    cover("shop-reject-surfaced");
    const toast = rejectToast("no-gold", "烈焰法杖");
    expect(toast.text).toContain("烈焰法杖");
    expect(toast.text).toContain(REJECT_TEXT["no-gold"]);
  });

  it("an UNKNOWN future reason still reads as a sentence, not a code", () => {
    cover("shop-reject-surfaced");
    const toast = rejectToast("some-new-server-reason");
    expect(toast.text).not.toContain("some-new-server-reason");
    expect(toast.tone).toBe("deny");
    expect(toast.sfx).toBe(DENY_SFX);
  });

  it("the three headline BuyResults say exactly what went wrong", () => {
    cover("shop-reject-surfaced");
    expect(rejectToast("no-gold").text).toContain("金幣不足");
    expect(rejectToast("no-slot").text).toContain("道具欄已滿");
    expect(rejectToast("unique-owned").text).toContain("已擁有");
  });
});

describe("shop success feedback", () => {
  it("a purchase confirms with the item and its own sound", () => {
    cover("shop-reject-surfaced");
    const toast = boughtToast("烈焰法杖");
    expect(toast.tone).toBe("ok");
    expect(toast.text).toContain("烈焰法杖");
    expect(toast.sfx).toBe(BUY_SFX);
  });

  it("a sale reports the gold actually refunded", () => {
    cover("shop-reject-surfaced");
    const toast = soldToast("烈焰法杖", 420);
    expect(toast.tone).toBe("ok");
    expect(toast.text).toContain("420");
    expect(toast.sfx).toBe(SELL_SFX);
  });

  it("success and failure never share a sound", () => {
    cover("shop-reject-surfaced");
    expect(BUY_SFX).not.toBe(DENY_SFX);
    expect(SELL_SFX).not.toBe(DENY_SFX);
  });
});

/**
 * int-36 (shop-undo-feedback, task #121). The sim has emitted `shopUndone` and
 * `undoRejected` since the undo landed and the client dropped BOTH — pressing
 * 復原上一步 moved the gold and said nothing, and pressing it once too often
 * was indistinguishable from a dead button. These are the sentences that close
 * that, and they must NAME which transaction was reversed: "undone" alone
 * leaves the player checking their wallet to find out what happened.
 */
describe("shop undo feedback (#121)", () => {
  it("says WHICH transaction was reversed, and reports the sim's own gold", () => {
    cover("shop-undo-feedback");
    const sell = undoneToast("sell", "烈焰法杖", 400);
    expect(sell.tone).toBe("ok");
    expect(sell.text).toContain("賣出");
    expect(sell.text).toContain("烈焰法杖");
    expect(sell.text).toContain("400"); // the post-undo gold, straight off the event

    const buy = undoneToast("buy", "烈焰法杖", 1600);
    expect(buy.text).toContain("購入");
    expect(buy.text).toContain("1600");
    // reversing a BUY refunds and reversing a SELL charges — opposite wallet
    // moves, so they must not sound the same
    expect(buy.sfx).not.toBe(sell.sfx);
  });

  it("degrades to a readable line when the kind or the gold is missing", () => {
    cover("shop-undo-feedback");
    const toast = undoneToast("", "", -1);
    expect(toast.tone).toBe("ok");
    expect(toast.text).toContain("已復原");
    expect(toast.text).not.toContain("-1"); // never leak the "no gold on the event" sentinel
  });

  it("a refused undo is a DENY toast that explains itself", () => {
    cover("shop-undo-feedback");
    const empty = rejectToast("nothing-to-undo");
    expect(empty.tone).toBe("deny");
    expect(empty.sfx).toBe(DENY_SFX);
    expect(empty.text).not.toContain("nothing-to-undo");
    expect(rejectToast("stale").text).not.toBe(empty.text);
  });
});
