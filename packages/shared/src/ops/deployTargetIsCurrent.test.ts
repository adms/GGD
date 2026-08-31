import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐⭐ **CLAUDE.md 的部署節不可以比世界舊。**
 *
 * ⛔ 2026-08-31 的事故：正式站 08-29 搬到 Mac mini（#861），而這一節仍寫著
 * GCP ＋ `host-deploy.sh` ⇒ 我照著跑，把 v0.33.0 部署到**回滾機**，
 * ⭐ 而那台的**九項後置條件全綠**、玩家**一個位元組都沒收到**。
 *
 * ⚠️ ⭐ 根因不是記錯 —— 是**一份大家先讀的文件過期了，而沒有任何東西會紅**
 * （第三守則的形狀）。⇒ 這條閘就是那個「會紅的東西」。
 *
 * ⛔ 它刻意**不**驗 DNS 或連線（那需要網路，而閘要能離線跑、要決定性）。
 * ⭐ 它驗的是**兩個名詞的關係**：
 *   「repo 裡真的存在的部署腳本」↔「CLAUDE.md 叫人跑的那一支」。
 */
describe("CLAUDE.md 的部署節 ↔ repo 裡真的存在的部署腳本", () => {
  const root = resolve(__dirname, "../../../..");
  const claude = readFileSync(resolve(root, "CLAUDE.md"), "utf8");
  const section = claude.slice(claude.indexOf("## 🚀 部署協定"));

  /** repo 裡所有名字像部署入口的腳本。⛔ 不是一張手抄清單。 */
  const deployScripts = ["mini-deploy.sh", "host-deploy.sh"].filter((f) =>
    existsSync(resolve(root, "scripts", f)),
  );

  it("量尺先自證：至少找得到一支部署腳本、也切得到部署節", () => {
    expect(deployScripts.length).toBeGreaterThan(0);
    expect(section.length).toBeGreaterThan(500);
  });

  it("⭐ 每一支出貨的部署腳本，部署節都要提到它（⛔ 否則它是隱形的）", () => {
    const missing = deployScripts.filter((f) => !section.includes(f));
    expect(
      missing,
      `這幾支部署腳本在 repo 裡，⛔ 而 CLAUDE.md 的部署節沒提到 ——\n` +
        `  ${missing.join(" · ")}\n` +
        `⚠️ 2026-08-31 就是這樣把 v0.33.0 部署到回滾機的。`,
    ).toEqual([]);
  });

  it("⭐ 正式站那一支要被標成正式站（⛔ 不是只出現過）", () => {
    if (!deployScripts.includes("mini-deploy.sh")) return; // 之後搬走了就不管
    const idxMini = section.indexOf("mini-deploy.sh");
    const idxHost = section.indexOf("host-deploy.sh");
    expect(
      idxMini,
      "⭐ `mini-deploy.sh`（正式站）必須排在 `host-deploy.sh`（回滾機）**前面** —— " +
        "⛔ 讀的人會照第一個看到的跑。",
    ).toBeLessThan(idxHost < 0 ? Number.MAX_SAFE_INTEGER : idxHost);
    expect(section).toContain("回滾機");
  });
});
