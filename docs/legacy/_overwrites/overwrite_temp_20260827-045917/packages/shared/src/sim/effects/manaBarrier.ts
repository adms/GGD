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
 * ⚠️ 那一行**已經接上**（`combat/damage.ts`，護盾池之後、免死之前）。
 * ⛔ 這裡曾經寫著「本 lane 不改 `combat/damage.ts`，接上之前這個 kind 掛得上、
 * 不會擋」—— 那句話寫在接線落地**之前**，今天讀就是謊話（第三守則）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 四個決策點，四個都是欄位（第一守則）
 *
 *   · `perMana`      —— 一點魔力抵幾點傷害。44-00 是 3。
 *   · `damageTypes`  —— **必填、明列**。「可抵擋**全部**傷害」= 這個陣列裡三種
 *     都在，不是程式裡的一行 `if`。與 `BlockGrant.damageTypes` 同一個設計，
 *     理由逐字相同（`combat/block.ts` 檔頭②）。
 *   · `minManaReserve` —— 抵到剩多少魔力就停手。省略 = 0（抵到見底）。
 *     「擋到沒魔力可以放技能」是一個真的設計偏好，不是一個常數。
 *   · `durationSec`  —— **選填**。見下面⑤。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑤ 「常駐」與「幾秒」是同一個機制的兩個參數，**強制停止只有一個**（GH#307）
 *
 * owner 2026-08-09：
 *   > 「這個技能是**常駐**沒錯，這個（durationSec）也是參數之一，也可以設定秒數，
 *   >   但**共同的強制停止都是魔力耗盡**」
 *
 * 所以：
 *   · `durationSec` **省略** = 常駐，沒有到期 tick，只會被魔力耗盡停掉；
 *   · `durationSec` **填數字** = 到期**或**魔力耗盡，先到的那個停。
 *
 * ⛔ **不可以**做成「有填秒數就不看魔力」。魔力耗盡是這個機制的**恆定規則**，
 * 不是「省略時才有的行為」—— 兩條路共用 {@link manaBarrierCutFor} 裡的**同一段**
 * 判斷，就是為了讓「只有一條路看魔力」在結構上寫不出來。
 *
 * ⚠️ 「耗盡就停」必須是**真的把來源拔掉**，不可以只是「這一發抵 0」：
 * 常駐的那一半沒有到期 tick，屏障不被拔掉就永遠在身上，魔力一回就又擋得動 ——
 * 那個讀法下「直到魔力耗盡」根本不會發生，而畫面上跟正常一模一樣（失敗形態 ②）。
 * 判定的時刻是**被打的當下**（那也是唯一會讀魔力的時刻），拔掉走 `detachSource`。
 *
 * ⚠️ 「常駐」不是一個很大的秒數，是「**沒有**到期 tick」這個狀態。內部用
 * `markLimits.ts` 既有的 {@link MARK_NEVER_EXPIRES} 哨兵表達，⛔ 不發明第二個。
 * 但它**不會**被寫進 `ModifierSource.expiresAtTick`：那一格的既有語意是
 * 「undefined = 永久」（`nightPact.ts` 就靠這個），而 `buffExpirySystem` 判的是
 * `expiresAtTick <= world.tick` —— 寫 `-1` 進去等於**掛上去的同一 tick 就被掃掉**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑥ purity 與 ZERO GUARANTEE
 *
 * 不抽 rng、不看時鐘、沒有三角函式、沒有 `**`；到期走 `ModifierSource.expiresAtTick`
 * （**絕對 tick**，既有機制）。來源以 `sources` 的**插入序**走訪，與
 * `blockCutFor` / `evasion` / `critStrike` / `fireHooks` 四處先例同一個方向；
 * 耗盡的來源在走訪**結束後**才拔（拔的順序不影響這一發抵了多少）。
 *
 * **ZERO GUARANTEE**：受擊者身上沒有任何未過期、型別對得上的魔力屏障時，
 * {@link manaBarrierCutFor} 在改任何狀態之前就回 0。
 * ⚠️ 型別對得上但**魔力見底**的屏障不在這個保證裡 —— 它回 0 **並且**把那個屏障
 * 拔掉，因為那正是⑤說的強制停止。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ModifierSource } from "../stats/modifiers";
import type { DamageType } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { attachSource, detachSource } from "../stats/statPipeline";
import { shapeTargets } from "./shapeTargets";
import { MANA_BARRIER_MAX_DURATION_SEC, MANA_BARRIER_MAX_PER_MANA } from "./kindLimits";
import { MARK_NEVER_EXPIRES, markNeverExpires } from "../markLimits";
import { flooredMana } from "../manaFloor";

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
  // 建築/花/投射物沒有 StatsComp —— 依構造沒有屏障。
  // ⚠️ 這裡**不可以**再加 `hp.mana > 0` 的短路：魔力見底正是要拔掉屏障的那一刻
  //（檔頭⑤），短路掉就等於「常駐屏障永遠不會結束」。
  if (!sc || !hp) return 0;

  let remaining = dmg;
  // 這一發打完之後**耗盡**的屏障（＝共同的強制停止）。走訪中不動 `sources`，
  // 插入序才不會被拔除打亂；`detachSource` 在迴圈外一次做完。
  let drained: string[] | undefined;
  for (const src of sc.sources as readonly ManaBarrierSource[]) {
    const g = src.manaBarrier;
    if (g === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!g.damageTypes.includes(type)) continue;
    const perMana = Math.max(0, Math.min(MANA_BARRIER_MAX_PER_MANA, g.perMana));
    if (!(perMana > 0)) continue;
    const floor = Math.max(0, g.minManaReserve ?? 0);
    const spendable = hp.mana - floor;
    // ⭐ 魔力耗盡 = 這個屏障結束。**兩條路共用這一段**（有沒有 `expiresAtTick`
    // 都走到這裡）—— owner：「共同的強制停止都是魔力耗盡」。
    if (!(spendable > 0)) {
      (drained ??= []).push(src.id);
      continue;
    }

    // 這個屏障吃得下多少 = 可動用魔力 × 匯率，再與剩餘傷害取小。
    const capacity = spendable * perMana;
    const absorbed = Math.min(remaining, capacity);
    remaining -= absorbed;
    if (absorbed >= capacity) {
      // 整池被抵光。直接寫 `floor` 而不是減出來，是為了不留浮點殘渣 ——
      // `capacity / perMana` 回不到 `spendable` 的那 1e-15 會讓「見底」判成 false。
      hp.mana = floor;
      (drained ??= []).push(src.id);
    } else {
      hp.mana -= absorbed / perMana;
    }
    if (!(remaining > 0)) break;
  }
  if (drained !== undefined) for (const id of drained) detachSource(world, target, id);
  return dmg - remaining;
}

export const manaBarrierEffect: EffectKindSpec<"manaBarrier"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const bodies = (e.who ?? "self") === "self" ? [ctx.caster] : shapeTargets(e, ctx);
    // 省略 `durationSec` = **常駐**（沒有到期 tick），只有魔力耗盡停得掉它。
    // 見檔頭⑤，以及下面為什麼哨兵不會被寫進 `expiresAtTick`。
    let expiresAtTick = MARK_NEVER_EXPIRES;
    if (e.durationSec !== undefined) {
      const secs = Math.max(0, Math.min(MANA_BARRIER_MAX_DURATION_SEC, e.durationSec));
      expiresAtTick = world.tick + Math.max(1, Math.round(secs / world.dt));
    }
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
        // ⛔ 常駐時**不寫**這一格：`ModifierSource` 的既有語意是「undefined = 永久」，
        // 而 `buffExpirySystem` 判 `expiresAtTick <= world.tick` —— 寫 -1 進去
        // 會在掛上去的同一 tick 被掃掉（檔頭⑤）。
        ...(markNeverExpires(expiresAtTick) ? {} : { expiresAtTick }),
        manaBarrier: grant,
        // 玩家看得到「我身上有一個防禦增益」，走既有的那條線（不新增事件）。
        damageReduction: true,
        polarity: "buff",
      };
      attachSource(world, body, src);
    }
  },
};
