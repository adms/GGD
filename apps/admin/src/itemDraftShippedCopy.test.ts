/**
 * 傳說武器三選一那一頁,**跟出貨的東西對得起來嗎** (GH#249)。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一支守的是 CLAUDE.md 第一守則的第三隻腳
 * ════════════════════════════════════════════════════════════════════════════
 * 一個欄位要同時活在三個地方 —— `content/config/*.json` 的出貨值、
 * `content/schema/config.ts` 的 Zod、以及後台。前兩個有 `bundle.test.ts` 綁著;
 * 後台那一份是**手抄的**,所以它是唯一可以靜靜漂走的一份。漂走的樣子不是紅燈,
 * 是操作者在畫面上看到一個永遠回不去出貨值的「出貨值」欄位。
 *
 * 四件事:
 *   1. 後台的 `SHIPPED_ITEM_DRAFT` **逐格**等於真的 arena-rules 文件;
 *   2. 後台的上下界**逐格**鏡射 Zod(而且兩端都有 —— #277);
 *   3. schema 的每一個 `itemDraft` 葉節點都有一筆人話標籤,反之亦然;
 *   4. 存檔一定送**整份文件**(兄弟區塊不能在存檔時消失)。
 *
 * ⚠️ 這一支**不是**行為守衛。「卡片真的有三張」由
 * `packages/shared/src/sim/economy/draftTopUp.test.ts` 與
 * `apps/game-server/src/match/legendaryCardWidth.test.ts` 守,它們跑真的抽卡。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 突變紀錄 —— 每一條都**實跑過**,紅燈數字是數出來的(2026-08-01)
 * ════════════════════════════════════════════════════════════════════════════
 * A1 `SHIPPED_ITEM_DRAFT.maxDraws` 改成 32(出貨值是 64)→ **1 紅**(出貨值逐格)。
 * A2 `MAX_DRAWS_MAX` 改成 1024(Zod 是 512)→ **1 紅**(上下界鏡射 Zod)。
 * A3 `ITEM_DRAFT_LABELS` 拿掉 `fallbackTable` 那一筆 → **1 個 tsc 錯**
 *    (`Record<ItemDraftField, …>` 是 exhaustive 的;`npx tsc --noEmit -p
 *    apps/admin` 實測 1 error)**加上本檔 2 紅**(欄位清單、說明長度)。
 * A4 `patchItemDraft` 改成 `return { itemDraft: { ...cfg } }`(不帶基底文件)
 *    → **1 紅**(兄弟區塊在存檔時消失)。
 * A5 App.tsx 的導覽列那一行刪掉 → **1 紅**(頁面掛不進 console)。
 * A6 `KNOWN_LOOT_TABLES` 拿掉 `round-reward` → **1 紅**(已知獎池清單)。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { zItemDraftConfig, zConfigArenaRulesDoc } from "@ggd/shared/content/schema/config";
import { pageRequiresSession } from "./store";
import {
  ARENA_RULES_DOC_ID,
  ARENA_RULES_SCHEMA,
  FALLBACK_TABLE_MAXLEN,
  ITEM_DRAFT_FIELD_ORDER,
  ITEM_DRAFT_LABELS,
  KNOWN_LOOT_TABLES,
  MAX_DRAWS_MAX,
  MAX_DRAWS_MIN,
  SHIPPED_ITEM_DRAFT,
  SHIPPED_OFFER_COUNT,
  SHORT_POOL_MODE_OPTIONS,
  changedFields,
  extractItemDraft,
  formFromConfig,
  itemDraftFromForm,
  itemDraftSummary,
  patchItemDraft,
  readOfferCount,
  validateItemDraftForm,
} from "./itemDraft";

const TAG = "adminui-item-draft";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const ARENA_JSON = join(REPO, "content/config/arena-rules.json");
const LOOT_INDEX = join(REPO, "content/loot-tables/_index.json");

const realDoc = JSON.parse(readFileSync(ARENA_JSON, "utf8")) as Record<string, unknown>;

/** 把註解剝掉 —— 這個 repo 的長註解裡什麼字都有，不能讓散文滿足檢查。 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const APP = stripComments(readFileSync(join(REPO, "apps/admin/src/ui/App.tsx"), "utf8"));

describe("這一頁真的掛進 console 了 (adminui-item-draft)", () => {
  it("★ 需要 session —— 它的儲存走 putOverlayDoc，沒有 session 一律 401", () => {
    cover(TAG);
    expect(pageRequiresSession("itemDraft"), "傳說武器三選一 沒有 session-gate").toBe(true);
    // 對照組：一個刻意不 gate 的頁面。少了它，上面那條在「函式永遠回 true」的
    // 實作下也會過。
    expect(pageRequiresSession("hub")).toBe(false);
  });

  it("★ App.tsx 有靜態 import、導覽列一列、以及一條路由", () => {
    cover(TAG);
    // ⚠️ 這是原始碼掃描，不是行為 —— 它擋得住「忘了接線」，證明不了 rollup 沒有
    // 把它 dead-fold 掉。誠實地只宣稱前者（同 configPagesRegistered.test.ts）。
    expect(APP, "沒有 top-level 靜態 import —— 生產 bundle 裡不會有這一頁").toContain(
      'import { ItemDraftPage } from "./ItemDraftPage";',
    );
    expect(APP, "導覽列沒有這一列 —— 點不進去").toContain('page: "itemDraft", label: "傳說武器三選一"');
    expect(APP, "沒有路由 —— 點進去會是一片空白").toContain(
      'page === "itemDraft" && <ItemDraftPage />',
    );
  });
});

describe("後台的出貨值 = 真的出貨文件 (adminui-item-draft)", () => {
  it("★ SHIPPED_ITEM_DRAFT 逐格等於 content/config/arena-rules.json 的 itemDraft", () => {
    cover(TAG);
    expect(realDoc.schema).toBe(ARENA_RULES_SCHEMA);
    expect(realDoc.id).toBe(ARENA_RULES_DOC_ID);
    const block = realDoc.itemDraft;
    expect(block, "arena-rules 裡沒有 itemDraft 區塊了 —— 後台那一頁會顯示一份不存在的出貨值").toBeTruthy();
    expect(block).toEqual({ ...SHIPPED_ITEM_DRAFT });
    // 唯讀那一列也要對 —— 顯示錯的張數比不顯示更糟。
    expect(realDoc.offerCount).toBe(SHIPPED_OFFER_COUNT);
  });

  it("★ 出貨的那份 itemDraft 真的通得過 Zod（後台送回去的東西不會被拒）", () => {
    cover(TAG);
    expect(() => zItemDraftConfig.parse(realDoc.itemDraft)).not.toThrow();
    expect(() => zConfigArenaRulesDoc.parse(realDoc)).not.toThrow();
  });

  it("★ 出貨值本身是最保守的那一個 —— `short`", () => {
    cover(TAG);
    // 出貨值不是隨便一個合法值,它是一個**決定**:另外兩個都會發給玩家內容沒有
    // 承諾的東西(重複的卡 / 別張表的道具)。改掉它要有理由,不是順手。
    expect(SHIPPED_ITEM_DRAFT.shortPoolMode).toBe("short");
    expect(SHIPPED_ITEM_DRAFT.fallbackTable).toBe("");
  });
});

describe("上下界鏡射 Zod，而且兩端都有 (adminui-item-draft)", () => {
  it("★ maxDraws 的上下界 = schema 的上下界", () => {
    cover(TAG);
    // 從 Zod 自己身上讀,不是打字 —— schema 改界線這裡就會紅。
    const checks = (zItemDraftConfig.shape.maxDraws as unknown as {
      _def: { checks: { kind: string; value: number }[] };
    })._def.checks;
    const min = checks.find((c) => c.kind === "min")?.value;
    const max = checks.find((c) => c.kind === "max")?.value;
    expect(min, "schema 沒有下界了").toBe(MAX_DRAWS_MIN);
    expect(max, "schema 沒有上界了 —— #277：只有下界的欄位擋不住 64 打成 640").toBe(MAX_DRAWS_MAX);
  });

  it("★ fallbackTable 的長度上界 = schema 的長度上界", () => {
    cover(TAG);
    const checks = (zItemDraftConfig.shape.fallbackTable as unknown as {
      _def: { checks: { kind: string; value: number }[] };
    })._def.checks;
    expect(checks.find((c) => c.kind === "max")?.value).toBe(FALLBACK_TABLE_MAXLEN);
  });

  it("★ 表單兩端都會擋 —— 上界不是只有 schema 有", () => {
    cover(TAG);
    const base = formFromConfig(SHIPPED_ITEM_DRAFT);
    expect(validateItemDraftForm(base)).toEqual([]);
    expect(validateItemDraftForm({ ...base, maxDrawsText: "0" })).toHaveLength(1);
    expect(validateItemDraftForm({ ...base, maxDrawsText: String(MAX_DRAWS_MAX + 1) })).toHaveLength(1);
    expect(validateItemDraftForm({ ...base, maxDrawsText: "64.5" })).toHaveLength(1);
    expect(validateItemDraftForm({ ...base, maxDrawsText: "" })).toHaveLength(1);
    // 選了「借備援獎池」卻沒填獎池 = 靜靜退化成發短卡,所以擋下來。
    expect(validateItemDraftForm({ ...base, shortPoolMode: "fallback" })).toHaveLength(1);
    expect(
      validateItemDraftForm({ ...base, shortPoolMode: "fallback", fallbackTable: "quest-rewards" }),
    ).toEqual([]);
    // 借自己那一張表借不到東西。
    expect(
      validateItemDraftForm({ ...base, shortPoolMode: "fallback", fallbackTable: "legendary-weapons" }),
    ).toHaveLength(1);
  });
});

describe("每一格都有人話，而且沒有多餘的 (adminui-item-draft)", () => {
  it("★ schema 的每一個 itemDraft 欄位都在畫面上，順序表也對得起來", () => {
    cover(TAG);
    const schemaKeys = Object.keys(zItemDraftConfig.shape).sort();
    expect([...ITEM_DRAFT_FIELD_ORDER].sort(), "後台的欄位清單跟 schema 不一樣").toEqual(schemaKeys);
    expect(Object.keys(ITEM_DRAFT_LABELS).sort()).toEqual(schemaKeys);
  });

  it("★ 說明寫的是「它影響什麼」，不是複述欄位名", () => {
    cover(TAG);
    for (const field of ITEM_DRAFT_FIELD_ORDER) {
      const label = ITEM_DRAFT_LABELS[field];
      expect(label.zh.length, `${field} 沒有中文名`).toBeGreaterThan(1);
      // 一句「它影響什麼」寫不到 20 個字,幾乎一定是在複述欄位名。
      expect(label.note.length, `${field} 的說明太短,看起來像在複述欄位名`).toBeGreaterThan(20);
      expect(label.note, `${field} 的說明只是欄位名`).not.toBe(field);
    }
  });

  it("★ 三種模式都有選項，而且每一個都說了玩家會看到什麼", () => {
    cover(TAG);
    const optionValues = SHORT_POOL_MODE_OPTIONS.map((o) => o.value).sort();
    expect(optionValues).toEqual(["duplicate", "fallback", "short"]);
    // 出貨值排第一 —— 下拉選單的第一個是操作者最可能誤選的那一個。
    expect(SHORT_POOL_MODE_OPTIONS[0]!.value).toBe(SHIPPED_ITEM_DRAFT.shortPoolMode);
    for (const o of SHORT_POOL_MODE_OPTIONS) expect(o.note.length).toBeGreaterThan(10);
  });

  it("★ 已知獎池清單 = content/loot-tables 真的有的那些", () => {
    cover(TAG);
    const index = JSON.parse(readFileSync(LOOT_INDEX, "utf8")) as { entries: { id: string }[] };
    expect([...KNOWN_LOOT_TABLES].sort()).toEqual(index.entries.map((e) => e.id).sort());
  });
});

describe("存檔一定送整份文件 (adminui-item-draft)", () => {
  it("★ patchItemDraft 只換掉 itemDraft，其他區塊一個都不掉", () => {
    cover(TAG);
    const next = patchItemDraft(realDoc, { shortPoolMode: "duplicate", fallbackTable: "", maxDraws: 8 });
    expect(next.itemDraft).toEqual({ shortPoolMode: "duplicate", fallbackTable: "", maxDraws: 8 });
    // 逐個 key 比,不是「有幾個 key」—— 換掉一個區塊也會保持數量相同。
    for (const key of Object.keys(realDoc)) {
      if (key === "itemDraft") continue;
      expect(next[key], `存檔把 ${key} 弄丟了 —— 覆蓋層存的是整份文件`).toEqual(realDoc[key]);
    }
    // 而且補上去的那份仍然是一份合法的 arena-rules。
    expect(() => zConfigArenaRulesDoc.parse(next)).not.toThrow();
  });

  it("★ 讀不到的東西一律退回出貨政策，不是壞掉的空值", () => {
    cover(TAG);
    // 舊文件(GH#249 之前)沒有 itemDraft 區塊 —— 那代表出貨政策,不是缺陷。
    const legacy = { ...realDoc };
    delete (legacy as Record<string, unknown>).itemDraft;
    expect(extractItemDraft(legacy)).toEqual({ ...SHIPPED_ITEM_DRAFT });
    // schema 不對就回 null,而不是把別份 config 的欄位畫成抽卡規則。
    expect(extractItemDraft({ schema: "config.combat-env@1", itemDraft: {} })).toBeNull();
    expect(extractItemDraft(null)).toBeNull();
    expect(readOfferCount(null)).toBe(SHIPPED_OFFER_COUNT);
    expect(readOfferCount(realDoc)).toBe(SHIPPED_OFFER_COUNT);
  });

  it("★ 表單 → 文件 → 表單 是無損的，而且 changedFields 說得出改了哪幾格", () => {
    cover(TAG);
    const cfg = { shortPoolMode: "fallback" as const, fallbackTable: "quest-rewards", maxDraws: 128 };
    expect(itemDraftFromForm(formFromConfig(cfg))).toEqual(cfg);
    expect(changedFields(SHIPPED_ITEM_DRAFT)).toEqual([]);
    expect(changedFields(cfg).sort()).toEqual(["fallbackTable", "maxDraws", "shortPoolMode"]);
  });

  it("★ 摘要說的是玩家會看到什麼，包含「選了 fallback 卻沒填表」那個陷阱", () => {
    cover(TAG);
    expect(itemDraftSummary(SHIPPED_ITEM_DRAFT, 3)).toContain("3 張");
    expect(itemDraftSummary(SHIPPED_ITEM_DRAFT, 3)).toContain("短卡");
    expect(
      itemDraftSummary({ shortPoolMode: "fallback", fallbackTable: "", maxDraws: 64 }, 3),
      "選了借獎池但沒填表時，摘要必須說實話（實際上會發短卡）",
    ).toContain("實際上會發短卡");
    expect(
      itemDraftSummary({ shortPoolMode: "fallback", fallbackTable: "quest-rewards", maxDraws: 64 }, 3),
    ).toContain("quest-rewards");
    expect(itemDraftSummary({ shortPoolMode: "duplicate", fallbackTable: "", maxDraws: 64 }, 4)).toContain(
      "4 張",
    );
  });
});
