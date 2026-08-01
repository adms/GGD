/**
 * 身體放大倍數 → 攻擊距離 (GH#252, owner 2026-08-01 實戰回饋).
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
 * ════════════════════════════════════════════════════════════════════════════
 * 係數是欄位,不是常數
 * ════════════════════════════════════════════════════════════════════════════
 * 「1:1 還是打折」是 CLAUDE.md 第一守則講的那種決策點。出貨值取 owner 的字面
 * 讀法(「會影響」= 等比例),但兩端都留活口:
 *
 *     rangeFactor = 1 + (clamp(bodyScale) − 1) × attackRangeCoefficient
 *
 *   · coefficient = 1  → factor = bodyScale,**完全 1:1**(出貨值)
 *   · coefficient = 0  → factor = 1,等於這個功能不存在(改成欄位之前的行為)
 *   · coefficient = .5 → 體型 2 倍的人射程 +50%,不是 +100%
 *
 * 一次項而不是乘冪,是因為 `sim/**` 禁用 `**`(`sim/purity.test.ts` 在守),而且
 * 一次項讓 coefficient=0 精確地退回舊行為,不需要另一個分支。
 *
 * PURITY: 純資料 + 純函式。沒有 `Math.random` / `Date.now` / 三角函式 / `**`,
 * 沒有 Map/Set 迭代。
 */

/**
 * 身體放大倍數 → 攻擊距離的規則。整份在開賽 tick 0 之前灌進 `SimWorld`,
 * 和 `combatEnv` / `baseBonus` / `statCaps` / `shieldRules` 同一條規矩。
 */
export interface BodyScaleRules {
  /**
   * 總開關。關 = 攻擊距離完全不看體型,逐位元等同這個功能出現之前的 sim。
   * (係數填 0 也是同一個結果;兩個都留著是因為「暫時關掉」與「調成不連動」
   * 在後台是兩件不同的事 —— 關掉之後再打開,係數還在。)
   */
  enabled: boolean;
  /**
   * 體型每多出 1 倍,攻擊距離跟著延長幾倍。1 = 完全等比例(出貨值 = owner 的
   * 字面讀法),0 = 不連動。
   */
  attackRangeCoefficient: number;
  /** 餵進公式前,體型倍數的下界(比這更小的身體不會讓射程再縮下去)。 */
  minScale: number;
  /** 餵進公式前,體型倍數的上界 —— 這是「不會從畫面外開打」的那條線。 */
  maxScale: number;
}

/**
 * 出貨值。
 *
 * ⚠️ `attackRangeCoefficient: 1` **會改變平衡**,而且是故意的 —— 這一格出現
 * 之前射程完全不看體型,所以它不是「維持原狀」的值。出貨體型分佈是 0.6..3.0
 * (24 位有非 1 的體型,見 `content/models/_standin-overrides.json`),對應射程
 * 0.6× .. 3.0×。要退回舊行為就把它調成 0。
 */
export const DEFAULT_BODY_SCALE_RULES: BodyScaleRules = Object.freeze({
  enabled: true,
  attackRangeCoefficient: 1,
  minScale: 0.1,
  maxScale: 4,
});

/** 文件的 schema 字串 —— sim 與後台 overlay 共用這一個常數。 */
export const BODY_SCALE_SCHEMA = "config.body-scale@1";
/** 文件 id(`config` collection 裡的 `body-scale`)。 */
export const BODY_SCALE_DOC_ID = "body-scale";

/** 係數的合法區間。上界 3 擋的是「把百分比當倍率填」(100 → 100 倍射程)。 */
export const ATTACK_RANGE_COEFFICIENT_MAX = 3;
/** 體型上界自己的上界。10 是小怪波的 `boss.sizeMult` 出貨值 —— 貼錯格擋在這裡。 */
export const BODY_SCALE_CLAMP_MAX = 10;

/**
 * 射程倍率的**下界**,而且它是必要的而不是保險絲。
 *
 * 公式是一次項,所以「小體型 × 大係數」會算出負數:`minScale` 0.1 配上係數 3 是
 * `1 + (0.1 − 1) × 3 = −1.7`。兩個值各自都在合法區間裡,乘出來的卻是一個會讓
 * `Stat.AttackRange` 變成負數的倍率 —— 那不是「打不遠」,那是那位英雄站在原地
 * 發呆,而畫面上沒有任何一個字說發生了什麼。
 *
 * 0.1 的意思是「這個機制最多拿走九成射程」。不取 0 是同樣的理由:射程 0 的近戰
 * 連貼身都打不到。
 */
export const MIN_ATTACK_RANGE_FACTOR = 0.1;

function finiteIn(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 正規化操作者/文件給的值。認不得 / 超界 → 夾回合法區間(不是 throw,也不是
 * undefined:一個 undefined 的係數會讓 {@link attackRangeScaleFactor} 算出
 * `NaN`,而 `NaN` 一路乘進 `Stat.AttackRange` 就是**全場沒有人打得到人**)。
 *
 * `minScale > maxScale` 時以 `minScale` 為準把兩端合起來 —— 交錯的區間會讓
 * clamp 的兩行互相打架,而那個結果是「同一個體型在不同版本的 clamp 順序下給出
 * 不同射程」。
 */
export function normalizeBodyScaleRules(raw: unknown): BodyScaleRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const minScale = finiteIn(r.minScale, 0.01, 1, DEFAULT_BODY_SCALE_RULES.minScale);
  let maxScale = finiteIn(
    r.maxScale,
    1,
    BODY_SCALE_CLAMP_MAX,
    DEFAULT_BODY_SCALE_RULES.maxScale,
  );
  if (maxScale < minScale) maxScale = minScale;
  return Object.freeze({
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_BODY_SCALE_RULES.enabled,
    attackRangeCoefficient: finiteIn(
      r.attackRangeCoefficient,
      0,
      ATTACK_RANGE_COEFFICIENT_MAX,
      DEFAULT_BODY_SCALE_RULES.attackRangeCoefficient,
    ),
    minScale,
    maxScale,
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
 * `bodyScale` 缺 / 非有限 / ≤0 一律當 1(= 正常體型),所以 113 位沒有填這一格的
 * 英雄逐位元不受影響。
 */
export function attackRangeScaleFactor(
  bodyScale: number | undefined,
  rules: BodyScaleRules = DEFAULT_BODY_SCALE_RULES,
): number {
  if (!rules.enabled) return 1;
  const raw =
    typeof bodyScale === "number" && Number.isFinite(bodyScale) && bodyScale > 0 ? bodyScale : 1;
  const s = raw < rules.minScale ? rules.minScale : raw > rules.maxScale ? rules.maxScale : raw;
  const f = 1 + (s - 1) * rules.attackRangeCoefficient;
  // 見 MIN_ATTACK_RANGE_FACTOR:兩個各自合法的值(小體型 × 大係數)乘得出負數。
  return f < MIN_ATTACK_RANGE_FACTOR ? MIN_ATTACK_RANGE_FACTOR : f;
}
