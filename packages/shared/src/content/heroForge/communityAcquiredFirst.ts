import type { CommunityHeroExample, Move } from "./communityExamples";

// Editable GGD adaptations. Model selection is intentionally left to the
// acquired-asset mapping; an absent modelKey is not model acceptance evidence.
type Effect = Record<string, unknown>;
type Tier = "極小" | "小" | "中" | "大" | "極大";
type DamageType = "physical" | "magic";
const dmg = (tier: Tier = "小", damageType: DamageType = "magic"): Effect => ({ kind: "damage", damageType, amount: { damageTier: tier } });
const area = (tier: Tier, radius: number, damageType: DamageType = "magic", onHitTargets?: Effect[]): Effect => ({
  kind: "damageArea", damageType, amount: { damageTier: tier }, radius, includeOrigin: true,
  ...(onHitTargets ? { onHitTargets } : {}),
});
const status = (key: string, duration: number, flags: Effect = {}, applyTo = "target"): Effect => ({
  kind: "applyStatus", statusId: `$hero.${key}`, duration, sourceScope: "caster", applyTo, ...flags,
});
const held = (key: string, subject = "self", minStacks = 1) => ({ kind: "status", subject, statusId: `$hero.${key}`, appliedBy: "self", minStacks });
const consume = (key: string, subject: "self" | "target", onConsumed: Effect[], onMissing?: Effect[], count: number | "all" = 1): Effect => ({
  kind: "consumeStatus", shape: "single", subject, statusId: `$hero.${key}`, appliedBy: "self", count, onConsumed,
  ...(onMissing ? { onMissing } : {}),
});
const shield = (key: string, flat = 100, duration = 3): Effect => ({ kind: "shield", amount: { flat, ratios: [] }, duration, absorbs: "all", stackKey: `$hero.${key}`, onExisting: "keepLarger" });
const heal = (flat: number): Effect => ({ kind: "heal", amount: { flat, ratios: [] }, applyTo: "self" });
const speed = (key: string, duration = 3): Effect => ({ kind: "applyBuff", applyTo: "self", statusId: `$hero.${key}`, stackKey: `$hero.${key}`, duration, maxStacks: 1, modifiers: [{ stat: "ms", op: "pctAdd", msBonusTier: "極小" }] });
const projectile = (projectileId: string, onHit: Effect[]): Effect => ({ kind: "spawnProjectile", projectileId, onHit });
const line = (tier: Tier, damageType: DamageType = "magic", onHitTargets?: Effect[]): Effect => ({ kind: "damageLine", damageType, amount: { damageTier: tier }, length: 6, width: 1, aim: "facing", fromCaster: true, includeOrigin: true, ...(onHitTargets ? { onHitTargets } : {}) });
const dash = (distance = 3, onEnd?: Effect[]): Effect => ({ kind: "dash", mode: "toPoint", speed: 12, maxDistance: distance, ...(onEnd ? { onEnd } : {}) });
const push = (from = "caster"): Effect => ({ kind: "knockback", distance: 2, speed: 10, subtractGap: false, from, uncontrollable: false });
const pulse = (effects: Effect[], count = 3, radius = 2.5): Effect => ({ kind: "delayed", shape: "circle", radius, side: "enemies", delaySec: 0.3, count, intervalSec: 0.7, targetMode: "reresolve", anchor: "point", effects });
const seq = (name: string, purpose: string, castType: "self" | "targeted" | "ground" | "skillshot", effects: Effect[], options: Partial<Move> & { radius?: number } = {}): Move => {
  const { radius = 2.5, ...moveOptions } = options;
  return { name, purpose, ref: "tpl-effect-sequence", params: { castType, castTimeSec: 0.2, radius, side: "enemies", effects }, ...moveOptions };
};
const passive = (name: string, purpose: string, hooks: Effect[]): Move => ({ name, purpose, ref: "tpl-event-passive", params: { hooks } });
const combo = (name: string, purpose: string, hits = 3, damageType: DamageType = "physical"): Move => ({
  name, purpose, ref: "tpl-lock-combo", range: "極小", cooldown: "大", mana: "大",
  params: { hitCount: hits, hitIntervalSec: 0.18, perHitDamage: { damageTier: "極小" }, finisherDamage: { damageTier: "小" }, finisherRadius: 150, damageType, lockTarget: "root", casterGuard: "none", trigger: "onCast" },
});
const palworld = "https://www.pocketpair.jp/games/palworld/";
const rezero = "https://re-zero-anime.jp/tv/character/";
const smash = "https://www.smashbros.com/en_US/fighter/index.html";

export const COMMUNITY_ACQUIRED_FIRST: CommunityHeroExample[] = [
  {
    id: "acquired-jetragon", inspiration: "空渦龍／Jetragon", name: "空渦龍", sourceWork: "Palworld／幻獸帕魯", sourceUrl: palworld,
    origin: "射手", attackType: "ranged",
    summary: "把競技場當跑道的高速龍砲手；衝刺蓄能，再用定點連續轟擊逼敵人換位。笑點是起飛前還要排隊驗票。",
    adaptations: ["保留高速龍與飛彈意象；位移是地面短衝，不提供常駐飛行、乘騎或全圖飛彈。", "E 施放取得一層 5 秒航電蓄能，R 消耗後增加一輪轟擊；每輪重解落點，敵人可走開。", "EX 驗票護盾會讓自己停用普攻 0.8 秒，仍可移動與施法。"],
    moves: {
      PASSIVE: passive("航電預熱", "施放 E 時取得一層 5 秒蓄能；重複取得只刷新，供 R 消耗。", [{ on: "onAbilityCast", abilitySlot: "E", target: "self", effects: [status("fuel", 5, {}, "self")] }]),
      Q: seq("龍式點射", "射出一發奧術彈，命中造成小級魔法傷害並減速 25% 持續 1 秒。", "skillshot", [projectile("imported.bolt.arcane", [dmg(), status("drag", 1, { moveSpeedMult: 0.75 })])], { range: "大", cooldown: "極小" }),
      W: seq("尾流加班", "獲得 3 秒極小級移速加成；用來選擇 E 的衝刺角度。", "self", [speed("slipstream")]),
      E: seq("貼地起飛", "朝指定方向固定衝刺 4 單位；落點不額外造成傷害。", "ground", [dash(4)], { cooldown: "中" }),
      R: seq("本航班不供餐", "落點連炸三輪；有航電蓄能時消耗並改為四輪，每輪極小級傷害且重新選取圈內敵人。", "ground", [consume("fuel", "self", [pulse([dmg("極小")], 4)], [pulse([dmg("極小")], 3)])], { range: "大", cooldown: "大", mana: "大" }),
      EX: seq("登機口改號", "取得 130 護盾持續 3 秒，但驗票期間自身繳械 0.8 秒；不阻擋移動或施法。", "self", [shield("boarding", 130), status("boarding-wait", 0.8, { disarmed: true }, "self")]),
    },
  },
  {
    id: "acquired-astralym", inspiration: "枯星龍", name: "枯星龍", sourceWork: "Palworld／幻獸帕魯", sourceUrl: palworld,
    origin: "法師", attackType: "ranged",
    summary: "以枯星與失重意象改編的中距離咒龍；先留下星蝕印，再用拘束收割。星辰會毀滅，排班表卻不會。",
    adaptations: ["Astralym 僅作本批素材識別；此處的招式是 GGD 枯星意象改編，不將素材英文標識當作官方招式考據。", "星蝕是自己施加的短效標記；沒有宇宙級抹除、永久地形或全圖引力。", "領域每輪重解目標；位移只到指定近處，不穿越地圖。"],
    moves: {
      PASSIVE: passive("星蝕欠款", "普攻給目標留下 4 秒星蝕，內置冷卻 2 秒；Q 可消耗自己施加的星蝕。", [{ on: "onBasicAttack", internalCooldown: 2, effects: [status("eclipse", 4)] }]),
      Q: seq("逾期星光", "消耗目標星蝕時造成中級魔法傷害並鎖足 0.7 秒；無標記時只造成小級傷害。", "targeted", [consume("eclipse", "target", [dmg("中"), status("star-bind", 0.7, { root: true })], [dmg()])]),
      W: seq("失重通知", "在落點造成小級範圍傷害，命中者減速 30% 持續 1.5 秒。", "ground", [dmg(), status("gravity", 1.5, { moveSpeedMult: 0.7 })]),
      E: seq("星間挪位", "瞬移到施法距離內的指定地點；不產生傳送門或跨場移動。", "ground", [{ kind: "blink", shape: "single", to: "point" }], { range: "小", cooldown: "中" }),
      R: seq("枯星下班鐘", "在落點持續三輪星震，每輪造成小級魔法傷害；走出範圍可避開後續震波。", "ground", [pulse([dmg()], 3, 3)], { range: "大", cooldown: "大", mana: "大" }),
      EX: seq("末日也要蓋章", "自身取得 120 護盾與 2 秒移速增益；用於為下一次普攻標記找角度。", "self", [shield("stamp", 120), speed("stamp-run", 2)]),
    },
  },
  {
    id: "acquired-cattiva", inspiration: "搗蛋貓／Cattiva", name: "搗蛋貓", sourceWork: "Palworld／幻獸帕魯", sourceUrl: palworld,
    origin: "鬥士", attackType: "melee",
    summary: "先挑釁再溜走的近戰搗蛋手；挨打加速、短躍換位，再以連爪搶回節奏。行李不一定幫你背，罐頭一定先吃。",
    adaptations: ["搬運與怕生改編成受擊後短暫加速；不改背包容量或基地工作系統。", "挑釁只影響指定敵人；連爪是有限次數的普攻追加，不是永久攻速。"],
    moves: {
      PASSIVE: passive("不是我打破的", "受傷後取得 2 秒極小級移速加成，內置冷卻 4 秒。", [{ on: "onDamageTaken", target: "self", internalCooldown: 4, effects: [speed("scamper", 2)] }]),
      Q: seq("貓拳簽收", "近身造成小級物理傷害，並減速 20% 持續 1 秒。", "targeted", [dmg("小", "physical"), status("paw", 1, { moveSpeedMult: 0.8 })], { range: "極小", cooldown: "極小" }),
      W: seq("你追不到我", "嘲諷指定敵人 0.7 秒，讓受擊加速有機會觸發；沒有無敵。", "targeted", [{ kind: "taunt", durationSec: 0.7 }], { range: "小" }),
      E: seq("紙箱撤離", "朝指定地點短躍，落地後取得 60 護盾；不留下障礙箱。", "ground", [{ kind: "leap", mode: "toPoint", apexHeight: 0.6, durationSec: 0.3, onLand: [shield("box", 60, 2)] }], { range: "小" }),
      R: seq("連續貓貓拳", "4 秒內的接下來三次普攻各追加極小級物理傷害；第三次後移除這份增益。", "self", [{ kind: "applyBuff", applyTo: "self", statusId: "$hero.frenzy", stackKey: "$hero.frenzy", duration: 4, maxStacks: 1, modifiers: [], hooks: [{ on: "onBasicAttack", maxTriggers: 3, onConsumed: "detachSource", effects: [dmg("極小", "physical")] }] }], { cooldown: "大", mana: "中" }),
      EX: seq("罐頭優先權", "回復自身 100 生命，但吃罐頭時繳械 1 秒；仍可移動與施法。", "self", [heal(100), status("snack", 1, { disarmed: true }, "self")]),
    },
  },
  {
    id: "acquired-dio", inspiration: "DIO／迪奧·布蘭度（第三部）", name: "DIO", sourceWork: "JoJo 的奇妙冒險：星塵遠征軍", sourceUrl: "https://jojo-animation.com/sc/",
    origin: "狂戰", attackType: "melee",
    summary: "將『世界』的壓迫感改成短暫停格與近身連打；命中停格者可續戰。真正最長的時間，是他報招式名字的時間。",
    adaptations: ["只以局部、短時暈眩表達停格；不停止全場時間、投射物、冷卻或其他玩家。", "替身連打由本體技能結算，沒有獨立替身 AI；連打期間施法者沒有無敵。", "飛刀使用既有物理投射物，壓路機意象改為落點震擊，不生成車輛或地形。"],
    moves: {
      PASSIVE: passive("吸血鬼加班制", "普攻命中自己 E 留下的停格狀態時回復自身 35 生命，內置冷卻 2 秒。", [{ on: "onBasicAttack", internalCooldown: 2, condition: held("time-stop", "target"), effects: [heal(35)] }]),
      Q: combo("無馱連打", "近距鎖足目標後連打四次並收尾；施法者仍可被攻擊。", 4),
      W: seq("飛刀考勤", "以既有穿透物理彈呈現飛刀，命中造成小級傷害並減速 25% 持續 1 秒。", "skillshot", [projectile("imported.wave.physical", [dmg("小", "physical"), status("knife", 1, { moveSpeedMult: 0.75 })])], { range: "大" }),
      E: seq("世界・半秒鐘", "指定近處敵人暈眩 0.7 秒；這是普通可抵抗的控制，也提供被動回血窗口。", "targeted", [status("time-stop", 0.7, { stun: true })], { range: "小", cooldown: "中" }),
      R: seq("壓路機停車費", "短暫準備後在落點造成大級物理傷害，命中者鎖足 0.8 秒；不留下壓路機。", "ground", [dmg("大", "physical"), status("roller", 0.8, { root: true })], { range: "小", cooldown: "大", mana: "大", cast: "大" }),
      EX: seq("輪到我的台詞", "回復自身 100 生命，但台詞期間自身沉默及繳械 0.8 秒，仍可移動。", "self", [heal(100), status("speech", 0.8, { silenced: true, disarmed: true }, "self")]),
    },
  },
  {
    id: "acquired-morgiana", inspiration: "摩尔迦娜／Morgiana", name: "摩尔迦娜", sourceWork: "MAGI／魔奇少年", sourceUrl: "https://www.aniplex.co.jp/lineup/magi/news/detail/?id=15041",
    origin: "鬥士", attackType: "melee",
    summary: "以法納利斯腳力與鎖鏈意象構成的進身鬥士；短躍積勢，拉近敵人再踢開。她的掃地效率以地板是否還在計算。",
    adaptations: ["強健腳力以短躍及物理連動表達，不提供攀牆系統或原作自由空中作戰。", "鎖鏈用單體拉移表達；火焰是有限落點效果，不另生成眷屬器實體。"],
    moves: {
      PASSIVE: passive("腳力留一手", "施放 E 時取得 4 秒踏勢；下一次 Q 可消耗它強化踢擊。", [{ on: "onAbilityCast", abilitySlot: "E", target: "self", effects: [status("step", 4, {}, "self")] }]),
      Q: seq("赤腳催辦", "普通踢擊造成小級物理傷害；有踏勢時消耗並改為中級傷害，附帶 0.6 秒鎖足。", "targeted", [consume("step", "self", [dmg("中", "physical"), status("heel", 0.6, { root: true })], [dmg("小", "physical")])], { range: "極小", cooldown: "極小" }),
      W: seq("鎖鏈請回來", "對指定敵人造成極小級魔法傷害並向自己拉近 2 單位；受場地與位移規則限制。", "targeted", [dmg("極小"), push("pull")], { range: "小" }),
      E: seq("法納利斯跨步", "短躍至近處落點，落地對附近敵人造成極小級物理傷害。", "ground", [{ kind: "leap", mode: "toPoint", apexHeight: 1, durationSec: 0.35, landRadius: 1.5, onLand: [dmg("極小", "physical")] }], { range: "小", cooldown: "中" }),
      R: seq("炎鎖舞步", "在落點連續三輪炎震，每輪小級魔法傷害；敵人離開範圍即可躲掉後續。", "ground", [pulse([dmg()], 3, 2)], { range: "小", cooldown: "大", mana: "大" }),
      EX: seq("女僕式清場", "取得 120 護盾並嘲諷身邊 2 單位內的敵人 0.6 秒；沒有傷害免疫。", "self", [shield("chores", 120), { kind: "taunt", durationSec: 0.6, radius: 2, side: "enemies" }]),
    },
  },
  {
    id: "acquired-zero", inspiration: "Zero", name: "Zero", sourceWork: "Mega Man X／洛克人 X", sourceUrl: "https://news.capcomusa.com/lets/browse/we-told-you-our-favorite-capcom-weapons-then-you-told-us-yours",
    origin: "鬥士", attackType: "melee",
    summary: "用光劍近斬換來下一發蓄力砲，再靠短衝切換近遠距離。系統更新永遠挑他準備放大招時跳出。",
    adaptations: ["以 Mega Man X 的 Zero 與 Z-Saber 為概念；不混同後續 Zero 系列的角色版本或提供原作完整武器表。", "蓄力由 Q 施放後的單層能源表示，不需長按或多段蓄力 UI；沒有爬牆或無限空中衝刺。"],
    moves: {
      PASSIVE: passive("劍砲交班", "施放 Q 時取得 5 秒能源；W 可消耗後射出較強的蓄力彈。", [{ on: "onAbilityCast", abilitySlot: "Q", target: "self", effects: [status("charge", 5, {}, "self")] }]),
      Q: seq("Z-Saber 簽核", "沿面向斬出短直線，對命中敵人造成小級物理傷害。", "self", [{ ...line("小", "physical"), length: 3, width: 1.2 }], { cooldown: "極小" }),
      W: seq("蓄力離線砲", "有能源時消耗並射出中級魔法傷害彈；無能源時射出極小級彈。傷害在投射物命中時結算。", "skillshot", [consume("charge", "self", [projectile("imported.bolt.arcane", [dmg("中")])], [projectile("imported.bolt.arcane", [dmg("極小")])])], { range: "大" }),
      E: seq("衝刺斬", "朝指定方向固定衝刺 3 單位，結束後才對身邊造成小級物理傷害。", "ground", [dash(3, [area("小", 1.5, "physical")])], { range: "小", cooldown: "中" }),
      R: combo("零式連段", "近距鎖足後三連斬與收尾；仍受敵方傷害與控制影響。", 3),
      EX: seq("更新稍後提醒", "取得 120 護盾並回復 40 生命；是戰術整備，不是死亡後復活。", "self", [shield("reboot", 120), heal(40)]),
    },
  },
  {
    id: "acquired-emilia", inspiration: "愛蜜莉雅／Emilia", name: "愛蜜莉雅", sourceWork: "Re:從零開始的異世界生活", sourceUrl: rezero,
    origin: "法師", attackType: "ranged",
    summary: "以冰術控制距離的法師；冰槍減速留霜，普攻碎霜爭取一次束縛。她認真解釋招式，敵人只想知道能不能退冰。",
    adaptations: ["冰與精靈意象以既有魔法傷害、減速和鎖足表達；不生成永久冰牆或獨立帕克 AI。", "寒霜只由本人消耗；普攻碎霜後需重新用 Q 補印，不會永久凍結。"],
    moves: {
      PASSIVE: passive("碎霜禮節", "普攻消耗目標身上自己的寒霜，追加極小級魔法傷害並鎖足 0.5 秒；內置冷卻 2 秒。", [{ on: "onBasicAttack", internalCooldown: 2, effects: [consume("frost", "target", [dmg("極小"), status("freeze", 0.5, { root: true })])] }]),
      Q: seq("冰槍請簽收", "穿透冰彈命中造成小級傷害、減速 25% 持續 1.5 秒，並留下 4 秒寒霜供普攻消耗。", "skillshot", [projectile("imported.wave.ice", [dmg(), status("chill", 1.5, { moveSpeedMult: 0.75 }), status("frost", 4)])], { range: "大", cooldown: "極小" }),
      W: seq("精靈雪衣", "自身取得 120 護盾，持續 3 秒；不召喚可獨立操作的精靈。", "self", [shield("snow-coat", 120)]),
      E: seq("冰花開席", "落點造成小級魔法傷害，命中者減速 40% 持續 1 秒。", "ground", [dmg(), status("ice-flower", 1, { moveSpeedMult: 0.6 })], { radius: 2 }),
      R: seq("永凍・試用版", "落點三輪冰震，每輪小級魔法傷害；只有當輪仍在圈內的敵人受擊，並非永久凍結。", "ground", [pulse([dmg()], 3, 3)], { range: "大", cooldown: "大", mana: "大" }),
      EX: seq("熱茶先不要冰", "回復自身 100 生命；喝茶期間沉默 0.8 秒，仍能移動與普攻。", "self", [heal(100), status("tea", 0.8, { silenced: true }, "self")]),
    },
  },
  {
    id: "acquired-ram", inspiration: "拉姆／Ram", name: "拉姆", sourceWork: "Re:從零開始的異世界生活", sourceUrl: rezero,
    origin: "法師", attackType: "ranged",
    summary: "以風刃、挪位和拉扯維持輸出窗口的女僕；E 後接 Q 補一道風刃。掃除只做最低限度，嘲諷倒是全勤。",
    adaptations: ["以風魔法與毒舌意象改編，不給千里眼全圖揭露、原作完整鬼族能力或長時間飛行。", "風勢是 E 施放取得的 4 秒標記；Q 消耗增加一道直線判定，不是技能重置。"],
    moves: {
      PASSIVE: passive("掃除前先開窗", "施放 E 後取得 4 秒風勢，下一次 Q 可消耗。", [{ on: "onAbilityCast", abilitySlot: "E", target: "self", effects: [status("wind", 4, {}, "self")] }]),
      Q: seq("風刃催你走", "先斬出小級魔法風刃；持有風勢時消耗，再補一道極小級風刃。", "self", [line("小"), consume("wind", "self", [line("極小")])], { cooldown: "極小" }),
      W: seq("毒舌逆風", "指定敵人受到極小級魔法傷害並減速 35% 持續 1.5 秒；沒有強制改變其施法方向。", "targeted", [dmg("極小"), status("headwind", 1.5, { moveSpeedMult: 0.65 })]),
      E: seq("不想走樓梯", "朝指定方向固定短衝 2.5 單位；不具穿牆或無敵保證。", "ground", [dash(2.5)], { range: "小", cooldown: "中" }),
      R: seq("風暴大掃除", "落點造成大級魔法傷害並向施法者拉近命中敵人 2 單位；不是持續吸附龍捲。", "ground", [dmg("大"), push("pull")], { cooldown: "大", mana: "大" }),
      EX: seq("今天也辛苦別人", "取得 3 秒移速增益並回復 60 生命；保留自己退場整備的空間。", "self", [speed("break-time"), heal(60)]),
    },
  },
  {
    id: "acquired-beatrice", inspiration: "碧翠絲／Beatrice", name: "碧翠絲", sourceWork: "Re:從零開始的異世界生活", sourceUrl: rezero,
    origin: "法師", attackType: "ranged",
    summary: "用書庫護盾存一頁術式，再以陰影砲兌現的法師；短距換位避開近戰。借書能延期，挨打不能。",
    adaptations: ["禁書庫與門的意象改為短距瞬移；不建立獨立空間、地圖門網或絕對無敵。", "W 施放存一頁書籤，R 消耗增傷；護盾到期不影響仍未到期的書籤。"],
    moves: {
      PASSIVE: passive("借書要留押金", "施放 W 後取得一枚 6 秒書籤，供 R 消耗。", [{ on: "onAbilityCast", abilitySlot: "W", target: "self", effects: [status("bookmark", 6, {}, "self")] }]),
      Q: seq("陰影退件章", "射出虛空彈，命中造成小級魔法傷害。", "skillshot", [projectile("imported.bolt.void", [dmg()])], { range: "大", cooldown: "極小" }),
      W: seq("禁書封皮", "取得 130 護盾，持續 3 秒；同時透過被動保留一枚書籤。", "self", [shield("cover", 130)]),
      E: seq("門在這一邊", "瞬移至指定近處落點，不留下隊友可通行的門。", "ground", [{ kind: "blink", shape: "single", to: "point" }], { range: "小", cooldown: "中" }),
      R: seq("逾期罰款・陰", "消耗書籤時對指定敵人造成大級魔法傷害；無書籤時為中級。兩種情況都沉默目標 0.7 秒。", "targeted", [consume("bookmark", "self", [dmg("大")], [dmg("中")]), status("hush", 0.7, { silenced: true })], { range: "大", cooldown: "大", mana: "大" }),
      EX: seq("圖書館請安靜", "近處指定落點小圈造成極小級魔法傷害，命中者沉默 0.6 秒；不會同時暈眩或定身。", "ground", [dmg("極小"), status("library", 0.6, { silenced: true })], { range: "極小", radius: 1.8 }),
    },
  },
  {
    id: "acquired-mario", inspiration: "Mario／瑪利歐", name: "Mario", sourceWork: "Super Mario／超級瑪利歐", sourceUrl: smash,
    origin: "鬥士", attackType: "melee",
    summary: "以火球牽制、跳躍踩踏與披風推移作戰的管線專家；跳躍存硬幣，EX 換一份防護午餐。這次公主不在另一張地圖。",
    adaptations: ["硬幣是本英雄的短效連動標記，不更動金幣經濟或額外生命。", "披風只推移與短時繳械，不反射投射物；跳躍不保證越牆，沒有碰觸即死或踩踏即殺。", "R 是向前火焰判定，不生成大型火球角色或改變模型體型。"],
    moves: {
      PASSIVE: passive("叮！不是薪水", "施放 E 後取得 6 秒硬幣標記，供 EX 換取較多回復與護盾。", [{ on: "onAbilityCast", abilitySlot: "E", target: "self", effects: [status("coin", 6, {}, "self")] }]),
      Q: seq("火球通管", "射出一發火彈，命中造成小級魔法傷害；不額外保證地面反彈。", "skillshot", [projectile("imported.bolt", [dmg()])], { range: "大", cooldown: "極小" }),
      W: seq("披風請讓路", "推開近處指定敵人 2 單位並繳械 0.6 秒；對方仍能移動和施法。", "targeted", [push(), status("cape", 0.6, { disarmed: true })], { range: "極小" }),
      E: seq("水管工落地章", "短躍至落點，落地造成小級物理範圍傷害；沒有踩死判定。", "ground", [{ kind: "leap", mode: "toPoint", apexHeight: 1.2, durationSec: 0.45, landRadius: 1.5, onLand: [dmg("小", "physical")] }], { range: "小", cooldown: "中" }),
      R: seq("終極火焰報價", "向面前 6 單位直線噴出大級魔法火焰；命中者減速 30% 持續 1.2 秒。", "self", [line("大", "magic", [status("hot", 1.2, { moveSpeedMult: 0.7 })])], { cooldown: "大", mana: "大" }),
      EX: seq("一枚硬幣套餐", "消耗硬幣時回復 100 生命並取得 80 護盾；無硬幣只回復 40 生命，不生成金幣。", "self", [consume("coin", "self", [heal(100), shield("lunch", 80)], [heal(40)])]),
    },
  },
  {
    id: "acquired-mewtwo", inspiration: "Mewtwo／超夢", name: "Mewtwo", sourceWork: "Pokémon／寶可夢", sourceUrl: smash,
    origin: "法師", attackType: "ranged",
    summary: "以念力護盾蓄勢、暗影球遠攻與瞬移換位的法師。存在的意義還沒找到，排位配對先找到了。",
    adaptations: ["蓄力以 W 給予的一層專注表示，不讀長按時間；沒有精神控制玩家、複製角色或永久能力提升。", "瞬移受本遊戲施法距離限制；R 僅局部短暈，不是全場念力拘束。"],
    moves: {
      PASSIVE: passive("念力集中中", "施放 W 取得 5 秒專注，下一次 Q 可消耗；無法無限累積。", [{ on: "onAbilityCast", abilitySlot: "W", target: "self", effects: [status("focus", 5, {}, "self")] }]),
      Q: seq("暗影球・已充電", "消耗專注時射出大級魔法傷害球；無專注時為小級，傷害只在投射物命中時結算。", "skillshot", [consume("focus", "self", [projectile("imported.bolt.void", [dmg("大")])], [projectile("imported.bolt.void", [dmg()])])], { range: "大", cooldown: "中" }),
      W: seq("念力保護殼", "自身取得 100 護盾持續 3 秒，並透過被動為下一發 Q 蓄力。", "self", [shield("mind-shell", 100)]),
      E: seq("瞬間移動・區內", "瞬移至指定近處地點；不帶走其他單位。", "ground", [{ kind: "blink", shape: "single", to: "point" }], { range: "小", cooldown: "中" }),
      R: seq("精神強念投訴", "落點造成中級魔法範圍傷害，命中者暈眩 0.8 秒。", "ground", [dmg("中"), status("psystrike", 0.8, { stun: true })], { range: "大", cooldown: "大", mana: "大" }),
      EX: seq("我究竟為何排隊", "回復 110 生命，但思考期間自身沉默 1 秒；仍能移動與普攻。", "self", [heal(110), status("identity", 1, { silenced: true }, "self")]),
    },
  },
  {
    id: "acquired-pokemon-trainer", inspiration: "Pokémon Trainer／寶可夢訓練家", name: "Pokémon Trainer", sourceWork: "Pokémon／任天堂明星大亂鬥", sourceUrl: smash,
    origin: "法師", attackType: "ranged",
    summary: "把水、草、火三種指令編成連動的戰術手；先施放三種小招，再把徽記換成 R 的不同追加效果。包裡什麼都有，唯獨沒有換人冷卻。",
    adaptations: ["以傑尼龜、妙蛙草與噴火龍的招式意象改編；三種指令由同一英雄結算，沒有三隻獨立召喚物或三套血條。", "各指令各留一枚 6 秒徽記；R 分別消耗水、草、火追加減速、鎖足及傷害，不冒稱原作換人系統。"],
    moves: {
      PASSIVE: passive("徽章集點卡", "施放 Q、W、E 分別取得水、草、火徽記，各持續 6 秒且只保留一層，供 R 分別消耗。", [
        { on: "onAbilityCast", abilitySlot: "Q", target: "self", effects: [status("water", 6, {}, "self")] },
        { on: "onAbilityCast", abilitySlot: "W", target: "self", effects: [status("grass", 6, {}, "self")] },
        { on: "onAbilityCast", abilitySlot: "E", target: "self", effects: [status("fire", 6, {}, "self")] },
      ]),
      Q: seq("傑尼龜・水槍", "以 GGD 奧術彈呈現水槍，命中造成小級魔法傷害並減速 20% 持續 1 秒。", "skillshot", [projectile("imported.bolt.arcane", [dmg(), status("splash", 1, { moveSpeedMult: 0.8 })])], { range: "大", cooldown: "極小" }),
      W: seq("妙蛙草・藤鞭", "直線草刃造成小級魔法傷害，命中者鎖足 0.5 秒。", "self", [line("小", "magic", [status("vine", 0.5, { root: true })])]),
      E: seq("噴火龍・熱身", "朝指定方向固定衝刺 3 單位，結束後對近處造成極小級魔法傷害；不切換模型或飛行。", "ground", [dash(3, [area("極小", 1.5)])], { range: "小", cooldown: "中" }),
      R: seq("三重指令結帳", "先對指定敵人造成中級魔法傷害，再分別消耗水徽記減速、草徽記鎖足、火徽記追加小級傷害。缺哪一枚就少哪一項。", "targeted", [dmg("中"), consume("water", "self", [status("triple-water", 1.5, { moveSpeedMult: 0.6 })]), consume("grass", "self", [status("triple-grass", 0.7, { root: true })]), consume("fire", "self", [dmg()])], { range: "大", cooldown: "大", mana: "大" }),
      EX: seq("包包裡有傷藥", "回復自身 80 生命並取得 2 秒移速增益；不消耗或新增正式背包道具。", "self", [heal(80), speed("bag", 2)]),
    },
  },
  {
    id: "acquired-ryu", inspiration: "Ryu／隆", name: "Ryu", sourceWork: "Street Fighter／快打旋風", sourceUrl: "https://www.streetfighter.com/6/character/ryu.html",
    origin: "鬥士", attackType: "melee",
    summary: "以波動拳試探、升龍拳收招、旋風腿進場的格鬥家；Q 後短窗口強化 W。流浪修行的最大敵人，是旅館押金。",
    adaptations: ["保留波動拳、升龍拳、旋風腿意象，輸入方式沿用 GGD 技能鍵，不要求搓招或原作取消連段。", "升龍拳沒有無敵；旋風腿是固定距離地面衝刺，R 只做有限連擊。"],
    moves: {
      PASSIVE: passive("波升基本功", "施放 Q 後取得 3 秒架勢，W 可消耗增加傷害；不是命中確認或普攻重置。", [{ on: "onAbilityCast", abilitySlot: "Q", target: "self", effects: [status("shoto", 3, {}, "self")] }]),
      Q: seq("波動拳", "射出氣彈，命中造成小級魔法傷害。", "skillshot", [projectile("imported.bolt.ki", [dmg()])], { range: "大", cooldown: "極小" }),
      W: seq("升龍拳・有付費", "近身造成小級物理傷害；消耗架勢時改為中級。命中敵人再受到短距推移與 0.5 秒鎖足，施法者沒有無敵。", "targeted", [consume("shoto", "self", [dmg("中", "physical")], [dmg("小", "physical")]), push(), status("uppercut", 0.5, { root: true })], { range: "極小", cooldown: "中" }),
      E: seq("龍捲旋風腿", "朝指定方向固定衝刺 3 單位，結束後對近處敵人造成小級物理傷害。", "ground", [dash(3, [area("小", 1.5, "physical")])], { range: "小" }),
      R: combo("真・升龍加班", "近距鎖足目標並完成五次短連擊與收尾；不具無敵或即死。", 5),
      EX: seq("無薪修行", "取得 130 護盾，但專注架勢讓自己繳械 0.8 秒；仍可移動和施法。", "self", [shield("focus-guard", 130), status("training", 0.8, { disarmed: true }, "self")]),
    },
  },
  {
    id: "acquired-minecraft", inspiration: "Steve／Alex（同英雄服裝）", name: "Steve／Alex", sourceWork: "Minecraft／當個創世神", sourceUrl: "https://www.minecraft.net/",
    origin: "鬥士", attackType: "melee",
    summary: "普攻挖材料，再決定用於鎬擊、護甲還是 TNT 的資源鬥士。Steve 與 Alex 共用同一技能身分；工作台仍然不接受刷卡。",
    adaptations: ["Steve／Alex 是同一英雄的外觀選擇，不建立第二個英雄或不同能力數值。", "材料最多三層、8 秒到期；不是地圖採礦、物品合成或永久裝備。", "盾牆只是一份護盾，礦車是地面短衝，TNT 是定點延遲傷害；都不新增實體建築或破壞地形。"],
    moves: {
      PASSIVE: passive("挖礦不包加班", "普攻每 1 秒最多取得一層材料，最多三層，每次取得刷新為 8 秒；供 Q、W、R 消耗。", [{ on: "onBasicAttack", target: "self", internalCooldown: 1, condition: { not: held("material", "self", 3) }, effects: [status("material", 8, { stacks: 1 }, "self")] }]),
      Q: seq("鑽石鎬・租的", "消耗一層材料時造成中級物理傷害；不足時只造成小級傷害。", "targeted", [consume("material", "self", [dmg("中", "physical")], [dmg("小", "physical")])], { range: "極小", cooldown: "極小" }),
      W: seq("一面不擋路的牆", "消耗兩層材料時取得 180 護盾；不足時不扣材料並只取得 70 護盾，均持續 3 秒。", "self", [consume("material", "self", [shield("wall", 180)], [shield("wall", 70)], 2)]),
      E: seq("礦車單程票", "朝指定方向固定衝刺 3 單位，結束後才造成極小級物理範圍傷害；不生成載具。", "ground", [dash(3, [area("極小", 1.5, "physical")])], { range: "小", cooldown: "中" }),
      R: seq("TNT 結算日", "消耗三層材料時在落點延遲 0.8 秒造成大級物理傷害；不足不扣材料，改為小級。爆炸時重解目標，走出圈可避開。", "ground", [consume("material", "self", [{ kind: "delayed", shape: "circle", radius: 2.5, side: "enemies", delaySec: 0.8, targetMode: "reresolve", anchor: "point", effects: [dmg("大", "physical")] }], [{ kind: "delayed", shape: "circle", radius: 2.5, side: "enemies", delaySec: 0.8, targetMode: "reresolve", anchor: "point", effects: [dmg("小", "physical")] }], 3)], { cooldown: "大", mana: "大" }),
      EX: seq("工作台便當", "回復自身 110 生命，但用餐時自身鎖足 0.8 秒；仍可普攻及施法，不是眩暈。", "self", [heal(110), status("craft-lunch", 0.8, { root: true }, "self")]),
    },
  },
];
