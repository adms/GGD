export interface SimTraceReviewInput {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly runtimeCompatible?: boolean;
  readonly runtimeIssue?: string;
}

export interface SimTraceReviewState {
  readonly ready: boolean;
  readonly pending: boolean;
  readonly reason: string;
}

/**
 * Human-review evidence is valid only after the authoritative preview has
 * accepted the action and, for reactive events, proved the Main runtime can
 * actually consume its provenance. Loading and failures are fail-closed.
 */
export function simTraceReviewState(
  trace: SimTraceReviewInput | null,
  error: string | null = null,
): SimTraceReviewState {
  if (error) return { ready: false, pending: false, reason: `真 Sim 試放失敗：${error}` };
  if (!trace) return { ready: false, pending: true, reason: "等待真 Sim 事件與角色動作節點" };
  if (!trace.accepted) {
    return { ready: false, pending: false, reason: `真 IntentFrame 被拒：${trace.reason ?? "unknown"}` };
  }
  if (trace.runtimeCompatible === false) {
    return {
      ready: false,
      pending: false,
      reason: `Main runtime 尚無法消費這個事件來源：${trace.runtimeIssue ?? "provenance incompatible"}`,
    };
  }
  return { ready: true, pending: false, reason: "真 Sim 事件已就緒" };
}
