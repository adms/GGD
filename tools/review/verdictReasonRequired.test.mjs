/**
 * verdictReasonRequired.test.mjs —— 🧑‍⚖️ **否決必填原因**，四族一條線（GH#991 Scope 5）。
 *
 * owner 2026-08-24（逐字，批次驗收頁的定義）：
 * > 「[一頁批次後台驗收] 代表**先上線成果**，但是在**後台可以一鍵否決還原**，
 * >  **追加原因的HITL**，但**預設是直接上線**」
 * GH#991 Scope 5 逐字（UGC 投稿要進同一頁）：「加 `author` 欄與**「退回原因必填」**」。
 *
 * ── ⛔ 為什麼這一條要**橫著**寫，⛔ 不是各族各寫一條 ──────────────────────
 * 2026-09-19 量到：本機三族裡**資產這一族是唯一沒有這條規矩的**，
 * 而另外兩族**各自都有守衛盯著**（`reviewFeatureVerdicts.test.ts:66`、
 * `heroIntakeReview.test.ts:163`）—— ⇒ ⛔ 漏掉的不是某一條斷言，
 * 是**沒有人問「每一族都問過了嗎」**：三族各自被逐一驗過，而**反方向**
 * （有哪一族漏了）結構上沒有人走（CLAUDE.md 綠燈⑫：只驗名詞不驗關係的反方向）。
 * ⇒ ⭐ 所以這一條的迴圈跑的是**寫入端的清單**，⛔ 不是某一個寫入端。
 *   新開第四個本機裁決寫入端而忘了這條規矩 ⇒ 它不在清單裡 ⇒ ⚠️ 補進清單就會紅。
 *
 * 突變驗證（2026-09-19）：拿掉 `triage.mjs::saveVerdict` 的
 * 「`verdict === "fail" && trimmed === ""` ⇒ throw」⇒ 第 ① 條紅並指名 asset。
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveVerdict } from "./triage.mjs";
import { saveFeatureVerdict } from "./features.mjs";
import { saveHeroIntakeVerdict } from "./heroIntake.mjs";

const repo = () => mkdtempSync(join(tmpdir(), "review-reason-"));

/**
 * ⭐ **每一個本機裁決寫入端一列** —— `reject` 是那一族「否決」的字面值。
 * ⚠️ 平台 UGC（`submissions/handlers.go:238`）是第四族，Go 那側自己守。
 */
const WRITERS = [
  { family: "asset", reject: (r, reason) => saveVerdict(r, { kind: "vfx", id: "fx.z", hash: "h", verdict: "fail", note: reason }) },
  { family: "feature", reject: (r, reason) => saveFeatureVerdict(r, { id: "seq", hash: "h", verdict: "veto", reason }) },
  { family: "hero-intake", reject: (r, reason) => saveHeroIntakeVerdict(r, "local", { batch: "b", heroId: "h1", digest: "d", verdict: "reject", reason }) },
];

describe("🧑‍⚖️ 否決必填原因 —— 每一個裁決寫入端", () => {
  it("① 每一族的『否決 ＋ 空原因』都要被擋下來，⛔ 一族都不能漏", () => {
    for (const { family, reject } of WRITERS) {
      const r = repo();
      // ⭐ 空字串與「只有空白」都算沒填 —— ⛔ 否則一個空白鍵就繞過去了。
      for (const blank of ["", "   "]) {
        expect(() => reject(r, blank), `${family} 收了一個沒有原因的否決`).toThrow(/必填原因/);
      }
      // ⭐⭐ 而且它要**擋在寫之前** —— ⛔「先寫了再抱怨」等於沒擋：
      //    帳本已經有一筆無原因的否決，而呼叫端看到的是例外。
      expect(existsSync(join(r, "docs/_review/approvals.json")), `${family} 擋下來了卻已經寫了帳本`).toBe(false);
    }
  });

  it("② ⭐ 反方向：有原因的否決寫得進去，而『通過』⛔ 不被強迫填", () => {
    const r = repo();
    // ⛔ 只驗「擋得住」是一把單邊的尺 —— 一個把所有裁決都擋掉的實作也會讓①全綠。
    saveVerdict(r, { kind: "vfx", id: "fx.z", hash: "h", verdict: "fail", note: "  光束是全透明的  " });
    const led = JSON.parse(readFileSync(join(r, "docs/_review/approvals.json"), "utf8"));
    expect(led.entries["vfx:fx.z"].verdict).toBe("fail");
    expect(led.entries["vfx:fx.z"].note).toBe("光束是全透明的"); // ⭐ 存的是 trim 過的

    // ⭐ 通過與「不確定」沒有原因**仍然寫得進去**（owner 的原話只管否決）。
    saveVerdict(r, { kind: "vfx", id: "fx.ok", hash: "h", verdict: "pass" });
    saveVerdict(r, { kind: "vfx", id: "fx.hm", hash: "h", verdict: "unsure" });
    const led2 = JSON.parse(readFileSync(join(r, "docs/_review/approvals.json"), "utf8"));
    expect(led2.entries["vfx:fx.ok"].verdict).toBe("pass");
    expect(led2.entries["vfx:fx.hm"].verdict).toBe("unsure");
  });
});
