/**
 * 戰鬥系統 (combat-env multipliers) — pure, node-testable logic behind the admin
 * page that tunes the GLOBAL combat-environment table.
 *
 * One multiplicative factor per combat quantity (冷卻 / 傷害 / 防禦 / …), 1.0 =
 * neutral (byte-identical legacy combat). The platform stores the table at
 * `/admin/combat-env`; the game-server snapshots it into every NEWLY CREATED
 * match — a save therefore applies **from the next match**, and matches already
 * in progress keep the table they started with (deterministic-safe dynamic
 * config: no restart, no mid-match rebalance).
 *
 * The key list is imported from the SIM (`@ggd/shared/sim/combatEnv`) rather
 * than re-declared, so a key added to the engine cannot silently go missing
 * from this page — the labels map is exhaustively typed over `CombatEnvKey`.
 *
 * Form state holds RAW STRINGS (not numbers) so a half-typed "1." or an empty
 * box is representable and can be reported as a field error instead of being
 * coerced to something the admin never asked for. Everything here is a pure
 * function over plain data; the page (ui/CombatEnvPage.tsx) is presentation only.
 */
import {
  ATTRIBUTE_COEF_MAX,
  COMBAT_ENV_KEYS,
  GOLD_FACTOR_MAX,
  GOLD_FACTOR_MIN,
  defaultForKey,
  isAttributeEnvKey,
  isGoldEnvKey,
  type CombatEnvKey,
} from "@ggd/shared/sim/combatEnv";

export { COMBAT_ENV_KEYS, defaultForKey, isAttributeEnvKey, isGoldEnvKey };
export type { CombatEnvKey };

// ------------------------------------------------------------- bounds ------

/** Neutral factor — legacy combat behaviour. */
export const NEUTRAL = 1;
/** Lower bound, mirroring combatenv.MinFactor on the platform (a 400 below it). */
export const MIN_FACTOR = 0.1;
/**
 * Upper bound, mirroring combatenv.MaxFactor on the platform (a 400 above it).
 *
 * ⚠️ 2026-08-10：10 → 50。舊的 10 在 owner 把 `manaRegen` 調到 16 的那一刻
 * 就變成一道**把操作者鎖在自己的調校頁外面**的閘：內容檔進得去（shared 的 Zod
 * 是 0..100），但後台一存檔整個 PUT 回 400，而且兩邊的界不一致**沒有任何東西會紅**。
 * 完整推導寫在 `apps/platform/internal/combatenv/combatenv.go` 的 MaxFactor，
 * ⛔ 不在這裡抄第二份。
 */
export const MAX_FACTOR = 50;
/** Numeric-input step for the table's spinners. */
export const STEP = 0.05;

/**
 * PER-KEY bounds (task #248). The eighteen ×factors keep the 0.1..10 band; the
 * eight 三圍 coefficients need a different one because their SHIPPED values are
 * 23 (力量→生命) and 15 (智慧→魔力), both outside it, and because 0 is a
 * meaningful setting for them ("switch this derivation axis off") where a 0
 * damage multiplier is not. Mirrors `combatenv.Bounds` on the platform, so a
 * value this page accepts is a value the PUT accepts.
 */
export function minFactorFor(key: CombatEnvKey): number {
  if (isGoldEnvKey(key)) return GOLD_FACTOR_MIN; // 0 = 這一類完全不發
  return isAttributeEnvKey(key) ? 0 : MIN_FACTOR;
}
export function maxFactorFor(key: CombatEnvKey): number {
  if (isGoldEnvKey(key)) return GOLD_FACTOR_MAX;
  return isAttributeEnvKey(key) ? ATTRIBUTE_COEF_MAX : MAX_FACTOR;
}

/**
 * The RESET target for one key: 1.0 for a ×factor, the WC3/design coefficient
 * for a 三圍 key. Resetting 力量→生命 to 1.0 would not be "neutral", it would
 * delete 96% of every champion's health — so 重設 has to mean "the shipped
 * value", not "1".
 */
export function neutralFor(key: CombatEnvKey): number {
  return defaultForKey(key);
}

// ---------------------------------------------------------------- doc ------

/** The combat-env document the platform GET returns. */
export interface CombatEnvDoc {
  version: number;
  updatedAt: string;
  /** ALWAYS the full table — every key present (the platform backfills). */
  multipliers: Record<CombatEnvKey, number>;
}

/** The shipped default table: every ×factor 1.0, every 三圍 coefficient its WC3 value. */
export function neutralMultipliers(): Record<CombatEnvKey, number> {
  const m = {} as Record<CombatEnvKey, number>;
  for (const k of COMBAT_ENV_KEYS) m[k] = neutralFor(k);
  return m;
}

/** A fresh, all-neutral doc — what the page shows before the GET resolves. */
export function emptyCombatEnvDoc(): CombatEnvDoc {
  return { version: 1, updatedAt: "", multipliers: neutralMultipliers() };
}

/**
 * Tolerant parser for whatever the platform returns. Accepts the bare doc or a
 * `{ combatEnv: doc }` / `{ doc: doc }` envelope; unknown keys are dropped and
 * any missing / non-finite factor falls back to the neutral 1.0, so the page
 * never dies on a partial or hand-edited response.
 */
export function normalizeCombatEnvDoc(raw: unknown): CombatEnvDoc {
  if (raw === null || typeof raw !== "object") return emptyCombatEnvDoc();
  const outer = raw as Record<string, unknown>;
  const envelope = outer["combatEnv"] ?? outer["doc"];
  const inner =
    envelope && typeof envelope === "object" ? (envelope as Record<string, unknown>) : outer;

  const rawMult = inner["multipliers"];
  const src = (rawMult && typeof rawMult === "object" ? rawMult : {}) as Record<string, unknown>;
  const multipliers = neutralMultipliers();
  for (const k of COMBAT_ENV_KEYS) {
    const v = src[k];
    if (typeof v === "number" && Number.isFinite(v)) multipliers[k] = v;
  }
  // NOTE: a missing key falls back to `neutralFor(k)`, NOT to 1.0 — a platform
  // that predates #248 serves no 三圍 coefficients, and defaulting them to 1
  // would render (and then SAVE) a table that guts every champion's health.
  return {
    version: typeof inner["version"] === "number" ? (inner["version"] as number) : 1,
    updatedAt: typeof inner["updatedAt"] === "string" ? (inner["updatedAt"] as string) : "",
    multipliers,
  };
}

// -------------------------------------------------------------- labels -----

/** zh-Hant label + a one-line note naming exactly what the factor scales. */
export interface CombatEnvLabel {
  /** 中文名稱 shown in the table's first column */
  zh: string;
  /** what the factor multiplies, in one line */
  note: string;
}

/**
 * Exhaustive zh-Hant labels — `Record<CombatEnvKey, …>` on purpose: adding a key
 * to the sim makes this map a type error until it is labelled here.
 */
export const COMBAT_ENV_LABELS: Record<CombatEnvKey, CombatEnvLabel> = {
  cooldown: { zh: "技能冷卻時間", note: "技能冷卻秒數（含 EX）。只影響技能，不影響道具。大於 1 = 冷卻更久" },
  // #189 — 獨立於上面的技能冷卻。出貨 1.0：在 #189 之前道具冷卻完全沒有被任何
  // 倍率碰過，所以 1.0 才是「維持原狀」的值，不是佔位符。
  itemCooldown: { zh: "道具冷卻時間", note: "道具被動的內部冷卻秒數。與技能冷卻互不影響。大於 1 = 冷卻更久" },
  damageDealt: { zh: "造成傷害", note: "所有傷害（減傷前），含普攻、技能、持續傷害" },
  defense: { zh: "防禦力", note: "護甲與魔法抗性" },
  attackDamage: { zh: "物理攻擊力", note: "AD" },
  abilityPower: { zh: "法術強度", note: "AP" },
  maxHealth: { zh: "生命上限", note: "最大生命值（現有百分比不變）" },
  healthRegen: { zh: "生命回復", note: "每秒回血" },
  maxMana: { zh: "魔力上限", note: "最大魔力值（現有百分比不變）" },
  manaRegen: { zh: "魔力回復", note: "每秒回魔" },
  moveSpeed: { zh: "移動速度", note: "上下限夾制前的移動速度" },
  attackSpeed: { zh: "攻擊速度", note: "上下限夾制前的攻速" },
  healing: { zh: "治療量", note: "治療效果、吸血回復與花朵回復" },
  shield: { zh: "護盾量", note: "護盾吸收值" },
  critChance: { zh: "暴擊機率", note: "夾制到 0～100% 之前" },
  critDamage: { zh: "暴擊傷害", note: "暴擊倍率" },
  lifesteal: { zh: "生命偷取", note: "普攻吸血比例（夾制前）" },
  attackRange: { zh: "攻擊距離", note: "普攻射程" },
  abilityRange: { zh: "技能範圍", note: "技能施放距離與 AoE 半徑（不含普攻）" },
  // 三圍係數 (#248) — 這八項不是倍率而是「每 1 點屬性換多少數值」，預設不是 1.0。
  // 七項是「匯入值」：原地圖自帶的 war3mapMisc.txt（[Misc] 區段）就寫了自己的
  // 常數表，並且改寫了暴雪四項；地圖沒寫的那一項才回退暴雪 MiscGame.txt。
  // 只有 智慧→法強 沒有任何上游來源，那是 owner 的設計值。
  strToMaxHealth: { zh: "力量 → 生命", note: "每 1 點力量增加的生命上限（地圖 StrHitPointBonus=23；暴雪 25）" },
  strToHealthRegen: { zh: "力量 → 回血", note: "每 1 點力量增加的每秒回血（地圖 StrRegenBonus=0.04；暴雪 0.05）" },
  strToAttackDamage: { zh: "力量 → 攻擊力", note: "每 1 點力量增加的 AD（地圖 StrAttackBonus=1.0，與暴雪相同）" },
  agiToArmor: { zh: "敏捷 → 護甲", note: "每 1 點敏捷增加的護甲（地圖 AgiDefenseBonus=0.15；暴雪 0.30）" },
  strToCritChance: {
    zh: "力量→暴擊率",
    note: "每一點力量額外增加多少**暴擊率**（0..1 的比率：0.001 = 0.1%）。owner 2026-08-22：「每一點力量 額外增加 0.1% 暴擊率」。⚠️ 它與裝備/寶具給的暴擊率**相加**，並且一起吃暴擊率上限 —— 力量堆很高的英雄會先撞到那條上限，之後每一點力量在這一格上是 0。",
  },
  agiToEvasion: {
    zh: "敏捷→迴避率",
    note: "每一點敏捷額外增加多少**迴避率**（0..1 的比率：0.0002 = 0.02%）。owner 2026-08-22：「每一點敏捷 額外增加 0.02% 迴避率」。⚠️ 迴避**只擋普攻**（`sim/combat/evasion.ts` 的 WC3 保真模型），⛔ 技能傷害不受影響 —— 所以它是對線期的耐久，不是萬用減傷。",
  },
  agiToAttackSpeed: { zh: "敏捷 → 攻速", note: "每 1 點敏捷讓攻速 +N%。⚠️ 這是九條三圍推導裡**唯一的乘法列**，所以只有它在等級外插下是指數放大的：敏捷中位 L30=70 → 2.39 倍，L99=197 → 4.95 倍。owner 2026-08-13 從暴雪預設 0.02 砍半到 **0.01**（暴雪設計它時英雄上限是 10 級，地圖 30，我們 99）。代價是低等級敏捷英雄變弱：L18 倍率 1.94→1.47。" },
  intToMaxMana: { zh: "智慧 → 魔力", note: "每 1 點智慧增加的魔力上限（地圖 IntManaBonus=15，與暴雪相同）" },
  intToManaRegen: { zh: "智慧 → 回魔", note: "每 1 點智慧增加的每秒回魔。⭐ owner 2026-08-20（GH#446）從 **0.07 調到 0.21**（×3）：「那我覺得**智慧影響回魔可以增加更多**、初始回魔也增加少許，同時 20 秒的限制可以調高到 30 秒」。量到的（71 隻裸裝，LV30/50/99）：中位滿魔從 **42.1 / 38.0 / 34.5 秒**降到 **15.8 / 14.1 / 13.2 秒**，超過 30 秒的從 **68 / 66 / 62 隻**降到 **1 / 1 / 1 隻**。⚠️ 這一格**碰不到低智力英雄**（`godie-h02k` 熊貓 INT 2、成長 0 ⇒ 逐位元是 0）—— 他們要靠「基礎加成」頁的扁平 `manaRegen`。⚠️ 原作值是 **0.07**（地圖 IntRegenBonus；暴雪 0.05），被取代的那一份記在 `docs/legacy/_w3x-fidelity-superseded.md`。⚠️ 沒有撞到屬性上限 926（撞到的仍然只有 `godie-h020` 莉娜一隻）。" },
  intToAbilityPower: { zh: "智慧 → 法強", note: "每 1 點智慧增加的 AP。⭐ owner 2026-08-21 **最終裁決 4**（沿革 1→4→6.5→10→**4**）⚠️ 中途我把它寫成 10,而 owner 的最後一則是「維持 6.5 => **調整到 4**」——⛔ 這一行寫 10 的那一版是**過期的**，與「屬性額外傷害全換成 AP 百分比」是**同一則裁決的兩半**：⚠️ 而 owner 2026-08-21 後來把技能傷害改成**乘法** `× (1 + AP × 加成率)`（出貨 0.5%）⇒ 這一格的意義從「加多少傷害」變成「**決定前期的技能強度**」：係數 4 時 LV30 倍率 1.48×、LV99 1.80×；係數 10 時是 2.18× / 2.50×，換算之後係數變成 0.3~2.5，這一格才開始有力量。⛔ 兩件事不是二選一。⚠️ 舊的理由是量到的落差：法師 99 級普攻**每秒 1,328**，而一發技能（多半 8~15 秒冷卻）中位只有 **420** —— 一發技能只等於普攻一秒的 32%。⚠️ 這一格是全域的：**121 個傷害節點**吃 AP 加成（係數中位 0.60），調它等於同時調那 121 支技能。魔獸三代沒有法強這根軸，所以這是 GGD 自己的設計值，調它不偏離原作。" },
  // #221 owner 2026-07-30。與 intToAbilityPower 一樣是 GGD 自己發明的軸,
  // 魔獸三代沒有魔抗這個概念 —— 所以這一格沒有「原作值」可以對照,只有 owner 的設計值。
  // ⚠️ 它同時是 AP 傷害的減傷來源:調高它會讓所有法系英雄一起變弱,不只是「多一點抗性」。
  intToMagicResist: { zh: "智慧 → 魔抗", note: "每 1 點智慧增加的魔法抗性,直接減免受到的 AP 傷害（owner 設計值 0.6；魔獸三代沒有這根軸）" },
  // 金錢發放倍率 (owner 2026-08-04「金錢發放有點太浮濫了」)。這五格的下限是 0
  // ——「完全不發」是刻意要能設定的，跟其他倍率的 0.1 下限不同。
  // note 一律寫「它影響什麼」，因為操作者要知道自己調的是哪一條收入。
  //
  // 打殭屍拆成兩格 (owner 同日「普通殭屍 的確也可以單獨倍率，預設改成 0.5」)：
  // 普通殭屍是整場刷幾十次的涓流，特殊殭屍與殭屍王是一次一大筆。
  goldRoundPayout: {
    zh: "回合發放金錢",
    note: "開局購物金、每回合排程發放、回合勝／負／輪空與決賽的結算金。0 = 這一類完全不發",
  },
  goldMobKill: {
    zh: "打一般殭屍發放金錢",
    note: "每隻普通殭屍的擊殺金、召喚物賞金，以及把「非英雄的屍體」變成錢的技能／道具（鍊金術之盾）。0 = 完全不發",
  },
  goldEliteKill: {
    zh: "打特殊殭屍／殭屍王發放金錢",
    note: "特殊殭屍的擊殺金（含它的獎勵倍率）與傷害分紅獎池，以及殭屍王的分紅獎池（全場最大的一筆）。0 = 完全不發",
  },
  goldHeroKill: {
    zh: "擊敗英雄發放金錢",
    note: "擊殺敵方英雄的獎勵，以及每位敵人只給一次的首殺賞金。0 = 完全不發",
  },
  goldQuest: {
    zh: "完成任務發放金錢",
    note: "守衛塔補刀獎勵等場上目標物。殭屍王不在這一格（它算特殊殭屍那一格）。0 = 完全不發",
  },
  // ── 2026-08-10 owner ×3 ────────────────────────────────────────────────────
  // 「config 加一格 moveSpeedByAttackType 預設為(近戰/遠戰) 0.8/0.6」+「加一格
  // magicResistMult 預設 0.2」。owner 那一格 moveSpeedByAttackType 落成兩列,
  // 因為這張表(以及 sim / Zod / Go 平台 / 線上 JSON)全部是扁平的 key→數字。
  //
  // ⚠️ note 必須把「缺席 = 1.0」與「出貨值」分開講。1.0 是**相容性預設**:
  // 一份寫在今天之前、沒有這三格的 config 或 overlay 必須跑出逐字相同的數字。
  // 0.8 / 0.6 / 0.2 是 owner 挑的**出貨值**,住在 content/config/combat-env.json。
  // 操作者按「重設」會回到 1.0(＝這一格不作用),不是回到 0.8 —— 說明要講清楚,
  // 否則他會以為自己按下去就是「回到出廠設定」。
  moveSpeedMelee: {
    zh: "近戰移速倍率",
    note: "只乘在近戰英雄的移速上（疊在上面那格全域移動速度之上）。它與遠程那一格的『差』決定近戰追不追得上遠程 —— 差距越大越追得上，一樣就是被風箏到死。1 = 這一格不作用（出貨值 0.8 由內容檔給）",
  },
  moveSpeedRanged: {
    zh: "遠程移速倍率",
    note: "只乘在遠程英雄的移速上（疊在全域移動速度之上）。調小 = 遠程更難拉開距離。與近戰那一格的『差』才是風箏與否的關鍵，單獨看一格沒有意義。1 = 這一格不作用（出貨值 0.6 由內容檔給）",
  },
  magicResistMult: {
    zh: "魔法抗性倍率",
    note: "魔抗再乘這個（疊在上面『防禦力』之上）。因為技能預設算魔法傷害而普攻是物理，這一格實際上在調『技能相對普攻有多痛』：調小 = 技能變強。1 = 這一格不作用（出貨值 0.2 由內容檔給）",
  },
};

/** A titled block of rows — the page renders one table section per group. */
export interface CombatEnvGroup {
  title: string;
  keys: CombatEnvKey[];
}

/**
 * Display grouping. Every key appears in EXACTLY ONE group (asserted by
 * `groupsCoverAllKeys`, unit-tested) so the page can never drop a multiplier.
 */
export const COMBAT_ENV_GROUPS: CombatEnvGroup[] = [
  {
    title: "輸出 · 傷害與技能",
    keys: ["damageDealt", "cooldown", "itemCooldown", "attackDamage", "abilityPower", "abilityRange"],
  },
  {
    // magicResistMult 排在 defense 後面,因為它是**疊在 defense 之上**的第二格,
    // 不是替代品 —— 分開放會讓操作者以為兩格互斥。
    title: "生存 · 防禦與回復",
    keys: ["maxHealth", "healthRegen", "defense", "magicResistMult", "shield", "healing", "lifesteal"],
  },
  {
    // 近戰／遠程兩格緊跟在全域 moveSpeed 後面:三格是同一條乘法鏈,
    // 而且那兩格要**並排比較**才看得出「差多少」（風箏就是那個差）。
    title: "機動 · 位移與攻擊",
    keys: ["moveSpeed", "moveSpeedMelee", "moveSpeedRanged", "attackSpeed", "attackRange"],
  },
  { title: "暴擊", keys: ["critChance", "critDamage"] },
  { title: "資源 · 魔力", keys: ["maxMana", "manaRegen"] },
  {
    // owner 2026-08-04「金錢發放有點太浮濫了」。自己一組,因為它們不影響戰鬥
    // 數值,只影響經濟 —— 混進上面任何一組都會讓操作者以為調它會動到戰力。
    title: "經濟 · 金錢發放倍率",
    keys: ["goldRoundPayout", "goldMobKill", "goldEliteKill", "goldHeroKill", "goldQuest"],
  },
  {
    // #248: 三圍派生係數。放在最後，因為它們作用在其他倍率「之前」——
    // 先由三圍算出英雄的基礎值，再乘上上面那些倍率。
    title: "三圍派生 · 力量／敏捷／智慧",
    keys: [
      "strToMaxHealth",
      "strToHealthRegen",
      "strToAttackDamage",
      "agiToArmor",
      "agiToAttackSpeed",
      // owner 2026-08-22 —— 兩條**新的**屬性軸（力量→暴擊率 · 敏捷→迴避率）。
      "strToCritChance",
      "agiToEvasion",
      "intToMaxMana",
      "intToManaRegen",
      "intToAbilityPower",
      "intToMagicResist",
    ],
  },
];

/** True when the display groups partition the sim's key list exactly. */
export function groupsCoverAllKeys(): boolean {
  const seen = COMBAT_ENV_GROUPS.flatMap((g) => g.keys);
  return (
    seen.length === COMBAT_ENV_KEYS.length &&
    new Set(seen).size === COMBAT_ENV_KEYS.length &&
    COMBAT_ENV_KEYS.every((k) => seen.includes(k))
  );
}

// ---------------------------------------------------------------- form -----

/** Editable form state: one raw input string per key. */
export type CombatEnvForm = Record<CombatEnvKey, string>;

/** Render a factor for an input box: 1 → "1", 1.05 → "1.05" (no trailing zeros). */
export function formatFactor(n: number): string {
  if (!Number.isFinite(n)) return String(NEUTRAL);
  return String(Number(n.toFixed(4)));
}

/** Seed the form from a loaded doc. */
export function formFromDoc(doc: CombatEnvDoc): CombatEnvForm {
  const form = {} as CombatEnvForm;
  for (const k of COMBAT_ENV_KEYS) form[k] = formatFactor(doc.multipliers[k] ?? neutralFor(k));
  return form;
}

/** The shipped-default form (the 全部重設 target). */
export function neutralForm(): CombatEnvForm {
  const form = {} as CombatEnvForm;
  for (const k of COMBAT_ENV_KEYS) form[k] = formatFactor(neutralFor(k));
  return form;
}

/** Set one field (returns a new form — the page holds it in useState). */
export function setField(form: CombatEnvForm, key: CombatEnvKey, value: string): CombatEnvForm {
  return { ...form, [key]: value };
}

/** Per-row 重設: put a single key back to its shipped default. */
export function resetField(form: CombatEnvForm, key: CombatEnvKey): CombatEnvForm {
  return { ...form, [key]: formatFactor(neutralFor(key)) };
}

/** Global 全部重設: every key back to its shipped default. */
export function resetAll(): CombatEnvForm {
  return neutralForm();
}

/** Nudge a field by ±STEP, clamped into that key's own [min, max]. */
export function stepField(form: CombatEnvForm, key: CombatEnvKey, delta: number): CombatEnvForm {
  const cur = parseFactor(form[key]);
  const base = cur === null ? neutralFor(key) : cur;
  const next = Math.min(maxFactorFor(key), Math.max(minFactorFor(key), base + delta));
  return { ...form, [key]: formatFactor(next) };
}

// ---------------------------------------------------------- validation -----

/** Parse an input box: null when it is not a finite number. */
export function parseFactor(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Field-level validation, mirroring the platform's PUT bounds so a bad value is
 * caught before the round-trip. Returns a zh-Hant message or "" when valid.
 */
export function validateFactor(text: string, key?: CombatEnvKey): string {
  const min = key === undefined ? MIN_FACTOR : minFactorFor(key);
  const max = key === undefined ? MAX_FACTOR : maxFactorFor(key);
  const attr = key !== undefined && isAttributeEnvKey(key);
  const t = text.trim();
  if (t === "") return attr ? "請輸入係數" : "請輸入倍率（1 = 預設）";
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  if (n < min || n > max) return `${attr ? "係數" : "倍率"}必須介於 ${min} 與 ${max} 之間`;
  return "";
}

export type CombatEnvErrors = Partial<Record<CombatEnvKey, string>>;

/** Validate every field; only failing keys appear in the result. */
export function validateForm(form: CombatEnvForm): CombatEnvErrors {
  const errs: CombatEnvErrors = {};
  for (const k of COMBAT_ENV_KEYS) {
    const e = validateFactor(form[k], k);
    if (e) errs[k] = e;
  }
  return errs;
}

/** True when nothing blocks the Save button. */
export function formValid(form: CombatEnvForm): boolean {
  return Object.keys(validateForm(form)).length === 0;
}

// ------------------------------------------------------------- summary -----

/** Keys whose (valid) value differs from the saved doc — the unsaved edits. */
export function changedKeys(form: CombatEnvForm, doc: CombatEnvDoc): CombatEnvKey[] {
  return COMBAT_ENV_KEYS.filter((k) => {
    const n = parseFactor(form[k]);
    if (n === null) return true; // an empty/garbage box IS an edit (and an error)
    return n !== (doc.multipliers[k] ?? neutralFor(k));
  });
}

/** True when the form has edits the server has not stored yet. */
export function isDirty(form: CombatEnvForm, doc: CombatEnvDoc): boolean {
  return changedKeys(form, doc).length > 0;
}

/**
 * Keys tuned away from their SHIPPED DEFAULT (drives the "N 項已調整" badge).
 * Not "away from 1.0": the 三圍 coefficients ship at 23 / 15 / 0.04 …, so
 * comparing them to 1 would report eight permanent phantom edits.
 */
export function nonNeutralKeys(form: CombatEnvForm): CombatEnvKey[] {
  return COMBAT_ENV_KEYS.filter((k) => {
    const n = parseFactor(form[k]);
    return n !== null && n !== neutralFor(k);
  });
}

/** Same, over a saved doc (the badge after a reload). */
export function nonNeutralDocKeys(doc: CombatEnvDoc): CombatEnvKey[] {
  return COMBAT_ENV_KEYS.filter((k) => (doc.multipliers[k] ?? neutralFor(k)) !== neutralFor(k));
}

// ---------------------------------------------------------------- save -----

/** The PUT body: ALWAYS the complete table (PUT-replace semantics). */
export interface CombatEnvSave {
  multipliers: Record<CombatEnvKey, number>;
}

/**
 * Build the save payload. The platform treats the body as the complete desired
 * state (an omitted key resets to the content-authored value), so we always send
 * all keys explicitly — what the admin sees in the table is exactly what gets
 * stored. Invalid fields fall back to that key's shipped default, but the page
 * gates Save on `formValid` so that branch is only a safety net.
 */
export function toSavePayload(form: CombatEnvForm): CombatEnvSave {
  const multipliers = {} as Record<CombatEnvKey, number>;
  for (const k of COMBAT_ENV_KEYS) {
    const n = parseFactor(form[k]);
    multipliers[k] = n === null ? neutralFor(k) : n;
  }
  return { multipliers };
}

/**
 * The note the page must show next to Save. Kept here (not inlined in JSX) so
 * the wording is asserted by a unit test — this is the one thing an operator
 * MUST understand before saving.
 */
export const APPLY_NOTE = "儲存後下一場對戰生效（進行中對戰不受影響）";

/** zh-Hant text for a failed save, surfacing the platform's 400 message. */
export function saveErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `儲存失敗：${msg}`;
}

/** zh-Hant text for a failed load. */
export function loadErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `讀取戰鬥系統設定失敗：${msg}`;
}
