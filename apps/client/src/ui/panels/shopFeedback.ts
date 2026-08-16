/**
 * shopFeedback — turn a shop outcome into something the player can READ, and a
 * sound they can hear.
 *
 * ---------------------------------------------------------------------------
 * THE DEBT THIS CLOSES (task #60)
 * ---------------------------------------------------------------------------
 * `buyItem` has always returned a precise `BuyResult` — "no-gold" / "no-slot" /
 * "unique-owned" / "unknown-item" — and `CommandSystem` threw it away:
 *
 *     case "buyItem":
 *       if (world.economyOpen) buyItem(world, entity, cmd.itemId as ItemId);
 *
 * So a player who could not afford an item, had six items already, or already
 * owned a unique clicked a button and NOTHING happened — no message, no sound,
 * no state change. Indistinguishable from a dropped packet. The sim now emits
 * `buyRejected` / `sellRejected` carrying the reason (and the server-side phase
 * gate emits its own reason through the same channel), MatchRoom fans them out,
 * and this module is where a reason becomes a sentence.
 *
 * The SFX are the 効果音ラボ clips task #51 staged and bound in
 * content/config/audio-map.json for exactly these moments — `uiDenied` for a
 * refusal, `shopPurchase` for a completed buy, `goldGain` for a sale. They were
 * authored-but-silent because nothing emitted them; this is that emitter.
 *
 * Pure + node-testable: no React, no audio calls, no DOM.
 */

/** Every reason that can come back on a `buyRejected` / `sellRejected` event. */
export type ShopEventReason =
  // BuyResult values from sim/economy/shop.ts
  | "no-gold"
  | "no-slot"
  | "unique-owned"
  | "unknown-item"
  /**
   * 傳說寶玉 with nothing left to roll — every legendary is already owned, or
   * the operator has whitelisted none. The orb charges NO gold in this case
   * (economy/legendaryOrb.ts refuses before deducting), which is the whole
   * reason this reason exists: task #47's weapon cards silently granted
   * nothing, and doing that to a 2400g purchase would be theft.
   */
  | "empty-pool"
  /** a 0g draft/legendary reward — 「傳說的武器道具，只能隨機三選一」 */
  | "not-purchasable"
  /**
   * Priced but INERT — a w3x import whose whole payload is an active `item@1`
   * cannot express yet. Deliberately its own reason and not `not-purchasable`:
   * that sentence tells the player to go roll the 傳說寶玉, which for a recipe
   * book would be a lie pointing at the wrong shop.
   */
  | "no-effect"
  /**
   * 暫時下架 (#261) — the weapon SHELF is closed (economy/shopShelf.ts), so only
   * 能力屬性強化 and 傳說寶玉 are on sale. Its own reason, because the other two
   * refusals would both mislead: 「只能三選一抽取」 is the wrong instruction
   * (the item is not legendary) and 「沒有效果」 is simply false.
   */
  | "shelf-closed"
  // ShopDenyReason values from sim/economy/shopAccess.ts
  | "combat-alive"
  | "phase-closed"
  | "no-champion"
  // sell-specific
  | "empty-slot"
  // UndoResult values from sim/economy/shop.ts (task #121)
  /**
   * The session's undo history is empty — everything undoable has been undone,
   * or a committed action (a stat tick, a 傳說寶玉 roll, entering combat)
   * cleared the stack. NOT an error: it is the honest answer to "go back one
   * more", and saying it is the whole difference between a bounded undo and a
   * button that appears broken.
   */
  | "nothing-to-undo"
  /**
   * The recorded slot no longer holds what the reversal expects, so the undo
   * REFUSED rather than clobber inventory. Defensive; the commit rules keep it
   * out of normal play, but if it ever fires the player must be told the
   * inventory was left alone rather than silently see nothing happen.
   */
  | "stale";

export type ShopToastTone = "ok" | "deny";

/** One line of shop feedback, ready to render and to play. */
export interface ShopToast {
  readonly tone: ShopToastTone;
  /** the sentence shown to the player (Traditional Chinese, UI chrome) */
  readonly text: string;
  /** audio-map.json event key, or null when the moment is silent */
  readonly sfx: string | null;
}

/**
 * Reason → sentence. Each says WHAT went wrong in the player's own terms; none
 * of them is "error" or a code. Unknown reasons fall through to a generic line
 * rather than rendering the raw token, so a future server reason degrades to a
 * readable message instead of leaking an identifier into the HUD.
 */
export const REJECT_TEXT: Record<ShopEventReason, string> = {
  "no-gold": "金幣不足",
  "no-slot": "道具欄已滿（先賣掉一件）",
  "unique-owned": "已擁有這件唯一道具",
  "unknown-item": "找不到這件道具",
  "empty-pool": "寶具已無可顯現者（未扣除金幣）",
  "not-purchasable": "寶具無法以金錢購得，只能經由顯現獲取（可用傳說寶玉）",
  "no-effect": "這件道具在本版本沒有任何效果，不開放購買",
  "shelf-closed": "寶具暫時下架，目前只提供能力屬性強化與傳說寶玉（顯現時仍可獲得）",
  "combat-alive": "戰鬥中無法使用商店",
  "phase-closed": "現在不是備戰時間",
  "no-champion": "尚未選擇英雄",
  "empty-slot": "這個欄位是空的",
  "nothing-to-undo": "沒有可以復原的步驟了",
  stale: "道具欄已變動，為避免弄亂已取消復原",
};

const GENERIC_REJECT = "無法完成交易";

/** SFX for a refusal — the 効果音ラボ error beep bound as `uiDenied`. */
export const DENY_SFX = "uiDenied";
/** SFX for a completed purchase. */
export const BUY_SFX = "shopPurchase";
/** SFX for a completed sale (coins). */
export const SELL_SFX = "goldGain";
/** SFX for the shop card opening. */
export const OPEN_SFX = "panelOpen";
/** SFX for the shop card closing. */
export const CLOSE_SFX = "uiCancel";

/** A rejected buy or sell. `itemName` is folded in when the caller knows it. */
export function rejectToast(reason: string, itemName?: string): ShopToast {
  const base = REJECT_TEXT[reason as ShopEventReason] ?? GENERIC_REJECT;
  return {
    tone: "deny",
    text: itemName ? `${itemName}：${base}` : base,
    sfx: DENY_SFX,
  };
}

/** A completed purchase. */
export function boughtToast(itemName: string): ShopToast {
  return { tone: "ok", text: `購入 ${itemName}`, sfx: BUY_SFX };
}

/** A completed sale, with the gold actually refunded. */
export function soldToast(itemName: string, refund: number): ShopToast {
  return { tone: "ok", text: `賣出 ${itemName}（+${refund} g）`, sfx: SELL_SFX };
}

/**
 * A completed UNDO (task #121). Names WHICH transaction was reversed — a
 * reversed SELL put the item back and TOOK the refund away; a reversed BUY
 * gave the money back and emptied the slot — because "undone" alone leaves the
 * player checking their gold to work out what just happened. The gold shown is
 * the sim's post-undo figure straight off the event, never a UI re-derivation:
 * the whole point of the stored-delta reversal is that the number a player
 * reads and the number in the sim are the same number.
 *
 * Reversing a sale plays the PURCHASE sound and reversing a purchase plays the
 * coin sound, because that is what each one does to your wallet.
 */
export function undoneToast(undoneKind: string, itemName: string, gold: number): ShopToast {
  const what = undoneKind === "sell" ? "賣出" : undoneKind === "buy" ? "購入" : "上一步";
  const goldText = gold >= 0 ? `　金幣 ${gold} g` : "";
  return {
    tone: "ok",
    text: `已復原${what}${itemName ? ` ${itemName}` : ""}${goldText}`,
    sfx: undoneKind === "sell" ? BUY_SFX : SELL_SFX,
  };
}

/** How long a toast stays on screen before the HUD drops it. */
export const TOAST_TTL_MS = 2600;
