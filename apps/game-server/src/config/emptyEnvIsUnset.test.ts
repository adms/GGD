/**
 * GH#816 AC3 —— compose 的旋鈕直通區**是不是真的惰性**。
 *
 * `docker/compose.yaml` 的 game `environment:` 用 `${VAR:-}` 把 43 格旋鈕直通
 * 進容器：host 沒設 ⇒ 容器收到的是**空字串**，⛔ 不是「沒有這個變數」。
 * ⇒ 那一整塊的安全性只靠一個性質：**每一個讀點都把 `""` 當成未設**。
 *
 * ⛔ 那個性質今天成立，而它是**散文**（寫在 compose 的註解裡）——
 * 有人把 `resolveSnapshotZoneCull` 的 `raw === ""` 拿掉，#760 就會在**每一台
 * 沒設過這格的部署上靜靜關掉**，而 compose、Go 的可達性閘、型別檢查全部是綠的。
 * （可達性閘問的是「轉得到嗎」，⛔ 問不出「不轉的時候會怎樣」。）
 *
 * ⭐ 兩個方向都驗（單邊校準的尺會在最需要說話的時候沉默）：
 *   ① `""` 與「未設」逐值相同；② 一個**真的值**要能讓它變 —— 否則一支
 *      根本不讀 env 的 resolver 也會讓①全綠。
 */
import { describe, expect, it } from "vitest";
import { resolveSnapshotZoneCull } from "../net/zoneView";
import { resolveSnapshotBufferBytes } from "../net/snapshot";
import { resolveSnapshotHz } from "./snapshotRate";
import { resolveWsCompression } from "../net/wsCompression";
import { resolveEventBatch } from "../net/eventBatch";
import { resolveClusterConfig } from "./cluster";
import { contentBusEnabled } from "./contentBus";
import { cacheTtlHours, runtimeCacheEnabled } from "../contentCacheHealth";
import { damageBoardCap, damageBoardEnabled, damageBoardPerMatchTop } from "../stats/damageBoard";
import { resolveDeployTier } from "./deployTier";

type Row = {
  /** 這些 key 一起設成 "" */
  knobs: readonly string[];
  resolve: (env: NodeJS.ProcessEnv) => unknown;
  /** ②的校準：一個真的會改變結果的值 */
  changing: NodeJS.ProcessEnv;
};

const ROWS: Record<string, Row> = {
  zoneCull: {
    knobs: ["GGD_SNAPSHOT_ZONE_CULL"],
    resolve: resolveSnapshotZoneCull,
    changing: { GGD_SNAPSHOT_ZONE_CULL: "0" },
  },
  snapshotBuffer: {
    knobs: ["GGD_SNAPSHOT_BUFFER_KB"],
    resolve: resolveSnapshotBufferBytes,
    changing: { GGD_SNAPSHOT_BUFFER_KB: "8" },
  },
  snapshotHz: {
    knobs: ["GGD_SNAPSHOT_HZ"],
    resolve: resolveSnapshotHz,
    // ⚠️ 要在 MIN..MAX 之內 —— 出界的值會**退回預設**（刻意的,⛔ 不夾）,
    //    而那會讓②看起來像「這支不讀 env」。校準第一次跑就抓到我挑的 5。
    changing: { GGD_SNAPSHOT_HZ: "15" },
  },
  wsCompression: {
    knobs: [
      "GGD_WS_COMPRESSION",
      "GGD_WS_COMPRESSION_THRESHOLD",
      "GGD_WS_COMPRESSION_LEVEL",
      "GGD_WS_COMPRESSION_MEMLEVEL",
      "GGD_WS_COMPRESSION_WINDOW_BITS",
      "GGD_WS_COMPRESSION_SERVER_NO_CONTEXT",
      "GGD_WS_COMPRESSION_CLIENT_NO_CONTEXT",
      "GGD_WS_COMPRESSION_CONCURRENCY",
    ],
    resolve: resolveWsCompression,
    changing: { GGD_WS_COMPRESSION: "0" },
  },
  eventBatch: {
    knobs: ["GGD_EVENT_BATCH", "GGD_EVENT_BATCH_MIN", "GGD_EVENT_BATCH_MAX", "GGD_EVENT_BATCH_PRIVATE"],
    resolve: resolveEventBatch,
    changing: { GGD_EVENT_BATCH: "0" },
  },
  cluster: {
    knobs: [
      "GGD_GAME_PROCESSES",
      "GGD_GAME_PROCESS_INDEX",
      "GGD_GAME_PUBLIC_ADDRESS_TEMPLATE",
      "GGD_MATCHMAKER_PRESENCE",
      "GGD_GAME_IPC_TIMEOUT_MS",
      "GGD_GAME_STARTUP_STAGGER_MS",
    ],
    resolve: resolveClusterConfig,
    changing: { GGD_GAME_IPC_TIMEOUT_MS: "9000" },
  },
  contentBus: {
    knobs: ["GGD_CONTENT_BUS"],
    resolve: contentBusEnabled,
    changing: { GGD_CONTENT_BUS: "0" },
  },
  contentCacheRuntime: {
    knobs: ["GGD_CONTENT_CACHE_RUNTIME"],
    resolve: runtimeCacheEnabled,
    changing: { GGD_CONTENT_CACHE_RUNTIME: "0" },
  },
  contentCacheTtl: {
    knobs: ["GGD_CONTENT_CACHE_TTL_S"],
    resolve: cacheTtlHours,
    changing: { GGD_CONTENT_CACHE_TTL_S: "3600" },
  },
  damageBoard: {
    knobs: ["GGD_DAMAGE_BOARD", "GGD_DAMAGE_BOARD_CAP", "GGD_DAMAGE_BOARD_TOP"],
    resolve: (e) => [damageBoardEnabled(e), damageBoardCap(e), damageBoardPerMatchTop(e)],
    changing: { GGD_DAMAGE_BOARD_CAP: "7" },
  },
  deployTier: {
    knobs: ["GGD_DEPLOY_TIER"],
    resolve: resolveDeployTier,
    changing: { GGD_DEPLOY_TIER: "family" },
  },
};

describe("compose 的 ${VAR:-} 直通：空字串 = 未設", () => {
  for (const [name, row] of Object.entries(ROWS)) {
    it(`${name} —— "" 與未設逐值相同,而真的值會變`, () => {
      const blank = Object.fromEntries(row.knobs.map((k) => [k, ""])) as NodeJS.ProcessEnv;
      expect(row.resolve(blank)).toStrictEqual(row.resolve({}));
      // ② 校準:這把尺量得到「有」,否則①是空的。
      expect(row.resolve(row.changing)).not.toStrictEqual(row.resolve({}));
    });
  }
});
