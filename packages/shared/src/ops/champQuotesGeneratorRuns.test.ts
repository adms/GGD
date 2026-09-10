/**
 * 🧪 2026-09-10 —— **名言產生器要 join 出貨 roster**（⛔ 不是自稱一個手打的涵蓋率）。
 *
 * ## 病灶（2026-09-10 量到，⛔ 不是引用別人的數字）
 * `build-champ-quotes.mjs` 用三張**手寫的表**，⛔ **從來沒有讀過 `content/champions/`**，
 * 而它的註解與 `generatedBy` 逐字自稱「**full 113 coverage**」——⭐ 113 是**手打的常數**。
 *
 * | 量的東西 | 探針 | 數 |
 * |---|---|---|
 * | 出貨 roster | `content/champions/*.json` 的 `doc.id`（排除 `_index.json`） | **153** |
 * | 它產出的 id | 跑一次真的產生器，讀 `quotes.json` 的 `quotes` 鍵 | **113** |
 * | 其中英雄已搬進 `content/_legacy/champions/` | 同上 ∩ legacy | **45** |
 * | ⇒ ⭐ 真的有名言的出貨英雄 | 113 − 45 | **68** |
 * | ⇒ ⛔ **一句都沒有的出貨英雄** | 153 − 68 | ⭐ **85** |
 *
 * ⭐ 而它 **exit 0**。⚠️ 姊妹支 `build-champ-names.mjs` 有一模一樣的病（GH#811），
 * ⭐ 差別只在**它 join 了 roster**，所以它會紅；這一支不 join，所以它不會紅。
 * ⇒ ⭐ 這正是本 repo 記過最多次的形狀：**一句在它到期之後還活著的散文，
 *   而沒有任何東西變紅**（第三守則）。
 *
 * ## ⭐ 這一條問的是**關係**，⛔ 不是「有沒有那行程式」
 * 拿**真的**產生器、餵**真的** `content/champions/` ＋ `content/_legacy/champions/`，
 * 看它的離開碼與它自己算出來的涵蓋率。⭐ 四個方向裡**兩頭都走過**
 * （第二守則⑫：只從一頭走的掃描，結構上對另一頭失明）。
 *
 * ⚠️ ⛔ 不驗名言的**內容**（那要有出處才判得了，而出處是人審的事）——
 * ⭐ 這一條只保證「**缺一句就會有人被指名**」。
 *
 * ── 突變紀錄（一批一條，⭐ 挑承重的那一條）──────────────────────────────────
 *  · 把 EXTRA 裡 `community-review-35-20260907`（炭治郎）那一列拿掉
 *    → ⭐ 第 1 條紅、離開碼 1，訊息逐字指名
 *      「出貨英雄 community-review-35-20260907（炭治郎）沒有名言」。實測過。
 *  · 對照：在此之前（未 join roster）同一個拿掉的動作 → **exit 0，什麼都不說**。
 */
import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = "tools/tts-gen/src/build-champ-quotes.mjs";

/** 一棵**只含產生器要的東西**的樹。⛔ 不在真 repo 上跑 —— 它會寫 `content/`。 */
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "ggd-champ-quotes-"));
  mkdirSync(join(root, "tools/tts-gen"), { recursive: true });
  cpSync(join(REPO, "tools/tts-gen/src"), join(root, "tools/tts-gen/src"), { recursive: true });
  cpSync(join(REPO, "content/champions"), join(root, "content/champions"), { recursive: true });
  cpSync(join(REPO, "content/_legacy/champions"), join(root, "content/_legacy/champions"), { recursive: true });
  cpSync(
    join(REPO, "content/assets/audio/voices/quotes"),
    join(root, "content/assets/audio/voices/quotes"),
    { recursive: true },
  );
  return root;
}

const run = (root: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(process.execPath, [GEN, ...args], { cwd: root, encoding: "utf8", env });
const patch = (root: string, from: string, to: string) => {
  const p = join(root, GEN);
  const src = readFileSync(p, "utf8");
  expect(src).toContain(from); // ⛔ 對不上就紅，⛔ 不要靜默地什麼都沒改
  writeFileSync(p, src.replace(from, to));
};

describe("名言產生器 join 出貨 roster (champ-quotes-generator-runs)", () => {
  it("`--check` 不因 CI／sandbox 沒有 macOS `say` 聲音而誤報 stale", () => {
    const root = sandbox();
    const r = run(root, ["--check"], { ...process.env, PATH: "/nonexistent" });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/2 products up to date/);
  });

  it("⭐ 出貨 roster ⇒ EXIT 0，而涵蓋率是**算出來的**且自洽", () => {
    const root = sandbox();
    const r = run(root);
    expect(r.status).toBe(0);
    const m = JSON.parse(readFileSync(join(root, "content/assets/audio/voices/quotes/quotes.json"), "utf8"));
    const c = m.coverage;
    // 分母是讀出來的出貨英雄數，⛔ 不是任何一張表的長度。
    expect(c.rosterShipping).toBeGreaterThan(100);
    // ⭐ 每一位出貨英雄要嘛有名言、要嘛被宣告成查不到出處 —— 沒有第三種。
    expect(c.shippingWithQuote + c.unsourced).toBe(c.rosterShipping);
    // 留空的每一位都要帶著**為什麼**（⛔ 不是「還沒做」）。
    for (const u of m.unsourced) expect(String(u.why ?? "")).not.toHaveLength(0);
    // ⛔ 那句手打的「full 113 coverage」不可以復活。
    expect(JSON.stringify(m)).not.toMatch(/full \d+ coverage/);
  });

  it("⛔ 出貨英雄**缺**名言、也沒有宣告 ⇒ fatal 並指名他（⭐ 承重）", () => {
    const root = sandbox();
    writeFileSync(
      join(root, "content/champions/zz-ghost.json"),
      JSON.stringify({ id: "zz-ghost", name: "幽靈 - 測試", schema: "champion@1" }),
    );
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/出貨英雄 zz-ghost（幽靈 - 測試）沒有名言/);
  });

  it("⛔ 名言列在 `content/` 與 `_legacy/` **都**查不到 ⇒ fatal 並指名它", () => {
    const root = sandbox();
    patch(
      root,
      "const EXTRA = [",
      'const EXTRA = [\n  { id: "zz-nowhere", name: "x", character: "x", gender: "male", jpQuote: "テスト", romaji: "tesuto", zhGloss: "x", source: "x" },',
    );
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/名言列 zz-nowhere .*都\*\*查不到|名言列 zz-nowhere/);
  });

  it("⛔ 宣告「查不到出處」而其實有名言 ⇒ fatal（⭐ 過期的宣告會讓閘永遠閉嘴）", () => {
    const root = sandbox();
    patch(root, "const UNSOURCED = {", 'const UNSOURCED = {\n  sela: "b2Identity",');
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/UNSOURCED sela .*其實有名言/);
  });
});
