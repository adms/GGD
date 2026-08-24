/**
 * ⭐【技能正規化**總閘**的守衛】—— `tools/skill-normalize/gen.ts --check`。
 *
 * ⚠️ 這一條**真的把那支腳本跑起來**，⛔ 不是掃原始碼字串（失敗形態⑥）。
 * 它釘的是**閘本身還會不會叫**：一條不會叫的閘與綠燈長得一模一樣。
 *
 * ⛔ 第零守則③④⑦：工具腳本層 ⇒ **薄**。這裡只做三件事：
 *   ① 出貨樹上 `--check` 是綠的（＝五欄級距 100%、說明沒有手打數字、
 *      說明↔JSON 沒有新的不一致、文件不過期）
 *   ② ⭐ **承重的突變**：把一支技能的級別改錯（⛔ 只改級別，原始值不動）→ 必須紅
 *   ③ ⭐ **另一個方向的突變**：把說明改回一個手打的機制數字 → 必須紅
 *
 * ⚠️ 兩個突變都在 **tmp 的副本樹**上做，⛔ 不碰 `content/`
 *（CLAUDE.md：測試一律在 localhost 或暫存目錄）。
 */
import { describe, it, expect } from "vitest";
import { unlockSandbox } from "./writeProduct";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
/** 這支閘產生的那一份文件（`--check` 逐位元組比對它）。 */
const DOC = "docs/技能五級距現況.md";

/** 跑 `--check`，回傳離開碼與 stderr。⛔ 不 throw —— 紅是這裡要量的東西。 */
function check(root: string): { code: number; err: string } {
  try {
    execFileSync(
      "npx",
      ["tsx", join(REPO, "tools/skill-normalize/gen.ts"), "--check", "--root", root],
      { cwd: REPO, stdio: "pipe", encoding: "utf8" },
    );
    return { code: 0, err: "" };
  } catch (e) {
    const x = e as { status?: number; stderr?: string };
    return { code: x.status ?? -1, err: String(x.stderr ?? "") };
  }
}

/**
 * repo 的一份可寫副本，突變在它身上做。
 * ⛔ 只複製這支閘真的會讀的三樣東西（`content/` · 棘輪基準線 · 那一份產生的
 * 文件），⛔ 不是整個 `docs/` —— 那是幾十 MB 的無關資料。
 */
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "ggd-skillnorm-"));
  cpSync(join(REPO, "content"), join(dir, "content"), { recursive: true });
  unlockSandbox(join(dir, "content")); // 🔒 同上
  cpSync(
    join(REPO, "packages/shared/src/content/descriptionClaims.baseline"),
    join(dir, "packages/shared/src/content/descriptionClaims.baseline"),
    { recursive: true },
  );
  mkdirSync(join(dir, "docs"), { recursive: true });
  cpSync(join(REPO, DOC), join(dir, DOC));
  return dir;
}

describe("技能正規化總閘（tools/skill-normalize/gen.ts）", () => {
  it("① 出貨樹上是綠的 —— 五欄級距、說明、說明↔JSON 三件事一趟過", () => {
    const r = check(REPO);
    expect(r.code, `⛔ 總閘在出貨樹上就紅了：\n${r.err}`).toBe(0);
  });

  it("② ⭐ 突變：把一支技能的級別改錯（原始值不動）→ 閘必須紅並指名它", () => {
    const dir = sandbox();
    const AB = join(dir, "content/abilities");
    // ⛔ 不寫死一支 id：挑**第一支**填了 `cooldownTier` 的技能，
    //    然後把級別換成**不是它現在那一格**的另一格（⛔ 不抄級距數字）。
    const file = readdirSync(AB)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .find((f) => typeof JSON.parse(readFileSync(join(AB, f), "utf8"))["cooldownTier"] === "string");
    expect(file, "夾具前提：出貨樹上找不到任何一支填了 cooldownTier 的技能").toBeDefined();
    const p = join(AB, file!);
    const doc = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const names = ["極小", "小", "中", "大", "極大"];
    doc["cooldownTier"] = names.find((n) => n !== doc["cooldownTier"])!;
    writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");

    const r = check(dir);
    expect(r.code, "⛔ 級別與原始值說了兩句話，閘卻是綠的").not.toBe(0);
    expect(r.err).toContain(String(doc["id"]));
  });

  it("③ ⭐ 突變：把說明改回一個手打的機制數字 → 閘必須紅", () => {
    const dir = sandbox();
    const AB = join(dir, "content/abilities");
    // 挑第一支說明裡有 `{{cd}}` 的技能，把佔位符換回它現在算繪出來的數字。
    const file = readdirSync(AB)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .find((f) => {
        const d = JSON.parse(readFileSync(join(AB, f), "utf8")) as { description?: string; cooldown?: number[] };
        return (d.description ?? "").includes("{{cd}}") && Array.isArray(d.cooldown);
      });
    expect(file, "夾具前提：出貨樹上找不到任何一支說明帶 {{cd}} 的技能").toBeDefined();
    const p = join(AB, file!);
    const doc = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const cd = (doc["cooldown"] as number[])[0]!;
    doc["description"] = String(doc["description"]).replace("{{cd}}", String(cd));
    writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");

    const r = check(dir);
    expect(r.code, "⛔ 說明退回手打數字，閘卻是綠的 —— 級距一改它就變成謊話").not.toBe(0);
    expect(r.err).toContain(String(doc["id"]));
  });
});
