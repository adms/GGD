/**
 * GH#708 —— `deriveCastTimes.ts` 安靜地跳過一位英雄。
 *
 * 2026-08-25 量到:平常寫 14 champion docs / 42 embedded copies,那一次只有 **13 / 39**
 * —— `content/champions/godie-edem.json` 的 Q/W/E 三格 `castTimeSec` 整格消失
 * (standalone 有、內嵌沒有),而唯一叫出來的是 `abilityMirror.test.ts`,
 * 一句**不指向這支腳本**的訊息。
 *
 * ⭐ 真因:這支腳本用**出貨政策**(`quarantine`)載入內容 —— 一份 schema/id/硬參照
 * 壞掉的英雄卡會被**安靜地從 store 拿掉** ⇒ 它不在 `Champions.all()` 裡 ⇒ 腳本
 * 連看都沒看過它。⛔ 而它的 standalone 技能檔自己是好的,照樣寫對了 ——
 * 於是「兩邊各說各話」看起來像鏡像壞了,而不是**產生器漏寫**。
 * 修法與 `buildIndexes.ts` 逐字相同:**產出期一律 `fail-closed`**。
 *
 * ⛔ 這條**不掃原始碼字串**(失敗形態⑥) —— 它真的把腳本跑起來,餵一份壞掉的英雄卡。
 * ⭐ 而且先跑一次**乾淨**的當量尺校準:控制組不綠 ⇒ 這條測試的結論作廢。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const CONTENT = join(ROOT, "content");
const SCRIPT = join(ROOT, "packages/shared/scripts/deriveCastTimes.ts");
const TSX = join(ROOT, "node_modules/.bin/tsx");

/** 一棵**符號連結**的內容樹:除了 `champions/` 以外全部指回真的 content/(⛔ 不複製 354MB)。 */
function farm(): string {
  const dir = mkdtempSync(join(tmpdir(), "ggd-derive-"));
  for (const e of readdirSync(CONTENT)) {
    if (e === "champions") continue;
    symlinkSync(join(CONTENT, e), join(dir, e));
  }
  mkdirSync(join(dir, "champions"));
  for (const f of readdirSync(join(CONTENT, "champions"))) {
    symlinkSync(join(CONTENT, "champions", f), join(dir, "champions", f));
  }
  return dir;
}

/** 乾跑(⛔ 不帶 --write):載入 → 報表 → 離開。回傳離開碼與全部輸出。 */
function run(contentDir: string): { code: number; out: string } {
  try {
    const out = execFileSync(TSX, [SCRIPT], {
      cwd: ROOT,
      env: { ...process.env, GGD_CONTENT_DIR: contentDir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("deriveCastTimes 不可以安靜地跳過一位英雄 (GH#708)", () => {
  it("一份載不進來的英雄卡 ⇒ 非零離開並指名是誰", { timeout: 120_000 }, () => {
    expect(existsSync(TSX), `${TSX} 不存在 —— 先 pnpm install`).toBe(true);

    // ── 校準:量尺自己要先量得到「綠」,否則下面那個「紅」什麼都不證明 ──
    const clean = run(farm());
    expect(clean.code, `控制組應該是綠的:\n${clean.out.slice(-800)}`).toBe(0);
    expect(clean.out).toMatch(/走過 (\d+)\/\1 位英雄/);

    // ── 突變:挑第一位英雄,把 id 改成 schema 收不下的樣子(⇒ 出貨政策會安靜隔離它) ──
    const dir = farm();
    const idx = JSON.parse(readFileSync(join(CONTENT, "champions", "_index.json"), "utf8")) as {
      entries: { id: string }[];
    };
    const victim = idx.entries[0]!.id;
    const p = join(dir, "champions", `${victim}.json`);
    const raw = readFileSync(p, "utf8");
    // ⛔⛔ 先 `unlink` —— `writeFileSync` 會**跟著符號連結寫進真的 content/**。
    unlinkSync(p);
    writeFileSync(p, raw.replace(`"id": "${victim}"`, `"id": "${victim}-TYPO"`));

    const broken = run(dir);
    expect(broken.code, "一份載不進來的英雄卡必須讓產生器回非零").not.toBe(0);
    expect(broken.out, "訊息要指名是哪一位英雄").toContain(victim);
  });
});
