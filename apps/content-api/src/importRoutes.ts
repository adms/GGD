/**
 * Editor package importer —— G1 的**握手層**，只有讀，沒有寫。
 *
 *   GET  <prefix>/capabilities            引擎能做什麼（從出貨註冊表推導）
 *   GET  <prefix>/active/target-profile   離線建包用的 base receipt
 *   GET  <prefix>/health                  匯入子系統的狀態
 *   POST <prefix>/validate | /apply | /rollback        → 501
 *   GET  <prefix>/active | /active/runtime-bundle | /operations/:id → 501
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼未實作的那些回 501 而不是 200
 *
 * 規格 §11 末：**無法做到原子 activation 時 MUST 回報 unsupported，不得把逐文件
 * PUT 宣稱為成功 apply。** 這個服務底下確實有一整套逐文件 PUT（`server.ts`），
 * 用它們拼一個「apply」在技術上五分鐘就寫得出來 —— 而那正是規格禁止的東西：
 * 一半成功、一半失敗的內容樹，沒有 ACTIVE pointer、沒有 rollback，
 * 而回應會說 `status: "activated"`。對面會據此把那一包標記為已上線。
 *
 * 所以這裡不留任何「暫時先這樣」的成功路徑。501 + 一則指名階段的診斷，
 * 對方的 importer 會 fail-closed，這是唯一安全的預設。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 路由前綴是一個**決策點**，所以它是一個欄位而不是一個寫死的字串
 *
 * 規格 §12 寫的是 `/api/v1/content-import/...`；這個服務既有的全部路由都在
 * `/content-api/...` 之下，而 dev 的 vite / nginx 只轉發 `/content-api`。
 * 二選一都會壞掉一邊（選規格 → 走 vite proxy 的編輯器 404；
 * 選既有 → 對方 pin 的路徑 404）。**兩個都註冊**，成本是零。
 * `DEFAULT_IMPORT_PREFIXES` 的第一項是規格路徑，也是文件上該引用的那一個。
 *
 * ⚠️ POST 那三條仍然先經過 `registerDevWriteGuard`（onRequest hook，比路由早），
 * 所以非 loopback 的呼叫拿到的是 403 而不是 501。那是對的順序 —— 授權在能力宣告
 * 之前。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { buildCapabilityManifest } from "@ggd/shared/content/editorCapabilities";
import { buildAuthoringRules } from "@ggd/shared/content/authoringRules";
import { Configs } from "@ggd/shared/content";
import {
  IMPORT_DIAGNOSTICS,
  formatDiagnostic,
} from "@ggd/shared/content/import/diagnostics";
import { buildAuthoringProcessor } from "@ggd/shared/content/import/authoringProcessor";
import {
  pathParts,
  validatePackage,
} from "@ggd/shared/content/import/validatePackage";
import type { BaseFacts } from "@ggd/shared/content/import/validatePackage";
import {
  ZIP_LIMITS,
  checkZipSafety,
} from "@ggd/shared/content/import/zipSafety";
import {
  ZipFormatError,
  archiveSha256,
  extractEntry,
  readCentralDirectory,
} from "./zipReader";
import { createHash } from "node:crypto";
import { ImportStore } from "./importStore";
import type { ActivePointer } from "./importStore";
import {
  IMPLEMENTED_STAGE,
  IMPORT_ERROR_SCHEMA,
  IMPORT_HEALTH_SCHEMA,
  IMPORT_RESULT_SCHEMA,
  type ImportErrorEnvelope,
  buildTargetProfile,
  clampImportLimits,
  type AssetManifestFacts,
  type ContentFacts,
  type ImportLimits,
  type ReloadMode,
} from "@ggd/shared/content/import/targetProfile";

/** 規格 §12 的路徑在前，既有服務的前綴在後。兩個都活著。 */
export const DEFAULT_IMPORT_PREFIXES: readonly string[] = [
  "/api/v1/content-import",
  "/content-api/content-import",
];

export interface ImportRoutesOptions {
  /** 已解析的 content 根目錄（`manifest.json` 就在裡面）。 */
  contentDir: string;
  prefixes?: readonly string[];
  limits?: Partial<ImportLimits>;
  reloadMode?: ReloadMode;
  /** 建置戳記；拿不到就是 null（⛔ 不要填佔位字串）。 */
  gameVersion?: string | null;
  /**
   * ⭐ repo 根目錄 —— `authoringProcessor` 指紋要讀那七個實作面的位元組。
   * ⛔ 預設 `resolve(contentDir, "..")` 是**假設**（出貨佈局是 `<repo>/content`）；
   * ⚠️ 佈局不同時要明示傳入，⭐ 否則指紋算不出來 ⇒ profile 標 null 並附理由
   * （⛔ 不是靜靜地產出一個涵蓋不到東西的假指紋）。
   */
  repoRoot?: string;
  /** ⭐ 匯入狀態的落點。預設 `<contentDir>/../data/content-import`（⛔ 在 content/ 之外）。 */
  importDir?: string;
  /** 注入時鐘，讓守衛拿得到穩定的 `generatedAt`。 */
  now?: () => Date;
}

/**
 * 這一輪**沒有**實作的 route。
 *
 * 一張表 + 一個模板，不是 6 段複製貼上的 handler（CLAUDE.md 第零守則⑨）。
 */
const UNIMPLEMENTED: readonly {
  method: "get" | "post";
  path: string;
  stage: string;
  why: string;
}[] = [
  // ⭐ 2026-09-02 —— validate / apply / rollback / active / operations / runtime-bundle
  //   六條**都已經實作**（見底下的 registerG2Routes）。
  // ⚠️ ⛔ 而 `implementedStage` **仍然是 G1** —— 規格 §3 逐字：
  //   「target profile 真的完成後**才可**宣告 implementedStage: G2」。
  //   ⭐ 今天還缺：bootstrap migrationFingerprint · full/delta 的 base.activationDigest /
  //   authoringDigest · supportedModes 擴到 full/delta · deltaExportAllowed。
  //   ⇒ ⛔ 我**不**為了讓對面的按鈕亮起來而提前宣告。
];

/** 讀 `content/manifest.json` 的事實；沒 build 過就回 null。 */
async function readContentFacts(root: string): Promise<ContentFacts | null> {
  const file = join(root, "manifest.json");
  if (!existsSync(file)) return null;
  try {
    const m = JSON.parse(await readFile(file, "utf8")) as {
      contentVersion?: unknown;
      collections?: Record<string, { hash?: unknown }>;
    };
    if (
      typeof m.contentVersion !== "string" ||
      typeof m.collections !== "object" ||
      m.collections === null
    ) {
      return null;
    }
    const collectionHashes: Record<string, string> = {};
    for (const key of Object.keys(m.collections).sort()) {
      const h = m.collections[key]?.hash;
      if (typeof h === "string") collectionHashes[key] = h;
    }
    return { contentVersion: m.contentVersion, collectionHashes };
  } catch {
    // 壞掉的 manifest 與沒有 manifest 對建包來說是同一個答案：拿不到 base。
    return null;
  }
}

/**
 * 501 的統一回應 —— ⭐ **獨立的 `ggd-content-import-error@1` 外殼**（計畫 §4.1）。
 *
 * ⚠️ 2026-08-14 之前這裡回的是 `ggd-content-import-result@1`，而且**三處違規**：
 *   · `operationId: null` —— 那是 result 外殼的必填欄位
 *   · `code: "unsupported-operation"` —— **不在** `IMPORT_DIAGNOSTICS` 登錄表裡
 *   · `severity: "blocker"` —— 登錄表用的是 `error`
 *
 * ⛔ 為什麼這比「訊息不好看」嚴重：對面用 schema tag 決定用哪一個 parser。
 * 一個宣稱是 result 卻不合 result schema 的東西，讓對方分不出
 * 「我解析錯了」與「你們還沒做」—— 而那兩者的處置完全相反。
 */
function unsupported(
  reply: FastifyReply,
  path: string,
  stage: string,
  why: string,
): FastifyReply {
  const envelope: ImportErrorEnvelope = {
    schema: IMPORT_ERROR_SCHEMA,
    code: IMPORT_DIAGNOSTICS.OPERATION_NOT_IMPLEMENTED.code,
    message: formatDiagnostic("OPERATION_NOT_IMPLEMENTED", {
      path,
      stage,
      why,
    }),
    path,
    plannedStage: stage,
    implementedStage: IMPLEMENTED_STAGE,
    // ⛔ 未實作**不是**暫時性失敗 —— 重試一百次還是未實作。
    retryable: false,
  };
  return reply.code(501).send(envelope);
}

/**
 * ⭐ P1-1 —— 讀 `content/assets-manifest.json`。
 *
 * ⛔ 讀不到／壞掉 ⇒ `null`（與 `readContentFacts` 逐字相同的處置）：
 * ⭐ 一份**拿不到**的 asset manifest 與一份**空的** asset manifest 是兩件事 ——
 * 後者會讓外部編輯器以為「這個 Base 沒有任何二進位資產」而放行一包引用 GLB 的內容。
 */
async function readAssetManifest(
  root: string,
): Promise<AssetManifestFacts | null> {
  const file = join(root, "assets-manifest.json");
  if (!existsSync(file)) return null;
  try {
    const m = JSON.parse(await readFile(file, "utf8")) as AssetManifestFacts;
    if (typeof m.schema !== "string" || !Array.isArray(m.entries)) return null;
    return m;
  } catch {
    return null;
  }
}

/** ⭐ P1-2 —— 兩份 vfx 設定（缺席 ⇒ `undefined`，由 resolver 用出貨預設）。 */
function vfxDocs(): { budget: unknown; cleanup: unknown } {
  return {
    budget: Configs.tryGet("vfx-budget"),
    cleanup: Configs.tryGet("vfx-cleanup"),
  };
}

export function registerImportRoutes(
  app: FastifyInstance,
  opts: ImportRoutesOptions,
): void {
  const root = resolve(opts.contentDir);
  const prefixes = opts.prefixes ?? DEFAULT_IMPORT_PREFIXES;
  const now = opts.now ?? (() => new Date());
  /**
   * ⭐ 規格 §1 —— runtime-direct 處理器宣告，**註冊時算一次**。
   *
   * ⚠️ ⛔ 不在每次請求算：它讀十幾個檔案的位元組，⭐ 而那幾個檔在行程活著的時候不會變。
   * ⚠️ ⛔ 也不讓它在請求裡擲例外（那會 500 掉一個純讀取的端點）——
   *   ⭐ 算不出來就是 `null`，⛔ 而 null **必須說得出理由**（profile 的 `unavailable`）。
   */
  const repoRoot = opts.repoRoot ?? resolve(root, "..");
  let authoringProcessor: ReturnType<typeof buildAuthoringProcessor> | null =
    null;
  try {
    authoringProcessor = buildAuthoringProcessor(repoRoot);
  } catch (e) {
    app.log.warn(
      { err: e, repoRoot },
      "content-import: 算不出 authoringProcessor 指紋 —— profile 會標成 null 並附理由",
    );
  }

  /**
   * ⭐ 匯入的持久狀態（候選 / 操作 / staging / ACTIVE / history）。
   *
   * ⚠️ ⭐ 落在 `<contentDir>/../data/content-import` —— **刻意在 `content/` 之外**，
   * ⛔ 與備份同一個理由：它不可以進出貨樹，也不可以被烘進映像。
   */
  const store = new ImportStore({
    dir: opts.importDir ?? resolve(root, "..", "data", "content-import"),
  });

  /**
   * ⭐ profile 要的那幾格「這台**現在**是什麼狀態」。
   *
   * ⚠️ ⭐ `migrationFingerprint` 的語意是「**一包 bootstrap 是對哪一套 schema 建的**」
   * ⇒ 它算的是**出貨的文件面**（`docSurface`，從 Zod 推導）。
   * ⛔ 不是一個手寫的版本字串：schema 改了而字串沒改 ⇒ 一包過期的 bootstrap
   * 會被當成當前的收下。
   */
  const g2Facts = (): {
    active: { hasSnapshot: boolean; activationDigest: string | null; authoringDigest: string | null };
    migrationFingerprint: string;
  } => {
    const a = store.active();
    const caps = buildCapabilityManifest();
    return {
      active: {
        hasSnapshot: a !== null,
        activationDigest: a?.activationDigest ?? null,
        // ⭐ authoring corpus 的 digest ＝ ACTIVE 那一棵樹的 digest。
        //   ⚠️ 今天它與 `activationDigest` 是同一個值（一次 apply 換一整棵樹）——
        //   ⛔ 而兩格**刻意分開**：之後 authoring store 與 activation 會分家。
        authoringDigest: a?.activationDigest ?? null,
      },
      migrationFingerprint: sha12(
        JSON.stringify(caps.docSurface) + "|" + JSON.stringify(caps.templateFamilies),
      ),
    };
  };

  /** ⭐ 與 repo 其餘 digest 同一個政策（sha256 前 12 hex）。 */
  const sha12 = (t: string): string =>
    createHash("sha256").update(t, "utf8").digest("hex").slice(0, 12);

  const { limits, clamped } = clampImportLimits(opts.limits);
  if (clamped.length > 0) {
    app.log.warn({ clamped }, "content-import: 匯入預算超出允許範圍，已夾回");
  }

  for (const prefix of prefixes) {
    app.get(`${prefix}/capabilities`, async (_req, reply) => {
      const content = await readContentFacts(root);
      const profile = buildTargetProfile({
        generatedAt: now().toISOString(),
        gameVersion: opts.gameVersion ?? null,
        content,
        limits: opts.limits,
        authoringProcessor,
        ...g2Facts(),
        importerEndpoints: IMPORTER_ENDPOINTS,
        ...(opts.reloadMode !== undefined
          ? { reloadMode: opts.reloadMode }
          : {}),
      });
      // capabilities 是 target-profile 的子集合，**由同一次建構得出** ——
      // 兩邊各算一次就會 drift，而 drift 的那一天沒有人會發現。
      return reply.send({
        schema: profile.runtimeCapabilities.schema,
        implementedStage: IMPLEMENTED_STAGE,
        runtimeCapabilities: profile.runtimeCapabilities,
        unsupported: profile.runtimeCapabilities.unsupported,
        supportedModes: profile.supportedModes,
        deltaExportAllowed: profile.deltaExportAllowed,
        authoringStoreState: profile.authoringStoreState,
        compiler: profile.compiler,
        limits,
        reloadMode: profile.reloadMode,
        targetProfileSchema: profile.schema,
        vfxDocumentAuthoring: false,
        base: profile.base,
        unavailable: profile.unavailable,
      });
    });

    /**
     * ⭐ GH#327 —— 創作規則（`ggd-authoring-rules@1`）。
     *
     * `docs/技能編輯器引擎須知` 第九章寫死了它:「權威是一個**推導出來的端點**」
     * 「⛔ 你抄一份到編輯器裡 = 第二個住處 = 它一定會過期」。那一章寫完之後
     * 沒有人實作它,於是 profile 的 `pricingEndpoint` 一直是 `null`,出處指著
     * 那份自己說會過期的散文。
     *
     * ⚠️ 這裡讀的是**執行期的 `Configs` 登錄表**（含後台 override）——
     * owner 在後台改一格,這個端點下一秒就變,對方不用改一行程式。
     */
    app.get(`${prefix}/authoring-rules`, async (_req, reply) =>
      reply.send(buildAuthoringRules((id) => Configs.tryGet(id))),
    );

    /**
     * ⭐ 短路徑別名 —— `/content-api/authoring-rules`（⛔ 不帶 `/content-import`）。
     *
     * ⚠️ ⭐ 為什麼值得有：創作規則是**編輯器每一次開啟技能都會問**的東西，
     * ⛔ 而它跟「匯入」在語意上沒有關係 —— 匯入前綴只是它今天的**住址**。
     * ⇒ 一個外部作者照著 `/content-api/...` 的其他路由推測，會打到短路徑而拿到 404。
     *
     * ⭐ 它是**同一個 handler**（⛔ 不是第二份實作 —— 那會是第〇·四守則的第二個住處）。
     * ⚠️ 只在 `/content-api` 那一個前綴底下掛（⛔ 不掛在 `/api/v1/...` 上，
     * 那是對外的版本化路徑，⭐ 而別名是給本機開發用的便利）。
     */
    if (
      prefix.endsWith("/content-import") &&
      prefix.startsWith("/content-api")
    ) {
      app.get("/content-api/authoring-rules", async (_req, reply) =>
        reply.send(buildAuthoringRules((id) => Configs.tryGet(id))),
      );
    }

    app.get(`${prefix}/active/target-profile`, async (_req, reply) => {
      const content = await readContentFacts(root);
      return reply.send(
        buildTargetProfile({
          generatedAt: now().toISOString(),
          gameVersion: opts.gameVersion ?? null,
          content,
          assetManifest: await readAssetManifest(root),
          vfxBudget: vfxDocs().budget,
          vfxCleanup: vfxDocs().cleanup,
          limits: opts.limits,
          // ⭐ 與上面 `capabilities` **同一個**物件 ⇒ ⛔ 兩份 receipt 不可能漂。
          authoringProcessor,
          // ⭐ 與上面**同一支** `g2Facts()` ⇒ ⛔ 兩份 profile 不可能對 stage 說不同的話。
          ...g2Facts(),
          importerEndpoints: IMPORTER_ENDPOINTS,
          ...(opts.reloadMode !== undefined
            ? { reloadMode: opts.reloadMode }
            : {}),
        }),
      );
    });

    app.get(`${prefix}/health`, async (_req, reply) => {
      const content = await readContentFacts(root);
      const caps = buildCapabilityManifest();
      // ⚠️ 刻意**不是**計畫 §4.1 的四個狀態之一（activated / awaiting-reload /
      // degraded / rollback-required）—— 那四個都預設「有一個 activation」。
      // 回一個對方 switch 不到的值，會讓對方 fail-closed，這正是我們要的。
      return reply.send({
        schema: IMPORT_HEALTH_SCHEMA,
        status: "not-implemented",
        implementedStage: IMPLEMENTED_STAGE,
        activation: null,
        authoringStoreState: "absent",
        contentVersion: content?.contentVersion ?? null,
        capabilityFingerprint: caps.fingerprint,
        reloadMode: opts.reloadMode ?? "process-reload",
      });
    });

    for (const route of UNIMPLEMENTED) {
      const full = `${prefix}${route.path}`;
      app[route.method](full, async (_req, reply) =>
        unsupported(
          reply,
          `${prefixes[0]}${route.path}`,
          route.stage,
          route.why,
        ),
      );
    }

    registerG2Routes(app, prefix, {
      root,
      store,
      authoringProcessor,
      // ⭐ 這一台**支援**的 capability id ——
      //   ⛔ 從出貨的 `simCapabilities`（available=true 的那些）＋ 出貨 effect kinds 推導，
      //   ⛔ 不是一張手寫名單（第〇·五守則：能力清單是**推導出來**的）。
      capabilities: () => {
        const cm = buildCapabilityManifest();
        const out = new Set<string>();
        for (const [id, v] of Object.entries(cm.simCapabilities)) {
          if (v.available) out.add(id);
        }
        for (const f of cm.templateFamilies) out.add(f);
        for (const k of cm.docSurface["ability@1"] ?? [])
          out.add("ability@1." + k);
        return out;
      },
      reloadMode: opts.reloadMode ?? "process-reload",
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐ G2：validate / apply / rollback / active / runtime-bundle / operations
// ══════════════════════════════════════════════════════════════════════════

/**
 * ⭐ **六條匯入端點**，一張表。
 *
 * ⚠️ ⛔ 它不是為了好看：`target profile` 要把它交出去（規格 §3「machine-readable
 * importer endpoints」）—— ⭐ 而 profile 與實際掛上去的路線必須是**同一份資料**，
 * ⛔ 不是兩份會漂的清單。閘：`importRoutesG2.test.ts` 逐條 inject 打得到。
 */
export const IMPORTER_ENDPOINTS: readonly { method: string; path: string }[] = Object.freeze([
  { method: "POST", path: "/validate" },
  { method: "POST", path: "/apply" },
  { method: "POST", path: "/rollback" },
  { method: "GET", path: "/active" },
  { method: "GET", path: "/active/target-profile" },
  { method: "GET", path: "/active/runtime-bundle" },
  { method: "GET", path: "/operations/:operationId" },
  { method: "GET", path: "/audit" },
  { method: "GET", path: "/health" },
  { method: "GET", path: "/capabilities" },
]);

interface G2Deps {
  readonly root: string;
  readonly store: ImportStore;
  readonly authoringProcessor: { readonly fingerprint: string } | null;
  readonly capabilities: () => Set<string>;
  readonly reloadMode: ReloadMode;
}

/**
 * ⭐ 從**出貨樹**讀出 base 事實。
 *
 * ⚠️ `present` 是 ⑥（隱式刪除）與 ⑦（相依封閉）的分母 ——
 * ⛔ 讀不到就回空 Map，⭐ 而那會讓 ⑥ 變成永遠通過。
 * ⇒ 所以呼叫端拿不到 `manifest.json` 時**不可以**跑 full 模式的 apply。
 */
async function readBaseFacts(
  root: string,
  active: ActivePointer | null,
): Promise<BaseFacts> {
  const present = new Map<string, Set<string>>();
  const idx = join(root, "bundle.json");
  if (existsSync(idx)) {
    try {
      const b = JSON.parse(await readFile(idx, "utf8")) as {
        docs?: Record<string, Record<string, unknown>>;
      };
      for (const [collection, byId] of Object.entries(b.docs ?? {})) {
        present.set(collection, new Set(Object.keys(byId)));
      }
    } catch {
      // ⛔ 讀不到就是空的 —— 呼叫端會在 full 模式看到「隱式刪除」而停下來。
    }
  }
  const content = await readContentFacts(root);
  return {
    gameRevision: null,
    contentVersion: content?.contentVersion ?? null,
    activationDigest: active?.activationDigest ?? null,
    authoringDigest: null,
    present,
  };
}

function registerG2Routes(
  app: FastifyInstance,
  prefix: string,
  d: G2Deps,
): void {
  const fp = d.authoringProcessor?.fingerprint ?? "";

  /**
   * ⭐ 收 `application/zip` 成 **Buffer**。
   *
   * ⚠️ ⛔ 這裡就是**上傳的有界性**（bounded upload）落地的地方：
   * `bodyLimit` 用 `ZIP_LIMITS.maxArchiveCompressedBytes` —— ⭐ 與 `checkZipSafety`
   * **同一個數字**，⛔ 不是另外挑一個（兩個數字必然漂，而漂開的那一天
   * 「擋在門口」與「擋在檢查」會給出不同的答案）。
   */
  if (!app.hasContentTypeParser("application/zip")) {
    app.addContentTypeParser(
      ["application/zip", "application/octet-stream"],
      { parseAs: "buffer", bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes },
      (_req, body, done) => {
        done(null, body);
      },
    );
  }

  /**
   * ⭐⭐ **ZIP 傳輸層** —— 一份 `application/zip` body → package 物件。
   *
   * ⚠️ ⭐ 順序是承重的，⛔ 不可以調換：
   *   ① 讀 **central directory**（⛔ 不解壓 —— zip-slip 在解開那一刻就發生了）
   *   ② `checkZipSafety`（17 條：slip / symlink / 重複 / 大小寫碰撞 / 壓縮比…）
   *   ③ **只解**通過的那些 entry，且逐份驗 local header／長度／CRC
   * ⇒ ⭐ ②夾在①③之間 —— ⛔ 任何「先解開再檢查」的寫法都讓檢查變成裝飾。
   */
  const fromZip = (body: Buffer): unknown => {
    if (body.length > ZIP_LIMITS.maxArchiveCompressedBytes) {
      throw new ZipFormatError(
        "ZIP_ARCHIVE_TOO_LARGE",
        `ZIP ${body.length} bytes 超過上限 ${ZIP_LIMITS.maxArchiveCompressedBytes}。`,
      );
    }
    const cd = readCentralDirectory(body);
    const safety = checkZipSafety(cd.entries);
    if (!safety.ok) {
      const first = safety.diagnostics[0];
      throw new ZipFormatError(
        first?.code ?? "ZIP_UNSAFE",
        safety.diagnostics
          .map((x) => `${x.code} ${x.path}: ${x.message}`)
          .join(" | "),
      );
    }
    const byPath = new Map<string, string>();
    for (const e of cd.entries) {
      if (e.isDirectory === true) continue;
      byPath.set(e.path, extractEntry(body, e).toString("utf8"));
    }
    const manifestRaw = byPath.get("manifest.json");
    if (manifestRaw === undefined) {
      throw new ZipFormatError(
        "ZIP_MANIFEST_MISSING",
        "ZIP 裡沒有 manifest.json。",
      );
    }
    const documents: { path: string; document: unknown }[] = [];
    for (const [path, text] of byPath) {
      if (!path.startsWith("authoring/")) continue;
      documents.push({ path, document: JSON.parse(text) as unknown });
    }
    documents.sort((a, b) => (a.path < b.path ? -1 : 1));
    return {
      schema: "ggd-editor-import@1",
      manifest: JSON.parse(manifestRaw) as unknown,
      documents,
    };
  };

  /**
   * ⭐ body 可能是 JSON 也可能是 ZIP。
   * ⛔ 由 **Buffer 與否**決定（content-type parser 已經分好了），
   * ⛔ 不是「試著 parse 看看」—— 那是一條猜測路徑。
   */
  const packageOf = (body: unknown, jsonField: unknown): unknown =>
    Buffer.isBuffer(body) ? fromZip(body) : jsonField;

  /** ⭐ validate 與 apply 共用**同一支**驗證 —— ⛔ 兩份實作必然漂。 */
  const runValidate = async (raw: unknown) =>
    validatePackage({
      raw,
      base: await readBaseFacts(d.root, d.store.active()),
      capabilities: d.capabilities(),
      processorFingerprint: fp,
    });

  const resultOf = (
    operationId: string,
    status: "validated" | "activated" | "rejected" | "rolled-back",
    v: Awaited<ReturnType<typeof runValidate>> | null,
    extra: Record<string, unknown> = {},
  ) => ({
    schema: "ggd-content-import-result@1",
    operationId,
    status,
    packageDigest: v?.value?.manifest.packageDigest ?? null,
    previousContentVersion: null,
    newContentVersion: null,
    previousAuthoringDigest: null,
    newAuthoringDigest: null,
    planDigest: null,
    diagnostics: v?.diagnostics ?? [],
    changedDocuments: (v?.changed ?? []).map(
      (c: {
        collection: string;
        id: string;
        path: string;
        contentSha256: string;
      }) => ({
        kind: c.collection,
        id: c.id,
        path: c.path,
        op: "upsert",
        contentSha256: c.contentSha256,
      }),
    ),
    selectionRoots: v?.value?.manifest.selectionRoots ?? [],
    fidelityDecisions: [],
    derivedDocuments: [],
    activationDigest: null,
    reloadMode: d.reloadMode,
    authoringStoreState: d.store.active() === null ? "absent" : "present",
    ...extra,
  });

  // ── POST /validate —— ⭐ **無狀態變更**（規格逐字）───────────────────────
  app.post(
    `${prefix}/validate`,
    { bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes },
    async (req, reply) => {
      let raw: unknown;
      try {
        raw = packageOf(req.body, req.body);
      } catch (e) {
        return reply.code(422).send({
          schema: IMPORT_ERROR_SCHEMA,
          code: e instanceof ZipFormatError ? e.code : "ZIP_UNREADABLE",
          message: e instanceof Error ? e.message : String(e),
          retryable: false,
        });
      }
      const v = await runValidate(raw);
      // ⛔ 這條 route 一個位元組都不寫 —— `operationId` 由 digest 推導，⛔ 不落地。
      const id =
        "validate-" +
        (v.value?.manifest.packageDigest ?? "unparsable").slice(-16);
      return reply.code(v.ok ? 200 : 422).send({
        ...resultOf(id, v.ok ? "validated" : "rejected", v),
        // ⭐ ZIP 進來的才有 —— 讓對面比對得出「你收到的是不是我送的那一份檔」。
        ...(Buffer.isBuffer(req.body)
          ? { transport: { archiveSha256: archiveSha256(req.body) } }
          : {}),
      });
    },
  );

  // ── POST /apply ────────────────────────────────────────────────────────
  app.post<{
    Body: {
      operationId?: string;
      package?: unknown;
      expectedActivationDigest?: string | null;
    };
  }>(
    `${prefix}/apply`,
    { bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes },
    async (req, reply) => {
      // ⭐ ZIP body 沒有欄位可放 `operationId` ⇒ 走 header。
      //   ⛔ 不是塞進 ZIP 裡：一個寫在包裡的冪等鍵會**跟著包被重送**，那就不是冪等鍵了。
      const zipOpId = String(req.headers["x-ggd-operation-id"] ?? "");
      const body =
        (Buffer.isBuffer(req.body) ? { operationId: zipOpId } : req.body) ?? {};
      const operationId =
        typeof body.operationId === "string" ? body.operationId : "";
      if (operationId === "") {
        return reply.code(400).send({
          schema: IMPORT_ERROR_SCHEMA,
          code: "MISSING_OPERATION_ID",
          message:
            "apply 必須帶 operationId —— ⭐ 它是冪等鍵：重送同一個 id 要回同一個答案，" +
            "⛔ 不是再跑一次。",
          retryable: false,
        });
      }
      // ⭐ 冪等：已經到終態的操作**直接回它自己**（⛔ 不重跑）。
      const prior = d.store.getOperation(operationId);
      if (
        prior !== null &&
        (prior.status === "activated" || prior.status === "rejected")
      ) {
        return reply.code(200).send({
          ...resultOf(operationId, prior.status, null),
          replayed: true,
        });
      }

      d.store.beginOperation(operationId, "content-api");
      // ⭐ **重跑一次驗證** —— ⛔ 不信任先前那一次 validate 的結論
      //   （base 在這中間會動；那正是 CAS 之外的第二道保險）。
      // ⭐ ZIP body 在這裡展開（⛔ 與 validate 走**同一支** `packageOf`）。
      let rawPkg: unknown;
      try {
        rawPkg = packageOf(req.body, body.package);
      } catch (e) {
        d.store.updateOperation(operationId, { status: "rejected" });
        return reply.code(422).send({
          schema: IMPORT_ERROR_SCHEMA,
          code: e instanceof ZipFormatError ? e.code : "ZIP_UNREADABLE",
          message: e instanceof Error ? e.message : String(e),
          retryable: false,
        });
      }
      const v = await runValidate(rawPkg);
      if (!v.ok || v.value === null) {
        d.store.updateOperation(operationId, {
          status: "rejected",
          diagnostics: v.diagnostics,
        });
        return reply.code(422).send(resultOf(operationId, "rejected", v));
      }
      const digest = v.value.manifest.packageDigest;
      try {
        // ⭐ immutable candidate（同一個 digest 只寫一次）。
        d.store.putCandidate(digest, JSON.stringify(rawPkg));
        // ⭐ PREPARED：整棵樹寫到旁邊、fsync、逐份讀回來比對。
        const files = new Map<string, string>();
        for (const doc of v.value.documents) {
          const parts = pathParts(doc.path);
          if (parts === null) continue;
          files.set(
            `${parts.collection}/${parts.id}.json`,
            JSON.stringify(doc.document, null, 2),
          );
        }
        d.store.prepare(operationId, files);
        d.store.updateOperation(operationId, {
          status: "prepared",
          packageDigest: digest,
          changedDocuments: v.changed.map(
            (c: { collection: string; id: string; path: string }) => ({
              collection: c.collection,
              id: c.id,
              path: c.path,
            }),
          ),
        });
        // ⭐ Base CAS ＋ 原子換指標 ＋ 健康回讀。
        const activationDigest = d.store.treeDigest(operationId);
        const headerCas = req.headers["x-ggd-expected-activation"];
        const expected =
          typeof headerCas === "string"
            ? headerCas
            : body.expectedActivationDigest === undefined
              ? undefined
              : body.expectedActivationDigest;
        const pointer = d.store.activate(
          {
            activationDigest,
            packageDigest: digest,
            operationId,
            tree: operationId,
          },
          expected,
        );
        d.store.updateOperation(operationId, {
          status: "activated",
          activationDigest: pointer.activationDigest,
        });
        // ⭐ 稽核：**發生過什麼**（⛔ 與 operations 的「最後長什麼樣」是兩件事）。
        d.store.audit("content-api", "content-import.apply", {
          operationId,
          packageDigest: digest,
          activationDigest: pointer.activationDigest,
          previousActivationDigest: pointer.previousActivationDigest,
          changed: v.changed.length,
          transport: Buffer.isBuffer(req.body) ? "zip" : "json",
        });
        return reply.code(200).send(
          resultOf(operationId, "activated", v, {
            activationDigest: pointer.activationDigest,
          }),
        );
      } catch (e) {
        // ⛔ 失敗**不改** ACTIVE —— 那是 activate 自己保證的（CAS 前一個位元組都不動）。
        d.store.updateOperation(operationId, { status: "rejected" });
        d.store.audit("content-api", "content-import.apply-failed", {
          operationId,
          packageDigest: digest,
          reason: e instanceof Error ? e.message : String(e),
        });
        return reply.code(409).send({
          schema: IMPORT_ERROR_SCHEMA,
          code: "APPLY_FAILED",
          message: e instanceof Error ? e.message : String(e),
          retryable: false,
        });
      }
    },
  );

  // ── POST /rollback ─────────────────────────────────────────────────────
  app.post<{ Body: { expectedActivationDigest?: string } }>(
    `${prefix}/rollback`,
    async (req, reply) => {
      const expected = req.body?.expectedActivationDigest;
      if (typeof expected !== "string") {
        return reply.code(400).send({
          schema: IMPORT_ERROR_SCHEMA,
          code: "MISSING_EXPECTED_ACTIVATION",
          message:
            "rollback 必須帶 expectedActivationDigest —— ⭐ 回捲是**有條件**的：" +
            "⛔ 一個無條件的回捲會把別人剛啟用的東西也捲掉。",
          retryable: false,
        });
      }
      try {
        const p = d.store.rollback(expected);
        d.store.audit("content-api", "content-import.rollback", {
          from: expected,
          to: p.activationDigest,
        });
        return reply.code(200).send({
          ...resultOf("rollback-" + expected.slice(-16), "rolled-back", null),
          activationDigest: p.activationDigest,
        });
      } catch (e) {
        return reply.code(409).send({
          schema: IMPORT_ERROR_SCHEMA,
          code: "ROLLBACK_REFUSED",
          message: e instanceof Error ? e.message : String(e),
          retryable: false,
        });
      }
    },
  );

  // ── GET /active ────────────────────────────────────────────────────────
  app.get(`${prefix}/active`, async (_req, reply) => {
    const a = d.store.active();
    return reply.send({
      schema: "ggd-content-import-active@1",
      active: a,
      // ⭐ 對面要知道「回捲得到嗎」——⛔ 不是自己去猜 history 有沒有東西。
      rollbackAvailable: a !== null && a.previousActivationDigest !== null,
    });
  });

  // ── GET /active/runtime-bundle ─────────────────────────────────────────
  app.get(`${prefix}/active/runtime-bundle`, async (_req, reply) => {
    const tree = d.store.activeTreePath();
    if (tree === null) {
      return reply.code(404).send({
        schema: IMPORT_ERROR_SCHEMA,
        code: "NO_ACTIVE_SNAPSHOT",
        message:
          "還沒有任何 activation ⇒ 沒有 immutable runtime snapshot。" +
          "⛔ `content/bundle.json` **不是**它（那是可變的出貨檔）。",
        retryable: false,
      });
    }
    const a = d.store.active();
    const docs: Record<string, Record<string, unknown>> = {};
    const walk = (dir: string, collection: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name), e.name);
        else if (e.name.endsWith(".json")) {
          const id = e.name.slice(0, -5);
          (docs[collection] ??= {})[id] = JSON.parse(
            readFileSync(join(dir, e.name), "utf8"),
          ) as Record<string, unknown>;
        }
      }
    };
    walk(tree, "");
    return reply.send({
      schema: "ggd-content-runtime-bundle@1",
      activationDigest: a?.activationDigest ?? null,
      packageDigest: a?.packageDigest ?? null,
      docs,
    });
  });

  // ── GET /audit ─────────────────────────────────────────────────────────
  // ⭐ 稽核是**唯讀**的（⛔ 沒有刪除、沒有編輯）—— append-only 的意義就在這裡。
  app.get(`${prefix}/audit`, async (_req, reply) =>
    reply.send({
      schema: "ggd-content-import-audit@1",
      entries: d.store.auditTail(),
    }),
  );

  // ── GET /operations/:operationId ───────────────────────────────────────
  app.get<{ Params: { operationId: string } }>(
    `${prefix}/operations/:operationId`,
    async (req, reply) => {
      const rec = d.store.getOperation(req.params.operationId);
      if (rec === null) {
        return reply.code(404).send({
          schema: IMPORT_ERROR_SCHEMA,
          code: "UNKNOWN_OPERATION",
          message: `沒有 operation ${req.params.operationId}`,
          retryable: false,
        });
      }
      return reply.send(rec);
    },
  );
}
