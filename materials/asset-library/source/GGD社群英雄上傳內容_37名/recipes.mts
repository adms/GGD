/** Workflow authoring input. This sidecar is not a replacement for HeroProject. */
export const damage = (damageTier = "小") => ({ damageTier, ratios: [] });
const speed = { stat: "ms", op: "pctAdd", msBonusTier: "極小" };
const haste = { stat: "as", op: "pctAdd", value: 0.2 };
const ad = { stat: "ad", op: "pctAdd", value: 0.15 };
const ap = { stat: "ap", op: "pctAdd", value: 0.15 };
const shield = (amount = 120) => ({ kind: "shield", amount: { flat: amount, ratios: [] }, duration: 3, absorbs: "all", stackKey: "$hero.$slot.guard", onExisting: "keepLarger" });
const heal = (amount = 80) => ({ kind: "heal", amount: { flat: amount, ratios: [] }, applyTo: "self" });
const slow = (duration = 1) => ({ kind: "applyStatus", statusId: "slow30", duration, applyTo: "target", moveSpeedMult: 0.7 });
const root = (duration = 0.7) => ({ kind: "applyStatus", statusId: "root", duration, applyTo: "target", root: true });
const stun = (duration = 0.5) => ({ kind: "applyStatus", statusId: "stun", duration, applyTo: "target", stun: true });
export type Move = { ref: string; params: any; actual: string; gap: string; shape: string; family?: string; effects?: any[]; bands?: any; };
const m = (ref: string, params: any, actual: string, gap = "", shape = "pulse", extra: any = {}): Move => ({ ref, params, actual, gap, shape, ...extra });
const passive = (gap: string, type = "physical", seconds = 3) => m("tpl-on-attack", { event: "onBasicAttack", condition: { kind: "chance", p: 1 }, bonusDamage: damage("極小"), damageType: type, internalCooldown: seconds }, `普攻追加極小級${type === "physical" ? "物理" : "魔法"}傷害，內置冷卻 ${seconds} 秒。`, gap, "pulse-sm");
const react = (gap: string, type = "magic") => m("tpl-on-hit-react", { chance: 1, reflectDamage: damage("極小"), damageType: type, reflectRadius: 300, internalCooldown: 4 }, "受傷時觸發有 4 秒冷卻的小範圍反擊；不是防禦成功或閃避成功事件。", gap, "pulse-sm");
const save = (gap: string) => m("tpl-mark-stacks", { markId: "$hero.last-chance", initial: 1, max: 1, durationSec: -1, resetOn: "match", perStackLost: [], lethalMode: "save", lethalConsume: 1, surviveHpPct: 0.01, internalCooldown: 1, invulnerableSec: 0.5, restoreHealthPct: 0.15, aoeRadius: 0, knockbackDistance: 0, stunSec: 0 }, "本場一層免死標記，首次致死消耗並回復 15% 生命，保護 0.5 秒。", gap, "pulse-sm");
const strike = (gap = "", type = "physical", extra: any = {}) => m("tpl-single-strike", { damage: damage("小"), damageType: type, castTimeSec: 0.2 }, `指定單一敵人造成小級${type === "physical" ? "物理" : "魔法"}傷害。`, gap, "slash", { bands: { rangeTier: "小" }, ...extra });
const line = (gap = "", type = "magic", extra: any = {}) => m("tpl-line-sweep", { segmentCount: 4, stepSize: 100, segmentAoe: 150, damage: damage("極小"), damageType: type, castTimeSec: 0.35 }, "向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。", gap, "beam", extra);
const wave = (gap = "", type = "magic") => m("tpl-traveling-wave", { stepSize: 100, stepCount: 4, stepIntervalSec: 0.12, aoePerStep: 100, damage: damage("極小"), damageType: type, castTimeSec: 0.2 }, "四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。", gap, "bolt");
const nova = (gap = "", type = "magic", tier = "小", extra: any = {}) => m("tpl-ground-nova", { radius: 300, damage: damage(tier), damageType: type, castTimeSec: 0.4 }, `指定落點半徑 300 wc3u 的一次${tier}級範圍傷害。`, gap, "nova", extra);
const dash = (gap = "", distance = 300, type = "physical") => m("tpl-charge-push", { dashDistance: distance, dashDurationSec: 0.3, apexHeight: 0, radius: 150, damage: damage("極小"), damageType: type, pushDistance: 200, pushSpeed: 872, pushFrom: "facing", pushLaunchHeight: 0, castTimeSec: 0.1 }, `向指定方向突進 ${distance} wc3u，造成極小級碰撞範圍傷害與推移。`, gap, "slash", { bands: { rangeTier: "小" } });
const leap = (gap = "", height = 250, type = "physical") => m("tpl-leap-strike", { mode: "toPoint", applyTo: "self", apexHeight: height, durationSec: 0.5, landRadius: 150, damage: damage("極小"), damageType: type, castTimeSec: 0.15 }, "朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。", gap, "arc");
const buff = (gap = "", modifiers: any[] = [speed], effects: any[] = [], duration = 3) => m("tpl-buff-self", { duration, modifiers, castTimeSec: 0.15 }, `自身取得 ${duration} 秒增益：${modifiers.map(x => x.stat === "ms" ? "極小級移速" : `${x.stat} +${Math.round(x.value * 100)}%`).join("、") || "無屬性加成"}${effects.length ? "；另結算下列護盾／回復等 effects" : ""}。`, gap, "pulse", { effects });
const guard = (gap = "", amount = 120) => buff(gap, [], [shield(amount)]);
const restore = (gap = "", hp = 80, mana = 0) => buff(gap, [], [...(hp ? [heal(hp)] : []), ...(mana ? [{ kind: "restore", manaPct: mana, applyTo: "self" }] : [])]);
const combo = (gap = "", hits = 3, type = "physical", interval = 0.18) => m("tpl-lock-combo", { hitCount: hits, hitIntervalSec: interval, perHitDamage: damage("極小"), finisherDamage: damage("小"), finisherRadius: 150, damageType: type, lockTarget: "none", casterGuard: "none", trigger: "onCast" }, `${hits} 段連擊，間隔 ${interval} 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。`, gap, "slash", { bands: { rangeTier: "極小" } });
const barrage = (gap = "", count = 3, type = "magic", interval = 0.35) => m("tpl-random-barrage", { count, intervalSec: interval, impactDamage: damage("極小"), damageType: type, impactRadius: 150, scatterRadius: 120, payout: "perImpact", castTimeSec: 0.5 }, `在指定區域依序落下 ${count} 發；每發間隔 ${interval} 秒、半徑 150 wc3u、極小級傷害，可多次命中。`, gap, "nova");
const field = (gap = "", family = "magic", anchor = "point") => m("tpl-periodic-field", { intervalSec: 1, durationSec: 3, radiusTier: "小", anchor, applyTo: "enemies", damageTier: "極小", damageType: family, castTimeSec: 0.3 }, `${anchor === "caster" ? "自身周圍" : "指定落點"}維持 3 秒的小級半徑傷害區，每秒一跳極小級傷害。`, gap, "nova");
const summon = (gap = "", championId = "sela") => m("tpl-summon-agent", { count: 1, body: "champion", championId, durationSec: 6, damageMult: 0.25, hpMult: 0.3, formation: "ring", spread: 1.5, maxAlive: 1, onOwnerDeath: "despawn", cleanse: "none", castTimeSec: 0.35 }, `召喚 1 名 ${championId} 樣板代理，6 秒、25% 傷害、30% 生命，同類上限 1、主人死亡清除。`, gap, "summon");
const grab = (gap = "", distance = 250) => m("tpl-pull-throw", { mode: "toPoint", grabMode: "dragToCaster", throwMode: "distance", apexHeight: 1.2, durationSec: 0.45, throwDistance: distance, landRadius: 2, landDamageTier: "小", landApRatio: 0, damageType: "physical", castTimeSec: 0.2 }, `拖拉指定目標後向前投擲 ${distance} wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。`, gap, "arc", { bands: { rangeTier: "小" } });
const cc = (gap: string, kind = "root", duration = 0.7) => strike(gap, "magic", { effects: [kind === "stun" ? stun(duration) : kind === "slow" ? slow(duration) : root(duration)] });
const profile = (name: string, origin: string, family: string, color: number[], moves: Move[], visual: string, extra: any = {}) => ({ name, origin, family, color, moves, visual, ...extra });

export const recipes = [
  profile("武藤遊戲", "法師", "arcane", [0.64,0.22,0.95], [
    passive("需補召喚／陷阱成功事件去重、三層布局及 EX 扣除。", "magic"),
    summon("黑魔導專屬造型與再次下令換目標未提供；代理採 sela。"),
    summon("黑魔導女孩造型、與黑魔導協同事件未提供；目前同模板上限須驗證跨槽隔離。"),
    guard("目標設計是一次觸發陷阱與反射；目前只有自身護盾，不能驗收陷阱。"),
    nova("天空龍投影是待製資產；預覽以雷電區域脈衝表達。", "magic", "大", { family: "lightning" }),
    line("需由存活黑魔導發射並消耗布局；目前是英雄本體施法。")
  ], "卡片框光、紫色法陣；R 使用金色雷電，召喚代理保持可受擊輪廓。"),
  profile("八神庵", "鬥士", "fire", [0.56,0.15,0.94], [
    passive("需技能命中三層紫炎與終結技消耗。", "magic"), wave("推進波並非遇第一個單位即停的投射物。"),
    leap("固定落點跳擊；需原地迎擊與受擊窗口。",180,"magic"),
    combo("目前一次施法完成三段；需三次輸入窗口及中斷狀態機。",3),
    combo("缺命中突進接續與紫炎引爆。",8),
    combo("獨立三段追擊；需接八稚女成功事件的使用窗口。",3)
  ], "紫炎低飽和外圈、白色拳爪切線；末段亮度提高但不延長實際判定。"),
  profile("不知火舞", "鬥士", "fire", [1,0.28,0.16], [
    passive("需位移完成後一次普攻增益，刷新不疊加。"), wave("扇子模型及逐彈碰撞需補，模板是分段傷害波。","physical"),
    line("目前為窄直線，需前方近身弧形判定。","magic"), dash(""), combo("缺突進命中後才接連擊條件。",4),
    buff("目前為自身 3 秒 +15% AD；需限次跟隨施法殘像及去重。",[ad])
  ], "紅扇軌跡、橘焰弧、落點火星；殘像只作演出，不增加完整英雄。"),
  profile("空條承太郎", "鬥士", "physical", [0.63,0.37,0.92], [
    passive("需精密層數與 Q 末擊消耗。"), combo("需逐段距離重新檢查、替身掛點及雙模型動作。",6),
    line("需單條流星指刺與單目標去重。","physical"), guard("需正面一次格擋與推開近敵，不能以一般護盾驗收。"),
    cc("此槽僅單體 0.8 秒暈眩作模板預覽；局部時停、投射物暫停、計時器分類及命中佇列尚未提供。","stun",0.8),
    strike("目前立即结算；需與時停共用待結算佇列。","physical")
  ], "白金之星為待製副模型；拳線紫白、時停要求灰階環界與恢復裂紋，視覺不能代替模擬。"),
  profile("洛克人", "射手", "lightning", [0.14,0.57,1], [
    passive("需共用武器能源、恢復與切換保留；預覽沿用 GGD 魔力。","magic"),
    line("目前固定起手；需按住／放開與分段蓄力。"), wave("Metal Blade 的方向與刀刃模型待補。","physical"),
    guard("缺再次輸入射出剩餘葉片及護盾剩餘量換算。"), barrage("彈種固定時序及整套共享總預算需補。",6,"physical"),
    buff("僅自身攻速增益；需 Q 技能版本切換、圖示與共用冷卻。",[haste])
  ], "青藍砲口、白心彈體；刀刃用金屬灰、Leaf Shield 用綠色。", { ranged: true }),
  profile("卡比", "坦克", "holy", [1,0.48,0.7], [
    save("免死只是驗收底稿；需脫戰漸進回血且受擊中斷。"), grab("不是錐形吸入與含住；需吞入持有狀態、單目標釋放。",120),
    line("目前固定星光線；需持有物判斷與安全吐出。","magic"), guard("需石頭形態、禁移動與禁施法，護盾不足以代表變石。",160),
    line("巨劍造型待補；目前四段直線物理波。","physical"),
    strike("固定魔法攻擊供預覽；需三技能白名單、暫存副本、死亡還原。","magic")
  ], "粉紅輪廓、黃色星星、石頭灰面、巨劍金白；保留公平碰撞尺寸。"),
  profile("西索", "法刺", "arcane", [0.96,0.24,0.63], [
    passive("需不同技能序列及下一次牌擊消耗。"), barrage("三發為落點散射；需扇形牌彈與同目標遞減。",3,"physical",0.12),
    cc("只有短暫鎖足；需有端點的彈性連線及斷線規則。"), grab("僅敵人抓投；需錨點拉動自己與敵人牽引的分支。",120),
    nova("目前單次區域傷害；需最多兩條额外念線及一次中心牽引。"),
    buff("僅短效移速；需假陷阱／表面偽裝及敵我顯示隔離。",[speed])
  ], "粉色彈性念線、撲克牌尖角、收線回彈；偽裝不能改變陣營。"),
  profile("米卡莎", "鬥士", "physical", [0.62,0.77,0.82], [
    passive("需有效閃避事件、內置冷卻與下一刀增傷。"), combo("缺刀刃耐久。",2), leap("需合法場景錨點、鉤索路径、氣體消耗；不是自由跳躍。"),
    restore("需換刃及氣體資源／控制中斷。",0,0.15), barrage("兩發落點爆炸；需雷槍投射物、黏附與延遲引爆。",2,"physical",0.4),
    dash("目前直線；需錨點弧線與路徑失效停止。",400)
  ], "雙刃白線、鋼索細線、瓦斯短尾跡、雷槍橘色延遲警示圈。"),
  profile("赫蘿", "軟輔", "nature", [0.92,0.65,0.22], [
    passive("需助攻一次性籌碼，上限三枚。","magic"), strike("狼影造型待補。","physical",{effects:[slow(1)]}),
    restore("預覽只回復 10% 魔力；需籌碼消耗與每回合三次戰鬥金幣交易。",0,0.1),
    guard("目前自身；需指定友軍盾與加速。"), buff("目前 4 秒 AD／移速；需狼形態、碰撞調整、Q 替換及 W 禁用。",[ad,speed],[],4),
    guard("目前自身固定盾；需扣除剩餘籌碼並擴展附近友軍。",150)
  ], "麥金色護盾、麥穗環、赤褐狼影；交易用小型籌碼提示，狼本體待製。", { ranged: true }),
  profile("魯路修", "軟輔", "void", [0.75,0.08,0.23], [
    passive("需友軍命中戰術標記與施法去重指揮層數。","magic"), strike("缺戰術標記額外傷害。"),
    cc("固定緩速；需標記與下一次友軍命中消耗。","slow",1.5),
    buff("目前只加速自身；需朝安全方向移動的友軍條件。",[speed]),
    cc("單體 0.8 秒暈眩不能代替 Geass；需視線、強制合法移動與每目標每回合成功一次。","stun",0.8),
    nova("缺指揮層數消耗。","magic","中")
  ], "紅色 Geass 眼形、棋盤格區域、黑紅戰術標記；控制完成要有清楚復原提示。", { ranged: true }),
  profile("利姆路", "法鬥", "ice", [0.18,0.74,0.93], [
    react("需最近受擊類型分析及同時只留一種減傷結果。"), wave("需穿透人數上限及單彈命中去重。"),
    guard("護盾不會吸收或刪除敵彈；需白名單投射物與樣本持有。"),
    buff("需人形／史萊姆形態、普攻替換與生命冷卻保留。",[speed]),
    field("固定 3 秒黑炎可作基本區域驗收；黑炎色覆寫。","magic"),
    strike("固定攻擊不是能力副本；需樣本版本、消耗與禁止遞迴。","magic")
  ], "水藍水刃、黑紫黑炎、解析圓環；史萊姆與人形本體待製。"),
  profile("衛宮士郎", "法鬥", "physical", [0.97,0.39,0.2], [
    passive("需近戰解析層與投影最低資源消耗。"), combo("雙劍掛點與交叉斬動畫待製。",2),
    barrage("目前定點三發落劍；需按方向投影飛劍。",3,"physical",0.15),
    dash("缺下一次近戰強化。",250), field("目前領域傷害；需領域内 W 強化、投影劍生成與退出還原。","physical"),
    guard("需一次正面迎擊成功後反擊窗口。")
  ], "橘色投影線稿、鋼色雙劍、紅褐劍域；不得生成永久背包武器。"),
  profile("朝田詩乃", "射手", "physical", [0.26,0.7,0.69], [
    passive("需静止瞄準層與移動受傷衰退。"), line("固定起手分段線；需蓄力、射線掩體與瞄準層增傷。","physical"),
    buff("目前攻速增益；需射界 UI、合法可見敵人的觀測標記。",[haste]),
    leap("翻滾應為貼地移動且清空瞄準，目前是低弧跳躍。",70),
    line("需單發高傷害射線、較長瞄準與移動取消。","physical",{bands:{rangeTier:"大",castTimeTier:"大"}}),
    strike("缺小幅後退位移。","physical")
  ], "青色狙擊線、金色槍口火、灰色翻滾塵；採 GGO 槍械版本。", { ranged: true }),
  profile("殺老師", "法刺", "wind", [1,0.84,0.16], [
    react("需按敵人技能 ID 適應，不是所有受擊反擊。"), combo("觸手多掛點與整招觸發上限待補。",4),
    dash("缺到達終點後的友軍加速。",450), restore("目前立即回血；需分段再生與受控中止。",100),
    guard("需球體變形、禁移動禁施法與限時防禦；目前只有盾。",180),
    barrage("三個落點固定脈衝；需本體依序定位及殘像對齊。",3,"physical",0.2)
  ], "黄色觸手弧、三段殘像、白金防禦球；球體不得藏掉可受擊位置。"),
  profile("比利海靈頓", "硬輔", "physical", [0.35,0.6,0.95], [
    passive("需抓取成功／有效保護事件的氣勢資源。"), strike(""),
    grab("雙人摔角動作、抓取免疫與同步挂點須驗收。",200), guard("需保護指定友軍與氣勢；目前自身。"),
    grab("目前單次投擲；需大摔技雙人動作同步與有限區域衝擊。",400),
    buff("需氣勢消耗及附近隊友；目前自身攻速與盾。",[haste],[shield(100)])
  ], "藍白摔角衝擊線、落地塵環、夥伴鼓舞光；招式名均為 GGD 創編。"),
  profile("魔法少女☆伊莉雅", "法師", "holy", [1,0.39,0.75], [
    passive("需不同魔法施放序列及一次强化消耗。","magic"), line("魔杖彈体待製；目前分段光路。"),
    guard("目前全方向自身盾；需正面防壁。"), leap("有限落點跳躍，不是持續飛行。",250,"magic"),
    buff("目前 AD／攻速；需 Saber 武裝、普攻与 Q 替換與還原。",[ad,haste],[],4),
    line("限定展開為一次光束，可作基礎驗收；需寶具武器掛點。","magic",{bands:{rangeTier:"大",castTimeTier:"大"}})
  ], "粉白魔法陣、紅寶石杖尖、Saber 金藍裝甲與金色光束。"),
  profile("安茲·烏爾·恭", "法師", "void", [0.44,0.16,0.7], [
    react("需受控後控制抗性及冷卻；目前受傷反擊。"), strike("缺低生命有限追加與處決流程專測。","magic"),
    summon("死亡騎士造型待製，代理採 thorne。","thorne"),
    m("tpl-teleport",{destination:"castPoint",castTimeSec:0.25,travelSec:0.15,arriveRadius:150,damage:damage("極小"),damageType:"magic"},"傳送到指定落點，抵達後小範圍極小級傷害。","原設計只有傳送，模板帶抵達傷害，需審查這項改編。","pulse"),
    nova("需長吟唱途中真正可中斷與落點預警。","magic","大",{bands:{castTimeTier:"極大",rangeTier:"大"}}),
    nova("目前立即範圍傷害；需倒數詛咒、標準處決、淨化與保命優先序。","magic","中")
  ], "紫黑骷髏法印、綠色情緒抑制光、墜落天空白熱預警；社群 ID 不覆蓋飛鼠。"),
  profile("吉爾伽美什", "砲手", "holy", [1,0.73,0.16], [
    passive("需每次施法一次財庫能量與 EX 消耗。","magic"), barrage("目前三發落點打擊；需三門武器投射物及門的掛點。",3,"physical",0.18),
    cc("鎖足可作基礎控制；需超距解鎖、鎖鏈端點。"), guard("目前全方向盾；缺正面條件。"),
    line("Ea 造型、蓄力層與單一總傷害預算需補。","magic",{bands:{castTimeTier:"大",rangeTier:"大"}}),
    barrage("12 發已有限；需扣財庫能量及武器多樣外觀。",12,"physical",0.12)
  ], "金色門環、寶物白金軌跡、天之鎖金線、Ea 紅色旋流。", { ranged: true }),
  profile("桐谷和人", "鬥士", "physical", [0.3,0.68,0.94], [
    passive("需左右手交替命中、節奏衰退與攻速。"), combo("需左右手掛點對應。",2), guard("需迎擊窗口與成功後下一刀加成。"),
    leap("需對目標的躍進斬、牆體與落點失效處理。",160),
    combo("16 段已可配置；須證明每段重查距離、中斷後不再命中及總預算。",16,"physical",0.1),
    combo("模板 hitCount 上限 20，不能冒稱 27 連擊；需有序 27 段的共用模板擴充，不採兩個並行連擊拼接。",20,"physical",0.1)
  ], "黑白雙劍加青色斬線；命中特效節流，只有末段放大閃光。"),
  profile("御坂美琴", "法師", "lightning", [0.45,0.77,1], [
    passive("需三層電荷及下一次強化技消耗。","magic"), line("需單道電擊與貫穿去重。"),
    strike("模板主命中加鏈起點會對起點追加；需原設計整招同目標只命中一次。","magic",{effects:[{kind:"chainLightning",shape:"single",amount:damage("極小"),damageType:"magic",jumps:3,jumpRange:3,decay:0.8,revisit:false,maxTotalJumps:3,jumpIntervalSec:0.12}]}),
    guard("鐵砂碎粒及破盾事件待補。"), line("目前四段線；需硬幣彈出、單發射線與整體傷害上限。","magic",{bands:{rangeTier:"大",castTimeTier:"大"}}),
    buff("僅 AP 增益；需電荷扣除與 Q／W 指定版本強化。",[ap])
  ], "藍白放電、橘白超電磁砲、灰黑鐵砂盾；鏈線不得超出實際目標序列。"),
  profile("鹿目圓", "軟輔", "holy", [1,0.62,0.83], [
    passive("需有效治療／吸收量計算希望，溢出不計。","magic"), wave("需魔法箭投射物。"), guard("目前自身；需指定友軍及希望消耗。"),
    buff("目前自身加速；需一項可淨化狀態移除。",[speed]), barrage("有限三波箭雨已對應；箭形資產待製。",3),
    guard("護盾不是友軍致死攔截；需限時保命印記與每目標每回合一次。",160)
  ], "粉白弓光、玫瑰花瓣盾、圓環環帶；不使用時停。", { ranged: true }),
  profile("菜月昴", "硬輔", "void", [0.55,0.3,0.67], [
    save("本場免死不是死亡回歸；需與 R／EX 共用存檔並合法顯示致死來源。"), cc("固定緩速不代表黑霧感官／命中干擾。","slow",1.5),
    grab("抓投是模板預覽；需鞭擊後小幅牽引，不應拋飛目標。",100), guard("需自己及附近一名友軍。"),
    restore("目前立即恢復 100 生命；需五秒位置生命快照、致死回溯與合法落點。",100),
    restore("目前立即恢復 80 生命；需主動消耗 R 同一快照且不得重置冷卻。",80)
  ], "黑紫 Shamac、存檔沙漏符號、舊位置輪廓與回復線；不得以瞬移加回血冒稱回溯。"),
  profile("坂田銀時", "鬥士", "physical", [0.62,0.81,0.96], [
    passive("需脫戰保存一份補給給 W。"), line("需木刀近身弧形判定。","physical"), restore("需喝草莓牛奶動作、移動／受擊中斷。",100),
    guard("需招架成功後一次反擊窗口。"), buff("短期 AD＋移速對應基础强化；白夜叉動作待製。",[ad,speed],[],4),
    strike("0.5 秒暈眩可測基本打斷；須限定可中斷施法與吐槽文字對齊。","physical",{effects:[stun(0.5)]})
  ], "木刀淺藍斬線、粉白補給光、漫畫速度線與短吐槽，不讓文字解析成機制。"),
  profile("奇犽", "法刺", "lightning", [0.54,0.77,1], [
    passive("需電力上限／脫戰充電；目前用標準魔力。","magic"), nova("短起手落點電擊對應基礎版。"), leap("需貼地肢曲殘像與有效閃避事件。",50),
    buff("目前固定 3 秒加速；需開關及持續扣電。",[speed]),
    buff("目前攻速／移速；需受攻擊條件自動反應、限次扣電及循環防止。",[haste,speed]),
    nova("固定傷害；需消耗剩餘電力與低電力狀態。","magic","中")
  ], "藍白短電弧、側移殘像、神速輪廓電流；電量 UI 不以裝飾光冒充。"),
  profile("一拳超人", "狂戰", "ki", [1,0.82,0.35], [
    passive("需未攻擊時間與下一拳一次消耗。"), strike("普通拳仍走標準傷害。"), combo("需要整招總傷害預算；目前每段各自級距。",5),
    dash("碰撞安全需場景驗收。",450), line("四段衝擊波不等於單拳總結算；需高單擊預算與較長起手。","physical",{bands:{castTimeTier:"極大",rangeTier:"大"}}),
    buff("目前移速增益；需左右連續側移與有限次有效迴避。",[speed])
  ], "白拳壓、黃色衣色識別、認真一拳前安靜蓄勢後單次強衝擊。"),
  profile("名偵探柯南", "射手", "physical", [0.3,0.58,0.93], [
    passive("需觀察線索、事件類型去重與三層上限。"), wave("需足球單彈碰撞與腳踢動作。","physical"),
    cc("0.7 秒暈眩只是底稿；需受傷可喚醒的睡眠及針彈碰撞。","stun",0.7),
    buff("僅 3 秒移速；需滑板加減速、急轉與碰撞狀態。",[speed]), cc("目前緩速；需消耗線索、弱點標記及合法位置揭示。","slow",2),
    grab("需吊帶錨點分支與有限拉動，不應預設摔投。",120)
  ], "足球白線、麻醉針微光、藍色滑板尾跡、放大鏡標記；不用黑客式資訊揭露。", { ranged: true }),
  profile("庫洛魔法使", "軟輔", "wind", [1,0.63,0.78], [
    passive("需不同牌序列三層與護盾消耗。","magic"), strike("風束推動缺 knockback；目前單體魔法。","magic"), guard("目前自身；需友軍選取。"),
    leap("有限落點飛躍可預覽；翔牌武器姿態待補。",220,"magic"),
    buff("AD／攻速强化不等於劍牌；需普攻替換、武器及還原。",[ad,haste],[],4),
    cc("目前固定樹牌鎖足；需風／樹 Q 版本切換，共享冷卻。")
  ], "粉金牌框、綠風、葉枝束縛、羽翼與細劍；各牌圖示跟真實狀態同步。", { ranged: true }),
  profile("艾莉絲·伯雷亞斯·格雷拉特", "鬥士", "physical", [0.91,0.32,0.2], [
    passive("需對剛交鋒目標的首次命中及每目標冷卻。"), dash("短踏步可以預覽；需武器斬擊時點。",180), guard("有限承傷對應基礎版。"),
    dash("此模板附帶傷害推移，需審查逼近步是否保留這項改編。",250),
    dash("需較長起手、高速單段斬及命中停點。",450), strike("需剛被自身命中的目標條件與追擊窗口。")
  ], "紅髮色輪廓、白銀重斬、光之太刀單道細亮線；避免螢幕全白。"),
  profile("芙莉蓮", "法師", "arcane", [0.82,0.87,0.65], [
    passive("需魔力感知的資訊層抑制，不可用隱形或傷害被動冒充。","magic"), line("Zoltraak 原型；需單束碰撞去重。"), guard("目前無方向盾；需六角防壁方向、耐久與持續消耗。"),
    leap("短期浮空可用落點跳躍預覽，不提供持續飛行。",250,"magic"), barrage("目前定點六波；需各方向獨立射線及總傷害上限。",6),
    guard("目前自身盾；需花田區域、友軍首次進入解除恐懼及一次護盾。")
  ], "淡金 Zoltraak、青白六角防壁、柔色花田；不把其他角色專屬魔法填入。"),
  profile("尼古貓貓", "法師", "sound", [0.65,0.62,0.59], [
    passive("需靜止三層拖延、受擊清除與施法消耗。","magic"), nova("菸灰缸道具拋物線未綁；落地一次傷害可測。","physical"),
    cc("單體緩速不是煙霧區命中干擾；需區域及明示效果。","slow",1.5), dash("撤退应無碰撞輸出，模板帶推移傷害，須審查改編。",250),
    barrage("三波落點可測；卡通雜物模型與逐波預警待補。",3,"physical",0.5),
    guard("需拖延消耗與移動取消盾。",160)
  ], "灰煙低透明、雜物卡通輪廓、紅色驚慌符號；技能全部為 GGD 日常惡搞改編。"),
  profile("SUN樂", "鬥士", "wind", [0.25,0.71,0.9], [
    passive("需真正閃避事件的三層讀招，空按不增加。"), strike("需螺旋刃動畫與反擊後目標追加條件。"),
    leap("模板低跳不是精準迴避；需傷害來臨時間窗口。",40), guard("護盾不是 Repel Counter；需格擋成功、擊退與 Q 窗口。"),
    buff("Accel 基礎移速／攻速增益；持續 3 秒且保留冷卻。",[speed,haste]), strike("需消耗三層讀招並限定近期交鋒目標。")
  ], "鳥頭面具待製、青色滑步線、反擊橙色火花、螺旋短刃切線。"),
  profile("阿薩謝爾", "法鬥", "void", [0.49,0.17,0.59], [
    passive("需每次有效施法一次負面能量，上限三；自傷反傷與每跳不得增加。","magic"),
    strike("肩膀拳需小幅擊退与一本正經起手，当前只是單擊。"),
    barrage("三波白色雨可作時序預覽；每波同目標一次與白點落下造型須驗收。",3,"magic",0.45),
    guard("護盾不代表闇人格反擊；需第一個近身受擊成功事件及一次出拳。"),
    strike("需四秒萎靡的輸出降低，以及不致死反噬；目前只有可預覽的單體魔法命中。","magic",{bands:{castTimeTier:"大",cooldownTier:"大"}}),
    strike("需三層消耗及已萎靡目標反轉增益。R→EX 把敵人變強是必要驗收，不得刪成普通強化傷害。","magic")
  ], "Q 普通一拳配誇張凝重起手；W 白色魔力雨；R 紫黑能量球；EX 反轉時敵人金光、施法者驚愕。"),
  profile("近衛刀太", "狂戰", "blood", [0.84,0.18,0.25], [
    save("本場被動免死只是基底；需受傷延後再生与 R 短期再起资格，不能無條件常駐代替。"),
    line("需重力劍扇形判定。","physical"), buff("固定 AD 增益；需輕／重模式、攻速與動作時長同步。",[ad]),
    dash("近身突進可作基礎驗收。",250), restore("目前立即回復；需主動再起窗口、首次致死截取與每回合一次。",100),
    line("需固定重劍模式蓄力与完成後緩速。","physical",{bands:{castTimeTier:"大"}})
  ], "暗紅再生細線、重劍深色厚軌、輕劍白色細軌；再起保留可辨識硬直。"),
  profile("高速婆婆", "狂戰", "wind", [0.8,0.18,0.18], [
    passive("需同一可見目標追逐速度與轉目標衰退。"), dash("爪擊模型待製。",250), leap("需急轉向與消耗加速層，不能單純低跳。",30),
    cc("緩速只是底稿；需追獵目標標記與朝向加速。","slow",1.5), buff("3 秒移速增益；需上限与轉向能力独立参数。",[speed],[],3),
    dash("需命中第一英雄或牆即停止，不能穿越後繼續連撞。",500)
  ], "紅黑風線、追獵咒紋、急轉地面擦痕；採妖怪本體，不用厄卡倫或招財貓。"),
  profile("炭治郎", "鬥士", "ice", [0.25,0.75,0.85], [
    passive("需有效閃避後近身破綻標記與下一刀消耗。"), line("需水面斬前方橫弧，目前四段直線。","physical"),
    leap("需水車旋轉斬与武器動作。",220), restore("標準魔力回復 15%；需呼吸資源、調息中移動受傷降效率。",0,0.15),
    line("需火之神單次高傷斬與呼吸高消耗。","physical",{family:"fire",bands:{castTimeTier:"大"}}),
    buff("固定 AD 增益不是切換；需水／火 Q 版本、共用冷卻与負擔。",[ad])
  ], "青藍水弧、圓舞橘紅火帶；水火只演出，不生永久地形。"),
  profile("鬼畜王蘭斯", "狂戰", "physical", [0.25,0.72,0.29], [
    passive("需擊殺／助攻一次戰意，上限五層、回合重置。"), line("需正面蠻力弧形斬。","physical"), guard("需下一次主動攻擊消耗剩餘盾換取有限增傷。"),
    dash("需命中第一人後停止。",350), line("需大範圍重斬、長起手與總傷害預算。","physical",{bands:{castTimeTier:"大"}}),
    buff("目前自身加速攻速；需戰意消耗及附近友軍一次普攻增益。",[speed,haste])
  ], "綠色勇猛光、厚重白斬、漫畫喊招；不導入成人情節或其他人的招式。"),
  profile("吉伊卡哇", "硬輔", "holy", [1,0.79,0.61], [
    passive("需附近友軍交战依時間累積勇氣，上限三層。"), strike("討伐叉造型與近身命中對齊待製。"),
    dash("需無傷害撤退並可扣勇氣換小盾；目前衝撞模板不等價。",220), restore("需停留吃點心及受擊中斷。",70),
    combo("固定三段；需勇氣消耗与有限強化幅度。",3), guard("目前自身；需附近友軍盾與短效抗恐懼。")
  ], "奶白輪廓、淡橘討伐叉線、星形勇氣提示、小點心回復光。")
];

export const statProfiles: Record<string, Record<string,string>> = {
  "法師": {ms:"中",mr:"中",armor:"小",maxHealth:"小",maxMana:"大",ad:"小",ap:"大",as:"小",healthRegen:"小",manaRegen:"大",range:"大"},
  "鬥士": {ms:"中",mr:"中",armor:"中",maxHealth:"中",maxMana:"中",ad:"大",ap:"小",as:"中",healthRegen:"中",manaRegen:"中",range:"小"},
  "射手": {ms:"中",mr:"小",armor:"小",maxHealth:"小",maxMana:"中",ad:"大",ap:"小",as:"大",healthRegen:"小",manaRegen:"中",range:"大"},
  "坦克": {ms:"小",mr:"大",armor:"大",maxHealth:"大",maxMana:"中",ad:"中",ap:"小",as:"小",healthRegen:"大",manaRegen:"小",range:"小"},
  "軟輔": {ms:"中",mr:"中",armor:"中",maxHealth:"中",maxMana:"大",ad:"小",ap:"中",as:"小",healthRegen:"中",manaRegen:"大",range:"中"},
  "硬輔": {ms:"中",mr:"中",armor:"大",maxHealth:"大",maxMana:"中",ad:"中",ap:"小",as:"小",healthRegen:"中",manaRegen:"中",range:"小"},
  "法鬥": {ms:"中",mr:"中",armor:"中",maxHealth:"中",maxMana:"中",ad:"中",ap:"大",as:"中",healthRegen:"中",manaRegen:"中",range:"小"},
  "法刺": {ms:"大",mr:"小",armor:"小",maxHealth:"小",maxMana:"中",ad:"中",ap:"大",as:"中",healthRegen:"小",manaRegen:"中",range:"小"},
  "砲手": {ms:"小",mr:"小",armor:"中",maxHealth:"中",maxMana:"大",ad:"大",ap:"中",as:"小",healthRegen:"小",manaRegen:"中",range:"大"},
  "狂戰": {ms:"中",mr:"小",armor:"中",maxHealth:"大",maxMana:"小",ad:"大",ap:"小",as:"中",healthRegen:"大",manaRegen:"小",range:"小"}
};
