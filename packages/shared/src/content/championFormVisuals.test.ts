/**
 * 變身「看得出來」的守衛 (task #249 / GH#288).
 *
 * ---------------------------------------------------------------------------
 * 這個檔要擋的三件事
 * ---------------------------------------------------------------------------
 * ① **基本型悟空不可以長出超三的頭。** `godie-ogrh` 與 `godie-o00x` 共用
 *    `imported.goku`,而 `Gokuhead.mdx` 已經在 #267 被烘進那個 glb。掛件因此是
 *    執行期的,而且解析層第一件事就是 `isAlternateForm` —— 這裡連「有人把基本型
 *    寫進設定檔」都試一遍,確認它仍然拿不到頭。
 * ② **這份設定的每一句「w3x 說」都是真的。** 出貨值的註解宣稱悟空/Saber 兩對的
 *    顏色與大小在 w3u 裡完全相同、掛件是 A0MI→A0MJ。CLAUDE.md 第三守則:註解會
 *    說謊。所以這裡直接讀匯入器的 fixture 對答案,不讀註解。
 * ③ **旋鈕真的關得掉。** `tintStrength = 0` 如果寫成「顏色乘 0」就是全黑 ——
 *    把旋鈕轉到零反而最誇張。這裡釘住 0 = 中性 = `null`(呼叫端會整段跳過)。
 *
 * ---------------------------------------------------------------------------
 * 為什麼讀出貨的 JSON 而不是自己捏一份 config
 * ---------------------------------------------------------------------------
 * 失敗形態 ⑤(被測的不是出貨的那個)。一份手寫的 fixture 可以永遠是對的,而
 * `content/config/form-visuals.json` 才是玩家那一場真的會載入的東西。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { CHAMPION_FORM_PAIRS, isAlternateForm } from "./championForms";
import { resolveFormVisual, authoredFormVisual, FORM_VISUAL_BOUNDS } from "./championFormVisuals";
import {
  DEFAULT_FORM_VISUALS,
  zConfigFormVisualsDoc,
  type ConfigFormVisualsDoc,
} from "./schema/config";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");

/** 出貨的那一份 —— 玩家真的會載入的檔案,不是為了測試捏的。 */
const SHIPPED = zConfigFormVisualsDoc.parse(
  JSON.parse(readFileSync(join(REPO, "content/config/form-visuals.json"), "utf8")),
) as ConfigFormVisualsDoc;

/** 匯入器對 `war3map.w3u` 的傾印 —— usca / 技能清單的權威來源。 */
const OBJECTS = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"), "utf8"),
) as {
  heroes: Record<string, { scale: number | null; abilities: string[] }>;
  abilities: Record<string, { name: string; base: string }>;
};

/** 匯入器對 uclr/uclg/uclb 的解析 —— tint 的權威來源。 */
const UNIT_TINTS = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json"), "utf8"),
) as { units: Record<string, { tint: [number, number, number]; model: string | null }> };

/** 球體掛件普查 —— attachModel 的權威來源。 */
const SPHERES = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/emitters/SPHERE_ATTACHMENTS.json"), "utf8"),
) as { rows: { heroId: string; abilityId: string; attachModel: string; attachPoint: string }[] };

const uscaOf = (rawcode: string): number => OBJECTS.heroes[rawcode]?.scale ?? 1;
const tintOf = (rawcode: string): [number, number, number] =>
  UNIT_TINTS.units[rawcode]?.tint ?? [1, 1, 1];

describe("出貨的變身外觀表與 shared 的預設沒有 drift (form-visual-drift)", () => {
  it("三份(JSON / Zod 預設 / 解析結果)講的是同一件事", () => {
    cover("form-visual-drift");
    // 每一個欄位逐一比,不是 toEqual 一整包 —— 一整包的失敗訊息看不出是哪一格。
    expect(SHIPPED.enabled).toBe(DEFAULT_FORM_VISUALS.enabled);
    expect(SHIPPED.tintStrength).toBe(DEFAULT_FORM_VISUALS.tintStrength);
    expect(SHIPPED.scaleStrength).toBe(DEFAULT_FORM_VISUALS.scaleStrength);
    expect(SHIPPED.attachmentsEnabled).toBe(DEFAULT_FORM_VISUALS.attachmentsEnabled);
    expect(Object.keys(SHIPPED.forms).sort()).toEqual(
      Object.keys(DEFAULT_FORM_VISUALS.forms).sort(),
    );
    for (const id of Object.keys(SHIPPED.forms)) {
      const a = SHIPPED.forms[id]!;
      const b = DEFAULT_FORM_VISUALS.forms[id]!;
      expect(a.tint, `${id} tint`).toEqual(b.tint);
      expect(a.scaleMult, `${id} scaleMult`).toBe(b.scaleMult);
      expect(a.attachModelKey, `${id} attachModelKey`).toBe(b.attachModelKey);
      expect(a.attachBone, `${id} attachBone`).toBe(b.attachBone);
      expect(a.attachScale, `${id} attachScale`).toBe(b.attachScale);
      expect(a.attachOffsetY, `${id} attachOffsetY`).toBe(b.attachOffsetY);
    }
  });

  it("每一個 key 都是真的變身態(Emeu),不是隨手打的 id", () => {
    cover("form-visual-drift");
    for (const id of Object.keys(SHIPPED.forms)) {
      expect(isAlternateForm(id), `${id} 不是任何一對變身的 alternate`).toBe(true);
    }
    // 這一批上架的就是這兩隻 —— 少一隻就是有人默默把功能拿掉了
    expect(Object.keys(SHIPPED.forms).sort()).toEqual(["godie-e00l", "godie-o00x"]);
  });

  it("這一批的兩對:可選的是本體,設定表填的是變身態(方向沒有反過來)", () => {
    cover("form-visual-drift");
    // 出貨白名單(apps/platform/internal/curation/starter.go)放的是 ogrh / e002,
    // 而設定表填的是 o00x / e00l。方向一旦反過來,玩家就會直接選到變身態,
    // 而 R 鍵會把他變成他已經是的樣子(#249 當初就踩過)。
    const goku = CHAMPION_FORM_PAIRS.find((p) => p.heroNumber === "09")!;
    expect(goku.baseId).toBe("godie-ogrh");
    expect(goku.alternateId).toBe("godie-o00x");
    expect(SHIPPED.forms["godie-ogrh"]).toBeUndefined();
    const saber = CHAMPION_FORM_PAIRS.find((p) => p.heroNumber === "20")!;
    expect(saber.baseId).toBe("godie-e002");
    expect(saber.alternateId).toBe("godie-e00l");
    expect(SHIPPED.forms["godie-e002"]).toBeUndefined();
  });
});

describe("設定檔宣稱的 w3x 事實真的成立 (form-visual-w3x-pin)", () => {
  it("悟空兩態在 w3u 裡同色、同大小 —— 所以顏色與大小只能是美術決定", () => {
    cover("form-visual-w3x-pin");
    expect(tintOf("Ogrh")).toEqual([1, 1, 1]);
    expect(tintOf("O00X")).toEqual([1, 1, 1]);
    expect(uscaOf("Ogrh")).toBe(uscaOf("O00X"));
    // 這正是「照抄 w3x 會零差異」的量化版本:兩半的視覺欄位完全相等
    expect(UNIT_TINTS.units["Ogrh"]!.model!.toLowerCase()).toBe(
      UNIT_TINTS.units["O00X"]!.model!.toLowerCase(),
    );
  });

  it("Saber 兩態同樣同色、同 usca 1.10、同模型", () => {
    cover("form-visual-w3x-pin");
    expect(tintOf("E002")).toEqual([1, 1, 1]);
    expect(tintOf("E00L")).toEqual([1, 1, 1]);
    expect(uscaOf("E002")).toBeCloseTo(1.1, 5);
    expect(uscaOf("E00L")).toBeCloseTo(1.1, 5);
    expect(UNIT_TINTS.units["E002"]!.model).toBe(UNIT_TINTS.units["E00L"]!.model);
    // …而且它一顆球體都沒有:E00L 多出來的兩支技能都不是 Asph
    const spheres = SPHERES.rows.filter((r) => r.heroId.toUpperCase() === "E00L");
    expect(spheres, "Saber 變身態不該有球體掛件").toEqual([]);
    expect(SHIPPED.forms["godie-e00l"]!.attachModelKey).toBeUndefined();
  });

  it("悟空的球體真的是 A0MI(正常)→ A0MJ(超三),掛點是 origin", () => {
    cover("form-visual-w3x-pin");
    const base = SPHERES.rows.find((r) => r.abilityId === "A0MI")!;
    const alt = SPHERES.rows.find((r) => r.abilityId === "A0MJ")!;
    expect(base.heroId.toUpperCase()).toBe("OGRH");
    expect(alt.heroId.toUpperCase()).toBe("O00X");
    expect(base.attachModel).toBe("Gokuhead.mdx");
    expect(alt.attachModel).toBe("Goku3head.mdx");
    // 兩顆掛在同一個點 —— 這就是「不可以兩顆都烘進同一個 glb」的原始證據
    expect(base.attachPoint).toBe("origin");
    expect(alt.attachPoint).toBe("origin");
    expect(SHIPPED.forms["godie-o00x"]!.attachBone).toBe("origin");
    // 物件資料也要對得上:A0MJ 只掛在 O00X 的技能清單上,不在 Ogrh 的
    expect(OBJECTS.heroes["O00X"]!.abilities).toContain("A0MJ");
    expect(OBJECTS.heroes["Ogrh"]!.abilities).not.toContain("A0MJ");
    expect(OBJECTS.abilities["A0MJ"]!.base).toBe("Asph");
  });
});

describe("基本型永遠拿不到變身外觀 (form-visual-base-immune)", () => {
  /**
   * 這一條是這整個任務的驗收條件:**基本型悟空不可以長出超三的頭**。
   *
   * 它不是「出貨表裡剛好沒有 godie-ogrh 這一格」—— 那種保證會被下一個手滑的
   * 編輯打破而且沒人發現。這裡刻意把基本型連同超三的頭一起寫進一份 config,
   * 再確認解析層仍然回 null。
   */
  it("就算有人把 godie-ogrh 連頭一起寫進設定,基本型還是拿不到任何東西", () => {
    cover("form-visual-base-immune");
    const sabotaged: ConfigFormVisualsDoc = {
      ...SHIPPED,
      forms: {
        ...SHIPPED.forms,
        "godie-ogrh": {
          tint: [1.45, 1.3, 0.55],
          scaleMult: 1.08,
          attachModelKey: "imported.goku3head",
          attachBone: "origin",
          attachScale: 0.3221,
        },
      },
    };
    expect(authoredFormVisual(sabotaged, "godie-ogrh")).not.toBeNull(); // 資料真的在
    expect(resolveFormVisual(sabotaged, "godie-ogrh")).toBeNull(); // 但解析不採用
    // 對照組:同一份 config 裡,變身態確實拿得到那顆頭
    expect(resolveFormVisual(sabotaged, "godie-o00x")?.attachment?.modelKey).toBe(
      "imported.goku3head",
    );
  });

  it("26 對變身的 base 那一半,一個都拿不到外觀", () => {
    cover("form-visual-base-immune");
    for (const p of CHAMPION_FORM_PAIRS) {
      expect(resolveFormVisual(SHIPPED, p.baseId), `${p.baseId} 是基本型`).toBeNull();
    }
    // 而且非變身英雄也一樣(不是只有 base 被擋)
    expect(resolveFormVisual(SHIPPED, "godie-hapm")).toBeNull();
    expect(resolveFormVisual(SHIPPED, null)).toBeNull();
  });
});

describe("三個旋鈕真的關得掉 (form-visual-knobs)", () => {
  it("總開關 false = 一個變身態都不改外觀", () => {
    cover("form-visual-knobs");
    expect(resolveFormVisual({ ...SHIPPED, enabled: false }, "godie-o00x")).toBeNull();
    expect(resolveFormVisual({ ...SHIPPED, enabled: false }, "godie-e00l")).toBeNull();
  });

  it("顏色濃度 0 = 中性,不是全黑", () => {
    cover("form-visual-knobs");
    const off = resolveFormVisual({ ...SHIPPED, tintStrength: 0 }, "godie-e00l");
    // Saber 只有顏色與大小;把顏色關掉之後只剩大小
    expect(off?.tint).toBeNull();
    expect(off?.scaleMult).toBeCloseTo(1.04, 5);
    // 一半濃度就是往中性插一半:1 + (1.35-1)*0.5 = 1.175
    const half = resolveFormVisual({ ...SHIPPED, tintStrength: 0.5 }, "godie-e00l");
    expect(half!.tint![2]).toBeCloseTo(1.175, 5);
    // 全開就是文件寫的值
    expect(resolveFormVisual(SHIPPED, "godie-e00l")!.tint![2]).toBeCloseTo(1.35, 5);
  });

  it("大小濃度 0 = 倍率 1;顏色與大小都關掉之後 Saber 整格變 null", () => {
    cover("form-visual-knobs");
    expect(
      resolveFormVisual({ ...SHIPPED, scaleStrength: 0 }, "godie-e00l")!.scaleMult,
    ).toBe(1);
    expect(
      resolveFormVisual({ ...SHIPPED, tintStrength: 0, scaleStrength: 0 }, "godie-e00l"),
    ).toBeNull();
    // 悟空還有掛件,所以同樣的設定下他不會變 null —— 三個通道是獨立的
    const goku = resolveFormVisual(
      { ...SHIPPED, tintStrength: 0, scaleStrength: 0 },
      "godie-o00x",
    );
    expect(goku?.attachment?.modelKey).toBe("imported.goku3head");
    expect(goku?.tint).toBeNull();
    expect(goku?.scaleMult).toBe(1);
  });

  it("掛件開關關掉之後,悟空只剩顏色與大小 —— 頭不見了", () => {
    cover("form-visual-knobs");
    const v = resolveFormVisual({ ...SHIPPED, attachmentsEnabled: false }, "godie-o00x");
    expect(v?.attachment).toBeNull();
    expect(v?.tint).not.toBeNull();
    expect(v?.scaleMult).toBeCloseTo(1.08, 5);
  });

  it("缺文件 = 出貨預設,不是「全部關掉」", () => {
    cover("form-visual-knobs");
    // 這一條在守 ContentDb 的三態:null ≠ 空表。壓成「關掉」的話,一台還沒有
    // 這份文件的主機會安靜地失去整個功能。
    expect(resolveFormVisual(null, "godie-o00x")?.attachment?.modelKey).toBe(
      "imported.goku3head",
    );
    expect(resolveFormVisual(undefined, "godie-e00l")?.tint).not.toBeNull();
  });
});

describe("出貨值落在 Zod 的區間內 (form-visual-bounds)", () => {
  it("每一格都通得過 schema,而且離上界不是剛好卡住", () => {
    cover("form-visual-bounds");
    // parse 已經在檔頭跑過(不合法就整個檔載不起來),這裡釘的是「有上界」這件事
    const [tintLo, tintHi] = FORM_VISUAL_BOUNDS.tint;
    for (const [id, e] of Object.entries(SHIPPED.forms)) {
      for (const c of e.tint ?? []) {
        expect(c, `${id} tint`).toBeGreaterThanOrEqual(tintLo);
        expect(c, `${id} tint`).toBeLessThanOrEqual(tintHi);
      }
      const [sLo, sHi] = FORM_VISUAL_BOUNDS.scaleMult;
      if (e.scaleMult !== undefined) {
        expect(e.scaleMult, `${id} scaleMult`).toBeGreaterThanOrEqual(sLo);
        expect(e.scaleMult, `${id} scaleMult`).toBeLessThanOrEqual(sHi);
      }
    }
    // 上界真的會拒絕 —— 不是只有下界(CLAUDE.md 2026-07-29 的教訓)
    expect(() =>
      zConfigFormVisualsDoc.parse({
        ...SHIPPED,
        forms: { "godie-o00x": { scaleMult: 30 } },
      }),
    ).toThrow();
    expect(() =>
      zConfigFormVisualsDoc.parse({ ...SHIPPED, tintStrength: 5 }),
    ).toThrow();
  });
});
