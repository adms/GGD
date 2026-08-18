/**
 * 多層特效堆疊綁定器 —— 純邏輯 + drift + 「選了會不會真的畫得出來」.
 *
 * 這個檔刻意**不**測「有幾個函式存在」「有幾份 doc 存在」那種屬性。它測的是:
 *
 *   · 層的參數欄位是不是**從 schema pick 出來的**(多一個少一個都紅);
 *   · 上下界是不是**同一份 Zod 的四個點**(抄錯一個數字就紅);
 *   · 一份 `ribbon@1` 模板被選進層之後,**真的 registry 分流**會不會讓它變成
 *     「存得進去、場上什麼都不畫」(第②號故障),而目錄有沒有先攔下來;
 *   · 出貨的 631 份模板裡,不能播的那些數量是**現算的**,不是抄一個會過期的數字。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentStore, RibbonDefs, VfxDefs, registerAll } from "@ggd/shared/content";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  DEFAULT_MAX_ABILITY_VFX_LAYERS,
  zAbilityVfxLayer,
} from "@ggd/shared/content/schema/abilityVfx";
import {
  ABILITY_BOUNDS,
  ABILITY_FIELDS,
  DEAD_FAMILY_KNOBS,
  DEAD_KNOB_NOTE,
  FAMILY_FIELDS,
  FIELD_HINT,
} from "./vfxForge";
import {
  DELAY_BOUND,
  LAYER_BOUNDS,
  LAYER_FIELDS,
  LAYER_PARAM_FIELDS,
  NON_LAYER_ABILITY_FIELDS,
  abilityDocWithLayers,
  addLayer,
  capNoticeText,
  emptyLayerDraft,
  filterTemplates,
  layerCapOf,
  layerDraftsFrom,
  layerFromDraft,
  layersRemaining,
  moveLayer,
  removeLayer,
  templateColorHex,
  templateFrom,
  templateSummary,
  validateLayerDraft,
  type LayerDraft,
} from "./vfxLayers";

const REPO = join(__dirname, "..", "..", "..");
const CONTENT = join(REPO, "content");

/** 一份最小但**真的過得了 ability@1** 的技能文件（其他欄位都是 schema 必填的）。 */
function abilityDoc(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "godie-test.q",
    schema: "ability@1",
    name: "測試技能",
    slot: "Q",
    castType: "self",
    maxRank: 4,
    cooldown: [8],
    manaCost: [40],
    range: 0,
    effects: [],
    vfxKey: "fx.prim.arcane.pulse-lg",
    ...extra,
  };
}

function draft(over: Record<string, string> = {}): LayerDraft {
  return { ...emptyLayerDraft("fx.prim.arcane.pulse-lg"), ...over };
}

// ---------------------------------------------------------------------------

describe("層的欄位不是這裡發明的 (adminui-vfx-layers-fields)", () => {
  it("參數格 = **層 schema 真的收得下**的那些 —— 多一個少一個都紅", () => {
    cover("adminui-vfx-layers-fields");
    // ⚠️ 2026-08-19（GH#390）：這一條以前把**同一段推導抄了一遍**
    // （`ABILITY_FIELDS` 減掉手打的 `NON_LAYER_ABILITY_FIELDS`），
    // 於是它結構上抓不到自己要抓的那個漏 —— 實作與斷言一起錯就一起綠
    // （失敗形態⑤：被測的不是出貨的那個）。音效那批一加進 `ABILITY_FIELDS`
    // 就漏進層編輯器，而這條測試是綠的。
    // ⇒ 現在錨在**層 schema 自己**，那是唯一的真相來源。
    const schemaKeys = Object.keys(zAbilityVfxLayer.shape);
    // ⚠️ `tint` 在 schema 是**一個三元組**，後台表把它拆成 `tintR`/`tintG`/`tintB`
    // 三格草稿欄位。⛔ 這不是漏，是刻意的表示法差異 —— 而且它是一個**真的陷阱**：
    // 我第一版把 `tint` 直接濾掉，結果三格顏色旋鈕整個從層編輯器消失，
    // 而所有測試都是綠的。⇒ 這裡把它**展開**，⛔ 不是排除。
    const expected = schemaKeys
      .filter((f) => !["vfxKey", "enabled", "attachTo", "delayMs"].includes(f))
      .flatMap((f) => (f === "tint" ? ["tintR", "tintG", "tintB"] : [f]));
    expect([...LAYER_PARAM_FIELDS].sort()).toEqual([...expected].sort());
    // 而且那兩個被排除的欄位確實還在家族綁定那張表上（不是被誰刪掉了）
    for (const f of NON_LAYER_ABILITY_FIELDS) {
      expect(ABILITY_FIELDS as readonly string[]).toContain(f);
    }
  });

  it("⛔ 音效欄位進不了層 —— 它們住在家族／逐支那兩層，硬塞會被 .strict() 擋掉", () => {
    cover("adminui-vfx-layers-fields");
    // GH#390 的實際缺陷：`soundLaunch` 一族是**字串**（audio-map 的 key），
    // 而 `ForgeBound` 是純數值 ⇒ 漏進來就是「畫得出格子、沒有上下界、被當數字、
    // 存檔時整層被拒」。⛔ 這一條把那個狀態釘死。
    for (const f of ["soundLaunch", "soundImpact", "soundLoop", "soundDissipate", "soundGain"]) {
      expect(LAYER_FIELDS, `${f} 不該出現在層編輯器`).not.toContain(f);
      expect(
        zAbilityVfxLayer.safeParse({ vfxKey: "fx.prim.arcane.pulse-lg", [f]: "wc3.x" }).success,
        `層 schema 應該擋掉 ${f}`,
      ).toBe(false);
    }
    // ⭐ 反向：它們**確實**存在於技能那一層（不是被誰刪掉了，也不是打錯字）
    expect(ABILITY_FIELDS as readonly string[]).toContain("soundLaunch");
  });

  it("⚠️ anchor 進不了層 —— schema 的 .strict() 會擋，這是刻意的（沒有 bone parenting）", () => {
    cover("adminui-vfx-layers-fields");
    expect(LAYER_FIELDS).not.toContain("anchor");
    const withAnchor = zAbilityVfxLayer.safeParse({
      vfxKey: "fx.prim.arcane.pulse-lg",
      anchor: "right,hand",
    });
    expect(withAnchor.success, "schema 收下了 anchor —— 那就是一個寫了會被吃掉的欄位").toBe(false);
  });

  it("參數格的上下界就是 ABILITY_BOUNDS 那一份（同一個物件，不是抄的）", () => {
    cover("adminui-vfx-layers-fields");
    for (const f of LAYER_PARAM_FIELDS) {
      expect(LAYER_BOUNDS[f], `${f} 沒有上下界`).toBeDefined();
      expect(LAYER_BOUNDS[f]).toBe(ABILITY_BOUNDS[f]);
    }
  });

  it("delayMs 的上下界對真的 schema 驗四個點（min / min−ε / max / max+ε）", () => {
    cover("adminui-vfx-layers-fields");
    const at = (delayMs: number): boolean =>
      zAbilityVfxLayer.safeParse({ vfxKey: "fx.prim.arcane.pulse-lg", delayMs }).success;
    expect(at(DELAY_BOUND.min), "下界本身該過").toBe(true);
    expect(at(DELAY_BOUND.min - 1), "下界外該被擋").toBe(false);
    expect(at(DELAY_BOUND.max), "上界本身該過").toBe(true);
    expect(at(DELAY_BOUND.max + 1), "⚠️ 上界外沒被擋 —— 8000 打成 80000 會過後台").toBe(false);
  });

  it("每一個數字格都有上界，不是只有下界（CLAUDE.md 點名的那個洞）", () => {
    cover("adminui-vfx-layers-fields");
    for (const [f, b] of Object.entries(LAYER_BOUNDS)) {
      expect(Number.isFinite(b.max), `${f} 沒有上界`).toBe(true);
      expect(b.max).toBeGreaterThan(b.min);
    }
  });
});

describe("留白 ≠ 0 (adminui-vfx-layers-absent)", () => {
  it("只選了模板 → 送出的層**只有** vfxKey 一個 key", () => {
    cover("adminui-vfx-layers-absent");
    const layer = layerFromDraft(draft());
    expect(layer).toEqual({ vfxKey: "fx.prim.arcane.pulse-lg" });
    expect(Object.keys(layer ?? {})).toEqual(["vfxKey"]);
  });

  it("填了才進去，而且值就是打的那個（不夾、不四捨五入）", () => {
    cover("adminui-vfx-layers-absent");
    const layer = layerFromDraft(
      draft({ delayMs: "620", w3xScale: "1.8", alpha: "0.85", timeScale: "2.4", attachTo: "point" }),
    );
    expect(layer).toEqual({
      vfxKey: "fx.prim.arcane.pulse-lg",
      attachTo: "point",
      delayMs: 620,
      w3xScale: 1.8,
      alpha: 0.85,
      timeScale: 2.4,
    });
  });

  it("顏色三格要一起填 —— 只填紅色會被擋（不然特效變純紅）", () => {
    cover("adminui-vfx-layers-absent");
    const errs = validateLayerDraft(draft({ tintR: "255" }));
    expect(errs["tintG"]).toContain("三格");
    expect(layerFromDraft(draft({ tintR: "255" }))).toBeNull();
    expect(layerFromDraft(draft({ tintR: "255", tintG: "100", tintB: "100" }))).toEqual({
      vfxKey: "fx.prim.arcane.pulse-lg",
      tint: [255, 100, 100],
    });
  });

  it("越界的值被擋下來（回訊息），不是靜默夾掉", () => {
    cover("adminui-vfx-layers-absent");
    const errs = validateLayerDraft(draft({ delayMs: "80000", alpha: "9" }));
    expect(errs["delayMs"]).toContain("不能大於");
    expect(errs["alpha"]).toContain("不能大於");
  });
});

describe("排序與增刪 (adminui-vfx-layers-order)", () => {
  it("上移／下移真的換位置（順序決定截斷時誰被砍、誰先進粒子池）", () => {
    cover("adminui-vfx-layers-order");
    const a = draft({ vfxKey: "a" });
    const b = draft({ vfxKey: "b" });
    const c = draft({ vfxKey: "c" });
    expect(moveLayer([a, b, c], 2, -1).map((d) => d["vfxKey"])).toEqual(["a", "c", "b"]);
    expect(moveLayer([a, b, c], 0, 1).map((d) => d["vfxKey"])).toEqual(["b", "a", "c"]);
    // 邊界不會爆，也不會靜靜吃掉一層
    expect(moveLayer([a, b, c], 0, -1).map((d) => d["vfxKey"])).toEqual(["a", "b", "c"]);
    expect(moveLayer([a, b, c], 2, 1)).toHaveLength(3);
  });

  it("加一層／刪一層", () => {
    cover("adminui-vfx-layers-order");
    expect(addLayer([], "fx.x")).toHaveLength(1);
    expect(addLayer([], "fx.x")[0]?.["vfxKey"]).toBe("fx.x");
    expect(removeLayer([draft({ vfxKey: "a" }), draft({ vfxKey: "b" })], 0).map((d) => d["vfxKey"])).toEqual(["b"]);
  });
});

describe("層數上限接在後台那一格上 (adminui-vfx-layers-cap)", () => {
  it("上限來自 config.vfx-families 的欄位，沒設就是出貨預設", () => {
    cover("adminui-vfx-layers-cap");
    expect(layerCapOf(null)).toBe(DEFAULT_MAX_ABILITY_VFX_LAYERS);
    expect(layerCapOf({})).toBe(DEFAULT_MAX_ABILITY_VFX_LAYERS);
    expect(layerCapOf({ maxAbilityVfxLayers: 2 })).toBe(2);
  });

  it("後台打錯字塞不爆 GPU —— 硬上限夾住", () => {
    cover("adminui-vfx-layers-cap");
    expect(layerCapOf({ maxAbilityVfxLayers: 999 })).toBe(ABILITY_VFX_LAYER_HARD_CAP);
    expect(layerCapOf({ maxAbilityVfxLayers: 0 })).toBe(1);
  });

  it("畫面上「還可以加幾層」是算出來的，而且超過上限會明講多的不會播", () => {
    cover("adminui-vfx-layers-cap");
    expect(layersRemaining(2, 5)).toBe(3);
    expect(layersRemaining(6, 5)).toBe(0);
    expect(capNoticeText(2, 5)).toContain("還可以加 3 層");
    expect(capNoticeText(6, 5)).toContain("超過上限");
    expect(capNoticeText(6, 5)).toContain("不會播");
  });
});

describe("送出的是整份技能文件 (adminui-vfx-layers-doc)", () => {
  it("疊三層 → 整份文件帶著 vfxLayers，而且過得了 shared 的 zAbilityDoc", () => {
    cover("adminui-vfx-layers-doc");
    const built = abilityDocWithLayers(abilityDoc(), [
      draft(),
      draft({ vfxKey: "fx.prim.ice.nova", delayMs: "220", w3xScale: "1.8" }),
      draft({ vfxKey: "fx.prim.holy.beam-lg", delayMs: "620", attachTo: "point" }),
    ]);
    expect(built.error).toBeNull();
    expect((built.doc as { vfxLayers: unknown[] }).vfxLayers).toHaveLength(3);
    // 技能文件其餘欄位一個字都沒被動過
    expect(built.doc?.["name"]).toBe("測試技能");
    expect(built.doc?.["cooldown"]).toEqual([8]);
  });

  it("⚠️ 清空 → `vfxLayers` 這個 key **整個消失**，不是寫一個空陣列", () => {
    cover("adminui-vfx-layers-doc");
    const withLayers = abilityDoc({ vfxLayers: [{ vfxKey: "fx.prim.arcane.pulse-lg" }] });
    const built = abilityDocWithLayers(withLayers, []);
    expect(built.error).toBeNull();
    expect("vfxLayers" in (built.doc ?? {})).toBe(false);
    // 空陣列本身是 schema 拒絕的（.min(1)）——「空堆疊」和「沒有堆疊」不是同一件事
    expect(abilityDocWithLayers(abilityDoc({ vfxLayers: [] }), []).error).toBeNull();
  });

  it("讀得回上一次存的堆疊（存 → 讀 → 再存不會走樣）", () => {
    cover("adminui-vfx-layers-doc");
    const first = abilityDocWithLayers(abilityDoc(), [draft({ delayMs: "220", alpha: "0.8" })]);
    const drafts = layerDraftsFrom(first.doc);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.["delayMs"]).toBe("220");
    expect(drafts[0]?.["alpha"]).toBe("0.8");
    const second = abilityDocWithLayers(first.doc, drafts);
    expect(second.doc).toEqual(first.doc);
  });

  it("一列填錯 → 不產生文件，而且說得出是第幾層", () => {
    cover("adminui-vfx-layers-doc");
    const built = abilityDocWithLayers(abilityDoc(), [draft(), draft({ vfxKey: "" })]);
    expect(built.doc).toBeNull();
    expect(built.error).toContain("第 2 層");
  });

  it("超過硬上限直接擋（後台的 6 就是 schema 的 6）", () => {
    cover("adminui-vfx-layers-doc");
    const many = Array.from({ length: ABILITY_VFX_LAYER_HARD_CAP + 1 }, () => draft());
    expect(abilityDocWithLayers(abilityDoc(), many).doc).toBeNull();
  });

  it("底是壞的（讀不到技能文件）就明說，不會 PUT 一份殘缺文件上去", () => {
    cover("adminui-vfx-layers-doc");
    expect(abilityDocWithLayers(null, [draft()]).doc).toBeNull();
    expect(abilityDocWithLayers({ id: "x" }, [draft()]).error).toContain("ability@1");
  });
});

// ---------------------------------------------------------------------------
// 「選了會不會真的畫得出來」—— 這一段是行為，不是屬性
// ---------------------------------------------------------------------------

const VFX_DOC = {
  id: "fx.test.particle",
  schema: "vfx@1",
  emitter: { shape: "sphere", radius: 0.9 },
  mode: "burst",
  burstCount: 16,
  lifetimeSec: { min: 0.3, max: 0.6 },
  size: { start: 0.3, end: 0 },
  color: { start: [1, 0.5, 0.25, 1], end: [0.2, 0.1, 0, 0] },
  blendMode: "additive",
};

const RIBBON_DOC = {
  id: "fx.test.ribbon",
  schema: "ribbon@1",
  widthAbove: 0.2,
  widthBelow: 0.2,
  lifespanSec: 0.25,
  color: [1, 1, 1, 1],
  blendMode: "additive",
};

describe("⚠️ ribbon@1 放進施法層 = 存得進去、場上什麼都不畫 (adminui-vfx-layers-playable)", () => {
  beforeEach(() => {
    for (const r of [VfxDefs, RibbonDefs]) r.clear();
    for (const r of [Abilities, Champions]) r.clear();
  });

  it("真的 registry 分流：ribbon 進 RibbonDefs，而施法層解析走 VfxDefs", () => {
    cover("adminui-vfx-layers-playable");
    const store = new ContentStore();
    store.add("vfx", VFX_DOC.id, VFX_DOC);
    store.add("vfx", RIBBON_DOC.id, RIBBON_DOC);
    registerAll(store);
    // 這就是 `ContentDb.vfxFor` 唯一做的事
    expect(VfxDefs.tryGet(VFX_DOC.id), "粒子模板該解得到").toBeDefined();
    expect(
      VfxDefs.tryGet(RIBBON_DOC.id),
      "⚠️ 緞帶如果解得到，這條守衛的前提就不成立了",
    ).toBeUndefined();
    expect(RibbonDefs.tryGet(RIBBON_DOC.id), "緞帶該在另一個 registry").toBeDefined();
  });

  it("目錄先攔下來：緞帶被標成不能播，而且說得出理由", () => {
    cover("adminui-vfx-layers-playable");
    const particle = templateFrom(VFX_DOC.id, VFX_DOC);
    const ribbon = templateFrom(RIBBON_DOC.id, RIBBON_DOC);
    expect(particle.playable).toBe(true);
    expect(ribbon.playable, "⚠️ 緞帶被當成可選 —— 操作者選下去會得到「什麼都不畫」").toBe(false);
    expect(ribbon.unplayableReason).toContain("RibbonDefs");
  });

  it("而且判斷依據是文件的 schema，不是 id 前綴 —— 一個叫 fx.prim.* 的緞帶照樣被擋", () => {
    cover("adminui-vfx-layers-playable");
    const disguised = templateFrom("fx.prim.fire.trail", { ...RIBBON_DOC, id: "fx.prim.fire.trail" });
    expect(disguised.playable).toBe(false);
    expect(disguised.kind).toBe("ribbon");
  });

  it("篩選預設不列不能播的，但總數那一行仍然說得出它們存在", () => {
    cover("adminui-vfx-layers-playable");
    const list = [templateFrom(VFX_DOC.id, VFX_DOC), templateFrom(RIBBON_DOC.id, RIBBON_DOC)];
    expect(filterTemplates(list, {}).map((t) => t.id)).toEqual([VFX_DOC.id]);
    expect(filterTemplates(list, { playableOnly: false })).toHaveLength(2);
  });

  it("搜尋吃 id、種類與參數摘要", () => {
    cover("adminui-vfx-layers-playable");
    const list = [templateFrom(VFX_DOC.id, VFX_DOC)];
    expect(filterTemplates(list, { query: "particle" })).toHaveLength(1);
    expect(filterTemplates(list, { query: "additive" })).toHaveLength(1);
    expect(filterTemplates(list, { query: "沒有這個字" })).toHaveLength(0);
    expect(filterTemplates(list, { kind: "w3x-orb" })).toHaveLength(0);
  });
});

describe("預覽卡讀的是文件本身 (adminui-vfx-layers-preview)", () => {
  it("顏色 swatch 從 doc 的 color.start 算，不是從 id 的元素名猜", () => {
    cover("adminui-vfx-layers-preview");
    expect(templateColorHex(VFX_DOC)).toBe("#ff8040");
    // 改文件 → swatch 跟著改；改 id 不會
    expect(templateColorHex({ ...VFX_DOC, color: { start: [0, 0, 1, 1] } })).toBe("#0000ff");
    expect(templateColorHex({ ...VFX_DOC, id: "fx.prim.ice.nova" })).toBe("#ff8040");
    // 讀不到就中性灰，不假裝知道
    expect(templateColorHex({ id: "x" })).toBe("#8a95ad");
  });

  it("摘要說的每一項都在文件裡", () => {
    cover("adminui-vfx-layers-preview");
    const s = templateSummary(VFX_DOC);
    expect(s).toContain("sphere");
    expect(s).toContain("16");
    expect(s).toContain("0.3");
    expect(s).toContain("additive");
  });
});

describe("死旋鈕的清單本身要說得通 (adminui-vfx-dead-knobs)", () => {
  it("清單裡的每一格都是真的欄位（打錯字的話警語就在指一個不存在的東西）", () => {
    cover("adminui-vfx-dead-knobs");
    const known = new Set<string>([...FAMILY_FIELDS, ...ABILITY_FIELDS]);
    for (const f of DEAD_FAMILY_KNOBS) {
      expect(known.has(f), `${f} 不是家族／技能綁定的欄位`).toBe(true);
    }
  });

  it("⚠️ alpha / timeScale 不在死清單裡 —— 它們 2026-07-30 已經接上去了", () => {
    cover("adminui-vfx-dead-knobs");
    // 這條的用途是**反向**的:哪天有人把高度那三格也接上去,忘了把它們從清單
    // 拿掉,這裡不會紅 —— 所以清單縮小時要手動改。但把已經活的欄位又寫回清單
    // (等於在畫面上宣告一個活的旋鈕是死的)會紅。
    expect(DEAD_FAMILY_KNOBS).not.toContain("alpha");
    expect(DEAD_FAMILY_KNOBS).not.toContain("timeScale");
  });

  it("警語點名的三格，每一格自己的說明也要照實寫（不然操作者只看 tooltip 就被騙了）", () => {
    cover("adminui-vfx-dead-knobs");
    expect(DEAD_KNOB_NOTE).toContain("不生效");
    for (const f of DEAD_FAMILY_KNOBS) {
      expect(FIELD_HINT[f] ?? "", `${f} 的說明沒有講它現在不生效`).toContain("⚠️");
    }
  });
});

describe("出貨的 631 份模板：不能播的那些是現算的 (adminui-vfx-layers-census)", () => {
  it("content/vfx/ 真的混著兩種 schema，而且緞帶不是零", () => {
    cover("adminui-vfx-layers-census");
    const index = JSON.parse(readFileSync(join(CONTENT, "vfx", "_index.json"), "utf8")) as {
      entries: { id: string; path: string }[];
    };
    const templates = index.entries.map((e) =>
      templateFrom(e.id, JSON.parse(readFileSync(join(CONTENT, e.path), "utf8")) as unknown),
    );
    const playable = templates.filter((t) => t.playable);
    const blocked = templates.filter((t) => !t.playable);
    expect(templates.length).toBeGreaterThan(500);
    expect(playable.length + blocked.length).toBe(templates.length);
    // ⚠️ 這裡刻意**不**寫死 55。寫死一個數字就是抄一個會過期的事實;
    // 這條守衛要說的是「不能播的那一群真的存在,而且每一個的理由都講得出來」。
    expect(blocked.length, "⚠️ 一份緞帶都沒有？那 playable 的判斷可能整組失效了").toBeGreaterThan(0);
    for (const t of blocked) {
      expect(t.schema, `${t.id} 被判成不能播但 schema 是 vfx@1`).not.toBe("vfx@1");
      expect(t.unplayableReason).toBeTruthy();
    }
    for (const t of playable) expect(t.schema).toBe("vfx@1");
  });
});
