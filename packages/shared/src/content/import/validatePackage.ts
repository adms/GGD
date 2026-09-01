/**
 * ⭐⭐ **`POST /content-import/validate` 的本體**（規格 §3）—— 一支**純函式**。
 *
 * ── ⭐ 為什麼是純函式 ────────────────────────────────────────────────────────
 * 規格逐字：「`validate` MUST **無狀態變更**」。
 * ⇒ 把它寫成「輸入 → 診斷清單」的純函式，⭐ 那條規則就**結構上**成立，
 * ⛔ 不是靠「記得不要寫檔」（本 repo 記過 N 次判準失效）。
 *
 * ── ⛔ 八道檢查，每一道都答一個**不同**的問題 ──────────────────────────────
 *
 * | # | 問什麼 | ⛔ 漏掉的下場 |
 * |---:|---|---|
 * | ① schema | 這是不是一個合法的 `ggd-editor-import@1` | 後面每一步都在猜 |
 * | ② 處理器指紋 | 你驗過的規則還是不是我現在跑的 | 用**過期的理解**產的內容被收下 |
 * | ③ packageDigest | 這一包是不是我審的那一包 | 「審過的」變成無法回答 |
 * | ④ 逐份內容雜湊 | 每一份文件的位元組對不對 | 傳輸損毀／被改過而看不出來 |
 * | ⑤ base pin | 你以為的 base 是不是**現在**的 base | 覆蓋掉你沒看過的改動 |
 * | ⑥ 隱式刪除 | full 包有沒有「少帶」文件 | ⭐ 少帶＝**刪除**，而它看起來像沒事 |
 * | ⑦ 相依封閉 | 指到的東西在不在（包 ∪ base） | 套下去載入即失敗 |
 * | ⑧ capability | 這台認不認得它要的標籤 | ⭐ schema 過、遊戲裡**什麼都不發生**（第一·五守則） |
 *
 * ⚠️ ⭐ ⑦ 只擋**硬**參照。軟參照（`ref?:`）懸空只警告 ——
 * ⛔ 與出貨 loader **同一條規則**（`refs.ts`），⛔ 不是這裡另立一套。
 */
import { extractRefs } from "../refs";
import type { CollectionName } from "../schema";
import { IMPORT_DIAGNOSTICS, formatDiagnostic } from "./diagnostics";
import type { ImportDiagnostic } from "./diagnostics";
import { contentSha256 } from "./jcs";
import { packageDigest } from "./digest";
import { parseImportPackage } from "./packageSchema";
import type { EditorImportPackage } from "./packageSchema";

/** 這一台**現在**的狀態。⭐ 由呼叫端從出貨樹讀，⛔ 這一支不碰檔案系統。 */
export interface BaseFacts {
  readonly gameRevision: string | null;
  readonly contentVersion: string | null;
  readonly activationDigest: string | null;
  readonly authoringDigest: string | null;
  /** base 裡**現在有哪些文件**：collection → id 集合。⑥⑦ 都要它。 */
  readonly present: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface ValidateInput {
  readonly raw: unknown;
  readonly base: BaseFacts;
  /** 這一台**支援**的 capability id。⑧ 用它。 */
  readonly capabilities: ReadonlySet<string>;
  /** 這一台算出來的 `authoringProcessor.fingerprint`。②用它。 */
  readonly processorFingerprint: string;
}

export interface ValidateOutput {
  readonly ok: boolean;
  readonly value: EditorImportPackage | null;
  readonly diagnostics: readonly ImportDiagnostic[];
  /** ⭐ 通過時的變更計畫（apply 會用同一份）。 */
  readonly changed: readonly {
    readonly collection: string;
    readonly id: string;
    readonly path: string;
    readonly contentSha256: string;
  }[];
}

function diag(
  code: keyof typeof IMPORT_DIAGNOSTICS,
  params: Record<string, string | number>,
  path?: string,
): ImportDiagnostic {
  const d = IMPORT_DIAGNOSTICS[code];
  return {
    code: d.code,
    severity: d.severity,
    message: formatDiagnostic(code, params),
    spec: d.spec,
    ...(path === undefined ? {} : { path }),
  } as ImportDiagnostic;
}

/** ⭐ 包裡每一份 authoring 文件（path → doc），path 已剝掉 `authoring/` 前綴。 */
function documentsOf(pkg: EditorImportPackage): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const d of pkg.documents) out.set(d.path, d.document);
  return out;
}

/**
 * ⭐ `authoring/<collection>/<id>.json` → `{collection, id}`。
 * ⛔ 認不出來回 null（呼叫端會把它當成「不是 content entry」跳過）。
 */
export function pathParts(
  path: string,
): { collection: string; id: string } | null {
  const m = /^authoring\/([a-z0-9-]+)\/(.+)\.json$/.exec(path);
  return m === null ? null : { collection: m[1]!, id: m[2]! };
}

export function validatePackage(input: ValidateInput): ValidateOutput {
  const out: ImportDiagnostic[] = [];
  // ── ① schema ────────────────────────────────────────────────────────────
  const parsed = parseImportPackage(input.raw);
  out.push(...parsed.diagnostics);
  if (!parsed.ok || parsed.value === null) {
    return { ok: false, value: null, diagnostics: out, changed: [] };
  }
  const pkg = parsed.value;
  const m = pkg.manifest;

  // ── ② 處理器指紋 ────────────────────────────────────────────────────────
  const theirs = m.authoringProcessor?.fingerprint ?? "";
  if (theirs !== input.processorFingerprint) {
    out.push(
      diag("PROCESSOR_FINGERPRINT_MISMATCH", {
        theirs: theirs === "" ? "(缺)" : theirs,
        ours: input.processorFingerprint,
      }),
    );
  }

  // ── ③ packageDigest ─────────────────────────────────────────────────────
  // ⛔⛔ ⭐ 要算在**原始輸入**的 manifest 上，⛔ 不是 parse 的產物 ——
  //   Zod 的 `.default([])`（`expectedCompiled`）會在 parse 時**多加一格**，
  //   ⇒ 對面算的 projection 與我們算的差一個 key ⇒ ⭐ **每一包都 digest 對不上**，
  //   而錯誤訊息會說「包被改過」。⚠️ 2026-09-02 實測：這正是第一版的行為。
  const rawManifest =
    typeof input.raw === "object" && input.raw !== null
      ? (input.raw as { manifest?: unknown }).manifest
      : undefined;
  const recomputed = packageDigest(rawManifest ?? m);
  if (recomputed !== m.packageDigest) {
    out.push(
      diag("PACKAGE_DIGEST_MISMATCH", {
        claimed: m.packageDigest,
        actual: recomputed,
      }),
    );
  }

  // ── ④ 逐份內容雜湊 ──────────────────────────────────────────────────────
  const docs = documentsOf(pkg);
  const changed: ValidateOutput["changed"] = [];
  const inPackage = new Map<string, Set<string>>();
  for (const e of m.entries) {
    if (e.role !== "authoring") continue;
    const doc = docs.get(e.path);
    if (doc === undefined) {
      out.push(
        diag(
          "ENTRY_HASH_MISMATCH",
          { path: e.path, claimed: e.contentSha256, actual: "(缺這份文件)" },
          e.path,
        ),
      );
      continue;
    }
    const actual = contentSha256(doc);
    if (actual !== e.contentSha256) {
      out.push(
        diag(
          "ENTRY_HASH_MISMATCH",
          { path: e.path, claimed: e.contentSha256, actual },
          e.path,
        ),
      );
      continue;
    }
    const parts = pathParts(e.path);
    if (parts === null) continue;
    (
      changed as {
        collection: string;
        id: string;
        path: string;
        contentSha256: string;
      }[]
    ).push({
      collection: parts.collection,
      id: parts.id,
      path: e.path,
      contentSha256: actual,
    });
    let set = inPackage.get(parts.collection);
    if (set === undefined) {
      set = new Set<string>();
      inPackage.set(parts.collection, set);
    }
    set.add(parts.id);
  }

  // ── ⑤ base pin（exact Base/before hashes）───────────────────────────────
  // ⚠️ bootstrap 的兩格必須是 null（schema 已擋）；full/delta 要**逐字相等**。
  if (m.mode !== "bootstrap") {
    const pins: [string, string | null | undefined, string | null][] = [
      ["gameRevision", m.base.gameRevision, input.base.gameRevision],
      ["contentVersion", m.base.contentVersion, input.base.contentVersion],
      [
        "activationDigest",
        m.base.activationDigest,
        input.base.activationDigest,
      ],
      ["authoringDigest", m.base.authoringDigest, input.base.authoringDigest],
    ];
    for (const [field, claimed, ours] of pins) {
      if (claimed === undefined || claimed === null) continue; // 沒 pin 就不比
      if (claimed !== ours) {
        out.push(
          diag("BASE_PIN_MISMATCH", {
            field,
            theirs: claimed,
            ours: ours ?? "(無)",
          }),
        );
      }
    }
  }

  // ── ⑥ 隱式刪除（full only）──────────────────────────────────────────────
  // ⭐ full ＝ **完整** snapshot ⇒ base 有而包裡沒有 ＝ 一次**看不見的刪除**。
  if (m.mode === "full") {
    const missing: string[] = [];
    for (const [collection, ids] of input.base.present) {
      const have = inPackage.get(collection) ?? new Set<string>();
      for (const id of ids)
        if (!have.has(id)) missing.push(`${collection}/${id}`);
    }
    if (missing.length > 0) {
      missing.sort();
      out.push(
        diag("IMPLICIT_DELETE_FORBIDDEN", {
          count: missing.length,
          sample: missing.slice(0, 3).join(" · "),
        }),
      );
    }
  }

  // ── ⑦ 相依封閉（包 ∪ base）──────────────────────────────────────────────
  const has = (collection: string, id: string): boolean =>
    (inPackage.get(collection)?.has(id) ?? false) ||
    (input.base.present.get(collection)?.has(id) ?? false);
  for (const c of changed) {
    const doc = docs.get(c.path);
    let edges: ReturnType<typeof extractRefs> = [];
    try {
      edges = extractRefs(c.collection as CollectionName, doc);
    } catch {
      // ⛔ 抽 ref 抽爆了不是這一步的事（④ 已經驗過位元組，① 驗過 schema）。
      continue;
    }
    for (const e of edges) {
      if (e.soft === true) continue; // ⭐ 軟參照懸空只警告 —— 與出貨 loader 同一條規則
      if (has(e.targetCollection, e.targetId)) continue;
      out.push(
        diag(
          "REF_NOT_CLOSED",
          {
            collection: c.collection,
            id: c.id,
            field: e.field,
            target: `${e.targetCollection}/${e.targetId}`,
          },
          c.path,
        ),
      );
    }
  }

  // ── ⑧ capability ────────────────────────────────────────────────────────
  for (const cap of m.requiredCapabilities) {
    if (!input.capabilities.has(cap)) {
      out.push(diag("CAPABILITY_UNSUPPORTED", { capability: cap }));
    }
  }

  const blocked = out.some((d) => d.severity === "error");
  return { ok: !blocked, value: pkg, diagnostics: out, changed };
}
