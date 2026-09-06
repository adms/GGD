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
import { apCoeffRowsOf, DEFAULT_AP_COEFFICIENT } from "./apCoefficient";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ABIL = join(ROOT, "content/abilities");

/**
 * ⭐ 棘輪：今天**量到**的「偏離 ≥ 5×（或 ≤ 0.2×）」節點數 —— ⛔ 只准往下走。
 * ⚠️ 21 是量出來的現況,⛔ 不是目標 —— 報告的前 14 列只是**最壞的那幾支**。
 */
/**
 * ⭐ 2026-09-03：21 → **22** —— GH#906 的成長率接線把單一 `damageTier` 展開成
 * 一條 `perRank` 階梯 ⇒ 一個節點的公式輸入跟著變。
 * ⛔ **不是**有人加了一支標籤錯的技能。
 */
// ⭐ 2026-09-06 22 → 23（owner 裁決 A，GH#1035）：06-02 山形修煉-變（ucrl.w／u034.w）從 self 改成
//   targeted（GH#1018）後正規化器補上 cooldownTier 極小 ⇒ 公式值從 0.18 掉到 0.158，手填 1.0 就成了新離群。
//   owner 選擇**保留手填 1.0**（同編號兩形態一致）並把公式**接上載入層**（同日）—— 接上之後這張表量的是
//   「開關關掉時玩家會落到哪裡」，⛔ 不再是場上的值。逐支理由仍歸 GH#945。
// ⭐ 2026-09-06 23 → **18**（owner「請你重新用公式判斷 看是不是判斷錯了來校正」）：修的是**讀標籤那一層**的四個
//   系統性誤判（冷卻表以文件判 · 形狀看祖先 · 普攻 hook 走下限 · 條件逐條 ratio 判＋EX ⇒ 大），⛔ 不是改公式、
//   ⛔ 也不是改手填值。留下的 18 個是三族：多段容器沒有「發數」維度（超究／龍星群）· 06-01/06-02 山形修煉
//   JSON 是主動而 JASS／卡面是被動 proc（待 owner 裁決）· 公式對 w3x 匯入手填值的設計性偏離（龍破斬 1.8 · 仙氣發勁 6）。
const OUTLIER_CEIL = 18;


function deviations(): { id: string; ratio: number }[] {
  const cdTiers = JSON.parse(
    readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8"),
  ) as { seconds: Record<string, Record<string, number>> };
  const castTiers = JSON.parse(
    readFileSync(join(ROOT, "content/config/cast-time-tiers.json"), "utf8"),
  ) as { enabled?: boolean; seconds?: Record<string, number> };
  const out: { id: string; ratio: number }[] = [];
  for (const f of readdirSync(ABIL)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
    // ⭐ 與載入層／報表**同一支走訪、同一組輸入**（`apCoeffRowsOf`）—— ⛔ 這裡在 2026-09-06 之前抄了
    //   一份自己的冷卻查表（第二個住處），而它跟 runtime 一樣把 36 個範圍節點查到單體表。
    for (const row of apCoeffRowsOf(d, cdTiers, DEFAULT_AP_COEFFICIENT, castTiers)) {
      const { ratio: r, value: after } = row;
      if (after === null || typeof r["coeff"] !== "number") continue;
      {
        // ⭐⭐ **條件式係數不算在這條棘輪裡** —— ⛔ 兩個空間混算。
        // ⭐ 公式問的是「這一支技能的**無條件主係數**該是多少」，
        //   ⛔ 而帶 `when` 的是**額外項**（04-002 碎片：「增加傷害(180% AP)」）。
        //   ⇒ 拿額外項去對主係數的公式，得到的「偏離」沒有意義。
        // ⚠️ 2026-09-03 量到：GH#936/#944 落地讓母體 127→129，
        //   而那兩筆的 0.10× 把棘輪從 21 推到 23 —— 而它們兩支都是對的。
        if (r["when"] !== undefined) continue;
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
        `⚠️⚠️ 那份 md 是**產生器**（\`apcoeffdiff:build\`）的產物 —— ⛔ 不要手改它，` +
        `改**來源**（tools/ap-coeff-apply/gen.ts）再 \`bash scripts/genrun.sh apcoeffdiff:build\` 重生成。\n` +
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
