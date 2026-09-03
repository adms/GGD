/**
 * ⭐⭐ **契約對帳要兩頭都走**（GH#954）。
 *
 * ⛔⛔ 票文逐字：「⭐ **而它必須兩頭都走**」——
 * ⭐ 而那正是 CLAUDE.md 記過的失敗形態⑫：
 * > 「只驗名詞不驗關係的**反方向**⋯它的迴圈是 `for (const [f, owners] of claimants)`
 * >  ——**沒有人宣告的檔永遠不會進 `claimants`** ⇒ ⛔ **結構上失明**」
 * ⇒ ⭐ 從「契約」走 ⇒ 一定漏掉「編輯器自己猜的欄位」；
 *   從「編輯器」走 ⇒ 一定漏掉「契約有而沒暴露的」。**兩頭都要走。**
 *
 * ⭐ 量到的分母（2026-09-03，⛔ 不是估計）：
 * · `required` **5,145**（票文寫 5,137 —— ⭐ 這一輪新增的 config 欄位讓它長了）
 * · `notRequired` **15** ⇒ ⛔ 引擎今天做不到：**編輯器做出控制項就是紅**
 * · `ownerOnly` **39** ⇒ ⭐ 可唯讀顯示，⛔ 做成可調控制項就是紅
 * · capabilities：**supported 16 · ⭐ partial 30 · unsupported 15**
 *   ⇒ ⭐⭐ **半數能力是「一半能用」** —— ⛔ 編輯器最容易在這裡騙人：
 *     控制項有、拖得動、存得下去，而引擎只做了一半。
 *
 * ⚠️⚠️ ⭐ **這一支驗的是 Main 交出去的那一半**（契約本身是否自洽且說得出真話）——
 * ⛔ 「編輯器有沒有暴露」那一半 Main 這裡看不到（那是 editor-scope）。
 * ⇒ ⭐ 而**兩個指紋**就是接縫：編輯器要說得出它建置時對的是哪一版。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 把一格 `ownerOnly` 從契約拿掉 → 🔴 ③「owner 專屬欄位少了一格」
 * M2 把一個 `partial` 的 `caveat` 清空 → 🔴 ④「說了 partial 卻沒說哪一半不能用」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const COV = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-editor-coverage.json"), "utf8"),
) as {
  required: { group: string; name: string }[];
  notRequired: { name: string; why?: string }[];
  ownerOnly: { name: string; owner?: string; why?: string }[];
  fingerprint: string;
  capabilityFingerprint: string;
};
const CAPS = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-runtime-capabilities.json"), "utf8"),
) as { fingerprint: string; planned: { key: string; state: string; caveat?: string }[] };

describe("契約對帳的雙向閘（GH#954）", () => {
  it("★★ ⭐ **正向**：契約說得出每一格是哪一類（⛔ 沒有一格是無主的）", () => {
    expect(COV.required.length, "⛔ `required` 是空的 ⇒ 掃描器瞎了").toBeGreaterThan(4000);
    const nameless = COV.required.filter((r) => !r.name || !r.group);
    expect(nameless, "⛔ 有欄位沒有 group 或 name ⇒ 編輯器渲染不出它").toEqual([]);
  });

  it("★★ ⭐⭐ **反向**：三類**互斥**（⛔ 一格同時是 required 又是 ownerOnly = 契約自相矛盾）", () => {
    const req = new Set(COV.required.map((r) => r.name));
    const clash = [
      ...COV.ownerOnly.filter((o) => req.has(o.name)).map((o) => `ownerOnly: ${o.name}`),
      ...COV.notRequired.filter((n) => req.has(n.name)).map((n) => `notRequired: ${n.name}`),
    ];
    expect(
      clash.slice(0, 5),
      "⛔⛔ 一格同時被標成「要暴露」與「不可以做成控制項」⇒\n" +
        "  ⭐ 編輯器照哪一邊做都會被說成錯的。",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ `notRequired` **15** / `ownerOnly` **39** —— 每一格都要有**能被反駁的理由**", () => {
    expect(COV.notRequired.length, "⛔ `notRequired` 的格數變了 —— 回來看是誰加的").toBe(15);
    expect(COV.ownerOnly.length, "⛔ `ownerOnly` 的格數變了").toBe(39);
    const naked = [
      ...COV.notRequired.filter((n) => (n.why ?? "").length < 10).map((n) => n.name),
      ...COV.ownerOnly.filter((o) => (o.why ?? "").length < 5).map((o) => o.name),
    ];
    expect(
      naked.slice(0, 5),
      "⛔⛔ 一格「⛔ 不要做成控制項」而**沒有說為什麼** ⇒\n" +
        "  ⭐ 對面看到的是一句沒有出處的禁令，⛔ 而它會被當成疏漏繞過去。",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ **`partial` 30 每一個都要說出哪一半不能用**（⛔ 這是最容易騙人的一類）", () => {
    const byState = new Map<string, number>();
    for (const p of CAPS.planned) byState.set(p.state, (byState.get(p.state) ?? 0) + 1);
    expect(byState.get("partial"), "⛔ partial 的數量變了 —— 回來看是誰改的").toBe(30);
    expect(byState.get("supported")).toBe(16);
    expect(byState.get("unsupported")).toBe(15);
    const silent = CAPS.planned.filter((p) => p.state === "partial" && (p.caveat ?? "").length < 20);
    expect(
      silent.map((p) => p.key).slice(0, 5),
      "⛔⛔ 宣告 `partial` 卻**沒說哪一半不能用** ⇒\n" +
        "  ⭐ 編輯器會做出一個「控制項有、拖得動、存得下去」的東西，\n" +
        "  ⛔ 而引擎只做了一半 —— 玩家拿到的是一個上線就是死的內容。",
    ).toEqual([]);
  });

  it("★★ ⭐ **兩個指紋都在**（⛔ 少了指紋，編輯器說不出它對的是哪一版）", () => {
    for (const [k, v] of [
      ["coverage.fingerprint", COV.fingerprint],
      ["coverage.capabilityFingerprint", COV.capabilityFingerprint],
      ["capabilities.fingerprint", CAPS.fingerprint],
    ] as const)
      expect(
        /^[0-9a-f]{8,}$/u.test(v ?? ""),
        `⛔ ${k} 不是一個合法指紋 ⇒ 對面無法判斷自己是不是對著舊契約建置的`,
      ).toBe(true);
    // ⭐ 兩份文件對能力指紋的說法必須一致（⛔ 否則它們各自對著不同版本）。
    expect(
      COV.capabilityFingerprint,
      "⛔⛔ 涵蓋清單與能力清單的指紋**對不上** ⇒ 兩份契約各自對著不同版本的引擎",
    ).toBe(CAPS.fingerprint);
  });
});
