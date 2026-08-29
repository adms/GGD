/**
 * ggdAssetsSurplus.test.ts —— 過剩那一臂（GH#871），⭐ 失敗形態⑫的**另一頭**
 *
 * `cmd_verify()` 的檔案數不符有**兩臂**，而在此之前只有**短少**那一頭有閘
 * （`blizzardOverlayBoot.test.ts` 釘「short by」）。過剩才是新主機的**可能方向**：
 * macOS 一次 Finder 造訪就丟 `.DS_Store` 進 overlay、跨非 APFS 檔案系統會長出
 * `._*` —— 兩種都是過剩。GH#861 真的印過 `(short by -61)`，一個**指著錯方向**的
 * 診斷（叫人去找不存在的缺檔）。
 *
 * ⭐ 一條掃描從哪一頭走，就一定漏掉另一頭 ⇒ 兩頭都要走。
 *
 * ⚠️ 這裡**真的把 `sh tools/deploy/ggd-assets.sh` 跑起來**，⛔ 不是掃原始碼字串 ——
 * 掃字串對「那一行還在但跑不到」是結構性失明（失敗形態⑥）。
 * ⛔ 新開一個檔而不是擴充 `ggdAssetsScript.test.ts` / `laneAGgdAssetsListing.test.ts`：
 * 那兩個在別條 lane 的柵欄裡。
 *
 * 突變紀錄（2026-08-30）:
 *   · 把過剩臂的 `echo` 換成短少臂的措辭（＝把兩臂合併回一句）→ ①②③ 紅並指名 ✅
 *     而 `blizzardOverlayBoot.test.ts` 仍然綠 ——「兩條對的守衛，組合是空的」的證據
 *   · 把 `tmp_got` 那一段改回 `find "$dir" | sed "s|^$dir/||"`（join key 兩邊拼法不同）
 *     → ④ 紅：一個 3 檔的乾淨組加一個 .DS_Store 會把**四個檔名**全部列成 extras ✅
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "../../../..", "tools/deploy/ggd-assets.sh");
const ROOT = "/private/tmp/ggd-assets-surplus";
mkdirSync(ROOT, { recursive: true });
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function run(args: string[]) {
  const r = spawnSync("sh", [SCRIPT, ...args], { encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
/** 一組真的資產 + 真的 manifest，然後**多塞一個檔**（＝過剩）。 */
function setWithExtra(extra: string): string {
  const dir = join(mkdtempSync(join(ROOT, "box-")), "set");
  mkdirSync(dir, { recursive: true });
  for (const [n, b] of [["a.bin", "aaaa"], ["b.bin", "bbbbbb"], ["c.bin", "cc"]] as const)
    writeFileSync(join(dir, n), b);
  expect(run(["manifest", dir, "fixture"]).status, "夾具的 manifest 應該成功").toBe(0);
  writeFileSync(join(dir, extra), "junk"); // 簽名之後才出現 ⇒ 這一份不是被簽的那一份
  return dir;
}

describe("ggd-assets.sh —— 過剩不可以被講成短少（GH#871）", () => {
  it("① 多一個檔 ⇒ 非零離開碼，訊息說得出『多幾個』，⛔ 而且不含 short by／負數", () => {
    const r = run(["verify", setWithExtra("stowaway.bin")]);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out, "沒有說出這是過剩、多幾個").toContain("EXTRA 1");
    // ⛔ GH#861 的原始缺陷：同一句話用短少的措辭描述過剩。
    expect(r.out, "過剩被講成短少").not.toContain("short by");
    // ⭐ 上一條的一般化形式：任何診斷數字都不可以是負的。
    expect(r.out.match(/-\d/), `訊息裡出現負數:\n${r.out}`).toBeNull();
  });

  it("② `.DS_Store` ⇒ 指名它是 macOS metadata，修法是刪檔 ⛔ 不是重新 ship", () => {
    const r = run(["verify", setWithExtra(".DS_Store")]);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out, "沒有說這是 macOS metadata").toMatch(/macOS metadata/);
    expect(r.out, "沒有給刪檔的修法").toMatch(/-delete/);
    expect(r.out, "叫人重新 ship 了").toMatch(/do NOT re-ship/);
  });

  it("③ 『first extras』只可以列**多出來的那一個**（兩邊的 join key 拼法要一致）", () => {
    const r = run(["verify", setWithExtra("stowaway.bin")]);
    const listed = r.out
      .split("\n")
      .map((l) => l.replace(/^ggd-assets\.sh:\s+/, "").trim())
      .filter((l) => /^(stowaway\.bin|[abc]\.bin)$/.test(l));
    // ⛔ join key 漂掉時這裡會是四個名字，而每一個看起來都「被列出來了」。
    expect(listed, `extras 列出了不是 extras 的檔:\n${r.out}`).toEqual(["stowaway.bin"]);
  });
});
