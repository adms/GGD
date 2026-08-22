/**
 * Ability casting + rank-up. Validation order: learned → alive → not stunned →
 * off cooldown → mana → range. Cast is instant in the skeleton (no windup);
 * effects run immediately with resolved targeting.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot, CoreAbilitySlot, CastTarget, Order } from "../intents";
import { Abilities } from "../content/registry";
import { runEffects } from "../effects/effectRunner";
import { fireHooks } from "../effects/hooks";
import { recordAbilityCast } from "../stats/matchStats";
import { queryOverlap } from "../collision/queries";
import { circle } from "../collision/shapes";
// `groundAoeTargets` 的友方那一側用它把施法者自己收回來 —— 刻意用
// `queryOverlap` 內部用的**同一個**身體重疊謂詞，⛔ 不自己寫一份距離比較。
import { circleVsCircle } from "../collision/intersect";
import { normalize, sub, distSq, clampLen, add } from "../math/vec2";
import { isPassiveOnly, syncAbilityPassives } from "./abilityPassives";
import { applyAugmentToEffects, collectAugmentOps } from "./abilityAugment";
import { scopedCooldownReduction } from "../stats/scopedStat";
// ⭐ G17 —— 冷卻流逝速度（`tickCooldowns` 讀它）。
import { Stat } from "../stats/statTypes";
import { applyCooldownFloor } from "../cooldownRules";
import { applyCastTimeRules } from "../castTimeRules";
import { abilityInstanceFor, innateCastBlock } from "./innateActive";
import { berserkCastBlock, berserkCooldownFactor } from "./berserkRules";
import { armRecovery } from "./abilityRecovery";
import { enterToggle, exitToggle, isToggleOn } from "./toggle";
import { breakStealth, canSee } from "../stealth";
// [反向嘲諷] 的「中立那一格」—— `bodiesInCircle` 用它認殭屍。
import { MONSTER_TEAM } from "../mobs";
import {
  armFacingLock,
  facingTicks,
} from "../facingLock";

/**
 * Enemies of `caster` currently standing inside a ground-AoE circle.
 *
 * EXPORTED so the cast-BEGIN membership (here) and the cast-RESOLVE membership
 * (CastResolveSystem, after the wind-up) are computed by the same code. They
 * used to be one snapshot taken at begin and replayed at resolve, so an AoE
 * with a cast time hit whoever stood in the circle when the key was pressed
 * even if they walked out — and missed anyone who walked in.
 */
/**
 * Ability CAST RANGE after the global combat-env `abilityRange` factor
 * (task #136: 原始技能範圍太大 → 系統倍率縮為 60%). The ONE seam every read of an
 * ability's `def.range` passes through, so cast validation, the ground clamp and
 * the tooltip can never disagree. Applied once per read; with the neutral 1.0
 * table it is byte-identical to the pre-#136 sim (determinism preserved).
 */
export function resolveAbilityRange(world: SimWorld, range: number): number {
  return range * world.combatEnv.abilityRange;
}

/** Ability AoE RADIUS after the same `abilityRange` factor (task #136). */
export function resolveAbilityRadius(world: SimWorld, radius: number): number {
  return radius * world.combatEnv.abilityRange;
}

export function enemiesInCircle(
  world: SimWorld,
  caster: EntityId,
  point: { x: number; z: number },
  radius: number,
): EntityId[] {
  const t = world.transform.get(caster);
  if (!t) return [];
  const selfTeam = world.team.get(caster);
  const hits = queryOverlap(world, circle(point, radius), {
    zone: t.zone,
    exclude: new Set([caster]),
    aliveOnly: true,
  });
  return hits.filter((h) => {
    const ht = world.team.get(h);
    if (ht && selfTeam && ht.teamId === selfTeam.teamId) return false;
    // 隱形擋不擋技能 AoE —— a DECISION POINT, and the shipped answer is NO
    // (`blocksAbilityAoe: false`, sim/stealth.ts): in WC3 a Blizzard/Flame
    // Strike does burn an invisible unit standing in it, because invisibility
    // is un-TARGETABILITY, not immunity. So with the shipping config this
    // predicate is a constant `true` and this whole AoE path is byte-identical
    // to before. Flipping the field on turns 永久隱形 into a real "walk through
    // the fight untouched" mechanic, which is a design the owner may want and
    // must not have to redeploy for.
    if (world.stealthRules.blocksAbilityAoe && !canSee(world, caster, h)) return false;
    return true;
  });
}

/** 見 {@link bodiesInCircle}。 */
export interface CircleSideFilter {
  /** 這個圓**拉誰**。省略 = `"enemies"` = {@link enemiesInCircle} 逐位元不變。 */
  side?: "allies" | "enemies";
  /** 只在 `side: "allies"` 有意義：MONSTER 陣營的身體（殭屍）也算一個。 */
  includeNeutrals?: boolean;
}

/**
 * 圓內的**身體**，由 {@link CircleSideFilter} 決定要哪一側 —— [反向嘲諷]
 * （戰鬥力探測器）需要的那一半。
 *
 * ⭐ `side` 不是 `"allies"` 的時候它**就是** {@link enemiesInCircle}（同一支
 * 函式，不是一份抄本）。⛔ 這裡刻意不去改寫 `enemiesInCircle` 本身：那一支被
 * 每一個技能 AoE 走著，而這次要加的是「另一側」，不是「改一側」——
 * 出貨的鍊金術之盾必須逐位元不變，而讓它繼續呼叫同一支函式是唯一結構上保證
 * 這件事的寫法（第二守則失敗形態⑤：被測的不是出貨的那個）。
 *
 * 友軍那一側走**同一個** `queryOverlap`（同一個 zone 閘、同一個 `exclude`、
 * 同一個 `aliveOnly`）與同一道隱形閘。隱形閘對隊友是常數 true（`canSee` 對
 * 同隊直接放行），留著是為了「中立那一格」—— 那一格裝的不是隊友。
 */
export function bodiesInCircle(
  world: SimWorld,
  caster: EntityId,
  point: { x: number; z: number },
  radius: number,
  opts: CircleSideFilter = {},
): EntityId[] {
  if (opts.side !== "allies") return enemiesInCircle(world, caster, point, radius);
  const t = world.transform.get(caster);
  if (!t) return [];
  const selfTeam = world.team.get(caster);
  // 沒有 TeamComp 的施法者沒有「友軍」可言。⛔ 不可以退回「全部都算」——
  // 那會讓一發反向嘲諷把整個圓（含敵人）都拉走。
  if (!selfTeam) return [];
  const hits = queryOverlap(world, circle(point, radius), {
    zone: t.zone,
    exclude: new Set([caster]),
    aliveOnly: true,
  });
  return hits.filter((h) => {
    const ht = world.team.get(h);
    if (!ht) return false;
    if (world.stealthRules.blocksAbilityAoe && !canSee(world, caster, h)) return false;
    if (ht.teamId === selfTeam.teamId) return true;
    return opts.includeNeutrals === true && ht.teamId === MONSTER_TEAM;
  });
}

/**
 * 一發**地面指定** AoE 圈進來的人 —— 唯一一份。
 *
 * ⛔ 這支函式存在的理由不是整潔，是 GH#458：`castType: "ground"` 從**開站起**
 * 就寫死呼叫 `enemiesInCircle`，從來沒有讀過 `def.targetsEnemies`，而隔壁
 * `"targeted"` 分支兩個方向都擋得很仔細。於是 53-03 破法對咒
 *（`godie-o00l.e`，`ground` + `targetsEnemies:false` + 單顆 `shield`）
 * 把魔法護盾**掛到敵人身上**，施法者與隊友一點都拿不到 —— 一支叫「破法」的
 * 技能按下去是幫對面擋魔法，而所有測試全綠。
 *
 * ⚠️ 兩個呼叫端（`castAbility` 的 cast-BEGIN 與 `CastResolveSystem` 吟唱結束時的
 * 重新查詢）必須逐位元同意，否則「有吟唱的」與「沒吟唱的」會分岔，測起來像
 * 隨機故障。它們共用這一支，⛔ 不是各自照抄一次 —— 連 `radius ?? 1` 的預設與
 * `resolveAbilityRadius` 都收在這裡，因為那也是兩邊會分歧的地方。
 *
 * ── 敵方那一側逐位元不變 ────────────────────────────────────────────────
 * `targetsEnemies !== false`（省略 = true，73 支 ground 技能裡的 72 支）直接回
 * {@link enemiesInCircle} 的結果，同一支函式、同一個順序（第二守則失敗形態⑤）。
 *
 * ── 友方那一側為什麼是 {@link bodiesInCircle} ───────────────────────────
 * 同一個 `queryOverlap`、同一個 zone 閘、同一個 `aliveOnly`、同一道隱形閘 ——
 * ⛔ 不在這裡 inline 過濾一份，那會變成第二個住處。
 *
 * ⭐ **中立花不必另外擋**（`"targeted"` 的友方路徑有一行 `world.flower.has(...)`）：
 * 花是 `spawnFlower` 造的，**沒有 TeamComp**（`sim/flowers.ts` 的
 * 「NO TeamComp/nav」），而 `bodiesInCircle` 的友方路徑第一道就是
 * `if (!ht) return false`。⇒ 這裡再寫一次 `world.flower.has` 是一句永遠為假的
 * 條件，而它會假裝自己是一道閘。同理殭屍（MONSTER_TEAM）也進不來，因為這裡不填
 * `includeNeutrals`。
 *
 * ⭐ **施法者自己算在圈內**（只在友方那一側）。`queryOverlap` 的
 * `exclude: new Set([caster])` 是為了「敵方 AoE 不會炸到自己」而存在的；一個
 * 以自己為圓心展開的結界把自己排除在外，就會退化成另一種「說了但不會發生」——
 * 53-03 的 `range` 是 **0**，落點永遠等於施法者腳下，排除他等於這支技能在沒有
 * 隊友貼身時**一個人都罩不到**。收進來的條件是**跟其他人完全同一條**：身體與
 * 圓真的重疊（`circleVsCircle`，即 `queryOverlap` 用的那個謂詞），所以一發丟得
 * 很遠的友方 AoE 不會莫名其妙罩到施法者。
 *
 * 回傳維持 id 遞增（`queryOverlap` 的既有性質），把施法者插回正確位置而不是
 * 接在尾巴 —— 下游的 `maxTargets` 那一刀吃順序。
 */
export function groundAoeTargets(
  world: SimWorld,
  caster: EntityId,
  def: { targetsEnemies?: boolean; radius?: number },
  point: { x: number; z: number },
): EntityId[] {
  const radius = resolveAbilityRadius(world, def.radius ?? 1);
  if (def.targetsEnemies !== false) return enemiesInCircle(world, caster, point, radius);
  const allies = bodiesInCircle(world, caster, point, radius, { side: "allies" });
  const t = world.transform.get(caster);
  if (!t) return allies;
  const self = { kind: "circle" as const, center: t.pos, radius: t.radius };
  if (!circleVsCircle(self, circle(point, radius)).hit) return allies;
  return [...allies, caster].sort((a, b) => a - b);
}

export type CastResult =
  | "ok"
  | "not-learned"
  | "dead"
  | "stunned"
  | "silenced"
  | "cooldown"
  | "no-mana"
  | "out-of-range"
  | "bad-target"
  /** the ability is a PERMANENT passive (WC3 Cool=0) — there is nothing to cast */
  | "passive"
  /**
   * 暴走系主動技的生命門檻沒到 —— 「你還沒虛弱到需要把方向盤交出去」
   * (owner 2026-08-03:EX 完全暴走 HP ≤ 15% 才放得出來)。
   *
   * 它是一個**獨立的**理由而不是 `bad-target`,因為玩家能做的事完全不同:
   * bad-target 是「換一個目標」,這一條是「等你被打到剩 15% 再按」。
   * 門檻本身是欄位(`world.berserkRules.castHpPct`),見 `abilities/berserkRules.ts`。
   *
   * ⚠️ 客戶端 `apps/client/src/ui/castFeedback.ts` 的 `CastRejectReason` 是一份
   * **本地**聯集(刻意的,見那個檔的註解),所以這一個新成員在舊客戶端上會退回
   * 通用句「現在無法施放」而不是型別錯誤。要那句專屬文案,見回報的 needsOthers。
   */
  | "hp-too-high"
  /**
   * still committed to the RECOVERY of a previous ability that WHIFFED
   * (abilityRecovery.ts). Distinct from "cooldown" on purpose: the HUD should
   * be able to say "you missed and you're still recovering", which is the whole
   * feedback loop that teaches the hit-cancel rule.
   */
  | "recovery"
  /**
   * ⭐ owner 2026-08-22:「超過施法距離人物不會走過去放技能（做成後台開關）」。
   *
   * 目標在射程外,而 `config.cast-approach@1` 開著 ⇒ **這不是一次失敗的施放**,
   * 是一道接近指令:身體開始走,走進射程的那一 tick `castApproachSystem` 自動
   * 再放一次。魔力與冷卻在**那一刻**才付,這裡一格都不動。
   *
   * ⛔ 它刻意**不是** `"ok"`:`"ok"` 的意思是「效果跑了、成本付了」,而這裡
   * 兩件事都還沒發生。也刻意不是 `"out-of-range"`:那個字是「這一次按鍵沒有用」,
   * 而這一次按鍵**有**用。
   *
   * ⚠️ `CommandSystem` 對任何非 `"ok"` 都會發 `castRejected` —— 對這一個成員
   * 那是**誤報**(HUD 會閃「現在無法施放」)。客戶端 `ui/castFeedback.ts` 的
   * `CastRejectReason` 是一份**本地**聯集(刻意的),所以舊客戶端只會退回通用句,
   * ⛔ 不會型別錯誤。要那句專屬文案 / 要 CommandSystem 改成不發,見回報的
   * needsOthers —— 那兩個檔在這一條 lane 的柵欄外。
   */
  | "approaching";

/**
 * `castAbility` 的可選旗標。目前只有一格,獨立成型別是為了讓下一個「只有內部
 * 呼叫端要的行為」不必再加第六個位置參數。
 */
export interface CastOptions {
  /**
   * 距離不足時可不可以改發**接近指令**（出貨 true）。
   *
   * ⛔ `castApproachSystem` 走進射程後再呼叫這一支時**一定要傳 false**:
   * 不然那一次「還差一點點」的浮點邊界會重新武裝一次接近,而那是一個**無限
   * 迴圈**(每 tick 重新武裝、每 tick 重新檢查)。
   */
  allowApproach?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 走過去放技能 (`config.cast-approach@1`, owner 2026-08-22)
// ─────────────────────────────────────────────────────────────────────────────

/** {@link zConfigCastApproachDoc} 解析後的樣子（語意寫在那份 schema 上）。 */
export interface CastApproachRules {
  /** 距離不足時要不要走過去。false = 2026-08-22 之前的行為（原地拒絕）。 */
  enabled: boolean;
  /** 走多遠就放棄（GGD 單位，從按鍵那一格量起），同時是一道事前閘。 */
  maxApproachDistance: number;
  /** 途中有別人接管移動通道時要不要放棄。 */
  cancelOnNewOrder: boolean;
}

/**
 * 出貨值。⚠️ 它與 `content/config/cast-approach.json` **逐字相同**是一條
 * drift 測試在守的事(第一守則的三個住處),⛔ 不是巧合。
 */
export const DEFAULT_CAST_APPROACH: CastApproachRules = {
  enabled: true,
  maxApproachDistance: 24,
  cancelOnNewOrder: true,
};

/**
 * 這一場比賽的接近規則。
 *
 * ⚠️ `world.castApproach` 這個欄位**還不存在** —— `SimWorld` 與 content loader
 * 都在這一條 lane 的柵欄外(見回報的 needsOthers)。所以這裡讀的是一個
 * **選擇性**欄位:主 session 接上去的那一天,這一行不必改一個字就開始讀真的
 * 文件;在那之前每一場都拿到出貨值。
 *
 * ⛔ 缺格時回**出貨表**而不是空表,理由與 `autoEngageRules` 逐字相同:空表的
 * `enabled` 是 undefined,而 `if (!rules.enabled)` 會讓整條機制靜默消失。
 */
export function castApproachRules(world: SimWorld): CastApproachRules {
  return (
    (world as SimWorld & { readonly castApproach?: CastApproachRules }).castApproach ??
    DEFAULT_CAST_APPROACH
  );
}

/** 一份 `config.cast-approach@1` 文件 → 規則表。缺格逐欄退回出貨值。 */
export function castApproachRulesFromDoc(doc: unknown): CastApproachRules {
  const d = (doc ?? {}) as Partial<CastApproachRules>;
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_CAST_APPROACH.enabled,
    maxApproachDistance:
      typeof d.maxApproachDistance === "number" && Number.isFinite(d.maxApproachDistance)
        ? d.maxApproachDistance
        : DEFAULT_CAST_APPROACH.maxApproachDistance,
    cancelOnNewOrder:
      typeof d.cancelOnNewOrder === "boolean"
        ? d.cancelOnNewOrder
        : DEFAULT_CAST_APPROACH.cancelOnNewOrder,
  };
}

/** 一次還沒放出去的施法：走到射程內就放。 */
interface CastApproach {
  slot: CastableSlot;
  targetId: EntityId;
  /** 按鍵那一格的施法者座標 —— `maxApproachDistance` 從這裡量起。 */
  from: { x: number; z: number };
  /**
   * 我們寫進 `nav.moveTarget` 的**那一個物件**。
   *
   * ⭐ 它是一枚**身分權杖**,不只是一個座標:`OrderSystem` 每次套用一條新指令
   * (玩家的走位、追擊、「卡住就接敵」)都會寫一個**新的**物件進去。所以
   * `nav.moveTarget !== ours` 就是「移動通道被別人接管了」——
   * ⛔ 不必去比對座標值(目標會動,值本來就每 tick 都不一樣)。
   */
  token: { x: number; z: number };
  /** 同上，`nav.order` 的那一枚。 */
  orderToken: Order;
}

/**
 * 每一個世界自己的待辦接近。
 *
 * ⚠️ **它應該住在 `SimWorld` 上**(和 `walkStall` / `autoEngaging` /
 * `suspendedOrder` 同一排),⛔ 這裡是 lane 柵欄的產物 —— `SimWorld.ts` 在
 * 柵欄外。主 session 接線時請把它搬過去(見回報的 needsOthers)。
 *
 * 在那之前它是安全的:key 是世界本身(WeakMap,世界被回收就一起走),而下面
 * 每一條路徑都會在施法者/目標消失時自己清掉,所以它不會單調長大。
 * 客戶端的預測影子(`LocalPrediction`)從不跑 `commandSystem`,所以它的那一格
 * 永遠是空的 ⇒ `castApproachSystem` 對它是嚴格 no-op。
 */
const CAST_APPROACHES = new WeakMap<SimWorld, Map<EntityId, CastApproach>>();

function approachesOf(world: SimWorld): Map<EntityId, CastApproach> {
  let m = CAST_APPROACHES.get(world);
  if (!m) {
    m = new Map<EntityId, CastApproach>();
    CAST_APPROACHES.set(world, m);
  }
  return m;
}

/** 這個單位現在有沒有在「走過去放技能」（測試與 HUD 用）。 */
export function pendingCastApproach(
  world: SimWorld,
  id: EntityId,
): { slot: CastableSlot; targetId: EntityId } | undefined {
  const p = CAST_APPROACHES.get(world)?.get(id);
  return p ? { slot: p.slot, targetId: p.targetId } : undefined;
}

/**
 * 把移動通道還回去 —— 但**只有在它還是我們的**時候。
 *
 * ⛔ 別人已經接管的時候一個字都不能碰:那一條走位是玩家剛下的,清掉它就是
 * 「按了一個放不到的技能,結果連走都不走了」。
 */
function releaseApproachChannel(world: SimWorld, id: EntityId, p: CastApproach): void {
  const nav = world.nav.get(id);
  if (!nav) return;
  if (nav.moveTarget === p.token) nav.moveTarget = null;
  if (nav.order === p.orderToken) nav.order = null;
}

/**
 * 武裝一次接近。回 false = 這一次按鍵仍然是 `"out-of-range"`（舊行為）。
 *
 * ⭐ **事前閘**:走不到的距離在按下去的當下就回絕,⛔ 不會先跑
 * `maxApproachDistance` 再無聲停住 —— 那種「跑到一半自己停下來」比一個沒反應
 * 的按鈕更難懂,而且它會把玩家送進敵方隊伍中間。
 */
function armCastApproach(
  world: SimWorld,
  caster: EntityId,
  slot: CastableSlot,
  targetId: EntityId,
  t: { pos: { x: number; z: number } },
  tgt: { pos: { x: number; z: number } },
  range: number,
): boolean {
  const rules = castApproachRules(world);
  if (!rules.enabled) return false;
  const nav = world.nav.get(caster);
  if (!nav) return false; // 沒有移動通道的東西(塔/花/投射物)走不過去
  const reachable = range + rules.maxApproachDistance;
  if (distSq(t.pos, tgt.pos) > reachable * reachable) return false;
  const token = { x: tgt.pos.x, z: tgt.pos.z };
  const orderToken: Order = { kind: "move", point: token };
  // ⭐ `nav.order` 也要寫,⛔ 不是只寫 `moveTarget`:`OrderSystem` 的追擊迴圈
  // 靠 `nav.order?.kind === "move" && moveTarget !== null` 決定要不要讓路
  // (#274 的走位權)。少了這一行,一個已經自動索敵的英雄會在下一 tick 就被
  // 追擊把 `moveTarget` 改寫回攻擊距離,而接近永遠到不了比攻擊距離短的射程。
  nav.order = orderToken;
  nav.moveTarget = token;
  approachesOf(world).set(caster, {
    slot,
    targetId,
    from: { x: t.pos.x, z: t.pos.z },
    token,
    orderToken,
  });
  return true;
}

/**
 * 推進每一次待辦的接近 —— **走進射程就放**。
 *
 * 由 `MovementSystem` 在身體積分完的那一刻呼叫(⇒ 讀到的是這一 tick 的**新**
 * 座標)。排在 movement 之前的話,「到了沒」問的是上一 tick 的位置,每一次接近
 * 都會晚一個 tick 施放,而畫面上完全看不出來。
 *
 * 決定性:按 entity id 排序走訪(⛔ 不吃 Map 的插入序,`sim/purity` 的規矩)。
 */
export function castApproachSystem(world: SimWorld): void {
  const pending = CAST_APPROACHES.get(world);
  if (!pending || pending.size === 0) return; // 影子世界與 99% 的 tick 走這一行
  const rules = castApproachRules(world);
  const ids = [...pending.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const p = pending.get(id);
    if (!p) continue;
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const nav = world.nav.get(id);
    // 施法者不見了/死了 ⇒ 丟掉。⛔ 不去還移動通道:身體都沒了。
    if (!t || !nav || !hp?.alive) {
      pending.delete(id);
      continue;
    }
    const tgt = world.transform.get(p.targetId);
    const tgtHp = world.health.get(p.targetId);
    // 目標死了 / 消失 / 換了區域 ⇒ 放棄,並把移動通道還回去(否則角色會一路
    // 走向一具已經不存在的屍體)。
    if (!tgt || !tgtHp?.alive || tgt.zone !== t.zone) {
      releaseApproachChannel(world, id, p);
      pending.delete(id);
      continue;
    }
    // 移動通道被別人接管了(玩家的新指令 / 追擊 / 卡住就接敵)。
    // ⭐ `cancelOnNewOrder` 出貨 true = 交還方向盤,與 `respectLiveSteering`
    // 同一個哲學。false 的那一邊**重新宣告**自己的目的地。
    if (nav.moveTarget !== p.token) {
      if (rules.cancelOnNewOrder) {
        pending.delete(id); // ⛔ 不碰 nav:那條走位已經是別人的了
        continue;
      }
    }
    // 走太遠了 ⇒ 放棄。量的是「從按鍵那一格走了多遠」,⛔ 不是「離目標多遠」——
    // owner 的字面意思是「走多遠就放棄」。
    const max = rules.maxApproachDistance;
    if (distSq(t.pos, p.from) > max * max) {
      releaseApproachChannel(world, id, p);
      pending.delete(id);
      continue;
    }
    // 這一格技能還在不在(被重置/換形態/沒學了)?
    const ab = world.abilities.get(id);
    const inst = ab ? abilityInstanceFor(ab, p.slot) : undefined;
    if (!inst || inst.rank <= 0) {
      releaseApproachChannel(world, id, p);
      pending.delete(id);
      continue;
    }
    // ⭐ 射程走的是**同一個** `resolveAbilityRange` seam —— 抄一份距離比較在
    // 這裡,就是讓「接近停下來」與「castAbility 放行」有兩個答案,而它們遲早
    // 會差一個 ε:角色停在射程邊緣,每 tick 被拒絕一次,永遠放不出來。
    const range = resolveAbilityRange(world, Abilities.get(inst.abilityId).range);
    if (distSq(t.pos, tgt.pos) <= range * range) {
      // 先還移動通道再施放:施放本身可能會寫 nav(位移類技能),順序反了會把
      // 它剛寫好的衝刺目的地清掉。
      releaseApproachChannel(world, id, p);
      pending.delete(id);
      const res = castAbility(
        world,
        id,
        p.slot,
        { type: "entity", entityId: p.targetId },
        { allowApproach: false }, // ⛔ 見 CastOptions:再武裝一次就是無限迴圈
      );
      // 走到了才發現魔力被花掉/被沉默了 —— 那一次按鍵**現在**才收到答案,
      // 而它欠玩家一個理由(`CommandSystem` 對即時失敗做的是同一件事)。
      if (res !== "ok") world.emit("castRejected", { entity: id, slot: p.slot, reason: res });
      continue;
    }
    // 還在路上:每 tick 重新指向目標(它會跑)。⭐ 換一個**新物件**,權杖跟著換 ——
    // 這樣「別人接管」與「我們自己重指」永遠分得開。
    const token = { x: tgt.pos.x, z: tgt.pos.z };
    const orderToken: Order = { kind: "move", point: token };
    nav.order = orderToken;
    nav.moveTarget = token;
    p.token = token;
    p.orderToken = orderToken;
  }
}

export function castAbility(
  world: SimWorld,
  caster: EntityId,
  slot: CastableSlot,
  target: CastTarget,
  opts: CastOptions = {},
): CastResult {
  const allowApproach = opts.allowApproach !== false;
  const ab = world.abilities.get(caster);
  const t = world.transform.get(caster);
  const hp = world.health.get(caster);
  const sc = world.stats.get(caster);
  if (!ab || !t || !hp || !sc) return "bad-target";

  // Q/W/E/R live in the record, EX in `exSlot`, the level-1 天生技 in
  // `passiveSlot` — `abilityInstanceFor` is the ONE resolver (innateActive.ts).
  // A missing instance (hero has no EX / no NN-00) or a locked EX (rank 0,
  // pre-unlock) both read as "not-learned". The innate spawns at rank 1, so for
  // it this gate only ever fires on the 3 heroes that genuinely have none.
  const inst = abilityInstanceFor(ab, slot);
  if (!inst || inst.rank <= 0) return "not-learned";
  if (!hp.alive) return "dead";

  // `def` is resolved HERE — one line earlier than it used to be — because the
  // 【切換】OFF branch below needs it, and re-reading the registry a second time
  // would be a second place for the two reads to disagree.
  const def = Abilities.get(inst.abilityId);

  // ── 【切換】第二次按下 = 關閉 (sim/abilities/toggle.ts) ──────────────────
  //
  // 位置是刻意的：**在冷卻 / 沉默 / 魔力 / 射程每一道閘之前**。
  // 20-01 風王結界的冷卻是 60 秒，開一次就轉滿 —— 把關閉排在冷卻閘之後，
  // 玩家開了以後那 60 秒**關不掉**，等於方向盤被拿走，而「關閉時放風王鐵槌」
  // 也就變成一個由冷卻決定何時發生的東西。
  //
  // ⛔ 這裡**不可以**自己跑 onExit：`exitToggle` 是全專案唯一的關閉出口，
  // 手動與 MP 不足自動關閉共用它（計畫 §13）。這一段只是「按鈕被按了」。
  if (def.toggle && isToggleOn(ab, slot)) {
    exitToggle(world, caster, slot, "manual");
    return "ok";
  }

  const st = world.status.get(caster);
  if (st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick)) return "stunned";
  // 【沉默】C1（#278）。⛔ 位置是刻意的：**在扣魔力與進冷卻之前**。
  // 放到後面的話按 Q 會「沒放出來但魔力沒了、冷卻也轉了」—— 那比不能施法更糟，
  // 而且畫面上只看得到一個沒反應的按鈕（`c1c2.test.ts` 的第二條在釘這個）。
  if (st?.effects.some((e) => e.silenced && e.expiresAtTick > world.tick)) return "silenced";
  // Combat-juice: a knocked-down (prone) caster is hard-CC'd like a stun.
  if ((world.knockdown.get(caster) ?? 0) > 0) return "stunned";
  // already mid-cast (another ability's cast time) — animation-locked
  if (ab.cast) return "cooldown";
  if (inst.cooldownRemainingTicks > 0) return "cooldown";

  // The SIXTH slot is castable only for `innateKind: "active"` — the ~60 real
  // WC3 D-slot innates. A permanent 天生技 (迴避/靈氣/on-hit proc) answers
  // "passive", keyed on the AUTHORED KIND so it holds even if a mis-authored
  // doc grew a stray effect (innateActive.ts DECISION 4).
  const innateBlock = innateCastBlock(def);
  if (innateBlock) return innateBlock;
  // A passive-only ability (native Cool=0, no castable effects) can never be
  // activated. Reject BEFORE any cost is paid — the old shape charged mana and
  // a fabricated cooldown for a button WC3 does not even let you press.
  if (isPassiveOnly(def)) return "passive";
  // 暴走系主動技的生命門檻 (owner 2026-08-03:EX 完全暴走 HP ≤ 15%).
  //
  // 位置是**所有付出成本之前**,和 `isPassiveOnly` 同一段:被這條擋下來的一次
  // 按鍵,魔力一點都不扣、冷卻一格都不轉。寫在效果裡的話按鈕會照樣吃掉 120 秒
  // 冷卻然後什麼都不發生(失敗形態 ②)。
  //
  // 判定的是「這支技能會不會給暴走」而不是英雄 id,所以下一支暴走技自動繼承
  // 同一條規則 —— 見 abilities/berserkRules.ts。
  const berserkBlock = berserkCastBlock(world, def, caster);
  if (berserkBlock) return berserkBlock;
  const mana = def.manaCost[inst.rank - 1] ?? 0;
  if (hp.mana < mana) return "no-mana";

  // Still committed to the RECOVERY of a previous ability that WHIFFED. A
  // landed hit would already have cleared this on the tick it connected, so
  // reaching here means the last ability missed — this is the punish window
  // (abilities/abilityRecovery.ts).
  //
  // ORDER: every check above is a pure predicate that pays no cost, so their
  // relative order is purely a question of WHICH REASON IS REPORTED, never of
  // what is allowed. Recovery is placed LAST on purpose: when the button is
  // also on cooldown or you also lack the mana, those are the older, longer and
  // more actionable answers, and "recovery" would just be a confusing new name
  // for the same dead button. The case recovery exists to govern is a COMBO —
  // a DIFFERENT ability, off cooldown, mana in hand, right after the first one
  // — and that case reaches exactly this line.
  if ((ab.recovery?.ticksLeft ?? 0) > 0) return "recovery";

  // ---- resolve targeting ----
  let targets: EntityId[] = [];
  let point: { x: number; z: number } | undefined;
  let direction: { x: number; z: number } | undefined;
  const selfTeam = world.team.get(caster);

  switch (def.castType) {
    case "self":
      targets = [caster];
      break;
    case "targeted": {
      if (target.type !== "entity") return "bad-target";
      const tgt = world.transform.get(target.entityId);
      const tgtHp = world.health.get(target.entityId);
      if (!tgt || !tgtHp?.alive || tgt.zone !== t.zone) return "bad-target";
      if (def.targetsEnemies !== false) {
        const tgtTeam = world.team.get(target.entityId);
        if (tgtTeam && selfTeam && tgtTeam.teamId === selfTeam.teamId) return "bad-target";
      } else {
        // ally-targeted abilities (heals/restores/buffs) can never target a
        // neutral flower — nor an ENEMY. `targetsEnemies: false` used to only
        // *skip* the same-team check, so every ported WC3 「目標 friend」 spell
        // (6 docs, all heals) could be aimed at the enemy team and would happily
        // heal them. The WC3 target flags are exclusive; so is this.
        if (world.flower.has(target.entityId)) return "bad-target";
        const tgtTeam = world.team.get(target.entityId);
        if (tgtTeam && selfTeam && tgtTeam.teamId !== selfTeam.teamId) return "bad-target";
      }
      // combat-env `abilityRange` (task #136) shrinks the effective cast range
      const range = resolveAbilityRange(world, def.range);
      if (distSq(t.pos, tgt.pos) > range * range) {
        // ⭐ owner 2026-08-22:「超過施法距離人物不會走過去放技能（做成後台開關）」
        // 距離不足**不是拒絕**,是一道接近指令(見 armCastApproach)。到不了 /
        // 開關關著 → 才是舊行為的 `"out-of-range"`。
        //
        // ⚠️ 位置是刻意的:**在付出任何成本之前**,和其他每一道閘同一段。
        // 接近期間魔力一點都不扣、冷卻一格都不轉 —— 成本在真的施放的那一 tick
        // 才付,由 castApproachSystem 再走一次這整條驗證階梯。
        return allowApproach && armCastApproach(world, caster, slot, target.entityId, t, tgt, range)
          ? "approaching"
          : "out-of-range";
      }
      targets = [target.entityId];
      point = { x: tgt.pos.x, z: tgt.pos.z };
      direction = normalize(sub(tgt.pos, t.pos));
      break;
    }
    case "skillshot": {
      if (target.type === "dir") direction = normalize(target.dir);
      else if (target.type === "point") direction = normalize(sub(target.point, t.pos));
      else return "bad-target";
      if (direction.x === 0 && direction.z === 0) return "bad-target";
      break;
    }
    case "ground": {
      if (target.type !== "point") return "bad-target";
      // clamp the point to range instead of rejecting (LoL behavior).
      // combat-env `abilityRange` (task #136) shrinks both the reach and the AoE.
      const off = clampLen(sub(target.point, t.pos), resolveAbilityRange(world, def.range));
      point = add(t.pos, off);
      // task #264: 地面指定技能過去**從來沒有**算出 `direction`，所以下面那行
      // `if (direction) t.facing = direction` 對它整組是死的 —— 94 支 ground 技能
      // (含喪標麥可 Q/E/R 三支) 施法時身體完全不轉，可以背對著地面 AoE 放。
      // 方向就是「自己 → 落點」，落點與自己重合時退化為 0 向量，由 armFacingLock
      // 自行忽略（原地放的 AoE 沒有有意義的朝向）。
      direction = normalize(sub(point, t.pos));
      // ground AoE: 圈裡的**哪一側**由 `def.targetsEnemies` 決定（GH#458 之前
      // 這一行寫死敵方，所以 `targetsEnemies:false` 的地面技把增益送給對面）。
      // With a cast time this set is RE-QUERIED when the wind-up elapses
      // (CastResolveSystem) — 走的是同一支 `groundAoeTargets`。
      targets = groundAoeTargets(world, caster, def, point);
      break;
    }
    case "dash": {
      if (target.type === "point") direction = normalize(sub(target.point, t.pos));
      else if (target.type === "dir") direction = normalize(target.dir);
      else return "bad-target";
      if (direction.x === 0 && direction.z === 0) return "bad-target";
      break;
    }
  }

  // ---- pay costs (mana + cooldown paid up-front, at cast-begin) ----
  hp.mana -= mana;
  // ⭐ G9 —— 冷卻縮減是**站在這一格技能的角度**問的，不是面板上那一個數字。
  //
  // 「[瞬步] 冷卻縮短 50% 持續 8 秒」在這一行出現之前寫不出來：全域
  // `Stat.CooldownReduction` 會把六格一起縮短，而一次性的 `modifyCooldown`
  // 只削得掉「現在轉著的那一圈」，接不住「持續 8 秒」。
  //
  // ⚠️ 沒有任何範圍限定加成時 `scopedCooldownReduction` 回的**就是**
  // `sc.final[cdr]` 逐位元（見 scopedStat.ts 的提前回傳），所以既有錄影不變。
  // ⛔ 不要改回讀 `sc.final` —— 帶 scope 的 modifier 刻意不在裡面
  //（`statPipeline.ts` 那一行），改回去等於這個功能整條消失而全綠。
  const cdr = scopedCooldownReduction(world, caster, slot, inst.abilityId);
  // world.combatEnv.cooldown: global env factor on the cooldown SECONDS (2.0 =
  // twice as long). One seam covers Q/W/E/R and the EX slot alike.
  //
  // 暴走中的冷卻倍率 (owner 2026-08-03:「冷卻時間 ×2」) 乘在**同一個seam**上,
  // 理由和 `combatEnv.cooldown` 完全相同:分開一條路線就會有一半的技能忘記
  // 套用。不是暴走中 → 回 1,所以每一份既有錄影逐位元不變。
  //
  // ⚠️ 讀的是**開始施放的那一刻**的狀態,所以 EX 自己的 120 秒不會被自己剛掛上
  // 的暴走加倍(效果在付完成本之後才跑),而暴走**之前**就已經在轉的冷卻也不會
  // 被追溯加倍 —— 那會讓玩家看到冷卻進度條倒退。
  //
  // ⬇⬇ 秒數地板是**最後**一步（owner 2026-08-10：「要卡最低秒數 0.1 秒」）。
  //    比率天花板（`config.stat-caps@1` 的 cdr，現在 0.99）管的是長技能；
  //    地板管的是短技能 —— 一支 1 秒的技能在 99% 減免下是 0.01 秒，也就是
  //    每個 tick 都放得出來，而那個天花板再怎麼調都擋不住它。
  //    ⛔ 放在乘法中間會讓「全域冷卻 ×2」把已經觸底的技能推回地板之上，
  //    讀起來像 bug。`applyCooldownFloor` 是唯一知道地板怎麼作用的地方。
  const cdSecs = applyCooldownFloor(
    world.cooldownRules,
    (def.cooldown[inst.rank - 1] ?? 0) *
      (1 - cdr) *
      world.combatEnv.cooldown *
      berserkCooldownFactor(world, caster),
  );
  inst.cooldownRemainingTicks = Math.round(cdSecs / world.dt);

  // ── 【切換】打開 ───────────────────────────────────────────────────────
  //
  // 位置是刻意的：**就在成本付完的下一行**，而不是在效果跑完之後。理由是
  // 「玩家已經付了錢」—— 施法被打斷（`interruptOn: "damage"`）時效果不會跑，
  // 但那 50~200 點魔力已經扣掉了，這時候如果按鈕還是關的，他就是純虧。
  // 出貨的兩支切換技 `castTimeSec` 都是 0，所以今天兩者是同一 tick；
  // 這一行是替第一支「有吟唱的切換技」先把答案定下來。
  //
  // ⛔ 這裡沒有「已經開著就關閉」的分支 —— 那一段在函式最上方（冷卻閘之前），
  // 而且它走的是 `exitToggle`，全專案唯一的關閉出口。
  if (def.toggle) enterToggle(world, caster, slot, def);

  // ---- 面向：commit 瞄準方向 (task #264) ----
  // 過去這裡只是 `t.facing = direction`，而 MovementSystem 在同一 tick 稍後
  // (step slot 5 vs 這裡的 slot 3) 會無條件把 facing 轉回移動方向 —— 搖桿/觸控
  // 每一幀都合成一筆 move 訂單，所以走位中施法的轉身存活 0 tick。改用面向鎖：
  // 一樣立刻寫 facing，但同時宣告「接下來這幾 tick 移動方向不得覆蓋」。
  // 鎖的長度 = 吟唱時間，瞬發技至少 facing.instantCastTicks（沒有吟唱可以撐住
  // 面向，只給收招餘韻的話玩家看不到轉身），再加上收招餘韻。
  // ⭐ 吟唱三格（倍率/下限/上限）在這裡套用 —— 這是**唯一**的座標，
  //    所以後台改了下一場就生效，⛔ 不必重跑 content:build。
  //    ⚠️ 0 = 瞬發技，它**不吃地板**（地板管的是「有吟唱的技能最短多長」，
  //    不是「把每一支瞬發技都變成 0.06 秒」—— 那會讓全部技能都變鈍）。
  const castSec =
    (def.castTimeSec ?? 0) > 0 ? applyCastTimeRules(world.castTimeRules, def.castTimeSec!) : 0;
  const castTicksForAim = Math.round(castSec / world.dt);
  const fTicks = facingTicks(world); // 後台可調 (config.combat-feel@1 → facing)
  if (direction) {
    armFacingLock(
      world,
      caster,
      direction,
      Math.max(castTicksForAim, fTicks.instantCastTicks) + fTicks.followThroughTicks,
    );
  }

  recordAbilityCast(world, caster); // scoreboard: one successful cast (Q/W/E/R/EX/天生技)
  // `vfxKey` (fx.prim.<element>.<shape>) rides along so the client's per-frame
  // audio mapper can play the ELEMENT whoosh (fire/ice/lightning) for the cast
  // without loading any ability data of its own (audio COMBAT-AUDIO routing).
  // `sfxKey` is the same contract one step more specific: the WC3 source map's
  // own per-ability cast sound (content `ability@1.sfxKey`), which the mapper
  // plays INSTEAD of the element/generic voice. Rides `abilityCast` and not
  // `castBegin` on purpose — castBegin only fires when castTimeSec > 0, so an
  // instant cast (e.g. godie-o00k.passive 裝可愛) would never sound there.
  // 破隱 (sim/stealth.ts). Placed at the SINGLE point where a cast is
  // committed — past every rejection (`not-learned`/`cooldown`/`no-mana`/
  // `out-of-range`/`recovery`), and BEFORE the ct>0 / ct==0 fork, so a channelled
  // cast and an instant cast reveal on the same tick. Putting it in either
  // branch would have made half the roster's casts silent.
  breakStealth(world, caster, "cast");

  world.emit("abilityCast", {
    caster,
    slot,
    abilityId: inst.abilityId,
    point,
    direction,
    vfxKey: def.vfxKey,
    sfxKey: def.sfxKey,
  });

  // ---- cast time: defer effects to CastResolveSystem when ct > 0 ----
  // ⚠️ 用上面那個**已經套過三格規則**的 `castSec`，⛔ 不要再讀一次 `def.castTimeSec`。
  //    這裡曾經是第二個獨立換算點 —— 兩處只改一處的話，瞄準鎖用新值、實際吟唱用舊值。
  const ctTicks = Math.round(castSec / world.dt);
  if (ctTicks > 0) {
    ab.cast = {
      slot,
      abilityId: inst.abilityId,
      rank: inst.rank,
      ticksLeft: ctTicks,
      targets,
      point,
      direction,
      rooted: def.rootWhileCasting !== false,
      // Baseline for `interruptOn: "damage"` (CastResolveSystem). Written
      // unconditionally — see `CastState.hpAtStart`.
      hpAtStart: hp.hp,
    };
    // stop any in-progress auto — the cast animation-locks the caster
    ab.windup = null;
    world.emit("castBegin", {
      caster,
      slot,
      abilityId: inst.abilityId,
      ticks: ctTicks,
      // ⭐ 送**套用後**的秒數：客戶端拿它畫吟唱條與向天光束預告（#233）。
      //    ⛔ 送 def.castTimeSec 的話後台調了倍率，畫面長度與 sim 就會對不上
      //    —— 而那是「兩邊都不報錯，只有玩家看得出來」的那種缺陷。
      castTimeSec: castSec,
    });
    return "ok";
  }

  // ---- instant cast (ct = 0): run effects immediately ----
  // A ground-targeted AoE detonates at its point THIS tick (a cast time defers
  // the blast to CastResolveSystem instead). One discrete `explosion` cue per
  // cast, at the point — the client's AoE/爆裂 sound (audio COMBAT-AUDIO).
  if (def.castType === "ground" && point) {
    world.emit("explosion", { caster, abilityId: inst.abilityId, x: point.x, z: point.z });
  }
  // ⭐ G6-1 —— 【跨技能強化】的**主動施放**那一面（70-002「追加 500% [AP]」·
  // 92-002）。在這一行出現之前，強化只打得到被動區塊的 hook，所以一張明說
  // 「讓某支主動技變強」的 EX 卡片放出來跟沒放一模一樣（失敗形態②），而
  // `abilityAugment.ts` 的檔頭自己把這件事記成已知的債。
  //
  // ⛔ 這一行拿掉，整個 G6 就只剩被動那一半 —— 而且**不會有任何測試紅**，
  // 除非那條測試讀的是「打出去的傷害」而不是「schema 收不收得下」。
  // ⚠️ 有吟唱的技能走的是 `systems/CastResolveSystem.ts`，那裡有同一行。
  const augmentedEffects = applyAugmentToEffects(
    def.effects,
    collectAugmentOps(world, caster, inst.abilityId),
  );
  runEffects(augmentedEffects, {
    world,
    caster,
    rank: inst.rank,
    targets,
    point,
    direction,
    origin: `ability:${inst.abilityId}`,
    abilitySlot: slot,
    rng: world.rng,
  });

  fireHooks(world, caster, "onAbilityCast", targets[0], slot);
  for (const hitId of targets) {
    if (hitId !== caster) fireHooks(world, caster, "onAbilityHit", hitId, slot);
    // GH#354 —— 事件流上的「技能命中」。⚠️ 它**只**餵 `onUltimateHit`
    // （WorldHookSystem 用 slot 切片），⛔ 不是 `onAbilityHit` 的第二條路：
    // 那一支就在上面一行直接發，兩條路會讓同一張卡響兩次。
    if (hitId !== caster) world.emit("abilityHit", { caster: caster, target: hitId, slot: slot });
  }
  // RECOVERY starts at the END of startup. For an instant cast startup is zero
  // ticks long, so "end of startup" IS this moment. Effects above only QUEUED
  // their damage (combatResolveSystem drains it at step 8 of this same tick), so
  // the hit-cancel still lands on the same tick if it connects.
  armRecovery(world, caster, slot, def, targets);
  return "ok";
}

/**
 * Spend a point on Q/W/E/R. The parameter is `CoreAbilitySlot`, which is the
 * whole guard for the two non-rankable slots: EX is UNLOCKED (`learnEx`) and the
 * sixth slot's 天生技 is OWNED at rank 1 for life. Neither is expressible here,
 * so neither needs a runtime rejection.
 */
export function rankUpAbility(world: SimWorld, id: EntityId, slot: CoreAbilitySlot): boolean {
  const ab = world.abilities.get(id);
  const champ = world.champion.get(id);
  if (!ab || !champ || ab.unspentPoints <= 0) return false;
  const inst = ab.slots[slot];
  const def = Abilities.get(inst.abilityId);
  if (inst.rank >= def.maxRank) return false;
  // R gated to champion levels 6/11/16 — unless the host lifted the gate
  // (arena rules: R learnable from a configured round, world.ultGateOverride)
  if (slot === "R" && !world.ultGateOverride) {
    const gate = [6, 11, 16][inst.rank] ?? 99;
    if (champ.level < gate) return false;
  }
  inst.rank++;
  ab.unspentPoints--;
  // a permanent passive's columns are per LEVEL — re-attach at the new rank
  syncAbilityPassives(world, id);
  world.emit("rankUp", { id, slot, rank: inst.rank });
  return true;
}

/**
 * ⭐ G17（GH#354）—— 這一 tick 要扣掉幾格冷卻。
 *
 * `rate` 是「流逝速度」（1 = 今天）。回傳一定是**非負整數**，因為
 * `cooldownRemainingTicks` 進 snapshot、也被冷卻圈讀 —— 把它改成小數等於讓每一格
 * 冷卻圈多一個看不見的尾數，而那個尾數會出現在 UI 的取整邊界上。
 *
 * ⭐ 用 **Bresenham** 而不是「累積器」：`floor((t+1)×r) - floor(t×r)`
 * 只讀 `world.tick` 與 `rate`，所以
 *   ① **零新狀態** —— 不必為每一格技能存一個小數餘額（那會進 snapshot、進錄影，
 *      而且 `defineTypes` 是 append-only）
 *   ② 任何 N tick 的區間內**剛好**扣掉 `round(N × r)` 格，不會累積漂移
 *   ③ 完全決定性：同一個 tick、同一個 rate 永遠給同一個答案，重播逐位元相同
 *
 * ⚠️ `rate <= 0` 一律回 0（冷卻凍結）而**不是**負數 —— 負的扣除會讓冷卻**往上長**，
 * 那是一個沒有任何卡片描述過、而且畫面上只是「這技能好像永遠不好」的行為。
 * ⛔ 沒有 `**`、沒有三角函式、沒有時鐘（`sim/purity.test.ts` 在守）。
 */
export function cooldownDrainTicks(tick: number, rate: number): number {
  if (rate <= 0) return 0;
  if (rate === 1) return 1; // 今天。⛔ 走這一條保證逐位元不變，不進下面的算式。
  const d = Math.floor((tick + 1) * rate) - Math.floor(tick * rate);
  return d > 0 ? d : 0;
}

/** Tick down cooldowns (called by commandSystem each tick). */
export function tickCooldowns(world: SimWorld): void {
  for (const [id, ab] of world.abilities) {
    // ⭐ G17 —— 這個單位的流逝速度。0 = ×1 = 今天（同 `OutputDamagePct` 那一族：
    // 出貨 0，內容不開就是**嚴格 no-op**，而且下面走的是原本那條 `--`）。
    const bonus = world.stats.get(id)?.final[Stat.CooldownDrainRate] ?? 0;
    const drain = bonus === 0 ? 1 : cooldownDrainTicks(world.tick, 1 + bonus);
    if (drain === 0) continue; // 冷卻凍結：一格都不扣（⛔ 不是往回長）
    const step = (n: number): number => (n > drain ? n - drain : 0);
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const inst = ab.slots[slot];
      if (inst.cooldownRemainingTicks > 0) inst.cooldownRemainingTicks = step(inst.cooldownRemainingTicks);
    }
    if (ab.exSlot && ab.exSlot.cooldownRemainingTicks > 0)
      ab.exSlot.cooldownRemainingTicks = step(ab.exSlot.cooldownRemainingTicks);
    // The SIXTH slot's cooldown is REAL and owned by the slot. Replay-neutral:
    // the counter can only be raised by a `castAbility(slot "PASSIVE")`, which
    // no historical input log contains, so on every existing recording this
    // line reads 0 and does nothing (innateActive.ts DECISION 5).
    if (ab.passiveSlot && ab.passiveSlot.cooldownRemainingTicks > 0)
      ab.passiveSlot.cooldownRemainingTicks = step(ab.passiveSlot.cooldownRemainingTicks);
    // ⛔ 普攻的冷卻**不吃**流逝速度：那是攻速那條屬性管的東西（`attackSpeed`，
    // 而且它有自己的上限與解鎖）。讓「技能冷卻流逝」順便加快普攻，等於開一條
    // 繞過攻速上限的後門，而且沒有任何一張卡片這樣寫。
    if (ab.basicAttackCdTicks > 0) ab.basicAttackCdTicks--;
  }
}

/**
 * Unlock a champion's "EX 技能" (rank 0 -> 1). No-op (returns false) for heroes
 * without an EX slot or one already unlocked. Emits `exUnlock` for the HUD toast
 * + a VFX cue. Called by the match host once the arena EX-unlock point is hit.
 */
export function learnEx(world: SimWorld, id: EntityId): boolean {
  const ab = world.abilities.get(id);
  if (!ab || !ab.exSlot || ab.exSlot.rank > 0) return false;
  ab.exSlot.rank = 1;
  // a passive EX (the native `Cool=0` family) becomes ACTIVE at unlock
  syncAbilityPassives(world, id);
  world.emit("exUnlock", { id, abilityId: ab.exSlot.abilityId });
  return true;
}
