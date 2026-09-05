/**
 * ⭐ GH#1019 —— **self 施放的傷害要說清楚打在誰身上。**
 *
 * `castType:"self"` ⇒ `abilitySystem.ts` 把目標解成 `[caster]`，而 `effects/damage.ts` 是
 * `subjects = e.applyTo === "self" ? [caster] : ctx.targets` ⇒ self 技能的 `damage` 不寫 `applyTo:"self"`
 * 就**打在施法者自己身上**。三條既有閘（castabilitySweep / abilityCastClaims / abilityNoOpEffects）只問
 * 「有沒有打出來」，⛔ 沒有一條問「打在誰身上」—— 小傑 Q/W 是自殺鍵而 castability 七格全 ✅（GH#1018）。
 * ⭐ 判準是**資料自己說得出來的**（⛔ 沒有豁免名單，名單會過期）：
 *   ① self ＋ `damage` ＋ 沒明寫 `applyTo:"self"` ⇒ 紅並指名（作者以為在打敵人）
 *   ② 明寫 `applyTo:"self"` 的，卡面要講得出「自身／自己／代價／犧牲」⇒ 否則紅（同一個錯的另一種寫法）
 *   —— 天破壤碎 `godie-e008.ex`（「以自身…生命作為代價」）兩條都自動放行。
 * 分母：`effects[]` 直接子節點 ＋ `delayed{shape:"single"}` 子樹；`damageArea`/`damageLine`/投射物/`onHitTargets` 自己重解受害者，⛔ 不算。
 * 後台開關 `config.damage-rules@1.abilitySelfDamageGuard`（出貨 true）—— false 時只印警告不擋（fail-open
 * 但⛔不靜默）。⚠️ 名字與預設是我挑的（owner 2026-08-23「留後台開關可以簡易 rollback」）。
 * 突變紀錄（2026-09-06）：`node.applyTo !== "self"` 反過來 ⇒ ① 反而指名天破壤碎、放行五支自傷技 —— 見 commit。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Configs, registerAll } from "./registries";
import { Abilities } from "../sim/content/registry";
import { SHIPPED_DAMAGE_RULES, type ConfigDamageRulesDoc } from "./schema/config/damageRules";

type Node = { kind?: string; applyTo?: string; shape?: string; effects?: Node[] };
type Def = { castType: string; effects?: Node[]; description?: string };
const INTENT = /自身|自己|代價|犧牲|自傷/;

/**
 * self 施放時受害者仍是 `[caster]` 的傷害葉：頂層 ＋ `delayed{shape:"single"}` 子樹
 * （`shapeTargets` 的 `single` ＝ 上游名單；`circle` 自己重解圈內敵人 ⇒ 週期領域那一族⛔不算）。
 */
function casterBound(effects: readonly Node[] | undefined, path: string, out: { path: string; node: Node }[]): void {
  (effects ?? []).forEach((n, i) => {
    const p = `${path}[${i}]`;
    if (n.kind === "damage") out.push({ path: p, node: n });
    if (n.kind === "delayed" && n.shape === "single") casterBound(n.effects, `${p}.effects`, out);
  });
}

const wrongVictim: string[] = [];
const unclaimedSelfHarm: string[] = [];
let scanned = 0;
let guardOn = true;

beforeAll(async () => {
  registerAll((await new ContentLoader(shippedContentSource()).load()).store);
  const rules = Configs.tryGet("damage-rules") as ConfigDamageRulesDoc | undefined;
  guardOn = rules?.abilitySelfDamageGuard ?? SHIPPED_DAMAGE_RULES.abilitySelfDamageGuard ?? true;
  for (const id of Abilities.ids().sort()) {
    const def = Abilities.get(id) as unknown as Def;
    if (def.castType !== "self") continue;
    const leaves: { path: string; node: Node }[] = [];
    casterBound(def.effects, "effects", leaves);
    for (const { path, node } of leaves) {
      scanned++;
      if (node.applyTo !== "self") wrongVictim.push(`${id} ${path}`);
      else if (!INTENT.test(def.description ?? "")) unclaimedSelfHarm.push(`${id} ${path}`);
    }
  }
});

describe("GH#1019 — castType:self 的 damage 要說清楚打在誰身上", () => {
  it("母體還在：出貨內容裡至少有一片 self 施放的 damage 葉（天破壤碎）", () => {
    expect(scanned, "⛔ 一片都沒掃到 —— 掃描器壞了，下面兩條的綠是空的").toBeGreaterThan(0);
  });

  it("① self ＋ damage 而沒明寫 applyTo:self ⇒ 那一發打在施法者身上（⛔ 不是敵人）", () => {
    if (!guardOn) return void console.warn(`[abilitySelfDamageGuard=false] 未擋 ${wrongVictim.length} 處：${wrongVictim.join("、")}`);
    expect(
      wrongVictim,
      "⛔ 這些傷害落在**施法者自己**身上（abilitySystem `case \"self\": targets=[caster]` → damage.ts `subjects=ctx.targets`）。\n" +
        "  修法：改 castType（targeted/ground/skillshot）或把 damage 換成 damageArea；真的要自傷就明寫 applyTo:\"self\"。⛔ 不要加豁免名單。",
    ).toEqual([]);
  });

  it("② 明寫 applyTo:self 的自傷，卡面要講得出「自身／代價」（⛔ 否則它只是另一種寫法的誤傷）", () => {
    if (!guardOn) return;
    expect(unclaimedSelfHarm, "⛔ 這些技能明寫自傷，而卡面沒有一個字說要付自己的血（第一·五守則）").toEqual([]);
  });
});
