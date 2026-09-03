/**
 * ⭐⭐ GH#966 —— **編輯器打包進來的 icon 圖片**：路徑約定 ＋ 純函式驗證。
 *
 * > owner 2026-09-02（逐字）：「codex 技能編輯器要能**打包 icon 圖片**。設計者可以用
 * >  codex 技能編輯器**上傳設定圖片檔（但不是真的馬上上傳）**，而編輯器會**自動縮圖
 * >  轉檔放入一起打包**。請你也**設計該合約形式**」
 *
 * ── ⭐ 契約比想像的小 —— ⛔ 不要另開一個 `assets[]` 陣列 ────────────────────
 * `zManifestEntry` 已經帶著 `path` / `contentSha256` / `contentSize` / `collection` / `id`
 * ⇒ ⭐ 真正的 delta 只有「`role` 多一個值 ＋ 三格 optional ＋ 一條二進位分支」。
 * ⛔ 另開一個陣列 ＝ 同一份事實的第二個住處（第〇·四守則）。
 *
 * ── ⭐ 路徑自己就說得出「這是誰的 icon」 ─────────────────────────────────────
 * ```
 * assets/icon/<collection>/<docId>/source.<ext>
 * 例：assets/icon/abilities/godie-hjai.e/source.png
 * ```
 * ⛔ 不靠檔名猜、⛔ 不靠 manifest 單方面宣告 —— ⭐ **兩邊都要說，而且要一致**
 * （這與「同步器要先驗 key 本身」是同一條規矩：⛔ 不要拿一把沒驗過的鑰匙去 join）。
 *
 * ── ⭐ 落點是**既有慣例**，⛔ 不是本票新發明的 ──────────────────────────────
 * `content/assets/icons/<collection>/<id>.webp` —— `tools/icon-gen` 產出的那 1,039 份
 * 就住在那裡，而 `ability@1.icon` 的正則逐字要求 `^assets/`。
 *
 * ⚠️ ⭐ **這一支是純函式**（同 `validatePackage`）：它不碰檔案系統、不跑 `cwebp`。
 * ⇒ 「先驗後解」那個順序因此是**結構上**成立的，⛔ 不是靠某個呼叫端記得。
 */
import { diagnostic, type ImportDiagnostic } from "./diagnostics";
import {
  ICON_EXTENSIONS,
  ICON_OUTPUT_DIR,
  iconMimeOf,
  sniffImageHeader,
  type IconFormat,
} from "../icons/iconContract";

/** `zManifestEntry.role` 的新值。⛔ 字串常數只有這一個住處。 */
export const ASSET_ROLE = "asset" as const;

/** zip 裡 asset 的前綴。 */
export const ICON_ASSET_PREFIX = "assets/icon/";

/**
 * ⭐ 三種一起做，⛔ 不是先做一種。
 * 契約**完全相同**（只差路徑裡的 `<collection>`），而 `convert-webp` 的
 * `DOC_COLLECTIONS` 本來就是這三個 ⇒ ⛔ 先做一種等於同一段程式碼碰三次。
 */
export const ICON_ASSET_COLLECTIONS: readonly string[] = Object.freeze([
  "abilities",
  "champions",
  "items",
]);

/** 今天唯一支援的 `targetField`。⛔ 白名單，⛔ 不是「隨便一個欄位名」。 */
export const ICON_TARGET_FIELD = "icon" as const;

export interface IconAssetPath {
  readonly collection: string;
  readonly id: string;
  readonly ext: string;
}

/**
 * `assets/icon/<collection>/<docId>/source.<ext>` → 三段。認不出來回 `null`。
 *
 * ⚠️ ⭐ 這裡**再擋一次**目錄穿越，即使 `zPathSegment`（GH#969）已經在 schema 擋過：
 * ⭐ 兩層是**刻意重疊**的 —— schema 驗的是 manifest 宣告的那一格，
 * 這裡驗的是 **zip entry 的路徑字串**，⛔ 而它們是兩個不同的來源。
 */
export function parseIconAssetPath(path: string): IconAssetPath | null {
  const m = /^assets\/icon\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._@-]*)\/source\.([A-Za-z0-9]+)$/.exec(
    path,
  );
  if (m === null) return null;
  const [, collection, id, ext] = m as unknown as [string, string, string, string];
  if (collection.includes("..") || id.includes("..")) return null;
  return { collection, id, ext: ext.toLowerCase() };
}

/** 落點（content-relative）。⭐ 與 `tools/icon-gen` 的輸出**同一個公式**。 */
export function iconOutputPath(collection: string, id: string): string {
  return `${ICON_OUTPUT_DIR}/${collection}/${id}.webp`;
}

/** 一台機器對 icon 上傳的政策（由 `config.icon-upload@1` 解析出來）。 */
export interface IconUploadPolicy {
  readonly enabled: boolean;
  readonly requiresReview: boolean;
  readonly preserveAlpha: boolean;
  /** ⭐ **推導**出來的來源邊長上限（= 出貨邊長 × 倍數），⛔ 不是文件裡的字面值。 */
  readonly maxSourceEdge: number;
  /** 單一 entry 的位元組上限 —— ⭐ 沿用 `ZIP_LIMITS.maxEntryUncompressedBytes`。 */
  readonly maxSourceBytes: number;
}

/** manifest 上一列 asset entry（⭐ 只取這一層會用到的欄位）。 */
export interface IconAssetEntry {
  readonly path: string;
  readonly role: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly collection?: string | undefined;
  readonly id?: string | undefined;
  readonly mime?: string | undefined;
  readonly targetField?: string | undefined;
  /**
   * ⭐ CAS —— 你讀到的**現有** icon 檔的 sha256（`sha256:<hex>`），
   * 沒有現有檔就明示 `null`。⛔ 省略 = 不做 CAS（bootstrap 用）。
   */
  readonly baseSha256?: string | null | undefined;
}

export interface IconAssetPlan {
  readonly path: string;
  readonly collection: string;
  readonly id: string;
  readonly format: IconFormat;
  readonly width: number;
  readonly height: number;
  /** 落點（content-relative）。 */
  readonly outputPath: string;
}

export interface CheckIconAssetsInput {
  readonly entries: readonly IconAssetEntry[];
  /** zip 解出來的位元組，key = entry path。 */
  readonly bytes: ReadonlyMap<string, Uint8Array>;
  readonly policy: IconUploadPolicy;
  /** ⭐ 現有 icon 檔的 sha256（`<collection>/<id>` → `sha256:<hex>`）。CAS 的另一半。 */
  readonly existing: ReadonlyMap<string, string>;
  /** 注入的雜湊器（`sha256:` 前綴的 wire format）。 */
  readonly sha256: (bytes: Uint8Array) => string;
}

export interface CheckIconAssetsOutput {
  readonly diagnostics: readonly ImportDiagnostic[];
  /** ⭐ 通過的那些 —— apply 會照這一份落地。 */
  readonly plans: readonly IconAssetPlan[];
}

/**
 * ⭐⭐ 逐條驗一包裡的 asset entry。⛔ 一條不過就不進 `plans`。
 *
 * ⚠️ ⭐ **順序是承重的**：位元組事實（sha/size）→ 大小 → magic bytes → **檔頭長寬** →
 * CAS。⛔ 任何把「檔頭長寬」排在 decode 之後的寫法，那道檢查就只是裝飾。
 */
export function checkIconAssets(input: CheckIconAssetsInput): CheckIconAssetsOutput {
  const out: ImportDiagnostic[] = [];
  const plans: IconAssetPlan[] = [];
  const assets = input.entries.filter((e) => e.role === ASSET_ROLE);
  if (assets.length === 0) return { diagnostics: out, plans };

  if (!input.policy.enabled) {
    out.push(diagnostic("ASSET_UPLOAD_DISABLED", { count: assets.length }));
    return { diagnostics: out, plans };
  }

  for (const e of assets) {
    const bad = (reason: string): void => {
      out.push(diagnostic("ASSET_ENTRY_INVALID", { path: e.path, reason }, { path: e.path }));
    };
    const parsed = parseIconAssetPath(e.path);
    if (parsed === null) {
      bad("路徑不是 `assets/icon/<collection>/<docId>/source.<ext>`");
      continue;
    }
    if (!ICON_ASSET_COLLECTIONS.includes(parsed.collection)) {
      bad(`collection \`${parsed.collection}\` 不在 ${ICON_ASSET_COLLECTIONS.join(" / ")} 之內`);
      continue;
    }
    if (e.collection !== undefined && e.collection !== parsed.collection) {
      bad(`manifest 說 collection=\`${e.collection}\`，而路徑說 \`${parsed.collection}\``);
      continue;
    }
    if (e.id !== undefined && e.id !== parsed.id) {
      bad(`manifest 說 id=\`${e.id}\`，而路徑說 \`${parsed.id}\``);
      continue;
    }
    const target = e.targetField ?? ICON_TARGET_FIELD;
    if (target !== ICON_TARGET_FIELD) {
      bad(`targetField 只支援 \`${ICON_TARGET_FIELD}\`，收到 \`${target}\``);
      continue;
    }
    const declaredExt = ICON_EXTENSIONS[parsed.ext];
    if (declaredExt === undefined) {
      bad(`副檔名 \`.${parsed.ext}\` 不在 ${Object.keys(ICON_EXTENSIONS).join(" / ")} 之內`);
      continue;
    }

    const bytes = input.bytes.get(e.path);
    if (bytes === undefined) {
      bad("manifest 宣告了它，而 zip 裡沒有這一份（⭐ 兩個方向都要對得上）");
      continue;
    }

    // ── ① 位元組事實 ──────────────────────────────────────────────────────
    if (bytes.length !== e.contentSize) {
      out.push(
        diagnostic(
          "ASSET_BYTES_MISMATCH",
          { path: e.path, field: "contentSize", claimed: e.contentSize, actual: bytes.length },
          { path: e.path },
        ),
      );
      continue;
    }
    const actualSha = input.sha256(bytes);
    if (actualSha !== e.contentSha256) {
      out.push(
        diagnostic(
          "ASSET_BYTES_MISMATCH",
          { path: e.path, field: "contentSha256", claimed: e.contentSha256, actual: actualSha },
          { path: e.path },
        ),
      );
      continue;
    }
    // ── ② 位元組上限（S3）─────────────────────────────────────────────────
    if (bytes.length > input.policy.maxSourceBytes) {
      out.push(
        diagnostic(
          "ASSET_BYTES_MISMATCH",
          {
            path: e.path,
            field: "位元組上限",
            claimed: bytes.length,
            actual: input.policy.maxSourceBytes,
          },
          { path: e.path },
        ),
      );
      continue;
    }
    // ── ③ magic bytes（S1）───────────────────────────────────────────────
    const header = sniffImageHeader(bytes);
    if (header === null) {
      out.push(
        diagnostic(
          "ASSET_FORMAT_REJECTED",
          { path: e.path, actual: "(認不出來的位元組)", claimed: e.mime ?? `.${parsed.ext}` },
          { path: e.path },
        ),
      );
      continue;
    }
    if (header.format !== declaredExt) {
      out.push(
        diagnostic(
          "ASSET_FORMAT_REJECTED",
          { path: e.path, actual: header.mime, claimed: iconMimeOf(declaredExt) },
          { path: e.path },
        ),
      );
      continue;
    }
    if (e.mime !== undefined && e.mime !== header.mime) {
      out.push(
        diagnostic(
          "ASSET_FORMAT_REJECTED",
          { path: e.path, actual: header.mime, claimed: e.mime },
          { path: e.path },
        ),
      );
      continue;
    }
    // ── ④ 檔頭長寬（S2）—— ⭐ decode **之前** ────────────────────────────
    if (
      header.width > input.policy.maxSourceEdge ||
      header.height > input.policy.maxSourceEdge ||
      header.width <= 0 ||
      header.height <= 0
    ) {
      out.push(
        diagnostic(
          "ASSET_DIMENSIONS_TOO_LARGE",
          {
            path: e.path,
            width: header.width,
            height: header.height,
            limit: input.policy.maxSourceEdge,
          },
          { path: e.path },
        ),
      );
      continue;
    }
    // ── ⑤ CAS ────────────────────────────────────────────────────────────
    if (e.baseSha256 !== undefined) {
      const current = input.existing.get(`${parsed.collection}/${parsed.id}`) ?? null;
      if ((e.baseSha256 ?? null) !== current) {
        out.push(
          diagnostic(
            "ASSET_BASE_CHANGED",
            {
              path: e.path,
              claimed: e.baseSha256 ?? "(沒有現有檔)",
              actual: current ?? "(沒有現有檔)",
            },
            { path: e.path },
          ),
        );
        continue;
      }
    }

    plans.push({
      path: e.path,
      collection: parsed.collection,
      id: parsed.id,
      format: header.format,
      width: header.width,
      height: header.height,
      outputPath: iconOutputPath(parsed.collection, parsed.id),
    });
  }
  return { diagnostics: out, plans };
}
