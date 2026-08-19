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
import { checkNewHeroDocs, type NewHeroWarning } from "@ggd/shared/content/newHeroChecks";

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
  readonly buildPriority: readonly string[];
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
    buildPriority: [],
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

/**
 * Build the full document bundle. Order: the four core abilities, then EX and
 * PASSIVE if present, then the champion LAST — which is exactly the create
 * order (abilities-before-champion) so the champion's refs already resolve.
 */
export function buildHeroDocs(form: HeroTemplateForm): HeroDoc[] {
  const id = form.id.trim();
  const rows: Record<CoreSlot, AbilityRow> = { Q: form.q, W: form.w, E: form.e, R: form.r };

  const out: HeroDoc[] = [];
  const embeddedAbilities: Record<string, Record<string, unknown>> = {};
  for (const slot of CORE_SLOTS) {
    const doc = abilityDoc(id, slot, rows[slot]);
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
    buildPriority: [...form.buildPriority],
    tags: [...form.tags],
  };
  if (form.icon !== undefined && form.icon.trim() !== "") champion["icon"] = form.icon.trim();

  if (form.ex) {
    const ex = abilityDoc(id, "ex", form.ex);
    ex["slot"] = "EX";
    out.push({ collection: "abilities", id: ex["id"] as string, doc: ex });
    champion["exAbility"] = ex["id"];
  }

  if (form.passive) {
    // slot PASSIVE requires innateKind; passive-only ⇒ effects stay [] and
    // innateKind must be "passive" (an "active" innate would need effects).
    const passive = abilityDoc(id, "passive", form.passive, { innateKind: "passive" });
    passive["slot"] = "PASSIVE";
    out.push({ collection: "abilities", id: passive["id"] as string, doc: passive });
    champion["passiveAbility"] = passive["id"];
  }

  out.push({ collection: "champions", id, doc: champion });
  return out;
}

/**
 * ⭐【GH#480】這一批草稿的**存檔當下**警示。
 *
 * ⚠️ 這一頁與「新英雄轉生設計」是兩個入口，但它們**共用同一組判斷**
 * （`@ggd/shared/content/newHeroChecks`）—— ⛔ 兩份判斷會分岔，而分岔的那一天
 * 同一份草稿在兩頁會得到相反的結論，兩邊各自都是綠的。
 *
 * ⛔ 這一頁**沒有**六欄的生成代入：它不抓技能語料（那要 400+ 次 fetch），
 * 所以中位數量不出來。缺口寫在 GH#480 的回報裡 —— 一份可以被前端 GET 的
 * 預設表（`config/new-hero-defaults`）落地之後，這裡接上去就是一行。
 */
export function heroDocWarnings(docs: readonly HeroDoc[]): NewHeroWarning[] {
  return checkNewHeroDocs(docs.map((d) => ({ collection: d.collection, id: d.id, doc: d.doc })));
}
