/**
 * heroTemplate — the PURE builder behind 新英雄模板 (owner spec step 3). Turns
 * one filled-in new-hero form into the COMPLETE bundle of documents a champion
 * needs to exist and pass the content bundle build, with NO network and NO DOM,
 * so the whole thing is unit-testable under plain node.
 *
 * ── WHY A CHAMPION IS NEVER ONE DOCUMENT ────────────────────────────────────
 * A champion@1 doc EMBEDS its Q/W/E/R (the sim reads the embedded copy — the
 * mirror rule) but only REFERENCES its EX and 天生技 (`exAbility` /
 * `passiveAbility`, HARD refs resolved through the abilities collection). The
 * content-api's per-doc `/validate` is schema-only; it does NOT check refs
 * (that is `validateReferences`, run by content:build). So a champion created
 * alone — even a schema-valid one — would dangle `exAbility`/`passiveAbility`
 * and break the bundle build. The wizard therefore emits the STANDALONE ability
 * twins too, and the caller creates abilities-before-champion.
 *
 * ── MINIMAL-VALID, NOT MINIMAL ──────────────────────────────────────────────
 * Every emitted doc satisfies the SHARED zod schema the game loader uses
 * (zAbilityDoc / zChampionDoc). A bare {id} 422s both. The embedded twins are
 * `embeddedForm(standalone)` — identical minus the `schema` discriminator the
 * embedded shape forbids — so `zChampionDoc`'s superRefine (embedded .slot ===
 * key) is satisfied from birth and the two copies can never disagree.
 *
 * This module DOES NOT WRITE. It returns docs; NewHeroPage validates them ALL
 * (validate-all-then-write discipline) then POSTs abilities-before-champion
 * through the same contentApi gate every other write rides.
 */
import { CORE_SLOTS, embeddedForm, type CoreSlot } from "@ggd/shared/content/editModel";
import {
  checkNewHeroDocs,
  newHeroChecksFromDoc,
  DEFAULT_NEW_HERO_CHECKS,
  type NewHeroChecksConfig,
  type NewHeroWarning,
} from "@ggd/shared/content/newHeroChecks";
import {
  applyAbilityDefaults,
  deriveAbilityDefaults,
  type AbilityCorpusDoc,
} from "@ggd/shared/content/newHeroDefaults";

export type CastType = "targeted" | "skillshot" | "ground" | "self" | "dash";
export const CAST_TYPES: readonly CastType[] = ["targeted", "skillshot", "ground", "self", "dash"];

/** One ability row of the form (Q/W/E/R + EX + PASSIVE share this shape). */
export interface AbilityRow {
  readonly name: string;
  readonly castType: CastType;
  readonly maxRank: number;
  /** single cooldown seconds — expands to a length-1 per-rank array */
  readonly cooldown: number;
  /** single mana cost — expands to a length-1 per-rank array */
  readonly manaCost: number;
  readonly range: number;
}

export interface HeroTemplateForm {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly attackType: "melee" | "ranged";
  readonly modelKey: string;
  /** optional content-relative icon (must start with assets/ if present) */
  readonly icon?: string;
  readonly tags: readonly string[];
  /** partial stat block — {} is valid */
  readonly baseStats: Readonly<Record<string, number>>;
  readonly growth: Readonly<Record<string, number>>;
  readonly skillOrder: readonly CoreSlot[];
  // ⛔ GH#474 —— `buildPriority` 不再是一格表單欄位（owner 2026-08-20「拔乾淨」）。
  //    ⇒ 這個型別上**沒有這一格**，送出時一律寫 `[]`（見 emitDocs）。
  readonly q: AbilityRow;
  readonly w: AbilityRow;
  readonly e: AbilityRow;
  readonly r: AbilityRow;
  /** emitted only when filled in (not every hero has an EX) */
  readonly ex: AbilityRow | null;
  /** emitted only when filled in (three real heroes have no 天生技) */
  readonly passive: AbilityRow | null;
}

/** A single emitted document, ready for api.validate() then api.create(). */
export interface HeroDoc {
  readonly collection: "champions" | "abilities";
  readonly id: string;
  readonly doc: Record<string, unknown>;
}

export function blankAbilityRow(): AbilityRow {
  return { name: "", castType: "self", maxRank: 1, cooldown: 0, manaCost: 0, range: 0 };
}

export function blankHeroForm(): HeroTemplateForm {
  return {
    id: "",
    name: "",
    role: "fighter",
    attackType: "melee",
    modelKey: "",
    tags: [],
    baseStats: {},
    growth: {},
    skillOrder: ["Q", "W", "E", "R"],
    q: blankAbilityRow(),
    w: blankAbilityRow(),
    e: blankAbilityRow(),
    r: blankAbilityRow(),
    ex: null,
    passive: null,
  };
}

/** id of the standalone ability doc for a slot: `<championId>.<lowerslot>`. */
export function abilityIdFor(championId: string, slot: string): string {
  return `${championId}.${slot.toLowerCase()}`;
}

/** Minimal-valid ability@1 standalone doc from one row. */
function abilityDoc(
  championId: string,
  slot: string,
  row: AbilityRow,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const id = abilityIdFor(championId, slot);
  return {
    id,
    schema: "ability@1",
    name: row.name.trim() === "" ? id : row.name.trim(),
    slot,
    castType: row.castType,
    maxRank: row.maxRank,
    cooldown: [row.cooldown],
    manaCost: [row.manaCost],
    range: row.range,
    effects: [],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// ⭐【GH#480】六欄的**生成代入** —— 語料是抓回來的，⛔ 不是寫死的數字
// ---------------------------------------------------------------------------

/**
 * 這一頁做「生成代入」需要的兩樣東西。
 *
 * ⚠️ `corpus` 空的時候**一格都不代入**（⛔ 不是退回一組保守值）：
 * `deriveAbilityDefaults` 讀不到語料時會回 `basis: "fallback"` 的數字，而那組數字
 * 與「量出來的中位數」在畫面上長得一模一樣 —— 悄悄用它就是把一次讀檔失敗變成
 * 六個沒有出處的數字。讀不到就讓 `empty-column` 警示照舊亮，那是**大聲**的那一邊。
 */
export interface NewHeroContext {
  readonly corpus: readonly AbilityCorpusDoc[];
  /** `config.new-hero-checks@1` —— 六條開關 + 樣本門檻 + 要不要自動生說明。 */
  readonly checks: NewHeroChecksConfig;
  /** 讀不到的東西。⛔ 不要靜默降級（fail-open 必須有人說出來）。 */
  readonly errors: readonly string[];
}

export function emptyNewHeroContext(): NewHeroContext {
  return { corpus: [], checks: DEFAULT_NEW_HERO_CHECKS, errors: [] };
}

/**
 * 抓語料與開關。
 *
 * ⭐ 語料走 **`/content/bundle.json` 一個 GET**，⛔ 不是逐份抓 420 支技能
 * （鑄英雄工坊那一頁走索引 + 400 多次 fetch，那正是這一頁一直沒有代入的原因）。
 * bundle 已經把每一份文件內嵌在裡面，所以一次請求就拿得到整份語料，
 * ⛔ 而且它**不會過期** —— 它就是客戶端載入的那一份，不是另外產一份會 drift 的表。
 */
export async function loadNewHeroContext(
  opts: { fetchFn?: typeof fetch; base?: string } = {},
): Promise<NewHeroContext> {
  const fetchFn = opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = opts.base ?? "/content";
  const errors: string[] = [];
  const getJson = async (url: string): Promise<unknown> => {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return (await res.json()) as unknown;
  };
  const safe = async (what: string, url: string): Promise<unknown> => {
    try {
      return await getJson(url);
    } catch (err) {
      errors.push(`${what}：${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  const [bundle, checksDoc] = await Promise.all([
    safe("技能語料（bundle）", `${base}/bundle.json`),
    safe("新英雄檢查警示開關", `${base}/config/new-hero-checks.json`),
  ]);
  const corpus = abilityCorpusFromBundle(bundle);
  if (bundle !== null && corpus.length === 0) {
    errors.push("bundle 讀到了，但一支技能都取不出來 —— 六欄不會代入（讀取器壞了，⛔ 不是內容空了）。");
  }
  return { corpus, checks: newHeroChecksFromDoc(checksDoc), errors };
}

/** `bundle.json` → 技能語料。形狀對不上就回空陣列（呼叫端會把它變成一句錯誤）。 */
export function abilityCorpusFromBundle(bundle: unknown): AbilityCorpusDoc[] {
  const collections = (bundle as { collections?: unknown } | null)?.collections;
  if (!collections || typeof collections !== "object") return [];
  const entries = (collections as Record<string, { entries?: unknown }>)["abilities"]?.entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) => (e as { doc?: unknown } | null)?.doc)
    .filter((d): d is AbilityCorpusDoc => !!d && typeof d === "object");
}

/**
 * Build the full document bundle. Order: the four core abilities, then EX and
 * PASSIVE if present, then the champion LAST — which is exactly the create
 * order (abilities-before-champion) so the champion's refs already resolve.
 *
 * ⭐【GH#480】每一支技能出生時六欄由 {@link NewHeroContext} 的中位數**代入**。
 * ⚠️ 代入必須發生在 `embeddedForm()` **之前** —— champion@1 內嵌的那一份才是 sim
 * 真的讀的（鏡像規則）。順序反過來的話，獨立文件有預設值而內嵌那份是空的，
 * 而兩份都通過 schema、兩份都不會有任何東西紅。
 */
export function buildHeroDocs(
  form: HeroTemplateForm,
  ctx: NewHeroContext = emptyNewHeroContext(),
): HeroDoc[] {
  const id = form.id.trim();
  const rows: Record<CoreSlot, AbilityRow> = { Q: form.q, W: form.w, E: form.e, R: form.r };
  const filled = (doc: Record<string, unknown>): Record<string, unknown> =>
    applyDefaultsTo(doc, ctx);

  const out: HeroDoc[] = [];
  const embeddedAbilities: Record<string, Record<string, unknown>> = {};
  for (const slot of CORE_SLOTS) {
    const doc = filled(abilityDoc(id, slot, rows[slot]));
    out.push({ collection: "abilities", id: doc["id"] as string, doc });
    embeddedAbilities[slot] = embeddedForm(doc);
  }

  const champion: Record<string, unknown> = {
    id,
    schema: "champion@1",
    name: form.name.trim() === "" ? id : form.name.trim(),
    role: form.role.trim() === "" ? "fighter" : form.role.trim(),
    attackType: form.attackType,
    modelKey: form.modelKey.trim(),
    baseStats: { ...form.baseStats },
    growth: { ...form.growth },
    abilities: embeddedAbilities,
    skillOrder: [...form.skillOrder],
    // ⛔ GH#474 —— 一律空的。`champion@1` 仍然要求這一格存在，但「推薦出裝」
    //    這個機制已經退場（owner 2026-08-20「拔乾淨」），⇒ 新英雄不會帶著梯子出生。
    buildPriority: [],
    tags: [...form.tags],
  };
  if (form.icon !== undefined && form.icon.trim() !== "") champion["icon"] = form.icon.trim();

  if (form.ex) {
    const raw = abilityDoc(id, "ex", form.ex);
    raw["slot"] = "EX";
    const ex = filled(raw);
    out.push({ collection: "abilities", id: ex["id"] as string, doc: ex });
    champion["exAbility"] = ex["id"];
  }

  if (form.passive) {
    // slot PASSIVE requires innateKind; passive-only ⇒ effects stay [] and
    // innateKind must be "passive" (an "active" innate would need effects).
    const raw = abilityDoc(id, "passive", form.passive, { innateKind: "passive" });
    raw["slot"] = "PASSIVE";
    // ⚠️ 天生技的 `effects` **必須留空**（`zAbilityDoc` 只讓 innateKind:"active"
    //   帶效果），所以【傷害】那一欄對它是「不適用」—— `columnApplies` 已經知道
    //   這件事，代入時一格都不會塞。
    const passive = filled(raw);
    out.push({ collection: "abilities", id: passive["id"] as string, doc: passive });
    champion["passiveAbility"] = passive["id"];
  }

  out.push({ collection: "champions", id, doc: champion });
  return out;
}

/**
 * 一支技能草稿 → 補上六欄。⛔ 只填空的格子，作者填過的一格都不動。
 *
 * ⛔ 語料是空的就**原樣回傳** —— 見 {@link NewHeroContext} 的註解。
 */
function applyDefaultsTo(
  doc: Record<string, unknown>,
  ctx: NewHeroContext,
): Record<string, unknown> {
  if (ctx.corpus.length === 0) return doc;
  const slot = String(doc["slot"] ?? "");
  const castType = String(doc["castType"] ?? "self") as CastType;
  const defaults = deriveAbilityDefaults(ctx.corpus, slot, castType, {
    minSample: ctx.checks.minSample,
  });
  return applyAbilityDefaults(doc, defaults, { description: ctx.checks.autofillDescription });
}

/**
 * ⭐【GH#480】這一批草稿的**存檔當下**警示。
 *
 * ⚠️ 這一頁與「新英雄轉生設計」是兩個入口，但它們**共用同一組判斷**
 * （`@ggd/shared/content/newHeroChecks`）—— ⛔ 兩份判斷會分岔，而分岔的那一天
 * 同一份草稿在兩頁會得到相反的結論，兩邊各自都是綠的。
 *
 * ⭐ 六欄的生成代入在 2026-08-20 補上了（{@link buildHeroDocs} 吃
 * {@link NewHeroContext}）—— 語料走 `bundle.json` **一個 GET**，⛔ 不是 400+ 次。
 *
 * ⭐ `checks` 預設是出貨值；呼叫端把 {@link NewHeroContext.checks} 傳進來，
 * 於是後台「新英雄檢查警示」那一頁關掉的規則在這裡真的不會跳。
 */
export function heroDocWarnings(
  docs: readonly HeroDoc[],
  checks: NewHeroChecksConfig = DEFAULT_NEW_HERO_CHECKS,
): NewHeroWarning[] {
  return checkNewHeroDocs(
    docs.map((d) => ({ collection: d.collection, id: d.id, doc: d.doc })),
    { config: checks },
  );
}
