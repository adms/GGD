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
import type { VfxScriptDoc } from "./schema/vfxScript";
import { zAbilityDef, zAbilityDoc } from "./schema/ability";
// AoE 四級距 → 半徑。全專案唯一的查表處，理由寫在那支檔案。
import { aoeTiersFromDoc, resolveRadiusTier } from "./aoeTiers";
import { rangeTiersFromDoc, resolveRangeTier } from "./rangeTiers";
// 冷卻五級距 → 秒數（GH#445）／傷害五級距 → 基礎值（GH#447）。同上，唯一的查表處。
import { cooldownTiersFromDoc, resolveCooldownTier } from "./cooldownTiers";
import { damageTiersFromDoc, resolveDamageTier } from "./damageTiers";
// GH#541 —— 連段的間隔序列住 `config.combo-strikes@1`（第〇·四守則的共用表）,
// 在**載入時**被解析進每一個 `comboStrikes` 節點。⛔ 沒有這一步,只寫 `family`
// 的技能會在 sim 裡擲錯,而 `content:build` 與全套測試對它是綠的。
import { normalizeComboTable, resolveComboFamilies } from "../sim/effects/comboFamilies";
import { manaTiersFromDoc, resolveManaCostTier } from "./manaTiers";
import {
  DEFAULT_MOVE_SPEED_TIERS,
  moveSpeedTiersFromDoc,
  resolveMsBonusTier,
} from "./moveSpeedTiers";
import { resolveSpeedGrowthTiers, speedGrowthTiersFromDoc } from "./speedGrowthTiers";
// ⭐ 說明推導（票號待開） —— 技能說明的佔位符在 `withProse` 被代入（見下面那一格的說明）。
import { type ProseTables } from "./abilityProse";
// ⭐ 唯一入口（抽量 → 算實際值 → 代入）。⛔ 不要退回自己組那三步，見 `withProse`。
import { liveDepsFromConfigs, renderAbilityDescription } from "./renderAbilityText";
// GH#792 —— `{{cast}}` 的吟唱規則（含 owner 的 castTimeMaxSec 夾，#787）。
import { castTimeRulesFromDoc } from "../sim/castTimeRules";
// 位移四級距 + **無條件的速度天花板**（GH#318）。同上，唯一的查表處。
import {
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
  resolveDisplacementTier,
} from "./displacementTiers";
// 英雄屬性正規化（owner 2026-08-12）。全專案唯一知道「級別怎麼變成數字」的地方。
import {
  resolveChampionStats,
  statNormalizationFromDoc,
  NORMALIZED_STAT_TO_STAT,
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
import { resolveModelFxPreset } from "./modelFxPreset";

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
/**
 * attachment@1 docs (same `vfx` collection, split out at registration, GH#392).
 *
 * ⚠️ 這一行漏掉的話它們會掉進 `VfxDefs` —— 一份**沒有 emitter 也沒有 lifetimeSec**
 * 的東西被當粒子文件發出去，而 `vfxFor()` 的呼叫端讀 `doc.emitter` 會拿到
 * undefined。⛔ 不會丟例外，只會什麼都不畫（失敗形態②）。
 */
export const AttachmentDefs = new ContentRegistry<AttachmentDoc>();
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
//: ⭐ 這張表住在 `statNormalization.ts`（唯一一份），⛔ 這裡不再抄第二份。
const STAT_OF = NORMALIZED_STAT_TO_STAT;

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
    withProse(withTiers(expandIfTemplated(d, templates, true, onFailure, failures, undefined)));
  const expandEmbedded =
    (championId: string, slot: string) =>
    (d: AbilityDef): AbilityDef =>
      withProse(
        withTiers(
          expandIfTemplated(d, templates, false, onFailure, failures, { championId, slot }),
        ),
      );

  // AoE 級距表要在**技能之前**讀出來（owner 2026-08-11「原則上不寫範圍數字」）。
  // ⚠️ `Configs.register` 那一圈跑在技能之後，所以這裡直接讀 store —— 讀註冊表
  // 會拿到上一次載入留下的那一份，那是一個安靜的跨載入污染。
  // ⚠️ 不是 `store.all<ConfigDoc>` —— 匯出的 `ConfigDoc` 其實只是
  //    `zConfigMatchDoc` 的 infer（`schema/config.ts:5177`），不是那個
  //    discriminated union。用它會讓這一行的 `.schema` 比對被 tsc 判成永遠 false。
  const configDocs = store.all<{ schema?: string }>("config");
  const aoeTiers = aoeTiersFromDoc(configDocs.find((c) => c.schema === "config.aoe-tiers@1"));
  // 位移級距（GH#318）。⚠️ 速度天花板是**推導**出來的，輸入是最小身體半徑 ——
  // 所以這裡要先把 `config.arena-rules@1` 讀出來，⛔ 不可以寫死 16
  //（有人把 mob 半徑調到 0.4 的那天，16 就再次說謊，而且沒有東西會紅）。
  const displacementTiers = displacementTiersFromDoc(
    configDocs.find((c) => c.schema === "config.displacement-tiers@1"),
    minBodyRadiusFromConfigs(configDocs),
  );
  /**
   * 兩個級距合成**一個**接縫。⭐ 每一支技能（standalone / 內嵌 / 模板展開後）
   * 與每一件道具都要走這裡，⛔ 不是只有模板技 —— 見下面 `mapChampionAbilities`
   * 的說明，AoE 那條內嵌路徑到今天為止一次都沒真的跑過。
   */
  // 施法距離級距（GH#414）—— owner 2026-08-19「可施展技能的距離普遍超遠」。
  // ⚠️ 這一軸在此之前**沒有表**，216 支各帶一個從 w3a 換算來的自由數字。
  const rangeTiers = rangeTiersFromDoc(
    configDocs.find((c) => c.schema === "config.range-tiers@1"),
  );
  // 冷卻五級距（GH#445）與傷害五級距（GH#447）—— 成本軸的第三條與**唯一**的
  // 回報軸。⚠️ 兩者都掛在**同一個** `withTiers` 接縫上，理由同上面那一段：
  // standalone / 內嵌 / 模板展開後 / 道具，四條路只能有一個答案。
  const cooldownTiers = cooldownTiersFromDoc(
    configDocs.find((c) => c.schema === "config.cooldown-tiers@1"),
  );
  const damageTiers = damageTiersFromDoc(
    configDocs.find((c) => c.schema === "config.damage-tiers@1"),
  );
  // 耗魔五級距（2026-08-21）—— 五軸的最後一軸。⚠️ 在它之前 `ability@1` 上根本
  // 沒有 `manaCostTier` 一格，所以 212 支要花魔力的技能各自帶一個自由數字：
  // 級距表一改它們一動都不會動，⛔ 而且沒有任何東西會紅。
  const manaTiers = manaTiersFromDoc(configDocs.find((c) => c.schema === "config.mana-tiers@1"));
  // 移速**加成**五級距（GH#789，owner 2026-08-27「%轉換為五級距⋯0.1~4」）。
  // ⚠️ 它級距化的是 **modifier 節點**（任意深度的 `{stat:"ms", op:pctAdd|pctMult}`），
  // 帶 `msBonusTier` 的節點**沒有** `value`（#534 exclusive）——所以這一層**不可以漏**：
  // 漏了＝modifier 沒有 value＝statPipeline 的 `m.value * stacks` 算出 NaN 傳染進移速。
  const moveSpeedTiers = moveSpeedTiersFromDoc(
    configDocs.find((c) => c.schema === "config.move-speed-tiers@1"),
  );
  // GH#541 —— 29 個 JASS 連段函式的間隔表。⭐ 間隔就是動畫節奏的來源(owner 2026-08-22),
  // 所以它**逐支不同**(克勞德 0.2/0.6/0.4 · 龍虎亂舞 0.3/0.05/0.5 · 理想鄉 0.1/0.3/0.2)——
  // ⛔ 統一成一個 `intervalSec` 會把每一支的手感抹平。
  const comboFamilies = normalizeComboTable(
    configDocs.find((c) => c.schema === "config.combo-strikes@1"),
  );
  const withTiers = <T extends object>(d: T): T =>
    // ⚠️ 冷卻在**幾何之外**是刻意的：`cooldownShapeOf` 的自動推形狀會去看
    // `radius`/`radiusTier`，而 `resolveRadiusTier` 只**加**欄位不刪 ——
    // 先跑幾何再跑冷卻，兩種寫法（填數字／填級距）看到的形狀才會一樣。
    // ⭐ 耗魔包在最外層只是**順序無關**（它只讀頂層 `manaCostTier`／`manaCost`，
    // ⛔ 不看幾何也不看傷害），⛔ 不要因此以為它有優先權。
    // ⭐ 連段家族包在最外層與耗魔同理:它只讀 `comboStrikes` 節點的 `family`,
    // ⛔ 不看幾何、不看傷害、不看冷卻 ⇒ 順序無關。
    // ⭐ 移速加成級距包在最外層與耗魔同理：它只讀 modifier 節點的 `msBonusTier`，
    // ⛔ 不看幾何、不看傷害、不看冷卻 ⇒ 順序無關。
    resolveMsBonusTier(
    resolveComboFamilies(
      resolveManaCostTier(
      resolveCooldownTier(
        resolveDamageTier(
          resolveDisplacementTier(
            resolveRangeTier(
              // ⭐【橫放光束砲】特效模板（owner 2026-08-23）—— `spawnModelFx.preset`
              // 在**最內層**解開：模板補的是演出幾何（modelKey/path/speed/distance/
              // spin/scale/touch*），⛔ 沒有一格是級距的輸入，所以它與外面五層
              // 順序無關；擺在最內層只是讓下游看到的永遠是**補完**的節點。
              // 表住 `content/ability-templates/tpl-beam-roll.json`（第〇·四守則）。
              resolveRadiusTier(resolveModelFxPreset(d, templates) as never, aoeTiers) as never,
              rangeTiers,
            ) as never,
            displacementTiers,
          ),
          damageTiers,
        ) as never,
        cooldownTiers,
      ) as never,
      manaTiers,
      ) as never,
      comboFamilies,
    ) as never,
      moveSpeedTiers,
    ) as T;

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
  const withProse = (d: AbilityDef): AbilityDef => {
    const text = (d as { description?: unknown }).description;
    if (typeof text !== "string" || !text.includes("{{")) return d;
    return {
      ...d,
      // ⛔ 這裡刻意呼叫**入口**而不是自己組三步（抽量 → 算實際值 → 代入）：
      //    漏掉中間那步的那天，`{{cd!}}` 會原樣印在卡片上而測試全綠（失敗形態②）。
      description: renderAbilityDescription(d, text, proseTables, liveDeps),
    } as AbilityDef;
  };

  // 英雄屬性正規化：同樣要在**英雄註冊之前**讀（`Configs.register` 那一圈在後面）。
  // ⭐ 一個 seam，接在 registerChampion 的正上方 —— 商店預覽 / 選人畫面 / 後台
  //   全部走同一份註冊表，所以不會出現「這裡顯示舊值、場上跑新值」。
  // 移速／攻速的**每級成長**五級距（owner 2026-08-21）。⭐ 它與上面那五軸走**同一個
  // 接縫**（`withTiers` 那一格是技能與道具的，這裡是英雄的那一格）——⛔ 不另立一條
  // 解析路徑，理由同上：一個接縫 ⇒ 選人畫面／商店預覽／後台試算／文件產生器不可能
  // 各自算出不一樣的答案。
  const speedGrowth = speedGrowthTiersFromDoc(
    configDocs.find((c) => c.schema === "config.speed-growth-tiers@1"),
  );
  const statNorm = statNormalizationFromDoc(
    store.all<{ schema?: string }>("config").find((c) => c.schema === "config.stat-normalization@1"),
  );

  for (const d of store.all<ProjectileDef>("projectiles")) Projectiles.register(d.id, d);
  // ⚠️ 道具也要過級距 —— 出貨就有一件帶 dash 的道具（近擊的巨人鎧），
  //    而它的速度正好是 18，穿牆平手線上的那個值（GH#318）。
  //    AoE 的接縫漏掉了 `Items`，理由是「今天 0 件道具用 radiusTier」——
  //    那是巧合正確，不是設計，所以這裡一次把兩個機制都接上。
  for (const d of store.all<ItemDef>("items")) Items.register(d.id, withTiers(d));
  // ⚠️ 增益卡也要過級距（GH#789）—— 出貨就有 5 張帶 `msBonusTier` 的移速卡，
  //    而帶級別的節點**沒有** value（#534 exclusive）：漏了這一格，那 5 張卡的
  //    modifier 進 statPipeline 就是 `undefined * stacks` = NaN。
  //    理由同上面 Items 那一行（AoE 漏掉 Items 是巧合正確，不是設計）。
  for (const d of store.all<AugmentDef>("augments")) Augments.register(d.id, withTiers(d));
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
      resolveSpeedGrowthTiers(
        resolveChampionStats(
          mapChampionAbilities(d, expandEmbedded) as never,
          statNorm,
          STAT_RESOLVE_DEPS,
        ) as never,
        speedGrowth,
      ) as never,
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
