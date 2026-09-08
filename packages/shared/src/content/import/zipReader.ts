import type { ZipEntryMeta } from "./zipSafety";

export class ZipFormatError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "ZipFormatError"; }
}
export interface CentralEntry extends ZipEntryMeta { readonly method: number; readonly crc32: number; readonly localHeaderOffset: number; readonly flags: number; readonly directoryOffset: number }
export interface CentralDirectory { readonly entries: readonly CentralEntry[]; readonly eocdOffset: number }
const utf8 = new TextDecoder("utf-8", { fatal: true });
const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const fail = (code: string, message: string): never => { throw new ZipFormatError(code, message); };

/** The same bounded central/local header reader is used in Main and the browser. */
export function readCentralDirectory(bytes: Uint8Array): CentralDirectory {
  if (bytes.length < 22) fail("ZIP_TOO_SMALL", "這不是 ZIP，或檔案已被截斷。");
  const view = viewOf(bytes); let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) fail("ZIP_NO_EOCD", "找不到 ZIP 的 End of Central Directory。");
  if (end + 22 + view.getUint16(end + 20, true) !== bytes.length) fail("ZIP_TRAILING_DATA", "ZIP 結尾有額外資料。");
  if (end >= 20 && view.getUint32(end - 20, true) === 0x07064b50) fail("ZIP_ZIP64_UNSUPPORTED", "不接受 ZIP64。");
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== view.getUint16(end + 10, true)) fail("ZIP_MULTIDISK_UNSUPPORTED", "不接受分卷 ZIP。");
  const count = view.getUint16(end + 10, true); const size = view.getUint32(end + 12, true); const start = view.getUint32(end + 16, true);
  if (count === 65535 || size === 0xffffffff || start === 0xffffffff) fail("ZIP_ZIP64_UNSUPPORTED", "不接受 ZIP64。");
  if (start + size !== end) fail("ZIP_CD_OUT_OF_RANGE", "ZIP 目錄範圍與結尾不一致。");
  const entries: CentralEntry[] = []; let cursor = start;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end) fail("ZIP_CD_TRUNCATED", "ZIP 目錄被截斷。");
    if (view.getUint32(cursor, true) !== 0x02014b50) fail("ZIP_CD_BAD_SIGNATURE", "ZIP 目錄簽章錯誤。");
    const flags = view.getUint16(cursor + 8, true); const method = view.getUint16(cursor + 10, true);
    if (flags & ~0x080e || flags & 1 || flags & 0x40) fail("ZIP_FLAGS_UNSUPPORTED", "不接受加密或未支援旗標的 ZIP。");
    const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end) fail("ZIP_CD_TRUNCATED", "ZIP 目錄檔名或額外欄位被截斷。");
    if (view.getUint16(cursor + 34, true)) fail("ZIP_MULTIDISK_UNSUPPORTED", "不接受跨磁碟 entry。");
    let path: string; try { path = utf8.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); } catch { fail("ZIP_NAME_ENCODING", "ZIP 檔名不是有效 UTF-8。"); }
    entries.push({ path: path!, uncompressedSize: view.getUint32(cursor + 24, true), compressedSize: view.getUint32(cursor + 20, true), isDirectory: path!.endsWith("/"), unixMode: view.getUint32(cursor + 38, true) >>> 16, utf8NameFlag: (flags & 0x800) !== 0, method, flags, crc32: view.getUint32(cursor + 16, true), localHeaderOffset: view.getUint32(cursor + 42, true), directoryOffset: start });
    cursor = next;
  }
  if (cursor !== end) fail("ZIP_CD_TRUNCATED", "ZIP 目錄數量與大小不一致。");
  return { entries, eocdOffset: end };
}
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let value = n; for (let k = 0; k < 8; k++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value; });
export function zipCrc32(bytes: Uint8Array): number { let value = -1; for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255]! ^ (value >>> 8); return (value ^ -1) >>> 0; }

export function extractEntry(bytes: Uint8Array, entry: CentralEntry, inflate?: (bytes: Uint8Array, maxBytes: number) => Uint8Array): Uint8Array {
  const view = viewOf(bytes); const offset = entry.localHeaderOffset;
  if (offset + 30 > entry.directoryOffset || view.getUint32(offset, true) !== 0x04034b50) fail("ZIP_LOCAL_HEADER_BAD", `${entry.path} 的本機標頭無效。`);
  const flags = view.getUint16(offset + 6, true); const method = view.getUint16(offset + 8, true);
  if (flags !== entry.flags || method !== entry.method) fail("ZIP_HEADER_MISMATCH", `${entry.path} 的本機標頭與目錄不一致。`);
  const nameLength = view.getUint16(offset + 26, true); const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength; const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > entry.directoryOffset) fail("ZIP_DATA_OUT_OF_RANGE", `${entry.path} 的資料超出範圍。`);
  if (utf8.decode(bytes.subarray(offset + 30, offset + 30 + nameLength)) !== entry.path) fail("ZIP_NAME_MISMATCH", `${entry.path} 的本機檔名與目錄不同。`);
  if (!(flags & 8)) {
    if (view.getUint32(offset + 18, true) !== entry.compressedSize || view.getUint32(offset + 22, true) !== entry.uncompressedSize) fail("ZIP_SIZE_MISMATCH", `${entry.path} 的本機尺寸與目錄不同。`);
    if (view.getUint32(offset + 14, true) !== entry.crc32) fail("ZIP_CRC_MISMATCH", `${entry.path} 的本機 CRC 與目錄不同。`);
  }
  const raw = bytes.subarray(dataStart, dataEnd);
  let output: Uint8Array;
  if (method === 0) output = Uint8Array.from(raw);
  else if (method === 8 && inflate) output = inflate(raw, entry.uncompressedSize);
  else fail("ZIP_METHOD_UNSUPPORTED", `${entry.path} 使用未支援的壓縮方式 ${method}。`);
  if (output!.length !== entry.uncompressedSize) fail("ZIP_SIZE_MISMATCH", `${entry.path} 的解壓尺寸不符。`);
  if (zipCrc32(output!) !== entry.crc32) fail("ZIP_CRC_MISMATCH", `${entry.path} 的 CRC32 不符。`);
  return output!;
}
