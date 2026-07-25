/**
 * Store purchase state machine — PURE transitions + one async executor with
 * an injected buy function, so the 402/409/success paths are unit-testable
 * with a mocked fetch. UI flow: idle → confirm (dialog) → busy → done|error.
 */
import { shortfallHint, type StoreCurrency } from "./currency";
import { ApiError } from "./session";
import type { Wallet } from "./types";

export interface PurchaseItem {
  kind: "champion" | "skin";
  id: string;
  /**
   * The PLAYER-FACING name (task #227). Never the id: the store used to pass
   * `champ.id` here and the dialog printed it back as 「確定購買 godie-zombiex？」.
   */
  name: string;
  price: number;
  /**
   * Which wallet pays — 英雄=藍水晶 / 造型=M幣 (currency.ts). Carried on the
   * item so the confirm dialog's price glyph AND its balance line come from the
   * same fact as the row the player clicked.
   */
  currency: StoreCurrency;
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

/**
 * Human-readable message for the well-known store failures.
 *
 * `insufficient_crystal` is the champion path (#227): the platform's champion
 * purchase spends 藍水晶, so a player short on crystals used to fall through to
 * the raw server string. It carries #213's earn hint — the same sentence
 * champ-select shows for the same failure, from the same constant.
 */
export function purchaseErrorText(code: string, message: string): string {
  switch (code) {
    case "insufficient_crystal":
      return shortfallHint("crystal");
    case "insufficient_mcoin":
      return shortfallHint("mcoin");
    case "already_owned":
      return "你已經擁有這個項目了。";
    default:
      return message || "購買失敗，請稍後再試。";
  }
}

/**
 * Execute the confirmed purchase. Returns the terminal state:
 * done(wallet) on success; error(code) on 402 (insufficient_crystal for a
 * champion, insufficient_mcoin for a skin), 409 already_owned, or any other
 * API failure.
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
    return { phase: "error", item, code: "network", message: "連線異常 — 請稍後再試。" };
  }
}
