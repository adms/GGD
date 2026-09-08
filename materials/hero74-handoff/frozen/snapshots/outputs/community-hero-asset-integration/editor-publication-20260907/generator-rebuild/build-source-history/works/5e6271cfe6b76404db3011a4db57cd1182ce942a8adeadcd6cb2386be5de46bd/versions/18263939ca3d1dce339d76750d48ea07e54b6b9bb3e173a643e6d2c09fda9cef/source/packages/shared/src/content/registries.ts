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
import type { AnyVfxDoc, AttachmentDoc, RibbonDoc, VfxDoc } from "./schema/vfx";
import type { StatusEffectDoc } from "./schema/statusEffect";
import type { SkinDoc } from "./schema/skin";
import type { TemplateDoc } from "./schema/template";
import type { VfxScriptAuthoredDoc, VfxScriptDoc } from "./schema/vfxScript";
import { expandVfxScriptDoc, registerVfxSubtypes, VfxSubtypes } from "./vfxSubtypes/expand";
import { zAbilityDef, zAbilityDoc } from "./schema/ability";
// AoE 四級距 → 半徑。全專案唯一的查表處，理由寫在那支檔案。
import { createRuntimeResolver } from "./runtimeResolver";
import { withLiteralApCoeffs } from "./apCoefficient";
// GH#541 —— 連段的間隔序列住 `config.combo-strikes@1`（第〇·四守則的共用表）,
// 在**載入時**被解析進每一個 `comboStrikes` 節點。⛔ 沒有這一步,只寫 `family`
// 的技能會在 sim 裡擲錯,而 `content:build` 與全套測試對它是綠的。
import { DEFAULT_MOVE_SPEED_TIERS } from "./moveSpeedTiers";
import { resolveChampionRuntimeStats } from "./championRuntimeResolver";
// ⭐ 說明推導（票號待開） —— 技能說明的佔位符在 `withProse` 被代入（見下面那一格的說明）。
import { type ProseTables } from "./abilityProse";
// ⭐ 唯一入口（抽量 → 算實際值 → 代入）。⛔ 不要退回自己組那三步，見 `withProse`。
import { liveDepsFromConfigs, renderAbilityDescription } from "./renderAbilityText";
// GH#792 —— `{{cast}}` 的吟唱規則（含 owner 的 castTimeMaxSec 夾，#787）。
import { castTimeRulesFromDoc } from "../sim/castTimeRules";
// 位移四級距 + **無條件的速度天花板**（GH#318）。同上，唯一的查表處。
// 英雄屬性正規化（owner 2026-08-12）。全專案唯一知道「級別怎麼變成數字」的地方。
// ⭐ 反解要用**出貨的**那支算式，⛔ 不自己抄公式（失敗形態⑤）。
//   注入而不是讓 `statNormalization.ts` 自己 import —— `content/` → `sim/stats/`
//   那條邊會做出模組初始化循環（2026-08-12 實測，見那個檔的 `StatResolveDeps`）。
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

import { ContextualRegistryMap } from "../sim/content/registryContext";

class ContentRegistry<V extends { id: string }> {
  private readonly map: ContextualRegistryMap<string, V>;
  constructor(name: string) { this.map = new ContextualRegistryMap(name); }

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

export const Arenas = new ContentRegistry<ArenaDoc>("content.arenas");
export const Configs = new ContentRegistry<ConfigDoc>("content.config");
export const Models = new ContentRegistry<ModelDoc>("content.models");
export const VfxDefs = new ContentRegistry<VfxDoc>("content.vfx");
/** ribbon@1 docs (same `vfx` collection, split out at registration). */
export const RibbonDefs = new ContentRegistry<RibbonDoc>("content.ribbons");
/**
 * attachment@1 docs (same `vfx` collection, split out at registration, GH#392).
 *
 * ⚠️ 這一行漏掉的話它們會掉進 `VfxDefs` —— 一份**沒有 emitter 也沒有 lifetimeSec**
 * 的東西被當粒子文件發出去，而 `vfxFor()` 的呼叫端讀 `doc.emitter` 會拿到
 * undefined。⛔ 不會丟例外，只會什麼都不畫（失敗形態②）。
 */
export const AttachmentDefs = new ContentRegistry<AttachmentDoc>("content.attachments");
export const StatusEffects = new ContentRegistry<StatusEffectDoc>("content.status-effects");
export const Skins = new ContentRegistry<SkinDoc>("content.skins");
/** vfx-script@1 docs（GH#838 特效工坊）—— 客戶端 VfxScriptPlayer 的唯一資料源。 */
export const VfxScripts = new ContentRegistry<VfxScriptDoc>("content.vfx-scripts");

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
//: ⭐ 這張表住在 `statNormalization.ts`（唯一一份），⛔ 這裡不再抄第二份。

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
  const expandStandalone = (d: AbilityDef): AbilityDef => {
    if (options.representation === "verified-runtime") return d;
    const authored = expandIfTemplated(d, templates, true, onFailure, failures, undefined);
    return withProse(withTiers(authored), authored);
  };
  const expandEmbedded =
    (championId: string, slot: string) =>
    (d: AbilityDef): AbilityDef => {
      if (options.representation === "verified-runtime") return d;
      const authored = expandIfTemplated(d, templates, false, onFailure, failures, { championId, slot });
      return withProse(withTiers(authored), authored);
    };

  // AoE 級距表要在**技能之前**讀出來（owner 2026-08-11「原則上不寫範圍數字」）。
  // ⚠️ `Configs.register` 那一圈跑在技能之後，所以這裡直接讀 store —— 讀註冊表
  // 會拿到上一次載入留下的那一份，那是一個安靜的跨載入污染。
  // ⚠️ 不是 `store.all<ConfigDoc>` —— 匯出的 `ConfigDoc` 其實只是
  //    `zConfigMatchDoc` 的 infer（`schema/config.ts:5177`），不是那個
  //    discriminated union。用它會讓這一行的 `.schema` 比對被 tsc 判成永遠 false。
  const configDocs = store.all<{ schema?: string }>("config");
  const { resolve: withTiers, aoeTiers, displacementTiers, rangeTiers, damageTiers, moveSpeedTiers, apCoeff } =
    createRuntimeResolver(templates, configDocs);

  /**
   * ⭐【技能說明的**唯一**算繪處】說明推導（票號待開） —— `{{cd}}` / `{{dmg}}` / `{{range}}`…
   * 在這裡被代入。
   *
   * ⚠️ 它包在 `withTiers` 的**外面**是硬性的：佔位符讀的是**級距解析之後**的
   * `cooldown[]` / `range` / 傷害葉。包在裡面的話 44-01 死神之眼會印出退路值
   * `2` 而不是級距值 `12` —— 那正是這一支要消滅的「卡面說 2、引擎跑 12」。
   *
   * ⭐ 接在這一格（⛔ 不是 client 的一支 helper）是因為**每一個消費端都讀註冊表**：
   * 遊戲內卡片 / 選人 / 商店 / 後台預覽 / codex / 文件產生器 / `descriptionClaims`
   * 閘。一個接縫 ⇒ ⛔ 不可能出現「這裡印舊值、場上跑新值」。
   */
  const proseTables: ProseTables = {
    // ⭐ 用**同一份**已經解出來的傷害級距表（⛔ 不是第二份）——
    //   `{{dmg}}` 現在解析得了「只寫級別、⛔ 不烘 flat」的傷害節點（第〇·四守則的形狀）。
    damage: damageTiers.damage,
    range: rangeTiers.range,
    radius: aoeTiers.radius,
    travel: Object.fromEntries(
      Object.entries(displacementTiers.travel).map(([k, v]) => [k, v.distance]),
    ) as ProseTables["travel"],
    push: Object.fromEntries(
      Object.entries(displacementTiers.push).map(([k, v]) => [k, v.distance]),
    ) as ProseTables["push"],
    // GH#789 —— `{{msb}}` 的級距表。⚠️ 出貨路徑上 value 已在 withTiers 解析，
    // 這一格是給磁碟形狀的草稿（後台創建新英雄）用的退路，跟 resolve 同一套語意。
    msBonus: moveSpeedTiers.enabled ? moveSpeedTiers.bonus : DEFAULT_MOVE_SPEED_TIERS.bonus,
    // ⭐ 錨從 store 裡的 arenas **推導**，⛔ 不抄字面值 24（`Arenas` 那一圈跑在
    //   技能之後，讀註冊表會拿到上一次載入留下的那一份 —— 一個安靜的跨載入污染）。
    zoneRadius: Math.min(
      ...store.all<ArenaDoc>("arenas").flatMap((a) => a.zones.map((z) => z.boundaryRadius)),
    ),
    // GH#792 —— `{{cast}}` 要的吟唱規則（含 owner 的 castTimeMaxSec 夾，#787）。
    // ⛔ 從 `configDocs`（store）讀，⛔ 不讀 `Configs` 註冊表 —— 那一圈跑在技能之後，
    //    會拿到上一次載入留下的那一份（同 liveDeps 那一行的理由）。
    castTime: castTimeRulesFromDoc(configDocs.find((c) => c.schema === "config.cast-time@1")),
  };
  // ⭐ 實際值（`{{cd!}}` = 卡面 × `combatEnv.cooldown`）要的兩份設定，同樣從 store 讀
  //   —— ⛔ 不讀 `Configs` 註冊表（那一圈跑在技能之後，會拿到上一次載入留下的那一份）。
  const liveDeps = liveDepsFromConfigs(configDocs);
  const withProse = (d: AbilityDef, unresolved?: AbilityDef): AbilityDef => {
    const text = (d as { description?: unknown }).description;
    if (typeof text !== "string" || !text.includes("{{")) return d;
    // ⭐ owner 2026-09-06「接上公式顯示 但可以後台開關」：`proseFromFormula:false` ⇒ `{{ap}}` 印文件字面值。
    //   ⚠️ 只換給算繪用的那一份，⛔ 註冊表裡的 coeff 不動（那是公式總開關的事）。
    const forProse =
      apCoeff.proseFromFormula === false && unresolved !== undefined
        ? (withLiteralApCoeffs(d as unknown as Record<string, unknown>, unresolved as unknown as Record<string, unknown>) as unknown as AbilityDef)
        : d;
    return {
      ...d,
      // ⛔ 這裡刻意呼叫**入口**而不是自己組三步（抽量 → 算實際值 → 代入）：
      //    漏掉中間那步的那天，`{{cd!}}` 會原樣印在卡片上而測試全綠（失敗形態②）。
      description: renderAbilityDescription(forProse, text, proseTables, liveDeps),
    } as AbilityDef;
  };

  // 英雄屬性正規化：同樣要在**英雄註冊之前**讀（`Configs.register` 那一圈在後面）。
  // ⭐ 一個 seam，接在 registerChampion 的正上方 —— 商店預覽 / 選人畫面 / 後台
  //   全部走同一份註冊表，所以不會出現「這裡顯示舊值、場上跑新值」。
  // 移速／攻速的**每級成長**五級距（owner 2026-08-21）。⭐ 它與上面那五軸走**同一個
  // 接縫**（`withTiers` 那一格是技能與道具的，這裡是英雄的那一格）——⛔ 不另立一條
  // 解析路徑，理由同上：一個接縫 ⇒ 選人畫面／商店預覽／後台試算／文件產生器不可能
  // 各自算出不一樣的答案。

  for (const d of store.all<ProjectileDef>("projectiles")) Projectiles.register(d.id, d);
  // ⚠️ 道具也要過級距 —— 出貨就有一件帶 dash 的道具（近擊的巨人鎧），
  //    而它的速度正好是 18，穿牆平手線上的那個值（GH#318）。
  //    AoE 的接縫漏掉了 `Items`，理由是「今天 0 件道具用 radiusTier」——
  //    那是巧合正確，不是設計，所以這裡一次把兩個機制都接上。
  for (const d of store.all<ItemDef>("items")) Items.register(d.id, options.representation === "verified-runtime" ? d : withTiers(d));
  // ⚠️ 增益卡也要過級距（GH#789）—— 出貨就有 5 張帶 `msBonusTier` 的移速卡，
  //    而帶級別的節點**沒有** value（#534 exclusive）：漏了這一格，那 5 張卡的
  //    modifier 進 statPipeline 就是 `undefined * stacks` = NaN。
  //    理由同上面 Items 那一行（AoE 漏掉 Items 是巧合正確，不是設計）。
  for (const d of store.all<AugmentDef>("augments")) Augments.register(d.id, options.representation === "verified-runtime" ? d : withTiers(d));
  for (const d of store.all<AbilityDef>("abilities")) {
    const e = expandStandalone(d);
    Abilities.register(e.id, e);
  }
  for (const d of store.all<ChampionDef>("champions")) {
    registerChampion(
      // ⚠️ 級距解析包在 `resolveChampionStats` 的**外面**是硬性的：`msGrowthTier` /
      //    `asGrowthTier` 是**這一位作者填的**，它應該是 `growth.ms` / `growth.as`
      //    的最後一句話。⛔ 包在裡面的話，屬性正規化哪天把 `as` 加進 `appliesTo`
      //    （它的 `channel` 已經寫著 `growth`）就會靜靜地蓋掉級別，而級別欄位照樣
      //    在卡上、後台照樣顯示它 —— 失敗形態②。
      //    ⭐ 今天不會發生：出貨 `appliesTo` 沒有 `as`，而 `ms` 走 `baseStats` 通道
      //    （L1 的值與成長無關），所以兩者順序無關；`speedtiers:check` 在守這個前提。
      options.representation === "verified-runtime" ? d : resolveChampionRuntimeStats(mapChampionAbilities(d, expandEmbedded), configDocs),
    );
  }
  for (const d of store.all<LootTable>("loot-tables")) LootTables.register(d.id, d);
  for (const d of store.all<ArenaDoc>("arenas")) Arenas.register(d);
  for (const d of store.all<ConfigDoc>("config")) Configs.register(d);
  for (const d of store.all<ModelDoc>("models")) Models.register(d);
  for (const d of store.all<AnyVfxDoc>("vfx")) {
    if (d.schema === "ribbon@1") RibbonDefs.register(d);
    else if (d.schema === "attachment@1") AttachmentDefs.register(d);
    else VfxDefs.register(d);
  }
  for (const d of store.all<StatusEffectDoc>("status-effects")) StatusEffects.register(d);
  // ⭐ GH#990：vfx-script 的 `call` 段在**載入時**展開（第〇·四守則：值在載入時解析，
  // ⛔ 不烘進每一份腳本）。子模組先登錄，腳本再逐支展開；展不開 ⇒ 大聲說並只登錄 inline 段
  // （fail-open 沒錯，靜默才是缺陷）。
  registerVfxSubtypes(store);
  for (const d of store.all<VfxScriptAuthoredDoc>("vfx-scripts")) {
    try {
      VfxScripts.register(expandVfxScriptDoc(d, VfxSubtypes.tryGet) as VfxScriptDoc);
    } catch (e) {
      console.warn(`[content] vfx-script ${d.id} 呼叫段展不開，只登錄 inline 段 —— ${(e as Error).message}`);
      VfxScripts.register({ ...d, segments: d.segments.filter((s) => !("call" in s)) } as unknown as VfxScriptDoc);
    }
  }
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
  /** Only for Main-validated immutable runtime; prevents a second numeric/prose expansion. */
  readonly representation?: "authoring" | "verified-runtime";
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
 * ⭐ 2026-09-03（GH#757）：`descriptionRoles` 整條鏈拆掉了 ⇒ 只蓋在 `description` 上。
 * （原本的第二個落點另存在 `docs/legacy/_retired-chains/role-markup-114.md`。）
 * It is stamped on `description`, because
 * `ui/components/abilityText.ts` PREFERS the role markup when it exists — marking
 * only `description` would put the notice on the field nobody renders (失敗形態
 * ①: 畫在畫面外). Runtime only: nothing here is ever written back to disk.
 */
export const DEGRADED_ABILITY_NOTE = "⚠️【模板展開失敗，此技能目前沒有效果】";

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

/**
 * Run the four embedded Q/W/E/R twins of a champion through the registration
 * transform (template expansion + 級距解析), immutably.
 *
 * ⛔ IT USED TO SKIP NON-TEMPLATED SLOTS (`if (template === undefined) continue`),
 * which quietly meant the 級距 wrapper — bolted onto the same transform — never
 * ran on an embedded ability at all: 22 embedded slots carry `radiusTier` today
 * and NOT ONE of them is templated. That path was saved by two accidents, not by
 * design: `registerChampion`'s `fillGaps` lets the standalone doc win, and every
 * embedded slot currently happens to HAVE a standalone twin (orphan = 0, and
 * nothing guards that). 位移 would not survive the same luck — its fields live
 * inside `effects[]`, so the first embedded-only skill with a dash would ship a
 * speed the ceiling never saw.
 *
 * Expanding all four is safe: `expandIfTemplated` returns the doc untouched when
 * there is no template binding, so the only added work is the tier walk.
 */
function mapChampionAbilities(
  def: ChampionDef,
  expandEmbedded: (championId: string, slot: string) => (d: AbilityDef) => AbilityDef,
): ChampionDef {
  const slots = ["Q", "W", "E", "R"] as const;
  let changed = false;
  const abilities = { ...def.abilities };
  for (const slot of slots) {
    const emb = def.abilities[slot];
    const next = expandEmbedded(def.id, slot)(emb);
    if (next === emb) continue;
    abilities[slot] = next;
    changed = true;
  }
  return changed ? { ...def, abilities } : def;
}
