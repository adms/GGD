/**
 * anchorBounds —— **出口的閘**：一個 HUD 錨點如果落在競技場外面，就不要畫它。
 *
 * owner 2026-08-19（看完根因之後）：
 *
 * > 「重點是**那兩個點在牆外 也不應該是顯示在那邊阿**」
 *
 * ⭐ 這一條比根因那一條**更前面**。2026-08-19 那次的來源是
 * `EntityViewRegistry.lastPos` 被剔除跳過（血條與施法特效因此被釘在**上一張場地**
 * 的座標上，x=-24，落在大聖杯洞窟地板外的虛空）—— 那條路已經修好了。但是：
 *
 * ⚠️ **治來源只擋得住已經想到的那一條路。** 「一個 HUD 錨點被畫在場外」這件事
 * 本身在任何情況下都是錯的，⛔ 不管那個座標是怎麼算出來的。⇒ 再加一道只看
 * **結果**的閘，下一條產生假座標的路一出現就會被擋下來，而且**會被數到**。
 *
 * ── 三條刻意的規則 ─────────────────────────────────────────────────────────
 *
 * ① **邊界從當前 zone 的 `bounds` 推導**，⛔ 不寫死 ±24 —— 出貨 13 張場地有
 *    矩形（halfW/halfD）也有圓形（boundaryRadius），而 owner 隨時會加新的。
 * ② ⛔ **不 clamp 回界內。** 把一個錯的位置夾成一個「看起來合理」的錯位置，
 *    比不畫更難查 —— 那正是 CLAUDE.md「靜默才是缺陷」講的東西。**不畫。**
 * ③ **fail-loud**：越界要留下痕跡（計數器 + 一次性 warn），⛔ 不是安靜 return。
 *    一行沒有人讀的 log 不算，所以計數器是**讀得到的**（`offArenaAnchorCount()`）。
 *
 * ⚠️ 餘裕（margin）不是裝飾：角色**可以站在邊界上**，而 sim 只把身體**中心**夾到
 * `boundary - radius`，模型與血條又比身體寬。餘裕從 `CHAMPION_BODY_RADIUS`
 * 推導，⛔ 不是一個手挑的數字。
 *
 * ⚠️ **不知道場地就一律放行**（`zones` 是 null / 空）—— 首幀、骨架開機、還沒
 * `applyArena` 的那幾幀都屬於這一類。失效方向與 `net/zoneVisibility.ts` 一致：
 * 最壞情況是白畫，不是東西不見。
 *
 * ── ⛔ 這道閘**沒有**涵蓋 2026-08-19 那次的全部，說清楚 ────────────────────
 *
 * 那次的過期座標有兩個：中場 side 0 的 **x = -56**（這道閘擋得住）與 side 1 的
 * **x = -24**（⛔ **擋不住**）。x=-24 剛好落在大聖杯洞窟地板的**邊緣上**
 * （`halfW: 24`），所以任何一個「還容得下貼牆站的人」的餘裕都會放它過 ——
 * sim 只把身體中心夾到 `halfW - bodyRadius = 23.4`，兩者只差 0.6。
 * ⇒ **把餘裕調小到能擋住它，就會開始誤殺真的貼著牆打的人。**
 *
 * 所以分工是明確的、⛔ 不是重疊的：
 *   · **來源**那一條（`EntityViewRegistry` 的 `lastPos` 提到剔除之前）修的是
 *     2026-08-19 這一次，含 x=-24 —— 守衛 `occludedBodyPosition.test.ts`。
 *   · **這一道**是攔網：抓**下一條**還沒有人想到的路，而假座標通常離譜得多
 *     （另一張地圖的中心、原點、未初始化的 0）。⛔ 它不是前者的替代品。
 *
 * 純 TS，⛔ 沒有 Babylon、沒有 frameBus —— 可以直接餵數字測。
 */
import { CHAMPION_BODY_RADIUS } from "@ggd/shared/content/displacementTiers";

/** `frameBus.arenaZones` 的最小形狀 —— 這一支只需要幾何。 */
export interface AnchorZone {
  x: number;
  z: number;
  /** 圓形場地的邊界半徑；矩形場地的這個值是**外接圓**，所以 `rect` 優先。 */
  r: number;
  /** ⭐ GH#324 矩形可玩範圍。有值時以它為準。 */
  rect?: { halfW: number; halfD: number };
}

/**
 * 錨點可以超出可玩範圍多少而仍然算「在場上」，世界單位。
 *
 * 身體半徑的 2 倍：一具貼著牆站的身體，中心在 `boundary - radius`，模型與它的
 * 血條再往外一點點都還是正常畫面。2026-08-19 那個錯誤座標離邊界 **5 單位以上**
 * （x=-24 vs 我方在 x=-19 的那張圖，地板只到 ±24），所以這個餘裕擋得住它，
 * 也不會誤傷任何一個真的站在牆邊的人。
 */
export const ANCHOR_MARGIN = CHAMPION_BODY_RADIUS * 2;

/** 越界而**沒有被畫出來**的錨點總數（fail-loud 的可讀那一半）。 */
let rejects = 0;
let warned = false;

/** 目前為止被擋下來的越界錨點數。⛔ 不會自己歸零 —— 它是一個累計。 */
export function offArenaAnchorCount(): number {
  return rejects;
}

/** 測試用歸零。⛔ 出貨路徑不呼叫它。 */
export function resetOffArenaAnchorCount(): void {
  rejects = 0;
  warned = false;
}

/**
 * 這個世界座標在**當前場地畫得出來的範圍**裡嗎？
 *
 * `zones` 為 null/空 = 還不知道場地 ⇒ 一律 true（見檔頭「失效方向」）。
 * 有任何一個 zone 收得下就算在場上（一場比賽同時有兩個對戰分區）。
 */
export function anchorInsideArena(
  zones: readonly AnchorZone[] | null | undefined,
  x: number,
  z: number,
  margin: number = ANCHOR_MARGIN,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (!zones || zones.length === 0) return true;
  for (const zone of zones) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    if (zone.rect) {
      if (Math.abs(dx) <= zone.rect.halfW + margin && Math.abs(dz) <= zone.rect.halfD + margin) {
        return true;
      }
      continue;
    }
    const rr = zone.r + margin;
    if (dx * dx + dz * dz <= rr * rr) return true;
  }
  return false;
}

/**
 * 出貨路徑用的那一支：在場上 → true；不在 → **記一筆**並回 false。
 *
 * ⛔ 呼叫端**不可以**把座標夾回界內，只能不畫（規則②）。`what` 只進第一次的
 * warn，用來指出是哪一條路產生了假座標 —— 沒有它，這個計數器只會說「有東西
 * 壞了」而不會說「是誰」。
 */
export function anchorDrawable(
  zones: readonly AnchorZone[] | null | undefined,
  x: number,
  z: number,
  what: string,
): boolean {
  if (anchorInsideArena(zones, x, z)) return true;
  rejects++;
  if (!warned) {
    warned = true;
    // 一次性：一幀 12 個錨點 × 60 fps 的 console 洪水會把訊號自己蓋掉。
    // 後續的次數靠 `offArenaAnchorCount()` 讀。
    console.warn(
      `[client] HUD anchor outside the arena, not drawn: ${what} at (${x.toFixed(2)}, ${z.toFixed(2)}) — see render/anchorBounds.ts`,
    );
  }
  return false;
}
