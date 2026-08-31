/**
 * ⭐⭐ 每一個版號都要**同時**有 GitHub release 與 Discord 公告（owner 2026-09-01）。
 *
 * > 「你怎麼老是跳過 discord 玩家版本 不要漏掉 全補，
 * >  github release note 跟 discord 每個版本號都不能跳過」
 *
 * ── ⭐ 根因（2026-09-01 量到，⛔ 比「忘記」難看）───────────────────────────
 * `scripts/bmpndd.sh` 是**一個指令**，而它第 21 行就 `. docker/.env`
 *（Discord 的 webhook 住那裡）。⭐ 而我**七次部署一次都沒跑它** ——
 * 全部是手打重組 `release.sh` → `gh release create` → `mini-deploy.sh`。
 * ⇒ ⛔ 每一次 `release.sh` 都印「沒設 GGD_DISCORD_WEBHOOK ⇒ **沒發**玩家公告」，
 *   ⭐ 而我七次都讀過那一行然後往下做。
 *
 * ⚠️ ⭐ 那支腳本的檔頭**自己記著**這件事：「這五步在此之前是五段要記得的手打，
 * 而 2026-08-29/30 這一天它們漏過四次」。⇒ ⭐ 我把它重新犯了一遍，⛔ 而且更久。
 *
 * ── ⭐ 所以這條閘問的不是「有沒有發」，是「**有沒有走那個唯一入口**」───────
 * ⛔ 一條「檢查 Discord 有沒有貼文」的閘做不到：Discord 沒有可讀的帳本。
 * ⭐ 能查的是**這一端**：每一個 tag 都要有一則 `docs/_release/_announced.tsv` 的紀錄，
 * 而那個檔**只有 `bmpndd.sh` 會寫**。⇒ 手打繞過去 ⇒ 下一次跑這條閘就紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LEDGER = join(REPO, "docs/_release/_announced.tsv");

/** ⭐ 棘輪：只管**這一條線之後**的 tag。⛔ 補一個半年前的公告沒有人受益。 */
const FROM = "v0.34.2";

const tags = (): string[] => {
  try {
    return execFileSync("git", ["tag", "--sort=v:refname"], { cwd: REPO, encoding: "utf8" })
      .split("\n")
      .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  } catch {
    return [];
  }
};

describe("每一個版號都要有 Discord 公告（owner 2026-09-01）", () => {
  it("★ ⭐ `FROM` 之後的每一個 tag 都在公告帳本裡（⛔ 手打繞過 bmpndd.sh 就會紅）", () => {
    const all = tags();
    if (all.length === 0) {
      console.warn("⚠️ 這條閘**沒有驗到** —— git tag 讀不到。⛔ 這不是「全部都發了」。");
      return;
    }
    const i = all.indexOf(FROM);
    const after = i >= 0 ? all.slice(i + 1) : [];
    if (after.length === 0) return; // 還沒有新版
    const seen = existsSync(LEDGER)
      ? new Set(
          readFileSync(LEDGER, "utf8")
            .split("\n")
            .map((l) => l.split("\t")[0]?.trim())
            .filter(Boolean),
        )
      : new Set<string>();
    const missing = after.filter((t) => !seen.has(t));
    expect(
      missing,
      [
        "⛔⛔ 這幾個版號**沒有玩家公告紀錄**：",
        ...missing.map((t) => `  · ${t}`),
        "",
        "⭐ 修法只有一個：**跑那個唯一入口**",
        '    bash scripts/bmpndd.sh "<這一版的一句話>"',
        "⛔ 不是手打 release.sh + gh release create + mini-deploy.sh —— ",
        "  那正是 2026-09-01 漏掉七版的做法（見本檔檔頭）。",
        "⚠️ 補發：set -a; . docker/.env; set +a; bash scripts/release-note-players.sh --post",
      ].join("\n"),
    ).toEqual([]);
  });
});
