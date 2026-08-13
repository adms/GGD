/**
 * Arena definition — the planar collision content of a map. Two zones for
 * PairedDuels (each duel is confined to its own zone). Pure data; authored via
 * the map editor and validated by the content pipeline.
 */
import type { Vec2 } from "../math/vec2";

/**
 * ⭐ GH#324 —— 可開關的幾何。省略 = 這個障礙物永遠擋路（既有內容的行為）。
 *
 * 有值時，它是不是擋路由 `gateStateAt(doc, absoluteTick)` 這個**絕對 tick 的純函式**
 * 決定 ⇒ 伺服器與客戶端各自算出同一個答案，**wire 成本 0、沒有 desync 通道**。
 */
export type GateGroup = string | undefined;

/** A circular blocking obstacle (pillar). */
export interface ObstacleCircle {
  kind: "circle";
  center: Vec2;
  radius: number;
  gateGroup?: GateGroup;
}

/** A blocking wall segment (zero thickness). */
export interface ObstacleSegment {
  kind: "segment";
  a: Vec2;
  b: Vec2;
  gateGroup?: GateGroup;
}

/**
 * ⭐ GH#324 —— 有厚度的 AABB（graybox 的「盒子」）。
 *
 * ⛔ 為什麼不用 4 條線段拼：身體若生在盒**內**，線段版會把它推向**最近的一條邊**，
 * 而那個位置**可能還在盒內**。有厚度的盒才知道要往外推。
 */
export interface ObstacleBox {
  kind: "box";
  center: Vec2;
  halfW: number;
  halfD: number;
  gateGroup?: GateGroup;
}

export type Obstacle = ObstacleCircle | ObstacleSegment | ObstacleBox;

/**
 * 可玩範圍的形狀。省略 = 圓（`boundaryRadius`），這是既有 6 張場地的行為。
 *
 * ⭐ owner 2026-08-14「火圈／殭屍波一樣要有」⇒ 矩形場地的火圈**內縮成矩形**、
 * 殭屍從**矩形周邊**生成。⛔ 不是用內接圓 —— 那會讓火圈咬到牆外的死角。
 */
export type ZoneBounds = { kind: "disc" } | { kind: "rect"; halfW: number; halfD: number };

/**
 * 地圖區域（琵琶廳／庭院／月台…）。
 *
 * ⛔ **不要**把它跟 `ZoneDef` 搞混：`zone` 在這個 codebase 裡是「一場獨立的 3v3
 * 對戰實例」，而且是**隔離**的（zone 0 的單位對 zone 1 看不到打不到治不到）。
 * 兩者是相反的東西，搞混會同時造成五件事而一條測試都不會紅
 * （完整清單見 `docs/_新場地計畫.md` 第二節）。
 */
export interface MapRegion {
  id: string;
  label: string;
  rects: { col: number; row: number; w: number; h: number }[];
}

/**
 * 烘焙好的導航表。⭐ 產生器離線跑全點對全點最短路；runtime **只查表**，
 * 零搜尋、零三角函式、零 Map 迭代序問題 —— 這是唯一同時滿足 purity 閘、決定性、
 * 與「客戶端預測必須算出一模一樣的結果」三個約束的形狀。
 */
export interface NavTable {
  nodes: Vec2[];
  /** `nextHop[from * n + to]` = 從 from 走向 to 的下一個節點索引，-1 = 到不了。 */
  nextHop: number[];
}

export interface ZoneDef {
  id: string;
  /** Zone is a circular arena: units are clamped inside boundary. */
  center: Vec2;
  boundaryRadius: number;
  obstacles: Obstacle[];
  /** Spawn points, indexed by side (0/1) then slot (0..2). */
  spawns: [Vec2[], Vec2[]];
  /** GH#324 —— 三個 optional 擴充，既有場地一個字都不用改。 */
  bounds?: ZoneBounds;
  regions?: MapRegion[];
  nav?: NavTable;
}

export interface ArenaDef {
  id: string;
  name: string;
  zones: ZoneDef[];
}

/**
 * Derive the sim's `ArenaDef` (collision truth) from a loaded `arena@1` doc.
 * An `ArenaDoc` is a superset of `ArenaDef` — the extra `decor`/`groundStyle`/
 * `schema` fields are visual-only and dropped here, so the server collides
 * against exactly the zones/obstacles/spawns the doc declares. Kept in shared
 * so BOTH the game-server (authoritative) and the client (rendering) build the
 * same geometry from the same doc.
 */
export function arenaDefFromDoc(doc: {
  id: string;
  name: string;
  zones: ZoneDef[];
}): ArenaDef {
  return {
    id: doc.id,
    name: doc.name,
    zones: doc.zones.map((z) => ({
      id: z.id,
      center: { x: z.center.x, z: z.center.z },
      boundaryRadius: z.boundaryRadius,
      // ⚠️ 逐欄位重建（⛔ 不是 spread）—— 這是刻意的：doc 是 arena@1 的**超集**，
      // spread 會把視覺欄位帶進碰撞真相。GH#324 的三個新欄位照同一條規則明列。
      obstacles: z.obstacles.map((o) =>
        o.kind === "circle"
          ? {
              kind: "circle" as const,
              center: { x: o.center.x, z: o.center.z },
              radius: o.radius,
              ...(o.gateGroup === undefined ? {} : { gateGroup: o.gateGroup }),
            }
          : o.kind === "box"
            ? {
                kind: "box" as const,
                center: { x: o.center.x, z: o.center.z },
                halfW: o.halfW,
                halfD: o.halfD,
                ...(o.gateGroup === undefined ? {} : { gateGroup: o.gateGroup }),
              }
            : {
                kind: "segment" as const,
                a: { x: o.a.x, z: o.a.z },
                b: { x: o.b.x, z: o.b.z },
                ...(o.gateGroup === undefined ? {} : { gateGroup: o.gateGroup }),
              },
      ),
      spawns: [z.spawns[0].map((s) => ({ x: s.x, z: s.z })), z.spawns[1].map((s) => ({ x: s.x, z: s.z }))] as [
        Vec2[],
        Vec2[],
      ],
      // GH#324 —— 三個 optional 擴充。省略時完全是既有行為（圓形邊界、無區域、無導航）。
      ...(z.bounds === undefined ? {} : { bounds: z.bounds }),
      ...(z.regions === undefined ? {} : { regions: z.regions }),
      ...(z.nav === undefined ? {} : { nav: z.nav }),
    })),
  };
}

/**
 * 32-bit integer avalanche hash (splitmix-style finalizer). Pure, platform-stable
 * (integer ops + Math.imul only — no float, no trig), and NOT sourced from
 * `world.rng`, so hashing (seed, round) to pick an arena never advances the sim's
 * random stream. That independence is what keeps a same-seed replay byte-identical
 * (task #145).
 */
function hash32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h >>> 0;
}

/**
 * A deterministic permutation of `[0, size)` derived purely from `matchSeed`
 * (seeded Fisher–Yates). The order is fixed for the whole match, so the arena
 * rotation is reproducible from the seed alone; walking it cyclically (see
 * {@link pickRoundArena}) makes consecutive rounds ALWAYS differ and the first
 * `size` rounds cover every arena — maximal variety, which is the point of #145.
 */
export function arenaRotationOrder(size: number, matchSeed: number): number[] {
  const order = Array.from({ length: size }, (_, i) => i);
  let s = hash32(matchSeed);
  for (let i = size - 1; i > 0; i--) {
    // advance the local hash stream (independent of world.rng) and draw 0..i
    s = hash32(s + 0x6d2b79f5);
    const r = s % (i + 1);
    const tmp = order[i]!;
    order[i] = order[r]!;
    order[r] = tmp;
  }
  return order;
}

/**
 * Pick the arena for a given combat `round`, DETERMINISTICALLY, from a pool —
 * server-authoritative and reproducible from `(matchSeed, round)` alone (task
 * #145: 每回合隨機換地圖). Uses a seed-derived permutation walked cyclically, so:
 *   • the choice is a pure function of the seed and round (stable WITHIN a round,
 *     identical under same-seed replay),
 *   • consecutive rounds never land on the same arena (pool size ≥ 2),
 *   • it consumes no `world.rng`, so it perturbs no other randomness.
 * Returns null only for an empty pool (caller keeps its current arena).
 */
export function pickRoundArena<T extends { id: string }>(
  pool: readonly T[],
  matchSeed: number,
  round: number,
): T | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0]!;
  const order = arenaRotationOrder(pool.length, matchSeed);
  // round is 1-based in a live match; the modulo is non-negative for any round ≥ 0.
  const idx = order[((round % order.length) + order.length) % order.length]!;
  return pool[idx]!;
}

// ===========================================================================
// THE FINAL-ROUND ROYALE ARENA (owner directive 2026-07-27)
// ===========================================================================
//
// 「第10回合 … 所有隊伍在同一個場地大混戰」 + 「用現有的 zone，只把半徑放大…
//  出生點改成環狀均分」. Rounds 1-9 keep the two-zone PairedDuels geometry; the
// finale needs ONE zone that holds twelve champions and four spawn clusters that
// keep teammates together while pushing the four teams apart.
//
// WHY THIS IS A CONSTANT AND *ALSO* A CONTENT DOC (`content/arenas/arena.royale.json`).
// The client does NOT receive arena geometry over the wire — `GameApp.applyArena`
// fetches the arena DOC by the `mapId` the snapshot broadcasts and builds the
// ground/minimap/fire-ring visuals from that. So a server-side "just scale the
// radius at runtime" would have moved the collision boundary to 42 while every
// player still saw (and read the fire ring against) a 24-radius disc — the sim
// and the picture would disagree by 18 units. The finale therefore ships as a
// REAL arena doc with its own id, exactly like the five rotation maps, and the
// server merely SELECTS it for the final round. This constant is the built-in
// fallback for a boot with no content tree (unit tests, skeleton boot); the
// shipped doc is pinned byte-for-byte against it by `royaleArena.test.ts`, so
// the two can never drift into "the test passes on geometry nobody plays".
//
// NO TRIGONOMETRY. `sim/purity.test.ts` bans Math.cos/sin under src/sim, and the
// ban is right: an "equidistant ring" built from trig is a float that can differ
// by an ulp across engines. Four groups on the ±x/±z AXES are exactly equidistant
// with integer coordinates and no transcendental in sight — adjacent groups sit
// `ROYALE_SPAWN_RING * √2` ≈ 42.4 units apart, which is further than the whole
// diameter of a duel zone.

/** Boundary radius of the finale zone. 24 (a duel zone) holds 6; this holds 12. */
export const ROYALE_ZONE_RADIUS = 42;
/** Distance from the finale zone's centre to each team's spawn cluster. */
export const ROYALE_SPAWN_RING = 30;
/** Spacing between the three teammates inside one spawn cluster. */
export const ROYALE_SPAWN_SPACING = 4;
/** Teams the finale zone is laid out for (four clusters of {@link TEAM_SIZE}). */
export const ROYALE_TEAM_SLOTS = 4;

/**
 * The twelve finale spawn points, GROUPED: index `g * 3 + s` is slot `s` of
 * team-group `g`. Groups run E, N, W, S — four axis-aligned clusters, so no team
 * starts nearer the centre (or nearer any rival) than another.
 *
 * Written out rather than generated so the numbers in the content doc, the
 * numbers here, and the numbers a reader checks are literally the same list.
 */
export const ROYALE_SPAWNS: readonly Vec2[] = [
  // group 0 — EAST
  { x: 30, z: -4 },
  { x: 30, z: 0 },
  { x: 30, z: 4 },
  // group 1 — NORTH
  { x: -4, z: 30 },
  { x: 0, z: 30 },
  { x: 4, z: 30 },
  // group 2 — WEST
  { x: -30, z: -4 },
  { x: -30, z: 0 },
  { x: -30, z: 4 },
  // group 3 — SOUTH
  { x: -4, z: -30 },
  { x: 0, z: -30 },
  { x: 4, z: -30 },
];

/**
 * Built-in geometry for the final-round royale: ONE circular zone, four pillars
 * on the DIAGONALS (so they are cover on the approach lanes and never block a
 * spawn cluster or the zone centre where the neutral guardian stands — the same
 * "nothing on the centre" rule task #218 imposed on the duel zones).
 *
 * `spawns` is the schema's 2-tuple, so the twelve points are packed six-and-six:
 * side 0 carries groups 0+1, side 1 carries groups 2+3. The controller reads them
 * back as one flat list of twelve (see `royaleSpawnAt`), which is why the packing
 * is an encoding detail and not a "two sides" claim.
 */
export const ROYALE_ARENA: ArenaDef = {
  id: "arena.royale",
  name: "終局大混戰",
  zones: [
    {
      id: "zone-0",
      center: { x: 0, z: 0 },
      boundaryRadius: ROYALE_ZONE_RADIUS,
      obstacles: [
        { kind: "circle", center: { x: 14, z: 14 }, radius: 2.2 },
        { kind: "circle", center: { x: 14, z: -14 }, radius: 2.2 },
        { kind: "circle", center: { x: -14, z: 14 }, radius: 2.2 },
        { kind: "circle", center: { x: -14, z: -14 }, radius: 2.2 },
      ],
      spawns: [ROYALE_SPAWNS.slice(0, 6).map((s) => ({ ...s })), ROYALE_SPAWNS.slice(6).map((s) => ({ ...s }))] as [
        Vec2[],
        Vec2[],
      ],
    },
  ],
};

/**
 * Spawn point for team-group `group` (0..3), slot `slot` (0..2) of a royale zone,
 * read out of the zone's own packed `spawns` — NOT out of {@link ROYALE_SPAWNS}.
 * Reading the ZONE means an operator who re-authors `arena.royale.json` moves the
 * champions, instead of moving the picture while the sim keeps the constant.
 *
 * Falls back by wrapping when a zone offers fewer than 12 points (a hand-made
 * test arena), so a short spawn list degrades to overlapping starts rather than
 * an undefined position — `royaleArena.test.ts` pins the SHIPPED zone at ≥12.
 */
export function royaleSpawnAt(zone: ZoneDef, group: number, slot: number): Vec2 {
  const flat = [...zone.spawns[0], ...zone.spawns[1]];
  const i = group * 3 + slot;
  return flat[i % flat.length]!;
}

/** Built-in skeleton arena: two circular zones with a pillar each. */
export const SKELETON_ARENA: ArenaDef = {
  id: "arena.skeleton",
  name: "Skeleton Arena",
  zones: [0, 1].map((i) => {
    const cx = i === 0 ? -40 : 40;
    return {
      id: `zone-${i}`,
      center: { x: cx, z: 0 },
      boundaryRadius: 24,
      // The CENTRE obstacle was deleted (owner directive, task #218): a pillar
      // standing on the zone centre is exactly where the fight happens and
      // where the neutral guardian (#89/#105) already stands, so it blocked
      // both the camera and the walk. The two flanking obstacles stay — they
      // are cover a ranged champion can actually kite around.
      obstacles: [
        { kind: "circle" as const, center: { x: cx - 9, z: 8 }, radius: 1.8 },
        { kind: "circle" as const, center: { x: cx + 9, z: -8 }, radius: 1.8 },
      ],
      spawns: [
        [
          { x: cx - 16, z: -4 },
          { x: cx - 16, z: 0 },
          { x: cx - 16, z: 4 },
        ],
        [
          { x: cx + 16, z: -4 },
          { x: cx + 16, z: 0 },
          { x: cx + 16, z: 4 },
        ],
      ] as [Vec2[], Vec2[]],
    };
  }),
};
