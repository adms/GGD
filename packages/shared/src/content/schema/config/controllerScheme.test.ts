/**
 * `config.controller-scheme@1` 的守衛（GH#863）。
 *
 * ⭐ **承重的那一條線是「v3 方案真的描述今天的綁定」** —— 那是 rollback 宣稱的全部。
 * 如果 v3 那一欄跟出貨的 `GamepadInput.ts` 不一樣，「切回去 ＝ 舊行為」就是一句
 * 沒有人會發現的謊話（切過去、玩起來不對、而每一條測試都是綠的）。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CASTABLE_SLOTS } from "../../../sim/intents";
import {
  DEFAULT_CONTROLLER_SCHEME,
  resolveControllerScheme,
  resolveControllerSchemeOrDefault,
  zConfigControllerSchemeDoc,
  type ConfigControllerSchemeDoc,
} from "./controllerScheme";

const DOC: ConfigControllerSchemeDoc = zConfigControllerSchemeDoc.parse(
  JSON.parse(
    readFileSync(new URL("../../../../../../content/config/controller-scheme.json", import.meta.url), "utf8"),
  ),
);

describe("config.controller-scheme@1", () => {
  it("active 指到一個真的存在的方案（頂層 refine 不能用,所以規則住這裡）", () => {
    // ⛔ 這一條**不可以**搬回 schema 的 `.superRefine` —— 那會把 doc 變成
    //   ZodEffects,而 discriminated union 的成員必須是 ZodObject（statCaps.ts:50）。
    expect(Object.keys(DOC.schemes)).toContain(DOC.active);
    expect(resolveControllerScheme(DOC)).toBeDefined();
  });

  it("六個 ability:* 動作逐字等於 sim 的 CASTABLE_SLOTS", () => {
    // ⭐ 兩邊刻意不 import 對方（跨層）,所以**這條測試就是那個接縫**。
    //   加第七個槽位而忘了開一顆鍵 → 紅。
    const fromScheme = new Set<string>();
    for (const s of Object.values(DOC.schemes))
      for (const a of Object.values(s.bindings))
        if (a.startsWith("ability:")) fromScheme.add(a.slice("ability:".length));
    expect([...fromScheme].sort()).toEqual([...CASTABLE_SLOTS].sort());
  });

  it("⭐ v3-shipped 逐鍵等於出貨的 GamepadInput —— rollback 宣稱的全部", () => {
    // 出處：`apps/client/src/input/GamepadInput.ts` 檔頭 18-20 行（owner 2026-07-27）。
    //   A → Q    B → W    X → E    Y → R
    //   LB → EX          RB → 天生技
    //   RT → 基本攻擊    LT → attack-move
    expect(DOC.schemes["v3-shipped"]?.bindings).toEqual({
      A: "ability:Q",
      B: "ability:W",
      X: "ability:E",
      Y: "ability:R",
      LB: "ability:EX",
      RB: "ability:PASSIVE",
      LT: "attackMove",
      RT: "basicAttack",
      L3: "cameraFollowToggle",
      R3: "cameraZoomStep",
    });
    // ⭐ v3 走出貨那一支目標選擇（`ctx.nearestEnemy`）,⛔ 不是一組我編的權重。
    expect(DOC.schemes["v3-shipped"]?.aim.manualScoring).toBe("legacy-nearest-enemy");
    expect(DOC.schemes["v3-shipped"]?.aim.weights).toBeUndefined();
  });

  it("⭐ v4 與 v3 的本質差別是「移動算不算戰鬥輸入」,⛔ 不是按鍵位置", () => {
    // spec §50 逐字：LS 按住 10 秒 → Auto Farm 仍然活著。
    expect(DOC.schemes["v3-shipped"]?.combatInput.moveStick).toBe(true);
    expect(DOC.schemes.v4?.combatInput.moveStick).toBe(false);
    // spec §2：LT 從 attack-move 變成玩家專注。
    expect(DOC.schemes.v4?.bindings.LT).toBe("pvpFocus");
  });

  it("⭐ 內建退路與出貨的 v3-shipped 逐欄相同（drift）", () => {
    // ⛔ 這不是第二個住處,是第一守則的「三住處 ＋ drift 測試」模式（同 DEFAULT_COMBAT_FEEL）。
    //   兩邊分岔 ⇒ 內容載入失敗時手把的行為會跟載入成功時不一樣,而那看不出來。
    expect(DEFAULT_CONTROLLER_SCHEME.bindings).toEqual(DOC.schemes["v3-shipped"]?.bindings);
    expect(DEFAULT_CONTROLLER_SCHEME.combatInput).toEqual(DOC.schemes["v3-shipped"]?.combatInput);
    expect(DEFAULT_CONTROLLER_SCHEME.autoFarm).toEqual(DOC.schemes["v3-shipped"]?.autoFarm);
    expect(DEFAULT_CONTROLLER_SCHEME.aim).toEqual(DOC.schemes["v3-shipped"]?.aim);
    expect(DEFAULT_CONTROLLER_SCHEME.autoApproach).toEqual(DOC.schemes["v3-shipped"]?.autoApproach);
  });

  it("⭐ 退路是 fail-open 但⛔不靜默:它說得出自己從哪個名字退的", () => {
    expect(resolveControllerSchemeOrDefault(DOC).fellBackFrom).toBeNull();
    expect(resolveControllerSchemeOrDefault(undefined).fellBackFrom).toBe("(no doc)");
    // 後台把 active 打錯字 ⇒ 退回預設,⭐ 而且**指名那個打錯的字**
    expect(resolveControllerSchemeOrDefault({ ...DOC, active: "v44" }).fellBackFrom).toBe("v44");
  });

  it("每一個方案都不可以讓自動化去打／追玩家（spec §8 §31）", () => {
    for (const [name, s] of Object.entries(DOC.schemes)) {
      expect(s.autoFarm.pveOnly, name).toBe(true);
      if (s.autoApproach.enabled) expect(s.autoApproach.pveOnly, name).toBe(true);
    }
  });
});
