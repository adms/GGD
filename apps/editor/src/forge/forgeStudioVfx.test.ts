/**
 * forgeStudioVfx.test.ts — 鑄技工坊的「特效多重選取」守衛。
 *
 * 這一組守的是 owner 2026-08-02 那半句：「包括多重選取模板及**特效**的設定部分」。
 * 模板那半（卡片列）由 `forgeStudioStack.test.ts` 守；這一份守特效那半。
 *
 * ⚠️ **不要把這裡的斷言改成掃 UI**。工坊的價值在於「操作者按完之後，
 * 寫進 doc 的東西是不是載入器展開得動的那個形狀」——
 * 所以每一條都對 `patchForDoc` 的輸出、用真的 `zAbilityDoc` 驗。
 *
 * 用到的三個 vfx id 是**出貨的檔案**（`schema/abilityVfx.ts` 檔頭的範例，
 * 那段 JSON 被 `abilityVfx.test.ts` 剖出來對 `content/vfx/` 驗過存在）。
 */
import { describe, expect, it } from "vitest";
import { zAbilityVfxLayers } from "@ggd/shared/content/schema/abilityVfx";
import { resolveAbilityVfxLayers, isLegacySingleVfx } from "@ggd/shared/content/schema/abilityVfx";
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  addLayer,
  draftsFromDoc,
  emptyVfxLayerDraft,
  moveLayer,
  patchForDoc,
  patchLayer,
  removeLayer,
  validateVfxLayerDraft,
  vfxLayerBlockers,
} from "./vfxLayerModel";

const NOVA = "fx.w3x.locust.frostnova.p01";
const ICE_NOVA = "fx.prim.ice.nova";
const SHOCK = "fx.prim.ice.shockwave";

describe("開啟工坊時的種子 —— 646 支只有 vfxKey 的技能不可以看到空白", () => {
  it("只有 vfxKey 的 doc 種出恰好一層，而且就是它現在在播的那個", () => {
    const ls = draftsFromDoc({ id: "x", vfxKey: NOVA });
    expect(ls).toHaveLength(1);
    expect(ls[0]!.vfxKey).toBe(NOVA);
    // 零覆寫 —— 打開工坊不會憑空幫人填一堆數字進去。
    expect(ls[0]!.delayMs).toBe("");
    expect(ls[0]!.w3xScale).toBe("");
  });

  it("已經有 vfxLayers 的 doc 照抄，順序不動", () => {
    const ls = draftsFromDoc({
      id: "x",
      vfxKey: NOVA,
      vfxLayers: [{ vfxKey: NOVA }, { vfxKey: ICE_NOVA, delayMs: 220, w3xScale: 1.8 }],
    });
    expect(ls.map((l) => l.vfxKey)).toEqual([NOVA, ICE_NOVA]);
    expect(ls[1]!.delayMs).toBe("220");
    expect(ls[1]!.w3xScale).toBe("1.8");
  });

  it("兩個欄位都沒有 → 空列（這支技能施法不畫東西，維持原樣）", () => {
    expect(draftsFromDoc({ id: "x" })).toEqual([]);
  });
});

describe("★ 相容路徑：一層零覆寫**不可以**被寫成 vfxLayers", () => {
  // 這一條是這個檔案裡最重要的。`resolveAbilityVfxLayers` 對「只有 vfxKey」的 doc
  // 走 identity 路徑，原封不動回傳同一個 VfxDoc 物件（同一個 reference）。
  // 如果工坊順手把每一支都升級成一層的 vfxLayers，646 支技能就全部離開那條
  // 被守衛釘住的相容路徑 —— 行為上等價，但一位元不差的保證沒了。
  it("單層零覆寫只寫 vfxKey，不寫 vfxLayers", () => {
    const patch = patchForDoc([emptyVfxLayerDraft(NOVA)]);
    expect(patch.vfxKey).toBe(NOVA);
    expect(patch.vfxLayers).toBeUndefined();
    expect(isLegacySingleVfx({ vfxKey: patch.vfxKey })).toBe(true);
  });

  it("單層**有**覆寫就要寫成 vfxLayers —— 不然那個覆寫會被靜默丟掉", () => {
    const patch = patchForDoc([{ ...emptyVfxLayerDraft(NOVA), w3xScale: "1.8" }]);
    expect(patch.vfxLayers).toHaveLength(1);
    expect(patch.vfxLayers![0]!.w3xScale).toBe(1.8);
  });

  it("空列 → 兩個欄位都不寫（呼叫端負責把舊的 vfxLayers 刪掉）", () => {
    expect(patchForDoc([])).toEqual({});
  });
});

describe("★ 多重選取 —— 加的層真的到得了播放端", () => {
  it("三層依序寫出，而且 resolveAbilityVfxLayers 讀得回同樣三層", () => {
    let ls = [emptyVfxLayerDraft(NOVA)];
    ls = addLayer(ls, ICE_NOVA);
    ls = patchLayer(ls, 1, { delayMs: "220", w3xScale: "1.8", alpha: "0.85" });
    ls = addLayer(ls, SHOCK);
    ls = patchLayer(ls, 2, { delayMs: "620", attachTo: "point", timeScale: "2.4", tint: "90,170,255" });

    const patch = patchForDoc(ls);
    expect(zAbilityVfxLayers.safeParse(patch.vfxLayers).success).toBe(true);

    // 讀回來 —— 這是「寫進去的東西播放端拿得到」的證明，不是「陣列長度是 3」。
    const resolved = resolveAbilityVfxLayers({ vfxKey: patch.vfxKey, vfxLayers: patch.vfxLayers });
    expect(resolved.map((r) => r.vfxKey)).toEqual([NOVA, ICE_NOVA, SHOCK]);
    expect(resolved[0]!.overrides).toBeUndefined(); // 第一層零覆寫 → identity
    expect(resolved[1]!.delayMs).toBe(220);
    expect(resolved[1]!.overrides).toEqual({ w3xScale: 1.8, alpha: 0.85 });
    expect(resolved[2]!.attachTo).toBe("point");
    expect(resolved[2]!.overrides).toEqual({ timeScale: 2.4, tint: [90, 170, 255] });
  });

  it("vfxKey 保證等於第一層 —— 普查頁與 CodexDetail 讀的是它", () => {
    const ls = [emptyVfxLayerDraft(NOVA), emptyVfxLayerDraft(ICE_NOVA)];
    expect(patchForDoc(ls).vfxKey).toBe(NOVA);
    expect(patchForDoc(moveLayer(ls, 0, 1)).vfxKey).toBe(ICE_NOVA);
  });
});

describe("順序就是語意 —— 由上往下依序播，所以移動要能做", () => {
  it("↓ 交換兩層，展開後的順序跟著換", () => {
    const ls = moveLayer([emptyVfxLayerDraft(NOVA), emptyVfxLayerDraft(ICE_NOVA)], 0, 1);
    expect(patchForDoc(ls).vfxLayers!.map((l) => l.vfxKey)).toEqual([ICE_NOVA, NOVA]);
  });

  it("越界的移動是 no-op，不是丟東西", () => {
    const ls = [emptyVfxLayerDraft(NOVA)];
    expect(moveLayer(ls, 0, -1)).toEqual(ls);
    expect(moveLayer(ls, 0, 1)).toEqual(ls);
  });

  it("✕ 移到 0 層是允許的 —— 那代表「回到單值 vfxKey」，跟模板卡片列不一樣", () => {
    expect(removeLayer([emptyVfxLayerDraft(NOVA)], 0)).toEqual([]);
  });
});

describe("★ 上限來自 shared，不是工坊自己發明的數字", () => {
  it("加到硬上限就停 —— 而那個上限接在客戶端的粒子預算上", () => {
    let ls = [emptyVfxLayerDraft(NOVA)];
    for (let i = 0; i < 20; i++) ls = addLayer(ls, ICE_NOVA);
    expect(ls).toHaveLength(ABILITY_VFX_LAYER_HARD_CAP);
  });

  it("GUARD THE GUARD：上限真的是從 schema 來的（改了那邊這裡會跟著動）", () => {
    // 硬編一個 6 在這裡就會讓上面那條變成同義反覆。
    expect(ABILITY_VFX_LAYER_HARD_CAP).toBeGreaterThan(1);
    const overCap = Array.from({ length: ABILITY_VFX_LAYER_HARD_CAP + 1 }, () => ({
      vfxKey: NOVA,
    }));
    expect(zAbilityVfxLayers.safeParse(overCap).success).toBe(false);
  });
});

describe("驗證用真的 Zod，界限不會跟 schema 漂開", () => {
  it("delayMs 超過 schema 的上界被擋，而且訊息指名那一格", () => {
    const errs = validateVfxLayerDraft({ ...emptyVfxLayerDraft(NOVA), delayMs: "99999" });
    expect(Object.keys(errs)).toContain("delayMs");
  });

  it("tint 三格要一起填 —— 兩格是打錯，不是「部分覆寫」", () => {
    const errs = validateVfxLayerDraft({ ...emptyVfxLayerDraft(NOVA), tint: "90,170" });
    expect(errs["tint"]).toMatch(/三個/);
  });

  it("空的 vfxKey 擋下來 —— 一層看不見的東西存進去就是故障形態 ②", () => {
    expect(validateVfxLayerDraft(emptyVfxLayerDraft(""))["vfxKey"]).toBeTruthy();
  });

  it("ABSENT ≠ ZERO：留空的覆寫格整個不寫，不是寫 0", () => {
    const patch = patchForDoc([{ ...emptyVfxLayerDraft(NOVA), alpha: "", w3xScale: "1.5" }]);
    const layer = patch.vfxLayers![0]!;
    expect(layer.w3xScale).toBe(1.5);
    expect("alpha" in layer).toBe(false); // alpha: 0 是「完全透明」，不是「沒填」
  });

  it("blockers 把每一層的問題都指名到層號", () => {
    const blockers = vfxLayerBlockers([emptyVfxLayerDraft(NOVA), emptyVfxLayerDraft("")]);
    expect(blockers.some((b) => b.includes("第 2 層"))).toBe(true);
    expect(blockers.some((b) => b.includes("第 1 層"))).toBe(false);
  });
});
