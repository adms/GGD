/**
 * ⭐【作者擺的互動點真的被引擎讀到】—— GH#324 收尾的守衛。
 *
 * ⚠️ 這條在守一個**真的發生過**的形態：七張圖各擺了 8 個互動點、驗證器逐點檢查
 * 可達性、報告印出「互動點 8」—— 而引擎**一個都不看**。那是失敗形態②
 * （算出來了但從沒送到玩家面前），而且它跟「做對了」長得一模一樣。
 *
 * ⛔ 互動點不是新玩法，是**既有系統的擺放錨點**：
 *   · `pickup`  → 治療花開在這裡（取代隨機取樣）
 *   · `capture` → 守衛塔站在這裡（取代寫死的 `zone.center`）
 *
 * ⚠️ 兩個方向一起讀：沒有錨點的場地必須**完全維持既有行為**，
 * 否則既有 6 張手寫場地就被這次改動動到了。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zArenaDoc } from "../../content/schema/arena";
import { arenaDefFromDoc } from "../world/ArenaDef";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const ARENAS = join(REPO, "content", "arenas");

describe("互動點是既有系統的擺放錨點（GH#324）", () => {
  it("⭐ 產生器出來的場地：每一張都帶著作者擺的互動點，而且 ≥1 個 capture 與 ≥1 個 pickup", () => {
    const files = readdirSync(ARENAS).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    const generated = files
      .map((f) => zArenaDoc.parse(JSON.parse(readFileSync(join(ARENAS, f), "utf8"))))
      .map((d) => arenaDefFromDoc(d))
      .filter((d) => d.zones.some((z) => z.nav !== undefined));

    expect(generated.length, "一張產生器出來的場地都沒有 —— 這條守衛會空跑").toBeGreaterThan(0);

    for (const def of generated) {
      for (const zone of def.zones) {
        const kinds = (zone.interactions ?? []).map((i) => i.kind);
        expect(kinds.length, `${def.id}/${zone.id}: 互動點沒有進到 arena@1`).toBeGreaterThan(0);
        // 守衛塔的錨點
        expect(kinds, `${def.id}/${zone.id}: 沒有 capture 錨點 ⇒ 守衛塔會退回 zone.center`).toContain(
          "capture",
        );
        // 治療花的錨點
        expect(kinds, `${def.id}/${zone.id}: 沒有 pickup 錨點 ⇒ 花會退回隨機取樣`).toContain(
          "pickup",
        );
      }
    }
  });

  it("⛔ 既有的手寫場地一格 interactions 都沒有 —— 它們的行為必須完全不變", () => {
    const files = readdirSync(ARENAS).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    const handWritten = files
      .map((f) => zArenaDoc.parse(JSON.parse(readFileSync(join(ARENAS, f), "utf8"))))
      .map((d) => arenaDefFromDoc(d))
      .filter((d) => d.zones.every((z) => z.nav === undefined));

    expect(handWritten.length, "一張手寫場地都沒有？").toBeGreaterThan(0);
    for (const def of handWritten) {
      for (const zone of def.zones) {
        expect(zone.interactions, `${def.id}/${zone.id} 不該有互動點`).toBeUndefined();
      }
    }
  });
});
