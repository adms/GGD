/**
 * 藍水晶 (blue crystal) admin grant — pure form logic (task #225).
 *
 * Two operator actions share this module:
 *   - a SINGLE-account grant, `POST /admin/accounts/{id}/crystal`
 *   - 一鍵發放所有帳號, `POST /admin/crystals/grant-all`
 *
 * WHY THIS IS NOT mcoinGrant.ts. The two forms look alike and validate
 * differently, on purpose:
 *
 *   1. M幣 amounts may be NEGATIVE (that form's whole deduct affordance). Crystal
 *      amounts may not. The server floors a crystal balance at 0, so a negative
 *      grant would not "deduct 999999" — it would silently WIPE a player's
 *      balance. The platform refuses non-positive amounts outright and so does
 *      this parser, so the console never sends a value it cannot explain.
 *   2. Crystals have an upper bound (MAX_CRYSTAL_GRANT), mirroring the platform's
 *      admin.MaxCrystalGrant. It is a TYPO GUARD for the bulk action: 一鍵發放
 *      multiplies whatever is typed here by every account on the deploy, so an
 *      extra couple of zeros is the mistake worth catching before the request.
 *
 * The bound is checked in BOTH places. This one exists to fail fast with a
 * readable message; the server's is the one that counts (a console is not a
 * security boundary).
 *
 * As with mcoinGrant, everything here is side-effect free so it is unit-testable
 * without React or the network; the page injects the real API callers.
 */

/**
 * MAX_CRYSTAL_GRANT mirrors `admin.MaxCrystalGrant` in
 * apps/platform/internal/admin/admin.go. If that constant moves, move this one:
 * a console that offers a value the server refuses is worse than no client
 * validation at all.
 */
export const MAX_CRYSTAL_GRANT = 1_000_000;

/** Parsed, validated crystal amount. */
export type AmountResult = { ok: true; value: number } | { ok: false; error: string };

/** What the single-account grant returns. */
export interface CrystalGrantResult {
  accountId: string;
  crystal: number;
}

/** What the bulk grant returns — the platform's BulkGrantResult. */
export interface CrystalBulkResult {
  accounts: number;
  granted: number;
  failed: number;
  firstError?: string;
}

export type GrantOutcome<T> = { ok: true; result: T } | { ok: false; error: string };

/**
 * Validate a crystal amount: a whole POSITIVE number, at most MAX_CRYSTAL_GRANT.
 *
 * Unlike the M幣 parser this rejects negatives — see the module note. It also
 * rejects a bare "+" prefix mismatch and any non-integer the same way, so
 * "1e6", "1,000" and "500.5" are all refused rather than silently truncated.
 */
export function parseCrystalAmount(raw: string): AmountResult {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "水晶數量為必填 · amount is required" };
  const amount = Number.parseInt(text, 10);
  if (!Number.isFinite(amount) || String(amount) !== text.replace(/^\+/, "")) {
    return { ok: false, error: "水晶數量必須是整數 · amount must be a whole number" };
  }
  if (amount <= 0) {
    return { ok: false, error: "水晶數量必須大於 0（此處不支援扣除）· amount must be positive" };
  }
  if (amount > MAX_CRYSTAL_GRANT) {
    return {
      ok: false,
      error: `水晶數量上限為 ${MAX_CRYSTAL_GRANT.toLocaleString()} · amount exceeds the limit`,
    };
  }
  return { ok: true, value: amount };
}

/** Validate the single-account form (account id + amount). */
export function parseCrystalGrant(input: {
  accountId: string;
  amount: string;
}): { ok: true; value: { accountId: string; amount: number } } | { ok: false; error: string } {
  const accountId = input.accountId.trim();
  if (accountId === "") return { ok: false, error: "帳號 ID 為必填 · account id is required" };
  const amount = parseCrystalAmount(input.amount);
  if (!amount.ok) return { ok: false, error: amount.error };
  return { ok: true, value: { accountId, amount: amount.value } };
}

/**
 * Validate the single-account form and, if valid, POST it through the injected
 * caller. Never throws — the page renders the discriminated outcome.
 */
export async function submitCrystalGrant(
  input: { accountId: string; amount: string },
  grant: (accountId: string, amount: number, reason: string) => Promise<{ crystal: number }>,
  reason = "",
): Promise<GrantOutcome<CrystalGrantResult>> {
  const parsed = parseCrystalGrant(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const res = await grant(parsed.value.accountId, parsed.value.amount, reason);
    return { ok: true, result: { accountId: parsed.value.accountId, crystal: res.crystal } };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

/**
 * Validate the bulk amount and, if valid, fire 一鍵發放所有帳號.
 *
 * There is no confirmation logic here — the page owns that, because a confirm
 * step the caller can forget to render is not a safeguard. What this DOES
 * guarantee is that an invalid amount never reaches the network, so the
 * confirmation dialog is only ever shown for a number that could actually be
 * granted.
 */
export async function submitCrystalGrantAll(
  amount: string,
  grantAll: (amount: number, reason: string) => Promise<CrystalBulkResult>,
  reason = "",
): Promise<GrantOutcome<CrystalBulkResult>> {
  const parsed = parseCrystalAmount(amount);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    return { ok: true, result: await grantAll(parsed.value, reason) };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

/** Format a crystal balance for display (matches the lobby's 💎 chip). */
export function formatCrystal(crystal: number): string {
  return `💎 ${crystal.toLocaleString()}`;
}

/**
 * One-line human summary of a bulk run. A partial failure is a REPORTABLE
 * outcome, not an error — the operator needs to know 900 of 901 landed, because
 * re-running would double-grant those 900.
 */
export function summarizeBulk(res: CrystalBulkResult): string {
  const base = `已發放 ${res.granted} / ${res.accounts} 個帳號 · granted ${res.granted} of ${res.accounts}`;
  return res.failed > 0 ? `${base}，失敗 ${res.failed} 個 · ${res.failed} failed` : base;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "grant failed";
}
