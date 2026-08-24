/**
 * 蝗蟲群普查產生器的薄守衛（GH#688 Phase 1–3 · 第零守則:體驗層 ≤80 行）。
 * ⛔ 不釘數字（57/236 都是資料，會隨來源變）—— 下界全部從來源檔動態算。
 * 突變驗證（一條承重線）：gen.mjs 把 tint 欄從單位列拿掉 ⇒ ②紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const SRC = join(REPO, "tools/w3x-import/out/GoDieEX22s-src");
const census = JSON.parse(readFileSync(join(HERE, "census.json"), "utf8"));

describe("locust census generator", () => {
  it("① --check 綠（兩份產物是產生器此刻會寫出的位元組）", () => {
    execFileSync("node", [join(HERE, "gen.mjs"), "--check"], { cwd: REPO, stdio: "pipe" });
  });

  it("② dummy 表非空、含 h007，且 tint 欄逐位對得上 UNIT_TINTS.json", () => {
    expect(census.units.length).toBeGreaterThan(0);
    const h007 = census.units.find((u) => u.id === "h007");
    expect(h007, "h007 特效龜派（悟空 09-04 pilot dummy）必須在普查集").toBeTruthy();
    expect(h007.model).toContain("ReviveHuman");
    expect(h007.criteria).toContain("Aloc");
    const tints = JSON.parse(readFileSync(join(SRC, "UNIT_TINTS.json"), "utf8")).units;
    const tinted = census.units.filter((u) => u.tint != null);
    expect(tinted.length, "非白 tint 的 dummy 不可能是 0 隻（ogru 族全紅）").toBeGreaterThan(0);
    for (const u of tinted) expect(u.tint, u.id).toEqual(tints[u.id].rgb255);
  });

  it("③ runtimeAlpha 覆蓋每一個 SetUnitVertexColorBJ 呼叫點，解析數 ≥ 相鄰對樣本下界", () => {
    const j = readFileSync(join(SRC, "raw/war3map.j"), "utf8").split(/\r?\n/);
    const total = j.filter((l) => l.includes("SetUnitVertexColorBJ(")).length;
    expect(total).toBeGreaterThan(0);
    expect(census.runtimeAlpha.length).toBe(total);
    // 動態下界：GetLastCreatedUnit() 呼叫點、往上幾行內就有字面 rawcode 的 Create* ——
    // 這批是「回溯必然成功」的樣本，⛔ 不硬編 57 或任何解析數。
    let lower = 0;
    for (let i = 0; i < j.length; i++) {
      if (!j[i].includes("SetUnitVertexColorBJ( GetLastCreatedUnit()")) continue;
      for (let k = i - 1; k >= Math.max(0, i - 12); k--) {
        if (/^\s*function /.test(j[k])) break;
        if (/\bCreate(NUnitsAtLoc\w*|Unit\w*)\s*\(/.test(j[k])) {
          if (/'[^']{4}'/.test(j[k])) lower++;
          break;
        }
      }
    }
    expect(lower).toBeGreaterThan(0);
    const resolved = census.runtimeAlpha.filter((e) => e.rawcode).length;
    expect(resolved).toBeGreaterThanOrEqual(lower);
    // 回溯不到的要誠實標，⛔ 不猜一個 rawcode
    for (const e of census.runtimeAlpha)
      if (!e.rawcode) expect(e.source, `line ${e.line}`).toMatch(/^(unresolved|event-unit)/);
  });
});
