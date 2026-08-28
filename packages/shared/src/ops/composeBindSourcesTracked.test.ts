/**
 * compose 的每一個 bind 來源，都要**有人負責**（GH#859）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 這條閘是被一顆真的定時炸彈炸出來的
 * ---------------------------------------------------------------------------
 * `docker/Caddyfile` —— **ggd.adms.ai 的 TLS 前門** —— 在 2026-08-28 之前
 * **從來沒有進過 git**，而且**早就從主機磁碟上消失了**。
 *
 * ⚠️ 而網站一直活著：bind mount 一旦建立，**來源檔被刪也照樣服務**。
 * ⇒ 它安靜地壞了幾週，直到 containerd 搬遷第一次重啟容器才爆出來
 *   （`docker start` 看到缺席的來源 ⇒ **自動建了一個同名目錄** ⇒ 掛不進檔案）。
 *
 * ⭐ 這是「fail-open 沒錯，**靜默**才是缺陷」的一個延遲版：
 *   缺陷在檔案被刪的那一刻就成立了，而**後果延遲到下一次重啟**才出現 ——
 *   那可能是一次計畫外的重開機，而你毫無準備。
 *
 * ---------------------------------------------------------------------------
 * 判準：每一個 repo 內的 bind 來源必須**二選一**，⛔ 不可以兩者皆非
 * ---------------------------------------------------------------------------
 *   ① **被 git 追蹤** —— 它是設定，repo 是它的家（`content/` · `nginx/` · `docker/Caddyfile`）
 *   ② **被 gitignore** —— 它是**執行期資料**，刻意不進版控（`data/replays` 那一族）
 *
 * ⛔ 兩者皆非 ＝ 一個「只存在於某一台機器上、而且沒有人知道它該存在」的檔案。
 * `docker/Caddyfile` 在修好之前**正是這一格**。
 *
 * ⚠️ 這條閘掃的是 **compose**，所以它的前提是「服務都寫在 compose 裡」——
 * 而 caddy 在 2026-08-28 之前是一次手打的 `docker run` ⇒ 它**不在**掃描母體裡。
 * ⭐ 把 caddy 收進 compose（同一張票）與這條閘是**一組的**：
 *   前者讓它進得了母體，後者才問得到它。⛔ 只做一半等於沒做。
 *
 * 突變紀錄：把 `docker/Caddyfile` 從 git 拿掉（`git rm --cached`）→ 紅並指名它。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const COMPOSE_DIR = join(REPO, "docker");

/** compose 檔裡每一條 `- <來源>:<目的>[:ro]` 的**來源**（只收路徑型，⛔ 不收具名 volume）。 */
function bindSources(): { file: string; line: number; src: string }[] {
  const out: { file: string; line: number; src: string }[] = [];
  for (const f of readdirSync(COMPOSE_DIR).filter((n) => /^compose.*\.ya?ml$/.test(n))) {
    const lines = readFileSync(join(COMPOSE_DIR, f), "utf-8").split("\n");
    lines.forEach((raw, i) => {
      const m = /^\s*-\s+(\S+?):(\/\S*)$/.exec(raw.trim());
      if (!m) return;
      // ⚠️ `- ..:/srv/repo` 這種「整個 repo 掛進去」不歸這條閘管：repo 本身
      //    當然被 git 追蹤，而 `git ls-files ""` 對 repo 根目錄回空 ⇒ 誤報。
      if (m[1] === ".." || m[1] === "." ) return;
      let src = m[1]!;
      // `${VAR:-預設}` ⇒ 取預設值（那才是出貨走的那一條）
      const dflt = /^\$\{[^:]+:-(.+)\}$/.exec(src);
      if (dflt) src = dflt[1]!;
      // 具名 volume（沒有 / 也沒有 .）不是 bind ⇒ 不歸這條閘管
      if (!src.startsWith(".") && !src.startsWith("/")) return;
      out.push({ file: f, line: i + 1, src });
    });
  }
  return out;
}

const tracked = (p: string): boolean => {
  try {
    return execFileSync("git", ["ls-files", "--error-unmatch", p], { cwd: REPO, stdio: "pipe" })
      .toString().trim().length > 0;
  } catch {
    // 目錄：ls-files --error-unmatch 對目錄會失敗 ⇒ 改問「底下有沒有被追蹤的檔」
    try {
      return execFileSync("git", ["ls-files", p], { cwd: REPO, stdio: "pipe" }).toString().trim().length > 0;
    } catch { return false; }
  }
};
const ignored = (p: string): boolean => {
  try { execFileSync("git", ["check-ignore", "-q", p], { cwd: REPO, stdio: "pipe" }); return true; }
  catch { return false; }
};

describe("compose 的 bind 來源都要有人負責（GH#859）", () => {
  it("⭐ 每一個 repo 內的 bind 來源，要嘛被 git 追蹤、要嘛被 gitignore —— ⛔ 不可以兩者皆非", () => {
    const binds = bindSources();
    // GUARD THE GUARD：正則寫壞 ⇒ 母體變 0 ⇒ 迴圈永遠綠。
    expect(binds.length, "⛔ 一條 bind 都掃不到 —— 正則壞了，這條閘在空轉").toBeGreaterThanOrEqual(8);

    const orphans: string[] = [];
    for (const b of binds) {
      // compose 的相對路徑是相對於 compose 檔自己的目錄
      const abs = normalize(join(COMPOSE_DIR, b.src));
      const rel = relative(REPO, abs);
      if (rel.startsWith("..")) continue; // repo 之外（絕對路徑）⇒ 這條閘管不到
      if (tracked(rel) || ignored(rel)) continue;
      orphans.push(`${b.file}:${b.line}  ${b.src}  →  ${rel}（${existsSync(abs) ? "本機在，但" : "⛔ 本機也沒有，且"}既沒被追蹤也沒被 ignore）`);
    }
    expect(
      orphans,
      "⛔ 這些 bind 來源**只存在於某一台機器上，而且沒有人宣告過它該存在**。\n" +
        "  它被刪掉的那一刻缺陷就成立了，而**後果延遲到下一次重啟**才出現（GH#859 的 Caddyfile 就是這樣壞了幾週）。\n" +
        "  ⇒ 它是設定就 `git add`；它是執行期資料就寫進 .gitignore：\n  " +
        orphans.join("\n  "),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⛔⛔ external volume 讓整套在「還沒有那個 volume 的機器」上**一個容器都起不來**。
//
// 2026-08-28 實測（GH#861，arm64 上第一次拉起整套）：
//   `docker compose up` 死在 `external volume "ggd_caddy-config" not found`
//   —— ⭐ 不是「caddy 起不來」，是**六個服務全部沒起來**，因為 compose 在建立
//   任何容器之前就先解析 volume。
//
// ⭐ 而它想達成的目的（重用已簽發的 TLS 憑證）**只要 `name:` 就夠了**：
//   compose 照名字找，有就接上去、沒有就建。`external: true` 額外加的那一句
//   語意是「**我拒絕建立它**」—— 那一句沒有帶來任何好處，只帶來一台全新機器
//   完全無法啟動。
//
// ⚠️ 這條閘存在的理由是**搬遷**：一份只在既有機器上驗證過的 compose，
//   在全新機器上的第一次啟動是它從來沒被測過的那條路。
// ─────────────────────────────────────────────────────────────────────────────
it("no compose volume is declared external — it would make a fresh host unbootable", () => {
  const offenders: string[] = [];
  for (const file of readdirSync(COMPOSE_DIR).filter((n) => /^compose.*\.ya?ml$/.test(n))) {
    const lines = readFileSync(join(COMPOSE_DIR, file), "utf-8").split("\n");
    let inVolumes = false;
    let current = "";
    lines.forEach((line, i) => {
      if (/^volumes:\s*$/.test(line)) { inVolumes = true; return; }
      if (inVolumes && /^\S/.test(line)) { inVolumes = false; return; }
      if (!inVolumes) return;
      const named = /^ {2}([A-Za-z0-9._-]+):\s*$/.exec(line);
      if (named) { current = named[1] ?? ""; return; }
      if (/^\s+external:\s*(true|yes)\s*$/.test(line)) {
        offenders.push(`${file}:${i + 1} volume "${current}" is external`);
      }
    });
  }
  expect(
    offenders,
    `⛔ external volume 會讓全新主機的第一次 \`docker compose up\` 整套失敗\n` +
      `（compose 在建立任何容器之前就解析 volume ⇒ 六個服務一個都不會起來）。\n` +
      `⭐ 重用既有 volume 只要寫 \`name:\` 就夠了，⛔ 不需要 external。\n` +
      offenders.map((o) => `  ${o}`).join("\n"),
  ).toEqual([]);
});
