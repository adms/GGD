/**
 * ⭐ GH#651 —— 一場打完之後，房間**還留著**讓大家看戰績。
 *
 * owner 2026-08-24（逐字）：
 * > 「與伺服器連線中斷 代碼4000 也太快出現把人踢出房間了 **至少留兩分鐘給我看戰績阿**」
 *
 * 在這一版之前 `finishMatch()` 的最後一行是**寫死的 `10_000`** —— 而那個
 * `disconnect()` 就是客戶端看到的「代碼 4000」。⇒ 結算畫面在第 10 秒被蓋掉。
 *
 * 驗**機制**⛔不驗數字（第二守則）：秒數從**出貨設定**推導（`resolveArenaRules()`
 * 讀的同一份 `content/config/arena-rules.json`），⛔ 不抄 120。
 * 這條守衛真正釘住的是「收房時間**來自那一格**」，而 ⛔ 不是任何一個字面值 ——
 * owner 明天想改成 90 秒，改後台一格，這條測試照樣綠。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveArenaRules } from "../match/arenaRules";
import { DEFAULT_POST_MATCH_LINGER_SEC } from "@ggd/shared/content";

describe("GH#651 打完之後的收房延遲", () => {
  it("⭐ 收房秒數是一格後台欄位，而且出貨值滿足 owner 的「至少兩分鐘」", () => {
    const shipped = resolveArenaRules().postMatchLingerSec;
    expect(typeof shipped, "這一格不在 resolveArenaRules() 的結果裡 —— 房間收得多快沒有人調得到").toBe(
      "number",
    );
    // owner 的下限是他自己說的「至少留兩分鐘」⇒ 120 秒。⛔ 這不是在釘出貨值，
    // 是在釘**他的那句話**：有人把它調到 30 秒，這條要紅。
    expect(shipped, "出貨值低於 owner 說的「至少兩分鐘」").toBeGreaterThanOrEqual(120);
    // 三住處的第三處（Zod 預設）跟著同一個數字走。
    expect(DEFAULT_POST_MATCH_LINGER_SEC).toBe(shipped);
  });

  it("⛔ 那一行不可以再是寫死的 10 秒（這一票修的就是它）", () => {
    // ⚠️ 讀**出貨的原始碼**是刻意的（⛔ 不是失敗形態⑥「掃字串代替行為」）：
    // 這裡量的東西是「有沒有一個寫死的數字」，而那件事**只在原始碼裡看得見** ——
    // 一個跑起來的房間拿到 120 之後，看不出那 120 是常數還是設定。
    // 行為那一半由上一條（值真的來自設定）與 `arenaRules` 的既有解析守衛負責。
    const src = new URL("./MatchRoom.ts", import.meta.url);
    const text = readFileSync(src, "utf8");
    const i = text.indexOf("() => this.disconnect()");
    expect(i, "找不到收房那一行 —— 這條守衛的錨點漂走了，去重新對一次").toBeGreaterThan(0);
    // 那一個 setTimeout 呼叫的兩行（callback ＋ 逾時值）。
    const call = text.slice(i, i + 220);
    expect(call, "收房延遲又被寫死了 —— 它應該讀 arenaRules 的那一格").toContain(
      "postMatchLingerSec",
    );
    expect(call, "收房延遲又被寫死了（10_000）").not.toContain("10_000");
  });
});
