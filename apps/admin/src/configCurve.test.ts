/**
 * 斷點曲線後台編輯器的守衛 (GH#252) —— 兩層,而且第二層才是重點。
 *
 * 第一層(純函式)守的是「這張表填得對不對」。
 * 第二層(`configCurveSave.test.ts` 的形狀,直接寫在這裡)守的是
 * **「按下儲存之後,遊戲真的讀得到那條新曲線嗎」** —— 打真的輸入框、按真的按鈕、
 * 抓 `putOverlayDoc` 拿到的那個物件,再把**那個物件**餵進 sim 出貨的
 * `bodyScaleRulesFromDoc` + `attackRangeScaleFactor`。
 *
 * 沒有第二層的話,這一頁可以完整地自我一致地說謊:操作者填了 1.5、畫面顯示已
 * 儲存、重整之後還讀得回自己填的數字,而伺服器一輩子看不到(失敗形態 ②)。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 突變紀錄(真的跑過:改壞 → 紅 → 改回 → 綠)
 * ════════════════════════════════════════════════════════════════════════════
 *   · `ConfigDocPage.save()` 拿掉 `edits.set(spec.curve.path, curveVerdict.points)`
 *       → 「改一列 → 存檔 → sim 讀回新曲線」紅(PUT 出去的還是舊的 1.2)
 *   · `configCurve.ts` 的順序檢查(`cur < prev` 那一段)拿掉
 *       → 「順序反了會被擋下來」紅(points 變成非 null)
 *   · `configCurve.ts` 的 `cellIssue` 拿掉上界那一行(`n > col.max`)
 *       → 「把百分比當倍率填會被擋下來」紅(120 過關)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ConfigDocPage } from "./ui/ConfigDocPage";
import { specForPage } from "./configForms";
import { mount, textOf, type Harness } from "./testkit/headlessUi";
import {
  addCurveRow,
  curvePreviewRows,
  curveRowsFrom,
  removeCurveRow,
  setCurveCell,
  validateCurve,
  type ConfigCurveSpec,
} from "./configCurve";
// 真的消費端 —— 相對 import 是刻意的:這就是 game-server 開場灌 world 用的那一支。
import {
  attackRangeScaleFactor,
  bodyScaleRulesFromDoc,
} from "../../../packages/shared/src/sim/bodyScale";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SPEC = specForPage("bodyScale")!;
const CURVE: ConfigCurveSpec = SPEC.curve!;

function shippedDoc(): Record<string, unknown> {
  return JSON.parse(readFileSync(`${REPO}content/config/body-scale.json`, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("斷點曲線:表格邏輯 (adminui-config-curve)", () => {
  it("出貨文件讀出三列,而且順序就是文件裡的順序", () => {
    cover("adminui-config-curve");
    expect(curveRowsFrom(shippedDoc(), CURVE)).toEqual([
      { x: "1", y: "1" },
      { x: "2", y: "1.2" },
      { x: "3", y: "1.3" },
    ]);
  });

  it("加一列是**留白**的 —— 自動填一個值等於替操作者做了一個決定", () => {
    cover("adminui-config-curve");
    const rows = addCurveRow(curveRowsFrom(shippedDoc(), CURVE));
    expect(rows.length).toBe(4);
    expect(rows[3]).toEqual({ x: "", y: "" });
    // 留白的一列不合法,所以它擋著儲存直到有人填它
    expect(validateCurve(rows, CURVE).points).toBeNull();
  });

  it("刪掉的是指定那一列,不是最後一列", () => {
    cover("adminui-config-curve");
    const rows = removeCurveRow(curveRowsFrom(shippedDoc(), CURVE), 1);
    expect(rows).toEqual([
      { x: "1", y: "1" },
      { x: "3", y: "1.3" },
    ]);
  });

  it("順序反了 / 重複的體型被擋下來(重複會讓內插除以 0)", () => {
    cover("adminui-config-curve");
    const reversed = validateCurve(
      [
        { x: "3", y: "1.3" },
        { x: "1", y: "1" },
      ],
      CURVE,
    );
    expect(reversed.points).toBeNull();
    expect(reversed.rows[1]!.x).toMatch(/由小到大/);

    const dup = validateCurve(
      [
        { x: "2", y: "1.2" },
        { x: "2", y: "1.3" },
      ],
      CURVE,
    );
    expect(dup.points).toBeNull();
    expect(dup.rows[1]!.x).toMatch(/重複|除以 0/);
  });

  it("上界和下界一樣重要 —— 把百分比當倍率填(120)過不了 (#277)", () => {
    cover("adminui-config-curve");
    const v = validateCurve(
      [
        { x: "1", y: "1" },
        { x: "2", y: "120" },
      ],
      CURVE,
    );
    expect(v.points).toBeNull();
    expect(v.rows[1]!.y).toMatch(/不可以大於 3/);
    // 下界也擋
    expect(validateCurve([{ x: "1", y: "0" }, { x: "2", y: "1.2" }], CURVE).rows[0]!.y).toMatch(
      /不可以小於 0\.1/,
    );
    // 體型上界 = 小怪波 boss.sizeMult 的出貨值
    expect(validateCurve([{ x: "1", y: "1" }, { x: "50", y: "1.2" }], CURVE).rows[1]!.x).toMatch(
      /不可以大於 10/,
    );
  });

  it("只剩一列會被擋 —— 那在 sim 那端會整條退回出貨曲線(＝存了等於沒存)", () => {
    cover("adminui-config-curve");
    const v = validateCurve([{ x: "1", y: "1" }], CURVE);
    expect(v.points).toBeNull();
    expect(v.table).toMatch(/至少要 2 個斷點/);
  });

  it("空白 / 非數字被擋,而且理由是中文的一句話", () => {
    cover("adminui-config-curve");
    const v = validateCurve(
      [
        { x: "", y: "1" },
        { x: "2", y: "abc" },
      ],
      CURVE,
    );
    expect(v.rows[0]!.x).toMatch(/不可以是空的/);
    expect(v.rows[1]!.y).toMatch(/要填一個數字/);
  });

  it("預覽走的是 **sim 出貨的那一支函式**,不是後台自己內插一次", () => {
    cover("adminui-config-curve");
    const points = validateCurve(curveRowsFrom(shippedDoc(), CURVE), CURVE).points!;
    const rows = curvePreviewRows(points, CURVE, true);
    const at = (x: number): number => rows.find((r) => r.x === x)!.mult;
    // 每一個都和 attackRangeScaleFactor 逐位元相同 —— 抄一份公式進後台就會在這裡裂開
    for (const r of rows) {
      expect(r.mult).toBe(
        attackRangeScaleFactor(r.x, { enabled: true, attackRangeCurve: points.map(toPoint) }),
      );
    }
    expect(at(0.6)).toBeCloseTo(1, 10); // 夾住
    expect(at(2)).toBeCloseTo(1.2, 10); // 斷點上
    expect(at(2.5)).toBeCloseTo(1.25, 10); // 內插
    expect(at(8)).toBeCloseTo(1.3, 10); // 夾住
  });

  it("總開關關掉時,預覽誠實地全部顯示 1.00×", () => {
    cover("adminui-config-curve");
    const points = validateCurve(curveRowsFrom(shippedDoc(), CURVE), CURVE).points!;
    for (const r of curvePreviewRows(points, CURVE, false)) expect(r.mult).toBe(1);
  });
});

function toPoint(p: { [k: string]: number }): { bodyScale: number; rangeMult: number } {
  return { bodyScale: p["bodyScale"]!, rangeMult: p["rangeMult"]! };
}

// ───────────────────────────────────────────────── 存下去 → sim 讀得到 ─────

/**
 * ⚠️ `react` 必須被換成 headless 版本,否則 `useState` 在 node 底下是 null。
 * 這一段和 `configFormsSave.test.ts` 完全一樣 —— 那是**刻意**的重複:harness 用
 * 模組層狀態,兩支測試共用一份 mock 反而會互相污染。
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  const { readFileSync: rf } = await import("node:fs");
  const { fileURLToPath: f2p } = await import("node:url");
  const doc = JSON.parse(
    rf(f2p(new URL("../../../content/config/body-scale.json", import.meta.url)), "utf8"),
  ) as unknown;
  return {
    ...actual,
    getOverlayDoc: async (): Promise<unknown> => null,
    getShippedDoc: async (): Promise<{ present: boolean; hash: string; doc: unknown }> => ({
      present: true,
      hash: "deadbeef",
      doc,
    }),
    putOverlayDoc: async (
      collection: string,
      id: string,
      d: Record<string, unknown>,
    ): Promise<{ generation: number }> => {
      bus.puts.push({ collection, id, doc: JSON.parse(JSON.stringify(d)) as Record<string, unknown> });
      return { generation: 7 };
    },
  };
});

/** 儲存鈕現在按不按得下去。`click` 對停用的按鈕會丟例外,所以要先問。 */
function saveEnabled(h: Harness): boolean {
  const btn = h.hosts().find((n) => n.type === "button" && textOf(n.children).trim() === "儲存 Save");
  if (!btn) throw new Error("頁面上沒有儲存鈕");
  return btn.props["disabled"] !== true;
}

async function mountPage(): Promise<Harness> {
  const h = mount(createElement(ConfigDocPage, { spec: SPEC }));
  await h.flush();
  return h;
}

describe("斷點曲線:存下去之後,sim 真的讀得到 (adminui-config-curve-save)", () => {
  beforeEach(() => {
    bus.puts.length = 0;
  });

  it("改一列 → 儲存 → PUT 出去的整份文件,經 sim 自己的讀取器解析出新曲線", async () => {
    cover("adminui-config-curve-save");
    const h = await mountPage();
    // 出貨的三列都畫出來了(不是一格 JSON 文字框)
    expect(h.field("curve.0.x").props["value"]).toBe("1");
    expect(h.field("curve.1.y").props["value"]).toBe("1.2");

    // owner 把「2 倍體型」那一格從 1.2 調成 1.5
    h.enter(h.field("curve.1.y"), "1.5");
    await h.flush();
    h.click("儲存 Save");
    await h.flush();

    expect(bus.puts.length).toBe(1);
    const { collection, id: docId, doc } = bus.puts[0]!;
    expect(collection).toBe("config");
    expect(docId).toBe("body-scale");

    // ⚠️ 這一段是這支測試存在的理由:把 PUT 出去的那個物件餵進**遊戲真的會用的**
    // 讀取器,而不是自己讀 doc.attackRangeCurve[1].rangeMult。
    const rules = bodyScaleRulesFromDoc(doc);
    expect(attackRangeScaleFactor(2, rules)).toBeCloseTo(1.5, 10);
    expect(attackRangeScaleFactor(1.5, rules)).toBeCloseTo(1.25, 10); // 內插也跟著動
    expect(attackRangeScaleFactor(3, rules)).toBeCloseTo(1.3, 10); // 沒動到的那一列不變

    // 送出的是**整份**文件 —— id / schema / note 一個都沒掉
    const d = doc as Record<string, unknown>;
    expect(d["id"]).toBe("body-scale");
    expect(d["schema"]).toBe("config.body-scale@1");
    expect(typeof d["note"]).toBe("string");
    expect(d["enabled"]).toBe(true);
  });

  it("加一列(殭屍王那一格)→ 儲存 → 表外的體型不再被夾住", async () => {
    cover("adminui-config-curve-save");
    const h = await mountPage();
    // 加之前:體型 8 被夾在最後一列
    expect(attackRangeScaleFactor(8, bodyScaleRulesFromDoc(shippedDoc()))).toBeCloseTo(1.3, 10);

    h.press(h.field("curve.add"));
    await h.flush();
    h.enter(h.field("curve.3.x"), "8");
    h.enter(h.field("curve.3.y"), "1.5");
    await h.flush();
    h.click("儲存 Save");
    await h.flush();

    const doc = bus.puts[0]!.doc;
    const rules = bodyScaleRulesFromDoc(doc);
    expect(rules.attackRangeCurve.length).toBe(4);
    expect(attackRangeScaleFactor(8, rules)).toBeCloseTo(1.5, 10);
    expect(attackRangeScaleFactor(5.5, rules)).toBeCloseTo(1.4, 10); // 3↔8 的中點
  });

  it("表填錯的時候儲存是關的,而且畫面上寫出理由(不是安靜地送半張表)", async () => {
    cover("adminui-config-curve-save");
    const h = await mountPage();
    expect(saveEnabled(h)).toBe(false); // 還沒改任何東西:沒有 dirty 就不能存
    h.enter(h.field("curve.1.y"), "120"); // #277 的形狀
    await h.flush();
    // 改了(dirty),但表不合法 —— 儲存仍然是關的,而且理由畫在格子旁邊
    expect(saveEnabled(h)).toBe(false);
    expect(h.text()).toContain("不可以大於 3");
    expect(bus.puts.length).toBe(0);
    // 改回合法之後才打得開 —— 否則上面那條斷言對「永遠關著的鈕」也會過(失敗形態 ④)
    h.enter(h.field("curve.1.y"), "1.25");
    await h.flush();
    expect(saveEnabled(h)).toBe(true);
  });

  it("順序被打亂時儲存是關的 —— 重複的體型會讓內插除以 0", async () => {
    cover("adminui-config-curve-save");
    const h = await mountPage();
    h.enter(h.field("curve.2.x"), "1.5"); // 1 / 2 / 1.5 → 第三列比第二列小
    await h.flush();
    expect(saveEnabled(h)).toBe(false);
    expect(h.text()).toContain("由小到大");
    expect(bus.puts.length).toBe(0);
    h.enter(h.field("curve.2.x"), "4"); // 排好就打得開
    await h.flush();
    expect(saveEnabled(h)).toBe(true);
  });

  it("只改總開關、沒碰曲線 → 送出的曲線和基底逐位元相同", async () => {
    cover("adminui-config-curve-save");
    const h = await mountPage();
    h.enter(h.field("enabled"), "false");
    await h.flush();
    h.click("儲存 Save");
    await h.flush();
    const doc = bus.puts[0]!.doc;
    expect(doc["enabled"]).toBe(false);
    expect(doc["attackRangeCurve"]).toEqual(shippedDoc()["attackRangeCurve"]);
  });
});
