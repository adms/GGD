/**
 * 🪜 **逐階曲線不可以級距化** —— GH#789 的回歸閘（2026-08-27 同一天紅了兩次）。
 *
 * ## 這條規則早就寫過，只是沒有閘
 * `cooldownTier` 的契約說明逐字寫著：「填了級別 = **每一階同一個值**。要做
 * 『升階冷卻下降』就⛔ 不要填級別」。⭐ 那句話對**每一條**五級距軸都成立 ——
 * 而 `perRank` / `ranks` 的存在**就是為了「每一階不同」**。兩者放在一起，
 * 升階曲線會被靜默壓平成一條水平線。
 *
 * ## 量到的（⛔ 不是假設）
 * #789 把移速加成級距化時漏了這條，實際發生：
 *   · 22-01 鬼隱之擊 `perRank` **0.5 / 0.5 / 0.5 / 1.5 / 3.0** → 中 / 中 / 中 / 大 / 極大
 *     ＝ 0.5 / 0.5 / 0.5 / **1** / **4**（rank4 從 +150% 變 +100%）
 *   · 14-03 魔力應援 `ranks`（⚠️ **另一個**逐階載體）同型
 * 兩者都是 `nativeFidelity.test.ts` 抓到的 —— ⭐ 那條守衛驗的是「原作的數字有沒有到達遊戲」，
 * 所以它**碰巧**罩住了這件事。⛔ 但它只罩住有 w3a 對照的那幾支：其餘 40 個節點沒有人問。
 *
 * ## ⚠️ 判準是「**壓平**」，⛔ 不是「有級別欄位」
 * 第一版我寫成「逐階載體底下不可以有級別欄位」—— 那**太寬**：實測 60+ 個節點
 * 每一階填的是**同一個級別**（極小/極小/極小/極小），那是合法的
 * （「這一招的範圍不隨階數變」本來就是一種設計）。
 * ⭐ 真正的缺陷是**原本每階不同、被級距的網格改成相同或改變了比例** ——
 * 判準因此是：**同一條逐階序列裡，級別全同 ⇒ 放行；有差異 ⇒ 那本來就是曲線，
 * 而曲線用級別表達會被網格量化** ⇒ 紅。
 * ⛔ 這一版仍然不是名單：它問的是序列自己的形狀。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────────
 *  · `tools/skill-remake/tierize.py` 的 `PER_RANK_KEYS` 拿掉 `"ranks"` 再跑
 *    `bash scripts/genrun.sh tiers:apply` → 14-03 魔力應援的 4 個節點被級距化
 *    → 這一條紅並逐節點指名（實測過，訊息含 `godie-etyr.w`）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIRS = ["content/abilities", "content/champions", "content/items", "content/augments"];

/** ⭐ 逐階載體：這些鍵底下的值「每一階不同」。⛔ 新增第三種時要補進來。 */
const PER_RANK_KEYS = new Set(["perRank", "ranks"]);
/** 級別欄位的判準：名字以 `Tier` 結尾 —— ⭐ 對未來新軸自動成立。 */
const isTierField = (k: string): boolean => k.endsWith("Tier");

interface Hit {
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly value: unknown;
}

/**
 * 掃一份文件：對**每一個逐階陣列**，把它各階同位置的級別欄位收成一條序列，
 * ⭐ 只有**序列裡出現不同級別**時才算命中（見檔頭「判準是壓平」那一段）。
 */
function scan(file: string, doc: unknown): Hit[] {
  const hits: Hit[] = [];

  /** 一階的子樹 → `路徑後綴 → 級別值`。 */
  const tiersOf = (node: unknown, path = ""): Map<string, unknown> => {
    const out = new Map<string, unknown>();
    const walk = (n: unknown, p: string): void => {
      if (Array.isArray(n)) return n.forEach((v, i) => walk(v, `${p}[${i}]`));
      if (n === null || typeof n !== "object") return;
      const rec = n as Record<string, unknown>;
      for (const [k, v] of Object.entries(rec)) {
        if (isTierField(k)) out.set(`${p}.${k}`, v);
        else walk(v, `${p}.${k}`);
      }
    };
    walk(node, path);
    return out;
  };

  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (node === null || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      if (PER_RANK_KEYS.has(k) && Array.isArray(v) && v.length > 1) {
        // ⭐ 同位置逐階比對：全同 ⇒ 合法（範圍不隨階數變）；有差異 ⇒ 那是被量化的曲線。
        const perRank = v.map((r) => tiersOf(r));
        const keys = new Set<string>();
        for (const m of perRank) for (const kk of m.keys()) keys.add(kk);
        for (const kk of keys) {
          const seq = perRank.map((m) => m.get(kk));
          const distinct = new Set(seq.map((x) => JSON.stringify(x)));
          if (distinct.size > 1) {
            hits.push({ file, path: `${path}.${k}${kk}`, field: kk.split(".").pop() ?? kk, value: seq.join(" / ") });
          }
        }
      }
      walk(v, `${path}.${k}`);
    }
  };
  walk(doc, "");
  return hits;
}

describe("逐階曲線不可以級距化 (per-rank-not-tierified)", () => {
  it("⭐ 沒有任何一條逐階序列的級別是**逐階不同**的（那代表曲線被網格量化了）", () => {
    const hits: Hit[] = [];
    let scanned = 0;
    for (const dir of DIRS) {
      let files: string[];
      try {
        files = readdirSync(join(REPO, dir));
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".json") || f.startsWith("_")) continue;
        scanned += 1;
        const raw = readFileSync(join(REPO, dir, f), "utf8");
        if (!raw.includes("Tier")) continue;
        hits.push(...scan(`${dir}/${f}`, JSON.parse(raw)));
      }
    }
    expect(scanned, "一份文件都沒掃到 —— 母體壞了").toBeGreaterThan(100);
    expect(
      hits.map((h) => `${h.file}${h.path} 的 ${h.field} 逐階＝${String(h.value)}`).join("\n"),
      "⛔ 這些**逐階序列**用級別表達，而且各階不同 —— 那是一條被五級距網格量化過的曲線。\n" +
        "⭐ 五級距的語意是「填了級別 = 每一階同一個值」（`cooldownTier` 的契約說明逐字寫過），\n" +
        "   而 perRank / ranks 的存在就是為了「每一階不同」。兩者不相容。\n" +
        "⇒ 修法：改**產生器**（`tools/skill-remake/tierize.py` 的 `PER_RANK_KEYS`）讓它整條跳過，\n" +
        "   然後 `bash scripts/genrun.sh tiers:apply` 重生成 —— ⛔ 不要手改產物。\n" +
        "⚠️ 已經被吃掉的值救不回來（tierize 是冪等的）：從 `git show <級距化之前>:<檔>` 取原值。",
    ).toBe("");
  });
});
