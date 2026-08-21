/**
 * ContentDb — fetches the authored JSON content the client renders from:
 * model docs (champion GLB + clip maps), vfx docs (particle defs), ribbon
 * docs (trail defs — same vfx collection, split on `schema`), the ambient-vfx
 * config doc (modelKey → ambient attachment bindings) and the arena doc
 * (decor/groundStyle). Everything is OPTIONAL: lookups return null/[] until
 * (and unless) the docs arrive, and every consumer keeps a procedural
 * fallback, so a missing/broken content mount degrades gracefully.
 * Pure fetch + data — NO @babylonjs imports here (client-08 arch gate).
 */
import type {
  ModelDoc,
  VfxDoc,
  RibbonDoc,
  AttachmentDoc,
  ArenaDoc,
  ConfigAmbientVfxDoc,
  ConfigGoreDoc,
  ConfigStealthDoc,
  ConfigRangeGuideDoc,
  ConfigDamageColorsDoc,
  ConfigItemCardDoc,
  ConfigVfxFamiliesDoc,
  ConfigVfxAbilityArtDoc,
  ConfigVoxelBodiesDoc,
  ConfigFormVisualsDoc,
  ConfigVictoryFxDoc,
  ConfigAudioMixDoc,
  ConfigUiLexiconDoc,
  FormVisual,
  AmbientVfxBinding,
  ArenaFire,
  ArenaBackdropPolicy,
  ArenaSceneryPolicy,
} from "@ggd/shared/content";
import {
  Arenas,
  Configs,
  Models,
  AttachmentDefs,
  RibbonDefs,
  VfxDefs,
  resolveArenaFire,
  resolveArenaBackdrop,
  resolveArenaScenery,
  resolveFormVisual,
} from "@ggd/shared/content";
import { VOXEL_SKINS_SCHEMA, type VoxelSkinOverride } from "@ggd/shared/content/voxelSkin";
import { applyGoreDoc } from "../vfx/goreConfig";
import { applyPredictionHoldDoc } from "../predict/predictionHold";
// 隱形原語 —— 同一條縫、同一個理由:沒有這一行,`content/config/stealth.json` 就是
// 一份沒人讀的檔案,後台改了兩個不透明度/血條開關,場上完全不會變(第②號故障)。
// 傳 null(檔案不存在或 schema 不合)= 用 `DEFAULT_STEALTH_RULES`,不是「關掉」。
import { applyStealthDoc } from "../render/stealthVisual";
// 傷害數字配色 (owner 2026-08-01) —— 同一條縫、同一個理由:少了這一行,
// `content/config/damage-colors.json` 就是一份沒人讀的檔案,後台把「真實傷害」
// 改成別的顏色,場上永遠是出貨的白(第②號故障:算出來但從沒送到)。
// 傳 null(檔案不存在或 schema 不合)= 用出貨的四色,不是「沒有顏色」。
import { applyDamageColorsDoc } from "../render/damagePalette";
// 道具卡片的排版與配色 (owner 2026-08-02)。沒有這一行,
// `content/config/item-card.json` 就是一份沒人讀的檔案。
import { applyItemCardDoc } from "../ui/components/itemCardTheme";
// GH#376 技能範圍指引 + 地面預告通道 —— 同一條縫、同一個理由:少了這一行,
// `content/config/range-guide.json` 就是一份沒人讀的檔案 —— 後台把 hover 延遲、
// 兩個圈的顏色/濃度、或「自己 vs 來襲」那三組樣式改了,地板上永遠是出貨值
// (第②號故障)。傳 null(檔案不存在／schema 不合)= `DEFAULT_RANGE_GUIDE`。
import { applyRangeGuideDoc } from "../ui/rangeGuideConfig";
import { applyCombatEnvDoc } from "../ui/displayFinal";
import { applyVictoryFxDoc } from "../vfx/victoryFxPolicy";
// GH#339 混音表 (owner 2026-08-17「其他角色的語音音量應該減少一半」)。同一條縫、
// 同一個理由:沒有這一行,`content/config/audio-mix.json` 就是一份沒人讀的檔案 ——
// 後台把滑桿拉到 0.2,場上還是一樣吵(第②號故障)。傳 null(檔案不存在／schema
// 不合)= `DEFAULT_AUDIO_MIX` 的出貨倍率,不是「跟自己一樣大聲」。
import { applyAudioMixDoc } from "../audio/voiceMixPolicy";
// GH#230 L2 —— w3x 特效家族的後台旋鈕。跟 applyGoreDoc 同一條縫、同一個理由:
// render/** 不能自己讀 content mount,所以由這裡把 config doc 推進去。
import { setFamilyTuning } from "../render/vfx/w3xAbilityArt";
// GH#384 —— 617 筆逐技能特效綁定（分類／證據／晉升）。同一條縫、同一個理由。
import { setAbilityArtBindings } from "../render/vfx/abilityArtContent";
import { vfxSoundLayer } from "../audio/vfxSound";
import { resolveFamilyArt } from "../render/vfx/familyTuning";
import { setMaxAbilityVfxLayers } from "../render/vfx/abilityLayers";
import { setOneShotMaxLifeSec } from "../vfx/oneShotLife";
import { setCastHeightSource } from "../render/vfx/familyCastHeight";
import { setFamilyPitchDefaults } from "../render/vfx/familyOrient";
import { setProjectileTuning } from "../render/views/projectileArt";
import { zoneTextureRadius } from "../render/ArenaGround";
import { ensureContentLoaded } from "./bootContent";
import { withContentVersion } from "./assetVersion";
import { applyUiLexiconDoc } from "../ui/panels/fateLexicon";

interface IndexFile {
  entries?: { id: string; path: string }[];
}

/**
 * Per-champion render-SIZE override loaded from content/models/_standin-overrides.json
 * (schema standin-overrides@2). This sidecar is NOT a model@1 doc: it is keyed by
 * championId (not modelKey) and is skipped by the content index builder because of
 * its leading "_" (see fsStore.rebuildCollectionIndex), so it rides in as a direct-
 * path fetch rather than through a collection index. `relativeScale` is the task
 * #150 multiplier applied ON TOP of ChampionView's height-normalization (1.0 = the
 * normalized target); `scale`/`glbPath`/`clipMap` are the legacy task #77 model-swap
 * fields. Its shape mirrors the render layer's `ModelDocOverride` field-for-field, so
 * GameApp hands it straight to EntityViewRegistry.modelOverrideFor without adapting.
 * (Deliberately declared here, not imported from render/**, to keep the content layer
 * free of the babylon-tainted render module — client-08 arch gate.)
 */
export interface StandInOverride {
  relativeScale?: number;
  /**
   * Task #77 — the multiplier for the champion's STAND-IN body. Declared here
   * only so the type describes the file honestly; the loader below stores each
   * entry object exactly as authored, so `usca` / `mapModel` (provenance the
   * guards read straight off the JSON) ride through whether or not they are
   * named in this interface.
   */
  standinRelativeScale?: number;
  scale?: number;
  glbPath?: string;
  clipMap?: ModelDoc["clipMap"];
}

/** Shape of the _standin-overrides.json sidecar (schema standin-overrides@2). */
interface StandInOverridesFile {
  schema?: string;
  target?: number;
  overrides?: Record<string, StandInOverride>;
}

/**
 * Hand-authored VOXEL SKIN overrides (task #231) from
 * content/models/_voxel-skins.json (schema voxel-skins@1). Layer L1 of the
 * skin's override chain and the ONLY part of it that is fetched — every other
 * layer is computed from the champion doc the registries already hold.
 * Same sidecar mechanics as _standin-overrides.json above: keyed by championId,
 * leading "_" so the index builder skips it, so it rides in as a direct-path
 * fetch. Declared structurally here rather than imported from the shared voxel
 * skin module so the content layer stays free of render-adjacent imports; the
 * shape is asserted against `VoxelSkinOverride` where it is consumed.
 */
interface VoxelSkinOverridesFile {
  schema?: string;
  overrides?: Record<string, Record<string, unknown>>;
}

const BASE = "/content/";

const NO_BINDINGS: readonly AmbientVfxBinding[] = [];

/**
 * Resolve a content-relative asset path ("assets/…", e.g. a doc's `icon`) to
 * the URL it is served from (same mount as every other content fetch). Returns
 * null for absent/foreign paths so callers keep their non-icon fallback —
 * never fabricates a URL for Blizzard stock art (which carries no icon field).
 */
export function contentAssetUrl(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("assets/")) return null;
  // `?h=<contentVersion>` is what flips nginx from `no-cache` to
  // `immutable` for this URL (see assetVersion.ts). Before the manifest lands
  // it is a no-op and the bare URL revalidates, exactly as it always did.
  return withContentVersion(BASE + path);
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(BASE + path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fetch every doc listed in a collection _index.json. */
async function fetchCollection<T extends { id: string }>(collection: string): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const index = await fetchJson<IndexFile>(`${collection}/_index.json`);
  if (!index?.entries) return out;
  const docs = await Promise.all(index.entries.map((e) => fetchJson<T>(e.path)));
  for (const doc of docs) {
    if (doc && typeof doc.id === "string") out.set(doc.id, doc);
  }
  return out;
}

export class ContentDb {
  /**
   * true = every doc lookup reads the shared registries the ContentLoader
   * hydrated at boot (the normal path — zero per-match doc requests). false =
   * the degraded self-fetch path below, used only when the content boot failed
   * and fell back to the skeleton registry.
   */
  private fromRegistries = false;
  /** degraded path only: docs this db fetched itself (empty when registry-backed). */
  private models = new Map<string, ModelDoc>();
  private vfx = new Map<string, VfxDoc>();
  private ribbons = new Map<string, RibbonDoc>();
  /** GH#392 —— attachment@1（穿在骨頭上的模型），同一個 vfx 集合的第三種文件 */
  private attachments = new Map<string, AttachmentDoc>();
  private fetchedConfigs = new Map<string, { schema?: string }>();
  private ambientVfx: ConfigAmbientVfxDoc | null = null;
  private arenaDoc: ArenaDoc | null = null;
  private standInOverrides = new Map<string, StandInOverride>();
  private voxelSkinOverrides = new Map<string, VoxelSkinOverride>();
  /** GH#31 — championId -> operator's body choice. Empty = nobody toggled anything. */
  private voxelBodies = new Map<string, boolean>();
  /**
   * #249 GH#288 — 變身外觀表. `null` means 「文件沒讀到」, which
   * `resolveFormVisual` deliberately reads as 「用出貨預設」 rather than
   * 「全部關掉」 — the same three-state rule `voxelBodyFor` documents.
   */
  private formVisuals: ConfigFormVisualsDoc | null = null;
  private loaded = false;

  /**
   * Populate the db; resolves when everything settled (never rejects).
   *
   * REGISTRY-FIRST (was: 507 HTTP requests / 516,392 B on EVERY match entry).
   * The 117 model docs, the 388 vfx/ribbon docs, the arenas and the config docs
   * are ALL loaded, schema-validated and registered by the shared ContentLoader
   * at client boot (bootContent → registerAll), long before `screen` can become
   * "match". Re-fetching them here downloaded the same bytes a second time. We
   * now await the single-flight boot (already settled by this point — no network)
   * and read the registries.
   *
   * THE GATE IS DELIBERATELY KEPT. `modelFor()` returning null is what stops
   * `ChampionView.tryUpgradeToGlb` from latching (`upgradeStarted`) before the
   * per-champion size override is resolvable — the override sidecar is NOT in the
   * models index (leading "_"), so it is still a direct-path fetch, and a champion
   * that adopted its glb one frame early would keep relativeScale 1.0 FOREVER
   * (小叮噹 at 1.8u instead of 1.17u). So `this.loaded` stays an explicit gate and
   * every accessor honours it: models become visible in the SAME step the
   * overrides do, exactly as before. That costs the one sidecar request.
   */
  async load(arenaId = "arena.skeleton"): Promise<void> {
    const [boot, standin, voxelSkins] = await Promise.all([
      // single-flight; at match entry this is an already-resolved promise (0 requests)
      ensureContentLoaded(),
      // per-champion model-SIZE overrides (task #77/#150). Direct-path fetch: the
      // "_"-prefixed sidecar is intentionally excluded from the models _index.json,
      // so the ContentLoader never sees it. Resolving it in the SAME step as the
      // model docs is the invariant described above.
      fetchJson<StandInOverridesFile>("models/_standin-overrides.json"),
      // hand-authored voxel-skin overrides (task #231). Same sidecar mechanics,
      // same step — the skin is a CONSTRUCTION-TIME input to ChampionView, so a
      // champion whose view was built before its override landed would wear the
      // un-overridden look for the rest of the match.
      fetchJson<VoxelSkinOverridesFile>("models/_voxel-skins.json"),
    ]);
    // per-champion render-size overrides (task #77/#150). Guarded by schema so a
    // stale/foreign file is ignored; a missing/404 file leaves the map empty and
    // every champion renders at the normalized default (relativeScale 1.0).
    this.standInOverrides = new Map();
    if (standin?.schema === "standin-overrides@2" && standin.overrides) {
      for (const [championId, ov] of Object.entries(standin.overrides)) {
        if (ov && typeof ov === "object") this.standInOverrides.set(championId, ov);
      }
    }
    // task #231 — schema-guarded exactly like the sidecar above: a stale or
    // foreign file is ignored and every champion simply keeps its GENERATED
    // look, which is a complete look on its own. The override file is an
    // art-direction channel, never a prerequisite.
    this.voxelSkinOverrides = new Map();
    if (voxelSkins?.schema === VOXEL_SKINS_SCHEMA && voxelSkins.overrides) {
      for (const [championId, ov] of Object.entries(voxelSkins.overrides)) {
        if (ov && typeof ov === "object") {
          this.voxelSkinOverrides.set(championId, ov as VoxelSkinOverride);
        }
      }
    }

    if (boot.ok) {
      this.fromRegistries = true;
      this.arenaDoc = Arenas.tryGet(arenaId) ?? this.arenaDoc;
    } else {
      // Content boot fell back to the skeleton (a doc failed schema/ref
      // validation, or the mount is broken): the registries hold 2 champions and
      // NO model/vfx docs. The old tolerant per-doc path is kept for exactly this
      // case — it does no schema validation, so a single bad doc cannot cost the
      // whole match its models. This is the ONLY path that still fetches the
      // collections.
      this.fromRegistries = false;
      await this.loadByFetch(arenaId);
    }
    this.ambientVfx = this.configDoc<ConfigAmbientVfxDoc>("ambient-vfx", "config.ambient-vfx@1");
    // 濺血 style knob (task #39): push the art-directed baseline + per-champion
    // overrides into the vfx layer. A missing doc leaves the shipped default
    // (blood @ 0.85) — the player's own setting still wins over both.
    applyGoreDoc(this.configDoc<ConfigGoreDoc>("gore", "config.gore@1"));
    // ⭐ GH#370 —— 預測影子的扣留旗標。⛔ 少了這一行，`content/config/combat-feel.json`
    // 的 `predictionHold` 就是一份沒人讀的設定：後台把某一顆關掉，場上完全不會變
    // （失敗形態②）。⚠️ 這正是同一份文件的 `facing.localMode` 今天的處境 ——
    // 文件與 Zod 都接好了、客戶端還在讀 DEFAULT 常數（見上面 audio-mix 那一段的註解）。
    // 傳 null（檔案不存在／schema 不合）= 出貨預設（六顆全開），不是「不扣留」。
    applyPredictionHoldDoc(
      this.configDoc<{ schema: string; predictionHold?: unknown }>(
        "combat-feel",
        "config.combat-feel@1",
      ),
    );
    applyStealthDoc(this.configDoc<ConfigStealthDoc>("stealth", "config.stealth@1"));
    applyRangeGuideDoc(this.configDoc<ConfigRangeGuideDoc>("range-guide", "config.range-guide@1"));
    applyDamageColorsDoc(
      this.configDoc<ConfigDamageColorsDoc>("damage-colors", "config.damage-colors@1"),
    );
    // 道具卡片的標記分類表 + 卡片專用配色 (owner 2026-08-02「關於效果及數值的
    // 部分應該要特殊顏色表示」)。owner 新增一個 `[標記]` 只要改這份 JSON;沒有
    // 這一行的話那份 JSON 存了也沒人讀(失敗形態 ②)。傳 null(檔案不存在／
    // schema 不合)= `DEFAULT_ITEM_CARD`,不是「沒有配色」。
    applyItemCardDoc(this.configDoc<ConfigItemCardDoc>("item-card", "config.item-card@1"));
    // ⭐ 戰鬥系統倍率表 —— 卡片上**推導出來**的數字（魔抗減傷 %）要用它現算。
    // ⛔ 少了這一行，圖鑑／大廳在**進場之前**拿到的是中性表（全部 1.0），於是同一件
    // 道具在圖鑑印 66.7%、在場上印 28.6%（失敗形態②的變種：算對了但這個畫面讀不到）。
    // ⚠️ 它不是覆蓋層：MatchState 帶來真的表時 `setDisplayEnvJson` 會換掉它。
    applyCombatEnvDoc(
      this.configDoc<{ schema: string; multipliers?: Record<string, number> }>(
        "combat-env",
        "config.combat-env@1",
      ),
    );
    // 勝利煙火的兩個開關 (owner 2026-08-02「請你直接取消煙火(變成後台開關)」)。
    // 沒有這一行,`content/config/victory-fx.json` 就是一份沒人讀的檔案:後台把
    // 煙火打開,場上還是不會放(第②號故障:算出來了但從沒送到)。傳 null(檔案
    // 不存在／schema 不合)= `DEFAULT_VICTORY_FX`,也就是兩格都關,不是「全開」。
    applyVictoryFxDoc(this.configDoc<ConfigVictoryFxDoc>("victory-fx", "config.victory-fx@1"));
    // GH#339 —— 別人的語音要比自己小多少 (owner 2026-08-17)。少了這一行就是
    // `config.combat-feel@1` 的前例:文件與 Zod 都接好了、客戶端還在讀 DEFAULT 常數,
    // 而後台那一格永遠是裝飾品。傳 null = 出貨倍率,不是 1。
    applyAudioMixDoc(this.configDoc<ConfigAudioMixDoc>("audio-mix", "config.audio-mix@1"));
    // 玩家端 Fate 用語（owner 2026-08-16：「應該是一個 JSON 檔，可以在後台替換設定」）。
    // ⛔ 沒有這一行，`content/config/ui-lexicon.json` 就是一份沒有人讀的檔案：
    // 後台把「聖杯顯現」改成別的字，畫面上完全不會變（失敗形態②）。
    // 傳 null（檔案不存在／schema 不合）= 出貨文案，不是「沒有文字」。
    applyUiLexiconDoc(this.configDoc<ConfigUiLexiconDoc>("ui-lexicon", "config.ui-lexicon@1"));

    // GH#230 L2 —— 21 個 w3x 特效家族原型 + 258 支技能的 per-invocation 參數。
    // 沒有這一行,`content/config/vfx-families.json` 就是一份沒人讀的檔案:
    // 後台改了大小/顏色/開關,場上完全不會變(第②號故障:算出來但從沒送到)。
    // 傳 null(檔案不存在或 schema 不合)= 用 code 內的出貨預設,不是「關掉」。
    // ⭐ GH#384 —— **這一行要在 `setFamilyTuning` 之前**。逐技能的綁定（哪一支畫
    // 哪一組特效）以前是三張 TypeScript 常數表，現在是內容；`setFamilyTuning` 會
    // 立刻拿它去鑄造 `fx.fam.*` 文件，順序反了就會鑄出一份空的。
    // ⛔ 少了這一行，**每一支技能都掉回通用替身** —— 而那看起來跟「特效還沒做」
    // 一模一樣（失敗形態②）。`setAbilityArtBindings` 收到空的會吼一行到 console。
    setAbilityArtBindings(
      this.configDoc<ConfigVfxAbilityArtDoc>("vfx-ability-art", "config.vfx-ability-art@1"),
    );
    const vfxFamiliesDoc = this.configDoc<ConfigVfxFamiliesDoc>(
      "vfx-families",
      "config.vfx-families@1",
    );
    setFamilyTuning(vfxFamiliesDoc);
    // GH#390 —— **特效自帶的音效**。同一份 config、同一個第②號故障的位置:
    // 少了這一行,`families[].soundLaunch` / `abilities[].soundImpact` 就是
    // 一批沒有人讀的欄位 —— 後台填了、schema 收下了、卡片上寫著,而遊戲裡不響。
    vfxSoundLayer.setFamiliesDoc(vfxFamiliesDoc);
    // 技能 → 家族原型,用**出貨的那一支解析器**(⛔ 不是音效層自己再推一份):
    // 畫面走哪個家族,聲音就走哪個家族,兩者不可能漂開。
    vfxSoundLayer.setFamilyResolver((id) => resolveFamilyArt(id, vfxFamiliesDoc)?.family);
    // #205 —— 同一份 config 上的層數上限。沒有這一行,後台把上限從 5 調成 2 之後
    // 場上照樣播五層(同樣是第②號故障)。傳 undefined = 出貨預設,不是 0 層。
    setMaxAbilityVfxLayers(vfxFamiliesDoc?.maxAbilityVfxLayers);
    // owner 2026-07-30 (a) —— 一次性粒子的壽命天花板(「餘燼還能留多久」)。
    // 同樣是第②號故障的位置:少了這一行,後台把 0.6 調成 2.0 之後 schema 收下了、
    // 頁面顯示 2.0、而 `VfxSystem` 仍然照 0.6 夾。傳 undefined = 出貨的 0.6。
    setOneShotMaxLifeSec(vfxFamiliesDoc?.oneShotMaxLifeSec);
    // #251 owner「衝擊波特效沒有真實套用」—— 施法高度模式。同一個位置、同一種
    // 第②號故障:少了這一行,後台把模式切回 `flat` 之後場上仍然貼地。
    setCastHeightSource(vfxFamiliesDoc?.castHeightSource);
    // GH#379 —— 有方向的五個形狀的家族仰角(beam/bolt/dash 躺下、slash 斜 30°、
    // tornado 維持直立)。**少了這一行,GH#377 的瞄準對 126 支技能仍然是恆等變換**:
    // 後台把 beam 的仰角從 0 調成 45、存了、頁面顯示 45,而場上一支都沒有動。
    // 傳 undefined = 出貨預設,⛔ 不是「關掉」。
    setFamilyPitchDefaults(vfxFamiliesDoc);
    // #251 owner「投射物特效沒有真實套用」—— 飛行彈道的三格旋鈕。
    setProjectileTuning(
      vfxFamiliesDoc
        ? {
            ...(vfxFamiliesDoc.projectileArtFromDoc !== undefined
              ? { artFromDoc: vfxFamiliesDoc.projectileArtFromDoc }
              : {}),
            ...(vfxFamiliesDoc.projectileRadiusGain !== undefined
              ? { radiusGain: vfxFamiliesDoc.projectileRadiusGain }
              : {}),
            ...(vfxFamiliesDoc.projectileFlyHeightY !== undefined
              ? { flyHeightY: vfxFamiliesDoc.projectileFlyHeightY }
              : {}),
          }
        : undefined,
    );

    // GH#31 —— the operator's per-champion BODY choice (voxel vs its own 3D
    // model). Read from the `config` collection, not from a sidecar, precisely
    // so that the console's writes land in the durable overlay and survive a
    // redeploy; see `config.voxel-bodies@1` for why a sidecar could not work.
    //
    // An absent doc leaves the map empty, which means 「沒有人動過」 — every
    // champion falls through to the sidecar and then to the default rule. That
    // is the shipped state, and it must never read as 「全部關掉體素」.
    this.voxelBodies = new Map();
    const bodiesDoc = this.configDoc<ConfigVoxelBodiesDoc>(
      "voxel-bodies",
      "config.voxel-bodies@1",
    );
    for (const [championId, on] of Object.entries(bodiesDoc?.bodies ?? {})) {
      if (typeof on === "boolean") this.voxelBodies.set(championId, on);
    }
    // #249 GH#288 —— 變身「看得出來」的三個旋鈕。走 config collection(不是
    // sidecar),理由和 voxel-bodies 一模一樣:只有 durable overlay 撐得過
    // `docker compose build`,而 overlay 的 key 不能以 `_` 開頭。
    this.formVisuals = this.configDoc<ConfigFormVisualsDoc>(
      "form-visuals",
      "config.form-visuals@1",
    );
    this.loaded = true;
  }

  /** Registry-or-fetched config doc, narrowed by `schema` (null when absent). */
  private configDoc<T extends { schema: string }>(id: string, schema: string): T | null {
    const doc = this.fromRegistries
      ? (Configs.tryGet(id) as unknown)
      : (this.fetchedConfigs.get(id) as unknown);
    return (doc as T | undefined)?.schema === schema ? (doc as T) : null;
  }

  /**
   * DEGRADED path only (see `load`): the original 507-request per-doc fetch.
   * Reached solely when the shared content boot failed and fell back to the
   * skeleton registry.
   */
  private async loadByFetch(arenaId = "arena.skeleton"): Promise<void> {
    const [models, vfxDocs, ambient, gore, arena] = await Promise.all([
      fetchCollection<ModelDoc>("models"),
      // the vfx collection mixes vfx@1 particle docs and ribbon@1 trail docs
      fetchCollection<VfxDoc | RibbonDoc | AttachmentDoc>("vfx"),
      // fetched by direct path (works even before content:build re-indexes it)
      fetchJson<ConfigAmbientVfxDoc>("config/ambient-vfx.json"),
      fetchJson<ConfigGoreDoc>("config/gore.json"),
      fetchJson<ArenaDoc>(`arenas/${arenaId}.json`),
    ]);
    this.models = models;
    this.vfx = new Map();
    this.ribbons = new Map();
    this.attachments = new Map();
    for (const doc of vfxDocs.values()) {
      if (doc.schema === "ribbon@1") this.ribbons.set(doc.id, doc);
      else if (doc.schema === "attachment@1") this.attachments.set(doc.id, doc);
      else this.vfx.set(doc.id, doc);
    }
    this.fetchedConfigs.clear();
    if (ambient) this.fetchedConfigs.set("ambient-vfx", ambient);
    if (gore) this.fetchedConfigs.set("gore", gore);
    this.arenaDoc = arena;
  }

  /**
   * Arena doc by id (used when the match's mapId is known/changes). Served from
   * the registry the ContentLoader already populated — the 5 arena docs are part
   * of the boot load, so this is a synchronous lookup wearing an async signature
   * (the caller is a `.then()` chain in GameApp.applyArena). Falls back to a
   * direct fetch only in the degraded no-registry case. Resolves null on any
   * failure so the caller can fall back to the skeleton geometry.
   */
  async loadArena(arenaId: string): Promise<ArenaDoc | null> {
    // awaited (not `this.fromRegistries`) because GameApp calls applyArena in the
    // same tick as load(), before that flag is decided. Single-flight, already
    // settled at match entry → no request either way.
    const boot = await ensureContentLoaded();
    const doc = boot.ok
      ? (Arenas.tryGet(arenaId) ?? null)
      : await fetchJson<ArenaDoc>(`arenas/${arenaId}.json`);
    this.arenaDoc = doc ?? this.arenaDoc;
    return doc;
  }

  get ready(): boolean {
    return this.loaded;
  }

  /**
   * Model doc for a modelKey, or null until `load()` settles.
   *
   * The `!this.loaded` guard is LOAD-BEARING, not defensive tidiness: it is the
   * gate that keeps `ChampionView.tryUpgradeToGlb` from latching `upgradeStarted`
   * before `modelOverrideFor` can answer. Reading the registry unguarded would
   * hand out a doc on frame 0 and permanently strip the per-champion size
   * override from any champion whose entity exists that frame. See `load()`.
   */
  modelFor(modelKey: string): ModelDoc | null {
    if (!this.loaded) return null;
    if (this.fromRegistries) return Models.tryGet(modelKey) ?? null;
    return this.models.get(modelKey) ?? null;
  }

  /**
   * Per-champion render-SIZE override (task #77/#150) by championId, or null when
   * the champion has none — the common case (~105 of 113), for which the render
   * layer defaults `relativeScale` to 1.0 (ChampionView's height-normalized target
   * size). Only the 8 curated exceptions in _standin-overrides.json (小叮噹 0.65 …
   * 初號機 1.55) return a non-null override. Empty until `load()` settles. Keyed by
   * championId (NOT modelKey) because stand-ins share a modelKey — the size
   * exception is per champion, so the composition root must resolve championId
   * before calling this (GameApp.modelOverrideFor).
   */
  modelOverrideFor(championId: string): StandInOverride | null {
    return this.standInOverrides.get(championId) ?? null;
  }

  /**
   * Hand-authored VOXEL SKIN override (task #231) by championId, or null — the
   * common case, because the generator produces a complete, distinct look for
   * every champion on its own. This is the 驗收 channel: when the owner calls
   * out a hero on the 體素外觀對照表, the fix lands here as a few authored
   * fields rather than as a special case in the generator.
   *
   * Deliberately NOT gated on `this.loaded`: the recipe is computed from the
   * champion registry, so the only thing an early call can miss is the
   * override, and the sidecar resolves in the same step as the model docs.
   */
  voxelSkinOverrideFor(championId: string): VoxelSkinOverride | null {
    const sidecar = this.voxelSkinOverrides.get(championId) ?? null;
    // GH#31 —— THE OPERATOR'S BODY CHOICE OUTRANKS THE SIDECAR.
    //
    // owner 2026-07-28:「要替換成體素是我從後台設定套用才生效」. The console
    // writes `config/voxel-bodies` through the durable overlay, which is the one
    // writable surface that survives a `docker compose build`; the sidecar is
    // baked into the image and would be restored (silently) on every deploy.
    //
    // Layered rather than replaced: an operator toggling the BODY must not wipe
    // the hand-authored palette/face/hair the same champion may carry.
    const body = this.voxelBodyFor(championId);
    if (body === null) return sidecar;
    return { ...(sidecar ?? {}), preferVoxelBody: body };
  }

  /**
   * The operator's explicit body choice for `championId`, or null when they
   * have not touched this champion (the shipped state for everybody).
   *
   * `null` is NOT "use voxel" and NOT "use the model" — it is "no opinion", so
   * the layer below decides. Collapsing that third state into a boolean is how
   * an empty config doc would read as 「全部關掉體素」 and quietly override the
   * hand-authored sidecar for the four champions that genuinely have no model.
   */
  voxelBodyFor(championId: string): boolean | null {
    const v = this.voxelBodies.get(championId);
    return typeof v === "boolean" ? v : null;
  }

  /**
   * #249 GH#288 —— 這個 championId 在**變身態**時的外觀(顏色/大小/球體掛件),
   * 或 null。
   *
   * ⚠️ 傳進來的必須是**變身態的 id**(`Emeu` 那一半)。`resolveFormVisual` 的
   * 第一道關卡是 `isAlternateForm`,所以傳基本型進來一定拿到 null ——
   * 「基本型悟空不可以長出超三的頭」在這一層就是一條 early return,不是
   * 一個要記得繞過的分支。
   */
  formVisualFor(alternateChampionId: string | null | undefined): FormVisual | null {
    return resolveFormVisual(this.formVisuals, alternateChampionId);
  }

  /** The raw 變身外觀 doc the console wrote (null = shipped defaults apply). */
  get formVisualsDoc(): ConfigFormVisualsDoc | null {
    return this.formVisuals;
  }

  vfxFor(vfxKey: string): VfxDoc | null {
    if (this.fromRegistries) return VfxDefs.tryGet(vfxKey) ?? null;
    return this.vfx.get(vfxKey) ?? null;
  }

  ribbonFor(ribbonKey: string): RibbonDoc | null {
    if (this.fromRegistries) return RibbonDefs.tryGet(ribbonKey) ?? null;
    return this.ribbons.get(ribbonKey) ?? null;
  }

  /** GH#392 —— `attachment@1`（穿在骨頭上的模型）。null = 這個 id 不是掛件。 */
  attachmentFor(id: string): AttachmentDoc | null {
    if (this.fromRegistries) return AttachmentDefs.tryGet(id) ?? null;
    return this.attachments.get(id) ?? null;
  }

  /** Ambient attachment bindings for a modelKey ([] when none authored). */
  ambientBindingsFor(modelKey: string): readonly AmbientVfxBinding[] {
    return this.ambientVfx?.bindings[modelKey] ?? NO_BINDINGS;
  }

  /**
   * 場地布景道具的常駐火焰政策（GH#251）。文件缺席／沒有這個區塊時回傳
   * `DEFAULT_ARENA_FIRE`（`enabled: false`）—— 內容載不到的那條路**不可以**
   * 把 owner 明說要拿掉的火又點回來。`dressArena` 是唯一的消費者。
   */
  arenaFire(): ArenaFire {
    return resolveArenaFire(this.ambientVfx);
  }

  /**
   * 圓盤外 2D 景深背景的政策（GH#324）。文件缺席／沒有這個區塊時回傳
   * `DEFAULT_ARENA_BACKDROP`（`enabled: true`）—— 跟火焰**相反**，因為
   * 回退值要落在 owner 要的那一邊，而 owner 明說要填補場景外的空缺。
   */
  arenaBackdrop(): ArenaBackdropPolicy {
    return resolveArenaBackdrop(this.ambientVfx);
  }

  /**
   * 場景特色（配色／會動的打光／裝飾散佈）的政策（GH#362）。文件缺席／沒有這個
   * 區塊時回傳 `DEFAULT_ARENA_SCENERY_POLICY`（`enabled: true`）—— 同背景、
   * 同理由：回退值要落在 owner 要的那一邊，而他明說要更多場景特色。
   */
  arenaScenery(): ArenaSceneryPolicy {
    return resolveArenaScenery(this.ambientVfx);
  }

  get arena(): ArenaDoc | null {
    return this.arenaDoc;
  }

  /**
   * ⭐ GH#536 —— 每一張已載入場地會用到的（地面樣式 · 貼圖半徑），去重。
   *
   * owner 2026-08-22：「大混戰也是 似乎是讀取不夠快 並且**沒有提前在商店完成讀取**
   * 的緣故」。`GameApp` 在**中場（商店）**拿這張表去暖 `groundTextureCache`，
   * 於是下一回合換圖時貼圖**已經在**，⛔ 不是那時才開始抓。
   *
   * ⚠️ 半徑不是裝飾：快取鍵含 uv scale，而 uv scale 由半徑算。所以這裡用的是
   * `zoneTextureRadius` —— 跟 `buildZoneGround` **同一個函式**，⛔ 不是一個
   * 「差不多」的數字（那會暖到另一個鍵，看起來有暖其實一格都沒命中）。
   *
   * ⚠️ 出貨的 13 張圖只落在 **2 個半徑**（矩形場地 24、大混戰 42）× 7 種樣式,
   * 所以這張表很短 —— ⛔ 不是每張圖一格。
   */
  arenaGroundWarmList(): { style: string; radius: number }[] {
    const seen = new Set<string>();
    const out: { style: string; radius: number }[] = [];
    for (const doc of Arenas.all()) {
      const style = doc.groundStyle;
      if (!style) continue; // 沒宣告樣式的場地本來就不抓貼圖（平色地板）
      for (const zone of doc.zones ?? []) {
        const radius = zoneTextureRadius(zone);
        const key = `${style}@${radius}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ style, radius });
      }
    }
    return out;
  }
}
