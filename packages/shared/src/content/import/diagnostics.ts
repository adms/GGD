/**
 * Editor package 匯入的**穩定診斷碼登錄表**（G1 握手層）。
 *
 * ⛔ 這一份是**對外契約的一部分**。另一個專案（Editor）會用字串比對這些 `code`
 *    來決定 UI 要顯示什麼、要不要擋住匯出。所以：
 *    - `code` 字串一旦出貨就**不能改字、不能改大小寫、不能刪除**；
 *      語意變了要**新增一個碼**，舊碼留著標 deprecated。
 *    - 訊息文案（`message`）可以改，那不是契約；`code` 才是。
 *    - `origin: "contract"` 的碼是規格／計畫書**點名**的，兩邊必須都有。
 *      `origin: "ggd-extension"` 是 GGD 端為了把規格的 MUST 落地而補的碼，
 *      Editor 可以不認得它們，但不可以把它們當成成功。
 *
 * ⚠️ 大小寫不一致是**規格自己**的：五個碼是 SCREAMING_SNAKE，只有
 *    `unsupported-runtime` 是 kebab-case（`main_load_editor_plan.md` §2.1.1／§6.3／§12）。
 *    這裡**照抄**，不統一 —— 統一等於片面改契約。
 *
 * 出處：`GGD_EDITOR_PACKAGE_SPEC.md` §7.4／§8／§9.2／§10／§11／§14、
 *      `main_load_editor_plan.md` §2.1.1.1／§4.1～4.3。
 */
import { z } from "zod";

/** 這個碼是規格點名的（兩邊都要有），還是 GGD 端的落地擴充。 */
export type DiagnosticOrigin = "contract" | "ggd-extension";

export type DiagnosticSeverity = "error" | "warning";

export interface ImportDiagnosticDef {
  /** ⛔ 契約字串，不可變。 */
  readonly code: string;
  /** 繁中訊息模板；`{name}` 會被 `formatDiagnostic` 的參數取代。 */
  readonly message: string;
  /** 規格章節，方便對面專案回查。 */
  readonly spec: string;
  /**
   * `true` = **不可豁免的 blocker**：即使出現在 manifest 的 `acceptedWarnings[]`
   * 也必須照樣拒絕（規格 §10 明列的那一串）。fail-closed。
   */
  readonly failClosed: boolean;
  readonly severity: DiagnosticSeverity;
  readonly origin: DiagnosticOrigin;
}

const def = (d: ImportDiagnosticDef): ImportDiagnosticDef => Object.freeze(d);

/**
 * 登錄表。key 與 `code` 必須相同 —— 守衛在 `packageSchema.test.ts`
 * 最後一條（「診斷碼登錄表的 key 與 code 必須一致」）。
 */
export const IMPORT_DIAGNOSTICS = {
  /**
   * ⭐ 這條 route 還沒實作（計畫 §4.1）。
   *
   * ⚠️ 它取代了原本硬寫在 `importRoutes.ts` 裡的 `"unsupported-operation"` ——
   * 那個字串**不在這張登錄表裡**，所以對面的 importer 查不到它、也沒辦法把它
   * 對應到任何處置。⛔ 一個沒有登錄的碼等於沒有碼。
   *
   * `failClosed: true` 是刻意的：「還沒做」不可以被 `acceptedWarnings[]` 豁免。
   */
  OPERATION_NOT_IMPLEMENTED: def({
    code: "OPERATION_NOT_IMPLEMENTED",
    message:
      "{path} 尚未實作（預計 {stage}）。{why} " +
      "⛔ 這不是暫時性失敗，重試不會成功；請讀 target profile 的 supported 狀態，" +
      "不要從 implementedStage 字串推算別條 route 能不能用。",
    spec: "計畫 §1.2 / §4.1",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),

  /**
   * ⭐⭐ GH#327 ① —— **importer 沒看懂的欄位**（計畫 §3.3）。
   *
   * ── 票文說「schema 預設方向反了」，⭐ 而它漏了一個真理由 ───────────────
   * `packageSchema.ts` 的檔頭逐字寫著為什麼是 passthrough：
   * 「`packageDigest` 是對**原始 JSON** 的 projection 取 hash，
   *   parse 後把未知欄位吃掉會讓下游重算 digest 時對不上」。
   * ⇒ ⛔ 把那 19 個 `.passthrough()` 翻成 `.strict()` 會**弄壞 digest**。
   *
   * ⭐ 而計畫 §3.3 自己就調和了這兩件事：
   * 「`.passthrough()` 可用於**保留未知 bytes 供重新輸出**，
   *   ⛔ 但**絕不代表 importer 已理解或接受其語意**」。
   *
   * ⇒ ⭐ 缺的**不是** strict，是**「我沒看懂這幾格」這條訊號**。
   * 在這個碼出現以前，未知欄位是**靜默通過**的 ——
   * ⚠️ 而「靜默通過」與「看懂了並接受」在對面的作者眼裡長得一模一樣
   * （CLAUDE.md：「fail-open 沒錯，**靜默**才是缺陷」）。
   *
   * ── ⭐ 為什麼是 warning 而不是 error ──────────────────────────────────
   * 規格 §10 的用語是「至少包含」⇒ 未來版本的 Editor 多帶欄位是**合法**的。
   * ⭐ 而 `failClosed: false` 讓操作者可以用 `acceptedWarnings[]` 明示接受 ——
   * ⛔ 那正是「明示的 extensions 通道」該有的樣子：**一個要簽名的動作**，
   * ⛔ 不是一個沒有人看到的沉默。
   */
  UNKNOWN_FIELDS_NOT_UNDERSTOOD: def({
    code: "UNKNOWN_FIELDS_NOT_UNDERSTOOD",
    message:
      "{path} 帶了 importer 沒有宣告的欄位：{fields}。⭐ 它們的**位元組被保留**" +
      "（digest 因此仍然對得上），⛔ 但 importer **沒有理解也沒有接受它們的語意**。" +
      "⇒ 若這是刻意的擴充，請放進版本化的 `extensions` 命名空間並宣告 capability；" +
      "否則請移除，或用 `acceptedWarnings[]` 明示接受這一次。",
    spec: "計畫 §3.3",
    failClosed: false,
    severity: "warning",
    origin: "contract",
  }),

  // ── 規格／計畫書點名的六個碼 ──────────────────────────────────────────
  RAW_RUNTIME_DOCUMENT_NOT_A_PACKAGE: def({
    code: "RAW_RUNTIME_DOCUMENT_NOT_A_PACKAGE",
    message:
      "收到的是 raw runtime 文件（schema={schema}），不是 ggd-editor-import@1／ggd-editor-package@1。" +
      "package 端點不得猜測或降級套用；請改用 package 匯出，或走另行命名的單文件轉接器。",
    spec: "SPEC §9.2 / §11-1 / §14",
    failClosed: true,
    severity: "error",
    origin: "contract",
  }),
  IMPLICIT_DELETE_FORBIDDEN: def({
    code: "IMPLICIT_DELETE_FORBIDDEN",
    message:
      "full package 的文件成員少於 base（缺 {count} 份，例如 {sample}）。V1 只允許 upsert，" +
      "遺漏不得當成隱式刪除；請把 base 的每一份 exact revision 一起帶進 snapshot。",
    spec: "SPEC §8 / §11-4 / §14",
    failClosed: true,
    severity: "error",
    origin: "contract",
  }),
  COMPILED_AUTHORITY_CONFLICT: def({
    code: "COMPILED_AUTHORITY_CONFLICT",
    message:
      "技能 {id} 同時宣稱 legacy-template-binding 與 native-effects 兩種 compiled authority" +
      "（或 native-effects 仍保留 ability.template）。不得自動採優先順序，請在來源明示唯一 authority。",
    spec: "SPEC §7.4 / §11-8",
    failClosed: true,
    severity: "error",
    origin: "contract",
  }),
  AUTHORING_POLICY_MISMATCH: def({
    code: "AUTHORING_POLICY_MISMATCH",
    message:
      "authoring 政策不相容：{field} 期望 {expected}，package 帶的是 {actual}。" +
      "descriptionPolicy／rankPolicy／tagRulesVersion 必須在 compiled 比對之前先過。",
    spec: "PLAN §2.1.1.1",
    failClosed: true,
    severity: "error",
    origin: "contract",
  }),
  DESCRIPTION_SOURCE_DIGEST_MISMATCH: def({
    code: "DESCRIPTION_SOURCE_DIGEST_MISMATCH",
    message:
      "技能文案來源 digest 不符：manifest 宣稱 {expected}，實際算出 {actual}。" +
      "文案是內容規格，不得由 importer 重寫、縮短或以 runtime tooltip 反向覆蓋。",
    spec: "PLAN §2.1.1.1",
    failClosed: true,
    severity: "error",
    origin: "contract",
  }),
  "unsupported-runtime": def({
    // ⚠️ kebab-case 是規格原文，照抄。
    code: "unsupported-runtime",
    message:
      "遊戲端沒有這個 capability：{capability}。不得降級成「看起來差不多」的舊 template，" +
      "也不得把 typed 子鏈攤平成平面 effects 後宣稱成功。",
    spec: "PLAN §2.1.1 / §6.3 / §12(G4)",
    failClosed: true,
    severity: "error",
    origin: "contract",
  }),

  // ── GGD 端落地擴充（規格未點名字串，但規格的 MUST 需要一個碼）─────────
  PACKAGE_SCHEMA_INVALID: def({
    code: "PACKAGE_SCHEMA_INVALID",
    message: "package 結構不合 schema：{path} —— {detail}",
    spec: "SPEC §9.1 / §10 / §11-1",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
  PACKAGE_BASE_DIGEST_INVALID: def({
    code: "PACKAGE_BASE_DIGEST_INVALID",
    message:
      "mode={mode} 的 base.{field} 不合規：bootstrap 必須明示 null（不是省略），" +
      "full／delta 必須填入 exact digest。",
    spec: "SPEC §10",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
  MIGRATION_FINGERPRINT_REQUIRED: def({
    code: "MIGRATION_FINGERPRINT_REQUIRED",
    message: "bootstrap package 必須帶 migrationFingerprint（pinned legacy migration 的指紋）。",
    spec: "SPEC §10 / PLAN §4.2",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
  SELECTION_ROOTS_REQUIRED: def({
    code: "SELECTION_ROOTS_REQUIRED",
    message: "delta package 的 selectionRoots[] 不得為空；那是使用者在匯出中心明示選取的 root。",
    spec: "SPEC §10",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
  EXPLICIT_DELETE_UNSUPPORTED: def({
    code: "EXPLICIT_DELETE_UNSUPPORTED",
    message: "changes[{index}] 的 op={op} 不受支援；V1 只允許 upsert，刪除要等 package schema 升版。",
    spec: "SPEC §8 / §14",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
  ACCEPTED_WARNING_IGNORE_ALL_FORBIDDEN: def({
    code: "ACCEPTED_WARNING_IGNORE_ALL_FORBIDDEN",
    message: "acceptedWarnings[] 只允許逐 code + reviewer + note，不得出現 ignoreAll 之類的整批豁免。",
    spec: "SPEC §10",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
  NON_EXEMPTIBLE_WARNING_ACCEPTED: def({
    code: "NON_EXEMPTIBLE_WARNING_ACCEPTED",
    message: "acceptedWarnings[] 想豁免不可豁免的診斷碼 {code}；這一類是 blocker，豁免無效。",
    spec: "SPEC §10",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
  AUTHORING_STORE_REQUIRED_FOR_DELTA: def({
    code: "AUTHORING_STORE_REQUIRED_FOR_DELTA",
    message: "active version 沒有 authoringDigest／authoring store，只能接受 bootstrap，不能接受 {mode}。",
    spec: "SPEC §7 / §11-2",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
  PACKAGE_PATH_UNSAFE: def({
    code: "PACKAGE_PATH_UNSAFE",
    message: "path 不安全或不在允許的前綴內：{path}（不得有絕對路徑、`..`、反斜線或重複分隔）。",
    spec: "SPEC §8 / PLAN §4.3",
    failClosed: true,
    severity: "error",
    origin: "ggd-extension",
  }),
} as const satisfies Record<string, ImportDiagnosticDef>;

export type ImportDiagnosticCode = keyof typeof IMPORT_DIAGNOSTICS;

/** 全部碼，排序固定（對面專案可以直接拿去做對照表）。 */
export const IMPORT_DIAGNOSTIC_CODES: readonly string[] = Object.freeze(
  Object.keys(IMPORT_DIAGNOSTICS).sort(),
);

export const isKnownDiagnosticCode = (code: string): code is ImportDiagnosticCode =>
  Object.prototype.hasOwnProperty.call(IMPORT_DIAGNOSTICS, code);

/**
 * 不可豁免 = fail-closed。**未知的碼一律當成不可豁免** —— 不認得的東西不可以
 * 因為「manifest 說可以忽略」就放行（CLAUDE.md：fail-open 沒錯，靜默才是缺陷）。
 */
export const isFailClosed = (code: string): boolean =>
  isKnownDiagnosticCode(code) ? IMPORT_DIAGNOSTICS[code].failClosed : true;

/** 把模板裡的 `{key}` 換成參數；沒給的 key 原樣留著，方便看出漏傳什麼。 */
export function formatDiagnostic(
  code: ImportDiagnosticCode,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return IMPORT_DIAGNOSTICS[code].message.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole,
  );
}

/** 結果文件 `ggd-content-import-result@1` 的 `diagnostics[]` 元素。 */
export const zImportDiagnostic = z.object({
  // 不鎖 enum：對面可能比我們新，未知碼由 `isFailClosed` 當成 blocker 處理。
  code: z.string().min(1).max(128),
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1).max(4000),
  /** 出問題的 package path 或 JSON pointer。 */
  path: z.string().max(400).optional(),
  spec: z.string().max(200).optional(),
  details: z.record(z.unknown()).optional(),
});
export type ImportDiagnostic = z.infer<typeof zImportDiagnostic>;

/** 由登錄表生一則診斷，訊息與 spec 章節不用手抄。 */
export function diagnostic(
  code: ImportDiagnosticCode,
  params: Readonly<Record<string, string | number>> = {},
  extra: { path?: string; details?: Record<string, unknown> } = {},
): ImportDiagnostic {
  const d = IMPORT_DIAGNOSTICS[code];
  return {
    code: d.code,
    severity: d.severity,
    message: formatDiagnostic(code, params),
    spec: d.spec,
    ...(extra.path !== undefined ? { path: extra.path } : {}),
    ...(extra.details !== undefined ? { details: extra.details } : {}),
  };
}
