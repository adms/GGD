/**
 * ⭐ `docs/素材庫與-S3-統一資源庫.md` 的**第二部分(十～十八節)**是 owner 交接文件的落地,
 * ⭐ 而其中**十三／十四節在寫下來的同一天就被 owner 推翻了**。
 *
 * WHY THIS EXISTS —— GH#1128 的 AC② 逐字要求「每節標『規格,尚未上線』**直到對應票關閉**」,
 * ⛔ 而那是一個**判準**:它要靠某個人在關 #1124／#1125 的那一刻想起來回頭改文件。
 *
 * ⚠️⚠️ ⭐ **而它在寫下來的當下就抓到一次**:十三／十四節是照 owner 的**交接文件**寫的
 * (簽署網址 → 瀏覽器直連 S3),⛔ 而**同一天 07:14** 他逐字推翻了那條路
 * (「CF 直接接原站 ggd.adms.ai 就好了…S3 變成純備份」,見該文件第八·四節)。
 * ⇒ ⭐ 那兩節今天標的是**「已被第八·四節作廢」**,⛔ 不是「尚未上線」——
 *   ⭐ 兩者差很多:前者說「⛔ 不該做」,後者說「還沒做」,⛔ 而下一輪讀到會做出相反的事。
 * ⭐ CLAUDE.md 已經記錄**五次**判準失效,而這一份正是「大家先讀的那一份文件」——
 * 2026-08-31 部署到回滾機那次的根因逐字是「這份文件比世界舊了三天,而沒有任何東西會紅」。
 *
 * ⇒ ⭐ 這條閘把那句散文換成**一個會變的量測**:文件說「今天玩家端還拿不到」,
 *   而閘每次都去**重新量**那兩條路在不在。兩個方向都會紅:
 *
 *   | 現實 | 文件 | 判定 |
 *   |---|---|---|
 *   | 路由／快取層 **0** | 標「已作廢」 | ✅ 綠 |
 *   | 路由／快取層 **> 0** | 還標「已作廢」 | ⛔ **紅** —— 要嘛在重做被推翻的設計,要嘛架構翻回去而文件沒跟上 |
 *   | 路由／快取層 **0** | 把標記拿掉了 | ⛔ **紅** —— 宣稱了一個沒發生的上線 |
 *
 * ⚠️ ⭐ 它**刻意不驗數字**(第二守則:驗機制不驗數字)——
 * ⛔ 不斷言「presign 路由是 0 條」,只斷言「**文件的宣稱與量到的現實同向**」。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const DOC = join(ROOT, "docs/素材庫與-S3-統一資源庫.md");

/** 遞迴掃一棵樹,回傳符合副檔名且內容 match 的檔案路徑。 */
function grepTree(dir: string, exts: readonly string[], re: RegExp): string[] {
  const hits: string[] = [];
  const walk = (d: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (name.includes(".test.")) continue;
      if (!exts.some((e) => name.endsWith(e))) continue;
      let body: string;
      try {
        body = readFileSync(p, "utf-8");
      } catch {
        continue;
      }
      if (re.test(body)) hits.push(p.slice(ROOT.length + 1));
    }
  };
  walk(dir);
  return hits;
}

/** ⭐ 玩家端持久快取層(#1125 的第 2 層)——`caches.open` 是它唯一的入口。 */
const cacheStorageSites = (): string[] =>
  grepTree(join(ROOT, "apps/client/src"), [".ts", ".tsx"], /\bcaches\s*\.\s*open\s*\(/);

/** ⭐ 後端簽署網址路由(#1124)——⛔ 只認真的**產生簽章**,不認 config 名字。 */
const presignSites = (): string[] =>
  grepTree(join(ROOT, "apps/platform"), [".go"], /PresignGetObject|NewPresignClient|\bPresign\w*\(/);

describe("素材庫與-S3-統一資源庫.md 的第二部分沒有活過保存期限", () => {
  const md = readFileSync(DOC, "utf-8");

  it("⭐ 十～十八節存在,而且〇～九節的標題一個都沒有被改掉", () => {
    for (const h of ["## 十、", "## 十一、", "## 十二、", "## 十三、", "## 十四、", "## 十五、", "## 十六、", "## 十七、", "## 十八、"]) {
      expect(md, `缺 ${h}`).toContain(h);
    }
    // ⭐ 反方向:第一部分的錨點還在(⛔ 補完不可以改寫既有章節)
    for (const h of ["## 〇、", "## 一、", "## 九、換機時"]) {
      expect(md, `⛔ 第一部分的 ${h} 不見了 —— 補完是**追加**,不是改寫`).toContain(h);
    }
  });

  it("⭐ 玩家端持久快取:文件的宣稱與量到的現實同向", () => {
    const sites = cacheStorageSites();
    const claimsNotLive = md.includes("十四、玩家本機快取（⭐ 第 1／2 層**已成立**，⛔ 第 3 層被第八·四節作廢）");
    if (sites.length === 0) {
      expect(
        claimsNotLive,
        "⛔ 量到 0 個 `caches.open`,而第十四節已經不標『第 3 層作廢』—— ⭐ 第 2 層做在 HTTP 快取層(邊緣 immutable ＋ `?h=` 內容雜湊),⛔ 不是 JS。改標記之前先確認架構真的翻回去了。",
      ).toBe(true);
    } else {
      expect(
        claimsNotLive,
        `⛔ 第十四節還標著『第 3 層作廢』,而 Cache Storage 已經接上了:\n  ${sites.join("\n  ")}\n` +
          "⇒ 要嘛這是在重做一個**已被第八·四節推翻**的設計(停手),要嘛架構翻回去了 ⇒ 去更新那一節(GH#1125)。",
      ).toBe(false);
    }
  });

  it("⭐ 後端簽署網址:文件的宣稱與量到的現實同向", () => {
    const sites = presignSites();
    const claimsNotLive = md.includes("十三、網站 S3 下載整合（⛔⛔ **已被第八·四節作廢**");
    if (sites.length === 0) {
      expect(
        claimsNotLive,
        "⛔ 量到 0 條 presign 路由,而第十三節已經不標『已作廢』—— ⭐ owner 2026-09-09 07:14 逐字推翻了簽署網址那條路(CF 接原站,S3 純備份)。改標記之前先確認他又改回去了。",
      ).toBe(true);
    } else {
      expect(
        claimsNotLive,
        `⛔ 第十三節還標著『已作廢』,而後端已經會簽名了:\n  ${sites.join("\n  ")}\n` +
          "⇒ ⚠️ 第八·四節逐字說這個架構**不需要**簽署網址 API ⇒ 先確認這不是在重做被推翻的東西(GH#1124)。",
      ).toBe(false);
    }
  });

  it("⭐ 量尺自證:兩把 grep 都抓得到一個已知存在的字串(⛔ 單邊校準的尺會在最需要時沉默)", () => {
    // ⭐ 已知**有**:client 底下一定有 `export function`;platform 底下一定有 `func `
    expect(grepTree(join(ROOT, "apps/client/src"), [".ts"], /export function/).length).toBeGreaterThan(0);
    expect(grepTree(join(ROOT, "apps/platform"), [".go"], /func /).length).toBeGreaterThan(0);
    // ⭐ 已知**沒有**:一個不可能出現的字串必須量到 0
    expect(grepTree(join(ROOT, "apps/platform"), [".go"], /zzzNotAThingzzz/).length).toBe(0);
  });
});
