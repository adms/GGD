/**
 * 道具卡片排版：在**真的頁面**上把 `[普通攻擊時]` 從主動改成被動 → 送出去的那份文件
 * 餵進**遊戲真的在用的**那支解析器 → 卡片上那個 chip 真的換了顏色。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼不能只測 `configTables.ts`
 * ════════════════════════════════════════════════════════════════════════════
 * `configTables.test.ts` 守的是純函式：它一條都不會紅，即使這張表根本沒被畫進
 * `ConfigDocPage`、或者儲存時沒有把 `markers` 放進 PUT 的那份文件。那正是這個
 * repo 的失敗形態 ②（算出來了但從沒送到）與 ③（可以從渲染樹刪掉但測試全綠）。
 *
 * 所以這一支做的是三件事，缺一不可：
 *   1. `mount(<ConfigDocPage spec={item-card}/>)`，打進**真的下拉選單**、按**真的
 *      按鈕**（跑的是頁面自己的 onChange / onClick）；
 *   2. 斷言交給 `putOverlayDoc` 的那個物件；
 *   3. 把**那個物件**餵進 `applyItemCardDoc`（客戶端 ContentDb 呼叫的那一支）再問
 *      `tokenizeCardLine`（四個渲染點都用的那一支）：`[普通攻擊時]` 現在是什麼顏色。
 *
 * 第 3 步是唯一擋得住失敗形態 ⑤（被測的不是出貨的那個）的東西。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { tokenizeCardLine, parseItemCard } from "@ggd/shared/content";
import { ConfigDocPage } from "./ui/ConfigDocPage";
import { specForPage } from "./configForms";
import { mount, textOf, type Harness } from "./testkit/headlessUi";

// ── 真的消費端。相對路徑 import 是刻意的：這就是遊戲載入的那一支模組本人。
import {
  applyItemCardDoc,
  getItemCardConfig,
  itemCardCategoryColor,
} from "../../client/src/ui/components/itemCardTheme";

const TAG = "adminui-item-card-save";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

function shippedDoc(docId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`${REPO}content/config/${docId}.json`, "utf8")) as Record<
    string,
    unknown
  >;
}

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  overlayDoc: null as unknown,
  shipped: { present: false, hash: "", doc: null as unknown },
  generation: 0,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getOverlayDoc: async (): Promise<unknown> => bus.overlayDoc,
    getShippedDoc: async (): Promise<{ present: boolean; hash: string; doc: unknown }> =>
      bus.shipped,
    putOverlayDoc: async (
      collection: string,
      id: string,
      doc: Record<string, unknown>,
    ): Promise<{ generation: number }> => {
      bus.puts.push({
        collection,
        id,
        doc: JSON.parse(JSON.stringify(doc)) as Record<string, unknown>,
      });
      return { generation: ++bus.generation };
    },
  };
});

const SAVE = "儲存 Save";

beforeEach(() => {
  bus.puts.length = 0;
  bus.generation = 0;
  bus.overlayDoc = null;
  bus.shipped = { present: true, hash: "deadbeef", doc: shippedDoc("item-card") };
  applyItemCardDoc(null); // 回到出貨預設，免得測試之間互相污染
});

async function open(): Promise<Harness> {
  const spec = specForPage("itemCard")!;
  const h = mount(createElement(ConfigDocPage, { spec }));
  await h.flush();
  return h;
}

function saveEnabled(h: Harness): boolean {
  const btn = h.hosts().find((n) => n.type === "button" && textOf(n.children).trim() === SAVE);
  if (!btn) throw new Error("頁面上沒有儲存鈕");
  return btn.props["disabled"] !== true;
}

/** `[普通攻擊時]` 這個 chip 現在被畫成哪一類。 */
function onHitCategory(): string {
  const tokens = tokenizeCardLine("[普通攻擊時] 攻擊力+87", getItemCardConfig());
  const tag = tokens.find((t) => t.kind === "tag");
  if (!tag || tag.kind !== "tag") throw new Error("這一行沒有解析出任何標記");
  return tag.category;
}

describe("道具卡片排版頁 (adminui-item-card-save)", () => {
  it("出貨的每一列標記都真的被畫出來 —— 這一頁不是只有六格顏色", async () => {
    cover(TAG);
    const h = await open();
    // 每一列都要有一個鍵輸入框 + 一個分類下拉。少了它們，這一頁就退回
    // 「六格顏色」，而 owner 那天要改的東西一格都改不到。
    // ⚠️ 列數**從出貨文件推導**：寫死 32 的那一版在加了【淨化】之後就會紅，
    // 而且訊息會指向「這一頁壞了」，真相只是表變長了（CLAUDE.md 第四個住處）。
    const n = Object.keys(shippedDoc("item-card")["markers"] as object).length;
    expect(n).toBeGreaterThan(10); // 夾具前提：出貨表不是空的
    expect(h.fieldOrNull("table.markers.0.key")).not.toBeNull();
    expect(h.fieldOrNull(`table.markers.${n - 1}.key`)).not.toBeNull();
    expect(h.fieldOrNull(`table.markers.${n}.key`)).toBeNull();
    // ⚠️ 列的**位置**也從出貨文件推導。寫死「第 4 列是 On-Hit」的那一版在
    //    owner 2026-08-10 把兩個英文拼法併成一列 [普通攻擊時] 之後就會紅，
    //    而訊息會指向「這一頁壞了」——真相只是表少了一列（同上，第四個住處）。
    const keys = Object.keys(shippedDoc("item-card")["markers"] as object);
    const probe = keys.indexOf("普通攻擊時");
    expect(probe, "出貨表上找不到 [普通攻擊時] —— 這一條沒有東西可驗").toBeGreaterThanOrEqual(0);
    expect(h.field(`table.markers.${probe}.key`).props["value"]).toBe("普通攻擊時");
    expect(h.field(`table.markers.${probe}.value`).props["value"]).toBe("active");
    // 另外三張表也在（純字串那一族）。
    expect(h.field("table.loreHeadings.0.key").props["value"]).toBe("解說");
    expect(h.field("table.efficacyHeadings.0.key").props["value"]).toBe("效能");
    expect(h.fieldOrNull("table.inlineValueMarkers.0.key")).not.toBeNull();
  });

  it("把 [普通攻擊時] 改成被動 → 送出的文件裡是 passive，而且卡片上的顏色跟著換", async () => {
    cover(TAG);
    // 改之前：出貨表把它畫成主動（琥珀）。
    applyItemCardDoc(shippedDoc("item-card") as never);
    expect(onHitCategory()).toBe("active");

    const h = await open();
    const probe = Object.keys(shippedDoc("item-card")["markers"] as object).indexOf("普通攻擊時");
    expect(probe, "出貨表上找不到 [普通攻擊時]").toBeGreaterThanOrEqual(0);
    h.type(`table.markers.${probe}.value`, "passive");
    expect(saveEnabled(h)).toBe(true);
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(1);
    const doc = bus.puts[0]!.doc;
    expect(bus.puts[0]!.collection).toBe("config");
    expect(bus.puts[0]!.id).toBe("item-card");
    expect(doc["schema"]).toBe("config.item-card@1");
    expect((doc["markers"] as Record<string, string>)["普通攻擊時"]).toBe("passive");
    // 其餘每一列都沒掉（整批取代，所以掉了就真的掉了）。
    // ⚠️ 長度從出貨文件推導,不抄字面值 —— 這一頁的正確性是「改了一列、
    // 其他列原封不動」,跟表有幾列無關(CLAUDE.md：驗機制不驗數字)。
    expect(Object.keys(doc["markers"] as object)).toHaveLength(
      Object.keys(shippedDoc("item-card")["markers"] as object).length,
    );
    // ⚠️ 只有被改的那一列變了，隔壁列原封不動 —— 這是「整批取代」最容易壞的地方。
    //    2026-08-10 之前這裡驗的是 `OnHit`（沒有連字號的那個拼法），owner 把兩個
    //    英文拼法併成 [普通攻擊時] 之後那一列不存在了，改成驗它的鄰居。
    const neighbourKey = Object.keys(shippedDoc("item-card")["markers"] as object)[probe + 1]!;
    expect((doc["markers"] as Record<string, string>)[neighbourKey]).toBe(
      (shippedDoc("item-card")["markers"] as Record<string, string>)[neighbourKey],
    );

    // ── 送出去的那份文件，餵進客戶端真的在用的那一支。
    applyItemCardDoc(doc as never);
    expect(onHitCategory()).toBe("passive");
    expect(itemCardCategoryColor("passive")).toBe("#A9B6FF");
    // 顏色是真的換了，不只是分類字串換了。
    const tokens = tokenizeCardLine("[普通攻擊時] 攻擊力+87", getItemCardConfig());
    const tag = tokens.find((t) => t.kind === "tag")!;
    expect(itemCardCategoryColor(tag.kind === "tag" ? tag.category : "stat")).toBe("#A9B6FF");
  });

  it("刪掉一列 → 那個標記變成「沒登記過」的那一類，其他列不受影響", async () => {
    cover(TAG);
    const h = await open();
    h.click("刪除"); // 第一列（神速）
    h.click(SAVE);
    await h.flush();

    const doc = bus.puts[0]!.doc;
    expect(Object.keys(doc["markers"] as object)).toHaveLength(
      Object.keys(shippedDoc("item-card")["markers"] as object).length - 1,
    );
    expect((doc["markers"] as Record<string, string>)["神速"]).toBeUndefined();

    applyItemCardDoc(doc as never);
    const tokens = tokenizeCardLine("[神速] [閃避]", getItemCardConfig());
    const tags = tokens.filter((t) => t.kind === "tag");
    // 刪掉的那一個落到 unknownCategory（出貨值 passive），沒刪的那個還是 stat。
    expect(tags[0]!.kind === "tag" && tags[0]!.category).toBe("passive");
    expect(tags[1]!.kind === "tag" && tags[1]!.category).toBe("stat");
  });

  it("鍵前後多一個空白 → 存不出去，而且畫面上寫出「永遠不會命中」", async () => {
    cover(TAG);
    const h = await open();
    h.type("table.markers.0.key", " 神速");
    expect(saveEnabled(h)).toBe(false);
    expect(h.text()).toContain("永遠不會命中");
    expect(bus.puts).toHaveLength(0);
    // 改回合法值 → 又能存了（錯誤狀態不是單向門）。
    h.type("table.markers.0.key", "神速快跑");
    expect(saveEnabled(h)).toBe(true);
  });

  it("改一個顏色 → 送出的是六位十六進位，而且客戶端真的收下它", async () => {
    cover(TAG);
    const h = await open();
    h.type("numberColor", "#00FF88");
    h.click(SAVE);
    await h.flush();

    const doc = bus.puts[0]!.doc;
    expect(doc["numberColor"]).toBe("#00FF88");
    applyItemCardDoc(doc as never);
    expect(getItemCardConfig().numberColor).toBe("#00FF88");
    // ⚠️ 這一頁不編輯 note，但儲存時照樣帶著走（owner 寫給下一個人的說明）。
    expect(typeof doc["note"]).toBe("string");
  });

  it("顏色寫成中文 → 擋在後台，理由是中文的一句話", async () => {
    cover(TAG);
    const h = await open();
    h.type("categories.debuff.color", "紅色");
    expect(saveEnabled(h)).toBe(false);
    expect(h.text()).toContain("#rrggbb");
    expect(bus.puts).toHaveLength(0);
  });

  it("解說標題那張表少一列 → 那一段真的不再被當成解說", async () => {
    cover(TAG);
    const h = await open();
    // `歷史` 是第二列（狂暴軒轅劍用它代替 `解說`）。
    expect(h.field("table.loreHeadings.1.key").props["value"]).toBe("歷史");
    h.press(h.field("table.loreHeadings.remove.1"));
    h.click(SAVE);
    await h.flush();

    const doc = bus.puts[0]!.doc;
    expect(doc["loreHeadings"]).toEqual(["解說"]);

    applyItemCardDoc(doc as never);
    const card = parseItemCard("傳說\n效能\n攻擊力+87\n歷史\n這是一段身世", getItemCardConfig());
    // 少了那一列，`歷史` 不再開解說區 —— 那一行變成效果區的一行內容。
    expect(card.loreHeading).toBeNull();
    expect(card.lore).toEqual([]);
    expect(card.efficacy.map((l) => l.tokens.map((t) => t.text).join(""))).toContain("歷史");
  });
});
