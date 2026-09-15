/**
 * ⭐⭐ GH#884 —— **未追蹤檔在 `git checkout -f` 底下會被靜靜毀掉**。
 *
 * ── ⚠️ 票文說的是另一個形狀 ────────────────────────────────────────────────
 * 票文量的是 `host-deploy.sh` 的 `git pull`：它**中止**並指名檔案
 *（"would be overwritten by merge / Aborting"）。
 * ⭐ 而 `mini-deploy.sh` 走的是 `git fetch` + **`git checkout -f`**，
 * 2026-08-31 實測它的行為**相反**：
 *
 *     echo HOST-LOCAL > newfile.txt          # 未追蹤，與目標 commit 的同名檔衝突
 *     git checkout -f other  ⇒ **EXIT 0**，而檔案內容變成 commit 的版本
 *
 * ⇒ ⛔ **它不停，它毀。** 而 owner 的常設規矩逐字是
 *   「你要做**取代**這種事情以前都要**備份**」。
 *
 * ── ⭐ 這條守衛驗的是**那個 git 行為**，⛔ 不是腳本裡的字串 ────────────────
 * ⚠️ 一條 `expect(SRC).toContain("備份")` 對「備份寫錯了」是瞎的。
 * ⭐ 這裡真的建一個 repo、真的造出碰撞、真的 checkout ——
 * ⛔ 因為「git 會不會毀掉它」正是這張票唯一的前提。
 *
 * ⚠️ 更正（2026-09-15）：上面那句在 b447128fa 時**只對「前提自證」那一條成立**——
 *   備份的三條（checkout 前先算／cp 不是 mv／sudo 與複驗）其實是 `src.indexOf`／`toContain` 字串守衛，
 *   ⇒ 備份落點寫錯（`"~/…"` 包進雙引號不展開 ⇒ 落在 repo/~）兩週沒有東西紅。
 *   ⇒ 那三條改成下面「guarded_checkout」一組：本機假遠端（r ⇒ 本機 shell、HOME 換成暫存目錄）真的跑出貨的函式。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把 `mini-deploy.sh` 的 `clash` 偵測那一段拿掉 → 「腳本在 checkout 前先算碰撞」紅（b447128fa，字串版，已由行為版取代）
 *   · 把備份的 `cp -p` 改成 `mv` → 「用 cp ⛔ 不是 mv」紅（同上）
 *   · GH#1156：`comm -23 "$t/tree" "$t/index"` 改成 `cat "$t/tree"`（差集→全集）→ 「反方向量到 0」紅
 *   · GH#1156：兩支 git 拿掉 `-z`（＝舊的 quotePath 引號形狀）→ 「中文與空白路徑也抓得到」紅
 *   · GH#884 備份落點：clash_backup_script 的 `bdir="$HOME/$1"` 改回 `"~/$1"` → 「落在 $HOME」紅
 *   · GH#1156 fail-loud：guarded_checkout 掃描失敗的 `die` 改成 `:` → 「掃描沒跑完 ⇒ 不 checkout」紅
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../../scripts/mini-deploy.sh");
const git = (cwd: string, ...a: string[]): string =>
  execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** GH#1156：抽出**出貨的**掃描段（哨兵常數＋兩個函式），⛔ 不抄一份進測試。 */
function scanBlock(): string {
  const m = /^CLASH_SCAN_OK=[\s\S]*?^clash_scan_accept\(\) \{[\s\S]*?^\}/m.exec(readFileSync(SCRIPT, "utf8"));
  if (!m) throw new Error("mini-deploy.sh 裡找不到 clash_scan_script／clash_scan_accept —— GH#1156 的修法被拿掉了？");
  return m[0];
}
/** 照出貨的路走：產生腳本 ⇒ `sh -s -- <sha> <哨兵>`（＝ssh 另一頭做的事）⇒ clash_scan_accept。 */
function scan(repo: string, sha: string) {
  const body = `${scanBlock()}\nraw=$(clash_scan_script | sh -s -- "$1" "$CLASH_SCAN_OK") || rc=$?\nclash_scan_accept "\${rc:-0}" "$raw"`;
  const r = spawnSync("bash", ["-c", body, "_", sha], { cwd: repo, encoding: "utf8" });
  return { code: r.status, list: r.stdout.split("\n").filter(Boolean).sort() };
}
/** base 只有 a.txt；target 另加五個路徑（中文＋空白、引號＋反引號＋錢字號、被 ignore 的、子目錄）。checkout 回 base。 */
const CURSED = "it's `x` $y.txt";
const TARGET_ONLY = ["plain.txt", "新檔 空白.txt", CURSED, "ignored.log", "sub/deep.txt"];
function clashRepo(d = mkdtempSync(join(tmpdir(), "mini-clash-"))) {
  mkdirSync(d, { recursive: true });
  git(d, "init", "-q", ".");
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"], ["core.quotePath", "true"]] as const) git(d, "config", k, v);
  writeFileSync(join(d, ".gitignore"), "*.log\n");
  writeFileSync(join(d, "a.txt"), "v1");
  git(d, "add", "-A");
  git(d, "commit", "-qm", "base");
  const base = git(d, "rev-parse", "HEAD").trim();
  mkdirSync(join(d, "sub"));
  for (const f of TARGET_ONLY) writeFileSync(join(d, f), "from-commit");
  git(d, "add", "-f", "--", ...TARGET_ONLY);
  git(d, "commit", "-qm", "target");
  const target = git(d, "rev-parse", "HEAD").trim();
  git(d, "checkout", "-q", base);
  return { d, target };
}

describe("GH#1156 碰撞掃描（⭐ 真的跑出貨的那一段，兩個方向）", () => {
  it("★ 目標樹有而未追蹤的檔被抓到 —— 含中文與空白路徑、被 .gitignore 的也算撞", () => {
    const { d, target } = clashRepo();
    for (const f of ["plain.txt", "新檔 空白.txt", "ignored.log", "only-local.txt"]) writeFileSync(join(d, f), "HOST");
    const r = scan(d, target);
    expect(r.code).toBe(0);
    expect(r.list).toEqual(["ignored.log", "plain.txt", "新檔 空白.txt"].sort()); // ⛔ 沒有 a.txt／only-local／sub/deep
  });

  it("★ 反方向：目標樹沒有的未追蹤檔、已追蹤的檔 ⇒ 量到 0", () => {
    const { d, target } = clashRepo();
    writeFileSync(join(d, "only-local.txt"), "HOST");
    expect(scan(d, target)).toEqual({ code: 0, list: [] });
  });

  it("⭐ 掃描沒跑完 ⇒ 非零（⛔ 不是「0 個碰撞」）", () => {
    const { d } = clashRepo();
    expect(scan(d, "0".repeat(40)).code).not.toBe(0);
  });
});

describe("GH#884 未追蹤檔與 checkout", () => {
  it("★ ⭐ **前提自證**：`git checkout -f` 真的會靜靜覆蓋未追蹤檔", () => {
    const d = mkdtempSync(join(tmpdir(), "mini-untracked-"));
    git(d, "init", "-q", ".");
    git(d, "config", "user.email", "t@t");
    git(d, "config", "user.name", "t");
    writeFileSync(join(d, "a.txt"), "v1");
    git(d, "add", "-A");
    git(d, "commit", "-qm", "one");
    const base = git(d, "rev-parse", "HEAD").trim();
    git(d, "checkout", "-qb", "other");
    writeFileSync(join(d, "newfile.txt"), "from-commit");
    git(d, "add", "-A");
    git(d, "commit", "-qm", "two");
    const target = git(d, "rev-parse", "HEAD").trim();
    git(d, "checkout", "-q", base);
    // ⭐ 未追蹤，且與目標 commit 的同名檔衝突
    writeFileSync(join(d, "newfile.txt"), "HOST-LOCAL-CONTENT");
    git(d, "checkout", "-f", "-q", target);
    expect(
      readFileSync(join(d, "newfile.txt"), "utf8"),
      "⚠️ git 的行為變了 ⇒ ⭐ 這張票的前提要重新量（⛔ 不要直接改這條斷言）",
    ).toBe("from-commit");
  });
});

/**
 * GH#884：跑**出貨的** guarded_checkout —— ⭐ 只換掉 r（ssh ⇒ 本機 shell，HOME 換成暫存目錄，repo 在 $HOME/GGD）。
 * ⛔ 不 ssh：假遠端的登入 shell 用 zsh（mini 的預設），沒有 zsh 的機器（CI）退回 sh。
 */
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
function guardedCheckout(o: { failScan?: boolean; loseBackup?: boolean; lock?: string } = {}) {
  const home = mkdtempSync(join(tmpdir(), "mini-home-"));
  const { d, target } = clashRepo(join(home, "GGD"));
  for (const f of ["plain.txt", CURSED, "only-local.txt"]) writeFileSync(join(d, f), "HOST");
  if (o.lock) chmodSync(join(d, o.lock), 0);
  const block = /^CLASH_SCAN_OK=[\s\S]*?^guarded_checkout\(\) \{[\s\S]*?^\}/m.exec(readFileSync(SCRIPT, "utf8"));
  if (!block) throw new Error("mini-deploy.sh 裡找不到 guarded_checkout —— 備份段又被寫回 cmd_deploy 中間了？");
  const body = `eval "$(sed -n '1,/^# ═══════════════════════════════════════ check/p' "$SCRIPT")"
    eval "$BLOCK"; REMOTE_REPO='$HOME/GGD'
    r(){ case "$*" in
        *"$CLASH_SCAN_OK"*) [ -z "$FAIL_SCAN" ] || { cat >/dev/null; echo "ssh: connection reset" >&2; return 255; } ;;
        *"checkout -f"*) [ -z "$LOSE" ] || rm -rf "$FAKE_HOME/host-overwrite-backups" ;;
      esac; HOME="$FAKE_HOME" "$REMOTE_SH" -c "$REMOTE_PATH$*"; }
    guarded_checkout "$TARGET"`;
  const env = { ...process.env, GGD_HOSTS_INHERIT: "0", GGD_MINI_USER: "t", GGD_MINI_HOST: "127.0.0.1", GGD_MINI_CLASH_FAILOPEN: "",
    SCRIPT, BLOCK: block[0], FAKE_HOME: home, TARGET: target, REMOTE_SH: existsSync("/bin/zsh") ? "zsh" : "sh",
    FAIL_SCAN: o.failScan ? "1" : "", LOSE: o.loseBackup ? "1" : "" };
  const r = spawnSync("bash", ["-c", body], { cwd: home, env, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, home, d };
}

describe("GH#884 guarded_checkout（⭐ 本機假遠端真的跑：掃描 → 備份 → checkout → 複驗）", () => {
  it("★★ 碰撞檔先 cp 到 **$HOME**/host-overwrite-backups（⛔ 不是 repo/~），checkout 之後複驗得到", () => {
    const r = guardedCheckout();
    expect(r.code, r.out).toBe(0);
    const root = join(r.home, "host-overwrite-backups");
    expect(existsSync(join(r.d, "~")), "⛔ 備份落進 repo 裡叫 `~` 的目錄（b447128fa 的形狀）").toBe(false);
    expect(existsSync(root), `⛔ $HOME 底下沒有備份\n${r.out}`).toBe(true);
    const [stamp] = readdirSync(root);
    for (const f of ["plain.txt", CURSED]) {
      expect(readFileSync(join(root, stamp!, f), "utf8"), "⛔ 備份不是 checkout 之前的內容").toBe("HOST");
      expect(readFileSync(join(r.d, f), "utf8"), "⛔ checkout 沒有真的做").toBe("from-commit");
    }
    expect(r.out).toContain("備份複驗：2/2");
  });

  it("★ 掃描沒跑完（ssh 斷線）⇒ 出貨的呼叫點 die，⛔ 不 checkout", () => {
    const r = guardedCheckout({ failScan: true });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("沒有跑完");
    expect(readFileSync(join(r.d, "plain.txt"), "utf8"), "⛔ 掃描失敗卻照樣 checkout -f").toBe("HOST");
  });

  it.skipIf(asRoot)("★ 備份不起來的 ⇒ 指名＋需要 sudo、⛔ 不 checkout；讀得到的那份還在原地（cp ⛔ 不是 mv）", () => {
    const r = guardedCheckout({ lock: "plain.txt" });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/需要 sudo[\s\S]*UNREADABLE plain\.txt/);
    expect(readFileSync(join(r.d, CURSED), "utf8"), "⛔ 原檔被搬走（mv）或被 checkout 蓋掉").toBe("HOST");
  });

  it("★ checkout 之後備份不見了 ⇒ die（⛔「備份了」≠「備份成功了」）", () => {
    const r = guardedCheckout({ loseBackup: true });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("已經沒有了");
  });
});
