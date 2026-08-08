/**
 * 守「editor 與 game importer 對同一個 package 算出同一個 digest」（規格 §13）。
 * ⛔ 刻意不驗任何 hash 字面值 —— 那是演算法的後果，不是內容；抄一份進來只會過期。
 */
import { describe, expect, it } from "vitest";
import { packageDigest } from "./digest";
import { canonicalizeJcs, contentSha256 } from "./jcs";

// RFC 8785 §3.2.3 官方排序示例。一次示範兩件事：
//   · key 依 UTF-16 code unit 排序 → 😂(U+1F602，首碼 0xD83D) 排在 דּ(U+FB33) **之前**；
//     若照 Unicode code point 排，答案相反 —— 這就是本向量存在的理由。
//   · escape 最小化 → U+0080 與 U+007F 原樣輸出，只有 \n \r 這類才轉義。
const RFC_INPUT = {
  "€": "Euro Sign",
  "\r": "Carriage Return",
  "\u000a": "Newline",
  "1": "One",
  "\u0080": "Control\u007f",
  "😂": "Smiley",
  "ö": "Latin Small Letter O With Diaeresis",
  "דּ": "Hebrew Letter Dalet With Dagesh",
  "</script>": "Browser Challenge",
};
const RFC_EXPECTED =
  '{"\\n":"Newline","\\r":"Carriage Return","1":"One","</script>":"Browser Challenge",' +
  '"\u0080":"Control\u007f","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign",' +
  '"😂":"Smiley","דּ":"Hebrew Letter Dalet With Dagesh"}';

describe("RFC 8785 JCS", () => {
  it("官方向量：UTF-16 code unit 排序 + escape 最小化", () => {
    expect(canonicalizeJcs(RFC_INPUT)).toBe(RFC_EXPECTED);
  });

  it("key 順序不改變 contentSha256 —— 整個握手就靠這一條", () => {
    expect(contentSha256({ z: 1, a: { n: 2, m: 3 } })).toBe(contentSha256({ a: { m: 3, n: 2 }, z: 1 }));
    expect(contentSha256({ z: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("60.0 與 60 是同一份文件（§9.1：不得因此誤報 drift）", () => {
    expect(canonicalizeJcs(JSON.parse('{"a":60.0}'))).toBe('{"a":60}');
    expect(contentSha256(JSON.parse('{"a":60.0}'))).toBe(contentSha256(JSON.parse('{"a":60}')));
  });

  it("陣列順序是語意，不排序", () => {
    expect(contentSha256({ a: [1, [2, 3]] })).not.toBe(contentSha256({ a: [[2, 3], 1] }));
  });

  it("拒絕 NaN／Infinity／undefined，不靜默替換", () => {
    expect(() => canonicalizeJcs({ a: NaN })).toThrow(/finite/);
    expect(() => canonicalizeJcs({ a: Number.POSITIVE_INFINITY })).toThrow(/finite/);
    expect(() => canonicalizeJcs({ a: undefined })).toThrow(/undefined/);
  });
});

describe("packageDigest（規格 §10）", () => {
  const entryA = { path: "authoring/a.json", role: "authoring", contentSha256: "sha256:aa" };
  const entryB = { path: "authoring/b.json", role: "authoring", contentSha256: "sha256:bb" };
  const asJson = { schema: "ggd-editor-package@1", mode: "full", entries: [entryA, entryB] };
  const asZip = {
    packageDigest: "sha256:上一輪算出來的值",
    mode: "full",
    entries: [entryB, entryA], // ZIP 的容器順序不同 —— 步驟②要把它抹平
    schema: "ggd-editor-package@1",
    transport: { format: "zip", entries: [{ path: "authoring/a.json", rawSha256: "sha256:zz" }] },
  };

  it("JSON 與 ZIP 相同：忽略 transport／packageDigest 自身，entries 依 path 排序", () => {
    expect(packageDigest(asJson)).toBe(packageDigest(asZip));
  });

  it("semantic 內容真的變了就要變 —— 不是恆定值", () => {
    const moved = { ...asJson, entries: [entryA, { ...entryB, path: "authoring/c.json" }] };
    expect(packageDigest(moved)).not.toBe(packageDigest(asJson));
  });
});
