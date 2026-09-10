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
import { readdirSync as _rdTpl } from "node:fs";
import { resolveTemplateExpansion } from "./templates/resolve";
import { zTemplateDoc, type TemplateDoc } from "./schema/template";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { apCoeffLogicalNodesOf, apCoeffRowsOf, comboStrikeCountsFrom, DEFAULT_AP_COEFFICIENT } from "./apCoefficient";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

// ⭐ 2026-09-07（#993 第三批）：76 支技能的 AP 節點住在 template.params 裡 ⇒ 先用出貨那一支展開器攤開再問 apCoeffRowsOf。
const TEMPLATES_FOR_AP = new Map<string, TemplateDoc>(
  _rdTpl(join(ROOT, "content/ability-templates"))
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => {
      const t = zTemplateDoc.parse(JSON.parse(readFileSync(join(ROOT, "content/ability-templates", f), "utf8")));
      return [t.id, t] as const;
    }),
);
function expandedForAp(doc: Record<string, unknown>): Record<string, unknown> {
  if (doc["template"] === undefined) return doc;
  const res = resolveTemplateExpansion(doc, TEMPLATES_FOR_AP);
  return res.ok ? (res.merged as Record<string, unknown>) : doc;
}
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
// ⭐ 2026-09-06 18 → **13**（owner 三則裁決：「被動就被動」· 「多段技的發數維度」· 卡面 {{ap}}）：第七維把超究／龍星群
//   收回來；山形修煉改成被動 proc（冷卻走下限、機率 ⇒ 小）之後也不再離群。留下的 13 個是公式對 w3x 手填值的設計性偏離
//   （龍破斬 1.8 · 仙氣發勁 6 · 神通眼 0.7 …）與 sela 骨架。
// ⭐ 2026-09-07 21 → **10**（owner「重新用公式判斷 看是不是判斷錯了來校正」第二輪）。兩件事：
//   ① 第七維補上 `hitOncePerTarget` ⇒ 34-04 蒼龍破（全庫最大偏離 **0.04×**）退場 —— 那是**真的判錯**：
//      行進波的 12 段是空間推進，同一個人整串只吃一次，⛔ 不是 12 連擊。
//   ② `base` 重新校準（0.1649 → 0.1619，普查母體改成展開後）⇒ 水位微調。
//   ⭐ 21 是上一輪「量到就寫下來」的數字，⛔ 而它沒有被問「這 21 個裡有幾個是判錯的」——
//      問了之後**只有 1 個是**（蒼龍破），其餘是設計性偏離（龍破斬 1.8 · 仙氣發勁 6 · 神通眼 0.7 · sela 骨架…）。
// ⚠️ ⭐ **11 而不是 10**：①之後量到 10，而②把 base 從 0.1649 壓到 0.1619 之後，
//   有一個節點從 0.20× 的**內側**掉到外側 ⇒ 11。⛔ 我沒有為了湊 10 去動任何一格 ——
//   這個數字是**這一版真的量到的**（`npx vitest run …apCoeffDeviation` 的訊息會逐個印出來）。
// ⭐ 2026-09-07 11 → **9**（GH#1100）：兩支 **6.19×** 退場，⛔ 而修的**不是公式也不是手填值** ——
//   是**內容接錯了**（GH#1024 已逐支複查過，全庫只有 `osam.r` 一支是公式層）：
//   ① `godie-e00x.e` 77-03 —— 卡面逐字「對英雄攻擊附帶額外 {{ap}}% [AP] 傷害」是**普攻 proc**，
//      ⛔ 而 JSON 是一個裸的頂層 `damage` ⇒ 公式把它當 60 秒單體大招（1.8577）。
//      接上 `applyBuff.hooks[onBasicAttack]`（＝15-02 疾風迅雷 `godie-emfr.w` 的出貨形狀）之後
//      `apCoeffCooldownFor` 的普攻分支才吃得到 ⇒ 冷卻走下限 ⇒ 0.1509（**0.50×**）。
//      JASS 出處：`war3map.j:49669` gate `GetUnitTypeId(GetAttacker()) == 'E00X'`、
//      `:49745` `UnitDamageTargetBJ(udg_Inshou, GetTriggerUnit(), AGI, …, DAMAGE_TYPE_MAGIC)`。
//   ② `godie-o00l.r` 53-04 暴爆咒 —— 卡面逐字「以自我為中心逆時針放射」，⛔ 而 `template.ref`
//      是 `tpl-single-strike` ⇒ 形狀維判成單體（2.5×）。換成 `tpl-orbit-array`（環形放射陣，
//      `range:0` ＝ 原地）之後形狀維讀到 `radius:5.5` ⇒ 0.8915（**2.97×**）。
//      JASS 出處：`war3map.j:40069` `PolarProjectionBJ(GetUnitLoc(udg_KaoUnit), 300, facing+36°×i)`、
//      `:40064` `KaoIndex >= 10`、`:40090` periodic 0.35s、`:40078` 275u AoE。
//   ⚠️ ⭐ 這個 9 是**量到的**（`npx vitest run …apCoeffDeviation` 的訊息會逐個印出來），
//      ⛔ 不是為了湊數字挑的：留下的 9 個全部是「公式對 w3x 手填值的設計性偏離」與 `sela` 骨架。
// ⭐⭐ 2026-09-07 9 → **44**（GH#1102）—— ⚠️ ⛔ **這不是回歸，是母體變大**。兩件事：
//   ① 走訪根從一行 `walk(def.effects)` 改成**從 schema 推導**（`apRatioRootKeys()`）
//      ⇒ 住 `passive` 的 67 條與住 `toggle` 的 1 條 AP ratio 第一次進入母體
//      （全庫 97 個 `onBasicAttack` hook 有 **92 個住 `passive`**）。
//      ⭐ 母體 149 支／186 條 → **171 支／254 條**；偏離母體（不含 `when`）136 → **228** 條。
//      ⇒ ⭐ 新冒出來的離群值是**本來就存在、只是看不到的** —— ⛔ 不是有人新加了一支標籤錯的技能。
//   ② `base` 跟著母體重新校準 0.1619 → **0.2677**（校準比 0.6048 ⇒ 1.0000；
//      中位偏離 0.607 → **1.0032**）。⚠️ 水位上移把**既有的**高側偏離推出去了：
//      `hvwd.ex` 7.44× → 12.30×、`h01n.w`／`h01o.w` 3.72× → 6.21×。
//   ⭐ 27 支／44 條。最大的一族是 06-01／06-02 山形修煉（`ucrl`／`u034` 各 4 條 × 3 格）——
//      那是 owner 2026-09-06 裁決**保留手填 1.0** 的那一支，而它的 AP 住 `passive`
//      ⇒ 在此之前公式**根本碰不到它** ⇒ 它從來沒出現在這張表上過。
//   ⚠️ ⭐ 44 是**這一版真的量到的**（訊息會印出最壞的四個），⛔ 不是挑一個上限去吸收它們。
// ⭐⭐ 2026-09-07 44 → **24**（GH#1105）—— ⚠️ ⛔ **這不是「修好了 20 個」，是母體的計數單位變了**。兩件事：
//   ① ⭐ 一列 ＝ **一個邏輯節點**（`apCoeffLogicalNodesOf`）：`passive.ranks[i]` 是整份 payload
//      複製 N 份 ⇒ 在此之前同一個節點的偏離被記了 3–4 次（06-01／06-02 山形修煉那一族光是
//      `ucrl.q/w`＋`u034.q/w` 就佔了 16 條）。偏離母體 228 → **192** 條。
//   ② `base` 跟著重新校準 0.2677 → **0.2180**（校準比 1.2282 ⇒ 1.0002；中位偏離 **1.0160**）。
//      ⚠️ 水位下移把幾個**低側**的偏離拉回來，也把幾個高側的推出去 —— ⛔ 不是單向。
//   ⭐ 量到的拆帳：同一個 base 下不收合是 39 條、收合後 **24** 條（22 支）。
//   ⚠️ ⭐ 24 是**這一版真的量到的**（訊息會印出最壞的四個），⛔ 不是挑一個上限去吸收它們。
const OUTLIER_CEIL = 24;


function deviations(): { id: string; ratio: number }[] {
  const cdTiers = JSON.parse(
    readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8"),
  ) as { seconds: Record<string, Record<string, number>> };
  const castTiers = JSON.parse(
    readFileSync(join(ROOT, "content/config/cast-time-tiers.json"), "utf8"),
  ) as { enabled?: boolean; seconds?: Record<string, number> };
  const comboCounts = comboStrikeCountsFrom(
    JSON.parse(readFileSync(join(ROOT, "content/config/combo-strikes.json"), "utf8")),
  );
  const out: { id: string; ratio: number }[] = [];
  for (const f of readdirSync(ABIL)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = expandedForAp(JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>);
    // ⭐ 與載入層／報表**同一支走訪、同一組輸入**（`apCoeffRowsOf`）—— ⛔ 這裡在 2026-09-06 之前抄了
    //   一份自己的冷卻查表（第二個住處），而它跟 runtime 一樣把 36 個範圍節點查到單體表。
    // ⭐ 2026-09-07（GH#1105）：一列 ＝ **一個邏輯節點**（`apCoeffLogicalNodesOf` 收掉 `passive.ranks[i]`
    //   的階數複本）—— ⛔ 在此之前同一個節點的偏離被記 3–4 次，而它看起來像 3–4 支技能有問題。
    for (const n of apCoeffLogicalNodesOf(apCoeffRowsOf(d, cdTiers, DEFAULT_AP_COEFFICIENT, castTiers, comboCounts))) {
      const after = n.value;
      if (after === null || n.authoredCoeff === null) continue;
      {
        const r = n.rows[0]!.ratio;
        // ⭐⭐ **條件式係數不算在這條棘輪裡** —— ⛔ 兩個空間混算。
        // ⭐ 公式問的是「這一支技能的**無條件主係數**該是多少」，
        //   ⛔ 而帶 `when` 的是**額外項**（04-002 碎片：「增加傷害(180% AP)」）。
        //   ⇒ 拿額外項去對主係數的公式，得到的「偏離」沒有意義。
        // ⚠️ 2026-09-03 量到：GH#936/#944 落地讓母體 127→129，
        //   而那兩筆的 0.10× 把棘輪從 21 推到 23 —— 而它們兩支都是對的。
        if (r["when"] !== undefined) continue;
        // ⭐ 逐階手填不一致時（全庫今天 1 個）取那幾階的**幾何平均** —— 公式的單一值蓋掉的是
        //   每一階，而校準的統計本身就是幾何平均 ⇒ 兩邊同一個空間（GH#1105 的 B）。
        const before = n.authoredCoeff;
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
