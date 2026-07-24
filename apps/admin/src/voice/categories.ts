/**
 * The owner's voice-line category schema — 角色語音生成 (spec step 4).
 *
 * ── THE LIST IS DATA, NOT CODE ──────────────────────────────────────────────
 * The authoritative copy is `content/assets/audio/voices/lines/CATEGORIES.json`
 * (`voice.categories@1`), written by the voice-gen CLI lane. Adding a 42nd
 * category later is an edit to THAT file and nothing else.
 *
 * What lives here is a BUNDLED SNAPSHOT, used only when the JSON cannot be
 * read — and when it is used the page says so, out loud, with a badge. A page
 * that silently falls back to a hardcoded list is a page that will one day show
 * the owner a category set nobody can find on disk.
 *
 * ── TWO FACTS ABOUT THE OWNER'S LIST, SURFACED RATHER THAN "FIXED" ──────────
 * 1. Splitting his line on `、` yields 41 items, not the 42 he counted. No 42nd
 *    has been invented to make the number match. `CATEGORY_COUNT` is derived
 *    from the array; nothing in the page or the tests hardcodes 41 or 42.
 * 2. Two categories legitimately EXPAND into several recorded lines:
 *      喊出技能名稱   → 5 castable slots (Q/W/E/R/EX; the passive is not shouted)
 *      回應隊友OK/NO → 2 lines (答應 / 拒絕)
 *    so one champion needs 39 + 5 + 2 = 46 clips, and 48 champions need 2,208 —
 *    not the ~2,016 the spec estimates. Same order of magnitude, different
 *    number, and the page displays the one it actually computed.
 *
 * Pure. No fetch, no React, no clock — voiceApi.ts does the I/O.
 */

/** Which expansion table a category uses; absent ⇒ exactly one line. */
export type ExpansionKey = "abilitySlots" | "okNo";

export interface VoiceCategory {
  readonly id: string;
  /** THE OWNER'S EXACT WORDING. Never translated, never "tidied". */
  readonly label: string;
  /** 1-based position in his list — the page sorts by this, never by id. */
  readonly order: number;
  /** what the line should convey; shown next to the script box */
  readonly hint: string;
  /** soft length target in seconds (guidance for the writer, not a hard gate) */
  readonly maxSeconds: number;
  readonly expand?: ExpansionKey;
}

export interface CategorySchema {
  readonly categories: readonly VoiceCategory[];
  readonly expansions: Readonly<Record<ExpansionKey, readonly string[]>>;
  /** true when this came off disk; false ⇒ the bundled snapshot below */
  readonly fromDisk: boolean;
  /** sha256 the daemon reports for its copy, when known */
  readonly sha256: string | null;
}

/** Where the authoritative schema lives on the content mount. */
export const CATEGORIES_URL = "/content/assets/audio/voices/lines/CATEGORIES.json";

/** Castable slots. `passiveAbility` is never shouted, so it is not here. */
export const ABILITY_SLOTS = ["q", "w", "e", "r", "ex"] as const;
export const OK_NO = ["ok", "no"] as const;

export const DEFAULT_EXPANSIONS: Record<ExpansionKey, readonly string[]> = {
  abilitySlots: ABILITY_SLOTS,
  okNo: OK_NO,
};

/**
 * The 41 categories, in HIS order, with HIS labels.
 *
 * `hint` is ours — it is the brief given to whoever (or whatever) writes the
 * script, and it is the only column here that may be reworded freely.
 */
export const BUNDLED_CATEGORIES: readonly VoiceCategory[] = [
  { id: "quote", label: "角色名言", order: 1, maxSeconds: 4, hint: "該角色的招牌名言，原作台詞優先；已有素材見 voices/quotes/quotes.json" },
  { id: "skill-name", label: "喊出技能名稱", order: 2, maxSeconds: 2, expand: "abilitySlots", hint: "施放時喊出該技能名稱，短促有力；文字取自技能的 name（去掉 xx-0X 編號）" },
  { id: "victory", label: "勝利宣言", order: 3, maxSeconds: 4, hint: "回合／整場獲勝時的宣言，得意但符合角色個性" },
  { id: "defeat", label: "戰敗宣言", order: 4, maxSeconds: 4, hint: "落敗時的自語，可以不甘、可以認栽，不要無感情" },
  { id: "hurt", label: "受傷", order: 5, maxSeconds: 1, hint: "一般受擊的短促痛哼，≤1 秒" },
  { id: "hurt-heavy", label: "重傷", order: 6, maxSeconds: 2, hint: "瀕死／大傷的沉重呻吟，比「受傷」更長更啞" },
  { id: "stun", label: "暈眩", order: 7, maxSeconds: 2, hint: "被暈的恍神聲，字不清楚、拖尾" },
  { id: "poison", label: "中毒", order: 8, maxSeconds: 2, hint: "中毒的咳嗽／作嘔，帶不適感" },
  { id: "slow", label: "被緩慢", order: 9, maxSeconds: 2, hint: "動不了的抱怨，語速刻意放慢" },
  { id: "blind", label: "致盲", order: 10, maxSeconds: 2, hint: "看不見的驚慌，「看不到！」類" },
  { id: "bind", label: "受束縛/封印", order: 11, maxSeconds: 2, hint: "被綁住／封印的掙扎，用力擠出來的聲音" },
  { id: "knockdown", label: "被擊倒", order: 12, maxSeconds: 2, hint: "被打倒在地的撞擊悶哼" },
  { id: "healed", label: "被治癒", order: 13, maxSeconds: 2, hint: "被隊友治療後的舒緩與道謝" },
  { id: "confused", label: "被混亂", order: 14, maxSeconds: 2, hint: "神智混亂的胡言亂語，可含笑聲" },
  { id: "paralyzed", label: "被麻痺", order: 15, maxSeconds: 2, hint: "麻痺時的顫抖與齒音" },
  { id: "thanks", label: "感謝", order: 16, maxSeconds: 2, hint: "對隊友的道謝，真誠" },
  { id: "taunt", label: "諷刺/挑釁", order: 17, maxSeconds: 2, hint: "挑釁敵人；本專案的「惡搞」基調在這個類別最濃" },
  { id: "curse", label: "咒罵", order: 18, maxSeconds: 2, hint: "不爽的咒罵，保持在可播出範圍" },
  { id: "hum", label: "哼歌", order: 19, maxSeconds: 4, hint: "無台詞哼唱，閒置時播放，2–4 秒" },
  { id: "attack-light", label: "輕攻擊", order: 20, maxSeconds: 1, hint: "普攻的短吐氣，≤0.6 秒" },
  { id: "attack-heavy", label: "重攻擊", order: 21, maxSeconds: 2, hint: "重擊的用力吼，比「輕攻擊」明顯更重" },
  { id: "crit", label: "暴擊", order: 22, maxSeconds: 2, hint: "打出暴擊的爽快喊聲" },
  { id: "block", label: "防禦", order: 23, maxSeconds: 2, hint: "擋下攻擊的咬牙聲" },
  { id: "dodge", label: "閃避", order: 24, maxSeconds: 2, hint: "閃過攻擊的輕快吐氣或嘲弄" },
  { id: "sprint", label: "衝刺/奔跑", order: 25, maxSeconds: 2, hint: "開始奔跑時的吆喝" },
  { id: "jump", label: "跳躍", order: 26, maxSeconds: 1, hint: "起跳的短促呼氣" },
  { id: "respond", label: "回應隊友OK/NO", order: 27, maxSeconds: 2, expand: "okNo", hint: "回應隊友指令：ok 答應、no 拒絕，兩句都要" },
  { id: "puzzled", label: "疑惑", order: 28, maxSeconds: 2, hint: "搞不懂狀況的「咦？」" },
  { id: "love", label: "愛心", order: 29, maxSeconds: 2, hint: "表達好感／賣萌的一句" },
  { id: "thumbs-up", label: "比讚/肯定", order: 30, maxSeconds: 2, hint: "稱讚隊友打得好" },
  { id: "retreat", label: "退下", order: 31, maxSeconds: 2, hint: "要求撤退／自己撤退" },
  { id: "charge", label: "衝鋒", order: 32, maxSeconds: 2, hint: "帶頭衝鋒的號令" },
  { id: "watch", label: "觀望", order: 33, maxSeconds: 2, hint: "按兵不動、先看情況" },
  { id: "free-move", label: "自由行動", order: 34, maxSeconds: 2, hint: "各自行動、分頭進行" },
  { id: "first-blood", label: "首殺", order: 35, maxSeconds: 2, hint: "全場第一殺，最誇張的一句" },
  { id: "kill-1", label: "一殺", order: 36, maxSeconds: 2, hint: "拿下一殺" },
  { id: "kill-2", label: "雙殺", order: 37, maxSeconds: 2, hint: "連續兩殺，語氣比「一殺」升一階" },
  { id: "kill-3", label: "三殺", order: 38, maxSeconds: 2, hint: "三殺，再升一階" },
  { id: "kill-4", label: "四殺", order: 39, maxSeconds: 2, hint: "四殺，接近失控" },
  { id: "kill-5", label: "五殺", order: 40, maxSeconds: 2, hint: "五殺，全場最高潮" },
  { id: "unstoppable", label: "無人能敵", order: 41, maxSeconds: 4, hint: "連殺不止、無人能擋的宣告" },
];

/** The bundled fallback, flagged as such. */
export const BUNDLED_SCHEMA: CategorySchema = {
  categories: BUNDLED_CATEGORIES,
  expansions: DEFAULT_EXPANSIONS,
  fromDisk: false,
  sha256: null,
};

/** DERIVED, never typed as a literal — see the header. */
export const CATEGORY_COUNT = BUNDLED_CATEGORIES.length;

// ---------------------------------------------------------------- expansion --

/** One recordable line: a category, plus the variant when it expands. */
export interface LineSpec {
  /** `<categoryId>` or `<categoryId>.<variant>` — filename-safe by construction */
  readonly lineId: string;
  readonly categoryId: string;
  readonly label: string;
  readonly order: number;
  readonly hint: string;
  readonly maxSeconds: number;
  readonly variant: string | null;
  /** display suffix for an expanded line, e.g. "Q" or "OK" */
  readonly variantLabel: string;
}

const VARIANT_LABEL: Record<string, string> = {
  q: "Q",
  w: "W",
  e: "E",
  r: "R",
  ex: "EX",
  ok: "OK 答應",
  no: "NO 拒絕",
};

function variantLabel(v: string): string {
  return VARIANT_LABEL[v] ?? v.toUpperCase();
}

/**
 * The full recordable line list for ONE champion, in the owner's order.
 *
 * This is the arithmetic the whole page's scale rests on: 46 lines per
 * champion, 2,208 across the 48-champion open roster. It is a pure function of
 * the schema so a 42nd category (or a 6th ability slot) changes the number
 * everywhere at once, with nothing to keep in sync by hand.
 */
export function expandLines(schema: CategorySchema): LineSpec[] {
  const out: LineSpec[] = [];
  for (const c of [...schema.categories].sort((a, b) => a.order - b.order)) {
    const variants = c.expand ? (schema.expansions[c.expand] ?? []) : [];
    if (variants.length === 0) {
      out.push({
        lineId: c.id,
        categoryId: c.id,
        label: c.label,
        order: c.order,
        hint: c.hint,
        maxSeconds: c.maxSeconds,
        variant: null,
        variantLabel: "",
      });
      continue;
    }
    for (const v of variants) {
      out.push({
        lineId: `${c.id}.${v}`,
        categoryId: c.id,
        label: c.label,
        order: c.order,
        hint: c.hint,
        maxSeconds: c.maxSeconds,
        variant: v,
        variantLabel: variantLabel(v),
      });
    }
  }
  return out;
}

/** Lines per champion for this schema. */
export function linesPerChampion(schema: CategorySchema): number {
  return expandLines(schema).length;
}

/** Total clips for a roster of `champions` champions. */
export function totalClips(schema: CategorySchema, champions: number): number {
  return linesPerChampion(schema) * champions;
}

/**
 * A lineId is filename-safe by construction: `[a-z0-9-]+` with at most one `.`
 * separator. The daemon writes it straight into a path, so the page refuses to
 * render (and never requests) anything that would escape the champion dir.
 */
export function isSafeLineId(lineId: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)?$/.test(lineId);
}

// ------------------------------------------------------------------ parsing --

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];
}

/**
 * Tolerant reader for `CATEGORIES.json`. Returns null when the bytes cannot be
 * read as a category schema at all — the caller then shows the bundled snapshot
 * WITH its badge, rather than a half-parsed list that looks authoritative.
 */
export function parseCategorySchema(raw: unknown, sha256: string | null = null): CategorySchema | null {
  if (raw === null || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  const list = doc["categories"];
  if (!Array.isArray(list) || list.length === 0) return null;

  const categories: VoiceCategory[] = [];
  list.forEach((entry, i) => {
    if (entry === null || typeof entry !== "object") return;
    const c = entry as Record<string, unknown>;
    const id = str(c["id"]);
    if (id === "" || !/^[a-z0-9-]+$/.test(id)) return;
    const expand = str(c["expand"]);
    categories.push({
      id,
      label: str(c["label"], id),
      order: num(c["order"], i + 1),
      hint: str(c["hint"]),
      maxSeconds: num(c["maxSeconds"], 2),
      ...(expand === "abilitySlots" || expand === "okNo" ? { expand } : {}),
    });
  });
  if (categories.length === 0) return null;

  const rawExp = (doc["expansions"] ?? {}) as Record<string, unknown>;
  const abilitySlots = stringList(rawExp["abilitySlots"]);
  const okNo = stringList(rawExp["okNo"]);
  return {
    categories,
    expansions: {
      abilitySlots: abilitySlots.length > 0 ? abilitySlots : ABILITY_SLOTS,
      okNo: okNo.length > 0 ? okNo : OK_NO,
    },
    fromDisk: true,
    sha256,
  };
}

/**
 * Does the schema on disk still describe the owner's list?
 *
 * Returns the differences against the bundled snapshot: ids that appeared,
 * ids that vanished, and labels that were reworded. The page renders this so a
 * hand-edit to CATEGORIES.json is VISIBLE rather than silently in effect —
 * which is exactly what makes "just edit the JSON" a safe instruction.
 */
export interface SchemaDrift {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly relabelled: readonly { id: string; was: string; now: string }[];
  readonly countChanged: boolean;
}

export function schemaDrift(schema: CategorySchema): SchemaDrift {
  const bundled = new Map(BUNDLED_CATEGORIES.map((c) => [c.id, c]));
  const live = new Map(schema.categories.map((c) => [c.id, c]));
  const added = [...live.keys()].filter((id) => !bundled.has(id));
  const removed = [...bundled.keys()].filter((id) => !live.has(id));
  const relabelled: { id: string; was: string; now: string }[] = [];
  for (const [id, c] of live) {
    const b = bundled.get(id);
    if (b && b.label !== c.label) relabelled.push({ id, was: b.label, now: c.label });
  }
  return {
    added,
    removed,
    relabelled,
    countChanged: schema.categories.length !== BUNDLED_CATEGORIES.length,
  };
}
