/**
 * dynamicTerms — 傷害算式裡 `Scaling` **讀不到**的那幾項。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這個檔為什麼存在
 *
 * `resolveScaling(finalStats, sc, rank, attrs)` 讀的是**施法者的屬性表**(加上
 * 2026-08-01 補上的三圍)。owner 的 49 支傳說武器裡有一整族 [On-Hit] 的算式,
 * 分母根本不在那張表上:
 *
 *   · 虛哭神去 godie-i007 「自身**已損失**的生命百分比數值(0~100)」
 *   · 瑪那魔杖  godie-i020 「敵方**現存 MP** 5%」
 *   · 熾天使之弓 godie-i012 燃燒「每秒 3% **最大生命**」(受害者的)
 *   · 炎神弩    godie-i06i 「10–1000,**敵我距離**越遠越高 (0~10)」
 *
 * 前三條都是「**某一條血條/魔條**的一個比例」,最後一條是「**兩個座標**的距離」。
 * 兩種都是世界狀態,不是屬性表,所以它們是 `Scaling` **之外**的項 —— 跟
 * `damage.hpPct` / `damage.incomingPct` 當初被做成獨立欄位完全同一個理由
 * (見 `effects/effect.ts` 那兩個欄位的說明)。
 *
 * ⚠️ 這裡只有**一份** `ResourcePctTerm`,`damage` 與 `dot` 共用它。四支道具想要
 * 的是同一個讀數(「誰的哪一條，怎麼讀」),做成兩份會保證有一天只修到一邊。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 與既有 `damage.hpPct` 的分工(**不是**重複)
 *
 * `hpPct` = 受害者的**生命**,只有 ratio 一種讀法,上界 `HP_PCT_DAMAGE_MAX`(0.35),
 * 已經出貨在 揍敵客 W 牙突 上。它**不動**。
 * `resourcePct` 是一般化的那一個:主詞可以是自己、可以是魔條、可以是「已損失」,
 * 而且多一個 `scale`(見下)。既有內容一行都不用改,新內容用新的那一個。
 *
 * PURITY (sim/purity.test.ts): 沒有 rng、沒有時鐘、沒有三角函式、沒有 `**`。
 * 距離用 `math/vec2.dist`(內部只有 `Math.sqrt`,IEEE 正確捨入,不在禁用清單)。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { dist } from "../math/vec2";

/** 讀誰的條:施法者自己,還是這次事件的對象。 */
export type ResourceSubject = "self" | "target";
/** 讀哪一條。 */
export type ResourceKind = "health" | "mana";
/** 怎麼讀:現存 / 最大 / 已損失(= 最大 − 現存)。 */
export type ResourceBasis = "current" | "max" | "missing";

/**
 * 讀出來的數字怎麼變成傷害 —— **這是一個決策點,所以是欄位**(CLAUDE.md 第一守則)。
 *
 *   · `"ratio"`(預設) —— 傷害 = 係數 × **絕對量**。
 *     「敵方現存 MP 5%」= `{basis:"current", perRank:[0.05]}` → 對方有 800 魔就是 40。
 *     這是遊戲裡每一個百分比欄位的既有讀法,所以是保守的預設值。
 *   · `"points"` —— 傷害 = 係數 × **百分比本身(0~100)**。
 *     虛哭神去的文案是「已損失的生命百分比**數值(0~100)**」—— 掉了 60% 血就打
 *     **60 點**,不是「60% 的什麼」。這是一個小得多、而且與血量上限無關的數字,
 *     兩種讀法差好幾個數量級,所以不可以由程式挑一個。
 *
 * ⚠️ 兩種模式的**上界不同**(下面兩個常數),因為它們的自然量級差 100 倍以上;
 * 共用一個上界的話,對其中一邊必然太鬆(擋不住打錯的數字)或對另一邊太緊。
 */
export type ResourceScale = "ratio" | "points";

/**
 * 「誰的哪一條的多少」——`damage.resourcePct` 與 `dot.resourcePct` 共用的形狀。
 *
 * `perRank` 是 rank-1 起算、超過欄位長度就夾在最後一格,跟 `Scaling.perRank`、
 * `damage.hpPct.perRank`、`damage.incomingPct.perRank` 完全一致。道具與 hook
 * 的 rank 永遠是 1,所以一支武器寫一格就好。
 */
export interface ResourcePctTerm {
  subject: ResourceSubject;
  resource: ResourceKind;
  basis: ResourceBasis;
  /** 省略 = `"ratio"` */
  scale?: ResourceScale;
  perRank: number[];
}

/**
 * `scale: "ratio"` 時一格 `perRank` 的上界 = 1 = 「整條」。
 *
 * 這是**打錯數字的守衛**,不是平衡政策 —— 跟 `HP_PCT_DAMAGE_MAX` 同一個性質。
 * 它擋的失敗是精確的:瑪那魔杖要寫 `0.05`(5%),打成 `5` 就是「對方現存魔力的
 * 500%」,在 diff 裡跟正確值長得一模一樣,而在場上是一擊必殺。1.0 讓「整條」
 * 這個極端仍然寫得出來(有人真的想要「等同對方現存魔力的傷害」),再往上就
 * 只可能是錯的。
 */
export const RESOURCE_PCT_RATIO_MAX = 1;

/**
 * `scale: "points"` 時一格 `perRank` 的上界。
 *
 * 這個模式的傷害 = 係數 × (0~100),所以 2 代表「滿格時 200 點」。出貨的
 * 虛哭神去用 1(滿格 100 點,正好是文案的 (0~100))。上界取 2 的理由同上:
 * 打成 `100`(以為要填百分比)會是 10,000 點,直接載不進來。
 */
export const RESOURCE_PCT_POINTS_MAX = 2;

/**
 * 一份 `dot` 的 `resourcePct` **整段燒完**的總量上界(ratio 模式)。
 *
 * ⚠️ 為什麼不是直接抄 `HP_PCT_DAMAGE_MAX`:一次 `damage` 的 0.35 是**一下**,
 * 而 dot 的每一格會付 `duration/interval` 次。0.35 × 一個 20 秒 / 每秒的燒傷
 * = 700% 最大生命,那不是一件武器,那是「按到就死」。所以 dot 這一族的守衛
 * 必須架在**總量**上,而不是單次量上 —— 這也讓作者怎麼切(每秒 3% × 2 秒
 * 還是每 0.5 秒 1.5% × 2 秒)都受同一條規則管。
 *
 * 0.5 = 半條血。出貨的 熾天使之弓 是 0.03 × 2 = 0.06(6%),離上界十倍遠。
 */
export const DOT_RESOURCE_PCT_RATIO_TOTAL_MAX = 0.5;

/** 同上,`points` 模式的總量上界(絕對點數)。400 ≈ 出貨生命倍率下的三分之一條。 */
export const DOT_RESOURCE_PCT_POINTS_TOTAL_MAX = 400;

/**
 * 距離加成項 —— 傷害在 `[near, far]` 之間**線性**內插,自變數是施法者與目標的
 * 平面距離,在 `[0, atRange]` 之外夾住。
 *
 * 炎神弩 godie-i06i 「攻擊額外造成 10-1000 傷害,敵我距離越遠傷害越高 (0~10)」
 * 是 `{atRange: 10, near: 10, far: 1000}` —— 文案把三個數字都給了。
 *
 * ⚠️ **方向是資料,不是程式的分支**。`near > far` 就是「越近越痛」,一樣寫得出來;
 * 這裡沒有任何一行在假設哪一頭比較大。這是刻意的:owner 之後想要一把
 * 「貼臉才有傷害」的短刀,不需要改 sim。
 *
 * ⚠️ 線性,不是曲線。`sim/purity.test.ts` 禁 `**` / `Math.pow` / 三角函式,而
 * 火圈的縮圈法則已經因為同一條規則寫成線性(見 `sim/fireRing.ts`)。
 */
export interface DistanceScaleTerm {
  /** 到達 `far` 的距離(sim 單位)。`0 < atRange <= DISTANCE_SCALE_RANGE_MAX` */
  atRange: number;
  /** 距離 0 時的加成 */
  near: number;
  /** 距離 >= `atRange` 時的加成 */
  far: number;
}

/**
 * `atRange` 的上界。40 跟 `zAuraDef.radius` 的上界同一個數字、同一個理由:
 * 整個骷髏場的 `boundaryRadius` 是 24,所以超過 40 的「距離區間」比較可能是
 * 一個沒換算的 WC3 原始值(WC3 的 500 ≈ 這裡的 9.17)漏進來了。
 */
export const DISTANCE_SCALE_RANGE_MAX = 40;

/**
 * `near` / `far` 的上界。
 *
 * ⚠️ 這一個特別要緊,因為出貨的炎神弩 `far` 就是 **1000** —— owner 文案寫死的
 * 數字,已經接近一條血。上界 3000 的工作**不是**壓制它(壓制它等於竄改文案),
 * 而是擋住多一個零:`10000` 打進 `1000` 的格子在 diff 裡看不出來,在場上是
 * 「站遠一點,一下秒全場」。
 */
export const DISTANCE_SCALE_DAMAGE_MAX = 3000;

/**
 * 「把打出去的傷害折回來」—— 瑪那魔杖 godie-i020 「回復己方 MP **該傷害量**」。
 *
 * ⚠️ 為什麼它必須騎在**封包**上而不是在 `damage` 效果裡算完:效果只把封包
 * **排進佇列**,真正打了多少是 `combat/damage.ts` 的排空迴圈算的(全域倍率 →
 * 護甲/魔抗 → 格擋 → 護盾)。在效果端算「該傷害量」只拿得到**打算**打多少,
 * 那個數字和玩家看到的浮動數字不一樣 —— 而文案講的是後者。
 */
export interface DamageRefund {
  /** 折回哪一條 */
  resource: ResourceKind;
  /**
   * 用哪一個讀數當「該傷害量」。省略 = `"hpLost"`。
   *
   * `"hpLost"` = 真的從血條掉下來的那一格,也就是**畫面上那個浮動數字**
   * (`world.emit("damage", {amount: dmg})`)。選它當預設是為了讓文案的
   * 「該傷害量」在玩家眼裡字面為真:他看到 40,就回 40。護盾全吃掉的一下
   * 回 0,那也是誠實的 —— 那一下沒有造成傷害。
   * `"mitigated"` = 過了護甲/魔抗、還沒進護盾池(`impact`),給想要「護盾不
   * 影響回收」的卡片用。兩個都是「減免之後」,差別只在護盾。
   */
  basis?: "hpLost" | "mitigated";
  /** 折回比例。1 = 文案的「該傷害量」,不多不少。 */
  pct: number;
}

/**
 * 折回比例的上界。
 *
 * 出貨的瑪那魔杖是 1.0(文案「該傷害量」的字面值)。上界取 2 而不是 1:
 * 1 是**文案**的值,不是**物理**的極限,把上界壓在出貨值上等於宣告「以後
 * 不准調」,而 owner 反覆推翻過自己的數值。2 仍然擋得住量級打錯(把 1 打成
 * 100)。
 */
export const DAMAGE_REFUND_PCT_MAX = 2;

/**
 * `HookDef.chanceFrom.coeff` 的上界 —— 「一點三圍值多少觸發機率」。
 *
 * 出貨的 朗基努斯之槍 是 0.01(「(總敏捷)%」)。0.1 = 一點敏捷 10%,也就是
 * 10 點敏捷就必定觸發 —— 已經是任何設計都不會超過的一端。
 *
 * ⚠️ 這個上界**不能**靠 `min`/`max` 的 clamp 代替,而這正是它存在的理由:
 * clamp 會把打錯的數字**藏起來**。寫 1 而不是 0.01,clamp 之後就是 `max`,
 * 於是一件「機率性」道具變成每一下都觸發,而 diff 裡看起來完全正常。
 */
export const CHANCE_PER_ATTR_MAX = 0.1;

/** rank-1 起算、超出就夾在最後一格 —— 與 `Scaling.perRank` 的鄰居完全一致。 */
function rankColumn(perRank: readonly number[], rank: number): number {
  return perRank[Math.min(Math.max(1, rank), perRank.length) - 1] ?? 0;
}

/**
 * `term` 在這一刻值多少「傷害點數」。
 *
 * 讀不到身體(沒有 `HealthComp` —— 復活圈、掉落的金幣、光環載體)回 0,而不是
 * 丟例外:那些身體本來就沒有條可以讀,而 0 的意思正好是「這一項沒有貢獻」。
 *
 * `points` 模式在 `max <= 0` 時也回 0 —— 分母是 0 的百分比不是無限大,是沒有
 * 意義,而 `NaN` 會一路傳進 `damageQueue` 並在血條上開出一個永遠打不完的洞。
 */
export function resourcePctAmount(
  world: SimWorld,
  caster: EntityId,
  target: EntityId,
  term: ResourcePctTerm,
  rank: number,
): number {
  const id = term.subject === "self" ? caster : target;
  const hp = world.health.get(id);
  if (hp === undefined) return 0;
  const cur = term.resource === "mana" ? hp.mana : hp.hp;
  const max = term.resource === "mana" ? hp.maxMana : hp.maxHp;
  const coeff = rankColumn(term.perRank, rank);
  if (coeff === 0) return 0;
  const amount =
    term.basis === "max" ? max : term.basis === "missing" ? Math.max(0, max - cur) : cur;
  if ((term.scale ?? "ratio") === "ratio") return amount * coeff;
  // points: 百分比**本身**(0~100)乘上係數。
  if (!(max > 0)) return 0;
  return Math.min(1, amount / max) * 100 * coeff;
}

/**
 * `term` 在這一刻值多少「傷害點數」—— 兩個身體的平面距離線性內插。
 *
 * 任何一邊沒有 `TransformComp` 就回 `near`:那是距離 0 的答案,也就是最保守的
 * 一端(對出貨的炎神弩而言是 10 而不是 1000)。回 0 會讓一件「近距離也有
 * 10 點」的武器在資料缺席時整條消失,而回 `far` 會在資料缺席時發最大獎。
 */
export function distanceScaleAmount(
  world: SimWorld,
  caster: EntityId,
  target: EntityId,
  term: DistanceScaleTerm,
): number {
  const a = world.transform.get(caster);
  const b = world.transform.get(target);
  if (a === undefined || b === undefined) return term.near;
  if (!(term.atRange > 0)) return term.far;
  const t = Math.min(1, Math.max(0, dist(a.pos, b.pos) / term.atRange));
  return term.near + (term.far - term.near) * t;
}
