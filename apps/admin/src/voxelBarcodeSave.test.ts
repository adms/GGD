/**
 * 體素條碼 — WHAT THE PAGE ACTUALLY SENDS, AND WHAT IT ACTUALLY PAINTS.
 *
 * 規格 §8 names the assertions that prove nothing, and this page is a magnet for
 * every one of them:
 *
 *   ❌ 「表單有 11 個 input」 — proves a control exists, not that its value is
 *      ever read. Deleting the payload builder leaves it green.
 *   ❌ `expect(src).toMatch(/putOverlayDoc\(/)` — 源碼掃描. Proves the line was
 *      typed into the file. The 殭屍波系統 suite shipped with exactly this guard,
 *      and an independent verifier swapped the payload for the shipped defaults
 *      without turning it red.
 *   ❌ reading `data-slot="hair"` to check a colour — 屬性掃描. An attribute is
 *      not a pixel, and a preview that renders nothing still carries them.
 *
 * So every test here MOUNTS THE PAGE (src/testkit/headlessUi supplies the ~200
 * lines of React a form needs — there is no jsdom in this monorepo), types into
 * the REAL controls, presses the REAL button, and then asserts on either
 *
 *   · the object handed to `putOverlayDoc`, or
 *   · the INLINE STYLE of the preview's own children — `backgroundColor` and
 *     `height`, plus a blacklist that refuses `display:none` / `opacity:0` /
 *     `height:0`, because "it is in the tree" and "it is on the screen" are two
 *     different claims and this repo has shipped the first one before.
 *
 * The one direction that matters most, restated: the payload must carry what the
 * OPERATOR TYPED, and be distinguishable from both the shipped seed and the doc
 * the page loaded. §8's mutation 5 (後台存檔時改送出貨預設值) is v0.9.1's real
 * defect, not a hypothetical.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { VoxelBarcodePage } from "./ui/VoxelBarcodePage";
import { extractBarcodes, type VoxelBarcode } from "./voxelBarcode";
import { mount, optionValues, type HostNode, type RenderedNode } from "./testkit/headlessUi";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** The real shipped seed — the same bytes the page fetches from /content. */
const SEED_FILE = JSON.parse(
  readFileSync(join(REPO, "content/models/_voxel-barcodes.json"), "utf8"),
) as Record<string, unknown>;
const SEED = extractBarcodes(SEED_FILE);
const LUFFY = SEED["godie-u00n"]!;
const ZORO = SEED["godie-udre"]!;

// --------------------------------------------------------------- fixtures ---

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  putRejects: false,
  overlayDoc: null as unknown,
  champions: [] as Array<{ id: string; name: string }>,
  seedBody: null as unknown,
  seedOk: true,
  generation: 0,
}));

/** Hooks are ours; element creation (react/jsx-runtime) stays REAL. */
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
      // deep copy: the assertions must see what was SENT, not a later mutation
      bus.puts.push({
        collection,
        id,
        doc: JSON.parse(JSON.stringify(doc)) as Record<string, unknown>,
      });
      return { generation: ++bus.generation };
    },
  };
});

vi.mock("./content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./content")>();
  return {
    ...actual,
    loadCollection: async (): Promise<Array<{ id: string; name: string }>> => bus.champions,
  };
});

const ROSTER = [
  { id: "godie-u00n", name: "魯夫" },
  { id: "godie-udre", name: "索隆" },
  { id: "godie-hblm", name: "賈修" },
];

const SAVE = "儲存 Save";
const NORMALIZE = "正規化佔比";
const REVERT = "改回出貨預設值";

beforeEach(() => {
  bus.puts.length = 0;
  bus.putRejects = false;
  bus.generation = 0;
  bus.overlayDoc = null;
  bus.champions = ROSTER.map((c) => ({ ...c }));
  bus.seedBody = JSON.parse(JSON.stringify(SEED_FILE)) as unknown;
  bus.seedOk = true;
  // The seed is a static file on the /content mount, so it is a plain fetch.
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (!u.includes("_voxel-barcodes.json")) throw new Error(`unexpected fetch: ${u}`);
    return {
      ok: bus.seedOk,
      status: bus.seedOk ? 200 : 404,
      json: async () => bus.seedBody,
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

async function open(): Promise<ReturnType<typeof mount>> {
  const h = mount(createElement(VoxelBarcodePage));
  await h.flush();
  return h;
}

/** The barcodes map that reached the durable writer on the Nth save. */
function sentBarcodes(nth = 0): Record<string, VoxelBarcode> {
  const call = bus.puts[nth];
  if (!call) throw new Error(`putOverlayDoc was never called (call #${nth})`);
  return extractBarcodes(call.doc);
}

function sent(championId: string, nth = 0): VoxelBarcode {
  const hit = sentBarcodes(nth)[championId];
  if (!hit) throw new Error(`the doc that was sent carries no barcode for ${championId}`);
  return hit;
}

/** The preview's own child nodes, in paint order. */
function bands(h: ReturnType<typeof mount>): HostNode[] {
  const container = h.field("barcode-preview");
  return container.children.filter((c: RenderedNode): c is HostNode => typeof c !== "string");
}

function styleOf(node: HostNode): Record<string, unknown> {
  return (node.props["style"] ?? {}) as Record<string, unknown>;
}

/** "16.0000004%" → 16.0000004 */
function pct(node: HostNode): number {
  const h = styleOf(node)["height"];
  if (typeof h !== "string" || !h.endsWith("%")) {
    throw new Error(`a preview band's height is not a percentage: ${JSON.stringify(h)}`);
  }
  return Number(h.slice(0, -1));
}

// ================================================================== SAVING ==

describe("the save carries the operator's edits, not the seed and not the load", () => {
  it("every KIND of edit lands in the payload", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-udre"); // 索隆
    h.type("band.hair.hex", "#00FF7F"); // a colour nobody shipped
    // the 黑腹卷 grows and the shirt gives way — the pair keeps the sum at 1.0,
    // so Save stays reachable without a normalise step
    h.type("band.waist.frac", "0.11");
    h.type("band.top.frac", "0.22");
    h.type("sleeve", "short");
    h.type("face.eye", "#0000FF");
    h.type("face.nose.present", "yes");
    h.type("face.nose", "#FF00FF");
    h.type("note", "測試用的備註");
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(1);
    const out = sent("godie-udre");
    expect(out.bands.hair!.hex).toBe("#00FF7F");
    expect(out.sleeve).toBe("short");
    expect(out.faceColors.eye).toBe("#0000FF");
    expect(out.faceColors.nose).toBe("#FF00FF");
    expect(out.note).toBe("測試用的備註");
    // the 黑腹卷 really did grow relative to the shirt
    expect(out.bands.waist!.frac / out.bands.top!.frac).toBeGreaterThan(
      ZORO.bands.waist!.frac / ZORO.bands.top!.frac,
    );

    // …and the direction that matters: it is NOT the shipped seed.
    expect(out).not.toEqual(ZORO);
    expect(out.bands.hair!.hex).not.toBe(ZORO.bands.hair!.hex);
  });

  it("the colour SWATCH is wired too, not just the hex box", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-u00n");
    h.type("band.hatBand.swatch", "#123456");
    h.click(SAVE);
    await h.flush();

    expect(sent("godie-u00n").bands.hatBand!.hex).toBe("#123456");
  });

  it("an UNTOUCHED band is written with the value the page loaded, not a default", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-u00n"); // 魯夫
    h.type("band.top.hex", "#AA0000"); // touch exactly one thing
    h.click(SAVE);
    await h.flush();

    const out = sent("godie-u00n");
    expect(out.bands.top!.hex).toBe("#AA0000");
    // everything else is 魯夫's shipped barcode, band for band — a page that
    // rebuilt the payload from a blank form would lose the 紅帽帶 here
    expect(out.bands.hatBand).toEqual(LUFFY.bands.hatBand);
    expect(out.bands.hatBrim).toEqual(LUFFY.bands.hatBrim);
    expect(out.bands.shin).toEqual(LUFFY.bands.shin);
    expect(out.sleeve).toBe("none");
  });

  it("the write is the DURABLE one, and it is audit-stamped as manual", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-udre");
    h.type("band.hair.hex", "#00FF7F");
    h.click(SAVE);
    await h.flush();

    const call = bus.puts[0];
    expect(call?.collection).toBe("config");
    expect(call?.id).toBe("voxel-barcodes");
    // `source` is what tells an owner decision from an extractor bug three
    // months from now, and the two have opposite remedies
    expect(sent("godie-udre").source).toBe("manual");
    expect(sent("godie-udre").v).toBe(1);
  });

  it("OTHER champions' barcodes ride along untouched", async () => {
    cover("admin-voxel-barcode-save");
    // the overlay already holds an edited 魯夫
    const editedLuffy: VoxelBarcode = {
      ...LUFFY,
      bands: { ...LUFFY.bands, hair: { hex: "#ABCDEF", frac: 0.16 } },
    };
    bus.overlayDoc = {
      id: "voxel-barcodes",
      schema: "config.voxel-barcodes@1",
      barcodes: { "godie-u00n": editedLuffy },
    };
    const h = await open();

    h.type("champion", "godie-udre");
    h.type("band.hair.hex", "#00FF7F");
    h.click(SAVE);
    await h.flush();

    // the overlay stores WHOLE documents — a save that rebuilt `barcodes` from
    // the champion on screen would silently delete 魯夫's authored look
    expect(sent("godie-u00n").bands.hair!.hex).toBe("#ABCDEF");
    expect(sent("godie-udre").bands.hair!.hex).toBe("#00FF7F");
  });

  it("同色相鄰帶 survive the round trip as TWO slots — the hip joint", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "placeholder.sanji"); // 香吉士, 黑西裝上下同色
    h.type("band.top.hex", "#0D0D0D");
    h.type("band.pants.hex", "#0D0D0D");
    h.click(SAVE);
    await h.flush();

    const out = sent("placeholder.sanji");
    expect(out.bands.top!.hex).toBe(out.bands.pants!.hex);
    expect(out.bands.top).not.toBe(out.bands.pants);
    expect(out.bands.top!.frac).toBeGreaterThan(0);
    expect(out.bands.pants!.frac).toBeGreaterThan(0);
  });

  it("a slot switched to 無 is stored as an explicit null", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-u00n");
    h.type("band.hatBand.present", "no"); // strip the 紅帽帶
    h.click(NORMALIZE);
    h.click(SAVE);
    await h.flush();

    const out = sent("godie-u00n");
    expect(out.bands.hatBand).toBeNull();
    expect("hatBand" in out.bands).toBe(true); // the KEY stays — absence is a statement
    expect(out.bands.hatBrim).not.toBeNull(); // and only that one went
  });

  it("a failed write reports the failure and keeps the edit in the box", async () => {
    cover("admin-voxel-barcode-save");
    bus.putRejects = true;
    const h = await open();

    h.type("champion", "godie-udre");
    h.type("band.hair.hex", "#00FF7F");
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(0);
    expect(h.text()).not.toContain("已寫入耐久覆蓋層");
    expect(h.text()).toContain("儲存失敗");
    expect(h.field("band.hair.hex").props["value"]).toBe("#00FF7F");
  });

  it("a successful save reports the generation the platform returned", async () => {
    cover("admin-voxel-barcode-save");
    bus.generation = 12;
    const h = await open();

    h.type("champion", "godie-udre");
    h.type("band.hair.hex", "#00FF7F");
    h.click(SAVE);
    await h.flush();

    expect(h.text()).toContain("已寫入耐久覆蓋層（generation 13）");
    expect(h.text()).toContain("沒有未儲存的變更");
  });

  it("Save is refused while the barcode is a 泥巴柱", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-udre");
    for (const slot of ["hair", "face", "top", "waist", "pants", "shoe"]) {
      h.type(`band.${slot}.hex`, "#404244");
    }
    expect(h.text()).toContain("泥巴柱");
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(bus.puts).toHaveLength(0);
  });
});

// =========================================== EDITED vs SHIPPED, AS A FACT ==

describe("後台改過的版本 and 出貨預設值 are distinguishable on screen and on the wire", () => {
  it("a champion nobody edited opens on the SEED and says so", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-udre");
    expect(h.field("band.hair.hex").props["value"]).toBe("#1E9E3E"); // 索隆綠
    expect(h.text()).toContain("出貨預設值");
    expect(h.text()).not.toContain("後台改過的版本");
  });

  it("a champion the overlay holds opens on the OVERLAY and says so", async () => {
    cover("admin-voxel-barcode-save");
    bus.overlayDoc = {
      id: "voxel-barcodes",
      schema: "config.voxel-barcodes@1",
      barcodes: {
        "godie-udre": {
          ...ZORO,
          bands: { ...ZORO.bands, hair: { hex: "#00FFFF", frac: 0.18 } },
        },
      },
    };
    const h = await open();

    h.type("champion", "godie-udre");
    expect(h.field("band.hair.hex").props["value"]).toBe("#00FFFF"); // live, not #1E9E3E
    expect(h.text()).toContain("後台改過的版本");
  });

  it("saving an untouched SEED champion still writes the seed's values, not a default figure", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-udre");
    h.click(SAVE);
    await h.flush();

    const out = sent("godie-udre");
    expect(out.bands.hair!.hex).toBe("#1E9E3E");
    expect(out.bands.waist!.hex).toBe("#111111"); // 黑腹卷 kept
    expect(out.bands.shin).toBeNull(); // 索隆 wears long trousers
  });

  it("改回出貨預設值 drops exactly that champion's override", async () => {
    cover("admin-voxel-barcode-save");
    bus.overlayDoc = {
      id: "voxel-barcodes",
      schema: "config.voxel-barcodes@1",
      barcodes: {
        "godie-udre": { ...ZORO, bands: { ...ZORO.bands, hair: { hex: "#00FFFF", frac: 0.18 } } },
        "godie-u00n": LUFFY,
      },
    };
    const h = await open();

    h.type("champion", "godie-udre");
    h.click(REVERT);
    await h.flush();

    const out = sentBarcodes();
    expect(out["godie-udre"]).toBeUndefined();
    expect(out["godie-u00n"]).toEqual(LUFFY);
    // and the form fell back to the seed in front of the operator
    expect(h.field("band.hair.hex").props["value"]).toBe("#1E9E3E");
    expect(h.text()).toContain("出貨預設值");
  });

  it("改回出貨預設值 is not even offered for a champion that has no override", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();

    h.type("champion", "godie-udre");
    expect(() => h.click(REVERT)).toThrow(/no button reads/);
  });

  it("the picker reaches 香吉士 even though the roster has no such champion", async () => {
    cover("admin-voxel-barcode-save");
    const h = await open();
    // parked in the `placeholder.` namespace; a picker built from
    // /content/champions alone would ship his barcode and make it uneditable
    expect(optionValues(h.field("champion"))).toContain("placeholder.sanji");
  });
});

// ================================================================= PREVIEW ==

describe("the CSS preview is real coloured geometry, not a decorated placeholder", () => {
  it("每一條帶都有實際的 background-color 與 height，順序是解剖順序", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();
    h.type("champion", "godie-u00n"); // 魯夫

    const painted = bands(h).map((n) => ({
      bg: styleOf(n)["backgroundColor"],
      pct: pct(n),
    }));

    // 草帽褐 / 紅帽帶 / 黑帽緣 / 膚 / 紅背心 / 藍短褲 / 膚色小腿 / 褐涼鞋
    expect(painted.map((p) => p.bg)).toEqual([
      "#C9A96A",
      "#E8112D",
      "#111111",
      "#F5CBA0",
      "#E8112D",
      "#0B5394",
      "#F5CBA0",
      "#8A6A3A",
    ]);
    expect(painted[0]!.pct).toBeCloseTo(16, 4);
    expect(painted[1]!.pct).toBeCloseTo(4, 4); // 紅帽帶 — 4%, and half of why he is him
    expect(painted[6]!.pct).toBeCloseTo(12, 4); // 膚色小腿
    // the column is fully covered — no transparent strip anywhere on the figure
    expect(painted.reduce((n, p) => n + p.pct, 0)).toBeCloseTo(100, 4);
  });

  it("none of the bands is invisible (display / opacity / height / visibility)", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();
    h.type("champion", "godie-u00n");

    // The container first: a hidden parent makes every child's colour a lie.
    const container = styleOf(h.field("barcode-preview"));
    expect(container["display"]).not.toBe("none");
    expect(container["visibility"]).not.toBe("hidden");
    expect(container["opacity"]).not.toBe(0);
    expect(container["height"]).toBeTypeOf("number");
    expect(container["height"]).toBeGreaterThan(0);

    const rows = bands(h);
    expect(rows.length).toBe(8);
    for (const node of rows) {
      const s = styleOf(node);
      const label = String(node.props["title"]);
      expect(s["display"], label).not.toBe("none");
      expect(s["visibility"], label).not.toBe("hidden");
      expect(s["opacity"], label).not.toBe(0);
      expect(s["opacity"], label).not.toBe("0");
      expect(pct(node), label).toBeGreaterThan(0);
      expect(String(s["backgroundColor"] ?? ""), label).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("changing a colour REPAINTS that band and only that band", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();
    h.type("champion", "godie-u00n");

    const before = bands(h).map((n) => styleOf(n)["backgroundColor"]);
    h.type("band.pants.hex", "#7F00FF");
    const after = bands(h).map((n) => styleOf(n)["backgroundColor"]);

    expect(after[5]).toBe("#7F00FF"); // 藍短褲 → 紫
    expect(before[5]).toBe("#0B5394");
    // every other stripe is untouched
    expect(after.filter((_, i) => i !== 5)).toEqual(before.filter((_, i) => i !== 5));
  });

  it("changing a 佔比 re-lays the whole column", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();
    h.type("champion", "godie-u00n");

    const hairBefore = pct(bands(h)[0]!);
    h.type("band.hair.frac", "0.32"); // double the straw hat
    const after = bands(h);
    expect(pct(after[0]!)).toBeGreaterThan(hairBefore);
    // the column still covers the figure exactly — the others gave way
    expect(after.reduce((n, node) => n + pct(node), 0)).toBeCloseTo(100, 4);
  });

  it("switching a 細帶 to 無 removes exactly that stripe from the picture", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();
    h.type("champion", "godie-u00n");
    expect(bands(h)).toHaveLength(8);

    h.type("band.hatBand.present", "no");

    const after = bands(h);
    expect(after).toHaveLength(7);
    // 紅帽帶's #E8112D is gone from the HEAD; the 紅背心's copy of the same hex
    // is still there, which is what makes this a claim about the stripe rather
    // than about the colour
    expect(after.map((n) => styleOf(n)["backgroundColor"])).toEqual([
      "#C9A96A",
      "#111111",
      "#F5CBA0",
      "#E8112D",
      "#0B5394",
      "#F5CBA0",
      "#8A6A3A",
    ]);
    expect(after.reduce((n, node) => n + pct(node), 0)).toBeCloseTo(100, 4);
  });

  it("香吉士's suit paints as TWO adjacent stripes of the same black", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();
    h.type("champion", "placeholder.sanji");

    const painted = bands(h).map((n) => styleOf(n)["backgroundColor"]);
    // 黃髮 / 膚 / 黑西裝上 / 黑西裝下 / 黑鞋 — the two blacks are separate rows,
    // because that hairline between them is the hip joint. Merge them and the
    // figure stops being able to walk.
    expect(painted).toEqual(["#F2E205", "#F5CBA0", "#0D0D0D", "#0D0D0D", "#000000"]);
    expect(bands(h)[2]).not.toBe(bands(h)[3]);
  });

  it("switching champion repaints the whole column", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();

    h.type("champion", "godie-udre"); // 索隆: 綠髮
    expect(styleOf(bands(h)[0]!)["backgroundColor"]).toBe("#1E9E3E");
    h.type("champion", "godie-u00n"); // 魯夫: 草帽褐
    expect(styleOf(bands(h)[0]!)["backgroundColor"]).toBe("#C9A96A");
  });

  it("a champion with no barcode still previews a paintable figure", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();

    h.type("champion", "godie-hblm"); // 賈修 — on the roster, on neither layer
    expect(h.text()).toContain("還沒有條碼");
    const rows = bands(h);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.reduce((n, node) => n + pct(node), 0)).toBeCloseTo(100, 4);
  });
});

// ============================================================ NO PIXEL PATH ==

describe("the page keeps its half of the contract: no pixels", () => {
  it("renders without any canvas / image / WebGL surface in the tree", async () => {
    cover("admin-voxel-barcode-preview");
    const h = await open();
    h.type("champion", "godie-u00n");
    const types = new Set(h.hosts().map((n) => n.type));
    for (const forbidden of ["canvas", "img", "svg", "picture", "video"]) {
      expect(types.has(forbidden), `the barcode page rendered a <${forbidden}>`).toBe(false);
    }
  });

  it("still works when /content is unreachable — the overlay layer alone edits", async () => {
    cover("admin-voxel-barcode-save");
    bus.seedOk = false;
    bus.overlayDoc = {
      id: "voxel-barcodes",
      schema: "config.voxel-barcodes@1",
      barcodes: { "godie-u00n": LUFFY },
    };
    const h = await open();

    expect(h.field("band.hair.hex").props["value"]).toBe("#C9A96A");
    h.type("band.hair.hex", "#FFFFFF");
    h.click(SAVE);
    await h.flush();
    expect(sent("godie-u00n").bands.hair!.hex).toBe("#FFFFFF");
  });
});
