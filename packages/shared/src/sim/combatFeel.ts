/**
 * 戰鬥手感規則 (combat feel) — 兩條**後台可調**的全域規則,合成一份文件
 * `config.combat-feel@1`:
 *
 *   1. 擊退 (knockback, GH#193) —— 擊退距離改由「這一擊打掉受傷單位多少百分比的
 *      最大生命」決定,並且**減掉攻守雙方目前的距離**。
 *   2. 打就站定 (standstill) —— 要出手就得站定;走動中不得起手,前搖中走動作廢。
 *
 * ⚠️ 不要和 `sim/combat/hitFeel.ts` 搞混。那一份是**每個技能/每位英雄各自**的
 * 演出覆寫(震幅、火花、凍結),由內容作者寫在 champion/ability 文件裡;這一份是
 * **整場比賽共用的一張規則表**,由操作者在後台調,和 `combatEnv` / `baseBonus` /
 * `statCaps` 同一個階層。
 *
 * ---------------------------------------------------------------------------
 * 為什麼擊退要整個翻掉(設計反轉,不是調參)
 * ---------------------------------------------------------------------------
 * 舊法是**絕對傷害分級**:`impact >= 70` 才推,推 `impact/100 × 1.6` 單位。
 * 它有兩個問題:
 *
 *   · 一個 70 點的傷害打在 6,000 血的王身上和打在 300 血的脆皮身上推一樣遠 ——
 *     擊退和「這一下對你有多痛」完全脫鉤。
 *   · 遠程可以隔著 8.2 的射程把人一直往後推,自己完全不用進場。近戰射程 1.6,
 *     推完之後目標就出射程了 —— **自己打出的擊退把自己的下一刀取消掉**。
 *     `sim/autoAttackCensus.test.ts` 的 KNOWN_BELOW_RATE 六位近戰(最差的
 *     godie-u011 只有 0.14)就是這個形狀。
 *
 * owner 2026-07-28 (GH#193):
 * 「傷害超過一定閾值會擊退,而且擊退距離會跟傷害/受傷單位血量的百分比有關,
 *   舉例,該傷害超過生命5%才會擊退、並且百分比越高擊退越遠,最多 10個身位距離
 *   (假設一擊就造成100%生命損失),這個距離會攻擊與受傷雙方距離相減」
 *
 * ---------------------------------------------------------------------------
 * ⚠️「減距離」不是 bug,不要把它優化掉
 * ---------------------------------------------------------------------------
 * `distance = max(0, raw − 攻守雙方目前距離)` 讀起來很像一條沒必要的減法,而它
 * 正是這條規則的**全部重點**:
 *
 *     近戰貼身 (d≈1.5) 打出 50% 傷害 → raw 5.0 − 1.5 = **3.5 身位**
 *     遠程隔 8.2 打出同樣 50% 傷害   → raw 5.0 − 8.2 = **0**(完全不推)
 *
 * 也就是說:**擊退從此是近戰的工具**。遠程再也不能靠推人永久風箏,而近戰打人
 * 也不會再把自己的目標推出自己的射程(距離越近推得越遠,但推完之後兩人距離就是
 * `raw`,而 `raw` 對一次普攻來說很小)。任何「這個減法看起來多餘」的重構都會
 * 同時把 #45 的近戰普攻率打回 0.14,並把風箏還給遠程。
 *
 * ⚠️ 6,000 血的殭屍王一擊要吃到 300 傷害才會被推 —— 也就是**王幾乎不會被擊退**。
 * 這是刻意的(王就該站得住),不是漏算。要讓王會被推就把 `minPct` 調小。
 */

import { dot, lenSq, normalize, sub, type Vec2 } from "./math/vec2";

/** 擊退規則(全部後台可調)。 */
export interface KnockbackRules {
  /** 這一擊的傷害佔受傷單位**最大生命**的比例,低於這個值 → 完全不擊退。 */
  minPct: number;
  /** 一擊打掉 100% 生命時的擊退**身位數**(這是上限,pct 會先夾到 1)。 */
  maxBodies: number;
  /** 一個身位換算成多少 GGD 單位。 */
  bodyUnit: number;
}

/** 打就站定規則(全部後台可調)。 */
export interface StandstillRules {
  /** 總開關。false = 整條規則不存在(維持舊行為:邊走邊打)。 */
  enabled: boolean;
  /**
   * 「有在動」的速度門檻 (GGD units/sec),同時也是「正在靠近目標」的門檻。
   * 讀的是 `Transform.vel`(實際位移/dt),不是移動意圖 —— 見 BasicAttackSystem。
   */
  walkEps: number;
  /**
   * 小怪(含殭屍王)是否同樣受這條規則約束。
   * owner 2026-07-28:「並且殭屍王也會預設套用」→ 預設 true。
   * 關掉的話小怪能邊走邊打而英雄不行,那是一個沒有人會想要的不對稱。
   */
  applyToMobs: boolean;
}

/**
 * 面向鎖的窗口長度 (task #264 / #275 / #280),全部後台可調。
 *
 * ⚠️ 這三個數字以前是 `facingLock.ts` 的三個 `export const`。owner 已經在
 * 面向這個題目上改過主意兩次(#264「出手即承諾」→ #275「瞄準優先」),而每一次
 * 想調的都是**窗口有多長** —— 那正是「會不會想改」的答案是「會」的欄位。
 *
 * ⚠️ 這一組只被**權威端**讀到。`armFacingLock` 的呼叫者是 `BasicAttackSystem`
 * 與 `abilities/abilitySystem`,兩者都只在伺服器的 `world.step()` 裡跑;客戶端的
 * `LocalPrediction` 只重播 `orderSystem` + `movementSystem`,從不自己上鎖(它讀
 * 的是快照同步過來的結果)。所以這三格改了不會讓預測和權威分家。
 * 對照:`aimHoldTicks` 就**不能**放進來,理由見 `aimHold.ts` 的檔頭。
 */
export interface FacingRules {
  /**
   * 出手後的「收招」餘韻 tick 數。傷害點結束時若同時放掉鎖,身體會在命中的同一幀
   * 被移動方向拉走,看起來就像根本沒轉過。
   */
  followThroughTicks: number;
  /**
   * 瞬發技 (castTimeSec = 0) 的最低鎖定長度。瞬發技沒有吟唱可以撐住面向,
   * 只給 follow-through 的話走位中的玩家幾乎看不到轉身。
   */
  instantCastTicks: number;
}

export interface CombatFeelRules {
  knockback: KnockbackRules;
  standstill: StandstillRules;
  /**
   * ⚠️ 選用,而且**必須**保持選用。`combatFeelFromDoc` 與 `DEFAULT_COMBAT_FEEL`
   * 一定會填它,所以出貨路徑上它永遠存在;選用是為了那些手寫半張表的既有測試
   * (`world.combatFeel = { knockback, standstill }`)—— 把它改成必填會讓那些檔案
   * 編不過,而它們散在別的工作流擁有的目錄裡。
   *
   * 讀的時候一律走 `facingLock.ts` 的 `facingTicks(world)`,它對缺格回退到
   * `DEFAULT_FACING`。**不要**直接讀 `world.combatFeel.facing!` —— undefined
   * 一路傳下去會變成 `world.tick + NaN`,而 `NaN` 讓每個到期比較都是 false,
   * 面向鎖會永遠不過期,而且完全無聲。
   */
  facing?: FacingRules;
}

/** owner 在 GH#193 直接給的數字。`bodyUnit` 是本任務替他假設的 1.0。 */
export const DEFAULT_KNOCKBACK: KnockbackRules = Object.freeze({
  minPct: 0.05,
  maxBodies: 10,
  bodyUnit: 1.0,
});

export const DEFAULT_STANDSTILL: StandstillRules = Object.freeze({
  enabled: true,
  walkEps: 0.5,
  applyToMobs: true,
});

/**
 * 出貨預設 = #264 訂下、#275 沿用的那兩個數字(3 tick = 100ms 蓋過 client 那段
 * 70ms 的 yaw 平滑;6 tick = 200ms,和 `TURN_FACTOR` 轉完 90° 同一個量級)。
 */
export const DEFAULT_FACING: FacingRules = Object.freeze({
  followThroughTicks: 3,
  instantCastTicks: 6,
});

/**
 * 出貨預設。
 *
 * ⚠️ 缺文件 / 壞文件 → **回這個**,不是空表。回空表的話 `minPct` 是 0(每一下
 * 都推)或 `maxBodies` 是 0(永遠不推),兩種都是靜默的規則消失:沒有任何錯誤
 * 訊息,遊戲照跑,手感全毀。這是 `statCaps.ts` 學到的同一課。
 */
export const DEFAULT_COMBAT_FEEL: CombatFeelRules = Object.freeze({
  knockback: DEFAULT_KNOCKBACK,
  standstill: DEFAULT_STANDSTILL,
  facing: DEFAULT_FACING,
});

/** 文件的 schema 字串 —— 讀寫兩端(sim / 後台)共用這一個常數。 */
export const COMBAT_FEEL_SCHEMA = "config.combat-feel@1";
/** 文件 id(`content/config/combat-feel.json`)。 */
export const COMBAT_FEEL_DOC_ID = "combat-feel";

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * 正規化操作者/文件給的表。每一格單獨退回出貨預設 —— 一格打錯不會把整張表
 * 一起丟掉,但也不會把 `NaN` 帶進 sim(`NaN` 會讓每一個比較都是 false,擊退就
 * 靜默消失)。
 *
 * 夾限是刻意的:`minPct` 允許 0(每一下都推)到 1(只有一擊必殺才推);
 * `maxBodies` / `bodyUnit` 不允許負數(負的擊退 = 把人吸過來,那是另一個機制,
 * 不該從一個打錯的設定值意外冒出來)。
 */
export function normalizeKnockbackRules(raw: unknown): KnockbackRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    minPct: num(r.minPct, DEFAULT_KNOCKBACK.minPct, 0, 1),
    maxBodies: num(r.maxBodies, DEFAULT_KNOCKBACK.maxBodies, 0, 100),
    bodyUnit: num(r.bodyUnit, DEFAULT_KNOCKBACK.bodyUnit, 0, 100),
  });
}

export function normalizeStandstillRules(raw: unknown): StandstillRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_STANDSTILL.enabled,
    walkEps: num(r.walkEps, DEFAULT_STANDSTILL.walkEps, 0, 100),
    applyToMobs:
      typeof r.applyToMobs === "boolean" ? r.applyToMobs : DEFAULT_STANDSTILL.applyToMobs,
  });
}

/**
 * 讀一份 `config.combat-feel@1` 文件(sim 與後台共用的那個 `Configs` registry)。
 * 沒有文件 / schema 不對 → 出貨預設(見 DEFAULT_COMBAT_FEEL 上面的警告)。
 */
/**
 * Tick 數專用:先夾到 [min,max] 再取整。**非整數的 tick 是靜默的災難** ——
 * `world.tick + 2.5` 之後 `world.tick >= lock.untilTick` 會在半個 tick 的位置
 * 為真,鎖的長度就變成「有時 2 有時 3」,而 sim 必須逐 tick 決定性重播。
 */
function ticks(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  const clamped = v < min ? min : v > max ? max : v;
  return Math.round(clamped);
}

/**
 * 上界是刻意的(第一守則:「欄位要有上界,不是只有下界」)。300 tick = 10 秒 ——
 * 遠超過任何一次出手,但擋得住「6 打成 600」那種手滑:600 tick 的鎖等於整整
 * 20 秒不能用右類比轉身,而且是**靜默**的,沒有任何錯誤訊息。
 */
export function normalizeFacingRules(raw: unknown): FacingRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    followThroughTicks: ticks(r.followThroughTicks, DEFAULT_FACING.followThroughTicks, 0, 300),
    instantCastTicks: ticks(r.instantCastTicks, DEFAULT_FACING.instantCastTicks, 0, 300),
  });
}

export function combatFeelFromDoc(doc: unknown): CombatFeelRules {
  if (!doc || typeof doc !== "object") return DEFAULT_COMBAT_FEEL;
  const d = doc as {
    schema?: unknown;
    knockback?: unknown;
    standstill?: unknown;
    facing?: unknown;
  };
  if (d.schema !== COMBAT_FEEL_SCHEMA) return DEFAULT_COMBAT_FEEL;
  return Object.freeze({
    knockback: normalizeKnockbackRules(d.knockback),
    standstill: normalizeStandstillRules(d.standstill),
    facing: normalizeFacingRules(d.facing),
  });
}

/**
 * 這一擊的**原始**擊退距離 (GGD units),還沒有減掉距離。
 *
 *     pct  = damage / maxHp                       (受傷單位的最大生命)
 *     pct < minPct                → 0             (完全不擊退)
 *     raw  = maxBodies × min(pct,1) × bodyUnit    (身位 → GGD 單位)
 *
 * @param damage 這一擊**減傷後、吃盾前**的傷害(damage.ts 的 `impact`)
 * @param maxHp  受傷單位的最大生命;<= 0 視為沒有身體 → 不擊退
 */
export function knockbackRaw(rules: KnockbackRules, damage: number, maxHp: number): number {
  if (!(maxHp > 0) || !(damage > 0)) return 0;
  const pct = damage / maxHp;
  if (!(pct >= rules.minPct)) return 0;
  const capped = pct > 1 ? 1 : pct;
  return rules.maxBodies * capped * rules.bodyUnit;
}

/**
 * 減距離:`max(0, raw − gap)`。⚠️ 見檔頭 ——「這個減法是重點」。
 *
 * ⚠️ 這一步套用在**每一種**擊退上,包含內容作者寫在 `hitFeel.knockbackMag`
 * 的覆寫值(見 combat/damage.ts)。理由是量出來的:出貨內容裡 **114/115 位英雄
 * 的普攻都帶著一個 hitFeel.knockbackMag**(0 / 0.25 / 0.3 / 0.45),如果覆寫值
 * 不走這條減法,#193 的整條新法則對**普攻完全無效** —— 而普攻正是 owner 抱怨的
 * 那件事(#45:近戰自己打出的擊退把目標推出自己的射程)。
 *
 * 所以覆寫值的語意是「距離 0 時要推多遠」,不是「無論如何都推這麼遠」。
 */
export function afterGap(raw: number, gap: number): number {
  const out = raw - (gap > 0 ? gap : 0);
  return out > 0 ? out : 0;
}

/**
 * 完整的擊退法則(raw → 減距離)。**唯一**的擊退計算,sim 與任何面板都讀這一支。
 *
 * 純算術:加減乘除與比較,沒有 rng、沒有三角函數、沒有 `**`。兩台主機同樣的
 * 輸入必然得到同樣的輸出(sim/purity.test.ts)。
 *
 * @param gap 攻守雙方**目前**的距離 (GGD units)
 */
export function knockbackDistance(
  rules: KnockbackRules,
  damage: number,
  maxHp: number,
  gap: number,
): number {
  return afterGap(knockbackRaw(rules, damage, maxHp), gap);
}

// --------------------------------------------------------------- 打就站定 --
// owner 2026-07-28:「遠程單位在攻擊的時候可以邊移動邊攻擊,這樣對近戰單位來說
// 是不公平的」+「殭屍王也會預設套用」+「整體這個功能在後台也是個開關」。
//
// 為什麼這條規則以前**不存在**,以及不對稱到底在哪裡 —— 全部是量出來的
// (出貨 bundle,115 位英雄,2026-07-28):
//
//                     人數   射程中位數   前搖中位數        沒設前搖的
//     近戰            82     1.6          0.25 s = 8 tick   51/82
//     遠程            33     8.2          0.30 s = 9 tick   25/33
//     移速中位數             5.9 / 5.7(兩邊幾乎一樣)
//
// ⚠️ 不對稱**不在前搖**。遠程的預設前搖(DEFAULT_DAMAGE_POINT_RANGED = 0.3)
// 其實比近戰的(0.25)還**長**,而且兩邊中位數只差一個 tick。真正差五倍的是
// **射程**:前搖那 0.25 s 內,一個 5.9 移速的目標會走掉 1.48 個單位 —— 對 1.6
// 射程的近戰來說幾乎就是脫離接觸,對 8.2 射程的遠程來說整碗吸收。所以「能不能
// 邊走邊打」以前是被射程夾出來的副作用,不是被任何規則決定的。
// (PR #182 的註解寫「近戰前搖 0.5s(15 tick) vs 遠程 0.3s(9 tick)」,那個
//  0.5 s 是近戰的**最大值**不是中位數。錯的註解會變成下一個人的事實,所以更正
//  在這裡留一份。)

/** 這一 tick 有沒有在「走」—— 讀的是實際位移 `Transform.vel`,不是移動意圖。 */
export function isWalking(rules: StandstillRules, vel: Vec2): boolean {
  return lenSq(vel) > rules.walkEps * rules.walkEps;
}

/**
 * 徑向靠近速度:正 = 正在拉近,負 = 正在拉開,0 = 純側移或沒動。
 * 用向量投影,不用角度 —— sim 禁止三角函數(purity.test.ts)。
 */
export function closingSpeed(vel: Vec2, selfPos: Vec2, targetPos: Vec2): number {
  return dot(vel, normalize(sub(targetPos, selfPos)));
}

/**
 * 站定規則的**唯一**判斷:這一 tick 該不該擋下對 `targetPos` 的出手?
 *
 *     有在動(|vel| > walkEps) 而且 不是在朝目標靠近(徑向速度 < walkEps) → 擋
 *
 * 三種移動被清楚地分開:
 *
 *     朝目標衝     靠近速度 ≈ 全速  → 可以出手(近戰接近戰、被擊退後歸位)
 *     繞圈／側移   靠近速度 ≈ 0     → 不能出手(風箏的走位是這一種)
 *     後退／被擊退 靠近速度 < 0     → 不能出手(風箏的本體;被打飛就別想揮完)
 *
 * 用**徑向靠近速度 >= walkEps**,而不是 `dot > 0`:純側移的靠近速度約等於 0,
 * 浮點雜訊會讓它在正負之間跳,規則就變成擲骰子。
 *
 * ---------------------------------------------------------------------------
 * 「正在靠近」這個例外是**量出來的,不是設計品味**
 * ---------------------------------------------------------------------------
 * 把「靠近」那一半拿掉(等於只要在動就擋)再跑 `sim/autoAttackCensus.test.ts`:
 *
 *     godie-zombiex 在射程內十秒**一下都打不出來**(0/7),再加一位掉到門檻以下
 *
 * 靠近的動作(接近戰、被推開之後歸位、身體被擠開之後回位)會被誤判成「玩家在
 * 跑」。PR #182 第一版沒有這個例外時點名 **14 位**近戰;現在只剩 1~2 位,差別
 * 來自 GH#193 的擊退修正。例外變小了但沒有消失,所以它留著。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 已知的邊界:碰撞造成的抖動
 * ---------------------------------------------------------------------------
 * PR #182 的註解說「撞牆推不動的人位移是 0,所以他還是能打」。對**場地邊界**
 * 成立(`moveWithCollision` 乾淨地夾住,`vel` 真的是 0);對**圓形柱子**不一定,
 * 因為 `pushOutOfObstacle` 會把身體推進去又推出來。兩種情形都有守衛
 * (`sim/attackStandstill.test.ts` 的 ss-blocked-counts-as-still / ss-obstacle-jitter),
 * 而且都是綠的 —— 但那句話值得標成「有條件成立」而不是通則。
 *
 * 英雄(BasicAttackSystem)和小怪/殭屍王(MobSystem)讀的是同一支,所以不會
 * 出現「殭屍能邊走邊打、玩家不能」—— owner 明確要求殭屍王也套用,而小怪走的是
 * 完全不同的簡化攻擊路徑,兩邊各寫一次必然會分岔。
 *
 * 目標和自己完全重疊時 `normalize` 給 0 向量、靠近速度 0 → 算沒在靠近;那種
 * 情況下身體會被 separation 推開,而 separation 直接改 `pos` 從不寫 `vel`,
 * 所以那個單位讀到的速度是 0,走的是「站著」那條路,不受這裡影響。
 */
export function standstillBlocks(
  rules: StandstillRules,
  vel: Vec2,
  selfPos: Vec2,
  targetPos: Vec2,
): boolean {
  if (!rules.enabled) return false;
  if (!isWalking(rules, vel)) return false;
  return closingSpeed(vel, selfPos, targetPos) < rules.walkEps;
}
