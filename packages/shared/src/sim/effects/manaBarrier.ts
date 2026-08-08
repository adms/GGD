/**
 * `manaBarrier` —— **以魔力抵傷**（計畫 §12 G4 的 `defense.mana-barrier@1`）。
 *
 * 擋住一支：
 *   · 44-00 機警「將智慧具現化成魔力[護盾]，可抵擋全部傷害。
 *                 **每點魔力可以抵免 3 點傷害**」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① ⛔ 為什麼**不可以**用「受傷後補一個護盾」假裝
 *
 * 最省事的寫法是施法時算 `currentMana × 3` 開一個等額護盾。那是假的，而且是
 * 三個可觀察的地方假的：
 *
 *   · **魔力沒有被扣。** 卡上寫的是「每點魔力抵 3 點傷害」—— 擋下傷害的代價是
 *     魔力，擋完還能放大招就不是這張卡。
 *   · **魔力回復不會變成護盾。** 一個 15 秒冷卻的技能，期間回的魔力照卡上讀
 *     是能繼續擋的；烘成固定額度就凍在施法那一刻。
 *   · **敵人的燒魔／耗魔對它無效。** 護盾一旦開出來就跟魔力條脫鉤了。
 *
 * 計畫 §2.1.1 對格擋講過同一句話（「不可用受傷後補護盾假裝」），這裡逐字適用。
 * 所以這條閘必須站在**扣血之前**，把傷害**當場**換成扣魔。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⭐ 它站在傷害管線的哪一格 —— 與 `lethalSave` 檔頭①同一種推導
 *
 * 出貨的順序是：`refusesDamage`（免疫）→ `mitigate()`（護甲/魔抗）→ 格擋
 * → 護盾池 → **這裡** → 免死 → `hp.hp -= dmg`。
 *
 *   · **在 `mitigate()` 之後**：卡上寫「抵擋**傷害**」，玩家實際會吃到的量是
 *     過完護甲/魔抗的量。太早問會拿護甲已經擋掉的部分去燒魔力。
 *   · **在護盾池之後**：護盾是**專款專用**、會過期、不做別的事；魔力同時是
 *     施法資源。先花掉那個只有這一個用途的池子，是比較保守的預設 ——
 *     它嚴格花掉玩家更少的東西。
 *     ⚠️ 這一格**是一個決策點**，而它的旋鈕不在這個檔案裡：它就是
 *     `combat/damage.ts` 那一行呼叫的**位置**（搬到護盾迴圈上面 = 魔力先付）。
 *     ⛔ 我沒有做成 `order` 欄位，理由是誠實的而不是偷懶：一個欄位要生效需要
 *     **兩個**呼叫點，而那支檔案不屬於這一路。owner 若要切換，正確的做法是把它
 *     升級成 `sim/shieldRules.ts` 的一格（那裡已經有 `absorbOrder` 這個名字與
 *     後台頁），而不是在這裡放一個只有一半會被讀到的旋鈕。
 *   · **在免死之前**：一發被魔力整包吃掉的重擊不該燒掉一層【試煉】——
 *     與護盾同一句話（`lethalSave.ts` 檔頭①）。
 *
 * ⚠️ 本 lane **不改** `combat/damage.ts`。要插的那一行與它的確切位置寫在回報裡，
 * 由主控接。在接上之前這個 kind 是「掛得上、不會擋」的 —— 失敗形態 ②，所以
 * 它被寫在這裡而不是只寫在 commit message 裡。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 三個決策點，三個都是欄位（第一守則）
 *
 *   · `perMana`      —— 一點魔力抵幾點傷害。44-00 是 3。
 *   · `damageTypes`  —— **必填、明列**。「可抵擋**全部**傷害」= 這個陣列裡三種
 *     都在，不是程式裡的一行 `if`。與 `BlockGrant.damageTypes` 同一個設計，
 *     理由逐字相同（`combat/block.ts` 檔頭②）。
 *   · `minManaReserve` —— 抵到剩多少魔力就停手。省略 = 0（抵到見底）。
 *     「擋到沒魔力可以放技能」是一個真的設計偏好，不是一個常數。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ purity 與 ZERO GUARANTEE
 *
 * 不抽 rng、不看時鐘、沒有三角函式、沒有 `**`；到期走 `ModifierSource.expiresAtTick`
 * （**絕對 tick**，既有機制）。來源以 `sources` 的**插入序**走訪，與
 * `blockCutFor` / `evasion` / `critStrike` / `fireHooks` 四處先例同一個方向。
 *
 * **ZERO GUARANTEE**：受擊者身上沒有任何未過期、型別對得上的魔力屏障時，
 * {@link manaBarrierCutFor} 在改任何狀態之前就回 0。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ModifierSource } from "../stats/modifiers";
import type { DamageType } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { attachSource } from "../stats/statPipeline";
import { shapeTargets } from "./shapeTargets";
import { MANA_BARRIER_MAX_DURATION_SEC, MANA_BARRIER_MAX_PER_MANA } from "./kindLimits";

/** 一個來源（技能/道具/buff）授予的魔力屏障。 */
export interface ManaBarrierGrant {
  /** 一點魔力抵幾點傷害。44-00 機警 = 3。 */
  readonly perMana: number;
  /** 對哪些傷害型別生效。**必填、明列**，`[]` 等於沒有屏障。 */
  readonly damageTypes: readonly DamageType[];
  /** 抵到剩多少魔力就停。省略 = 0。 */
  readonly minManaReserve?: number;
}

/**
 * 帶魔力屏障的 `ModifierSource`。
 *
 * ⚠️ 這個交集型別是**暫時**的 —— 主控把
 * `manaBarrier?: ManaBarrierGrant;`
 * 那一格加進 `sim/stats/modifiers.ts` 的 `ModifierSource` 之後，把這裡刪掉，
 * 所有呼叫端一個字都不用改。（`block?: BlockGrant` 就是同一格的先例。）
 */
export type ManaBarrierSource = ModifierSource & { manaBarrier?: ManaBarrierGrant };

/**
 * 這一發封包被魔力**抵掉多少**（0 = 沒有屏障 / 沒有魔力）。
 *
 * ⚠️ 它**會扣魔力** —— 與 `blockCutFor` 會寫 `blockLastFired` 同一個形狀：
 * 這條閘的副作用就是它的機制本身，分成「問一次、再扣一次」會讓兩者有機會分歧。
 *
 * @param dmg 護盾吃飽之後、**還沒進血條**的那一份
 */
export function manaBarrierCutFor(
  world: SimWorld,
  target: EntityId,
  type: DamageType,
  dmg: number,
): number {
  if (!(dmg > 0)) return 0;
  const sc = world.stats.get(target);
  const hp = world.health.get(target);
  // 建築/花/投射物沒有 StatsComp、也沒有魔力 —— 依構造沒有屏障。
  if (!sc || !hp || !(hp.mana > 0)) return 0;

  let remaining = dmg;
  for (const src of sc.sources as readonly ManaBarrierSource[]) {
    const g = src.manaBarrier;
    if (g === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!g.damageTypes.includes(type)) continue;
    const perMana = Math.max(0, Math.min(MANA_BARRIER_MAX_PER_MANA, g.perMana));
    if (!(perMana > 0)) continue;
    const floor = Math.max(0, g.minManaReserve ?? 0);
    const spendable = hp.mana - floor;
    if (!(spendable > 0)) continue;

    // 這個屏障吃得下多少 = 可動用魔力 × 匯率，再與剩餘傷害取小。
    const absorbed = Math.min(remaining, spendable * perMana);
    hp.mana -= absorbed / perMana;
    remaining -= absorbed;
    if (!(remaining > 0)) break;
  }
  return dmg - remaining;
}

export const manaBarrierEffect: EffectKindSpec<"manaBarrier"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const bodies = (e.who ?? "self") === "self" ? [ctx.caster] : shapeTargets(e, ctx);
    const secs = Math.max(0, Math.min(MANA_BARRIER_MAX_DURATION_SEC, e.durationSec));
    const expiresAtTick = world.tick + Math.max(1, Math.round(secs / world.dt));
    const grant: ManaBarrierGrant = {
      perMana: e.perMana,
      damageTypes: e.damageTypes,
      ...(e.minManaReserve !== undefined ? { minManaReserve: e.minManaReserve } : {}),
    };
    for (const body of bodies) {
      // 同一支技能重複施放 = 換掉舊的那一個，不疊兩層屏障（兩層的語意是
      // 「先扣哪一個」，而那不是這張卡在問的問題）。id 帶 origin，所以不同來源
      // 的屏障仍然各是各的。
      const sc = world.stats.get(body);
      if (!sc) continue;
      const id = `buff:manaBarrier:${ctx.origin}`;
      const idx = sc.sources.findIndex((s) => s.id === id);
      if (idx >= 0) sc.sources.splice(idx, 1);
      const src: ManaBarrierSource = {
        id,
        kind: "buff",
        expiresAtTick,
        manaBarrier: grant,
        // 玩家看得到「我身上有一個防禦增益」，走既有的那條線（不新增事件）。
        damageReduction: true,
        polarity: "buff",
      };
      attachSource(world, body, src);
    }
  },
};
