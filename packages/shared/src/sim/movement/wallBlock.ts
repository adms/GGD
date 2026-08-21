/**
 * WALL BLOCK —— 位移的**終點必須落在牆的這一邊**（owner 2026-08-21）。
 *
 * > owner 逐字：「我發現**有許多地圖的牆 瞬移過去** 例如**無限城**等」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️ 這修的**不是**「終點在牆裡」—— 那一個早就沒問題了
 * ═══════════════════════════════════════════════════════════════════════════
 * `movement/leap.ts` 的 `resolveLandingPoint` 從 #247 起就把落點丟進
 * `relaxBody`（推出每一個障礙 + 夾回邊界），所以「瞬移／跳躍**結束在牆裡**」
 * 這個失敗形態從來沒有發生過，而那支檔案的檔頭也逐字這樣寫。
 *
 * ⛔ **它保證的是終點，不是路徑。** 一道 GH#324 的 graybox 牆只有 **2 單位厚**
 * （`halfD: 1`），而身體半徑是 0.6 —— 牆另一側 1.6 單位外的那個點**完全合法**：
 * 不在任何障礙物裡、在邊界內、`relaxBody` 一格都不動它。於是 blink 直接落在
 * 對面，leap 的直線也直接橫過去。**每一層都是對的，只有它們的組合是空的。**
 *
 * ⭐ 這正是為什麼六張手寫舊場地沒人抱怨、七張 graybox 新場地一起爆：舊場地的
 * 障礙物**全部是圓柱**（最大 radius 2.2，本來就該跳得過），而新場地的牆是
 * `kind: "box"` 的長條 —— 無限城一個分區 **16 條**，其中四條是圍牆
 * （halfW 24 × halfD 1）。地形是那張圖的**全部設計**，而位移讓它整個不存在。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 這**不是**第三個穿牆機制 —— 前兩個各自已經修過，形狀都不一樣
 * ═══════════════════════════════════════════════════════════════════════════
 * | # | 誰 | 為什麼穿 | 修在哪 |
 * |---|---|---|---|
 * | ① | `dash` / 擊退**滑行** | `moveWithCollision` 一次走完整段 delta，速度夠快就**穿隧** | GH#318 的速度天花板（`config.displacement-tiers@1` 的 `clampSpeed`） |
 * | ② | `leap` / 擊飛**拋物線** | 刻意的：飛行中整具身體離開平面物理（`LeapSystem` 檔頭「TERRAIN CROSSING IS THE POINT」） | **這一支** |
 * | ③ | `blink` 真瞬移 | 中間位置一格都不存在，所以「路徑」從來沒有被問過 | **這一支** |
 *
 * ⇒ ①的修復是「不要一步跨太遠」，②③的修復是「**終點要在同一邊**」。
 * 兩者不可互相取代：把 blink 的速度夾住是沒有意義的（它沒有速度）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  決策點 ⇒ 欄位（第一守則），而且**預設值就是修好的那一邊**（第〇·六守則）
 * ═══════════════════════════════════════════════════════════════════════════
 * 「終點在牆的另一邊時要怎麼辦」有三個答案，⛔ 它們不是等價的，所以三個都做成
 * 一格下拉，出貨值選 `clamp`：
 *
 * | 值 | 行為 | 為什麼不是預設 |
 * |---|---|---|
 * | `allow` | 照舊穿過去 | 這是**缺陷本體**。留著只是為了一鍵 rollback |
 * | **`clamp`**（出貨） | 停在**牆前**最後一個合法點 | —— |
 * | `cancel` | 整段位移不發生 | 一支保命技在最需要它的貼牆場合**靜默失效**，玩家看到的是「按了沒反應」（`movement/blink.ts` 的 ① 已經為同一題做過這個裁決） |
 *
 * ⭐ `pillarsBlock` 預設 **false** —— **圓柱不算牆**。三個獨立的理由：
 *   ① 跳過一根柱子本來就是 leap 的定義（#247 的 `TERRAIN CROSSING IS THE POINT`）；
 *   ② 六張舊場地的障礙物**全部是圓**，所以它們走 `walls.length === 0` 那條捷徑，
 *      **逐位元組不變** —— 既有錄影照樣重播，既有測試零改動；
 *   ③ owner 的報告字面上就是「**牆**」。
 * 想連柱子也擋（＝完全實心的地形）就把這一格打開。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 飛行是這條規則的**合法例外**（GH#490，owner 2026-08-21「翔封界 等飛行效果」）
 * ═══════════════════════════════════════════════════════════════════════════
 * 一個**在飛**的身體本來就該跨得過牆 —— `sim/flight.ts` 從 2026-07-30 起就讓
 * `MovementSystem` 對飛行者跳過**全部三處**平面推擠（`moveWithCollision`、
 * 軟分離、落幕的 `pushOutOfObstacle`），所以她**用走的**就已經穿得過去。
 *
 * ⛔ 於是「瞬移過去被擋、走過去卻可以」不是嚴格，是**兩個系統對同一個身體有兩種
 * 看法**。這正是 `sim/flight.ts` 檔頭替那三處豁免立的規矩：
 * 「the three exemptions can never disagree about who is airborne」。
 *
 * ⭐ 判準用的是 **`flightIgnoresObstacles`，⛔ 不是 `isFlying`**。兩者不同：
 * 一份 `ignoreObstacles: false` 的授予是「飛起來但仍然撞牆」（schema 寫得出來），
 * 而那種身體**走**不過去，所以它也不可以**瞬移**過去。綁在「會不會穿牆走路」上，
 * 兩個系統就是**構造上**一致，⛔ 不是靠兩份各自維護的判斷同意。
 *
 * ⚠️ 反方向也關死了：豁免只在 `flightExempt` **且**這個身體真的帶著穿牆飛行時
 * 成立。⛔ 不會飛的身體一格都沒鬆 —— `policyFor` 的第三個參數是**必填**的，
 * 所以下一個呼叫端不可能「忘了想這件事」而默默拿到 `allow`
 * （一個有預設值的參數會讓漏接長得跟正確一模一樣 —— 失敗形態 ③）。
 *
 * ⭐ 落點合法性（`relaxBody`）**照跑**：飛行不代表可以停在牆的肚子裡。飛行者
 * 下一 tick 照樣可以自己走進去，但「位移不結束在幾何體內」是 #247 起唯一一份
 * 落點規則的保證，⛔ 這裡不分岔它。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  purity
 * ═══════════════════════════════════════════════════════════════════════════
 * 只有 + − × ÷、比較、`Math.sqrt` / `Math.min|max`。⛔ 無 rng（`world.rng` 一次
 * 都沒被碰到，所以位移不會把任何其他系統的擲骰移位）、⛔ 無時鐘、⛔ 無三角函式、
 * ⛔ 無 `**`。二分搜尋的**次數是固定的**，所以它是一個純算術函式，不是迴圈到收斂。
 */
import type { Obstacle, ZoneDef } from "../world/ArenaDef";
import type { Vec2 } from "../math/vec2";
import { segmentHitsAny } from "../map/lineOfSight";

/** 終點落在牆的另一邊時做什麼。⛔ 順序就是後台下拉的順序。 */
export const WALL_BLOCK_POLICIES = ["allow", "clamp", "cancel"] as const;
export type WallBlockPolicy = (typeof WALL_BLOCK_POLICIES)[number];

export interface WallBlockRules {
  /** 總開關。false = 這個機制整個不存在（＝ 2026-08-21 之前的行為）。 */
  enabled: boolean;
  /** 真瞬移（`blink`）撞到牆時。 */
  blink: WallBlockPolicy;
  /** 拋物線（`leap` / 擊飛）撞到牆時。 */
  leap: WallBlockPolicy;
  /** 圓柱算不算牆。false（出貨）= 只有 box／segment 擋位移。 */
  pillarsBlock: boolean;
  /**
   * ⭐ GH#490 —— **在飛的身體不受這條規則管**（出貨 `true`）。
   * 判準是 `flight.ts::flightIgnoresObstacles`（＝走路時就穿得過牆的那些人），
   * ⛔ 不是「有沒有飛行授予」。關掉 = 連飛行也擋（2026-08-21 到 GH#490 之間的行為）。
   */
  flightExempt: boolean;
}

/**
 * 出貨值 —— 第一守則三個住處裡的「Zod DEFAULT_*」那一份的來源。
 * ⛔ `content/config/displacement-tiers.json` 與 admin 的 `SHIPPED_*` 都要
 * 逐格對得上，⛔ 不可以有第四份手打的常數。
 */
export const DEFAULT_WALL_BLOCK: WallBlockRules = Object.freeze({
  enabled: true,
  blink: "clamp",
  leap: "clamp",
  pillarsBlock: false,
  flightExempt: true,
});

/**
 * 二分搜尋的**固定**次數。1/2^14 ≈ 0.006% 的行程，對一段 24 單位的位移是
 * 1.5 mm —— 遠小於任何人看得出來的量，而且**次數固定**才讓這支函式是純算術
 * （迴圈到收斂會讓不同的浮點路徑跑不同的圈數 ⇒ 兩個副本可能不一致）。
 */
export const WALL_BLOCK_SEARCH_STEPS = 14;

/**
 * 這一組障礙物裡，**算牆**的那些。
 *
 * ⚠️ 沒有柱子要濾掉時**回傳原陣列**（⛔ 不配置）—— 這條路徑跑在每一次位移上，
 * 而六張舊場地會走到下面的 `walls.length === 0` 捷徑，那裡一個位元組都不能動。
 */
export function wallObstacles(
  obstacles: readonly Obstacle[],
  pillarsBlock: boolean,
): readonly Obstacle[] {
  if (pillarsBlock) return obstacles;
  let hasCircle = false;
  for (const ob of obstacles) {
    if (ob.kind === "circle") {
      hasCircle = true;
      break;
    }
  }
  return hasCircle ? obstacles.filter((ob) => ob.kind !== "circle") : obstacles;
}

/** `from` → `to` 這條直線有沒有跨過牆（真尺寸，⛔ 不套視線的掠過餘裕）。 */
export function crossesWalls(
  zone: ZoneDef,
  from: Vec2,
  to: Vec2,
  pillarsBlock: boolean,
): boolean {
  const walls = wallObstacles(zone.obstacles, pillarsBlock);
  return walls.length === 0 ? false : segmentHitsAny(from, to, walls, 0);
}

export interface DisplacementEnd {
  /** 這一次位移**應該**結束在哪（尚未 relax —— 那是呼叫端的事）。 */
  pos: Vec2;
  /** 原本的終點在牆的另一邊嗎。 */
  blocked: boolean;
}

/**
 * 位移的終點：**牆的這一邊**。
 *
 * ⭐ 幾何而已 —— ⛔ 這裡**不**呼叫 `relaxBody`。落點合法性（推出障礙 + 夾回邊界）
 * 從 #247 起就只有一個住處（`movement/leap.ts` 的 `resolveLandingPoint`），
 * 在這裡再做一次就會變成兩份會分岔的規則，而分岔的那天沒有人會發現。
 */
export function resolveDisplacementEnd(
  zone: ZoneDef,
  from: Vec2,
  requested: Vec2,
  radius: number,
  policy: WallBlockPolicy,
  pillarsBlock: boolean,
): DisplacementEnd {
  const keep: DisplacementEnd = { pos: { x: requested.x, z: requested.z }, blocked: false };
  if (policy === "allow") return keep;
  const walls = wallObstacles(zone.obstacles, pillarsBlock);
  // ⭐ 沒有牆的場地（六張舊圖，柱子不算牆）**在這裡就回頭**，逐位元組等同舊行為。
  if (walls.length === 0) return keep;
  // ⚠️ 起點自己就埋在牆裡（被擠進幾何、作者把出生點放在牆上）→ **fail-open**。
  //    每一條路徑都會被判成「跨過牆」，於是一支保命技在最糟的時刻永遠失效，
  //    而畫面上跟「這技能壞了」一模一樣。這一格寧可放行。
  if (segmentHitsAny(from, from, walls, 0)) return keep;
  if (!segmentHitsAny(from, requested, walls, 0)) return keep;
  if (policy === "cancel") return { pos: { x: from.x, z: from.z }, blocked: true };

  // ── clamp：二分搜尋出「最後一段乾淨的行程」 ─────────────────────────────
  // 不變量：`lo` 這一段永遠是乾淨的（初值 0 已經在上面證過），`hi` 這一段永遠
  // 是髒的（初值 1 也證過）。固定 14 次對半，⛔ 不是迴圈到收斂。
  const dx = requested.x - from.x;
  const dz = requested.z - from.z;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < WALL_BLOCK_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (segmentHitsAny(from, { x: from.x + dx * mid, z: from.z + dz * mid }, walls, 0)) hi = mid;
    else lo = mid;
  }
  const full = Math.sqrt(dx * dx + dz * dz);
  // 再退開一個體半徑：牆是**實心**的，貼著牆面停下來會讓 `relaxBody` 立刻把
  // 身體往回推一段，看起來像位移「彈了一下」。
  const travel = full * lo - radius;
  const t = travel > 0 && full > 1e-9 ? travel / full : 0;
  return { pos: { x: from.x + dx * t, z: from.z + dz * t }, blocked: true };
}

/**
 * 一份 `config.displacement-tiers@1` 文件的 `wallBlock` 區塊 → 規則表。
 * 認不得 / 缺欄位 → **出貨值**（⛔ 不是關掉：空表等於缺陷回來）。
 *
 * ⚠️ 逐格 `typeof`，⛔ 不整份 Zod parse：這支跑在 `MatchController` 建構子上，
 * 整份 parse 會讓那份文件裡**任何一個別的區塊**的手滑把穿牆修復整個關掉。
 */
export function wallBlockFromDoc(doc: unknown): WallBlockRules {
  const d = doc as { schema?: string; wallBlock?: Record<string, unknown> } | undefined;
  if (d?.schema !== "config.displacement-tiers@1") return DEFAULT_WALL_BLOCK;
  const w = d.wallBlock;
  if (w === undefined || w === null || typeof w !== "object") return DEFAULT_WALL_BLOCK;
  const policy = (v: unknown, fallback: WallBlockPolicy): WallBlockPolicy =>
    WALL_BLOCK_POLICIES.includes(v as WallBlockPolicy) ? (v as WallBlockPolicy) : fallback;
  return Object.freeze({
    enabled: typeof w.enabled === "boolean" ? w.enabled : DEFAULT_WALL_BLOCK.enabled,
    blink: policy(w.blink, DEFAULT_WALL_BLOCK.blink),
    leap: policy(w.leap, DEFAULT_WALL_BLOCK.leap),
    pillarsBlock:
      typeof w.pillarsBlock === "boolean" ? w.pillarsBlock : DEFAULT_WALL_BLOCK.pillarsBlock,
    flightExempt:
      typeof w.flightExempt === "boolean" ? w.flightExempt : DEFAULT_WALL_BLOCK.flightExempt,
  });
}

/**
 * 這一次位移該讀哪一格。總開關關掉 = 每一種都 `allow`。
 *
 * @param flying 這具身體**走路時就穿得過牆**嗎（`flight.ts::flightIgnoresObstacles`）。
 *   ⛔ 這個參數是**必填**的：一個 `= false` 的預設值會讓「新呼叫端忘了問飛行」
 *   長得跟正確一模一樣，而它的症狀是一支飛行技被擋成穿牆缺陷（見檔頭）。
 */
export function policyFor(
  rules: WallBlockRules,
  mode: "blink" | "leap",
  flying: boolean,
): WallBlockPolicy {
  if (!rules.enabled) return "allow";
  // ⭐ GH#490：飛行的例外**在總開關之後**才問 —— 總開關關掉時整個機制不存在，
  //    這一格是不是 true 都無所謂；⛔ 反過來把它放前面會讓一個關著的機制
  //    仍然有一條「飛行專用」的分支活著。
  if (flying && rules.flightExempt) return "allow";
  return mode === "blink" ? rules.blink : rules.leap;
}
