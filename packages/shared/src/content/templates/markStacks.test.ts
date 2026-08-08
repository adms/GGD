/**
 * tpl-mark-stacks 的接線守衛 —— 「表單填的那一組參數，真的變成技能文件上的標記」。
 * 盯三段接線：`expand()` 搬進 `ExpandResult.marks` → 免死鏈整組生出來 →
 * `mergeExpansion` 把它併進技能文件（少一列 EXPANDED_KEYS 就整包蒸發，失敗形態②）。
 *
 * ⛔ 斷言裡沒有任何出貨數值（12 層 / 10% / 1.5 秒都不在這裡）—— 那些住在
 * content + Zod + admin 三處且有 drift 測試在守，抄進來就是第四個住處。
 * 突變紀錄：EXPANDED_KEYS 拿掉 "marks" → 第三條紅（1 failed | 2 passed）→ 已還原。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zTemplateDoc } from "../schema/template";
import { zAbilityDoc } from "../schema/ability";
import { expand, mergeExpansion } from "./expand";
import { defaultParamsFor, paramsSchemaFor } from "./paramsSchema";

const TPL = zTemplateDoc.parse(
  JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/ability-templates/tpl-mark-stacks.json"),
      "utf8",
    ),
  ),
);

/** 一組跟出貨值完全無關的填答。 */
const FILLED: Record<string, unknown> = {
  markId: "some-hero.passive", initial: 3, max: 4, durationSec: -1, resetOn: "round",
  perStackLost: [{ stat: "ad", op: "pctAdd", value: 0.02 }],
  lethalMode: "save", lethalConsume: 2, surviveHpPct: 0.2, lethalDamageTypes: "physicalMagic",
  internalCooldown: 0.4, invulnerableSec: 0.8, invulnerableScope: "damageOnly",
  restoreHealthPct: 0.3, aoeRadius: 2, knockbackDistance: 1.5, knockbackSpeed: 9,
  knockbackFrom: "pull", stunSec: 0.2, stunStatusId: "root",
};

const skeleton = (): Record<string, unknown> => ({
  schema: "ability@1", id: "test.mark-stacks", name: "測試用標記天生技", slot: "PASSIVE",
  innateKind: "passive", castType: "self", maxRank: 1, cooldown: [0], manaCost: [0],
  range: 0, effects: [],
});

describe("tpl-mark-stacks — 填進去的參數就是裝到身上的標記", () => {
  it("表單收得下這組參數，而 marks[0] 逐欄等於填進去的值", () => {
    expect(paramsSchemaFor(TPL).safeParse(FILLED).success).toBe(true);
    const spec = expand(TPL, FILLED).marks?.[0];
    expect(spec).toMatchObject({
      markId: FILLED.markId,
      initial: FILLED.initial,
      max: FILLED.max,
      durationSec: FILLED.durationSec,
      resetOn: FILLED.resetOn,
    });
    expect(spec?.perStackLost).toEqual(FILLED.perStackLost);
  });

  it("免死是一整條鏈：無敵→回復 落在自己、擊退+暈眩 落在周圍；關掉就整張牌消失", () => {
    const lethal = expand(TPL, FILLED).marks?.[0]?.lethal;
    expect(lethal?.selfEffects.map((e) => e.kind)).toEqual(["invulnerable", "restore"]);
    expect(lethal?.aoeEffects.map((e) => e.kind)).toEqual(["knockback", "applyStatus"]);
    // 下拉選單真的決定了「哪幾種傷害救得到」，不是程式裡的一個分支
    expect(lethal?.damageTypes).toEqual(["physical", "magic"]);
    expect(lethal?.consume).toBe(FILLED.lethalConsume);
    expect(expand(TPL, { ...FILLED, lethalMode: "none" }).marks?.[0]?.lethal).toBeUndefined();
  });

  // 出貨的預設值也走同一條路：zAbilityDoc 會對 marks 跑 zMarkSpec，所以這一條
  // 同時證明「表單一開就能存檔」，而且不必把任何預設數字抄進斷言。
  it.each([["填答", FILLED], ["出貨預設", defaultParamsFor(TPL)]])(
    "mergeExpansion → zAbilityDoc：標記留在寫進去的那份技能文件上（%s）",
    (_label, params) => {
      const parsed = zAbilityDoc.safeParse(mergeExpansion(skeleton(), expand(TPL, params)));
      expect(parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe("");
      expect((parsed.success ? parsed.data : undefined)?.marks?.[0]?.markId).toBe(params.markId);
    },
  );
});
