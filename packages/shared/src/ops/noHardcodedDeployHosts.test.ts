/**
 * noHardcodedDeployHosts.test.ts —— ⭐ **棘輪**：出貨程式裡⛔不可以再出現 `user@ip`。
 *
 * owner 2026-09-11：「1 2 修正」（＝把掃描到的登入方法收斂掉）。
 *
 * ⚠️ 它**刻意不列舉我們自己的 IP** —— 那等於為了防洩漏而再貼一次
 * （`tools/secret-scan/rules.tsv` 就犯過這個錯）。它禁的是**形狀**,⛔ 不是某幾個值。
 *
 * ⚠️ 範圍只有**出貨程式／腳本／設定**。`docs/` 與 `materials/` 是歷史紀錄與凍結快照,
 * ⛔ 改寫它們既不誠實也拿不回已經公開的東西 —— ⭐ 這條擋的是**下一個**。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
/** `user@<公開 IP>` —— ssh 憑證的一半。⛔ 不含 127.0.0.1／10.x／172.16-31.x（那是本機與私網範例）。 */
const SSH_TARGET = "(^|[^A-Za-z0-9._-])[a-z_][a-z0-9_-]*@(3[0-9]|1[0-9]{2}|2[0-4][0-9])\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}";
/** `~/.ssh/<自訂名>` —— 指名了要偷哪一把（id_rsa 這種全世界通用的名字不算）。 */
const CUSTOM_KEY = "~/\\.ssh/[A-Za-z0-9_.-]+";
const STOCK_KEY = /id_(rsa|dsa|ecdsa|ed25519)|known_hosts|authorized_keys|\.ssh\/config/;
const SCOPE = [":!docs/", ":!materials/", ":!tools/secret-scan/", ":!**/*.test.*", ":!**/*_test.go"];

const grep = (rx: string): string[] => {
  try {
    return execFileSync("git", ["grep", "-I", "-n", "-E", "-e", rx, "--", ...SCOPE],
      { cwd: REPO, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch (e) {
    const x = e as { status: number; stdout?: string };
    if (x.status === 1) return [];            // 1 = 沒命中（⭐ 我們要的）
    throw new Error(`git grep 回 ${x.status} —— ⭐ 這是**沒驗到**,⛔ 不是零發現`);
  }
};

describe("出貨程式裡沒有寫死的部署主機", () => {
  it("⛔ 沒有 `user@<公開 IP>` —— 位址走 scripts/hosts.local.sh", () => {
    cover("no-hardcoded-deploy-hosts");
    expect(grep(SSH_TARGET),
      "寫死的 ssh 目標 ⇒ 公開 repo 等於公開憑證的一半。改用 `ggd_host GGD_…`,值填進 scripts/hosts.local.sh（不進 git）",
    ).toEqual([]);
  });

  it("⛔ 沒有**自訂**私鑰檔名（id_rsa 這種通用名不算）", () => {
    expect(grep(CUSTOM_KEY).filter((l) => !STOCK_KEY.test(l)),
      "自訂金鑰檔名指名了要偷哪一把 —— 路徑改住 scripts/hosts.local.sh",
    ).toEqual([]);
  });
});
