/**
 * syncPlan.test.ts —— ⭐ **裁剪過的 `skills:sync` 不可以漏掉一支會過期的產生器。**
 *
 * owner 2026-08-23:「為什麼我要全跑 skills 產生器,即使我沒有做技能更動或小範圍更動
 * 也需要全跑嗎 可以用旗標註明是否有改動需要跑哪支就好?」
 *
 * ⚠️ 一支「裁掉太多」的排程器**看起來完全正常** —— 它只是讓某一份產物停在舊的那一天,
 * 而 `--check` 要到下一次有人全跑才紅。⇒ 三條斷言全部打**漏掉**那一側:
 * ① 涵蓋(直接讀) ② fail-closed(沒見過的路徑 ⇒ 全跑) ③ 下游閉包 ④ 拓撲順序。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
type Plan = { full: boolean; fullReason: string | null; steps: string[]; layerNames: string[][] };
// ⚠️ 非字面值的 specifier ⇒ TS ⛔ 不會去找 `.d.mts`(那支住在 tools/,不歸這一包管)。
const { planFromPaths, planFor, inputTable, readScripts } = (await import(
  new URL("../../../../tools/parallel-gates/syncPlan.mjs", import.meta.url).href
)) as {
  planFromPaths: (paths: string[], repo?: string) => Plan;
  planFor: (a: Record<string, unknown>) => Plan;
  inputTable: (r: string, io: unknown, s: unknown) => Record<string, unknown>;
  readScripts: (r: string) => unknown;
};
const io = JSON.parse(readFileSync(join(REPO, "tools/parallel-gates/sync-io.json"), "utf8"));
const step = (n: string) => io.steps.find((s: { name: string }) => s.name === n);
/** 量到的讀裡有這個前綴的那幾支 —— ⭐ 期望值也是**推導**的,⛔ 不是抄一張名單。 */
const readers = (prefix: string): string[] =>
  io.steps.filter((s: { reads: string[] }) => s.reads.some((r) => r.startsWith(prefix))).map((s: { name: string }) => s.name);

describe("skills:sync 按改動裁剪", () => {
  it("① 改一份英雄 ⇒ 每一支量到讀英雄的產生器都在計畫裡", () => {
    const p = planFromPaths(["content/champions/godie-h01o.json"], REPO);
    expect(p.full, "這是看得懂的路徑,⛔ 不該退回全跑").toBe(false);
    const missing = readers("content/champions/").filter((n) => !p.steps.includes(n));
    expect(missing, `這幾支真的讀英雄卻被裁掉 ⇒ 它們的產物會停在舊的那一天:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("② fail-closed —— 對不到輸入表的路徑 ⇒ 全跑", () => {
    const p = planFromPaths(["content/brand-new-collection/x.json"], REPO);
    expect(p.full).toBe(true);
    expect(p.fullReason).toContain("content/brand-new-collection/x.json");
    expect(p.steps.length).toBe(io.steps.length);
    // ⭐ 表過期(package.json 加了第 33 支)也是 fail-closed 的一種
    const { table, roots, chainSteps } = inputTable(REPO, io, readScripts(REPO));
    const stale = planFor({ io, table, roots, chainSteps, paths: [], chainStale: true });
    expect(stale.full).toBe(true);
    expect(stale.steps.length).toBe(io.steps.length);
  });

  it("③ 下游閉包 —— 只改一支產生器,吃它產物的那幾支也要跑", () => {
    // `tiers:apply` 重寫 content/abilities/**;⭐ 期望值從**它寫了什麼**推導。
    const p = planFromPaths(["tools/skill-remake/apply_tiers.py"], REPO);
    expect(p.steps).toContain("tiers:apply");
    const written = new Set<string>(step("tiers:apply").writes);
    const downstream = io.steps
      .filter((s: { name: string; reads: string[] }) => s.name !== "tiers:apply" && s.reads.some((r) => written.has(r)))
      .map((s: { name: string }) => s.name);
    expect(downstream.length).toBeGreaterThan(5);
    const missing = downstream.filter((n: string) => !p.steps.includes(n));
    expect(missing, `這幾支吃 tiers:apply 的產物卻沒被排進來:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("④ 拓撲 —— contract:numbers 一定排在 content:build 後面", () => {
    const p = planFromPaths(["content/champions/godie-h01o.json"], REPO);
    const layerOf = (n: string) => p.layerNames.findIndex((row: string[]) => row.includes(n));
    expect(layerOf("content:build")).toBeGreaterThanOrEqual(0);
    expect(
      layerOf("contract:numbers"),
      "CLAUDE.md 逐字:contract:numbers 必須在 content:build 之後,單獨跑會得到「產生器說 OK 但 --check 說 stale」",
    ).toBeGreaterThan(layerOf("content:build"));
  });

  it("⑤ 產生器碰不到的 root(apps/**)⇒ 只跑真的掃原始碼的那幾支", () => {
    const p = planFromPaths(["apps/client/src/GameApp.ts"], REPO);
    expect(p.full).toBe(false);
    expect(p.steps.length).toBeLessThan(io.steps.length / 2);
  });
});
