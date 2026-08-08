/**
 * `checkZipSafety` 的守衛（Lane 3 / G1）。驗的是**機制**：每一種 transport 攻擊
 * 都被擋下來，而且診斷**指名是哪一種** —— 只驗「回傳 false」的測試對「一律拒絕」
 * 的壞實作也會過，所以每一列都斷言 exact 診斷碼陣列。
 * ⛔ 不抄出貨數值：大小全部從 `ZIP_LIMITS` 推導。
 */
import { describe, expect, it } from 'vitest';
import {
  ZIP_LIMITS,
  ZIP_LIMIT_BOUNDS,
  checkZipSafety,
  resolveZipLimits,
  type ZipEntryMeta,
  type ZipSafetyCode,
} from './zipSafety';

const e = (path: string, extra: Partial<ZipEntryMeta> = {}): ZipEntryMeta => ({
  path,
  uncompressedSize: 2048,
  compressedSize: 512,
  ...extra,
});

const MANIFEST = e('manifest.json');
const GOOD = e('authoring/abilities/godie-a.json');
const BIG = ZIP_LIMITS.maxEntryUncompressedBytes;

const ATTACKS: ReadonlyArray<readonly [string, ZipEntryMeta[], ZipSafetyCode]> = [
  ['`..` 逃出目標目錄', [e('authoring/../../etc/passwd.json')], 'ZIP_SLIP'],
  ['絕對路徑', [e('/etc/passwd.json')], 'ZIP_ABSOLUTE_PATH'],
  ['Windows 磁碟機路徑', [e('C:\\secrets\\a.json')], 'ZIP_ABSOLUTE_PATH'],
  ['symlink 指向 ZIP 外', [e('authoring/abilities/l.json', { isSymlink: true })], 'ZIP_SYMLINK'],
  ['device 檔', [e('authoring/abilities/d.json', { unixMode: 0x2180 })], 'ZIP_DEVICE_ENTRY'],
  ['同一路徑出現兩次', [GOOD, { ...GOOD }], 'ZIP_DUPLICATE_ENTRY'],
  ['只差大小寫（macOS/Linux 解出不同結果）', [GOOD, e('AUTHORING/abilities/GODIE-A.json')], 'ZIP_CASE_COLLISION'],
  ['不在 §8 允許前綴內', [e('secrets/keys.json')], 'ZIP_PATH_NOT_ALLOWED'],
  ['允許前綴下的非 JSON', [e('authoring/abilities/blob.bin')], 'ZIP_PATH_NOT_ALLOWED'],
  ['夾帶 executable', [e('authoring/tools/run.sh')], 'ZIP_FORBIDDEN_ARTIFACT'],
  ['夾帶 secret', [e('reports/.env')], 'ZIP_FORBIDDEN_ARTIFACT'],
  ['檔名不是合法 UTF-8', [e('authoring/abilities/\ufffd.json')], 'ZIP_NON_UTF8_NAME'],
  [
    '壓縮比 zip bomb',
    [e('authoring/x.json', { uncompressedSize: ZIP_LIMITS.ratioCheckMinUncompressedBytes, compressedSize: 1 })],
    'ZIP_COMPRESSION_RATIO_EXCEEDED',
  ],
];

describe('checkZipSafety', () => {
  it('乾淨的 package 通過（純檢查，不碰磁碟）', () => {
    const res = checkZipSafety([MANIFEST, GOOD, e('compiled/abilities/godie-a.json')]);
    expect(res.diagnostics).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it.each(ATTACKS)('拒絕並指名：%s', (_label, entries, code) => {
    const res = checkZipSafety([MANIFEST, ...entries]);
    expect(res.ok).toBe(false);
    expect(res.diagnostics.map((d) => d.code)).toEqual([code]);
  });

  it('單檔爆量：路徑合法時報的是大小，不是別的', () => {
    const fat = e('authoring/abilities/big.json', { uncompressedSize: BIG + 1, compressedSize: BIG });
    expect(checkZipSafety([MANIFEST, fat]).diagnostics.map((d) => d.code)).toEqual(['ZIP_ENTRY_TOO_LARGE']);
  });

  it('缺 manifest.json 也要說出來', () => {
    expect(checkZipSafety([GOOD]).diagnostics.map((d) => d.code)).toEqual(['ZIP_MANIFEST_MISSING']);
  });

  it('override 被夾在 bounds 內 —— 拆掉守衛的上限不是合法設定', () => {
    const wide = resolveZipLimits({ maxTotalUncompressedBytes: 1e15, maxEntryCount: -5 });
    expect(wide.maxTotalUncompressedBytes).toBe(ZIP_LIMIT_BOUNDS.maxTotalUncompressedBytes.max);
    expect(wide.maxEntryCount).toBe(ZIP_LIMIT_BOUNDS.maxEntryCount.min);
  });
});
