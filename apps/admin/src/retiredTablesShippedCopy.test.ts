/**
 * 「已退場的抽獎池」那一組欄位,跟出貨的東西對得起來嗎 (owner 2026-08-01)。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼是**另一個**檔案,而不是加進 itemDraftShippedCopy.test.ts
 * ════════════════════════════════════════════════════════════════════════════
 * `retiredLootTables` 是 arena-rules 的**頂層**欄位,不是 `itemDraft` 區塊的一格。
 * 那一支的核心守衛是
 *
 *     expect([...ITEM_DRAFT_FIELD_ORDER].sort()).toEqual(Object.keys(zItemDraftConfig.shape).sort())
 *
 * —— 把退場清單塞進 `ItemDraftField` 會讓那條守衛從此對不上,而它正是那一頁存在
 * 的理由(第一守則的第三隻腳:後台那一份是手抄的,是唯一會靜靜漂走的一份)。
 * 所以退場清單是同一頁上的第二組欄位,配自己的 drift 守衛。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 突變紀錄 —— 每一條都實跑過(2026-08-01)
 * ════════════════════════════════════════════════════════════════════════════
 * R1 `SHIPPED_RETIRED_LOOT_TABLES` 改成 `[]`
 *    ⇒ **1 紅**(出貨值逐格對 content/config/arena-rules.json)。
 * R2 `RETIRED_TABLES_MAX` 改成 99(Zod 是 16)
 *    ⇒ **1 紅**(上界鏡射 Zod)。
 * R3 `validateRetiredTables` 刪掉 `fallbackTable` 那段交叉檢查
 *    ⇒ **1 紅**(「同時是備援又退場」那條)。
 * R4 `patchRetiredTables` 改成 `return { retiredLootTables: [...ids] }`(不帶基底)
 *    ⇒ **1 紅**(兄弟區塊在存檔時消失)。
 * R5 `ItemDraftPage.tsx` 的 `patchRetiredTables(patchItemDraft(...))` 拆成只送
 *    `patchItemDraft(...)` ⇒ **1 紅**(頁面根本沒有把退場清單寫出去)。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { zConfigArenaRulesDoc, zDraftConflict } from "@ggd/shared/content/schema/config";
import {
  ITEM_DRAFT_GROUP_ZH,
  RETIRED_TABLES_LABEL,
  RETIRED_TABLES_MAX,
  RETIRED_TABLE_ID_MAXLEN,
  SHIPPED_RETIRED_LOOT_TABLES,
  formatRetiredTables,
  parseRetiredTables,
  patchRetiredTables,
  readRetiredTables,
  retiredTablesSummary,
  validateRetiredTables,
  DRAFT_CONFLICT_LABEL,
  DRAFT_CONFLICT_OPTIONS,
  SHIPPED_DRAFT_CONFLICT,
  patchDraftConflict,
  readDraftConflict,
} from "./itemDraft";

const TAG = "adminui-item-draft";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const ARENA_JSON = join(REPO, "content/config/arena-rules.json");
const realDoc = JSON.parse(readFileSync(ARENA_JSON, "utf8")) as Record<string, unknown>;

const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const PAGE = stripComments(readFileSync(join(REPO, "apps/admin/src/ui/ItemDraftPage.tsx"), "utf8"));

describe("出貨值 = 真的出貨文件 (adminui-item-draft)", () => {
  it("★ SHIPPED_RETIRED_LOOT_TABLES 逐格等於 arena-rules 的 retiredLootTables", () => {
    cover(TAG);
    expect(realDoc.retiredLootTables, "arena-rules 沒有 retiredLootTables 了").toBeTruthy();
    expect(realDoc.retiredLootTables).toEqual([...SHIPPED_RETIRED_LOOT_TABLES]);
    // owner 的裁決本身 —— 不是「隨便一張表」。2026-08-01 是 quest-rewards;
    // 2026-08-18 owner 把 quest-rewards 與 round-reward **整張**搬進
    // `content/_legacy/loot-tables/`,兩張都要留在這裡:退場宣告擋的是**後台耐久
    // 覆蓋層**那條沒有 Zod 的路(#283),表不在磁碟上不代表沒有人排得回去。
    expect([...SHIPPED_RETIRED_LOOT_TABLES]).toEqual(["quest-rewards", "round-reward"]);
  });

  it("★ 出貨的那份仍然通得過 Zod（後台送回去的東西不會被拒）", () => {
    cover(TAG);
    expect(() => zConfigArenaRulesDoc.parse(realDoc)).not.toThrow();
  });
});

describe("撞卡裁決那一格也對得起出貨的東西 (#340, adminui-item-draft)", () => {
  it("★ 出貨值 = 真的出貨文件；選項窮舉 Zod 的列舉；缺欄位讀成出貨值不是舊行為", () => {
    cover(TAG);
    expect(realDoc.draftConflict, "arena-rules 沒有 draftConflict").toBe(SHIPPED_DRAFT_CONFLICT);
    // 三個選項 = Zod 的三個值，一個不多一個不少（漏一個 = 後台選不到那條路）。
    expect([...DRAFT_CONFLICT_OPTIONS.map((o) => o.value)].sort()).toEqual(
      [...zDraftConflict.options].sort(),
    );
    expect(readDraftConflict(realDoc)).toBe(SHIPPED_DRAFT_CONFLICT);
    const legacy = { ...realDoc };
    delete (legacy as Record<string, unknown>).draftConflict;
    // ⚠️ 線上的耐久覆蓋層就長這樣。遊戲側 `rulesFromDoc` 的 `??` 讓它拿到出貨值，
    // 後台畫成別的東西就是在說一件遊戲裡沒有在做的事。
    expect(readDraftConflict(legacy)).toBe(SHIPPED_DRAFT_CONFLICT);
    expect(DRAFT_CONFLICT_LABEL.note.length, "說明太短，看起來像在複述欄位名").toBeGreaterThan(20);
  });

  it("★ 頁面畫得出來、存檔真的把它寫出去，而且兄弟區塊一個都不掉", () => {
    cover(TAG);
    expect(PAGE, "沒有下拉 —— 欄位存在但操作者碰不到").toContain('data-field="draftConflict"');
    expect(PAGE, "存檔沒有把撞卡裁決寫出去").toContain("patchDraftConflict(");
    const next = patchDraftConflict(realDoc, "both");
    expect(next.draftConflict).toBe("both");
    for (const key of Object.keys(realDoc)) {
      if (key === "draftConflict") continue;
      expect(next[key], `存檔把 ${key} 弄丟了 —— 覆蓋層存的是整份文件`).toEqual(realDoc[key]);
    }
    expect(() => zConfigArenaRulesDoc.parse(next)).not.toThrow();
  });
});

describe("上下界鏡射 Zod，而且兩端都有 (adminui-item-draft)", () => {
  it("★ 清單長度上界 = schema 的 .max()", () => {
    cover(TAG);
    const arr = (zConfigArenaRulesDoc.shape.retiredLootTables as unknown as {
      _def: { innerType: { _def: { maxLength: { value: number } | null } } };
    })._def.innerType._def;
    expect(arr.maxLength?.value, "schema 沒有清單上界了").toBe(RETIRED_TABLES_MAX);
  });

  it("★ 每一格 id 的長度上界 = schema 的 .max()", () => {
    cover(TAG);
    const el = (zConfigArenaRulesDoc.shape.retiredLootTables as unknown as {
      _def: { innerType: { element: { _def: { checks: { kind: string; value: number }[] } } } };
    })._def.innerType.element._def.checks;
    expect(el.find((c) => c.kind === "max")?.value).toBe(RETIRED_TABLE_ID_MAXLEN);
    expect(el.find((c) => c.kind === "min")?.value, "空字串不是一個表 id").toBe(1);
  });

  it("★ 表單兩端都會擋 —— 上界不是只有 schema 有", () => {
    cover(TAG);
    const ok = formatRetiredTables(SHIPPED_RETIRED_LOOT_TABLES);
    expect(validateRetiredTables(ok, "")).toBeNull();
    expect(validateRetiredTables("", ""), "留空 = 沒有任何表退場，合法").toBeNull();
    // 超過清單上界
    const tooMany = Array.from({ length: RETIRED_TABLES_MAX + 1 }, (_, i) => `t-${i}`).join(",");
    expect(validateRetiredTables(tooMany, "")).not.toBeNull();
    // 超過單格長度上界
    expect(validateRetiredTables("a".repeat(RETIRED_TABLE_ID_MAXLEN + 1), "")).not.toBeNull();
    // id 形狀
    expect(validateRetiredTables("Quest_Rewards", "")).not.toBeNull();
    // 交叉檢查：同時是備援又退場 = 借不到任何東西
    expect(
      validateRetiredTables("quest-rewards", "quest-rewards"),
      "同時當備援又退場必須擋下來 —— 後端會拒絕，而畫面上看不出原因",
    ).not.toBeNull();
  });
});

describe("讀寫是無損的，而且存檔送整份文件 (adminui-item-draft)", () => {
  it("★ 逗號分隔的輸入 → id 陣列 → 輸入框原文，來回無損；重複自動去掉", () => {
    cover(TAG);
    expect(parseRetiredTables(" quest-rewards ,, round-reward\n")).toEqual([
      "quest-rewards",
      "round-reward",
    ]);
    expect(parseRetiredTables("a, a, a")).toEqual(["a"]);
    expect(parseRetiredTables(formatRetiredTables(SHIPPED_RETIRED_LOOT_TABLES))).toEqual([
      ...SHIPPED_RETIRED_LOOT_TABLES,
    ]);
  });

  it("★ readRetiredTables 讀出貨文件 = 出貨值；schema 不對就回空", () => {
    cover(TAG);
    expect(readRetiredTables(realDoc)).toEqual([...SHIPPED_RETIRED_LOOT_TABLES]);
    expect(readRetiredTables({ schema: "config.combat-env@1", retiredLootTables: ["x"] })).toEqual([]);
    expect(readRetiredTables(null)).toEqual([]);
    // 舊文件沒有這個欄位 = 沒有任何表退場（這個機制出現之前的行為）。
    const legacy = { ...realDoc };
    delete (legacy as Record<string, unknown>).retiredLootTables;
    expect(readRetiredTables(legacy)).toEqual([]);
  });

  it("★ patchRetiredTables 只換掉那一格，其他區塊一個都不掉", () => {
    cover(TAG);
    const next = patchRetiredTables(realDoc, ["quest-rewards", "round-reward"]);
    expect(next.retiredLootTables).toEqual(["quest-rewards", "round-reward"]);
    for (const key of Object.keys(realDoc)) {
      if (key === "retiredLootTables") continue;
      expect(next[key], `存檔把 ${key} 弄丟了 —— 覆蓋層存的是整份文件`).toEqual(realDoc[key]);
    }
    expect(() => zConfigArenaRulesDoc.parse(next)).not.toThrow();
  });

  it("★ 空清單寫成 []，不是把鍵刪掉 —— 「沒有表退場」是一個明說的狀態", () => {
    cover(TAG);
    const next = patchRetiredTables(realDoc, []);
    expect(Object.prototype.hasOwnProperty.call(next, "retiredLootTables")).toBe(true);
    expect(next.retiredLootTables).toEqual([]);
  });
});

describe("這一格真的畫在頁面上，而且真的被寫出去 (adminui-item-draft)", () => {
  it("★ 頁面有輸入框、有說明、而且儲存時把兩個 patch 疊在同一份基底上", () => {
    cover(TAG);
    // ⚠️ 原始碼掃描,不是行為 —— 它擋得住「忘了接線」,證明不了渲染。誠實地
    // 只宣稱前者(同 itemDraftShippedCopy.test.ts 的 App.tsx 那條)。
    expect(PAGE, "沒有輸入框 —— 欄位存在但操作者碰不到").toContain('data-field="retiredLootTables"');
    expect(PAGE, "存檔沒有把退場清單寫出去").toContain("patchRetiredTables(patchItemDraft(baseDoc, preview), retiredIds)");
    expect(PAGE, "驗證沒有擋住儲存鈕").toContain("retiredErr !== null");
  });

  it("★ 分組有中文名，說明寫的是「它影響什麼」", () => {
    cover(TAG);
    expect(ITEM_DRAFT_GROUP_ZH.retire.length).toBeGreaterThan(1);
    expect(RETIRED_TABLES_LABEL.zh.length).toBeGreaterThan(1);
    expect(RETIRED_TABLES_LABEL.note.length, "說明太短，看起來像在複述欄位名").toBeGreaterThan(20);
    // 「它不是刪除」是這一格最容易被誤解的地方，說明必須講。
    expect(RETIRED_TABLES_LABEL.note).toContain("刪除");
  });

  it("★ 摘要說的是玩家/操作者會遇到什麼，兩種狀態都說得出來", () => {
    cover(TAG);
    expect(retiredTablesSummary([])).toContain("沒有任何");
    expect(retiredTablesSummary(["quest-rewards"])).toContain("quest-rewards");
    expect(retiredTablesSummary(["quest-rewards"])).toContain("拒絕");
  });
});
