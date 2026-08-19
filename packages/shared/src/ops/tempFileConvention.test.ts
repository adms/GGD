/**
 * tempFileConvention.test.ts —— 暫存檔一律 `{用途}_temp_{時間戳}`。
 *
 * owner 2026-08-20：「備份規則都是 **{用途}_temp_{timestamp}.md**⋯並且**清理 docs
 * 資料夾文件時，方便被認出是否已經過時要放到 legacy**」
 *
 * ⛔ 一條，不做突變（工具層，第零守則③）。它擋的是**慣例漂走** ——
 * 命名慣例沒有閘的話，下一支寫備份的腳本會自己取一個新格式，
 * 而 `temp-sweep.sh` 就從此看不到它（⭐ 靜默失效，正是這個 repo 最貴的形狀）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const NAME = /_temp_\d{8}-\d{4}/;

describe("暫存檔命名慣例", () => {
  it("每一支會產生暫存檔的腳本都用 {用途}_temp_{時間戳}", () => {
    cover("temp-file-convention");
    // ⭐ 名單從**行為**推導:掃 scripts/ 裡真的有寫「備份/快照」語意的那幾支,
    // ⛔ 不是手抄一份會過期的清單。
    const dir = join(REPO, "scripts");
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!/\.(sh|py)$/.test(f)) continue;
      const src = readFileSync(join(dir, f), "utf8");
      // ⚠️ 判準是**行為**不是文案:只管「**會往 `docs/` 寫一份帶時間戳的產物**」的腳本。
      // 第一版寫成「原始碼裡提到『備份』」,於是抓到 `backup-rules.sh`(寫進 ~/.claude/,
      // `temp-sweep.sh` 根本掃不到)與 `host-deploy.sh`(只是註解提到)——
      // 那是失敗形態⑥:掃字串代替掃行為。
      // ⚠️ 再窄一層:`docs/` 必須出現在一個**寫入動作**旁邊,⛔ 不是印在訊息裡
      // (`host-deploy.sh` 只是在提示文字裡講 "完整 runbook：docs/…")。
      const writesTimestampedIntoDocs =
        /(?:>\s*|mkdir -p |cp |mv |OUT=|OUT_DIR=|DEST=|Path\()[^\n]*docs\//.test(src) &&
        /%Y%m%d|strftime|date ['"]?\+/.test(src);
      if (!writesTimestampedIntoDocs) continue;
      if (!/_temp_/.test(src)) offenders.push(f);
    }
    expect(
      offenders,
      `這幾支會產生備份/快照,但名字不是 {用途}_temp_{YYYYMMDD-HHMM}:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("temp-sweep 只搬不刪,而且不掃 legacy 自己", () => {
    const src = readFileSync(join(REPO, "scripts/temp-sweep.sh"), "utf8");
    expect(src, "⛔ 清理工具不可以刪檔").not.toMatch(/\brm\s+-/);
    expect(src, "⛔ 不可以掃 legacy(那是退休區)").toMatch(/-path docs\/legacy -prune/);
  });
});
