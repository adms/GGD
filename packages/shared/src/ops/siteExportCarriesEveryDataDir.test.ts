/**
 * siteExportCarriesEveryDataDir.test.ts —— 搬遷包**漏掉東西**要會紅（GH#857）
 *
 * ── owner 的問題 ────────────────────────────────────────────────────────────
 * > 「我要做一個**系統重大搬遷** 我要確定後台**資料搬遷頁**是否**有效**
 * >  並且**有包含到所有資料**能一起打包備份」（2026-08-28）
 *
 * 「有效」那一半有測試在守（platformarchive 的 76 條）。
 * ⭐ **「有包含到所有資料」那一半在 2026-08-30 之前沒有任何東西在守。**
 *
 * ── 這條守衛在守什麼 ──────────────────────────────────────────────────────
 * `site-export.sh` 的 `CARRY` 是一張**手寫名單**，而它的迴圈是
 * 「名單上的每一格，實體在不在？」—— ⭐ 也就是**只從宣告那一頭走**。
 * ⚠️ 那個形狀**結構上**看不見反方向的缺陷：**實體在，而名單上沒有它**。
 * （CLAUDE.md 失敗形態⑫：「從『宣告』走 ⇒ 一定漏掉『有實體而無宣告』的。
 *   ⇒ ⭐ **兩頭都要走**，⛔ 一頭不算。」）
 *
 * 2026-08-30 第一次反方向掃就抓到 **`match-stats`（14 MB）**，而三份出貨的東西
 * 都說它該被帶走：runbook 逐字寫 **❌ 不可再生**、`scope.go:318` 的 ZIP 路徑
 * **刻意**帶它、實體真的躺在 `data/` 裡。⇒ ⭐ **兩條備份路徑對同一份資料給出
 * 相反的答案，而沒有任何東西會紅。**
 *
 * ⚠️ 為什麼這一條在 CI 裡（腳本自己也有同款檢查）：腳本那一段只有**跑搬遷的那一刻**
 * 才會響，而那正是最不該第一次發現問題的時刻。這一條在**編輯發生的當下**響。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "../../../..");
const SCRIPT = join(REPO, "scripts/site-export.sh");
const RUNBOOK = join(REPO, "docs/runbooks/offsite-backup.md");

/** 從腳本裡撈一個 bash 陣列的元素（⭐ 讀**出貨的那一份**，⛔ 不抄第二份名單）。 */
function bashArray(src: string, name: string): string[] {
  const m = new RegExp(`^${name}=\\(([\\s\\S]*?)\\)`, "m").exec(src);
  if (!m) return [];
  return (m[1] ?? "")
    .split(/\s+/)
    .map((t) => (t.replace(/^["']|["']$/g, "").split("|")[0] ?? "").trim())
    .filter(Boolean);
}

const src = existsSync(SCRIPT) ? readFileSync(SCRIPT, "utf8") : "";
const CARRIED = new Set([
  ...bashArray(src, "CARRY"),
  ...bashArray(src, "BULK"),
  ...bashArray(src, "CRITICAL_BULK"),
]);
const LEFT = new Set(bashArray(src, "LEAVE_BEHIND"));

/**
 * 棘輪豁免表 —— ⭐ **只能變短**。每一筆要帶一個**可以被反駁的**理由。
 * ⛔ 空的就是空的：今天 `data/` 底下每一格都被宣告過了。
 */
const EXEMPT: Record<string, string> = {};

describe("scripts/site-export.sh —— 「不在備份裡」不可以和「我忘了」長得一樣", () => {
  it("腳本存在，而且四張名單都解析得到（⭐ 量尺先自證）", () => {
    expect(src.length, `找不到 ${SCRIPT}`).toBeGreaterThan(0);
    // 正向校準：已知一定在的兩格要撈得到
    expect(CARRIED.has("accounts"), "解析器撈不到 accounts ⇒ 下面的結論全部作廢").toBe(true);
    expect(LEFT.size, "LEAVE_BEHIND 解析不到 ⇒ 這條守衛在空轉").toBeGreaterThan(0);
    // ⭐ 反方向校準：一個不存在的名字**必須**撈不到
    expect(CARRIED.has("ggd-no-such-collection")).toBe(false);
  });

  it("★ runbook 說「❌ 不可再生」的每一格，都要真的被帶走", () => {
    const rows = readFileSync(RUNBOOK, "utf8").matchAll(
      /^\|\s*`([a-z0-9-]+)\/`\s*\|[^|]*\|\s*❌[^|]*\|/gm,
    );
    const mustCarry = [...rows].map((m) => m[1] ?? "").filter(Boolean);
    // 量尺自證：這張表不可以是空的（改版把表格式改掉 ⇒ 這條會靜默通過）
    expect(mustCarry.length, "runbook 一列都沒解析到 ⇒ 這條守衛是瞎的").toBeGreaterThan(4);
    const missing = mustCarry.filter((n) => !CARRIED.has(n) && !(n in EXEMPT));
    expect(
      missing,
      `⛔ runbook 逐字寫著「不可再生」，而 site-export.sh 不帶它們：${missing.join(", ")}\n` +
        `   ⇒ 搬遷會**安靜地**把它們留在舊機上，而對面會「還原成功」。`,
    ).toEqual([]);
  });

  it("★ data/ 底下的每一個目錄，要嘛被帶走、要嘛寫明為什麼不帶", () => {
    const dataDir = join(REPO, "data");
    if (!existsSync(dataDir)) return; // CI 沒有 data/ —— 上面兩條仍然在守
    const undeclared = readdirSync(dataDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
      .map((d) => d.name)
      .filter((n) => !CARRIED.has(n) && !LEFT.has(n) && !(n in EXEMPT));
    expect(
      undeclared,
      `⛔ data/ 底下有沒人宣告的目錄：${undeclared.join(", ")}\n` +
        `   ⇒ 二選一：加進 CARRY（該帶）或 LEAVE_BEHIND（刻意不帶，並寫下理由）。`,
    ).toEqual([]);
  });

  it("刻意不帶的每一格都要寫得出理由（⛔ 「還沒收」不算理由）", () => {
    const noReason = (/^LEAVE_BEHIND=\(([\s\S]*?)\n\)/m.exec(src)?.[1] ?? "")
      .split("\n")
      .map((l) => l.trim().replace(/^["']|["']$/g, ""))
      .filter((l) => l && !l.startsWith("#"))
      .filter((l) => (l.split("|")[1] ?? "").trim().length < 8);
    expect(noReason, `⛔ 這幾格沒有理由：${noReason.join(" / ")}`).toEqual([]);
  });
});
