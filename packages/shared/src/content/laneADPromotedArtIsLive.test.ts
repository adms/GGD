/**
 * GH#529 —— `config.vfx-ability-art@1` 的 **`promoted` 格**與現實的兩條關係。
 *
 * ⭐ 這一格是全 repo 少數「**沒有產生器**」的出貨資料：
 * `generateAbilityArtContent.ts` 的檔頭逐字寫著它只重寫 `family`，
 * `prim` / `owner` / `promoted` 一律**逐位保留**。⇒ 保留是預設 = 它永遠不會過期地紅。
 *
 * 量到的（2026-08-27）：34 列 `promoted` 裡有 **7 列指向已經不在
 * `content/abilities/` 的技能**（`godie-e00q.e` · `godie-ekee.q` · `godie-h022.e/r` ·
 * `godie-ntin.e/q/r`）。它們是第一·五守則的**空宣稱**：schema 收得下、
 * `content:build` 綠、`vfxPromotedRefsResolve` 綠（文件真的存在）、
 * 而 `w3xArtFor()` 永遠不會拿這幾個 id 去問 —— 玩家端逐位元等於不存在。
 *
 * ⚠️ 而它們**不是無害的**：`familyArtCoverage.test.ts` 把「34 支技能畫出原作
 * 真的畫的東西」釘成標題數字，而誠實的答案是 **27**。一個沒有守衛的宣稱
 * 會變成下一輪的「事實」（第三守則）。
 *
 * ⛔ 這裡**不釘數量**（第二守則：出貨數值住進測試＝沒有守衛的第四個住處，
 * 而 owner 每週都在動它）。釘的是兩條**關係**：
 *   ① 每一列 `promoted` 的技能**還活著**
 *   ② 有推導證據的那幾列，emitter 集合與證據表**一模一樣**（SET-DRIFT）
 *
 * ⭐ ②的證據來源是 `content/config/ability-vfx-bindings.json`（`vfxbind:build`
 * 的產物，四道閘推導）。它與這一格帶著同一份值 ⇒ 沒有閘就是無守衛的第二住處。
 * `tools/vfx-bind/scan.py --check` **報告**了這件事，⛔ 但它對 MISSING/DEAD
 * 不回非零 —— 一份沒有人的離開碼讀的報告不是閘，那正是 7 列活下來的原因。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

interface Promoted {
  primary: string;
  extra?: string[];
}
type ArtDoc = { bindings: Record<string, { promoted?: Promoted }> };
type EvidenceDoc = { bindings: { abilityId: string; vfxKeys: string[] }[] };

const read = <T,>(...p: string[]): T => JSON.parse(readFileSync(join(CONTENT, ...p), "utf8")) as T;

describe("vfx-ability-art 的 promoted 格：活著、而且與證據一致（GH#529）", () => {
  const art = read<ArtDoc>("config", "vfx-ability-art.json");
  const rows = Object.entries(art.bindings).filter(([, r]) => r.promoted);

  it("每一列 promoted 都指向一支還在 content/abilities/ 的技能", () => {
    // 量尺自證：一列都讀不到就不是「全過」，是沒量到。
    expect(rows.length, "一列 promoted 都沒讀到").toBeGreaterThan(0);
    const dead = rows
      .map(([id]) => id)
      .filter((id) => !existsSync(join(CONTENT, "abilities", `${id}.json`)));
    expect(dead, `promoted 指向已退休的技能（第一·五守則的空宣稱）：${dead.join(", ")}`).toEqual(
      [],
    );
  });

  it("有推導證據的列，emitter 集合與證據表一模一樣", () => {
    const evidence = read<EvidenceDoc>("config", "ability-vfx-bindings.json");
    const want = new Map(evidence.bindings.map((b) => [b.abilityId, [...b.vfxKeys].sort()]));
    expect(want.size, "證據表一列都沒讀到").toBeGreaterThan(0);
    const drift: string[] = [];
    for (const [id, row] of rows) {
      const w = want.get(id);
      if (!w) continue; // 人工裁決的列（scan.py 的 EXTRA）—— 沒有推導可以比對
      const have = [row.promoted!.primary, ...(row.promoted!.extra ?? [])].sort();
      if (have.join("|") !== w.join("|")) drift.push(`${id}: ${have.join(",")} ≠ ${w.join(",")}`);
    }
    expect(drift, `晉升表與證據表對同一支技能說了不同的話：\n${drift.join("\n")}`).toEqual([]);
  });
});
