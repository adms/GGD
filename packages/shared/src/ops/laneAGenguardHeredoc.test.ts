/**
 * laneAGenguardHeredoc.test.ts —— hook 的 Bash 解析不可以把 heredoc **內文**當成重導（GH#791）
 *
 * 2026-08-27 實測：`cat > scripts/rule-slip.sh <<'SH' … SH` 這種**寫新檔**的合法動作
 * 被擋下，訊息指名 `/`（repo 根）—— 因為內文裡的 `>` 被讀成一道又一道重導。
 * ⚠️ 誤報的成本不對稱：一個會**擋錯人**的閘會被關掉，而被關掉的閘等於沒有閘。
 *
 * ⭐ 這裡**真的把 hook 跑起來**（餵 PreToolUse 的 JSON 事件），⛔ 不是掃原始碼字串。
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const REPO = join(__dirname, "../../../..");
const HOOK = join(REPO, "scripts/preserve-before-overwrite.py");
/** ⛔ 寫死的 `/private/tmp/…` 在 Linux CI 上是 EACCES ⇒ 整個檔 `(0 test)`。
 *  完整理由見 `ggdAssetsScript.test.ts` 同一格（GH#979）。 */
const ROOT = join(tmpdir(), "ggd-laneA-genguard");
mkdirSync(ROOT, { recursive: true });
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function hook(command: string) {
  const ev = JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: REPO });
  const r = spawnSync("python3", [HOOK], { input: ev, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// root 對 chmod 444 仍有 W_OK ⇒ 情境② 會假綠。
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("preserve-before-overwrite hook —— heredoc 內文不是命令", () => {
  it("① 寫新檔的 heredoc（內文含 `>` `|` 反引號、以及一份**真的鎖著的產物路徑**）⇒ ⛔ 不擋", () => {
    const box = mkdtempSync(join(ROOT, "box-"));
    const target = join(box, "rule-slip.sh");
    // ⭐ 這一顆讓這條測試**真的承重**：內文裡出現一份 444 的產物路徑。
    //   剝掉內文 ⇒ 它只是字串；⛔ 不剝 ⇒ 它被讀成一道重導 ⇒ genguard 擋下。
    //   （⚠️ 只放 `rm -rf /` 是不夠的 —— 那會被「解析失敗」那條 sanity 濾掉，
    //     於是拿掉 _strip_heredocs 也照樣綠。實測過，所以改成這個形狀。）
    const prod = join(box, "locked-product.json");
    writeFileSync(prod, "{}\n");
    chmodSync(prod, 0o444);
    const r = hook(
      [
        `cat > ${target} <<'SH'`,
        "#!/bin/sh",
        "# 一張表: | 守則 > 成因 | 而 `date` 是反引號",
        `# 用法範例: python3 gen.py > ${prod}`,
        'echo "1 > 2" > "$out"',
        "rm -rf /",
        "SH",
        `chmod +x ${target}`,
      ].join("\n"),
    );
    chmodSync(prod, 0o644);
    // ⛔ 突變（_strip_heredocs 改成 `return cmd`）⇒ 這裡是 2，訊息指名 locked-product.json。
    expect(r.status, r.out).toBe(0);
    expect(r.out, "把 heredoc 內文讀成重導了").not.toContain("🚫 genguard");
  });

  it.skipIf(asRoot)("② 真的重導到一份鎖著(444)無主的產物 ⇒ 仍然擋", () => {
    const box = mkdtempSync(join(ROOT, "box-"));
    const prod = join(box, "locked.json");
    writeFileSync(prod, "{}\n");
    chmodSync(prod, 0o444);
    const r = hook(`echo hi > ${prod}`);
    chmodSync(prod, 0o644);
    expect(r.status, r.out).toBe(2);
    expect(r.out).toContain("鎖著(444)但戶籍無主");
  });

  it("③ 解析不出路徑 ⇒ 放行(0)但要**出聲**，⛔ 不可以靜默跳過", () => {
    const r = hook("echo hi > /no-such-dir-ggd-791/foo.txt");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("解析不了");
  });
});
