import { sha256Bytes } from "../sha256";
import { packageDigest } from "./digest";
import { canonicalizeJcs, contentSha256, compareUtf8Bytes } from "./jcs";
import { zEditorImportPackage, zPackageManifest, type EditorImportPackage } from "./packageSchema";
import { ZIP_LIMITS, checkZipSafety } from "./zipSafety";
import { extractEntry, readCentralDirectory, ZipFormatError } from "./zipReader";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const fail = (code: string, message: string): never => { throw new ZipFormatError(code, message); };
const parseJson = (bytes: Uint8Array, path: string): unknown => {
  try { return JSON.parse(utf8.decode(bytes)); }
  catch { return fail("ZIP_JSON_INVALID", `${path} 不是有效的 UTF-8 JSON。`); }
};

/** Decode the existing package format after archive safety checks. Never executes payload code.
 * Main delegates semantic checks to validatePackage for its field-level diagnostics;
 * offline readers verify those content digests here before opening any draft or asset.
 */
export function readPackageZip(bytes: Uint8Array, options: {
  inflate?: (bytes: Uint8Array, maxBytes: number) => Uint8Array;
  verifyContent?: boolean;
} = {}): EditorImportPackage {
  if (bytes.length > ZIP_LIMITS.maxArchiveCompressedBytes) fail("ZIP_ARCHIVE_TOO_LARGE", "ZIP 超過大小上限。");
  const directory = readCentralDirectory(bytes);
  const safety = checkZipSafety(directory.entries);
  if (!safety.ok) fail(safety.diagnostics[0]?.code ?? "ZIP_UNSAFE", safety.diagnostics.map((row) => `${row.code} ${row.path}: ${row.message}`).join("；"));
  const raw = new Map<string, Uint8Array>();
  for (const entry of directory.entries) if (!entry.isDirectory) raw.set(entry.path, extractEntry(bytes, entry, options.inflate));
  const manifestBytes = raw.get("manifest.json");
  if (!manifestBytes) fail("ZIP_MANIFEST_MISSING", "ZIP 裡沒有 manifest.json。");
  const manifestRaw = parseJson(manifestBytes!, "manifest.json");
  const checkedManifest = zPackageManifest.safeParse(manifestRaw);
  if (!checkedManifest.success) fail("ZIP_MANIFEST_INVALID", `ZIP 清單格式不符：${checkedManifest.error.message}`);
  const manifest = checkedManifest.data!;
  const declared = new Map(manifest.entries.map((entry) => [entry.path, entry]));
  if (declared.size !== manifest.entries.length) fail("ZIP_ENTRY_DUPLICATE", "Manifest 重複宣告檔案。");
  if (declared.has("manifest.json")) fail("ZIP_ENTRY_ROLE_INVALID", "Manifest 不可把自己宣告為內容檔案。");
  for (const path of raw.keys()) if (path !== "manifest.json" && !declared.has(path)) fail("ZIP_ENTRY_UNDECLARED", `ZIP 的 ${path} 未列於清單。`);
  for (const path of declared.keys()) if (!raw.has(path)) fail("ZIP_ENTRY_MISSING", `ZIP 缺少清單宣告的 ${path}。`);
  const transport = manifest.transport?.entries;
  if (transport) {
    const paths = new Set(transport.map((entry) => entry.path));
    if (paths.size !== transport.length || paths.size !== declared.size || [...paths].some((path) => !declared.has(path))) fail("ZIP_TRANSPORT_ENTRIES_MISMATCH", "傳輸清單與內容清單不一致。");
    for (const entry of transport) {
      const data = raw.get(entry.path)!;
      if (data.length !== entry.rawSize || `sha256:${sha256Bytes(data)}` !== entry.rawSha256) fail("ZIP_TRANSPORT_HASH_MISMATCH", `${entry.path} 的傳輸雜湊或長度不符。`);
    }
  }
  if (options.verifyContent !== false && packageDigest(manifestRaw) !== manifest.packageDigest) fail("ZIP_PACKAGE_DIGEST_MISMATCH", "完整作品的 packageDigest 不符。");
  const pkg: EditorImportPackage = { schema: "ggd-editor-import@1", manifest: manifestRaw as EditorImportPackage["manifest"], documents: [], compiled: [], validation: [], reports: {}, assets: [] };
  for (const [path, entry] of [...declared.entries()].sort(([a], [b]) => compareUtf8Bytes(a, b))) {
    const data = raw.get(path)!;
    const document = entry.role === "asset" ? undefined : parseJson(data, path);
    if (options.verifyContent !== false) {
      const digest = entry.role === "asset" ? `sha256:${sha256Bytes(data)}` : contentSha256(document);
      const size = entry.role === "asset" ? data.length : encoder.encode(canonicalizeJcs(document)).length;
      if (digest !== entry.contentSha256 || size !== entry.contentSize) fail("ZIP_ENTRY_HASH_MISMATCH", `${path} 的內容雜湊或長度不符。`);
    }
    if (entry.role === "asset") pkg.assets.push({ path, bytes: data });
    else if (entry.role === "authoring") pkg.documents.push({ path, document });
    else if (entry.role === "compiled") pkg.compiled.push({ path, document });
    else if (entry.role === "validation") pkg.validation.push({ path, document });
    else if (entry.role === "report") pkg.reports[path] = document;
  }
  const checked = zEditorImportPackage.safeParse(pkg);
  if (!checked.success) fail("ZIP_PACKAGE_INVALID", `完整作品的文件路徑或結構不符：${checked.error.message}`);
  return pkg;
}
