/**
 * 英雄「出身」對照表產生器 —— 一支腳本產出兩份東西，⛔ 不手寫任何一份。
 *
 * 產出：
 *   · docs/hero-archetypes.json  —— 逐英雄的出身/初始/成長（審查與工具用）
 *   · docs/hero-archetypes.md    —— 同一份資料的 markdown 表（貼進計畫書）
 *
 * ⚠️ 這份 JSON **不是第四個住處**。權威資料仍然是：
 *   ① content/config/stat-normalization.json  —— 出身 × 屬性的級距表（引擎載入）
 *   ② content/champions/*.json                —— 每位英雄自己的卡（含可選的 archetype 覆寫）
 * 這份是從 ①② **推導**出來的快照，給 owner 審查與外部工具讀。
 * 守衛 tools/hero-archetypes/build.test.ts 會重跑這支腳本並比對，過期就紅。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import { championStatBase } from "../../packages/shared/src/sim/stats/attributes";
import {
  primaryAttribute, originOf, ORIGINS, ORIGIN_TO_ARCHETYPE, MIXED_RATIO,
  archetypeOf, ARCHETYPE_LABEL_ZH, DEFAULT_STAT_NORMALIZATION,
} from "../../packages/shared/src/content/statNormalization";
import { DEFAULT_ORIGIN_ROUTES } from "../../packages/shared/src/content/originRoutes";

const ROOT = join(__dirname, "../..");
const T = JSON.parse(readFileSync(join(ROOT, "docs/hero-stat-tiers.json"), "utf-8")) as {
  population: { rows: { id: string; name: string; group: string; attackType: string; bodyScale: number; reachability: string; counterpartId: string | null }[] };
};

/**
 * ⚠️ **下架的英雄要從母體剔除。**
 *
 * `docs/hero-stat-tiers.json` 是 2026-08-11 產出的快照，而 `roster.json` 的
 * `retiredChampions` 之後動過 —— 2026-08-12 owner 問「天地志狼變身不是取消了嗎」
 * 的時候，那一位（`godie-e007`）確實已經在下架清單裡，但快照還留著他，
 * 於是他照樣出現在射程排名上。⛔ 母體算錯不會報錯，只會讓每一個統計都偏一點。
 */
const RETIRED = new Set<string>(
  (JSON.parse(readFileSync(join(ROOT, "content/config/roster.json"), "utf-8")) as {
    retiredChampions?: string[];
  }).retiredChampions ?? [],
);

/**
 * ⭐ 卡面設計規範：**極大/極小相對於中位數的倍率**應該落在 `[1.6, 20]`。
 *
 * owner 2026-08-12：「只是個警告標記，**並不會擋**，範圍可進一步擴大到 **1.6~20**」
 *
 * ⛔ 這**不是** `config.stat-caps@1`。兩把尺量的是不同的東西：
 *   · 這一條  —— **純英雄屬性**（不含道具/技能/增幅），管的是「這張卡設計得合不合群」
 *   · stat-caps —— **場中最終值**（卡片 × 道具 × buff × 增幅），owner 定 **200×**
 * 差距有多大？AP 的卡面 L18 中位是 47.2，而實測最強道具組合是 **4,125.7** —— 88 倍。
 */
export const CARD_RATIO_MIN = 1.6;
export const CARD_RATIO_MAX = 20;

const STATS = [
  ["ms", Stat.MoveSpeed], ["armor", Stat.Armor], ["mr", Stat.MagicResist],
  ["maxHealth", Stat.MaxHealth], ["maxMana", Stat.MaxMana], ["ad", Stat.AttackDamage],
  ["ap", Stat.AbilityPower], ["as", Stat.AttackSpeed], ["range", Stat.AttackRange],
  ["healthRegen", Stat.HealthRegen], ["manaRegen", Stat.ManaRegen],
] as const;

const rows = T.population.rows
  .filter((r) => !RETIRED.has(r.id))
  .map((r) => {
  const d = JSON.parse(readFileSync(join(ROOT, `content/champions/${r.id}.json`), "utf-8")) as Record<string, never>;
  // ⚠️ 攻擊型態以**英雄卡**為準，⛔ 不用快照 —— 2026-08-12 owner 把妖狐藏馬本體
  //    與揍敵客桀諾從遠程改成近戰，快照還停在改之前。
  const attackType = (d as unknown as { attackType?: string }).attackType ?? r.attackType;
  const primary = primaryAttribute(d);
  const initial: Record<string, number> = {};
  const perLevel: Record<string, number> = {};
  for (const [key, stat] of STATS) {
    const l1 = championStatBase(d, stat, 1);
    // ⭐ 「每級成長」用 L2−L1 量，⛔ 不讀 growth 欄位 —— 三圍成長也會貢獻，
    //    只讀 growth 會漏掉一半（而且不同屬性漏的比例不同）。
    initial[key] = Number(l1.toFixed(3));
    perLevel[key] = Number((championStatBase(d, stat, 2) - l1).toFixed(4));
  }
  const a = (d as unknown as { attributes?: Record<string, number> }).attributes ?? {};
  return {
    id: r.id, name: r.name,
    身分: r.group === "transform" ? "變身" : r.group === "mob" ? "小怪" : "本體",
    reachability: r.reachability, counterpartId: r.counterpartId,
    attackType, bodyScale: r.bodyScale,
    primary,
    出身: originOf({ ...(d as object), attackType } as never),
    定位: archetypeOf({ ...(d as object), attackType } as never),
    archetypeOverride: (d as unknown as { archetype?: string }).archetype ?? null,
    attributes: { str: a.str ?? 0, agi: a.agi ?? 0, int: a.int ?? 0, strGrowth: a.strGrowth ?? 0, agiGrowth: a.agiGrowth ?? 0, intGrowth: a.intGrowth ?? 0 },
    initial, perLevel,
  };
});

const byOrigin = Object.fromEntries(ORIGINS.map((o) => [o, rows.filter((r) => r.出身 === o).length]));

// ---- 卡面設計規範的**警告標記**（⛔ 不擋任何東西，owner 2026-08-12）-------------
const median = (xs: number[]): number => {
  const b = [...xs].sort((a, z) => a - z);
  return b[Math.floor(b.length / 2)] ?? 0;
};
type Flag = { id: string; name: string; stat: string; level: 1 | 18; value: number; median: number; ratio: number; direction: "high" | "low" };
const flags: Flag[] = [];
for (const [key] of STATS) {
  for (const level of [1, 18] as const) {
    const at = (r: (typeof rows)[number]): number =>
      level === 1 ? r.initial[key]! : r.initial[key]! + r.perLevel[key]! * 17;
    const m = median(rows.map(at));
    if (m <= 0) continue;
    for (const r of rows) {
      const v = at(r);
      // ⚠️ 非正值一律標記：負防禦在減傷公式裡被 `max(0, …)` 吃掉，所以卡面在說謊。
      if (v <= 0) {
        flags.push({ id: r.id, name: r.name, stat: key, level, value: v, median: m, ratio: 0, direction: "low" });
        continue;
      }
      const ratio = v > m ? v / m : m / v;
      if (ratio > CARD_RATIO_MAX) {
        flags.push({ id: r.id, name: r.name, stat: key, level, value: v, median: m, ratio, direction: v > m ? "high" : "low" });
      }
    }
  }
}
const out = {
  schema: "ggd-hero-archetypes@1",
  generatedBy: "tools/hero-archetypes/build.ts",
  generatedFrom: {
    population: "docs/hero-stat-tiers.json → population.rows（74 = 可選本體 53 + 可達變身 21）",
    statFunction: "championStatBase(def, stat, L) —— 出貨的那一支，⛔ 沒有抄公式",
    initial: "L1 的最終值", perLevel: "L2 − L1（含三圍成長那一項）",
  },
  origins: {
    rule: "10 種 = 6 純血（主屬性 × 攻擊型態）+ 3 混血（前二名三圍的比 < MIXED_RATIO）+ 1 均衡（連第三名都在門檻內）",
    mixedRatio: MIXED_RATIO,
    counts: byOrigin,
    toArchetype: ORIGIN_TO_ARCHETYPE,
  },
  // ⭐ owner 2026-08-12：「**只是個警告標記，並不會擋**，範圍可進一步擴大到 1.6~20」
  cardRatioRule: {
    window: [CARD_RATIO_MIN, CARD_RATIO_MAX],
    scope: "純英雄屬性 —— ⛔ 不含道具、技能與其他加成",
    enforcement: "warn-only（⛔ 不擋存檔、不擋 content:build）",
    flagged: flags,
  },
  champions: rows,
};
writeFileSync(join(ROOT, "docs/hero-archetypes.json"), JSON.stringify(out, null, 2) + "\n");

const f = (n: number, d = 2) => n.toFixed(d);
const cell = (init: number, per: number, d = 2, dp = 3): string =>
  `${f(init, d)}<br><sub>+${f(per, dp)}</sub>`;

/**
 * ⭐ 規格日期是**寫死的常數**，不是 `new Date()` —— 重跑這支腳本不可以讓
 * 檔案內容變動（否則 `--check` 那類守衛每天都會紅，而它紅的原因跟規則無關）。
 * 規則改了才手動改這一行。
 */
const SPEC_DATE = "2026-08-12";
const SPEC_VERSION = "v0.14.5";

const N = DEFAULT_STAT_NORMALIZATION;
const ARC_ORDER = ["tank", "fighter", "mage", "marksman"] as const;

const doc = [
`# 英雄定位與屬性總表

> **規格日期 ${SPEC_DATE} · 出貨版本 ${SPEC_VERSION}**
> ⛔ **這份檔案由 \`tools/hero-archetypes/build.ts\` 產生，不要手改。**
> 改英雄卡或改 \`content/config/stat-normalization.json\`，然後重跑那支腳本。
>
> 用途有三個：
> ① **驗收** —— 現在每一位英雄的定位與數值長什麼樣
> ② **規則書** —— 正規化到底做了什麼、沒做什麼
> ③ ⭐ **新英雄的設計模板** —— 照第五節那七步就能生出一張合群的卡

---

## 一、⚠️ 先講清楚：**只有三項**被正規化

這是這份文件最重要的一句話。11 項屬性裡：

| 狀態 | 屬性 | 誰決定 |
|---|---|---|
| ✅ **已正規化** | **移動速度 · 魔抗 · 裝甲** | **角色定位**（下面第二節的表） |
| ⛔ 沒有正規化 | 生命 · 魔力 · 攻擊力 · 法強 · 攻速 · 攻擊距離 · 每秒回血 · 每秒回魔 | **英雄卡上作者填的原值** |

⚠️ 另外**變身態一律跳過**（\`skipTransformedBodies: true\`）——
它與本體的定位幾乎一定相同，一起正規化會把變身的強化抹平
（超級賽亞人不再比悟空快）。所以下表裡標「變身」的那些，三項都是原值。

---

## 二、正規化規則（${SPEC_DATE}）

### 2.1 定位怎麼判 —— 推導，不是手標

\`\`\`
主屬性 = 三圍在 **lv10** 的權重值最大的那一個（初始 + 成長 × 9）
         平手順序 str → agi → int（出貨資料裡沒有平手）

智慧主            → 法師 mage
非智慧主 + 遠程   → 遠程 marksman
力量主 + 近戰     → 坦克 tank
敏捷主 + 近戰     → 近戰 fighter
\`\`\`

⚠️ 用 lv10 不是初始值：一位初始平均但智慧成長最快的英雄，在實打的第 5–6 回合
就已經是法師了，而那正是玩家有感的時點。
⛔ 不要用 \`role\` 欄位 —— 它只有三個值，51 位 fighter 裡混了坦克與法師。
⭐ 英雄卡填了 \`archetype\` 就以它為準，推導只是預設值。

### 2.2 三項的級距與通道

| 屬性 | 通道 | 語意 | 小 | 中 | 大 |
|---|---|---|--:|--:|--:|
| 移動速度 | \`baseStats\` | **等級 1 的最終值** | ${N.bands.ms.小} | ${N.bands.ms.中} | ${N.bands.ms.大} |
| 魔抗 | \`growth\` | **等級 ${N.referenceLevel} 的最終總值** | ${N.bands.mr.小} | ${N.bands.mr.中} | ${N.bands.mr.大} |
| 裝甲 | \`growth\` | **等級 ${N.referenceLevel} 的最終總值** | ${N.bands.armor.小} | ${N.bands.armor.中} | ${N.bands.armor.大} |

**階梯 r = 1.25**（小 = 中 ÷ 1.25、大 = 中 × 1.25，大/小 = 1.5625）。
**錨點（中）= 母體中位數**，所以改制前後全場的總量不變，只是重新分配。

⭐ owner 2026-08-12：「**初始的屬性是用來補正角色個性化差異，成長是定位導向**」
→ 定位驅動的東西原則上寫 \`growth\`，\`baseStats\` 留給個性。

⛔ **移速是唯一的例外，而且是量出來的機制限制不是偏好**：
\`最終值 = baseStats + 三圍×係數 + growth×(L−1)\`，成長**只能往上推不能往下拉**，
而移速沒有三圍來源可以在反解時被減掉。實測改成成長通道 →
坦克 15/16 位、法師 18/18 位被夾在 0，排序會變成坦克第二。

### 2.3 定位 → 級距（owner 2026-08-12 的四列表）

| 定位 | 判定 | 移速 | 魔抗 | 裝甲 |
|---|---|---|---|---|
${ARC_ORDER.map((a) => {
  const 判 = a === "tank" ? "力量主 + 近戰" : a === "fighter" ? "敏捷主 + 近戰" : a === "mage" ? "智慧主" : "非智慧主 + 遠程";
  return `| **${ARCHETYPE_LABEL_ZH[a]}** | ${判} | ${N.byArchetype.ms[a]} | ${N.byArchetype.mr[a]} | ${N.byArchetype.armor[a]} |`;
}).join("\n")}

⭐ 設計邏輯：魔抗**順著**「智慧 → 魔抗 ×0.6」的推導走（所以法師最高），
坦克改用**裝甲**撐 —— owner：「是我忘了這個設定，我們**引入防禦/裝甲來平衡這個現象**」。
裝甲由**敏捷**推導，而坦克是力量主，自然裝甲全場最低，所以那一格全靠成長補。

### 2.4 硬上下限（場中最終值，⚠️ 含道具與 buff）

| 屬性 | 上限 | 由來 |
|---|--:|---|
| 生命上限 | 375,960 | 母體 L18 中位 × **200**（owner 給的倍率） |
| 魔力上限 | 232,150 | 同上 |
| 每秒回血 | 744 | 同上 |
| 每秒回魔 | 926 | 同上。🔴 莉娜因巴斯變身的 1,014.5 會被夾到 |
| 攻擊力 | 21,200 | 同上 |
| 裝甲 | 5,078 | 同上（≈ 98% 減傷） |
| 魔抗 | 15,344 | 同上 |
| 攻擊距離 | 16 | owner：卡面上限 12，可延伸到 16。⚠️ 體型倍率最高 1.30×，所以卡面 12 的大體型英雄最終是 15.6 |
| 移動速度 | 10 / 解鎖 12 | owner：「會大幅影響平衡性，上限是 10」。⚠️ 18 正好是穿牆的平手線 |
| 攻速 | 4 / 解鎖 10 | owner 2026-07-28 |
| 吸血 | 0.8 / 解鎖 **20** | owner：「吸血可以超過 100%，上限 20x，傷害 100 回復 2000」 |
| 冷卻縮減 | 0.99 | owner 2026-08-10 |
| 法強 | 開到頂 | 🔴 200× 算出來是 9,440，但實測最強組合已達 **8,937.8**（只差 5.6%）—— 套上去等於「從現在開始夾」，留給 owner 決定 |

### 2.5 卡面設計規範（⛔ **只是警告，不擋任何東西**）

owner 2026-08-12：「只是個警告標記，**並不會擋**，範圍可進一步擴大到 **1.6~20**」

判準：**純英雄屬性**（⛔ 不含道具/技能/增幅）相對於母體中位數的倍率，
應該落在 \`[${CARD_RATIO_MIN}, ${CARD_RATIO_MAX}]\`。逐屬性 × 逐等級（L1 與 L18）各檢一次。

⚠️ 這與上面 2.4 是**兩把不同的尺**：這一條量**卡面**，2.4 量**場中最終值**。
差距有多大？法強的卡面 L18 中位是 47.2，而實測最強道具組合是 **8,937.8** —— **189 倍**。

**目前超出的（${flags.length} 筆）：**

${flags.length ? [
  "| 等級 | 屬性 | 英雄 | 值 | 中位 | 倍率 |",
  "|---|---|---|--:|--:|--:|",
  ...flags.map((x) => `| L${x.level} | ${x.stat} | ${x.name} | ${f(x.value)} | ${f(x.median)} | ${x.ratio ? `${f(x.ratio, 1)}× ${x.direction === "high" ? "偏高" : "偏低"}` : "**非正值**"} |`),
].join("\n") : "（無）"}

---

## 三、十種出身（${SPEC_DATE}）

owner：「可以延伸到 **40** 種，我的原意是 **10 種出身**」——
10 出身 × 每種 3~4 條路線 = 32 條。

⛔ **出身與路線都是純敘述，不驅動任何數值。** 它們的用途是
① 調數值時的定位參考 ② 選角畫面上的說明。
真正驅動數值的是上面第二節的**四格定位**，出身由 \`ORIGIN_TO_ARCHETYPE\` 收斂過去。

判定：前二名三圍的比 ≥ **${MIXED_RATIO}** → 純血（再分近戰/遠程，6 格）；
< ${MIXED_RATIO} → 混血（依那兩個三圍，3 格）；連第三名都在門檻內 → 均衡（1 格）。

| 出身 | 判定 | 人數 | 收斂到 | 一句話 | 路線 |
|---|---|--:|---|---|---|
${ORIGINS.map((o) => {
  const info = DEFAULT_ORIGIN_ROUTES[o];
  return `| **${o}** | ${info.rule} | ${byOrigin[o]} | ${ARCHETYPE_LABEL_ZH[ORIGIN_TO_ARCHETYPE[o]]} | ${info.tagline} | ${info.routes.map((x) => x.name).join(" · ")} |`;
}).join("\n")}

### 3.1 路線細目

${ORIGINS.map((o) => {
  const info = DEFAULT_ORIGIN_ROUTES[o];
  return [
    `**${o}** —— ${info.tagline}`, "",
    "| 路線 | 在做什麼 | 換到 | 放棄 |", "|---|---|---|---|",
    ...info.routes.map((x) => `| ${x.name} | ${x.summary} | ${x.gain} | ${x.lose} |`),
  ].join("\n");
}).join("\n\n")}

---

## 四、逐英雄總表（母體 ${rows.length}）

⚠️ 每一格是 **初始值**，下面小字是 **每級成長**。
成長用 **L2 − L1** 量出來，⛔ 不是讀 \`growth\` 欄位 —— 三圍成長也會貢獻，
只讀 \`growth\` 會漏掉一半，而且每條屬性漏的比例不同。

⚠️ 標 ✅ 的三欄是**被正規化過的**，其餘是作者原值。

| 定位 | 出身 | 身分 | 名稱 | 攻型 | ✅移速 | ✅裝甲 | ✅魔抗 | 生命 | 魔力 | AD | AP | 攻速 | 射程 | 回血 | 回魔 |
|---|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
${ARC_ORDER.flatMap((a) =>
  rows.filter((r) => r.定位 === a).sort((x, y) => y.initial.maxHealth! - x.initial.maxHealth!).map((r) =>
    `| ${ARCHETYPE_LABEL_ZH[a]} | ${r.出身} | ${r.身分} | ${r.name} | ${r.attackType === "ranged" ? "遠" : "近"} | ` +
    `${cell(r.initial.ms!, r.perLevel.ms!)} | ${cell(r.initial.armor!, r.perLevel.armor!)} | ${cell(r.initial.mr!, r.perLevel.mr!)} | ` +
    `${cell(r.initial.maxHealth!, r.perLevel.maxHealth!, 0, 1)} | ${cell(r.initial.maxMana!, r.perLevel.maxMana!, 0, 1)} | ` +
    `${cell(r.initial.ad!, r.perLevel.ad!, 0, 2)} | ${cell(r.initial.ap!, r.perLevel.ap!, 0, 2)} | ` +
    `${cell(r.initial.as!, r.perLevel.as!)} | ${f(r.initial.range!)} | ` +
    `${cell(r.initial.healthRegen!, r.perLevel.healthRegen!)} | ${cell(r.initial.manaRegen!, r.perLevel.manaRegen!)} |`,
  ),
).join("\n")}

---

## 五、⭐ 新英雄怎麼用這份規則生成（七步）

1. **決定三圍**（初始 + 每級成長）。這一步決定**主屬性**，也就決定了定位。
   ⚠️ 用 **lv10 權重**（初始 + 成長 × 9）去想，不是只看初始值。
2. **決定近戰或遠程**。① + ② 決定**出身**（10 選 1）與**定位**（4 選 1）。
3. **移速 / 魔抗 / 裝甲 一格都不要填**。正規化會依定位覆蓋它們 ——
   填了也會被蓋掉（移速蓋 \`baseStats\`，魔抗與裝甲蓋 \`growth\`）。
4. **其餘八項照個性填**：生命 · 魔力 · 攻擊力 · 法強 · 攻速 · 攻擊距離 · 回血 · 回魔。
   ⭐ 參考值請看第四節同定位其他英雄的中位數，不要憑感覺。
5. **檢查卡面倍率**：跑 \`npx tsx tools/hero-archetypes/build.ts\`。
   超出 \`[${CARD_RATIO_MIN}, ${CARD_RATIO_MAX}]\` 會列出來 —— ⛔ 它**不會擋**，
   但每一筆都要說得出「這是刻意的例外」還是「填錯了」。
6. **攻擊距離**：近戰預設 **1.6**（原作的 128），長柄類 **2.0**；
   遠程 6.0 ~ 12.0，⭐ **卡面上限 12**（黑人牙膏），超過要有理由。
   ⚠️ \`attackType\` 決定的是**投射物 vs 近身揮擊**，不只是距離 ——
   填 \`ranged\` 但射程 2.0 會變成「發射一個只飛 2 格的投射物」。
7. **重跑產線**：\`npx tsx tools/hero-archetypes/build.ts\` → \`pnpm content:build\`
   → \`git add content/ docs/\`。⛔ 產物與來源檔**都要**進版控。

### ⭐ 兩個空格

**重砲**（力量 · 遠程）與**全能**（三圍均衡）目前**各 0 位**。
它們不是缺陷，是還沒有人站的位置 —— 下一位新英雄最有設計空間的兩個方向。
`,
].join("\n");

writeFileSync(join(ROOT, "docs/英雄定位與屬性總表.md"), doc);

console.log(`✓ docs/hero-archetypes.json (${rows.length} 位)  ·  docs/英雄定位與屬性總表.md`);
if (flags.length) {
  console.log(`\n⚠️  卡面倍率超出 [${CARD_RATIO_MIN}, ${CARD_RATIO_MAX}]（${flags.length} 筆，⛔ 警告不擋）：`);
  for (const x of flags) {
    console.log(`   L${x.level} ${x.stat.padEnd(11)} ${x.name} = ${x.value.toFixed(2)}（中位 ${x.median.toFixed(2)}）`);
  }
}
