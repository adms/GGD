/**
 * ⏱ `vitest.workspace.ts` 的 `sim` shard（GH#1014 ①）—— 薄守衛，體驗層（測試基礎建設）。
 *
 * 它只問**關係**，⛔ 不問名詞：
 *  ① shard 名單裡的每一支都**真的存在**且是 `src/**\/*.test.ts`（退休的檔會讓 shard 靜默變空 —— 形態③）
 *  ② 分割是**完整且不相交**的：`unit` 排除的 ＝ `sim` 收的 ＝ 名單；`unit` 仍帶著預設的 node_modules 排除
 *  ③ `sim` 真的是 `singleFork`（那是「自己的 pool」在 vitest 2.1.9 唯一的形狀）
 *  ④ 票文點名的兩支（replay / analytics）在名單裡；`GGD_VITEST_SIM_SHARD=0` 回單一 project
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults } from "vitest/config";
import projects, { SIM_SHARD_FILES, SIM_SHARD_ENABLED } from "../vitest.workspace";

type Project = { root?: string; test?: { name?: string; include?: string[]; exclude?: string[]; poolOptions?: { forks?: { singleFork?: boolean } } } };
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const byName = (name: string): Project =>
  (projects as Project[]).find((p) => typeof p === "object" && p.test?.name === name) ??
  (() => { throw new Error(`workspace 少了 project "${name}"`); })();

describe("vitest.workspace.ts —— sim shard（GH#1014）", () => {
  it("① 名單裡每一支都存在、都在 src/ 底下、都是 *.test.ts", () => {
    expect(SIM_SHARD_ENABLED, "這條守衛預設在開著的世界跑；關掉時見④").toBe(true);
    expect(SIM_SHARD_FILES.length).toBeGreaterThan(0);
    for (const f of SIM_SHARD_FILES) {
      expect(f, "要與 vitest.config.ts 的 include（src/**/*.test.ts）同一個母體").toMatch(/^src\/.+\.test\.ts$/);
      expect(existsSync(join(PKG, f)), `⛔ 退休的檔留在 shard 名單：${f}`).toBe(true);
    }
  });

  it("② 分割完整且不相交：unit 排除的 ＝ sim 收的 ＝ 名單，且 unit 還帶著預設排除", () => {
    const unit = byName("unit");
    const sim = byName("sim");
    expect(sim.test?.include).toEqual([...SIM_SHARD_FILES]);
    for (const f of SIM_SHARD_FILES) expect(unit.test?.exclude, `unit 沒排除 ${f} ⇒ 它會跑兩次`).toContain(f);
    for (const d of configDefaults.exclude) expect(unit.test?.exclude, "給了 exclude 就取代預設 —— node_modules 要帶著").toContain(d);
    expect(unit.root).toBe(PKG);
    expect(sim.root).toBe(PKG);
    // ⭐ 反方向：母體裡每一支 *.test.ts 都落在**恰好一個** project（名單以外的一律是 unit）。
    const all = readdirSync(join(PKG, "src"), { recursive: true, encoding: "utf8" })
      .filter((p) => p.endsWith(".test.ts"))
      .map((p) => `src/${p}`);
    const inSim = all.filter((p) => SIM_SHARD_FILES.includes(p));
    expect(inSim.sort()).toEqual([...SIM_SHARD_FILES].sort());
    expect(all.length - inSim.length).toBeGreaterThan(0);
  });

  it("③ sim 是 singleFork（等 unit 跑完、一個子行程序跑）；unit 不是", () => {
    expect(byName("sim").test?.poolOptions?.forks?.singleFork).toBe(true);
    expect(byName("unit").test?.poolOptions?.forks?.singleFork).not.toBe(true);
  });

  it("④ 票文點名的兩支在名單裡；GGD_VITEST_SIM_SHARD=0 ⇒ 單一 project（一行回頭）", async () => {
    expect(SIM_SHARD_FILES).toContain("src/replay/replay.test.ts");
    expect(SIM_SHARD_FILES).toContain("src/analytics/analytics.test.ts");
    vi.stubEnv("GGD_VITEST_SIM_SHARD", "0");
    vi.resetModules();
    const off = await import("../vitest.workspace");
    vi.unstubAllEnvs();
    expect(off.SIM_SHARD_ENABLED).toBe(false);
    expect(off.default).toEqual(["./vitest.config.ts"]);
  });
});
