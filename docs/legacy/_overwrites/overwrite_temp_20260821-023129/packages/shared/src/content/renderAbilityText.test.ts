/**
 * ⛔ **卡面秒 ≠ 玩家等到的秒。**（{@link ./renderAbilityText}）
 *
 * 這一支守的是 `abilityProse.test.ts` 看不到的那一半：那邊問「卡面那個數字是不是
 * 一段靜態文字」，這一支問「**實際值**那一種算不算得出來、而算不出來的那幾軸有沒有
 * 靜靜地退回一個看起來合理的數字」。
 *
 * ⛔ 出貨數值一個都不住在這裡：0.2 / 0.1 全部從 `DEFAULT_COMBAT_ENV` /
 * `DEFAULT_COOLDOWN_RULES` 推導（第一守則的住處②）—— owner 改倍率時，
 * 這一支要跟著動的是**零行**。
 */
import { describe, it, expect } from "vitest";
import { PROSE_SLOT_KEYS, abilityQuantities } from "./abilityProse";
import {
  DEFAULT_LIVE_DEPS,
  LIVE_RULES,
  liveDepsFromConfigs,
  liveSeconds,
  liveValues,
  renderAbilityDescription,
} from "./renderAbilityText";

/** 一支只有冷卻的技能 —— 卡面秒從**設定**回推，⛔ 不寫死一個 45。 */
const cardSeconds = 1 / DEFAULT_LIVE_DEPS.env.cooldown; // ⇒ 實際剛好 1 秒
const def = { cooldown: [cardSeconds, cardSeconds], manaCost: [70, 95], effects: [] };

describe("卡面值 ↔ 實際值", () => {
  it("① `{{cd!}}` 算的是玩家等到的秒（卡面 × combatEnv.cooldown，再過秒數地板）", () => {
    const text = "冷卻 {{cd}} 秒（實戰 {{cd!}} 秒）";
    const out = renderAbilityDescription(def, text);
    expect(out, "⛔ 兩種值要能同時出現在同一句話裡").toBe(
      `冷卻 ${cardSeconds} 秒（實戰 ${liveSeconds(cardSeconds)} 秒）`,
    );
    // 機制而不是數字：把因子那一步拿掉，這一條會紅（突變驗過）。
    expect(liveSeconds(cardSeconds)).not.toBe(cardSeconds);
  });

  it("② 算不出實際值的那幾軸**原樣印出來**，⛔ 不退回卡面值", () => {
    const out = renderAbilityDescription(def, "{{mp}} / {{mp!}} / {{dmg!}} / {{range!}}");
    const mp = abilityQuantities(def).mp!;
    expect(out).toBe(`${mp} / {{mp!}} / {{dmg!}} / {{range!}}`);
  });

  it("③ 七格佔位符**每一格**都要在 LIVE_RULES 裡選過一邊，且理由能被反駁", () => {
    const missing = PROSE_SLOT_KEYS.filter((k) => LIVE_RULES[k] === undefined);
    expect(missing.join(","), "⛔ 加了新佔位符就要決定它有沒有實際值").toBe("");
    const mute = PROSE_SLOT_KEYS.filter((k) => LIVE_RULES[k].why.trim().length < 20);
    expect(mute.join(","), "⛔ 「沒有實際值」要說得出為什麼（⛔ 不是一句『不支援』）").toBe("");
  });

  it("④ 兩份設定從出貨 config 推導，缺席就退回 DEFAULT_*（⛔ 不是手抄的數字）", () => {
    const doc = { schema: "config.combat-env@1", multipliers: { cooldown: 0.5 } };
    expect(liveSeconds(2, liveDepsFromConfigs([doc]))).toBe(1);
    expect(liveDepsFromConfigs([])).toEqual(DEFAULT_LIVE_DEPS);
  });

  it("⑤ 台詞裡的數字一個字都不動（第〇·六守則②）", () => {
    const src = "冷卻 {{cd!}} 秒「在35秒後\n宣布勝利吧」";
    expect(renderAbilityDescription(def, src)).toContain("「在35秒後\n宣布勝利吧」");
  });
});

describe("實際值走得到出貨那條路", () => {
  it("⑥ 入口一次做完三步 —— 拆開任何一步 `{{cd!}}` 就會裸奔", () => {
    const q = abilityQuantities(def);
    expect(Object.keys(liveValues(q))).toContain("cd");
  });
});
