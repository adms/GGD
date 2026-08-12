/**
 * Content-side registries for the NEW collections (arenas/config/models/vfx/
 * status-effects) + `registerAll`, which pushes a loaded ContentStore into
 * BOTH the existing sim registries (their register() API unchanged) and these.
 */
import {
  Abilities,
  Augments,
  Items,
  LootTables,
  Projectiles,
  Statuses,
  registerChampion,
} from "../sim/content/registry";
import type {
  AbilityDef,
  AugmentDef,
  ChampionDef,
  ItemDef,
  LootTable,
  ProjectileDef,
} from "../sim/content/defs";
import type { ContentStore } from "./store";
import type { ArenaDoc } from "./schema/arena";
import type { ConfigDoc } from "./schema/config";
import type { ModelDoc } from "./schema/model";
import type { AnyVfxDoc, RibbonDoc, VfxDoc } from "./schema/vfx";
import type { StatusEffectDoc } from "./schema/statusEffect";
import type { SkinDoc } from "./schema/skin";
import type { TemplateDoc } from "./schema/template";
import { zAbilityDef, zAbilityDoc } from "./schema/ability";
// AoE 四級距 → 半徑。全專案唯一的查表處，理由寫在那支檔案。
import { aoeTiersFromDoc, resolveRadiusTier } from "./aoeTiers";
// 英雄屬性正規化（owner 2026-08-12）。全專案唯一知道「級別怎麼變成數字」的地方。
import {
  resolveChampionStats,
  statNormalizationFromDoc,
  type StatResolveDeps,
  type NormalizedStatKey,
} from "./statNormalization";
// ⭐ 反解要用**出貨的**那支算式，⛔ 不自己抄公式（失敗形態⑤）。
//   注入而不是讓 `statNormalization.ts` 自己 import —— `content/` → `sim/stats/`
//   那條邊會做出模組初始化循環（2026-08-12 實測，見那個檔的 `StatResolveDeps`）。
import { championStatBase } from "../sim/stats/attributes";
import { Stat } from "../sim/stats/statTypes";
import {
  hasTemplateBinding,
  resolveTemplateExpansion,
  type TemplateResolveFailure,
} from "./templates/resolve";
import {
  recordTemplateExpansionFailures,
  templateExpansionFailureSummary,
  type TemplateExpansionFailure,
} from "./templates/failures";

class ContentRegistry<V extends { id: string }> {
  private map = new Map<string, V>();

  register(v: V): void {
    this.map.set(v.id, v);
  }
  get(id: string): V {
    const v = this.map.get(id);
    if (!v) throw new Error(`content not registered: ${id}`);
    return v;
  }
  tryGet(id: string): V | undefined {
    return this.map.get(id);
  }
  all(): V[] {
    return [...this.map.values()];
  }
  ids(): string[] {
    return [...this.map.keys()];
  }
  clear(): void {
    this.map.clear();
  }
}

export const Arenas = new ContentRegistry<ArenaDoc>();
export const Configs = new ContentRegistry<ConfigDoc>();
export const Models = new ContentRegistry<ModelDoc>();
export const VfxDefs = new ContentRegistry<VfxDoc>();
/** ribbon@1 docs (same `vfx` collection, split out at registration). */
export const RibbonDefs = new ContentRegistry<RibbonDoc>();
export const StatusEffects = new ContentRegistry<StatusEffectDoc>();
export const Skins = new ContentRegistry<SkinDoc>();

/** One field where a champion's embedded ability copy disagrees with the standalone doc. */
export interface AbilityMirrorDrift {
  readonly championId: string;
  readonly slot: "Q" | "W" | "E" | "R";
  readonly abilityId: string;
  readonly field: string;
  /** value in content/abilities/<id>.json — the one that now wins at runtime */
  readonly standalone: unknown;
  /** value in content/champions/<id>.json `abilities[slot]` — ignored unless the standalone omits it */
  readonly embedded: unknown;
}

/**
 * Find every field where a champion's embedded ability copy disagrees with the
 * standalone ability doc (the MIRROR RULE the content editor enforces on save,
 * and that any hand edit to one file alone breaks).
 *
 * Since `registerChampion` made the standalone doc authoritative this no longer
 * changes what the sim does — but it is still worth shouting about, because the
 * embedded copy is what a stale champion doc will keep showing anywhere that
 * reads `Champions.get(id).abilities[slot]` off a doc that never went through
 * registration (raw-doc consumers: the codex browser, the admin content page).
 *
 * Pure: takes the store, mutates nothing.
 */
export function auditAbilityMirrorDrift(store: ContentStore): AbilityMirrorDrift[] {
  const standalone = new Map<string, Record<string, unknown>>();
  for (const d of store.all<AbilityDef>("abilities")) {
    standalone.set(d.id, d as unknown as Record<string, unknown>);
  }

  const out: AbilityMirrorDrift[] = [];
  for (const champ of store.all<ChampionDef>("champions")) {
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const emb = champ.abilities[slot] as unknown as Record<string, unknown> | undefined;
      if (!emb) continue;
      const std = standalone.get(champ.abilities[slot]!.id);
      if (!std) continue; // embedded-only ability: nothing to disagree with
      for (const field of [...new Set([...Object.keys(std), ...Object.keys(emb)])].sort()) {
        if (field === "schema") continue; // only the standalone doc carries a schema tag
        const a = std[field];
        const b = emb[field];
        if (a === b || stable(a) === stable(b)) continue;
        out.push({
          championId: champ.id,
          slot,
          abilityId: champ.abilities[slot]!.id,
          field,
          standalone: a,
          embedded: b,
        });
      }
    }
  }
  return out;
}

/** Order-insensitive-enough structural compare for drift detection. */
function stable(v: unknown): string {
  return JSON.stringify(v) ?? "undefined";
}

/**
 * Register every loaded doc.
 *
 * ORDER IS LOAD-BEARING: standalone `abilities` go in BEFORE `champions`, and
 * `registerChampion` will not overwrite an ability that is already registered
 * (it only fills fields the standalone doc omits). That is what makes
 * `content/abilities/<id>.json` the source of truth rather than the
 * denormalised copy embedded in the champion doc. See `registerChampion`.
 */
/** `NormalizedStatKey` → 引擎的 `Stat`。⚠️ 加新 key 時這裡漏一格 = 那一項靜默不生效。 */
const STAT_OF: Readonly<Record<NormalizedStatKey, Stat>> = Object.freeze({
  ms: Stat.MoveSpeed,
  mr: Stat.MagicResist,
  armor: Stat.Armor,
  maxHealth: Stat.MaxHealth,
  maxMana: Stat.MaxMana,
  ad: Stat.AttackDamage,
  ap: Stat.AbilityPower,
  as: Stat.AttackSpeed,
  healthRegen: Stat.HealthRegen,
  manaRegen: Stat.ManaRegen,
});

const STAT_RESOLVE_DEPS: StatResolveDeps = Object.freeze({
  // ⚠️ `championStatBase` 直接讀 `def.baseStats[stat]` 與 `def.growth[stat]`，
  //    兩個欄位**都假設存在**。註冊路徑收得到還沒補齊的文件（骨架、測試夾具、
  //    只寫了一半的內容），所以這裡補上預設 —— ⛔ 不改 `championStatBase`，
  //    那支是熱路徑，而缺欄位是**這個接縫**才會遇到的事。
  statAt: (def: unknown, key: NormalizedStatKey, level: number): number => {
    const d = def as { baseStats?: unknown; growth?: unknown };
    const safe = { ...(d as object), baseStats: d.baseStats ?? {}, growth: d.growth ?? {} };
    return championStatBase(safe as never, STAT_OF[key], level);
  },
});

export function registerAll(store: ContentStore, options: RegisterAllOptions = {}): void {
  // 鑄技工坊: build the template map first, then expand any templated ability at
  // registration time — BOTH the standalone doc AND its champion-embedded twin,
  // so the store-authoritative standalone and the sim-read embedded copy get the
  // SAME expansion. Store ref+params on disk (NOT the expanded output) so a
  // template upgrade re-expands every referencing skill next load (design §2.2).
  const templates = new Map<string, TemplateDoc>(
    store.all<TemplateDoc>("ability-templates").map((t) => [t.id, t]),
  );
  const onFailure = options.onTemplateFailure ?? "degrade";
  const failures: TemplateExpansionFailure[] = [];
  // ⭐ 級距解析包在展開**之後**：模板也可以填 `radiusTier`，而且兩條路
  //   （standalone 與 champion-embedded）必須拿到同一個答案 —— 只包一邊就是
  //   「商店顯示 6.0、場上打 4.5」那種對不起來的死法。
  const expandStandalone = (d: AbilityDef): AbilityDef =>
    withRadiusTier(expandIfTemplated(d, templates, true, onFailure, failures, undefined));
  const expandEmbedded =
    (championId: string, slot: string) =>
    (d: AbilityDef): AbilityDef =>
      withRadiusTier(
        expandIfTemplated(d, templates, false, onFailure, failures, { championId, slot }),
      );

  // AoE 級距表要在**技能之前**讀出來（owner 2026-08-11「原則上不寫範圍數字」）。
  // ⚠️ `Configs.register` 那一圈跑在技能之後，所以這裡直接讀 store —— 讀註冊表
  // 會拿到上一次載入留下的那一份，那是一個安靜的跨載入污染。
  // ⚠️ 不是 `store.all<ConfigDoc>` —— 匯出的 `ConfigDoc` 其實只是
  //    `zConfigMatchDoc` 的 infer（`schema/config.ts:5177`），不是那個
  //    discriminated union。用它會讓這一行的 `.schema` 比對被 tsc 判成永遠 false。
  const aoeTiers = aoeTiersFromDoc(
    store.all<{ schema?: string }>("config").find((c) => c.schema === "config.aoe-tiers@1"),
  );
  const withRadiusTier = (d: AbilityDef): AbilityDef => resolveRadiusTier(d as never, aoeTiers);

  // 英雄屬性正規化：同樣要在**英雄註冊之前**讀（`Configs.register` 那一圈在後面）。
  // ⭐ 一個 seam，接在 registerChampion 的正上方 —— 商店預覽 / 選人畫面 / 後台
  //   全部走同一份註冊表，所以不會出現「這裡顯示舊值、場上跑新值」。
  const statNorm = statNormalizationFromDoc(
    store.all<{ schema?: string }>("config").find((c) => c.schema === "config.stat-normalization@1"),
  );

  for (const d of store.all<ProjectileDef>("projectiles")) Projectiles.register(d.id, d);
  for (const d of store.all<ItemDef>("items")) Items.register(d.id, d);
  for (const d of store.all<AugmentDef>("augments")) Augments.register(d.id, d);
  for (const d of store.all<AbilityDef>("abilities")) {
    const e = expandStandalone(d);
    Abilities.register(e.id, e);
  }
  for (const d of store.all<ChampionDef>("champions")) {
    registerChampion(
      resolveChampionStats(
        expandChampionTemplates(d, expandEmbedded) as never,
        statNorm,
        STAT_RESOLVE_DEPS,
      ),
    );
  }
  for (const d of store.all<LootTable>("loot-tables")) LootTables.register(d.id, d);
  for (const d of store.all<ArenaDoc>("arenas")) Arenas.register(d);
  for (const d of store.all<ConfigDoc>("config")) Configs.register(d);
  for (const d of store.all<ModelDoc>("models")) Models.register(d);
  for (const d of store.all<AnyVfxDoc>("vfx")) {
    if (d.schema === "ribbon@1") RibbonDefs.register(d);
    else VfxDefs.register(d);
  }
  for (const d of store.all<StatusEffectDoc>("status-effects")) StatusEffects.register(d);
  // sim 那一側只要 `polarity` 與 `tags`(A4b/#278;`tags` 2026-08-08 加)。
  // 兩張表分開是刻意的:UI 讀 `StatusEffects` 拿名字與圖示,sim 讀 `Statuses` 拿
  // 它**真的會拿來分岔**的那幾格,而 `sim/**` 不 import `content/**`(那條分層
  // 今天是乾淨的,別弄髒它)。
  // ⚠️ `tags` 一定要從這裡帶過去,不能讓 sim 自己維護一份 id→類別表:
  // 「暈眩」在出貨內容裡是五份不同的文件,而條件葉 `{kind:"status", tag:"stun"}`
  // 問的就是「任何一份」。這一行漏掉的話,那顆葉子會對每一個目標回 false ——
  // 一個從畫面上看起來跟「條件沒成立」一模一樣的死法(七種失敗形態 ②)。
  for (const d of store.all<StatusEffectDoc>("status-effects")) {
    Statuses.register(d.id, { polarity: d.polarity, tags: d.tags });
  }
  for (const d of store.all<SkinDoc>("skins")) Skins.register(d);

  // ---- 要大聲 ----------------------------------------------------------------
  // Everything above finished. If anything degraded, say so ONCE, in a line the
  // deploy smoke test can grep next to `[client] content loaded: …`, and park
  // the full records where they can still be read after the console is gone.
  if (failures.length > 0) {
    recordTemplateExpansionFailures(failures);
    console.error(`[content] ${templateExpansionFailureSummary(failures)}`);
  }
}

/**
 * 決策點 (CLAUDE.md 第一守則): what a template that will not expand should do.
 *
 * `"degrade"` (shipped default) — only the offending skill is affected; every
 * other champion, item, arena and config registers normally. `"throw"` keeps the
 * pre-2026-08-02 behaviour, which is genuinely what an OFFLINE tool wants: a
 * content-build or an audit script would rather stop than emit a set with a
 * silently dead skill in it.
 *
 * ⚠️ This is an argument rather than a `content/config/*.json` field ONLY because
 * `schema/config.ts` is under concurrent edit by another lane; the field is the
 * right home and is named as follow-up work rather than quietly skipped. The
 * default is not a coin-flip: the runtime consumer is the game client, and the
 * failure this replaces is the 2026-08-01 empty-champion-select outage.
 */
export interface RegisterAllOptions {
  readonly onTemplateFailure?: "degrade" | "throw";
}

/**
 * The marker a degraded skill wears IN THE GAME.
 *
 * ⚠️ This is the third of the three signals, and the only one a PLAYER can see.
 * The ledger and the boot log both need someone to go looking; the tooltip is
 * read by whoever is standing in front of the broken skill wondering why nothing
 * happened. 靜默降級 — content that half-dies and looks exactly like content that
 * is fine — is the failure shape this project has paid for most often, so the
 * degraded def says what happened in the one place it cannot be missed.
 *
 * It is stamped on BOTH `description` and `descriptionRoles`, because
 * `ui/components/abilityText.ts` PREFERS the role markup when it exists — marking
 * only `description` would put the notice on the field nobody renders (失敗形態
 * ①: 畫在畫面外). Runtime only: nothing here is ever written back to disk.
 */
export const DEGRADED_ABILITY_NOTE = "⚠️【模板展開失敗，此技能目前沒有效果】";

/** A doc that MAY carry the Skill-Forge template link (the field the sim type omits). */
type MaybeTemplated = { readonly template?: unknown };

/** Where an embedded twin came from, for the failure record. */
interface EmbeddedOrigin {
  readonly championId: string;
  readonly slot: string;
}

/**
 * If `doc` references a template, expand it and re-validate the result with the
 * shared schema (standalone → zAbilityDoc keeps the `schema` tag; embedded →
 * zAbilityDef, which forbids it). Non-templated docs pass through untouched.
 *
 * ⚠️ FAILURE IS ISOLATED TO THIS ONE SKILL. It used to `throw`, from inside
 * `registerAll`'s loop — see the header of `templates/resolve.ts` for what that
 * cost. Under the shipped `"degrade"` policy a skill that will not expand is
 * still registered (so its champion, and every OTHER champion, still exists),
 * carrying only what a human hand-wrote on the doc, wearing
 * {@link DEGRADED_ABILITY_NOTE}, and with a record in the failure ledger.
 */
function expandIfTemplated(
  doc: AbilityDef,
  templates: Map<string, TemplateDoc>,
  standalone: boolean,
  onFailure: "degrade" | "throw",
  sink: TemplateExpansionFailure[],
  origin: EmbeddedOrigin | undefined,
): AbilityDef {
  const raw = doc as unknown as Record<string, unknown>;
  if (!hasTemplateBinding(raw)) return doc;

  const resolution = resolveTemplateExpansion(raw, templates);
  if (resolution.ok) {
    const parsed = standalone
      ? zAbilityDoc.safeParse(resolution.merged)
      : zAbilityDef.safeParse(resolution.merged);
    if (parsed.success) return parsed.data as unknown as AbilityDef;
    // The expansion ran but produced a doc the schema rejects — a template bug,
    // not a content bug, and exactly as fatal to this skill as a missing ref.
    return handleFailure(
      doc,
      { phase: "expand", refs: resolution.refs, missingRefs: [], message: zodMessage(parsed.error) },
      standalone,
      onFailure,
      sink,
      origin,
    );
  }
  return handleFailure(doc, resolution.failure, standalone, onFailure, sink, origin);
}

function zodMessage(err: { issues: readonly { path: PropertyKey[]; message: string }[] }): string {
  const first = err.issues[0];
  return first === undefined
    ? "expansion failed schema validation"
    : `expansion failed schema validation at ${first.path.join(".") || "(root)"}: ${first.message}`;
}

/**
 * Degrade ONE ability (or, under `"throw"`, take the process down the way the
 * pre-2026-08-02 code did).
 *
 * The degraded def:
 *  · keeps the hand-authored `effects` and nothing else the template promised —
 *    never a guess, so the skill is inert rather than approximately right;
 *  · DROPS the `template` link, because a link that cannot expand must not go on
 *    looking expandable to whatever reads the registered def next;
 *  · carries {@link DEGRADED_ABILITY_NOTE} on both tooltip fields.
 * If even that will not parse (a doc broken beyond its template link) the raw
 * doc is returned unparsed — this function NEVER throws under `"degrade"`,
 * because a throw here is the whole defect coming back.
 */
function handleFailure(
  doc: AbilityDef,
  failure: TemplateResolveFailure,
  standalone: boolean,
  onFailure: "degrade" | "throw",
  sink: TemplateExpansionFailure[],
  origin: EmbeddedOrigin | undefined,
): AbilityDef {
  const where = origin === undefined ? "standalone" : "embedded";
  const detail =
    `ability ${doc.id} (${where}${origin ? ` ${origin.championId}.${origin.slot}` : ""}): ` +
    failure.message;
  if (onFailure === "throw") throw new Error(detail);

  const raw = doc as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };
  delete out["template"];
  const effects = Array.isArray(raw["effects"]) ? (raw["effects"] as unknown[]) : [];
  out["effects"] = effects;
  out["description"] = DEGRADED_ABILITY_NOTE + stringOr(raw["description"], "");
  if (typeof raw["descriptionRoles"] === "string") {
    out["descriptionRoles"] = DEGRADED_ABILITY_NOTE + raw["descriptionRoles"];
  }

  sink.push({
    abilityId: doc.id,
    where,
    ...(origin === undefined ? {} : { championId: origin.championId, slot: origin.slot }),
    phase: failure.phase,
    refs: failure.refs,
    missingRefs: failure.missingRefs,
    message: failure.message,
    degradedEffectCount: effects.length,
  });

  const parsed = standalone ? zAbilityDoc.safeParse(out) : zAbilityDef.safeParse(out);
  return (parsed.success ? parsed.data : out) as unknown as AbilityDef;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

/** Expand the four embedded Q/W/E/R twins of a champion in place (immutably). */
function expandChampionTemplates(
  def: ChampionDef,
  expandEmbedded: (championId: string, slot: string) => (d: AbilityDef) => AbilityDef,
): ChampionDef {
  const slots = ["Q", "W", "E", "R"] as const;
  let changed = false;
  const abilities = { ...def.abilities };
  for (const slot of slots) {
    const emb = def.abilities[slot];
    if ((emb as unknown as MaybeTemplated).template === undefined) continue;
    abilities[slot] = expandEmbedded(def.id, slot)(emb);
    changed = true;
  }
  return changed ? { ...def, abilities } : def;
}
