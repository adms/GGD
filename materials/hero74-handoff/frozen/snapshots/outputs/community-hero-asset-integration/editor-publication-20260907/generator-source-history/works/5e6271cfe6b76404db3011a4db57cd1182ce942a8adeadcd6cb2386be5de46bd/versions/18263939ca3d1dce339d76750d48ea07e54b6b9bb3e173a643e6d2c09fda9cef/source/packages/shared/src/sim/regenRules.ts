/**
 * 百分比回血 **與百分比扣血** 規則 (GH#253).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ owner 2026-08-02 更正:「Berserker 是每秒**損失** 1%生命, 直到生命不足1%」
 * ════════════════════════════════════════════════════════════════════════════
 * 這是**規格更正**,不是 bug。8/1 那句「Berserker HP 回血 1%每秒,沒有保底」被
 * 做成了 {@link RegenRules.pctEnabled} 那一族 + 英雄卡的 `healthRegenPctOfMax`;
 * 8/2 的方向相反,而且多了一條這個機制原本沒有的**地板**。
 *
 * 「負的回血」**沒有**做成 `healthRegenPctOfMax` 允許負值,理由是 grep 出來的三個
 * 具體破口 —— 這條路上有三個地方會把負數靜默吃掉或誤讀:
 *   1. {@link healthRegenPerSec} 的 `inp.pctOfMax > 0` 閘 —— 負值當作「沒填」;
 *   2. 同一支的 `return out > 0 ? out : 0` —— 收尾把負數夾成 0;
 *   3. {@link RegenRules.floorPerSec}(每秒至少回幾點)和「每秒扣幾點」是**同一
 *      條數軸的兩端**。操作者為了別的英雄打開保底,就會把 Berserker 的自傷整個
 *      抵銷掉,而畫面上只是「他好像不會掉血了」。
 * 再加上 `RegenSystem` 那一行 `hp.hp = Math.min(maxHp, hp.hp + perSec*dt)` 根本
 * **沒有下界**:一個負的 perSec 會一路穿過 0 變成負血,而 `alive` 是傷害管線設的,
 * 不是這裡 —— 結果會是一個「−4000 血但還活著」的單位。
 * 所以扣血是**獨立的一格** `healthDrainPctOfMax` + 獨立的地板,見下半段。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 動手之前的事實:回血一直是**固定值**,而且沒有任何一層有保底
 * ════════════════════════════════════════════════════════════════════════════
 * `systems/RegenSystem.ts` 一直只做一件事:
 *
 *     hp.hp += sc.final[Stat.HealthRegen] * world.dt
 *
 * `Stat.HealthRegen` 是一條純粹的**點數/秒**:英雄卡的 `baseStats.healthRegen`
 * ＋ `growth.healthRegen × (等級−1)` ＋ 力量 × `strToHealthRegen`,再乘
 * `combatEnv.healthRegen`。整條路上沒有任何一項讀 `maxHp`,所以
 * **「每秒回最大生命的 1%」在此之前是表達不出來的** —— 它不是被設錯的數字,
 * 是一個不存在的機制。
 *
 * 「保底」也查過了,三個可能的位置都是空的:
 *   · `content/config/base-bonus.json` 只有 `maxHealth: 650`,沒有 healthRegen;
 *   · `STAT_CLAMPS` 沒有 `HealthRegen` 這一列(所以 `finalizeStat` 的下界是 −∞);
 *   · `statCaps` 的 `HealthRegen` 是**上**界 10000,不是下界。
 * 也就是說 owner 擔心的「至少回 N 點」目前不存在於任何一層 —— 唯一會表現得像
 * 保底的是**固定值那一項本身**:百分比若是「疊加」在固定值上,那條固定值就是
 * 一條與最大生命無關的地板。所以 {@link RegenRules.pctMode} 的出貨值是
 * `replace`,而不是 `add`。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 每一格都是欄位(第一守則),出貨值取 owner 明說的那一個
 * ════════════════════════════════════════════════════════════════════════════
 * PURITY: 純資料 + 純函式。沒有 `Math.random` / `Date.now` / 三角函式 / `**`,
 * 沒有 Map/Set 迭代。
 */

/** 百分比回血與英雄卡上那條固定回血的關係。 */
export type RegenPctMode = "replace" | "add";

/** 後台下拉選單的選項來源;也是 `normalizeRegenRules` 的合法值清單。 */
export const REGEN_PCT_MODES: readonly RegenPctMode[] = Object.freeze(["replace", "add"]);

/**
 * 扣血打到地板那一刻**做什麼**。這兩個在「同時被敵人打」的時候完全不同,
 * 所以它是一格下拉選單而不是一個註解裡的決定。
 *
 * · `stop`(出貨值)—— 扣血這一項在地板之上停手,**它自己不會再往下扣一點**,
 *   但它也**不會把血條往上拉**。敵人照樣可以把他從地板以下打死。這是 owner 要的
 *   那一個:「每秒損失 1% 生命」是**自傷**,不是無敵。
 * · `clamp` —— 每一 tick 把血條夾在地板上。被敵人打到地板以下的人會被這條夾值
 *   **補回**地板 = 免疫致死。做成選項是因為「殺不死的試煉怪」是一個合理的設計,
 *   但它不是這一次的裁決。
 */
export type DrainFloorMode = "stop" | "clamp";

/** 後台下拉選單的選項來源;也是 `normalizeRegenRules` 的合法值清單。 */
export const DRAIN_FLOOR_MODES: readonly DrainFloorMode[] = Object.freeze(["stop", "clamp"]);

export interface RegenRules {
  /**
   * 百分比回血的總開關。關 = 英雄卡上的 `healthRegenPctOfMax` 全部當作沒填,
   * 逐位元等同這個機制出現之前的 sim。
   */
  pctEnabled: boolean;
  /**
   * `replace` = 有填百分比的英雄,他的固定回血**不再計算**,每秒只回
   * 「最大生命 × 百分比」(出貨值 = owner 的「沒有保底」)。
   * `add`     = 百分比疊在固定回血上 —— 這等於給了一條與最大生命無關的地板,
   *             也就是 owner 說的那種保底,所以它不是出貨值。
   */
  pctMode: RegenPctMode;
  /**
   * 保底:每秒至少回這麼多點。**出貨 0 = 沒有保底**(owner 的裁決)。
   * 它獨立於 {@link pctEnabled} —— 一位沒填百分比的英雄也吃得到這條地板。
   */
  floorPerSec: number;
  /**
   * 百分比那一項要不要吃 `combatEnv.healthRegen` 這個全域倍率。
   * 開(出貨值)= 後台那一格仍然是「全遊戲回血快慢」的總閥;
   * 關 = 百分比是一個不受全域調節影響的角色設定。
   */
  applyEnvMultiplier: boolean;
  /**
   * 百分比回血只給**英雄**(有 ChampionComp 的單位),不給小怪與召喚物。
   * 開 = 出貨值。關掉之後,一隻臉是 Berserker 的隨機英雄殭屍王也會每秒回 1%
   * 最大生命 —— 那是一個決定,不是一個副作用,所以它是一格開關而不是註解。
   */
  championsOnly: boolean;

  // ── 百分比扣血 (owner 2026-08-02「Berserker 是每秒損失 1%生命, 直到生命不足1%」) ──

  /**
   * 百分比扣血的總開關。關 = 英雄卡上的 `healthDrainPctOfMax` 全部當作沒填,
   * 逐位元等同這個機制出現之前的 sim。線上發現扣血把某位英雄玩壞時,這一格是止血閥。
   */
  drainEnabled: boolean;
  /**
   * 扣血停在哪裡:**最大生命的**這個比例。出貨 `0.01` = owner 的「直到生命不足 1%」。
   * owner 講的是百分比不是點數,所以這一格的單位是比例 —— 一個 90,000 血的
   * Berserker 停在 900,一個 100 血的身體停在 1。
   *
   * ⚠️ 填 0 **不會**讓扣血變成扣得死人。這條路不經過傷害管線,沒有任何一層會把
   * `alive` 設成 false,停在 0 只會產生一具「0 血還活著」的單位。所以實作把有效
   * 地板夾在 {@link MIN_ALIVE_HP} 之上 —— 要真的扣死人,用的是天生技的真實傷害
   * (它走傷害管線、會結算擊倒),不是這一格。
   */
  drainFloorPctOfMax: number;
  /** 打到地板那一刻停手還是夾住 —— 語意與裁決寫在 {@link DrainFloorMode}。 */
  drainFloorMode: DrainFloorMode;
  /**
   * 百分比扣血只給**英雄**。開 = 出貨值。關掉之後,一隻臉是 Berserker 的隨機
   * 英雄殭屍王也會每秒自己掉 1% 最大生命 —— 那等於一堵會自己倒的牆,是一個決定
   * 不是副作用。
   */
  drainChampionsOnly: boolean;
}

/**
 * 出貨值。
 *
 * ⚠️ 兩個機制都是「英雄卡有填才啟動」:
 *   · 百分比**回血** —— 出貨內容裡**沒有任何一位**填 `healthRegenPctOfMax`
 *     (2026-08-02 之前是 `godie-hapm` 的 0.01,那一格已經翻成扣血了)。所以
 *     `pctEnabled` / `pctMode` / `floorPerSec` 這一族目前對每一場比賽都是 no-op,
 *     機制留著是因為它是可調的能力,不是因為有人在用。
 *   · 百分比**扣血** —— ⚠️ **2026-08-08 起也是零使用者**。`godie-hapm`
 *     (海克力斯 - Berserker)曾經是唯一的填寫者,但 owner 那天把 52-00
 *     【十二道試煉】整支重製成標記機制(`sim/marks.ts`),那一格因此歸零。
 *     `drainFloorPctOfMax: 0.01`(owner 的「直到生命不足 1%」)仍然是出貨值,
 *     只是現在沒有人踩得到它。
 *
 * ⚠️ 所以**兩個機制目前都是 no-op**,而那是一個事實不是缺陷 —— 它們是可調的
 * 能力,留著等下一個要用的內容。守衛在 `sim/healthPctDrain.test.ts`:機制本身
 * 用合成英雄驅動(所以零使用者不會讓它變成 vacuous),另有一條**反向**守衛掃
 * 全部英雄卡,有人重新開始用就會紅 —— 那時候該把機制守衛接回真實內容
 * (失敗形態⑤:被測的不是出貨的那個)。
 *
 * ⚠️ 這段文字在 2026-08-08 之前寫的是「出貨只有 godie-hapm 填了 0.01」,而卡片
 * 上其實是 **0.012** —— 一句沒有守衛的散文連它引用的數字都會漂(第三守則)。
 * 現在這裡不再抄任何數字。
 */
export const DEFAULT_REGEN_RULES: RegenRules = Object.freeze({
  pctEnabled: true,
  pctMode: "replace" as RegenPctMode,
  floorPerSec: 0,
  applyEnvMultiplier: true,
  championsOnly: true,
  drainEnabled: true,
  drainFloorPctOfMax: 0.01,
  drainFloorMode: "stop" as DrainFloorMode,
  drainChampionsOnly: true,
});

/** 文件的 schema 字串 —— sim 與後台 overlay 共用這一個常數。 */
export const REGEN_SCHEMA = "config.regen@1";
/** 文件 id(`config` collection 裡的 `regen`)。 */
export const REGEN_DOC_ID = "regen";

/**
 * 每秒保底的上界。1000 點/秒對照:出貨 Berserker 一級最大生命約 7.5k,1% 是
 * 75/秒,所以 1000 已經是「這條地板本身就能撐住一場」。再高只可能是把
 * 「最大生命」貼進了「每秒」那一格。
 */
export const REGEN_FLOOR_MAX = 1000;

/**
 * 英雄卡 `healthRegenPctOfMax` 的上界 = 0.5(每秒回滿血的一半)。
 *
 * 它擋的是一個很具體的手誤:owner 要的是「1%」,而 1% 在這裡寫成 `0.01`。
 * 直接把 `1` 填進去(以為單位是百分比)會變成**每秒回滿血**,而畫面上看起來
 * 只是「這個角色打不死」。0.5 > 任何實際會用到的設計值,又剛好把 `1` 擋在外面。
 */
export const REGEN_PCT_MAX = 0.5;

/**
 * 英雄卡 `healthDrainPctOfMax` 的上界 = 0.5(每秒扣掉半條命)。
 * 和 {@link REGEN_PCT_MAX} 同一個理由、同一個手誤:owner 要的「1%」寫成 `0.01`,
 * 直接填 `1` 會變成**每秒扣光滿血**,而在畫面上只是「這個角色一開場就倒」。
 */
export const DRAIN_PCT_MAX = 0.5;

/**
 * `drainFloorPctOfMax` 的上界 = 0.5。地板高於一半血量的話,扣血在絕大多數的
 * 局面裡一點事都不會發生 —— 那不是一個會被用到的設計值,而是一個「把百分比
 * 貼錯格」的形狀。
 */
export const DRAIN_FLOOR_PCT_MAX = 0.5;

/**
 * 扣血能把血條壓到的最低點(點數)。
 *
 * 這**不是**平衡數字,是一條完整性不變量:扣血不經過 `combat/damage.ts`,所以
 * 沒有任何一層會把 `alive` 設成 false。停在 0 會生出一個「0 血還活著」的單位,
 * 而那種單位在回合結算(`teamAliveInZone`)裡是活的 —— 一場永遠結束不了的比賽。
 * 所以就算操作者把 `drainFloorPctOfMax` 填 0,有效地板仍然是 1 點。
 */
export const MIN_ALIVE_HP = 1;

function isPctMode(v: unknown): v is RegenPctMode {
  // 逐一比對而不是 `includes`:`readonly T[]` 的 `includes(unknown)` 在 TS 下要
  // 先斷言,而斷言正是讓一個打錯的字串溜進 sim 的那一步(同 blockRules)。
  return v === "replace" || v === "add";
}

function isDrainFloorMode(v: unknown): v is DrainFloorMode {
  return v === "stop" || v === "clamp";
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** 夾進 `[0, max]`;認不得的值退回 `fallback`。 */
function num01(v: unknown, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  return v > max ? max : v;
}

/**
 * 正規化操作者/文件給的值。認不得 / 超界 → 夾回合法區間或退回出貨值,
 * **不 throw、不留 undefined**:一個 undefined 的 `pctMode` 會讓
 * {@link healthRegenPerSec} 兩條分支都不走,而那個結果是**全場沒有人回血**。
 */
export function normalizeRegenRules(raw: unknown): RegenRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const floorRaw = r.floorPerSec;
  const floor =
    typeof floorRaw === "number" && Number.isFinite(floorRaw)
      ? floorRaw < 0
        ? 0
        : floorRaw > REGEN_FLOOR_MAX
          ? REGEN_FLOOR_MAX
          : floorRaw
      : DEFAULT_REGEN_RULES.floorPerSec;
  return Object.freeze({
    pctEnabled: bool(r.pctEnabled, DEFAULT_REGEN_RULES.pctEnabled),
    pctMode: isPctMode(r.pctMode) ? r.pctMode : DEFAULT_REGEN_RULES.pctMode,
    floorPerSec: floor,
    applyEnvMultiplier: bool(r.applyEnvMultiplier, DEFAULT_REGEN_RULES.applyEnvMultiplier),
    championsOnly: bool(r.championsOnly, DEFAULT_REGEN_RULES.championsOnly),
    drainEnabled: bool(r.drainEnabled, DEFAULT_REGEN_RULES.drainEnabled),
    drainFloorPctOfMax: num01(
      r.drainFloorPctOfMax,
      DRAIN_FLOOR_PCT_MAX,
      DEFAULT_REGEN_RULES.drainFloorPctOfMax,
    ),
    drainFloorMode: isDrainFloorMode(r.drainFloorMode)
      ? r.drainFloorMode
      : DEFAULT_REGEN_RULES.drainFloorMode,
    drainChampionsOnly: bool(r.drainChampionsOnly, DEFAULT_REGEN_RULES.drainChampionsOnly),
  });
}

/**
 * 讀一份 `config.regen@1` 文件。沒有文件 / schema 不對 → 出貨預設。
 */
export function regenRulesFromDoc(doc: unknown): RegenRules {
  if (!doc || typeof doc !== "object") return DEFAULT_REGEN_RULES;
  const d = doc as { schema?: unknown };
  if (d.schema !== REGEN_SCHEMA) return DEFAULT_REGEN_RULES;
  return normalizeRegenRules(d);
}

/** {@link healthRegenPerSec} 的輸入 —— 全部是呼叫端已經算好的數字。 */
export interface HealthRegenInputs {
  /** `sc.final[Stat.HealthRegen]` —— 已經過 env / 基礎加成 / clamp 的固定值。 */
  flatPerSec: number;
  /** 這個單位當下的最大生命(`hp.maxHp`,也就是玩家血條的分母)。 */
  maxHp: number;
  /** 英雄卡的 `healthRegenPctOfMax`;缺 = 這位沒有百分比回血。 */
  pctOfMax: number | undefined;
  /** `combatEnv.healthRegen` —— 只有 `applyEnvMultiplier` 開著才會被用到。 */
  envHealthRegen: number;
  /** 這個單位有沒有 ChampionComp(`championsOnly` 用)。 */
  isChampion: boolean;
}

/**
 * 這個單位這一秒實際回多少點血。**這是唯一一份順序**,`RegenSystem` 與任何
 * 顯示面板都必須走它 —— 面板自己乘一次的話,#125 又會多一個破口。
 *
 * 順序:百分比(取代或疊加)→ 保底 → 不可為負。
 */
export function healthRegenPerSec(inp: HealthRegenInputs, rules: RegenRules): number {
  const pct =
    rules.pctEnabled &&
    typeof inp.pctOfMax === "number" &&
    Number.isFinite(inp.pctOfMax) &&
    inp.pctOfMax > 0 &&
    (!rules.championsOnly || inp.isChampion)
      ? inp.pctOfMax
      : 0;

  let out = inp.flatPerSec;
  if (pct > 0) {
    const envK =
      rules.applyEnvMultiplier && Number.isFinite(inp.envHealthRegen) ? inp.envHealthRegen : 1;
    const fromPct = Math.max(0, inp.maxHp) * pct * envK;
    out = rules.pctMode === "replace" ? fromPct : inp.flatPerSec + fromPct;
  }

  if (out < rules.floorPerSec) out = rules.floorPerSec;
  return out > 0 ? out : 0;
}

// ──────────────────────────────────────────────────────────── 百分比扣血 ────

/** {@link healthDrainPerSec} 的輸入 —— 全部是呼叫端已經拿到的數字。 */
export interface HealthDrainInputs {
  /** 這個單位當下的最大生命(`hp.maxHp`)。扣的是**最大**生命的百分比。 */
  maxHp: number;
  /** 英雄卡的 `healthDrainPctOfMax`;缺 = 這位沒有自傷。 */
  pctOfMax: number | undefined;
  /** 這個單位有沒有 ChampionComp(`drainChampionsOnly` 用)。 */
  isChampion: boolean;
}

/**
 * 這個單位這一秒**掉**多少點血。回傳恆為 ≥ 0 的「扣掉的點數」——
 * 刻意不回傳負數,因為一個帶號的數字正是這整條路上最容易被下游 `> 0` 誤讀的
 * 形狀(檔頭那三個破口)。
 *
 * ⚠️ **不吃 `combatEnv.healthRegen`。** 那一格在後台叫「生命回復」,語意是
 * 「全遊戲回血快慢」;把它乘在自傷上會反過來 —— 操作者把回血調快,Berserker 反而
 * 死得更快。也**不吃 `combatEnv.damageDealt`:這條路不是傷害**,它不經過
 * `combat/damage.ts`,所以不會被護盾吸、不會被格擋、不會噴傷害數字、不會算進
 * 任何人的輸出統計。owner 說的是「損失 1%」,那就要真的是 1%。
 */
export function healthDrainPerSec(inp: HealthDrainInputs, rules: RegenRules): number {
  if (!rules.drainEnabled) return 0;
  if (rules.drainChampionsOnly && !inp.isChampion) return 0;
  const pct = inp.pctOfMax;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct <= 0) return 0;
  const maxHp = Number.isFinite(inp.maxHp) && inp.maxHp > 0 ? inp.maxHp : 0;
  return maxHp * pct;
}

/**
 * 扣血實際停在哪一點(點數)。= `maxHp × drainFloorPctOfMax`,但不低於
 * {@link MIN_ALIVE_HP} —— 理由寫在那個常數上(0 血還活著的單位會讓回合永遠結束不了)。
 */
export function drainFloorHp(maxHp: number, rules: RegenRules): number {
  const m = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 0;
  const byPct = m * rules.drainFloorPctOfMax;
  return byPct > MIN_ALIVE_HP ? byPct : MIN_ALIVE_HP;
}

/**
 * 把這一 tick 的扣血套在血條上,回傳新的血量。**地板語意的唯一一份**。
 *
 * `stop`(出貨):扣血最多把血條**帶到**地板,不會越過,而且**永遠不會把血條往上
 * 拉** —— 所以一個被敵人打到地板以下的 Berserker 照樣會被下一發打死。這就是
 * 「自傷不是無敵」。
 *
 * `clamp`:每 tick 把血條夾在地板上。被打到地板以下的人會被**補回**地板 =
 * 免疫致死。它是一個合理但不同的設計,所以是選項不是行為。
 */
export function applyHealthDrain(
  currentHp: number,
  maxHp: number,
  drainPoints: number,
  rules: RegenRules,
): number {
  const floor = drainFloorHp(maxHp, rules);
  if (rules.drainFloorMode === "clamp") {
    // 夾住:即使 `drainPoints` 是 0,被打到地板以下的人也會被拉回來 —— 那正是
    // 這個模式的意思,不是一個順手的副作用。
    const next = currentHp - (Number.isFinite(drainPoints) && drainPoints > 0 ? drainPoints : 0);
    return next > floor ? next : floor;
  }
  // stop —— 只往下,而且只到地板為止。
  if (!(Number.isFinite(drainPoints) && drainPoints > 0)) return currentHp;
  const room = currentHp - floor;
  if (!(room > 0)) return currentHp;
  return currentHp - (drainPoints < room ? drainPoints : room);
}
