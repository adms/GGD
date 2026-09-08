/**
 * `config.map-spec@1` —— 小地圖規格的**出貨值**（GH#324 Phase 1）。
 *
 * owner 2026-08-14 定死了一套所有動漫場地共用的規格。⭐ 它們全部是**後台可調**的
 * （第一守則：寫死才需要理由，可調不需要），所以走三個住處：
 *
 *   1. `content/config/map-spec.json`                —— 出貨值
 *   2. 這個檔（Zod + `DEFAULT_MAP_SPEC` + `resolveMapSpec`）
 *   3. `apps/admin/src/configForms.ts` 的 `MAP_SPEC_SPEC`（欄位 union + 標籤）
 *
 * ⚠️ **界**（每一格的合法範圍）從 `../../map/spec` import，⛔ 不抄字面值 ——
 * 產生器與驗證器要用同一組界，抄一份就是第四個住處（第零守則）。
 *
 * ⛔ **驗證器與測試一律從 `DEFAULT_MAP_SPEC` 推導，不抄 24 / 18 / 12 / 20。**
 * 那些是 owner 每週會改的數字；抄進斷言必過期，而且會用錯誤的訊息紅。
 */
import { z } from "zod";
import {
  GRID_COLS_MAX,
  GRID_COLS_MIN,
  GRID_ROWS_MAX,
  GRID_ROWS_MIN,
  INTERACTIONS_MAX,
  REGIONS_MAX,
  REGIONS_MIN,
  SPAWN_CLEARANCE_BODY_RADII_MAX,
  SPAWN_CLEARANCE_BODY_RADII_MIN,
  NAV_HEADROOM_MAX,
  NAV_HEADROOM_MIN,
  SPAWN_ROOM_BODY_RADII_MAX,
  SPAWN_ROOM_BODY_RADII_MIN,
  SPAWN_ROOM_BODY_RADII_SHIPPED,
  SPAWN_POCKET_PATH_FACTOR_MAX,
  SPAWN_POCKET_PATH_FACTOR_MIN,
  TILE_SIZE_MAX,
  TILE_SIZE_MIN,
  TILE_SIZE_SHIPPED,
} from "../../map/spec";

const zSeverity = z.enum(["error", "warn", "off"]);

/**
 * 「品味項」的處置。⛔ 這裡**沒有**連通性 —— 那是正確性，產生器一律拒絕輸出，
 * 與這格設定無關（見 `map/spec.ts::HARD_CHECKS`）。
 */
const zSeverityBlock = z
  .object({
    deadEnds: zSeverity.describe(
      "死路超過上限時：error = 產生器拒絕輸出、warn = 只記進報告、off = 不看。" +
        "⚠️ 死路多會讓追人變成「堵住就贏」，這是 owner 規格裡 ≤1 的理由。",
    ),
    loops: zSeverity.describe(
      "迴圈少於下限時的處置。⚠️ 迴圈是「被追時能不能繞回來」的唯一來源 —— " +
        "沒有迴圈的圖，被追上就等於死。",
    ),
    chokepoints: zSeverity.describe(
      "瓶頸數量超出範圍時的處置。瓶頸太少 = 沒有戰術地形；太多 = 到處卡住。",
    ),
    shortcuts: zSeverity.describe("捷徑數量超出範圍時的處置。"),
    interactions: zSeverity.describe("互動／任務點數量超出範圍時的處置。"),
    traversal: zSeverity.describe(
      "估算的橫跨時間落在 secMin~secMax 之外時的處置。" +
        "⚠️ 這是**估算**（最長最短路徑 ÷ 參考移速），不是實測。",
    ),
  })
  .strict();

export const zConfigMapSpecDoc = z
  .object({
    id: z.literal("map-spec"),
    schema: z.literal("config.map-spec@1"),
    note: z.string().optional(),

    grid: z
      .object({
        colsMin: z.number().int().min(GRID_COLS_MIN).max(GRID_COLS_MAX),
        colsMax: z.number().int().min(GRID_COLS_MIN).max(GRID_COLS_MAX),
        rowsMin: z.number().int().min(GRID_ROWS_MIN).max(GRID_ROWS_MAX),
        rowsMax: z.number().int().min(GRID_ROWS_MIN).max(GRID_ROWS_MAX),
        tileSize: z
          .number()
          .min(TILE_SIZE_MIN)
          .max(TILE_SIZE_MAX)
          .describe(
            "一格等於幾個世界單位。⭐ 出貨 2.0 的唯一理由：24×18 格 = 48×36 單位，" +
              "與今天的對戰分區（半徑 24 ⇒ 直徑 48）**同尺度**，於是 AoE 級距、" +
              "火圈上界、**全部 90 支技能的射程**一格都不用重算。" +
              "⚠️ 改大它 = 順便重調全部技能，改之前先讀 docs/_新場地計畫.md 的 A3。",
          ),
      })
      .strict()
      .superRefine((g, ctx) => {
        if (g.colsMin > g.colsMax) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["colsMax"],
            message: "colsMax 不可以小於 colsMin",
          });
        }
        if (g.rowsMin > g.rowsMax) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["rowsMax"],
            message: "rowsMax 不可以小於 rowsMin",
          });
        }
      }),

    traversal: z
      .object({
        secMin: z.number().min(1).max(120),
        secMax: z.number().min(1).max(120),
        referenceMoveSpeed: z
          .number()
          .min(0.5)
          .max(60)
          .describe(
            "估算橫跨時間用的參考移速（世界單位／秒）。⚠️ 這是**估算的分母**，" +
              "⛔ 不是遊戲裡的移速 —— 真正的移速在戰鬥系統倍率表。",
          ),
      })
      .strict()
      .superRefine((t, ctx) => {
        if (t.secMin > t.secMax) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["secMax"],
            message: "secMax 不可以小於 secMin",
          });
        }
      }),

    topology: z
      .object({
        regionsMin: z.number().int().min(REGIONS_MIN).max(REGIONS_MAX),
        regionsMax: z.number().int().min(REGIONS_MIN).max(REGIONS_MAX),
        regionsPreferred: z
          .number()
          .int()
          .min(REGIONS_MIN)
          .max(REGIONS_MAX)
          .describe("owner 最推薦的區域數（5）。⚠️ 只影響報告上的提示，⛔ 不擋輸出。"),
        deadEndsMax: z.number().int().min(0).max(16),
        loopsMin: z
          .number()
          .int()
          .min(0)
          .max(16)
          .describe("至少要有幾條主要循環路線。⭐ 這是「被追時能不能繞回來」的唯一保證。"),
        chokepointsMin: z.number().int().min(0).max(16),
        chokepointsMax: z.number().int().min(0).max(16),
        shortcutsMin: z.number().int().min(0).max(16),
        shortcutsMax: z.number().int().min(0).max(16),
      })
      .strict()
      .superRefine((t, ctx) => {
        const pairs: [number, number, string][] = [
          [t.regionsMin, t.regionsMax, "regionsMax"],
          [t.chokepointsMin, t.chokepointsMax, "chokepointsMax"],
          [t.shortcutsMin, t.shortcutsMax, "shortcutsMax"],
        ];
        for (const [lo, hi, path] of pairs) {
          if (lo > hi) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [path],
              message: `${path} 不可以小於它的下界`,
            });
          }
        }
        if (t.regionsPreferred < t.regionsMin || t.regionsPreferred > t.regionsMax) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["regionsPreferred"],
            message: "regionsPreferred 必須落在 regionsMin~regionsMax 之內",
          });
        }
      }),

    interactions: z
      .object({
        countMin: z.number().int().min(0).max(INTERACTIONS_MAX),
        countMax: z.number().int().min(0).max(INTERACTIONS_MAX),
      })
      .strict()
      .superRefine((i, ctx) => {
        if (i.countMin > i.countMax) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["countMax"],
            message: "countMax 不可以小於 countMin",
          });
        }
      }),

    severity: zSeverityBlock,

    /**
     * ⭐ **出生點怎麼擺**（GH#364 第二半，owner 2026-08-18「fix all」）。
     *
     * ⚠️ 這一格調的是**產生器挑座位的規則**，⛔ 不是任何一張已經產生出來的圖 ——
     * 改完要重跑 `pnpm --filter @ggd/anime-arena-map map:gen`。
     *
     * ⛔ 為什麼是**兩把尺**而不是一格「內縮 N 格」：owner 提的是 2–3 格，但
     * 「格」是一個後台欄位（`grid.tileSize`），同一個數字在兩張圖上是兩個距離。
     * 而且出生點有**兩個**壞法，貼牆只是其中一個 —— 芙莉蓮那張圖的座位同時
     * 「貼著外牆」**且**「離火圈收束口袋最遠」，兩件事各要一把尺。
     */
    spawn: z
      .object({
        minWallClearanceBodyRadii: z
          .number()
          .min(SPAWN_CLEARANCE_BODY_RADII_MIN)
          .max(SPAWN_CLEARANCE_BODY_RADII_MAX)
          .describe(
            "出生點到最近一堵牆（含可玩區外緣）至少幾個**身體半徑**。" +
              "⭐ 用身體半徑而不是格數，是因為格子大小本身是一格欄位。",
          ),
        maxPocketPathFactor: z
          .number()
          .min(SPAWN_POCKET_PATH_FACTOR_MIN)
          .max(SPAWN_POCKET_PATH_FACTOR_MAX)
          .describe(
            "從出生點**走**到火圈收束口袋的路徑長度上限 = 這一格 × 分區半徑。" +
              "⚠️ 是繞過牆的路徑長度，⛔ 不是直線距離。",
          ),
      })
      .strict()
      .optional(),

    /**
     * ⭐ **通道淨空**（owner 2026-08-19：「地圖路徑缺口大一點 不要那麼小氣
     * 導致來回測量修改」）。
     *
     * ⚠️ 這一格與上面的 `spawn` 是**兩件事**：`spawn` 管「座位擺在哪」，
     * 這一格管「**兩個座位之間走不走得通**」。GH#387 就是後者壞掉而前者全綠 ——
     * 六個座位每一個都合法，而中央牆把場地切成兩半。
     */
    nav: z
      .object({
        headroom: z
          .number()
          .min(NAV_HEADROOM_MIN)
          .max(NAV_HEADROOM_MAX)
          .describe(
            "場地通道的最小淨空 = **最大身體直徑 × 這個倍率**。" +
              "⭐ 最大身體半徑從出貨的 mobWaves 推導，⛔ 不是寫死的公尺數 —— " +
              "調胖殭屍時門檻自己跟著長。1 = 剛好塞得下（等於關掉這把尺）。",
          ),
        minSpawnRoomBodyRadii: z
          .number()
          .min(SPAWN_ROOM_BODY_RADII_MIN)
          .max(SPAWN_ROOM_BODY_RADII_MAX)
          .describe(
            "剛生出來的身體，至少要能往某個方向直線移動**幾個身體半徑**。" +
              "⚠️ 與上面那一格是**兩件事**：那個問「這條路夠不夠寬」，" +
              "這個問「這一個落點離不離得開」。",
          )
          .optional(),
      })
      .strict()
      .optional(),

    /**
     * ⭐ 戰鬥開場報地名（owner 2026-08-14：「戰鬥開始的時候不會顯示這是什麼地圖，
     * 請你記得要顯示出來」）。
     *
     * ⚠️ 為什麼住在 `map-spec` 而不是自己開一份文件：這是**地圖層級的旋鈕**，
     * 而這份文件已經有後台頁（🗺️ 地圖規格）。新開一份 = 新開一頁 = 為三格
     * 開關付一整頁的成本。
     */
    intro: z
      .object({
        enabled: z.boolean().describe("戰鬥開場要不要打出地圖名字。關＝ 完全不畫。"),
        holdSec: z
          .number()
          .min(0)
          .max(15)
          .describe("名字停留幾秒（之後才開始淡出）。⚠️ 上界 15：比一個回合還久的提示就是擋畫面。"),
        fadeSec: z.number().min(0).max(5).describe("淡出幾秒。0 = 直接消失。"),
      })
      .strict()
      .optional(),

    /**
     * ⭐ 地名**常駐**角落小字（owner 2026-08-15：「場地名稱可以一直顯示在角落小字」）。
     *
     * ⚠️ 這跟 `intro` 是**兩件事**，⛔ 不要合併成一格：
     * `intro` 是**開場演出**（大字、佔中央、幾秒後消失），
     * 這一格是**常駐標籤**（小字、待在角落、整場都在）。
     * 一個是「告訴你這場開始了」，一個是「隨時看得到自己在哪」。
     * 合成一格的話「關掉開場演出」就會連常駐標籤一起關掉 —— 那不是任何人要的。
     */
    cornerLabel: z
      .object({
        enabled: z.boolean().describe("戰鬥中要不要在角落一直顯示地圖名字。關＝完全不畫。"),
        /*
         * ⚠️ 這裡**沒有**「貼哪一角」。位置不是一個選擇 —— 標籤畫在**小地圖
         * 自己那塊裡**（它就是那張圖的標題），所以小地圖搬到哪它就跟到哪
         * （手機上小地圖從右下搬到左上，標籤自動跟著）。
         * ⛔ 曾經有一格 `corner` 下拉選單，拿掉了：三個角落都已經有預算，
         * 一行地名不值得從既有功能手上拿走空間（整段量測見
         * `apps/client/src/ui/hud/MapCornerLabel.tsx` 的檔頭）。
         * 一個選了也不會動的下拉選單比沒有更糟。
         */
        opacity: z
          .number()
          .min(0.1)
          .max(1)
          .describe("不透明度。⚠️ 下界 0.1 而不是 0：0 等於「開著但看不見」，那是最難查的壞法。"),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ConfigMapSpecDoc = z.infer<typeof zConfigMapSpecDoc>;

/**
 * 開場報地名的三格。⚠️ 具名而且**非選填**，⛔ 不要直接用
 * `DEFAULT_MAP_SPEC.intro` 去 spread —— schema 上那一格是 `.optional()`，
 * spread 之後每一格都變成 `| undefined`，`resolveMapSpec` 的回傳型別就對不上了
 * （tsc 在 2026-08-14 擋下過一次）。
 */
export type MapIntroSpec = NonNullable<ConfigMapSpecDoc["intro"]>;

/** owner 2026-08-14：「戰鬥開始的時候不會顯示這是什麼地圖，請你記得要顯示出來」。
 *  ⚠️ 回退值是**開的** —— 讀不到設定時要落在 owner 要的那一邊。
 *  2.5 秒 = 「看得完四個字 + 不擋開局」（一回合戰鬥只有 90 秒）。 */
export const DEFAULT_MAP_INTRO: MapIntroSpec = { enabled: true, holdSec: 2.5, fadeSec: 0.8 };

/** 出生點擺放的兩把尺。⚠️ 具名而且非選填，理由同 {@link MapIntroSpec}。 */
export type MapSpawnSpec = NonNullable<ConfigMapSpecDoc["spawn"]>;

/**
 * ⭐ 出貨值（GH#364）。**兩個數字都是量出來的，⛔ 不是挑順眼的。**
 *
 * ### `minWallClearanceBodyRadii: 3`
 * 身體半徑 0.6 ⇒ 1.8 個單位 ＝ **你自己那 1 個半徑 + 旁邊還有一整個身體寬度
 * （2 個半徑）可以側移**。低於它就是 owner 截圖上那條「旁邊就是圖外」的窄走道。
 * 量到的效果（tileSize 2）：出貨 7 張產生圖的離牆距離 **1.00 → 3.00**，
 * 座位從最外圈那格退到第 3 格（＝ owner 說的「內縮 2–3 格」，但是推導出來的）。
 *
 * ### `maxPocketPathFactor: 0.8`
 * ⭐ **綁住它的是「兩隊開場不可以互相在射程內」，不是品味。**
 * 全遊戲最長的射程是 **29.33**（`godie-orkn` / `godie-o030` 的天生技）。
 * 逐格量過：0.75 會把最近的一對座位壓到 **28.0 —— 已經在那個射程裡**；
 * 0.8 的最近一對是 **34.0**，還在外面。⇒ 0.8 是**還守得住那條線的最緊預算**。
 * 上面（0.9 ⇒ 預算 27）則幾乎擋不到出貨最糟的那張（芙莉蓮 28.0），
 * 一把只剩 1 個單位餘裕的尺等於沒有尺。
 */
export const DEFAULT_MAP_SPAWN: MapSpawnSpec = {
  minWallClearanceBodyRadii: 3,
  maxPocketPathFactor: 0.8,
};

/**
 * 通道淨空的兩把尺。⚠️ 具名而且非選填，理由同 {@link MapIntroSpec}。
 *
 * ⚠️ `Required<>` 是**刻意**的：`minSpawnRoomBodyRadii` 在 schema 上是 `.optional()`
 * （⛔ 不可以改成必填 —— 已經部署出去的 bundle 裡那份文件沒有這一格，必填會讓
 *  **整份內容載入失敗**然後 fail-open 退回 2 隻骨架，那正是 2026-08-02 事故的形狀），
 * 但**解析之後**它一定有值。
 */
export type MapNavSpec = Required<NonNullable<ConfigMapSpecDoc["nav"]>>;

/**
 * ⭐ 出貨值 **1.5**（owner 2026-08-19：「地圖路徑缺口大一點 **不要那麼小氣**
 * 導致**來回測量修改**」）。
 *
 * 1.5 ⇒ 出貨門檻 `2 × 1.08 × 1.5 = 3.24` 單位 —— 特殊殭屍走過去，**兩側各還剩
 * 半個身體**的空間。⛔ 這個 3.24 沒有第二個住處：它是 `mobProfile` × 這一格算出來的。
 *
 * ⚠️ 選 1.5 而不是「剛好過」（1.0）的理由是**成本**，不是手感：GH#387/#388 的餘裕
 * 分別只有 0.92 與 0.43 單位，而 owner 每週在調 `radiusMult` —— 一次微調就要再走一次
 * 「量→改→重測」。1.5 讓那一格可以動到 **1.5 倍**才需要有人回頭看。
 *
 * ⭐ `minSpawnRoomBodyRadii` 出貨 **1**（GH#398）——「至少動得了自己一個半徑」。
 * ⛔ 這個數字**沒有第二個住處**：它就是 `map/spec.ts::SPAWN_ROOM_BODY_RADII_SHIPPED`，
 * runtime（`spotHasRoom` 的預設值）與這一格讀的是**同一個常數**，所以不可能漂移。
 */
export const DEFAULT_MAP_NAV: MapNavSpec = {
  headroom: 1.5,
  minSpawnRoomBodyRadii: SPAWN_ROOM_BODY_RADII_SHIPPED,
};

/** 常駐角落地名的三格。⚠️ 具名而且非選填，理由同 {@link MapIntroSpec}。 */
export type MapCornerLabelSpec = NonNullable<ConfigMapSpecDoc["cornerLabel"]>;

/** owner 2026-08-15：「場地名稱可以一直顯示在角落小字」。
 *  ⚠️ 回退值是**開的** —— 讀不到設定時要落在 owner 要的那一邊（同 intro）。
 *  左下 order 0 是 HUD 唯一空著的常駐位；0.62 = 讀得到但不搶戰鬥的視線。 */
export const DEFAULT_MAP_CORNER_LABEL: MapCornerLabelSpec = {
  enabled: true,
  opacity: 0.62,
};

/**
 * 出貨預設 —— owner 2026-08-14 的規格表逐格。
 *
 * ⛔ 產生器、驗證器與測試一律從**這裡**推導，不抄字面值。
 */
export const DEFAULT_MAP_SPEC: Omit<ConfigMapSpecDoc, "id" | "schema" | "note"> = {
  grid: { colsMin: 20, colsMax: 26, rowsMin: 16, rowsMax: 20, tileSize: TILE_SIZE_SHIPPED },
  traversal: { secMin: 12, secMax: 20, referenceMoveSpeed: 6 },
  topology: {
    regionsMin: 4,
    regionsMax: 6,
    regionsPreferred: 5,
    deadEndsMax: 1,
    loopsMin: 2,
    chokepointsMin: 2,
    chokepointsMax: 3,
    shortcutsMin: 0,
    shortcutsMax: 2,
  },
  interactions: { countMin: 6, countMax: 10 },
  spawn: DEFAULT_MAP_SPAWN,
  nav: DEFAULT_MAP_NAV,
  severity: {
    deadEnds: "warn",
    loops: "warn",
    chokepoints: "warn",
    shortcuts: "warn",
    interactions: "warn",
    traversal: "warn",
  },
  intro: DEFAULT_MAP_INTRO,
  cornerLabel: DEFAULT_MAP_CORNER_LABEL,
};

/** 讀 doc，缺的欄位回退到出貨預設。⚠️ 唯一的解析入口，⛔ 不要在別處展開 `??`。 */
export function resolveMapSpec(doc?: Partial<ConfigMapSpecDoc> | null): typeof DEFAULT_MAP_SPEC {
  if (!doc) return DEFAULT_MAP_SPEC;
  return {
    grid: { ...DEFAULT_MAP_SPEC.grid, ...(doc.grid ?? {}) },
    traversal: { ...DEFAULT_MAP_SPEC.traversal, ...(doc.traversal ?? {}) },
    topology: { ...DEFAULT_MAP_SPEC.topology, ...(doc.topology ?? {}) },
    interactions: { ...DEFAULT_MAP_SPEC.interactions, ...(doc.interactions ?? {}) },
    spawn: { ...DEFAULT_MAP_SPAWN, ...(doc.spawn ?? {}) },
    // ⚠️ ⛔ 不可以寫成 `{ ...DEFAULT_MAP_NAV, ...doc.nav }`：`minSpawnRoomBodyRadii`
    //    在 schema 上是 optional，spread 之後型別會變成 `number | undefined`
    //    （同 {@link MapIntroSpec} 檔頭記的那個 tsc 陷阱）。
    nav: {
      headroom: doc.nav?.headroom ?? DEFAULT_MAP_NAV.headroom,
      minSpawnRoomBodyRadii:
        doc.nav?.minSpawnRoomBodyRadii ?? DEFAULT_MAP_NAV.minSpawnRoomBodyRadii,
    },
    severity: { ...DEFAULT_MAP_SPEC.severity, ...(doc.severity ?? {}) },
    intro: { ...DEFAULT_MAP_INTRO, ...(doc.intro ?? {}) },
    cornerLabel: { ...DEFAULT_MAP_CORNER_LABEL, ...(doc.cornerLabel ?? {}) },
  };
}
