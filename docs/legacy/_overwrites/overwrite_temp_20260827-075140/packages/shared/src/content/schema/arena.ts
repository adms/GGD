/** arena@1 — mirrors `ArenaDef` in sim/world/ArenaDef.ts. */
import { z } from "zod";
import { TEAM_SIZE } from "../../constants";
import { zId, zVec2 } from "./common";
import { GROUND_STYLE_IDS, DEFAULT_GROUND_STYLE } from "./groundStyle";
import { zArenaScenery } from "./arenaScenery";

/**
 * ⚠️ GH#324 —— 這個 union 多了兩樣東西，兩樣都**向後相容**（既有 6 張場地照樣 parse）：
 *
 *   · `kind:"box"`   —— 有厚度的 AABB。graybox 的「盒子」若拆成 4 條零厚度線段，
 *                       身體生在盒內時會被推向**最近的一條邊** —— 可能還在盒內。
 *   · `gateGroup`    —— 可開關的幾何（route swap／城門／崩塌的橋／可破壞的牆）。
 *                       ⭐ 狀態是 `gateStateAt(doc, absoluteTick)` 的**純函式** ⇒
 *                       客戶端用已複寫的 tick 自己算，**wire 成本 0、沒有 desync 通道**。
 *                       ⚠️ 沒有 `gateGroup` 的障礙物永遠是 active（既有內容的行為）。
 */
const zGateGroup = z
  .string()
  .min(1)
  .optional()
  .describe(
    "這個障礙物屬於哪一個 gate 群組。省略 = 永遠存在。" +
      "有值時由地圖的 gimmick schedule 決定它在某個 tick 是不是擋路。",
  );

export const zObstacle = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("circle"),
      center: zVec2,
      radius: z.number().positive(),
      gateGroup: zGateGroup,
    })
    .strict(),
  z.object({ kind: z.literal("segment"), a: zVec2, b: zVec2, gateGroup: zGateGroup }).strict(),
  z
    .object({
      kind: z.literal("box"),
      /** 中心點。⚠️ 用中心 + 半寬半深，⛔ 不用 min/max —— 與 circle 的 center 同口徑。 */
      center: zVec2,
      halfW: z.number().positive(),
      halfD: z.number().positive(),
      gateGroup: zGateGroup,
    })
    .strict(),
]);

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

export const zZoneDef = z
  .object({
    id: z.string().min(1),
    /** Zone is a circular arena: units are clamped inside boundary. */
    center: zVec2,
    boundaryRadius: z.number().positive(),
    obstacles: z.array(zObstacle),
    /**
     * Spawn points, indexed by side (0/1) then slot (0..2).
     *
     * ⚠️ GH#325 —— 每一側**至少 `TEAM_SIZE` 個**，那條規則由下面的 superRefine 執行
     * （⛔ 不寫成 `.min(3)`：3 是 `TEAM_SIZE` 的值，抄一份就是第〇·四守則說的第二個住處）。
     * 這裡留 `.min(1)` 是為了讓「一個都沒有」與「不夠坐滿一隊」得到**兩種不同**的訊息。
     */
    spawns: z.tuple([z.array(zVec2).min(1), z.array(zVec2).min(1)]),

    // ── GH#324 的三個 optional 擴充 ────────────────────────────────────────
    // ⚠️ 三個**全部 optional**，所以既有 6 張手寫場地一個字都不用改就照樣 parse。
    // ⛔ 但它們對**舊映像**仍然是 hard Zod failure（`.strict()`）——
    //    部署順序必須是「先上帶新 Zod 的映像，再推用到新欄位的內容」，
    //    順序反了就是 2026-08-02 事故的完整重演（docs/_新場地計畫.md 7.1）。

    /**
     * 可玩範圍的形狀。省略 = 圓（`boundaryRadius`，既有行為）。
     * ⭐ owner 2026-08-14「火圈／殭屍波一樣要有」⇒ 矩形場地的火圈**內縮成矩形**、
     * 殭屍從**矩形周邊**生成，⛔ 不是用內接圓（那會讓火圈咬到牆外死角）。
     */
    bounds: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("disc") }).strict(),
        z
          .object({
            kind: z.literal("rect"),
            halfW: z.number().positive(),
            halfD: z.number().positive(),
          })
          .strict(),
      ])
      .optional(),

    /**
     * 地圖區域（琵琶廳／庭院／月台…）。⛔ **不是** `zone` —— 那個字指的是
     * 「一場獨立的 3v3 對戰實例」，兩者是相反的東西（docs/_新場地計畫.md 第二節）。
     * ⚠️ 烘焙成 tile→region 的查表，runtime 只做 O(1) 查詢，⛔ 不上 wire
     * （`ENTITY_FLAG` 的 16 顆 bit 已經用光）。
     */
    regions: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            /** 這個區域佔哪些格（col,row,w,h），座標系與 `map@1` 的 grid 相同。 */
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
              .min(1),
          })
          .strict(),
      )
      .optional(),

    /**
     * 烘焙好的導航表。⭐ 產生器離線跑全點對全點最短路，runtime **只查表**：
     * 零搜尋、零三角函式、零 Map 迭代序問題 —— 這是唯一能同時滿足 purity 閘、
     * 決定性、以及「客戶端預測必須算出一模一樣的結果」三個約束的形狀。
     * N ≤ 64 節點 ⇒ 64×64 = 4KB／圖。
     */
    nav: z
      .object({
        nodes: z.array(zVec2).min(2),
        /** `nextHop[from * n + to]` = 從 from 走向 to 的下一個節點索引，-1 = 到不了。 */
        nextHop: z.array(z.number().int().min(-1)),
      })
      .strict()
      .optional(),

    /**
     * ⭐ GH#324 —— gate 排程（可開關的幾何）。
     *
     * 狀態是 `(schedule, absoluteTick)` 的**純函式** ⇒ 伺服器與客戶端各自算出
     * 同一個答案，**wire 成本 0、沒有 desync 通道**。
     * ⚠️「永不困住玩家」是**驗證器**保證的：每一個組態的圖都必須全連通、
     * 所有出生點與互動點可達，否則產生器拒絕輸出。
     */
    /**
     * ⭐ GH#324 —— 作者擺的**互動／任務點**。
     *
     * ⚠️ 它們不是新玩法，是**既有系統的擺放錨點**：
     *   · `pickup`  → 治療花開在這裡（⛔ 取代原本的隨機取樣）
     *   · `capture` → 守衛塔站在這裡（⛔ 取代原本寫死的 `zone.center`）
     * ⭐ 這樣「6–10 個互動點」才真的有意義 —— 否則作者精心擺的位置，
     *    引擎一個都不看，那是失敗形態②（算出來了但從沒送到玩家面前）。
     */
    interactions: z
      .array(
        z
          .object({
            id: z.string().min(1),
            kind: z.enum(["channel", "pickup", "capture", "toggleGate"]),
            at: zVec2,
            radius: z.number().positive(),
          })
          .strict(),
      )
      .optional(),

    /**
     * ⭐ GH#324 —— **玩家觸發的 gate**：有人站在這個點的半徑內，那組門就被撐開／壓住。
     *
     * ⛔ 為什麼是「站著才有效」而不是「按一下就切換」：切換是**有記憶**的狀態，
     * 那就必須複寫，而 `MatchState` 是 append-only（加錯回不去）、
     * `ENTITY_FLAG` 的 16 顆 bit 也已經用光。
     * ⭐ 「站著才有效」是**當下位置的純函式** —— 伺服器與客戶端各自從已經拿到的
     * 快照算出同一個答案，**wire 成本 0**。而且它本身是更好的機制：
     * 要留人守著，而不是按一下就走。
     */
    gateHolds: z
      .array(
        z
          .object({
            at: zVec2,
            radius: z.number().positive(),
            gateGroup: z.string().min(1),
            /** open = 有人站著就開；close = 有人站著就關。 */
            mode: z.enum(["open", "close"]),
          })
          .strict(),
      )
      .optional(),

    gates: z
      .object({
        kind: z.literal("periodic"),
        periodTicks: z.number().int().positive(),
        telegraphTicks: z.number().int().min(0),
        configurations: z.array(z.array(z.string())).min(2),
      })
      .strict()
      .optional(),
  })
  .strict()
  // Gameplay truth is `obstacles` + `spawns`: they must sit inside the circular
  // boundary or units get clamped onto/through them. (Decor is visual-only and
  // deliberately NOT checked — props may overhang the rim for framing.)
  .superRefine((zone, ctx) => {
    zone.obstacles.forEach((ob, i) => {
      // ⚠️ **矩形場地要用矩形判**（GH#324）。我原本讓 box 走「圓心距 + 外接圓半徑
      // ≤ boundaryRadius」，那對盒來說**更嚴**不是更鬆：一面橫貫整張圖的牆
      // （halfW 24、halfD 1）外接圓是 24，加上圓心距就 41 > 30，於是**每一張
      // 矩形地圖的外牆都會被自己的 schema 拒收**。實測就是這樣紅的。
      // ⇒ `bounds.kind === "rect"` 時改用 AABB 內含；沒有 bounds 才是舊的圓。
      const rect = zone.bounds?.kind === "rect" ? zone.bounds : undefined;
      const inRect = (p: { x: number; z: number }, hw = 0, hd = 0): boolean =>
        rect !== undefined &&
        Math.abs(p.x - zone.center.x) + hw <= rect.halfW + 1e-6 &&
        Math.abs(p.z - zone.center.z) + hd <= rect.halfD + 1e-6;
      const inDisc = (p: { x: number; z: number }, r = 0): boolean =>
        dist(p, zone.center) + r <= zone.boundaryRadius + 1e-6;
      const contains = (p: { x: number; z: number }, hw = 0, hd = 0): boolean =>
        rect !== undefined ? inRect(p, hw, hd) : inDisc(p, Math.hypot(hw, hd));

      const inside =
        ob.kind === "circle"
          ? contains(ob.center, ob.radius, ob.radius)
          : ob.kind === "box"
            ? contains(ob.center, ob.halfW, ob.halfD)
            : contains(ob.a) && contains(ob.b);
      if (!inside) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["obstacles", i],
          message: `obstacle ${i} escapes zone "${zone.id}" boundary (r=${zone.boundaryRadius})`,
        });
      }
    });
    zone.spawns.forEach((side, si) => {
      side.forEach((s, pi) => {
        const r2 = zone.bounds?.kind === "rect" ? zone.bounds : undefined;
        const outside =
          r2 !== undefined
            ? Math.abs(s.x - zone.center.x) > r2.halfW + 1e-6 ||
              Math.abs(s.z - zone.center.z) > r2.halfD + 1e-6
            : dist(s, zone.center) > zone.boundaryRadius + 1e-6;
        if (outside) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["spawns", si, pi],
            message: `spawn ${si}/${pi} is outside zone "${zone.id}" boundary`,
          });
        }
      });
    });
  });

/**
 * Purely-visual decoration: a prop model placed on the ground plane. The sim
 * NEVER reads this — collision stays defined by `obstacles`. Editable data so
 * the arena's look is authored in the editor without touching gameplay.
 */
export const zDecor = z
  .object({
    /** path under content/, e.g. "assets/models/props/pillar.glb" */
    model: z.string().regex(/^assets\//),
    x: z.number(),
    z: z.number(),
    /**
     * ⭐ GH#386 ③ —— **架高**（世界單位，0 = 站在地板上）。
     *
     * 在這一格出現之前 `decor` 只有 x/z，於是任何「設計上要架在別的東西上面」的
     * 構件（屋頂 · 橫梁 · 天花板）在 GGD 裡**沒有任何辦法**擺對：它只會平躺在地板上。
     * 六件下載來的 CC0 布景因此被判成 C 級（`scenery-cc0/PROVENANCE.md` 五之③），
     * 而那六件的共通根因是**同一個引擎缺口**，⛔ 不是六個模型各自的問題。
     *
     * ⚠️ 它 ⛔ **不會**讓道具突破視線上限：架高之後如果整件仍然壓在打鬥區上空，
     * `dressArena()` 照樣把它整個往地板壓到 `SIGHTLINE_HEIGHT_CAP`
     * （連 `y` 一起乘）—— 一個 68° 俯角的攝影機底下，浮在頭上的屋頂會把英雄整個吃掉。
     * ⇒ 架高在**圈外**（列柱、山門、外圈立面）才是完整生效的地方，那也正是這六件的用途。
     *
     * 上界 24 是誤植守衛（場地半徑量級是 20–30u，24u 的道具已經在攝影機眼睛高度之上）；
     * 下界 -4 留給「半埋進地裡」的殘骸。
     *
     * ⚠️ `.optional()` 而不是 `.default(0)`，兩個理由都不是風格：
     * ① 編譯器與散佈規則產出的 `DecorDef` 因此**不必**多帶一格 `y: 0` ——
     *    出貨的 13 張 arena JSON 逐位元組不變；
     * ② 一份**帶著 `y` 的內容**會被還沒更新的映像的 `.strict()` 整份拒絕
     *    （2026-08-02 事故的形狀），所以「沒填」必須真的是「沒有這個 key」。
     */
    y: z.number().min(-4).max(24).optional(),
    /** rotation around Y in quarter-turns (0-3) — avoids radians in data */
    rotQuarter: z.number().int().min(0).max(3).default(0),
    scale: z.number().positive().default(1),
  })
  .strict();

/**
 * 圓盤外的 2D 景深背景（GH#324 第三層，owner 2026-08-14「填補場景外的空缺」）。
 *
 * ⭐ **它住在 `ArenaDoc` 而不是 `ArenaDef`**，而那是一個**結構性**的決定：
 * `arenaDefFromDoc()` 根本不看這一格 ⇒ sim 拿不到它 ⇒
 * ⛔ **背景在型別上就不可能變成碰撞**。比「寫一條測試檢查它沒變成障礙物」強一級。
 *
 * ⚠️ `y` 的上界是 **0**，理由是遮擋的結構性保證 ——
 * 完整推導在 `packages/shared/src/map/backdrop.ts` 的檔頭（一句話版：
 * 「眼睛→英雄頭頂」的視線整條都在 y ≥ 1.7，背景層在 y ≤ 0，兩者不可能相交）。
 */
export const zBackdropLayer = z
  .object({
    fromRadius: z
      .number()
      .min(1)
      .max(12)
      .describe("內緣半徑，**場地邊界半徑的倍數**。1 = 貼著邊界（⛔ 小於 1 會蓋到地板）。"),
    toRadius: z.number().min(1).max(12).describe("外緣半徑（同樣是倍數）。⚠️ 必須大於 fromRadius。"),
    y: z
      .number()
      .min(-120)
      .max(0)
      .describe("這一層的高度。⛔ 上界是 0：往下沉才有深淵感，而且高過 0 就可能擋住視線。"),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "顏色要寫成 #rrggbb")
      .describe("這一層的顏色。⭐ 越外圈越暗＝空氣透視，那是深度的主要來源。"),
    alpha: z.number().min(0).max(1).default(1).describe("透明度。外圈調低會有霧化的遠景感。"),
    profile: z
      .enum([
        "flat",
        "towers",
        "peaks",
        "shards",
        "waves",
        // ⭐ 動漫母題（owner 2026-08-14「2d 圖風格是日本動漫風格」）。
        "cloudSea",
        "sakura",
        "torii",
        "pagoda",
        "lightning",
      ])
      .describe(
        "外緣輪廓。通用波形：flat 平滑環／towers 城垛屋頂／peaks 山稜／shards 碎裂岩塊／waves 起伏丘陵。" +
          "動漫母題：cloudSea 雲海（渾圓的瓣）／sakura 櫻花樹冠／torii 一整排鳥居／pagoda 五重塔屋簷／lightning 稲妻。" +
          "⚠️ 動漫感來自**剪影**不是顏色 —— 一條塗成粉紅色的正弦波不會變成櫻花。",
      ),
    /**
     * ⭐ **逆光邊緣**（リムライト）—— 動漫背景最強的一個訊號。
     *
     * ⚠️ 這一格是**幾何**，⛔ 不是作者調得出來的東西：它沿著這一層外緣的
     * 剪影再畫一條窄亮帶，所以剪影本身被「描邊」出來。少了它，四層平塗色塊
     * 只是四層平塗色塊；有了它，那些鳥居／雲瓣才會**跳出來**。
     */
    rim: z
      .object({
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, "顏色要寫成 #rrggbb")
          .describe("逆光的顏色。⭐ 要比本體亮**很多**（低對比的描邊等於沒描）。"),
        width: z
          .number()
          .min(0.2)
          .max(12)
          .describe("亮帶多寬（世界單位）。⚠️ 太寬會變成第二層色塊，1–3 是描邊的感覺。"),
      })
      .strict()
      .optional(),
    jitter: z
      .number()
      .min(0)
      .max(1)
      .default(0)
      .describe("輪廓起伏幅度。0 = 完全平滑（profile 等於沒作用）；1 = 外緣可一路凹回內緣。"),
    segments: z
      .number()
      .int()
      .min(3)
      .max(64)
      .default(24)
      .describe("圓周切幾段＝輪廓有幾個齒。⚠️ 每段 2 個三角形，64 段也才 128 面。"),
  })
  .strict()
  .superRefine((l, ctx) => {
    if (l.toRadius <= l.fromRadius) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toRadius"],
        message: `toRadius (${l.toRadius}) 必須大於 fromRadius (${l.fromRadius})，否則這一層是空的`,
      });
    }
  });

export const zBackdrop = z
  .object({
    /** ⚠️ 由外而內或由內而外都可以，但**畫的順序就是陣列順序** —— 後面的蓋前面的。 */
    layers: z.array(zBackdropLayer).max(8).default([]),
  })
  .strict();

export const zArenaDef = z
  .object({
    id: zId,
    name: z.string().min(1),
    zones: z.array(zZoneDef).min(1),
    /** visual-only props (client renders; sim ignores) */
    decor: z.array(zDecor).default([]),
    /**
     * ground texture/tile hint for the client (visual only)
     *
     * ⚠️ 合法值**不寫在這裡** —— 它們住在 `./groundStyle`，因為同一份名單同時要被
     * `map@1`（作者宣告）、`texgen/styles.ts`（PNG 從這產）與 `groundMaterials.ts`
     * （執行期載得到哪些）讀。四份各抄一份的漂移是**靜默的**：schema 收下一個沒有
     * painter 的值 ⇒ 地板退回純色；painter 產了 schema 不收的值 ⇒ PNG 沒有人載。
     */
    groundStyle: z.enum(GROUND_STYLE_IDS).default(DEFAULT_GROUND_STYLE),
  })
  .strict();

export const zArenaDoc = zArenaDef
  .extend({
    schema: z.literal("arena@1"),
    /**
     * ⭐ 刻意**只在 Doc 上**，⛔ 不在 Def 上 —— 見 `zBackdrop` 的檔頭。
     * 缺席 = 沒有背景（圓盤外維持 `Renderer` 的 clearColor 深藍黑）。
     */
    backdrop: zBackdrop.optional(),
    /**
     * ⭐ GH#362 —— 這張場地的**視覺身分**：配色 · 打光（會動的）· 裝飾散佈。
     * 同樣**只在 Doc 上**、同樣的理由（`arenaDefFromDoc()` 不看它 ⇒ 顏色與燈
     * 在型別上不可能變成碰撞）。缺席 = 出貨前那一組寫死的燈與顏色，
     * 逐像素不變（見 `arenaScenery.ts` 的 `DEFAULT_SCENERY_*`）。
     */
    scenery: zArenaScenery.optional(),
  })
  .strict();

export type ArenaDoc = z.infer<typeof zArenaDoc>;
export type DecorDef = z.infer<typeof zDecor>;
export type BackdropDef = z.infer<typeof zBackdrop>;
export type BackdropLayerDef = z.infer<typeof zBackdropLayer>;
