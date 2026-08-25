/**
 * GH#710 —— `skills:sync` **一次收斂不了**。
 *
 * 量到的（`tools/parallel-gates/sync-io.json`，⛔ 不是手寫）：3 支產生器排在
 * `content:build`（鏈上第 11 支）**後面**，而它們寫的檔正是排在它們**前面**的
 * 那幾支會讀的 —— `jasscombo:build`(28) · `vfxbind:build`(29) · `sfxbind:build`(30)。
 * ⇒ 它們一改輸出，`bundle.json` / `contract:numbers` 就落後一步；
 *   2026-08-26 實測要跑**兩次**完整鏈才綠。
 *
 * ⭐ 這條閘問的是**兩個名詞的關係**：「鏈上還有沒有這種**後置寫入端**」ד有沒有
 * 接上收斂器」。⛔ 不是掃字串問「converge.mjs 存不存在」。
 * ⇒ 哪一天有人真的把拓撲序修好（後置寫入端歸零），這條**自動放行**，⛔ 不必改測試。
 *
 * ⚠️ 為什麼**不**在測試裡真的跑一次 sync：`skills:sync` 是全域鎖、以**分鐘**計，
 * 而 CLAUDE.md 第零守則的 5 分鐘規則直接禁止把它放進閘。⇒ 拆成兩半：
 * ①**拓撲**從量到的 I/O 推導；②**迴圈本身**用注入的 runner 驗（⛔ 不跑真的 sync）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { converge, staleStepsFrom, DEFAULT_MAX_ROUNDS } from "../../../../tools/parallel-gates/converge.mjs";

const ROOT = join(__dirname, "../../../..");
const io = JSON.parse(readFileSync(join(ROOT, "tools/parallel-gates/sync-io.json"), "utf8")) as {
  steps: { name: string; reads?: string[]; writes?: string[] }[];
};

/** 排在自己的讀者**後面**的寫入端 —— 一次線性掃鏈就不可能收斂的那一種。 */
function lateWriters(): string[] {
  const out: string[] = [];
  io.steps.forEach((s, i) => {
    const w = (s.writes ?? []).filter((p) => p.startsWith("content/"));
    if (!w.length) return;
    const readEarlier = io.steps.slice(0, i).some((e) => (e.reads ?? []).some((r) => w.includes(r)));
    if (readEarlier) out.push(s.name);
  });
  return out;
}

const ok = (out = "") => ({ code: 0, out });
const bad = (out: string) => ({ code: 1, out });

describe("skills:sync 要收斂 (GH#710)", () => {
  it("鏈上還有後置寫入端 ⇒ ship 的序列段必須走收斂器", () => {
    const late = lateWriters();
    const ship = readFileSync(join(ROOT, "tools/parallel-gates/ship.mjs"), "utf8");
    // 拓撲修好了就不需要收斂器 —— 這條自動放行。
    if (late.length === 0) return;
    expect(
      /const SERIAL = .*SYNC_STEP/.test(ship) && /SYNC_STEP\s*=\s*[^\n]*"sync:converge"/.test(ship),
      `鏈上有 ${late.length} 支後置寫入端（${late.join(" · ")}）⇒ 一次線性掃鏈收斂不了，` +
        `而 ship.mjs 的序列段沒有接上 sync:converge。`,
    ).toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["sync:converge"], "sync:converge 這支 script 要存在").toContain("converge.mjs");
  });

  it("迴圈:第二輪綠就停 · 跑滿上限回非零 · 震盪提早停", async () => {
    // ① 第一輪 stale、第二輪綠 ⇒ 收斂（⛔ 不會白跑第三輪）
    let round = 0;
    const a = await converge({
      runSync: () => Promise.resolve(ok()),
      runCheck: () => Promise.resolve(++round === 1 ? bad("═══ contract:numbers（exit 1）") : ok()),
    });
    expect(a).toMatchObject({ converged: true, rounds: 2 });

    // ② 永遠 stale（而且每輪不同）⇒ 跑滿上限、回非零、列出仍 stale 的那幾支
    let n = 0;
    const b = await converge({
      runSync: () => Promise.resolve(ok()),
      runCheck: () => Promise.resolve(bad(`═══ step${++n}（exit 1）\n═══ vfxbind:check（exit 1）`)),
    });
    expect(b.converged).toBe(false);
    expect(b.rounds).toBe(DEFAULT_MAX_ROUNDS);
    expect(b.stale).toContain("vfxbind:check");

    // ③ 連兩輪同一批 ⇒ 震盪，第二輪就停（⛔ 不燒第三輪）
    const c = await converge({
      runSync: () => Promise.resolve(ok()),
      runCheck: () => Promise.resolve(bad("═══ vfxbind:check（exit 1）")),
    });
    expect(c).toMatchObject({ converged: false, rounds: 2 });
    expect(c.reason).toContain("震盪");

    // ④ sync 自己紅了 ⇒ 立刻停,⛔ 不當成「還沒收斂」再跑一輪
    const d = await converge({ runSync: () => Promise.resolve(bad("boom")), runCheck: () => Promise.resolve(ok()) });
    expect(d).toMatchObject({ converged: false, rounds: 1 });

    // 半形括號（sync.mjs）與全形括號（run.mjs）都要撈得到
    expect(staleStepsFrom("═══ caps:check(exit 1)\n═══ spec:check（exit 2）")).toEqual(["caps:check", "spec:check"]);
  });
});
