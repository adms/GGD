/**
 * 位移級距（`config.displacement-tiers@1`）—— GH#318。
 *
 * owner 2026-08-12 要的是「位移距離的**統一規範**」，四個字：小 / 中 / 大 / 極大。
 * 但這支檔案裡有**兩個**機制，而且只有第二個是 #318 的修復本體：
 *
 * | 機制 | 觸發條件 | 做什麼 | 修好什麼 |
 * |---|---|---|---|
 * | ① 級距 `distanceTier` | 作者**有填**級別才跑 | 同時寫 `distance` 與 `speed` | owner 要的統一規範 |
 * | ② 天花板 `maxSpeed` | **無條件**，每一個 dash/knockback 節點 | `speed = min(authored, maxSpeed)` | **GH#318 本體** |
 *
 * ⛔ **只做①修不了 #318。** 級距跟 AoE 的 `radiusTier` 一樣是 opt-in 的 ——
 * 沒有人回頭去編輯那 32 個節點的話，它們照樣穿牆。所以 ② 不看 `distanceTier`，
 * 它看的是**每一個**位移節點。兩個開關（`enabled` / `clampSpeed`）分開，
 * 因為關掉級距不代表要把安全上限一起關掉。
 *
 * ── 為什麼是**兩條**梯子 ───────────────────────────────────────────────────
 * 出貨分佈量到的（2026-08-13 重掃 HEAD 工作區）：
 *   dash.maxDistance    n=15  min 5.00  中位 11.00  max 14.67
 *   knockback.distance  n=14  min 2.00  中位  3.00  max  6.00
 * 兩者幾乎不重疊（唯一交集 6.0）。硬塞成一條跨 2..15 的四階梯子，每一階要跳 ~2×，
 * 14 支擊退會全部擠進「小」。⭐ 這**仍然是一套規範**：一個機制、一組級別名、
 * 一份 config 文件、一格下拉。owner 想合成一條，只要把兩張表填成一樣的數字 ——
 * 那是一格後台欄位，不是一次改程式（第一守則）。
 *
 * ── ⛔ `maxSpeed` **不可以寫死 16** ───────────────────────────────────────
 * 穿牆的門檻不是「速度 18」，是「**每 tick 位移的法線分量 > 身體半徑**」
 * （`sim/collision/resolve.ts` 的 `moveWithCollision` 一次走完整段 delta，
 *  沒有子步化 —— 那是 #318 的另一半，走 issue）。所以門檻 = `TICK_HZ × 身體半徑`，
 * 而**身體半徑是一個 config 欄位**（`config.arena-rules@1` 的 `mobWaves.mob.radius`）。
 * 寫死 16 的那天有人把 mob 半徑調到 0.4，這個數字就再次說謊，而且**沒有東西會紅**。
 *
 *     maxSpeed = floor(TICK_HZ × minBodyRadius × safetyFactor)
 *              = floor(30 × 0.6 × 0.9) = floor(16.2) = 16
 *
 * `safetyFactor < 1` 是必要的：`30 × 0.6 = 18.0` 這個**平手值本身就會穿**
 * （取決於線段繞向的退化法線）。0.9 留 11% 的浮點餘裕。
 *
 * 16 的三個獨立旁證（都是量到的，⛔ 不是挑的）：
 *   · 引擎自己每一次命中用的擊退速度就是 `KB_SPEED = 16`（`combat/damage.ts`）；
 *   · 出貨帶速度的位移節點裡，16 是第二常見的值；
 *   · 16/30 = 0.533 u/tick = 半徑的 89%。
 *
 * ⚠️ 誠實的代價：dash 的收招時間會**大約翻倍**（19 支裡最快的一支 0.265s → 0.516s）。
 * 這是算術不是選擇 —— 不子步化的前提下，移動 14.67 u 而不穿牆最少就是 0.92 秒。
 *
 * ── 為什麼四格速度今天都一樣 ───────────────────────────────────────────────
 * 唯一可以分級的方向是**往下**（16 是天花板），而「短距離衝刺跑得慢」是反的。
 * 級距真正的第二維是**收招時間 d/16**（0.34 / 0.52 / 0.69 / 0.92 秒）。
 * 那 `speed` 這一欄留著幹嘛？因為子步化哪天做了，門檻整個消失，owner 想把速度
 * 拉回 30 只要改四格數字，不是改 32 個檔。欄位在，才是可調（第一守則）。
 */
import { TICK_HZ } from "../constants";
import { KB_MAX_DISTANCE } from "../sim/effects/knockbackLimits";
import {
  DUEL_ZONE_RADIUS_REF,
  SKILL_TIER_NAMES,
  TRAVEL_SCALE,
  ladderWindow,
  type SkillTierName,
} from "./skillTiers";

/** `content/config/displacement-tiers.json` 的文件 id。 */
export const DISPLACEMENT_TIERS_DOC_ID = "displacement-tiers";

/**
 * 五個級別。⛔ 順序就是由小到大，後台下拉、schema enum 與文件共用這一份。
 *
 * ⭐ **兩套詞彙的合併在 2026-08-19 做完了**（GH#414，owner：「正規化成五級距⋯
 * 都統一」）。這一行以前寫著「用 owner 的『極大』，⛔ 不是 AoE 那份的『超大』
 * —— 兩套詞彙的合併走 issue」，也就是它**知道自己不一致卻只有散文守著**。
 *
 * ⚠️ 合併的方向是量出來的，⛔ 不是挑的：舊的第四格「極大」在出貨內容裡
 * **0 支技能在用**（`distanceTier` 只出現過「小」），而 AoE 的「超大」有 6 支。
 * ⇒ 第四格改叫「超大」對齊 AoE，沒人用的那個字讓給新的第五格「極大」。
 * **沒有任何一支既有技能的級距詞改變意思。**
 */
export const DISPLACEMENT_TIER_NAMES = SKILL_TIER_NAMES;
export type DisplacementTierName = SkillTierName;

/** 兩條梯子：`travel` = 自己動（dash）、`push` = 別人被推（knockback）。 */
export const DISPLACEMENT_LADDERS = ["travel", "push"] as const;
export type DisplacementLadder = (typeof DISPLACEMENT_LADDERS)[number];

/** 一格級別 = 一組「走多遠 × 多快」。⛔ 距離與速度分兩張表就會漂走。 */
export interface DisplacementTierRow {
  readonly distance: number;
  readonly speed: number;
}
export type DisplacementLadderTable = Readonly<Record<DisplacementTierName, DisplacementTierRow>>;

export interface DisplacementTiers {
  /** ① 級距的止血閥。false = `distanceTier` 不解析（填了不生效，但看得見它是關的）。 */
  enabled: boolean;
  /** ② 速度天花板的止血閥。⚠️ 關掉它 = #318 回來。與 `enabled` 刻意分開。 */
  clampSpeed: boolean;
  /** 距離門檻的安全係數，`maxSpeed` 的唯一手動輸入。 */
  safetyFactor: number;
  /** 推導出來的最小身體半徑（不是欄位，攤在這裡讓守衛與後台看得到）。 */
  minBodyRadius: number;
  /** 推導出來的速度天花板 u/s。⛔ 不是作者填的，也不是常數。 */
  maxSpeed: number;
  travel: DisplacementLadderTable;
  push: DisplacementLadderTable;
}

/**
 * 英雄的碰撞半徑。⚠️ 它是 `sim/spawnChampion.ts` 裡的一個字面值 0.6
 * （全英雄一致、不隨 bodyScale 變），今天沒有匯出的常數可以引用。
 * ⛔ 這一格是**已知的第二個住處** —— 那支檔案不在這一批的所有權範圍內，
 * 把 0.6 抽成常數並讓兩邊共用走 issue。守衛：`displacementTiers.test.ts` 的
 * 配對式那一條會在半徑真的變小時紅。
 */
export const CHAMPION_BODY_RADIUS = 0.6;

/** 級距距離的下界（兩條梯子共用）。 */
export const DISPLACEMENT_DISTANCE_MIN = 0.5;
/**
 * `travel`（dash）距離上界 = **決鬥區半徑 24**。一段比整個決鬥區還長的衝刺
 * 不是位移，是傳送；而 600（w3x 生數字，×54.5）會被擋在門外。
 */
export const DISPLACEMENT_TRAVEL_DISTANCE_MAX = 24;
/** `push`（knockback）距離上界 —— 直接用擊退自己那一份，⛔ 不另立一個會漂走的數。 */
export const DISPLACEMENT_PUSH_DISTANCE_MAX = KB_MAX_DISTANCE;

/**
 * 作者能填的速度上下界 —— ⚠️ 這是 **MIS-PARSE 護欄**，⛔ 不是安全天花板。
 *
 * 真正的天花板是 `maxSpeed`，而它是**推導出來的**（吃 config 的身體半徑），
 * 所以它不可能是一個靜態的 Zod 數字。這一格擋的是另一種錯：把 w3x 的
 * `1000` 直接貼進來。40 > 任何身體半徑推得出來的天花板
 * （特殊殭屍 r=1.08 → 32.4），所以把 `safetyFactor` 或 mob 半徑調大
 * **不會**讓合法的填法變成違法；同時 40 遠小於 200/1000 那種漏換算。
 */
export const DISPLACEMENT_SPEED_MIN = 1;
export const DISPLACEMENT_AUTHORED_SPEED_MAX = 40;

/** `safetyFactor` 的上下界。1 = 正好踩在平手線上（會穿），所以那是硬上界。 */
export const DISPLACEMENT_SAFETY_FACTOR_MIN = 0.1;
export const DISPLACEMENT_SAFETY_FACTOR_MAX = 1;
export const DEFAULT_DISPLACEMENT_SAFETY_FACTOR = 0.9;

/**
 * `maxSpeed` 的地板。一個荒謬的小半徑會讓 `floor()` 掉到 0，而速度 0 的衝刺
 * = 技能按了什麼都沒發生，一種**看起來跟功能沒做一模一樣**的死法（失敗形態②）。
 * 寧可慢到看得出來，也不要靜默凍結。
 */
export const DISPLACEMENT_MAX_SPEED_FLOOR = 1;

/** 門檻推導。⭐ 全專案唯一算這條式子的地方。 */
export function maxSpeedFor(minBodyRadius: number, safetyFactor: number): number {
  const raw = Math.floor(TICK_HZ * minBodyRadius * safetyFactor);
  return raw < DISPLACEMENT_MAX_SPEED_FLOOR ? DISPLACEMENT_MAX_SPEED_FLOOR : raw;
}

/** 出貨的級距速度 —— 就是天花板本身，⛔ 不是另一個手打的 16。 */
const SHIPPED_TIER_SPEED = maxSpeedFor(CHAMPION_BODY_RADIUS, DEFAULT_DISPLACEMENT_SAFETY_FACTOR);

/**
 * 出貨值。⚠️ 這些數字與 `content/config/displacement-tiers.json` 必須一致
 * （第一守則的三個住處：content/ · 這裡 · 後台）。
 *
 * `travel` 的前四格落在既有的 WC3 刻度上（300/450/600/800 × 11/600），
 * 所以 15 支 dash 裡 8 支距離一格都不動；`push` 的 3 / 4.5 / 6 正好是
 * `aoe-tiers.json` 的小/中/大 ——「一個『大』的擊退 = 把人推出一個『中』的
 * AoE 半徑」，兩套級距互相讀得出來。
 *
 * ⭐ GH#414 把那句「正好是」變成**程式**：三張表其實是 `skillTiers.ts` 那條
 * 梯子的三個視窗 —— `push` 取橫木 [0..4]、`travel` 取 [1..5] 再 × 11/6。
 * ⛔ 所以這裡不再抄字面值。出貨的 8 個舊數字由梯子逐位元重現，第五格是新的。
 */
export const DEFAULT_DISPLACEMENT_TIERS: DisplacementTiers = Object.freeze({
  enabled: true,
  clampSpeed: true,
  safetyFactor: DEFAULT_DISPLACEMENT_SAFETY_FACTOR,
  minBodyRadius: CHAMPION_BODY_RADIUS,
  maxSpeed: SHIPPED_TIER_SPEED,
  travel: ladderRows(ladderWindow(DUEL_ZONE_RADIUS_REF, 1, TRAVEL_SCALE)),
  push: ladderRows(ladderWindow(DUEL_ZONE_RADIUS_REF, 0)),
});

/** 一條距離梯子 → 一條 `{distance, speed}` 梯子。速度五格同值（見上面的說明）。 */
function ladderRows(
  distances: Readonly<Record<SkillTierName, number>>,
): Readonly<Record<DisplacementTierName, DisplacementTierRow>> {
  const out = {} as Record<DisplacementTierName, DisplacementTierRow>;
  for (const n of DISPLACEMENT_TIER_NAMES) {
    out[n] = Object.freeze({ distance: distances[n], speed: SHIPPED_TIER_SPEED });
  }
  return Object.freeze(out);
}

/**
 * 出貨 config 裡**最小**的身體半徑 —— `maxSpeed` 的推導輸入。
 *
 * ⚠️ 取 min 而不是取英雄那一顆：穿牆的是「被推的那個身體」，而擊退打得到殭屍。
 * 一般殭屍 0.6、王 0.9、特殊 0.6×1.8=1.08 —— 今天四者的 min 是 0.6，
 * 但那是**量出來的巧合**，不是可以寫死的事實。
 */
export function minBodyRadiusFromConfigs(configs: Iterable<unknown>): number {
  let min = CHAMPION_BODY_RADIUS;
  const take = (v: unknown): void => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < min) min = v;
  };
  for (const c of configs) {
    const d = c as
      | {
          schema?: string;
          mobWaves?: {
            mob?: { radius?: unknown };
            boss?: { radius?: unknown };
            special?: { radiusMult?: unknown };
          };
        }
      | undefined;
    if (!d || d.schema !== "config.arena-rules@1") continue;
    const mob = d.mobWaves?.mob?.radius;
    take(mob);
    take(d.mobWaves?.boss?.radius);
    const mult = d.mobWaves?.special?.radiusMult;
    if (typeof mob === "number" && typeof mult === "number") take(mob * mult);
  }
  return min;
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, lo), hi);
}

function ladderFromDoc(
  src: unknown,
  fallback: DisplacementLadderTable,
  distanceMax: number,
  maxSpeed: number,
): DisplacementLadderTable {
  const rows = (src ?? {}) as Record<string, { distance?: unknown; speed?: unknown } | undefined>;
  const out = {} as Record<DisplacementTierName, DisplacementTierRow>;
  for (const name of DISPLACEMENT_TIER_NAMES) {
    const row = rows[name];
    const def = fallback[name];
    out[name] = Object.freeze({
      distance: clampNum(row?.distance, DISPLACEMENT_DISTANCE_MIN, distanceMax, def.distance),
      // ⭐ 級距表自己也要被天花板夾。⛔ 否則它就是一條繞過 ② 的後門：
      //    Zod 驗完之後才注入，注入的值**不再過 Zod**（AoE 那邊靠
      //    `AOE_TIER_RADIUS_MAX === SPREAD_MAX_RADIUS` 這個巧合躲掉了，位移沒有這個巧合）。
      speed: clampNum(row?.speed, DISPLACEMENT_SPEED_MIN, maxSpeed, Math.min(def.speed, maxSpeed)),
    });
  }
  return Object.freeze(out);
}

/**
 * 把一份 `config.displacement-tiers@1` 文件正規化成級距表。認不得 → 出貨值。
 *
 * `minBodyRadius` 由呼叫端從 `config.arena-rules@1` 推導後傳進來
 * （`minBodyRadiusFromConfigs`）—— ⛔ 不讓這支檔案自己去翻另一份 config，
 * 那條相依會讓「級距文件不在」與「競技場文件不在」變成兩種不同的沉默。
 */
export function displacementTiersFromDoc(
  doc: unknown,
  minBodyRadius: number = CHAMPION_BODY_RADIUS,
): DisplacementTiers {
  const d = doc as
    | {
        schema?: string;
        enabled?: unknown;
        clampSpeed?: unknown;
        safetyFactor?: unknown;
        travel?: unknown;
        push?: unknown;
      }
    | undefined;
  const known = d?.schema === "config.displacement-tiers@1";
  const safetyFactor = known
    ? clampNum(
        d.safetyFactor,
        DISPLACEMENT_SAFETY_FACTOR_MIN,
        DISPLACEMENT_SAFETY_FACTOR_MAX,
        DEFAULT_DISPLACEMENT_SAFETY_FACTOR,
      )
    : DEFAULT_DISPLACEMENT_SAFETY_FACTOR;
  const maxSpeed = maxSpeedFor(minBodyRadius, safetyFactor);
  return {
    enabled: known && typeof d.enabled === "boolean" ? d.enabled : DEFAULT_DISPLACEMENT_TIERS.enabled,
    clampSpeed:
      known && typeof d.clampSpeed === "boolean"
        ? d.clampSpeed
        : DEFAULT_DISPLACEMENT_TIERS.clampSpeed,
    safetyFactor,
    minBodyRadius,
    maxSpeed,
    travel: ladderFromDoc(
      known ? d.travel : undefined,
      DEFAULT_DISPLACEMENT_TIERS.travel,
      DISPLACEMENT_TRAVEL_DISTANCE_MAX,
      maxSpeed,
    ),
    push: ladderFromDoc(
      known ? d.push : undefined,
      DEFAULT_DISPLACEMENT_TIERS.push,
      DISPLACEMENT_PUSH_DISTANCE_MAX,
      maxSpeed,
    ),
  };
}

/**
 * ⭐ kind → 欄位名的**一張表**，⛔ 不是兩個 if（第〇·五守則）。
 * AoE 那邊寫得死（`out["radius"] = r`）是因為它只有一個欄位名；位移的距離欄位
 * 逐 kind 不同（dash 叫 `maxDistance`、knockback 叫 `distance`），抄不動。
 * 下一個走碰撞的位移 kind 進來時，這裡加**一列**，⛔ 不是加一個分支。
 */
interface DisplacementFields {
  readonly ladder: DisplacementLadder;
  readonly distanceField: string;
  readonly speedField: string;
}
const DISPLACEMENT_KIND_FIELDS: Readonly<Record<string, DisplacementFields | undefined>> =
  Object.freeze({
    dash: Object.freeze({ ladder: "travel", distanceField: "maxDistance", speedField: "speed" }),
    knockback: Object.freeze({ ladder: "push", distanceField: "distance", speedField: "speed" }),
  } as const);

/** 出貨支援級距的 kind 名單（給 schema / 後台 / 契約匯出共用一份）。 */
export const DISPLACEMENT_TIER_KINDS = Object.freeze(
  Object.keys(DISPLACEMENT_KIND_FIELDS),
) as readonly string[];

/**
 * 把一份技能／道具文件裡的位移節點正規化。**兩件事，順序固定**：
 *
 *   ① 有 `distanceTier` 且 `enabled` → 同時寫距離與速度（⭐ **級別贏過手寫值**，
 *      理由與 `resolveRadiusTier` 逐字相同：讓手寫值蓋過它 = 這個機制對那支技能
 *      不存在，而且沒有人會發現）。
 *   ② `clampSpeed` → `speed = min(speed, maxSpeed)`，**無條件**，
 *      跟有沒有填級別完全無關。這一條才是 #318 的修復。
 *
 * ⛔ 順序不可以反過來：①寫進去的速度也必須被②夾（`ladderFromDoc` 已經夾過一次，
 * 這裡是第二道，因為 overlay 的寫入路徑到今天為止沒有跑 Zod，見 `knockbackLimits.ts`）。
 */
export function resolveDisplacementTier<T extends Record<string, unknown>>(
  def: T,
  tiers: DisplacementTiers,
): T {
  if (!tiers.enabled && !tiers.clampSpeed) return def;
  return walk(def) as T;

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const rec = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = walk(v);

    const kind = rec["kind"];
    const fields = typeof kind === "string" ? DISPLACEMENT_KIND_FIELDS[kind] : undefined;
    if (fields === undefined) return out;

    if (tiers.enabled) {
      const tier = rec["distanceTier"];
      if (typeof tier === "string") {
        const row = tiers[fields.ladder][tier as DisplacementTierName] as
          | DisplacementTierRow
          | undefined;
        if (row !== undefined) {
          out[fields.distanceField] = row.distance;
          out[fields.speedField] = row.speed;
        }
      }
    }
    if (tiers.clampSpeed) {
      const s = out[fields.speedField];
      if (typeof s === "number" && Number.isFinite(s) && s > tiers.maxSpeed) {
        out[fields.speedField] = tiers.maxSpeed;
      }
    }
    return out;
  }
}
