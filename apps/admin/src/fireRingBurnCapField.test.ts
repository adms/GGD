/**
 * 「燃燒真傷上限」這一格**真的在後台的欄位登記表裡** —— owner 2026-08-02
 * 「可以把燃燒真傷上限數值設定放在後台，例如預設最高是50%之類」。
 *
 * ⚠️ 這一份刻意**import 那些資料結構去讀**，不是 grep 原始碼字串（第⑥種故障）。
 * 「頁面上有這一格」在這個後台是四件事同時成立才算數，而四件事分別住在四個地方：
 *   1. 它在 `MATCH_FIELDS`（從 Zod 推導出來的欄位清單）裡
 *   2. 它可編輯（`isEditable` —— 這一頁有 19 格是唯讀的裝飾）
 *   3. 它有上下界（`matchFieldBounds`），而且**上界擋得住手滑**
 *   4. 它在某一個分組的 `paths` 裡（不在任何一組 = 畫不出來）
 *      而且有中文標籤與「它影響什麼」的說明（`MATCH_FIELD_INFO`）
 *
 * ── 突變紀錄（每一條都真的改壞、跑紅、還原、再跑綠）─────────────────────────
 *   A. `matchConfig.ts` 的 `MATCH_GROUPS` 裡把
 *      `"match.fireRing.maxPctPerSec"` 從 fireRing 那一組的 `paths` 刪掉
 *        → 「在某一個分組裡」紅。
 *   B. `MATCH_FIELD_INFO` 的那一格 `note` 改成只複述欄位名（"每秒燒傷上限"）
 *        → 「說明要寫它影響什麼」紅（它要求出現「最大生命」與具體後果）。
 *   C. `config.ts` 的 `.max(1)` → 拿掉
 *        → 「有上界」紅（`matchFieldBounds` 會拋，因為後台也沒補）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_MAX_PCT_PER_SEC } from "@ggd/shared/sim/fireRing";
import {
  MATCH_FIELDS,
  MATCH_FIELD_INFO,
  MATCH_GROUPS,
  isEditable,
  matchFieldBounds,
  validateMatchField,
} from "./matchConfig";

const TAG = "match-config-page";
const PATH = "match.fireRing.maxPctPerSec";

describe("後台「每秒燒傷上限」欄位", () => {
  it("在從 Zod 推導出來的欄位清單裡，而且是可編輯的", () => {
    cover(TAG);
    const field = MATCH_FIELDS.find((f) => f.path === PATH);
    expect(field, `${PATH} 不在 MATCH_FIELDS 裡`).toBeDefined();
    expect(isEditable(PATH)).toBe(true);
  });

  it("上下界兩邊都有，而且上界就是 1.0（一秒滿血變空）", () => {
    cover(TAG);
    const field = MATCH_FIELDS.find((f) => f.path === PATH)!;
    const b = matchFieldBounds(field)!;
    expect(b.min).toBe(0);
    expect(b.max).toBe(1);
    // 上界來自 schema，不是後台自己補的 —— 補在後台的話 sim/內容檔那一側擋不住。
    expect(b.maxFromConsole).toBe(false);
  });

  it("1.5 與 -0.1 都被後台的驗證擋下來", () => {
    cover(TAG);
    expect(validateMatchField(PATH, "1.5", true)).toMatch(/不能大於/);
    expect(validateMatchField(PATH, "-0.1", true)).toBeTruthy();
    expect(validateMatchField(PATH, String(DEFAULT_MAX_PCT_PER_SEC), true)).toBeNull();
  });

  it("被排進「火圈」那一組，畫得出來", () => {
    cover(TAG);
    const group = MATCH_GROUPS.find((g) => g.paths.includes(PATH));
    expect(group, `${PATH} 不在任何一個分組的 paths 裡 —— 頁面上根本不會出現`).toBeDefined();
    expect(group!.key).toBe("fireRing");
  });

  it("有中文標籤，說明寫的是「它影響什麼」而不是複述欄位名", () => {
    cover(TAG);
    const info = MATCH_FIELD_INFO[PATH];
    expect(info).toBeDefined();
    expect(info!.zh).toContain("燒傷");
    // 影響什麼：扣的是最大生命的百分比，而且調高/調低各自的後果都要講。
    expect(info!.note).toContain("最大生命");
    expect(info!.note).toMatch(/調低|調高/);
    // 留白的語意變了（不再是「不設限」），說明必須跟著改 —— CLAUDE.md 第三守則。
    expect(info!.note).toContain("留白");
    expect(info!.note).not.toContain("不設限（曲線自己說了算）");
    // 它有消費端，不是裝飾格。
    expect(info!.live).toBeTruthy();
  });
});
