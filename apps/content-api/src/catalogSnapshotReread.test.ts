import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { CATALOG_SNAPSHOT_REREAD_ENV, catalogFileReads, catalogRereadMode, readHeroCatalog } from "./catalogVersions";

/**
 * ⭐ GH#1178：保存期間的防競態從「整份重讀＋重算 sha256」換成「比讀取當下的 stat 指紋」。
 * ⚠️ 兩個方向都要驗（⛔ 只驗一邊的尺會在它最該說話的時候沉默）：
 *   ① 省的是**第二輪** —— stat 只讀一輪、bytes 讀兩輪，而**存下來的位元組完全相同**
 *   ② 「救得回來」⛔ 沒有變弱 —— 保存期間被改，**兩種模式都要丟錯**
 */
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const content = mkdtempSync(join(tmpdir(), "ggd-reread-")); roots.push(content);
  const write = (path: string, data: string | Uint8Array) => { mkdirSync(dirname(join(content, path)), { recursive: true }); writeFileSync(join(content, path), data); };
  write("champions/reread-hero.json", '{"id":"reread-hero","name":"原名","modelKey":"body"}\n');
  write("abilities/reread-hero.q.json", '{"id":"reread-hero.q","name":"Q"}\n');
  // 一份**在場**的素材（走 read()）＋ 一份**缺席**的素材（走 readArchivedAsset ⇒ 當成保存期間的 hook）
  const body = new Uint8Array([1, 2, 3, 4]);
  write("models/body.json", JSON.stringify({ id: "body", glbPath: "assets/body.glb", texture: "assets/absent.png" }));
  write("assets/body.glb", body);
  write("manifest.json", "{}");
  write("assets-manifest.json", JSON.stringify({ entries: [{ path: "assets/body.glb", bytes: body.length, sha256: sha256Bytes(body) }] }));
  return { content, write };
}

it("① 省下來的是第二輪：stat 讀一輪、bytes 讀兩輪，而存下來的位元組完全相同", () => {
  const f = fixture();
  const before = catalogFileReads();
  const stat = readHeroCatalog(f.content, { gameRevision: "t", allowIncomplete: true, rereadMode: "stat" });
  const statReads = catalogFileReads() - before;
  const bytes = readHeroCatalog(f.content, { gameRevision: "t", allowIncomplete: true, rereadMode: "bytes" });
  const bytesReads = catalogFileReads() - before - statReads;

  expect(statReads).toBeGreaterThan(0);
  // ⭐ 承重：bytes 模式把每一份檔**再讀一次** ⇒ 正好兩倍。把第二輪拿掉,這一條就紅。
  expect(bytesReads).toBe(statReads * 2);
  // ⭐ 反方向：省的⛔不是內容 —— 兩種模式的快照逐位元組相同。
  expect(stat.versionId).toBe(bytes.versionId);
  expect([...stat.files].map(([p, d]) => [p, Buffer.from(d).toString("hex")]))
    .toEqual([...bytes.files].map(([p, d]) => [p, Buffer.from(d).toString("hex")]));
});

it("② 救得回來⛔沒有變弱：保存期間內容被改，兩種模式都丟錯而且指名那個檔", () => {
  for (const rereadMode of ["stat", "bytes"] as const) {
    // ⭐ 校準（⛔ 不是只驗「有」那一邊）：同一條路、同一個 hook，**沒有改東西**時必須成功 ——
    //   否則下面那個 toThrow 可能是別的原因造成的,這條守衛就是空的。
    const clean = fixture();
    expect(() => readHeroCatalog(clean.content, { gameRevision: "t", allowIncomplete: true, rereadMode, readArchivedAsset: () => new Uint8Array([9, 9]) }),
      `${rereadMode} 模式在沒有任何改動時就丟錯 ⇒ 下面那條 toThrow 不能當證據`).not.toThrow();

    const f = fixture();
    // 素材迴圈跑在所有文件讀完**之後** ⇒ 在這裡改一份已經讀過的文件,就是一次真的競態。
    const readArchivedAsset = () => {
      f.write("champions/reread-hero.json", '{"id":"reread-hero","name":"保存期間被改","modelKey":"body"}\n');
      return new Uint8Array([9, 9]);
    };
    expect(() => readHeroCatalog(f.content, { gameRevision: "t", allowIncomplete: true, rereadMode, readArchivedAsset }),
      `${rereadMode} 模式沒有擋下保存期間的改動`).toThrow(/保存期間內容已更新.*champions\/reread-hero\.json/s);
  }
});

it("③ 環境變數打錯字⛔不靜默退回預設", () => {
  expect(catalogRereadMode({})).toBe("stat");
  expect(catalogRereadMode({ [CATALOG_SNAPSHOT_REREAD_ENV]: "bytes" })).toBe("bytes");
  expect(() => catalogRereadMode({ [CATALOG_SNAPSHOT_REREAD_ENV]: "stats" })).toThrow(CATALOG_SNAPSHOT_REREAD_ENV);
});
