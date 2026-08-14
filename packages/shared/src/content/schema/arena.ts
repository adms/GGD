/** arena@1 — mirrors `ArenaDef` in sim/world/ArenaDef.ts. */
import { z } from "zod";
import { zId, zVec2 } from "./common";

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
    /** Spawn points, indexed by side (0/1) then slot (0..2). */
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
    /** rotation around Y in quarter-turns (0-3) — avoids radians in data */
    rotQuarter: z.number().int().min(0).max(3).default(0),
    scale: z.number().positive().default(1),
  })
  .strict();

export const zArenaDef = z
  .object({
    id: zId,
    name: z.string().min(1),
    zones: z.array(zZoneDef).min(1),
    /** visual-only props (client renders; sim ignores) */
    decor: z.array(zDecor).default([]),
    /** ground texture/tile hint for the client (visual only) */
    groundStyle: z.enum(["stone", "dirt", "wood", "grass", "sand"]).default("stone"),
  })
  .strict();

export const zArenaDoc = zArenaDef.extend({ schema: z.literal("arena@1") }).strict();

export type ArenaDoc = z.infer<typeof zArenaDoc>;
export type DecorDef = z.infer<typeof zDecor>;
