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
  })
  .strict()
  // Gameplay truth is `obstacles` + `spawns`: they must sit inside the circular
  // boundary or units get clamped onto/through them. (Decor is visual-only and
  // deliberately NOT checked — props may overhang the rim for framing.)
  .superRefine((zone, ctx) => {
    zone.obstacles.forEach((ob, i) => {
      // ⚠️ 這個檢查用的是 `boundaryRadius`（圓）。矩形場地（`bounds.kind === "rect"`）
      // 的外接圓一定 ≥ 矩形，所以用圓檢查對矩形是**寬鬆但安全**的 —— 不會誤擋。
      // 精確的矩形內含檢查由產生器的 validator 做（它才有 tile grid 可以判）。
      const inside =
        ob.kind === "circle"
          ? dist(ob.center, zone.center) + ob.radius <= zone.boundaryRadius + 1e-6
          : ob.kind === "box"
            ? dist(ob.center, zone.center) + Math.hypot(ob.halfW, ob.halfD) <=
              zone.boundaryRadius + 1e-6
            : dist(ob.a, zone.center) <= zone.boundaryRadius + 1e-6 &&
              dist(ob.b, zone.center) <= zone.boundaryRadius + 1e-6;
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
        if (dist(s, zone.center) > zone.boundaryRadius + 1e-6) {
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
