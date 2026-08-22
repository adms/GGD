/**
 * ⭐【沒有任何一支技能的音效綁定，指向另一位英雄專屬的音檔】(GH#568)
 *
 * owner 2026-08-23：「明明場上沒有皮卡丘卻一直有皮卡丘、多拉A夢聲音」。
 *
 * 兩條，各關一個**不同**的形態（⛔ 不是同一件事寫兩次）：
 *   ① **逐支技能**自己宣告的施法音指到別人 —— 容忍度 0，⛔ 沒有豁免表。
 *      現在真的是 0，所以多出一列就是一次真的手滑，而它會用正確的訊息紅。
 *   ② **通用音效池**（誰觸發都一樣）裡混了角色語音 —— 這是 #568 的**根因**，
 *      現在有 3 個池子中招而 owner 還沒裁決怎麼修，所以它比對一張**帳本**，
 *      ⭐ 兩個方向都要相等：多一個池子中招 → 紅；修好了卻沒刪那一列 → 也紅。
 *
 * ⛔ 這裡**不驗數字**（幾支技能吃到退路、池子幾個檔）—— 那是內容，會變。
 * 驗的是**機制**：「這個 clip 有主人」與「播它的人不是主人」這兩件事還連著。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abilityLevelForeign, buildModel, contaminatedPools } from "./ownership";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER = JSON.parse(
  readFileSync(join(HERE, "cross-character-ledger.json"), "utf8"),
) as { contaminatedPools: Record<string, { clips: string[] }> };

const model = buildModel();

describe("跨角色音效誤用 (GH#568)", () => {
  it("⛔ 沒有一支技能的 sfxKey／覆蓋層指到別位英雄專屬的音檔", () => {
    // 這條要有東西可測：推導不出任何「有主人的 clip」時它會假綠。
    expect(model.clipOwners.size, "一個有主人的 clip 都推導不出來 ⇒ 這條在測空氣").toBeGreaterThan(0);

    const bad = abilityLevelForeign(model);
    expect(
      bad.map(
        (r) =>
          `${r.subject}（${r.actorName} / ${r.subjectName}）→ ${r.cue} = ` +
          r.foreign.map((o) => `${o.clip}，那是 ${o.champions.join("/")} 的`).join("；"),
      ),
      "有技能在播別位英雄的專屬音檔 ⇒ 那一格 sfxKey 填錯人了（⛔ 不要改這條測試）",
    ).toEqual([]);
  });

  it("通用音效池的污染，逐格等於帳本宣告的那一份（兩個方向）", () => {
    const measured = contaminatedPools(model);
    const declared = LEDGER.contaminatedPools;

    // ⭐ 兩個方向一起讀：量到的與宣告的必須是同一組 cue，且每一格的檔案清單相同。
    expect(
      Object.fromEntries([...measured].sort()),
      "量到的污染池與 cross-character-ledger.json 對不上。\n" +
        "· 多出來的 = 新的跨角色誤用，去修綁定，⛔ 不要往帳本補一列；\n" +
        "· 少掉的 = 已經修好了，把帳本那一列刪掉（一張說謊的帳本比沒有帳本更糟）。",
    ).toEqual(
      Object.fromEntries(
        Object.entries(declared)
          .map(([cue, v]) => [cue, [...v.clips].sort()] as const)
          .sort(),
      ),
    );

    // 帳本每一列都要說得出「為什麼還沒修」——一句可以被反駁的話，⛔ 不是空字串。
    for (const [cue, v] of Object.entries(declared)) {
      expect((v as { why?: string }).why ?? "", `帳本的 ${cue} 沒寫理由`).not.toHaveLength(0);
    }
  });
});
