/**
 * ⛔ **卡面秒 ≠ 玩家等到的秒。**（{@link ./renderAbilityText}）
 *
 * 這一支守的是 `abilityProse.test.ts` 看不到的那一半：那邊問「卡面那個數字是不是
 * 一段靜態文字」，這一支問「**實際值**那一種算不算得出來、而算不出來的那幾軸有沒有
 * 靜靜地退回一個看起來合理的數字」。
 *
 * ⛔ 出貨數值一個都不住在這裡：倍率與秒數地板全部從 `DEFAULT_COMBAT_ENV` /
 * `DEFAULT_COOLDOWN_RULES` 推導（第一守則的住處②）—— owner 改倍率時，
 * 這一支要跟著動的是**零行**。
 */
import { describe, it, expect } from "vitest";
import { PROSE_SLOT_KEYS, abilityQuantities, proseViolations } from "./abilityProse";
import {
  DEFAULT_LIVE_DEPS,
  LIVE_RULES,
  liveDepsFromConfigs,
  liveSeconds,
  liveValues,
  renderAbilityDescription,
} from "./renderAbilityText";

/** 一支只有冷卻與耗魔的夾具技能（⛔ 不是出貨值，只是兩個好認的數字）。 */
const def = { cooldown: [45, 45], manaCost: [70, 95], effects: [] };
const q = abilityQuantities(def);

describe("卡面值 ↔ 實際值", () => {
  it("① 同一句話裡兩種值都寫得出來，而 `{{cd!}}` 是卡面 × combatEnv.cooldown", () => {
    const out = renderAbilityDescription(def, "冷卻 {{cd}} 秒（實戰 {{cd!}} 秒）");
    expect(out).toBe(`冷卻 ${q.cd} 秒（實戰 ${liveValues(q).cd} 秒）`);
    // ⭐ 承重的那一行：把因子那一步拿掉，這一條紅（突變驗過）。
    expect(liveSeconds(45)).toBeCloseTo(45 * DEFAULT_LIVE_DEPS.env.cooldown);
    expect(q.cd).not.toBe(liveValues(q).cd);
  });

  it("② 算不出實際值的軸**原樣印出來**，⛔ 不退回卡面值，而且閘會點名它", () => {
    expect(renderAbilityDescription(def, "{{mp}} / {{mp!}}")).toBe(`${q.mp} / {{mp!}}`);
    expect(proseViolations("{{mp!}}", q, liveValues(q)).map((v) => v.rule)).toContain(
      "unresolved-placeholder",
    );
  });

  it("③ 每一格佔位符都要在 LIVE_RULES 裡選過一邊，且理由能被反駁", () => {
    expect(
      Object.keys(LIVE_RULES).sort().join(","),
      "⛔ 加了新佔位符就要決定它有沒有實際值（⛔ 不是讓它靜靜地沒有）",
    ).toBe([...PROSE_SLOT_KEYS].sort().join(","));
    const mute = PROSE_SLOT_KEYS.filter((k) => LIVE_RULES[k].why.trim().length < 20);
    expect(mute.join(","), "⛔ 「沒有實際值」要說得出為什麼，⛔ 不是一句『不支援』").toBe("");
  });

  it("④ 兩份設定從出貨 config 推導，缺席退回 DEFAULT_*（⛔ 不是手抄的數字）", () => {
    const doc = { schema: "config.combat-env@1", multipliers: { cooldown: 0.5 } };
    expect(liveSeconds(2, liveDepsFromConfigs([doc]))).toBe(1);
    expect(liveDepsFromConfigs([])).toEqual(DEFAULT_LIVE_DEPS);
  });

  it("⑤ 台詞裡的數字一個字都不動（第〇·六守則②）", () => {
    expect(renderAbilityDescription(def, "冷卻 {{cd!}} 秒「在35秒後\n宣布勝利吧」")).toContain(
      "「在35秒後\n宣布勝利吧」",
    );
  });
});
