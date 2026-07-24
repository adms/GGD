/**
 * #187 — the game-server half of match liveness.
 *
 * The platform used to score every started match `now + 30 minutes` and never
 * renew it, so once `startingTeamLives` went past 3 (the owner runs 8: a 33.6
 * minute mean, 42.3 worst case) the reaper wrote ABANDONED results onto matches
 * the family was still playing. These tests hold the beat to its contract: it is
 * signed with the shared secret (so no client can forge liveness), it names
 * every live room, and it can never turn a platform outage into a match failure.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sign } from "../auth/hmac";

const queryMock = vi.fn();
const liveRecordingIdsMock = vi.fn();

vi.mock("@colyseus/core", () => ({ matchMaker: { query: (...a: unknown[]) => queryMock(...a) } }));
vi.mock("../replay/Recorder", () => ({ liveRecordingIds: () => liveRecordingIdsMock() }));

const SECRET = "test-shared-secret";

async function loadModule() {
  vi.resetModules();
  return import("./matchHeartbeat");
}

describe("match liveness heartbeat", () => {
  beforeEach(() => {
    queryMock.mockReset().mockResolvedValue([{ roomId: "room-A" }, { roomId: "room-B" }]);
    liveRecordingIdsMock.mockReset().mockReturnValue(["m_ONE"]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports every live room, signed with the shared secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", renewed: ["m_ONE"], graceSecs: 180 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { sendHeartbeat } = await loadModule();
    const ack = await sendHeartbeat(SECRET);

    expect(ack?.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/internal\/matches\/heartbeat$/);
    expect(init.method).toBe("POST");

    const body = String(init.body);
    // Both id spaces travel: room ids are the COMPLETE list (the matchmaker's
    // own view), recording ids need no resolution on the platform side.
    expect(JSON.parse(body)).toEqual({ matchIds: ["m_ONE"], gameRoomIds: ["room-A", "room-B"] });

    // Unforgeable: the signature is over the exact bytes, with the secret only
    // the platform and this process hold.
    const headers = init.headers as Record<string, string>;
    expect(headers["x-internal-auth"]).toBe(sign(SECRET, headers["x-internal-timestamp"]!, body));
    expect(sign("some-other-secret", headers["x-internal-timestamp"]!, body)).not.toBe(headers["x-internal-auth"]);
  });

  it("still beats for recorded matches when the matchmaker query fails", async () => {
    queryMock.mockRejectedValue(new Error("driver down"));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { sendHeartbeat } = await loadModule();
    await sendHeartbeat(SECRET);

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.matchIds).toEqual(["m_ONE"]);
    expect(body.gameRoomIds).toEqual([]);
  });

  it("never throws when the platform is unreachable — a match must not fail because liveness did", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const { sendHeartbeat } = await loadModule();
    await expect(sendHeartbeat(SECRET)).resolves.toBeNull();

    const { hasWarned } = await import("./platformUrl");
    expect(hasWarned("match-heartbeat")).toBe(true);
  });

  it("says so when the platform rejects the signature", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const { sendHeartbeat } = await loadModule();
    await expect(sendHeartbeat(SECRET)).resolves.toBeNull();
    const { hasWarned } = await import("./platformUrl");
    expect(hasWarned("match-heartbeat")).toBe(true);
  });

  it("sends nothing when the shard is running nothing", async () => {
    queryMock.mockResolvedValue([]);
    liveRecordingIdsMock.mockReturnValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendHeartbeat } = await loadModule();
    await expect(sendHeartbeat(SECRET)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("beats often enough that several losses in a row still fit inside the platform's 3-minute grace", async () => {
    const { HEARTBEAT_INTERVAL_MS } = await loadModule();
    expect(180_000 / HEARTBEAT_INTERVAL_MS).toBeGreaterThanOrEqual(4);
  });

  it("does not beat without a shared secret (dev mode) — the platform could only reject it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const { startMatchHeartbeat, HEARTBEAT_INTERVAL_MS } = await loadModule();
    const stop = startMatchHeartbeat("");
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });

  it("keeps beating on a schedule once started", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const { startMatchHeartbeat, HEARTBEAT_INTERVAL_MS } = await loadModule();
    const stop = startMatchHeartbeat(SECRET);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    stop();
    const after = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(fetchMock.mock.calls.length).toBe(after);
  });
});
