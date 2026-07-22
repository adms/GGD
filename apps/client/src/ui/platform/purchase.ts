/**
 * Store purchase state machine — PURE transitions + one async executor with
 * an injected buy function, so the 402/409/success paths are unit-testable
 * with a mocked fetch. UI flow: idle → confirm (dialog) → busy → done|error.
 */
import { ApiError } from "./session";
import type { Wallet } from "./types";

export interface PurchaseItem {
  kind: "champion" | "skin";
  id: string;
  name: string;
  price: number;
}

export type PurchaseState =
  | { phase: "idle" }
  | { phase: "confirm"; item: PurchaseItem }
  | { phase: "busy"; item: PurchaseItem }
  | { phase: "done"; item: PurchaseItem; wallet: Wallet }
  | { phase: "error"; item: PurchaseItem; code: string; message: string };

export const purchaseIdle: PurchaseState = { phase: "idle" };

/** Open the confirm dialog for an item (from idle/done/error only). */
export function beginPurchase(state: PurchaseState, item: PurchaseItem): PurchaseState {
  if (state.phase === "busy") return state; // never interrupt an in-flight buy
  return { phase: "confirm", item };
}

/** Cancel the dialog / dismiss a result. */
export function cancelPurchase(state: PurchaseState): PurchaseState {
  if (state.phase === "busy") return state;
  return purchaseIdle;
}

/** Human-readable message for the two well-known store failures. */
export function purchaseErrorText(code: string, message: string): string {
  switch (code) {
    case "insufficient_mcoin":
      return "Not enough M COIN for this purchase.";
    case "already_owned":
      return "You already own this item.";
    default:
      return message || "Purchase failed.";
  }
}

/**
 * Execute the confirmed purchase. Returns the terminal state:
 * done(wallet) on success; error(code) on 402 insufficient_mcoin,
 * 409 already_owned, or any other API failure.
 */
export async function executePurchase(
  state: PurchaseState,
  buy: (kind: "champion" | "skin", id: string) => Promise<Wallet>,
): Promise<PurchaseState> {
  if (state.phase !== "confirm") return state;
  const item = state.item;
  try {
    const wallet = await buy(item.kind, item.id);
    return { phase: "done", item, wallet };
  } catch (err) {
    if (err instanceof ApiError) {
      return { phase: "error", item, code: err.code, message: purchaseErrorText(err.code, err.message) };
    }
    return { phase: "error", item, code: "network", message: "Network error — please try again." };
  }
}
