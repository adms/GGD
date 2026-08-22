/**
 * ⭐【綁定表有這一列 ⇒ 那支技能解析出來的就是**原作**那一組,不是通用原型】(GH#529)
 *
 * ⛔ 這一條**不驗特定的 key 字面值** —— 哪一支技能綁哪一族是 `content/` 的資料,
 *    抄進測試就是第四個住處(第零守則)。驗的是**機制會不會發生**:
 *    表有列 → 通用原型被換掉;技能文件自己挑了原作 → 表**不准**推翻它。
 *
 * ⛔ 也不掃原始碼字串:三條斷言都跑真的解析器,吃磁碟上**出貨的**那兩份檔
 *    (失敗形態⑤⑥)。
 *
 * 突變紀錄:`vfxBindings.ts` 的階 3 那一行
 *   `return { vfxKey: row.vfxKeys[0]!, vfxLayers: layers };` → 改成 `return def;`
 *   ⇒ 第一條紅(整批功能就是那一行)。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zConfigAbilityVfxBindingsDoc } from "./schema/abilityVfxBindings";
import { resolveAbilityVfxSource, buildAbilityVfxBindingIndex, isOriginalArtVfxKey } from "./vfxBindings";
import { resolveAbilityVfxLayers } from "./schema/abilityVfx";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), "utf-8"));

const doc = zConfigAbilityVfxBindingsDoc.parse(read("content/config/ability-vfx-bindings.json"));
const index = buildAbilityVfxBindingIndex(doc);

describe("config.ability-vfx-bindings@1 —— 載入時的四階覆蓋", () => {
  it("表有這一列 + 技能文件是通用原型 ⇒ 解析出原作那一組(⛔ 不是 fx.prim.*)", () => {
    // 出貨表裡真的存在「文件寫 fx.prim.*、表有列」的技能 —— 沒有的話這條就是
    // 一條永遠不會失敗的假守衛,所以先把它釘住。
    const covered = doc.bindings.filter((r) => !isOriginalArtVfxKey(readAbility(r.abilityId)?.vfxKey));
    expect(covered.length).toBeGreaterThan(0);
    for (const row of covered) {
      const def = readAbility(row.abilityId)!;
      expect(isOriginalArtVfxKey(def.vfxKey)).toBe(false); // 覆蓋前:通用原型或空
      const layers = resolveAbilityVfxLayers(resolveAbilityVfxSource(row.abilityId, def, index));
      expect(layers.length).toBeGreaterThan(0);
      // 覆蓋後:每一層都是原作藝術,而且整族都在(⛔ 不是只剩主 emitter)
      expect(layers.every((l) => isOriginalArtVfxKey(l.vfxKey))).toBe(true);
      expect(layers.map((l) => l.vfxKey)).toEqual(row.vfxKeys.slice(0, layers.length));
    }
  });

  it("技能文件自己挑了原作 doc ⇒ 表**不准**推翻它(原封回傳同一個物件)", () => {
    const authored = doc.bindings
      .map((r) => [r.abilityId, readAbility(r.abilityId)] as const)
      .filter(([, d]) => d && isOriginalArtVfxKey(d.vfxKey));
    expect(authored.length).toBeGreaterThan(0);
    for (const [id, def] of authored) {
      expect(resolveAbilityVfxSource(id, def!, index)).toBe(def); // identity,一位元不差
    }
  });

  it("表裡沒有的技能一律 identity —— 這一版之前的 420 支一位元不差", () => {
    const def = { vfxKey: "fx.prim.fire.burst" };
    expect(resolveAbilityVfxSource("godie-not-a-real-ability.q", def, index)).toBe(def);
  });

  // ⭐ 閘,⛔ 不是判準:證據(provenance / content/vfx / content/abilities)一動,
  // 這張表就過期,而過期的表看起來跟正確的一模一樣。`--check` 逐位元組比對。
  // 它紅了⛔ 不要改測試 —— 跑 `python3 tools/vfx-bind/scan.py` 然後 `git add content/`。
  it("綁定表沒有比證據舊(scan.py --check 回 0)", () => {
    const r = spawnSync("python3", [join(REPO, "tools/vfx-bind/scan.py"), "--check"], {
      encoding: "utf-8",
    });
    expect(`${r.stdout}${r.stderr}`.trim()).toContain("✅");
    expect(r.status).toBe(0);
  });
});

function readAbility(id: string): { vfxKey?: string } | undefined {
  try {
    return read(`content/abilities/${id}.json`);
  } catch {
    return undefined;
  }
}
