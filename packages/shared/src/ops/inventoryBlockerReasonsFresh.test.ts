/**
 * ⭐⭐ GH#1165 —— **盤點表的「為什麼還不能用」也會過期。**
 *
 * ── 📏 為什麼有這條（2026-09-10 量到）────────────────────────────
 * owner 的 `全角色模型盤點.md` 把四名角色標成「待取得核准模型」，理由逐字是
 *
 *     「單段動作通道 196 超過英雄模型上限 **160**。」
 *
 * ⭐ 而 GH#1164 已經把那個上限改成後台設定（warn 300 / limit **500**）
 * ⇒ ⛔ 四個理由**全部不再成立**，而表上一個字都沒變、⛔ 沒有任何東西變紅。
 *
 * ⚠️ ⭐ 這是第三守則的形狀：**一句在它到期之後還活著的散文** ——
 * 而它比一般的過期註解貴，因為 owner 讀那張表決定**下一步要取得哪些模型**：
 * 一個假的阻塞理由會讓一名今天就上得了的角色**繼續用替身**。
 *
 * ⭐ 判準治不了它（本文件記過五次判準失效）⇒ 這裡把它變成一支**會跑**的檢查：
 * 把理由裡的數字抓出來，跟**出貨設定**比一次。
 *
 * ── ⭐ 這條守衛真的跑 `model_map.stale_blockers`，⛔ 不是掃字串 ────────
 * ⭐ 量尺兩個方向都驗：上限**還是**理由引用的那個 ⇒ ⛔ 一列都不可以喊；
 * 上限被調高 ⇒ ⭐ 必須指名那幾列。⛔ 一把只驗過單邊的尺不算自證過。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 一張最小的盤點表：一列理由引用上限 160，另一列**沒有數字**。 */
const FIXTURE = [
  "| 作品 | 英雄 | 預設模型 | 來源 | 備註 |",
  "|---|---|---|---|---|",
  "| 甲 `example:a` | 甲／來源 | 單段動作通道 196 超過英雄模型上限 160。 |",
  "| 乙 `example:b` | 乙／來源 | 模型品質不夠，等美術重做。 |",
].join("\n");

function run(limit: number): Array<{ row: string; value: number; citedLimit: number }> {
  const dir = mkdtempSync(join(tmpdir(), "ggd-inv-"));
  const f = join(dir, "inv.md");
  writeFileSync(f, FIXTURE, "utf8");
  const py = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(join(REPO, "tools/ship-81"))})`,
    "from pathlib import Path",
    "from model_map import stale_blockers",
    `print(json.dumps(stale_blockers(Path(${JSON.stringify(f)}), ${limit})))`,
  ].join("\n");
  return JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
}

describe("盤點表的阻塞理由 —— 引用的上限被改掉時要喊（GH#1165）", () => {
  it("⛔ 上限**還是** 160 ⇒ 理由仍然成立，一列都不可以喊", () => {
    expect(run(160)).toEqual([]);
  });

  it("⭐ 上限調到 500 ⇒ 要指名那一列，並說得出兩個數字", () => {
    const hits = run(500);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.value).toBe(196);
    expect(hits[0]!.citedLimit).toBe(160);
    expect(hits[0]!.row).toContain("example:a");
  });

  it("⛔ 沒有數字的理由**不喊** —— 這支程式無權判斷它過期沒有", () => {
    expect(run(500).some((h) => h.row.includes("example:b"))).toBe(false);
  });

  it("⭐ 通道數本身仍然超過新上限 ⇒ ⛔ 也不喊（它今天還是過不了）", () => {
    expect(run(180)).toEqual([]);
  });
});
