/**
 * ⭐【上下架一位英雄，會波及到哪些地方 —— 一支會擋下你的程式】
 *
 * owner 2026-08-16：「請把調整上下架英雄會影響到的程式檔案、機制、說明文件、測試
 * 等 做成一個 重 build 會自動檢查的 script」
 *
 * ── 為什麼要這支 ──────────────────────────────────────────────────────
 * 2026-08-16 下架四位英雄，**十條測試同時紅**。而每一條的訊息都在講自己的功能壞了：
 *
 *     「語音覆蓋率不對」「VFX 綁定少了」「可施放格數退步了」「替身普查對不上」
 *
 * **沒有一條說出真相：名單變短了，十條全都是對的。**
 * 追那十條紅花掉的時間，遠超過改名單本身。
 *
 * ⇒ 這支的工作是：在**改名單的當下**就把整條漣漪列出來，而且用一句人話說清楚
 *   哪一個關係破了。⛔ 它不是第十一條測試 —— 它是那十條的**索引**。
 *
 * ── 它驗「關係」，⛔ 不驗「名詞」 ─────────────────────────────────────
 * CLAUDE.md 的配對式後置條件教訓：2026-08-02 那次部署四項後置條件全綠而網站不能玩，
 * 因為每一項都在驗一個名詞，沒有一項在驗兩個名詞之間的關係。
 * 這支的每一條都是一個**配對**：
 *
 *   下架名單 ↔ 種子清單 · 種子清單 ↔ 內容樹 · Go 兩份清單 ↔ 彼此
 *   經濟拆分 ↔ 名單長度 · 測試裡的數字 ↔ 名單長度
 *
 * ⭐ 2026-08-21 加了六條（owner 三則逐字：「**錯誤的母體資料**　下架沒使用的英雄
 *   技能 說明 道具 請都整理到 legacy 好嗎」/「**上架不能包含變身態 我們討論過了
 *   之前就是這樣才沒改到正確的英雄技能**」/「查所有屬性級距等 **都是不考慮變身態的**」）
 *   —— 全部圍著同一個名詞:**母體**。
 *
 *   平衡量測母體 ↔ 種子清單     · **平衡量測母體 ↔ 變身態（零容忍）**
 *   產出文件裡印的母體 ↔ 名單長度 · 內容樹的每一張卡 ↔ 三種身分
 *   可選名單 ↔ 變身態存在        · 營運白名單 ↔ 對戰可選名單（檔案在就驗）
 *
 * ⭐ 2026-08-21 再加第 ⑫ 條（GH#472，owner 兩則：「這些是哪裡來的老舊東西，**根本沒
 *   上架阿 幹嘛修**…你的判斷標準究竟是？」/「只要做**有開放的**角色技能及隨機三選一
 *   就好，**沒開放的別浪費 token**」）：
 *
 *   **稽核母體 ↔ 上架面** —— 每一支掃 `content/items` 的稽核，都要說得出它掃的是
 *   **全部**還是**上架中**。量到的原形：出貨樹 142 件道具裡玩家今天只拿得到 **89 件**
 *   （`arena-rules.weaponShelfOpen` 出貨 false ⇒ 有價武器買不到，而它們也不在任何一張
 *   獎池裡）—— 而每一條掃全樹的稽核都會替那 53 件產生待修項。
 *   ⚠️ 「未上架」⛔ 不等於「退場」：退場物住 `content/_legacy/`，而這 53 件是**一格
 *   後台開關**關著而已 —— 所以上架面必須從那格開關**推導**，⛔ 不可以寫成一張名單。
 *
 * ⚠️ 量到的原形:六支量測（錨點/滿魔/低傷/出身/柵欄/新英雄預設）拿
 *   `readdirSync(content/champions)`（或 `Champions.all()`）當母體 ＝ **71 張卡**,
 *   其中 20 張是變身態（同一位英雄的第二張卡 ⇒ 重複計數）、2 張是 fail-open 骨架佔位。
 *   ⇒ 傷害五級距整條推導鏈都建在一個含 22 張雜訊的中位數上,
 *   而 ⛔ **沒有任何東西會紅** —— 目錄永遠讀得出東西,讀得出來就永遠「成功」。
 *
 * ⭐ 「**不可選**」與「**退場**」是兩件事(2026-08-21 量測否決過「把變身態搬進 legacy」):
 *   那 20 個變身態是**上架中的變身目標** —— 真的搬走的話,60 份變身態技能失效、
 *   23 支帶 `championForm` 的技能目標消失、80 份出貨檔的引用斷掉,而**沒有替代機制**
 *   (`applyBuff` 只能疊 modifier,變身要換**整張英雄卡**)。⇒ 檔案留著,母體排除。
 *
 * ── 用法 ─────────────────────────────────────────────────────────────
 *   pnpm roster:check          # 單獨跑（~1 秒）
 *   pnpm content:build         # ⭐ 自動跑（buildIndexes 結尾呼叫）
 *
 * 失敗回非零，並逐條說「哪兩份東西對不上、去哪裡改」。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";


import { SELA, THORNE } from "../../packages/shared/src/sim/content/skeleton";
import {
  BALANCE_POPULATION_PROVENANCE,
  balancePopulationFrom,
  balancePopulationIds,
} from "../../packages/shared/testkit/balancePopulation";
import {
  shippedAbilityIds,
  shippedChampionIds,
  shippedItemIds,
  unreachableItemIds,
} from "../../packages/shared/testkit/shippedSurface";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STARTER_GO = "apps/platform/internal/curation/starter.go";
const STARTER_GO_TEST = "apps/platform/internal/curation/starter_content_test.go";
const ROSTER_JSON = "content/config/roster.json";
const OPERATOR_WHITELIST = "data/curation/whitelist.json";

/**
 * ⭐ **fail-open 的骨架佔位** —— ⛔ 不是名單上的英雄，也⛔ 不是「忘了下架的英雄」。
 *
 * `main.tsx` 的內容載入失敗時 `registerSkeletonContent()` 註冊這兩位讓遊戲仍能開機
 * （CLAUDE.md 第二守則：那是刻意的 fail-open）。它們在 `content/champions/` 裡的兩份
 * 卡是**同一組資料的內容樹副本**，`loader.test.ts` 用它們證明整棵樹載得起來。
 *
 * ⛔ 這兩個 id **從程式推導**（`SELA.id` / `THORNE.id`），⛔ 不是手寫的豁免表 ——
 * 骨架哪天換人，這條閘自己就跟著換。
 */
const SKELETON_IDS: ReadonlySet<string> = new Set([SELA.id as string, THORNE.id as string]);

interface Finding {
  /** 破掉的是哪兩份東西之間的關係 */
  readonly pair: string;
  readonly detail: string;
  /** 去哪裡改 —— ⛔ 不是「某個測試紅了」，是「這個檔的這一格」 */
  readonly fix: string;
}

const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/**
 * 抓 Go 的 `name = []string{ … }` 裡的 id。
 *
 * ⚠️ 收尾**不是** `\n}` —— 這些清單住在 `var ( … )` 群組裡，所以它們的收尾是
 * **縮排過的** `\t}`。用 `\n}` 會一路吃到下一個頂層宣告，把道具清單也算進來
 * （2026-08-16 我第一版就是這樣，`starterChampions` 被讀成 120 位）。
 * ⇒ 逐行掃到「整行只有空白 + }」為止。
 */
function goStringSlice(src: string, name: string): string[] {
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) throw new Error(`${name} 不在 Go 原始碼裡 —— 這支腳本的假設壞了`);
  const lines = src.slice(start).split("\n");
  const body: string[] = [];
  for (const line of lines.slice(1)) {
    if (/^\s*\}\s*$/.test(line)) break;
    body.push(line);
  }
  const ids = [...body.join("\n").matchAll(/"(godie-[^"]+)"/g)].map((m) => m[1]!);
  // ⚠️ 空的結果 = 解析壞了，⛔ 不是「名單是空的」。這一條擋的正是
  //    「掃描器沒跑但報告全綠」那個形態（見 mobs 那次 600 個 seed 全拋例外）。
  if (ids.length === 0) throw new Error(`${name} 解析出 0 個 id —— 解析器壞了，⛔ 不是名單空了`);
  return ids;
}

/** 一張英雄卡自己說的變身身分（⛔ 不是外部的一張對照表）。 */
interface OnDiskChampion {
  readonly role: "base" | "alternate" | null;
  readonly counterpartId: string | null;
}

/** 內容樹裡真的存在的英雄 id → 它自己宣告的變身身分。 */
function championsOnDisk(): Map<string, OnDiskChampion> {
  const dir = join(ROOT, "content/champions");
  const out = new Map<string, OnDiskChampion>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      id: string;
      transform?: { role?: string; counterpartId?: string };
    };
    const role = doc.transform?.role;
    out.set(doc.id, {
      role: role === "base" || role === "alternate" ? role : null,
      counterpartId: doc.transform?.counterpartId ?? null,
    });
  }
  if (out.size === 0) throw new Error("content/champions 讀出 0 張卡 —— 讀取器壞了，⛔ 不是內容空了");
  return out;
}

export function checkRoster(): Finding[] {
  const out: Finding[] = [];
  const push = (pair: string, detail: string, fix: string): void => {
    out.push({ pair, detail, fix });
  };

  const rosterDoc = JSON.parse(read(ROSTER_JSON)) as { retiredChampions?: string[] };
  const retired = new Set(rosterDoc.retiredChampions ?? []);
  const onDisk = championsOnDisk();
  const goSrc = read(STARTER_GO);
  const seeded = goStringSlice(goSrc, "starterChampions");
  const seededSet = new Set(seeded);

  // ① 下架名單 ↔ 種子清單 —— 下架的英雄**不可以**還在新裝的預設名單裡。
  //    這是今天真的踩到的那一條：白名單閘會把它丟掉，於是「種子說 53、實際開 49」
  //    而**沒有任何東西會叫**。
  const seededButRetired = seeded.filter((id) => retired.has(id));
  if (seededButRetired.length > 0) {
    push(
      "已下架名單 ↔ 種子清單",
      `${STARTER_GO} 的 starterChampions 還列著已下架的：${seededButRetired.join(", ")}`,
      `把它們從 starter.go 的 starterChampions **與** ${STARTER_GO_TEST} 的 firstOpenRoster 兩份清單裡刪掉。`,
    );
  }

  // ② 種子清單 ↔ 內容樹 —— 種子指到不存在的英雄 = 新裝拿到一個空位。
  const seededButMissing = seeded.filter((id) => !onDisk.has(id));
  if (seededButMissing.length > 0) {
    push(
      "種子清單 ↔ 內容樹",
      `starterChampions 指到內容樹裡沒有的英雄：${seededButMissing.join(", ")}`,
      "要嘛把英雄文件加回 content/champions/，要嘛把 id 從 starter.go 拿掉。",
    );
  }

  // ③ Go 的兩份清單 ↔ 彼此 —— 出貨那份與測試那份必須逐字相同。
  //    ⚠️ 它們是**兩個檔**，所以只有比對看得出來（分開看兩邊都「對」）。
  const pinned = goStringSlice(read(STARTER_GO_TEST), "firstOpenRoster");
  const pinnedSet = new Set(pinned);
  const onlySeeded = seeded.filter((id) => !pinnedSet.has(id));
  const onlyPinned = pinned.filter((id) => !seededSet.has(id));
  if (onlySeeded.length > 0 || onlyPinned.length > 0) {
    push(
      "starter.go ↔ starter_content_test.go",
      `兩份 Go 清單對不上：只在出貨那份 [${onlySeeded.join(", ")}]、只在測試那份 [${onlyPinned.join(", ")}]`,
      "兩邊改成一樣。⚠️ 它們是同一個事實的兩份抄寫，⛔ 不可以只改一邊。",
    );
  }

  // ④ 經濟拆分 ↔ 名單長度 —— 免費 + 付費 必須等於名單長度。
  //    ⭐ 守的是「免費那幾位沒有偷偷變多」，⛔ 不是釘住付費數（那是減出來的）。
  const testSrc = read(STARTER_GO_TEST);
  const free = Number(/starterFreeChampions\s+=\s+(\d+)/.exec(testSrc)?.[1] ?? NaN);
  const priced = Number(/starterPricedChampions\s+=\s+(\d+)/.exec(testSrc)?.[1] ?? NaN);
  if (Number.isFinite(free) && Number.isFinite(priced) && free + priced !== seeded.length) {
    push(
      "經濟拆分 ↔ 名單長度",
      `免費 ${free} + 付費 ${priced} = ${free + priced}，但名單是 ${seeded.length} 位`,
      `改 ${STARTER_GO_TEST} 的 starterPricedChampions。⚠️ 如果 **免費** 那格也要動，` +
        "那是經濟形狀改變 —— 停下來問 owner（2026-07-26「藍水晶本來就是獎勵」）。",
    );
  }

  // ⑤ 測試裡的數字 ↔ 名單長度 ——⭐ 這一條是**元守衛**：它擋的不是今天的缺陷，
  //    是「有人又把名單長度抄進第 N 個地方」。今天那十條紅就是這麼來的。
  const hardcoders = scanForHardcodedRosterSize(seeded.length);
  if (hardcoders.length > 0) {
    push(
      "測試裡的字面值 ↔ 名單長度",
      `這些檔把名單長度 ${seeded.length} 抄成了字面值：\n      ${hardcoders.join("\n      ")}`,
      "改成 `readStarterRoster(root).length`（packages/shared/testkit/starterRoster.ts）。" +
        "⛔ 名單長度只能有一個住處 —— 抄一份就是下一次十條紅。",
    );
  }

  // ⑥ 說明文件 ↔ 名單長度 —— owner 點名要涵蓋「說明文件」。
  //    ⚠️ 這裡**只驗數字**，⛔ 不驗文件該不該提某位英雄（那是編輯判斷不是機械事實）。
  //    2026-08-16 實測：`docs/hero-archetypes.json` 的說明還寫著「可選本體 53」，
  //    而名單早就 49 —— 一份自稱從出貨資料產生的文件，說明卻停在兩版之前。
  for (const rel of DOCS_WITH_ROSTER_COUNT) {
    let text: string;
    try {
      text = read(rel);
    } catch {
      continue; // 檔案不在就算了 —— ⛔ 這支腳本不負責決定文件該不該存在
    }
    const stale = [...text.matchAll(/可選本體\s*(\d+)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n !== seeded.length);
    if (stale.length > 0) {
      push(
        "說明文件 ↔ 名單長度",
        `${rel} 的說明寫著「可選本體 ${stale.join(" / ")}」，但名單是 ${seeded.length} 位`,
        "把那個數字改成現在的名單長度。⚠️ 這份文件自稱從出貨資料產生 —— " +
          "說明過期就是**它在說謊**（第三守則），而下一輪接手的人會照著它做。",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // ⭐ 2026-08-21 —— owner 三則（⛔ 不要再問）：
  //    「**錯誤的母體資料**　下架沒使用的英雄 技能 說明 道具 請都整理到 legacy 好嗎」
  //    「**上架不能包含變身態 我們討論過了 之前就是這樣才沒改到正確的英雄技能**」
  //    「並且我們**查所有屬性級距等 都是不考慮變身態的**」
  //    ⇒ 下面五條把「母體」這件事整條關起來。
  // ---------------------------------------------------------------------------
  /** ⭐ 變身身分**從卡自己讀**（`transform.role`），⛔ 不是外部的一張對照表。 */
  const alternates = new Set([...onDisk].filter(([, c]) => c.role === "alternate").map(([id]) => id));
  const baseOfAlt = new Map(
    [...onDisk]
      .filter(([, c]) => c.role === "alternate" && c.counterpartId)
      .map(([id, c]) => [id, c.counterpartId!] as const),
  );
  const altOfBase = new Map(
    [...onDisk]
      .filter(([, c]) => c.role === "base" && c.counterpartId)
      .map(([id, c]) => [id, c.counterpartId!] as const),
  );
  const population = balancePopulationFrom(seeded, retired, alternates);
  const popSet = new Set(population);
  /** 名單上的人的變身態 —— **上架中的變身目標**，只是不可選。引擎必須解析得到。 */
  const reachableAlternates = new Set(
    [...popSet].map((id) => altOfBase.get(id)).filter((x): x is string => Boolean(x)),
  );

  // ⑥ 母體模組 ↔ 種子清單 —— `balancePopulationIds()` 必須**就是**名單減退場減變身態。
  //    ⭐ 這一條擋兩件事，兩件都是真的發生過的形狀：
  //      · 有人把母體改回 `readdirSync(content/champions)` → 回 71（多 20 變身 + 2 骨架）
  //      · 有人把變身態放回母體（「一張都不能少」）→ 回 69，而 owner 說了不行
  const modulePop = balancePopulationIds(ROOT);
  if (modulePop.join(",") !== population.join(",")) {
    const onlyModule = modulePop.filter((id) => !popSet.has(id));
    const onlyHere = population.filter((id) => !modulePop.includes(id));
    push(
      "平衡量測母體 ↔ 種子清單",
      `balancePopulationIds() 回 ${modulePop.length} 位，而「名單 − 退場 − 變身態」是 ${population.length} 位` +
        `（只在模組那邊：${onlyModule.join(", ") || "—"}；只在這邊：${onlyHere.join(", ") || "—"}）`,
      `修 packages/shared/testkit/balancePopulation.ts —— 母體只有一個定義：${BALANCE_POPULATION_PROVENANCE}。`,
    );
  }
  // ⑥-b ⭐ **母體裡一個變身態都不可以有** —— owner 2026-08-21 逐字。
  //    ⚠️ 這一條與 ⑥ 是**不同的斷言**：⑥ 比的是「模組 vs 名單」（兩邊一起錯就會一起綠），
  //    這一條直接問卡自己「你是不是 alternate」。⇒ 突變：把變身態放回母體 → 這裡紅。
  const altsInPop = modulePop.filter((id) => alternates.has(id)).sort();
  if (altsInPop.length > 0) {
    push(
      "平衡量測母體 ↔ 變身態",
      `母體裡有 ${altsInPop.length} 個變身態（卡自己的 transform.role === "alternate"）：${altsInPop.join(", ")}`,
      "把它們從母體剔除。owner 2026-08-21：「**上架不能包含變身態 我們討論過了 " +
        "之前就是這樣才沒改到正確的英雄技能**」「查所有屬性級距等 **都是不考慮變身態的**」。" +
        "⚠️ 變身態是本體的**第二張卡**（同一個 NN-XX 編號）—— 進母體就是把同一位英雄數兩次。",
    );
  }

  // ⑦ 產出文件的母體 ↔ 名單長度 —— ⭐ 這是**兩個名詞的關係**，⛔ 不是掃原始碼字串。
  //    每一支平衡量測都把自己的母體大小印進交付物；印出來的那個數字必須等於名單。
  //    ⇒ 有人把某一支改回掃目錄並重生成 → 那份文件寫 71 → 紅（而且指名是哪一份）。
  //    ⇒ 有人改回掃目錄但**沒**重生成 → 那一支自己的 `--check` 紅。兩條路都有人喊。
  for (const rel of BALANCE_ARTIFACTS) {
    if (!existsSync(join(ROOT, rel))) continue; // 產物還沒生出來不是這支的事
    const hits = [...read(rel).matchAll(/\*\*(\d+)\s*位對戰可選英雄\*\*/g)].map((m) => Number(m[1]));
    if (hits.length === 0) {
      push(
        "產出文件的母體 ↔ 名單長度",
        `${rel} 裡找不到「**N 位對戰可選英雄**」—— 母體出處被拿掉了`,
        "把母體大小印回去（產生器讀 `balancePopulationIds`）。⛔ 一份不說自己在量誰的報告，" +
          "下一輪沒有人能發現它量錯了 —— 那正是 2026-08-21 的 71 vs 49。",
      );
      continue;
    }
    const wrong = hits.filter((n) => n !== population.length);
    if (wrong.length > 0) {
      push(
        "產出文件的母體 ↔ 名單長度",
        `${rel} 說母體是 ${[...new Set(wrong)].join(" / ")} 位，而名單是 ${population.length} 位`,
        "重跑那一支產生器。⚠️ 如果重跑之後數字還是不對，那是**產生器的母體讀錯了** —— " +
          "它應該走 `packages/shared/testkit/balancePopulation.ts`，⛔ 不是 `readdirSync(content/champions)`。",
      );
    }
  }

  // ⑧ 內容樹 ↔ 三種身分 —— ⭐ 每一張英雄卡都必須說得出它為什麼還在出貨樹裡。
  //    三種合法身分：① 名單上的可選英雄 ② 名單上某位的變身態 ③ fail-open 骨架佔位。
  //    ⛔ 第四種＝「下架了但沒搬走」，而那正是 owner 這一則在講的東西。
  const unaccounted = [...onDisk.keys()]
    .filter((id) => !popSet.has(id) && !reachableAlternates.has(id) && !SKELETON_IDS.has(id))
    .sort();
  if (unaccounted.length > 0) {
    push(
      "內容樹 ↔ 三種身分",
      `content/champions/ 裡有 ${unaccounted.length} 張卡既不在名單上、也不是名單上某位的變身態、` +
        `也不是 fail-open 骨架：${unaccounted.join(", ")}`,
      "上架就把 id 加進 starter.go 的 starterChampions（兩份 Go 清單都要）；" +
        "下架就 `git mv` 進 content/_legacy/（⛔ 不要刪，owner 2026-08-13「不要刪除舊資料」）。" +
        "⚠️ 變身態要**整組**動：本體還在出貨就⛔不可以單獨搬走它的變身態（snapshot 每秒 30 次解析 modelKey）。",
    );
  }

  // ⑨ 名單 ↔ 變身態的存在 —— 名單上某位的變身態如果不在出貨樹，玩家一按變身就整房掛掉。
  const missingAlt = [...reachableAlternates].filter((id) => !onDisk.has(id)).sort();
  if (missingAlt.length > 0) {
    push(
      "可選名單 ↔ 變身態存在",
      `這些變身態的本體在名單上，卡卻不在 content/champions/：` +
        missingAlt.map((a) => `${a}（本體 ${baseOfAlt.get(a)}）`).join(", "),
      "把卡從 content/_legacy/champions/ 搬回來，或把本體從名單上拿掉。" +
        "⚠️ `applyChampionForm` 之後 snapshot 每 tick 都會 `Champions.get(alternateId).modelKey` —— " +
        "查不到就是**丟例外**，不是退回一個安全值。",
    );
  }

  // ⑩ 營運白名單（若這台機器上有）↔ 對戰可選名單 —— ⭐ 必須**逐字相等**。
  //    ⚠️ `data/curation/whitelist.json` 是 .gitignore 的營運狀態，CI 上不存在 ——
  //    所以這一條「檔案在就驗」，⛔ 但不靜默跳過（訊息會說它不在）。
  //    ⭐ 為什麼是相等而不是「⊇ 名單」：owner 2026-08-21「**上架不能包含變身態**」。
  //    2026-08-21 實測線上勾著 59 隻，其中 10 隻是變身態 —— 那 10 隻**不是十位英雄**，
  //    而它們讓「白名單有幾隻」這個數字對不上任何一份名單，於是那個數字不能當閘。
  //    ⚠️ 拔掉是安全的：`whitelist.allowsChampion()` 只在 `MatchController.selectChampion`
  //    被呼叫 —— 它**只擋選人**，⛔ 變身時不查它。
  if (existsSync(join(ROOT, OPERATOR_WHITELIST))) {
    const doc = JSON.parse(read(OPERATOR_WHITELIST)) as { champions?: string[] };
    const enabled = new Set(doc.champions ?? []);
    const notEnabled = population.filter((id) => !enabled.has(id));
    const strangers = [...enabled].filter((id) => !popSet.has(id)).sort();
    if (notEnabled.length > 0) {
      push(
        `營運白名單 ↔ 對戰可選名單（${OPERATOR_WHITELIST}）`,
        `這台機器的白名單少了 ${notEnabled.length} 位名單上的英雄：${notEnabled.join(", ")}`,
        "在後台勾起來，或跑一次啟用示範組合（ApplyStarterSet 是 union-only）。" +
          "⚠️ 白名單落後的症狀是**選人畫面少人**，而 content bundle 與測試全都是綠的。",
      );
    }
    if (strangers.length > 0) {
      const alts = strangers.filter((id) => alternates.has(id));
      push(
        `營運白名單 ↔ 對戰可選名單（${OPERATOR_WHITELIST}）`,
        `白名單勾著 ${strangers.length} 個不在對戰可選名單上的 id：${strangers.join(", ")}` +
          (alts.length > 0 ? `（其中 ${alts.length} 個是**變身態**：${alts.join(", ")}）` : ""),
        "把它們取消勾選。⭐ 變身態**不需要**在白名單上 —— `allowsChampion()` 只擋選人，" +
          "變身走的是 `applyChampionForm`，⛔ 不查白名單。owner 2026-08-21：「上架不能包含變身態」。",
      );
    }
  }

  // ⑫ ⭐ 稽核母體 ↔ 上架面 —— GH#472：「稽核／工作的範圍收斂到**上架中**」。
  out.push(...checkAuditScope());

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑫【每一支掃 `content/items` 的稽核，都要說得出它掃的是**全部**還是**上架中**】
//
// owner 講過兩次，兩次都是同一條規則的不同一半（GH#472）：
//
// > M48（2026-08-18）：「這些是哪裡來的老舊東西，**根本沒上架阿 幹嘛修**…
// >  **你的判斷標準究竟是？**」
// > M105-1（2026-08-19）：「只要做**有開放的**角色技能及隨機三選一就好，
// >  **沒開放的別浪費 token**」
//
// ── 為什麼閘只架在**道具**上（量到的，2026-08-21） ─────────────────────────
//
//   | 集合 | 出貨樹 | 玩家拿得到 | 差多少 |
//   |---|---:|---:|---|
//   | `content/abilities` | 420 | 412 | 8 份 fail-open 骨架 |
//   | `content/champions` | 71 | 69 | 2 張 fail-open 骨架 |
//   | **`content/items`** | **142** | **89** | ⭐ **53 件（37%）** |
//
// 技能與英雄那兩棵樹在 #464 / #485 之後已經幾乎逐份等於上架面，差的只有那兩張
// 骨架佔位（而 `SKELETON_CHAMPION_IDS` 已經是推導出來的）。**道具是唯一還在漏的
// 地方**：`arena-rules.weaponShelfOpen` 出貨是 `false`（owner 2026-07-28「其他武器
// 道具先全部暫時下架」），而那 53 件也不在任何一張獎池裡 ⇒ 一場比賽裡不存在。
// ⇒ 閘架在差距真的存在的那一格，⛔ 不是每一個掃描器都掛一張表（那是過度配比）。
//
// ── 兩種合法狀態，⛔ 沒有第三種 ────────────────────────────────────────────
//
//   ① **走推導模組** —— import `testkit/shippedSurface` 或 `testkit/balancePopulation`。
//      ⇒ 自動偵測，⛔ 不必登記（母體改變時它自己跟著動）。
//   ② **在 {@link WHOLE_TREE_BY_DESIGN} 裡帶著一個能被反駁的理由**。
//
// ⚠️ 這張表**自己也會過期**：某一支哪天改走推導模組了，它那一列就必須刪掉，
// 否則這裡紅 —— 與 `noOpModifierClaims` 的 `CURATION_PENDING` 同一個形狀。
// ═══════════════════════════════════════════════════════════════════════════

/** 掃描器要從哪幾棵子樹找。⛔ `apps/**` 不在內 —— 見 {@link SKIPPED_ROOTS}。 */
const AUDIT_SCAN_ROOTS = ["packages/shared/src", "packages/shared/testkit", "tools"];

/**
 * 這幾個子樹**不受這條閘管**，各自帶著理由（⛔ 不是「太麻煩所以跳過」）。
 */
const SKIPPED_ROOTS: Record<string, string> = {
  "tools/w3x-import/":
    "一次性的 w3x 匯入器 —— 它的母體是**原作地圖檔**，`content/` 是它的輸出而不是輸入。" +
    "用上架面過濾它等於叫匯入器只匯入自己已經匯入過的東西。",
  "tools/icon-gen/":
    "圖示產生管線 —— 它要替**磁碟上真的存在的每一份**文件備妥圖示，含 fail-open 骨架。" +
    "骨架沒有圖示的話，內容載入失敗那一刻畫面是全黑的（而那正是骨架存在的理由）。",
};

/**
 * 真的 **import** 這兩支之一 = 母體是推導出來的 ⇒ 自動通過，⛔ 不必登記。
 *
 * ⚠️ 判準是**一行 import**，⛔ 不是「檔案裡出現這個字」—— 第一版寫成後者，
 * 於是 `tools/reference/gen_readme_lists.py` 只因為**註解裡提到**
 * `balancePopulation.ts` 就被判成已收斂（實測，2026-08-21）。
 * 那正是第三守則的形狀：一句散文宣稱自己有來源，而事實不在那裡。
 *
 * ⚠️ `.py` 一律要登記：Python 匯入不了 TS 模組，所以「它有沒有收斂」對這支腳本
 * 而言不可能是機械事實 —— 只能是一句寫下來、可以被反駁的話。
 */
const DERIVATION_IMPORT = /from\s+["'][^"']*\/(shippedSurface|balancePopulation)["']/;

/**
 * ⛔ 具名豁免 —— 每一列都是「**為什麼掃全部才是對的**」，不是「還沒改」。
 * ⚠️ 加一列之前先問：這一支的失敗訊息會不會叫人去**修一件玩家拿不到的道具**？
 * 會 → 它該走推導模組，⛔ 不該進這張表。
 */
const WHOLE_TREE_BY_DESIGN: Record<string, string> = {
  // ── 2026-08-31 —— 模板的精確引用鎖掃全樹 ────────────────────────────────
  "packages/shared/src/content/templateRefPinIsHonest.test.ts":
    "問的是「**今天有沒有任何文件釘住了一份已經變了的模板**」—— 那是**資料一致性**的" +
    "性質，⛔ 不是玩家側的曝光。⭐ 一件**今天關著**的道具如果釘錯了模板，" +
    "它**明天上架**時壞的就是它（`expand.ts` 不看上架面）⇒ 只掃上架面等於把缺陷排到未來。" +
    "⚠️ 而這條閘今天**什麼都不擋**（出貨 84 支模板引用一格都沒填 `contentSha256`）——" +
    "它在有人填了之後才開始說話。" +
    "反駁方式：如果哪天 `expand.ts` 改成只展開上架面的技能，這一列就該改走 shippedItemIds()。",
  // ── 2026-08-30 GH#648 —— 週期領域模板的**阻塞點**掃全樹 ────────────────────
  "packages/shared/src/content/periodicFieldAdoptionBlocker.test.ts":
    "問的是「**今天有沒有任何內容引用 `tpl-periodic-field`**」—— 那是**引擎接線有沒有" +
    "被人用**的性質，⛔ 不是玩家側的曝光。⭐ 這條閘的整個用途就是「零支引用 **或** " +
    "說明側讀得到 `mult`」二選一 —— 而**一件今天關著的道具引用了它**，卡面照樣會說謊" +
    "（`abilityProse` 不看上架面）⇒ 用上架面過濾它會讓那個謊話**在它上架的那一天**才第一次出現。" +
    "反駁方式：如果哪天 `abilityProse.damageRanks` 乘上 `Scaling.mult`（＝這條閘存在的理由消失），" +
    "整條閘就該刪掉，⛔ 不是改走 shippedItemIds()。",
  // ── 2026-08-27 GH#789 —— 逐階曲線被級距壓平的回歸閘掃全樹 ─────────────────
  "packages/shared/src/content/perRankNotTierified.test.ts":
    "問的是「**產生器有沒有把一條升階曲線量化成級別**」—— 那是**資料形狀**的性質，" +
    "⛔ 不是玩家側的曝光。⭐ 一件今天關著的道具，它的 `perRank` 曲線一樣是被 " +
    "`tiers:apply` 壓平的（產生器不看上架面），而它**明天上架**時壞的就是它 —— " +
    "只掃上架面等於把缺陷排到未來。⚠️ 這一次的實例正是這個形狀：#789 壓平了 10 支，" +
    "其中兩支剛好有 w3a 對照才被 nativeFidelity 抓到，其餘 40 個節點沒有人問。" +
    "反駁方式：如果哪天 `tiers:apply` 改成只處理上架面，這一列就該改走 shippedItemIds() 並刪掉。",
  // ── 2026-08-26 GH#244 —— 模板家族的**採用率**掃全樹 ──────────────────────
  "packages/shared/src/content/templateFamiliesAreAdopted.test.ts":
    "問的是「這個模板家族**有沒有被任何內容引用過**」——那是**作者側的採用率**，" +
    "⛔ 不是玩家側的曝光。一份只被關著的道具引用的模板**已經被套用了**（工作做完了）；" +
    "它與「玩家今天拿不拿得到那件道具」無關。⭐ 反過來才是缺陷：只看上架面會讓" +
    "「模板做好了但沒人套」被一件關著的道具**假性滿足**，而那正是這條閘要抓的東西" +
    "（首輪量到 46 個家族裡 30 個零引用，含 #648 的 tpl-periodic-field）。" +
    "反駁方式：如果哪天判準改成「玩家看得到的採用率」，這一列就該改走 shippedItemIds() 並刪掉。",
  // ── 2026-08-27 GH#789 —— 移速加成級距的 exclusive 掃全樹 ─────────────────
  "packages/shared/src/content/moveSpeedTiers.test.ts":
    "問的是「`ms` modifier 的級別與 value **有沒有第二個住處**」（第〇·四）——" +
    "那是**資料正確性**不是平衡稽核（形狀同 negativeBuffPolarity）：貨架關著的道具" +
    "一格後台勾選就上架，而上架動作不重跑測試 ⇒ 一個沒收級距、也沒豁免的 ms 節點" +
    "要在**進 repo 的當下**紅，⛔ 不是上架之後表改了才發現它一動不動。" +
    "反駁方式：上架動作本身會觸發完整稽核（#473 落地）的那天，改走上架面並刪掉這一列。",
  // ── 2026-08-24 GH#662 —— polarity 誠實性掃全樹 ────────────────────────────
  "packages/shared/src/content/negativeBuffPolarity.test.ts":
    "未標 polarity 的純減益 ⇒ 淨化拔不掉（第一·五守則：卡面說謊）。⭐ 掃**全樹**是刻意的：" +
    "這是**資料正確性**不是平衡稽核 —— 貨架關著的道具/技能一格後台勾選就上架，" +
    "而上架動作不重跑測試 ⇒ 缺標要在**進 repo 的當下**紅，⛔ 不是上架之後才被玩家發現。" +
    "反駁方式：如果哪天上架動作本身會觸發完整稽核（#473 落地），這一列就該改走上架面並刪掉。",
  // ── ⭐ 2026-08-22 GH#544 —— AP 換算稽核**必須**掃全樹 ─────────────────────
  "tools/ap-conversion/apply.py":
    "屬性額外傷害→AP 的換算稽核。⭐ 掃**全部** 142 件（⛔ 不是上架的 89 件）是刻意的：" +
    "貨架關著的道具**照樣帶著那段卡面文字**，而 owner 隨時可以把它打開 —— " +
    "一件沒換算的道具在那一刻就是一句上線的謊話（第一·五守則）。" +
    "⚠️ 它也**不會**浪費 token：這支是建置期的一次性掃描，⛔ 不在任何測試的熱路徑上。" +
    "⭐ 要反駁它：拿出一個「貨架關著的道具其卡面文字不會被任何人看到」的證據 —— " +
    "今天不成立（後台道具頁與 codex 編輯器都讀得到全樹）。",

  // ── 母體是**具名的那幾件**，掃全樹只是為了把它們找出來 ──────────────────
  "packages/shared/src/content/blockNoteTruth.test.ts":
    "母體是【格擋】具名四支的 authoringNote ↔ 出貨資料，⛔ 不是道具樹。",
  "packages/shared/src/content/legendary49OwnerText.test.ts":
    "母體是 **owner 親筆的 49 支文案**（`__fixtures__/legendary49OwnerText.json`）—— " +
    "掃內容樹是為了找到那 49 件；用上架面過濾會讓「owner 列了但我們還沒上架」這個落差消失。",
  "packages/shared/src/content/legendaryOwnerRulings.test.ts":
    "母體是 owner 2026-08-01 的**三支具名數值裁決**，⛔ 不是道具樹。",
  "packages/shared/src/sim/alchemyShieldShipped.test.ts":
    "具名一件（`godie-i06q` 鍊金術之盾）在出貨文件上跑真的 sim。",
  "packages/shared/src/sim/effects/exOriginStructuralFix.test.ts":
    "具名兩件 EX 寶具（`senzu-bean` / `all-might-hair`）的方向守衛。",
  "packages/shared/src/sim/effects/onHitTerms.shipped.test.ts":
    "具名五支傳說武器的算式，走出貨的裝備路徑。",
  "packages/shared/src/sim/grantAttributeMaxBasis.test.ts":
    "`grantAttribute.maxAttributeBasis` 的預設值量測 —— 母體是**用到那一格的文件**。",
  "packages/shared/src/sim/itemAttributes.test.ts":
    "`item@1.attributes` 的裝備／賣出／變身路徑，靶是具名道具。",
  "packages/shared/src/sim/lanceGodieI01g.test.ts": "具名一件（貫雷槍 `godie-i01g`）。",
  "packages/shared/src/sim/lichkingSet.test.ts": "具名三件（死之王套裝）。",
  "packages/shared/src/content/abilityScaling.test.ts":
    "結構普查：每一支技能有沒有屬性成長。母體是**技能**，讀 items 只為了拿道具給的屬性當基準。",

  // ── 它問的**正是**「退場的東西有沒有被誤引用」⇒ 必須掃全部 ──────────────
  "packages/shared/src/content/retiredItemsAbsent.test.ts":
    "⭐ 這一支就是 GH#472 說要保留的那一種：退場物**只驗有沒有被誤引用**。" +
    "用上架面過濾它 = 把它要找的東西先濾掉，斷言恆真。",
  "packages/shared/src/content/retiredLootTables.test.ts":
    "同上 —— 封存的獎池有沒有被排回某一回合。母體必須含退場物。",

  // ── 它驗的**就是上架面本身**，用上架面過濾會變成同義反覆 ────────────────
  "packages/shared/src/content/legendaryOwnerTiers.test.ts":
    "owner 的**上架寶具階級表** ↔ 三張抽獎池對帳（GH#470）。它在驗上架面對不對，" +
    "⛔ 不能拿上架面當前提。",
  "packages/shared/src/content/weaponTierTables.test.ts":
    "每一階 `weaponTiers[].table` 有沒有一張真的抽得到東西的池 —— 同上，它在驗上架面本身。",
  "tools/economy/gen_legendary_xlsx.py":
    "來源就是三張池（＝已經是上架面的定義本身），再套一層過濾不會改變任何一列。",

  // ── 對外契約：母體是**出貨註冊表**，⛔ 不是內容樹 ────────────────────────
  "tools/capability-export/export.ts":
    "`ggd-runtime-capabilities` 回答「這個**名字**存不存在」—— 母體是出貨註冊表。" +
    "掃內容只為了數用量；把未上架的用量藏起來會讓外部編輯器以為某個機制沒有人用。",

  // ── 掃全部但**每一列都標了開不開放** ⇒ 它是展示不是待修清單 ──────────────
  "tools/reference/gen_readme_lists.py":
    "README 的名單：逐列標「開放／未開放」（來源是營運白名單），母體＝**顯示**而不是待修清單。",
  "tools/reference/gen_reference.py":
    "`docs/reference/*.md` 同上 —— 881 列全部逐列標開放狀態。",
};

/**
 * 這一支掃不掃 `content/items`。⚠️ 兩層條件，⛔ 不是「檔案裡有 items 這個字」。
 */
function listsItemsDir(src: string): boolean {
  const lists = /readdirSync\s*\(|globSync\s*\(|os\.listdir\s*\(|glob\.glob\s*\(/.test(src);
  const dir = /content\/items\b|CONTENT[^\n]{0,60}["'`]items["'`]|\[\s*"items"/.test(src);
  return lists && dir;
}

function checkAuditScope(): Finding[] {
  const found: string[] = [];
  const walk = (rel: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(join(ROOT, rel), { withFileTypes: true }).map((e) =>
        e.isDirectory() ? `/${e.name}` : e.name,
      );
    } catch {
      return;
    }
    for (const raw of entries) {
      const isDir = raw.startsWith("/");
      const name = isDir ? raw.slice(1) : raw;
      if (["node_modules", "dist", "__fixtures__", "__snapshots__"].includes(name)) continue;
      const child = `${rel}/${name}`;
      if (isDir) {
        walk(child);
        continue;
      }
      if (!/\.(ts|tsx|py)$/.test(name)) continue;
      if (Object.keys(SKIPPED_ROOTS).some((p) => child.startsWith(p))) continue;
      const src = readFileSync(join(ROOT, child), "utf8");
      if (!listsItemsDir(src)) continue;
      if (!name.endsWith(".py") && DERIVATION_IMPORT.test(src)) continue; // ① 走推導模組
      found.push(child);
    }
  };
  for (const r of AUDIT_SCAN_ROOTS) walk(r);

  // ⚠️ 掃到 0 支 = 探測器壞了（這棵樹本來就有二十幾支），⛔ 不是「大家都收斂好了」。
  //    一支永遠回空的探測器對「全都登記了」與「探測器死了」給出一樣的答案。
  const out: Finding[] = [];
  const declared = Object.keys(WHOLE_TREE_BY_DESIGN);
  const undeclared = found.filter((f) => !(f in WHOLE_TREE_BY_DESIGN)).sort();
  if (undeclared.length > 0) {
    out.push({
      pair: "稽核母體 ↔ 上架面（content/items）",
      detail:
        `這 ${undeclared.length} 支掃了 \`content/items\` 卻沒說自己掃的是全部還是上架中：\n      ` +
        undeclared.join("\n      "),
      fix:
        "二選一：① 改走 `packages/shared/testkit/shippedSurface.ts` 的 `shippedItemIds()`" +
        "（出貨樹 142 件裡玩家今天只拿得到 89 件 —— owner GH#472：「沒開放的別浪費 token」）；" +
        "② 如果掃全部才是對的，去 `tools/roster-guard/check.ts` 的 `WHOLE_TREE_BY_DESIGN` " +
        "加一列**能被反駁的理由**。⛔ 沒有第三種狀態。",
    });
  }
  const stale = declared.filter((f) => !found.includes(f)).sort();
  if (stale.length > 0) {
    out.push({
      pair: "稽核母體豁免表 ↔ 實際掃描器",
      detail:
        `\`WHOLE_TREE_BY_DESIGN\` 這 ${stale.length} 列已經過期（檔案改走推導模組、改名、或不再掃 content/items）：\n      ` +
        stale.join("\n      "),
      fix: "把那幾列刪掉。⭐ 一張不會過期的豁免表，過幾個月就變成一份沒有人敢動的散文。",
    });
  }
  return out;
}

/** 會提到名單長度的說明文件。⛔ 新增一份就加一列 —— 這支不做全 repo 掃描。 */
const DOCS_WITH_ROSTER_COUNT = ["docs/hero-archetypes.json"];

/**
 * ⭐ 每一份**平衡量測**的交付物 —— 它們都必須印出自己的母體大小。
 *
 * ⚠️ `tools/newhero` **刻意不在這裡**：它的檔頭寫死了「⛔ 不寫語料份數」（份數會因為
 * 無關的內容改動而變，那會讓清單在一個位元都沒變的情況下紅）。它的母體由第 ⑥ 條
 * （模組本身）守著，⛔ 不需要在交付物上再釘一次。
 */
const BALANCE_ARTIFACTS = [
  "packages/shared/src/content/balanceAnchorsDerived.ts",
  "docs/平衡錨點量測.md",
  "content/config/damage-tiers.json",
  "docs/魔力回復例外清單.md",
  "docs/hero-archetypes.json",
  "docs/屬性上限推導.md",
];

/**
 * 掃「有沒有人又把名單長度寫成字面值」。
 *
 * ⚠️ 只掃**測試檔裡出現在斷言旁邊**的那個數字，而且只在它剛好等於今天的名單長度時
 * 才報 —— 那正是「抄了一份」的指紋。⛔ 不掃所有數字（那會誤報到爆）。
 */
function scanForHardcodedRosterSize(size: number): string[] {
  const hits: string[] = [];
  const roots = ["packages/shared/src", "packages/shared/testkit", "apps/client/src", "apps/game-server/src"];
  // ⚠️ 兩層條件，⛔ 不是「這個檔案裡有這個數字」：
  //    ① 這一行本身要提到名單（roster / starter / champion / 名單）；
  //    ② 而且是一個**斷言**或一個名單長度常數。
  //    第一版只做了 ②，於是 `expect(tuning.holdMs).toBe(120)` 這種完全無關的
  //    行也被報出來（2026-08-16 實測 5 個誤報）。
  const rosterish = /roster|starter|champion|名單/i;
  const pattern = new RegExp(
    `(toBe|toHaveLength|toEqual|Len\\(t,[^,]+,)\\s*\\(?\\s*${size}\\b|ROSTER_SIZE\\s*=\\s*${size}\\b`,
  );
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(join(ROOT, dir));
    } catch {
      return;
    }
    for (const name of entries) {
      const rel = `${dir}/${name}`;
      if (name === "node_modules" || name === "dist") continue;
      let isDir = false;
      try {
        isDir = readdirSync(join(ROOT, rel)).length >= 0;
      } catch {
        isDir = false;
      }
      if (isDir) {
        walk(rel);
        continue;
      }
      if (!/\.test\.tsx?$/.test(name)) continue;
      const src = readFileSync(join(ROOT, rel), "utf8");
      // ⚠️ 只有**同時**提到名單（roster/starter/champion）的檔才算 —— 一個 UI 測試
      //    裡剛好有 49 這個數字跟英雄名單無關。
      if (!/roster|starter|champion/i.test(src)) continue;
      for (const [i, line] of src.split("\n").entries()) {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
        if (!rosterish.test(line)) continue;
        if (pattern.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 78)}`);
      }
    }
  };
  for (const r of roots) walk(r);
  return hits;
}

/** CLI —— 失敗回非零（⚠️ 一行沒有人讀的 log 不算守衛）。 */
export function runRosterCheck(): number {
  const findings = checkRoster();
  if (findings.length === 0) {
    console.log(
      "✓ 英雄名單漣漪檢查通過（下架↔種子 · 種子↔內容樹 · Go 兩份清單 · 經濟拆分 · 沒有人抄長度 · " +
        "平衡母體↔名單 · 平衡母體↔變身態 · 產出文件的母體↔名單 · 內容樹↔三種身分 · " +
        "名單↔變身態存在 · 營運白名單↔名單 · 稽核母體↔上架面）",
    );
    // ⭐ 上架面**每次都印出來** —— GH#472 的另一半：被稽核略過的東西⛔不可以無聲變多。
    //    ⚠️ 這裡刻意是 `console.log` 而不是斷言：它是**觀測**不是閘（出貨數值⛔不住進斷言，
    //    第二守則「守衛驗機制不驗數字」）。閘是上面第 ⑫ 條「每一支掃描器都要宣告範圍」。
    try {
      const champs = shippedChampionIds(ROOT).size;
      const abilities = shippedAbilityIds(ROOT).size;
      const items = shippedItemIds(ROOT).size;
      const dark = unreachableItemIds(ROOT).length;
      console.log(
        `  上架面：英雄 ${champs}（可選本體＋變身態） · 技能 ${abilities} · ` +
          `道具 ${items}（另有 ${dark} 件在後台貨架關著時一場都拿不到 —— ⛔ 它們不是退場物，` +
          `退場物住 content/_legacy/）`,
      );
    } catch (err) {
      // ⚠️ fail-open 的代價要有人說出來（CLAUDE.md：靜默才是缺陷）。
      console.error(`  ⚠️ 上架面算不出來：${(err as Error).message}`);
      return 1;
    }
    return 0;
  }
  console.error("\n⛔ 英雄名單的下游對不上 —— 這些是**關係**破了，不是某個測試脾氣不好：\n");
  for (const f of findings) {
    console.error(`  ✗ ${f.pair}`);
    console.error(`      ${f.detail}`);
    console.error(`      → ${f.fix}\n`);
  }
  console.error(
    "⭐ 為什麼是這支腳本告訴你，而不是那十條測試：\n" +
      "   它們會紅，但每一條都在講**自己的功能壞了**（語音覆蓋率／VFX 綁定／可施放格數／替身普查），\n" +
      "   沒有一條說得出「名單變短了」。這支說得出來。\n",
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runRosterCheck());
}
