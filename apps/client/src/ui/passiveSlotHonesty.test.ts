/**
 * ⭐ GH#604 —— 天生技格印的「未實作」**不可以是謊話**。
 *
 * owner 2026-08-23：「技能說明記得改，不然之前都是寫未實作」。
 *
 * 這一支問的是**兩個名詞的關係**（⛔ 不是重述判準自己）：「UI 說這一格有沒有效果」
 * 與「**sim 真的會不會掛上一份 source**」是不是同一個答案。sim 那一邊的判準逐字住在
 * `sim/abilities/abilityPassives.ts::rankBlock` 的空值測試，而 UI 那一邊在 2026-08-23
 * 之前只看**三格** ⇒ 5 格「未實作」裡 **4 格是謊話**。兩個方向都要驗：
 *   ① 有酬載的**一格都不可以**被標成未實作（漏列一種酬載 = 靜默把真的標成假的）
 *   ② 真的空的**仍然要**被標成未實作（⛔ 判準不可以退化成「一律放行」）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hasSourceGrant } from "@ggd/shared/sim/stats/sourceGrants";
import {
  PASSIVE_RANK_GATES,
  PASSIVE_RANK_PAYLOAD_KEYS,
  passiveRankGrantsSomething,
} from "./passiveSlot";

const ABILITIES = join(__dirname, "../../../../content/abilities");

interface PassiveDoc {
  id: string;
  name?: string;
  innateKind?: string;
  passive?: { ranks: Record<string, unknown>[] };
}

const docs: PassiveDoc[] = readdirSync(ABILITIES)
  .filter((f) => f.endsWith(".passive.json"))
  .map((f) => JSON.parse(readFileSync(join(ABILITIES, f), "utf-8")) as PassiveDoc)
  .filter((d) => d.innateKind !== "active");

/** sim 那一邊的答案 —— `rankBlock` 的空值測試，逐條同一個順序。 */
function simAttachesSource(d: PassiveDoc): boolean {
  const b = d.passive?.ranks[0];
  if (!b) return false;
  return (
    ((b["modifiers"] as unknown[] | undefined)?.length ?? 0) > 0 ||
    ((b["hooks"] as unknown[] | undefined)?.length ?? 0) > 0 ||
    ((b["auras"] as unknown[] | undefined)?.length ?? 0) > 0 ||
    b["vision"] !== undefined ||
    b["flight"] !== undefined ||
    hasSourceGrant(b as never)
  );
}

describe("天生技格的「未實作」標籤 (GH#604)", () => {
  it("① 每一份**真的會掛上 source** 的天生技，都不可以被標成未實作", () => {
    const lying = docs
      .filter((d) => simAttachesSource(d) && !passiveRankGrantsSomething(d))
      .map((d) => `${d.id} ${d.name ?? ""}`);
    expect(
      lying,
      "這幾支整場都在生效，而天生技格印著「效果尚未移植（目前無作用）」——" +
        `判準看得到的酬載只有 [${PASSIVE_RANK_PAYLOAD_KEYS.join(", ")}]，漏了 sim 真的會讀的那幾種。`,
    ).toEqual([]);
  });

  it("② 真的空的**仍然**要被標成未實作（⛔ 判準不可以退化成一律放行）", () => {
    const empty = docs.filter((d) => !simAttachesSource(d));
    expect(empty.length, "出貨樹上一支真的空的天生技都沒有 ⇒ 這條斷言失去意義").toBeGreaterThan(0);
    const overclaimed = empty.filter((d) => passiveRankGrantsSomething(d)).map((d) => d.id);
    expect(overclaimed, "sim 不會替它掛任何 source，而天生技格說它「永久生效」").toEqual([]);

    // ⭐ 一個**有 rank 區塊、但區塊裡只有閘**的天生技 —— 出貨樹上今天沒有這一種
    //    （唯一真的空的那一支連 `passive` 都沒有），所以少了這一句，「判準退化成
    //    一律放行」這個突變會**逐位元不被察覺**。⛔ 它不是抄出貨數字，是判準的反面。
    const gatesOnly = { passive: { ranks: [Object.fromEntries([...PASSIVE_RANK_GATES].map((g) => [g, "any"]))] } };
    expect(passiveRankGrantsSomething(gatesOnly), "形態閘／狀態閘是**閘**，⛔ 不是酬載").toBe(false);
    // 反向對照組：同一個區塊補上任何一種酬載就必須翻面（⛔ 不是永遠回 false）。
    const withPayload = { passive: { ranks: [{ ...gatesOnly.passive.ranks[0], flight: { hoverHeight: 1 } }] } };
    expect(passiveRankGrantsSomething(withPayload)).toBe(true);
  });
});
