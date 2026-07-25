/**
 * M幣 (M COIN) admin grant — pure form logic (tasks #118, #214).
 *
 * M COIN is ADMIN-GRANTED only (never purchased): an operator enters a target
 * account id, an amount and a reason, and the server applies it via
 * `POST /admin/accounts/{id}/mcoin` — AdminOnly, bounds-checked server-side, and
 * AUDITED as `mcoin_adjust`. The amount may be NEGATIVE to deduct, which is why
 * this parser differs from crystalGrant's; the server floors the balance at 0,
 * so a large negative ZEROES a balance rather than deducting that much from it.
 *
 * The route moved in #214: it used to be `/wallet/admin/grant-mcoin`, which was
 * role-checked but wrote no audit line and validated no amount. See ./api.ts.
 *
 * This module keeps the parse/validate/submit logic side-effect-free so it is
 * unit-testable without React or the network; the page wires it to the real API.
 */

/**
 * MAX_MCOIN_GRANT mirrors `admin.MaxMCoinGrant` in
 * apps/platform/internal/admin/admin.go. Same rule as crystalGrant's mirror: if
 * that constant moves, move this one — a console that offers a value the server
 * refuses is worse than no client validation at all. The bound is SYMMETRIC
 * because this form legitimately deducts.
 */
export const MAX_MCOIN_GRANT = 1_000_000;

/** Raw form fields (strings, straight off the inputs). */
export interface GrantInput {
  accountId: string;
  amount: string;
}

/** Free-text operator note carried into the audit line. Optional; "" is legal. */
export type GrantReason = string;

/** Parsed, validated grant. */
export interface GrantParsed {
  accountId: string;
  amount: number;
}

export type ParseResult = { ok: true; value: GrantParsed } | { ok: false; error: string };

/** The balance the server returns after a grant. */
export interface GrantResult {
  accountId: string;
  mcoin: number;
}

export type GrantOutcome = { ok: true; result: GrantResult } | { ok: false; error: string };

/** Validate + coerce the form fields. Amount must be a non-zero whole number. */
export function parseGrant(input: GrantInput): ParseResult {
  const accountId = input.accountId.trim();
  if (accountId === "") return { ok: false, error: "帳號 ID 為必填 · account id is required" };

  const raw = input.amount.trim();
  if (raw === "") return { ok: false, error: "金額為必填 · amount is required" };
  const amount = Number.parseInt(raw, 10);
  if (!Number.isFinite(amount) || String(amount) !== raw.replace(/^\+/, "")) {
    return { ok: false, error: "金額必須是整數 · amount must be a whole number" };
  }
  if (amount === 0) return { ok: false, error: "金額不可為 0 · amount cannot be zero" };
  if (Math.abs(amount) > MAX_MCOIN_GRANT) {
    return {
      ok: false,
      error: `金額超出上限 ±${MAX_MCOIN_GRANT.toLocaleString()} · amount out of range`,
    };
  }

  return { ok: true, value: { accountId, amount } };
}

/**
 * Validate the form and, if valid, POST the grant through the injected caller.
 * Returns a discriminated outcome the page renders (result balance or error).
 *
 * `reason` is passed straight through to the caller and lands in the server's
 * `mcoin_adjust` audit line (task #214). It is optional and may be empty — the
 * grant is audited either way; the reason only makes the trail readable.
 */
export async function submitGrant(
  input: GrantInput,
  grant: (accountId: string, amount: number, reason: GrantReason) => Promise<GrantResult>,
  reason: GrantReason = "",
): Promise<GrantOutcome> {
  const parsed = parseGrant(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const result = await grant(parsed.value.accountId, parsed.value.amount, reason.trim());
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : "grant failed" };
  }
}

/** Format an M COIN balance for display (matches the players table's Ⓜ chip). */
export function formatBalance(mcoin: number): string {
  return `Ⓜ ${mcoin.toLocaleString()}`;
}
