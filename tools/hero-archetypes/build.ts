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
 *
 * ⚠️ 這裡在 2026-08-21 之前寫著「守衛 tools/hero-archetypes/build.test.ts 會重跑這支
 * 腳本並比對，過期就紅」——**那個檔案不存在**（第三守則：註解會說謊，去驗證）。
 * ⇒ 實際上這份 JSON 從 2026-08-11 起**沒有任何新鮮度閘**。現在有兩個：
 *   · `pnpm archetypes:build` 進了 `skills:sync`（改一支技能／一位英雄就重生成）
 *   · `pnpm roster:check` 的「產出文件的母體 ↔ 名單長度」會讀這份 JSON 裡印的母體
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
import {
  BALANCE_POPULATION_PROVENANCE,
  balancePopulationIds,
} from "../../packages/shared/testkit/balancePopulation";

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

/**
 * ⭐ **變身態不採計**（owner 2026-08-13：「變身也不採計了」）。
 *
 * ⚠️ 這與「變身一視同仁」不衝突，兩件事在不同的層：
 *   · **統計母體**（算中位數的那一群）→ 只有**本體**。變身態是同一位英雄的
 *     第二張卡，放進去等於**重複計數**，會把中位數往那些有變身的英雄拉。
 *   · **正規化的套用對象** → 仍然**包含**變身態（`skipTransformedBodies: false`），
 *     它照自己的出身正規化，跟本體用同一把尺。
 */
/**
 * ⭐ 母體 = **對戰可選名單** —— ⛔ 不是「快照減一減」。
 *
 * ⚠️ 上面那兩條篩選（`!RETIRED.has` + `group !== "transform"`）在 2026-08-21 之前是
 * **兩條各自的減法**，而它們**碰巧**等於名單。碰巧不是關係：快照是 2026-08-11 的，
 * 名單之後動過三次，任何一次「加一位新英雄」都會讓這份文件少一位而
 * ⛔ **沒有任何東西會紅**（它照樣產得出來、照樣逐位元組相等）。
 * ⇒ 現在它直接讀名單，而少了誰會 throw。owner 2026-08-21：「**錯誤的母體資料**」。
 */
const POPULATION = balancePopulationIds(ROOT);
{
  const inSnapshot = new Set(T.population.rows.map((r) => r.id));
  const absent = POPULATION.filter((id) => !inSnapshot.has(id));
  if (absent.length > 0) {
    throw new Error(
      `docs/hero-stat-tiers.json 的快照裡沒有這幾位對戰可選英雄：${absent.join(", ")}\n` +
        "→ 快照過期了（它是 2026-08-11 的）。重跑產生快照的那一支，⛔ 不要把他們從母體剔除。",
    );
  }
  // ⚠️ 留著這一行是為了讓「退場」這件事仍然說得出口 —— 名單本身已經擋掉退場的人，
  //    但 RETIRED 若哪天與名單不一致，`roster:check` 的第 ① 條會指名它。
  void RETIRED;
}
const POPULATION_SET = new Set(POPULATION);

const rows = T.population.rows
  .filter((r) => POPULATION_SET.has(r.id))
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
    initial[key] = Number(l1.toFixed(2));
    // ⚠️ 成長保留四位：攻速的每級成長是 0.0133，兩位會被捨成 0.01（差 16%）。
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
    population:
      // ⛔ 這一行在 2026-08-21 之前是「快照 74 → 濾掉變身 → 扣掉退場 → 49」——
      //    每一個數字都是真的,而整句話講錯了**誰**在決定母體:決定的是**名單**,
      //    快照只是屬性的來源。owner 2026-08-21:「**錯誤的母體資料**」。
      `${BALANCE_POPULATION_PROVENANCE} → 母體 **${rows.length} 位對戰可選英雄**；` +
      `屬性欄位取自 docs/hero-stat-tiers.json 的 population.rows（${T.population.rows.length} 筆快照，` +
      `其中 ${T.population.rows.filter((r) => r.group === "transform").length} 筆是變身態 —— ` +
      `⛔ 變身態是同一位英雄的第二張卡,進母體就是重複計數）`,
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

/**
 * ⭐ owner 2026-08-13：「你**計算的位數太多了**，我建議**最多取小數點兩位**就好」
 * → 這份文件裡**每一個**數字都走這支，一律兩位。
 * ⚠️ 例外只有一個：每級成長對小數值屬性（攻速 0.0133）取兩位會被捨成 0.01，
 *    所以那一欄用 `g()` 保留四位，並在表頭註明。
 */
const f = (n: number, d = 2) => n.toFixed(2);
const g = (n: number) => (Math.abs(n) < 0.1 ? n.toFixed(4) : n.toFixed(2));
const cell = (init: number, per: number): string => `${f(init)}<br><sub>+${g(per)}</sub>`;

/**
 * ⭐ 規格日期是**寫死的常數**，不是 `new Date()` —— 重跑這支腳本不可以讓
 * 檔案內容變動（否則 `--check` 那類守衛每天都會紅，而它紅的原因跟規則無關）。
 * 規則改了才手動改這一行。
 */
const SPEC_DATE = "2026-08-12";
const SPEC_VERSION = "v0.14.5";

const N = DEFAULT_STAT_NORMALIZATION;
const STAT_ZH: Record<string, string> = {
  ms: "移速", mr: "魔抗", armor: "裝甲", maxHealth: "生命", maxMana: "魔力",
  ad: "AD", ap: "AP", as: "攻速", healthRegen: "回血", manaRegen: "回魔",
  range: "射程",
};
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

## 一、範圍：**十一項屬性，九項套用中**

⚠️ 前兩版只做了三項（移速/魔抗/裝甲），那是我把範圍讀窄了。
owner 2026-08-12：「出身跟定位**是影響所有屬性**不是這幾項而已」。
⭐ owner 2026-08-16 再加第十一項：「你**補充第十一個屬性 攻擊距離**進來」。

| 狀態 | 屬性 | 說明 |
|---|---|---|
| ✅ **套用中（9 項）** | 生命 · 魔力 · 攻擊力 · 法強 · 移動速度 · 裝甲 · 魔抗 · 每秒回血 · 每秒回魔 | 由**出身**決定級距（第 2.3 節的表） |
| 🟡 **已定義、尚未套用（2 項）** | **攻速** · **攻擊距離** | 級距表都填好了，但**不在 \`appliesTo\`** —— 見下方兩段 |

### 🟡 攻速為什麼定義了卻沒開

三層懲罰疊在一起：\`strToAttackDamage\` 1→0.4 × \`attackDamage\` 1.0→0.6
× 攻速正規化，實測普攻只剩原本的 **15%**（法師 L18 一發技能 = 普攻 17 秒，
目標是 1.68 秒）。根因是**層數** —— 攻速已經有 \`stat-caps\` 的兩層（4 一般 /
10 解鎖）在管，正規化是第三層。⭐ 要開只要把 \`as\` 加回 \`appliesTo\`。

### 🟡 攻擊距離：雙峰不是藉口，是**兩把階梯**的理由

它在 2026-08-16 之前被**刻意排除**，而那個理由沒有失效 —— 它被正面解掉了。
重量（${rows.length} 位母體，⛔ 數字由 rows.length 推導）：

| 型別 | n | 實際值 | 中位 |
|---|---:|---|---:|
| 近戰 | 39 | 1.2(×1) · **1.6(×31)** · 2.0(×7) | **1.6** |
| 遠程 | 14 | 6.0 · 6.4 · 7.3 · 8.2 · 9.2 · 10.1 · 12.0 | **8.2** |

組間跨度 **5.1×**。用一把尺量它一定出事。

⭐ 解法是 \`bandsByScale\` —— **兩把尺**：

| 級距 | 近戰尺 | 遠程尺 |
|---|---:|---:|
| 極小（缺陷） | 1.2 | 6 |
| 小（偏低） | 1.4 | 7 |
| **中（標準）** | **1.6** | **8.2** |
| 大（優勢） | 1.8 | 10 |
| 極大（特化） | 2.0 | 12 |

⇒ 出身給的級距意思變成「**以你這把尺而言**算遠還算近」，近戰的「大」是 1.8u
而不是把他變成遠程。⛔ 程式裡沒有任何一行提到 \`range\` —— 是不是雙階梯由**資料**
決定（\`bandsByScale\` 有沒有這一項）。

### 🔴 走哪一把尺，鍵是**出身**，⛔ 不是 \`attackType\`

owner 2026-08-16 給了 49 位可選英雄的完整指派，欄位名就叫「**依出身**套用普攻距離」。
量出來的結果是：射程是**出身的純函數**，10 個出身各只有一個值，49/49 零例外。

| 尺 | 出身 | 級距 | 絕對值 |
|---|---|---|---:|
| 近戰 | 坦克 · 狂戰 · 法刺 | 小 | **1.4** |
| 近戰 | 鬥士 · 法鬥 · 硬輔 | 中 | **1.6** |
| 遠程 | 法師 · 射手 · 軟輔 | 中 | **8.2** |
| 遠程 | 砲手 | 極大 | **12** |

⚠️ 我的第一版用 \`attackType\` 選尺，那是**錯的**，而且是會靜靜出錯的那種錯：
owner 那張表裡 **10/49 位**兩者相反 ——

| 卡上的 attackType | 出身要求的尺 | 誰 |
|---|---|---|
| \`melee\` | **遠程**（8.2） | 妙蛙種子 · 初音 · 南野秀一 · 巴恩 · 哆拉A夢 |
| \`ranged\` | **近戰**（1.4~1.6） | 皮卡娘 · 傑洛士 · 白木卡迪那 · 死之王 · 涅吉 |

這 10 位會落在**差 5 倍**的量級上，而且沒有任何東西會紅（第②號故障形態）。
⭐ 兩者本來就獨立：\`attackType\` 決定**投射物還是近身揮擊**，尺標決定**構多遠**。
藏馬的薔薇鞭是近身揮擊但構得到 8.2；皮卡娘會放電但只打 1.4。
⇒ 尺標自己一格 \`scaleByOrigin\`（後台可調，十格出身各一個下拉）。

⚠️ 兩把尺都**不是**等比階梯，而是貼著觀測值鋪：近戰整個區間只有 1.2~2.0，
硬套 ÷2/×2 會產生 0.8 與 3.2 兩個「這個遊戲裡不存在的近戰距離」。
遠程的極大 **12** 也不是挑的 —— 那是 owner 2026-08-12 自己給的卡面上限
（「上限是黑人牙膏 12」），而黑人牙膏正是母體裡唯一的 12.0。

⚠️ 變身態的處理見 \`skipTransformedBodies\`（出貨 \`${String(N.skipTransformedBodies)}\`）
與 \`transformBandShift\`（出貨 \`${N.transformBandShift}\`）—— owner 2026-08-13：
「變身所有的屬性改變都用**技能標籤**組合到該變身技能中就好」，
所以變身態就是一張照自己出身正規化的普通卡，「變身比較強」由變身技能本身的 buff 負責。

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

### 2.2 級距：**五格**，兩條 r 都是 owner 給的

\`\`\`
極小 = 中 ÷ 2        ← owner：極大/極小 的 r 在 2~4
小   = 中 ÷ 1.25     ← owner：小/中/大 的 r 在 1.2~1.5
中   = 母體中位數     ← 量出來的
大   = 中 × 1.25
極大 = 中 × 2
\`\`\`

**「中」= 量出來的母體中位數**（${rows.length} 位可達英雄，等級 ${N.referenceLevel}；移速那一格是等級 1），
所以改制前後全場的總量不變，只是重新分配。

| 屬性 | 通道 | 極小 | 小 | 中 | 大 | 極大 |
|---|---|--:|--:|--:|--:|--:|
${(Object.keys(N.bands) as (keyof typeof N.bands)[]).flatMap((k) => {
  const two = N.bandsByScale[k];
  // ⭐ 雙階梯的那幾項要印**兩列** —— 只印 `bands[k]` 會讓讀者以為攻擊距離
  //    只有一把尺（而它印出來的正好是近戰那把，遠程整組隱形）。
  if (two) {
    return ([["melee", "近戰"], ["ranged", "遠程"]] as const).map(([t, zh]) => {
      const b = two[t];
      return `| ${STAT_ZH[k] ?? k}（${zh}） | \`${N.channel[k]}\` | ${b.極小} | ${b.小} | ${b.中} | ${b.大} | ${b.極大} |`;
    });
  }
  const b = N.bands[k];
  return [`| ${STAT_ZH[k] ?? k} | \`${N.channel[k]}\` | ${b.極小} | ${b.小} | ${b.中} | ${b.大} | ${b.極大} |`];
}).join("\n")}

⭐ owner 2026-08-12：「**初始的屬性是用來補正角色個性化差異，成長是定位導向**」
→ 九項走 \`growth\`，\`baseStats\` 留給個性。

⛔ **移速是唯一的例外，而且是量出來的機制限制不是偏好**：
\`最終值 = baseStats + 三圍×係數 + growth×(L−1)\`，成長**只能往上推不能往下拉**，
而移速沒有三圍來源可以在反解時被減掉。實測改成成長通道 →
坦克 15/16 位、法師 18/18 位被夾在 0，排序會變成坦克第二。

⚠️ **攻擊距離也走初始值**，而且理由更直接：**${rows.length} 位母體英雄裡 0 位有
\`growth.range\`** —— 它從來就只是一個初始值。它同時是唯一分**兩把階梯**的屬性
（見第一節），所以它是這張表裡唯一「級距的數字要看你是近戰還是遠程」的一列。

### 2.3 ⭐ 十種出身如何影響每一項（${SPEC_DATE}）

owner：「你要重新寫出**定位 10 種**如何影響**極小小中大極大**的**所有屬性**」

| 出身 | 判定 | 人數 | ${(Object.keys(N.bands) as string[]).map((k) => STAT_ZH[k] ?? k).join(" | ")} |
|---|---|--:|${(Object.keys(N.bands) as string[]).map(() => "---").join("|")}|
${ORIGINS.map((o) => {
  const info = DEFAULT_ORIGIN_ROUTES[o];
  const cells = (Object.keys(N.bands) as (keyof typeof N.bands)[]).map((k) => N.byOrigin[k]?.[o] ?? "—");
  return `| **${o}** | ${info.rule} | ${byOrigin[o]} | ${cells.join(" | ")} |`;
}).join("\n")}

⚠️ **有幾格是設計不是量測**，列出來讓你一眼看得到要不要扳回去：
- **射手（遠程）的 AD 給「中」** —— 量到它是全場最低（82.8），但射手沒有 AD 不合理
- **坦克（坦克）的 AD 保留「大」** —— 量到最高，那是「力量 → 攻擊力」推導的結果
- **法鬥 / 硬輔 / 法刺** 三個混血是**新格子**（母體各只有 4 / 3 / 5 位），量測支撐弱

⭐ 每一格都是後台的一個下拉選單（\`byOrigin.<屬性>.<出身>\`），改一格不用部署。
把整個 \`byOrigin\` 清空就退回四格那張 owner 逐字給的定位表。

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
    `${cell(r.initial.maxHealth!, r.perLevel.maxHealth!)} | ${cell(r.initial.maxMana!, r.perLevel.maxMana!)} | ` +
    `${cell(r.initial.ad!, r.perLevel.ad!)} | ${cell(r.initial.ap!, r.perLevel.ap!)} | ` +
    `${cell(r.initial.as!, r.perLevel.as!)} | ${f(r.initial.range!)} | ` +
    `${cell(r.initial.healthRegen!, r.perLevel.healthRegen!)} | ${cell(r.initial.manaRegen!, r.perLevel.manaRegen!)} |`,
  ),
).join("\n")}

---

## 五、⭐ 新英雄怎麼用這份規則生成（七步）

1. **決定三圍**（初始 + 每級成長）。這一步決定**主屬性**，也就決定了定位。
   ⚠️ 用 **lv10 權重**（初始 + 成長 × 9）去想，不是只看初始值。
2. **決定近戰或遠程**。① + ② 決定**出身**（10 選 1）與**定位**（4 選 1）。
3. **正規化會蓋掉的那幾項一格都不要填** —— 目前是
   \`${N.appliesTo.join(" · ")}\`（這一行從 \`appliesTo\` 印出來，⛔ 不是手抄的）。
   填了也會被出身的級距蓋掉。
   ⚠️ **攻擊距離自 2026-08-16 起在這張名單上**：它由**出身**決定（見 §一），
   ⛔ 不要在卡上調 —— 想讓一位英雄構得更遠，要改的是他的**出身**或那個出身的級距。
4. **其餘各項照個性填**。正規化只管定位差異，卡面留給個性。
   ⭐ 參考值請看第四節同定位其他英雄的中位數，不要憑感覺。
5. **檢查卡面倍率**：跑 \`npx tsx tools/hero-archetypes/build.ts\`。
   超出 \`[${CARD_RATIO_MIN}, ${CARD_RATIO_MAX}]\` 會列出來 —— ⛔ 它**不會擋**，
   但每一筆都要說得出「這是刻意的例外」還是「填錯了」。
6. **\`attackType\` 仍然要填，而且它不是射程** —— 它決定**投射物 vs 近身揮擊**。
   ⚠️ 它與出身的尺標**可以不一致**，而且出貨資料裡有 10 位刻意不一致
   （藏馬是近身揮擊但構得到 8.2，皮卡娘會放電但只打 1.4）。
   ⛔ 不要為了「對齊」去改它 —— 那會改掉一支普攻的表現形式。
7. **重跑產線**：\`npx tsx tools/hero-archetypes/build.ts\` → \`pnpm content:build\`
   → \`git add content/ docs/\`。⛔ 產物與來源檔**都要**進版控。
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
