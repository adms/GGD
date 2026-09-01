/**
 * ⭐⭐ **ZIP central-directory preflight**（規格 §3）—— ⛔ 在任何解壓之前。
 *
 * ── ⛔ 為什麼不用一個 zip 函式庫 ────────────────────────────────────────────
 * ⚠️ 幾乎所有 zip 函式庫的 API 都是「**先解開再說**」（`extractAllTo`、
 * `openReadStream`）—— ⭐ 而 zip-slip、zip bomb、symlink 的傷害**在解開的那一刻
 * 就已經發生**。`zipSafety.ts` 的檔頭逐字寫著這一點：
 * 「檢查必須在**任何 I/O 之前**用 central directory 做完」。
 * ⇒ ⭐ 所以這一支只做兩件事：**讀 central directory** 與 **解開單一 entry 到記憶體**，
 * ⛔ 兩者之間隔著 `checkZipSafety`。
 *
 * ── ⭐ 三個規格點名而 `zipSafety` **管不到**的東西 ──────────────────────────
 * `checkZipSafety` 吃的是**已經讀出來的 metadata** ⇒ 它結構上看不到容器本身的問題：
 *
 * | 問題 | 為什麼 metadata 看不到 | 這裡怎麼擋 |
 * |---|---|---|
 * | **trailing data** | 它在最後一個 entry **之後** | EOCD 之後還有位元組 ⇒ 拒 |
 * | **ZIP64** | 它換的是**欄位寬度**，不是內容 | 看到 ZIP64 EOCD locator ⇒ 拒 |
 * | **central/local 不一致** | metadata 只有 central 那一份 | 解開時比對 local header |
 *
 * ⚠️ ⭐ **ZIP64 是「拒絕」而不是「支援」，而那是一個有理由的選擇**：
 * 規格 §8 的 package 全是 JSON、V1 明令不含 binary assets，
 * 而 ZIP64 的門檻是 4 GiB / 65,535 entries —— ⭐ 一個合法的 package 到不了那裡。
 * ⇒ ⛔ 支援它＝多一條**永遠不會被走到、也永遠不會被測到**的解析路徑，
 * 而那正是解析器漏洞住的地方。
 */
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

import type { ZipEntryMeta } from "@ggd/shared/content/import/zipSafety";

/** EOCD 最多往回掃這麼多 bytes（22 + 65535 註解上限）。⛔ 不掃整份檔。 */
const EOCD_SCAN_LIMIT = 22 + 0xffff;
const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export class ZipFormatError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ZipFormatError";
  }
}

export interface CentralEntry extends ZipEntryMeta {
  /** 壓縮方法：0 = stored、8 = deflate。⛔ 其餘一律拒。 */
  readonly method: number;
  readonly crc32: number;
  readonly localHeaderOffset: number;
}

export interface CentralDirectory {
  readonly entries: readonly CentralEntry[];
  readonly eocdOffset: number;
}

/**
 * ⭐ 讀 central directory。**⛔ 不解壓任何東西。**
 *
 * ⚠️ 每一個 offset 在用之前都要驗界 —— ⛔ 一個 `readUInt32LE(越界)` 在 Node 會擲
 * `RangeError`，⭐ 而那個例外訊息會變成 500 而不是「你的 ZIP 壞了」。
 */
export function readCentralDirectory(buf: Buffer): CentralDirectory {
  if (buf.length < 22) {
    throw new ZipFormatError(
      "ZIP_TOO_SMALL",
      "檔案比一個空 ZIP 還小 —— 這不是 ZIP。",
    );
  }
  // ── ① 找 EOCD（從尾端往回掃，⛔ 有界）─────────────────────────────────
  const from = Math.max(0, buf.length - EOCD_SCAN_LIMIT);
  let eocd = -1;
  for (let i = buf.length - 22; i >= from; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new ZipFormatError(
      "ZIP_NO_EOCD",
      "找不到 End of Central Directory —— 這不是一份完整的 ZIP。",
    );
  }

  // ── ② trailing data ────────────────────────────────────────────────────
  // ⭐ EOCD 之後只允許「註解」，而註解長度寫在 EOCD 裡。
  //   ⚠️ 多出來的位元組是**經典的走私手法**：兩個解析器對「這份 ZIP 是什麼」
  //   得到不同答案（一個從頭讀、一個從 EOCD 讀）⇒ ⛔ 我們拒絕整個歧義。
  const commentLen = buf.readUInt16LE(eocd + 20);
  const expectedEnd = eocd + 22 + commentLen;
  if (expectedEnd !== buf.length) {
    throw new ZipFormatError(
      "ZIP_TRAILING_DATA",
      `EOCD 之後多出 ${buf.length - expectedEnd} bytes —— ⛔ 兩個解析器會對「這份 ZIP 是什麼」` +
        `得到不同答案，⭐ 而我們拒絕整個歧義。`,
    );
  }

  // ── ③ ZIP64 ────────────────────────────────────────────────────────────
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === ZIP64_LOCATOR_SIG) {
    throw new ZipFormatError(
      "ZIP_ZIP64_UNSUPPORTED",
      "這是一份 ZIP64 —— ⛔ 不收。⭐ package 全是 JSON 且不含 binary assets，" +
        "合法的一包到不了 4 GiB / 65,535 entries；支援它只會多一條永遠測不到的解析路徑。",
    );
  }
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (
    entryCount === 0xffff ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff
  ) {
    throw new ZipFormatError(
      "ZIP_ZIP64_UNSUPPORTED",
      "EOCD 的欄位是 ZIP64 的哨兵值（0xFFFF / 0xFFFFFFFF）—— ⛔ 不收（同上）。",
    );
  }
  if (cdOffset + cdSize > buf.length) {
    throw new ZipFormatError(
      "ZIP_CD_OUT_OF_RANGE",
      "central directory 宣告的範圍超出檔案 —— ⛔ 這份 ZIP 是壞的或被截斷。",
    );
  }

  // ── ④ 逐筆讀 central directory（⛔ 仍然不解壓）───────────────────────
  const entries: CentralEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (p + 46 > cdOffset + cdSize) {
      throw new ZipFormatError(
        "ZIP_CD_TRUNCATED",
        `central directory 在第 ${i} 筆被截斷。`,
      );
    }
    if (buf.readUInt32LE(p) !== CENTRAL_SIG) {
      throw new ZipFormatError(
        "ZIP_CD_BAD_SIGNATURE",
        `central directory 第 ${i} 筆的簽章不對。`,
      );
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc32 = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const externalAttrs = buf.readUInt32LE(p + 38);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const nameStart = p + 46;
    if (nameStart + nameLen > buf.length) {
      throw new ZipFormatError(
        "ZIP_CD_TRUNCATED",
        `第 ${i} 筆的檔名超出檔案。`,
      );
    }
    const raw = buf.subarray(nameStart, nameStart + nameLen);
    const path = raw.toString("utf8");
    entries.push({
      path,
      uncompressedSize,
      compressedSize,
      isDirectory: path.endsWith("/"),
      // ⭐ unix mode 在 external attributes 的高 16 bits ——
      //   `zipSafety` 用它判 symlink / device。
      unixMode: (externalAttrs >>> 16) & 0xffff,
      utf8NameFlag: (flags & 0x800) !== 0,
      method,
      crc32,
      localHeaderOffset,
    });
    p = nameStart + nameLen + extraLen + commentLength;
  }
  return { entries, eocdOffset: eocd };
}

/** crc32（ZIP 用的那一個多項式）。⭐ 用來驗解出來的位元組。 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1)
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * ⭐ 解開**一筆** entry 到記憶體。
 *
 * ⚠️ 三道驗證，⛔ 缺一個就等於沒有 preflight：
 * ① local header 的簽章與檔名要**與 central 一致**（⭐ 兩者不一致是走私手法）
 * ② 解出來的**長度**要等於 central 宣告的（⛔ 否則壓縮比檢查就被繞過了）
 * ③ **CRC32** 要對得上
 */
export function extractEntry(buf: Buffer, e: CentralEntry): Buffer {
  const off = e.localHeaderOffset;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== LOCAL_SIG) {
    throw new ZipFormatError(
      "ZIP_LOCAL_HEADER_BAD",
      `${e.path}: local header 簽章不對或超出檔案。`,
    );
  }
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const nameStart = off + 30;
  const localName = buf
    .subarray(nameStart, nameStart + nameLen)
    .toString("utf8");
  if (localName !== e.path) {
    throw new ZipFormatError(
      "ZIP_NAME_MISMATCH",
      `${e.path}: local header 的檔名是 ${localName} —— ⛔ 兩份目錄說了不同的話，這是走私。`,
    );
  }
  const dataStart = nameStart + nameLen + extraLen;
  const dataEnd = dataStart + e.compressedSize;
  if (dataEnd > buf.length) {
    throw new ZipFormatError(
      "ZIP_DATA_OUT_OF_RANGE",
      `${e.path}: 資料範圍超出檔案。`,
    );
  }
  const raw = buf.subarray(dataStart, dataEnd);
  let out: Buffer;
  if (e.method === 0) out = Buffer.from(raw);
  else if (e.method === 8) out = inflateRawSync(raw);
  else {
    throw new ZipFormatError(
      "ZIP_METHOD_UNSUPPORTED",
      `${e.path}: 壓縮方法 ${e.method} 不收（只收 stored 與 deflate）。`,
    );
  }
  if (out.length !== e.uncompressedSize) {
    throw new ZipFormatError(
      "ZIP_SIZE_MISMATCH",
      `${e.path}: 解出來 ${out.length} bytes，而 central directory 宣告 ${e.uncompressedSize} —— ` +
        `⛔ 宣告值是壓縮比檢查的分子，它說謊等於那道檢查沒跑。`,
    );
  }
  if (crc32(out) !== e.crc32) {
    throw new ZipFormatError("ZIP_CRC_MISMATCH", `${e.path}: CRC32 對不上。`);
  }
  return out;
}

/** ⭐ 整份 archive 的 sha256（`transport.archiveSha256` 用）。 */
export function archiveSha256(buf: Buffer): string {
  return "sha256:" + createHash("sha256").update(buf).digest("hex");
}
