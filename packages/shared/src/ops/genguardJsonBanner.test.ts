import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **「這個字出現在檔案裡」⛔ 不等於「這個檔宣告自己是產生的」。**
 *
 * 2026-09-09 量到：`claim.community37-icons.json` 的**內容**裡有一句寫給 Codex 的
 * 「⛔ 不要手改 .webp」⇒ genguard 的檔頭橫幅掃描把**封包自己**判成了產物。
 *
 * ⭐ 根因：JSON **沒有註解** ⇒ 它沒有「檔頭」，前 4000 個位元組全部是**資料**。
 *   ⇒ JSON 要宣告自己是產物，只能靠**一個頂層欄位**，⛔ 不是碰巧出現的字串。
 *
 * ⚠️ 三個方向一起驗 —— ⛔ 一把只驗過單邊的尺不算自證過。
 */

const REPO = join(import.meta.dirname, "../../../..");

/** ⭐ 跑**出貨的**那支 genguard，⛔ 不是掃它的原始碼。 */
function guard(name: string, body: string): number {
  const dir = mkdtempSync(join(tmpdir(), "ggd-gg-"));
  const p = join(dir, name);
  writeFileSync(p, body);
  try {
    execFileSync("bash", [join(REPO, "scripts/genguard.sh"), p], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 60_000,
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
}

describe("genguard 的檔頭橫幅：JSON ⛔ 不吃字串掃描（owner 2026-09-09 那一輪量到）", () => {
  it("① JSON 內容裡提到「不要手改」⇒ ⭐ 放行（⛔ 那是資料，不是宣告）", () => {
    const code = guard(
      "packet_temp.json",
      JSON.stringify({ kind: "claim", asks: ["⛔ 不要手改 .webp"] }, null, 2),
    );
    expect(code, "⛔ 誤報回來了 —— 配到名詞就下結論，⛔ 沒問關係").toBe(0);
  });

  it("② JSON 用頂層欄位宣告 ⇒ ⛔ 擋下（⭐ 這一條證明①不是靠放寬換來的）", () => {
    const code = guard("gen_temp.json", '{\n  "generatedBy": "x:build",\n  "a": 1\n}\n');
    expect(code, "⛔ 真的宣告過的產物被放行了").toBe(1);
  });

  it("③ 非 JSON 的檔頭橫幅照舊擋下（⛔ 這條路沒有被放寬）", () => {
    expect(guard("doc_temp.md", "# 由程式產生 —— 請勿手動編輯\n內容\n")).toBe(1);
    expect(guard("plain_temp.md", "# 一份普通的散文\n內容\n")).toBe(0);
  });
});
