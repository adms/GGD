/**
 * GH#1039 —— 技能卡面的「（目前 N）」：玩家這一刻的法強對基礎傷害的即時試算。
 *
 * 薄守衛（體驗層）：載入**出貨內容**、用**真的** `abilityQuantities` ＋ 一個法強值，
 * 斷言算繪出來的那串字裡的數字 ＝ 卡面基礎 × `apCurveMult`（全專案唯一的三段式算式），
 * ⛔ 不掃字串、⛔ 不自己重寫公式。兩個方向都驗：開 ⇒ 數字 ≠ 基礎；關 ⇒ 逐位元同今天。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { registerAll } from "@ggd/shared/content/registries";
import { Abilities } from "@ggd/shared/sim/content/registry";
import { abilityQuantities, damageLeafScalings } from "@ggd/shared/content/abilityProse";
import { apCurveMult } from "@ggd/shared/sim/combat/apDamageScaling";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import type { AbilityId } from "@ggd/shared/ids";
import { docDescription } from "./abilityText";
import { apRuleCaption, liveAbilityBody, liveDamageRules } from "./abilityLiveDamage";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const ENV = DEFAULT_COMBAT_ENV; // damageDealt 中性 ⇒ 期望值只剩 基礎 × apCurveMult

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/** 第 1 階的卡面基礎（`q.dmg[0]` 是 `500` 或 `500/875/…` 那串字）。 */
const rank1Base = (def: unknown): number => Number(abilityQuantities(def).dmg[0]!.split("/")[0]);

describe("GH#1039 卡面「（目前 N）」", () => {
  it("斬未（零係數）：目前 N ＝ 卡面基礎 × apCurveMult；有法強 ⇒ ≠ 基礎；開關關 ⇒ 逐位元同今天", () => {
    const def = Abilities.get("godie-e001.e" as AbilityId);
    const text = docDescription(def)!;
    const rules = liveDamageRules(); // 出貨的兩份 config（註冊表）
    const ap = 300;
    // 前提：這一片葉子沒有法強係數（有的話期望值還要加 法強 × 係數 —— 那是 damageLeafScalings 的事）
    expect(damageLeafScalings(def)[0]!.apPerPoint[0]).toBe(0);
    const base = rank1Base(def);
    const want = Math.round(base * apCurveMult(ap, rules.scaling));
    expect(want).not.toBe(base);
    const body = liveAbilityBody(text, def, { rank: 1, ap, env: ENV, rules })!;
    // 接在「NNN點傷害」那個單位片語後面，⛔ 不是接在數字中間
    expect(body).toContain(`${abilityQuantities(def).dmg[0]}點傷害（目前 ${want}）`);
    const off = liveAbilityBody(text, def, { rank: 1, ap, env: ENV, rules: { ...rules, enabled: false } });
    expect(off).toBe(text);
  });

  it("赤焰爆發（卡面手打 400、引擎第 1 階不是 400）：印的是引擎的數；A 那一行從 config 推導", () => {
    const def = Abilities.get("godie-e008.e" as AbilityId);
    const text = docDescription(def)!;
    const rules = liveDamageRules();
    const ap = 300;
    const want = Math.round(rank1Base(def) * apCurveMult(ap, rules.scaling));
    const body = liveAbilityBody(text, def, { rank: 1, ap, env: ENV, rules })!;
    // 定位得到 ⇒「（目前 N）」；定位不到 ⇒ 頁尾「目前傷害 N（基礎 M）」—— 兩種都要等於引擎的數
    const shown = /目前(?:傷害)? (\d+)/.exec(body);
    expect(Number(shown?.[1])).toBe(want);
    expect(body.startsWith(text)).toBe(true);
    const cap = apRuleCaption(rules, ap)!;
    expect(cap).toContain(`每 1 點法強 ${rules.scaling.rate * 100}%`);
    expect(cap).toContain(`×${(Math.round(apCurveMult(ap, rules.scaling) * 100) / 100).toFixed(2)}`);
    // 這一層不存在（rate 0）⇒ 一個字都不印
    expect(apRuleCaption({ ...rules, scaling: { ...rules.scaling, rate: 0 } }, ap)).toBeUndefined();
  });
});
