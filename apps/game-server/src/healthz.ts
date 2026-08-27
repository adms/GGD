/**
 * The `/healthz` payload, extracted from index.ts so it can be ASSERTED ON.
 *
 * WHY IT LIVES IN ITS OWN FILE. index.ts binds a port at import time, so its
 * response body was untestable by construction: every field on this endpoint
 * existed only inside a closure that no test could reach. That is failure shape
 * ② from CLAUDE.md — 「算出來了但從沒送到客戶端」 — pointed at the operator
 * instead of the player, and GH#170 is exactly that bug one layer down
 * (recording worked, nothing reached the disk, nothing said so). A counter that
 * is perfect and never rendered is worth precisely nothing, so the rendering is
 * now a pure function with one construction site and a test that reads it.
 *
 * It deliberately takes NO arguments: the process singletons it reads are the
 * shipped ones, so a test cannot accidentally assert against a hand-built fake
 * that the server never uses (failure shape ⑤ —「被測的不是出貨的那個」).
 */
import { roomRegistry } from "./rooms/roomRegistry";
import { tickHealth } from "./match/tickHealth";
import { platformStatusWithContent } from "./config/contentBus";
import { degradedHealthzStatus, replayHealth, type ReplayHealthSnapshot } from "./replay/replayHealth";
import { contentHealth, type ContentHealthSnapshot } from "./contentHealth";
import { contentCacheHealth, type ContentCacheSnapshot } from "./contentCacheHealth";

export interface HealthzPayload {
  /** Conjunction of every subsystem that can be unhealthy — today: replay. */
  ok: boolean;
  rooms: ReturnType<typeof roomRegistry.stats>;
  sim: ReturnType<typeof tickHealth.snapshot>;
  replay: ReplayHealthSnapshot;
  /**
   * 「這個映像的程式讀不讀得懂它掛著的內容」—— 2026-08-02 生產故障之後補的。
   * 見 ./contentHealth.ts 的檔頭：那次四項後置條件全綠而網站不能玩，
   * 因為每一項都在驗一個名詞，沒有一項在驗兩個名詞之間的關係。
   */
  content: ContentHealthSnapshot;
  /**
   * ⭐ GH#717 —— 「執行期的內容快取這一次開機**有沒有生效**」。
   *
   * ⚠️ 它**刻意不進 `ok`**：退回讀內容樹是**對的**設計（一台沒有 Redis 的機器
   * 要照樣跑得起來），⛔ 那不是「不健康」。它進這裡的理由是另一條 ——
   * fail-open 沒錯，**靜默**才是缺陷：在此之前「快取生效」與「快取整層沒接上」
   * 在外面看起來一模一樣，而 2026-08-26 量到的真相是**後者**（`apps/` 零消費端）。
   * 見 ./contentCacheHealth.ts 的檔頭。
   */
  contentCache: ContentCacheSnapshot;
  platform: ReturnType<typeof platformStatusWithContent>;
}

/**
 * `rooms` is the ONLY place the live admission state is observable. It matters
 * when an operator lowers maxRooms below the running count: the shard is not
 * broken, it is DRAINING — {active: 63, capacity: 50, draining: true} means no
 * new match starts until 13 finish. Without this the refusals look like an
 * outage.
 *
 * `platform` (task #48) is the SECOND thing that was invisible. Curation,
 * combat-env and server-ops all fail SAFE when the platform is unreachable, so
 * a misconfigured shard looks perfectly healthy while serving allow-all and
 * untuned multipliers. This block names the resolved platform URL, how it was
 * chosen, and every fail-safe currently in force — so "why did my admin tuning
 * do nothing" is one curl away instead of a log archaeology expedition.
 * `degraded: false` is a real statement, not an absence.
 *
 * `platform.content` is the THIRD, and the one the owner actually asks about:
 * "I changed it in the console — did it land on the shard?" Per document it
 * reports the version the platform last announced on the Redis bus, the version
 * this process actually re-fetched, and when.
 *
 * `sim` (task #272) is the FOURTH, and the one this endpoint exists for in the
 * first place: whether the authoritative loop is keeping up. #46 replaced a
 * freeze with a silent slow-down whose only output was one console.warn.
 *
 * `replay` (GH#170) is the FIFTH, and it was failing COMPLETELY silently.
 * Measured: with a `GGD_REPLAY_DIR` this process cannot create files in —
 * exactly what a docker bind mount owned by root gives a container running
 * `USER node` — `MatchRecorder.open()` returns a healthy-looking recorder
 * (createWriteStream fails ASYNCHRONOUSLY, after open() has returned), zero
 * bytes ever reach the disk, and the only output is one console.error per
 * match. This endpoint said `ok: true` throughout, and the admin 對戰回放 list
 * showed an empty table — which reads as 「還沒人打」, not 「every recording
 * since the deploy was lost」. `replay.writable` answers it directly (a REAL
 * create+unlink performed at boot, not a permission-bit check), and `opened`
 * climbing while `bytesWritten` stays 0 is the signature at a glance.
 */
export function buildHealthzPayload(): HealthzPayload {
  const replay = replayHealth.snapshot();
  const content = contentHealth();
  return {
    // A real conjunction, not the literal `true` this used to be.
    ok: replay.ok && content.ok,
    rooms: roomRegistry.stats(),
    sim: tickHealth.snapshot(),
    replay,
    content,
    contentCache: contentCacheHealth(),
    platform: platformStatusWithContent(),
  };
}

/**
 * The status code to answer with. 200 unless replay is degraded AND the
 * operator opted into a non-200 code.
 *
 * WHY 200 EVEN WHEN DEGRADED, by default. Recorder.ts's contract is 「a broken
 * recording must never break a game」. A liveness probe keyed on this code would
 * invert exactly that: an unwritable replay mount would start killing a game
 * shard with twelve family members on it. The BODY always tells the truth; the
 * code is opt-in via GGD_REPLAY_HEALTHZ_STATUS for a MONITORING probe.
 */
export function healthzStatus(payload: HealthzPayload): number {
  return payload.ok ? 200 : degradedHealthzStatus();
}
