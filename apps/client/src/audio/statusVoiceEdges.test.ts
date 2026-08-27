/**
 * GH#743 —— T3 狀態語音的**上升緣**那一半。
 *
 * ⭐ 承重的那條線是 `rise()` 裡的「跟上一拍比」：拿掉它，四句狀態語音會在狀態
 * 持續的**每一拍**重播 —— 那不是「多一點聲音」，那是把一場比賽變成噪音。
 * ⇒ 突變驗證挑它（見最後一條的註解）。
 *
 * ⛔ 這裡**不驗**「狀態文件存不存在」—— `spatialPolicy.test.ts` 已經逐列回去讀
 * `content/status-effects/` 了，在這裡再抄一次就是第二個住處。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { VOICE_CATEGORY_POLICY } from "./spatialPolicy";
import {
  STATUS_VOICE_CATEGORY,
  StatusVoiceEdges,
  statusVoiceCategories,
  statusVoiceCategoryFor,
} from "./statusVoiceEdges";

describe("status → voice mapping", () => {
  it("is DERIVED from the shipped policy table, not a second hand-written copy", () => {
    cover("status-voice-edges");
    // 每一列宣稱的 statusId 都要在推導出來的表裡，指回同一格語音。
    // ⇒ 從某一列拿掉 `statusIds` ⇒ 這裡紅（而它正是接線要讀的那張表）。
    let claimed = 0;
    for (const [category, row] of Object.entries(VOICE_CATEGORY_POLICY)) {
      for (const id of row.statusIds ?? []) {
        claimed++;
        expect(statusVoiceCategoryFor(id), `${id} → ${category}`).toBe(category);
      }
    }
    expect(claimed, "沒有任何一列宣稱狀態 id —— 這條在測空氣").toBeGreaterThan(0);
    expect(STATUS_VOICE_CATEGORY.size).toBe(claimed);
    // 沒宣稱過的狀態不會憑空對到一句話（⛔ 不要猜）。
    expect(statusVoiceCategoryFor("burn")).toBeNull();
    expect(statusVoiceCategories(["burn", "slow30"])).toEqual([]);
  });
});

describe("the rising edge", () => {
  const ids = (cat: string): readonly string[] =>
    VOICE_CATEGORY_POLICY[cat]?.statusIds ?? [];

  it("speaks once when a status appears and stays quiet while it lasts", () => {
    cover("status-voice-edges");
    const first = ids("blind")[0] as string;
    const e = new StatusVoiceEdges();
    expect(e.rise(1, [first])).toEqual(["blind"]);
    // ⭐ 突變點：把 `rise` 的「跟上一拍比」拿掉（改成永遠回傳 now）⇒ 這一行紅。
    expect(e.rise(1, [first])).toEqual([]);
    expect(e.rise(1, [])).toEqual([]);
    expect(e.rise(1, [first])).toEqual(["blind"]); // 掉了再上 = 再說一次
  });

  it("is a CATEGORY edge: a second status on the same line does not re-speak", () => {
    cover("status-voice-edges");
    const pair = ids("paralyzed");
    if (pair.length < 2) throw new Error("paralyzed 應該對到兩個狀態 id");
    const e = new StatusVoiceEdges();
    expect(e.rise(7, [pair[0] as string])).toEqual(["paralyzed"]);
    expect(e.rise(7, [pair[0] as string, pair[1] as string])).toEqual([]);
  });

  it("keeps seats apart and forgets a seat that left", () => {
    cover("status-voice-edges");
    const first = ids("confused")[0] as string;
    const e = new StatusVoiceEdges();
    expect(e.rise(1, [first])).toEqual(["confused"]);
    expect(e.rise(2, [first])).toEqual(["confused"]); // 另一位受害者照樣說
    e.forget(1);
    expect(e.rise(1, [first])).toEqual(["confused"]); // 記憶清掉 ⇒ 重新算第一次
  });
});
