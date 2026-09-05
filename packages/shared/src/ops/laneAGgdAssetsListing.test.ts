/**
 * laneAGgdAssetsListing.test.ts —— `listing_of()` 的失敗不可以是啞的（GH#772）
 *
 * #749 修好了 `bytes_of()`，⛔ 但同一支腳本的**雙胞胎**還是啞的：`sha256sum "$f"` 的
 * 離開碼從來沒有人看。實測（3 檔夾具、中間那檔 chmod 000、STRICT_READ=0）：
 * 只有一行生的 `Permission denied`，而 **`SHIP.sha256` 被留在磁碟上、只裝了 1 / 3 檔**，
 * 旁邊沒有 SHIP.txt —— 而 `count_of` 仍然數 3。一份有洞的清單**驗得過**，
 * 因為之後的 verify 兩邊會跳過同一個檔。
 *
 * ⚠️ 這裡**真的把腳本跑起來**（含 source 進來直接叫那個函式），⛔ 不是掃字串。
 * ⛔ 新開 laneA 檔而不是擴充 ggdAssetsScript.test.ts：那個檔在別條 lane 的柵欄裡。
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "../../../..", "tools/deploy/ggd-assets.sh");
/** ⛔ 寫死的 `/private/tmp/…` 在 Linux CI 上是 EACCES ⇒ 整個檔 `(0 test)`。
 *  完整理由見 `ggdAssetsScript.test.ts` 同一格（GH#979）。 */
const ROOT = join(tmpdir(), "ggd-laneA-assets");
mkdirSync(ROOT, { recursive: true });
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function newSet(): string {
  const dir = join(mkdtempSync(join(ROOT, "box-")), "set");
  mkdirSync(dir, { recursive: true });
  for (const [n, b] of [["a.bin", "aaaa"], ["b.bin", "bbbbbb"], ["c.bin", "cc"]] as const)
    writeFileSync(join(dir, n), b);
  return dir;
}
function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync("sh", [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
/** source 進來直接叫 `listing_of` —— 驗的是**出貨的那個函式**，⛔ 不是虛構通道。 */
function listingOf(dir: string, env: Record<string, string> = {}) {
  const sh = 'S="$1"; D="$2"; set -- assert; . "$S" >/dev/null 2>&1; listing_of "$D" >/dev/null';
  const r = spawnSync("sh", ["-c", sh, "--", SCRIPT, dir], {
    encoding: "utf8",
    env: { ...process.env, GGD_TIER_DIR: "/nonexistent-ggd-tier", ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("ggd-assets.sh listing_of() —— 雜湊不到的檔不可以被靜默漏掉", () => {
  it.skipIf(asRoot)("① 不可讀的檔 ⇒ listing_of 回非零，並指名那個路徑", () => {
    const dir = newSet();
    chmodSync(join(dir, "b.bin"), 0o000);
    const r = listingOf(dir);
    chmodSync(join(dir, "b.bin"), 0o644);
    // ⛔ 突變（拿掉 `[ -s "$failed" ] …` 那三行）⇒ 下面兩條斷言都掉。
    expect(r.status, r.out).not.toBe(0);
    expect(r.out, "沒有說出真正的原因").toContain("雜湊失敗");
    expect(r.out, "沒有指名是哪一個檔").toContain("b.bin");
  });

  it("② SHIP.sha256 的行數與 count_of 的數字一致（兩個名詞的關係）", () => {
    const dir = newSet();
    expect(run(["manifest", dir, "fixture"]).status).toBe(0);
    const listed = readFileSync(join(dir, "SHIP.sha256"), "utf8").trimEnd().split("\n").length;
    const files = Number(run(["verify", dir]).out.match(/'fixture' (\d+) files/)?.[1]);
    expect(listed, "清單的行數與 count_of 對不上").toBe(files);
  });

  it.skipIf(asRoot)("③ rollback:GGD_ASSET_STRICT_READ=0 ⇒ 逐位元回到舊行為", () => {
    const dir = newSet();
    chmodSync(join(dir, "b.bin"), 0o000);
    const r = run(["manifest", dir, "fixture"], { GGD_ASSET_STRICT_READ: "0" });
    chmodSync(join(dir, "b.bin"), 0o644);
    expect(r.status, r.out).not.toBe(0); // 舊行為也是紅的,差別在**有沒有診斷**
    expect(r.out, "關掉了卻還在做嚴格雜湊檢查").not.toContain("雜湊失敗");
    // 舊行為的特徵:半寫的 SHIP.sha256 被留在原地(1 / 3 檔)。
    expect(readFileSync(join(dir, "SHIP.sha256"), "utf8").trimEnd().split("\n")).toHaveLength(1);
  });
});
