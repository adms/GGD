/**
 * 🕳→🔒 **「正規化器 vs 作者」這一條判準，每一個執行點必須給同一個答案**（GH#1099 · #1101）。
 *
 * ── 量到的（2026-09-07，修之前）────────────────────────────────────────────
 * `tools/parallel-gates/normalizers.json` 的 **`onlyOutsideOwnWrites: true`**
 * （`skillremake:json`，2026-09-02 加入）**只有一個**消費端讀得到
 * （`packages/shared/src/content/import/editorSource.ts`）。另外三個執行點 ——
 * `scripts/genguard.sh` · PreToolUse hook 的 `_generator_owner()` ·
 * 產物隔離區 `scripts/product-quarantine.sh` —— **全部忽略它**：
 *
 * | | 修之前 | 修之後 |
 * |---|---|---|
 * | `genguard content/abilities/godie-e002.w.json` | ⚠️「正規化器⋯**不擋你**」exit 0 | 🚫「產生器 skillremake:json 的產物」exit 1 |
 * | 隔離區對那 127 份 | **主動放行成 644**（105 份） | 全部 444 |
 *
 * ⭐ 失敗形態⑧（消費端存在，但它消費不到）＋ 症狀**完全沉默**：
 * genguard 印「不擋你」與一次正常放行**長得一模一樣**。
 *
 * ── ⭐ 這條閘驗的是**關係**，⛔ 不是「那一格存不存在」──────────────────────
 * 「`normalizers.json` 有沒有 `onlyOutsideOwnWrites`」是一個**名詞**，
 * 而它在修之前就已經是「有」了 —— ⛔ 一條問名詞的閘在這個缺陷面前必然是綠的
 * （CLAUDE.md：配對式後置條件）。⇒ 這裡問的是「**四個執行點答得一不一樣**」。
 *
 * ── 三段 ─────────────────────────────────────────────────────────────────
 * ① **全掃**：846 份被認領的檔，TS（`ownershipOf`）與 python 判準逐檔比對作者集合
 * ② **校準**：先證明「有檔案的分類**只因為**這一格而不同」，⛔ 否則③是空的
 * ③ **接線**：拿②算出來的那一份，把 `genguard.sh` 與 PreToolUse hook **真的跑起來**
 *    ⇒ 誰沒接上判準，誰就在這裡紅（⛔ 不是 grep 原始碼字串 —— 失敗形態⑥）
 *
 * ── ⭐ GH#1101：**第五個執行點** `scripts/lane-plan.sh`（⑤）────────────────
 * 它算「🔒 全域鎖」時寫的是 `if s["name"] not in norm` ——「只要出現在
 * `normalizers.json` 裡就**整支**跳過」⇒ ⭐ 兩格範圍限定詞**都**被忽略
 * （`only` 與 `onlyOutsideOwnWrites`）。量到（2026-09-07，修之前）：
 *
 * | | 修之前 | 修之後 |
 * |---|---|---|
 * | 戶籍表 846 份被認領的檔，判成 🔒 的 | **313** | **440**（判準說 443） |
 * | 兩張都動 `content/abilities/**` 產物的票 | 「**2 條 lane 可並行**」 | 兩批，各自 🔒 |
 *
 * ⚠️ ⭐ 它的失敗**不是靜默的紅燈，是靜默的綠燈** —— 一句「可以並行」與一次
 * 正常放行長得一模一樣，代價要到兩條 lane 互相覆蓋之後才看得到。
 * ⚠️ 殘差 3 份是 lane-plan 的**抽路徑**（RE_PATH）抓不到，⛔ 不是判準：
 * 檔名帶空白（以空白斷字）· repo 根目錄的檔（RE_PATH 只認那幾個根）——
 * ⭐ 後者 lane-plan 自己會列進「沒有 Files 區 ⇒ 排不進來」（⑤ 有一條在驗這件事）。
 *
 * 突變紀錄（2026-09-07 實跑）：
 *   · 把 `scripts/genguard.sh` 裡新接上的那一行（`normalizer_rules.py` 的呼叫）拿掉
 *     ⇒ ③紅，訊息指名 `skillremake:json`。改回來。
 *   · 把 `scripts/lane-plan.sh` 的 `PRODUCTS` 改回 `if s["name"] not in norm`
 *     ⇒ ⑤紅：「127 份的 🔒 判斷與判準不一致」。⚠️ lane-plan **兩種寫法都 exit 0**
 *     ⇒ ⭐ 這條閘比對的是**訊息內容**，⛔ 不是離開碼（GH#1099 踩過的坑）。
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ownershipOf, type NormalizerFacts } from "../content/import/editorSource.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const load = <T,>(f: string): T => JSON.parse(readFileSync(join(REPO, f), "utf8")) as T;

const IO = load<{ steps: { name: string; writes?: string[] }[] }>(
  "tools/parallel-gates/sync-io.json",
);
const NORMS = load<NormalizerFacts>("tools/parallel-gates/normalizers.json");

/**
 * 誰認領這條路徑（⭐ 與三支腳本同一個推導：誰的 `writes` 比中它）。
 *
 * ⚠️ **要去重**：一支 step 可以用兩條 writes（明確路徑 ＋ glob）比中同一個檔 ——
 * 三支腳本都去重（`hit.includes` / `set`），⛔ 這裡不去重就會拿一份假的不一致去比。
 */
const claimants = new Map<string, string[]>();
for (const s of IO.steps)
  for (const w of s.writes ?? [])
    for (const f of /[*?[]/.test(w) ? globSync(w, { cwd: REPO }) : [w]) {
      const cur = claimants.get(f) ?? [];
      if (!cur.includes(s.name)) claimants.set(f, [...cur, s.name]);
      else claimants.set(f, cur);
    }

/**
 * TS 那一個執行點的答案。
 *
 * ⭐ 餵一份**合成的** io（每個認領者只寫這一條路徑）—— 這樣 `writersOf()` 一定回
 * 同一組認領者，⇒ 比到的是**分類**那一半，⛔ 不會混進 glob 展開的差異
 * （`ownershipOf` 的 `globMatches` 只支援 `*`，而戶籍表裡有 `?` 家族）。
 */
const tsAuthors = (f: string, owners: string[]): string[] =>
  ownershipOf(f, { steps: owners.map((name) => ({ name, writes: [f] })) }, NORMS).authors
    .slice()
    .sort();

/** python 那一支（＝三個腳本執行點共用的**唯一住處**），一次批次跑完。 */
function pyAuthors(rows: [string, string[]][]): Map<string, string[]> {
  const out = execFileSync("python3", ["tools/parallel-gates/normalizer_rules.py", "--batch"], {
    cwd: REPO,
    encoding: "utf8",
    input: rows.map(([f, o]) => `${f}\t${o.join(",")}`).join("\n"),
    maxBuffer: 64 * 1024 * 1024,
  });
  const m = new Map<string, string[]>();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const i = line.indexOf("\t");
    m.set(line.slice(0, i), line.slice(i + 1).split(",").filter(Boolean).sort());
  }
  return m;
}

describe("正規化器判準：四個執行點只准有一種說法（GH#1099）", () => {
  const rows = [...claimants.entries()];

  it("① 全掃：每一份被認領的檔，TS 與 python 判準的作者集合逐檔相同", () => {
    const py = pyAuthors(rows);
    const bad = rows
      .filter(([f, o]) => JSON.stringify(tsAuthors(f, o)) !== JSON.stringify(py.get(f) ?? null))
      .map(([f, o]) => `${f}  TS=[${tsAuthors(f, o)}]  py=[${py.get(f) ?? "?"}]`);
    expect(
      bad.slice(0, 8),
      `${bad.length}/${rows.length} 份檔的分類兩邊不一致 —— ` +
        "判準只准有一個住處（tools/parallel-gates/normalizer_rules.py ↔ editorSource.ts）",
    ).toEqual([]);
  });

  it("②③ 校準＋接線：只因這一格而變成產物的檔，genguard 與 hook 都要擋", () => {
    // ── ② ⭐ 量尺先自證：**推導**出「拿掉 onlyOutsideOwnWrites 就會改判」的那些檔。
    //    ⛔ 不是寫死一個路徑（那會在戶籍表變動時靜靜失效）。
    const blind: NormalizerFacts = {
      normalizers: NORMS.normalizers.map((n) => ({ ...n, onlyOutsideOwnWrites: undefined })),
    };
    const discriminators = rows
      .filter(
        ([f, o]) =>
          tsAuthors(f, o).length > 0 &&
          ownershipOf(f, { steps: o.map((name) => ({ name, writes: [f] })) }, blind).authors
            .length === 0,
      )
      .map(([f]) => f);
    expect(
      discriminators.length,
      "⛔ 沒有任何檔的分類取決於 onlyOutsideOwnWrites ⇒ 下面那一段驗不到東西（空的閘）",
    ).toBeGreaterThan(0);

    // ── ③ 接線：把**真的執行檔**跑起來（⛔ 不是 grep 原始碼字串 —— 失敗形態⑥）。
    const probe = discriminators[0]!;
    const gg = spawnSync("bash", ["scripts/genguard.sh", probe], { cwd: REPO, encoding: "utf8" });
    expect(
      `${gg.status} ${gg.stdout}`,
      `genguard 沒接上判準：${probe} 是 skillremake:json 的產物而它說「不擋你」（GH#1099）`,
    ).toMatch(/^1 [\s\S]*是產生器 \*\*skillremake:json\*\* 的產物/);

    const hook = spawnSync("python3", ["scripts/preserve-before-overwrite.py"], {
      cwd: REPO,
      encoding: "utf8",
      input: JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: probe, old_string: "x", new_string: "y" },
        cwd: REPO,
      }),
    });
    expect(
      `${hook.status} ${hook.stderr}`,
      `PreToolUse hook 沒接上判準：${probe} 應該 exit 2 並指名 skillremake:json`,
    ).toMatch(/^2 [\s\S]*skillremake:json/);
  });

  it("④ 隔離區：`onlyOutsideOwnWrites` 的那一支在自己 writes 裡就是**作者** ⇒ 鎖", () => {
    // ⭐ 沙盒（⛔ 不動真的樹）：`fake:both` 登記成正規化器**但帶 onlyOutsideOwnWrites**。
    //   · 判準生效 ⇒ own/shared 有作者 ⇒ 鎖；· 判準被忽略 ⇒ 兩份都被放行成 644。
    const dir = mkdtempSync(join(tmpdir(), "gh1099-"));
    const at = (f: string): string => join(dir, f);
    const [own, shared, outside] = ["own.json", "shared.json", "outside.json"].map(at);
    for (const f of [own!, shared!, outside!]) writeFileSync(f, "{}\n");
    writeFileSync(
      at("io.json"),
      JSON.stringify({
        steps: [
          { name: "fake:both", writes: [own, shared] },
          { name: "fake:norm", writes: [own, outside] },
        ],
      }),
    );
    writeFileSync(
      at("normalizers.json"),
      JSON.stringify({
        normalizers: [
          { step: "fake:both", reason: "沙盒:它也會就地改別人的檔", onlyOutsideOwnWrites: true },
          { step: "fake:norm", reason: "沙盒:純正規化器" },
        ],
      }),
    );
    execFileSync("bash", ["scripts/product-quarantine.sh", "lock"], {
      cwd: REPO,
      env: {
        ...process.env,
        GGD_QUARANTINE_IO: at("io.json"),
        GGD_QUARANTINE_NORMALIZERS: at("normalizers.json"),
      },
    });
    const w = (f: string): number => statSync(f).mode & 0o200;
    expect(w(own!), "在 fake:both 自己的 writes 裡 ⇒ 它是**作者** ⇒ 要鎖").toBe(0);
    expect(w(shared!), "同上（只有 fake:both 認領）").toBe(0);
    expect(w(outside!), "只有純正規化器認領 ⇒ ⛔ 不可以鎖（GH#707 的死路）").not.toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
