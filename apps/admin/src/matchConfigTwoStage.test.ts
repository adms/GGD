/**
 * 火圈二段制在後台真的是四格可編輯的欄位 (owner 2026-08-02).
 *
 *   「第一、第二段燒幾秒跟起始是幾秒，也可以在後台設定」
 *
 * ⚠️ 這一支**不掃原始碼字串**（失敗形態 ⑥）。它 import 那三張真的資料結構
 * （`MATCH_FIELDS` 從 Zod 推導、`MATCH_GROUPS` 決定畫面上排在哪、
 * `MATCH_FIELD_INFO` 決定標籤與說明），再把表單的值一路推到**出貨的**
 * `fireRingRulesFromConfig` —— 也就是 game-server 真的呼叫的那一支
 * （失敗形態 ⑤）。所以「後台加了一格但沒有人讀」在這裡是紅的。
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
import { fireRingRulesFromConfig } from "@ggd/shared/sim/fireRing";
import { TICK_HZ } from "@ggd/shared/constants";

const TAG = "adminui-match-config";

const SHIPPED_DOC = JSON.parse(
  readFileSync(join(__dirname, "../../../content/config/config.match.json"), "utf8"),
) as Record<string, unknown>;

/** owner 說的四個數字 + 讓「停止縮圈」成立的那一格。 */
const TWO_STAGE_PATHS = [
  "match.fireRing.startSec", // ① 第一段起始
  "match.fireRing.shrinkSec", // ② 第一段縮多久
  "match.fireRing.stage2StartSec", // ③ 第二段起始
  "match.fireRing.stage2ShrinkSec", // ④ 第二段縮多久
  "match.fireRing.stage1Radius", // 停止縮圈的口袋
] as const;

describe(`${TAG} — 二段制的欄位真的在後台`, () => {
  it("五格都在推導出來的欄位表裡、可編輯、有上下界、有標籤與說明", () => {
    cover(TAG);
    for (const path of TWO_STAGE_PATHS) {
      const field = MATCH_FIELDS.find((f) => f.path === path);
      expect(field, `${path} 不在 MATCH_FIELDS`).toBeDefined();
      expect(isEditable(path), `${path} 應該可編輯`).toBe(true);
      const bounds = matchFieldBounds(field!);
      expect(bounds, `${path} 沒有界`).not.toBeNull();
      // CLAUDE.md 「欄位要有上界，不是只有下界」
      expect(bounds!.max, `${path} 沒有上界`).toBeTypeOf("number");
      expect(bounds!.min, `${path} 沒有下界`).toBeTypeOf("number");
      const info = MATCH_FIELD_INFO[path];
      expect(info, `${path} 沒有標籤`).toBeDefined();
      // 說明要講「它影響什麼」，不是複述欄位名
      expect(info!.note.length, `${path} 的說明太短`).toBeGreaterThan(40);
      expect(info!.live, `${path} 沒有寫誰在讀它`).toBeTruthy();
    }
  });

  it("五格都被畫在「火圈」那一組裡（不然頁面上根本看不到）", () => {
    cover(TAG);
    const group = MATCH_GROUPS.find((g) => g.key === "fireRing");
    expect(group).toBeDefined();
    for (const path of TWO_STAGE_PATHS) {
      expect(group!.paths, `${path} 沒有被分組`).toContain(path);
    }
  });

  it("口袋半徑的下界真的擋得住「比身體還小」，上界擋得住「比場地還大」", () => {
    cover(TAG);
    const path = "match.fireRing.stage1Radius";
    // 0.6 是角色碰撞半徑；比它小的口袋等於沒有口袋。
    expect(validateMatchField(path, "0.5", true)).not.toBeNull();
    expect(validateMatchField(path, "30", true)).not.toBeNull();
    expect(validateMatchField(path, "4", true)).toBeNull();
  });

  it("在表單上改一格 → 出貨的 sim 函式真的算出不同的圈（值到得了）", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const dt = 1 / TICK_HZ;
    const rulesOf = (values: Record<string, string>): ReturnType<typeof fireRingRulesFromConfig> => {
      const doc = matchDocFrom(SHIPPED_DOC, values, true);
      expect(matchDocIssues(doc)).toEqual([]); // 存得下去才算數
      return fireRingRulesFromConfig(
        getAtPath(doc, "match.fireRing") as Parameters<typeof fireRingRulesFromConfig>[0],
        dt,
        getAtPath(doc, "match.combatMaxSec") as number,
      );
    };

    const before = rulesOf(read.values);
    expect(before.stage2GapTicks).toBe(30 * TICK_HZ); // 90 − 60
    expect(before.stage2ShrinkTicks).toBe(20 * TICK_HZ);
    expect(before.stage1Radius).toBe(4);

    // ③ 第二段起始 90 → 120
    const later = rulesOf({ ...read.values, "match.fireRing.stage2StartSec": "120" });
    expect(later.stage2GapTicks).toBe(60 * TICK_HZ);
    // ④ 第二段縮多久 20 → 45
    const slower = rulesOf({ ...read.values, "match.fireRing.stage2ShrinkSec": "45" });
    expect(slower.stage2ShrinkTicks).toBe(45 * TICK_HZ);
    // 口袋 4 → 6
    const roomier = rulesOf({ ...read.values, "match.fireRing.stage1Radius": "6" });
    expect(roomier.stage1Radius).toBe(6);
    // …而且沒被碰到的東西一格都不動（存檔不會順手重排火圈）
    expect(roomier.startTicks).toBe(before.startTicks);
    expect(roomier.stage2GapTicks).toBe(before.stage2GapTicks);
  });

  it("把第二段那一格清空 = 關掉第二段（頁面說的就是這件事）", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const doc = matchDocFrom(SHIPPED_DOC, { ...read.values, "match.fireRing.stage2StartSec": "" }, true);
    expect(matchDocIssues(doc)).toEqual([]); // 舊形狀仍然合法
    const ring = getAtPath(doc, "match.fireRing") as Record<string, unknown>;
    expect(ring.stage2StartSec).toBeUndefined();
    const rules = fireRingRulesFromConfig(
      // ⚠️ `as unknown as` 而不是直接轉：`getAtPath` 回的是
      // `Record<string, unknown>`，跟 `FireRingConfigLike`（`startSec: number`
      // 是必填）沒有足夠重疊，TS2352 會擋。這一條是 2026-08-02 全 monorepo
      // 唯一的 typecheck 錯，而 CI 在 lint 之後就跑 typecheck —— 它會擋掉 build。
      ring as unknown as Parameters<typeof fireRingRulesFromConfig>[0],
      1 / TICK_HZ,
      180,
    );
    expect(rules.stage2ShrinkTicks).toBe(0);
    expect(rules.stage1Radius).toBe(rules.minRadius);
    // …而標籤有把這個後果講出來，不是留給操作者猜。
    expect(MATCH_FIELD_INFO["match.fireRing.stage2StartSec"]!.note).toContain("留白");
  });
});
