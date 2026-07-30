/**
 * 多層特效堆疊 —— **後台按下去 → 玩家那一場真的變** 的整條線 (task #205 / #230).
 *
 * ---------------------------------------------------------------------------
 * 這個檔為什麼不能是「對著一個自己搭的 store 斷言」
 * ---------------------------------------------------------------------------
 * #241 的教訓是:一個到不了遊戲的編輯器,加再多功能都只是把謊說得更大。所以這裡
 * **一段都不許是手搭的**:
 *
 *   1. 操作者的動作走**真的頁面**(`VfxForgePage` → `AbilityLayersEditor`),
 *      打真的 select、按真的按鈕 —— `renderToString` 會把每一個 handler 丟掉,
 *      所以一個「存檔時把第二層吃掉」的頁面畫出來的 HTML 一模一樣;
 *   2. 存檔走**真的 `putOverlayDoc`**(只換掉 transport),斷言的是交出去的那個
 *      物件;
 *   3. 那個物件接著被丟進**遊戲真的走的讀取路徑**:
 *
 *        OverlayContentSource(出貨樹 ⊕ overlay)
 *          → ContentLoader.load()      ← shared 自己的 Zod,和 shard/瀏覽器同一份
 *          → registerAll(store)        ← 出貨的 registry 分流
 *          → Abilities.tryGet(id)      ← `VfxSystem.handleEvent` 拿 def 的那一行
 *          → resolveAbilityVfxLayers() ← `castLayersFor` 唯一做的事
 *          → VfxDefs.tryGet(layer.vfxKey) ← `ContentDb.vfxFor`,也就是「畫不畫得出來」
 *
 * 中間沒有一段是這個檔自己重寫的。
 *
 * ---------------------------------------------------------------------------
 * 四個突變(每一個都真的做過:改壞 → 確認紅 → 還原)
 * ---------------------------------------------------------------------------
 *   ① 存檔時的底改成「出貨的那份」而不是「線上生效的那份」
 *      → 這支技能上一次存的堆疊被靜靜還原掉(#241 的形狀)。第 2 節。
 *   ② 存檔只送第一層 / 靜靜丟掉第二層
 *      → 第 1 節與第 3 節同時紅(送出的物件、以及讀取端解出來的層數)。
 *   ③ 讀取端不套 overlay(用出貨樹)
 *      → 第 3 節紅,而且第 3 節同時證明**沒有 overlay 時解出來的是舊的**,
 *        所以那個綠不是碰巧。
 *   ④ 上移／下移不真的換位置
 *      → 第 4 節紅(送出去的順序)。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  ContentLoader,
  OverlayContentSource,
  RibbonDefs,
  VfxDefs,
  registerAll,
  hashCollection,
  hashDoc,
  type CollectionIndex,
  type CollectionName,
  type ContentSource,
  type IndexEntry,
  type Manifest,
  type OverlayBundle,
} from "@ggd/shared/content";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import {
  resolveAbilityVfxLayers,
  type AbilityVfxSource,
} from "@ggd/shared/content/schema/abilityVfx";
import { VfxForgePage } from "./ui/VfxForgePage";
import { __resetTemplateCache } from "./ui/AbilityLayersEditor";
import { FAMILY_IDS, VFX_FAMILIES_DOC_ID, VFX_FAMILIES_SCHEMA, type ForgeCatalog } from "./vfxForge";
import { layerCapOf, templateFrom, type VfxTemplate } from "./vfxLayers";
import { mount, type HostNode } from "./testkit/headlessUi";

const REPO = join(__dirname, "..", "..", "..");
const CONTENT = join(REPO, "content");

const ABILITY_ID = "godie-e002.e";
const PULSE = "fx.prim.arcane.pulse-lg";
const NOVA = "fx.prim.ice.nova";
const BEAM = "fx.prim.holy.beam-lg";
const RIBBON = "fx.ribbon-slash";

/** 真的出貨 vfx 文件 —— 讀取端用它判斷「這一層畫不畫得出來」。 */
function vfxDoc(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT, "vfx", `${id}.json`), "utf8")) as Record<string, unknown>;
}

/** 一份過得了 ability@1 的技能文件（出貨版：只有單值 vfxKey，沒有堆疊）。 */
function shippedAbility(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ABILITY_ID,
    schema: "ability@1",
    name: "約束與勝利之劍",
    slot: "E",
    castType: "self",
    maxRank: 4,
    cooldown: [60],
    manaCost: [150],
    range: 0,
    effects: [],
    vfxKey: PULSE,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// 被換掉的只有 transport
// ---------------------------------------------------------------------------

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  overlay: new Map<string, unknown>(),
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
    getOverlayDoc: async (collection: string, id: string): Promise<unknown> =>
      bus.overlay.get(`${collection}/${id}`) ?? null,
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
      const copy = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
      bus.puts.push({ collection, id, doc: copy });
      bus.overlay.set(`${collection}/${id}`, copy);
      return { generation: ++bus.generation };
    },
    revertOverlayDoc: async (): Promise<{ generation: number }> => ({ generation: ++bus.generation }),
  };
});

/** 目錄與模板清單只換掉「去哪裡拿」，解析／分類全是出貨那一份。 */
vi.mock("./vfxForge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vfxForge")>();
  return {
    ...actual,
    loadForgeCatalog: async (): Promise<ForgeCatalog> => ({
      abilities: [
        { id: ABILITY_ID, name: "約束與勝利之劍", vfxKey: PULSE, doc: shippedAbility() },
      ],
      vfxIds: new Set([PULSE, NOVA, BEAM, RIBBON]),
      census: new Map(),
    }),
  };
});

vi.mock("./vfxLayers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vfxLayers")>();
  return {
    ...actual,
    // 用**真的 templateFrom** 分類真的出貨文件 —— 緞帶會不會被列出來是行為，
    // 不是這個 mock 決定的
    loadVfxTemplates: async (): Promise<VfxTemplate[]> =>
      [PULSE, NOVA, BEAM, RIBBON].map((id) => templateFrom(id, vfxDoc(id))),
  };
});

const TUNING = {
  enabled: true,
  primitive: "shockwave",
  element: "earth",
  scale: 1,
  alpha: 1,
  timeScale: 1,
  heightY: 0.15,
};

function familiesDoc(extra: Record<string, unknown> = {}): Record<string, unknown> {
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

beforeEach(() => {
  bus.puts.length = 0;
  bus.overlay.clear();
  bus.generation = 0;
  bus.overlay.set(`config/${VFX_FAMILIES_DOC_ID}`, familiesDoc());
  __resetTemplateCache();
  for (const r of [VfxDefs, RibbonDefs]) r.clear();
  for (const r of [Abilities, Champions]) r.clear();
});

// ---------------------------------------------------------------------------
// 驅動真的頁面
// ---------------------------------------------------------------------------

type Harness = ReturnType<typeof mount>;

async function openRow(): Promise<Harness> {
  const h = mount(createElement(VfxForgePage));
  await h.flush();
  h.type("filter.mode", "all");
  h.click(ABILITY_ID);
  await h.flush();
  return h;
}

/** 按一顆用 `data-field` 認的按鈕（同一個標籤會出現在每一層上）。 */
async function press(h: Harness, field: string): Promise<void> {
  const node: HostNode = h.field(field);
  if (node.props["disabled"] === true) throw new Error(`button data-field="${field}" is disabled`);
  const onClick = node.props["onClick"];
  if (typeof onClick !== "function") throw new Error(`data-field="${field}" has no onClick`);
  (onClick as () => void)();
  await h.flush();
}

function optionValues(node: HostNode): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const host = n as HostNode;
    if (host.type === "option") out.push(String(host.props["value"] ?? ""));
    for (const c of host.children ?? []) walk(c);
  };
  for (const c of node.children ?? []) walk(c);
  return out;
}

/** 疊兩層：第一層沿用出貨的 vfxKey，第二層是延遲 220 ms、放大 1.8 倍的冰新星。 */
async function buildTwoLayers(h: Harness): Promise<void> {
  await press(h, `layer.add.${ABILITY_ID}`);
  await press(h, `layer.add.${ABILITY_ID}`);
  h.type("layer.1.vfxKey", NOVA);
  h.type("layer.1.delayMs", "220");
  h.type("layer.1.w3xScale", "1.8");
  h.type("layer.1.attachTo", "point");
}

// ---------------------------------------------------------------------------
// 讀取端 —— 遊戲真的走的那條
// ---------------------------------------------------------------------------

/** 出貨內容樹：一支技能（沒有堆疊）+ 四份真的 vfx 文件。 */
function shippedSource(): ContentSource {
  const docs: Record<string, Record<string, unknown>> = {
    [`abilities/${ABILITY_ID}`]: shippedAbility(),
  };
  for (const id of [PULSE, NOVA, BEAM, RIBBON]) docs[`vfx/${id}`] = vfxDoc(id);
  const byCollection: Record<string, string[]> = {
    abilities: [ABILITY_ID],
    vfx: [PULSE, NOVA, BEAM, RIBBON],
  };
  const index = (collection: string): CollectionIndex => {
    const entries: IndexEntry[] = byCollection[collection]!.map((id) => {
      const doc = docs[`${collection}/${id}`]!;
      return { id, path: `${collection}/${id}.json`, hash: hashDoc(doc), size: 1 };
    });
    return {
      collection: collection as CollectionName,
      hash: hashCollection(entries.map((e) => ({ id: e.id, hash: e.hash }))),
      entries,
    };
  };
  return {
    async readManifest(): Promise<Manifest> {
      const collections: Manifest["collections"] = {};
      for (const c of Object.keys(byCollection)) {
        const idx = index(c);
        collections[c as CollectionName] = {
          hash: idx.hash,
          count: idx.entries.length,
          path: `${c}/_index.json`,
        };
      }
      return { contentVersion: "cv_000000000000", collections };
    },
    async readIndex(collection: CollectionName): Promise<CollectionIndex> {
      return index(collection);
    },
    async readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown> {
      return docs[`${collection}/${entry.id}`];
    },
  };
}

/**
 * 開一次「客戶端」:出貨樹 ⊕ overlay → ContentLoader → registerAll → registry。
 * 回傳 `Abilities.tryGet(id)` 拿到的那份 def —— 也就是 `VfxSystem.handleEvent`
 * 拿到的那一份。
 */
async function bootWithOverlay(overlay: OverlayBundle | null): Promise<AbilityVfxSource | undefined> {
  for (const r of [VfxDefs, RibbonDefs]) r.clear();
  for (const r of [Abilities, Champions]) r.clear();
  const base = shippedSource();
  const source = overlay ? new OverlayContentSource(base, overlay) : base;
  const { store } = await new ContentLoader(source).load();
  registerAll(store);
  return Abilities.tryGet(ABILITY_ID as never) as AbilityVfxSource | undefined;
}

function overlayOf(): OverlayBundle {
  const docs: Record<string, unknown> = {};
  for (const [key, doc] of bus.overlay) docs[key] = doc;
  return { generation: bus.generation, docs, deleted: {} };
}

// ---------------------------------------------------------------------------

describe("① 後台真的送出了兩層 (adminui-vfx-layers-save)", () => {
  it("加兩層 + 改第二層的參數 → PUT 的是技能文件，而且兩層都在", async () => {
    cover("adminui-vfx-layers-save");
    const h = await openRow();
    await buildTwoLayers(h);
    await press(h, `layer.save.${ABILITY_ID}`);

    expect(bus.puts, "什麼都沒送出去").toHaveLength(1);
    expect(bus.puts[0]!.collection).toBe("abilities");
    expect(bus.puts[0]!.id).toBe(ABILITY_ID);
    const layers = (bus.puts[0]!.doc as { vfxLayers?: unknown[] }).vfxLayers;
    expect(layers, "⚠️ 第二層被靜靜丟掉了").toHaveLength(2);
    expect(layers![0]).toEqual({ vfxKey: PULSE });
    expect(layers![1]).toEqual({
      vfxKey: NOVA,
      attachTo: "point",
      delayMs: 220,
      w3xScale: 1.8,
    });
    // 技能文件其餘欄位原封不動 —— overlay 是**整份替換**，掉一個欄位就是掉一個欄位
    expect(bus.puts[0]!.doc["name"]).toBe("約束與勝利之劍");
    expect(bus.puts[0]!.doc["cooldown"]).toEqual([60]);
  });

  it("留白的格子沒有被寫成 0（alpha 0 = 完全看不見）", async () => {
    cover("adminui-vfx-layers-save");
    const h = await openRow();
    await press(h, `layer.add.${ABILITY_ID}`);
    await press(h, `layer.save.${ABILITY_ID}`);
    expect((bus.puts[0]!.doc as { vfxLayers: unknown[] }).vfxLayers[0]).toEqual({ vfxKey: PULSE });
  });
});

describe("② 底是「線上生效的那份」，不是出貨那份 (adminui-vfx-layers-live-base)", () => {
  it("⚠️ 這支技能上一次存的堆疊不會被靜靜還原掉（#241 的形狀）", async () => {
    cover("adminui-vfx-layers-live-base");
    // 線上已經有一層 —— 出貨那份沒有
    bus.overlay.set(
      `abilities/${ABILITY_ID}`,
      shippedAbility({ vfxLayers: [{ vfxKey: BEAM, delayMs: 40 }] }),
    );
    const h = await openRow();
    // 頁面應該直接把那一層讀出來
    expect(h.field("layer.0.vfxKey").props["value"]).toBe(BEAM);
    expect(h.field("layer.0.delayMs").props["value"]).toBe("40");

    await press(h, `layer.add.${ABILITY_ID}`);
    h.type("layer.1.vfxKey", NOVA);
    await press(h, `layer.save.${ABILITY_ID}`);

    const layers = (bus.puts[0]!.doc as { vfxLayers: { vfxKey: string }[] }).vfxLayers;
    expect(layers.map((l) => l.vfxKey), "⚠️ 用出貨版當底 → 上一次的那一層消失").toEqual([
      BEAM,
      NOVA,
    ]);
  });
});

describe("③ 玩家那一場真的拿到新的堆疊 (adminui-vfx-layers-readback)", () => {
  it("存檔 → 出貨樹 ⊕ overlay → registry → castLayersFor 解出來的就是那兩層", async () => {
    cover("adminui-vfx-layers-readback");
    const h = await openRow();
    await buildTwoLayers(h);
    await press(h, `layer.save.${ABILITY_ID}`);

    const def = await bootWithOverlay(overlayOf());
    expect(def, "技能文件沒進 registry").toBeDefined();
    const cap = layerCapOf(bus.overlay.get(`config/${VFX_FAMILIES_DOC_ID}`) as never);
    const resolved = resolveAbilityVfxLayers(def, cap);

    expect(resolved, "⚠️ 讀取端只看到一層 —— 第二層在某一段被吃掉了").toHaveLength(2);
    expect(resolved[0]).toEqual({
      vfxKey: PULSE,
      attachTo: "caster",
      delayMs: 0,
      overrides: undefined,
    });
    expect(resolved[1]).toEqual({
      vfxKey: NOVA,
      attachTo: "point",
      delayMs: 220,
      overrides: { w3xScale: 1.8 },
    });
    // 而且兩層都真的解得到文件 —— 這是 `ContentDb.vfxFor` 唯一做的事,
    // 也就是「畫不畫得出來」那一刀
    for (const layer of resolved) {
      expect(VfxDefs.tryGet(layer.vfxKey), `${layer.vfxKey} 解不到 → 這一層場上不會畫`).toBeDefined();
    }
  });

  it("⚠️ 沒有 overlay 的那一次拿到的是**舊的** —— 所以上面那個綠不是碰巧", async () => {
    cover("adminui-vfx-layers-readback");
    const h = await openRow();
    await buildTwoLayers(h);
    await press(h, `layer.save.${ABILITY_ID}`);

    const shippedDef = await bootWithOverlay(null);
    const shippedLayers = resolveAbilityVfxLayers(shippedDef, 5);
    expect(shippedLayers).toHaveLength(1);
    expect(shippedLayers[0]?.vfxKey).toBe(PULSE);
    expect(shippedLayers[0]?.overrides).toBeUndefined();
  });

  it("事後把層數上限調成 1 → 讀取端就真的只播第一層（上限是活的，不是文案）", async () => {
    cover("adminui-vfx-layers-readback");
    // 先在預設上限（5）之下存好兩層……
    const h = await openRow();
    await buildTwoLayers(h);
    await press(h, `layer.save.${ABILITY_ID}`);
    // ……操作者之後才把全域上限壓到 1（例如為了手機的發射器預算）
    bus.overlay.set(`config/${VFX_FAMILIES_DOC_ID}`, familiesDoc({ maxAbilityVfxLayers: 1 }));

    const def = await bootWithOverlay(overlayOf());
    const cap = layerCapOf(bus.overlay.get(`config/${VFX_FAMILIES_DOC_ID}`) as never);
    expect(cap).toBe(1);
    const truncated = resolveAbilityVfxLayers(def, cap);
    expect(truncated).toHaveLength(1);
    // 截斷是**從後面砍** —— 主特效那一層任何情況下都留著
    expect(truncated[0]?.vfxKey).toBe(PULSE);
    // 而同一份文件在上限 5 之下是兩層 —— 差別確實來自那一格
    expect(resolveAbilityVfxLayers(def, 5)).toHaveLength(2);
  });
});

describe("④ 順序真的會被存下去 (adminui-vfx-layers-reorder)", () => {
  it("把第二層上移 → 送出去的順序跟著換", async () => {
    cover("adminui-vfx-layers-reorder");
    const h = await openRow();
    await buildTwoLayers(h);
    await press(h, "layer.1.up");
    await press(h, `layer.save.${ABILITY_ID}`);

    const layers = (bus.puts[0]!.doc as { vfxLayers: { vfxKey: string }[] }).vfxLayers;
    expect(layers.map((l) => l.vfxKey), "⚠️ 上移沒有真的換位置").toEqual([NOVA, PULSE]);
    // 讀取端看到的也是換過的順序（順序決定誰先進粒子池、上限截斷時誰被砍）
    const def = await bootWithOverlay(overlayOf());
    expect(resolveAbilityVfxLayers(def, 5).map((l) => l.vfxKey)).toEqual([NOVA, PULSE]);
  });

  it("刪掉一層 → 送出去的就是剩下那一層", async () => {
    cover("adminui-vfx-layers-reorder");
    const h = await openRow();
    await buildTwoLayers(h);
    await press(h, "layer.0.del");
    await press(h, `layer.save.${ABILITY_ID}`);
    const layers = (bus.puts[0]!.doc as { vfxLayers: { vfxKey: string }[] }).vfxLayers;
    expect(layers.map((l) => l.vfxKey)).toEqual([NOVA]);
  });
});

describe("⑤ 頁面說的是實話 (adminui-vfx-layers-honesty)", () => {
  it("什麼時候生效寫在畫面上（純客戶端 → 要重新整理，不是重啟伺服器）", async () => {
    cover("adminui-vfx-layers-honesty");
    const h = await openRow();
    const text = h.text();
    expect(text).toContain("重新整理");
    expect(text).toContain("對戰伺服器不必重啟");
  });

  it("⚠️ 三個到不了畫面的旋鈕，警語畫在頁面上（不是只寫在註解裡）", async () => {
    cover("adminui-vfx-layers-honesty");
    const text = (await openRow()).text();
    expect(text).toContain("不生效");
    expect(text).toContain("家族基準高度");
    expect(text).toContain("錨點");
  });

  it("「有堆疊就蓋過家族綁定」講出來了 —— 不然操作者會在上面那張表白調半天", async () => {
    cover("adminui-vfx-layers-honesty");
    expect((await openRow()).text()).toContain("上面那張");
  });

  it("剩幾層直接寫在畫面上，加到上限那顆按鈕就按不動", async () => {
    cover("adminui-vfx-layers-honesty");
    bus.overlay.set(`config/${VFX_FAMILIES_DOC_ID}`, familiesDoc({ maxAbilityVfxLayers: 2 }));
    const h = await openRow();
    expect(h.text()).toContain("還可以加 2 層");
    await press(h, `layer.add.${ABILITY_ID}`);
    await press(h, `layer.add.${ABILITY_ID}`);
    expect(h.text()).toContain("還可以加 0 層");
    expect(h.field(`layer.add.${ABILITY_ID}`).props["disabled"]).toBe(true);
  });

  it("⚠️ 緞帶模板不會被端到操作者面前（選了會什麼都不畫）", async () => {
    cover("adminui-vfx-layers-honesty");
    const h = await openRow();
    await press(h, `layer.add.${ABILITY_ID}`);
    const values = optionValues(h.field("layer.0.vfxKey"));
    expect(values).toContain(NOVA);
    expect(values, "⚠️ 緞帶被列成可選的模板").not.toContain(RIBBON);
    // 而且它真的在目錄裡（是被「不能播」擋掉的，不是根本沒載到）
    expect(h.text()).toContain("放不了");
  });

  it("搜尋真的會縮小清單", async () => {
    cover("adminui-vfx-layers-honesty");
    const h = await openRow();
    await press(h, `layer.add.${ABILITY_ID}`);
    expect(optionValues(h.field("layer.0.vfxKey")).length).toBeGreaterThan(2);
    h.type("tpl.q", "ice");
    const values = optionValues(h.field("layer.0.vfxKey"));
    expect(values).toContain(NOVA);
    expect(values).not.toContain(BEAM);
    // 目前這一層選的那一份就算被篩掉也還在選單裡，不然一打字就把選擇弄丟
    expect(values).toContain(PULSE);
  });

  it("預覽卡上的參數是從那份文件讀的（換模板就換內容）", async () => {
    cover("adminui-vfx-layers-honesty");
    const h = await openRow();
    await press(h, `layer.add.${ABILITY_ID}`);
    const pulseText = h.text();
    h.type("layer.0.vfxKey", NOVA);
    const novaText = h.text();
    const summary = (id: string): string => templateFrom(id, vfxDoc(id)).summary;
    expect(pulseText).toContain(summary(PULSE));
    expect(novaText).toContain(summary(NOVA));
    expect(summary(PULSE)).not.toBe(summary(NOVA));
  });
});
