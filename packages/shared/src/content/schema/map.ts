/**
 * `map@1` —— 作者層的地圖版面（GH#324 Phase 1）。
 *
 * ⭐ **這一份是人寫的，`arena@1` 是產生器編譯出來的。** 兩者的關係：
 *
 * ```
 *   content/maps/map.*.json   ✍️ 人（owner／編輯器）—— 版面的唯一來源
 *            │  pnpm map:gen
 *            ▼
 *   content/arenas/arena.*.json  ⚙️ 產生器擁有，⛔ 禁止手改
 *            │
 *            ▼  runtime 只認這一份
 * ```
 *
 * ⚠️ **術語**：這裡的 `regions` 是 **owner 說的「4–6 個 zone」**（琵琶廳／庭院／月台）。
 * ⛔ 它**不是** codebase 裡的 `zone` —— 那個字已經被用掉了，指的是「一場獨立的 3v3
 * 對戰實例」，而且是**隔離**的（zone 0 的單位對 zone 1 看不到打不到治不到）。
 * 兩者同名會同時造成五件事而一條測試都不會紅，完整清單在 `docs/_新場地計畫.md` 第二節。
 *
 * ⚠️ owner 2026-08-14「這是一個 3v3 地形」⇒ **一張 map = 一個對戰分區的地形**，
 * 產生器把同一份佈局實例化 ≥2 份填進 `arena@1` 的 `zones[]`。
 */
import { z } from "zod";
import { zId } from "./common";
import { zBackdrop } from "./arena";
import {
  GIMMICKS_PER_MAP_MAX,
  GRID_COLS_MAX,
  GRID_COLS_MIN,
  GRID_ROWS_MAX,
  GRID_ROWS_MIN,
  INTERACTIONS_MAX,
  REGIONS_MAX,
  REGIONS_MIN,
  TILE_SIZE_MAX,
  TILE_SIZE_MIN,
} from "../../map/spec";

/**
 * ⛔ **封閉 enum，就這四個。** owner 2026-08-14：「Claude 不要自由發揮。」
 *
 * 判準（第〇·五守則）：**如果我在為某一張圖寫一個 if，就越線了。**
 * 「無限城」在程式裡不應該有名字 —— 它只是 `CENTRAL_RING` + 一組參數 + 一張手繪 tiles。
 */
export const zMapTemplate = z.enum([
  "CENTRAL_RING",
  "CROSS_RING",
  "DOUBLE_LOOP",
  "ARENA_RING",
]);
export type MapTemplate = z.infer<typeof zMapTemplate>;

/** 格座標（整數）。⚠️ 與世界座標 `zVec2` 刻意不同型，避免兩者混用。 */
const zTile = z.object({ col: z.number().int().min(0), row: z.number().int().min(0) }).strict();

/**
 * 地圖區域的角色 —— 只影響**產生器的擺放偏好與報告分類**，⛔ 不影響 runtime 行為。
 * runtime 只認烘焙好的 tile→region 表。
 */
const zRegionRole = z.enum(["landmark", "court", "corridor", "outer", "platform"]);

const zRegion = z
  .object({
    id: z.string().min(1).regex(/^[a-z0-9_]+$/, "region id 只能用小寫、數字與底線"),
    label: z.string().min(1).describe("玩家報位置時會說出口的名字，例如「琵琶廳」。"),
    role: zRegionRole,
    rects: z
      .array(
        z
          .object({
            col: z.number().int().min(0),
            row: z.number().int().min(0),
            w: z.number().int().positive(),
            h: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .describe("這個區域佔哪些格。用矩形而不是逐格列舉 —— PR 裡讀得懂。"),
  })
  .strict();

/**
 * ⭐ 互動點的 `kind` 是**機制**，位置與參數是**內容**（第〇·五守則的形狀）。
 * ⛔ 引擎裡不可以出現 `if (map === "infinity-castle")`。
 */
const zInteractionKind = z.enum(["channel", "pickup", "capture", "toggleGate"]);

const zInteraction = z
  .object({
    id: z.string().min(1),
    kind: zInteractionKind,
    at: zTile,
    radius: z.number().positive().max(20).describe("觸發半徑（世界單位）。"),
    regionId: z.string().min(1),
    /** 機制自己的參數。⚠️ 由各 kind 的消費端解讀，這裡刻意不 strict。 */
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  })
  .strict();

const zProp = z
  .object({
    model: z.string().regex(/^assets\//, "prop 的 model 必須是 content/ 底下的路徑"),
    at: zTile,
    rotQuarter: z.number().int().min(0).max(3).default(0),
    scale: z.number().positive().default(1),
  })
  .strict();

/**
 * 第二層：**動漫辨識元素**（琵琶、障子門、紅燈籠、倒置房屋…）。
 *
 * ⚠️ `blocks` 是這一層**唯一會影響玩法**的一格 —— true 才編譯成碰撞。
 * ⛔ Phase 6 的守衛：只改 landmark／background 時，重新產生的 `obstacles` 陣列
 *    必須 byte-identical。**美術不可以改變碰撞。**
 */
const zLandmarkProp = zProp.extend({
  blocks: z
    .boolean()
    .default(false)
    .describe("true = 這件道具會被編譯成障礙物。⛔ 這是這一層唯一會影響玩法的一格。"),
});

/**
 * 第三層：**不可進入的背景**。無數樓梯、倒掛建築、深淵、天空盒。
 *
 * ⭐ 這一層就是「場景看起來很大、實際很小」那個技巧的所在地。
 * ⛔ **永遠不編譯成障礙物**，schema 上連 `blocks` 這格都沒有。
 */
const zBackgroundProp = zProp;

/**
 * ⭐ 一張圖**最多一個**特殊機制（owner 定死）。
 *
 * `routeSwap` 做成**通用 gate**：障礙物可帶 `gateGroup`，狀態是
 * `gateStateAt(doc, absoluteTick)` 這個**絕對 tick 的純函式** ⇒
 * 客戶端用已複寫的 tick 自己算，**wire 成本 0、沒有 desync 通道**。
 *
 * ⚠️「永不困住玩家」是**驗證器的性質**，不是 runtime 程式碼：每一個 configuration
 * 的圖都必須全連通、所有出生點與互動點可達，否則產生器拒絕輸出。
 *
 * ⭐ 同一個機制順便給了城門、崩塌的橋、可破壞的牆 —— 七張圖的機制有五個是這個形狀。
 */
const zGimmick = z
  .object({
    kind: z.enum(["none", "routeSwap"]),
    gateGroups: z
      .array(z.object({ id: z.string().min(1), tiles: z.array(zTile).min(1) }).strict())
      .default([]),
    schedule: z
      .object({
        kind: z.literal("periodic"),
        periodTicks: z.number().int().positive().describe("⚠️ 絕對 tick，⛔ 不是遞減計數器。"),
        telegraphTicks: z
          .number()
          .int()
          .min(0)
          .describe("切換前先預告幾 tick。0 = 沒有預告（玩家會被瞬間關門）。"),
        configurations: z
          .array(z.array(z.string()))
          .min(2)
          .describe("每個組態列出**哪些 gateGroup 是關上的**。至少兩組才叫「交換」。"),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((g, ctx) => {
    if (g.kind !== "none" && g.schedule === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedule"],
        message: `gimmick "${g.kind}" 需要 schedule，否則它永遠不會發生`,
      });
    }
    if (g.kind === "none" && g.gateGroups.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gateGroups"],
        message: "kind 是 none 卻定義了 gateGroups —— 這些門永遠不會動",
      });
    }
  });

const zMapBase = z
  .object({
    id: zId,
    name: z.string().min(1),
    /** 作者寫給下一個接手的人看的。⛔ 引擎不讀它。 */
    note: z.string().optional(),
    template: zMapTemplate,

    grid: z
      .object({
        cols: z.number().int().min(GRID_COLS_MIN).max(GRID_COLS_MAX),
        rows: z.number().int().min(GRID_ROWS_MIN).max(GRID_ROWS_MAX),
        tileSize: z.number().min(TILE_SIZE_MIN).max(TILE_SIZE_MAX),
      })
      .strict(),

    /**
     * ⭐ 用**字串陣列**而不是二維數字陣列，是為了讓 PR 讀得懂：
     * 一張 24×18 的圖在 diff 裡就是 18 行 24 字，人眼直接讀得出佈局。
     *   `.` = 地面 · `#` = 牆 · ` ` = 虛空（不可站、不畫地板）
     */
    tiles: z
      .array(z.string().regex(/^[.# ]+$/, "tiles 只能用 '.'（地面）、'#'（牆）與空白（虛空）"))
      .min(1),

    regions: z.array(zRegion).min(REGIONS_MIN).max(REGIONS_MAX),
    landmark: z.string().min(1).describe("招牌景觀的 region id。玩家報位置時的地標。"),
    interactions: z.array(zInteraction).max(INTERACTIONS_MAX).default([]),
    gimmick: zGimmick,

    landmarkProps: z.array(zLandmarkProp).default([]),
    backgroundProps: z.array(zBackgroundProp).default([]),

    /**
     * ⭐ 第三層的**主力** —— 圓盤外的 2D 景深背景（owner 2026-08-14）。
     *
     * `backgroundProps` 擺的是「一件一件的道具」，那要有模型才有東西看，
     * 而 graybox 階段一個模型都沒有 ⇒ 七張圖的 `backgroundProps` 全是 `[]`，
     * **圓盤外就是一片純黑**。這一格用**程序產生的平面環帶**把那片黑填掉，
     * ⛔ 不需要任何美術資產。
     *
     * ⚠️ 它**不吃 tile 座標**：背景是繞著整個場地的環，跟格線無關。
     */
    backdrop: zBackdrop.optional(),
  })
  .strict();

/**
 * 跨欄位的一致性檢查。⚠️ 抽成具名函式是因為 `zMapDef` 與 `zMapDoc` 都要用它 ——
 * `.superRefine()` 回傳 ZodEffects，之後就 `.extend()` 不動了。
 */
const refineMap = (m: z.infer<typeof zMapBase>, ctx: z.RefinementCtx): void => {
    // tiles 的形狀必須跟 grid 對得上 —— 對不上的話後面每一個座標都是錯的
    if (m.tiles.length !== m.grid.rows) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tiles"],
        message: `tiles 有 ${m.tiles.length} 行，但 grid.rows 是 ${m.grid.rows}`,
      });
    }
    m.tiles.forEach((row, i) => {
      if (row.length !== m.grid.cols) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tiles", i],
          message: `第 ${i} 行有 ${row.length} 格，但 grid.cols 是 ${m.grid.cols}`,
        });
      }
    });

    const ids = new Set(m.regions.map((r) => r.id));
    if (ids.size !== m.regions.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["regions"], message: "region id 重複" });
    }
    if (!ids.has(m.landmark)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["landmark"],
        message: `landmark "${m.landmark}" 不是任何一個 region 的 id`,
      });
    }
    m.interactions.forEach((it, i) => {
      if (!ids.has(it.regionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["interactions", i, "regionId"],
          message: `互動點 "${it.id}" 指到不存在的 region "${it.regionId}"`,
        });
      }
    });

    // gimmick 至多一個 —— 目前 schema 上只有一格，這條在守「將來有人把它改成陣列」
    const gimmickCount = m.gimmick.kind === "none" ? 0 : 1;
    if (gimmickCount > GIMMICKS_PER_MAP_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gimmick"],
        message: `一張圖最多 ${GIMMICKS_PER_MAP_MAX} 個特殊機制`,
      });
    }

    // gateGroups 的 id 必須被 schedule 的 configurations 認得，反之亦然
    if (m.gimmick.schedule) {
      const groupIds = new Set(m.gimmick.gateGroups.map((g) => g.id));
      m.gimmick.schedule.configurations.forEach((cfg, ci) => {
        cfg.forEach((gid, gi) => {
          if (!groupIds.has(gid)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["gimmick", "schedule", "configurations", ci, gi],
              message: `組態指到不存在的 gateGroup "${gid}"`,
            });
          }
        });
      });
    }
};

export const zMapDef = zMapBase.superRefine(refineMap);
export const zMapDoc = zMapBase
  .extend({ schema: z.literal("map@1") })
  .strict()
  .superRefine(refineMap);

export type MapDoc = z.infer<typeof zMapDoc>;
export type MapRegionDef = z.infer<typeof zRegion>;
export type MapInteractionDef = z.infer<typeof zInteraction>;
