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
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { buildCapabilityManifest } from "@ggd/shared/content/editorCapabilities";
import { buildAuthoringRules } from "@ggd/shared/content/authoringRules";
import { Configs } from "@ggd/shared/content";
import { IMPORT_DIAGNOSTICS, formatDiagnostic } from "@ggd/shared/content/import/diagnostics";
import {
  IMPLEMENTED_STAGE,
  IMPORT_ERROR_SCHEMA,
  IMPORT_HEALTH_SCHEMA,
  IMPORT_RESULT_SCHEMA,
  type ImportErrorEnvelope,
  buildTargetProfile,
  clampImportLimits,
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
  {
    method: "post",
    path: "/validate",
    stage: "G1（本輪只做握手層，validate 在同階段的下一步）",
    why:
      "需要 bounded transport（zipSafety 已有）+ Zod／capability／authoring-rules 三道驗證。" +
      "⚠️ owner 2026-08-15 砍掉了「遊戲端重編 + 逐位元比對」那一段 —— 見 target profile 的 " +
      "`authoringModel`：編輯器直接產 ability@1，所以沒有第二個編譯器可以漂移。",
  },
  {
    method: "post",
    path: "/apply",
    stage: "G2",
    why: "需要 immutable version storage + CAS + ACTIVE pointer + health read-back。⛔ 逐文件 PUT 不是 apply（規格 §11）。",
  },
  {
    method: "post",
    path: "/rollback",
    stage: "G2",
    why: "沒有 activation 歷史就沒有可回退的目標。",
  },
  {
    method: "get",
    path: "/active",
    stage: "G2",
    why: "尚無 ACTIVE pointer 與 previous verified activation。",
  },
  {
    method: "get",
    path: "/active/runtime-bundle",
    stage: "G2",
    why: "尚無 immutable runtime snapshot；`content/bundle.json` 是可變的出貨檔，不是它。",
  },
  {
    method: "get",
    path: "/operations/:operationId",
    stage: "G2",
    why: "尚無 operation log。",
  },
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
    if (typeof m.contentVersion !== "string" || typeof m.collections !== "object" || m.collections === null) {
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
function unsupported(reply: FastifyReply, path: string, stage: string, why: string): FastifyReply {
  const envelope: ImportErrorEnvelope = {
    schema: IMPORT_ERROR_SCHEMA,
    code: IMPORT_DIAGNOSTICS.OPERATION_NOT_IMPLEMENTED.code,
    message: formatDiagnostic("OPERATION_NOT_IMPLEMENTED", { path, stage, why }),
    path,
    plannedStage: stage,
    implementedStage: IMPLEMENTED_STAGE,
    // ⛔ 未實作**不是**暫時性失敗 —— 重試一百次還是未實作。
    retryable: false,
  };
  return reply.code(501).send(envelope);
}

export function registerImportRoutes(app: FastifyInstance, opts: ImportRoutesOptions): void {
  const root = resolve(opts.contentDir);
  const prefixes = opts.prefixes ?? DEFAULT_IMPORT_PREFIXES;
  const now = opts.now ?? (() => new Date());
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
        ...(opts.reloadMode !== undefined ? { reloadMode: opts.reloadMode } : {}),
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
    if (prefix.endsWith("/content-import") && prefix.startsWith("/content-api")) {
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
          limits: opts.limits,
          ...(opts.reloadMode !== undefined ? { reloadMode: opts.reloadMode } : {}),
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
        unsupported(reply, `${prefixes[0]}${route.path}`, route.stage, route.why),
      );
    }
  }
}
