/**
 * SIM_CAPABILITY 漂移守衛 —— 讓 expand.ts 那張表沒辦法再靠註解活下去。
 *
 * ---------------------------------------------------------------------------
 * 這條守衛為什麼存在
 * ---------------------------------------------------------------------------
 * `SIM_CAPABILITIES` 是**一份人手維護的宣稱**：某個能力「模擬器今天做不做得
 * 到」。在這條守衛出現之前，唯一釘住它的東西是 expand.test.ts 裡一句
 * `expect(missingCaps([...])).toEqual([...])` —— 也就是**把表抄一遍**。表寫錯
 * 的時候，那條測試只會忠實地把錯誤一起複製，永遠不會紅。
 *
 * 事實上它就是這樣壞掉的。`knockback` 那一格掛著一段很有說服力的註解：
 *
 *     「the knockback in combat/damage.ts is a REACTION to a landed hit, not an
 *      EffectDef a template author can emit — there is no `knockback` kind.」
 *
 * 那句話寫下來的當天是真的。等到 `sim/effects/knockback.ts`、schema 的
 * `kind: z.literal("knockback")`、`EFFECT_HANDLERS.knockback` 全部落地之後，它
 * 變成假的，而**整套測試沒有任何一條會紅** —— 因為沒有人拿這張表去對過真正的
 * registry。`summon` 與 `periodicDamage`(dot) 是同一個病灶的另外兩格。
 *
 * ---------------------------------------------------------------------------
 * 所以這裡對的是「出貨的那一個」(七種失敗形態 ⑤)
 * ---------------------------------------------------------------------------
 * 斷言的另一邊不是另一份清單，是 `EFFECT_HANDLERS` —— 也就是 `runEffects` 真正
 * 派發時查的那張表。一個能力如果在 registry 有 handler，這裡就**不准**寫
 * `available: false`；反過來也一樣。要讓這條測試變綠，只能去真的把 handler 做
 * 出來，不能改註解。
 *
 * 突變紀錄（每一條都真的做過，見任務回報）:
 *   · `knockback: available` 改回 false        → 「registry 有 handler 卻標成做不到」紅
 *   · 從 CAPABILITY_KIND 拿掉 knockback 那一列 → 「有 kind 卻沒被這條守衛蓋到」紅
 *   · `combo: available` 改成 true             → 「標成做得到卻沒有 handler」紅
 *     ⚠️ 2026-08-22（#541）之後這一條**不再是那個突變** —— `comboStrikes` 出貨了，
 *     所以現在的等價突變是把 `combo` 改回 false（「registry 有 handler 卻標成做不到」紅）。
 */
import { describe, expect, it } from "vitest";
import { SIM_CAPABILITIES } from "./expand";
import { EFFECT_HANDLERS } from "../../sim/effects/effectRegistry";
import type { EffectDef } from "../../sim/effects/effect";

/**
 * capability key → the `EffectDef.kind` an author emits to USE it.
 *
 * Only capabilities that bottom out in a single effect kind appear here.
 * `hooks` / `auras` / `projectile` are structural (a passive's hook list, an
 * aura component) and are covered by their own suites, so listing them with a
 * made-up kind would be exactly the fake-precision this file exists to stop.
 */
const CAPABILITY_KIND: Readonly<Record<string, EffectDef["kind"]>> = {
  applyBuff: "applyBuff",
  applyStatus: "applyStatus",
  dash: "dash",
  leap: "leap",
  knockback: "knockback",
  summon: "summon",
  periodicDamage: "dot",
  // GH#244 機器組 1/3: this row did not exist in SIM_CAPABILITIES AT ALL, which
  // is a worse failure than `false` and one this guard could not see — it only
  // compares rows that ARE there. `missingCaps` reports an unknown key as
  // missing (`SIM_CAPABILITIES[r]?.available` is undefined → falsy), so any
  // template declaring `requires: ["invulnerable"]` would have worn a red 「模擬
  // 器做不到」 badge for a primitive that landed with lane P3. Found by building
  // tpl-lock-combo, whose 7-of-8 members wear `Avul` for the whole 演出.
  invulnerable: "invulnerable",
  // GH#393 行進波動 —— 作者要用它就是發一個 `delayed`（帶 `advance`）。
  travelingWave: "delayed",
  // #541 連段 —— 作者要用它就是發一個 `comboStrikes`。⚠️ 它與 `travelingWave`
  // 共用同一個排程器（`SimWorld.delayed`），但**作者介面**不同，所以兩列各自
  // 指向自己的 kind：把 combo 也指到 `delayed` 會讓「連段做完了沒」這個問題
  // 被一個不相干的 kind 回答（假精確，正是這個檔要擋的東西）。
  combo: "comboStrikes",
  // #147 吸引 —— 作者要用它就是發一個 `pull`。
  pull: "pull",
};

describe("SIM_CAPABILITIES vs the shipped effect registry", () => {
  it("every capability that maps to an effect kind agrees with EFFECT_HANDLERS", () => {
    for (const [capability, kind] of Object.entries(CAPABILITY_KIND)) {
      const cap = SIM_CAPABILITIES[capability];
      expect(cap, `SIM_CAPABILITIES has no row for "${capability}"`).toBeDefined();
      const registered = Object.prototype.hasOwnProperty.call(EFFECT_HANDLERS, kind);
      expect(
        cap!.available,
        registered
          ? `"${capability}" is marked UNAVAILABLE but EFFECT_HANDLERS.${kind} is registered — ` +
              `the sim can already do this and the editor is telling designers it cannot`
          : `"${capability}" is marked AVAILABLE but there is no EFFECT_HANDLERS.${kind} — ` +
              `the editor will show a green ✓ for a skill that throws at registry time`,
      ).toBe(registered);
    }
  });

  it("a capability the registry cannot serve at all is not quietly listed as partial", () => {
    // `caveat` narrows an AVAILABLE capability. Using it on an unavailable one
    // would read, in the editor, as "mostly works" for something that does not
    // exist — the softening this codebase keeps getting bitten by.
    for (const [name, cap] of Object.entries(SIM_CAPABILITIES)) {
      if (cap.caveat !== undefined) {
        expect(cap.available, `${name}: caveat on an unavailable capability`).toBe(true);
      }
    }
  });

  it("每一個對得上 kind 的 capability 都被上面那條守衛蓋到（⛔ 不准偷偷漏一列）", () => {
    // 這一條以前是「`combo` is still absent」的金絲雀 —— #541 讓那個缺口關掉了，
    // 所以它換成同型的下一個問題：**還有沒有 kind 沒有被這張對照表覆蓋**。
    // ⚠️ 它刻意只點名 `combo` / `pull` 兩列（這一批新落地的），⛔ 不去枚舉
    // 全部的 kind —— 那會變成把 `EFFECT_HANDLERS` 抄第二遍。
    for (const cap of ["combo", "pull"] as const) {
      expect(SIM_CAPABILITIES[cap]?.available, `${cap} 的 kind 出貨了`).toBe(true);
      expect(Object.keys(CAPABILITY_KIND)).toContain(cap);
    }
  });
});

describe("summon's partiality is declared, not discovered in a stack trace", () => {
  it("summon is available AND carries the killCredit caveat", () => {
    const summon = SIM_CAPABILITIES.summon;
    expect(summon?.available).toBe(true);
    // The caveat must actually name the field that throws, so an operator can
    // search for it. A vague 「部分支援」 would pass a length check and help
    // nobody.
    expect(summon?.caveat).toContain("killCredit");
  });
});
