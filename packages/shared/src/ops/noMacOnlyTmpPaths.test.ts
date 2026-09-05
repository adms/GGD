/**
 * ⭐⭐ `/private/tmp` 與 `mktemp -t <前綴>` 是 **macOS 專屬** —— GH#1003。
 *   · Linux 上 `/private` 不存在，非 root 也建不出來 ⇒ `> …` 重導**靜默失敗**、`mkdirSync` EACCES
 *   · `mktemp -t` 是 BSD 形式，GNU 要結尾 ≥3 個 X ⇒ 回空字串
 *   2026-09-05 在 debian/python:slim 容器裡逐字重現：CI 7 支測試紅，**症狀全部指著錯方向**。
 *   ⚠️ 這個教訓用散文寫過兩次（host-deploy.sh · genrun.sh）而復發 ⇒ 判準治不了，要一條閘。
 *
 * ⚠️ 這是掃字串（失敗形態⑥）—— ⭐ 而這一次掃字串是**對的**：缺陷本身就是那個字串。
 *   一條會炸的路徑不是行為，它是原始碼裡逐字寫著的位元組；把它改掉就是修好。
 *   註解（`#` · `//` · `* ` · `/*` 開頭）跳過：那是解釋這條規則的散文，⛔ 不會被執行。
 * ⛔ 豁免表每一列都要**還命中** —— 命中沒了就紅，逼你把過期的豁免拿掉（棘輪只能變短）。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SKIP_DIRS = new Set(["node_modules", ".venv", "venv", "out", ".optvendor", "__pycache__", ".git"]);
const TRAP = /\/private\/tmp|\bmktemp(?:\s+-[a-zA-Z]+)*\s+-t\b/;
/** `*` 後面要有空白或行尾 —— ⛔ 不然 shell 的 `*) …` case 分支會被當成註解放過。 */
const COMMENT = /^\s*(?:#|\/\/|\*(?:\s|$)|\/\*)/;
/** 豁免：路徑 → 一個**能被反駁**的理由。列了就要還命中，否則紅。 */
const EXEMPT: Record<string, string> = {
  // 2026-09-06：`preserve-before-overwrite.py` 那一列已拿掉（docstring 改成 ${TMPDIR:-/tmp} 形狀）—— 目前零豁免。
};

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && /\.(sh|py|mjs)$/.test(e.name)) yield p;
  }
}

describe("scripts/ tools/：⛔ 不可以寫死 macOS 專屬的暫存路徑（GH#1003）", () => {
  const files = [...walk(join(REPO, "scripts")), ...walk(join(REPO, "tools"))];

  it("⭐ 量尺先自證：真的掃到腳本了", () => {
    expect(files.length, "⛔ 一支都沒掃到 ⇒ 這條在量空氣").toBeGreaterThan(50);
  });

  it("★★ `/private/tmp` 與 `mktemp -t` 在可執行的行上零命中；豁免要還命中", () => {
    const bad: string[] = [];
    const exemptHit = new Set<string>();
    for (const f of files) {
      const rel = relative(REPO, f);
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (COMMENT.test(line) || !TRAP.test(line)) return;
        if (rel in EXEMPT) exemptHit.add(rel);
        else bad.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }
    expect(
      bad,
      "⛔ 這幾行在 Linux 上會靜默失敗（/private 建不出來 · mktemp -t 回空字串）：\n" +
        '→ 路徑改成 `"${TMPDIR:-/tmp}/…"`（shell：TMPD="${TMPDIR:-/tmp}"; TMPD="${TMPD%/}"；node：os.tmpdir()），' +
        '\n→ mktemp 改成 `mktemp "${TMPDIR:-/tmp}/ggd-x.XXXXXX"`。',
    ).toEqual([]);
    const stale = Object.keys(EXEMPT).filter((k) => !exemptHit.has(k));
    expect(stale, "⛔ 豁免列已經不命中 —— 把它拿掉（棘輪只能變短）").toEqual([]);
  });
});
