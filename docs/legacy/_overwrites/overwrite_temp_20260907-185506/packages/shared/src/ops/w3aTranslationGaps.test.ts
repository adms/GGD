/**
 * w3aTranslationGaps.test.ts —— ⭐ **一筆 w3a↔GGD 的落差不可以無聲地漂。**
 *
 * owner 2026-08-26：
 *
 * > 「你應該做的事情是 **翻譯 JASS to 編輯器JSON**，如果 **JSON 沒支援的標籤或邏輯則去實作**才對阿」
 * > 「這個的做法還會**缺一個部分**就是 **w3x 原始技能的設定特效與機制包含傷害方式**，也請一起考慮翻譯進去」
 *
 * ⇒ 這條閘要的**不是**「w3a 的數字跟 GGD 一樣」——第〇·六守則的階梯本來就允許
 * 高層級（owner 的新版說明 / 五級距裁決）推翻原作。它要的是：
 *
 *   ⭐ **每一筆不同，都要指得出「是哪一層贏了」。**
 *
 * 在此之前那個資訊**一個位元組都不存在**：W3A-DIFF 量到 405 支裡 `⚪ 已翻譯 = 0`，
 * 而 🟡（級距取代）與 ⚫（無主）在 JSON 裡長得一模一樣 —— 正是本 repo 反覆記錄的
 * 「兩種東西長得一樣就會被混用」。
 *
 * ── 三份東西 ─────────────────────────────────────────────────────────────────
 *   · 產生器 `tools/w3a-translate/gen.py`（`pnpm w3a:build` / `pnpm w3a:check`）
 *   · 產物   `tools/w3a-translate/gaps.json`（逐軸/逐支落差 + tally）
 *   · 帳本   `tools/w3a-translate/gap-ledger.json`（**人編的裁決**：哪一層贏了 + 理由）
 *
 * ── 這條閘問六件事 ───────────────────────────────────────────────────────────
 *   ① 產物新鮮（真的把 `--check` 跑起來，⛔ 不是掃原始碼字串 —— 失敗形態⑥）
 *   ② 每一個落差類別都有帳本列（新冒出來的類別 ⇒ 紅，⛔ 不會靜靜地變成「正常」）
 *   ③ ⭐ **棘輪**：`max` 必須逐字等於量到的筆數 —— 修好了要調降，變多了要當場被看見
 *   ④ ⛔ 沒有殭屍列：一列罩不到任何活的落差就要刪掉
 *   ⑤ 理由要能被反駁：layer ∈ 階梯的合法值、長度下限、⚫無主 一定要帶 followUp
 *   ⑥ ⭐ **這支普查看得穿模板**（GH#1104）—— 見下面那一節
 *
 * ── ⑥ 為什麼要多一條「接模板前後同一個答案」（GH#1104） ──────────────────────
 * `gen.py` 掃的是**原始**技能文件（`_walk_numbers(doc,"radius",acc)` ＋
 * `_has_key(doc,"radiusTier")`）⇒ 技能一接上模板，那幾格就搬進 `template.params`。
 *
 * ⭐ 而症狀**不是「數字消失」**（空表會被①②③抓到），是**數字變成另一個數字**：
 * `godie-hvsh.passive`（48-00 石化之眼）的 `ggdValue` 從 **4.5** 變成 **245.45** ——
 * 兩個都是**同一個半徑**（4.5 是 GGD 場地單位，245.45 是 `unit:"wc3u"` 的模板參數），
 * 而技能**一個位元組都沒變**、`templatizeEquivalence` 同時 128/128 逐位元等價。
 * ⇒ ⛔ 只有這支普查看到了不同的世界。
 *
 * ⚠️ ⑥ 驗的是「**普查看不看得穿模板**」，⛔ 不是「數字是多少」（第二守則：守衛驗
 * 機制不驗數字，而數值是 owner 每週在改的東西）。它餵**兩份真的不同的 JSON**：
 * 磁碟上那一份（數值住 `template.params`）與同一支被出貨展開器攤開的樣子
 * （＝ `eject()`），兩份走**同一條**掃描路徑，答案必須逐格相等。
 * ⭐ 反方向也在同一支腳本裡：沒接模板的 215 支，`_prepare()` 必須是 identity。
 *
 * ── GUARD-THE-GUARD ─────────────────────────────────────────────────────────
 *   母體掃到 0 對任何內容都是綠的 ⇒ 先斷言母體下限，再餵一個**自造的**落差類別
 *   給②的偵測（sentinel），抓不到就代表這條閘在測空氣。
 *
 * ⚠️ 它紅了**不要改這條測試**，也⛔ 不要手改那三份產物：
 *     pnpm w3a:build && git add docs/w3a*.md tools/w3a-translate/
 * 落差本身的修法在 `docs/w3a落差表.md` §2 的 `followUp` 欄。
 * ⛔⛔ 而「修落差」**不等於**改出貨數值 —— owner 常設「公式已定好，只調系統倍率」。
 *
 * 突變紀錄（一條，最承重）：把 `gap-ledger.json` 裡 `scaling:translatable:str`
 * 的 `max` 從 25 改成 26 → ③紅並指名那一列（「量到 25、帳本寫 26」）。改回來。
 *
 * 突變紀錄（⑥，GH#1104）：把 `gen.py::_prepare()` 的展開那一行改成 `return doc`
 * → ⑥紅，訊息逐字寫「⛔ 28/206 支接了模板的技能，接模板前後給出**不同的答案**」
 * 並逐支列出哪一軸差多少（含 `godie-hvsh.passive —— radius: 接模板後 (245.45, True)
 * ≠ 接模板前 (4.5, True)`）。改回來。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = join(REPO, "tools/w3a-translate/gen.py");
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), "utf8"));

type Ruling = { key: string; max: number; layer: string; reason: string; followUp?: string };
const LAYERS = new Set([
  "L1-owner-spec",
  "L2-editor-json",
  "L3-jass",
  "L4-w3x-tooltip",
  "L5-w3x-objdata",
  "GGD-tier-table",
  "engine-vocab-missing",
  "⚫無主",
]);
/** 一筆落差要進帳本嗎？`:same`（一樣）與 `:w3a-absent`（原作沒這一格）不是落差。 */
const isGap = (key: string) => !key.endsWith(":same") && !key.endsWith(":w3a-absent");
/** ②的偵測 —— 抽成函式才餵得進 sentinel（量尺先自證）。 */
const unledgered = (tally: Record<string, number>, keys: Set<string>) =>
  Object.keys(tally).filter((k) => isGap(k) && !keys.has(k)).sort();
/** 真的把腳本跑起來（⛔ 不是掃原始碼字串 —— 失敗形態⑥），回 離開碼 ＋ 它說了什麼。 */
function runGen(...args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("python3", [GEN, ...args], { cwd: REPO, encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("w3a 翻譯落差", () => {
  const gaps = read("tools/w3a-translate/gaps.json") as {
    joined: number;
    tally: Record<string, number>;
    gaps: { key: string }[];
  };
  const rulings = (read("tools/w3a-translate/gap-ledger.json") as { rulings: Ruling[] }).rulings;
  const keys = new Set(rulings.map((r) => r.key));

  it("① 兩份文件與 gaps.json 仍然等於重新產生的（逐位元組）", () => {
    cover("w3a-translation-gaps");
    expect(existsSync(GEN), "gen.py 不見了 —— 這條守衛在測空氣").toBe(true);
    const { code, out } = runGen("--check");
    expect(
      code,
      `w3a 翻譯來源/落差表過期了。⛔ 不要改這條測試,⛔ 也不要手改那三份產物(隔離區 chmod 444) —— 跑：\n` +
        `    pnpm w3a:build && git add docs/w3a*.md tools/w3a-translate/\n腳本說：${out.trim()}`,
    ).toBe(0);
  });

  it("GUARD-THE-GUARD —— 母體有下限,而且②的偵測抓得到一個自造的落差", () => {
    expect(gaps.joined, "接得上的技能對掉到 400 以下 ⇒ join 壞了,⛔ 不是真的沒落差").toBeGreaterThan(400);
    expect(gaps.gaps.length, "落差列表空了 ⇒ 分類器壞了").toBeGreaterThan(400);
    expect(rulings.length, "帳本空了 ⇒ 下面每一條斷言都會空過").toBeGreaterThan(10);
    // sentinel：一個帳本沒有的類別必須被抓到,而 `:same` / `:w3a-absent` 必須被放過。
    expect(unledgered({ "scaling:translatable:哨兵": 1, "cooldown:same": 9 }, keys)).toEqual([
      "scaling:translatable:哨兵",
    ]);
  });

  it("② 每一個落差類別都在帳本裡（新冒出來的 ⇒ 紅）", () => {
    const missing = unledgered(gaps.tally, keys);
    expect(
      missing,
      `這幾個落差類別沒有任何裁決 —— 「w3a 說 A、我們出貨 B」而**指不出哪一層贏了**：\n` +
        missing.map((k) => `  ${k}（${gaps.tally[k]} 筆）`).join("\n") +
        `\n→ 在 tools/w3a-translate/gap-ledger.json 的 rulings 補一列：layer(哪一層贏了) + reason(能被反駁的理由)。` +
        `\n⛔ 不要為了讓閘變綠而寫「還沒收」—— 那不是理由,那是把落差埋起來。`,
    ).toEqual([]);
  });

  it("③ ⭐ 棘輪 —— max 逐字等於量到的筆數（只准往下走）", () => {
    const drift = rulings
      .map((r) => ({ key: r.key, want: gaps.tally[r.key] ?? 0, max: r.max }))
      .filter((d) => d.want !== d.max);
    expect(
      drift,
      `帳本的 max 與量到的筆數對不上：\n` +
        drift
          .map(
            (d) =>
              `  ${d.key}：量到 ${d.want}、帳本寫 ${d.max}` +
              (d.want < d.max ? "（⭐ 修好了 ⇒ 把 max 調降成量到的數字）" : "（⚠️ 變多了 ⇒ 先看那幾支為什麼漂,⛔ 不要順手把 max 調高）"),
          )
          .join("\n"),
    ).toEqual([]);
  });

  it("④ ⛔ 沒有殭屍列 —— 一列罩不到任何活的落差就要刪掉", () => {
    const dead = rulings.filter((r) => (gaps.tally[r.key] ?? 0) === 0).map((r) => r.key);
    expect(
      dead,
      `這幾列已經罩不到任何落差了,刪掉它們：\n  ${dead.join("\n  ")}\n` +
        `⛔ 留著一列說「這裡有問題」的裁決,下一個人讀到的是一個不存在的問題。`,
    ).toEqual([]);
  });

  it("⑤ 每一列的裁決要能被反駁（layer 合法 · 理由夠具體 · ⚫無主 要帶 followUp）", () => {
    const bad: string[] = [];
    for (const r of rulings) {
      if (!LAYERS.has(r.layer)) bad.push(`${r.key}：layer「${r.layer}」不是階梯上的一層`);
      if ((r.reason ?? "").length < 40) bad.push(`${r.key}：理由太短 —— 一句同義反覆不是理由`);
      if (/還沒收|待辦|之後再說|TODO/.test(r.reason ?? "")) bad.push(`${r.key}：「還沒收」不是能被反駁的理由`);
      // ⭐ 兩種層一定要帶下一步：⚫無主（沒有結論）與 engine-vocab-missing
      //    （owner：「JSON 沒支援的標籤或邏輯則**去實作**」—— 那本身就是一個待辦）。
      //    ⛔ 其餘的層是**已經有結論**的,帶 followUp 反而表示那個結論還沒定。
      const needs = r.layer === "⚫無主" || r.layer === "engine-vocab-missing";
      if (needs && !r.followUp) bad.push(`${r.key}：${r.layer} 一定要寫下**下一步是什麼**（followUp）`);
      if (!needs && r.followUp) bad.push(`${r.key}：已經有結論的層不該帶 followUp`);
    }
    expect(bad, `帳本的這幾列站不住：\n  ${bad.join("\n  ")}`).toEqual([]);
  });
});
