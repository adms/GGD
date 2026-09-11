/**
 * ⭐⭐【後台的「一鍵回到舊模型」不可以無聲消失】（GH#1201）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 這條閘是為了一個**我自己造成的**缺陷而存在
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-11：為了移除兩份**有缺陷的凍結副本**，我把 `b2-keyaru`（凱亞爾）與
 * `b2-aladdin`（阿拉丁）的 `modelVersions` **整個移除**了
 * ⇒ ⭐ 那兩位英雄從此**在後台沒有「回到原上線模型」的選項**。
 *
 * ⭐ 它違反 owner 的常設指令（2026-08-23 逐字）：
 *   「沒做完以前別問我了自己判斷 **但是留後台開關可以簡易 rollback**」
 *
 * ⚠️⚠️ ⭐ 而**每一條既有的閘都是綠的** ——
 * 內容合法（`modelVersions` 是選填）、schema 過、`content:build` 過、bundle 一致。
 * ⇒ ⛔ 「一個英雄失去了 rollback 選項」**不是任何斷言的反面**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 為什麼是**棘輪**，⛔ 而不是「每一隻都要有版本」
 * ═══════════════════════════════════════════════════════════════════════════
 * 153 隻裡只有 47 隻有版本歷史 —— ⭐ 那是**對的**：
 * 版本清單是「這顆模型被換過」的紀錄，⛔ 從來沒換過的英雄本來就不該有。
 * ⇒ 硬性要求全部有 ＝ 一條永遠不會綠的閘（假綠燈⑨）。
 *
 * ⇒ ⭐ 它問的是**別的事**：**已經有 rollback 選項的英雄，不可以把它弄丟。**
 *
 * ⭐ 兩個方向（⛔ 一個方向不算）：
 *   ① ⛔ **少掉** ⇒ 紅 —— ⭐ 這正是 #1201 的形狀（47 → 45 而沒有人喊）
 *   ② ⭐ **多出來** ⇒ 紅並要求把 id 加進名單 —— ⛔ 否則名單會慢慢與世界脫節，
 *      而一條與世界脫節的名單，①那一半就開始放行真的損失
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "content");

/**
 * ⭐ 今天**有**後台 rollback 選項的英雄（2026-09-11 量到 47 隻）。
 *
 * ⛔ 這張名單**只能變長**。少掉任何一個都代表有人拿走了一個 owner 的開關。
 * ⚠️ ⭐ `b2-keyaru` 與 `b2-aladdin` **刻意不在上面** —— 它們是 #1201 的兩個傷者，
 *   ⭐ 補回去（走 `ModelVersions.prepare({action:"register"})`）之後把 id 加進來。
 */
const HAS_ROLLBACK: readonly string[] = [
  "b2-boxxo", "b2-elma", "b2-fushi", "b2-guts", "b2-haga", "b2-kaede", "b2-kaiji",
  "b2-klaus", "b2-luckyman", "b2-makoto", "b2-maomao", "b2-matthias", "b2-naofumi",
  "b2-ned", "b2-noor", "b2-nube", "b2-orphen", "b2-shadow", "b2-shinchan", "b2-sinbad",
  "b2-touka", "b2-uncle",
  "community-review-02-20260907", "community-review-05-20260907", "community-review-07-20260907",
  "community-review-09-20260907", "community-review-11-20260907", "community-review-14-20260907",
  "community-review-15-20260907", "community-review-22-20260907", "community-review-30-20260907",
  "community-review-33-20260907", "community-review-34-20260907", "community-review-36-20260907",
  "community-review-37-20260907",
  "godie-e00s", "godie-e010", "godie-efur", "godie-hapm", "godie-n003", "godie-n00b",
  "godie-o030", "godie-ogld", "godie-orkn", "godie-u00k", "godie-ubal", "godie-udea",
];

interface Champ {
  readonly id: string;
  readonly modelKey?: string;
  readonly modelVersions?: { readonly modelKey: string }[];
}

function champions(): Champ[] {
  return readdirSync(join(CONTENT, "champions"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as Champ);
}

describe("後台的 rollback 選項不可以無聲消失（GH#1201）", () => {
  const all = champions();
  const withVersions = all.filter((c) => (c.modelVersions ?? []).length > 0).map((c) => c.id).sort();

  it("⭐ 量尺自證：真的掃到英雄，而且**不是**全部都有版本（⛔ 否則這條閘沒在問任何事）", () => {
    expect(all.length, "⛔ 一隻英雄都沒掃到 —— 偵測壞了").toBeGreaterThan(100);
    expect(withVersions.length, "⛔ 零隻有版本 ⇒ 路徑或欄位名錯了").toBeGreaterThan(20);
    expect(withVersions.length, "⛔ 全部都有 ⇒ 這條閘退化成「總是真」").toBeLessThan(all.length);
  });

  it("⛔ 已經有 rollback 的英雄不可以失去它（⭐ 這就是 #1201 的形狀）", () => {
    const lost = HAS_ROLLBACK.filter((id) => !withVersions.includes(id));
    expect(
      lost,
      "⛔⛔ 這幾位英雄**失去了後台的「一鍵回到舊模型」** —— " +
        "而 owner 的常設指令是「留後台開關可以簡易 rollback」（2026-08-23）。\n" +
        "⇒ 換模型時要走 `ModelVersions.prepare({action:\"register\"})`，" +
        "⭐ 它會自動把舊的那顆存成「原上線模型」；⛔ 不要直接改 `modelKey` 再刪清單。",
    ).toEqual([]);
  });

  it("⭐ 新長出來的 rollback 要加進名單（⛔ 否則上面那條會慢慢放行真的損失）", () => {
    const extra = withVersions.filter((id) => !HAS_ROLLBACK.includes(id));
    expect(
      extra,
      "⭐ 這幾位英雄現在有版本歷史了 —— 把 id 加進 `HAS_ROLLBACK`。\n" +
        "⚠️ ⛔ 不加的話，這張名單會與世界脫節，而脫節的名單會讓「不可以少掉」那一半失效。",
    ).toEqual([]);
  });
});
