/**
 * ⭐ M2(2026-08-23) —— 讓 `AbilityPassiveRank.whileStatus` 這顆閘**活著**。
 *
 * ── 為什麼它必須是一支系統，而形態閘不用 ────────────────────────────────────
 * 形態閘（`whileForm`）能靠 `ChampionFormSystem.setBody` 重新求值，是因為身體有
 * **唯一的寫入者**：施放 / 到期 / 死亡回復 / 戰鬥結束四條路全部經過那一支，所以
 * 一行 `syncAbilityPassives` 就把每一條都涵蓋了。
 *
 * ⛔ 狀態沒有那樣的唯一寫入者：`effects/applyStatus.ts` 掛上、`systems/StatusSystem.ts`
 * 收掉、【淨化】剝掉、回合重置清掉 —— 四個出口。在四個地方各補一行 = 第〇·七守則
 * 點名的「一行接線」病，而漏掉的那一行**不會紅**（它會長成「卍解結束了但格擋還在」，
 * 而畫面上跟正常一模一樣）。
 *
 * ⇒ 所以這裡改成**推導**：每 tick 問「該不該掛」與「掛了沒有」，只在兩者不一致時
 * 才動手。⭐ 它是**無狀態**的（不記上一 tick 是什麼），所以 replay seek、跳過的
 * tick、壓縮過的封包都不可能讓它漂掉。
 *
 * ── 為什麼不是「每 tick 無條件 sync」────────────────────────────────────────
 * `syncAbilityPassives` 是 detach + attach，兩者都寫 `sc.dirty = true` ——
 * 每 tick 呼叫一次等於**每 tick 對每一位英雄重算整份屬性表**。
 * 所以這一支的整個重點就是那個 `!==`。
 *
 * ── 成本 ────────────────────────────────────────────────────────────────────
 * 出貨 0 份文件填 `whileStatus`，⭐ 但 M2 第二半之後**形態閘也算活的**
 * （出貨 7 個 rank 區塊、4 份文件），所以今天它的成本是每位英雄每 tick 六次
 * {@link usesStatusGate}，而那一支的答案被 `WeakMap` 記在**技能定義物件**上
 * （註冊表的那一份，整場不變）⇒ 第二次之後是一次 map lookup。
 * ⛔ 記在 `WeakMap` 是**純函式的備忘**，不是狀態：同一份 def 永遠給同一個答案，
 * 所以它進不了 digest、也不可能在兩個 replica 之間分歧。
 *
 * purity：純讀元件 + 註冊表，⛔ 無 rng、無時鐘、無三角函式、無 `**`。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { AbilitiesComp } from "./stats/statsComp";
import type { CastableSlot } from "./intents";
import type { AbilityDef, AbilityPassive } from "./content/defs";
import { Abilities } from "./content/registry";
import {
  abilityPassiveSourceId,
  abilityToggleSourceId,
  attachToggleWhileOn,
  isActiveInnate,
  passiveRankAttaches,
  syncAbilityPassives,
} from "./abilities/abilityPassives";
import { isToggleOn } from "./abilities/toggle";
import { isLiveFormGate } from "./formGate";

/**
 * 這份 payload 有沒有任何一階掛著**活的**閘 —— 也就是「該不該掛」的答案會在
 * 同一具身體上翻面。備忘見檔頭（純函式，⛔ 不是狀態）。
 *
 * ⭐ M2 第二半（2026-08-23）：**形態閘也算**。在此之前 `whileForm` 只由
 * `ChampionFormSystem.setBody` 重新求值，那在「變身＝換 championId」的世界裡是
 * 對的；而 `sim/formGate.ts` 把它改成 OR（帶著 tags 有 "form" 的狀態也算）之後，
 * 它的答案可以在**沒有任何 setBody** 的情況下改變。
 * ⛔ 少了這一半，一次「只有狀態、不換身體」的變身會讓那 7 個
 * `whileForm:"alternate"` 的 rank 區塊永遠掛不上 —— 而畫面上跟正常一模一樣。
 */
const GATED = new WeakMap<AbilityPassive, boolean>();
function usesStatusGate(p: AbilityPassive): boolean {
  let hit = GATED.get(p);
  if (hit === undefined) {
    hit = p.ranks.some((r) => r.whileStatus !== undefined || isLiveFormGate(r.whileForm));
    GATED.set(p, hit);
  }
  return hit;
}

function hasSource(world: SimWorld, id: EntityId, sourceId: string): boolean {
  return world.stats.get(id)?.sources.some((s) => s.id === sourceId) === true;
}

/**
 * 走訪順序與 `syncAbilityPassives` **逐字相同**（Q/W/E/R → EX → 天生技）。
 * ⛔ 不是為了好看：兩支對「這一支技能是第幾階」必須看到同一個答案，而 `slot`
 * 是切換技那一半唯一問得到 `isToggleOn` 的鍵。
 */
function* instances(ab: AbilitiesComp): Generator<{ slot: CastableSlot; abilityId: string; rank: number }> {
  for (const slot of ["Q", "W", "E", "R"] as const) {
    yield { slot, abilityId: ab.slots[slot].abilityId, rank: ab.slots[slot].rank };
  }
  if (ab.exSlot) yield { slot: "EX", abilityId: ab.exSlot.abilityId, rank: ab.exSlot.rank };
  if (ab.passiveSlot)
    yield { slot: "PASSIVE", abilityId: ab.passiveSlot.abilityId, rank: ab.passiveSlot.rank };
}

export function statusGatedPassiveSystem(world: SimWorld): void {
  for (const [id, ab] of world.abilities) {
    if (world.stats.get(id) === undefined) continue;
    let resync = false;
    for (const inst of instances(ab)) {
      const def = Abilities.tryGet(inst.abilityId as never) as AbilityDef | undefined;
      if (def === undefined) continue;
      // ① 被動 / 天生技那一條來源。
      //    ⚠️ 主動型天生技預設**不掛** passive 區塊 —— 這一行與 `syncAbilityPassives`
      //    的同一行逐字相同，⛔ 少了它這裡會永遠說「該掛而沒掛」⇒ 每 tick 重算。
      if (
        def.passive &&
        usesStatusGate(def.passive) &&
        !(isActiveInnate(def) && def.innateActivePassive !== "attach")
      ) {
        const sid = abilityPassiveSourceId(def.id);
        if (passiveRankAttaches(world, id, def, def.passive, inst.rank, sid) !== hasSource(world, id, sid)) {
          resync = true;
        }
      }
      // ② 切換技**開著的期間**那一條來源（`toggle.whileOn`）。
      //    ⛔ 關著的時候什麼都不做：那份來源本來就該不在，而 `attachToggleWhileOn`
      //    會把它掛上去 —— 那是「關掉了加成還在」的鏡像缺陷。
      const w = def.toggle?.whileOn;
      if (w && usesStatusGate(w) && isToggleOn(ab, inst.slot)) {
        const sid = abilityToggleSourceId(def.id);
        if (passiveRankAttaches(world, id, def, w, inst.rank, sid) !== hasSource(world, id, sid)) {
          attachToggleWhileOn(world, id, def, inst.rank);
        }
      }
    }
    // 一次就好：`syncAbilityPassives` 本來就重新對帳**整份**技能表。
    if (resync) syncAbilityPassives(world, id);
  }
}
