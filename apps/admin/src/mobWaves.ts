/**
 * 殭屍波系統 (roguelite mob waves, task #215) — the pure, node-testable logic
 * behind the admin page that tunes `config/arena-rules.json`'s `mobWaves` block.
 *
 * ── WHY A DEDICATED PAGE ────────────────────────────────────────────────────
 * Before this, NOTHING in the console touched arena-rules: `grep -rn
 * "arena-rules\|mobWaves" apps/admin/src/` returned zero hits. Every zombie
 * knob — 每波幾隻 / 場上上限 / 血量 / 攻擊 / 移速 / 等級曲線 / 獎勵 — was a
 * hand edit of a JSON file on the owner's disk, which on the deployed host is a
 * read-only bind mount. The 內容覆蓋層 page could technically write the doc, but
 * only as raw JSON in a textarea, with no labels, no bounds and no idea what
 * any number does.
 *
 * ── SHAPE: CombatEnvPage's, deliberately ────────────────────────────────────
 * Form state holds RAW STRINGS, not numbers, so a half-typed "1." or a
 * deliberately EMPTY box is representable — for this block that second case is
 * load-bearing, because ten of the fields are schema-OPTIONAL and an empty box
 * has to mean 「不覆寫，用系統預設」 rather than 0.
 *
 * ── WHY THE SHIPPED DEFAULTS ARE RESTATED HERE ──────────────────────────────
 * `DEFAULT_MOB_WAVES_CONFIG` lives in `@ggd/shared/content/schema/config`,
 * which imports zod at module scope, and `MOB_CHAMPION_ID`/`MOB_MODEL_KEY` live
 * in `@ggd/shared/sim/mobs`, which drags SimWorld + collision in. This page is
 * an EAGER member of the production admin bundle (its write is a platform admin
 * call, see the page header), so pulling either graph in would be paid by every
 * console load. The values are restated as plain data and PINNED against the
 * originals by mobWaves.test.ts — drift fails the suite instead of shipping a
 * console that quietly disagrees with the engine.
 */

// A TYPE-ONLY import: erased at build time, so no zod reaches the bundle.
import type { MobWavesConfig } from "@ggd/shared/content/schema/config";

export type { MobWavesConfig };

/** The arena-rules doc id + collection this page edits (one doc, one block). */
export const ARENA_RULES_COLLECTION = "config";
export const ARENA_RULES_ID = "arena-rules";

// ------------------------------------------------------------- fallbacks ----

/**
 * What the SIM falls back to when `mob.championId` / `mob.modelKey` are absent
 * (`MOB_CHAMPION_ID` / `MOB_MODEL_KEY` in sim/mobs.ts). Shown next to those two
 * boxes so an empty field reads as 「會用這個」 instead of 「壞掉了」.
 */
export const MOB_CHAMPION_FALLBACK = "godie-zombiex";
export const MOB_MODEL_FALLBACK = "champ.godie-zombiex";
/** `DEFAULT_MOB_BASE_LEVEL` / `DEFAULT_MOB_LEVEL_PER_ROUND` in sim/mobs.ts. */
export const MOB_BASE_LEVEL_FALLBACK = 3;
export const MOB_LEVEL_PER_ROUND_FALLBACK = 1;

/** The shipped `mobWaves` block — the 重設 target and the pre-fetch seed. */
export const SHIPPED_MOB_WAVES: MobWavesConfig = {
  fromRound: 3,
  firstWaveSec: 1,
  waveIntervalSec: 2,
  mobsPerWaveCap: 5,
  maxAlivePerZone: 15,
  schedule: [
    { round: 6, mobsPerWaveCap: 10, maxAlivePerZone: 20 },
    { round: 7, mobsPerWaveCap: 15, maxAlivePerZone: 30 },
    { round: 8, mobsPerWaveCap: 20, maxAlivePerZone: 40 },
    { round: 9, mobsPerWaveCap: 25, maxAlivePerZone: 50 },
    { round: 10, mobsPerWaveCap: 0, maxAlivePerZone: 0 },
  ],
  mob: {
    maxHp: 24,
    attackDamage: 1.2,
    moveSpeed: 3,
    attackRange: 1.8,
    attackCdSec: 1.0,
    radius: 0.6,
    modelKey: "champ.mob.zombie",
    championId: "godie-zombiex",
    baseLevel: 3,
    levelPerRound: 1,
    baseHp: 20,
    hpPerLevel: 20,
    baseRegen: 0,
    regenPerLevel: 0,
  },
  reward: { gold: 20, xp: 40, killsPerLevel: 6 },
};

// ----------------------------------------------------------------- fields ---

/**
 * Every EDITABLE SCALAR in the block, as a dotted path. The per-round schedule
 * is a table, not a scalar, so it is modelled separately below — but everything
 * else the schema admits is here, and `MOB_WAVES_LABELS` is an exhaustive
 * `Record` over this union, so adding a knob to the schema without labelling it
 * is a type error rather than a knob nobody can reach.
 */
export type MobWavesFieldKey =
  | "fromRound"
  | "firstWaveSec"
  | "waveIntervalSec"
  | "mobsPerWaveCap"
  | "maxAlivePerZone"
  | "mob.maxHp"
  | "mob.attackDamage"
  | "mob.moveSpeed"
  | "mob.attackRange"
  | "mob.attackCdSec"
  | "mob.radius"
  | "mob.modelKey"
  | "mob.championId"
  | "mob.baseLevel"
  | "mob.levelPerRound"
  | "mob.baseHp"
  | "mob.hpPerLevel"
  | "mob.baseRegen"
  | "mob.regenPerLevel"
  | "reward.gold"
  | "reward.xp"
  | "reward.killsPerLevel";

/** How a box is typed + validated. `champion`/`model` are text with a picker. */
export type FieldKind = "int" | "num" | "text" | "champion" | "model";

export interface MobWavesFieldSpec {
  /** 中文名稱 — the row's first column */
  zh: string;
  /** WHAT IT AFFECTS, in one line. Never a restatement of the field name. */
  note: string;
  /** unit suffix printed after the box ("秒" / "隻" / "點"), "" when unitless */
  unit: string;
  kind: FieldKind;
  /** inclusive lower bound, mirroring the zod schema */
  min?: number;
  /** true when the schema marks it `.optional()` — an EMPTY box is legal */
  optional: boolean;
  /** what an empty box means, in words (only for `optional` fields) */
  emptyMeans?: string;
}

/**
 * Ordered so the page reads top-to-bottom the way the mechanic runs: when waves
 * start → how often → how many → what a zombie IS → what killing one pays.
 */
export const MOB_WAVES_FIELD_ORDER: readonly MobWavesFieldKey[] = [
  "fromRound",
  "firstWaveSec",
  "waveIntervalSec",
  "mobsPerWaveCap",
  "maxAlivePerZone",
  "mob.championId",
  "mob.modelKey",
  "mob.baseLevel",
  "mob.levelPerRound",
  "mob.baseHp",
  "mob.hpPerLevel",
  "mob.baseRegen",
  "mob.regenPerLevel",
  "mob.maxHp",
  "mob.attackDamage",
  "mob.attackCdSec",
  "mob.attackRange",
  "mob.moveSpeed",
  "mob.radius",
  "reward.gold",
  "reward.xp",
  "reward.killsPerLevel",
] as const;

/**
 * The bounds mirror `zMobWavesConfig` exactly (packages/shared/.../config.ts),
 * so a value this page accepts is a value the content loader accepts. Where the
 * schema says `.positive()` the min is expressed as a strict-positive check in
 * `validateField`, not as `min: 0`.
 */
export const MOB_WAVES_LABELS: Record<MobWavesFieldKey, MobWavesFieldSpec> = {
  fromRound: {
    zh: "第幾回合開始出殭屍",
    note: "這一回合（含）之後每場戰鬥才會有殭屍；之前的回合完全沒有",
    unit: "回合",
    kind: "int",
    min: 1,
    optional: false,
  },
  firstWaveSec: {
    zh: "第一波出現時間",
    note: "戰鬥開始後這麼多秒，第一波從場地邊緣走進來",
    unit: "秒",
    kind: "num",
    optional: false,
  },
  waveIntervalSec: {
    zh: "每波間隔",
    note: "兩波之間隔幾秒；第 k 波會生出 min(k, 每波數量上限) 隻",
    unit: "秒",
    kind: "num",
    optional: false,
  },
  mobsPerWaveCap: {
    zh: "每波數量上限（基準）",
    note: "一波最多生幾隻。逐回合表沒列到的回合用這個值",
    unit: "隻",
    kind: "int",
    min: 1,
    optional: false,
  },
  maxAlivePerZone: {
    zh: "場上同時上限（基準）",
    note: "每個戰場同時最多幾隻活著；滿了就不再生。逐回合表沒列到的回合用這個值",
    unit: "隻",
    kind: "int",
    min: 1,
    optional: false,
  },
  "mob.championId": {
    zh: "殭屍由誰擔任（英雄文件）",
    note: "殭屍頂著哪個英雄的臉。留空 = 用系統預設；逐回合表可以逐場覆蓋",
    unit: "",
    kind: "champion",
    optional: true,
    emptyMeans: `留空 = ${MOB_CHAMPION_FALLBACK}`,
  },
  "mob.modelKey": {
    zh: "殭屍模型",
    note: "實際跑在場上的 3D 模型文件 id（前端解析）。留空 = 用系統預設",
    unit: "",
    kind: "model",
    optional: true,
    emptyMeans: `留空 = ${MOB_MODEL_FALLBACK}`,
  },
  "mob.baseLevel": {
    zh: "起始等級",
    note: "「開始出殭屍」那一回合的殭屍等級",
    unit: "級",
    kind: "int",
    min: 1,
    optional: true,
    emptyMeans: `留空 = ${MOB_BASE_LEVEL_FALLBACK}`,
  },
  "mob.levelPerRound": {
    zh: "每回合升幾級",
    note: "之後每過一個回合，殭屍等級 +N（血量與回血跟著下面兩條曲線長）",
    unit: "級",
    kind: "int",
    min: 0,
    optional: true,
    emptyMeans: `留空 = ${MOB_LEVEL_PER_ROUND_FALLBACK}`,
  },
  "mob.baseHp": {
    zh: "1 級血量",
    note: "殭屍自己的血量曲線起點（與喪標麥可英雄卡無關，改英雄不會動到這裡）",
    unit: "點",
    kind: "num",
    optional: true,
    emptyMeans: "留空 = 改讀英雄文件的血量成長（舊行為）",
  },
  "mob.hpPerLevel": {
    zh: "每級加血",
    note: "實際血量 = 四捨五入(1 級血量 + 每級加血 ×(等級-1))",
    unit: "點",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 0",
  },
  "mob.baseRegen": {
    zh: "1 級每秒回血",
    note: "殭屍的自然回血（0 = 不回血，打掉的血不會長回來）",
    unit: "點/秒",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 改讀英雄文件的回血成長（舊行為）",
  },
  "mob.regenPerLevel": {
    zh: "每級加回血",
    note: "實際回血 = 1 級每秒回血 + 每級加回血 ×(等級-1)",
    unit: "點/秒",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 0",
  },
  "mob.maxHp": {
    zh: "血量（最後保險值）",
    note: "只有在「1 級血量」留空、而且英雄文件也讀不到時才會用到的固定血量",
    unit: "點",
    kind: "num",
    optional: false,
  },
  "mob.attackDamage": {
    zh: "攻擊力",
    note: "殭屍每次普攻打掉玩家多少血（走完一般減傷）",
    unit: "點",
    kind: "num",
    min: 0,
    optional: false,
  },
  "mob.attackCdSec": {
    zh: "攻擊間隔",
    note: "兩次普攻之間幾秒。越小越痛",
    unit: "秒",
    kind: "num",
    optional: false,
  },
  "mob.attackRange": {
    zh: "攻擊距離",
    note: "追到多近才動手（GGD 單位；英雄體積半徑約 0.6）",
    unit: "單位",
    kind: "num",
    optional: false,
  },
  "mob.moveSpeed": {
    zh: "移動速度",
    note: "殭屍走多快（英雄一般約 6）。留空 = 跟英雄同速，會非常難跑",
    unit: "單位/秒",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 6（與英雄基礎移速相同）",
  },
  "mob.radius": {
    zh: "身體半徑",
    note: "碰撞體積，也決定牠們能貼多近、以及從邊緣進場時內縮多少",
    unit: "單位",
    kind: "num",
    optional: false,
  },
  "reward.gold": {
    zh: "每殺一隻給金錢",
    note: "誰打死的誰拿，直接進那個人的錢包",
    unit: "金",
    kind: "int",
    min: 0,
    optional: false,
  },
  "reward.xp": {
    zh: "每殺一隻給經驗",
    note: "同樣只給最後一擊的人",
    unit: "XP",
    kind: "int",
    min: 0,
    optional: false,
  },
  "reward.killsPerLevel": {
    zh: "殺幾隻升一級",
    note: "這是「肉鴿爬升」的主軸：每累積 N 隻擊殺，那個玩家直接 +1 等級",
    unit: "隻",
    kind: "int",
    min: 1,
    optional: false,
  },
};

/** Display grouping — every field appears in EXACTLY ONE group (unit-tested). */
export interface MobWavesGroup {
  title: string;
  /** why this group exists, one line under the heading */
  blurb: string;
  keys: MobWavesFieldKey[];
}

export const MOB_WAVES_GROUPS: MobWavesGroup[] = [
  {
    title: "出怪節奏 · 什麼時候、來幾隻",
    blurb: "逐回合表沒列到的回合，用這裡的兩個「基準」上限。",
    keys: ["fromRound", "firstWaveSec", "waveIntervalSec", "mobsPerWaveCap", "maxAlivePerZone"],
  },
  {
    title: "殭屍身分 · 臉與模型",
    blurb: "誰來當殭屍。逐回合表可以再逐場覆蓋這裡的英雄。",
    keys: ["mob.championId", "mob.modelKey"],
  },
  {
    title: "等級與血量曲線 · 隨回合變強",
    blurb: "等級 = 起始等級 + 每回合升幾級 ×(回合 − 開始回合)；血量與回血再由等級推出來。",
    keys: [
      "mob.baseLevel",
      "mob.levelPerRound",
      "mob.baseHp",
      "mob.hpPerLevel",
      "mob.baseRegen",
      "mob.regenPerLevel",
      "mob.maxHp",
    ],
  },
  {
    title: "戰鬥能力 · 打多痛、跑多快",
    blurb: "這四個決定殭屍是「雜魚」還是「壓力」。",
    keys: ["mob.attackDamage", "mob.attackCdSec", "mob.attackRange", "mob.moveSpeed", "mob.radius"],
  },
  {
    title: "擊殺獎勵 · 打殭屍換什麼",
    blurb: "獎勵只給最後一擊的人。",
    keys: ["reward.gold", "reward.xp", "reward.killsPerLevel"],
  },
];

/** True when the display groups partition the field list exactly. */
export function groupsCoverAllFields(): boolean {
  const seen = MOB_WAVES_GROUPS.flatMap((g) => g.keys);
  const all = MOB_WAVES_FIELD_ORDER;
  return (
    seen.length === all.length &&
    new Set(seen).size === all.length &&
    all.every((k) => seen.includes(k))
  );
}

// ------------------------------------------------------------------ form ----

/** One editable row of the per-round schedule table. Raw strings, like the rest. */
export interface ScheduleRowForm {
  round: string;
  mobsPerWaveCap: string;
  maxAlivePerZone: string;
  /** #NEW: 由誰擔任 for this round only. Empty = inherit `mob.championId`. */
  championId: string;
}

export interface MobWavesForm {
  fields: Record<MobWavesFieldKey, string>;
  schedule: ScheduleRowForm[];
}

/** Render a number for an input box: 1 → "1", 1.20 → "1.2". */
export function formatNum(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "";
  return String(Number(n.toFixed(4)));
}

/** Read a dotted path out of a config block. */
export function readField(cfg: MobWavesConfig, key: MobWavesFieldKey): string {
  switch (key) {
    case "fromRound":
      return formatNum(cfg.fromRound);
    case "firstWaveSec":
      return formatNum(cfg.firstWaveSec);
    case "waveIntervalSec":
      return formatNum(cfg.waveIntervalSec);
    case "mobsPerWaveCap":
      return formatNum(cfg.mobsPerWaveCap);
    case "maxAlivePerZone":
      return formatNum(cfg.maxAlivePerZone);
    case "mob.maxHp":
      return formatNum(cfg.mob.maxHp);
    case "mob.attackDamage":
      return formatNum(cfg.mob.attackDamage);
    case "mob.moveSpeed":
      return formatNum(cfg.mob.moveSpeed);
    case "mob.attackRange":
      return formatNum(cfg.mob.attackRange);
    case "mob.attackCdSec":
      return formatNum(cfg.mob.attackCdSec);
    case "mob.radius":
      return formatNum(cfg.mob.radius);
    case "mob.modelKey":
      return cfg.mob.modelKey ?? "";
    case "mob.championId":
      return cfg.mob.championId ?? "";
    case "mob.baseLevel":
      return formatNum(cfg.mob.baseLevel);
    case "mob.levelPerRound":
      return formatNum(cfg.mob.levelPerRound);
    case "mob.baseHp":
      return formatNum(cfg.mob.baseHp);
    case "mob.hpPerLevel":
      return formatNum(cfg.mob.hpPerLevel);
    case "mob.baseRegen":
      return formatNum(cfg.mob.baseRegen);
    case "mob.regenPerLevel":
      return formatNum(cfg.mob.regenPerLevel);
    case "reward.gold":
      return formatNum(cfg.reward.gold);
    case "reward.xp":
      return formatNum(cfg.reward.xp);
    case "reward.killsPerLevel":
      return formatNum(cfg.reward.killsPerLevel);
  }
}

/** Seed the whole form from a config block. */
export function formFromConfig(cfg: MobWavesConfig): MobWavesForm {
  const fields = {} as Record<MobWavesFieldKey, string>;
  for (const k of MOB_WAVES_FIELD_ORDER) fields[k] = readField(cfg, k);
  return {
    fields,
    schedule: (cfg.schedule ?? []).map((r) => ({
      round: String(r.round),
      mobsPerWaveCap: String(r.mobsPerWaveCap),
      maxAlivePerZone: String(r.maxAlivePerZone),
      championId: r.championId ?? "",
    })),
  };
}

/** The 全部重設 target. */
export function shippedForm(): MobWavesForm {
  return formFromConfig(SHIPPED_MOB_WAVES);
}

export function setField(form: MobWavesForm, key: MobWavesFieldKey, value: string): MobWavesForm {
  return { ...form, fields: { ...form.fields, [key]: value } };
}

export function resetField(form: MobWavesForm, key: MobWavesFieldKey): MobWavesForm {
  return setField(form, key, readField(SHIPPED_MOB_WAVES, key));
}

export function setScheduleCell(
  form: MobWavesForm,
  index: number,
  cell: keyof ScheduleRowForm,
  value: string,
): MobWavesForm {
  const schedule = form.schedule.map((r, i) => (i === index ? { ...r, [cell]: value } : r));
  return { ...form, schedule };
}

/**
 * Add a row for `round`. Seeded with the caps CURRENTLY in force for that round
 * (not with zeros): the operator opened the row to CHANGE something, and a row
 * that lands as 0/0 would silently delete that round's zombies before they got
 * to type anything — the exact 「乾淨總決賽」 setting, applied by accident.
 */
export function addScheduleRow(form: MobWavesForm, round: number): MobWavesForm {
  if (form.schedule.some((r) => Number(r.round) === round)) return form;
  const caps = capsForRound(configFromForm(form), round);
  const row: ScheduleRowForm = {
    round: String(round),
    mobsPerWaveCap: String(caps.mobsPerWaveCap),
    maxAlivePerZone: String(caps.maxAlivePerZone),
    championId: "",
  };
  const schedule = [...form.schedule, row].sort((a, b) => Number(a.round) - Number(b.round));
  return { ...form, schedule };
}

export function removeScheduleRow(form: MobWavesForm, index: number): MobWavesForm {
  return { ...form, schedule: form.schedule.filter((_, i) => i !== index) };
}

// ------------------------------------------------------------ validation ----

/** Parse an input box: null when it is blank or not a finite number. */
export function parseNum(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Field-level validation mirroring `zMobWavesConfig`. Returns a zh-Hant message
 * or "" when valid. An empty box is legal for an OPTIONAL field and an error for
 * a required one — never silently coerced to 0.
 */
export function validateField(key: MobWavesFieldKey, text: string): string {
  const spec = MOB_WAVES_LABELS[key];
  const t = text.trim();
  if (t === "") return spec.optional ? "" : "必填";
  if (spec.kind === "text" || spec.kind === "champion" || spec.kind === "model") return "";
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  if (spec.kind === "int" && !Number.isInteger(n)) return "必須是整數";
  if (spec.min !== undefined && n < spec.min) return `不能小於 ${spec.min}`;
  // `.positive()` in the schema — 0 is rejected, and saying so beats a 422.
  if (spec.min === undefined && n <= 0) return "必須大於 0";
  return "";
}

export interface ScheduleRowErrors {
  round?: string;
  mobsPerWaveCap?: string;
  maxAlivePerZone?: string;
}

export interface MobWavesErrors {
  fields: Partial<Record<MobWavesFieldKey, string>>;
  /** index-aligned with `form.schedule` */
  schedule: ScheduleRowErrors[];
  /** cross-row problems (duplicate rounds) */
  general: string[];
}

export function validateForm(form: MobWavesForm): MobWavesErrors {
  const fields: Partial<Record<MobWavesFieldKey, string>> = {};
  for (const k of MOB_WAVES_FIELD_ORDER) {
    const e = validateField(k, form.fields[k]);
    if (e) fields[k] = e;
  }

  const schedule: ScheduleRowErrors[] = form.schedule.map((r) => {
    const row: ScheduleRowErrors = {};
    const round = parseNum(r.round);
    if (round === null || !Number.isInteger(round) || round < 1) row.round = "回合必須是 ≥1 的整數";
    const per = parseNum(r.mobsPerWaveCap);
    if (per === null || !Number.isInteger(per) || per < 0) row.mobsPerWaveCap = "必須是 ≥0 的整數";
    const alive = parseNum(r.maxAlivePerZone);
    if (alive === null || !Number.isInteger(alive) || alive < 0) {
      row.maxAlivePerZone = "必須是 ≥0 的整數";
    }
    return row;
  });

  const general: string[] = [];
  const rounds = form.schedule.map((r) => r.round.trim());
  const dupes = rounds.filter((r, i) => r !== "" && rounds.indexOf(r) !== i);
  for (const d of new Set(dupes)) general.push(`第 ${d} 回合有重複的設定列，請只留一列`);

  return { fields, schedule, general };
}

export function formValid(form: MobWavesForm): boolean {
  const errs = validateForm(form);
  return (
    Object.keys(errs.fields).length === 0 &&
    errs.schedule.every((r) => Object.keys(r).length === 0) &&
    errs.general.length === 0
  );
}

// ---------------------------------------------------------------- output ----

/**
 * Build the `mobWaves` block from the form. OPTIONAL fields left blank are
 * OMITTED, never written as 0 — writing `hpPerLevel: 0` where the operator meant
 * "leave it alone" is how an editor silently changes a curve it was asked not to
 * touch. Invalid input falls back to the shipped value, but the page gates Save
 * on `formValid`, so that branch is a safety net and not a path.
 */
export function configFromForm(form: MobWavesForm): MobWavesConfig {
  const num = (key: MobWavesFieldKey, fallback: number): number => {
    const n = parseNum(form.fields[key]);
    return n === null ? fallback : n;
  };
  const optNum = (key: MobWavesFieldKey): number | undefined => {
    const n = parseNum(form.fields[key]);
    return n === null ? undefined : n;
  };
  const optText = (key: MobWavesFieldKey): string | undefined => {
    const t = form.fields[key].trim();
    return t === "" ? undefined : t;
  };

  const mob: MobWavesConfig["mob"] = {
    maxHp: num("mob.maxHp", SHIPPED_MOB_WAVES.mob.maxHp),
    attackDamage: num("mob.attackDamage", SHIPPED_MOB_WAVES.mob.attackDamage),
    attackRange: num("mob.attackRange", SHIPPED_MOB_WAVES.mob.attackRange),
    attackCdSec: num("mob.attackCdSec", SHIPPED_MOB_WAVES.mob.attackCdSec),
    radius: num("mob.radius", SHIPPED_MOB_WAVES.mob.radius),
  };
  const putNum = (k: keyof MobWavesConfig["mob"], key: MobWavesFieldKey): void => {
    const v = optNum(key);
    if (v !== undefined) (mob as Record<string, unknown>)[k] = v;
  };
  const putText = (k: keyof MobWavesConfig["mob"], key: MobWavesFieldKey): void => {
    const v = optText(key);
    if (v !== undefined) (mob as Record<string, unknown>)[k] = v;
  };
  putNum("moveSpeed", "mob.moveSpeed");
  putText("modelKey", "mob.modelKey");
  putText("championId", "mob.championId");
  putNum("baseLevel", "mob.baseLevel");
  putNum("levelPerRound", "mob.levelPerRound");
  putNum("baseHp", "mob.baseHp");
  putNum("hpPerLevel", "mob.hpPerLevel");
  putNum("baseRegen", "mob.baseRegen");
  putNum("regenPerLevel", "mob.regenPerLevel");

  const schedule = form.schedule
    .map((r) => {
      const row: NonNullable<MobWavesConfig["schedule"]>[number] = {
        round: parseNum(r.round) ?? 1,
        mobsPerWaveCap: parseNum(r.mobsPerWaveCap) ?? 0,
        maxAlivePerZone: parseNum(r.maxAlivePerZone) ?? 0,
      };
      const champ = r.championId.trim();
      if (champ !== "") row.championId = champ;
      return row;
    })
    .sort((a, b) => a.round - b.round);

  const out: MobWavesConfig = {
    fromRound: num("fromRound", SHIPPED_MOB_WAVES.fromRound),
    firstWaveSec: num("firstWaveSec", SHIPPED_MOB_WAVES.firstWaveSec),
    waveIntervalSec: num("waveIntervalSec", SHIPPED_MOB_WAVES.waveIntervalSec),
    mobsPerWaveCap: num("mobsPerWaveCap", SHIPPED_MOB_WAVES.mobsPerWaveCap),
    maxAlivePerZone: num("maxAlivePerZone", SHIPPED_MOB_WAVES.maxAlivePerZone),
    mob,
    reward: {
      gold: num("reward.gold", SHIPPED_MOB_WAVES.reward.gold),
      xp: num("reward.xp", SHIPPED_MOB_WAVES.reward.xp),
      killsPerLevel: num("reward.killsPerLevel", SHIPPED_MOB_WAVES.reward.killsPerLevel),
    },
  };
  // An EMPTY table means "no per-round overrides" — write no key at all rather
  // than `schedule: []`, so the doc goes back to exactly the legacy shape.
  if (schedule.length > 0) out.schedule = schedule;
  return out;
}

/**
 * Splice the block into the FULL arena-rules doc. Every other block (rounds /
 * overflow / flowers / reviveCircles / guardianTower / goldDrop …) is carried
 * through untouched — the overlay stores whole documents, so a save that dropped
 * a sibling block would delete that mechanic on the host.
 */
export function patchArenaRules(
  doc: Record<string, unknown>,
  mobWaves: MobWavesConfig,
): Record<string, unknown> {
  return { ...doc, mobWaves: mobWaves as unknown as Record<string, unknown> };
}

/** Pull the block out of a loaded arena-rules doc; null when it has none. */
export function extractMobWaves(doc: unknown): MobWavesConfig | null {
  if (typeof doc !== "object" || doc === null) return null;
  const block = (doc as Record<string, unknown>)["mobWaves"];
  if (typeof block !== "object" || block === null || Array.isArray(block)) return null;
  const b = block as Record<string, unknown>;
  if (typeof b["mob"] !== "object" || b["mob"] === null) return null;
  if (typeof b["reward"] !== "object" || b["reward"] === null) return null;
  return block as MobWavesConfig;
}

// -------------------------------------------------------- per-round view ----

/**
 * The caps in force for `round` — the console's copy of `mobCapsForRound`
 * (sim/mobs.ts). Restated here for the same reason the defaults are: importing
 * sim/mobs would drag SimWorld into the admin bundle. Pinned against the sim's
 * function by mobWaves.test.ts, which imports it freely under node.
 */
export function capsForRound(
  cfg: MobWavesConfig,
  round: number,
): { mobsPerWaveCap: number; maxAlivePerZone: number } {
  const authored = { mobsPerWaveCap: cfg.mobsPerWaveCap, maxAlivePerZone: cfg.maxAlivePerZone };
  if (!cfg.schedule || round <= 0) return authored;
  const row = cfg.schedule.find((r) => r.round === Math.round(round));
  if (!row) return authored;
  return {
    mobsPerWaveCap: Math.max(0, row.mobsPerWaveCap),
    maxAlivePerZone: Math.max(0, row.maxAlivePerZone),
  };
}

/** The console's copy of `mobLevelForRound`. Same pinning rule as above. */
export function levelForRound(cfg: MobWavesConfig, round: number): number {
  const base = cfg.mob.baseLevel ?? MOB_BASE_LEVEL_FALLBACK;
  const per = cfg.mob.levelPerRound ?? MOB_LEVEL_PER_ROUND_FALLBACK;
  return base + per * Math.max(0, Math.round(round) - cfg.fromRound);
}

/**
 * The hp one mob has in `round`, by the #244 mob-card law
 * `round(baseHp + hpPerLevel*(level-1))`. Returns null when the card has no
 * curve — in that case the sim reads the CHAMPION DOC, which this page cannot
 * see, and printing `maxHp` there would be a number that is simply not true.
 */
export function hpForRound(cfg: MobWavesConfig, round: number): number | null {
  if (cfg.mob.baseHp === undefined) return null;
  const level = levelForRound(cfg, round);
  return Math.max(1, Math.round(cfg.mob.baseHp + (cfg.mob.hpPerLevel ?? 0) * (level - 1)));
}

/** One row of the 逐回合 read-out. */
export interface RoundRow {
  round: number;
  /** false for rounds before `fromRound` — no waves at all */
  active: boolean;
  mobsPerWaveCap: number;
  maxAlivePerZone: number;
  /** true when this round has its own schedule row */
  overridden: boolean;
  /** index into `cfg.schedule` when `overridden`, else -1 */
  scheduleIndex: number;
  /** the champion doc id in force this round (per-round override → mob → sim default) */
  championId: string;
  /** true when the champion came from THIS round's own override */
  championOverridden: boolean;
  level: number;
  hp: number | null;
  /**
   * caps are 0/0 while the round IS active — the deliberate 乾淨總決賽. Called
   * out separately because it looks identical to "misconfigured" in a table.
   */
  cleanFinale: boolean;
}

/**
 * Build the whole per-round read-out, rounds 1..`lastRound`. Rounds before
 * `fromRound` are included on purpose: 「第 3 回合才開始」 is only legible when
 * you can see rounds 1 and 2 sitting there empty.
 */
export function roundRows(cfg: MobWavesConfig, lastRound: number): RoundRow[] {
  const rows: RoundRow[] = [];
  const scheduled = cfg.schedule ?? [];
  const end = Math.max(lastRound, cfg.fromRound, ...scheduled.map((r) => r.round));
  for (let round = 1; round <= end; round++) {
    const active = round >= cfg.fromRound;
    const caps = capsForRound(cfg, round);
    const idx = scheduled.findIndex((r) => r.round === round);
    const row = idx >= 0 ? scheduled[idx] : undefined;
    const champOverride = row?.championId;
    rows.push({
      round,
      active,
      mobsPerWaveCap: active ? caps.mobsPerWaveCap : 0,
      maxAlivePerZone: active ? caps.maxAlivePerZone : 0,
      overridden: idx >= 0,
      scheduleIndex: idx,
      championId: champOverride ?? cfg.mob.championId ?? MOB_CHAMPION_FALLBACK,
      championOverridden: champOverride !== undefined,
      level: levelForRound(cfg, round),
      hp: hpForRound(cfg, round),
      cleanFinale: active && caps.mobsPerWaveCap === 0 && caps.maxAlivePerZone === 0,
    });
  }
  return rows;
}

/** Highest round the arena-rules doc's own `rounds` table names (for the table length). */
export function lastAuthoredRound(doc: unknown, fallback = 10): number {
  if (typeof doc !== "object" || doc === null) return fallback;
  const rounds = (doc as Record<string, unknown>)["rounds"];
  if (typeof rounds !== "object" || rounds === null) return fallback;
  const keys = Object.keys(rounds as Record<string, unknown>)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));
  return keys.length === 0 ? fallback : Math.max(fallback, ...keys);
}

// --------------------------------------------------------------- champions --

/** A pickable champion for the 由誰擔任 dropdowns. */
export interface ChampionOption {
  id: string;
  /** 中文名; falls back to the id when the doc could not be read */
  name: string;
}

/** Sort by 中文名 so the picker is browsable, with unnamed ids last. */
export function sortChampions(options: readonly ChampionOption[]): ChampionOption[] {
  return [...options].sort((a, b) => {
    const an = a.name === a.id ? 1 : 0;
    const bn = b.name === b.id ? 1 : 0;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}

/**
 * "破嵐 (godie-zombiex)" — never a bare id. A dropdown of `godie-*` slugs is
 * unreadable, and the id still has to be visible because it is what is stored.
 */
export function championLabel(id: string, options: readonly ChampionOption[]): string {
  const hit = options.find((o) => o.id === id);
  if (!hit || hit.name === id) return id;
  return `${hit.name}（${id}）`;
}

// -------------------------------------------------------------- messaging ---

/** When a save takes effect. Printed next to Save — the one thing to understand. */
export const APPLY_NOTE = "儲存後寫入平台的耐久覆蓋層；對戰伺服器在下次重啟（部署）時載入，進行中的對戰不受影響";

/**
 * WHERE THE EDIT LIVES — the answer to 「部署一次會不會被蓋掉？」.
 *
 * The write is a `PUT /api/v1/content-overlay/docs/config/arena-rules`, which
 * lands in `DATA_DIR/content-overlay/overlay.json`. On the host DATA_DIR is
 * `<repo>/data` through the `../data:/data` bind mount in docker/compose.yaml —
 * OUTSIDE the image and gitignored (`/data/**`), so neither `git pull` nor
 * `docker compose build && up -d` can touch it. `content/` is mounted `:ro` from
 * the repo and IS overwritten by a pull; that is why this page must never write
 * there. The game-server lays the overlay over the shipped tree at boot
 * (apps/game-server/src/index.ts → fetchOverlayBundle → OverlayContentSource).
 */
export const PERSISTENCE_NOTE =
  "這一頁寫進 data/ 的耐久覆蓋層，不是 repo 裡的 content/。git pull、重建 image、重啟容器都不會蓋掉它。";

export const SIM_GAP_NOTE =
  "「由誰擔任」逐回合欄位目前只會被儲存下來，對戰端還沒有讀它（sim 端要另外接）。整場的預設英雄（上面的「殭屍由誰擔任」）是有效的。";

export function loadErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `讀取殭屍波設定失敗：${msg}`;
}

export function saveErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `儲存失敗：${msg}`;
}

/** Fields whose value differs from the doc the server last gave us. */
export function changedFields(form: MobWavesForm, saved: MobWavesConfig): MobWavesFieldKey[] {
  return MOB_WAVES_FIELD_ORDER.filter((k) => form.fields[k].trim() !== readField(saved, k).trim());
}

/** True when the schedule table differs from the saved doc's. */
export function scheduleChanged(form: MobWavesForm, saved: MobWavesConfig): boolean {
  const a = JSON.stringify(configFromForm(form).schedule ?? []);
  const b = JSON.stringify(saved.schedule ?? []);
  return a !== b;
}

export function isDirty(form: MobWavesForm, saved: MobWavesConfig): boolean {
  return changedFields(form, saved).length > 0 || scheduleChanged(form, saved);
}
