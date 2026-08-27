/**
 * 🔒 **隔離區的兩個反方向** —— GH#815（owner 2026-08-27：「請你尋找污染源、根因有哪些」）。
 *
 * ## 這一條為什麼是新的
 * `laneYQuarantineAgreesWithGenguard.test.ts` ④ 已經在問
 * 「每一個**被宣告**的檔鎖得對不對」。⭐ 而它的迴圈是 `for (const [f, owners] of claimants)`
 * ⇒ 一個 **444 而沒有人宣告**的檔**永遠不會進 `claimants`**
 * ⇒ ⛔ 它結構上問不出「每一個**被鎖**的檔有沒有人宣告」。
 *
 * ⚠️ 那正是本 repo 記錄過的「只驗名詞、不驗兩個名詞的關係」的**反方向**：
 * 兩個名詞（鎖 · 戶籍）各自都對，壞的是**配對**。
 * 量到 2 份孤兒（`content/config/move-speed-tiers.json` ·
 * `content/ability-templates/tpl-beam-roll.json`）—— ⭐ **永久唯讀**：
 * 沒有 `genrun <step>` 解得開（`product-quarantine.sh` 從 `writes` 推導要解哪些），
 * 也沒有產生器會重生成它們。
 *
 * ## 第二條：入口
 * 量到 **26/40** 產生器 script **裸跑**（自帶解鎖的是 **0** 支）⇒
 * ⭐ 打 `pnpm content:build` 必然 EACCES ——
 * ⚠️ 而 **CLAUDE.md 自己在硬性技術約束裡叫人打它（3 次）**。
 * ⇒ 「要記得走 genrun」是**判準**，而這份 repo 記錄過五次判準失效。這一條把它變成閘。
 *
 * ⛔ `*:check` **刻意不包**（它們本來就唯讀；包了會讓一個唯讀的檢查變成會寫檔的東西）。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · `chmod 444 content/config/move-speed-tiers.json` → ① 紅並逐檔指名。實測過。
 */
import { describe, expect, it } from "vitest";
import { chmodSync, readFileSync, statSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string): string => readFileSync(join(REPO, p), "utf8");

/** `sync-io.json` 的 `writes` 展開成實體檔路徑。 */
function claimed(): Set<string> {
  const io = JSON.parse(read("tools/parallel-gates/sync-io.json")) as {
    steps: { name: string; writes?: string[] }[];
  };
  const out = new Set<string>();
  for (const s of io.steps)
    for (const w of s.writes ?? [])
      for (const f of /[*?[]/.test(w) ? globSync(w, { cwd: REPO }) : [w]) out.add(f);
  return out;
}

describe("隔離區的兩個反方向 (quarantine-orphans-and-entrypoints)", () => {
  it("⭐ ① 每一個被鎖的 `content/` 檔都要有人宣告（⛔ 反方向：⛔ 不是「被宣告的鎖得對嗎」）", () => {
    const owned = claimed();
    const all = globSync("content/**/*.json", { cwd: REPO }).filter((p) => !p.includes("/_legacy/"));
    expect(all.length, "掃不到任何 content json —— 母體壞了").toBeGreaterThan(100);

    const orphans = all.filter(
      (p) => !owned.has(p) && (statSync(join(REPO, p)).mode & 0o200) === 0,
    );
    expect(
      orphans.join("\n"),
      "⛔ 這些檔是 **444 而沒有任何 step 宣告寫它** ⇒ ⭐ **永久唯讀的孤兒**：\n" +
        "   · 沒有 `genrun <step>` 解得開（product-quarantine 從 writes 推導要解哪些）\n" +
        "   · 也沒有產生器會重生成它們\n" +
        "   ⇒ 二選一：**補進 sync-io.json 的 writes**（它真的是產物）／**chmod 644**（它是手編檔）。\n",
    ).toBe("");
  });

  it("⭐ ② 寫產物的產生器入口要自帶解鎖，⛔ 而 `*:check` 一支都不准被包", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const io = JSON.parse(read("tools/parallel-gates/sync-io.json")) as {
      steps: { name: string; writes?: string[] }[];
    };
    const writers = new Set(io.steps.filter((s) => (s.writes ?? []).length > 0).map((s) => s.name));

    // ⭐ **兩個獨立的推導** —— ⛔ 一個不夠（實測：第一個漏了 10 支）。
    //  ① `sync-io.json` 宣告寫產物的步驟
    //  ② ⭐ 存在 `X:check` 的那些 —— `--check` 逐位元組比對的**前提**就是「有一份產物」，
    //     ⇒ 產它的那一支必然寫產物。⚠️ 這一條抓到了 ① 漏掉的 `spec:build`
    //     （它的輸出 `docs/editor-contract/ggd-ability-prose.json` 在 sync-io 裡
    //     掛在 **skillremake:json** 名下 ⇒ ① 看不見它，而它照樣 EACCES）。
    const SUF = ["build", "apply", "json", "export", "csv", "audit", "numbers",
                 "docs", "provenance", "wishes", "plan", "readme", "status", "roll"];
    const producers = new Set(writers);
    for (const k of Object.keys(pkg.scripts))
      if (k.endsWith(":check"))
        for (const suf of SUF) {
          const p = `${k.slice(0, -":check".length)}:${suf}`;
          if (pkg.scripts[p] !== undefined) producers.add(p);
        }

    const bare = [...producers].filter(
      (k) => pkg.scripts[k] !== undefined && !k.endsWith(":raw") && !pkg.scripts[k]!.includes("genrun.sh"),
    );
    expect(
      bare.map((k) => `pnpm ${k}`).join("\n"),
      "⛔ 這些入口**裸跑** —— 打下去會直接寫 444 產物 ⇒ **EACCES**。\n" +
        "   ⭐ 而 CLAUDE.md 自己在「硬性技術約束」裡叫人打其中幾支。\n" +
        "   → 包成 `bash scripts/genrun.sh <step> <step>:raw`，真正的指令搬到 `<step>:raw`。\n",
    ).toBe("");

    const wrongly = Object.keys(pkg.scripts).filter(
      (k) => k.endsWith(":check") && pkg.scripts[k]!.includes("genrun.sh"),
    );
    expect(
      wrongly.join("\n"),
      "⛔ `*:check` 是**唯讀**的檢查，包進解鎖會讓它變成一個會寫檔的東西。",
    ).toBe("");
  });

  it("③ 巢狀防護真的在：`sync.mjs` 宣告已解鎖，`genrun.sh` 看得懂", () => {
    expect(read("tools/parallel-gates/sync.mjs"), "⛔ sync.mjs 沒宣告已解鎖").toContain(
      "GGD_QUARANTINE_UNLOCKED",
    );
    expect(
      read("scripts/genrun.sh"),
      "⛔ genrun 不認得已解鎖上下文 ⇒ 鏈上第一支跑完就把產物鎖回去，\n" +
        "   後面寫同一批檔的步驟吃 EACCES —— 而每一支單獨跑都是綠的。",
    ).toContain("GGD_QUARANTINE_UNLOCKED");
  });
});
