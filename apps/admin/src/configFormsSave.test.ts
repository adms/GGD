/**
 * 存一個新值 → 讓**真的消費端**讀回來 → 值真的變了。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一支存在的理由
 * ════════════════════════════════════════════════════════════════════════════
 * `configForms.test.ts` 守的是純函式和標籤；它一條都不會紅，即使頁面按下儲存之後
 * 送出的是一份空文件。而「後台自我一致地說謊」正是這樣長出來的：頁面讀值時覆蓋層
 * 優先，所以操作者重整後看得到自己填的數字 —— 而遊戲那一端一輩子讀不到。
 *
 * 所以這一支做的是三件事，缺一不可：
 *   1. 打進**真的輸入框**、按**真的按鈕**（headlessUi 跑的是頁面自己的 onChange /
 *      onClick，不是重寫一份）；
 *   2. 斷言交給 `putOverlayDoc` 的那個物件；
 *   3. 把**那個物件**餵進遊戲裡真的會讀它的函式（`applyModelLodPolicy` /
 *      `readVfxCleanupPolicy` / `applyGoreDoc`），斷言行為變了。
 *
 * 第 3 步是唯一擋得住失敗形態 ⑤（被測的不是出貨的那個）的東西：測試自己手寫一份
 * 「看起來對」的文件，跟遊戲真的讀得懂那份文件，是兩件事。
 *
 * ⚠️ 基底文件用的是 `content/config/*.json` **本人**，不是測試自己捏的夾具。捏一份
 * 只有三個鍵的假 gore 文件，`championStyles` 那條守衛就會恆綠 —— 而那條守衛守的
 * 正好就是「文件裡有東西是這一頁不認得的」這件事。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ConfigDocPage } from "./ui/ConfigDocPage";
import { specForPage, type ConfigDocSpec } from "./configForms";
import { mount, textOf, type Harness } from "./testkit/headlessUi";

// ── 真的消費端。相對路徑 import 是刻意的：這些就是遊戲載入的那幾支模組本人。
import {
  applyModelLodPolicy,
  lodTierForPreset,
  resolveLodPath,
  type LodManifest,
} from "../../client/src/render/modelLod";
import {
  readVfxCleanupPolicy,
  ringCapForRoundBoundary,
} from "../../client/src/vfx/vfxCleanupPolicy";
import {
  applyGoreDoc,
  goreConfig,
  resetGoreConfig,
  resolveGore,
} from "../../client/src/vfx/goreConfig";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** 出貨文件本人 —— 見檔頭最後一段。 */
function shippedDoc(docId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`${REPO}content/config/${docId}.json`, "utf8")) as Record<
    string,
    unknown
  >;
}

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  putRejects: false,
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
  bus.shipped = { present: false, hash: "", doc: null };
});

/** 掛上一頁，出貨文件已經在平台上（操作者還沒改過任何東西）。 */
async function open(page: string): Promise<{ h: Harness; spec: ConfigDocSpec }> {
  const spec = specForPage(page)!;
  bus.shipped = { present: true, hash: "deadbeef", doc: shippedDoc(spec.docId) };
  const h = mount(createElement(ConfigDocPage, { spec }));
  await h.flush();
  return { h, spec };
}

/** 儲存鈕現在按不按得下去。`click` 對停用的按鈕會丟例外，所以要先問。 */
function saveEnabled(h: Harness): boolean {
  const btn = h.hosts().find((n) => n.type === "button" && textOf(n.children).trim() === SAVE);
  if (!btn) throw new Error("頁面上沒有儲存鈕");
  return btn.props["disabled"] !== true;
}

// ───────────────────────────────────────────────────── 畫質分級 (model-lod) ─

describe("畫質分級：存進去的值，模型載入路徑真的讀得到 (adminui-config-forms-save)", () => {
  it("中畫質改成 small → lodTierForPreset 與 resolveLodPath 一起變", async () => {
    cover("adminui-config-forms-save");
    const { h } = await open("modelLod");

    // 改之前：出貨表是 low→small / medium→mid / high→high / auto→high。
    applyModelLodPolicy(shippedDoc("model-lod"));
    expect(lodTierForPreset("medium")).toBe("mid");

    h.type("presetTiers.medium", "small");
    expect(saveEnabled(h)).toBe(true);
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(1);
    const doc = bus.puts[0]!.doc;
    expect(bus.puts[0]!.collection).toBe("config");
    expect(bus.puts[0]!.id).toBe("model-lod");
    expect(doc["schema"]).toBe("config.model-lod@1");

    // ── 送出去的那份文件，餵進客戶端真的在用的政策讀取器。
    applyModelLodPolicy(doc);
    expect(lodTierForPreset("medium")).toBe("small");
    // 沒被碰過的三格維持原樣（只送被改的那一格的實作會讓它們變 undefined → "high"）。
    expect(lodTierForPreset("low")).toBe("small");
    expect(lodTierForPreset("high")).toBe("high");
    expect(lodTierForPreset("auto")).toBe("high");

    // ── 再往下一層：AssetManager 真的拿去 fetch 的那個路徑也跟著換檔。
    const manifest: LodManifest = {
      models: {
        "assets/models/hero.glb": {
          mid: { path: "assets/models/hero-mid.glb", bytes: 1, triangles: 1 },
          small: { path: "assets/models/hero-small.glb", bytes: 1, triangles: 1 },
        },
      },
    };
    expect(resolveLodPath("assets/models/hero.glb", lodTierForPreset("medium"), manifest)).toBe(
      "assets/models/hero-small.glb",
    );
  });

  it("總開關關掉 → 每一個畫質等級都退回原始模型檔", async () => {
    cover("adminui-config-forms-save");
    const { h } = await open("modelLod");
    h.type("enabled", "false");
    h.click(SAVE);
    await h.flush();

    applyModelLodPolicy(bus.puts[0]!.doc);
    for (const preset of ["low", "medium", "high", "auto"] as const) {
      expect(lodTierForPreset(preset)).toBe("high");
    }
    expect(resolveLodPath("assets/models/hero.glb", lodTierForPreset("low"), {
      models: { "assets/models/hero.glb": { small: { path: "x-small.glb", bytes: 1, triangles: 1 } } },
    })).toBe("assets/models/hero.glb");
  });
});

// ──────────────────────────────────────────────────── 特效回收 (vfx-cleanup) ─

describe("特效回收：存進去的上限，回合邊界真的讀得到 (adminui-config-forms-save)", () => {
  it("關掉強制清空 + 保留 7 個 → 回合邊界的網格上限變成 7", async () => {
    cover("adminui-config-forms-save");
    const { h } = await open("vfxCleanup");

    // 出貨值是「回合結束強制清空」，所以上限是 0。
    expect(ringCapForRoundBoundary(readVfxCleanupPolicy(shippedDoc("vfx-cleanup")))).toBe(0);

    h.type("purgeSharedPoolsOnRoundEnd", "false");
    h.type("maxPooledRings", "7");
    h.click(SAVE);
    await h.flush();

    const doc = bus.puts[0]!.doc;
    expect(doc["maxPooledRings"]).toBe(7);
    // 型別也要對：`"7"` 會過 JSON、過 PUT，然後在 `readVfxCleanupPolicy` 的
    // `typeof === "number"` 那一關被整份退回出貨政策 —— 靜默地把設定變成它的相反。
    expect(typeof doc["maxPooledRings"]).toBe("number");

    const policy = readVfxCleanupPolicy(doc);
    expect(ringCapForRoundBoundary(policy)).toBe(7);
  });

  it("總開關關掉 → 回合邊界完全不修剪（Infinity，#259 的行為）", async () => {
    cover("adminui-config-forms-save");
    const { h } = await open("vfxCleanup");
    h.type("enabled", "false");
    h.click(SAVE);
    await h.flush();
    expect(ringCapForRoundBoundary(readVfxCleanupPolicy(bus.puts[0]!.doc))).toBe(Infinity);
  });

  it("超過上界的數字存不出去，而且畫面上寫出原因 (#277)", async () => {
    cover("adminui-config-forms-save");
    const { h } = await open("vfxCleanup");
    h.type("maxPooledRings", "2400");
    expect(saveEnabled(h)).toBe(false);
    expect(h.text()).toContain("不可以大於 512");
    expect(bus.puts).toHaveLength(0);

    // 改回合法值 → 又能存了（錯誤狀態不是單向門）。
    h.type("maxPooledRings", "24");
    expect(saveEnabled(h)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────── 濺血 (gore) ─────

describe("濺血程度：存進去的樣式，每一次命中真的讀得到 (adminui-config-forms-save)", () => {
  beforeEach(() => resetGoreConfig());

  it("強度改成 0.2 → resolveGore 對一次命中回 0.2", async () => {
    cover("adminui-config-forms-save");
    const { h } = await open("gore");

    applyGoreDoc(shippedDoc("gore"));
    expect(resolveGore(goreConfig(), "godie-hapm").intensity).toBeCloseTo(0.85, 5);

    h.type("intensity", "0.2");
    h.click(SAVE);
    await h.flush();

    const doc = bus.puts[0]!.doc;
    expect(doc["intensity"]).toBe(0.2);
    applyGoreDoc(doc);
    expect(resolveGore(goreConfig(), "godie-hapm").intensity).toBeCloseTo(0.2, 5);
  });

  it("樣式改成 off → 這一層完全不噴", async () => {
    cover("adminui-config-forms-save");
    const { h } = await open("gore");
    h.type("style", "off");
    h.click(SAVE);
    await h.flush();

    applyGoreDoc(bus.puts[0]!.doc);
    expect(goreConfig().style).toBe("off");
    expect(resolveGore(goreConfig(), "godie-hapm")).toEqual({ style: "off", intensity: 0 });
  });

  it("⚠️ 這一頁不編輯的 championStyles 在儲存之後**一格都沒掉**", async () => {
    cover("adminui-config-forms-save");
    const before = shippedDoc("gore")["championStyles"] as Record<string, string>;
    const count = Object.keys(before).length;
    expect(count).toBeGreaterThan(5); // 出貨文件真的有十位角色，否則這條守衛是空的

    const { h } = await open("gore");
    h.type("intensity", "0.5");
    h.click(SAVE);
    await h.flush();

    const doc = bus.puts[0]!.doc;
    expect(Object.keys(doc["championStyles"] as object)).toHaveLength(count);
    expect(doc["championStyles"]).toEqual(before);

    // 而且不是「鍵還在」而已 —— 那十位角色在遊戲裡仍然噴的是能量而不是紅血。
    applyGoreDoc(doc);
    const [someChampion] = Object.keys(before);
    expect(resolveGore(goreConfig(), someChampion).style).toBe("stylized");
    expect(resolveGore(goreConfig(), "godie-hapm").style).toBe("blood");
  });
});

// ─────────────────────────────────────────────────────── 頁面的其他規則 ─────

describe("設定頁的共同規則 (adminui-config-forms-save)", () => {
  it("讀不到基底文件時儲存是停用的 —— 硬存會把整份文件洗掉", async () => {
    cover("adminui-config-forms-save");
    const spec = specForPage("gore")!;
    bus.shipped = { present: false, hash: "", doc: null };
    const h = mount(createElement(ConfigDocPage, { spec }));
    await h.flush();

    // ⚠️ 這一行是這條守衛的關鍵，不是排場。
    // 沒有它的話「儲存是關的」對**每一種**實作都成立 —— 因為還沒有人打過字，
    // `dirty` 本來就是 false。那樣的斷言方向和缺陷無關（第②守則的第 ④ 種形態），
    // 實測過：把 `base !== null` 從 canSave 拿掉，整組測試照樣全綠。
    // 先打一個合法的值，讓 dirty / allValid 都成立，剩下唯一能擋住儲存的就只有
    // 「沒有基底文件」這一個理由。
    h.type("intensity", "0.5");
    expect(saveEnabled(h)).toBe(false);
    expect(h.text()).toContain("讀不到基底文件");
    expect(bus.puts).toHaveLength(0);
  });

  it("覆蓋層優先於出貨文件 —— 畫面顯示的是遊戲真的會載到的那一份", async () => {
    cover("adminui-config-forms-save");
    const spec = specForPage("vfxCleanup")!;
    bus.shipped = { present: true, hash: "x", doc: shippedDoc("vfx-cleanup") };
    bus.overlayDoc = { ...shippedDoc("vfx-cleanup"), maxPooledRings: 99 };
    const h = mount(createElement(ConfigDocPage, { spec }));
    await h.flush();
    expect(h.field("maxPooledRings").props["value"]).toBe("99");
    expect(h.text()).toContain("耐久覆蓋層");
  });

  it("PUT 失敗時不會假裝存好了（畫面留在髒的狀態）", async () => {
    cover("adminui-config-forms-save");
    const { h } = await open("gore");
    bus.putRejects = true;
    h.type("intensity", "0.3");
    h.click(SAVE);
    await h.flush();
    expect(h.text()).toContain("平台拒絕了這次寫入");
    expect(h.text()).not.toContain("已寫入耐久覆蓋層");
    expect(h.field("intensity").props["value"]).toBe("0.3");
  });

  it("每一頁都把「什麼時候生效」和「誰會讀它」印在畫面上", async () => {
    cover("adminui-config-forms-save");
    for (const page of ["modelLod", "vfxCleanup", "gore"]) {
      const { h, spec } = await open(page);
      expect(h.text()).toContain(spec.effect);
      expect(h.text()).toContain(spec.consumer);
      // 說明也要真的畫出來，不是只存在標籤表裡。
      for (const f of spec.fields) expect(h.text()).toContain(f.note);
    }
  });
});
