/**
 * ⭐⭐ **驗收清單的八招 —— 一個住處**（GH#953）。
 *
 * ⛔⛔ 票文量到的：同一件事今天有**四個數字** ——
 * owner 05:06 說「三招」· 05:17 說「**八個**」· #838 body 引的原話說「六個全動畫特效」·
 * `docs/_execution-batches.md:1951,2056` 說「三招」。
 * ⇒ ⭐ 那正是第〇·四守則：**同一個事實有四個住處，而它們一定會漂**。
 *
 * ⭐ owner 2026-09-02 定案 **八招** ⇒ 本輪把它收斂成
 * `docs/editor-contract/ggd-acceptance-eight.json`（⭐ 機器讀的唯一住處）。
 *
 * ⚠️⚠️ ⭐ **票文的 Scope 第 1 條要求寫進「#838 的 body」** ——
 * ⛔ 而本輪的指示逐字是「**⛔ 不碰 #838**」。
 * ⇒ ⭐ 折衷：**機器讀的那一份**落在 repo 裡（⛔ 它才是閘讀得到的），
 * ⭐ 而人讀的那一份（#838 body）留給 owner 貼 —— ⛔ 一個字都沒有動那張票。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 八招裡拿掉一項 → 🔴 ①「八招變成 7 招」
 * M2 規則 B 的 `godie-e00r.q` 改成別的 id → 🔴 ③「必測案例指向一支不存在的技能」
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const EIGHT = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-acceptance-eight.json"), "utf8"),
) as {
  eight: { n: number; name: string; ids: string[]; why?: string }[];
  commonRules: { id: string; rule: string; why: string }[];
};

describe("驗收八招的唯一住處（GH#953）", () => {
  it("★★ ⭐ **八招就是八招**（⛔ 三／六／八漂了四個住處，這一格是定案的那個）", () => {
    expect(
      EIGHT.eight.length,
      "⛔⛔ 八招變成別的數字 —— ⭐ owner 2026-09-02 定案的是**八**，\n" +
        "  ⚠️ 而在此之前同一件事有四個數字（三 / 六 / 八 / 三）。",
    ).toBe(8);
    expect(new Set(EIGHT.eight.map((e) => e.n)).size, "⛔ 編號重複").toBe(8);
  });

  it("★★ ⭐⭐ **每一個 id 都指得到一份真的技能**（⛔ 指不到 = 驗收驗了空氣）", () => {
    const dangling: string[] = [];
    for (const e of EIGHT.eight)
      for (const id of e.ids)
        if (!existsSync(join(ROOT, "content/abilities", `${id}.json`))) dangling.push(`${e.name}: ${id}`);
    expect(dangling, "⛔⛔ 驗收清單指向不存在的技能 ⇒ 那一項永遠驗不到東西").toEqual([]);
  });

  it("★★ ⭐⭐ **規則 B 的兩個必測案例仍然成立**（⭐ 有已知答案才校準得了量尺）", () => {
    const read = (id: string): Record<string, unknown> =>
      JSON.parse(readFileSync(join(ROOT, "content/abilities", `${id}.json`), "utf8")) as Record<
        string,
        unknown
      >;
    // ⭐ 票文逐字：`nbbc.r` 極大·範圍 ⇒ 解析 120s，⛔ 而**陣列寫 60**（那就是它值得測的理由）
    const a = read("godie-nbbc.r");
    expect(a["cooldownTier"], "⛔ `godie-nbbc.r` 不再是「極大」⇒ 已知答案變了").toBe("極大");
    expect(
      (a["cooldown"] as number[])[0],
      "⛔ 陣列值變了 ⇒ ⭐ 這個案例的價值就是「陣列說 60 而級距解析成 120」",
    ).toBe(60);
    // ⭐ `e00r.q` 極小·範圍 ⇒ 30s，⛔ 而陣列寫 6
    const b = read("godie-e00r.q");
    expect(b["cooldownTier"], "⛔ `godie-e00r.q` 不再是「極小」").toBe("極小");
    expect((b["cooldown"] as number[])[0], "⛔ 陣列值變了").toBe(6);
  });

  it("★★ ⭐ 三條共同規則**都在，而且各自說得出為什麼**", () => {
    expect(EIGHT.commonRules.map((r) => r.id).sort(), "⛔ 少了共同規則").toEqual(["A", "B", "C"]);
    const naked = EIGHT.commonRules.filter((r) => (r.why ?? "").length < 10).map((r) => r.id);
    expect(
      naked,
      "⛔ 一條規則沒有說為什麼 ⇒ ⭐ 下一輪讀到時它就是一句可以繞過去的散文",
    ).toEqual([]);
  });
});
