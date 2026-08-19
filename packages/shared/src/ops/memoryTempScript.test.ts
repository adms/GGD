/**
 * memoryTempScript.test.ts —— context 溢出前的保命快照必須真的落地。
 *
 * owner 2026-08-20：「每次 context 要滿的時候先開一個 `memory_temp_{timestamp}.md`
 * 先存進去吧 **避免意外要找回**」。
 *
 * ⛔ 一條，不做突變 —— 被測的是工具腳本，不是靈魂層（第零守則③）。
 * 但它**必須跑起來**：這支腳本失敗的形態是「寫出一個看起來很正常、
 * 卻少了整節內容的檔案」，掃字串對那個形態永遠是綠的。
 *
 * ⭐ 兩個方向一起讀，因為快照有**兩半**且缺任一半都等於沒存：
 *   ① 機械那一半真的執行了（HEAD 進得去 → 不是一份空殼樣板）
 *   ② 手填那三節的 `（待填）` 佔位真的在（少了它，快照會**無聲地**退化成
 *      「只有 git 狀態」，而 owner 的裁決正是 compaction 最先吃掉的東西）
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("保命快照 scripts/memory-temp.sh", () => {
  it("寫出一份含真實 git 狀態、且三節手填欄位都在的 memory_temp", () => {
    cover("memory-temp-writes");
    const out = mkdtempSync(join(tmpdir(), "ggd-memtemp-"));

    const r = spawnSync("bash", [join(REPO, "scripts/memory-temp.sh")], {
      encoding: "utf8",
      env: { ...process.env, GGD_MEMTEMP_DIR: out },
    });
    expect(r.status, r.stderr).toBe(0);

    const files = readdirSync(out).filter((f) => /^memory_temp_\d{8}-\d{4}\.md$/.test(f));
    expect(files, "檔名要帶時間戳,否則下一份會蓋掉上一份").toHaveLength(1);
    const md = readFileSync(join(out, files[0]!), "utf8");

    // ① 機械那一半真的跑了：把當下的 HEAD 抓進去
    const head = spawnSync("git", ["log", "--oneline", "-1"], { cwd: REPO, encoding: "utf8" })
      .stdout.trim();
    expect(head.length).toBeGreaterThan(0);
    expect(md).toContain(head);

    // ② 手填那三節在，而且各自留著會被看見的佔位
    for (const section of ["卡在 owner 身上的決定", "owner 今天的裁決", "下一步"]) {
      expect(md, `少了「${section}」這一節`).toContain(section);
    }
    expect(
      md.match(/（待填）/g)?.length ?? 0,
      "三節都要留佔位 —— 沒有佔位就看不出這份快照是不完整的",
    ).toBeGreaterThanOrEqual(3);
  });
});
