/**
 * 新英雄轉生設計 —— 後台頁的**純邏輯**（owner 2026-08-13）。
 *
 * > 「最終也上架到後台編輯器，作為 [新英雄轉生設計] 的設計頁面，可以根據定位規則
 * >  生成英雄並符合規範，再開放數值調整，並揀選 [鑄技工坊] 已設定好的技能來組合
 * >  天生/Q/W/E/R/EX，就可以完成上架推出新英雄」
 *
 * ⭐ 而且他**更正過順序**（這一句決定了整頁的形狀）：
 *
 * > 「應該先寫英雄名稱與說明，選出身及定位來自動生成三圍及成長與其他屬性，
 * >  看要不要手動輸入數值客製調整後，判斷警告阻攔，再來選技能組合，再來上架」
 *
 * 六步全部照那個順序（見 {@link FORGE_STEPS}）。⛔ 技能在**最後**選，不是先選。
 *
 * ── 這個檔案不做什麼 ────────────────────────────────────────────────────────
 * ⛔ 它**不重做** `heroForge.ts`。「出身 → 一張卡」的配方、往返自洽、路線 → 技能
 * 標籤全部住在 `@ggd/shared/content/heroForge`，這裡只是把它接上一份表單、一份
 * 鑄技工坊目錄、和一組頁面層的警告。
 *
 * ⛔ 它**不是**畫面。`ui/HeroForgePage.tsx` 只是這裡的殼 —— 守衛驗這裡。
 *
 * ── ⭐ 讀技能說明找機制之前，一定要先剝掉「…」 ─────────────────────────────
 * owner 2026-08-12：「技能內文說明會有一個 **「」代表角色施展技能的對白，不是真正
 * 的效果**，請不要被迷惑了」。CLAUDE.md 第〇·六守則把這條**點名**給了「編輯器的
 * 自動建議」，而這一頁的技能推薦正是那個東西：它讀 461 支技能的 description 去找
 * 標籤。少了 {@link mechanicsText} 這一關，44-04 心臟麻痺的台詞「…在35秒後宣布
 * 勝利吧。」會讓它被推薦成一支有延遲時序的技能 —— 而畫面上看起來只是「排在前面」。
 */
import {
  forgeChampion,
  tagsForRoute,
  archetypeForOrigin,
  normalizedPreview,
  ORIGIN_ATTACK_TYPE,
  type AttributeSet,
  type ForgeInput,
  type ForgeResult,
  type ForgeWarning,
  type StatMedians,
} from "@ggd/shared/content/heroForge";
import {
  NORMALIZED_STAT_KEYS,
  type NormalizedStatKey,
  type StatNormalization,
} from "@ggd/shared/content/statNormalization";
import { archetypeOf, type Archetype, type Origin } from "@ggd/shared/content/statNormalization";
import {
  DEFAULT_ORIGIN_ROUTES,
  originRoutesFromDoc,
  type OriginRoutes,
  type RouteInfo,
} from "@ggd/shared/content/originRoutes";
import { embeddedForm } from "@ggd/shared/content/editModel";
import { renderAbilityDescription } from "@ggd/shared/content/renderAbilityText";
import {
  deriveAbilityDefaults,
  applyAbilityDefaults,
  type AbilityCorpusDoc,
  type AbilityDefaults,
} from "@ggd/shared/content/newHeroDefaults";
import {
  checkNewHeroDocs,
  DEFAULT_NEW_HERO_CHECKS,
  newHeroChecksFromDoc,
  type NewHeroChecksConfig,
} from "@ggd/shared/content/newHeroChecks";
import { abilityIdFor, type HeroDoc } from "./heroTemplate";

// ---------------------------------------------------------------------------
// 六步流程 —— owner 更正過的順序，這裡是唯一一份
// ---------------------------------------------------------------------------

export interface ForgeStep {
  readonly key: string;
  readonly label: string;
  readonly note: string;
}

/**
 * ⚠️ 這個陣列的**順序就是規格**。owner 一開始拿到的是「先選技能再調數值」，
 * 他退回來重寫成下面這六步；把它們寫成常數而不是散在 JSX 裡，是為了讓順序有一個
 * 可以被讀、被斷言的住處。
 */
export const FORGE_STEPS: readonly ForgeStep[] = Object.freeze([
  Object.freeze({ key: "identity", label: "① 名稱與說明", note: "先有人，才有數值。" }),
  Object.freeze({
    key: "origin",
    label: "② 選出身與路線",
    note: "→ 自動生成三圍、成長與其他屬性（唯讀預覽）。",
  }),
  Object.freeze({ key: "tune", label: "③ 手動客製數值", note: "任何一格都可以覆寫；留白 = 用生成值。" }),
  Object.freeze({
    key: "warn",
    label: "④ 警告檢查",
    note: "⛔ 只警告不擋（owner：「只是個警告標記，並不會擋」）。",
  }),
  Object.freeze({
    key: "skills",
    label: "⑤ 選技能（天生 / Q / W / E / R / EX）",
    note: "從鑄技工坊挑；依②選的路線推薦。",
  }),
  Object.freeze({ key: "ship", label: "⑥ 產出草稿 → 上架", note: "草稿 JSON + 一鍵寫進內容覆蓋層。" }),
]);

/** 六格技能。⚠️ 天生技的 slot 字面是 `PASSIVE`，不是「天生」。 */
export const HERO_FORGE_SLOTS = ["PASSIVE", "Q", "W", "E", "R", "EX"] as const;
export type HeroForgeSlot = (typeof HERO_FORGE_SLOTS)[number];

export const SLOT_LABEL: Readonly<Record<HeroForgeSlot, string>> = Object.freeze({
  PASSIVE: "天生",
  Q: "Q",
  W: "W",
  E: "E",
  R: "R",
  EX: "EX",
});

// ---------------------------------------------------------------------------
// 表單
// ---------------------------------------------------------------------------

/**
 * 表單狀態。**每一格數值都是字串**，因為「空字串」與「0」在這一頁是兩件事：
 * 空 = 用生成值，0 = 作者真的要 0。⛔ 用 `number | null` 表達的話，畫面上的框
 * 一被清空就會變成 0，而那是一個看不出來的覆寫。
 */
export interface HeroForgeForm {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly origin: Origin;
  /** 路線名（決定技能推薦）。空 = 還沒選。 */
  readonly route: string;
  /** 空 = 用出身內建的攻擊型態（混血/均衡沒有內建，`forgeChampion` 會警告）。 */
  readonly attackType: "" | "melee" | "ranged";
  readonly modelKey: string;
  /** 三圍總量錨點（留白 = 用 shared 的出貨錨點）。 */
  readonly totalInitial: string;
  readonly totalGrowth: string;
  /** 覆寫。key 形如 `attributes.str` / `baseStats.maxHealth` / `growth.ad`。 */
  readonly overrides: Readonly<Record<string, string>>;
  /** 六格各挑了哪一支技能（ability doc id）。空 = 還沒挑。 */
  readonly picks: Readonly<Record<HeroForgeSlot, string>>;
}

export function blankHeroForgeForm(): HeroForgeForm {
  return {
    id: "",
    name: "",
    description: "",
    origin: "坦克",
    route: "",
    attackType: "",
    modelKey: "",
    totalInitial: "",
    totalGrowth: "",
    overrides: {},
    picks: { PASSIVE: "", Q: "", W: "", E: "", R: "", EX: "" },
  };
}

/** 生成預覽會顯示（也可以被覆寫）的欄位，分成三區。 */
export const OVERRIDE_GROUPS: readonly { group: "attributes" | "baseStats" | "growth"; label: string; keys: readonly string[] }[] =
  Object.freeze([
    Object.freeze({
      group: "attributes" as const,
      label: "三圍與成長",
      keys: Object.freeze(["str", "agi", "int", "strGrowth", "agiGrowth", "intGrowth"]),
    }),
    Object.freeze({
      group: "baseStats" as const,
      label: "初始屬性",
      keys: Object.freeze([
        "maxHealth",
        "healthRegen",
        "maxMana",
        "manaRegen",
        "ad",
        "ap",
        "as",
        "range",
        "critChance",
        "critDamage",
        "cdr",
        "lifesteal",
      ]),
    }),
    Object.freeze({
      group: "growth" as const,
      label: "每級成長",
      keys: Object.freeze(["maxHealth", "healthRegen", "maxMana", "manaRegen", "ad", "as"]),
    }),
  ]);

/** 覆寫格的 key（同時是畫面的 `data-field`）。 */
export function overrideKey(group: string, stat: string): string {
  return `${group}.${stat}`;
}

function parseNum(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 打錯字的覆寫格（填了東西但不是數字）—— 它們會被**忽略**，所以一定要說出來。 */
export function badOverrideKeys(form: HeroForgeForm): string[] {
  return Object.entries(form.overrides)
    .filter(([, v]) => v.trim() !== "" && !Number.isFinite(Number(v.trim())))
    .map(([k]) => k)
    .sort();
}

function overridesFor(form: HeroForgeForm, group: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(form.overrides)) {
    const dot = k.indexOf(".");
    if (dot < 0 || k.slice(0, dot) !== group) continue;
    const n = parseNum(v);
    if (n !== null) out[k.slice(dot + 1)] = n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 鑄技工坊目錄 + 同定位中位數
// ---------------------------------------------------------------------------

export interface AbilityCard {
  readonly id: string;
  readonly name: string;
  readonly slot: string;
  readonly description: string;
  readonly doc: Readonly<Record<string, unknown>>;
}

export interface HeroForgeCatalog {
  readonly abilities: readonly AbilityCard[];
  /** 每個定位的中位數；算不出來（樣本太少）就沒有那一格，`forgeChampion` 會警告。 */
  readonly medians: Readonly<Partial<Record<Archetype, StatMedians>>>;
  readonly routes: OriginRoutes;
  /**
   * ⭐ GH#480 —— 六條警示的開關（`config.new-hero-checks@1`，第一守則的第三個住處）。
   * ⚠️ 讀不到就是出貨值（全部 on），⛔ 不是「一條都不跳」：一個讀檔失敗不可以
   * 靜靜地把整組警示關掉，那正是這一票要修的那種靜默。
   */
  readonly checks: NewHeroChecksConfig;
  /** 讀不到的東西 —— ⛔ 不要靜默降級（fail-open 必須有人說出來）。 */
  readonly errors: readonly string[];
}

export function emptyCatalog(): HeroForgeCatalog {
  return {
    abilities: [],
    medians: {},
    routes: DEFAULT_ORIGIN_ROUTES,
    checks: DEFAULT_NEW_HERO_CHECKS,
    errors: [],
  };
}

const MEDIAN_STATS = ["maxHealth", "maxMana", "ad", "ap", "as", "healthRegen", "manaRegen", "range"] as const;
/** 少於這個數的樣本就不報中位數 —— 三隻英雄的「中位數」是雜訊不是錨點。 */
const MEDIAN_MIN_SAMPLE = 5;

function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function numAt(doc: Record<string, unknown>, block: string, stat: string): number | undefined {
  const b = doc[block];
  if (!b || typeof b !== "object") return undefined;
  const v = (b as Record<string, unknown>)[stat];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * 同定位英雄的中位數 —— **量出來的**，⛔ 不是寫死的。
 *
 * ⚠️ `forgeChampion` 沒拿到 medians 時會退回一組保守 fallback **並且警告**
 * 「數字可能已經過期」。那個警告是對的，但如果它永遠都在，它就等於不在
 * （第二守則：fail-open 沒錯，靜默才是缺陷 —— 而永遠亮著的警告是另一種靜默）。
 * 所以這裡真的去讀出貨的英雄卡把它算出來。
 */
export function mediansByArchetype(
  champions: readonly Record<string, unknown>[],
): Partial<Record<Archetype, StatMedians>> {
  const buckets = new Map<Archetype, Record<string, unknown>[]>();
  for (const doc of champions) {
    let a: Archetype;
    try {
      a = archetypeOf(doc as never);
    } catch {
      continue;
    }
    const list = buckets.get(a);
    if (list) list.push(doc);
    else buckets.set(a, [doc]);
  }
  const out: Partial<Record<Archetype, StatMedians>> = {};
  for (const [archetype, docs] of [...buckets].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (docs.length < MEDIAN_MIN_SAMPLE) continue;
    const initial: Record<string, number> = {};
    const perLevel: Record<string, number> = {};
    for (const stat of MEDIAN_STATS) {
      const i = median(docs.map((d) => numAt(d, "baseStats", stat)).filter((v): v is number => v !== undefined));
      if (i !== undefined) initial[stat] = i;
      const g = median(docs.map((d) => numAt(d, "growth", stat)).filter((v): v is number => v !== undefined));
      if (g !== undefined) perLevel[stat] = g;
    }
    out[archetype] = { initial, perLevel };
  }
  return out;
}

interface IndexEntry {
  readonly id: string;
  readonly path: string;
}

function parseIndex(raw: unknown): IndexEntry[] {
  const entries = (raw as { entries?: unknown } | undefined)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((e) => {
    const r = e as Record<string, unknown>;
    return typeof r["id"] === "string" && typeof r["path"] === "string"
      ? [{ id: r["id"], path: r["path"] }]
      : [];
  });
}

function cardFrom(id: string, raw: unknown): AbilityCard {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: string, fallback: string): string =>
    typeof d[k] === "string" && d[k] !== "" ? (d[k] as string) : fallback;
  return {
    id,
    name: str("name", id),
    slot: str("slot", ""),
    // ⭐ 說明推導（票號待開） —— 說明裡的 `{{cd}}` / `{{dmg}}` … 在這裡算繪成數字與級距詞。
    //    ⛔ 這一頁**不可以**自己寫第二份算繪：`renderAbilityText` 就是遊戲內卡片
    //    走的那一支，兩邊共用它才不會出現「後台顯示 A、場上跑 B」。
    //    ⚠️ 這一頁拿的是**磁碟形狀**的文件（沒有 `Configs`），所以幾何級距詞走
    //    `DEFAULT_PROSE_TABLES` 那條退路；三個數字軸與出貨逐字相同。
    //    ⛔ **實際值（`{{cd!}}`）這一頁算不出來**（那要 `config.combat-env@1`，
    //    它是這一頁向 `/admin/combat-env` **抓**回來的東西）⇒ 它會原樣印在預覽上。
    //    那是刻意的：一個中性表算出來的「實戰 45 秒」看起來完全正常，而玩家等 9 秒。
    description: renderAbilityDescription(d, str("description", "")),
    doc: d,
  };
}

async function getJson(fetchFn: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

async function fetchAll(
  fetchFn: typeof fetch,
  base: string,
  entries: readonly IndexEntry[],
  concurrency: number,
): Promise<(unknown | null)[]> {
  const out: (unknown | null)[] = entries.map(() => null);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const entry = entries[i];
      if (entry === undefined) return;
      try {
        out[i] = await getJson(fetchFn, `${base}/${entry.path}`);
      } catch {
        // 一份讀不到的文件不可以讓整頁空白
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length || 1) }, worker));
  return out;
}

/**
 * 把三件出貨資料抓下來：鑄技工坊的 461 支技能、119 張英雄卡（算中位數用）、
 * 以及出身×路線的文案（⚠️ 那 32 個路線名是**內容**，owner 改得到）。
 */
export async function loadHeroForgeCatalog(
  opts: { fetchFn?: typeof fetch; base?: string; concurrency?: number } = {},
): Promise<HeroForgeCatalog> {
  const fetchFn = opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = opts.base ?? "/content";
  const concurrency = Math.max(1, opts.concurrency ?? 16);
  const errors: string[] = [];

  const safe = async <T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      errors.push(`${what}：${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  };

  const [abilityIdx, championIdx, routesDoc, checksDoc] = await Promise.all([
    safe("技能索引", () => getJson(fetchFn, `${base}/abilities/_index.json`), null as unknown),
    safe("英雄索引", () => getJson(fetchFn, `${base}/champions/_index.json`), null as unknown),
    safe("出身×路線文案", () => getJson(fetchFn, `${base}/config/origin-routes.json`), null as unknown),
    // ⭐ GH#480 —— 六條警示的開關。⛔ 這一行就是「這份文件真的有人讀」的證據：
    //    少了它，後台那一頁會變成「操作者存了值、重整讀得回來、警示照舊」的謊言。
    safe("新英雄檢查警示開關", () => getJson(fetchFn, `${base}/config/new-hero-checks.json`), null as unknown),
  ]);

  const abilityEntries = parseIndex(abilityIdx);
  const championEntries = parseIndex(championIdx);
  const [abilityDocs, championDocs] = await Promise.all([
    fetchAll(fetchFn, base, abilityEntries, concurrency),
    fetchAll(fetchFn, base, championEntries, concurrency),
  ]);

  const abilities = abilityEntries.map((e, i) => cardFrom(e.id, abilityDocs[i]));
  const champions = championDocs.filter((d): d is Record<string, unknown> => !!d && typeof d === "object");
  if (abilityEntries.length > 0 && abilities.every((a) => a.slot === "")) {
    errors.push("技能索引讀到了，但每一份技能文件都讀不到 —— 推薦與挑選都會是空的。");
  }
  return {
    abilities,
    medians: mediansByArchetype(champions),
    routes: routesDoc === null ? DEFAULT_ORIGIN_ROUTES : originRoutesFromDoc(routesDoc),
    // ⚠️ `newHeroChecksFromDoc` 自己就是逐格 fallback，⛔ 不要在這裡再判一次 null。
    checks: newHeroChecksFromDoc(checksDoc),
    errors,
  };
}

// ---------------------------------------------------------------------------
// ⭐ 技能推薦 —— 讀說明找機制，所以先剝台詞
// ---------------------------------------------------------------------------

/**
 * ⭐ 把**角色台詞**從技能說明裡拿掉。CLAUDE.md 第〇·六守則①②：
 * 「任何讀技能說明找機制的東西（正則、閘、LLM、**編輯器的自動建議**）都要先剝掉
 * `「…」`」。這一頁的推薦就是「編輯器的自動建議」。
 *
 * ⚠️ 剝的是**整段** `「…」`（含跨行、含行中），⛔ 不是「行首是「的那幾行」——
 * 後者漏掉「造成 X 傷害「台詞」再造成 Y」這種寫法。
 * 與 `tools/skill-remake/batch1.py::_mechanics_text()` 同一條規則。
 */
export function mechanicsText(description: string): string {
  return description.replace(/「[^」]*」/g, "");
}

/**
 * 一個標籤可以用哪些**字串**去比對。
 *
 * ⛔ 這不是一張「標籤 → 技能」的手寫對照表（那會過期而且不會報錯），是一組**規則**：
 *   · 括號內外都算（`吸收(護盾)` → 吸收 / 護盾）
 *   · `・` 後面是細分，取主幹（`反彈・分型別` → 反彈）
 *   · 在**佔位符**（前面是空白、後面不是字母的單一大寫字母）處切斷
 *     （`靜止 N 秒` → 靜止；⚠️ `AP加成` 不切，因為 A 後面還是字母）
 *   · 少於兩個字的碎片丟掉
 */
export function tagCores(tag: string): string[] {
  const out: string[] = [];
  for (const seg of tag.split(/[（(）)]/)) {
    const trunk = seg.split("・")[0] ?? "";
    const cut = trunk.split(/(?:^|[\s　])[A-Z](?![A-Za-z])/)[0] ?? "";
    const s = cut.trim();
    if (s.length >= 2 && !out.includes(s)) out.push(s);
  }
  return out;
}

/** 一支技能拿去比對標籤的**文字**：名稱 + 剝掉台詞的說明。 */
export function abilityHaystack(card: AbilityCard): string {
  return `${card.name}\n${mechanicsText(card.description)}`;
}

/** 這支技能命中了哪些推薦標籤。 */
export function abilityTagHits(card: AbilityCard, tags: readonly string[]): string[] {
  const hay = abilityHaystack(card);
  return tags.filter((t) => tagCores(t).some((core) => hay.includes(core)));
}

export interface RankedAbility {
  readonly card: AbilityCard;
  readonly hits: readonly string[];
  /** 這支技能原本就住在這一格嗎（不符也可以選，見 {@link reslotAbilityDoc}）。 */
  readonly slotMatch: boolean;
}

/**
 * 依路線標籤排序候選技能。owner：「把帶那些標籤的技能排前面」——
 * 所以**命中數優先**，原本槽位相符只是同分時的次序。
 */
export function rankAbilities(
  cards: readonly AbilityCard[],
  tags: readonly string[],
  slot: HeroForgeSlot,
): RankedAbility[] {
  return cards
    .map((card) => ({ card, hits: abilityTagHits(card, tags), slotMatch: card.slot === slot }))
    .sort(
      (a, b) =>
        b.hits.length - a.hits.length ||
        Number(b.slotMatch) - Number(a.slotMatch) ||
        a.card.name.localeCompare(b.card.name),
    );
}

/** 這條路線推薦哪些標籤（認不得的路線名回空陣列 —— 見 `pageWarnings`）。 */
export function routeTags(route: string): readonly string[] {
  return tagsForRoute(route);
}

/** 一個出身有哪些路線（文案來自內容，可被 owner 改名）。 */
export function routesOf(catalog: HeroForgeCatalog, origin: Origin): readonly RouteInfo[] {
  return catalog.routes[origin].routes;
}

// ---------------------------------------------------------------------------
// 生成 → 警告 → 草稿
// ---------------------------------------------------------------------------

/** 表單 → `forgeChampion` 的輸入。 */
export function forgeInputFrom(form: HeroForgeForm, catalog: HeroForgeCatalog): ForgeInput {
  const medians = catalog.medians[archetypeForOrigin(form.origin)];
  const out: ForgeInput = {
    id: form.id.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    origin: form.origin,
    overrides: {
      attributes: overridesFor(form, "attributes") as Partial<AttributeSet>,
      baseStats: overridesFor(form, "baseStats"),
      growth: overridesFor(form, "growth"),
    },
  };
  if (form.attackType !== "") out.attackType = form.attackType;
  if (form.modelKey.trim() !== "") out.modelKey = form.modelKey.trim();
  if (medians) out.medians = medians;
  const ti = parseNum(form.totalInitial);
  if (ti !== null) out.totalInitial = ti;
  const tg = parseNum(form.totalGrowth);
  if (tg !== null) out.totalGrowth = tg;
  return out;
}

export function heroForgeResult(form: HeroForgeForm, catalog: HeroForgeCatalog): ForgeResult {
  return forgeChampion(forgeInputFrom(form, catalog));
}

/**
 * 生成當下**每一項**正規化屬性會被填成什麼（唯讀預覽）。
 *
 * ⛔ 在 2026-08-21 之前這裡只回三項（ms/mr/armor）而且底層寫死 TS 常數 ——
 * owner 在後台改了級距,這一格**還顯示舊值**。現在規則由呼叫端從 `Configs` 讀進來。
 */
export function normalizedRow(
  form: HeroForgeForm,
  rules?: StatNormalization,
): Record<NormalizedStatKey, number> {
  return normalizedPreview(archetypeForOrigin(form.origin), rules);
}

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * 頁面層的警告。⛔ **全部是 `warn`，一條都不擋** —— owner 2026-08-12：
 * 「只是個警告標記，並不會擋」。所以這個函式回傳的東西只餵給畫面，
 * ⛔ 不會有任何呼叫端拿它來 disable 儲存鈕。
 */
export function pageWarnings(
  form: HeroForgeForm,
  result: ForgeResult,
  catalog: HeroForgeCatalog,
  // ⭐ 預設**從目錄拿**（＝後台那一頁存的值），⛔ 不是出貨常數：寫死 DEFAULT_* 的話
  //   這一頁永遠讀不到 owner 關掉的那一條，而畫面上完全看不出來（第一守則的形狀）。
  checksConfig: NewHeroChecksConfig = catalog.checks,
): ForgeWarning[] {
  const out: ForgeWarning[] = [...result.warnings];
  const warn = (field: string, message: string): void => {
    out.push({ level: "warn", field, message });
  };
  const id = form.id.trim();
  if (id === "") warn("id", "沒有 id —— 草稿存不進內容庫（每一份文件都以 id 為鍵）。");
  else if (!ID_RE.test(id)) warn("id", `id「${id}」不是小寫 [a-z0-9] 加 . _ - 的形狀，schema 會拒收。`);
  if (form.name.trim() === "") warn("name", "沒有名稱 —— 選角畫面會顯示成一個空白格。");
  if (form.description.trim() === "") warn("description", "沒有說明 —— 選角畫面的角色介紹會是空的。");
  if (form.modelKey.trim() === "")
    warn("modelKey", "沒有指定模型 —— 草稿會用預設佔位模型，進場看到的不是這位英雄。");

  if (form.route === "") warn("route", "還沒選路線 —— ⑤ 選技能那一步不會有任何推薦排序。");
  else if (routeTags(form.route).length === 0)
    warn("route", `路線「${form.route}」沒有對應的推薦標籤（路線名被改過？）—— 推薦會退回原順序。`);

  const bad = badOverrideKeys(form);
  if (bad.length > 0) warn("overrides", `這些覆寫格填的不是數字，會被**忽略**：${bad.join(" / ")}`);

  const byId = new Map(catalog.abilities.map((a) => [a.id, a]));
  const empty: string[] = [];
  const seen = new Map<string, HeroForgeSlot[]>();
  for (const slot of HERO_FORGE_SLOTS) {
    const picked = form.picks[slot];
    if (picked === "") {
      empty.push(SLOT_LABEL[slot]);
      continue;
    }
    const list = seen.get(picked);
    if (list) list.push(slot);
    else seen.set(picked, [slot]);
    const card = byId.get(picked);
    if (!card) {
      warn(`picks.${slot}`, `${SLOT_LABEL[slot]} 挑的「${picked}」不在鑄技工坊目錄裡 —— 草稿會參照到一份不存在的技能。`);
      continue;
    }
    if (card.slot !== slot)
      warn(
        `picks.${slot}`,
        `${SLOT_LABEL[slot]} 挑的是原本的 ${card.slot} 技「${card.name}」—— 草稿會複製一份並改寫成 ${slot}，原技能不受影響。`,
      );
  }
  const core = empty.filter((l) => l !== SLOT_LABEL.PASSIVE && l !== SLOT_LABEL.EX);
  const opt = empty.filter((l) => l === SLOT_LABEL.PASSIVE || l === SLOT_LABEL.EX);
  if (core.length > 0)
    warn("picks", `這幾格還沒挑技能：${core.join(" / ")} —— Q/W/E/R 是必填，草稿會放空白佔位技，上架前要補。`);
  if (opt.length > 0)
    warn("picks", `${opt.join(" / ")} 沒挑 —— 草稿會**整格不寫**（這位英雄就是沒有），不是放一支空的。`);
  for (const [pickedId, slots] of seen) {
    if (slots.length > 1)
      warn("picks", `「${pickedId}」被放進 ${slots.map((s) => SLOT_LABEL[s]).join(" / ")} —— 同一支技能會被複製成好幾支。`);
  }
  if (catalog.errors.length > 0) warn("catalog", `鑄技工坊目錄沒有完整載入：${catalog.errors.join("；")}`);

  // ⭐ GH#480 —— 六欄與十一項屬性的**存檔當下**警示。
  //   ⛔ 拿掉這一段，整組警示就消失了，而這一頁看起來完全正常（接線類的形態）。
  out.push(...draftWarnings(form, result, catalog, checksConfig));
  return out;
}

/**
 * ⭐【GH#480】把 owner 點名的那組檢查接進這一頁。
 *
 * ⚠️ 它跑在**草稿文件**上（`heroForgeDocs` 的產出），⛔ 不是跑在表單上 ——
 * 表單與文件之間還隔著一層轉換（佔位技、槽位改寫、內嵌鏡射），而玩家拿到的是
 * **文件**。驗表單＝失敗形態⑤「被測的不是出貨的那個」。
 *
 * ⛔ 全部降級成 `warn`：這一頁的每一條警示都不擋（owner 2026-08-12
 * 「只是個警告標記，並不會擋」）。`block` 那一級只是在說「伺服器會 422」，
 * 它照樣只是一行字。
 */
export function draftWarnings(
  form: HeroForgeForm,
  result: ForgeResult,
  catalog: HeroForgeCatalog,
  config: NewHeroChecksConfig = DEFAULT_NEW_HERO_CHECKS,
): ForgeWarning[] {
  const docs = heroForgeDocs(form, result, catalog);
  return checkNewHeroDocs(
    docs.map((d) => ({ collection: d.collection, id: d.id, doc: d.doc })),
    { config },
  ).map((w) => ({
    level: "warn" as const,
    field: `${w.doc}·${w.field}`,
    message: `${w.level === "block" ? "⛔ 存不進去：" : ""}${w.message}`,
  }));
}

/**
 * 把一份技能文件搬到另一格。
 *
 * ⭐ **複製 + 換 id**，⛔ 不是共用同一個 id：共用的話兩位英雄從此是同一支技能，
 * 而且鏡射規則（`writePlan` 用「哪個英雄的哪一格內嵌了這個 id」找回英雄）會挑錯人。
 *
 * ⚠️ `innateKind` 是 `slot: "PASSIVE"` 的**必填**、其他槽位的**禁止**欄位
 * （`zAbilityDoc` 的 superRefine 兩個方向都關死）。所以換槽位一定要同時處理它，
 * 否則草稿在 schema 那一關就會被拒 —— 而拒絕訊息會指向 innateKind，不是這裡。
 */
export function reslotAbilityDoc(
  doc: Readonly<Record<string, unknown>>,
  slot: string,
  newId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc, id: newId, slot, schema: "ability@1" };
  if (slot === "PASSIVE") {
    if (typeof out["innateKind"] !== "string") {
      const effects = out["effects"];
      out["innateKind"] = Array.isArray(effects) && effects.length > 0 ? "active" : "passive";
    }
  } else {
    delete out["innateKind"];
    delete out["innateActivePassive"];
  }
  return out;
}

/** 語料 = 鑄技工坊目錄裡那 400+ 支技能的**原始文件**（中位數就從這裡量）。 */
export function abilityCorpus(catalog: HeroForgeCatalog): AbilityCorpusDoc[] {
  return catalog.abilities.map((a) => a.doc as AbilityCorpusDoc);
}

/**
 * ⭐ 這一格的六欄預設值（GH#480）—— 從**出貨語料**的中位數量出來，⛔ 不是寫死的數字。
 * ⚠️ 佔位技的施放型態沿用原本的 `self`（⛔ 換掉它是另一個決策，不在這一票裡）。
 */
export function slotDefaults(catalog: HeroForgeCatalog, slot: HeroForgeSlot): AbilityDefaults {
  // ⚠️ 樣本門檻走**後台那一格**（`config.new-hero-checks@1.minSample`），
  //   ⛔ 不是寫死的 `DEFAULT_MIN_SAMPLE` —— 那個常數現在只是它的出貨值。
  return deriveAbilityDefaults(abilityCorpus(catalog), slot, "self", {
    minSample: catalog.checks.minSample,
  });
}

/**
 * 還沒挑技能的那一格放的東西。
 *
 * ⭐ GH#480：它以前是**六欄全 0 + 沒有說明**的空殼（`cooldown:[0] manaCost:[0] range:0`），
 * 而 Zod 全部收得下（那幾格的界是 `.min(0)`）—— 也就是「生成完成」的新英雄可以六欄
 * 一格都沒填而 `content:build` 全綠。現在六欄由 {@link slotDefaults} 代入。
 * ⛔ 拿掉 `applyAbilityDefaults` 這一行，整個「生成代入」就消失了，而畫面上看不出來。
 */
function placeholderAbility(
  championId: string,
  slot: HeroForgeSlot,
  catalog: HeroForgeCatalog,
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    id: abilityIdFor(championId, slot),
    schema: "ability@1",
    name: `（未選 ${SLOT_LABEL[slot]}）`,
    slot,
    castType: "self",
    maxRank: 1,
    cooldown: [],
    manaCost: [],
    effects: [],
  };
  if (slot === "PASSIVE") doc["innateKind"] = "passive";
  return applyAbilityDefaults(doc, slotDefaults(catalog, slot));
}

/**
 * 草稿 = **一組**文件，不是一份。
 *
 * champion@1 把 Q/W/E/R **內嵌**（sim 讀的是內嵌那份），但 EX 與天生技是
 * `exAbility` / `passiveAbility` **參照**。所以一份單獨的英雄卡會有兩個懸空的
 * 參照，`content:build` 會紅。順序是**技能在前、英雄在後**，因為建立順序就是
 * 這樣（和 `heroTemplate.buildHeroDocs` 同一條規則）。
 */
export function heroForgeDocs(
  form: HeroForgeForm,
  result: ForgeResult,
  catalog: HeroForgeCatalog,
): HeroDoc[] {
  const championId = form.id.trim() === "" ? "new-hero" : form.id.trim();
  const byId = new Map(catalog.abilities.map((a) => [a.id, a]));
  const out: HeroDoc[] = [];
  /** 挑了就複製並改寫槽位；沒挑就給一支空白佔位（Q/W/E/R 是 schema 必填）。 */
  const standalone = (slot: HeroForgeSlot): Record<string, unknown> => {
    const card = byId.get(form.picks[slot]);
    const doc =
      card === undefined
        ? placeholderAbility(championId, slot, catalog)
        : reslotAbilityDoc(card.doc, slot, abilityIdFor(championId, slot));
    out.push({ collection: "abilities", id: doc["id"] as string, doc });
    return doc;
  };

  const embedded: Record<string, unknown> = {};
  for (const slot of ["Q", "W", "E", "R"] as const) embedded[slot] = embeddedForm(standalone(slot));

  const draft = result.draft;
  const champion: Record<string, unknown> = {
    id: championId,
    schema: "champion@1",
    name: draft.name === "" ? championId : draft.name,
    role: draft.role,
    attackType: draft.attackType,
    archetype: draft.archetype,
    modelKey: draft.modelKey,
    baseStats: { ...draft.baseStats },
    growth: { ...draft.growth },
    attributes: { ...draft.attributes },
    abilities: embedded,
    skillOrder: ["Q", "W", "E", "R"],
    buildPriority: [],
    tags: form.route === "" ? [form.origin] : [form.origin, form.route],
  };
  if (draft.description !== "") champion["description"] = draft.description;

  // 天生技與 EX 是**參照**，所以它們的獨立文件要先存在。
  // ⚠️ 沒挑就**整格不寫**，⛔ 不放佔位：champion@1 的檔頭寫得很清楚 ——
  //    「Absence is a recovered fact, never a TODO」。三位出貨英雄真的沒有天生技，
  //    給每一位新英雄塞一支空白 EX 會把「他沒有」變成「他有一支什麼都不做的」。
  if (byId.has(form.picks["PASSIVE"])) champion["passiveAbility"] = standalone("PASSIVE")["id"];
  if (byId.has(form.picks["EX"])) champion["exAbility"] = standalone("EX")["id"];

  out.push({ collection: "champions", id: championId, doc: champion });
  return out;
}

/** 草稿的 JSON（給 owner 複製）。 */
export function draftJson(docs: readonly HeroDoc[]): string {
  return JSON.stringify(
    docs.map((d) => ({ collection: d.collection, id: d.id, doc: d.doc })),
    null,
    2,
  );
}

/** 這一頁寫入的順序：技能全部在前，英雄最後（參照才解得開）。 */
export function writeOrder(docs: readonly HeroDoc[]): HeroDoc[] {
  return [...docs].sort((a, b) => Number(a.collection === "champions") - Number(b.collection === "champions"));
}

/** 這個出身內建的攻擊型態（null = 混血/均衡，作者要自己選）。 */
export function builtInAttackType(origin: Origin): "melee" | "ranged" | null {
  return ORIGIN_ATTACK_TYPE[origin];
}
