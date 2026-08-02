/**
 * 對照表編輯器的**行為**守衛 —— 「表畫得出來」不等於「改得動而且改得對」。
 *
 * 這一支釘的三件事，每一件都對應一個在這份文件上真的會發生的失敗：
 *
 *  · **選項清單和 Zod enum drift** → 後台的四個分類是手寫的第二份「合法值有哪些」。
 *    schema 哪天多一類或改字，後台會很有自信地畫出一個 PUT 會拒絕的選項。所以這裡
 *    直接拿 `zItemCardCategory.options` 比對，而不是再抄一份字串。
 *
 *  · **鍵前後多一個空白** → `itemCardText.parseItemCard` 先把行 `trim()` 再
 *    `Set.has()`，config 這一側**不 trim**。所以 `" 效能"` 這一列永遠不會命中，而
 *    畫面上的症狀是「解說區沒有變暗」—— 沒有錯誤、沒有紅字、只是不對。
 *
 *  · **重複的鍵** → `recordEnum` 存進 JSON 之後後面那一列覆蓋前面那一列，操作者
 *    以為自己設了兩條規則，實際上只有一條，而兩列都還在畫面上。
 *
 * ⚠️ 基底用的是 `content/config/item-card.json` **本人**，不是捏一份三列的假表 ——
 * 捏一份的話「32 列一列都不能掉」那條就是空的（失敗形態 ⑤）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { zConfigItemCardDoc, zItemCardCategory } from "@ggd/shared/content";
import { specForPage } from "./configForms";
import {
  addTableRow,
  emptyTableRow,
  removeTableRow,
  setTableCell,
  tableDirty,
  tableRowsFrom,
  validateTable,
  type ConfigTableSpec,
} from "./configTables";

const TAG = "adminui-config-tables";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

function shippedItemCard(): Record<string, unknown> {
  return JSON.parse(readFileSync(`${REPO}content/config/item-card.json`, "utf8")) as Record<
    string,
    unknown
  >;
}

const SPEC = specForPage("itemCard")!;
function table(path: string): ConfigTableSpec {
  const t = (SPEC.tables ?? []).find((x) => x.path === path);
  if (!t) throw new Error(`item-card 沒有宣告 ${path} 這張表`);
  return t;
}

describe("道具卡片的對照表 (adminui-config-tables)", () => {
  it("出貨的 32 列標記讀進來、驗過、寫回去，逐鍵逐值相同", () => {
    cover(TAG);
    const doc = shippedItemCard();
    const spec = table("markers");
    const rows = tableRowsFrom(doc, spec);
    // 32 是出貨表的長度。寫死它是刻意的：這條守衛要擋的正是「讀進來少了幾列」，
    // 而 `rows.length > 0` 對「只讀到一列」也會過。
    expect(rows).toHaveLength(32);
    expect(rows[0]).toEqual({ key: "神速", value: "stat" });
    expect(rows.find((r) => r.key === "On-Hit")?.value).toBe("active");
    // `On-Hit` 與 `OnHit` 是兩列，因為 owner 的原稿兩種都寫過。
    expect(rows.find((r) => r.key === "OnHit")?.value).toBe("active");

    const verdict = validateTable(rows, spec);
    expect(verdict.table).toBeNull();
    expect(verdict.value).toEqual(doc["markers"]);
    // 順序也要一樣 —— 出貨表是按分類分組寫的，排序會把那個分組洗掉。
    expect(Object.keys(verdict.value as object)).toEqual(Object.keys(doc["markers"] as object));
  });

  it("四個選項就是 schema 的四個 enum 值 —— 兩份清單不准 drift", () => {
    cover(TAG);
    const spec = table("markers");
    expect(spec.value!.options.map((o) => o.value)).toEqual([...zItemCardCategory.options]);
  });

  it("表吐出來的東西過得了真的 schema；清單外的值過不了", () => {
    cover(TAG);
    const doc = shippedItemCard();
    const spec = table("markers");
    const rows = setTableCell(tableRowsFrom(doc, spec), 4, "value", "passive");
    const verdict = validateTable(rows, spec);
    expect(verdict.value).not.toBeNull();
    expect(zConfigItemCardDoc.safeParse({ ...doc, markers: verdict.value }).success).toBe(true);

    // 反向：一個不在清單上的分類，schema 真的會拒絕。少了這一條，上面那條對
    // 「選項清單根本沒被用到」的實作也會過。
    expect(
      zConfigItemCardDoc.safeParse({
        ...doc,
        markers: { ...(doc["markers"] as object), "On-Hit": "buff" },
      }).success,
    ).toBe(false);
    // 而後台自己也擋得下來（不是等 PUT 才炸）。
    const bad = validateTable(setTableCell(rows, 4, "value", "buff"), spec);
    expect(bad.value).toBeNull();
    expect(bad.rows[4]?.value).toContain("清單");
  });

  it("空白鍵 / 前後有空白 / 太長 / 重複，四種都擋得下來而且說得出理由", () => {
    cover(TAG);
    const spec = table("markers");
    const base = tableRowsFrom(shippedItemCard(), spec);

    const empty = validateTable(setTableCell(base, 0, "key", ""), spec);
    expect(empty.value).toBeNull();
    expect(empty.rows[0]?.key).toContain("不可以是空的");

    // ⚠️ 這一條是這張表最重要的一格：`" 神速"` 存得進 JSON、過得了 Zod
    // （`z.string().min(1)`），而它在遊戲裡永遠不會命中任何一個標記。
    const padded = validateTable(setTableCell(base, 0, "key", " 神速"), spec);
    expect(padded.value).toBeNull();
    expect(padded.rows[0]?.key).toContain("永遠不會命中");
    expect(zConfigItemCardDoc.safeParse({ ...shippedItemCard(), markers: { " 神速": "stat" } }).success).toBe(
      true,
    );

    const long = validateTable(setTableCell(base, 0, "key", "字".repeat(spec.key.maxLen + 1)), spec);
    expect(long.value).toBeNull();
    expect(long.rows[0]?.key).toContain(`最多 ${spec.key.maxLen}`);

    const dup = validateTable(setTableCell(base, 1, "key", base[0]!.key), spec);
    expect(dup.value).toBeNull();
    expect(dup.rows[1]?.key).toContain("第 1 列重複");
    // 沒有這一條的話，兩列同名會安靜地變成一列 —— 這裡證明「安靜」真的會發生。
    const collapsed = { [base[0]!.key]: base[0]!.value, [base[0]!.key]: base[1]!.value };
    expect(Object.keys(collapsed)).toHaveLength(1);
  });

  it("markers 的下限是 1 列 —— 空表在客戶端會整張退回出貨表", () => {
    cover(TAG);
    const spec = table("markers");
    expect(spec.minRows).toBe(1);
    const verdict = validateTable([], spec);
    expect(verdict.value).toBeNull();
    expect(verdict.table).toContain("至少要 1 列");
  });

  it("加一列時值欄預填第一個選項，不是留白", () => {
    cover(TAG);
    const spec = table("markers");
    const row = emptyTableRow(spec);
    expect(row.key).toBe("");
    expect(row.value).toBe("stat");
    // 留白的話操作者填好鍵、按儲存，會被自己的表擋下來而看不出少填了什麼。
    expect(validateTable([{ key: "新標記", value: row.value }], spec).value).toEqual({
      新標記: "stat",
    });
    const grown = addTableRow(tableRowsFrom(shippedItemCard(), spec), spec);
    expect(grown).toHaveLength(33);
    expect(removeTableRow(grown, 32)).toHaveLength(32);
  });

  it("純字串表（段落標題）進出都是一個陣列", () => {
    cover(TAG);
    const doc = shippedItemCard();
    const spec = table("loreHeadings");
    expect(spec.value).toBeUndefined();
    const rows = tableRowsFrom(doc, spec);
    expect(rows.map((r) => r.key)).toEqual(["解說", "歷史"]);
    const verdict = validateTable(rows, spec);
    expect(verdict.value).toEqual(["解說", "歷史"]);
    expect(zConfigItemCardDoc.safeParse({ ...doc, loreHeadings: verdict.value }).success).toBe(true);
    // 這一族允許清空（`acceptStrings` 收得下空陣列，而「沒有解說標題」是一個
    // 合法的決定：整份文案都算效果）。
    expect(spec.minRows).toBe(0);
    expect(validateTable([], spec).value).toEqual([]);
  });

  it("讀不到的路徑回空陣列，而不是畫一張假的表", () => {
    cover(TAG);
    const spec = table("markers");
    expect(tableRowsFrom(null, spec)).toEqual([]);
    expect(tableRowsFrom({}, spec)).toEqual([]);
    expect(tableRowsFrom({ markers: [] }, spec)).toEqual([]);
    expect(tableRowsFrom({ markers: { a: 1 } }, spec)).toEqual([]);
    expect(tableRowsFrom({ loreHeadings: {} }, table("loreHeadings"))).toEqual([]);
  });

  it("dirty 認得「只換了順序」—— 那也是一次真的改動", () => {
    cover(TAG);
    const doc = shippedItemCard();
    const spec = table("markers");
    const rows = tableRowsFrom(doc, spec);
    expect(tableDirty(rows, doc, spec)).toBe(false);
    expect(tableDirty(null, doc, spec)).toBe(false);
    const swapped = [rows[1]!, rows[0]!, ...rows.slice(2)];
    expect(tableDirty(swapped, doc, spec)).toBe(true);
    expect(tableDirty(setTableCell(rows, 0, "value", "debuff"), doc, spec)).toBe(true);
  });
});
