/**
 * `match.maxRounds`（總回合數上限，#288）在後台**畫得出來、存得回去**，而且那四格
 * 房主可調欄位的界限是**import 來的**、不是在 schema 或後台重打一次。
 *
 * ⚠️ 最後一條問的是「上界在哪一層」：房主開房那條路**不經過**後台表單，界只寫在
 * `MATCH_CONSOLE_MAX` 的話，表單擋住的數字用 HTTP 直送照樣進得去。
 * ── 突變紀錄（真的改壞 → 跑紅 → 還原 → 跑綠）──────────────────────────────
 *   A. `MATCH_GROUPS` 的 clock 組刪掉 `"match.maxRounds"` → 「畫得出來」紅
 *   B. schema 的 `.max(ROOM_SETTING_LIMITS.maxRounds.max)` 改成 `.max(999)` → 「界是 import 來的」紅
 *   C. schema 的 `combatMaxSec` 上界拿掉 → 「HTTP 直送也擋得住」紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { MAX_ROUNDS_UNLIMITED, ROOM_SETTING_LIMITS } from "@ggd/shared/roomSettings";
import {
  MATCH_FIELDS,
  MATCH_FIELD_INFO,
  MATCH_GROUPS,
  isEditable,
  matchDocFrom,
  matchDocIssues,
  matchFieldBounds,
  readMatchDoc,
} from "./matchConfig";
import { getAtPath } from "./configFields";

const TAG = "match-config-page";
const PATH = "match.maxRounds";
const SHIPPED_DOC = JSON.parse(
  readFileSync(join(__dirname, "../../../content/config/config.match.json"), "utf8"),
) as Record<string, unknown>;

const fieldAt = (path: string) => MATCH_FIELDS.find((f) => f.path === path);
const save = (path: string, raw: string): Record<string, unknown> =>
  matchDocFrom(SHIPPED_DOC, { ...readMatchDoc(SHIPPED_DOC).values, [path]: raw }, true);

describe("後台「總回合數上限」欄位 (#288)", () => {
  it("畫得出來：在推導欄位裡、可編輯、落在回合時鐘那一組、說明講的是它影響什麼", () => {
    cover(TAG);
    expect(fieldAt(PATH), `${PATH} 不在 MATCH_FIELDS 裡`).toBeDefined();
    expect(isEditable(PATH)).toBe(true);
    expect(MATCH_GROUPS.find((g) => g.paths.includes(PATH))?.key).toBe("clock");
    const info = MATCH_FIELD_INFO[PATH]!;
    expect(info.note).toContain("不設限"); // 0 的語意
    expect(info.note).toContain("房主"); // 這一頁設的只是「房主沒指定時」的值
  });

  it("上下界是 roomSettings 那一份，不是後台或 schema 自己打的字", () => {
    cover(TAG);
    const b = matchFieldBounds(fieldAt(PATH)!)!;
    expect(b.min).toBe(ROOM_SETTING_LIMITS.maxRounds.min);
    expect(b.max).toBe(ROOM_SETTING_LIMITS.maxRounds.max);
    // 上界住在 schema，不是後台補的 —— 房主那條路只看得到 schema 這一層。
    expect(b.maxFromConsole).toBe(false);
  });

  it("存得回一份通得過 Zod 的文件，出貨值是「不設限」", () => {
    cover(TAG);
    const doc = save(PATH, "6");
    expect(matchDocIssues(doc)).toEqual([]);
    expect(getAtPath(doc, PATH)).toBe(6);
    // 出貨值不抄字面 0，從哨兵推導（它是「＝現在的行為」的字面實現）。
    expect(getAtPath(SHIPPED_DOC, PATH)).toBe(MAX_ROUNDS_UNLIMITED);
  });

  it("HTTP 直送也擋得住：房主可調的三格上界都在 Zod，不是只在後台表單", () => {
    cover(TAG);
    for (const [path, key] of [
      [PATH, "maxRounds"],
      ["match.intermissionSec", "intermissionSec"],
      ["match.combatMaxSec", "combatMaxSec"],
    ] as const) {
      const over = String(ROOM_SETTING_LIMITS[key].max + 1);
      expect(matchDocIssues(save(path, over)).join(" "), path).toContain(key);
    }
  });
});
