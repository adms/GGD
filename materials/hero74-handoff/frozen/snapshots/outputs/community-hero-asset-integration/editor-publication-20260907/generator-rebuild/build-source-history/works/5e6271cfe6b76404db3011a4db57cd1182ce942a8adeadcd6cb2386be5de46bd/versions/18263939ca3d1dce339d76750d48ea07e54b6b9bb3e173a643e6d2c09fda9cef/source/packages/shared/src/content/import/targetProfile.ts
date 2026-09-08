/**
 * `ggd-content-target-profile@1` —— 給**外部技能模板編輯器**的離線 base receipt。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 這支最重要的一件事：**沒有的東西一律 `null`，不准編一個 digest 出來**
 *
 * 對面（Codex 上的模板編輯器）拿這份 profile 做兩件事：
 *   ① pin `base.activationDigest` / `base.authoringDigest`，用它建 `delta` package；
 *   ② 事後在 apply 時由我們 CAS 重驗那兩個 digest。
 *
 * 所以一個**假的 base digest 不會被當場抓到，它會在對方那邊活好幾天** ——
 * 對方照著它產出一整包 delta，每一份文件都以那個不存在的 base 為出發點，
 * 然後 apply 永遠 `stale-base`，而且**無法修復**（真正的 base 從來不存在，
 * 沒有任何 diff 能把它接回來）。整包要重做。
 *
 * 相對地，`null` 讓對方在**建包之前**就停下來：規格 §4.1 明寫
 * 「缺少精確 profile 時不得產 production-ready delta」。
 * 一個誠實的 null 花對方三秒；一個好看的假 digest 花對方三天。
 *
 * 2026-08-08 的實況：這個 repo **還沒有 authoring store、也還沒有 activation**
 * （計畫 §12 的 G2 才做）。所以：
 *   · `base.activationDigest` = null
 *   · `base.authoringDigest`  = null
 *   · `authoringStoreState`   = "absent"
 *   · `supportedModes`        = ["bootstrap"]  ⛔ 不含 full / delta
 * 而 `content.*` 是真的（`content/manifest.json` 一直都在），所以它不是 null。
 *
 * 守衛：`targetProfile.test.ts`（把 null 換成假 digest 會紅）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② `profileDigest` 刻意**不含** `generatedAt`
 *
 * 規格 §12 要的是「deterministic、canonical、可 hash receipt」。若時間戳進了
 * digest，同一份內容連抓兩次會得到兩個 digest，對方就無法用它判斷
 * 「遊戲端變了沒有」—— 那正是這個欄位唯一的用途。
 * 所以 digest 蓋在**除了 `generatedAt` 與 `profileDigest` 以外的全部**上面。
 *
 * ③ 這支是純函式：不讀檔、不看時鐘。事實由呼叫端（route）注入。
 */
import {
  effectiveVfxLimits,
  type EffectiveVfxLimits,
} from "./effectiveVfxLimits";
import type { AuthoringProcessorDeclaration } from "./authoringProcessor";
import { acceptedRuntimeSchemas } from "./contractIndex";
import {
  authoringStoreStateOf,
  deltaExportAllowedOf,
  resolveImplementedStage,
  supportedModesOf,
} from "./g2Readiness";
import type { G2Facts } from "./g2Readiness";
import { sha256Hex } from "../sha256";
import { stableStringify } from "../hash";
import {
  buildCapabilityManifest,
  type RuntimeCapabilityManifest,
} from "../editorCapabilities";

export const TARGET_PROFILE_SCHEMA = "ggd-content-target-profile@1";
export const IMPORT_RESULT_SCHEMA = "ggd-content-import-result@1";
export const IMPORT_HEALTH_SCHEMA = "ggd-content-import-health@1";

/**
 * ⭐【`ggd-content-import-error@1`】—— **operation 還沒建立**時的錯誤外殼。
 *
 * 計畫 §4.1 點名了目前的缺陷：
 *
 *   > 請修正目前 501 response：在 operation 尚未建立前，用獨立
 *   > `ggd-content-import-error@1` envelope；⛔ 不要用缺少必填欄位、
 *   > `operationId=null`、未登錄 code 或非法 severity 的假
 *   > `ggd-content-import-result@1`。
 *
 * ⚠️ 三個問題都是真的（2026-08-14 查證）：501 回的是 `IMPORT_RESULT_SCHEMA`，
 * 但帶著 `operationId: null`（result 外殼的必填欄位）、`code:
 * "unsupported-operation"`（**不在** `IMPORT_DIAGNOSTICS` 登錄表裡）、
 * `severity: "blocker"`（登錄表用的是 `error`）。
 *
 * ⛔ 為什麼這比「訊息不好看」嚴重：對面的 importer 會拿 schema tag 決定用哪一個
 * parser。一個宣稱自己是 result 卻不合 result schema 的東西，讓對方在
 * **「我解析錯了」與「你們還沒做」之間分不出來** —— 而那兩者的處置完全相反。
 *
 * ⭐ **成功、拒絕、未實作三種回應都必須通過自己的 machine schema**（計畫 §4.1）。
 */
export const IMPORT_ERROR_SCHEMA = "ggd-content-import-error@1";

/** `ggd-content-import-error@1` 的形狀。⚠️ 每一格都必填 —— 沒有 optional。 */
export interface ImportErrorEnvelope {
  readonly schema: typeof IMPORT_ERROR_SCHEMA;
  /** 登錄表裡的診斷碼（⛔ 不是自由字串）。 */
  readonly code: string;
  /** 給人看的一句話。 */
  readonly message: string;
  /** 打的是哪一條 route。 */
  readonly path: string;
  /**
   * ⭐ 這條 route 預計在哪一階段可用（`G1`…`G5`），未實作時必填。
   * ⚠️ 對方**不可以**從這一格推算別條 route 的狀態（計畫 §1.2）——
   * 它只描述**這一條**。
   */
  readonly plannedStage: string;
  /** 這個 shard 現在走到哪一階（roadmap 顯示用）。 */
  readonly implementedStage: string;
  /** 可不可以重試。未實作 = false（重試一百次還是未實作）。 */
  readonly retryable: boolean;
}

/**
 * 這一輪（計畫 §12）走到哪一階段。對方用它決定能不能建包。
 *
 * ⚠️ ⭐ **2026-09-02 之後這只是「算不出來時的保底值」** ——
 * 真正的 stage 由 `resolveImplementedStage()` **逐條推導**（`g2Readiness.ts`）。
 * ⛔ 一個手寫的 `"G2"` 沒有任何東西在守它：它會在有人覺得「差不多做完了」
 * 的那一天被改掉，⚠️ 然後對面打開 full/delta，而 base pin 那幾格還是 null。
 */
export const IMPLEMENTED_STAGE = "G1";

/**
 * authoring store 的三態。⛔ **不是 boolean** ——
 * 「還沒有」與「有但還在 bootstrap」對建包來說是完全不同的答案。
 */
export type AuthoringStoreState = "absent" | "bootstrapping" | "ready";

/** 規格 §4.2 的三種 package 模式。 */
export type PackageMode = "bootstrap" | "full" | "delta";

/** 計畫 §4.1：啟用後怎麼讓新內容生效。**這是一個決策點，所以它是欄位。** */
export type ReloadMode = "process-reload" | "new-match-snapshot" | "hot-reload";

/**
 * Transport / staging 預算（規格 §4.3）。
 *
 * ⚠️ 每一格都有**上界**，不是只有下界（CLAUDE.md 第一守則）——
 * 一個打錯成 500MB 的 `maxArchiveBytes` 會在 G2 變成一個 zip bomb 的入口。
 * `clampImportLimits()` 是唯一的寫入口。
 *
 * ⚠️ G2（真的收 package）之前這些只是**宣告**，對方靠它決定要不要分包。
 * 等 validate/apply 真的落地時，它們應該搬進 `content/config/*.json` +
 * Zod `DEFAULT_*` + admin `SHIPPED_*` 三個住處（第一守則），不要留在這裡。
 */
export interface ImportLimits {
  readonly maxArchiveBytes: number;
  readonly maxEntryBytes: number;
  readonly maxEntries: number;
  readonly maxDocuments: number;
  readonly maxExpandedGraphNodes: number;
  readonly maxScenarios: number;
}

const LIMIT_BOUNDS: Readonly<
  Record<keyof ImportLimits, readonly [number, number]>
> = {
  maxArchiveBytes: [1024, 64 * 1024 * 1024],
  maxEntryBytes: [1024, 16 * 1024 * 1024],
  maxEntries: [1, 20000],
  maxDocuments: [1, 20000],
  maxExpandedGraphNodes: [1, 100000],
  maxScenarios: [1, 5000],
};

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  maxArchiveBytes: 32 * 1024 * 1024,
  maxEntryBytes: 4 * 1024 * 1024,
  maxEntries: 5000,
  maxDocuments: 5000,
  maxExpandedGraphNodes: 20000,
  maxScenarios: 1000,
};

/** 夾進上下界。超界**不是**靜默夾掉的藉口 —— 回傳 `clamped[]` 讓呼叫端說得出口。 */
export function clampImportLimits(input: Partial<ImportLimits> | undefined): {
  limits: ImportLimits;
  clamped: readonly string[];
} {
  const out: Record<string, number> = { ...DEFAULT_IMPORT_LIMITS };
  const clamped: string[] = [];
  for (const key of Object.keys(
    LIMIT_BOUNDS,
  ).sort() as (keyof ImportLimits)[]) {
    const raw = input?.[key];
    if (raw === undefined) continue;
    const [lo, hi] = LIMIT_BOUNDS[key];
    if (!Number.isFinite(raw)) {
      clamped.push(`${key}: 非數字，改用出貨值`);
      continue;
    }
    const v = Math.min(hi, Math.max(lo, Math.floor(raw)));
    if (v !== raw) clamped.push(`${key}: ${raw} → ${v}（允許 ${lo}–${hi}）`);
    out[key] = v;
  }
  return { limits: out as unknown as ImportLimits, clamped };
}

/** 出貨內容的事實 —— 由呼叫端讀 `content/manifest.json` 得到。 */
export interface ContentFacts {
  /** `cv_<12 hex>`，全部集合雜湊的純函式。 */
  readonly contentVersion: string;
  /** collection → 12 hex 雜湊（`manifest.json` 的 `collections[*].hash`）。 */
  readonly collectionHashes: Readonly<Record<string, string>>;
}

export interface TargetProfileInput {
  /** ISO 時間字串。⚠️ 由呼叫端給，這支不看時鐘（可測性 + 決定性）。 */
  readonly generatedAt: string;
  /** 建置戳記（版本徽章那一個）。拿不到就 `null`，⛔ 不要填 "unknown" 之類的字串。 */
  readonly gameVersion: string | null;
  /** `content/manifest.json` 讀得到就給；讀不到（未 build）給 null。 */
  readonly content: ContentFacts | null;
  readonly capabilities?: RuntimeCapabilityManifest;
  readonly limits?: Partial<ImportLimits>;
  readonly reloadMode?: ReloadMode;
  /**
   * ⭐ P1-1 —— `content/assets-manifest.json` 的內容（讀不到 ⇒ null）。
   * ⛔ 這一支**不讀檔** —— 呼叫端給，理由與 `content` 那一格逐字相同（可測性 + 決定性）。
   */
  readonly assetManifest?: AssetManifestFacts | null;
  /** ⭐ 規格 §1 —— 由 `buildAuthoringProcessor(repoRoot)` 量出來的宣告。 */
  readonly authoringProcessor?: AuthoringProcessorDeclaration | null;
  /** ⭐ 這一台**現在**的 ACTIVE（⛔ 沒有就是 undefined ⇒ 只有 bootstrap 合法）。 */
  readonly active?: {
    readonly hasSnapshot: boolean;
    readonly activationDigest: string | null;
    readonly authoringDigest: string | null;
  };
  /** ⭐ bootstrap 要帶的 migration fingerprint。 */
  readonly migrationFingerprint?: string | null;
  /** ⭐ 掛上去的匯入端點（⛔ 沒傳 ⇒ `endpointsMounted` 是 false ⇒ 擋在 G1）。 */
  readonly importerEndpoints?: readonly { readonly method: string; readonly path: string }[];
  /** ⭐ P1-2 —— 兩份 vfx 設定（缺席 ⇒ 出貨預設，⛔ 不是 0）。 */
  readonly vfxBudget?: unknown;
  readonly vfxCleanup?: unknown;
}

/** ⭐ P1-1 —— asset manifest 裡這一支需要的那一小片。 */
export interface AssetManifestFacts {
  readonly schema: string;
  readonly counts: { readonly entries: number; readonly totalBytes: number };
  readonly entries: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
}

/** 一格「現在拿不到」的東西：欄位名 + **為什麼** + 對方該怎麼辦。 */
export interface UnavailableField {
  readonly field: string;
  readonly reason: string;
}

export interface TargetProfile {
  readonly schema: typeof TARGET_PROFILE_SCHEMA;
  /**
   * ⚠️⚠️ **⛔ 不要把這一格改成選填** —— 我 2026-08-31 幹過，而理由是假的。
   *
   * ⭐ 陷阱：**有兩個 schema tag，名字只差一個詞**，而它們是**不同的文件**：
   *
   * | tag | 誰產生 | 有 `generatedAt` 嗎 |
   * |---|---|---|
   * | `ggd-**content**-target-profile@1` ← **這一個** | live 端點 `/active/target-profile` | ✅ 呼叫端灌 `now().toISOString()` |
   * | `ggd-**editor**-target-profile@1` | `scripts/buildEditorTargetProfile.ts` → `content/editor-target-profile.json` | ⛔ **沒有**（GH#389：留著每次 build 就髒一次） |
   *
   * ⇒ 看到那份**出貨檔沒有 `generatedAt`** 不代表這一格錯了 ——
   * ⭐ 那份檔**根本不是這個型別**（17 個鍵裡有 9 個必填欄位它一個都沒有）。
   * ⚠️ 兩份文件的**形狀完全不同**，只有名字像。
   *
   * ⭐ 那一份的閘另外有兩支：`shippedEditorProfileIsCurrent`（新鮮度）與
   * `generatedArtifactsAreClockFree`（真的跑兩次產生器逐位元組比對）。⛔ 不要在這裡管它。
   */
  readonly generatedAt: string;
  readonly gameVersion: string | null;
  /** 走到計畫 §12 的哪一階段。對方靠它判斷哪些 route 是真的。 */
  readonly implementedStage: string;
  /** 規格 §4.2 的 base。⛔ 三個 digest 在 G1 都是 null，**不可以填假值**。 */
  readonly base: {
    readonly activationDigest: string | null;
    readonly authoringDigest: string | null;
    readonly contentVersion: string | null;
    readonly contentDigest: string | null;
  };
  readonly authoringStoreState: AuthoringStoreState;
  /**
   * ⭐ **stage 還缺哪幾條** —— ⛔ 一個 `"G1"` 不說原因，對面只能猜。
   * ⚠️ G2 時它是空陣列（⛔ 不是省略：省略與「沒有缺」讀起來一樣）。
   */
  readonly stageBlockers: readonly { readonly id: string; readonly why: string }[];
  /**
   * ⭐ 一包 **bootstrap 必須帶**的 migration fingerprint（規格 §10）。
   * ⚠️ 它算的是**出貨的文件面**（`docSurface`，從 Zod 推導）——
   * ⛔ 不是一個手寫版本字串：schema 改了而字串沒改 ⇒ 一包過期的 bootstrap
   * 會被當成當前的收下。
   */
  readonly migrationFingerprint: string | null;
  /** ⭐ 六條匯入端點，機器讀得懂（⛔ 不是散文裡的一段路徑）。 */
  readonly importerEndpoints: readonly { readonly method: string; readonly path: string }[];
  /** ⛔ authoring store 不在時只有 `bootstrap`；delta 需要一個真的 base。 */
  readonly supportedModes: readonly PackageMode[];
  /** ⭐ 對方最該先讀的一行：現在能不能產 production-ready delta。 */
  readonly deltaExportAllowed: boolean;
  /**
   * ⭐⭐ **runtime-direct 處理器宣告**（規格 §1，2026-09-02）。
   * ⛔ 這一格取代了「有沒有編譯器」那個問法 —— 它問的是「**是哪一種**」。
   * ⚠️ `fingerprint` 是**量出來的**（七個共用實作面的位元組雜湊），
   * ⛔ 不是手寫版本字串：schema 改了而版本沒 bump ⇒ 它會靜靜地繼續說「一樣」。
   */
  readonly authoringProcessor: AuthoringProcessorDeclaration | null;
  /** ⛔ 保留給**未來真的需要 compile 的表示法**；runtime-direct 一律 null。 */
  readonly compiler: {
    readonly contractVersion: string | null;
    readonly fingerprint: string | null;
  };
  readonly runtimeCapabilities: RuntimeCapabilityManifest;
  readonly distribution: {
    readonly digest: string | null;
    readonly championCurationDigest: string | null;
    readonly itemCurationDigest: string | null;
  };
  /**
   * ⭐ P1-1（2026-09-02）—— **完整** asset manifest 的 canonical digest。
   * ⛔ 在此之前是 `null`（理由：「尚無版本化的 asset manifest」）⇒ 外部編輯器
   * 拿得到 `glbPath`，⛔ 而**沒有辦法驗證那顆 GLB 是不是它預期的那一顆**。
   */
  readonly assetManifestDigest: string | null;
  /** ⭐ P1-1 —— 清單的位置與筆數，讓編輯器**抓得到**它（⛔ 不只是一個 hash）。 */
  readonly assetManifest: {
    readonly path: string;
    readonly entries: number;
    readonly totalBytes: number;
  } | null;
  /**
   * ⭐ P1-2 —— **實際生效**的 VFX 限制（⛔ 不是 schema 的上界）。
   * 由 `effectiveVfxLimits()` 產生 —— ⭐ 與客戶端 `RibbonTrail` / `ribbonMath` /
   * `particleFactory` **同一支** resolver ⇒ 編輯器看到的就是上線會生效的。
   */
  readonly effectiveVfxLimits: EffectiveVfxLimits;
  /**
   * ⭐ owner 2026-08-15 的裁決寫成**機器讀得懂的形狀**（⛔ 不是散文）。
   * 靜態 profile 從 08-15 起就有它；⛔ 這一份 2026-09-02 才補上 ——
   * ⚠️ 在此之前兩份 receipt 對同一件事說了**相反**的話 17 天。
   */
  readonly authoringModel: {
    readonly accepts: readonly string[];
    readonly notRequired: readonly string[];
    readonly validatedBy: readonly string[];
    readonly intentField: string;
    readonly note: string;
  };
  readonly limits: ImportLimits;
  readonly reloadMode: ReloadMode;
  readonly verification: {
    /** 這份 profile 有沒有被後台簽章。G1 沒有簽章基礎建設 → false。 */
    readonly signed: boolean;
    readonly method: "none";
    readonly note: string;
  };
  /** 每一個 null 的出處。⚠️ 沒有這一格，null 跟「忘了填」長得一模一樣。 */
  readonly unavailable: readonly UnavailableField[];
  /** 除了 `generatedAt` 與自己以外，全部欄位的 sha256（前 16 hex）。 */
  readonly profileDigest: string;
}

/**
 * 建出 target profile。純函式：同樣的 input → 同樣的 output（含 digest）。
 *
 * ⛔ 這裡**沒有任何一行**在 authoring store 不存在時生一個 digest。
 * 那是刻意的，見檔頭。
 */
export function buildTargetProfile(input: TargetProfileInput): TargetProfile {
  const capabilities = input.capabilities ?? buildCapabilityManifest();
  const { limits } = clampImportLimits(input.limits);

  // authoring store 尚未存在（G2 才做）—— 這是事實，不是設定值。
  // ⭐⭐ stage / modes / deltaExportAllowed 全部從**同一組事實**推導。
  //   ⛔ 三個各自手寫 = 三份必然漂的真相。
  const g2: G2Facts = {
    hasActiveSnapshot: input.active?.hasSnapshot ?? false,
    activationDigest: input.active?.activationDigest ?? null,
    authoringDigest: input.active?.authoringDigest ?? null,
    gameRevision: input.gameVersion,
    migrationFingerprint: input.migrationFingerprint ?? null,
    endpointsMounted: input.importerEndpoints !== undefined,
    processorFingerprint: input.authoringProcessor?.fingerprint ?? null,
    assetManifestDigest: input.assetManifest == null ? null : digestOf(input.assetManifest),
  };
  const stageResolved = resolveImplementedStage(g2);
  const authoringStoreState: AuthoringStoreState = authoringStoreStateOf(g2);

  const unavailable: UnavailableField[] = [
    {
      field: "base.activationDigest",
      reason:
        "尚未實作 immutable activation storage 與 ACTIVE pointer（計畫 §12 G2）。" +
        "⛔ 不可以拿 contentVersion 當它用 —— 那是內容雜湊，不是 activation 身分。",
    },
    {
      field: "base.authoringDigest",
      reason:
        "⭐ 2026-09-02 起它**有值了** —— 只要這台 bootstrap 過一次。" +
        "還是 null 就表示還沒有任何 activation（`stageBlockers` 會指名 `active-snapshot`）。",
    },
    {
      field: "compiler.contractVersion / compiler.fingerprint",
      // ⭐ 2026-09-02：這一格的**替代品**已經落地 —— 見 `authoringProcessor`。
      //   ⚠️ 在此之前它只說「不會有編譯器」，⛔ 而沒說「那要看哪一格」
      //   ⇒ 對面只能猜。⭐ 一個 null 要指得出它的**替代欄位**，⛔ 不是只給理由。
      reason:
        "⭐ owner 2026-08-15 裁決：**砍掉編譯器那一層**（commit 5406c4ce7 / GH#327）。" +
        "⛔ 這兩格是 null 的理由**不是「還沒做」，是「這條路上不會有編譯器」** —— " +
        "編輯器直接產 `ability@1`/`item@1`，由 Zod schema ＋ capability 清單 ＋ " +
        "authoring-rules 驗。⚠️ 兩種理由會讓對面做**相反**的事（等你做完 vs 現在就直出）" +
        "⇒ 見 `authoringModel`。⛔ 也不可以為了「看起來完整」填一個假指紋：" +
        "一個宣稱存在的編譯器合約會讓對方去實作重編比對，而那是我們這一側不會做的事，" +
        "於是他們每一包都比對失敗，而失敗訊息看起來像格式問題。",
      // ⚠️ 這一段在 2026-09-02 之前寫的是「尚未實作（計畫 §4.4）」——
      //    ⭐ 靜態 profile 在 08-15 就改對了，⛔ 而**這一份沒有跟著改**：
      //    同一件事，兩份 receipt 說了相反的話 17 天（第三守則的形狀）。
    },
    {
      field: "distribution.digest",
      reason: "distribution-index 尚未從 curation 分離（計畫 §12 G3）。",
    },
    {
      field: "distribution.championCurationDigest / itemCurationDigest",
      reason:
        "白名單住在 platform（Go）服務，不在這個 content 服務的邊界內；" +
        "跨服務讀取要等 G3 決定 distribution index 落點。",
    },
  ];
  if (input.content === null) {
    unavailable.push({
      field: "base.contentVersion / base.contentDigest",
      reason: "content/manifest.json 讀不到 —— 請先跑 `pnpm content:build`。",
    });
  }
  if (input.gameVersion === null) {
    unavailable.push({
      field: "gameVersion",
      reason: "建置戳記不在環境裡（GGD_BUILD_STAMP 未注入）。",
    });
  }

  const body = {
    schema: TARGET_PROFILE_SCHEMA as typeof TARGET_PROFILE_SCHEMA,
    gameVersion: input.gameVersion,
    implementedStage: stageResolved.stage,
    stageBlockers: stageResolved.missing.map((m) => ({ id: m.id, why: m.why })),
    migrationFingerprint: g2.migrationFingerprint,
    importerEndpoints: input.importerEndpoints ?? [],
    base: {
      // ⭐ 2026-09-02 —— 這兩格從**這台現在的 ACTIVE** 讀（⛔ 不再是寫死的 null）。
      //   ⚠️ 沒有 ACTIVE 時仍然是 null，⭐ 而那不是「還沒做」，是「還沒 bootstrap 過」
      //   —— `stageBlockers` 會指名 `active-snapshot` 說出來。
      activationDigest: g2.activationDigest,
      authoringDigest: g2.authoringDigest,
      contentVersion: input.content?.contentVersion ?? null,
      contentDigest:
        input.content === null
          ? null
          : digestOf(input.content.collectionHashes),
    },
    authoringStoreState,
    supportedModes: supportedModesOf(g2),
    deltaExportAllowed: deltaExportAllowedOf(g2),
    authoringProcessor: input.authoringProcessor ?? null,
    compiler: { contractVersion: null, fingerprint: null },
    authoringModel: {
      // ⭐ 從契約登錄表推導（§0-1）—— ⛔ 這裡在 2026-09-02 之前是**第二份**手寫陣列。
      accepts: acceptedRuntimeSchemas(),
      notRequired: [
        "effect-template@1",
        "effect-product@1",
        "effect-chain@1",
        "expectedCompiled",
      ],
      validatedBy: [
        "zod:collection-schema",
        "capabilities:ggd-runtime-capabilities@1",
        "authoring-rules:ggd-authoring-rules@1",
      ],
      intentField: "template.cards",
      note:
        "owner 2026-08-15 裁決：砍掉編譯器那一層。規格 §2 的四層模型是為多作者世界寫的，" +
        "GGD 只有一個作者 —— 一種表示法 ＋ 一個驗證器 ＝ 沒有第二個實作可以漂移。",
    },
    runtimeCapabilities: capabilities,
    distribution: {
      digest: null,
      championCurationDigest: null,
      itemCurationDigest: null,
    },
    assetManifestDigest:
      input.assetManifest == null ? null : digestOf(input.assetManifest),
    assetManifest:
      input.assetManifest == null
        ? null
        : {
            path: "assets-manifest.json",
            entries: input.assetManifest.counts.entries,
            totalBytes: input.assetManifest.counts.totalBytes,
          },
    effectiveVfxLimits: effectiveVfxLimits(
      input.vfxBudget as never,
      input.vfxCleanup as never,
    ),
    limits,
    reloadMode: input.reloadMode ?? "process-reload",
    verification: {
      signed: false,
      method: "none" as const,
      note:
        "G1 沒有簽章基礎建設。⛔ 這份 receipt 只在信任的通道上有意義；" +
        "apply 時仍必須由遊戲端 CAS 重驗（規格 §12）。",
    },
    unavailable,
  };

  return {
    ...body,
    generatedAt: input.generatedAt,
    profileDigest: digestOf(body),
  };
}

/** canonical JSON → sha256 前 16 hex。 */
function digestOf(value: unknown): string {
  return sha256Hex(stableStringify(value)).slice(0, 16);
}
