/**
 * 新英雄轉生設計 —— **從定位生成一張卡**，而不是從一張卡推定位。
 *
 * owner 2026-08-12 更正了我原本寫反的順序：
 *
 * > 「應該**先寫英雄名稱與說明，選出身及定位**來**自動生成三圍及成長與其他屬性**，
 * >  看要不要手動輸入數值客製調整後，**判斷警告阻攔**，再來選技能組合，再來上架」
 *
 * ⭐ 這一句把資料流整個倒過來。今天的 `originOf()` / `archetypeOf()` 是**推導**
 * （三圍 → 出身），這個檔案做的是**反向**（出身 → 三圍）。
 *
 * ⚠️ 而且兩者必須**自洽**：生出來的三圍餵回 `originOf()` 必須得到同一個出身。
 * ⛔ 不可以用「在英雄卡上加一個 origin 欄位硬寫」來繞過 —— 那會做出一張
 * 「標著坦克、但三圍算起來是鬥士」的卡，而下游每一個讀推導的地方都會不同意它，
 * 沒有任何一處會報錯（第二守則的失敗形態②）。
 *
 * ⛔ 這個檔案**不碰引擎**：它產出的是一份 champion 文件草稿，之後仍然走
 * `registerAll` → `resolveChampionStats` 那條唯一的路。
 */
import {
  ORIGINS,
  ORIGIN_TO_ARCHETYPE,
  MIXED_RATIO,
  DEFAULT_STAT_NORMALIZATION,
  originOf,
  archetypeOf,
  type Origin,
  type Archetype,
} from "./statNormalization";

/** 三圍的一組值（初始 + 每級成長）。 */
export interface AttributeSet {
  str: number;
  agi: number;
  int: number;
  strGrowth: number;
  agiGrowth: number;
  intGrowth: number;
}

/**
 * 每個出身的三圍配方 —— `[主, 次, 末]` 的**相對權重**，之後乘上總量。
 *
 * ⭐ 純血用 `1 : 0.60 : 0.45`：主/次 = 1.67 遠大於門檻 1.20，所以絕不會被
 * 誤判成混血；混血用 `1 : 0.92 : 0.50`：主/次 = 1.087 < 1.20 落在混血區，
 * 而主/末 = 2.0 > 1.20 所以不會掉進「均衡」。
 * ⚠️ 均衡用 `1 : 0.95 : 0.92`：主/末 = 1.087 < 1.20，三者都在門檻內。
 *
 * ⛔ 這三組數字不是美感，是**讓 `originOf()` 一定回到同一格**的約束。
 * 守衛 `heroForge.test.ts` 對十個出身逐一往返驗證。
 */
const PURE_MIX = [1, 0.6, 0.45] as const;
const MIXED_MIX = [1, 0.92, 0.5] as const;
const EVEN_MIX = [1, 0.95, 0.92] as const;

/** 出身 → `[主, 次, 末]` 分別是哪一個三圍。 */
const ORIGIN_ATTR_ORDER: Readonly<Record<Origin, readonly ["str" | "agi" | "int", "str" | "agi" | "int", "str" | "agi" | "int"]>> =
  Object.freeze({
    坦克: ["str", "agi", "int"],
    砲手: ["str", "int", "agi"],
    鬥士: ["agi", "str", "int"],
    射手: ["agi", "int", "str"],
    法鬥: ["int", "str", "agi"],
    法師: ["int", "agi", "str"],
    狂戰: ["str", "agi", "int"], // 力量 × 敏捷
    硬輔: ["str", "int", "agi"], // 力量 × 智慧
    法刺: ["agi", "int", "str"], // 敏捷 × 智慧
    軟輔: ["str", "agi", "int"],
  });

const MIX_OF: Readonly<Record<Origin, readonly [number, number, number]>> = Object.freeze({
  坦克: PURE_MIX, 砲手: PURE_MIX, 鬥士: PURE_MIX,
  射手: PURE_MIX, 法鬥: PURE_MIX, 法師: PURE_MIX,
  狂戰: MIXED_MIX, 硬輔: MIXED_MIX, 法刺: MIXED_MIX,
  軟輔: EVEN_MIX,
});

/** 出身 → 近戰還是遠程。⚠️ 混血與均衡沒有內建的攻擊型態，作者要自己選。 */
export const ORIGIN_ATTACK_TYPE: Readonly<Record<Origin, "melee" | "ranged" | null>> = Object.freeze({
  坦克: "melee", 砲手: "ranged", 鬥士: "melee", 射手: "ranged",
  法鬥: "melee", 法師: "ranged",
  狂戰: null, 硬輔: null, 法刺: null, 軟輔: null,
});

/**
 * 三圍的總量錨點 —— 量出來的（73 位可達英雄的中位數）。
 *
 * ⛔ 這四個數字是**起點不是規定**：作者可以在後台直接改。它們存在的意義是
 * 「新卡預設落在群體中間」，不是「新卡必須長這樣」。
 */
export const ATTR_TOTAL_INITIAL = 60;
export const ATTR_TOTAL_GROWTH = 5.7;

/** 依出身生成一組自洽的三圍。 */
export function attributesForOrigin(
  origin: Origin,
  opts: { totalInitial?: number; totalGrowth?: number } = {},
): AttributeSet {
  const order = ORIGIN_ATTR_ORDER[origin];
  const mix = MIX_OF[origin];
  const sum = mix[0] + mix[1] + mix[2];
  const ti = opts.totalInitial ?? ATTR_TOTAL_INITIAL;
  const tg = opts.totalGrowth ?? ATTR_TOTAL_GROWTH;
  const out: AttributeSet = { str: 0, agi: 0, int: 0, strGrowth: 0, agiGrowth: 0, intGrowth: 0 };
  order.forEach((key, i) => {
    const w = mix[i]! / sum;
    // ⚠️ 初始值取整（英雄卡上的三圍是整數），成長留兩位。
    out[key] = Math.round(ti * w);
    out[`${key}Growth` as "strGrowth" | "agiGrowth" | "intGrowth"] = Number((tg * w).toFixed(2));
  });
  return out;
}

/** 這一張卡草稿。⚠️ ⛔ **不含 ms / mr / armor** —— 那三項由正規化填。 */
export interface ChampionDraft {
  id: string;
  schema: "champion@1";
  name: string;
  description: string;
  role: string;
  attackType: "melee" | "ranged";
  modelKey: string;
  archetype: Archetype;
  attributes: AttributeSet & { primary: "STR" | "AGI" | "INT"; source: "authored" };
  baseStats: Record<string, number>;
  growth: Record<string, number>;
}

/**
 * 其餘八項的預設值 —— 由**同定位的中位數**餵進來，⛔ 不寫死在程式裡。
 *
 * ⚠️ 呼叫端要傳 `medians`（來自 `docs/hero-archetypes.json` 或即時算）。
 * 沒傳就退回一組保守值，並在 `warnings` 裡說出來 —— ⛔ 不靜默用假數字。
 */
export interface StatMedians {
  initial: Readonly<Record<string, number>>;
  perLevel: Readonly<Record<string, number>>;
}

const FALLBACK_MEDIANS: StatMedians = Object.freeze({
  initial: Object.freeze({ maxHealth: 541, maxMana: 370, ad: 32, ap: 18, as: 0.7, healthRegen: 0.97, manaRegen: 1.41 }),
  perLevel: Object.freeze({ maxHealth: 78.7, maxMana: 46.5, ad: 4.35, ap: 1.72, as: 0.058, healthRegen: 0.162, manaRegen: 0.19 }),
});

/** 攻擊距離的預設 —— 近戰 1.6（原作 128 換算），遠程取同定位中位數。 */
export const MELEE_RANGE_DEFAULT = 1.6;
export const RANGED_RANGE_DEFAULT = 8.2;
/** 卡面射程上限（owner：「上限是黑人牙膏 12」）。⛔ 這是**警告線**不是硬夾。 */
export const CARD_RANGE_MAX = 12;

export interface ForgeInput {
  id: string;
  name: string;
  description: string;
  origin: Origin;
  /** 混血與均衡沒有內建攻擊型態，要自己選。純血填了與出身不符會被警告。 */
  attackType?: "melee" | "ranged";
  modelKey?: string;
  medians?: StatMedians;
  totalInitial?: number;
  totalGrowth?: number;
  /** 手動客製：覆蓋任何一格生成值。⭐ 這就是 owner 說的「二次編輯」。 */
  overrides?: { baseStats?: Record<string, number>; growth?: Record<string, number>; attributes?: Partial<AttributeSet> };
}

export interface ForgeWarning {
  /** ⛔ 全部是 `warn` —— owner 2026-08-12：「只是個警告標記，並不會擋」。 */
  level: "warn";
  field: string;
  message: string;
}

export interface ForgeResult {
  draft: ChampionDraft;
  warnings: readonly ForgeWarning[];
  /** 出身與定位（生成當下），以及自洽檢查的結果。 */
  origin: Origin;
  archetype: Archetype;
  /** ⭐ 生出來的三圍餵回 `originOf()` 得到的出身。與 `origin` 不同 = 配方壞了。 */
  originRoundTrip: Origin;
}

const PRIMARY_LABEL = { str: "STR", agi: "AGI", int: "INT" } as const;

/**
 * 生成一張卡的草稿。
 *
 * ⭐ 產出的是**內容**，不是行為：草稿之後仍然走 `registerAll` →
 * `resolveChampionStats` 那條唯一的路，所以 ms / mr / armor 由正規化填，
 * ⛔ 這裡一格都不寫。
 */
export function forgeChampion(input: ForgeInput): ForgeResult {
  const warnings: ForgeWarning[] = [];
  const origin = input.origin;
  const builtIn = ORIGIN_ATTACK_TYPE[origin];
  const attackType = input.attackType ?? builtIn ?? "melee";
  if (builtIn !== null && input.attackType !== undefined && input.attackType !== builtIn) {
    warnings.push({
      level: "warn",
      field: "attackType",
      message: `出身「${origin}」是${builtIn === "melee" ? "近戰" : "遠程"}，但你選了${attackType === "melee" ? "近戰" : "遠程"} —— 這張卡的出身會被重新判定成別的格子。`,
    });
  }
  if (builtIn === null && input.attackType === undefined) {
    warnings.push({
      level: "warn",
      field: "attackType",
      message: `出身「${origin}」是混血/均衡，沒有內建的攻擊型態 —— 預設近戰，請自己確認。`,
    });
  }

  const attrs = { ...attributesForOrigin(origin, input), ...(input.overrides?.attributes ?? {}) };
  const med = input.medians ?? FALLBACK_MEDIANS;
  if (!input.medians) {
    warnings.push({
      level: "warn",
      field: "medians",
      message: "沒有傳入同定位的中位數，其餘八項用的是保守 fallback —— 數字可能已經過期。",
    });
  }

  const range = attackType === "melee" ? MELEE_RANGE_DEFAULT : (med.initial["range"] ?? RANGED_RANGE_DEFAULT);
  const baseStats: Record<string, number> = {
    maxHealth: med.initial["maxHealth"] ?? 0,
    healthRegen: med.initial["healthRegen"] ?? 0,
    maxMana: med.initial["maxMana"] ?? 0,
    manaRegen: med.initial["manaRegen"] ?? 0,
    ad: med.initial["ad"] ?? 0,
    ap: med.initial["ap"] ?? 0,
    as: med.initial["as"] ?? 0,
    range,
    critChance: 0,
    critDamage: 1.75,
    cdr: 0,
    lifesteal: 0,
    // ⚠️ ms / armor / mr **一定要在**（`championStatBase` 直接讀 `baseStats[stat]`），
    //    但值會被 `resolveChampionStats` 依定位覆蓋 —— 這裡放 0 是「等著被填」的標記。
    ms: 0,
    armor: 0,
    mr: 0,
    ...(input.overrides?.baseStats ?? {}),
  };
  const growth: Record<string, number> = {
    maxHealth: med.perLevel["maxHealth"] ?? 0,
    healthRegen: med.perLevel["healthRegen"] ?? 0,
    maxMana: med.perLevel["maxMana"] ?? 0,
    manaRegen: med.perLevel["manaRegen"] ?? 0,
    ad: med.perLevel["ad"] ?? 0,
    as: med.perLevel["as"] ?? 0,
    ...(input.overrides?.growth ?? {}),
  };

  if (attackType === "ranged" && range > CARD_RANGE_MAX) {
    warnings.push({
      level: "warn",
      field: "baseStats.range",
      message: `攻擊距離 ${range} 超過卡面上限 ${CARD_RANGE_MAX}（owner：「上限是黑人牙膏 12」）。⛔ 不會被擋，但要說得出理由。`,
    });
  }
  if (attackType === "ranged" && range < 4) {
    warnings.push({
      level: "warn",
      field: "attackType",
      message: `標成遠程但射程只有 ${range} —— 引擎會發射一個只飛 ${range} 格的投射物。要貼身就改成近戰。`,
    });
  }

  const primary = (["str", "agi", "int"] as const).reduce((a, b) =>
    attrs[a] + attrs[`${a}Growth` as const] * 9 >= attrs[b] + attrs[`${b}Growth` as const] * 9 ? a : b,
  );
  const probe = { attackType, attributes: attrs };
  const draft: ChampionDraft = {
    id: input.id,
    schema: "champion@1",
    name: input.name,
    description: input.description,
    role: attackType === "ranged" ? "marksman" : "fighter",
    attackType,
    modelKey: input.modelKey ?? "blocky-hero",
    archetype: archetypeOf(probe as never),
    attributes: { ...attrs, primary: PRIMARY_LABEL[primary], source: "authored" },
    baseStats,
    growth,
  };

  const roundTrip = originOf(probe as never);
  if (roundTrip !== origin) {
    warnings.push({
      level: "warn",
      field: "origin",
      message: `⚠️ 生出來的三圍餵回推導得到「${roundTrip}」，不是你選的「${origin}」—— 這張卡的出身會跟你的意圖不一致。`,
    });
  }

  return { draft, warnings, origin, archetype: draft.archetype, originRoundTrip: roundTrip };
}

/**
 * 出身 → 那個出身**每一條路線**推薦哪些技能標籤。
 *
 * owner 2026-08-12 選了方案 (b)：用 **#317 的技能標籤系統**做推薦，
 * ⛔ 不是「在每條路線下手寫一份技能 id 清單」—— 那份清單會過期而且不會報錯。
 *
 * ⚠️ 這裡的字串必須是 `skill-tag-manifest.json` 裡真的存在的標籤名。
 * 守衛 `heroForge.test.ts` 逐一比對，打錯字就紅。
 */
export const ROUTE_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // 坦克
  鐵壁: ["減傷", "格擋", "韌性", "護盾"],
  反噬: ["反彈", "反彈・分型別", "反彈成功時", "受到傷害時"],
  血怒: ["暴走", "免死", "血量首次低於", "抵擋致命傷時"],
  嘲哮: ["嘲諷", "減速", "定身", "免控"],
  // 砲手
  攻城: ["指向", "真傷", "衝擊波", "延遲落地(通用排程)"],
  彈幕: ["範圍", "衝擊波", "週期"],
  鎮守: ["靜止 N 秒", "被動", "屬性門檻"],
  // 鬥士
  疾風: ["吸血", "加速", "解鎖上限", "普攻時"],
  致命: ["暴擊", "處決", "破甲", "暴擊時"],
  連刃: ["層數累積", "標記", "標記引爆", "連續第 N 次"],
  遊擊: ["衝刺", "瞬移", "後撤", "跳躍"],
  // 射手
  精準: ["指向", "暴擊", "對 BOSS"],
  疾射: ["加速", "普攻時", "解鎖上限"],
  陷阱: ["牆", "減速", "定身", "進入範圍時"],
  // 法鬥
  附魔: ["AP加成", "普攻時", "燃燒"],
  咒刃: ["技能命中時", "施法時", "衝刺"],
  護法: ["吸收(護盾)", "護盾", "汲魔", "護盾產生時"],
  // 法師
  爆術: ["AP加成", "範圍", "衝擊波"],
  詠唱: ["週期", "環繞衛星", "施法時"],
  詛咒: ["中毒", "凋零", "易傷", "詛咒(失手)", "虛弱"],
  // 狂戰
  蠻攻: ["AD加成", "普攻時", "破防"],
  韌體: ["吸血", "回復", "韌性", "受到傷害時"],
  撞擊: ["衝刺", "擊退", "擊飛", "擊倒"],
  // 硬輔
  咒鎧: ["衍生屬性(把 A 的 X% 加到 B)", "吸收(護盾)", "減傷"],
  神罰: ["衍生屬性(把 A 的 X% 加到 B)", "AP加成", "真傷"],
  圖騰: ["召喚", "牆", "週期"],
  // 法刺
  刺殺: ["限時隱身", "隱身(常駐)", "處決", "暴擊"],
  幻影: ["替身", "迴避", "迴避時"],
  疾咒: ["普攻時", "AP加成", "機率"],
  // 軟輔
  調律: ["輪替增益", "被動"],
  適應: ["變身", "切換"],
  共鳴: ["附近敵人達 N 人", "隊友陣亡時", "輔助"],
});

/** 這一條路線推薦的標籤。認不得的路線名回空陣列（⛔ 不猜）。 */
export function tagsForRoute(routeName: string): readonly string[] {
  return ROUTE_TAGS[routeName] ?? [];
}

/** 出身合法性：`ORIGINS` 的成員。 */
export function isOrigin(v: unknown): v is Origin {
  return typeof v === "string" && (ORIGINS as readonly string[]).includes(v);
}

/** 出身 → 它會收斂到哪一個定位（給畫面顯示用）。 */
export function archetypeForOrigin(o: Origin): Archetype {
  return ORIGIN_TO_ARCHETYPE[o];
}

/** 生成當下那三項會被填成什麼（給畫面**預覽**用，⛔ 不是它自己算的）。 */
export function normalizedPreview(a: Archetype): { ms: number; mr: number; armor: number } {
  const n = DEFAULT_STAT_NORMALIZATION;
  return {
    ms: n.bands.ms[n.byArchetype.ms[a]],
    mr: n.bands.mr[n.byArchetype.mr[a]],
    armor: n.bands.armor[n.byArchetype.armor[a]],
  };
}

/** 混血的門檻（畫面上要說明「為什麼這組三圍算混血」）。 */
export const FORGE_MIXED_RATIO = MIXED_RATIO;
