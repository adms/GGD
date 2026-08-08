/**
 * `roomSettings.ts` 的守衛 —— #288 房主每房設定的**契約**。
 *
 * 驗三條語意，⛔ 一個出貨數字都不抄（20/320/25/180 已經有三個住處 + drift 測試在守，
 * 抄進來就是第四個住處，見 CLAUDE.md「不要驗數字，驗機制」）。
 *
 * ⭐ 第三條用的是**配對式斷言**（`ggd-pairwise-postconditions`）：
 * 不去比對「我算的下界 == 某個數字」，而是拿那個下界去問**出貨的 Zod schema**
 * 收不收。只驗名詞（兩邊各自的數字）永遠抓不到「兩個名詞之間的關係」壞掉。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zConfigMatchDoc } from "./content/schema/config";
import { minCombatMaxSecFor, sanitizeRoomSettings, ROOM_SETTING_LIMITS } from "./roomSettings";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const shipped = JSON.parse(
  readFileSync(join(REPO, "content/config/config.match.json"), "utf8"),
) as { match: { combatMaxSec: number; fireRing?: Parameters<typeof minCombatMaxSecFor>[0] } };

describe("#288 房主每房設定的契約", () => {
  it("① 缺席 ≠ 重設 —— 沒送的欄位不可以出現在結果裡", () => {
    // 這是 owner「預設值保留現在（包含 vs bot）」唯一會壞掉的地方：
    // 只要缺席被翻譯成任何一個值,vs bot 的 320 秒就會被靜默改掉。
    const empty = sanitizeRoomSettings({});
    expect(Object.keys(empty.settings)).toEqual([]);
    expect(empty.rejected).toEqual([]);
    // null 也是缺席（表單沒填常常送 null,不是省略欄位）
    const nulls = sanitizeRoomSettings({ champSelectSec: null, maxRounds: null });
    expect(Object.keys(nulls.settings)).toEqual([]);
    // 非物件（undefined / 字串 / 陣列）一律當成「沒有任何設定」,不可以爆
    for (const junk of [undefined, null, "20", 42, []]) {
      expect(Object.keys(sanitizeRoomSettings(junk).settings)).toEqual([]);
    }
  });

  it("② 越界是**拒絕**不是靜默夾取 —— 而且拒絕要說得出是哪一格", () => {
    // GH#279 記過的形狀：使用者打 5000、系統存 600、畫面上沒有任何東西說它被改過。
    const lim = ROOM_SETTING_LIMITS.champSelectSec;
    const over = sanitizeRoomSettings({ champSelectSec: lim.max + 1 });
    expect(over.settings.champSelectSec, "越界不可以被夾成邊界值收下").toBeUndefined();
    expect(over.rejected.map((r) => [r.key, r.reason])).toEqual([["champSelectSec", "above-max"]]);

    const under = sanitizeRoomSettings({ intermissionSec: ROOM_SETTING_LIMITS.intermissionSec.min - 1 });
    expect(under.settings.intermissionSec).toBeUndefined();
    expect(under.rejected[0]?.reason).toBe("below-min");

    // 型別垃圾也要被指名,不可以變成 NaN 溜進去
    const bad = sanitizeRoomSettings({ combatMaxSec: "abc", maxRounds: 1.5 });
    expect(bad.settings).toEqual({});
    expect(bad.rejected.map((r) => r.reason).sort()).toEqual(["not-a-number", "not-an-integer"]);

    // 合法值要真的收下（否則上面三條可以靠「永遠拒絕」作弊通過）
    const ok = sanitizeRoomSettings({ champSelectSec: lim.max, maxRounds: 0 });
    expect(ok.settings).toEqual({ champSelectSec: lim.max, maxRounds: 0 });
    expect(ok.rejected).toEqual([]);
  });

  it("③ 每回合時間的下界與**出貨 schema 的跨欄位不變式**是同一條線", () => {
    // ⭐ 配對式：不比對數字,而是拿我算的下界去問出貨的 Zod 收不收。
    // 我的 ringFullCloseSec 若與 schema 的漂開,下面兩個斷言必有一個紅。
    const floor = minCombatMaxSecFor(shipped.match.fireRing);
    const at = zConfigMatchDoc.safeParse({
      ...shipped,
      match: { ...shipped.match, combatMaxSec: floor },
    });
    expect(at.success, "剛好等於推導下界時 schema 必須收 —— 收不了代表我算少了").toBe(true);

    const below = zConfigMatchDoc.safeParse({
      ...shipped,
      match: { ...shipped.match, combatMaxSec: floor - 1 },
    });
    expect(below.success, "低於推導下界時 schema 必須拒 —— 收了代表我算多了").toBe(false);

    // 而且房主真的設得到那個下界（夾取那一側也要認同它）
    expect(sanitizeRoomSettings({ combatMaxSec: floor }, floor).settings.combatMaxSec).toBe(floor);
    expect(sanitizeRoomSettings({ combatMaxSec: floor - 1 }, floor).rejected[0]?.reason).toBe(
      "below-min",
    );
  });
});
