/**
 * 鑄技工坊 —— 這一頁**真的送出去**的東西 (task #205 / #230 / #272).
 *
 * WHY THIS FILE EXISTS. `vfxForge.test.ts` 守純函式與 drift;它們沒有一條看得到
 * 操作者按下「儲存」時落進覆蓋層的是什麼。`renderToString` 也不行 —— SSR 把每一個
 * handler 都丟掉,所以一個「把出貨預設蓋掉操作者編輯」的頁面畫出來的 HTML 一模一樣。
 * 所以這個檔**驅動真的頁面**:打真的輸入框、按真的按鈕,然後斷言交給
 * `putOverlayDoc` 的那個物件,再把它餵回 `extractFamiliesDoc`(裡面是 shared 自己
 * 的 Zod —— shard 讀它的那條路)。
 *
 * 這裡守的五個具體突變:
 *   · 儲存只送被改的那一列  → 其他技能的綁定、其他家族的調校整批消失,而畫面說 ✓
 *   · 越界的數字被靜默 clamp → 操作者以為存進去的是他打的 2000,實際是 20
 *   · 留白被寫成 0          → 「原圖沒說」變成「明確要求 0」,alpha 0 = 看不見
 *   · 「原作模型」那一欄只算不畫 → owner 永遠看不到「原作其實是 WarStompCaster」
 *   · 打開一列就髒         → 只是看一眼就把一筆綁定寫進表裡
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { VfxForgePage } from "./ui/VfxForgePage";
import {
  FAMILY_IDS,
  VFX_FAMILIES_DOC_ID,
  VFX_FAMILIES_SCHEMA,
  extractFamiliesDoc,
  type ForgeCatalog,
} from "./vfxForge";
import { mount } from "./testkit/headlessUi";

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  putRejects: false,
  overlayDoc: null as unknown,
  catalogRejects: false,
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
      // deep-copy: 斷言要看的是**送出去的那一刻**,不是之後被改過的物件
      bus.puts.push({ collection, id, doc: JSON.parse(JSON.stringify(doc)) as Record<string, unknown> });
      return { generation: ++bus.generation };
    },
    revertOverlayDoc: async (): Promise<{ generation: number }> => ({ generation: ++bus.generation }),
  };
});

/**
 * `loadForgeCatalog` 被換掉,其餘純函式全部是真的 —— 被測的必須是出貨的那一份
 * 解析邏輯,不是測試自己手寫的一份(第⑤種失敗形態)。
 */
vi.mock("./vfxForge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vfxForge")>();
  return {
    ...actual,
    loadForgeCatalog: async (): Promise<ForgeCatalog> => {
      if (bus.catalogRejects) throw new Error("/content 掛了");
      return CATALOG();
    },
  };
});

/**
 * 三支技能,涵蓋三種狀態:
 *  · `godie-e002.e` 現在畫的是猜的、原作是 WarStompCaster(作者自己設的)
 *  · `godie-e001.passive` 現在畫的是猜的、原作也是 WarStompCaster(繼承來的)
 *  · `godie-zzz.q` 普查裡沒有它 —— 預設的「可以重綁」篩選看不到它
 */
function CATALOG(): ForgeCatalog {
  return {
    abilities: [
      { id: "godie-e002.e", name: "約束與勝利之劍", vfxKey: "fx.prim.holy.beam-lg" },
      { id: "godie-e001.passive", name: "天生技", vfxKey: "fx.prim.void.pulse-sm" },
      { id: "godie-zzz.q", name: "沒有普查紀錄的招", vfxKey: null },
    ],
    vfxIds: new Set(["fx.prim.holy.beam-lg", "fx.prim.void.pulse-sm"]),
    census: new Map([
      [
        "godie-e002.e",
        {
          rawcodes: ["A0D5"],
          art: [
            {
              channel: "art:caster",
              stem: "warstompcaster",
              path: "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl",
              provenance: "w3a-override",
              assetStatus: "MISSING_BLIZZARD_STOCK",
            },
          ],
        },
      ],
      [
        "godie-e001.passive",
        {
          rawcodes: ["A0CL"],
          art: [
            {
              channel: "art:caster",
              stem: "warstompcaster",
              path: "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl",
              provenance: "stock-inherited",
              assetStatus: "MISSING_BLIZZARD_STOCK",
            },
          ],
        },
      ],
    ]),
  };
}

const TUNING = {
  enabled: true,
  primitive: "shockwave",
  element: "earth",
  scale: 1,
  alpha: 1,
  timeScale: 1,
  heightY: 0.15,
};

/** 一份完整的 overlay 文件（21 個家族都在，不然頁面只畫得出一部分）。 */
function LIVE_DOC(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VFX_FAMILIES_DOC_ID,
    schema: VFX_FAMILIES_SCHEMA,
    enabled: true,
    scaleGain: 0.35,
    scaleMin: 0.5,
    scaleMax: 3,
    families: Object.fromEntries(FAMILY_IDS.map((f) => [f, { ...TUNING }])),
    abilities: {},
    ...extra,
  };
}

const SAVE = "儲存 Save";

beforeEach(() => {
  bus.puts.length = 0;
  bus.putRejects = false;
  bus.catalogRejects = false;
  bus.generation = 0;
  bus.overlayDoc = LIVE_DOC();
});

async function open(): Promise<ReturnType<typeof mount>> {
  const h = mount(createElement(VfxForgePage));
  await h.flush();
  return h;
}

describe("鑄技工坊 · 原作那一欄真的畫在畫面上 (adminui-vfx-forge-render)", () => {
  it("⚠️ owner 一眼看得到「現在畫的是猜的、原作其實是 WarStompCaster」", async () => {
    cover("adminui-vfx-forge-render");
    const h = await open();
    const text = h.text();
    // 三件事必須同時在畫面上，少一件這一頁就沒有存在的意義
    expect(text, "技能名沒畫出來").toContain("約束與勝利之劍");
    expect(text, "「現在畫的是猜的」這個判讀沒畫出來").toContain("猜的");
    expect(text, "原作模型名沒畫出來 —— 這一欄只算不畫等於沒做").toContain("warstompcaster");
    expect(text, "沒有把原作模型翻譯成一個可以選的家族").toContain("建議家族：衝擊波環");
    // 而且證據強度也在（作者自己設的 vs WC3 繼承的，owner 要能分辨）
    expect(text).toContain("w3a-override");
    expect(text).toContain("stock-inherited");
  });

  it("21 個家族原型每一個都畫得出一列，帶著它的原圖模型名", async () => {
    cover("adminui-vfx-forge-render");
    const h = await open();
    for (const fam of FAMILY_IDS) {
      expect(h.hosts().some((n) => n.props["data-testid"] === `family-row-${fam}`), `${fam} 這一列沒畫出來`).toBe(true);
    }
    expect(h.text()).toContain("thunderclapcaster");
  });

  it("摘要用的是解析結果：三支裡兩支解得到，一支 vfxKey 是 null", async () => {
    cover("adminui-vfx-forge-render");
    const h = await open();
    expect(h.text()).toContain("技能 3 支");
    expect(h.text()).toContain("畫得出東西 2");
  });

  it("預設只列「原作有證據可以重綁的」，切成全部才看得到沒有普查紀錄的那一支", async () => {
    cover("adminui-vfx-forge-render");
    const h = await open();
    expect(h.text()).not.toContain("沒有普查紀錄的招");
    h.type("filter.mode", "all");
    expect(h.text()).toContain("沒有普查紀錄的招");
  });

  it("/content 讀不到時說出來，而不是畫一張空表假裝沒事", async () => {
    cover("adminui-vfx-forge-render");
    bus.catalogRejects = true;
    const h = await open();
    expect(h.text()).toContain("讀不到出貨內容");
  });

  it("連 config/vfx-families 都讀不到時，畫面明說沒有東西可以編輯", async () => {
    cover("adminui-vfx-forge-render");
    bus.overlayDoc = null;
    const h = await open();
    expect(h.text()).toContain("讀不到 config/vfx-families");
    expect(() => h.click(SAVE)).toThrow(/disabled/);
  });
});

describe("鑄技工坊 · 儲存送出的東西 (adminui-vfx-forge-save)", () => {
  it("改一支技能 → 送出的是整張表，而且每一段參數一格不漏", async () => {
    cover("adminui-vfx-forge-save");
    // 已經存過的另一支 + 一個被調過的家族 —— 「只送被改的那一列」的實作會弄丟它們
    bus.overlayDoc = LIVE_DOC({
      abilities: { "godie-e001.passive": { family: "shockwaveRing", w3xScale: 1.5 } },
      families: {
        ...Object.fromEntries(FAMILY_IDS.map((f) => [f, { ...TUNING }])),
        blink: { ...TUNING, primitive: "dash", element: "arcane", scale: 0.9 },
      },
    });
    const h = await open();
    h.click("godie-e002.e");
    h.type("f.family", "shockwaveRing");
    h.type("f.w3xScale", "2.5");
    h.type("f.tintR", "255");
    h.type("f.tintG", "100");
    h.type("f.tintB", "100");
    h.type("f.flyHeight", "360");
    h.type("f.alpha", "0.8");
    h.type("f.timeScale", "1.25");
    h.type("f.anchor", "right,hand");
    h.type("f.enabled", "1");
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(1);
    expect(bus.puts[0]!.collection).toBe("config");
    expect(bus.puts[0]!.id).toBe(VFX_FAMILIES_DOC_ID);

    // 送出去的表餵回**伺服器讀它的那條路**（shared 的 Zod）
    const back = extractFamiliesDoc(bus.puts[0]!.doc);
    expect(back, "送出去的文件過不了 shared 的 Zod").not.toBeNull();
    expect(back!.abilities["godie-e002.e"]).toEqual({
      family: "shockwaveRing",
      enabled: true,
      w3xScale: 2.5,
      tint: [255, 100, 100],
      flyHeight: 360,
      alpha: 0.8,
      timeScale: 1.25,
      anchor: "right,hand",
    });
    // ⚠️ 沒被碰過的那一支、以及每一個家族的調校，都必須原封不動地留在文件裡
    expect(Object.keys(back!.abilities)).toContain("godie-e001.passive");
    expect(back!.abilities["godie-e001.passive"]?.w3xScale).toBe(1.5);
    expect(Object.keys(back!.families).sort()).toEqual([...FAMILY_IDS].sort());
    expect(back!.families["blink"]?.primitive).toBe("dash");
    expect(back!.families["blink"]?.scale).toBe(0.9);
  });

  it("改家族原型 → 那一列進文件，其他 20 個家族原封不動", async () => {
    cover("adminui-vfx-forge-save");
    const h = await open();
    h.click("衝擊波環");
    h.type("fam.scale", "2.5");
    h.type("fam.element", "holy");
    h.click(SAVE);
    await h.flush();

    const back = extractFamiliesDoc(bus.puts[0]!.doc)!;
    expect(back.families["shockwaveRing"]?.scale).toBe(2.5);
    expect(back.families["shockwaveRing"]?.element).toBe("holy");
    expect(Object.keys(back.families).sort()).toEqual([...FAMILY_IDS].sort());
    expect(back.families["burst"]).toEqual(TUNING);
  });

  it("⚠️ 留白不會被寫成 0 —— 只填一格就只有那一格進文件", async () => {
    cover("adminui-vfx-forge-save");
    const h = await open();
    h.click("godie-e002.e");
    h.type("f.w3xScale", "3");
    h.click(SAVE);
    await h.flush();

    const b = extractFamiliesDoc(bus.puts[0]!.doc)!.abilities["godie-e002.e"]!;
    // 「把空字串當 0」的實作在這裡會多出 alpha:0 / timeScale:0 / flyHeight:0，
    // 而 alpha 0 就是完全看不見。
    expect(Object.keys(b)).toEqual(["w3xScale"]);
  });

  it("打開一列只是看 —— 沒有真的改動時儲存鈕是關的", async () => {
    cover("adminui-vfx-forge-save");
    const h = await open();
    h.click("godie-e002.e");
    expect(h.fieldOrNull("f.family"), "編輯器沒打開").not.toBeNull();
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(bus.puts).toHaveLength(0);

    h.click("衝擊波環");
    expect(h.fieldOrNull("fam.scale"), "家族編輯器沒打開").not.toBeNull();
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(bus.puts).toHaveLength(0);
  });

  it("⚠️ 越界的數字被擋在後台 —— 不是靜默夾成上界", async () => {
    cover("adminui-vfx-forge-save");
    const h = await open();
    h.click("godie-e002.e");
    h.type("f.w3xScale", "2000"); // 2 打成 2000
    expect(h.text()).toContain("不能大於 20");
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(bus.puts).toHaveLength(0);

    // 改回界內就存得出去，而且存的是 2 不是 20
    h.type("f.w3xScale", "2");
    h.click(SAVE);
    await h.flush();
    expect(extractFamiliesDoc(bus.puts[0]!.doc)!.abilities["godie-e002.e"]?.w3xScale).toBe(2);
  });

  it("⚠️ 家族欄位與全域縮放欄位的上界一樣擋得住", async () => {
    cover("adminui-vfx-forge-save");
    const h = await open();
    h.click("衝擊波環");
    h.type("fam.scale", "60");
    expect(h.text()).toContain("不能大於 6");
    expect(() => h.click(SAVE)).toThrow(/disabled/);

    h.type("fam.scale", "2");
    h.type("g.scaleGain", "5");
    expect(h.text()).toContain("不能大於 1");
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(bus.puts).toHaveLength(0);
  });

  it("「套用原作建議」把普查說的家族填進去，而且真的存得出去", async () => {
    cover("adminui-vfx-forge-save");
    const h = await open();
    h.click("godie-e002.e");
    h.click("套用原作建議（衝擊波環）");
    expect(h.field("f.family").props["value"]).toBe("shockwaveRing");
    h.click(SAVE);
    await h.flush();
    expect(extractFamiliesDoc(bus.puts[0]!.doc)!.abilities["godie-e002.e"]).toEqual({
      family: "shockwaveRing",
    });
  });

  it("移除一列的綁定 → 送出的表裡沒有它，其他的還在", async () => {
    cover("adminui-vfx-forge-save");
    bus.overlayDoc = LIVE_DOC({
      abilities: {
        "godie-e002.e": { family: "shockwaveRing" },
        "godie-e001.passive": { family: "burst" },
      },
    });
    const h = await open();
    h.click("godie-e002.e");
    h.click("移除這一列的綁定");
    h.click(SAVE);
    await h.flush();

    const back = extractFamiliesDoc(bus.puts[0]!.doc)!;
    expect(Object.keys(back.abilities)).toEqual(["godie-e001.passive"]);
  });

  it("總開關存得進去，而且是 false 不是被丟掉", async () => {
    cover("adminui-vfx-forge-save");
    const h = await open();
    h.type("enabled", "0");
    h.click(SAVE);
    await h.flush();
    const back = extractFamiliesDoc(bus.puts[0]!.doc)!;
    expect(back.enabled).toBe(false);
    expect(back.schema).toBe(VFX_FAMILIES_SCHEMA);
  });

  it("已存在的 overlay 值會被讀進畫面，而不是被出貨預設蓋掉", async () => {
    cover("adminui-vfx-forge-save");
    bus.overlayDoc = LIVE_DOC({
      enabled: false,
      scaleGain: 0.9,
      abilities: { "godie-e002.e": { family: "levelUp", w3xScale: 3.25, anchor: "chest" } },
    });
    const h = await open();
    expect(h.field("enabled").props["value"]).toBe("0");
    expect(h.field("g.scaleGain").props["value"]).toBe("0.9");
    h.click("godie-e002.e");
    expect(h.field("f.family").props["value"]).toBe("levelUp");
    expect(h.field("f.w3xScale").props["value"]).toBe("3.25");
    expect(h.field("f.anchor").props["value"]).toBe("chest");
  });

  it("平台拒絕時顯示錯誤，而且不會謊報已儲存", async () => {
    cover("adminui-vfx-forge-save");
    bus.putRejects = true;
    const h = await open();
    h.type("enabled", "0");
    h.click(SAVE);
    await h.flush();
    expect(h.text()).toContain("平台拒絕了這次寫入");
    expect(h.text()).not.toContain("已寫入耐久覆蓋層");
  });

  it("頁面**不可以**說「下一場生效」—— 這份文件只在 shard 開機時被讀", async () => {
    cover("adminui-vfx-forge-save");
    const h = await open();
    const text = h.text();
    expect(text).not.toContain("下一場開始生效");
    expect(text).toContain("重啟");
  });
});
