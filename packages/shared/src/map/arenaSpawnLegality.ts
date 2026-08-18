/**
 * 出生點合法性驗證器（GH#364）。
 *
 * owner 2026-08-18 附圖（芙莉蓮迷宮）：
 * > 自己的英雄站在一條窄走道上，**旁邊就是圖外**，而火圈在收 —— 實質上只能等死。
 *
 * ## ⛔ 為什麼 Zod 那一條不夠
 *
 * `arena@1` 的 `superRefine` 已經在擋「出生點在 boundary 外」了 —— 但它只問
 * **一個點**在不在框裡，而一個座位會不會從第一秒就注定死，取決於**三件別的事**：
 *
 * | 問題 | Zod 問了嗎 | 這裡問 |
 * |---|---|---|
 * | 那個**點**在框裡嗎 | ✅ | — |
 * | 整個**身體**（半徑 0.6）在框裡嗎 | ❌ 只看點 | `bodyOutsideBounds` |
 * | 它是不是**站在牆裡** | ❌ 完全沒看 obstacles | `spawnInsideObstacle` |
 * | 火圈**點燃那一刻**它安全嗎 | ❌ | `burningAtIgnition` |
 * | 它走得到火圈**停下來的口袋**嗎 | ❌ | `pocketUnreachable` |
 *
 * ⭐ 最後兩條就是 owner 那句「注定被燒死」的機械版本：火圈從分區邊界收到
 * `stage1Radius`（「停止縮圈」的口袋），一個**走不到口袋**的座位，不管玩家怎麼
 * 操作都會被燒死；一個**點燃就在圈外**的座位，連 20 秒緩衝都沒有。
 *
 * ## ⛔ 不抄數字
 *
 * 身體半徑、口袋半徑、火圈幾何**全部由呼叫端從出貨設定推導**（`spawnChampion.ts`
 * 的 0.6 / `config.match.json` 的 `stage1Radius`），而「安全嗎」直接呼叫
 * **sim 真正用的那一支** {@link fireRingSafeAt} —— ⛔ 不在這裡重寫一份幾何，
 * 否則守衛與被守的東西會各自漂移（第二守則失敗形態⑤）。
 *
 * ## ⚠️ gate（可開關的牆）怎麼算
 *
 * · **站位**：連 gated 的牆也要避開 —— 門關起來的時候不可以把人壓在裡面。
 * · **可達性**：只算**永遠存在**的牆。「每一個 gate 組態都不切斷地圖」是
 *   `validateMap` 的職責（它逐組態跑連通性），在這裡再做一次是同一件事做兩遍。
 */
import type { ArenaDoc } from "../content/schema/arena";
import { fireRingSafeAt } from "../sim/fireRing";
import type { Obstacle, ZoneDef } from "../sim/world/ArenaDef";
import type { Vec2 } from "../sim/math/vec2";

/** 取樣解析度（世界單位）。⚠️ 這是**驗證器**的精度，⛔ 不是遊戲數值。 */
const SAMPLE_STEP = 0.25;

export interface SpawnIssue {
  arenaId: string;
  zoneId: string;
  side: number;
  slot: number;
  at: Vec2;
  check: "bodyOutsideBounds" | "spawnInsideObstacle" | "burningAtIgnition" | "pocketUnreachable";
  message: string;
}

export interface SpawnLegalityOpts {
  /** 角色碰撞半徑（`spawnChampion.ts`）。 */
  bodyRadius: number;
  /** 火圈「停止縮圈」停下來的半徑（`config.match.json` 的 `stage1Radius`）。 */
  pocketRadius: number;
}

/** 這個點被 `ob` 擋住嗎（身體半徑 `pad` 的間隙）？ */
function blockedBy(p: Vec2, ob: Obstacle, pad: number): boolean {
  if (ob.kind === "box") {
    return (
      Math.abs(p.x - ob.center.x) <= ob.halfW + pad && Math.abs(p.z - ob.center.z) <= ob.halfD + pad
    );
  }
  if (ob.kind === "circle") {
    const dx = p.x - ob.center.x;
    const dz = p.z - ob.center.z;
    const r = ob.radius + pad;
    return dx * dx + dz * dz <= r * r;
  }
  // segment —— 點到線段的距離
  const vx = ob.b.x - ob.a.x;
  const vz = ob.b.z - ob.a.z;
  const len2 = vx * vx + vz * vz;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - ob.a.x) * vx + (p.z - ob.a.z) * vz) / len2));
  const dx = p.x - (ob.a.x + vx * t);
  const dz = p.z - (ob.a.z + vz * t);
  return dx * dx + dz * dz <= pad * pad;
}

/** 整個身體都在可玩範圍內嗎？（矩形逐軸、圓形徑向 —— 與 `clampToBoundary` 同口徑） */
function bodyInsideBounds(zone: ZoneDef, p: Vec2, body: number): boolean {
  const b = zone.bounds;
  const dx = p.x - zone.center.x;
  const dz = p.z - zone.center.z;
  if (b !== undefined && b.kind === "rect") {
    return Math.abs(dx) <= b.halfW - body + 1e-6 && Math.abs(dz) <= b.halfD - body + 1e-6;
  }
  const maxR = zone.boundaryRadius - body;
  return dx * dx + dz * dz <= maxR * maxR + 1e-6;
}

/**
 * 一個分區的出生點問題清單。
 *
 * ⭐ 可達性用**泛洪**（BFS）從口袋往外鋪，而不是從每個出生點各跑一次搜尋：
 * 一次泛洪回答全部 6 個座位，而且結果與座位順序無關（決定性）。
 */
export function checkZoneSpawns(
  arenaId: string,
  zone: ZoneDef & { id: string },
  opts: SpawnLegalityOpts,
): SpawnIssue[] {
  const { bodyRadius: body, pocketRadius } = opts;
  const issues: SpawnIssue[] = [];
  const b = zone.bounds;
  const halfW = b !== undefined && b.kind === "rect" ? b.halfW : zone.boundaryRadius;
  const halfD = b !== undefined && b.kind === "rect" ? b.halfD : zone.boundaryRadius;

  // ── 可走格網（永久牆）+ 從口袋泛洪 ───────────────────────────────────────
  const nx = Math.round((2 * halfW) / SAMPLE_STEP) + 1;
  const nz = Math.round((2 * halfD) / SAMPLE_STEP) + 1;
  const at = (i: number, j: number): Vec2 => ({
    x: zone.center.x - halfW + i * SAMPLE_STEP,
    z: zone.center.z - halfD + j * SAMPLE_STEP,
  });
  const permanent = zone.obstacles.filter((o) => o.gateGroup === undefined);
  const free = new Uint8Array(nx * nz);
  const reached = new Uint8Array(nx * nz);
  const queue: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const p = at(i, j);
      if (!bodyInsideBounds(zone, p, body)) continue;
      if (permanent.some((o) => blockedBy(p, o, body))) continue;
      free[j * nx + i] = 1;
      // ⭐ 口袋 = 火圈停在 `stage1Radius` 時**還安全**的地方，用 sim 真正那一支判。
      if (fireRingSafeAt(zone, p, body, pocketRadius)) {
        reached[j * nx + i] = 1;
        queue.push(j * nx + i);
      }
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h]!;
    const i = c % nx;
    const j = (c - i) / nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const a = i + di;
      const bb = j + dj;
      if (a < 0 || bb < 0 || a >= nx || bb >= nz) continue;
      const n = bb * nx + a;
      if (free[n] !== 1 || reached[n] === 1) continue;
      reached[n] = 1;
      queue.push(n);
    }
  }

  zone.spawns.forEach((side, si) => {
    side.forEach((s, pi) => {
      const add = (check: SpawnIssue["check"], message: string): void => {
        issues.push({ arenaId, zoneId: zone.id, side: si, slot: pi, at: { x: s.x, z: s.z }, check, message });
      };
      if (!bodyInsideBounds(zone, s, body)) {
        add("bodyOutsideBounds", `整個身體（半徑 ${body}）不在可玩範圍內 —— 出生就被夾回牆邊`);
      }
      // 站位要連 gated 的牆一起避開：門關起來不可以把人壓在裡面。
      const hit = zone.obstacles.findIndex((o) => blockedBy(s, o, body));
      if (hit >= 0) add("spawnInsideObstacle", `站在障礙物 #${hit}（${zone.obstacles[hit]!.kind}）裡面`);
      // 火圈點燃那一刻就在圈外 ⇒ 這個座位連緩衝都沒有。
      if (!fireRingSafeAt(zone, s, body, zone.boundaryRadius)) {
        add("burningAtIgnition", `火圈點燃（半徑 ${zone.boundaryRadius}）的第一格就在圈外 —— 從第一秒就在燒`);
      }
      const i = Math.round((s.x - (zone.center.x - halfW)) / SAMPLE_STEP);
      const j = Math.round((s.z - (zone.center.z - halfD)) / SAMPLE_STEP);
      const inGrid = i >= 0 && j >= 0 && i < nx && j < nz;
      if (!inGrid || reached[j * nx + i] !== 1) {
        add(
          "pocketUnreachable",
          `走不到火圈停下來的口袋（半徑 ${pocketRadius}）—— 這個座位不管怎麼操作都會被燒死`,
        );
      }
    });
  });
  return issues;
}

/** 一整張場地。`zones[]` 逐個跑 {@link checkZoneSpawns}。 */
export function checkArenaSpawns(arena: ArenaDoc, opts: SpawnLegalityOpts): SpawnIssue[] {
  return arena.zones.flatMap((z) => checkZoneSpawns(arena.id, z as ZoneDef & { id: string }, opts));
}

/** 人看得懂的一行。 */
export function formatSpawnIssue(i: SpawnIssue): string {
  return `${i.arenaId}/${i.zoneId} spawn ${i.side}/${i.slot} @(${i.at.x},${i.at.z}) [${i.check}] ${i.message}`;
}
