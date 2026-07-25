/**
 * deviceLogin — the QR reverse-login poll driver (#197/#199), kept PURE and
 * framework-free so the state machine is unit-testable without a browser, a
 * timer, or React. The handheld UI (DeviceLoginPanel) is a thin shell over
 * `runDeviceLogin`: it renders the phase this emits and forwards the approved
 * token pair into the SAME session sink a typed login uses (api.setTokens).
 *
 * The whole flow honors RFC 8628: poll no faster than `pollInterval`, and back
 * off to the server-dictated interval on `slow_down`. Every terminal state
 * (approved / denied / expired / error) stops the loop exactly once.
 */
import type { DeviceStartResp, DevicePollResp } from "./api";
import type { TokenPair, AccountPublic } from "./types";

/** The observable phase of a device-login attempt. */
export type DevicePhase =
  | { kind: "starting" }
  | { kind: "waiting"; grant: DeviceStartResp }
  | { kind: "approved"; tokens: TokenPair; account: AccountPublic }
  | { kind: "denied" }
  | { kind: "expired" }
  | { kind: "error"; message: string };

/**
 * Next poll delay in ms. `slow_down` carries the server's required interval;
 * every other state keeps the current cadence. Never returns below the RFC
 * minimum the grant declared, so a bug in one branch can't turn the loop into a
 * tight spin against the server.
 */
export function nextPollDelayMs(resp: DevicePollResp, currentSec: number, minSec: number): number {
  const sec = resp.status === "slow_down" ? Math.max(resp.pollInterval, currentSec) : currentSec;
  return Math.max(sec, minSec) * 1000;
}

/** Injected seams so the driver runs deterministically under test. */
export interface DeviceLoginDeps {
  start: () => Promise<DeviceStartResp>;
  poll: (deviceCode: string) => Promise<DevicePollResp>;
  onPhase: (phase: DevicePhase) => void;
  /** resolves after ms; a test supplies a controllable fake. */
  sleep: (ms: number) => Promise<void>;
  /** ms clock, for the overall expiry guard. */
  now?: () => number;
}

/** Handle returned to the caller so it can cancel (the 取消 button / unmount). */
export interface DeviceLoginHandle {
  cancel: () => void;
}

/**
 * Drive one attempt to completion. Returns synchronously with a cancel handle;
 * the work proceeds on the microtask/timer queue. Cancellation is checked after
 * every await so a cancelled attempt makes no further poll and emits no further
 * phase.
 */
export function runDeviceLogin(deps: DeviceLoginDeps): DeviceLoginHandle {
  const now = deps.now ?? (() => Date.now());
  let cancelled = false;

  const emit = (p: DevicePhase): void => {
    if (!cancelled) deps.onPhase(p);
  };

  void (async () => {
    emit({ kind: "starting" });
    let grant: DeviceStartResp;
    try {
      grant = await deps.start();
    } catch (err) {
      emit({ kind: "error", message: errMsg(err) });
      return;
    }
    if (cancelled) return;
    emit({ kind: "waiting", grant });

    const minSec = Math.max(1, grant.pollInterval);
    let intervalSec = minSec;
    // Hard stop at the grant's own TTL: once the code is dead server-side there
    // is nothing left to poll for, and the loop must not outlive it.
    const deadline = now() + grant.expiresIn * 1000;

    while (!cancelled && now() < deadline) {
      await deps.sleep(intervalSec * 1000);
      if (cancelled || now() >= deadline) break;

      let resp: DevicePollResp;
      try {
        resp = await deps.poll(grant.deviceCode);
      } catch {
        // Transient network error — keep polling on the same cadence rather
        // than tearing the screen down; the deadline still bounds the loop.
        continue;
      }
      if (cancelled) return;

      switch (resp.status) {
        case "authorization_pending":
          continue;
        case "slow_down":
          intervalSec = nextPollDelayMs(resp, intervalSec, minSec) / 1000;
          continue;
        case "approved":
          emit({ kind: "approved", tokens: resp.tokens, account: resp.account });
          return;
        case "denied":
          emit({ kind: "denied" });
          return;
        case "expired":
          emit({ kind: "expired" });
          return;
      }
    }
    if (!cancelled) emit({ kind: "expired" });
  })();

  return {
    cancel: () => {
      cancelled = true;
    },
  };
}

function errMsg(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "device login failed";
}
