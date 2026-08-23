/**
 * ⭐ M1（GH#599）—— 「變身外觀掛在**狀態**上，⛔ 而不是掛在變身態 championId 上」。
 *
 * ===========================================================================
 * 這一條在守什麼
 * ===========================================================================
 * 七軸量測（`docs/_reports/變身態退場評估v2_temp_20260823-0210.md`）量到：5 對變身
 * 在畫面上的**全部**差別就是三個旋鈕 —— 顏色 · 大小 · 掛件。而在 M1 之前這三個旋鈕
 * 的鍵是「變身態的 championId」，也就是說它們的存在**依賴那份變身態 champion doc
 * 活著**。owner 2026-08-22 要的正好相反：「變身帶來許多問題，因此我想要開啟變身態
 * 盡可能下架」。
 *
 * ⇒ 這一條驗的機制是：**身體還是本體（`bodyChampionIdFor` 沒有換 id），只因為身上
 * 掛著一個狀態，三個旋鈕就全部生效**；狀態拿掉，三個旋鈕全部回去。
 *
 * ===========================================================================
 * ⛔ 為什麼斷言讀的是這三個物件，不是 `resolveFormVisual` 的回傳值
 * ===========================================================================
 * v1 的失敗正是「掃了 `modelKey` 就下結論」。所以這裡一律讀**下游真的會被交出去的
 * 那個物件**，而它們正好是三條完全不同的路：
 *
 *   · 顏色 → `championTintFor(e)`    → `EntityViewRegistry.applyTint` 寫進材質
 *   · 大小 → `modelOverrideFor(e)`   → `ChampionView.tryUpgradeToGlb` 的 relativeScale
 *   · 掛件 → `formAttachmentSpecFor` → `ChampionView` 掛第二顆 glb 用的 spec（帶 glbPath）
 *
 * 三條任何一條沒接上，這一組就紅 —— ⛔ 而它們不可能同時因為「我改了測試的假資料」
 * 而一起變綠：顏色那條乘的是**出貨英雄文件自己的 w3x 頂點色**，大小那條乘的是
 * `_standin-overrides` 的 `relativeScale`。
 *
 * 突變（2026-08-23 真的做過）：把 `championBody.ts` 的 `formVisualFor` 還原成
 * `content.formVisualFor(bodyChampionIdFor(e))`（＝ M1 之前那一行）⇒ 這一組全紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readContentJson } from "../../testkit/contentFixtures";
import { resolveFormVisual } from "@ggd/shared/content";
import { DEFAULT_FORM_VISUALS, type ConfigFormVisualsDoc } from "@ggd/shared/content/schema/config";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";
import type { ModelDoc } from "@ggd/shared/content";
import type { EntityViewState, ModelDocOverride } from "../EntityViewRegistry";
import { championBodyHooks, type ChampionBodyContent } from "./championBody";
import { formAttachmentSpecFor } from "./formVisual";

/**
 * #06 傑·富力士的**本體**。挑它有兩個理由，兩個都承重：
 *   ① 它是出貨 26 對裡唯一**自己就帶 w3x 頂點色**的（`[0.3922, 1, 0.3922]` 綠），
 *      所以「顏色是相乘不是取代」這件事在斷言裡看得見；
 *   ② 它是 base（`Eme1`）那一半 —— 整組斷言因此同時證明 ⛔ **沒有換 championId**。
 */
const BASE_ID = "godie-ucrl";
/** 出貨 `_standin-overrides.json` 用得到的倍率，拿來證明 scaleMult 是**相乘**。 */
const SHIPPED_REL_SCALE = 0.65;
const ATTACH_GLB = "assets/models/goku3head.glb";

/**
 * ⭐ `content/config/form-visuals.json` **本人**，⛔ 不是為這條測試捏的一份。
 *
 * ⚠️ 這一行是 2026-08-23 稽核的結論之一：機制全鏈都在，而出貨表是空的 ——
 * 「⛔ 出貨零採用」。所以這一組現在讀出貨檔：owner 把〈狀態外觀〉整區關掉
 * （`statusStrength: 0`）或刪掉那一格，它就會紅，而那是正確的（功能真的沒了）。
 */
const SHIPPED = readContentJson<ConfigFormVisualsDoc>("config/form-visuals.json");
/** 09-03 超級賽亞人 —— 出貨五格裡**三樣旋鈕都帶**的那一格（顏色＋大小＋掛件）。 */
const STATUS = "super-saiyan";
const STATUS_ENTRY = SHIPPED.statuses![STATUS]!;

/** 出貨解析器 ＋ 出貨文件。⛔ 測試不自己算外觀、也不自己填表。 */
const cfg = (over: Partial<ConfigFormVisualsDoc> = {}): ConfigFormVisualsDoc => ({
  ...SHIPPED,
  ...over,
});

const modelDoc = (glbPath: string): ModelDoc =>
  ({ id: "m", schema: "model@1", glbPath, scale: 1, collisionRadius: 0.5 }) as ModelDoc;

const contentFor = (doc: ConfigFormVisualsDoc): ChampionBodyContent => ({
  modelFor: (k) => (k === STATUS_ENTRY.attachModelKey ? modelDoc(ATTACH_GLB) : null),
  standinOverrideFor: (id) => (id === BASE_ID ? { relativeScale: SHIPPED_REL_SCALE } : null),
  voxelSkinOverrideFor: () => null,
  formVisualFor: (key) => resolveFormVisual(doc, key),
});

const hooksWith = (statusIds: readonly string[], doc = cfg()): ReturnType<typeof championBodyHooks> =>
  championBodyHooks({
    championIdForSeat: () => BASE_ID,
    statusIdsForSeat: () => statusIds,
    resolveModelKey: (k) => k,
    content: contentFor(doc),
    overlay: { resolve: (shipped) => shipped },
  });

/** 基本型的身體：⛔ FORM bits 是 0，所以形態那一半永遠拿不到任何外觀。 */
const entity = (): EntityViewState =>
  ({ id: 1, kind: 0, seatId: 0, key: "champ.thorne", teamId: 0, x: 0, z: 0, fx: 1, fz: 0, alive: true, flags: 0 }) as EntityViewState;

beforeAll(() => {
  Champions.register(BASE_ID as ChampionId, readContentJson(`champions/${BASE_ID}.json`) as ChampionDef);
});

const relScaleOf = (o: ModelDocOverride | null): number => o?.relativeScale ?? 1;

describe("M1 變身外觀掛在狀態上 (status-form-visual)", () => {
  it("掛上狀態 ⇒ 顏色/大小/掛件三個下游物件真的變了，⛔ 而 championId 沒換", () => {
    const on = hooksWith([STATUS]);
    const off = hooksWith([]);
    const e = entity();

    // ⭐ 前提：身體從頭到尾是本體。這一行不成立的話下面三條就只是「變身生效了」。
    expect(off.bodyChampionIdFor(e)).toBe(BASE_ID);
    expect(on.bodyChampionIdFor(e)).toBe(BASE_ID);

    // ① 顏色 —— 英雄自己的 w3x 綠 × 狀態的金。相乘，⛔ 不是取代。
    const baseTint = off.championTintFor(e)!.tint!;
    const litTint = on.championTintFor(e)!.tint!;
    expect(baseTint[1]).toBeGreaterThan(baseTint[0]); // 出貨的傑桑本來就是綠的
    for (let i = 0; i < 3; i++) {
      expect(litTint[i]!).toBeCloseTo(baseTint[i]! * STATUS_ENTRY.tint![i]!, 5);
    }

    // ② 大小 —— 疊在出貨 relativeScale 之上（相乘），⛔ 不是覆蓋。
    expect(relScaleOf(off.modelOverrideFor(e))).toBeCloseTo(SHIPPED_REL_SCALE, 5);
    expect(relScaleOf(on.modelOverrideFor(e))).toBeCloseTo(
      SHIPPED_REL_SCALE * STATUS_ENTRY.scaleMult!,
      5,
    );

    // ③ 掛件 —— ChampionView 真的收到的那個 spec（帶 glbPath，⛔ 不是 modelKey）。
    const glbPathOf = (k: string): string | null => (k === STATUS_ENTRY.attachModelKey ? ATTACH_GLB : null);
    expect(formAttachmentSpecFor(off.formVisualFor(e), glbPathOf)).toBeNull();
    const spec = formAttachmentSpecFor(on.formVisualFor(e), glbPathOf)!;
    expect(spec.glbPath).toBe(ATTACH_GLB);
    expect(spec.bone).toBe(STATUS_ENTRY.attachBone);
    expect(spec.scale).toBeCloseTo(STATUS_ENTRY.attachScale!, 5);
  });

  it("後台把〈狀態外觀濃度〉轉到 0 ⇒ 逐位元回到 M1 之前（一鍵 rollback）", () => {
    const e = entity();
    const rolled = hooksWith([STATUS], cfg({ statusStrength: 0 }));
    const off = hooksWith([]);
    expect(rolled.formVisualFor(e)).toBeNull();
    expect(relScaleOf(rolled.modelOverrideFor(e))).toBeCloseTo(relScaleOf(off.modelOverrideFor(e)), 5);
    expect(rolled.championTintFor(e)!.tint).toEqual(off.championTintFor(e)!.tint);
  });

  /**
   * ⭐ **出貨採用** —— 2026-08-23 的稽核對 M1 的判決是「機制全鏈都在，⛔ 出貨零採用」：
   * 那時 `content/config/form-visuals.json` 連 `statuses` 這個鍵都沒有，於是整條機制
   * 在出貨設定下**一個像素都不影響**。這一條就是那個判決的閘。
   *
   * ⛔ 它驗的是「這一格算不算得出外觀」，⛔ 不是「顏色是多少」（第二守則：驗機制不驗
   * 數字 —— 那五組值是 owner 的內容，`statusStrength` 是它的旋鈕）。
   */
  it("⭐ 出貨的每一格〈狀態外觀〉在出貨設定下真的算得出外觀（⛔ 不是一格永遠 null 的擺設）", () => {
    const ids = Object.keys(SHIPPED.statuses ?? {});
    expect(ids.length, "出貨 statuses 是空的 ⇒ M1 在出貨設定下零採用").toBeGreaterThan(0);
    for (const id of ids) {
      const v = resolveFormVisual(SHIPPED, id);
      expect(v, `${id}：出貨解析器對這一格回 null（三樣旋鈕算完都中性？）`).not.toBeNull();
      expect(
        v!.tint !== null || v!.scaleMult !== 1 || v!.attachment !== null,
        `${id}：解析出來的外觀三樣都是中性值`,
      ).toBe(true);
    }
  });

  /**
   * 第三個住處的 drift —— `championFormVisuals.test.ts` 的既有 drift 斷言只比對
   * `forms`，所以 `statuses` 這一半在它底下是**沒有人看的**。後台的
   * `SHIPPED_FORM_VISUALS` 直接就是 `DEFAULT_FORM_VISUALS`，所以這一條同時守住
   * 「後台顯示的出貨值 = 玩家那一場載入的出貨值」。
   */
  it("Zod 的 DEFAULT_FORM_VISUALS.statuses 與出貨 JSON 一字不差", () => {
    expect(DEFAULT_FORM_VISUALS.statuses).toEqual(SHIPPED.statuses);
    expect(DEFAULT_FORM_VISUALS.statusStrength).toBe(SHIPPED.statusStrength);
  });
});
