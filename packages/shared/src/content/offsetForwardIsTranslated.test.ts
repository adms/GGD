/**
 * ⭐⭐ **槍口偏移的每一個值都要是「從 wc3 換算出來的」**（GH#880）。
 *
 * ⛔⛔ 票文說「`offsetForwardU` 沒有家族層住處（實質預設是 `?? 0`）」。
 * ⭐ 而 2026-09-02 量下去，事實比那句話更明確也更窄：
 *
 * | | |
 * |---|---:|
 * | 出貨 `spawnModelFx` 節點 | **142** |
 * | 其中帶 `offsetForwardU` | **24** |
 * | ⭐ **相異值** | **1**（全部是 `2.75`） |
 *
 * ⇒ ⭐ **家族層預設的收益是零**：118 個節點刻意沒有它，
 * 把預設從 0 改成 2.75 會讓那 118 個**全部偏移**（⛔ 行為改變），
 * 而剩下的 24 個本來就已經寫著同一個值。
 *
 * ⇒ ⭐⭐ **真正的風險是另一件事**：那個 `2.75` 是 `toLen(150)`
 * （`150` wc3 單位 × `GGD_PER_WC3` = 11/600）——
 * ⛔ 而它在 JSON 裡只是一個裸數字。下一個人手打 `2.7` 或 `3`，
 * 畫面上看不出差別，而它已經**不是翻譯**了（第〇·六守則：翻譯 ≠ 近似）。
 *
 * ⚠️ 同一個常數也出現在 08-03 的 `spacing`：JASS 是
 * `PolarProjectionBJ(caster, 150×i, facing)`（j:28838）⇒ 一樣是 `toLen(150)`。
 * ⭐ 而出貨值曾經是 **1.2**（不到一半）—— 那排飛彈擠成一團而不是一條線。
 * ⇒ 2026-09-02 修成 2.75。**這條守衛就是為了不讓它再漂回去。**
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GGD_PER_WC3, round2 } from "./templates/expand";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIRS = ["content/abilities", "content/champions"];

/** ⭐ 一個值換算得回**整數** wc3 單位嗎（容許 `round2` 的捨入）。 */
function wc3Units(v: number): number | null {
  const raw = v / GGD_PER_WC3;
  const n = Math.round(raw);
  return round2(n * GGD_PER_WC3) === round2(v) ? n : null;
}

function collect(field: string): { file: string; value: number }[] {
  const out: { file: string; value: number }[] = [];
  for (const dir of DIRS) {
    for (const f of readdirSync(join(ROOT, dir))) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const raw = readFileSync(join(ROOT, dir, f), "utf8");
      for (const m of raw.matchAll(new RegExp(`"${field}":\\s*(-?[\\d.]+)`, "g")))
        out.push({ file: `${dir}/${f}`, value: Number(m[1]) });
    }
  }
  return out;
}

describe("槍口偏移／沿線間距是翻譯出來的（GH#880）", () => {
  const offsets = collect("offsetForwardU");

  it("⭐ 量尺先自證：真的掃到節點了", () => {
    expect(offsets.length, "⛔ 一個都沒掃到 ⇒ 欄位改名了，這條在量空氣").toBeGreaterThan(10);
  });

  it("★★ ⭐ 每一個 `offsetForwardU` 都換算得回**整數** wc3 單位", () => {
    const bad = offsets
      .filter((o) => o.value !== 0 && wc3Units(o.value) === null)
      .map((o) => `${o.file}: ${o.value}（÷${GGD_PER_WC3} = ${(o.value / GGD_PER_WC3).toFixed(2)}）`);
    expect(
      [...new Set(bad)],
      "⛔ 這幾個值**不是從 wc3 換算來的** —— 它是一個手打的近似值。" +
        "\n⭐ 第〇·六守則：翻譯 ≠ 近似。去 JASS 找那個 `PolarProjectionBJ` 的距離，" +
        "\n  用 `toLen(<wc3 距離>)` 算出來，⛔ 不要挑一個看起來差不多的數字。",
    ).toEqual([]);
  });

  it("⭐⭐ 08-03 沿線飛彈的 `spacing` 是 `toLen(150)`（⛔ 不是曾經那個 1.2）", () => {
    // ⚠️ JASS：`PolarProjectionBJ(caster, 150×i, facing)` i=1..10（j:28838）
    const want = round2(150 * GGD_PER_WC3); // 2.75
    for (const id of ["godie-n01c.e", "godie-nbbc.e"]) {
      const doc = JSON.parse(
        readFileSync(join(ROOT, `content/abilities/${id}.json`), "utf8"),
      ) as { effects?: { kind?: string; spacing?: number; count?: number }[] };
      const line = (doc.effects ?? []).find((e) => e.kind === "spawnModelFx");
      expect(line, `⛔ ${id} 沒有 spawnModelFx 節點了`).toBeTruthy();
      expect(
        line!.spacing,
        `⛔ ${id} 的間距不是 toLen(150)=${want} —— 那排飛彈會擠成一團而不是一條線`,
      ).toBe(want);
      expect(line!.count, "⛔ 原作是沿線 10 具（i=1..10）").toBe(10);
    }
  });

  it("⭐ 相異值很少時**記下來** —— ⛔ 一旦長出第二個值，家族層住處才有意義", () => {
    const distinct = [...new Set(offsets.map((o) => o.value))];
    expect(
      distinct.length,
      `⭐ 出貨相異值變成 ${distinct.length} 個（${distinct.join(" / ")}）。` +
        "\n⚠️ 這條**不是**禁止長出第二個值 —— 它是提醒：" +
        "\n  相異值一多，「一格家族層預設」就從零收益變成有意義的東西（GH#880 的原問題）。" +
        "\n⇒ 真的多了就把這個上限調上去，並回頭評估那一格。",
    ).toBeLessThanOrEqual(3);
  });
});
