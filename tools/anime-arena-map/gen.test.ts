/**
 * ⭐【出貨的 `arena.*.json` 必須等於產生器現在的輸出】—— GH#324 Phase 2 的閘。
 *
 * 症狀（如果沒有這一條）：有人在後台或編輯器裡改一張**產生出來的**場地，存檔成功；
 * 下一次任何人跑 `pnpm map:gen`，那筆編輯被**無聲覆寫** —— 沒有紅燈、沒有 log、
 * 跟正常一模一樣。GH#319 的 90 支技能踩過一模一樣的形狀。
 *
 * ⚠️ 判準（第零守則③）：地圖幾何是**靈魂層**（碰撞／導航），所以做突變；
 * 但這個檔本身是**接線類**，一條薄守衛就夠，⛔ 不開對抗輪。
 *
 * 突變紀錄：手改 `content/arenas/arena.infinity-castle.json`（例如把一個 halfW
 * 改掉）→ 這一條紅並指名那個檔。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const GEN = join(HERE, "gen.ts");

describe("產生出來的場地沒有被繞過產生器改動（GH#324）", () => {
  it("⭐ `map:check` 必須是 0 —— ⛔ 手改會在這裡紅，不是在下次重生成時無聲消失", () => {
    // ⚠️ 先確認腳本存在，否則下面是在測空氣。
    expect(existsSync(GEN), "產生器存在").toBe(true);

    // ⚠️ 讀**離開碼**，⛔ 不是 `expect(() => execFileSync(...)).not.toThrow("訊息")`
    //    —— vitest 的 `toThrow(string)` 是子字串比對，腳本真的非零離開時
    //    那種寫法**照樣綠**（`legacyIndexFresh.test.ts` 就這樣出貨過，靠突變才抓到）。
    const r = spawnSync("npx", ["tsx", GEN, "--check"], {
      cwd: HERE,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(
      r.status,
      "出貨的 arena.*.json 與產生器的輸出不同步。⛔ 不要改這條測試，也不要手改 content/arenas/：\n" +
        "  要改地圖請改 content/maps/*.json，然後跑\n" +
        "    pnpm --filter @ggd/anime-arena-map map:gen && pnpm content:build\n" +
        `腳本輸出：\n${(r.stderr ?? "") || (r.stdout ?? "").slice(-1500)}`,
    ).toBe(0);
  });

  it("⭐ 重跑兩次位元相同 —— 一個會浮動的欄位會讓上面那條閘變成永遠紅", () => {
    // ⚠️ 這條在守「產生器沒有時間戳、沒有 git describe、沒有未排序迭代」。
    //    `tools/capability-export` 與 `tools/legacy-index` 都記錄了同一個失敗形態：
    //    一個浮動欄位逼人把 --check 放寬成模糊比對，**而放寬的閘不是閘**。
    const run = (): string => {
      const r = spawnSync("npx", ["tsx", GEN, "--check"], {
        cwd: HERE,
        encoding: "utf8",
        timeout: 120_000,
      });
      return `${r.status}`;
    };
    expect(run()).toBe(run());
    expect(existsSync(join(REPO, "content", "maps"))).toBe(true);
  });
});
