/**
 * 🎗️ GH#753 —— **stock 轉換入口看得見 RIBB（緞帶）了**，而且它的量尺**三個分支都準**。
 *
 * ## 病灶
 * `convert_stock_model.py` 的 `grep -ic ribb` = **0**：解析器那一半早就在
 * （`w3xlib.particles._parse_ribb`，56 份出貨 `ribbon@1` 就是它的產物），
 * ⛔ 缺的只是**轉換入口從來沒問過**。於是一顆帶 8 條緞帶的模型轉進來以後，
 * 轉檔紀錄**看起來是完整的**而少了一整族 emitter。
 *
 * ## ⭐ 控制組每一顆各站一邊 —— ⛔ 一把只驗過單邊的尺不算自證過
 * 緞帶畫不出像素有**三種互相獨立**的死法，所以控制組要能**逐一**點亮它們。
 * 四顆模型全部在 git 裡（`out/GoDieEX22s/raw/`，129 份被追蹤的 .mdx）
 * ⇒ ⛔ 不需要零售 MPQ，這條閘在任何一台機器上都跑得起來。
 *
 * | 模型 | 已知 | 隔離出哪一個分支 |
 * |---|---|---|
 * | `HolyAwakening.mdx` | RIBB×8，α=1.0 · KRVS=1.0 · 寬 36 | 「**有**」那一邊 |
 * | `WindMissle.mdx` | RIBB×3，**α=0.6 而 KRVS 峰值 0** | 只有**可見度軌** |
 * | `SD2.mdx` | RIBB×4，其中 1 條**寬度 0**、其餘 3 條正常 | 只有**寬度**，⭐ 而且是**同一顆模型內**的 1 死 3 活 |
 *
 * ⚠️ ⭐ 第一版的控制組挑了 `DeathWave.mdx`（α=0 **且** KRVS=0）——
 * ⛔ **兩個原因同時成立**，於是把 KRVS 那一行改壞它照樣紅不起來（實測：突變沒咬）。
 * 這正是「守衛是靠別的東西才綠/紅的」——⇒ 控制組換成**單一死因**的那三顆。
 *
 * ⚠️ 這裡⛔ 不驗數字（寬度／壽命／發射率是原作資料，⛔ 不是我們的決定），
 * 只驗**判決**與**條數**。
 *
 * ── 突變紀錄 ─────────────────────────────────────────────────────────
 *  · `ribbon_report()` 的 `_, peak_v, animated_v = peak("KRVS", 1.0)` 改成
 *    固定 `peak_v = 1.0` → WindMissle 那一條紅（3 條被誤判成畫得出來）。實測過。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const RAW = "tools/w3x-import/out/GoDieEX22s/raw";

/** 真的把出貨的那支腳本 import 進來跑 `ribbon_report`，⛔ 不是掃原始碼字串。 */
function verdicts(mdx: string): string[] {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import sys, json; sys.path.insert(0, "tools/w3x-import"); sys.argv = ["x"]\n` +
        `import convert_stock_model as C\n` +
        `print(json.dumps([x["verdict"] for x in C.ribbon_report(open("${RAW}/${mdx}", "rb").read())]))`,
    ],
    { cwd: REPO, encoding: "utf8" },
  );
  expect(r.status, `ribbon_report 跑不起來：${r.stderr}`).toBe(0);
  return JSON.parse(r.stdout.trim()) as string[];
}

const dead = (v: string[]): number => v.filter((x) => x.startsWith("never-visible")).length;

describe("stock 轉換入口的 RIBB 那一半（GH#753）", () => {
  it("三個死法各自量得到，而且已知畫得出來的不會被誤殺", () => {
    const alive = verdicts("HolyAwakening.mdx");
    expect(alive).toHaveLength(8);
    expect(dead(alive), `HolyAwakening 被誤殺：${alive}`).toBe(0);

    // 只有 KRVS 是 0（α=0.6 仍然 > 0）⇒ 這一條紅了就代表可見度軌沒被讀。
    const krvs = verdicts("WindMissle.mdx");
    expect(krvs).toHaveLength(3);
    expect(krvs.every((v) => v.includes("KRVS")), `WindMissle：${krvs}`).toBe(true);

    // 同一顆模型內 1 死 3 活 ⇒ ⭐ 證明它是**逐條**判的，⛔ 不是整顆一起答。
    const width = verdicts("SD2.mdx");
    expect(width).toHaveLength(4);
    expect(dead(width), `SD2 應該只有 1 條死：${width}`).toBe(1);
    expect(width.find((v) => v.startsWith("never-visible"))).toContain("寬度 0");
  });

  it("盤點入口存在（⛔ 不落到會寫檔的轉換路徑）", () => {
    const help = spawnSync("python3", ["tools/w3x-import/convert_stock_model.py", "--help"], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--inventory");
  });
});
