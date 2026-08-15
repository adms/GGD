/**
 * 屬性上限 — WHAT THE PAGE ACTUALLY SENDS (GH#286).
 *
 * WHY THIS FILE EXISTS. `statCaps.test.ts` guards the pure functions and the
 * first paint; neither can tell you what lands in the durable overlay when the
 * owner presses 儲存. The mutation that motivated this file:
 *
 *     putOverlayDoc(…, capsDocFor(tableToSave()))
 *   → putOverlayDoc(…, capsDocFor(setCap(caps ?? {}, thisRow, …)))
 *
 * — the owner edits 攻速, presses 儲存, and the overlay receives a document with
 * ONLY that row. Every other stat then has no key, `capFor` falls back to
 * `STAT_CLAMPS` with `unlocked === base`, and their unlock is silently OFF
 * forever. The page reports 「✓ 已寫入耐久覆蓋層」 either way, and the whole
 * console suite stayed green.
 *
 * So this file DRIVES the page: types into the real inputs, presses the real
 * button, and asserts on the object handed to `putOverlayDoc` — then feeds that
 * object back through the SIM's own `statCapsFromDoc`, which is the only thing
 * that proves the payload is a table the shard can actually use.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat, STAT_CLAMPS } from "@ggd/shared/sim/stats/statTypes";
import { effectiveCap, statCapsFromDoc, DEFAULT_STAT_CAPS, capFor } from "@ggd/shared/sim/statCaps";
import { StatCapsPage } from "./ui/StatCapsPage";
import { CAPS_DOC_ID, CAPS_SCHEMA } from "./statCaps";
import { mount } from "./testkit/headlessUi";

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  putRejects: false,
  overlayDoc: null as unknown,
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
    getShippedDoc: async (): Promise<{ present: boolean; hash: string; doc: unknown }> => ({
      present: false,
      hash: "",
      doc: null,
    }),
    putOverlayDoc: async (
      collection: string,
      id: string,
      doc: Record<string, unknown>,
    ): Promise<{ generation: number }> => {
      if (bus.putRejects) throw new Error("平台拒絕了這次寫入");
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
  bus.putRejects = false;
  bus.generation = 0;
  bus.overlayDoc = null;
});

async function open(): Promise<ReturnType<typeof mount>> {
  const h = mount(createElement(StatCapsPage));
  await h.flush();
  return h;
}

describe("屬性上限 儲存送出的東西 (adminui-stat-caps-save)", () => {
  it("改一列 → 送出的是**整張表**,其他屬性的解鎖沒有被關掉", async () => {
    cover("adminui-stat-caps-save");
    const h = await open();
    h.type("as.base", "5");
    h.type("as.unlocked", "12");
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(1);
    const doc = bus.puts[0]!.doc;
    expect(bus.puts[0]!.id).toBe(CAPS_DOC_ID);
    expect(doc.schema).toBe(CAPS_SCHEMA);

    // 送出去的表餵回 SIM 自己的讀取器 —— 這才是「shard 真的用得了」的證明。
    const table = statCapsFromDoc(doc);
    expect(effectiveCap(table, Stat.AttackSpeed, 0)).toBe(5);
    expect(effectiveCap(table, Stat.AttackSpeed, 999)).toBe(12);
    // ⚠️ 沒被碰過的屬性仍然在文件裡,而且維持它們原本的上限。
    // 「只寫這一列」的實作會讓下面兩行的 key 整個消失。
    const caps = doc.caps as Record<string, unknown>;
    expect(Object.keys(caps)).toContain(Stat.MoveSpeed);
    expect(Object.keys(caps)).toContain(Stat.CooldownReduction);
    // ⛔ 不抄字面值：移速自 2026-08-12 起有自己的一格（owner：「上限是 10」），
    //    生效的上限來自出貨表而不是 `STAT_CLAMPS` 的上界。
    expect(effectiveCap(table, Stat.MoveSpeed, 0)).toBe(
      capFor(DEFAULT_STAT_CAPS, Stat.MoveSpeed).base,
    );
    // ⚠️ 從 STAT_CLAMPS 推,不抄 0.45 —— owner 2026-08-10 把 CDR 上限抬到 0.5
    //    （仙后座「CD 時間再減少 50%」）。這一條要守的是「沒有被這次存檔關掉」,
    //    不是那個數字本身。
    expect(effectiveCap(table, Stat.CooldownReduction, 0)).toBe(
      DEFAULT_STAT_CAPS[Stat.CooldownReduction]?.base ?? STAT_CLAMPS[Stat.CooldownReduction]![1],
    );
  });

  it("第一次儲存(overlay 還是空的)寫的是出貨預設 + 這次的編輯,不是全 0", async () => {
    cover("adminui-stat-caps-save");
    const h = await open();
    // ⚠️ 2026-08-15 owner 把移速一般上限重新設計到 24（原本 10）—— 這裡填的解鎖值
    //    一定要大於出貨的 base，否則會撞到下面那條「解鎖 < 一般上限時儲存鈕關閉」
    //    的守衛，儲存鈕會被鎖住而不是這條測試在驗的東西（失敗形態④：斷言方向
    //    跟缺陷無關）。28 落在新的 base(24) 與 unlocked(30) 之間。
    h.type("ms.unlocked", "28");
    h.click(SAVE);
    await h.flush();

    const table = statCapsFromDoc(bus.puts[0]!.doc);
    // 出貨的攻速解鎖必須跟著寫進去 —— 否則按一次儲存就把攻速解鎖從 10 打成 4。
    expect(effectiveCap(table, Stat.AttackSpeed, 999)).toBe(10);
    expect(effectiveCap(table, Stat.MoveSpeed, 999)).toBe(28);
  });

  it("解鎖上限小於一般上限時,儲存鈕是關的 —— 存不出一份自相矛盾的表", async () => {
    cover("adminui-stat-caps-save");
    const h = await open();
    h.type("as.base", "8");
    h.type("as.unlocked", "3");
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(bus.puts).toHaveLength(0);
  });

  it("沒有任何編輯時儲存鈕是關的 —— 不會用一次誤觸把表定死", async () => {
    cover("adminui-stat-caps-save");
    const h = await open();
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(bus.puts).toHaveLength(0);
  });

  it("平台拒絕時顯示錯誤,而且不會謊報已儲存", async () => {
    cover("adminui-stat-caps-save");
    bus.putRejects = true;
    const h = await open();
    h.type("as.unlocked", "11");
    h.click(SAVE);
    await h.flush();
    expect(h.text()).toContain("平台拒絕了這次寫入");
    expect(h.text()).not.toContain("已寫入耐久覆蓋層");
  });

  it("頁面**不可以**告訴操作者「下一場生效」—— 這份文件只在 shard 開機時被讀", async () => {
    cover("adminui-stat-caps-save");
    // 覆蓋層是 `loadContent()` 在 game-server **開機**時抓的(fetchOverlayBundle
    // → Configs),而 `MatchController` 只從那份已載入的 registry 讀。沒有任何
    // 路徑會在開賽時重抓,所以「按了儲存,下一場就會不一樣」是假的:玩家那一場
    // 拿到的還是舊天花板,而畫面說 ✓ 已寫入。這一行字是操作者唯一的線索。
    const h = await open();
    const text = h.text();
    expect(text).not.toContain("並從下一場開始生效");
    expect(text).toContain("重啟");
  });

  it("已存在的 overlay 值會被讀進畫面,而不是被出貨預設蓋掉", async () => {
    cover("adminui-stat-caps-save");
    bus.overlayDoc = {
      id: CAPS_DOC_ID,
      schema: CAPS_SCHEMA,
      caps: { as: { base: 6, unlocked: 18 } },
    };
    const h = await open();
    expect(h.field("as.base").props["value"]).toBe("6");
    expect(h.field("as.unlocked").props["value"]).toBe("18");
    // 而且沒被 overlay 提到的屬性顯示的是「不可解鎖」,和 sim 的讀法一致。
    // ⚠️ 這裡的期望值**不是**出貨表 —— overlay 是**整張表取代**，所以沒被提到的
    //    屬性走 `capFor` 的退路，也就是 `STAT_CLAMPS` 的上界（見那支函式）。
    expect(h.field("ms.unlocked").props["value"]).toBe(String(STAT_CLAMPS[Stat.MoveSpeed]![1]));
  });
});
