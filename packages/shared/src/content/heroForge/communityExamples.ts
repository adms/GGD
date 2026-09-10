import { defaultAbilityMaxRank } from "../schema/ability";
import type { TemplateDoc } from "../schema/template";
import { archetypeForOrigin, ORIGIN_ATTACK_TYPE } from "../heroForge";
import { HERO_PROJECT_SCHEMA, HERO_PLAN_SCHEMA, HERO_SECTION_IDS, HERO_SLOTS, type HeroSlot } from "./constants";
import { zHeroSlotPlans, type Origin } from "./plan";
import { defaultHeroPresentation } from "./presentation";
import { zHeroProject, type HeroProject } from "./schema";
import { pinHeroPlanTemplates } from "./templateVersions";

type Band = "極小" | "小" | "中" | "大" | "極大";
type Params = Record<string, unknown>;
export interface Move {
  name: string;
  purpose: string;
  ref: string;
  params: Params;
  effects?: Params[];
  abilityOverrides?: Record<string, unknown>;
  range?: Band;
  cooldown?: Band;
  mana?: Band;
  cast?: Band;
}
export interface CommunityHeroExample {
  id: string;
  inspiration: string;
  name: string;
  origin: Origin;
  attackType?: "melee" | "ranged";
  modelKey?: string;
  summary: string;
  adaptations: readonly string[];
  sourceUrl: string;
  moves: Readonly<Record<HeroSlot, Move>>;
}

// These are ordinary authoring recipes. No champion-specific runtime branch,
// downloaded Riot asset, model call or alternate balance formula is involved.
const damage = (damageTier: Band) => ({ damageTier, ratios: [] });
const always = { kind: "chance", p: 1 };
const speed = { stat: "ms", op: "pctAdd", msBonusTier: "極小" };
const haste = { stat: "as", op: "pctAdd", value: 0.2 };
const guard = (key: string, absorbs = "all") => ({ kind: "shield", amount: { flat: 120, ratios: [] }, duration: 3, absorbs, stackKey: key, onExisting: "keepLarger" });
const status = (statusId: string, flags: Params, duration = 0.8) => ({ kind: "applyStatus", statusId, duration, applyTo: "target", ...flags });
const move = (name: string, purpose: string, ref: string, params: Params, options: Omit<Partial<Move>, "name" | "purpose" | "ref" | "params"> = {}): Move => ({ name, purpose, ref, params, ...options });
const attack = (name: string, purpose: string, damageType = "magic", condition: Params = always) => move(name, purpose, "tpl-on-attack", { event: "onBasicAttack", condition, bonusDamage: damage("極小"), damageType, internalCooldown: 2 });
const strike = (name: string, purpose: string, damageType = "magic", options: Partial<Move> = {}) => move(name, purpose, "tpl-single-strike", { damage: damage("小"), damageType, castTimeSec: 0.1 }, options);
const buff = (name: string, purpose: string, modifiers: Params[], options: Partial<Move> = {}) => move(name, purpose, "tpl-buff-self", { duration: 3, modifiers, castTimeSec: 0.1 }, options);
const nova = (name: string, purpose: string, tier: Band = "小", options: Partial<Move> = {}) => move(name, purpose, "tpl-ground-nova", { radius: 300, damage: damage(tier), damageType: "magic", castTimeSec: 0.3 }, options);
const field = (name: string, purpose: string, anchor = "point") => move(name, purpose, "tpl-periodic-field", { intervalSec: 1, durationSec: 3, radiusTier: "小", anchor, applyTo: "enemies", damageTier: "極小", damageType: "magic", castTimeSec: 0.3 });
const line = (name: string, purpose: string, damageType = "magic", options: Partial<Move> = {}) => move(name, purpose, "tpl-line-sweep", { segmentCount: 4, stepSize: 100, segmentAoe: 150, damage: damage("極小"), damageType, castTimeSec: 0.3 }, options);
const combo = (name: string, purpose: string, damageType = "physical") => move(name, purpose, "tpl-lock-combo", { hitCount: 3, hitIntervalSec: 0.3, perHitDamage: damage("極小"), finisherDamage: damage("小"), finisherRadius: 400, damageType, lockTarget: "root", casterGuard: "none", trigger: "onCast" }, { range: "極小", cooldown: "大", mana: "大", cast: "大" });

export const COMMUNITY_HERO_EXAMPLES: readonly CommunityHeroExample[] = [
  {
    id: "warwick", inspiration: "沃維克", name: "沃維克", origin: "狂戰",
    summary: "循血追擊的近戰獵手，以短程撲擊、持續汲取與壓制連段作戰。",
    adaptations: ["低血量獵物改為普攻追加傷害，追獵加速需主動施放；不提供全圖追蹤。", "減傷改為短效護盾，恐懼為指定目標；大招可被反擊，沒有無敵。"],
    sourceUrl: "https://www.leagueoflegends.com/zh-tw/champions/warwick/",
    moves: {
      PASSIVE: attack("嗅血", "普攻生命低於 35% 的目標時追加極小級魔法傷害，內置冷卻 2 秒。", "magic", { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.35 }),
      Q: move("噬痕", "對指定敵人施加持續傷害，3 秒內每秒造成傷害；施放時立即回復自身生命。", "tpl-drain-leech", { damageTier: "極小", damageType: "magic", leechFlat: 50, intervalSec: 1, durationSec: 3, stacking: "refresh", castTimeSec: 0.1 }, { range: "極小" }),
      W: buff("循血疾行", "主動獲得 3 秒極小級移速加成與 20% 攻速加成。", [speed, haste]),
      E: strike("驚獵嚎聲", "指定近處敵人，造成傷害並使其恐懼 0.8 秒。", "magic", { range: "極小", effects: [status("fear", { feared: true })] }),
      R: combo("獵衛封喉", "鎖足敵人 0.9 秒，連續汲傷後收尾；施法者不獲得無敵。", "magic"),
      EX: buff("血性護甲", "獲得持續 3 秒的全傷害護盾；同一護盾保留較大值。", [], { cooldown: "大", effects: [guard("concept-warwick-guard")] }),
    },
  },
  {
    id: "karthus", inspiration: "卡爾瑟斯", name: "卡爾瑟斯", origin: "法師",
    summary: "在陣地間敲響暮鐘，使用延遲爆破、持續領域與有預警的遠端轟擊。",
    adaptations: ["死亡後施法改為每場一次的免死續命，仍須存活才能施法。", "安魂曲改成極大級施放距離內的落點轟擊，沒有全圖命中；領域有固定期限。"],
    sourceUrl: "https://www.leagueoflegends.com/zh-tw/champions/karthus/",
    moves: {
      PASSIVE: move("未竟尾聲", "每場持有一層續命標記；致命傷時消耗標記並恢復部分生命。死亡後不能施法。", "tpl-mark-stacks", { markId: "$hero.last-song", initial: 1, max: 1, durationSec: -1, resetOn: "match", perStackLost: [], lethalMode: "save", lethalConsume: 1, surviveHpPct: 0.01, internalCooldown: 1, invulnerableSec: 0.5, restoreHealthPct: 0.15, aoeRadius: 0, knockbackDistance: 0, stunSec: 0 }),
      Q: nova("暮點", "短暫吟唱後，在指定區域引爆小級魔法傷害。", "小", { cast: "中", cooldown: "極小" }),
      W: strike("亡途繫縛", "以單體咒縛取代牆體，命中敵人後減速 35%，持續 2 秒。", "magic", { effects: [status("slow35", { moveSpeedMult: 0.65 }, 2)] }),
      E: field("荒蕪迴音", "以自身為中心維持 3 秒傷害領域，每秒傷害一次。", "caster"),
      R: nova("暮鐘終曲", "經極大級吟唱，在極大級施放距離內引爆指定區域；不是全圖技能。", "大", { range: "極大", cast: "極大", cooldown: "極大", mana: "大" }),
      EX: buff("靜默幕衣", "獲得只吸收魔法傷害的 3 秒護盾，提供一段施法準備時間。", [], { cooldown: "大", effects: [guard("concept-karthus-guard", "magic")] }),
    },
  },
  {
    id: "lux", inspiration: "拉克絲", name: "拉克絲", origin: "軟輔", attackType: "ranged",
    summary: "結合光束、短效束縛與護盾，以清楚的施法提示協助隊伍創造進攻空間。",
    adaptations: ["照明標記改為有內置冷卻的普攻魔法追加，不保留標記引爆條件。", "護盾改為自身護盾，束縛只命中指定一人；光束依本遊戲距離與傷害級距結算。"],
    sourceUrl: "https://www.leagueoflegends.com/zh-tw/champions/lux/",
    moves: {
      PASSIVE: attack("餘光", "普攻追加極小級魔法傷害，內置冷卻 2 秒。"),
      Q: strike("稜光束縛", "命中指定敵人並鎖足 0.8 秒，不會同時束縛第二個目標。", "magic", { effects: [status("root", { root: true })] }),
      W: buff("折光護衣", "獲得持續 3 秒的全傷害護盾，同名護盾保留較大值。", [], { effects: [guard("concept-lux-guard")] }),
      E: field("流光之域", "在落點留下 3 秒光域，每秒造成極小級魔法傷害。"),
      R: line("破曉光路", "向前依序展開四段光束判定；敵人可受到相交段落的傷害。", "magic", { range: "大", cooldown: "大", mana: "大", cast: "大" }),
      EX: buff("引路星芒", "獲得 3 秒極小級移速加成，並恢復自身少量生命。", [speed], { cooldown: "大", effects: [{ kind: "heal", amount: { flat: 80, ratios: [] }, applyTo: "self" }] }),
    },
  },
  {
    id: "yasuo", inspiration: "犽宿", name: "犽宿", origin: "鬥士",
    summary: "以短程穿行與風刃連擊掌握距離，使用防護姿態承受反擊。",
    adaptations: ["第三次斬擊旋風改為獨立 EX；大招不要求擊飛，但有固定鎖足與冷卻。", "風牆改為限時物理護盾，不摧毀投射物；不提供雙倍暴擊或無限突進。"],
    sourceUrl: "https://www.leagueoflegends.com/zh-tw/champions/yasuo/",
    moves: {
      PASSIVE: attack("風行刃", "普攻追加極小級物理傷害，內置冷卻 2 秒。", "physical"),
      Q: line("斬風", "朝前方斬出四段窄風刃，以本遊戲線段判定命中。", "physical", { range: "小", cooldown: "極小" }),
      W: buff("迎風架勢", "獲得只吸收物理傷害的護盾，持續 3 秒；不會消除投射物。", [], { effects: [guard("concept-yasuo-guard", "physical")] }),
      E: move("踏風進擊", "朝指定方向短距突進，打擊接觸範圍的敵人；推移量會扣除雙方距離。", "tpl-charge-push", { dashDistance: 300, dashDurationSec: 0.25, apexHeight: 0, radius: 150, damage: damage("極小"), damageType: "physical", pushDistance: 300, pushSpeed: 872, pushFrom: "facing", pushLaunchHeight: 0, castTimeSec: 0.1 }, { range: "小" }),
      R: combo("天際斷章", "鎖足指定敵人後連擊三次，再以收尾斬結束；沒有無敵。"),
      EX: strike("旋風縛步", "將蓄風招式獨立為 EX，對指定敵人造成物理傷害並鎖足 0.8 秒。", "physical", { range: "大", cooldown: "大", effects: [status("root", { root: true })] }),
    },
  },
  {
    id: "missfortune", inspiration: "好運姐", name: "好運姐", origin: "射手",
    summary: "以雙重射擊、機動增益與持續彈雨控制交戰區域。",
    adaptations: ["換目標額外傷害改為固定內置冷卻，不因切換目標重置。", "彈射使用最多兩人的連鎖判定；大招改為有界落點彈幕，非自由轉向的錐形掃射。"],
    sourceUrl: "https://www.leagueoflegends.com/zh-tw/champions/missfortune/",
    moves: {
      PASSIVE: attack("先聲奪人", "普攻追加極小級物理傷害，內置冷卻 2 秒。", "physical"),
      Q: strike("回聲雙響", "先命中指定敵人，再發出最多兩人的物理連鎖；起點會承受追加一擊。", "physical", { effects: [{ kind: "chainLightning", shape: "single", amount: damage("極小"), damageType: "physical", jumps: 2, jumpRange: 3, decay: 0.8, revisit: false, maxTotalJumps: 2, jumpIntervalSec: 0.1 }] }),
      W: buff("揚帆快步", "獲得 3 秒極小級移速加成與 20% 攻速加成。", [speed, haste]),
      E: field("緋帆彈雨", "在指定區域維持 3 秒彈雨，每秒造成極小級魔法傷害。"),
      R: move("扇港齊射", "向指定區域連續投下六發物理彈幕，散布及命中區域均有界。", "tpl-random-barrage", { count: 6, intervalSec: 0.2, impactDamage: damage("極小"), damageType: "physical", impactRadius: 150, scatterRadius: 150, payout: "perImpact", castTimeSec: 0.5 }, { range: "大", cooldown: "大", mana: "大", cast: "大" }),
      EX: buff("藏帆備彈", "短暫以全傷害護盾掩護換位，持續 3 秒。", [speed], { cooldown: "大", effects: [guard("concept-missfortune-guard")] }),
    },
  },
  {
    id: "leesin", inspiration: "李星", name: "李星", origin: "鬥士",
    summary: "以聲波探擊、短程進身、護身與踢離敵人的連續節奏作戰。",
    adaptations: ["能量改用共通魔力，技能後兩次普攻改為有冷卻的普攻追加。", "聲波與追擊分為 Q／EX，無二段重施放；護盾只給自身，踢擊使用共通推移機制。"],
    sourceUrl: "https://www.leagueoflegends.com/zh-tw/champions/leesin/",
    moves: {
      PASSIVE: attack("回響拳", "普攻追加極小級物理傷害，內置冷卻 2 秒。", "physical"),
      Q: strike("聽雷探手", "以中級距射程攻擊指定敵人；不會自動開啟第二段位移。", "physical"),
      W: buff("定心護體", "獲得 3 秒護盾與 20% 攻速加成。", [haste], { effects: [guard("concept-leesin-guard")] }),
      E: nova("震地迴響", "在指定近處引爆小級物理傷害，保留可瞄準的落點。", "小", { range: "小", params: { radius: 300, damage: damage("小"), damageType: "physical", castTimeSec: 0.3 } }),
      R: move("斷陣踢", "短距進身後打擊並向前推開敵人，不附帶無敵或全場追蹤。", "tpl-charge-push", { dashDistance: 200, dashDurationSec: 0.2, apexHeight: 0, radius: 150, damage: damage("小"), damageType: "physical", pushDistance: 400, pushSpeed: 872, pushFrom: "facing", pushLaunchHeight: 100, castTimeSec: 0.3 }, { range: "小", cooldown: "大", mana: "大" }),
      EX: move("逐響躍步", "朝落點跳躍並在著地時打擊附近敵人，作為獨立追擊技能。", "tpl-leap-strike", { mode: "toPoint", applyTo: "self", apexHeight: 300, durationSec: 0.5, landRadius: 150, damage: damage("小"), damageType: "physical", castTimeSec: 0.1 }, { range: "中", cooldown: "大" }),
    },
  },
  {
    id: "xerath", inspiration: "齊勒斯", name: "齊勒斯", origin: "法師",
    summary: "以蓄能光路、落點爆破與定身咒彈控制距離，施放有限次數的奧術轟擊。",
    adaptations: ["普攻回魔改為 EX 主動回復固定比例魔力，受冷卻限制。", "蓄力及大招重瞄準改為一次施放的固定時序；最遠射程使用極大級距。"],
    sourceUrl: "https://www.leagueoflegends.com/zh-tw/champions/xerath/",
    moves: {
      PASSIVE: attack("逸散奧能", "普攻追加極小級魔法傷害，內置冷卻 2 秒。"),
      Q: line("星牢光路", "吟唱後向前產生四段奧術打擊，使用大級距施放距離。", "magic", { range: "大", cast: "大" }),
      W: nova("星核墜落", "在指定區域引爆小級魔法傷害。"),
      E: strike("奧能拘束", "對指定敵人造成傷害並暈眩 0.8 秒，不按飛行距離延長。", "magic", { effects: [status("stun", { stun: true })] }),
      R: move("星牢轟擊", "在極大級距內選定落點，依序降下三發奧術砲擊，無法中途重新瞄準。", "tpl-random-barrage", { count: 3, intervalSec: 0.5, impactDamage: damage("小"), damageType: "magic", impactRadius: 200, scatterRadius: 100, payout: "perImpact", castTimeSec: 1 }, { range: "極大", cast: "極大", cooldown: "極大", mana: "大" }),
      EX: buff("回收奧能", "獲得短效魔法護盾並回復自身 15% 最大魔力；受到 EX 冷卻限制。", [], { cooldown: "極大", effects: [guard("concept-xerath-guard", "magic"), { kind: "restore", manaPct: 0.15, applyTo: "self" }] }),
    },
  },
];

/** New independent identity on every creation; source concepts never imply a published GGD version. */
export function createCommunityHeroExample(exampleId: string, projectId: string, templates: readonly TemplateDoc[], generatorVersion?: string): HeroProject {
  const recipe = COMMUNITY_HERO_EXAMPLES.find((entry) => entry.id === exampleId);
  if (!recipe) throw new Error(`找不到社群驗收範例：${exampleId}`);
  return createCommunityHeroRecipe(recipe, projectId, templates, generatorVersion);
}

/** Compile an authoring recipe with its own identity and pinned template sources. */
export function createCommunityHeroRecipe(recipe: CommunityHeroExample, projectId: string, templates: readonly TemplateDoc[], generatorVersion?: string): HeroProject {
  const catalog = new Map(templates.map((template) => [template.id, template]));
  const withHeroId = <T,>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll("$hero", projectId));
  const sourceLock = { canonicalId: null, versionId: null };
  const concept = `${recipe.summary}\n\n概念來源：LoL ${recipe.inspiration}\n${recipe.sourceUrl}\n\n本遊戲改編：\n${recipe.adaptations.map((text) => `• ${text}`).join("\n")}\n\n${recipe.modelKey ? "採用所選 GGD 模型與特效。" : "採用既有 GGD 模型與特效，外觀為驗收用替身。"}`;
  const presentation = defaultHeroPresentation();
  presentation.modelKey = recipe.modelKey ?? (recipe.origin === "法師" || recipe.origin === "軟輔" ? "champ.sela" : "champ.thorne");
  const slots = zHeroSlotPlans.parse(Object.fromEntries(HERO_SLOTS.map((slot) => {
    const definition = recipe.moves[slot];
    const template = catalog.get(definition.ref);
    if (!template || template.status !== "enabled") throw new Error(`${recipe.inspiration} ${slot} 的模板尚不可用：${definition.ref}`);
    const passive = slot === "PASSIVE";
    const abilityId = `${projectId}.${slot.toLowerCase()}`;
    if (!passive) presentation.slots[slot].script = {
      schema: "vfx-script@1", id: abilityId, abilityId,
      segments: [{ kind: "anim", on: "castStart", at: "caster", pulse: "cast" },
        { kind: "floatingText", on: "castEffect", text: definition.name, colorRgb: [210, 230, 255], durationSec: 0.7 },
        ...(slot === "R" ? [{ call: { subtype: "sub.forward-twin-blast", params: { trigger: "castEffect", anchor: "target", offsetForwardU: 0, burstLifeSec: 0.8 } } }] : [])],
    };
    return [slot, {
      slot, name: definition.name, purpose: definition.purpose, maxRank: defaultAbilityMaxRank(slot),
      products: [{ instanceId: `${recipe.id}-${slot.toLowerCase()}-1`, template: { ref: definition.ref, inheritDefaults: true,
        params: withHeroId(definition.params) } }],
      templateConflictPolicy: "reject",
      tuning: { cooldownSec: passive ? 0 : 10, manaCost: passive ? 0 : 40, range: passive ? 0 : 6 },
      abilityOverrides: withHeroId({ provenance: "editor-json", ...(passive ? {} : { rangeTier: definition.range ?? "中", cooldownTier: definition.cooldown ?? (slot === "EX" ? "大" : "小"), manaCostTier: definition.mana ?? "小", castTimeTier: definition.cast ?? "小" }), ...(definition.effects ? { effects: definition.effects } : {}), ...definition.abilityOverrides }),
      capabilityIds: [...template.requires], directionOptionIds: [], fallbackOptionIds: [],
    }];
  })));
  const project = zHeroProject.parse({
    schema: HERO_PROJECT_SCHEMA, projectId, revision: 1, sourceLock,
    brief: { name: recipe.name, concept, moveNames: Object.fromEntries(HERO_SLOTS.map((slot) => [slot, slots[slot].name])) },
    acceptedPlan: { schema: HERO_PLAN_SCHEMA, planId: `${projectId}.concept`, title: recipe.name, summary: concept, sourceLock,
      origin: recipe.origin, archetype: archetypeForOrigin(recipe.origin), attackType: recipe.attackType ?? ORIGIN_ATTACK_TYPE[recipe.origin] ?? "melee", budget: { power: 50, complexity: 40 }, statOverrides: {}, slots },
    presentation, receipts: [],
    sections: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 1, state: "draft", fieldOwnership: {} }])),
    validationState: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 1, status: "idle", diagnosticCodes: [] }])),
  });
  project.acceptedPlan = pinHeroPlanTemplates(project.acceptedPlan!, templates);
  if (generatorVersion) project.acceptedPlan.generatorVersion = generatorVersion;
  return zHeroProject.parse(project);
}
