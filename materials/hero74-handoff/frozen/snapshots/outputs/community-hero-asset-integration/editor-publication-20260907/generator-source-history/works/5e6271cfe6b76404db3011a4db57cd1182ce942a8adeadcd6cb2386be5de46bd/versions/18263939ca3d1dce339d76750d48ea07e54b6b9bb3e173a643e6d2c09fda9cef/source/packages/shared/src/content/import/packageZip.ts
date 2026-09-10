import { canonicalizeJcs, compareUtf8Bytes, SHA256_PREFIX } from "./jcs";
import { packageDigest } from "./digest";
import { zPackageManifest, type EditorImportPackage, type PackageManifest } from "./packageSchema";
import { checkZipSafety } from "./zipSafety";
import { ASSET_ROLE } from "./iconAssets";

export interface PackageZipInput {
  package: EditorImportPackage;
  entries: ReadonlyMap<string, unknown>;
  binaryEntries: ReadonlyMap<string, Uint8Array>;
  filenameStem: string;
}

export function packageZipInput(pkg: EditorImportPackage, filenameStem: string): PackageZipInput {
  const entries = new Map([...pkg.documents, ...pkg.compiled, ...pkg.validation].map((entry) => [entry.path, entry.document]));
  for (const entry of pkg.manifest.entries) if (entry.role === "report") entries.set(entry.path, pkg.reports[entry.path]);
  const binaryEntries = new Map<string, Uint8Array>();
  for (const asset of pkg.assets) {
    if (!(asset.bytes instanceof Uint8Array)) throw new Error(`資產需要 ZIP 的原始位元組：${asset.path}`);
    binaryEntries.set(asset.path, asset.bytes);
  }
  return { package: pkg, entries, binaryEntries, filenameStem };
}

const UTF8 = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function header(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

export function deterministicStoredZip(files: readonly { path: string; bytes: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = UTF8.encode(file.path);
    const crc = crc32(file.bytes);
    const local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true); // STORE: deterministic, no implementation-specific deflate stream.
    local.view.setUint16(10, 0, true);
    local.view.setUint16(12, 0x0021, true); // 1980-01-01.
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, file.bytes.length, true);
    local.view.setUint32(22, file.bytes.length, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    locals.push(local.bytes, file.bytes);

    const central = header(46 + name.length);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 0x0314, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint16(12, 0, true);
    central.view.setUint16(14, 0x0021, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, file.bytes.length, true);
    central.view.setUint32(24, file.bytes.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(38, 0x81a40000, true); // regular 0644
    central.view.setUint32(42, offset, true);
    central.bytes.set(name, 46);
    centrals.push(central.bytes);
    offset += local.bytes.length + file.bytes.length;
  }
  const centralBytes = concat(centrals);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralBytes.length, true);
  end.view.setUint32(16, offset, true);
  return concat([...locals, centralBytes, end.bytes]);
}

export async function binarySha256(bytes: Uint8Array): Promise<string> {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return SHA256_PREFIX + [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildRuntimePackageZip(built: PackageZipInput): Promise<{
  bytes: Uint8Array;
  archiveSha256: string;
  filename: string;
}> {
  const declared = new Map(built.package.manifest.entries.map((entry) => [entry.path, entry]));
  const paths = [...built.entries.keys(), ...built.binaryEntries.keys()];
  if (declared.size !== built.package.manifest.entries.length || new Set(paths).size !== paths.length || paths.length !== declared.size || paths.some((path) => !declared.has(path) || (declared.get(path)!.role === ASSET_ROLE) !== built.binaryEntries.has(path))) {
    throw new Error("ZIP 的實際檔案與 manifest entries 必須一一對應。");
  }
  const dataFiles = [...built.entries.entries()]
    .sort(([a], [b]) => compareUtf8Bytes(a, b))
    .map(([path, value]) => ({ path, text: `${canonicalizeJcs(value)}\n` }));
  const transportEntries: { path: string; rawSha256: string; rawSize: number }[] = [];
  for (const { path, text } of dataFiles) {
    const bytes = UTF8.encode(text);
    transportEntries.push({ path, rawSha256: await binarySha256(bytes), rawSize: bytes.length });
  }
  const binaryFiles = [...built.binaryEntries.entries()]
    .sort(([a], [b]) => compareUtf8Bytes(a, b))
    .map(([path, bytes]) => ({ path, bytes }));
  const assetManifest = new Map(
    built.package.manifest.entries
      .filter((entry) => entry.role === ASSET_ROLE)
      .map((entry) => [entry.path, entry] as const),
  );
  for (const file of binaryFiles) {
    const entry = assetManifest.get(file.path);
    const rawSha256 = await binarySha256(file.bytes);
    if (!entry || entry.contentSize !== file.bytes.length || entry.contentSha256 !== rawSha256) {
      throw new Error(`ZIP asset ${file.path} 的 manifest／原始位元組不一致`);
    }
    transportEntries.push({ path: file.path, rawSha256, rawSize: file.bytes.length });
  }
  const manifest: PackageManifest = {
    ...built.package.manifest,
    transport: { format: "zip", policy: "store-jcs-utf8-v1", entries: transportEntries },
  };
  const parsedManifest = zPackageManifest.safeParse(manifest);
  if (!parsedManifest.success) throw new Error(`ZIP manifest 自我驗證失敗：${parsedManifest.error.message}`);
  if (packageDigest(manifest) !== built.package.manifest.packageDigest) throw new Error("JSON／ZIP packageDigest 不一致");
  const files = [
    { path: "manifest.json", bytes: UTF8.encode(`${canonicalizeJcs(manifest)}\n`) },
    ...dataFiles.map(({ path, text }) => ({ path, bytes: UTF8.encode(text) })),
    ...binaryFiles,
  ];
  const safety = checkZipSafety(files.map((file) => ({
    path: file.path,
    uncompressedSize: file.bytes.length,
    compressedSize: file.bytes.length,
    unixMode: 0x81a4,
    utf8NameFlag: true,
  })));
  if (!safety.ok) throw new Error(`ZIP safety 自我驗證失敗：${safety.diagnostics.map((d) => d.code).join("、")}`);
  const bytes = deterministicStoredZip(files);
  return { bytes, archiveSha256: await binarySha256(bytes), filename: `${built.filenameStem}.zip` };
}
