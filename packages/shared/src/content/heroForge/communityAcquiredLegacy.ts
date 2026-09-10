import type { CommunityHeroExample, Move } from "./communityExamples";
import { contentSha256 } from "../import/jcs";

type Data = Record<string, unknown>;
type Band = NonNullable<Move["range"]>;
const source = "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j";
const amount = (damageTier: Band) => ({ damageTier, ratios: [] });
const hit = (tier: Band = "小", damageType = "magic", extra: Data = {}): Data => ({ kind: "damage", amount: amount(tier), damageType, ...extra });
const status = (key: string, duration: number, flags: Data = {}, applyTo = "target"): Data => ({ kind: "applyStatus", statusId: `$hero.${key}`, sourceScope: "caster", duration, applyTo, ...flags });
const modifier = (stat: string, value: number, op = "flat") => ({ stat, op, value });
const buff = (key: string, duration: number, modifiers: Data[], extra: Data = {}): Data => ({ kind: "applyBuff", statusId: `$hero.${key}`, stackKey: `$hero.${key}`, duration, modifiers, applyTo: "self", ...extra });
const area = (tier: Band, radius: number, damageType = "magic", onHitTargets: Data[] = []): Data => ({ kind: "damageArea", amount: amount(tier), damageType, radius, includeOrigin: true, ...(onHitTargets.length ? { onHitTargets } : {}) });
const line = (tier: Band, length: number, width: number, damageType = "magic", extra: Data = {}): Data => ({ kind: "damageLine", amount: amount(tier), damageType, length, width, aim: "target", fromCaster: true, includeOrigin: true, ...extra });
const push = (distance: number, from = "caster"): Data => ({ kind: "knockback", distance, speed: 12, from, subtractGap: false });
const dot = (tier: Band, durationSec: number): Data => ({ kind: "dot", amountPerTick: amount(tier), damageType: "magic", intervalSec: 1, durationSec, stacking: "refresh", onCasterDeath: "stop" });
const chain = (tier: Band, jumps: number): Data => ({ kind: "chainLightning", shape: "single", amount: amount(tier), damageType: "magic", jumps, jumpRange: 3, decay: 0.8, revisit: false, maxTotalJumps: jumps, jumpIntervalSec: 0.1 });
const summon = (count: number, durationSec: number, damageMult: number, hpMult: number): Data => ({ kind: "summon", body: "self", count, durationSec, damageMult, hpMult, formation: "ring", spread: 1.2, maxAlive: count, onCap: "replaceOldest", onOwnerDeath: "despawn", at: "self" });
const pulse = (radius: number, count: number, intervalSec: number, effects: Data[], anchor = "point", extra: Data = {}): Data => ({ kind: "delayed", shape: "circle", radius, side: "enemies", delaySec: intervalSec, count, intervalSec, targetMode: "reresolve", anchor, stopOnCasterDeath: true, effects, ...extra });
const cast = (name: string, purpose: string, castType: string, effects: Data[], options: Partial<Move> = {}): Move => ({ name, purpose, ref: "tpl-effect-sequence", params: { castType, castTimeSec: 0.1, radius: 2, side: "enemies", effects }, ...options });
// The editor's product boundary owns passive payloads; express grants through
// the enabled event template instead of forbidden abilityOverrides.passive.
const passive = (name: string, purpose: string, rank: Data): Move => {
  const { hooks = [], auras = [], ...grant } = rank;
  const result = [...hooks as Data[]];
  if (Object.keys(grant).length) result.push({ on: "onInterval", internalCooldown: 0.5, target: "self", effects: [
    buff(`p-${contentSha256(name).slice(-10)}`, 0.6, [], grant),
  ] });
  for (const entry of auras as Data[]) result.push({ on: "onInterval", internalCooldown: 0.5, effects: [
    pulse(entry.radius as number, 1, 0.1, [buff(`aura-${entry.key}`, 0.6, entry.modifiers as Data[], { applyTo: "target" })], "caster"),
  ] });
  return { name, purpose, ref: "tpl-event-passive", params: { hooks: result } };
};
const attackHook = (effects: Data[], extra: Data = {}): Data => ({ on: "onBasicAttack", effects, ...extra });
const stealth = (key: string, speed: number): Data => buff(key, 5, [modifier("ms", speed, "pctAdd")], {
  vision: { stealthFadeDelaySec: 0 }, hooks: [attackHook([hit("小", "physical")], { maxTriggers: 1, onConsumed: "detachSource" })],
});
const aura = (key: string, radius: number, modifiers: Data[]) => ({ key, radius, affects: "enemy", includeSelf: false, lingerSec: 0, modifiers });
const has = (statusId: string, subject = "self") => ({ kind: "status", subject, statusId: `$hero.${statusId}`, appliedBy: "self" });
const common = "原物件說明與 JASS 函式另存來源稽核；傷害、距離、冷卻和持續時間依 GGD 競技場調整。被動的屬性、格擋與光環以既有事件模板在戰鬥期間每 0.5 秒刷新；非戰鬥期間不刷新，戰鬥開始／學習／復活後可能延後最多 0.5 秒生效。所有版本由同一 Editor project 保存，不直接覆寫既有英雄。";

/** Canonical rawcode identities restored as editable recipes; N01B is Nman's form. */
export const COMMUNITY_ACQUIRED_LEGACY: CommunityHeroExample[] = [
  {
    id: "godie-hlgr", inspiration: "鋼彈／煌（Hlgr）", name: "鋼彈", sourceWork: "鋼彈SEED", sourceUrl: source,
    origin: "射手", attackType: "ranged", summary: "以裝甲承受普攻，詭雷減防牽制後接磁軌暈眩和直線砲擊；龍騎兵提供短期集火。",
    adaptations: [common, "相轉移裝甲保留 40% 觸發率，原固定減傷 75／至少承傷 12 改為物理傷害減半。詭雷的原文『攻速減少為 200%』不直接當合法百分比，改為降低 20%。", "全彈發射用六個向前推進的圓形判定，每名敵人整次最多中一次；不重複計入重疊爆圈。龍騎兵改為八個有限生命的自身召喚代理，沿用英雄普攻，不宣稱原版環繞砲台、300 固定傷害或返回回血。"],
    moves: {
      PASSIVE: passive("相轉移裝甲", "戰鬥期間承受物理傷害時有 40% 機率減少該次傷害的 50%；不格擋魔法或真實傷害。", { block: { damageTypes: ["physical"], chance: 0.4, fraction: 0.5 } }),
      Q: cast("詭雷", "命中敵人造成極小級魔法傷害並降低護甲 2，持續 3 秒；其施放位置留下 3 秒毒霧，每秒傷害並短暫降低攻速 20%。", "targeted", [hit("極小"), buff("mine-armor", 3, [modifier("armor", -2)], { applyTo: "target" }), pulse(2, 3, 1, [hit("極小"), buff("mine-haste", 1.1, [modifier("as", -0.2, "pctAdd")], { applyTo: "target" })])]),
      W: cast("磁軌砲", "對指定敵人造成小級魔法傷害並暈眩 0.5 秒，方便銜接光束砲。", "targeted", [hit(), status("rail-stun", 0.5, { stun: true })]),
      E: cast("鯨式電漿光束炮", "朝瞄準方向發射長 8、寬 1 的直線光束，對線上敵人造成中級魔法傷害。", "skillshot", [line("中", 8, 1)], { range: "大", cast: "中" }),
      R: cast("全彈發射", "向前連續展開六段爆破，每名敵人整次最多受到一次中級魔法傷害和 1 秒暈眩；可橫向避開推進路線。", "skillshot", [pulse(2, 6, 0.12, [hit("中"), status("all-bullets-stun", 1, { stun: true })], "point", { hitOncePerTarget: true, advance: { startDist: 0.5, stepDist: 1.2, dir: "target" } })], { range: "大", cooldown: "大", cast: "大", mana: "大" }),
      EX: cast("龍騎兵", "召出八個自身外形的作戰代理，持續 8 秒，各有本體 12% 生命與 12% 攻擊傷害；可被擊殺，本體死亡時消失。", "self", [summon(8, 8, 0.12, 0.12)], { cooldown: "極大", mana: "大" }),
    },
  },
  {
    id: "godie-eevi", inspiration: "拔刀齋／緋村劍心（Eevi）", name: "劍心拔刀齋", sourceWork: "神劍闖江湖", sourceUrl: source,
    origin: "鬥士", summary: "用飛龍閃製造接近窗口，神速選位後打出九頭連斬；天翔龍閃在近身範圍爆發並抵擋魔法。",
    adaptations: [common, "Eevi 是緋村劍心；E012 佐佐木小次郎共用部分技能但不是同一身分，不互相覆寫。飛龍閃物件／研發說明的首階暈眩為 0.5 秒，部分技能文字寫 1 秒，本配方採 0.5 秒。", "九頭龍閃保留前方命中後九連擊與推退，原 JASS 的來回斬擊位置改為鎖定已命中的目標，不移動施法者。天翔龍閃保留 2 秒範圍傷害與魔法傷害免疫，不防真傷／物理或控制。", "真打原本是 R 的十八旋風被動追加；EX 改為單獨施放的三次近身風刃，避免把未實作的十八條飛行軌跡寫進技能。"],
    moves: {
      PASSIVE: passive("龍搥閃", "普攻有 13% 機率對受擊目標周圍 1.5 範圍造成小級物理傷害。", { hooks: [attackHook([area("小", 1.5, "physical")], { chance: 0.13 })] }),
      Q: cast("飛龍閃", "以飛出的刀柄打擊指定敵人，造成小級物理傷害並暈眩 0.5 秒。", "targeted", [hit("小", "physical"), status("hilt-stun", 0.5, { stun: true })]),
      W: cast("神速", "瞬移到小級距內的指定地點，用於切入或離開近身交戰；不造成傷害。", "ground", [{ kind: "blink", shape: "single", to: "point", applyTo: "self" }], { range: "小", cast: "極小" }),
      E: cast("九頭龍閃", "前方長 4、寬 1.5 的劍路造成極小級物理傷害；命中者減速 25%，接著承受九次極小級斬擊並於最後被推開 1.5。", "skillshot", [line("極小", 4, 1.5, "physical", { onHitTargets: [status("nine-slow", 1.5, { moveSpeedMult: 0.75 }), { kind: "delayed", shape: "single", delaySec: 0.12, count: 9, intervalSec: 0.12, targetMode: "frozen", stopOnCasterDeath: true, effects: [hit("極小", "physical")], finalEffects: [push(1.5)] }] })], { range: "小", cooldown: "大" }),
      R: cast("天翔龍閃", "以自身為中心在 2 秒內斬出四次極小級物理傷害；期間免疫魔法傷害，仍會受到物理、真實傷害及控制。", "self", [{ kind: "invulnerable", applyTo: "self", durationSec: 2, blocksDamage: "magic", blocksTrueDamage: false, blocksControl: false }, pulse(2.5, 4, 0.5, [hit("極小", "physical")], "caster")], { cooldown: "大", mana: "大" }),
      EX: cast("天翔龍閃‧真打", "接近敵人後獨立施放三次近身風刃，每次造成極小級物理傷害；敵人可離開 3 範圍躲避後續斬擊。", "self", [pulse(3, 3, 0.3, [hit("極小", "physical")], "caster")], { cooldown: "大", mana: "大" }),
    },
  },
  {
    id: "godie-e00q", inspiration: "黑化Saber／英靈-亞瑟王（E00Q）", name: "黑化Saber英靈亞瑟王", sourceWork: "Fate/hollow ataraxia", sourceUrl: source,
    origin: "鬥士", summary: "重劍暴擊搭配力量與魔力被動，黑泥代理牽制敵人後，以當前魔力增幅直線聖劍。",
    adaptations: [common, "Q 力量強化、R 魔力增幅保留學習型被動，屬性在戰鬥期間刷新，不偽裝成攻擊按鍵。黑化之力原為對英雄的 18% 暴擊，改編來源暴擊適用所有普攻目標；移動與攻速各降低 10%。", "黑泥召喚使用一個短命自身代理，近處敵人於召喚當下減速；不是代理每次普攻都附帶減速。聖劍保留當前魔力 40% 項，原多個重疊圈改為一次直線命中。", "黑洞改為 4 秒固定區域，降低移速 30%、攻速 30% 和護甲 6；未沿用原攻速降低 100%／護甲降低 18 的數值。"],
    moves: {
      PASSIVE: passive("黑化之力", "戰鬥期間移速與攻速降低 10%；普攻有 18% 機率獲得 2.4 倍來源暴擊，依共通暴擊規則結算。", { modifiers: [modifier("ms", -0.1, "pctAdd"), modifier("as", -0.1, "pctAdd")], critStrike: { chance: 0.18, damageMult: 2.4, lifestealFraction: 0 } }),
      Q: passive("力量強化", "學習後在戰鬥期間持續增加 4 力量；這是被動槽，無需施放。", { attributes: { str: 4 } }),
      W: cast("黑泥召喚", "召出一個存活 8 秒的黑泥作戰代理，繼承本體 30% 生命與 35% 攻擊；施放時使附近 2 範圍敵人短暫減速 20%。", "self", [summon(1, 8, 0.35, 0.3), pulse(2, 1, 0.1, [status("mud-slow", 1.5, { moveSpeedMult: 0.8 })], "caster")]),
      E: cast("約束與勝利之劍", "向前發出長 8、寬 1.5 的聖劍光束，每名命中敵人承受小級魔法傷害，再加施放結算時自身當前魔力的 40%。", "skillshot", [line("小", 8, 1.5, "magic", { resourcePct: { subject: "self", resource: "mana", basis: "current", perRank: [0.4] } })], { range: "大", cast: "大", cooldown: "大", mana: "大" }),
      R: passive("魔力增幅", "學習後在戰鬥期間持續增加 500 最大魔力和每秒 8 生命恢復，強化持久戰與聖劍的魔力傷害。", { modifiers: [modifier("maxMana", 500), modifier("healthRegen", 8)] }),
      EX: cast("固有結界-黑洞", "指定地點展開 4 秒黑洞。每秒使 3 範圍內敵人移速降低 30%、攻速降低 30%、護甲降低 6，離開後短暫殘留。", "ground", [pulse(3, 4, 1, [status("black-hole-slow", 1.1, { moveSpeedMult: 0.7 }), buff("black-hole-weakness", 1.1, [modifier("as", -0.3, "pctAdd"), modifier("armor", -6)], { applyTo: "target" })])], { cooldown: "大", mana: "大", cast: "中" }),
    },
  },
  {
    id: "godie-usyl", inspiration: "異形／殺戮之牙（Usyl）", name: "異形殺戮之牙", sourceWork: "異形", sourceUrl: source,
    origin: "鬥士", summary: "潛行接近、撲殺暈眩並以腐蝕毒液纏鬥；擊殺敵方英雄增長敏捷，母體與感染擴大獵場。",
    adaptations: [common, "原天生主動撲殺爪擊移到 W；原 W 腐蝕毒液移到 PASSIVE，保留六槽且不把主動技能寫成假被動。E 保留擊殺敵方英雄增加敏捷、基礎敏捷 140 上限；原射程加成依 GGD 改為小幅普攻範圍加成。", "Q 隱形從 25 秒縮短為 5 秒，第一下普攻追加傷害，不檢查背後角度。R 母體改為三次有界幼體召喚，本體仍是唯一產生來源，沒有獨立可破壞的產卵母體。", "EX 保留感染持續傷害與攻速降低；由自己擊殺仍帶自身感染標記的敵方英雄才召出短命女王代理，不宣稱其他隊友擊殺也能觸發。代理沿用自身外形。"],
    moves: {
      PASSIVE: passive("腐蝕毒液", "普攻使敵人每秒受到極小級魔法毒傷，持續 2 秒並降低攻速 15%；重複命中刷新。", { hooks: [attackHook([dot("極小", 2), buff("acid-as", 2, [modifier("as", -0.15, "pctAdd")], { applyTo: "target" })])] }),
      Q: cast("遮斷獵殺", "潛行最多 5 秒，期間移速降低 15%；第一下普攻追加小級物理傷害並結束這份潛行增益。", "self", [stealth("hunt", -0.15)]),
      W: cast("撲殺爪擊", "利爪撲殺指定近處敵人，造成小級物理傷害並暈眩 1.5 秒；不附帶未實作的跳躍追蹤。", "targeted", [hit("小", "physical"), status("pounce-stun", 1.5, { stun: true })], { range: "極小" }),
      E: passive("蛻變", "學習後在戰鬥期間普攻範圍增加 0.2；每擊殺一名敵方英雄增加 1 敏捷，基礎敏捷達 140 後不再增加。", { modifiers: [modifier("range", 0.2)], hooks: [{ on: "onKill", victim: "enemyChampion", target: "self", effects: [{ kind: "grantAttribute", attr: "agi", amount: 1, mode: "flat", maxAttribute: 140, maxAttributeBasis: "base" }] }] }),
      R: cast("母體", "立即產出兩個幼體代理，之後每 3 秒再產出兩個，共三批；同時最多兩個，每個存活 3 秒，繼承本體 15% 生命與 20% 攻擊。", "self", [summon(2, 3, 0.2, 0.15), { kind: "delayed", shape: "single", delaySec: 3, count: 2, intervalSec: 3, targetMode: "frozen", stopOnCasterDeath: true, effects: [summon(2, 3, 0.2, 0.15)] }], { cooldown: "大", mana: "大" }),
      EX: cast("產卵", "使敵人感染 5 秒，每秒承受極小級魔法傷害、攻速降低 50%；自己在感染期間擊殺該敵方英雄後召出一個 8 秒女王代理。", "targeted", [dot("極小", 5), status("infection", 5), buff("infection-as", 5, [modifier("as", -0.5, "pctAdd")], { applyTo: "target" }), buff("queen-watch", 5.1, [], { hooks: [{ on: "onKill", victim: "enemyChampion", condition: has("infection", "target"), effects: [summon(1, 8, 0.5, 0.4)] }] })], { cooldown: "大", mana: "大" }),
    },
  },
  {
    id: "godie-nbst", inspiration: "瘋狂假面／變態正義（Nbst）", name: "瘋狂假面變態正義", sourceWork: "瘋狂假面", sourceUrl: source,
    origin: "鬥士", summary: "以豆皮壽司暈眩接滑行地獄車，內褲變身提供近身續戰，最後抓住對手強行餵食。",
    adaptations: [common, "原天生 SM 派對為三秒傷害轉治療與加攻速；改為受到普攻後小量回血的被動，沒有取消原傷害或無敵，攻速增幅併入 R。W 變態根性仍是學習型護甲被動。", "地獄車用短距衝刺期間的連續近身檢查，同一人僅受一次傷害；原 STR 係數改採共同傷害級距。EX 原五秒雙方暫停／無敵的抓抱改為兩秒可受傷的抓抱連擊，取消原版鋼彈免抓特例。"],
    moves: {
      PASSIVE: passive("SM派對", "每 1 秒最多一次，受到敵人的普攻傷害後回復 20 生命；原傷害仍會結算，致死傷害不能靠此技能免死。", { hooks: [{ on: "onDamageTaken", damageSource: "basic", internalCooldown: 1, target: "self", effects: [{ kind: "heal", amount: { flat: 20, ratios: [] }, applyTo: "self" }] }] }),
      Q: cast("這是我的豆皮壽司", "向指定近處敵人強行展示豆皮壽司，造成小級物理傷害並暈眩 1.5 秒。", "targeted", [hit("小", "physical"), status("tofu-stun", 1.5, { stun: true })], { range: "極小" }),
      W: passive("變態根性", "學習後在戰鬥期間持續增加 2 護甲，支撐滑入敵陣後的近身戰。", { modifiers: [modifier("armor", 2)] }),
      E: cast("變態絕技悶絕地獄車", "向瞄準位置滑行最多 5 距離；途中每 0.1 秒檢查近身 1.2 範圍，觸及敵人造成中級物理傷害，同一人最多一次。", "ground", [{ kind: "dash", mode: "toPoint", maxDistance: 5, speed: 10 }, pulse(1.2, 5, 0.1, [hit("中", "physical")], "caster", { hitOncePerTarget: true })], { range: "中", cooldown: "大" }),
      R: cast("內褲變身", "維持 6 秒戰鬥姿態，攻擊傷害增加 50%、攻速增加 20%、每秒生命恢復增加 15；本配方不切換模型。", "self", [buff("underwear", 6, [modifier("ad", 0.5, "pctAdd"), modifier("as", 0.2, "pctAdd"), modifier("healthRegen", 15)])], { cooldown: "大", mana: "大" }),
      EX: cast("來~快點吃吧", "抓抱指定近處敵人 2 秒，雙方不能自行移動或攻擊施法，每 0.5 秒對其造成極小級物理傷害；雙方仍可被其他人傷害。", "targeted", [{ kind: "carry", shape: "single", durationSec: 2, untargetable: { autoAcquire: false, mobAggro: false, manualTarget: false, abilityAoe: false }, onHitTargets: [status("feed-lock", 2, { root: true, silenced: true, disarmed: true })] }, status("feed-self-lock", 2, { root: true, silenced: true, disarmed: true }, "self"), { kind: "delayed", shape: "single", delaySec: 0.5, count: 4, intervalSec: 0.5, targetMode: "frozen", stopOnCasterDeath: true, effects: [hit("極小", "physical")] }], { range: "極小", cooldown: "極大", mana: "大" }),
    },
  },
  {
    id: "godie-nman", inspiration: "胖虎／地獄歌神（Nman；N01B 為同英雄形態）", name: "胖虎地獄歌神", sourceWork: "小叮噹（哆啦A夢）", sourceUrl: source,
    origin: "鬥士", summary: "歌聲削弱身邊敵人的普攻，以貓王姿態擴大攻擊連鎖，再躍進人群演出地獄搖滾。",
    adaptations: [common, "N01B 與 Nman 是同一英雄形態，只有 godie-nman 配方。威脅之拳保留普攻機率觸發；貓王改為暫時延伸攻擊範圍與三目標連鎖，不宣稱切換投射物模型或原十二次反彈。", "地獄搖滾保留到達落點、六次音波與終曲；貓王期間終曲加倍。不給原 JASS 的全程無敵。環繞音響由全圖敵方英雄傷害改為 8 範圍的延遲音爆，離開範圍可躲避。"],
    moves: {
      PASSIVE: passive("我~是~孩~子~王~", "戰鬥期間周圍 3 範圍敵人的攻擊傷害降低 19%，每 0.5 秒刷新，離開後最多殘留 0.6 秒。", { auras: [aura("king", 3, [modifier("ad", -0.19, "pctAdd")])] }),
      Q: passive("威脅之拳", "學習後，普攻有 15% 機率追加極小級物理傷害並暈眩目標 1 秒。", { hooks: [attackHook([hit("極小", "physical"), status("fist-stun", 1, { stun: true })], { chance: 0.15 })] }),
      W: cast("必殺！爆熱神音！", "以自己為中心放出音波，對 2.5 範圍敵人造成小級魔法傷害。", "self", [pulse(2.5, 1, 0.1, [hit()], "caster")]),
      E: cast("萬解-貓王胖虎", "進入 6 秒貓王姿態，普攻範圍增加 3；普攻每秒最多觸發一次三目標音波連鎖，起點也承受追加傷害。姿態期間施放終曲可加倍。", "self", [buff("elvis", 6, [modifier("range", 3)], { hooks: [attackHook([chain("極小", 3)], { internalCooldown: 1 })] }), status("elvis", 6, {}, "self")], { cooldown: "大" }),
      R: cast("地獄搖滾", "跳往指定落點後，每 0.4 秒對身邊 3 範圍敵人唱出一次極小級音波，共六次；第六次追加中級終曲，仍處於貓王姿態時再追加一次中級傷害。", "ground", [{ kind: "leap", mode: "toPoint", applyTo: "self", apexHeight: 1.5, durationSec: 0.5, onLand: [pulse(3, 6, 0.4, [hit("極小")], "caster", { finalEffects: [hit("中"), hit("中", "magic", { condition: has("elvis") })] })] }], { range: "中", cooldown: "大", mana: "大" }),
      EX: cast("環繞音響", "以自身為中心預備 1 秒後，對 8 範圍內敵人造成大級魔法傷害；不是全圖命中。", "self", [pulse(8, 1, 1, [hit("大")], "caster")], { cooldown: "極大", mana: "大", cast: "極小" }),
    },
  },
  {
    id: "godie-e00t", inspiration: "貞子／七夜怪談（E00T）", name: "貞子七夜怪談", sourceWork: "七夜怪談", sourceUrl: source,
    origin: "法師", summary: "靈體化進場，以驚駭逼走敵人；維持消耗魔力的靈壓封鎖近身區域，幽靈與死亡漫延懲罰留在外圍的人。",
    adaptations: [common, "恐懼的原始文字含未展開的 A0IF token，本配方明訂受普攻後令攻擊者短暫失手 20%。靈體化保留潛行與首擊，時長改為 5 秒。", "七夜怪談改為三次自動選取附近敵人的靈擊，不生成原本可移動、碰撞自爆的鬼魂身體。R 使用既有按秒耗魔的切換技能與 whileOn 靈氣；啟動另有 0.5 秒壓迫脈衝，使附近敵人短暫再減速 10%。不是固定秒數假開關。", "死亡漫延原為 R 強化被動，改為獨立 EX 三次傷害；沿用既有 distanceScale 讓遠處傷害較高，不要求 R 已開啟。"],
    moves: {
      PASSIVE: passive("恐懼", "受到普攻後使攻擊者在 2 秒內有 20% 機率普攻失手，每 1 秒最多觸發一次。", { hooks: [{ on: "onDamageTaken", damageSource: "basic", internalCooldown: 1, effects: [status("terror-miss", 2, { missChance: 0.2 })] }] }),
      Q: cast("靈體化", "潛行最多 5 秒並增加 15% 移速；第一下普攻追加小級物理傷害，之後卸下潛行與移速增益。", "self", [stealth("spirit", 0.15)]),
      W: cast("驚駭", "短暫釋放怨念，使周圍 2.5 範圍敵人恐懼並沉默 0.8 秒，可用來進退與阻止反擊。", "self", [pulse(2.5, 1, 0.1, [status("fright", 0.8, { feared: true, silenced: true })], "caster")]),
      E: cast("七夜怪談", "在接下來 1.5 秒內，每 0.5 秒以靈擊打擊自身 4 範圍內的敵人，每次造成極小級魔法傷害；離開範圍可避開後續靈擊。", "self", [pulse(4, 3, 0.5, [hit("極小")], "caster")]),
      R: cast("靈壓震撼", "切換靈壓：啟動時以 0.5 秒脈衝使附近敵人額外減速 10%；維持期間每秒消耗 10 魔力，周圍 3 範圍敵人的移速與攻速降低 20%。手動關閉或魔力不足時光環解除，啟動脈衝自然到期。", "self", [pulse(3, 1, 0.1, [status("pressure-start", 0.5, { moveSpeedMult: 0.9 })], "caster")], { cooldown: "極小", mana: "極小", cast: "極小", abilityOverrides: { toggle: { upkeepCadence: "perSecond", upkeepCost: [10], upkeepIntervalSec: 1, upkeepResource: "mana", exitOnResourceEmpty: true, onExit: [], whileOn: { ranks: [{ auras: [aura("spiritual-pressure", 3, [modifier("ms", -0.2, "pctAdd"), modifier("as", -0.2, "pctAdd")])] }] } } } }),
      EX: cast("死亡漫延", "每 0.5 秒對自身周圍 6 範圍敵人釋放怨念，共三次。每次以極小級魔法傷害為基準，貼身為 0.5 倍、距離 6 為 2 倍，中間依距離增加。", "self", [pulse(6, 3, 0.5, [hit("極小", "magic", { distanceScale: { atRange: 6, near: 0.5, far: 2 } })], "caster")], { cooldown: "大", mana: "大" }),
    },
  },
  {
    id: "godie-h021", inspiration: "阿強一號／破銅爛鐵（H021）", name: "阿強一號破銅爛鐵", sourceWork: "GGD 原始地圖（角色來源未填）", sourceUrl: source,
    origin: "硬輔", summary: "原始物件借用賈修電擊招式；GGD 將其合理改編為廢鐵機體的放電、磁吸與推撞，以維修支撐近身控制。",
    adaptations: [common, "H021 原始單位未填故事來源；A08Z／A090／A091／A092 的原始技能文字本來就是賈修 05 系列，不把借文說成阿強已有完整原創技能，也不推定原作。原文及原物件完整保留於來源稽核。", "沿用原名薩喀爾系列作為電擊／磁力的 GGD 合理改編；E 由原雙磁球瞬移敵人改為近身磁吸，R 由推撞其他單位才爆炸改為命中即爆炸後推退，均不宣稱擁有未支援的碰撞回呼。", "原天生啦嗚薩喀爾的三秒無敵／傷害轉治療改為受普攻後回血的有冷卻被動；EX 原單位未提供連結，新增主題性的緊急焊補護盾與減速代價，使用既有效果。"],
    moves: {
      PASSIVE: passive("啦嗚薩喀爾", "廢鐵回收模式：受到普攻後回復 25 生命，內置冷卻 2 秒；不取消已受傷害，不提供無敵。", { hooks: [{ on: "onDamageTaken", damageSource: "basic", internalCooldown: 2, target: "self", effects: [{ kind: "heal", amount: { flat: 25, ratios: [] }, applyTo: "self" }] }] }),
      Q: cast("薩喀爾", "從指定敵人開始放出最多命中三名不同敵人的連鎖雷電，起始傷害為小級魔法傷害，每次跳躍保留 80%。", "targeted", [chain("小", 3)]),
      W: cast("薩喀爾嘎", "朝瞄準方向射出長 7、寬 1 的貫穿電束，對線上敵人造成小級魔法傷害。", "skillshot", [line("小", 7, 1)], { range: "大" }),
      E: cast("及喀爾度", "機體釋放磁力脈衝，對附近 3 範圍敵人造成極小級魔法傷害，並向自身拉近最多 2 距離。", "self", [pulse(3, 1, 0.1, [hit("極小"), push(2, "pull")], "caster")], { cooldown: "中" }),
      R: cast("巴歐．薩喀爾嘎", "電磁巨擊鎖定敵人，在其附近 2 範圍引爆中級魔法傷害，接著把原目標向外推退 3；爆炸發生在推退之前，不等待撞人。", "targeted", [area("中", 2), push(3)], { cooldown: "大", mana: "大", cast: "大" }),
      EX: cast("緊急焊補", "站穩焊補：獲得 3 秒可吸收 160 全傷害的護盾，立即回復 80 生命；期間自身移速降低 25%。", "self", [{ kind: "shield", amount: { flat: 160, ratios: [] }, duration: 3, absorbs: "all", stackKey: "$hero.weld-shield", onExisting: "keepLarger" }, { kind: "heal", amount: { flat: 80, ratios: [] }, applyTo: "self" }, status("welding", 3, { moveSpeedMult: 0.75 }, "self")], { cooldown: "大", mana: "大" }),
    },
  },
];
