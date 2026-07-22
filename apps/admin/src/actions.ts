/**
 * Destructive/admin action state machines (ban, M COIN grant, MMR set, delete).
 * A confirm→busy→done/error flow with the API error envelope surfaced. Pure +
 * unit-tested against a mocked fetch (success / 403 / 404 branches).
 */
import { ApiError } from "./session";

export type ActionKind = "ban" | "unban" | "mcoin" | "mmr" | "announcement-delete";

export interface ConfirmState {
  kind: ActionKind;
  targetId: string;
  label: string;
}

export type ActionPhase =
  | { phase: "idle" }
  | { phase: "confirm"; confirm: ConfirmState }
  | { phase: "busy"; confirm: ConfirmState }
  | { phase: "done"; message: string }
  | { phase: "error"; code: string; message: string };

export const idle: ActionPhase = { phase: "idle" };

/** Open a confirmation for a destructive action. */
export function beginConfirm(kind: ActionKind, targetId: string, label: string): ActionPhase {
  return { phase: "confirm", confirm: { kind, targetId, label } };
}

/** Cancel back to idle. */
export function cancel(): ActionPhase {
  return idle;
}

export interface ActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/**
 * Run one admin mutation. Resolves to {ok:true} on success; on an ApiError the
 * envelope's code/message are surfaced (403 admin_required, 404 not_found,
 * 402 insufficient, …). Never throws.
 */
export async function runAdminAction(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code, message: err.message };
    return { ok: false, code: "error", message: err instanceof Error ? err.message : "action failed" };
  }
}

/** Advance a confirm state through the mutation to done/error. */
export async function executeConfirmed(
  state: ActionPhase,
  fn: () => Promise<unknown>,
  successMessage: string,
): Promise<ActionPhase> {
  if (state.phase !== "confirm") return state;
  const result = await runAdminAction(fn);
  if (result.ok) return { phase: "done", message: successMessage };
  return { phase: "error", code: result.code ?? "error", message: result.message ?? "action failed" };
}
