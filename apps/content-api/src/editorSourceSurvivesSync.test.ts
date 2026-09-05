/**
 * ⭐⭐ P0-1 §5 —— **改動經 `skills:sync` 之後仍然存在**，而 Owner 文案的位元組不被改寫。
 *
 * ── ⛔ 為什麼這條是承重的 ──────────────────────────────────────────────────
 * 整個 source adapter 存在的理由只有一句：**直接寫產物會被下一次 sync 打回來**。
 * ⇒ ⭐ 如果走了來源那條路**還是**會被打回來，這一整套就沒有意義。
 * ⚠️ 而「它會不會被打回來」⛔ 不是讀程式碼看得出來的 —— ⭐ 要真的跑一次。
 *
 * ⚠️ ⭐ 這一支跑**真的產生器**（`skillremake:json` ＋ 三支會就地改同一批檔的正規化器）。
 * ⛔ 它刻意**不**跑整條 `skills:sync`（那是 40 支、十幾分鐘）——
 * ⭐ 而挑的這三支正是**戶籍表說會寫同一批檔**的那幾支：
 *   `tiers:apply` · `castderive:build:raw` · `skillremake:provenance`
 * ⇒ 會覆蓋它的就是它們，⛔ 其餘 37 支碰不到 `content/abilities/godie-e00s.*`。
 *
 * ── ⛔⛔ GH#1002（2026-09-05）：**它曾經在出貨樹上突變，而逾時就留下殘骸** ────────
 * 第一版逐字做的是：改**真的** `heroes/godie-e00s.py` → 跑鏈 → 斷言 → `finally` 還原。
 * ⭐ timeout 15 分鐘 —— 負載高時真的會逾時，worker 被殺，`finally` 跑不完 ⇒
 * `scatterRadius` 6.0 → 5.25 留在來源、68 份 `content/abilities/*.json` 掉 `castTimeSec`，
 * ⚠️ 而三支閘的訊息全部指著「內容與產生器不一致」，⛔ 沒有一支說「有人動了你的樹」。
 *
 * ⇒ ⭐ 現在整條鏈在 `mkdtemp()` 的**沙盒副本**上跑（`testSourceSandbox.ts`）：
 *   · 出貨樹一個位元組都不寫（下面有兩條斷言**量**這件事，⛔ 不是散文）
 *   · 逾時／被殺 ⇒ 殘骸留在 `/tmp`，⛔ 不在工作樹
 *   · 不再需要 `finally` 還原 ⇒ 鏈只跑**一次**（在此之前是兩次：突變＋還原）
 *   · 鏈的每一步直接呼叫 package.json 那幾支 script 底下的**同一個檔**
 *     （⛔ 不經 `genrun.sh` —— 隔離區與內容樹鎖是出貨樹的機制，沙盒沒有那棵樹）；
 *     ⭐ 「跑的是不是出貨的那一支」由下面第二條 `it` 釘住（失敗形態⑤）。
 *
 * ── ⛔⛔ 2026-09-02 量到的：**不是每一格都會原樣存活，而那是對的** ──────────
 * 第一版這條測試改的是 `cooldown`（`[90,90,90] → [77,77,77]`），⭐ 而它紅了 ——
 * 回來仍是 **90**。⛔ 根因不是接縫壞掉：`tierize()` 是「值 → 級別 → 值」，
 * 而 **77 與 90 落在同一個級距（大）** ⇒ 兩者都解析回 90。
 * ⭐ 那正是第〇·四守則要的行為（值在載入時從共用表解析）。
 *
 * ⇒ ⭐ 所以這一支驗**兩個方向**（⛔ 單邊校準的尺會在最需要說話時沉默）：
 *   ① 非級距欄位（`effects[0].scatterRadius`）⇒ **原樣存活**
 *   ② 級距欄位（`cooldown`）⇒ **被解析回級距值**，而契約有宣告它
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把改動直接寫進**產物**（⛔ 不走來源）再跑同一串 → 🔴（改動被打回來）
 *   · GH#1002 落地時量到：沙盒沒有 git HEAD → 🔴，訊息指名 `batch1.py --no-build` 那一步並貼出
 *     `git ls-tree … exit 128`（⭐ 失敗路徑真的走過，⛔ 不是只有綠燈那一邊）
 */
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NORMALIZER_OWNED_FIELDS } from "@ggd/shared/content/import/editorSource";
import { REPO, makeSourceSandbox, removeSandbox } from "./testSourceSandbox";

const SRC_REL = "tools/skill-remake/heroes/godie-e00s.py";
const PRODUCT_REL = "content/abilities/godie-e00s.r.json";
/** 與 `buildIndexes.ts` 呼叫 roster-guard 用的是同一條路（⛔ 不靠 PATH 上的 npx）。 */
const TSX = join(REPO, "node_modules/tsx/dist/cli.mjs");
const PKG = join(REPO, "packages/shared");

interface Step {
  readonly name: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}

/**
 * ⭐ 出貨鏈 —— 與第一版的 `OVERWRITERS` 逐步同序，每一步直接跑 package.json 那支 script
 * 底下的檔：
 *   skillremake:json:no-build → batch1.py --no-build
 *   content:build:indexes-only → packages/shared: buildIndexes.ts（吃 GGD_CONTENT_DIR）
 *   castderive:build:raw → deriveCastTimes.ts --write（吃 GGD_CONTENT_DIR）
 *   （build ⇄ derive 三趟：`deriveCastTime()` 讀索引裡渲染後的 `{{cast}}`，要到定點）
 *   tiers:apply:raw → apply_tiers.py · skillremake:provenance:raw → stamp_provenance.py
 * ⚠️ python 那三支從 `__file__` 推 ROOT ⇒ 沙盒裡的副本自然寫沙盒的 `content/`。
 */
function chain(root: string): readonly Step[] {
  const py = (file: string, ...args: string[]): Step => ({
    name: `python3 tools/skill-remake/${file} ${args.join(" ")}`.trim(),
    argv: ["python3", join(root, "tools/skill-remake", file), ...args],
    cwd: root,
  });
  const ts = (file: string, ...args: string[]): Step => ({
    name: `tsx packages/shared/scripts/${file} ${args.join(" ")}`.trim(),
    argv: [process.execPath, TSX, join(PKG, "scripts", file), ...args],
    cwd: PKG,
  });
  const build = ts("buildIndexes.ts");
  const derive = ts("deriveCastTimes.ts", "--write");
  return [
    py("batch1.py", "--no-build"),
    build,
    derive,
    build,
    derive,
    build,
    derive,
    py("apply_tiers.py"),
    py("stamp_provenance.py"),
  ];
}

function run(step: Step, root: string): void {
  try {
    execFileSync(step.argv[0]!, step.argv.slice(1), {
      cwd: step.cwd,
      stdio: "pipe",
      timeout: 5 * 60_000,
      // ⭐ 兩支 tsx 腳本靠 GGD_CONTENT_DIR 指到沙盒（`buildEditorTargetProfile.ts:66` 也吃它 ——
      //   它曾經不吃而把沙盒 build 寫進真的工作樹，見該檔檔頭）。
      // ⚠️ GGD_RECONCILE_OFF 對沙盒無意義（沒有 genrun），留著只是讓任何巢狀 genrun 不對帳。
      env: { ...process.env, GGD_CONTENT_DIR: join(root, "content"), GGD_RECONCILE_OFF: "1" },
    });
  } catch (e) {
    const err = e as { status?: number | null; signal?: string | null; stdout?: Buffer; stderr?: Buffer };
    const tail = (b?: Buffer): string => (b ? b.toString("utf8").slice(-1500) : "");
    throw new Error(
      `⛔ 沙盒裡的產生器步驟失敗：${step.name}（exit ${String(err.status)} signal ${String(err.signal)}）\n` +
        `⭐ 這是**沙盒**（${root}）—— 出貨樹沒被碰；先看下面的輸出，⛔ 不要去改 content/。\n` +
        `stdout:\n${tail(err.stdout)}\nstderr:\n${tail(err.stderr)}`,
      { cause: e },
    );
  }
}

interface Product {
  readonly cooldown: number[];
  readonly description: string;
  readonly effects: { scatterRadius?: number }[];
}
const read = (p: string): Product => JSON.parse(readFileSync(p, "utf8")) as Product;

describe("P0-1 §5 來源改動撐得過 sync（⭐ 在沙盒副本上，⛔ 不碰出貨樹）", () => {
  let root: string | undefined;
  afterAll(() => {
    if (root !== undefined) removeSandbox(root);
  });

  it(
    "★★ ⭐ 改**來源**的一個非級距欄位 ⇒ 重生成 ⇒ 三支正規化器跑完，那個值**還在**",
    () => {
      // ── 儀器：出貨樹的來源與產物在測試**前後**逐位元組相同（GH#1002 的驗收條件②）──
      const realSrc = readFileSync(join(REPO, SRC_REL));
      const realProduct = readFileSync(join(REPO, PRODUCT_REL));

      root = makeSourceSandbox("generator-chain");
      const src = join(root, SRC_REL);
      const product = join(root, PRODUCT_REL);
      const srcBefore = readFileSync(src, "utf8");
      const before = read(product);
      // ⭐ 錨點挑**非級距**欄位：`scatterRadius` 是 effect 的原始參數，
      //   ⛔ 不歸任何一張級距表 ⇒ 它是「來源改動存不存活」的**乾淨**儀器。
      // ⚠️ ⛔ 不可以拿 `cooldown` 當錨點（第一版就是這樣紅的）——見下面那一條。
      const anchor = /"scatterRadius": 6\.0/;
      expect(anchor.test(srcBefore), "夾具錨點對不上 —— 來源改過了，先更新這條測試").toBe(true);
      expect(before.effects[0]?.scatterRadius, "儀器：改之前不是 6.0 ⇒ 下面量的是空氣").toBe(6.0);

      writeFileSync(src, srcBefore.replace(anchor, '"scatterRadius": 5.25'), "utf8");
      for (const step of chain(root)) run(step, root);
      const after = read(product);

      // ── ① ⭐ 承重的那一條：**非級距欄位原樣存活** ──────────────────────────
      expect(
        after.effects[0]?.scatterRadius,
        "⛔⛔ 改了**來源**、跑完重生成與三支正規化器之後，那個值**不見了** ⇒\n" +
          "⭐ source adapter 這一整套沒有意義（它存在的唯一理由就是「不會被打回來」）。",
      ).toBe(5.25);

      // ── ② ⭐⭐ 而**級距欄位不會**原樣存活 —— ⛔ 這不是缺陷，是第〇·四守則 ──────
      //   ⚠️ 這一條就是 `NORMALIZER_OWNED_FIELDS` 的**量測依據**：
      //     `tierize()` 是「值 → 級別 → 值」⇒ 來源寫什麼，回來的都是**級距表**的值。
      //   ⛔ 少了這條斷言，那份清單就只是一句散文（而散文會過期）。
      expect(
        after.cooldown,
        "⛔ 級距欄位竟然原樣存活了 ⇒ `tierize()` 沒有跑，⭐ 而 `normalizedFields` 這一格" +
          "正在對編輯器說謊（它宣稱這幾格會被下游改寫）。",
      ).toEqual(before.cooldown);
      expect(NORMALIZER_OWNED_FIELDS, "契約沒有宣告 `cooldown` 會被正規化器改寫").toContain("cooldown");

      // ── ⭐ GH#1002：整條鏈跑完，**出貨樹一個位元組都沒動** ─────────────────────
      const untouched = (rel: string, was: Buffer): void =>
        expect(
          readFileSync(join(REPO, rel)).equals(was),
          `⛔⛔ 出貨樹的 ${rel} 在這條測試期間**變了** ⇒ 要嘛沙盒漏了（這條測試的 bug），` +
            "要嘛有人同時在編它 —— ⭐ 先 `git diff -- " + rel + "` 看是哪一種，⛔ 不要照著別的閘去改內容。",
        ).toBe(true);
      untouched(SRC_REL, realSrc);
      untouched(PRODUCT_REL, realProduct);
    },
    10 * 60_000,
  );

  it("★ ⭐ 沙盒跑的每一步都還是 package.json 裡出貨的那一支（⛔ 失敗形態⑤：被測的不是出貨的那個）", () => {
    const scripts = (p: string): Record<string, string> =>
      (JSON.parse(readFileSync(join(REPO, p), "utf8")) as { scripts: Record<string, string> }).scripts;
    const rootScripts = scripts("package.json");
    const shared = scripts("packages/shared/package.json");
    const pins: readonly [string, string, string][] = [
      ["skillremake:json:no-build", "tools/skill-remake/batch1.py --no-build", rootScripts["skillremake:json:no-build"] ?? ""],
      ["content:build:indexes-only", "@ggd/shared content:build", rootScripts["content:build:indexes-only"] ?? ""],
      ["@ggd/shared content:build", "scripts/buildIndexes.ts", shared["content:build"] ?? ""],
      ["castderive:build:raw", "scripts/deriveCastTimes.ts --write", rootScripts["castderive:build:raw"] ?? ""],
      ["tiers:apply:raw", "tools/skill-remake/apply_tiers.py", rootScripts["tiers:apply:raw"] ?? ""],
      ["skillremake:provenance:raw", "tools/skill-remake/stamp_provenance.py", rootScripts["skillremake:provenance:raw"] ?? ""],
    ];
    for (const [script, mustRun, actual] of pins) {
      expect(
        actual,
        `⛔ package.json 的 \`${script}\` 不再跑 \`${mustRun}\` ⇒ 上面那條測試跑的鏈已經不是出貨鏈，先把 chain() 對回去`,
      ).toContain(mustRun);
    }
  });

  it("★ ⭐ Owner 文案的**位元組**不被 JSON round-trip 改寫", () => {
    const PRODUCT = join(REPO, PRODUCT_REL);
    const doc = JSON.parse(readFileSync(PRODUCT, "utf8")) as {
      description: string;
    };
    // ⭐ 這一段裡有 owner 的口語、全形括號、換行與 emoji-free 中文標點 ——
    //   ⛔ 一個「順手正規化」的 round-trip 會把它們改掉，而卡面上看不出來。
    const raw = readFileSync(PRODUCT, "utf8");
    // ⭐ 驗的是**文字欄位的位元組**在 parse→stringify 之後逐字不變 ——
    //   ⛔ 不是整份檔的縮排（那是產生器的格式，與 owner 文案是兩件事）。
    const round = (
      JSON.parse(JSON.stringify(JSON.parse(raw))) as { description: string }
    ).description;
    expect(
      round,
      "⛔⛔ 一次 JSON round-trip 就改掉了 owner 的文案位元組 ⇒\n" +
        "⭐ 而 owner 的原文在同一 revision 內是 immutable 的（規格 §3.5）：" +
        "不縮寫、不潤飾、不刪除幽默內容。",
    ).toBe(doc.description);
    // ⭐ 而 `\u` 逃逸也算改寫：中文與全形標點必須以**原字元**存在檔案裡。
    expect(
      raw.includes("\\u"),
      "⛔ 產物裡有 `\\u` 逃逸 ⇒ owner 的中文被轉義了（讀起來一樣，位元組不一樣）",
    ).toBe(false);
    // ⭐ 逐字驗那句台詞還在（⛔ 不是「長度差不多」）。
    expect(doc.description).toContain(
      "「想到以前某個夜晚一隻大貓跟兩個蘿莉一直要我下面長大呢」",
    );
  });
});
