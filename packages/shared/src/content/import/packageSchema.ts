/**
 * `ggd-editor-package@1` manifest／`ggd-editor-import@1` Package JSON／
 * `ggd-content-import-result@1` 的 Zod 契約 —— G1 握手層。
 *
 * 這一層**只做握手**：確認「這份東西是不是一個合法的 package，它宣稱的 mode 與
 * base pin 有沒有自相矛盾」。它**不**建 authoring store、**不**編譯、**不**啟用。
 * 那些是 G1 之後的事（規格 §11 第 3 步以後）。
 *
 * 出處：`GGD_EDITOR_PACKAGE_SPEC.md` §8（ZIP 結構）、§9（Package JSON／raw runtime）、
 *      §10（manifest 全欄位）、§11（importer 流程）、§12（結果格式）。
 *
 * ── 兩個刻意的寬嚴選擇（都寫在這裡，不散在程式裡）────────────────────────
 *
 * 1. **物件預設 passthrough，不 strict。** 規格 §10 的用語是「至少包含」，所以
 *    Editor 之後多帶欄位不該被我們擋掉；而且 packageDigest 是對**原始 JSON**的
 *    projection 取 hash，parse 後把未知欄位吃掉會讓下游重算 digest 時對不上。
 *    ⛔ 唯一的例外是 `acceptedWarnings[]`：規格明文「不得 ignoreAll」，
 *    那一格用 `.strict()`，多一個 key 就是違規（見 `zAcceptedWarning`）。
 *
 * 2. **每個字串／陣列都有上界。** CLAUDE.md 第一守則：欄位要有上界不是只有下界。
 *    上界集中在 `IMPORT_LIMITS`。⚠️ 這裡的數字是 schema 的**硬天花板**（防
 *    zip-bomb／記憶體爆掉），不是營運上的配額 —— 規格 §12／PLAN §4.1 要求
 *    `capabilities` 端點回報 per-deployment 的 `limits`，那一份是可調的後台值，
 *    由 capabilities 那一層負責，兩者不要混。
 */
import { z } from "zod";
import type { ImportDiagnostic } from "./diagnostics";
import { parseWithUnknownFieldReport } from "./unknownFields";
import { zImportDiagnostic } from "./diagnostics";

/** Schema 的硬天花板。營運配額走 capabilities 的 `limits`，見檔頭第 2 點。 */
export const IMPORT_LIMITS = Object.freeze({
  /** 一般短字串（id、revision、fingerprint、政策名…）。 */
  maxShortString: 256,
  /** POSIX 相對路徑。 */
  maxPathLength: 400,
  /** reviewer 的說明文字。 */
  maxNoteLength: 2000,
  /** `documents[]` / `compiled[]` / `validation[]` 各自的上限。 */
  maxDocuments: 20000,
  /** `entries[]` / `requires[]` / `expected*[]` 的上限。 */
  maxManifestRows: 40000,
  /** `selectionRoots[]` / `changes[]` 的上限。 */
  maxChangeRows: 20000,
  /** `acceptedWarnings[]` / `fidelityDecisions[]` / `requiredScenarios[]` 的上限。 */
  maxReviewRows: 2000,
  /** 單一文件的 JCS canonical bytes。 */
  maxContentSize: 32 * 1024 * 1024,
});

// ──────────────────────────────────────────────────────────────────────────
// 基本型
// ──────────────────────────────────────────────────────────────────────────

const zShort = z.string().min(1).max(IMPORT_LIMITS.maxShortString);

/**
 * `contentSha256` 的 wire format：**`sha256:` ＋ 64 位小寫十六進位**。
 *
 * ⛔⛔ **這一格在 2026-08-31 之前是「裸 hex」，而那讓產生端與驗證端對不上。**
 *
 * ⭐ 量到的（⛔ 不是推測）：
 * ```
 * contentSha256({...})  ⇒ "sha256:9420d195be4a…"   （jcs.ts:104，檔頭逐字「規格 §1」）
 * zSha256Hex.safeParse(那個值)  ⇒ 🔴 **拒**        （這裡，檔頭也逐字「規格 §1」）
 * ```
 * ⇒ ⭐⭐ **產生端的輸出過不了自己的驗證器** —— 而兩邊的註解都說自己照著同一節規格。
 *
 * ⚠️ ⭐ 這是「**配對式後置條件**」那一族（CLAUDE.md 記過的 2026-08-02 事故同型）：
 * 兩個名詞**各自都對**，⛔ 而它們的**關係**是壞的 ——
 * 而 main 在此之前**沒有任何一條測試問那個關係**。
 *
 * ── ⭐ 為什麼統一成**帶前綴**，⛔ 而不是拿掉前綴 ────────────────────────
 * · 產生端（`jcs.ts`）已經帶前綴，而規格 §2.1.1.1 的 manifest 範例也是 `"sha256:078be7…"`
 * · ⭐ `contentSha256` 是 **exact ref 的比對鍵** —— 那是**字串相等**比對
 *   ⇒ ⛔ 收兩種拼法等於同一份內容有兩個 id（第〇·四守則的第二個住處）
 * · ⚠️ 而帶前綴自我描述：⭐ 哪天換演算法（`blake3:`）時**舊值仍然讀得懂**
 *
 * ⚠️ ⭐ 而 `zDigest`（activation／authoring）**刻意仍然兩種都收** ——
 * 它的檔頭寫著「規格對它們的字面格式**沒有規定**」⇒ ⛔ 收緊它會擋掉合法的既有資料。
 */
export const zSha256Hex = z
  .string()
  .regex(
    /^sha256:[0-9a-f]{64}$/,
    "contentSha256 必須是 `sha256:` ＋ 64 位小寫十六進位（⭐ 與 `jcs.ts` 的 `contentSha256()` 產出的同一種）",
  );

/**
 * activation／authoring／migration 這一類 digest。
 * ⚠️ 規格對它們的**字面格式沒有規定**，而 PLAN §2.1.1.1 的範例又用了
 * `sha256:<hex>` 前綴。所以這裡兩種都收（裸 hex 或 `sha256:` 前綴），
 * 但不接受任意字串 —— 收任意字串等於沒有驗。
 */
export const zDigest = z
  .string()
  .regex(/^(sha256:)?[0-9a-f]{64}$/, "digest 必須是 SHA-256 十六進位，可選 `sha256:` 前綴");

/**
 * package 內的相對 POSIX path。
 * 擋掉絕對路徑、`..`、反斜線、重複分隔與結尾斜線（zip-slip 的第一道，PLAN §4.3）。
 * ⚠️ duplicate／大小寫碰撞是**跨 entry** 的性質，schema 看不到，留給 transport 層。
 */
export const zPackagePath = z
  .string()
  .min(1)
  .max(IMPORT_LIMITS.maxPathLength)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._\-]*(\/[A-Za-z0-9][A-Za-z0-9._\-@]*)*$/, "path 必須是安全的相對 POSIX 路徑")
  .refine((p) => !p.split("/").includes(".."), "path 不得包含 `..`");

/** 三種 mode（規格 §7／§10）。 */
export const PACKAGE_MODES = ["bootstrap", "full", "delta"] as const;
export const zPackageMode = z.enum(PACKAGE_MODES);
export type PackageMode = (typeof PACKAGE_MODES)[number];

/**
 * authoring 文件的種類，對應 ZIP 的 `authoring/<這些>/`（規格 §8）。
 * `vfx` 只有雙方都宣告 `vfx-document-authoring@1` 才可能出現，capability 檢查
 * 在 G1 的下一層做；schema 只負責認得這個字。
 */
export const zAuthoringKind = z.enum([
  "effect-template",
  "effect-product",
  "ability",
  "item",
  "vfx",
]);

/** ⛔ V1 只有 upsert（規格 §8「V1 禁止 delete」、§14）。 */
export const zChangeOp = z.literal("upsert");

/** exact ref：id +（可選）revision + contentSha256（規格 §1「exact refs 一律使用 contentSha256」）。 */
export const zExactRef = z
  .object({
    kind: zAuthoringKind,
    id: zShort,
    revision: z.number().int().min(1).max(1_000_000).optional(),
    contentSha256: zSha256Hex,
  })
  .passthrough();

// ──────────────────────────────────────────────────────────────────────────
// manifest（規格 §10）
// ──────────────────────────────────────────────────────────────────────────

/**
 * `base` —— ⚠️ **這裡是整份規格最容易寫錯的一格。**
 * `activationDigest` / `authoringDigest` 用 `.nullable()` 而**不是** `.optional()`：
 * bootstrap 要求「必須明示 null」，省略就是不合規。zod 的 `.nullable()` 正好表達
 * 「key 必須在，值可以是 null」—— 少了 key 會直接 Required 錯誤。
 */
export const zPackageBase = z
  .object({
    gameRevision: zShort,
    contentVersion: zShort,
    activationDigest: zDigest.nullable(),
    authoringDigest: zDigest.nullable(),
  })
  .passthrough();

/** `changes[]` 的 before/after（新增時 before 為 null，規格 §10）。 */
const zChangeSide = z
  .object({
    revision: z.number().int().min(1).max(1_000_000).optional(),
    contentSha256: zSha256Hex,
  })
  .passthrough();

export const zManifestChange = z
  .object({
    kind: zAuthoringKind,
    id: zShort,
    path: zPackagePath,
    op: zChangeOp,
    before: zChangeSide.nullable(),
    after: zChangeSide,
    reason: z.enum(["selected", "required-dependency", "explicit-ref-adoption"]),
  })
  .passthrough();

export const zManifestEntry = z
  .object({
    path: zPackagePath,
    role: z.enum(["authoring", "compiled", "validation", "report"]),
    contentSha256: zSha256Hex,
    contentSize: z.number().int().min(0).max(IMPORT_LIMITS.maxContentSize),
    // content entries 才有的欄位（規格 §10）。
    collection: zShort.optional(),
    id: zShort.optional(),
    schema: zShort.optional(),
    op: zChangeOp.optional(),
    revision: z.number().int().min(1).max(1_000_000).optional(),
  })
  .passthrough();

export const zManifestRequire = z
  .object({
    kind: zShort,
    id: zShort,
    revision: z.number().int().min(1).max(1_000_000).optional(),
    contentSha256: zSha256Hex,
  })
  .passthrough();

/** 每份 ability 另帶 compiled authority（規格 §10／§11-8）。 */
export const zExpectedCompiled = z
  .object({
    path: zPackagePath,
    collection: zShort,
    id: zShort,
    contentSha256: zSha256Hex,
    authority: z.enum(["legacy-template-binding", "native-effects"]).optional(),
  })
  .passthrough();

/**
 * ⚠️ 規格 §10 只用一句話列出 `expectedDerived[]` 的**內容物**
 * （champion mirror／distribution-index／reachability／indexes／bundle／contentVersion），
 * 沒有給 shape。這裡只釘 `kind` 這一格，其餘 passthrough，避免用猜的 shape 擋掉對面。
 */
export const zExpectedDerived = z
  .object({
    kind: zShort,
    id: zShort.optional(),
    contentSha256: zSha256Hex.optional(),
    contentVersion: zShort.optional(),
    contentReachable: z.boolean().optional(),
    effectiveReachableUnderCuration: z.boolean().optional(),
  })
  .passthrough();

export const zRequiredScenario = z
  .object({
    id: zShort,
    schema: zShort,
    contentSha256: zSha256Hex,
    subjectContentSha256: zSha256Hex.optional(),
    requiredCapabilities: z.array(zShort).max(IMPORT_LIMITS.maxReviewRows).optional(),
  })
  .passthrough();

export const zFidelityDecisionRef = z
  .object({
    id: zShort,
    contentSha256: zSha256Hex,
    decision: zShort.optional(),
    subject: zShort.optional(),
    evidenceFingerprint: zShort.optional(),
    requiredScenarioIds: z.array(zShort).max(IMPORT_LIMITS.maxReviewRows).optional(),
  })
  .passthrough();

/**
 * ⛔ 唯一使用 `.strict()` 的地方。規格 §10：「只允許逐 code + reviewer + note，
 * 不得 `ignoreAll`」。passthrough 會讓 `ignoreAll: true` 靜靜通過，
 * 而那正是規格要擋的東西 —— 所以這一格多一個 key 就算違規。
 */
export const zAcceptedWarning = z
  .object({
    code: zShort,
    reviewer: zShort,
    note: z.string().min(1).max(IMPORT_LIMITS.maxNoteLength),
  })
  .strict();

/**
 * PLAN §2.1.1.1 建議的 authoring 政策欄位。規格 §10 沒列，所以全部 optional；
 * 但只要帶了，`AUTHORING_POLICY_MISMATCH` / `DESCRIPTION_SOURCE_DIGEST_MISMATCH`
 * 就要在 compiled 比對**之前**檢查（那一層不在 G1）。
 */
const zAuthoringPolicyFields = {
  descriptionPolicy: zShort.optional(),
  descriptionSourceSet: zShort.optional(),
  descriptionSourceDigest: zDigest.optional(),
  mechanicsRegressionAbilityCount: z.number().int().min(0).max(100000).optional(),
  numericResolution: zShort.optional(),
  rankPolicy: z.record(z.number().int().min(1).max(99)).optional(),
  tagRulesVersion: zShort.optional(),
  ownerIssuePolicy: zShort.optional(),
  missingSource: z.array(zShort).max(IMPORT_LIMITS.maxChangeRows).optional(),
};

const zManifestShape = z
  .object({
    schema: z.literal("ggd-editor-package@1"),
    mode: zPackageMode,
    gameId: zShort,
    packageDigest: zDigest,
    base: zPackageBase,
    /** bootstrap 必填（下面 superRefine 在守）；其餘允許省略或明示 null。 */
    migrationFingerprint: zShort.nullable().optional(),
    selectionRoots: z.array(zExactRef).max(IMPORT_LIMITS.maxChangeRows),
    changes: z.array(zManifestChange).max(IMPORT_LIMITS.maxChangeRows),
    compiler: z
      .object({ contractVersion: zShort, fingerprint: zShort })
      .passthrough(),
    requiredCapabilities: z.array(zShort).max(IMPORT_LIMITS.maxReviewRows),
    entries: z.array(zManifestEntry).max(IMPORT_LIMITS.maxManifestRows),
    /** ZIP only；不參與 packageDigest（規格 §10）。 */
    transport: z
      .object({
        format: zShort.optional(),
        policy: zShort.optional(),
        entries: z
          .array(
            z
              .object({
                path: zPackagePath,
                rawSha256: zSha256Hex,
                rawSize: z.number().int().min(0).max(IMPORT_LIMITS.maxContentSize),
              })
              .passthrough(),
          )
          .max(IMPORT_LIMITS.maxManifestRows)
          .optional(),
      })
      .passthrough()
      .optional(),
    requires: z.array(zManifestRequire).max(IMPORT_LIMITS.maxManifestRows),
    expectedCompiled: z.array(zExpectedCompiled).max(IMPORT_LIMITS.maxManifestRows),
    expectedDerived: z.array(zExpectedDerived).max(IMPORT_LIMITS.maxManifestRows),
    /** ⚠️ 規格沒有給 shape，見回報的歧義清單。 */
    validationPolicy: z.record(z.unknown()),
    requiredScenarios: z.array(zRequiredScenario).max(IMPORT_LIMITS.maxReviewRows),
    fidelityDecisions: z.array(zFidelityDecisionRef).max(IMPORT_LIMITS.maxReviewRows),
    acceptedWarnings: z.array(zAcceptedWarning).max(IMPORT_LIMITS.maxReviewRows),
    ...zAuthoringPolicyFields,
  })
  .passthrough();

/**
 * mode ↔ base pin 的交叉規則（規格 §10）。分開寫成函式，是因為 manifest 與
 * 整份 Package JSON 都要套同一組，不想抄第二份。
 */
function refineModeInvariants(m: z.infer<typeof zManifestShape>, ctx: z.RefinementCtx): void {
  const bootstrap = m.mode === "bootstrap";
  for (const field of ["activationDigest", "authoringDigest"] as const) {
    const v = m.base[field];
    if (bootstrap && v !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["base", field],
        message: `bootstrap 的 base.${field} 必須明示 null（不是省略、也不是值）`,
      });
    }
    if (!bootstrap && v === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["base", field],
        message: `mode=${m.mode} 必須 pin base.${field}`,
      });
    }
  }
  if (bootstrap && (m.migrationFingerprint === undefined || m.migrationFingerprint === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["migrationFingerprint"],
      message: "bootstrap 必須帶 migrationFingerprint",
    });
  }
  if (m.mode === "delta" && m.selectionRoots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["selectionRoots"],
      message: "delta 的 selectionRoots[] 不得為空",
    });
  }
}

export const zPackageManifest = zManifestShape.superRefine(refineModeInvariants);
export type PackageManifest = z.infer<typeof zPackageManifest>;

// ──────────────────────────────────────────────────────────────────────────
// Package JSON（規格 §9.1）
// ──────────────────────────────────────────────────────────────────────────

/** `{ path, document }`；`prefix` 綁住它只能落在對應的 ZIP 目錄（規格 §8／§9.1）。 */
const zPathedDocument = (prefix: string) =>
  z
    .object({
      path: zPackagePath.refine(
        (p) => p.startsWith(`${prefix}/`),
        `path 必須位於 ${prefix}/ 之下`,
      ),
      document: z.unknown(),
    })
    .passthrough();

export const zEditorImportPackage = z
  .object({
    schema: z.literal("ggd-editor-import@1"),
    // ⚠️ 用**已 refine** 的 `zPackageManifest`，不是裸的 shape —— 不然 mode↔base
    // 的交叉規則只在單獨驗 manifest 時生效，整包送進來反而漏掉（失敗形態⑤）。
    manifest: zPackageManifest,
    /** 對應 ZIP `authoring/` —— package 的 canonical truth。 */
    documents: z.array(zPathedDocument("authoring")).max(IMPORT_LIMITS.maxDocuments),
    /** 對應 `compiled/` —— editor 的**預期**結果，importer 必須自己重編再比對。 */
    compiled: z.array(zPathedDocument("compiled")).max(IMPORT_LIMITS.maxDocuments).default([]),
    /** 對應 `validation/`。 */
    validation: z.array(zPathedDocument("validation")).max(IMPORT_LIMITS.maxDocuments).default([]),
    reports: z.record(z.unknown()).default({}),
  })
  .passthrough();
export type EditorImportPackage = z.infer<typeof zEditorImportPackage>;

/**
 * ⭐⭐ GH#327 —— 整包解析的**唯一入口**，而且它會回報**未知欄位**。
 *
 * ── ⛔ 為什麼要有這一支 ────────────────────────────────────────────────────
 * `unknownFields()` / `parseWithUnknownFieldReport()` 上一輪落地了，
 * ⛔ **而它們一個非測試呼叫端都沒有** —— ⭐ 那正是失敗形態⑧的形狀：
 * 函式在、測試綠、⛔ 而真的匯入流程從來不會走到它。
 * （票文的進度標記逐字寫著「⛔ 不要讓它爛在那裡」。）
 *
 * ── ⭐ 為什麼未知欄位是**診斷**而不是**錯誤** ──────────────────────────────
 * 整包 schema 是 `.passthrough()` 的（外部編輯器會帶自己的欄位，⭐ 那是刻意的）
 * ⇒ ⛔ 未知欄位**不該擋下匯入**。
 * ⭐ 但它必須**說出來** —— 一個「我以為我設定了而它被忽略」的欄位，
 * 是玩家投稿最常見的困惑來源，⛔ 而靜默忽略答不出「為什麼沒生效」。
 *
 * ⚠️ ⭐ 掃的是**原始輸入**，⛔ 不是 parse 的產物：一個 `.strict()` 的子節點
 * 會在 parse 時就把未知 key 丟掉 ⇒ 掃產物會**漏報**那一種。
 */
export function parseImportPackage(raw: unknown): {
  readonly ok: boolean;
  readonly value: EditorImportPackage | null;
  readonly diagnostics: readonly ImportDiagnostic[];
} {
  const r = parseWithUnknownFieldReport(zEditorImportPackage, raw);
  return { ok: r.ok, value: (r.value as EditorImportPackage | null) ?? null, diagnostics: r.diagnostics };
}

// ──────────────────────────────────────────────────────────────────────────
// 結果格式 `ggd-content-import-result@1`（規格 §12）
// ──────────────────────────────────────────────────────────────────────────

/** PLAN §4.1。 */
export const zReloadMode = z.enum(["process-reload", "new-match-snapshot", "hot-reload"]);

/**
 * ⚠️ 規格只點名欄位 `authoringStoreState`，**沒有列舉它的值**。這裡收一個有界
 * 字串而不是猜一組 enum —— 猜錯會在握手層擋掉合法回應。見回報的歧義清單。
 */
export const zAuthoringStoreState = zShort;

export const zImportResult = z
  .object({
    schema: z.literal("ggd-content-import-result@1"),
    operationId: zShort,
    status: z.enum(["validated", "activated", "activated-awaiting-reload", "rejected", "rolled-back"]),
    packageDigest: zDigest.nullable(),
    previousContentVersion: zShort.nullable(),
    newContentVersion: zShort.nullable(),
    previousAuthoringDigest: zDigest.nullable(),
    newAuthoringDigest: zDigest.nullable(),
    planDigest: zDigest.nullable(),
    diagnostics: z.array(zImportDiagnostic).max(IMPORT_LIMITS.maxManifestRows),
    changedDocuments: z
      .array(
        z
          .object({
            kind: zAuthoringKind,
            id: zShort,
            path: zPackagePath,
            op: zChangeOp,
            contentSha256: zSha256Hex,
          })
          .passthrough(),
      )
      .max(IMPORT_LIMITS.maxChangeRows),
    selectionRoots: z.array(zExactRef).max(IMPORT_LIMITS.maxChangeRows),
    fidelityDecisions: z.array(zFidelityDecisionRef).max(IMPORT_LIMITS.maxReviewRows),
    derivedDocuments: z.array(zExpectedDerived).max(IMPORT_LIMITS.maxManifestRows),
    activationDigest: zDigest.nullable(),
    reloadMode: zReloadMode,
    authoringStoreState: zAuthoringStoreState,
    distributionReachability: z
      .array(
        z
          .object({
            channel: zShort,
            contentReachable: z.boolean(),
            effectiveReachableUnderCuration: z.boolean(),
          })
          .passthrough(),
      )
      .max(IMPORT_LIMITS.maxManifestRows),
  })
  .passthrough();
export type ImportResult = z.infer<typeof zImportResult>;

// ──────────────────────────────────────────────────────────────────────────
// raw runtime 文件偵測（規格 §9.2／§11 第 1 步）
// ──────────────────────────────────────────────────────────────────────────

/** package 端點認得的兩個外層 schema tag。 */
export const PACKAGE_SCHEMA_TAGS: readonly string[] = Object.freeze([
  "ggd-editor-import@1",
  "ggd-editor-package@1",
]);

/**
 * 規格 §9.2 點名的兩種 raw runtime 文件。
 * ⛔ 這是白名單，不是啟發式 —— 規格 §11-1 要求「不得猜測或降級 apply」，
 * 所以任何靠形狀去猜的做法都是違規的。
 */
export const RAW_RUNTIME_SCHEMA_TAGS: readonly string[] = Object.freeze(["ability@1", "item@1"]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 「這是一份 raw `ability@1`／`item@1`，不是 package」。
 * 命中時 importer MUST 回 `RAW_RUNTIME_DOCUMENT_NOT_A_PACKAGE`（規格 §11-1）。
 */
export function isRawRuntimeDocument(json: unknown): boolean {
  if (!isRecord(json)) return false;
  const tag = json["schema"];
  if (typeof tag !== "string") return false;
  if (PACKAGE_SCHEMA_TAGS.includes(tag)) return false;
  return RAW_RUNTIME_SCHEMA_TAGS.includes(tag);
}

export type ImportPayloadKind = "package" | "raw-runtime-document" | "unknown";

/**
 * 端點收到 JSON 的第一個分類動作。回 `"unknown"` 時**不要**再猜 ——
 * 交給 `zEditorImportPackage` 產生逐欄位錯誤，或直接拒絕。
 */
export function classifyImportPayload(json: unknown): ImportPayloadKind {
  if (isRawRuntimeDocument(json)) return "raw-runtime-document";
  if (isRecord(json) && typeof json["schema"] === "string" && PACKAGE_SCHEMA_TAGS.includes(json["schema"])) {
    return "package";
  }
  return "unknown";
}
