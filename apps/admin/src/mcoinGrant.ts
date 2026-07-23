/**
 * M幣 (M COIN) admin grant — pure form logic (task #118).
 *
 * M COIN is now ADMIN-GRANTED only (never purchased): an operator enters a
 * target account id + an amount and the server adds it via
 * `POST /wallet/admin/grant-mcoin` (role-gated; a non-admin caller is 403). The
 * amount may be negative to deduct — the server floors the balance at 0.
 *
 * This module keeps the parse/validate/submit logic side-effect-free so it is
 * unit-testable without React or the network; the page wires it to the real API.
 */

/** Raw form fields (strings, straight off the inputs). */
export interface GrantInput {
  accountId: string;
  amount: string;
}

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

  return { ok: true, value: { accountId, amount } };
}

/**
 * Validate the form and, if valid, POST the grant through the injected caller.
 * Returns a discriminated outcome the page renders (result balance or error).
 */
export async function submitGrant(
  input: GrantInput,
  grant: (accountId: string, amount: number) => Promise<GrantResult>,
): Promise<GrantOutcome> {
  const parsed = parseGrant(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const result = await grant(parsed.value.accountId, parsed.value.amount);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : "grant failed" };
  }
}

/** Format an M COIN balance for display (matches the players table's Ⓜ chip). */
export function formatBalance(mcoin: number): string {
  return `Ⓜ ${mcoin.toLocaleString()}`;
}
