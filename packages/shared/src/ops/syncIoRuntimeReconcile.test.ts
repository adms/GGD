/**
 * 🧾 **執行期對帳** —— GH#771 Scope③ / AC③ 的閘。
 *
 * `syncIoDeclaresWrites.test.ts` 問**名詞**（「這一列是不是空的」）；⭐ 這一條問**關係**：
 * 「這一支真的寫出去的位元組，戶籍表上是不是它自己的？」⛔ 少了它，「宣告少一份」
 * （⇒ genrun 解不開 ⇒ EACCES）與「根本沒有宣告」（⇒ 沒有隔離區、沒有鏈會重生成 ——
 * #771 追記量到的 `tts-gen` 三份）長得一模一樣。⭐ 兩個方向都跑（單邊校準不算自證過）。
 *
 * 突變（一批一條）：`classify()` 的 `if (isMine(p)) continue;` → `continue;`（什麼都不算數）
 * ⇒ 第一條的「紅」那一半失敗（exit 0，`expected +0 to be 1`）。實測過。
 *
 * ⭐ 2026-08-29 追加兩格（GH#771 Scope③ 的兩個量到的洞）：
 * ① **正規化器**（`normalizers.json`，⛔ 這裡不可以有第二份清單）的**就地改欄位**不算越界 ——
 *   量到的：`apconv:build` 戶籍只有 **1** 份而它就地重算 **422** 份 `content/abilities/*.json`
 *   ⇒ 在此之前 `pnpm apconv:build` 單獨跑會**紅在一次完全合法的執行上**，
 *   而這支檔頭自己就記著「一條會誤報的閘會被人放寬」。
 * ② **wrapper 公開名 ↔ `:raw` 名**：47 個 genrun 入口有 11 個 `--step` 查無此步而**靜靜跳過**，
 *   其中 `castderive:build`（sync-io 量到的是 `castderive:build:raw`，宣告 **492** 份）
 *   是純粹的名字落差 ⇒ 它**整支從來沒有被對帳過**。
 * 突變（追加那一條）：`classify()` 的 `owners.length && normalizesPath(...)` → `normalizesPath(...)`
 * ⇒ 「零認領仍然紅」那一半失敗（正規化器身分把 🔴 也放行了）。實測過。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = join(REPO, "tools/parallel-gates/reconcile.mjs");
const read = (rel: string) => JSON.parse(readFileSync(join(REPO, rel), "utf8"));
const run = (args: string[]) => spawnSync("node", [CLI, ...args], { encoding: "utf8" });
type Row = { step: string; path: string; why?: string };

describe("執行期對帳 (sync-io-runtime-reconcile)", () => {
  it("⭐ 只動自己的 ⇒ 綠；動了別人的／沒人認領的 ⇒ 紅並指名", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-reconcile-"));
    mkdirSync(join(root, "content"), { recursive: true });
    const io = join(root, "io.json");
    const pending = join(root, "pending.json");
    writeFileSync(pending, JSON.stringify({ pending: [] }));
    const steps = [{ name: "A", writes: ["content/a.*.json"] }, { name: "B", writes: ["content/b.json"] }];
    writeFileSync(io, JSON.stringify({ steps }));
    for (const f of ["a.1.json", "b.json", "c.json"]) writeFileSync(join(root, "content", f), "{}");

    const before = join(root, "before.json");
    const common = ["--root", root, "--io", io, "--pending", pending, "--step", "A", "--before", before];
    expect(run(["snapshot", "--root", root, "--io", io, "--out", before]).status).toBe(0);

    // ① 只動 A 自己宣告的（glob 展開的那一份）⇒ 綠
    writeFileSync(join(root, "content/a.1.json"), '{"changed":1}');
    const clean = run(["verify", ...common]);
    expect(clean.status, `⛔ 只動自己的產物卻紅了 —— 這條閘會被人放寬:\n${clean.stderr}`).toBe(0);

    // ② 再動一份 B 的、生一份沒人認領的 ⇒ 紅，而且兩堆的病不同 ⇒ 訊息要分得開
    writeFileSync(join(root, "content/b.json"), '{"changed":1}');
    writeFileSync(join(root, "content/c.json"), '{"changed":1}');
    const dirty = run(["verify", ...common]);
    expect(dirty.status, "⛔ 寫了不屬於自己的檔卻是綠的").toBe(1);
    expect(dirty.stderr).toContain("content/b.json");
    expect(dirty.stderr).toContain("content/c.json");
    expect(dirty.stderr).toContain("全戶籍都沒有人認領");
  });

  it("⭐ 棘輪會自己到期：`reconcile-pending.json` 的每一列今天仍然是**真的洞**", () => {
    const io = read("tools/parallel-gates/sync-io.json") as { steps: { name: string; writes?: string[] }[] };
    const rows = read("tools/parallel-gates/reconcile-pending.json").pending as Row[];
    const dead = rows.filter(
      (r) =>
        !r.why?.trim() ||
        !io.steps.some((s) => s.name === r.step) ||
        // ⭐ 到期：重量測之後它有了主人 ⇒ 刪掉這一列。棘輪⛔ 只收「全戶籍零認領」那一類。
        io.steps.some((s) => (s.writes ?? []).includes(r.path)),
    );
    expect(
      dead.map((r) => `${r.step} → ${r.path}`),
      "⛔ 這幾列棘輪已經到期（步驟不存在／那份檔已經有主人／沒寫理由）—— **刪掉它們**。",
    ).toEqual([]);
  });

  it("⭐ 正規化器的**就地改欄位**⛔ 不算越界；⛔ 但零認領那一堆仍然紅", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-reconcile-n-"));
    mkdirSync(join(root, "content"), { recursive: true });
    const io = join(root, "io.json");
    const pending = join(root, "pending.json");
    const norms = join(root, "normalizers.json");
    writeFileSync(pending, JSON.stringify({ pending: [] }));
    writeFileSync(io, JSON.stringify({ steps: [{ name: "N", writes: ["content/n.json"] }, { name: "B", writes: ["content/b.json"] }] }));
    // N 是 B 那份產物的**正規化器**（只覆寫其中幾格）—— 與 apconv:build ↔ 技能檔同一個形狀。
    writeFileSync(norms, JSON.stringify({ normalizers: [{ step: "N", only: ["content/b.json"], reason: "夾具" }] }));
    for (const f of ["n.json", "b.json", "orphan.json"]) writeFileSync(join(root, "content", f), "{}");
    const before = join(root, "before.json");
    const common = ["--root", root, "--io", io, "--pending", pending, "--normalizers", norms, "--step", "N", "--before", before];
    run(["snapshot", "--root", root, "--io", io, "--out", before]);

    // ① 就地改別人的產物 ⇒ 預期，⛔ 不擋（⛔ 但要出聲 —— 靜默放行讀起來就是「它什麼都沒寫」）
    writeFileSync(join(root, "content/b.json"), '{"x":1}');
    const okRun = run(["verify", ...common]);
    expect(okRun.status, `⛔ 正規化器就地改欄位被判越界 ⇒ 合法的單獨跑會紅 ⇒ 閘會被放寬:\n${okRun.stderr}`).toBe(0);
    expect(okRun.stderr).toContain("就地改了");

    // ② ⭐ 零認領的仍然紅 —— 最強的訊號⛔ 不可以被正規化器身分吃掉
    writeFileSync(join(root, "content/orphan.json"), '{"x":1}');
    const red = run(["verify", ...common]);
    expect(red.status, "⛔ 正規化器身分把「全戶籍零認領」也放行了").toBe(1);
    expect(red.stderr).toContain("content/orphan.json");
  });

  it("⭐ wrapper 公開名查無此步時，`--run` 的 raw 名接得上（⛔ 否則那一支永遠不會被對帳）", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-reconcile-w-"));
    mkdirSync(join(root, "content"), { recursive: true });
    const io = join(root, "io.json");
    const before = join(root, "before.json");
    // 兩條解析路徑**各自**驗一次（⛔ 一起驗的話,其中一條壞掉會被另一條蓋過去）:
    //   ⓐ `--run` 給的真名（ground truth,來自 package.json 的第二個參數）
    //   ⓑ `<公開名>:raw` 的推測（手動跑 reconcile、沒帶 --run 時的救生索）
    writeFileSync(io, JSON.stringify({ steps: [{ name: "X:inner", writes: ["content/x.json"] }, { name: "Y:build:raw", writes: ["content/y.json"] }] }));
    for (const f of ["x.json", "y.json", "orphan.json"]) writeFileSync(join(root, "content", f), "{}");
    run(["snapshot", "--root", root, "--io", io, "--out", before]);
    writeFileSync(join(root, "content/orphan.json"), '{"x":1}');
    const at = (step: string, extra: string[] = []) =>
      run(["verify", "--root", root, "--io", io, "--before", before, "--step", step, ...extra]);

    // ⓐ 公開名與 raw 名**沒有字面關係**時,只有 `--run` 接得起來 ⇒ 它是承重的
    expect(at("X:build").stderr, "公開名查無此步 ⇒ 本來就跳過（這是缺陷的前提）").toContain("對帳跳過");
    const wired = at("X:build", ["--run", "X:inner"]);
    expect(wired.stderr, "⛔ 給了真名還是跳過 ⇒ castderive:build（492 份）整支不會被對帳").not.toContain("對帳跳過");
    expect(wired.status, "接上之後，零認領的檔要紅").toBe(1);

    // ⓑ `:raw` 推測 —— castderive 就是這個形狀（公開名 + `:raw`）
    expect(at("Y:build").stderr, "⛔ `<公開名>:raw` 接不上 ⇒ 沒帶 --run 手動跑時整支靜靜跳過").not.toContain("對帳跳過");

    expect(readFileSync(join(REPO, "scripts/genrun.sh"), "utf8"), "⛔ genrun 沒把 $RUN 傳下去 ⇒ ⓐ 接不到").toContain('--run "$RUN"');
  });

  it("接線：`genrun.sh` 單獨跑那條路真的 拍快照 → 跑 → 對帳（⛔ 順序反了等於沒對帳）", () => {
    const sh = readFileSync(join(REPO, "scripts/genrun.sh"), "utf8");
    const at = (s: string) => sh.indexOf(s);
    expect(at("reconcile.mjs snapshot"), "⛔ 沒有拍快照 ⇒ 對帳沒有母體").toBeGreaterThan(-1);
    expect(at("reconcile.mjs snapshot")).toBeLessThan(at('GGD_QUARANTINE_UNLOCKED=1 pnpm "$RUN"'));
    expect(at('GGD_QUARANTINE_UNLOCKED=1 pnpm "$RUN"')).toBeLessThan(at("reconcile.mjs verify"));
  });
});
