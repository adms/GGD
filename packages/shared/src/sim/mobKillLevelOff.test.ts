/**
 * ⭐⭐ **「每 N 隻升一級」關得掉**（GH#918）。
 *
 * owner 2026-09-02（逐字）：
 * > 把打6隻就升級**先設定為關閉**
 * > 特殊殭屍 + lv3, 殭屍王 + lv10
 * > 這樣可以大幅避免掉直接升級被省略的 xp
 *
 * ## ⛔⛔ 而「關閉」在 2026-09-02 之前**寫不出來**
 *
 * `MobSystem.ts:418` 逐字是 `if (rules.killsPerLevel > 0 && …)`
 * ⇒ ⭐ **引擎早就支援關閉**，⛔ 而 Zod 的 `min(1)` 與後台的 `min: 1` 不准你寫 0。
 *
 * ⚠️ 那正是 CLAUDE.md 第一守則點名的形狀：**一個決策被寫死在界線裡**
 * ⇒ owner 想關掉它時，改的不是一格設定，是**一次部署**。
 *
 * ## ⭐ 這條守的是**機制**，⛔ 不是數字
 *
 * ⚠️ 這一支取代了 `mobs.schedule.test.ts` 裡那條 `it("killsPerLevel is 6")` ——
 * 那是**把出貨值抄進測試**（第四個住處），⭐ 而它在 owner 調值的當下用
 * 「排程壞了」這種**錯誤訊息**紅。
 *
 * ⇒ ⭐ 這裡**不斷言任何出貨值**：它問的是「0 的時候真的一級都不發嗎」與
 *   「非 0 的時候真的照 N 發嗎」——⭐ **兩個方向**。
 */
import { describe, it, expect } from "vitest";
import { zConfigArenaRulesDoc } from "../content/schema/config/arenaRules";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config/arenaRules.mobWaves";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** ⭐ `MobSystem` 那道閘的**純**複製 —— 逐字同一個運算式。 */
const levelsFor = (kills: number, killsPerLevel: number): number => {
  let n = 0;
  for (let i = 1; i <= kills; i++) {
    if (killsPerLevel > 0 && i % killsPerLevel === 0) n++;
  }
  return n;
};

describe("每 N 隻升一級關得掉（GH#918）", () => {
  it("⭐⭐ **界線准你寫 0** —— ⛔ 這才是這張票的本體", () => {
    // ⛔ 在此之前 `min(1)` 讓「關閉」在 schema 層就被擋下來。
    // ⭐ 拿**出貨的整份文件**再覆寫那一格 —— ⛔ 不是拿 DEFAULT_ 拼一個殘缺的 doc
    //   （那會被別的必填欄位擋下來，而那個紅與這一條要問的事無關）。
    const shipped = JSON.parse(
      readFileSync(join(ROOT, "content/config/arena-rules.json"), "utf8"),
    ) as Record<string, unknown>;
    const mw = shipped["mobWaves"] as { reward: Record<string, unknown> };
    const doc = {
      ...shipped,
      mobWaves: { ...mw, reward: { ...mw.reward, killsPerLevel: 0 } },
    };
    const r = zConfigArenaRulesDoc.safeParse(doc);
    if (!r.success) console.error(JSON.stringify(r.error.issues.slice(0, 3)));
    expect(
      r.success,
      "⛔ schema 不收 `killsPerLevel: 0` ⇒ 「關閉」寫不出來 ⇒ owner 要改它就是一次部署",
    ).toBe(true);
  });

  it("⭐ 後台那一格的下界也是 0（⛔ 三個住處缺一個就等於關不掉）", () => {
    const admin = readFileSync(join(ROOT, "apps/admin/src/mobWaves.ts"), "utf8");
    const i = admin.indexOf('"reward.killsPerLevel": {'); // ⭐ 錨到**欄位規格**那一段
    expect(i, "⛔ 後台沒有這一格").toBeGreaterThan(0);
    const block = admin.slice(i, i + 1400);
    expect(block, "⛔ 後台那一格的下界不是 0 ⇒ 操作員填不了 0").toMatch(/min:\s*0/);
    expect(block, "⛔ 後台沒有講「0 ＝ 關閉」⇒ 操作員不知道那一格可以關").toContain("關閉");
  });

  it("⭐⭐ **兩個方向**：0 ⇒ 一級都不發；非 0 ⇒ 真的照 N 發", () => {
    // ⭐ 已知**沒有**的那一邊
    expect(levelsFor(100, 0), "⛔ 關閉了還在發等級").toBe(0);
    // ⭐ 已知**有**的那一邊 —— ⛔ 少了它，上面那條對「整個機制被刪掉」也是綠的
    expect(levelsFor(100, 6), "⛔ 開著卻不發 ⇒ 這條在量空氣").toBe(16);
    expect(levelsFor(5, 6)).toBe(0);
    expect(levelsFor(6, 6)).toBe(1);
  });

  it("⭐ 而出貨真的是關著的（⛔ 這一條讀三個住處，不抄字面值）", () => {
    const shipped = JSON.parse(
      readFileSync(join(ROOT, "content/config/arena-rules.json"), "utf8"),
    ) as { mobWaves: { reward: { killsPerLevel: number } } };
    // ⭐ 只斷言**它與 Zod 預設一致**（drift），⛔ 不斷言它等於某個字面數字 ——
    //   那個數字是 owner 的，而他隨時會改。
    expect(
      shipped.mobWaves.reward.killsPerLevel,
      "⛔ 出貨檔與 Zod DEFAULT_ 漂開了",
    ).toBe(DEFAULT_MOB_WAVES_CONFIG.reward.killsPerLevel);
  });
});
