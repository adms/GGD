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
 * ── 用法 ─────────────────────────────────────────────────────────────
 *   pnpm roster:check          # 單獨跑（~1 秒）
 *   pnpm content:build         # ⭐ 自動跑（buildIndexes 結尾呼叫）
 *
 * 失敗回非零，並逐條說「哪兩份東西對不上、去哪裡改」。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STARTER_GO = "apps/platform/internal/curation/starter.go";
const STARTER_GO_TEST = "apps/platform/internal/curation/starter_content_test.go";
const ROSTER_JSON = "content/config/roster.json";

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

/** 內容樹裡真的存在的英雄 id。 */
function championsOnDisk(): Set<string> {
  const dir = join(ROOT, "content/champions");
  const ids = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    ids.add((JSON.parse(readFileSync(join(dir, f), "utf8")) as { id: string }).id);
  }
  return ids;
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

  return out;
}

/** 會提到名單長度的說明文件。⛔ 新增一份就加一列 —— 這支不做全 repo 掃描。 */
const DOCS_WITH_ROSTER_COUNT = ["docs/hero-archetypes.json"];

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
    console.log("✓ 英雄名單漣漪檢查通過（下架↔種子 · 種子↔內容樹 · Go 兩份清單 · 經濟拆分 · 沒有人抄長度）");
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
