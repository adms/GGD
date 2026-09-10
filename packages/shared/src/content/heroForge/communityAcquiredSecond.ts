import type { CommunityHeroExample, Move } from "./communityExamples";

type P = Record<string, unknown>;
type Band = "極小" | "小" | "中" | "大" | "極大";
const d = (damageTier: Band = "小") => ({ damageTier, ratios: [] });
const m = (name: string, purpose: string, ref: string, params: P, rest: Partial<Move> = {}): Move => ({ name, purpose, ref, params, ...rest });
const status = (statusId: string, duration: number, flags: P): P => ({ kind: "applyStatus", statusId, duration, applyTo: "target", ...flags });
const damage = (damageType = "magic", tier: Band = "小"): P => ({ kind: "damage", amount: d(tier), damageType });
const heal = (flat: number, applyTo = "self"): P => ({ kind: "heal", amount: { flat, ratios: [] }, applyTo });
const shield = (key: string, flat = 120): P => ({ kind: "shield", amount: { flat, ratios: [] }, duration: 3, absorbs: "all", stackKey: `$hero.${key}`, onExisting: "keepLarger" });
const haste = { stat: "as", op: "pctAdd", value: 0.2 };
const speed = { stat: "ms", op: "pctAdd", msBonusTier: "極小" };
const passive = (name: string, purpose: string, on: string, effects: P[], internalCooldown: number, condition?: P) => m(name, purpose, "tpl-event-passive", { hooks: [{ on, effects, internalCooldown, ...(condition ? { condition } : {}) }] });
const strike = (name: string, purpose: string, damageType = "physical", extra: P[] = [], options: Partial<Move> = {}) => m(name, purpose, "tpl-single-strike", { damage: d(), damageType, castTimeSec: 0.1 }, { effects: extra, ...options });
const buff = (name: string, purpose: string, modifiers: P[], effects: P[] = []) => m(name, purpose, "tpl-buff-self", { duration: 3, modifiers }, { effects });
const nova = (name: string, purpose: string, damageType = "magic", tier: Band = "小", radius = 250) => m(name, purpose, "tpl-ground-nova", { radius, damage: d(tier), damageType }, { range: "中" });
const wave = (name: string, purpose: string, damageType = "magic") => m(name, purpose, "tpl-traveling-wave", { stepSize: 60, stepCount: 10, stepIntervalSec: 0.05, aoePerStep: 150, terminalBurst: 250, damage: d(), damageType }, { range: "大" });
const leap = (name: string, purpose: string, damageType = "physical") => m(name, purpose, "tpl-leap-strike", { mode: "toPoint", applyTo: "self", apexHeight: 200, durationSec: 0.35, landRadius: 150, damage: d("極小"), damageType }, { range: "中" });
const allyShield = (name: string, purpose: string, target = "area") => m(name, purpose, "tpl-ally-shield", { target, amount: { flat: 130, ratios: [] }, duration: 3, radius: 4 }, { range: "中" });
const field = (name: string, purpose: string, anchor = "point", damageType = "magic") => m(name, purpose, "tpl-periodic-field", { intervalSec: 1, durationSec: 3, radiusTier: "小", anchor, applyTo: "enemies", damageTier: "極小", damageType });
const lock = (name: string, purpose: string, hitCount = 3) => m(name, purpose, "tpl-lock-combo", { hitCount, hitIntervalSec: 0.2, perHitDamage: d("極小"), finisherDamage: d(), finisherRadius: 150, damageType: "physical", lockTarget: "root", casterGuard: "none", trigger: "onCast" }, { range: "極小", cooldown: "大", mana: "大" });
const cc = (name: string, purpose: string, flags: P, radius = 250) => m(name, purpose, "tpl-apply-status", { radius, status: { statusId: "$hero.disruption", duration: 1.2, ...flags } });
const low = (subject = "target"): P => ({ kind: "stat", subject, stat: "hp", mode: "percent", op: "<", value: 0.4 });
const sourceUrl = "https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/hero-model-library/已取得模型待設計英雄.md";
const make = (id: string, name: string, sourceWork: string, origin: CommunityHeroExample["origin"], summary: string, adaptations: string[], moves: CommunityHeroExample["moves"]): CommunityHeroExample => ({ id, name, inspiration: name, sourceWork, sourceUrl, origin, summary, adaptations, moves });

/** Author recipes only. Models/audio are attached from the verified asset selection. */
export const COMMUNITY_ACQUIRED_SECOND: readonly CommunityHeroExample[] = [
  make("acquired-kita-kita", "吉他吉他老伯（阿德巴古·艾魯多魯）", "咕嚕咕嚕魔法陣", "軟輔", "舞蹈不是傷害，但敵人很想閉眼：舞台致盲保護隊友，連跳把觀眾困在舞步裡。", ["舞蹈複用致盲、鎖足與護盾；不強制玩家鏡頭觀看。", "Q→R限制走位；W護隊友、EX給單人回血，敵人可離開舞台或先控制老伯。"], {
    PASSIVE: passive("越挨打越想跳", "受到傷害時獲得90護盾，持續3秒，內置冷卻8秒。", "onDamageTaken", [shield("dance", 90)], 8),
    Q: cc("別看下半身", "指定區域敵人失手率50%，持續1.2秒。", { missChance: 0.5 }),
    W: allyShield("觀眾席安全距離", "給落點附近友軍與自己130護盾，持續3秒。"),
    E: leap("舞步巡迴", "跳向落點造成極小級物理傷害，換位擋在隊友前方。"),
    R: cc("全員原地學舞", "地面區域敵人鎖足1.2秒；先Q遮眼，再留人讓隊友輸出。", { root: true }, 400),
    EX: m("跳累了先喝水", "回復指定隊友120生命；不是對敵傷害。", "tpl-heal", { target: "ally", amount: { flat: 120, ratios: [] } }),
  }),
  make("acquired-wargreymon", "戰鬥暴龍獸", "數碼寶貝大冒險", "鬥士", "背盾像鍋蓋、蓋亞能量像外送：先貼身拆包，再把火球送到收件地。", ["龍獸剋星不新增物種判斷；以近戰爪擊和短效護盾表現。", "E貼身→Q減速→R落點爆破；對手可拉開距離避開R。"], {
    PASSIVE: passive("鍋蓋還沒掀", "受到傷害後獲得120護盾，持續3秒，內置冷卻9秒。", "onDamageTaken", [shield("brave")], 9),
    Q: strike("龍獸拆箱爪", "爪擊造成小級物理傷害並減速30%，持續1.5秒。", "physical", [status("$hero.claw", 1.5, { moveSpeedMult: 0.7 })], { range: "極小" }),
    W: buff("勇氣鍋蓋", "獲得3秒140護盾，準備承受貼身反擊。", [], [shield("lid", 140)]),
    E: leap("勇者快遞", "跳至落點造成極小級物理傷害，接近收件人。"),
    R: { ...nova("蓋亞能量到付", "指定區域爆發大級魔法傷害；延長前搖給對手走位空間。", "magic", "大", 350), cooldown: "大", mana: "大", cast: "大" },
    EX: wave("恐龍火氣很大", "推出逐段火浪，小級魔法傷害，同一敵人行進段只命中一次。"),
  }),
  make("acquired-saya", "沙耶", "沙耶之歌", "法師", "把戰場當廚房，菜色看起來不對勁；黏住客人、持續汲取，拒絕用餐的會嚇跑。", ["異常視覺以既有失手與恐懼表現，不改全場畫面。", "W減速留在R領域→Q汲取；對手走出領域或利用施法距離反制。"], {
    PASSIVE: passive("吃一口就好", "技能命中後回復自己25生命，內置冷卻3秒。", "onAbilityHit", [heal(25)], 3),
    Q: m("不明食材試吃", "給指定敵人3秒持續魔法傷害，施放時回復自己50生命。", "tpl-drain-leech", { damageTier: "極小", damageType: "magic", leechFlat: 50, intervalSec: 1, durationSec: 3, stacking: "refresh" }),
    W: cc("餐桌黏黏的", "區域敌人減速40%，持續1.2秒。", { moveSpeedMult: 0.6 }),
    E: strike("看見真實菜單", "小級魔法傷害，並使敵人恐懼0.8秒。", "magic", [status("$hero.fear", 0.8, { feared: true })]),
    R: { ...field("今晚全席開放", "落點留下3秒領域，每秒極小級魔法傷害；W留客後使用。"), cooldown: "大", mana: "大" },
    EX: cc("閉眼比較好吃", "附近落點敵人失手率45%，持續1.2秒，用來抵擋追擊。", { missChance: 0.45 }),
  }),
  make("acquired-naruto", "漩渦鳴人", "火影忍者 NARUTO", "鬥士", "分身負責排隊、本體負責插隊：先拉麵加速接近，再把螺旋丸送到面前。", ["影分身複用同體召喚，沒有分身再分身或各自施放完整技能。", "W分身分散火力→E近身→Q螺旋丸→R直線追擊；範圍傷害可清理分身。"], {
    PASSIVE: passive("打架前先吃麵", "施放技能後回復自身20生命，內置冷卻3秒。", "onAbilityCast", [heal(20)], 3),
    Q: strike("螺旋丸加麵", "近距離小級魔法傷害並減速25%，持續1.2秒。", "magic", [status("$hero.rasengan", 1.2, { moveSpeedMult: 0.75 })], { range: "極小" }),
    W: m("影分身代排", "召喚2個同體分身，存在6秒、傷害20%、生命25%，最多2個，本體死亡消失。", "tpl-summon-agent", { count: 2, body: "self", durationSec: 6, damageMult: 0.2, hpMult: 0.25, formation: "ring", spread: 2, maxAlive: 2, onOwnerDeath: "despawn", cleanse: "none" }),
    E: m("忍者插隊術", "快速移向指定敵人，抵達造成極小級物理傷害；落點仍受地形限制。", "tpl-teleport", { destination: "targetUnit", travelSec: 0.1, arriveRadius: 150, damage: d("極小"), damageType: "physical" }, { range: "中" }),
    R: { ...wave("螺旋手裡麵", "直線行進波造成小級魔法傷害，末端爆破；對手可側向避開。"), cooldown: "大", mana: "大" },
    EX: buff("拉麵要趁熱", "獲得3秒極小級移速與20%攻速，接近或退場。", [speed, haste]),
  }),
  make("acquired-lord-nightmares", "金色魔王／惡夢之王", "秀逗魔導士", "法師", "宇宙級客服也得先集單：每次施法累積工單，三張一起結案。", ["滅世簡化成有限範圍傷害；不刪地圖、不全場秒殺。", "Q/W/E施法累積三層→EX消耗全層爆發；R先留區域壓力，敵人可拉開EX施法距離。"], {
    PASSIVE: m("混沌客服工單", "每次施法累積1層自身工單，上限3，持續15秒，供EX消耗。", "tpl-charge-resource", { event: "onAbilityCast", statusId: "$hero.chaos", perEvent: 1, maxStacks: 3, durationSec: 15 }),
    Q: strike("金色退件章", "對指定敵人造成小級魔法傷害。", "magic"),
    W: cc("宇宙暫停受理", "指定區域敵人鎖足1.2秒，準備後續區域技能。", { root: true }),
    E: m("客服轉接", "短距離瞬步到落點，受既有落點限制；同時累積工單。", "tpl-blink", {}, { range: "小" }),
    R: { ...field("退回混沌重填", "落點留下3秒傷害領域，每秒極小級魔法傷害。"), cooldown: "大", mana: "大" },
    EX: m("三單一起結案", "消耗至少3層自身工單，對指定敵人造成大級魔法傷害；不足時沒有傷害。", "tpl-spend-resource", { statusId: "$hero.chaos", minStacks: 3, castType: "targeted", effects: [damage("magic", "大")], missingText: "工單不足三張" }, { cooldown: "大", mana: "大" }),
  }),
  make("acquired-rim", "莉姆（Rim；粉紅魔龍）", "迷宮黑心企業／異世界迷宮黑心企業", "狂戰", "粉紅魔龍的加班便當：低血獵物比較香，撲上去吃完再吵著加薪。", ["保留粉紅魔龍身分，不套用利姆路；吞食改為近戰傷害與回血，不吞掉玩家。", "E追人→Q留人→低血R收尾；對手在撲擊後拉開，避免讓低血普攻觸發。"], {
    PASSIVE: m("這個快熟了", "普攻生命低於40%的目標追加極小級物理傷害，內置冷卻2秒。", "tpl-on-attack", { event: "onBasicAttack", condition: low(), bonusDamage: d("極小"), damageType: "physical", internalCooldown: 2 }),
    Q: strike("午休咬一口", "近戰小級物理傷害並減速30%，持續1.5秒。", "physical", [status("$hero.bite", 1.5, { moveSpeedMult: 0.7 })], { range: "極小" }),
    W: buff("加班費先預支", "3秒提高20%攻速並回復自身80生命。", [haste], [heal(80)]),
    E: leap("便當在那邊", "撲向指定落點造成極小級物理傷害。"),
    R: m("整份都我的", "近距離造成小級物理傷害並回復120生命；目標生命低於40%再追加小級傷害。", "tpl-effect-sequence", { castType: "targeted", effects: [damage("physical"), heal(120), { ...damage("physical"), condition: low() }] }, { range: "極小", cooldown: "大", mana: "大" }),
    EX: cc("沒吃飽不准下班", "指定區域敌人減速40%，持續1.2秒，方便繼續追餐。", { moveSpeedMult: 0.6 }),
  }),
  make("acquired-xiaodangjia", "小當家", "中華一番！", "軟輔", "料理會發光，對手真的看不到：上菜回血、鍋蓋護友，發光料理替隊伍爭取輸出時間。", ["料理不新增物品或飽食系統；發光用失手狀態，補給用真正友軍回血與護盾。", "Q致盲→R留場；W/EX救隊友，敵人可走出餐桌或先逼退廚師。"], {
    PASSIVE: passive("試味不用錢", "施放技能後回復自己20生命，內置冷卻4秒。", "onAbilityCast", [heal(20)], 4),
    Q: cc("料理怎麼又發光", "區域敵人失手率60%，持續1.2秒。", { missChance: 0.6 }),
    W: m("趁熱吃", "指定隊友回復140生命。", "tpl-heal", { target: "ally", amount: { flat: 140, ratios: [] } }),
    E: nova("猛火快炒", "指定落點小級魔法爆破，用來阻擋追近廚房的敵人。"),
    R: { ...field("麻婆豆腐流水席", "留下3秒燙口區域，每秒極小級魔法傷害；先Q降低反擊風險。"), cooldown: "大", mana: "大" },
    EX: allyShield("鍋蓋全席", "落點友軍與自己獲得130護盾，持續3秒。"),
  }),
  make("acquired-inuyasha", "犬夜叉", "犬夜叉", "鬥士", "鐵碎牙拆快遞，風之傷清走廊；被打痛就露出半妖的火氣。", ["風之傷和爆流破用既有直線/反击傷害組合，不反射任何尚未支援的投射物。", "Q减速→E貼近→R連段；W直線追擊，對手可利用近戰施放距離拉扯。"], {
    PASSIVE: passive("半妖起床氣", "生命低於40%時受到傷害，回復60生命；內置冷卻8秒。", "onDamageTaken", [heal(60)], 8, low("self")),
    Q: strike("鐵碎牙拆門", "小級物理傷害並減速30%，持續1.5秒。", "physical", [status("$hero.fang", 1.5, { moveSpeedMult: 0.7 })], { range: "極小" }),
    W: wave("風之傷清走廊", "向前推出風刃，小級物理傷害，行進段同一敵人只命中一次。", "physical"),
    E: leap("半妖跨欄", "跳向落點造成極小級物理傷害。"),
    R: lock("鐵碎牙不是開罐器", "近距離鎖足敵人後三連擊與收尾；施法者沒有無敵。"),
    EX: buff("爆流破先擋一下", "获得3秒150護盾及極小級移速，用來扛住反擊再換位。", [speed], [shield("bakuryu", 150)]),
  }),
  make("acquired-asuna", "亞絲娜／結城明日奈", "刀劍神域 Sword Art Online", "法刺", "閃光劍士趕著吃晚餐：加速靠近、細劍連刺，把黏人的敵人切成排隊狀態。", ["星屑飛濺以有限次連擊表現，不加入原作劍技硬直或新連擊資源。", "W加速→E貼身→Q减速→R連段；對手可在貼身前控制或撤離。"], {
    PASSIVE: passive("開飯倒數", "技能命中後獲得20%攻速3秒，內置冷卻5秒。", "onAbilityHit", [{ kind: "applyBuff", applyTo: "self", duration: 3, modifiers: [haste], stackKey: "$hero.flash" }], 5),
    Q: strike("細劍取餐號", "近戰小級物理傷害并減速25%，持續1.2秒。", "physical", [status("$hero.ticket", 1.2, { moveSpeedMult: 0.75 })], { range: "極小" }),
    W: buff("閃光趕飯", "獲得3秒極小級移速與90護盾，準備突進。", [speed], [shield("dinner", 90)]),
    E: m("插入隊伍最前面", "短距離突進指定敵人旁造成小級物理傷害，落點保留距離。", "tpl-blink-strike", { range: 6, stopShortUnits: 1.8, damage: d(), damageType: "physical" }),
    R: lock("星屑飛濺別灑到湯", "近戰鎖足後四次連刺与收尾，施法者没有無敵。", 4),
    EX: m("晚餐預約成功", "自行回復110生命，作為貼身戰後補給。", "tpl-heal", { target: "self", amount: { flat: 110, ratios: [] } }),
  }),
  make("acquired-alice", "愛麗絲·滋貝魯庫（Alice Zuberg）", "刀劍神域 Sword Art Online", "坦克", "金木樨花瓣像罰單：先把人留下，再讓花瓣包圍；隊友的安全由騎士簽收。", ["武裝完全支配用既有區域射線，沒有持續追蹤的實體花瓣AI。", "Q鎖足→R射線；W護隊友，E換位。敵人可走出陣列或先打斷接近。"], {
    PASSIVE: passive("整合騎士查票", "受到傷害時獲得110護盾3秒，內置冷卻10秒。", "onDamageTaken", [shield("integrity", 110)], 10),
    Q: cc("金木樨停車單", "落點敵人鎖足1.2秒，為花瓣陣列留下目標。", { root: true }),
    W: allyShield("騎士擔保", "為指定隊友提供130護盾，持續3秒。", "ally"),
    E: leap("騎士查勤", "跳至指定落點造成極小級物理傷害。"),
    R: m("花瓣罰單連發", "周圍向內依序發出6道射線，每道極小級魔法傷害；在Q鎖足後施放。", "tpl-orbit-array", { rayCount: 6, reach: 300, aim: "inward", rayIntervalSec: 0.15, damage: d("極小"), damageType: "magic" }, { cooldown: "大", mana: "大" }),
    EX: buff("今天不准加班受傷", "自身獲得3秒180護盾，抵擋被集火。", [], [shield("overtime", 180)]),
  }),
  make("acquired-leafa", "莉法", "刀劍神域 Sword Art Online", "軟輔", "風精靈的外送服務：回血送到人、護盾送到區域，把敵人吹離取餐區。", ["飛行改成有界跳躍，不提供永久越牆；風精靈魔法複用友軍回血、護盾與推移。", "W拉開敵人→Q補隊友；E追上隊伍→R集體護盾，敵人可繞開正面衝刺。"], {
    PASSIVE: passive("順風不用跑腿費", "施放技能後獲得極小級移速2秒，內置冷卻5秒。", "onAbilityCast", [{ kind: "applyBuff", applyTo: "self", duration: 2, modifiers: [speed], stackKey: "$hero.wind" }], 5),
    Q: m("精靈補給到府", "為指定隊友回復130生命。", "tpl-heal", { target: "ally", amount: { flat: 130, ratios: [] } }),
    W: m("外送區禁止停車", "向前短衝并推開命中的敵人，造成極小級魔法傷害。", "tpl-charge-push", { dashDistance: 150, dashDurationSec: 0.2, apexHeight: 0, radius: 180, damage: d("極小"), damageType: "magic", pushDistance: 350, pushSpeed: 872, pushFrom: "facing", pushLaunchHeight: 0 }),
    E: leap("精靈抄近路", "跳到指定落點造成極小級魔法傷害，靠近需要幫助的隊友。", "magic"),
    R: { ...allyShield("風精靈團購保險", "落點友軍與自己獲得130護盾3秒。"), cooldown: "大", mana: "大" },
    EX: wave("風刃催單", "直線風刃造成小級魔法傷害，給撤退隊友爭取空間。"),
  }),
  make("acquired-kuroyukihime", "黑雪姬", "加速世界", "法刺", "黑蓮把延遲當仇人：短移切進、斷線留人、低血收尾，但再快也有冷卻。", ["加速以短移與攻速增益表現，不改遊戲時間或網路延遲。", "E進場→Q鎖足→W加速普攻→R收尾；對手守住控制等她落地反擊。"], {
    PASSIVE: m("延遲斬殺", "普攻低於40%生命目標追加極小級物理傷害，內置冷卻3秒。", "tpl-on-attack", { event: "onBasicAttack", condition: low(), bonusDamage: d("極小"), damageType: "physical", internalCooldown: 3 }),
    Q: strike("你的連線已中斷", "小級物理傷害并鎖足0.8秒，保留後續連擊窗口。", "physical", [status("$hero.disconnect", 0.8, { root: true })], { range: "極小" }),
    W: buff("先加速再解釋", "自身3秒20%攻速與極小級移速。", [haste, speed]),
    E: m("黑蓮快速登入", "短距離突進敵人旁並造成小級物理傷害。", "tpl-blink-strike", { range: 6, stopShortUnits: 1.8, damage: d(), damageType: "physical" }),
    R: m("死亡穿刺強制登出", "近距離小級物理傷害；目標生命低於40%追加小級傷害。", "tpl-effect-sequence", { castType: "targeted", effects: [damage("physical"), { ...damage("physical"), condition: low() }] }, { cooldown: "大", mana: "大", range: "極小" }),
    EX: m("撤回上一則位置", "短距離瞬步到落點，用於進場後撤離；受地形與邊界限制。", "tpl-blink", {}, { range: "小", cooldown: "大" }),
  }),
];
