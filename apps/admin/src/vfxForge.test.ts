/**
 * 鑄技工坊 —— 純邏輯 + drift 守衛 (task #205 / #230 / #272).
 *
 * 這一組守的不是「按鈕會不會存」(那在 `vfxForgeSave.test.ts`),而是五件在畫面上
 * 完全看不出來的事:
 *
 *  1. **後台的欄位清單就是 shared 的 schema。** 家族 / 形狀 / 元素三個列舉是在
 *     執行期從 `zConfigVfxFamiliesDoc` 讀出來的,所以不可能漂;但中文標籤、原圖
 *     模型表、上下界是後台自己寫的,這裡逐一釘住。
 *
 *  2. ⚠️ **上界真的擋得住,而且和 Zod 是同一個數字。** 每一個數值欄位驗四個點
 *     (min / min−ε / max / max+ε),用**真的 `safeParse`**。schema 一改這裡就紅,
 *     所以不會出現「後台放行 500、下游靜默夾成 20」這種 GH#277 形狀。
 *
 *  3. ⚠️ **ABSENT ≠ ZERO。** 留白的 per-ability 欄位存檔時整個不寫進去;寫 0 會
 *     把「原圖沒說」變成「明確要求 0」(alpha 0 = 完全看不見)。
 *
 *  4. **「原作用的是哪個模型」那一欄不是我編的。** 21 個家族列出的模型檔名,每個
 *     家族至少要有一個真的出現在出貨的 w3x 考古檔裡。抄錯一個字,那一列就永遠
 *     推薦不出家族,而且不會有任何錯誤訊息。
 *
 *  5. ⚠️ **「現在畫的是什麼」讀的是解析結果,不是欄位。** 技能的特效綁定不走
 *     ability doc 的 `spawnVfx`,走 `vfxKey` → `ContentDb.vfxFor`。掃欄位會得到
 *     一個戲劇化但完全假的覆蓋率(第⑥⑦種),所以這裡用一個**指向不存在文件**的
 *     key 當哨兵。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  zConfigVfxFamiliesDoc,
  zVfxAbilityFamilyBinding,
  zVfxFamilyTuning,
  type VfxAbilityFamilyBinding,
  type VfxFamilyTuning,
  type W3xFamilyId,
} from "@ggd/shared/content/schema/vfx";
import { pageRequiresSession } from "./store";
import {
  ABILITY_BOUNDS,
  ABILITY_FIELDS,
  CENSUS_PATH,
  ELEMENT_IDS,
  ELEMENT_LABEL_ZH,
  FAMILY_BOUNDS,
  FAMILY_FIELDS,
  FAMILY_HINT,
  FAMILY_IDS,
  FAMILY_LABEL_ZH,
  FAMILY_MODELS,
  FIELD_HINT,
  FIELD_LABEL,
  GLOBAL_BOUNDS,
  GLOBAL_FIELDS,
  GLOBAL_CHOICE_FIELDS,
  GLOBAL_CHOICE_OPTIONS,
  validateGlobalChoiceField,
  OPTIONAL_GLOBAL_FIELDS,
  PRIMITIVE_KINDS,
  VFX_FAMILIES_DOC_ID,
  VFX_FAMILIES_SCHEMA,
  abilityBindingFromDraft,
  abilityDraftFrom,
  classifyOrigin,
  clearAbilityBinding,
  extractFamiliesDoc,
  familiesDocFor,
  familyCensusCounts,
  familyDraftFrom,
  familyForModel,
  familyTuningFromDraft,
  forgeRows,
  forgeSummary,
  loadForgeCatalog,
  parseCensus,
  setAbilityBinding,
  setFamilyTuning,
  splitAbilityId,
  suggestFamily,
  validateAbilityDraft,
  validateAbilityField,
  validateFamilyField,
  validateGlobalField,
  vfxDocIdFor,
  type AbilityDraft,
} from "./vfxForge";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
const readJson = (rel: string): unknown => JSON.parse(read(rel)) as unknown;

/** 出貨的 vfx 文件 id 集合 —— `ContentDb.vfxFor` 查的就是這一份 registry。 */
function shippedVfxIds(): Set<string> {
  const idx = readJson("content/vfx/_index.json") as { entries?: Array<{ id?: unknown }> };
  const out = new Set<string>();
  for (const e of idx.entries ?? []) if (typeof e.id === "string") out.add(e.id);
  return out;
}

const VFX_IDS = shippedVfxIds();
const CENSUS = parseCensus(readJson(`content/${CENSUS_PATH}`));

/** 一份合法的家族調校,用來當各種 safeParse 的底。 */
const BASE_TUNING: VfxFamilyTuning = {
  enabled: true,
  primitive: "shockwave",
  element: "earth",
  scale: 1,
  alpha: 1,
  timeScale: 1,
  heightY: 0.15,
};

describe("鑄技工坊 · 欄位清單來自 shared 的 schema (adminui-vfx-forge-schema)", () => {
  it("家族 / 形狀 / 元素三個列舉是執行期從 Zod 讀出來的，不是手抄的第二份", () => {
    cover("adminui-vfx-forge-schema");
    // 手抄的清單會在 schema 加一個成員時靜靜地少一項；讀出來的不會。
    expect(FAMILY_IDS.length).toBe(21);
    expect(PRIMITIVE_KINDS.length).toBe(13);
    expect(ELEMENT_IDS.length).toBe(13);
    // 而且每一個成員都真的被 schema 接受（證明讀到的是同一份東西）
    for (const p of PRIMITIVE_KINDS) {
      expect(zVfxFamilyTuning.safeParse({ ...BASE_TUNING, primitive: p }).success, p).toBe(true);
    }
    for (const e of ELEMENT_IDS) {
      expect(zVfxFamilyTuning.safeParse({ ...BASE_TUNING, element: e }).success, e).toBe(true);
    }
    for (const f of FAMILY_IDS) {
      expect(zVfxAbilityFamilyBinding.safeParse({ family: f }).success, f).toBe(true);
    }
  });

  it("每個家族都有中文標籤、原圖模型表、以及一句「它影響什麼」的說明", () => {
    cover("adminui-vfx-forge-schema");
    // 缺一個 = 畫面上出現一個英文 key，操作者不知道那是什麼
    expect(Object.keys(FAMILY_LABEL_ZH).sort()).toEqual([...FAMILY_IDS].sort());
    expect(Object.keys(FAMILY_MODELS).sort()).toEqual([...FAMILY_IDS].sort());
    expect(Object.keys(FAMILY_HINT).sort()).toEqual([...FAMILY_IDS].sort());
    for (const f of FAMILY_IDS) {
      expect(FAMILY_HINT[f]!.length, `${f} 的說明太短，多半只是複述家族名`).toBeGreaterThan(12);
    }
    for (const e of ELEMENT_IDS) expect(ELEMENT_LABEL_ZH[e], e).toBeTruthy();
  });

  it("每一個可編輯欄位都有標籤和「它影響什麼」的說明", () => {
    cover("adminui-vfx-forge-schema");
    for (const f of [...GLOBAL_FIELDS, ...FAMILY_FIELDS, ...ABILITY_FIELDS]) {
      expect(FIELD_LABEL[f], `${f} 沒有標籤`).toBeTruthy();
      expect(FIELD_HINT[f], `${f} 沒有說明`).toBeTruthy();
      expect(FIELD_HINT[f]!.length, `${f} 的說明太短`).toBeGreaterThan(8);
    }
  });

  it("後台編輯的欄位就是 schema 的欄位 —— 沒有存不進去的旋鈕", () => {
    cover("adminui-vfx-forge-schema");
    expect(Object.keys(zVfxFamilyTuning.shape).sort()).toEqual([...FAMILY_FIELDS].sort());
    // per-ability 的 tint 在 schema 是一個 3-tuple，後台拆成三格
    const schemaKeys = Object.keys(zVfxAbilityFamilyBinding.shape).sort();
    const uiKeys = ABILITY_FIELDS.filter((f) => !f.startsWith("tint"));
    expect([...uiKeys, "tint"].sort()).toEqual(schemaKeys);
  });
});

describe("鑄技工坊 · 上下界 (adminui-vfx-forge-bounds)", () => {
  const EPS = 1e-6;

  it("⚠️ 每一個家族欄位的上下界都用真的 Zod 驗過四個點", () => {
    cover("adminui-vfx-forge-bounds");
    for (const [field, b] of Object.entries(FAMILY_BOUNDS)) {
      const at = (v: number): boolean => zVfxFamilyTuning.safeParse({ ...BASE_TUNING, [field]: v }).success;
      expect(at(b.min), `${field} 的 min ${b.min} 被 schema 拒絕了`).toBe(true);
      expect(at(b.max), `${field} 的 max ${b.max} 被 schema 拒絕了`).toBe(true);
      expect(at(b.min - EPS), `${field} 的 min 抄大了 —— schema 其實收得下更小的`).toBe(false);
      expect(at(b.max + EPS), `${field} 的 max 抄小了 —— schema 其實收得下更大的`).toBe(false);
      // 而且後台自己也擋（不是只有 Zod 擋，那樣操作者要送出去才知道）
      expect(validateFamilyField(field as never, String(b.max + 1))).toContain("不能大於");
      expect(validateFamilyField(field as never, String(b.min - 1))).toContain("不能小於");
    }
  });

  it("⚠️ 每一個 per-ability 欄位的上下界都用真的 Zod 驗過四個點", () => {
    cover("adminui-vfx-forge-bounds");
    for (const [field, b] of Object.entries(ABILITY_BOUNDS)) {
      const build = (v: number): Record<string, unknown> =>
        field.startsWith("tint") ? { tint: [v, 0, 0] } : { [field]: v };
      const at = (v: number): boolean => zVfxAbilityFamilyBinding.safeParse(build(v)).success;
      const step = b.int ? 1 : EPS;
      expect(at(b.min), `${field} 的 min ${b.min} 被 schema 拒絕了`).toBe(true);
      expect(at(b.max), `${field} 的 max ${b.max} 被 schema 拒絕了`).toBe(true);
      expect(at(b.min - step), `${field} 的 min 抄大了`).toBe(false);
      expect(at(b.max + step), `${field} 的 max 抄小了`).toBe(false);
      expect(validateAbilityField(field as never, String(b.max + 1))).toContain("不能大於");
      expect(validateAbilityField(field as never, String(b.min - 1))).toContain("不能小於");
    }
  });

  it("⚠️ 三個全域縮放欄位同樣四個點都對得上", () => {
    cover("adminui-vfx-forge-bounds");
    const base = { id: "vfx-families", schema: VFX_FAMILIES_SCHEMA, enabled: true, scaleGain: 0.35, scaleMin: 0.5, scaleMax: 3, families: {}, abilities: {} };
    for (const [field, b] of Object.entries(GLOBAL_BOUNDS)) {
      const at = (v: number): boolean => zConfigVfxFamiliesDoc.safeParse({ ...base, [field]: v }).success;
      expect(at(b.min), `${field} min`).toBe(true);
      expect(at(b.max), `${field} max`).toBe(true);
      expect(at(b.min - EPS), `${field} min 抄大了`).toBe(false);
      expect(at(b.max + EPS), `${field} max 抄小了`).toBe(false);
      expect(validateGlobalField(field as never, String(b.max + 1))).toContain("不能大於");
    }
  });

  it("全域欄位是必填（留白不會被當成 0）；per-ability 欄位留白才是合法的", () => {
    cover("adminui-vfx-forge-bounds");
    // ⚠️ #205 —— `OPTIONAL_GLOBAL_FIELDS` 是 schema 上 optional 的那些
    // （`maxAbilityVfxLayers`）。它們必須**可以留白**，否則舊的 durable overlay
    // 一打開就是 dirty，操作者只是看一眼就會把一個他沒選過的值存上線。
    // 這條測試兩邊都驗：必填的仍然必填，可留白的必須真的收得下空字串 ——
    // 所以把一個欄位塞進豁免集合並不會讓這條測試變寬鬆。
    for (const f of GLOBAL_FIELDS) {
      if (OPTIONAL_GLOBAL_FIELDS.has(f)) {
        expect(validateGlobalField(f, ""), `${f} 是 optional，留白必須合法`).toBe("");
        // …但填了值仍然要照上下界檢查，不是「optional = 什麼都收」
        expect(validateGlobalField(f, "999"), `${f} 填了值卻不檢查上界`).not.toBe("");
        continue;
      }
      expect(validateGlobalField(f, "")).toBe("必填");
    }
    for (const f of ABILITY_FIELDS) expect(validateAbilityField(f, "  ")).toBe("");
    expect(validateAbilityField("family", "notAFamily")).toContain("不是一個已知的家族");
    expect(validateAbilityField("anchor", "x".repeat(33))).toContain("32");
    expect(validateAbilityField("tintR", "127.5")).toBe("必須是整數");
  });

  it("顏色三格要嘛都填要嘛都留白 —— 只填紅色會變成純紅", () => {
    cover("adminui-vfx-forge-bounds");
    const empty = abilityDraftFrom(null);
    expect(validateAbilityDraft(empty)).toEqual({});
    const partial: AbilityDraft = { ...empty, tintR: "255" };
    expect(validateAbilityDraft(partial).tintG).toContain("三格一起填");
    expect(abilityBindingFromDraft(partial)).toBeNull();
    const full: AbilityDraft = { ...empty, tintR: "255", tintG: "100", tintB: "100" };
    expect(abilityBindingFromDraft(full)?.tint).toEqual([255, 100, 100]);
  });
});

describe("鑄技工坊 · ABSENT ≠ ZERO (adminui-vfx-forge-absent)", () => {
  it("⚠️ 每一格都留白 → 什麼都不寫（不是寫一堆 0）", () => {
    cover("adminui-vfx-forge-absent");
    // 「把空字串當 0」的實作在這裡會回 {w3xScale:0, alpha:0, …} —— alpha 0 是
    // 完全看不見，而畫面上只是一排空欄位。
    expect(abilityBindingFromDraft(abilityDraftFrom(null))).toBeNull();
  });

  it("只填一格 → 只有那一格進文件，其餘的 key 根本不存在", () => {
    cover("adminui-vfx-forge-absent");
    const d: AbilityDraft = { ...abilityDraftFrom(null), w3xScale: "3" };
    const b = abilityBindingFromDraft(d)!;
    expect(Object.keys(b)).toEqual(["w3xScale"]);
    expect(b.alpha).toBeUndefined();
    expect(b.timeScale).toBeUndefined();
    expect(b.flyHeight).toBeUndefined();
  });

  it("填 0 是明確要求 0，和留白必須是兩件不同的事", () => {
    cover("adminui-vfx-forge-absent");
    const zero: AbilityDraft = { ...abilityDraftFrom(null), flyHeight: "0" };
    expect(abilityBindingFromDraft(zero)).toEqual({ flyHeight: 0 });
    const blank: AbilityDraft = { ...abilityDraftFrom(null), flyHeight: "" };
    expect(abilityBindingFromDraft(blank)).toBeNull();
  });
});

describe("鑄技工坊 · 存得進去讀得回來 (adminui-vfx-forge-roundtrip)", () => {
  /** 每一格都用一個和預設不同的哨兵值 —— 少搬一格就會被抓到。 */
  const SENTINEL: VfxAbilityFamilyBinding = {
    family: "shockwaveRing",
    enabled: true,
    w3xScale: 2.5,
    tint: [255, 100, 100],
    flyHeight: 360,
    alpha: 0.8,
    timeScale: 1.25,
    anchor: "right,hand",
  };

  const BASE_DOC = (): ReturnType<typeof familiesDocFor> =>
    familiesDocFor({
      id: VFX_FAMILIES_DOC_ID,
      schema: VFX_FAMILIES_SCHEMA,
      enabled: true,
      scaleGain: 0.35,
      scaleMin: 0.5,
      scaleMax: 3,
      families: Object.fromEntries(FAMILY_IDS.map((f) => [f, BASE_TUNING])) as never,
      abilities: {},
    });

  it("窮舉哨兵值：綁定 → 草稿 → 綁定 → 文件 → JSON → 伺服器的讀取器，每一格都在", () => {
    cover("adminui-vfx-forge-roundtrip");
    const back = abilityBindingFromDraft(abilityDraftFrom(SENTINEL));
    expect(back).toEqual(SENTINEL);

    const doc = familiesDocFor(setAbilityBinding(BASE_DOC(), "godie-e002.e", back!));
    const wire = JSON.parse(JSON.stringify(doc)) as unknown;
    // 讀回來用的是 shared 自己的 Zod —— shard 讀它的那條路
    const reread = extractFamiliesDoc(wire);
    expect(reread).not.toBeNull();
    expect(reread!.abilities["godie-e002.e"]).toEqual(SENTINEL);
    expect(reread!.schema).toBe(VFX_FAMILIES_SCHEMA);
  });

  /**
   * ⚠️ #205 —— `familiesDocFor` 是**手寫的欄位清單**,不是 spread。少寫一行,
   * 後台按存檔就會把那個全域欄位從文件裡刪掉,而畫面上那一格看起來還好好地
   * 填著值(第②號故障:算了但沒送到)。
   *
   * 突變驗證:把 `familiesDocFor` 裡的 `maxAbilityVfxLayers: doc.…` 那一行刪掉
   * → 這條紅(`reread.maxAbilityVfxLayers` 變 undefined)。
   */
  it("每一個 GLOBAL_FIELD 都撐得過 familiesDocFor —— 存檔不會靜靜刪掉欄位", () => {
    cover("adminui-vfx-forge-roundtrip");
    // 每一格都給一個和出貨預設不同的哨兵值
    const SENT: Record<string, number> = {
      scaleGain: 0.77,
      scaleMin: 0.6,
      scaleMax: 4.5,
      maxAbilityVfxLayers: 3,
      oneShotMaxLifeSec: 2,
      // #251 —— 投射物那兩格。這一條在我加欄位時**真的紅了一次**
      // (「projectileRadiusGain 沒有哨兵值」)，所以它不是裝飾。
      projectileRadiusGain: 0.4,
      projectileFlyHeightY: 1.6,
      // GH#379 —— 五格家族仰角。每一格都刻意**不是**出貨值，否則「掉了之後
      // 補回預設」會蒙混過關。
      beamPitchDeg: 12,
      slashPitchDeg: 44,
      boltPitchDeg: -8,
      dashPitchDeg: 6,
      tornadoPitchDeg: 80,
      // GH#456 —— 錐角五格。哨兵值刻意都 ≠ 出貨值，才驗得到「真的往返」。
      beamAngleDeg: 14,
      slashAngleDeg: 61,
      boltAngleDeg: 3,
      dashAngleDeg: 30,
      tornadoAngleDeg: 40,
    };
    const base = BASE_DOC();
    const withSentinels = { ...base } as Record<string, unknown>;
    for (const f of GLOBAL_FIELDS) withSentinels[f] = SENT[f];
    const wire = JSON.parse(
      JSON.stringify(familiesDocFor(withSentinels as never)),
    ) as unknown;
    const reread = extractFamiliesDoc(wire);
    expect(reread, "加了哨兵值之後整份文件過不了 shared 的 Zod").not.toBeNull();
    for (const f of GLOBAL_FIELDS) {
      expect(
        (reread as unknown as Record<string, unknown>)[f],
        `${f} 在 familiesDocFor → JSON → 讀回來的路上掉了`,
      ).toBe(SENT[f]);
    }
    // 而且每一格都有哨兵值可用（新增 GLOBAL_FIELD 但忘了補哨兵 = 這裡紅）
    for (const f of GLOBAL_FIELDS) expect(SENT[f], `${f} 沒有哨兵值`).toBeDefined();
  });

  /**
   * #251 —— 選擇題那兩格走的是**同一條存檔路徑**，所以要有同一條守衛。
   *
   * 突變驗證（2026-08-01，真的跑過）：把 `familiesDocFor` 裡的
   * `castHeightSource: doc.castHeightSource` 那一行刪掉 → 這條紅
   * （「castHeightSource 在 familiesDocFor → JSON → 讀回來的路上掉了：
   *   expected undefined to be 'family'」）。刪 `projectileArtFromDoc` 那一行
   * 同樣紅。兩行都在的時候綠。
   *
   * 這正是 owner 會踩到的形態：他在後台把「施法特效高度」切成別的值、按存檔，
   * 頁面顯示他選的那個，而文件裡那個 key 根本沒被寫出去 —— 下一次載入才發現
   * 又變回出貨預設。
   */
  it("兩格選擇題也撐得過 familiesDocFor —— 存檔不會靜靜刪掉下拉的值", () => {
    cover("adminui-vfx-forge-roundtrip");
    const SENT_CHOICE: Record<string, unknown> = {
      // 兩個都刻意選**不是出貨預設**的那一個，否則「掉了之後補回預設」會蒙混過關
      castHeightSource: "family",
      projectileArtFromDoc: false,
      // GH#379 —— 出貨是 true，所以哨兵值必須是 false。
      familyPitchDefaults: false,
      // GH#390 —— 同上，出貨是 true（特效音效預設開），哨兵值必須是 false。
      soundEnabled: false,
    };
    const withSentinels = { ...BASE_DOC() } as Record<string, unknown>;
    for (const f of GLOBAL_CHOICE_FIELDS) withSentinels[f] = SENT_CHOICE[f];
    const reread = extractFamiliesDoc(
      JSON.parse(JSON.stringify(familiesDocFor(withSentinels as never))) as unknown,
    );
    expect(reread, "加了哨兵值之後整份文件過不了 shared 的 Zod").not.toBeNull();
    for (const f of GLOBAL_CHOICE_FIELDS) {
      expect(SENT_CHOICE[f], `${f} 沒有哨兵值`).toBeDefined();
      expect(
        (reread as unknown as Record<string, unknown>)[f],
        `${f} 在 familiesDocFor → JSON → 讀回來的路上掉了`,
      ).toBe(SENT_CHOICE[f]);
    }
    // 每一個選項都要是 schema 收得下的值（下拉列了一個文件存不進去的值 = 白按）
    for (const f of GLOBAL_CHOICE_FIELDS) {
      for (const opt of GLOBAL_CHOICE_OPTIONS[f]) {
        expect(validateGlobalChoiceField(f, opt.value), `${f}=${opt.value}`).toBe("");
        // 布林欄位的下拉用 "1"/"0"；字串列舉直接照抄。
        const raw =
          f === "projectileArtFromDoc" || f === "familyPitchDefaults" || f === "soundEnabled"
            ? opt.value === "1"
            : opt.value;
        expect(
          zConfigVfxFamiliesDoc.safeParse({ ...BASE_DOC(), [f]: raw }).success,
          `${f} 的下拉選項 ${opt.value} 被 shared 的 Zod 擋下來`,
        ).toBe(true);
      }
      expect(validateGlobalChoiceField(f, ""), `${f} 留白必須合法`).toBe("");
      expect(validateGlobalChoiceField(f, "nonsense")).toContain("不是一個可選的值");
    }
  });

  it("每一個選填欄位單獨搬也不掉 —— 一格一格拆開驗", () => {
    cover("adminui-vfx-forge-roundtrip");
    const cases: VfxAbilityFamilyBinding[] = [
      { w3xScale: ABILITY_BOUNDS["w3xScale"]!.max },
      { alpha: ABILITY_BOUNDS["alpha"]!.min },
      { timeScale: ABILITY_BOUNDS["timeScale"]!.max },
      { flyHeight: ABILITY_BOUNDS["flyHeight"]!.min },
      { tint: [0, 0, 0] },
      { anchor: "origin" },
      { enabled: false },
      { family: "uncategorised" },
    ];
    for (const c of cases) {
      expect(abilityBindingFromDraft(abilityDraftFrom(c)), JSON.stringify(c)).toEqual(c);
      const doc = familiesDocFor(setAbilityBinding(BASE_DOC(), "x.q", c));
      const reread = extractFamiliesDoc(JSON.parse(JSON.stringify(doc)));
      expect(reread!.abilities["x.q"], JSON.stringify(c)).toEqual(c);
    }
  });

  it("每一種家族 × 每一種形狀 × 每一種元素都存得回來", () => {
    cover("adminui-vfx-forge-roundtrip");
    for (const fam of FAMILY_IDS) {
      for (const primitive of PRIMITIVE_KINDS) {
        const t: VfxFamilyTuning = { ...BASE_TUNING, primitive: primitive as never };
        const back = familyTuningFromDraft(familyDraftFrom(t));
        expect(back, `${fam}/${primitive}`).toEqual(t);
      }
      for (const element of ELEMENT_IDS) {
        const t: VfxFamilyTuning = { ...BASE_TUNING, element: element as never };
        expect(familyTuningFromDraft(familyDraftFrom(t)), `${fam}/${element}`).toEqual(t);
      }
    }
  });

  it("存檔送的是整張表 —— 改一支技能不會把別支的綁定或別的家族弄丟", () => {
    cover("adminui-vfx-forge-roundtrip");
    let doc = setAbilityBinding(BASE_DOC(), "a.q", { family: "burst" });
    doc = setAbilityBinding(doc, "b.w", { family: "tornado", w3xScale: 3 });
    doc = setFamilyTuning(doc, "blink" as W3xFamilyId, { ...BASE_TUNING, scale: 2 });
    doc = setAbilityBinding(doc, "a.q", { family: "blink" });
    const out = familiesDocFor(doc);
    expect(Object.keys(out.abilities)).toEqual(["a.q", "b.w"]);
    expect(out.abilities["b.w"]?.w3xScale).toBe(3);
    expect(out.abilities["a.q"]?.family).toBe("blink");
    expect(out.families["blink"]?.scale).toBe(2);
    // 沒被碰過的家族一個都不能少 —— 少一個，那個家族的技能全部退回猜的分類
    expect(Object.keys(out.families).sort()).toEqual([...FAMILY_IDS].sort());
  });

  it("移除一列 → 那個 key 消失，其他的原封不動", () => {
    cover("adminui-vfx-forge-roundtrip");
    let doc = setAbilityBinding(BASE_DOC(), "a.q", { family: "burst" });
    doc = setAbilityBinding(doc, "b.w", { family: "tornado" });
    const out = familiesDocFor(clearAbilityBinding(doc, "a.q"));
    expect(Object.keys(out.abilities)).toEqual(["b.w"]);
  });

  it("越界或型別不對的一筆整筆丟掉，不夾值也不補預設", () => {
    cover("adminui-vfx-forge-roundtrip");
    const ok: AbilityDraft = { ...abilityDraftFrom(null), w3xScale: "2" };
    expect(abilityBindingFromDraft(ok)?.w3xScale).toBe(2);
    // 靜默 clamp 的實作會在這裡回 { w3xScale: 20 }
    expect(abilityBindingFromDraft({ ...ok, w3xScale: "2000" })).toBeNull();
    expect(abilityBindingFromDraft({ ...ok, alpha: "2" })).toBeNull();
    expect(abilityBindingFromDraft({ ...ok, tintR: "300", tintG: "0", tintB: "0" })).toBeNull();
    expect(abilityBindingFromDraft({ ...ok, family: "nope" })).toBeNull();
  });

  it("schema 不對的文件不會被當成家族表讀進來", () => {
    cover("adminui-vfx-forge-roundtrip");
    expect(extractFamiliesDoc({ schema: "config.combat-env@1", families: {} })).toBeNull();
    expect(extractFamiliesDoc(null)).toBeNull();
    // 對的 schema、但內容過不了 Zod → null，而不是一份半殘的表
    expect(extractFamiliesDoc({ id: "x", schema: VFX_FAMILIES_SCHEMA })).toBeNull();
  });
});

describe("鑄技工坊 · 現在畫的是什麼 (adminui-vfx-forge-origin)", () => {
  it("⚠️ 讀的是 registry 解析結果，不是 vfxKey 這個欄位存不存在", () => {
    cover("adminui-vfx-forge-origin");
    // 哨兵：欄位有值、但 registry 裡沒有這份文件 → 什麼都不會畫。
    // 任何 `Boolean(vfxKey)` 的實作在這一行紅。
    expect(vfxDocIdFor("fx.prim.fire.nova", VFX_IDS)).toBe("fx.prim.fire.nova");
    expect(vfxDocIdFor("fx.prim.fire.this-doc-does-not-exist", VFX_IDS)).toBeNull();
    expect(vfxDocIdFor(null, VFX_IDS)).toBeNull();
    expect(classifyOrigin("fx.prim.fire.this-doc-does-not-exist", VFX_IDS)).toBe("none");
  });

  it("分類：家族 fx.fam.* / 猜的 fx.prim.* / 原作 fx.w3x.*、godie-* / 手寫 / 沒有", () => {
    cover("adminui-vfx-forge-origin");
    const ids = new Set([
      "fx.fam.shockwave-ring.physical.s100",
      "fx.prim.fire.nova",
      "fx.w3x.particle.holyawakening.p04",
      "godie-boomnl-p0",
      "fx.barkskin",
    ]);
    expect(classifyOrigin("fx.fam.shockwave-ring.physical.s100", ids)).toBe("family");
    expect(classifyOrigin("fx.prim.fire.nova", ids)).toBe("guessed");
    expect(classifyOrigin("fx.w3x.particle.holyawakening.p04", ids)).toBe("w3x");
    expect(classifyOrigin("godie-boomnl-p0", ids)).toBe("w3x");
    expect(classifyOrigin("fx.barkskin", ids)).toBe("authored");
    expect(classifyOrigin(undefined, ids)).toBe("none");
  });

  it("摘要的每個數字都經過解析 —— 掛掉的 key 算「沒有特效」不是「猜的」", () => {
    cover("adminui-vfx-forge-origin");
    const ids = new Set(["fx.prim.fire.nova"]);
    const rows = forgeRows(
      [
        { id: "a.q", name: "好的", vfxKey: "fx.prim.fire.nova" },
        { id: "a.w", name: "掛掉的", vfxKey: "fx.prim.fire.nope" },
        { id: "a.e", name: "沒填的", vfxKey: null },
      ],
      ids,
      new Map(),
      null,
    );
    const s = forgeSummary(rows);
    expect(s.total).toBe(3);
    expect(s.drawing).toBe(1);
    expect(s.guessed).toBe(1);
    expect(s.none).toBe(2);
  });
});

describe("鑄技工坊 · 原作模型那一欄 (adminui-vfx-forge-census)", () => {
  it("⚠️ 每個家族至少有一個模型檔名真的出現在出貨的 w3x 考古檔裡", () => {
    cover("adminui-vfx-forge-census");
    const seen = new Set<string>();
    for (const row of CENSUS.values()) for (const a of row.art) seen.add(a.stem);
    expect(seen.size).toBeGreaterThan(100);
    const orphan = FAMILY_IDS.filter((f) => !(FAMILY_MODELS[f] ?? []).some((m) => seen.has(m)));
    expect(orphan, `這些家族列的模型名在普查裡一次都沒出現，「原作」那一欄會永遠空白：${orphan.join("、")}`).toEqual(
      [],
    );
  });

  it("同一個模型不可以同時屬於兩個家族 —— 否則推薦是擲骰子", () => {
    cover("adminui-vfx-forge-census");
    const owner = new Map<string, string>();
    const dup: string[] = [];
    for (const [fam, models] of Object.entries(FAMILY_MODELS)) {
      for (const m of models) {
        expect(m, `模型名必須小寫無空白：${m}`).toBe(m.trim().toLowerCase());
        const prev = owner.get(m);
        if (prev) dup.push(`${m}: ${prev} / ${fam}`);
        owner.set(m, fam);
      }
    }
    expect(dup).toEqual([]);
  });

  it("普查真的解得出 WarStompCaster，而且它落在衝擊波環家族", () => {
    cover("adminui-vfx-forge-census");
    expect(familyForModel("WarStompCaster")).toBe("shockwaveRing");
    expect(familyForModel("thunderclapcaster")).toBe("shockwaveRing");
    expect(familyForModel("boomnl")).toBe("uncategorised");
    expect(familyForModel("SomethingNobodyImported")).toBeNull();

    // `godie-e001.passive` 在出貨的普查裡就是 WarStompCaster（stock-inherited）。
    // 這是 owner 要看的那一句話「這支現在畫的是猜的，原作其實是 WarStompCaster」
    // 的資料來源，所以它必須真的從檔案裡讀得出來。
    const row = CENSUS.get("godie-e001.passive");
    expect(row, "出貨的普查檔少了 godie-e001.passive").toBeTruthy();
    expect(row!.art.map((a) => a.stem)).toContain("warstompcaster");
    expect(suggestFamily(row)?.family).toBe("shockwaveRing");
  });

  it("美術依證據強度排序 —— JASS 直接寫的排在繼承來的前面", () => {
    cover("adminui-vfx-forge-census");
    const parsed = parseCensus({
      abilities: {
        "x.q": {
          rawcodes: ["A001"],
          realArt: [
            { channel: "art:caster", stem: "WarStompCaster", path: "p", provenance: "stock-inherited" },
            { channel: "jass:effectLoc", stem: "Boomnl", path: "q", provenance: "jass-literal" },
          ],
        },
      },
    });
    const row = parsed.get("x.q");
    expect(row!.art[0]!.provenance).toBe("jass-literal");
    // 推薦跟著證據走：最強的那一筆是 Boomnl → 未分類
    expect(suggestFamily(row)?.family).toBe("uncategorised");
  });

  it("家族引用次數是檢視時算的，不是抄一個會過期的常數", () => {
    cover("adminui-vfx-forge-census");
    const counts = familyCensusCounts(CENSUS);
    expect([...counts.keys()].sort()).toEqual([...FAMILY_IDS].sort());
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(top?.[0]).toBe("shockwaveRing");
    expect(top?.[1]).toBeGreaterThan(100);
    // 換一份普查就換一組數字 —— 證明它不是常數
    expect(familyCensusCounts(new Map()).get("shockwaveRing")).toBe(0);
  });
});

describe("鑄技工坊 · 表格 (adminui-vfx-forge-rows)", () => {
  it("技能 id 拆成英雄 + 槽位，排序是英雄 → 天生技/Q/W/E/R/EX", () => {
    cover("adminui-vfx-forge-rows");
    expect(splitAbilityId("godie-e002.ex")).toEqual({ championId: "godie-e002", slot: "ex" });
    expect(splitAbilityId("weird")).toEqual({ championId: "weird", slot: "" });
    const rows = forgeRows(
      [
        { id: "b.q", name: "b-q", vfxKey: null },
        { id: "a.r", name: "a-r", vfxKey: null },
        { id: "a.passive", name: "a-p", vfxKey: null },
        { id: "a.q", name: "a-q", vfxKey: null },
      ],
      new Set(),
      new Map(),
      null,
    );
    expect(rows.map((r) => r.abilityId)).toEqual(["a.passive", "a.q", "a.r", "b.q"]);
  });

  it("一列同時帶著「現在畫什麼」「原作畫什麼」「這一頁綁了什麼」三件事", () => {
    cover("adminui-vfx-forge-rows");
    const ids = new Set(["fx.prim.fire.nova"]);
    const census = parseCensus({
      abilities: {
        "godie-e002.e": {
          rawcodes: ["A0D5"],
          realArt: [{ channel: "art:caster", stem: "WarStompCaster", path: "…", provenance: "w3a-override" }],
        },
      },
    });
    const doc = extractFamiliesDoc({
      id: VFX_FAMILIES_DOC_ID,
      schema: VFX_FAMILIES_SCHEMA,
      enabled: true,
      scaleGain: 0.35,
      scaleMin: 0.5,
      scaleMax: 3,
      families: {},
      abilities: { "godie-e002.e": { family: "shockwaveRing", w3xScale: 2.5 } },
    });
    const row = forgeRows([{ id: "godie-e002.e", name: "約束與勝利之劍", vfxKey: "fx.prim.fire.nova" }], ids, census, doc)[0]!;
    expect(row.origin).toBe("guessed");
    expect(row.originalArt[0]?.stem).toBe("warstompcaster");
    expect(row.suggested?.family).toBe("shockwaveRing");
    expect(row.binding?.w3xScale).toBe(2.5);
    expect(row.effectiveFamily).toBe("shockwaveRing");
  });
});

describe("鑄技工坊 · drift 守衛 (adminui-vfx-forge-drift)", () => {
  it("出貨的 content/config/vfx-families.json 過得了 shared 的 Zod，而且後台讀得懂", () => {
    cover("adminui-vfx-forge-drift");
    const rel = "content/config/vfx-families.json";
    expect(existsSync(join(REPO, rel)), `${rel} 不見了 —— 這一頁沒有東西可以編輯`).toBe(true);
    const doc = extractFamiliesDoc(readJson(rel));
    expect(doc, `${rel} 過不了 zConfigVfxFamiliesDoc`).not.toBeNull();
    expect(doc!.id).toBe(VFX_FAMILIES_DOC_ID);
    // 21 個家族一個都不能少：出貨表少一個，那個家族的下拉選項會畫不出來
    expect(Object.keys(doc!.families).sort()).toEqual([...FAMILY_IDS].sort());
    // 而且它真的在 config 索引裡（否則線上載不到）
    const idx = readJson("content/config/_index.json") as { entries?: Array<{ id?: unknown }> };
    expect((idx.entries ?? []).map((e) => e.id)).toContain(VFX_FAMILIES_DOC_ID);
  });

  it("出貨表裡每一個家族的每一格都在後台的上下界內 —— 面板打不開的欄位不存在", () => {
    cover("adminui-vfx-forge-drift");
    const doc = extractFamiliesDoc(readJson("content/config/vfx-families.json"))!;
    for (const [fam, t] of Object.entries(doc.families)) {
      const draft = familyDraftFrom(t);
      for (const f of FAMILY_FIELDS) {
        expect(validateFamilyField(f, draft[f]), `${fam}.${f} = ${draft[f]} 被後台自己的驗證擋下來`).toBe("");
      }
      // 出貨值 → 草稿 → 回來，必須一模一樣
      expect(familyTuningFromDraft(draft), fam).toEqual(t);
    }
    for (const f of GLOBAL_FIELDS) {
      expect(validateGlobalField(f, String(doc[f])), `${f} = ${doc[f]} 被後台擋下來`).toBe("");
    }
  });

  it("出貨表裡每一筆 per-ability 綁定都讀得回來（草稿 round-trip 不掉格）", () => {
    cover("adminui-vfx-forge-drift");
    const doc = extractFamiliesDoc(readJson("content/config/vfx-families.json"))!;
    const ids = Object.keys(doc.abilities);
    expect(ids.length, "出貨表一筆 per-ability 綁定都沒有").toBeGreaterThan(0);
    for (const id of ids) {
      const b = doc.abilities[id]!;
      expect(abilityBindingFromDraft(abilityDraftFrom(b)), id).toEqual(b);
    }
  });

  it("這一頁真的掛上去了：Page 型別 / NAV / render 三個地方", () => {
    cover("adminui-vfx-forge-drift");
    const store = read("apps/admin/src/store.ts");
    const app = read("apps/admin/src/ui/App.tsx");
    expect(store, "store.ts 的 Page union 少了 vfxForge").toContain('| "vfxForge"');
    expect(app, "NAV 少了這一列 —— 頁面存在但按不到").toContain('page: "vfxForge"');
    expect(app, "NAV 標籤不見了").toContain("鑄技工坊");
    expect(app, "shell 沒有 mount VfxForgePage").toContain('page === "vfxForge" && <VfxForgePage />');
  });

  it("寫入走 putOverlayDoc → 這一頁必須在 session 閘裡（問真的函式，不是掃字串）", () => {
    cover("adminui-vfx-forge-drift");
    // ⚠️ 這一條原本寫成 `/SESSION_REQUIRED_PAGES[\s\S]*"vfxForge"/` 的原始碼比對，
    // 而它**永遠會 match**：store.ts 上半部的註解就提過 SESSION_REQUIRED_PAGES，
    // 而 Page union 裡的 `| "vfxForge"` 就是後面那半。把整行從閘裡刪掉，測試照樣
    // 全綠（我真的跑過這個突變）。所以改成問出貨的那個判斷函式本人。
    expect(pageRequiresSession("vfxForge"), "vfxForge 沒有進 SESSION_REQUIRED_PAGES").toBe(true);
    expect(pageRequiresSession("hub")).toBe(false);
  });
});

describe("鑄技工坊 · 讀出貨資料 (adminui-vfx-forge-load)", () => {
  it("三份出貨資料都抓，一份技能文件壞掉不會讓整頁空白", async () => {
    cover("adminui-vfx-forge-load");
    const asked: string[] = [];
    const fetchFn = (async (url: string): Promise<Response> => {
      asked.push(url);
      const body = url.endsWith("abilities/_index.json")
        ? { entries: [{ id: "a.q", path: "abilities/a.q.json" }, { id: "a.w", path: "abilities/a.w.json" }] }
        : url.endsWith("vfx/_index.json")
          ? { entries: [{ id: "fx.prim.fire.nova", path: "vfx/x.json" }] }
          : url.endsWith(CENSUS_PATH)
            ? { abilities: { "a.q": { rawcodes: [], realArt: [] } } }
            : url.endsWith("a.q.json")
              ? { id: "a.q", name: "第一招", vfxKey: "fx.prim.fire.nova" }
              : null;
      if (body === null) return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;

    const cat = await loadForgeCatalog({ fetchFn, base: "/content", concurrency: 2 });
    expect(asked.some((u) => u.includes(CENSUS_PATH))).toBe(true);
    expect(cat.vfxIds.has("fx.prim.fire.nova")).toBe(true);
    expect(cat.abilities).toHaveLength(2);
    // #205 —— 整份技能文件也留著（多層堆疊編輯器要它當底，不然存檔會把其他欄位弄丟）
    expect(cat.abilities[0]).toEqual({
      id: "a.q",
      name: "第一招",
      vfxKey: "fx.prim.fire.nova",
      doc: { id: "a.q", name: "第一招", vfxKey: "fx.prim.fire.nova" },
    });
    // 讀不到的那一支留 id-only，不是消失
    expect(cat.abilities[1]).toEqual({ id: "a.w", name: "a.w", vfxKey: null });
  });
});
