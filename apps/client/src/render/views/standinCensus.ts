/**
 * standinCensus — 「這位英雄畫面上那具身體，是他自己的，還是跟別人共用的替身？
 * 跟誰共用？」 (task #224 / owner 2026-07-30「角色可選名單重複太多」)
 *
 * ── 為什麼不是掃 `modelKey` ───────────────────────────────────────────────
 *
 * 掃 `content/champions/*.json` 的 `modelKey` 欄位可以在三十秒內湊出一張表，
 * 而那張表**是錯的**，錯法正好是失敗形態 ⑥（掃字串代替行為）與 ⑦（掃屬性代替
 * 行為）：`modelKey` 是**輸入**，不是結果。出貨的解析路徑上，這個欄位之後還有
 * 兩層會改寫答案：
 *
 *   1. `BlizzardOverlayModels.resolve()` — 40 位共用替身的英雄，如果本機/映像
 *      裡有 Warcraft III overlay，會被換成**他自己的**那具 `.glb`。這一層決定
 *      了「共用」這件事到底存不存在：overlay 缺席時，出貨名單裡穿共用 modelKey
 *      的 15 位塌成三具方塊人（42 種身體 / 14 位撞臉）；overlay 在場時，同樣
 *      這 15 位各自穿自己的 WC3 模型（53 種身體 / 0 位撞臉）。
 *      **同一份 `modelKey` 資料，兩個相反的答案。**（喪標麥可是第 16 位穿通用
 *      身體的英雄，但他沒有 w3x 來源，兩種情境下都留在 `blocky-undead.glb`。）
 *   2. `ChampionView.tryUpgradeToGlb()` — `preferVoxelBody`（後台可切）的英雄
 *      **一具 glb 都不採用**，直接留在程序生成的體素身體上。那具身體是
 *      per-champion 生出來的，所以它反而是「不共用」。
 *
 * 於是這支檔案的判斷一律讀**最後真的會被送進 `assets.load()` 的那個
 * `glbPath`**，而共用與否是拿那個路徑去分組得到的，不是拿 modelKey 去分組。
 * `standinCensus.test.ts` 會把每一位的判定拿去跟**真的 `ChampionView`**（真的
 * `tryUpgradeToGlb`、真的 `BlizzardOverlayModels`）對帳，所以失敗形態 ⑤
 * 「被測的不是出貨的那個」在這裡是可驗證的，不是宣稱的。
 *
 * ── 它為什麼住在 render/views ─────────────────────────────────────────────
 *
 * 因為判斷共用與否的那條規則（`isStandinBodyGlb` + `preferVoxelBody` 的
 * 拒絕分支）就住在這一層。放到 UI 或 admin 去重寫一次，就是再造一個會跟出貨
 * 路徑分岔的第二實作。這支檔案沒有 babylon 相依、沒有 fetch、沒有 fs，
 * 全部靠注入 —— UI / admin 消費它，不重寫它。
 */
import type { ModelDoc } from "@ggd/shared/content";
import {
  isStandinBodyGlb,
  modelRelativeScaleOf,
  standinRelativeScaleOf,
  type StandinScaleFields,
} from "@ggd/shared/content/standinScale";

/** 這具身體是哪來的。`isStandin` 是它的布林投影。 */
export type BodySource =
  /** 英雄自己的（w3x 匯入 / 專屬 / per-champion 生成）模型 */
  | "own-model"
  /** overlay 換上來的 Warcraft III 原始模型 —— 也是他自己的身體 */
  | "wc3-overlay"
  /** 通用方塊人 —— 不是為任何一位英雄做的身體 */
  | "generic-body"
  /** 一具 glb 都沒採用，程序生成的 per-champion 體素身體 */
  | "voxel-body"
  /** 內容還沒載完 / overlay 探測還在飛 —— 現在還答不出來（≠「沒有」） */
  | "unresolved";

/**
 * 通用方塊人的檔名前綴 —— `tools/voxel-gen` 烤出來、**不屬於任何一位英雄**的
 * 那幾具（`blocky-mage/knight/barbarian/rogue/undead.glb`）。
 *
 * ⚠️ 這比 `isStandinBodyGlb`（比對整個資料夾）**細一層**，而細的那一層是有
 * 意義的：同一個資料夾裡還住著 `voxel-<championId>.glb` —— 特徵生成、
 * 一位英雄一具。對**尺寸**而言兩者同類（同一個 0..32 voxel-px 信封，正確倍率
 * 都是地圖的 usca，所以尺寸那一側照樣走 `isStandinBodyGlb`）；對**「這是不是
 * 別人的身體」**而言兩者相反。把兩個問題混用同一個判斷，`voxel-godie-udre.glb`
 * 就會被判成替身，而那正是索隆自己的臉。
 */
export const GENERIC_BODY_GLB_PREFIX = "assets/models/champions/blocky-";

/** 這具 glb 是不是「不屬於任何一位英雄」的通用方塊人。 */
export function isGenericBodyGlb(glbPath: string | null | undefined): boolean {
  return typeof glbPath === "string" && glbPath.startsWith(GENERIC_BODY_GLB_PREFIX);
}

/** 一位英雄畫面上那具身體的完整判定。 */
export interface ChampionBody {
  readonly championId: string;
  /** 出貨 doc 的 modelKey（**輸入**，保留只為了對帳，不參與判定） */
  readonly modelKey: string | null;
  /** 真的會被 `assets.load()` 的路徑；null = 不採用任何 glb（體素身體 / 未解析） */
  readonly glbPath: string | null;
  readonly source: BodySource;
  /**
   * true = 畫面上那具身體是通用方塊人，不是為這位英雄做的。
   * ⚠️ 這**不等於** `sharedWith.length > 0`：喪標麥可穿 `blocky-undead.glb`
   * 而且只有他一個人穿（`isStandin` true、`sharedWith` 空）。兩個訊號回答的是
   * 兩個問題 ——「這是不是別人的身體」與「跟誰撞臉」。
   */
  readonly isStandin: boolean;
  /** 同一具身體上的其他英雄（已排序、不含自己）。空 = 這具身體只有他一個。 */
  readonly sharedWith: readonly string[];
  /** 地圖宣告的 `umdl`，原樣照抄；沒覆寫的那幾位是 null。**出處紀錄。** */
  readonly mapModel: string | null;
  /** 地圖宣告的 `usca`；沒有 override 條目 = null（＝地圖尺寸完全沒被記下來）。 */
  readonly mapScale: number | null;
  /** 這具身體實際拿到的相對倍率（高度正規化之後再乘的那個數）。 */
  readonly bodyScale: number;
  /**
   * 地圖的 `usca` 有沒有真的走到這具身體上。
   *   · 替身身體：正規化之後「整個輪廓就是身體」，正確倍率就是 usca 本身，
   *     所以這裡直接比對 `standinRelativeScaleOf(ov)` 與 `usca`。
   *   · 自己的模型：`relativeScale` 已經把 usca 乘進去（GH#31 的
   *     `(rawHeight ÷ 115.63) × usca`），只有條目帶著 `rawHeight` 時驗得動。
   *   · `null` = 這一位沒有 override 條目，或驗不動 —— **不聲稱**。
   */
  readonly mapScaleHonoured: boolean | null;
}

/** 普查結果。`byBody` 的 key 是身體識別，不是 modelKey。 */
export interface StandinCensus {
  /** championId → 判定，插入順序 = 傳進來的名單順序。 */
  readonly bodies: ReadonlyMap<string, ChampionBody>;
  /** 身體識別 → 站在上面的英雄（已排序）。見 {@link bodyIdOf}。 */
  readonly byBody: ReadonlyMap<string, readonly string[]>;
  readonly totals: {
    /** 普查了幾位 */
    readonly champions: number;
    /** 幾種不同的身體 */
    readonly distinctBodies: number;
    /** 幾位站在「有兩個以上的人」的身體上 */
    readonly sharing: number;
    /** 那些身體有幾組 */
    readonly sharedGroups: number;
    /** 幾位穿的是通用方塊人（不論有沒有人跟他撞臉） */
    readonly onGenericBody: number;
    /** 幾位的地圖 usca 沒有走到身體上（`mapScaleHonoured === false`） */
    readonly mapScaleDropped: number;
    /** 幾位連 override 條目都沒有（地圖尺寸從來沒被記下來） */
    readonly mapScaleUnrecorded: number;
  };
}

/**
 * 普查要問的三件事，全部注入 —— 每一個都必須是**出貨路徑上的那一個**。
 * 這裡不提供預設值：一個「方便的預設」就是一條可以悄悄跟出貨分岔的第二實作。
 */
export interface CensusHooks {
  /** championId → 出貨 doc 的 modelKey。（`Champions.get(id).modelKey`） */
  modelKeyOf(championId: string): string | null | undefined;
  /** modelKey → 出貨的 model doc。（`ContentDb.modelFor`）null = 還沒載完。 */
  modelDocOf(modelKey: string): ModelDoc | null;
  /**
   * overlay 解析。**必須是 `blizzardOverlayModels.resolve` 本尊**：
   * 回 `null` 代表「探測還在飛，現在還不知道」，不是「沒有」。
   */
  resolveOverlay(shipped: ModelDoc | null, championId: string): ModelDoc | null;
  /** championId → 生成的體素配方（`voxelSkinForId`）。只讀 `preferVoxelBody`。 */
  skinOf(championId: string): { readonly preferVoxelBody?: boolean } | null | undefined;
  /** championId → `_standin-overrides.json` 條目（`ContentDb.modelOverrideFor`）。 */
  overrideOf(championId: string): (StandinScaleFields & { rawHeight?: number }) | null;
}

/**
 * `ChampionView.tryUpgradeToGlb` 的**第一個分支**：`preferVoxelBody` 的英雄
 * 一具 glb 都不採用，直接 `return`。
 *
 * ⚠️ 這是出貨行為的一個 MIRROR，不是它本身 —— 真正的那一行在
 * `ChampionView.tryUpgradeToGlb`。這種鏡像正是失敗形態 ⑤ 的溫床，所以
 * `standinCensus.test.ts` 對**出貨名單的每一位**都真的建一個 `ChampionView`、
 * 真的呼叫 `tryUpgradeToGlb`、再看 `AssetManager.load` 到底被拿什麼路徑呼叫過，
 * 拿那個結果跟這裡的判定逐位對帳。哪一天那一行改了，這裡沒跟上，測試就紅。
 */
export function declinesEveryGlb(
  skin: { readonly preferVoxelBody?: boolean } | null | undefined,
): boolean {
  return skin?.preferVoxelBody === true;
}

/**
 * 身體識別 —— 分組用的 key。
 *
 * 採用了 glb 的就用那個路徑（**兩位英雄載到同一個檔案 = 真的共用同一具身體**）；
 * 體素身體是 per-champion 生出來的，所以每一位自成一組，key 帶 championId。
 * 這就是為什麼「共用」不能拿 modelKey 分組：`preferVoxelBody` 的英雄 modelKey
 * 相同但身體不同，而 overlay 在場的英雄 modelKey 相同、身體也不同。
 */
export function bodyIdOf(body: Pick<ChampionBody, "championId" | "glbPath" | "source">): string {
  if (body.source === "voxel-body") return `voxel:${body.championId}`;
  if (body.glbPath === null) return `unresolved:${body.championId}`;
  return body.glbPath;
}

/** 尺寸那一側的判斷（資料夾層級）—— 見 {@link GENERIC_BODY_GLB_PREFIX} 的 ⚠️。 */
function onGeneratedBody(source: BodySource, glbPath: string | null): boolean {
  return source === "voxel-body" || isStandinBodyGlb(glbPath);
}

/** 有限、>0 才算數（跟 standinScale 同一條規則）。 */
function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** HeroPaladin 的 rawHeight —— GH#31 相對倍率式子的分母。 */
export const HERO_PALADIN_RAW_HEIGHT = 115.63;

/**
 * 地圖的 usca 有沒有走到這具身體上。判斷 depends on **哪一具身體**，
 * 這正是 #77 的核心：同一個 `relativeScale` 對 WC3 模型是對的、對方塊人是錯的。
 */
function honoursMapScale(
  ov: (StandinScaleFields & { rawHeight?: number }) | null,
  onStandinBody: boolean,
): boolean | null {
  if (!ov) return null; // 沒有條目 → 地圖尺寸根本沒被記下來，不聲稱
  const usca = positive(ov.usca);
  if (usca === null) return null;
  if (onStandinBody) {
    // 替身身體：輪廓就是身體，正確倍率 = usca 本身。
    return Math.abs(standinRelativeScaleOf(ov) - usca) < 1e-6;
  }
  // 自己的模型：relativeScale 應該 = (rawHeight ÷ 115.63) × usca。
  const raw = positive(ov.rawHeight);
  if (raw === null) return null; // 驗不動就不聲稱
  const expected = (raw / HERO_PALADIN_RAW_HEIGHT) * usca;
  return Math.abs(modelRelativeScaleOf(ov) - expected) < 2e-3;
}

/**
 * 走一次出貨的解析路徑，得出一位英雄畫面上那具身體是誰的。
 *
 * 順序**必須**跟 `GameApp.modelDocFor` → `ChampionView.tryUpgradeToGlb` 一致：
 * 先 modelKey → 出貨 doc，再 overlay 覆寫，最後 `preferVoxelBody` 有權整個拒絕。
 * 把 `preferVoxelBody` 提前判斷會得到一樣的字串答案卻是錯的因果 —— overlay
 * 探測還在飛的那幾幀，出貨路徑回的是「還不知道」，不是「體素」。
 */
function resolveBody(
  championId: string,
  hooks: CensusHooks,
): Pick<ChampionBody, "modelKey" | "glbPath" | "source"> {
  const modelKey = hooks.modelKeyOf(championId) ?? null;
  const skin = hooks.skinOf(championId);
  if (modelKey === null) return { modelKey: null, glbPath: null, source: "unresolved" };

  const shipped = hooks.modelDocOf(modelKey);
  const resolved = hooks.resolveOverlay(shipped, championId);

  // `preferVoxelBody` 在 ChampionView 裡是**在 doc 之前**就 return 的，所以
  // 即使 doc 還沒到，答案也已經確定是體素身體。
  if (declinesEveryGlb(skin)) {
    return { modelKey, glbPath: null, source: "voxel-body" };
  }
  if (resolved === null) return { modelKey, glbPath: null, source: "unresolved" };

  const glbPath = resolved.glbPath;
  if (isGenericBodyGlb(glbPath)) return { modelKey, glbPath, source: "generic-body" };
  // overlay 換上來的路徑 vs 出貨 doc 本來就有的路徑 —— 兩者都是「他自己的身體」，
  // 分開只是為了讓報表看得出這一位是靠 overlay 才有臉的。
  // `voxel-<championId>.glb`（特徵生成、一位英雄一具）走的也是這一支：那是他
  // 自己的臉，只是程序生成的。
  const fromOverlay = shipped !== null && shipped.glbPath !== glbPath;
  return { modelKey, glbPath, source: fromOverlay ? "wc3-overlay" : "own-model" };
}

/**
 * 對一份英雄名單做普查。名單就是**出貨的可選名單**（
 * `apps/platform/internal/curation/starter.go` 的 `starterChampions`）—— 普查
 * 全部 113 位會把 owner 根本選不到的英雄算進共用組，數字會失真。
 */
export function censusChampionBodies(
  championIds: readonly string[],
  hooks: CensusHooks,
): StandinCensus {
  const bodies = new Map<string, ChampionBody>();
  const groups = new Map<string, string[]>();

  // 第一趟：解析每一位的身體，同時分組。
  const resolved = championIds.map((id) => {
    const r = resolveBody(id, hooks);
    const key = bodyIdOf({ championId: id, ...r });
    const list = groups.get(key) ?? [];
    list.push(id);
    groups.set(key, list);
    return { id, ...r, key };
  });
  for (const list of groups.values()) list.sort();

  // 第二趟：填 sharedWith / 尺寸欄位（需要完整的分組才填得出來）。
  for (const r of resolved) {
    const ov = hooks.overrideOf(r.id);
    const onStandinBody = onGeneratedBody(r.source, r.glbPath);
    const group = groups.get(r.key) ?? [r.id];
    bodies.set(r.id, {
      championId: r.id,
      modelKey: r.modelKey,
      glbPath: r.glbPath,
      source: r.source,
      isStandin: r.source === "generic-body",
      sharedWith: group.filter((x) => x !== r.id),
      mapModel: typeof ov?.mapModel === "string" ? ov.mapModel : null,
      mapScale: positive(ov?.usca),
      bodyScale: onStandinBody ? standinRelativeScaleOf(ov) : modelRelativeScaleOf(ov),
      mapScaleHonoured: honoursMapScale(ov, onStandinBody),
    });
  }

  let sharing = 0;
  let sharedGroups = 0;
  for (const list of groups.values()) {
    if (list.length > 1) {
      sharedGroups += 1;
      sharing += list.length;
    }
  }
  let mapScaleDropped = 0;
  let mapScaleUnrecorded = 0;
  let onGenericBody = 0;
  for (const b of bodies.values()) {
    if (b.mapScaleHonoured === false) mapScaleDropped += 1;
    if (b.mapScale === null) mapScaleUnrecorded += 1;
    if (b.isStandin) onGenericBody += 1;
  }

  return {
    bodies,
    byBody: groups,
    totals: {
      champions: championIds.length,
      distinctBodies: groups.size,
      sharing,
      sharedGroups,
      onGenericBody,
      mapScaleDropped,
      mapScaleUnrecorded,
    },
  };
}

/**
 * UI / admin 直接消費的一行答案：「這位跟誰共用？」
 * 回 `null` = 沒有共用（自己的模型、或 per-champion 的體素身體）。
 */
export function sharedWith(census: StandinCensus, championId: string): readonly string[] | null {
  const b = census.bodies.get(championId);
  if (!b || b.sharedWith.length === 0) return null;
  return b.sharedWith;
}
