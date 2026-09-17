/**
 * secretScan.test.ts —— ⭐ 這個 repo 是 **public** 的,所以「有沒有金鑰進去」是一道閘。
 *
 * owner 2026-09-11：「以後可以定期呼叫這個script檢查就好」
 *
 * ⚠️ 這條**不重跑全掃描**（那是 `pnpm secrets:check` 的事,分鐘級）——
 * 它守的是**上一層**：⭐ **那把尺還量得準嗎？**
 *
 * CLAUDE.md 第一守則：「一把只驗過單邊的尺,不算自證過」。
 * 一支掃不到東西的掃描器與一支**壞掉**的掃描器,輸出**一模一樣**（都是 ✅ 零發現）——
 * 這正是本 repo 記過三次的「壞掉跟正常長得一樣」。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const run = (args: string[]) => {
  try {
    return { code: 0, out: execFileSync("bash", ["scripts/secret-scan.sh", ...args],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    const x = e as { status: number; stdout?: string; stderr?: string };
    return { code: x.status, out: `${x.stdout ?? ""}${x.stderr ?? ""}` };
  }
};

describe("secret-scan 這把尺", () => {
  it("兩個方向都自證得過（①抓得到檢體 ②乾淨對照零誤報）", () => {
    const r = run(["--calibrate"]);
    expect(r.out).toContain("校準通過");
    expect(r.code).toBe(0);
  });

  it("⭐ 真的塞一把假金鑰進去會被抓到 —— ⛔ 不是掃不到東西所以綠", () => {
    // 突變：把一個**出貨格式**的假憑證寫進工作樹,掃描必須回非零並指名它。
    const dir = mkdtempSync(join(tmpdir(), "ggd-secret-probe-"));
    const probe = join(dir, "leak.ts");
    // ⚠️ 刻意**不用** AWS 官方文件那把範例 key —— 它在 known-public.tsv 裡,
    //    用它會讓這條突變「被豁免吃掉」而看起來像掃不到。
    writeFileSync(probe, 'export const k = "AKIA' + "QWERTYUIOPASDFGH" + '";\n');
    try {
      const r = run(["--probe", probe]);
      expect(r.out).toContain("aws-akid");
      expect(r.code).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ⛔ 這裡**刻意沒有**「跑一次全樹掃描」那一條 —— 它要 63 秒,而它問的是
  //    「今天乾不乾淨」（一個**會變**的事實),⛔ 不是「這把尺還準不準」。
  //    ⇒ 那一題歸 `pnpm secrets:check`,由人／排程定期跑。
});
