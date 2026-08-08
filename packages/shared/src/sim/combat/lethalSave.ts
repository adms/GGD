/**
 * 免死 —— 「受到致命傷害時消耗一層標記」的那一刻。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 位置：`hp.hp -= dmg` 的**前一行**，而且只有那裡對得起來
 *
 * 「這一發會不會殺死我」在傷害管線上只有一個時刻問得準，而 `combat/block.ts`
 * 的檔頭④已經把理由推導過一次（那一段是為 `lethalOnly` 格擋寫的，這裡逐字適用）：
 *
 *   · 太早問（免疫閘、`mitigate()` 之前）→ 讀到的是還沒過護甲的數字；
 *   · 太晚問（扣完血）→ 人已經死了，`deathSystem` 下一格就把 `alive` 翻掉。
 *
 * 差別在於格擋問的是 `hp + 吃得到的護盾`（它站在護盾**之前**），而免死站在
 * 護盾**之後** —— 所以這裡的 `dmg` 已經是護盾吃飽之後**真的要進血條**的那一份。
 * 那才是「這一發會不會殺死我」的字面意思：一發被護盾整包吃掉的重擊不該燒掉
 * 一層試煉。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⭐ 為什麼免死規則掛在**標記**上，不另開一套 ModifierSource
 *
 * 現成的先例是 `BlockGrant`（住在 `ModifierSource.block`）。這裡沒有照抄，
 * 因為免死的觸發條件是「**這個標記還有沒有層**」——
 * 規則與它的資源放在兩個物件上的話，「還剩幾層」與「這張牌還能不能用」就是
 * 兩個可以各自為真的東西，而它們不同步的那一天測起來會全綠（兩邊的測試各自
 * 只看自己那一半 —— `block.ts` 檔頭⑥為了 `blockLastFired` 講過同一件事）。
 *
 * 所以「這個標記是不是一張免死牌」是 {@link MarkLethalRule}，標記上的**一個
 * 欄位**。沒有它的標記（風王結界、縮地、任何純計數）在這裡是一次 `undefined`
 * 比較就跳過。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 三個決定點，三個都是欄位（CLAUDE.md 第一守則）
 *
 *   · `damageTypes` —— **真實傷害救不救？** 明列，`[]` 不合法。
 *     「真傷無法被免死」= 這個陣列裡沒有 `"true"`，不是程式裡的一個分支。
 *   · `surviveHpPct` —— 救完剩多少血。十二道試煉留 1%（隨後那一段自己回 50%），
 *     但「留 1 點」與「留半血」都是合法設計，所以它是數字不是常數。
 *   · `internalCooldown` —— 同一 tick 內連續兩發封包會不會燒掉兩層。
 *     ⚠️ 預設 **0.5 秒**而不是 0：一次 AoE 在同一 tick 打出多發封包是常態
 *     （`damageArea` 就是），而 0 會讓十二層在一次爆炸裡全部蒸發。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ ⚠️ 兩個**已知擋不到**的死法，寫在這裡免得下一個人以為是缺陷
 *
 *   · **火圈燒傷**（`FireRingSystem`）直接寫 `hp.hp -=`，不走傷害佇列，所以
 *     這條閘看不到它。同一個理由讓無敵也擋不住火圈（`invulnerable.ts:77-80`
 *     已經把這件事寫下來了）。要救火圈得在那支系統自己補一道。
 *   · **DoT 的最後一跳**走的是傷害佇列，所以**擋得到** —— 這一條是好消息，
 *     列在這裡是為了說明上一條不是「所有非攻擊傷害都擋不到」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑤ 純度與 ZERO GUARANTEE
 *
 * 不抽 rng（免死是確定性的：有層就救，沒層就死，沒有機率）、不看時鐘、
 * 冷卻是**絕對 tick**。標記迭代明確排序。
 *
 * **ZERO GUARANTEE**：受害者身上沒有任何帶 `lethal` 規則的標記時，
 * {@link lethalSaveFor } 在碰任何東西之前就回 `undefined`。所以在內容填進來
 * 之前這條閘是嚴格的 no-op —— 每一份既有 replay 與 digest 逐位元不變。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { DamageType, EffectDef } from "../effects/effect";
import { runEffects } from "../effects/effectRunner";
import { enemiesInCircle } from "../abilities/abilitySystem";
import { markExpired } from "../markLimits";
import { syncPerStackSource } from "../marks";

/**
 * 「這個標記是一張免死牌」的完整描述。
 *
 * 缺席 = 這個標記只是一個計數器（風王結界 / 縮地 / 任何純標記），
 * 在傷害管線上完全不存在。
 */
export interface MarkLethalRule {
  /** 一次免死消耗幾層。十二道試煉 = 1。 */
  readonly consume: number;
  /** 救活後剩下最大生命的幾成（0 < x <= 1）。 */
  readonly surviveHpPct: number;
  /** 對哪些傷害型別生效。**必填、明列**，`[]` 不合法（見檔頭③）。 */
  readonly damageTypes: readonly DamageType[];
  /** 內部冷卻（秒）—— 防止一次 AoE 的多發封包把層數一口氣燒光。 */
  readonly internalCooldown: number;
  /** 救活的同一刻落在**自己**身上的效果（無敵 / 回復）。 */
  readonly selfEffects: readonly EffectDef[];
  /** 救活的同一刻落在**周圍敵人**身上的效果（擊退 / 暈眩）。 */
  readonly aoeEffects: readonly EffectDef[];
  /** `aoeEffects` 的半徑（GGD 單位）。0 = 不做 AoE。 */
  readonly aoeRadius: number;
}

/**
 * 這一發封包會殺死 `victim` 嗎？會的話有沒有標記救得了他？
 *
 * @param dmg 護盾吃飽之後**真的要進血條**的那一份
 * @param hp  現在的血
 * @returns 救成功時回傳「應該留下的血量」；沒救回 `undefined`（照常扣血）
 */
export function lethalSaveFor(
  world: SimWorld,
  victim: EntityId,
  type: DamageType,
  dmg: number,
  hp: number,
): number | undefined {
  // ZERO GUARANTEE ①：這一發根本殺不死人。絕大多數封包在這裡就回去了。
  if (dmg < hp) return undefined;
  const bag = world.marks.get(victim);
  if (bag === undefined || bag.size === 0) return undefined;

  const health = world.health.get(victim);
  if (health === undefined || !health.alive) return undefined;

  // 明確排序 —— 身上有兩張免死牌時「先燒哪一張」必須在每個 replica 上相同，
  // 而 Map 插入序取決於技能註冊順序（可能受網路影響）。
  for (const markId of [...bag.keys()].sort()) {
    const st = bag.get(markId)!;
    const rule = st.lethal;
    // ZERO GUARANTEE ②：純計數標記（絕大多數）在這裡跳過。
    if (rule === undefined) continue;
    if (st.count < rule.consume) continue;
    if (markExpired(st.expiresAtTick, world.tick)) continue;
    if (!rule.damageTypes.includes(type)) continue;
    // 冷卻閘在**消耗之前** —— 被冷卻擋掉的標記不燒層、不跑效果，
    // 照 `effects/hooks.ts` 與 `combat/block.ts` 的既有先例。
    const icdTicks = Math.round(rule.internalCooldown / world.dt);
    if (st.lastSavedTick !== undefined && world.tick - st.lastSavedTick < icdTicks) continue;

    // ── 救活 ────────────────────────────────────────────────────────────
    st.count -= rule.consume;
    st.spent += rule.consume;
    st.lastSavedTick = world.tick;
    // 「每失去一層試煉，永久提升 10% 攻擊力與 10% 最大生命」—— 在讀 maxHp
    // **之前**同步，否則這一次救活留下的血是用舊的 maxHp 算的（少一層份）。
    syncPerStackSource(world, victim, markId, st);
    const floor = Math.max(1, Math.round(health.maxHp * rule.surviveHpPct));

    world.emit("markChanged", { id: victim, markId, count: st.count });
    // ⭐ 這個事件是「玩家看得到這件事發生了」的唯一通道（失敗形態②）。
    // 客戶端的浮動文字/特效掛在它上面，而不是靠玩家自己發現血沒歸零。
    world.emit("lethalSaved", {
      id: victim,
      markId,
      remaining: st.count,
      spent: st.spent,
      hp: floor,
    });

    // 效果分兩批跑，因為它們的目標**不一樣** —— 而這正是既有的
    // `knockback` / `applyStatus` 兩個 PRE_A4 kind 自己解不出來的東西
    // （它們沒有 shape/radius，只打 `ctx.targets`）。
    if (rule.selfEffects.length > 0) {
      runEffects(rule.selfEffects, {
        world,
        caster: victim,
        rank: 1,
        targets: [victim],
        origin: `mark:${markId}`,
        rng: world.rng,
      });
    }
    if (rule.aoeEffects.length > 0 && rule.aoeRadius > 0) {
      const centre = world.transform.get(victim)?.pos;
      if (centre !== undefined) {
        const foes = enemiesInCircle(world, victim, centre, rule.aoeRadius);
        if (foes.length > 0) {
          runEffects(rule.aoeEffects, {
            world,
            caster: victim,
            rank: 1,
            targets: foes,
            origin: `mark:${markId}`,
            rng: world.rng,
          });
        }
      }
    }
    return floor;
  }
  return undefined;
}
