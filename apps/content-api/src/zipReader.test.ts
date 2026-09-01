/**
 * ⭐⭐ `zipReader` 的守衛 —— **容器層**的攻擊，⛔ 不是內容層。
 *
 * ⚠️ ⭐ 這一支自己**手工組 ZIP 位元組**（⛔ 不用任何 zip 函式庫）——
 * 理由：要測的正是「畸形的 ZIP」，而函式庫寫不出畸形的 ZIP。
 *
 * MUTATION LOG（落地前跑過，見 commit 訊息）：
 *   · trailing data 檢查拿掉 → 🔴
 *   · ZIP64 locator 檢查拿掉 → 🔴
 *   · local/central 檔名比對拿掉 → 🔴
 *   · 解出長度比對拿掉 → 🔴
 */
import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";

import {
  readCentralDirectory,
  extractEntry,
  ZipFormatError,
} from "./zipReader";

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

interface Spec {
  name: string;
  data: Buffer;
  /** ⭐ 讓測試可以**故意**在 central 與 local 寫不同的檔名。 */
  centralName?: string;
  /** ⭐ 故意讓 central 宣告一個假的解壓長度。 */
  fakeUncompressed?: number;
  unixMode?: number;
}

/** ⭐ 手工組一份 ZIP（stored 或 deflate）。 */
function zip(
  specs: Spec[],
  opts: { trailing?: Buffer; zip64Locator?: boolean } = {},
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const s of specs) {
    const comp = deflateRawSync(s.data);
    const useDeflate = comp.length < s.data.length;
    const payload = useDeflate ? comp : s.data;
    const method = useDeflate ? 8 : 0;
    const nameBuf = Buffer.from(s.name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc32(s.data), 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(s.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const local = Buffer.concat([lh, nameBuf, payload]);
    locals.push(local);

    const cName = Buffer.from(s.centralName ?? s.name, "utf8");
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc32(s.data), 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(s.fakeUncompressed ?? s.data.length, 24);
    ch.writeUInt16LE(cName.length, 28);
    // ⚠️ `<< 16` 會溢位成負數（int32）—— ⭐ `>>> 0` 轉回無號。
    ch.writeUInt32LE((((s.unixMode ?? 0o100644) & 0xffff) << 16) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, cName]));
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const parts = [...locals, cd];
  if (opts.zip64Locator === true) {
    // ⭐ 一個**只有 locator 沒有真 ZIP64 EOCD** 的畸形檔 —— 正是要被拒的形狀。
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    parts.push(loc);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(specs.length, 8);
  eocd.writeUInt16LE(specs.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  parts.push(eocd);
  if (opts.trailing !== undefined) parts.push(opts.trailing);
  return Buffer.concat(parts);
}

const doc = (n: number) =>
  Buffer.from(JSON.stringify({ id: "a" + n, pad: "x".repeat(200) }), "utf8");

describe("zipReader —— central directory preflight", () => {
  it("★★ ⭐ 儀器：一份正常的 ZIP 讀得出來、解得開", () => {
    const z = zip([
      { name: "manifest.json", data: doc(0) },
      { name: "authoring/abilities/a1.json", data: doc(1) },
    ]);
    const cd = readCentralDirectory(z);
    expect(cd.entries.map((e) => e.path)).toEqual([
      "manifest.json",
      "authoring/abilities/a1.json",
    ]);
    expect(extractEntry(z, cd.entries[1]!).toString("utf8")).toBe(
      doc(1).toString("utf8"),
    );
  });

  it("★★ ⭐ EOCD **之後**多出位元組 ⇒ 拒（trailing data 走私）", () => {
    const z = zip([{ name: "manifest.json", data: doc(0) }], {
      trailing: Buffer.from("這幾個位元組不屬於任何 entry"),
    });
    expect(() => readCentralDirectory(z)).toThrow(ZipFormatError);
    try {
      readCentralDirectory(z);
    } catch (e) {
      expect((e as ZipFormatError).code).toBe("ZIP_TRAILING_DATA");
    }
  });

  it("★★ ⭐ 看到 ZIP64 EOCD locator ⇒ 拒（⛔ 而不是走一條沒人測過的路）", () => {
    const z = zip([{ name: "manifest.json", data: doc(0) }], {
      zip64Locator: true,
    });
    try {
      readCentralDirectory(z);
      throw new Error("⛔ ZIP64 被收下了");
    } catch (e) {
      expect((e as ZipFormatError).code).toBe("ZIP_ZIP64_UNSUPPORTED");
    }
  });

  it("★★ ⭐ central 與 local 的檔名不同 ⇒ 拒（兩份目錄說不同的話）", () => {
    const z = zip([
      {
        name: "authoring/abilities/ok.json",
        centralName: "manifest.json",
        data: doc(1),
      },
    ]);
    const cd = readCentralDirectory(z);
    expect(cd.entries[0]!.path).toBe("manifest.json");
    try {
      extractEntry(z, cd.entries[0]!);
      throw new Error("⛔ 兩份目錄不一致的 entry 被解開了");
    } catch (e) {
      expect((e as ZipFormatError).code).toBe("ZIP_NAME_MISMATCH");
    }
  });

  it("★★ ⭐⭐ central 宣告的解壓長度是**假的** ⇒ 拒", () => {
    // ⚠️ 這是 zip bomb 的核心手法：宣告一個小的 uncompressedSize 騙過壓縮比檢查，
    //   ⭐ 而真正解出來的是大的。⇒ 解完**必須**比對長度。
    const z = zip([
      { name: "manifest.json", data: doc(0), fakeUncompressed: 10 },
    ]);
    const cd = readCentralDirectory(z);
    expect(cd.entries[0]!.uncompressedSize, "儀器：central 真的宣告了 10").toBe(
      10,
    );
    try {
      extractEntry(z, cd.entries[0]!);
      throw new Error("⛔ 宣告值說謊而解出來被收下 ⇒ 壓縮比檢查等於沒跑");
    } catch (e) {
      expect((e as ZipFormatError).code).toBe("ZIP_SIZE_MISMATCH");
    }
  });

  it("★ ⭐ 不是 ZIP／截斷的檔 ⇒ 明說（⛔ 不是 RangeError 變成 500）", () => {
    expect(() => readCentralDirectory(Buffer.from("hello"))).toThrow(
      /不是 ZIP/,
    );
    expect(() => readCentralDirectory(Buffer.alloc(100))).toThrow(
      /End of Central Directory/,
    );
  });

  it("★ ⭐ symlink 的 unix mode 傳得出去（⛔ 否則 zipSafety 判不了）", () => {
    const z = zip([
      { name: "evil", data: Buffer.from("/etc/passwd"), unixMode: 0o120777 },
    ]);
    const cd = readCentralDirectory(z);
    // S_IFLNK = 0o120000
    expect((cd.entries[0]!.unixMode! & 0o170000) === 0o120000).toBe(true);
  });
});
