/**
 * ⭐⭐ **公式值與手填值的偏離只准收斂**（GH#945）。
 *
 * 票文逐字要的：「逐支套用 AP 係數公式（148 節點）—— 含 **14 支的 before/after**
 * 與**不合理之處**逐條理由」。
 *
 * ⛔⛔ 而動手前量到一件票文沒寫的事：`resolveApCoeff()` 是一支
 * **零 production 消費端**的函式 —— 公式做好了（GH#942）、BASE 校準過、後台頁也有，
 * ⭐ 而**沒有任何一行**在載入時呼叫它。
 * ⚠️ admin 那一頁的 `consumer` 欄位卻逐字寫著「← `registries.ts` 在技能註冊時⋯」
 * ⇒ ⭐ **那句話是假的**（第三守則）。
 *
 * ⭐⭐ **而報告一產出就說明了為什麼不能直接接上**：
 *
 * | 技能 | 手填 | 公式 | 倍率 |
 * |---|---:|---:|---:|
 * | 15-02 疾風迅雷 | 0.1 | 2.27 | ⭐ **22.75×** |
 * | 14-00 召喚式神 | 0.6 | 0.03 | ⭐ **0.05×** |
 *
 * ⇒ ⭐ 那種量級的偏離**多半是級距標籤判錯**（形狀被 `radius` 誤判成範圍…），
 * ⛔ 而不是「手填值沒有道理」—— 兩者長得一模一樣，而報告就是要人分辨它們。
 * ⇒ ⭐ 這一支把「還有幾個節點偏離超過一個數量級」變成**會紅的數字**：
 * ⛔ 變多 ⇒ 有人加了一支標籤錯的技能；⭐ 變少 ⇒ 把上限調下來。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveApCoeff,
  apCoeffInputsFrom,
  DEFAULT_AP_COEFFICIENT,
} from "./apCoefficient";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ABIL = join(ROOT, "content/abilities");

/**
 * ⭐ 棘輪：今天**量到**的「偏離 ≥ 5×（或 ≤ 0.2×）」節點數 —— ⛔ 只准往下走。
 * ⚠️ 21 是量出來的現況,⛔ 不是目標 —— 報告的前 14 列只是**最壞的那幾支**。
 */
const OUTLIER_CEIL = 21;

function deviations(): { id: string; ratio: number }[] {
  const cdTiers = JSON.parse(
    readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8"),
  ) as { seconds: Record<string, Record<string, number>> };
  const out: { id: string; ratio: number }[] = [];
  for (const f of readdirSync(ABIL)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
    const nodes: Record<string, unknown>[] = [];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      const n = o as Record<string, unknown>;
      if (Array.isArray(n["ratios"]) && (n["ratios"] as unknown[]).length > 0) nodes.push(n);
      for (const v of Object.values(n)) walk(v);
    };
    walk(d["effects"]);
    for (const n of nodes) {
      const isArea = n["kind"] === "damageArea" || n["radius"] !== undefined;
      const shape = isArea ? "範圍" : JSON.stringify(d).includes("championForm") ? "變身" : "單體";
      const mid = cdTiers.seconds[shape]?.["中"] ?? 30;
      const tier = d["cooldownTier"];
      const cd =
        typeof tier === "string" && cdTiers.seconds[shape]?.[tier] !== undefined
          ? cdTiers.seconds[shape][tier]!
          : Array.isArray(d["cooldown"]) && (d["cooldown"] as number[]).length > 0
            ? (d["cooldown"] as number[])[0]!
            : mid;
      const after = resolveApCoeff(apCoeffInputsFrom(d, n, mid, cd), DEFAULT_AP_COEFFICIENT);
      if (after === null) continue;
      for (const r of n["ratios"] as Record<string, unknown>[]) {
        if (r["stat"] !== "ap" || typeof r["coeff"] !== "number") continue;
        const before = r["coeff"] as number;
        if (before > 0) out.push({ id: String(d["id"]), ratio: after / before });
      }
    }
  }
  return out;
}

describe("AP 係數公式的偏離（GH#945）", () => {
  const devs = deviations();

  it("⭐ 量尺先自證：真的算得出公式值", () => {
    expect(devs.length, "⛔ 一個節點都沒算到 ⇒ 這條在量空氣").toBeGreaterThan(100);
  });

  it("⭐⭐ **棘輪**：偏離超過一個數量級的節點只准變少", () => {
    const outliers = devs.filter((d) => d.ratio >= 5 || d.ratio <= 0.2);
    const worst = [...outliers]
      .sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))
      .slice(0, 4)
      .map((d) => `${d.id}(${d.ratio.toFixed(2)}×)`);
    expect(
      outliers.length,
      `⭐ 今天有 ${outliers.length} 個節點的公式值與手填值差**一個數量級以上**：${worst.join(" · ")}\n` +
        `⚠️ ⭐ 那多半是**級距標籤判錯**（形狀／冷卻／條件其中一維），⛔ 而不是手填值沒道理 ——\n` +
        `  兩者在這張表上長得一模一樣，而 \`docs/editor-contract/ggd-ap-coeff-before-after.md\` 就是要人分辨它們。\n` +
        `⛔ 變多 ⇒ 有人加了一支標籤錯的技能；⭐ 變少 ⇒ 把上限調下來。`,
    ).toBeLessThanOrEqual(OUTLIER_CEIL);
  });

  it("⭐ 中位偏離貼近 1.0 —— ⭐ 那是 BASE 校準過的證據（⛔ 不是巧合）", () => {
    const sorted = devs.map((d) => d.ratio).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)]!;
    expect(
      med,
      `⭐ 中位偏離 ${med.toFixed(3)} —— 離 1.0 太遠表示 BASE 需要重新校準`,
    ).toBeGreaterThan(0.5);
    expect(med).toBeLessThan(2);
  });
});
