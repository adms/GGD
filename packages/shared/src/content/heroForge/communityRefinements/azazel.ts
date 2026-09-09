import { zEffectDef, zHookDef } from "../../schema/effect";
import type { HeroSlot } from "../constants";
import { zHeroProject, type HeroProject } from "../schema";

/** Frozen legacy adaptation for old-version replay tests. New handoffs use
 * materials/community-hero-forge/refinements/32.json through the generic applier.
 * Original sidecar text and model provenance are immutable. */
export function refineAzazelProject(input: HeroProject): HeroProject {
  const project = zHeroProject.parse(input);
  if (project.brief.name !== "阿薩謝爾" || !project.sourceDesign?.identity.includes("アザゼル篤史") || !project.acceptedPlan) {
    throw new Error("此配方只適用於已附《召喚惡魔》アザゼル篤史原稿的阿薩謝爾。");
  }
  const ids = azazelStatusIds(project.projectId);
  const effect = (value: unknown) => zEffectDef.parse(value);
  const hit = (damageType: "magic" | "physical", damageTier = "小") => effect({ kind: "damage", damageType, amount: { damageTier } });
  const text = (value: string, colorRgb: number[], applyTo = "victim") => effect({
    kind: "floatingText", shape: "single", text: value, colorRgb, applyTo, durationSec: 1.2,
  });
  const stats = (statusId: string, value: number, duration: number) => effect({
    kind: "applyBuff", sourceScope: "caster", statusId, stackKey: statusId, maxStacks: 1, duration,
    modifiers: ["ad", "ap"].map(stat => ({ stat, op: "pctAdd", value })),
    polarity: value < 0 ? "debuff" : "buff", dispellable: true,
  });
  const active = (slot: HeroSlot, castType: string, castTimeSec: number, effects: unknown[], purpose: string) => {
    const plan = project.acceptedPlan!.slots[slot];
    plan.products = [{ instanceId: `${slot.toLowerCase()}-sequence`, template: { ref: "tpl-effect-sequence", params: {
      castType, castTimeSec, radius: 2.75, side: "enemies", effects: effects.map(effect),
    } } }];
    plan.templateConflictPolicy = "reject";
    // The new template owns the entire effect sequence and windup. Old shield
    // and cast-time overrides must not silently append to the authored result.
    delete plan.abilityOverrides.effects;
    delete plan.abilityOverrides.castTimeTier;
    delete plan.abilityOverrides.castTimeSec;
    plan.purpose = purpose;
  };
  const passive = project.acceptedPlan.slots.PASSIVE;
  passive.products = [
    { instanceId: "passive-energy", template: { ref: "tpl-mark-stacks", params: {
      markId: ids.energy, initial: 0, max: 3, durationSec: -1, resetOn: "round", lethalMode: "none", perStackLost: [],
    } } },
    { instanceId: "passive-effective-cast", template: { ref: "tpl-event-passive", params: { hooks: [zHookDef.parse({
      on: "onDamageDealt", oncePerCast: true, victim: "enemy", target: "self",
      effects: [effect({ kind: "applyStatus", statusId: ids.energy, stacks: 1, duration: 1 })],
    })] } } },
  ];
  passive.purpose = "有效技能扣除敵人生命時，每次施法最多獲得一層負面能量；上限三層、回合重置。自傷、反傷、衍生效果與同次多段不重複集氣。";
  active("Q", "targeted", 0.2, [hit("physical"), effect({ kind: "knockback", distance: 0.4, speed: 8, subtractGap: false })],
    "短起手後普通一拳，造成小級距物理傷害並將目標擊退 0.4 GGD 單位。誇張起手與表情演出待驗。" );
  active("W", "ground", 0.1, [effect({ kind: "delayed", shape: "circle", radius: 2.75, side: "enemies",
    targetMode: "reresolve", delaySec: 0.05, count: 3, intervalSec: 0.45,
    effects: [hit("magic", "極小"), text("白色魔力雨 {{i}}", [255, 255, 255])],
  })], "固定落點落下三波白色魔力雨，間隔 0.45 秒；每波重查範圍內敵人，每敵人一次極小級距魔法傷害。白點、速度線及表情待視覺驗收。");
  active("E", "self", 0, [effect({ kind: "applyBuff", applyTo: "self", duration: 0.5, modifiers: [],
    statusId: ids.counter, stackKey: ids.counter, maxStacks: 1, hooks: [zHookDef.parse({
      on: "onDamageTaken", victim: "enemy", damageSource: "basic", maxTriggers: 1, onConsumed: "detachSource",
      condition: { all: [
        { kind: "distance", op: "<=", value: 2.5 },
        { kind: "facing", subject: "self", arcDegrees: 120 },
      ] },
      effects: [effect({ ...hit("physical"), incomingPct: { perRank: [0], negateOriginal: true, maxChainDepth: 0 } }),
        text("闇ぱんち！", [140, 89, 217], "self")],
    })],
  })], "GGD 反擊草案：0.5 秒內承接一次正面 120°、2.5 單位內敵方普攻，免除該次傷害並反擊原攻擊者，隨即移除窗口；反擊不可再反擊。近身技能分類及闇人格影子仍待補強。");
  active("R", "targeted", 0.8, [
    effect({ kind: "spendHealth", amount: { flat: 0 }, pctMaxHealth: 0.03, minimumHp: 1 }),
    effect({ kind: "spawnProjectile", projectileId: "imported.bolt.void", onHit: [hit("magic"), stats(ids.curse, -0.15, 4), text("萎靡 ↓", [166, 102, 217])] }),
  ], "蓄力 0.8 秒後支付最大生命 3%（至少保留 1 HP）並放出能量球；命中造成小級距魔法傷害，施加自身來源的萎靡四秒（AD/AP -15%）。當前虛空彈為代理演出。");
  active("EX", "targeted", 0, [effect({ kind: "consumeStatus", shape: "single", statusId: ids.curse, count: "all", appliedBy: "self",
    onConsumed: [stats(ids.boon, 0.1, 2), text("反轉增益 ↑ AD/AP +10%", [255, 204, 38]), text("怎麼反而變強了？！", [255, 230, 128], "self")],
    onMissing: [hit("magic"), stats(ids.exCurse, -0.2, 2), text("終章萎靡 ↓ AD/AP -20%", [166, 77, 204])],
  })], "先消耗三層負面能量。目標若有本施法者 R 萎靡，僅移除該詛咒，改給兩秒 AD/AP +10%，不造成一般 EX 傷害；否則造成小級距魔法傷害與兩秒 AD/AP -20%。金光、上揚圖示與驚愕表情待驗。");
  project.acceptedPlan.slots.EX.abilityOverrides.statusCost = { statusId: ids.energy, count: 3 };
  project.refinementNotes = { ...project.refinementNotes,
    PASSIVE: "M01/M10：正式 oncePerCast + 回合標記；需六槽整體模擬收據。",
    Q: "M10：短起手與固定 0.4u 目標擊退；誇張／普通的視覺反差待驗。",
    W: "M10/M11：固定落點三波、重新取敵；原作特效及漫畫表情未完成。",
    E: "M07/M10：取代舊護盾為一次近身普攻防守反擊；正面 120° 與 2.5u 條件可調；近身技能分類尚未表達，不標記 M07 完成；闇人格來源及影子演出待驗。",
    R: "M10：0.8s 釋放支付、非傷害生命代價、各施法者獨立詛咒。虛空彈是代理素材。",
    EX: "M10：三層施放資格／原子消耗、只反轉同來源 R。兩分支已有不同文字，金光、上揚圖示及施法者表情仍待視覺驗收。",
  };
  project.revision++;
  project.receipts = [];
  for (const section of ["skills", "mechanics", "validation", "package"] as const) {
    if (!project.sections[section]) continue;
    project.sections[section] = { ...project.sections[section], revision: project.revision, state: "stale" };
    project.validationState[section] = { revision: project.revision, status: "stale", diagnosticCodes: [] };
  }
  return zHeroProject.parse(project);
}

export function azazelStatusIds(heroId: string) {
  return { energy: `${heroId}.negative-energy`, curse: `${heroId}.r.curse`,
    exCurse: `${heroId}.ex.curse`, boon: `${heroId}.ex.boon`, counter: `${heroId}.e.counter` };
}
