/**
 * `config.map-report@1` —— 地圖驗證報告（GH#324 Phase 4）。
 *
 * ⚙️ **這份是 `pnpm --filter @ggd/anime-arena-map map:gen` 產生的，⛔ 不要手改**
 * （`pnpm --filter @ggd/anime-arena-map map:check` 會紅並指名它；
 * ⚠️ 這兩支 script 住在 tools/anime-arena-map/，從 repo 根裸打 `pnpm map:gen` 找不到）。
 *
 * ## 為什麼是一份 config 文件而不是後台即時算
 *
 * 即時算需要後台在瀏覽器裡拿到全部 `map@1` 文件 + 跑圖論。那條路要新的取得管道
 * （後台今天沒有「列出一個集合」的 API），而且會讓「報告」與「產生器真的輸出的
 * 東西」變成兩份**可能不一致**的答案。
 *
 * ⭐ 做成產生器的輸出之後：後台走既有的 `getShippedDoc("config","map-report")`、
 * 零新管道，而且 `map:check` 保證它**永遠等於**產生器現在會算出來的東西 ——
 * 它腐爛不了。
 */
import { z } from "zod";

const zIssue = z
  .object({
    kind: z.enum(["hard", "soft"]),
    check: z.string(),
    message: z.string(),
    severity: z.enum(["error", "warn", "off"]),
  })
  .strict();

const zOneMap = z
  .object({
    mapId: z.string(),
    template: z.string(),
    cols: z.number().int(),
    rows: z.number().int(),
    tileSize: z.number(),
    worldW: z.number(),
    worldD: z.number(),
    regions: z.number().int(),
    walkableTiles: z.number().int(),
    disconnectedAreas: z.number().int(),
    deadEnds: z.number().int(),
    loops: z.number().int(),
    chokepoints: z.number().int(),
    shortcuts: z.number().int(),
    interactions: z.number().int(),
    avgShortestPath: z.number(),
    longestShortestPath: z.number().int(),
    estimatedTraversalSec: z.number(),
    duelZones: z.number().int(),
    unreachableObjects: z.array(z.string()),
    invalidSpawns: z.array(z.string()),
    issues: z.array(zIssue),
    ok: z.boolean(),
  })
  .strict();

export const zConfigMapReportDoc = z
  .object({
    id: z.literal("map-report"),
    schema: z.literal("config.map-report@1"),
    note: z.string().optional(),
    maps: z.array(zOneMap),
  })
  .strict();

export type ConfigMapReportDoc = z.infer<typeof zConfigMapReportDoc>;
export type MapReportRow = z.infer<typeof zOneMap>;
