/**
 * deviceLogin — the pure QR reverse-login poll driver. These pin the RFC-8628
 * loop behaviour (pending keeps polling, slow_down backs off, every terminal
 * state stops exactly once, cancel halts further polling) with a fully
 * controllable fake clock/sleep so no real timers run.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { runDeviceLogin, nextPollDelayMs, type DevicePhase } from "./deviceLogin";
import type { DeviceStartResp, DevicePollResp } from "./api";
import type { TokenPair, AccountPublic } from "./types";

const GRANT: DeviceStartResp = {
  deviceCode: "dc-secret",
  userCode: "WXYZ-2345",
  verificationUri: "https://ggd.adms.ai/link",
  verificationUriComplete: "https://ggd.adms.ai/link?code=WXYZ-2345",
  expiresIn: 300,
  pollInterval: 5,
};
const TOKENS: TokenPair = { accessToken: "a", refreshToken: "r", expiresIn: 900 };
const ACCOUNT: AccountPublic = { id: "acc-1", username: "phone", mmr: 1000, games: 0, wins: 0, createdAt: "" };

/** A sleep whose resolutions we release one at a time to step the loop. */
function manualSleep() {
  const pending: (() => void)[] = [];
  const sleep = (_ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      pending.push(resolve);
    });
  const step = async (): Promise<void> => {
    const r = pending.shift();
    if (r) r();
    // let the awaiting microtasks flush
    await Promise.resolve();
    await Promise.resolve();
  };
  return { sleep, step, pendingCount: () => pending.length };
}

describe("nextPollDelayMs", () => {
  it("backs off to the server interval on slow_down, keeps cadence otherwise", () => {
    cover("webui-device-poll-driver");
    expect(nextPollDelayMs({ status: "slow_down", pollInterval: 10 }, 5, 5)).toBe(10_000);
    expect(nextPollDelayMs({ status: "authorization_pending" }, 5, 5)).toBe(5_000);
    // never drops below the RFC minimum
    expect(nextPollDelayMs({ status: "slow_down", pollInterval: 1 }, 5, 5)).toBe(5_000);
  });
});

describe("runDeviceLogin", () => {
  it("start → pending → approved feeds the token pair through exactly once", async () => {
    cover("webui-device-poll-driver");
    const phases: DevicePhase[] = [];
    const poll = vi
      .fn<(dc: string) => Promise<DevicePollResp>>()
      .mockResolvedValueOnce({ status: "authorization_pending" })
      .mockResolvedValueOnce({ status: "approved", tokens: TOKENS, account: ACCOUNT });
    const { sleep, step } = manualSleep();

    runDeviceLogin({
      start: async () => GRANT,
      poll,
      onPhase: (p) => phases.push(p),
      sleep,
    });
    await Promise.resolve(); // let start() resolve

    await step(); // first poll → pending
    await step(); // second poll → approved

    expect(phases[0]!.kind).toBe("starting");
    expect(phases[1]).toMatchObject({ kind: "waiting" });
    const approved = phases.find((p) => p.kind === "approved");
    expect(approved).toEqual({ kind: "approved", tokens: TOKENS, account: ACCOUNT });
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("honors slow_down by lengthening the delay it next sleeps", async () => {
    cover("webui-device-poll-driver");
    const slept: number[] = [];
    const pending: (() => void)[] = [];
    const sleep = (ms: number): Promise<void> => {
      slept.push(ms);
      return new Promise<void>((r) => pending.push(r));
    };
    const step = async (): Promise<void> => {
      pending.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    };
    const poll = vi
      .fn<(dc: string) => Promise<DevicePollResp>>()
      .mockResolvedValueOnce({ status: "slow_down", pollInterval: 10 })
      .mockResolvedValueOnce({ status: "approved", tokens: TOKENS, account: ACCOUNT });

    runDeviceLogin({ start: async () => GRANT, poll, onPhase: () => {}, sleep });
    await Promise.resolve();

    await step(); // first sleep was 5s → poll → slow_down
    await step(); // second sleep must be the backed-off 10s

    expect(slept[0]).toBe(5_000);
    expect(slept[1]).toBe(10_000);
  });

  it("denied and expired are terminal", async () => {
    cover("webui-device-poll-driver");
    for (const [status, kind] of [
      ["denied", "denied"],
      ["expired", "expired"],
    ] as const) {
      const phases: DevicePhase[] = [];
      const { sleep, step } = manualSleep();
      const poll = vi
        .fn<(dc: string) => Promise<DevicePollResp>>()
        .mockResolvedValue({ status } as DevicePollResp);
      runDeviceLogin({ start: async () => GRANT, poll, onPhase: (p) => phases.push(p), sleep });
      await Promise.resolve();
      await step();
      await step(); // no further poll after a terminal state
      expect(phases.at(-1)?.kind).toBe(kind);
      expect(poll).toHaveBeenCalledTimes(1);
    }
  });

  it("cancel() stops further polling", async () => {
    cover("webui-device-poll-driver");
    const { sleep, step } = manualSleep();
    const poll = vi.fn<(dc: string) => Promise<DevicePollResp>>().mockResolvedValue({
      status: "authorization_pending",
    });
    const handle = runDeviceLogin({ start: async () => GRANT, poll, onPhase: () => {}, sleep });
    await Promise.resolve();
    await step(); // one poll happens
    handle.cancel();
    await step(); // released sleep, but cancelled → no more polls
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("surfaces a start failure as an error phase", async () => {
    cover("webui-device-poll-driver");
    const phases: DevicePhase[] = [];
    const { sleep } = manualSleep();
    runDeviceLogin({
      start: async () => {
        throw new Error("network down");
      },
      poll: async () => ({ status: "authorization_pending" }),
      onPhase: (p) => phases.push(p),
      sleep,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(phases.at(-1)).toEqual({ kind: "error", message: "network down" });
  });
});
