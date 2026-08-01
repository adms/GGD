/**
 * 身體放大倍數 → 攻擊距離 (GH#252, owner 2026-08-01 實戰回饋 + 同日更正).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 動手之前的事實:這條連動**在此之前完全不存在**,而且不可能存在
 * ════════════════════════════════════════════════════════════════════════════
 * owner 的話是「身體放大倍數 會影響攻擊距離延長倍數」。查下去的結果是:sim 裡
 * **從來沒有任何一個英雄的體型數字**。
 *
 *   · 螢幕上的大小由 `content/models/_standin-overrides.json` 決定,那份檔案是
 *     **client-only** —— `ContentDb` 用 URL 直接抓,它不在 `content/manifest.json`
 *     的任何一個 collection 裡,所以 game-server 的 `registerAll` 從來沒看過它;
 *   · `model@1` 文件自己的 `scale` 自 #150 之後對英雄是**死資料**
 *     (`ChampionView.tryUpgradeToGlb` 把每一具 glb 正規化到 1.8u);
 *   · `MobRules.sizeMult`(小怪波的體型倍率)只走小怪那條路,英雄讀不到。
 *
 * 也就是說 owner 看到的不是「連動壞掉」,是「連動沒有被做出來」。要做,第一件事
 * 是讓 sim **知道**這個數字,所以 {@link ChampionDef.bodyScale} 才會存在。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼是**斷點表**而不是一個係數 —— owner 2026-08-01 的更正
 * ════════════════════════════════════════════════════════════════════════════
 * 第一版出貨的是一個係數,公式 `1 + (體型 − 1) × 係數`,出貨係數 1 = 完全等比例。
 * owner 當天就更正了:
 *
 *   > 「如果有些效果、技能、或是類似殭屍王這樣體型放大的時候,攻擊距離也會有個
 *   >   倍率跟著放大,**通常不會是等比倍率**,例如 2x body, 1.2x 攻擊距離;
 *   >   3x body 1.3x攻擊距離 ....」
 *
 * 一個係數表達不了這件事,而且**不是因為值不對**:那條公式是**線性**的,而 owner
 * 要的是**遞減** —— 1→2 加 0.2,2→3 只再加 0.1。任何單一係數都給不出兩段不同的
 * 斜率,所以換的不是數字是形狀。
 *
 * 斷點表讓 owner 的三個數字**就是資料本身**:
 *
 *     bodyScale 1 → rangeMult 1.0
 *     bodyScale 2 → rangeMult 1.2
 *     bodyScale 3 → rangeMult 1.3
 *
 * 中間**線性內插**。刻意不去反推一條「更漂亮」的冪次/對數曲線:那會讓 owner 想
 * 把 2 倍那一點從 1.2 改成 1.25 時,得重新解一次方程式,而 CLAUDE.md 第一守則的
 * 全部重點就是把「改一個決定」的成本壓到一格輸入框。(順帶:`sim/**` 也禁
 * `Math.pow` / `**` / `Math.log`,見 `sim/purity.test.ts`。)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 兩端**夾住,不外推** —— 這是一個決定,寫在這裡
 * ════════════════════════════════════════════════════════════════════════════
 * 小於第一個斷點 → 取第一列;大於最後一個斷點 → 取最後一列。
 *
 * 外推的替代方案要猜一條斜率,而那條斜率沒有人審過:一隻 `sizeMult` 8 的殭屍王
 * 會用「2→3 那一段的斜率」一路外推到 1.8× 射程,而 owner 從來沒有看過 8 這一格。
 * **「請 owner 加一列」比「替他猜一條斜率」誠實** —— 加一列是一個他看得到的
 * 決定,外推是一個他看不到的決定。
 *
 * 這同時是為什麼**沒有** `minScale` / `maxScale` 兩格(第一版有):曲線的兩端
 * 本身就是夾點。再加一組輸入夾值,只能在「和曲線互相矛盾」的時候才產生差異
 * (`maxScale` 小於最後一個斷點 / `minScale` 大於第一個斷點),而那個矛盾裡誰贏
 * 是看不見的。一份夾值,一個地方改。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 只管普攻,不管技能 —— 這是一個決定,寫在這裡而不是藏在實作裡
 * ════════════════════════════════════════════════════════════════════════════
 * owner 說的是「**攻擊距離**」。GGD 裡這兩個距離是分開的兩條路:
 *
 *   · 普攻射程 = `Stat.AttackRange`,乘 `combatEnv.attackRange`(出貨 1.0);
 *   · 技能施放距離 / AoE 半徑 = `resolveAbilityRange/Radius`,乘
 *     `combatEnv.abilityRange`(出貨 **0.6**,task #136 刻意壓過的)。
 *
 * 這條連動**只**接在前者。理由不是保守,是那 0.6:技能距離已經有一個 owner 自己
 * 調過的系統倍率,再乘一個體型倍率會讓「#136 把技能距離壓到 60%」這個決定對大體型
 * 英雄悄悄失效。要不要一起連動是**下一個**決定,而它應該由 owner 看著這一版的
 * 實戰結果來下,不是由我在這裡猜一個然後在註解裡辯護。
 *
 * PURITY: 純資料 + 純函式。沒有 `Math.random` / `Date.now` / 三角函式 / 冪次,
 * 沒有 Map/Set 迭代;陣列排序帶明確的數值比較器。
 */

/**
 * 曲線上的一個斷點:「體型 {@link bodyScale} 倍的人,普攻射程是卡面的
 * {@link rangeMult} 倍」。
 */
export interface AttackRangeBreakpoint {
  /** 身體放大倍數(英雄卡的 `bodyScale`,1 = 一般體型)。 */
  readonly bodyScale: number;
  /** 這個體型對應的普攻射程倍率(1 = 照卡面)。 */
  readonly rangeMult: number;
}

/**
 * 身體放大倍數 → 攻擊距離的規則。整份在開賽 tick 0 之前灌進 `SimWorld`,
 * 和 `combatEnv` / `baseBonus` / `statCaps` / `shieldRules` 同一條規矩。
 */
export interface BodyScaleRules {
  /**
   * 總開關。關 = 攻擊距離完全不看體型,逐位元等同這個功能出現之前的 sim。
   * (把整條曲線壓平成 `rangeMult: 1` 也是同一個結果;兩個都留著是因為
   * 「暫時關掉」與「調成不連動」在後台是兩件不同的事 —— 關掉之後再打開,
   * owner 調過的曲線還在。)
   */
  enabled: boolean;
  /**
   * 體型 → 射程倍率的斷點表,依 `bodyScale` **由小到大**、不重複。
   * 中間線性內插,兩端夾住不外推(見檔頭)。
   */
  attackRangeCurve: readonly AttackRangeBreakpoint[];
}

/** 曲線至少要幾個斷點。兩點才畫得出一段,一點不是曲線是常數。 */
export const CURVE_MIN_POINTS = 2;
/**
 * 曲線最多幾個斷點。8 不是效能上限(這是每次 `recomputeStats` 走一次的短迴圈),
 * 是**可讀性**上限:一張要捲動才看得完的表,owner 沒辦法一眼看出它是不是遞減的。
 */
export const CURVE_MAX_POINTS = 8;

/** 斷點的體型下界。 */
export const CURVE_BODY_SCALE_MIN = 0.1;
/**
 * 斷點的體型上界。10 是小怪波 `boss.sizeMult` 的出貨值 —— 貼錯格擋在這裡,
 * 同時也讓「殭屍王那一格」填得進來。
 */
export const CURVE_BODY_SCALE_MAX = 10;

/**
 * 射程倍率下界。不取 0:射程 0 的近戰連貼身都打不到,而畫面上沒有任何一個字說
 * 發生了什麼(`BasicAttackSystem` 的 `reachTo` 地板會蓋住一部分,於是症狀變成
 * 「遠程角色站在原地發呆」)。0.1 的意思是「這個機制最多拿走九成射程」。
 */
export const CURVE_RANGE_MULT_MIN = 0.1;
/**
 * 射程倍率上界。3 擋的是「把百分比當倍率填」(120 → 120 倍射程,那位英雄會從
 * 畫面外開打)。出貨最大體型 3.0 對到 1.3,所以 3 留了很大的餘裕。
 */
export const CURVE_RANGE_MULT_MAX = 3;

/**
 * 出貨曲線 = **owner 2026-08-01 給的三個數字,一個位元都沒有加工**。
 *
 * ⚠️ 這條曲線**會改變平衡**,而且是故意的 —— 這個機制出現之前射程完全不看體型,
 * 所以它不是「維持原狀」的值。出貨體型分佈 0.6..3.0(24 位有非 1 的體型,見
 * `content/models/_standin-overrides.json`):
 *
 *     體型 0.6 / 0.62 / 0.65 …  → 1.00×(第一個斷點在 1,以下夾住,小隻的不受罰)
 *     體型 1.5                   → 1.10×(1↔2 之間內插)
 *     體型 2.0                   → 1.20×
 *     體型 3.0                   → 1.30×(godie-o030,出貨最大的一位)
 *
 * 要退回舊行為,把 `enabled` 關掉。
 */
export const DEFAULT_ATTACK_RANGE_CURVE: readonly AttackRangeBreakpoint[] = Object.freeze([
  Object.freeze({ bodyScale: 1, rangeMult: 1 }),
  Object.freeze({ bodyScale: 2, rangeMult: 1.2 }),
  Object.freeze({ bodyScale: 3, rangeMult: 1.3 }),
]);

/** 出貨值。 */
export const DEFAULT_BODY_SCALE_RULES: BodyScaleRules = Object.freeze({
  enabled: true,
  attackRangeCurve: DEFAULT_ATTACK_RANGE_CURVE,
});

/** 文件的 schema 字串 —— sim 與後台 overlay 共用這一個常數。 */
export const BODY_SCALE_SCHEMA = "config.body-scale@1";
/** 文件 id(`config` collection 裡的 `body-scale`)。 */
export const BODY_SCALE_DOC_ID = "body-scale";

/** 認得就夾進區間,認不得就回 `null`(= 這一列整個丟掉)。 */
function finiteIn(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 正規化操作者/文件給的曲線。
 *
 * 認不得的列**丟掉**而不是補一個預設值:一列 `{ bodyScale: "2" }` 補成
 * `{ bodyScale: 1, rangeMult: 1 }` 會在表上多出一個沒有人填過的斷點,而那個斷點
 * 會真的改變內插結果。剩下不足 {@link CURVE_MIN_POINTS} 列 → 整條回出貨曲線,
 * 因為「半條曲線」比「出貨曲線」更難發現不對。
 *
 * 排序 + 去重在這裡做完,所以 {@link attackRangeScaleFactor} 可以假設輸入是
 * 嚴格遞增的 —— 沒有這一步,兩列同樣 `bodyScale` 會讓內插除以 0 得到 `Infinity`,
 * 一路乘進 `Stat.AttackRange` 就是「那位英雄整張地圖都打得到」。
 */
export function normalizeAttackRangeCurve(raw: unknown): readonly AttackRangeBreakpoint[] {
  if (!Array.isArray(raw)) return DEFAULT_ATTACK_RANGE_CURVE;
  const parsed: AttackRangeBreakpoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const x = finiteIn(r.bodyScale, CURVE_BODY_SCALE_MIN, CURVE_BODY_SCALE_MAX);
    const y = finiteIn(r.rangeMult, CURVE_RANGE_MULT_MIN, CURVE_RANGE_MULT_MAX);
    if (x === null || y === null) continue;
    parsed.push({ bodyScale: x, rangeMult: y });
  }
  parsed.sort((a, b) => a.bodyScale - b.bodyScale);
  const out: AttackRangeBreakpoint[] = [];
  for (const p of parsed) {
    const prev = out[out.length - 1];
    // 同一個體型出現兩次(有可能是被上界夾出來的):留先宣告的那一列。
    if (prev !== undefined && prev.bodyScale === p.bodyScale) continue;
    out.push(Object.freeze(p));
    if (out.length === CURVE_MAX_POINTS) break;
  }
  if (out.length < CURVE_MIN_POINTS) return DEFAULT_ATTACK_RANGE_CURVE;
  return Object.freeze(out);
}

/**
 * 正規化整份規則。認不得 / 超界 → 夾回合法區間(不是 throw,也不是 undefined:
 * 一條 undefined 的曲線會讓 {@link attackRangeScaleFactor} 算出 `NaN`,而 `NaN`
 * 一路乘進 `Stat.AttackRange` 就是**全場沒有人打得到人**)。
 */
export function normalizeBodyScaleRules(raw: unknown): BodyScaleRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_BODY_SCALE_RULES.enabled,
    attackRangeCurve: normalizeAttackRangeCurve(r.attackRangeCurve),
  });
}

/**
 * 讀一份 `config.body-scale@1` 文件。沒有文件 / schema 不對 → 出貨預設
 * (不是「關掉」:一份載入失敗的文件不應該悄悄拿走 owner 要的行為)。
 */
export function bodyScaleRulesFromDoc(doc: unknown): BodyScaleRules {
  if (!doc || typeof doc !== "object") return DEFAULT_BODY_SCALE_RULES;
  const d = doc as { schema?: unknown };
  if (d.schema !== BODY_SCALE_SCHEMA) return DEFAULT_BODY_SCALE_RULES;
  return normalizeBodyScaleRules(d);
}

/**
 * 這個體型倍數對應的**攻擊距離倍率**。
 *
 * `bodyScale` 缺 / 非有限 / ≤0 一律當 1(= 正常體型),所以 89 位沒有填這一格的
 * 英雄逐位元不受影響。
 *
 * 回傳值必然落在曲線自己的 `rangeMult` 值域內 —— 內插是兩個端點的凸組合,而每個
 * 端點都被 {@link normalizeAttackRangeCurve} 夾在
 * [{@link CURVE_RANGE_MULT_MIN}, {@link CURVE_RANGE_MULT_MAX}] 裡。所以這一支
 * **不需要**再補一條「不可以是負數」的地板:負射程在這個形狀底下是算不出來的。
 */
export function attackRangeScaleFactor(
  bodyScale: number | undefined,
  rules: BodyScaleRules = DEFAULT_BODY_SCALE_RULES,
): number {
  if (!rules.enabled) return 1;
  const curve = rules.attackRangeCurve;
  if (!Array.isArray(curve) || curve.length === 0) return 1;
  const s =
    typeof bodyScale === "number" && Number.isFinite(bodyScale) && bodyScale > 0 ? bodyScale : 1;

  const first = curve[0]!;
  if (s <= first.bodyScale) return first.rangeMult; // 兩端夾住,不外推(見檔頭)
  const last = curve[curve.length - 1]!;
  if (s >= last.bodyScale) return last.rangeMult;

  for (let i = 1; i < curve.length; i++) {
    const hi = curve[i]!;
    if (s > hi.bodyScale) continue;
    const lo = curve[i - 1]!;
    const span = hi.bodyScale - lo.bodyScale;
    // 正規化保證嚴格遞增,所以 span > 0;這一行是「有人繞過 normalize 自己組
    // rules」時不要除以 0 的最後一道。
    if (span <= 0) return lo.rangeMult;
    const t = (s - lo.bodyScale) / span;
    return lo.rangeMult + (hi.rangeMult - lo.rangeMult) * t;
  }
  return last.rangeMult;
}
