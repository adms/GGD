/**
 * ggdAssetsScript.test.ts — tools/deploy/ggd-assets.sh 必須說出**真正的原因**（#749）
 *
 * 這支腳本擋著 nginx 啟動（edge.Dockerfile COPY 進映像 → entrypoint `exec … assert`）。
 * 它有兩個**會給錯診斷**的洞：
 *   ① bytes_of() 的 `cat … 2>/dev/null | wc -c | tr` 兩層吞（EACCES 被重導丟掉、
 *      離開碼來自末端的 tr）⇒ 一個**讀不到**的資產檔只表現成**位元組短少**
 *      ⇒ 半夜去追一個不存在的 rsync 截斷，真相是一顆 mode bit。
 *   ② `[ "$rc" -eq 0 ] || return 1` 卡在 --deep 區塊**前面** ⇒「哪幾個檔壞了」的
 *      逐檔點名**永遠不會**在最需要它的那個情況跑。
 *
 * ⚠️ 這裡**真的把腳本跑起來**，⛔ 不是掃原始碼字串 —— 掃字串對「那一行還在但跑不到」
 * 是結構性失明（失敗形態⑥）。
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "../../../..", "tools/deploy/ggd-assets.sh");
const ROOT = "/private/tmp/ggd-assets-tests";
mkdirSync(ROOT, { recursive: true });
const boxes: string[] = [];
afterAll(() => boxes.forEach((b) => rmSync(b, { recursive: true, force: true })));

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync("sh", [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
/** 一組真的資產 + 真的 SHIP.txt/SHIP.sha256。 */
function newSet(): string {
  const dir = join(mkdtempSync(join(ROOT, "box-")), "set");
  boxes.push(dir);
  mkdirSync(dir, { recursive: true });
  for (const [n, b] of [["a.bin", "aaaa"], ["b.bin", "bbbbbb"], ["c.bin", "cc"]]) writeFileSync(join(dir, n), b);
  expect(run(["manifest", dir, "fixture"]).status, "夾具的 manifest 應該成功").toBe(0);
  return dir;
}

// root 讀得到 chmod 000,那三條會假綠。
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("ggd-assets.sh —— 讀不到的檔不可以偽裝成位元組短少", () => {
  it("乾淨的一組:verify --deep 通過", () => {
    const r = run(["verify", newSet(), "--deep"]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("OK (deep)");
  });

  it.skipIf(asRoot)("① 不可讀的檔 ⇒ 非零離開碼,而且訊息指名『讀取失敗』與那個路徑", () => {
    const dir = newSet();
    chmodSync(join(dir, "b.bin"), 0o000);
    const r = run(["verify", dir]);
    chmodSync(join(dir, "b.bin"), 0o644);
    expect(r.status, r.out).not.toBe(0);
    // ⛔ 舊行為只會印「is 6 B, manifest says 12 B」—— 下面兩條都不會出現。
    expect(r.out, "沒有說出真正的原因是權限").toContain("讀取失敗");
    expect(r.out, "沒有指名是哪一個檔").toContain("b.bin");
  });

  it.skipIf(asRoot)("① rollback:GGD_ASSET_STRICT_READ=0 逐位元回到舊行為", () => {
    const dir = newSet();
    chmodSync(join(dir, "b.bin"), 0o000);
    const r = run(["verify", dir], { GGD_ASSET_STRICT_READ: "0" });
    chmodSync(join(dir, "b.bin"), 0o644);
    expect(r.status, r.out).not.toBe(0); // 舊行為也是紅的,差別只在訊息
    expect(r.out, "關掉了卻還在做嚴格讀取檢查").not.toContain("讀取失敗");
  });

  it("② 短少的一組:--deep 的逐檔點名仍然跑得到,並指名那個檔", () => {
    const dir = newSet();
    unlinkSync(join(dir, "c.bin"));
    const r = run(["verify", dir, "--deep"]);
    expect(r.status, r.out).not.toBe(0);
    // ⛔ 舊行為在 count/bytes 不符時就 return 1,整個 --deep 區塊跑不到
    //    ⇒ 只有「has 2 files, manifest says 3」,永遠不知道少的是哪一個。
    expect(r.out, "逐檔點名沒有跑到").toContain("per-file verdict");
    expect(r.out, "沒有指名少掉的是哪一個檔").toContain("c.bin");
  });
});
