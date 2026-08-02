/**
 * #248 後台：回合硬上限那一格真的到得了 sim.
 *
 * owner 2026-08-01 「不管什麼條件，每回合最長上限就是 5 分鐘出現火圈準備收場」，
 * 而 CLAUDE.md 第一守則要求它是**欄位**不是常數。這一份守的是那個欄位在後台這一
 * 側的四件事，每一件都是這一頁真的壞過的形狀：
 *
 *   1. 它在畫面上（`MATCH_GROUPS` 少一格，整格會安靜地消失，沒有任何錯誤）；
 *   2. 它兩邊都有界，而且超界存不出去（#277：50 打成 500 會過後台）；
 *   3. 改了之後**真的**流到 `sim/fireRing.fireRingRulesFromConfig` —— 走的是
 *      sim 自己的函式，不是這一頁寫的鏡像（失敗形態 ⑤）；
 *   4. 跨欄位規則會擋下「硬上限比正常回合還短」的存檔。
 *
 * ⚠️ 這裡刻意**不**重複 `matchConfig.test.ts` 已經有的那幾條（欄位↔說明表雙向
 * 吻合、每一格都落在某一組、可調的格子說得出誰在讀它）—— 那三條是通用不變式，
 * 新欄位一加進去它們就自動涵蓋，再抄一份只會讓兩邊一起腐爛。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  MATCH_FIELDS,
  MATCH_FIELD_INFO,
  MATCH_GROUPS,
  isEditable,
  matchDocFrom,
  matchDocIssues,
  matchFieldBounds,
  readMatchDoc,
  validateMatchField,
} from "./matchConfig";
import { getAtPath } from "./configFields";
// 真正的消費端 —— sim 自己的轉換器。
import { fireRingRulesFromConfig } from "@ggd/shared/sim/fireRing";
import { TICK_HZ } from "@ggd/shared/constants";

const TAG = "adminui-match-config";
const PATH = "match.fireRing.roundHardCapSec";

const SHIPPED_DOC = JSON.parse(
  readFileSync(join(__dirname, "../../../content/config/config.match.json"), "utf8"),
) as Record<string, unknown>;

describe("回合硬上限 (#248) 在後台是一格真的欄位", () => {
  it("被 Zod 推導出來、可編輯、而且畫在火圈那一組裡", () => {
    cover(TAG);
    expect(MATCH_FIELDS.map((f) => f.path)).toContain(PATH);
    expect(isEditable(PATH)).toBe(true);
    const ring = MATCH_GROUPS.find((g) => g.key === "fireRing")!;
    expect(ring.paths).toContain(PATH);
  });

  it("說明寫的是「它影響什麼」，而且點名任何延長條件都無效", () => {
    cover(TAG);
    const info = MATCH_FIELD_INFO[PATH]!;
    // owner 的話：「回合到這個時間一定開始收場，任何延長條件都無效」
    expect(info.note).toContain("一定開始收場");
    expect(info.note).toContain("任何延長條件都無效");
    // 而且它要說得出誰在讀它 —— 讀的是 sim 的 clamp，不是隨便一個模組名。
    expect(info.live).toContain("applyRoundHardCap");
  });

  it("兩邊都有界，超界兩個方向都存不出去 (#277)", () => {
    cover(TAG);
    const field = MATCH_FIELDS.find((f) => f.path === PATH)!;
    const b = matchFieldBounds(field)!;
    // 下界 20 秒：比一次收圈（出貨 20 秒）還短的上限會讓「收場」永遠畫不完。
    expect(b.min).toBe(20);
    // 上界 1800 秒 = 30 分鐘：擋的是「300 多打一個 0」變成 3000。
    expect(b.max).toBe(1800);
    expect(validateMatchField(PATH, "3000", true)).toBe("不能大於 1800");
    expect(validateMatchField(PATH, "19", true)).toBe("不能小於 20");
    expect(validateMatchField(PATH, "300", true)).toBeNull();
  });

  it("留白 = 用 schema 的 300，**不是**「沒有上限」", () => {
    cover(TAG);
    // 這一格是 `.default(300)`，所以推導出來是 optional，留白會把 key 從文件裡
    // 刪掉。那條路必須通到「loader 補回 300」，而不是通到一個沒有天花板的回合 ——
    // 這正是 owner 說「不會無限增加時間」時最容易破的那個洞。
    const read = readMatchDoc(SHIPPED_DOC);
    const doc = matchDocFrom(SHIPPED_DOC, { ...read.values, [PATH]: "" }, true);
    expect(getAtPath(doc, PATH)).toBeUndefined(); // 文件裡真的沒有這一格了
    expect(readMatchDoc(doc).values[PATH]).toBe("300"); // 但 loader 把它補回來
    expect(matchDocIssues(doc)).toEqual([]);
  });

  it("改了這一格 → sim 自己的 `fireRingRulesFromConfig` 給出不同的 hardCapTicks", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const combatMaxSec = Number(read.values["match.combatMaxSec"]);
    const before = fireRingRulesFromConfig(
      getAtPath(SHIPPED_DOC, "match.fireRing") as Parameters<typeof fireRingRulesFromConfig>[0],
      1 / TICK_HZ,
      combatMaxSec,
    );
    expect(before.hardCapTicks).toBe(300 * TICK_HZ); // 出貨的 5 分鐘

    const doc = matchDocFrom(SHIPPED_DOC, { ...read.values, [PATH]: "420" }, true);
    const after = fireRingRulesFromConfig(
      getAtPath(doc, "match.fireRing") as Parameters<typeof fireRingRulesFromConfig>[0],
      1 / TICK_HZ,
      combatMaxSec,
    );
    expect(after.hardCapTicks).toBe(420 * TICK_HZ);
    // 硬底線的天花板跟著走：420 + (combatMaxSec − startSec)。
    // ⚠️ 兩個減項都**讀出貨設定**，不寫死 —— `combatMaxSec` 2026-08-01 從 100 改成
    // 180，而原本寫死的 460 讓這一條從那一刻起就紅著跟過兩個版本，訊息還誤導成
    // 「後台那一格壞了」。這條要驗的是**公式**（改 hardCap → 天花板跟著平移），
    // 不是某一組平衡值。
    const startSec = Number(read.values["match.fireRing.startSec"]);
    expect(after.hardDeadlineTicks).toBe((420 + combatMaxSec - startSec) * TICK_HZ);
    // …而且它真的**跟著 hardCap 動**：420 比出貨的 300 多 120 秒，天花板也要多 120 秒。
    expect(after.hardDeadlineTicks - before.hardDeadlineTicks).toBe(120 * TICK_HZ);
    // 沒被碰到的東西不動 —— 存檔不會順手重排火圈。
    expect(after.startTicks).toBe(before.startTicks);
    expect(after.shrinkTicks).toBe(before.shrinkTicks);
  });

  it("硬上限短過「正常回合」時存檔被擋下來 —— 它只能砍被延長的回合", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    // startSec 60 + shrinkSec 20 = 80 > 50 → 這個上限會把正常回合也砍掉。
    const doc = matchDocFrom(SHIPPED_DOC, { ...read.values, [PATH]: "50" }, true);
    const issues = matchDocIssues(doc);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(" ")).toContain("roundHardCapSec");
    // …而出貨的值是合法的（否則上面那條可能只是在測一份壞樣本）。
    expect(matchDocIssues(matchDocFrom(SHIPPED_DOC, read.values, true))).toEqual([]);
  });
});
