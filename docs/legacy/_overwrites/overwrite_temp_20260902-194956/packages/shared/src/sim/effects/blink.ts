/**
 * `blink` — **真瞬移**（owner 2026-08-09 / GH#301-2）。
 *
 * ⛔⛔ 這支檔案在契約層（2026-08-09 上午）是一個**會丟例外的保留槽位**。
 * 行為現在落地了，所以那段「還沒有實作」的檔頭已經整份換掉 —— 一段不再成立的
 * 說明留著就是第三守則講的那種謊。
 *
 * ── 這裡只做「誰移動、移到哪」；「怎麼移」在 `movement/blink.ts` ──────────
 * 分兩支的理由和 `effects/leap.ts` ↔ `movement/leap.ts` 逐字相同：位移的**機制**
 * （落點合法性、取消 override、同一 tick 換座標、客戶端為什麼不會插值成滑行）
 * 是一件與「這張卡怎麼寫」無關的事，而它會有第二個呼叫者。⛔ 不要把
 * `teleportBody` 的內容 inline 進來。
 *
 * ── 四個欄位怎麼合起來讀 ─────────────────────────────────────────────────
 *   `shape`  誰被瞬移的**候選集合**（`single` = 上游解好的那些人，`circle` =
 *            半徑內的一群，走**同一份** `shapeTargets`，與 dispel / shieldBreak /
 *            weightedBranch 同一支）。
 *   `applyTo` 那個集合裡誰真的動：`"self"`（預設，施法者自己）或 `"target"`
 *            （每一個解出來的目標 —— 集結／拉人那三支）。
 *   `to`     目的地：指向點 / 貼上目標 / 集結到施法者身邊。
 *   `stopShortUnits` 落在目的地**前面**多少單位（27-04 飛燕閃的 150 wc3）。
 *
 * ⚠️ `applyTo: "target"` + `to: "targetUnit"` 是**沒有意義的組合**（「每個目標
 * 瞬移到它自己身上」），所以那一格會被跳過而不是變成一個 0 距離的位移。
 * 契約層沒有在 Zod 擋它；擋在這裡是因為擋在 schema 會讓一個純粹的作者手滑變成
 * 整份內容載入失敗（那是 2026-08-02 事故的形狀）。
 *
 * ── `onArrive` 為什麼必須存在，以及它拿到什麼 ────────────────────────────
 * JASS 這一族每一個會傷害的成員都是**先位移再打**（27-04 在 j:41669 瞬移，
 * j:41671 才 `UnitDamageTargetBJ`）。寫在同一層 `effects[]` 的下一格會在**起跳
 * 點**解算 —— 那正是 `leap.onLand` 存在的理由。
 *
 * `onArrive` 在**同一個 ctx** 上跑，只換一件事：`point` 換成**落點**。所以
 *   · `damageArea` 的圓自動以落點為心（`areaCentre` 先讀 `ctx.point`），
 *   · `targets` 保持不變 —— 貼上去打的就是本來那個目標。
 * ⛔ 這個 kind 刻意**沒有** `arriveRadius`：落點的圓由 `damageArea` 自己的半徑
 * 表達，多一格半徑等於同一件事有兩個住處，而它們會分岔。
 *
 * ── `bake` 為什麼**有**（契約層檔頭留的那一題） ───────────────────────────
 * 契約層寫「同一個 tick 就執行的 payload 可能不需要 bake」。答案是**需要**，
 * 而且理由和時間差無關：`blink` 自己可以是**別人的**延遲 payload
 * （`leap.onLand: [blink{onArrive:[damage{comboBonus}]}]`、`spawnProjectile
 * .onHit`）。`bakeCastTimeConditionals` 是遞迴的，所以缺席 = identity =
 * 巢狀那一層的 `comboBonus` 在落地那一刻才解算 —— 正是 `effectRunner.ts` 檔頭
 * 記著的 #247 缺陷。`weightedBranch` 因為同一個理由也有 `bake`。
 *
 * ── purity ───────────────────────────────────────────────────────────────
 * 無 rng（瞬移不擲骰，見 `movement/blink.ts` 的 ③）、無時鐘、無三角函式。
 */
import type { EntityId } from "../../ids";
import type { Vec2 } from "../math/vec2";
import type { EffectContext } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { runEffects } from "./effectRunner";
import { shapeTargets } from "./shapeTargets";
import { teleportBody } from "../movement/blink";
// ⭐ Codex P0-5 —— `displace` 的酬載型別住在**另一個發射站**旁邊
// （`movement/leap.ts`），兩邊 import 同一個 ⇒ 欄位漂掉是 tsc 的紅。
import type { DisplaceEvent } from "../movement/leap";
// ⭐ **唯一**的 origin 解析器（見 `combat/damage.ts:288` 的檔頭）。
import { abilityIdOfOrigin } from "../combat/damage";

/**
 * 這一個 mover 要去哪（尚未證明合法 —— 合法性是 `teleportBody` 的事）。
 * `null` = 這一格沒有目的地可言，跳過。
 */
function destinationOf(
  e: { to: "point" | "targetUnit" | "caster" | "markedUnit"; markStatusId?: string },
  ctx: EffectContext,
  mover: EntityId,
  resolved: readonly EntityId[],
): Vec2 | null {
  const { world } = ctx;
  if (e.to === "markedUnit") {
    // ⭐⭐ GH#448 —— **瞬移到被我標記的那個人**（owner 2026-08-19：
    //   「給予指定敵方英雄標記，之後施展若無指定敵方英雄單位代表順移至敵方身邊」）。
    //
    // ⭐ 「被我標記的」＝ 帶著這個 `statusId` **且** `sourceId === ctx.origin`
    //   的實體 —— `sim/effects/applyStatus.ts:204` 存的就是 `ctx.origin`
    //   （＝這支技能的 id）⇒ ⛔ 不必新增一份「誰標了誰」的表。
    //
    // ⚠️ ⭐ 找不到 ⇒ 回 `null` ＝ **什麼都不做** ——
    //   ⛔ 不是瞬移到隨便一個敵人、⛔ 也不是原地不動地假裝成功
    //   （同上面那兩格的理由：0 距離的瞬移與壞掉的瞬移在畫面上一模一樣）。
    // ⭐ rollback 開關（`config.displacement-tiers@1` 的 `markedBlink`，GH#448）——
    // ⛔ 關掉之後這一段一律不發生，⭐ 施法者原地不動。
    if (!world.markedBlink.enabled) return null;
    if (e.markStatusId === undefined) return null;
    // ⚠️ ⭐ 迭代要**先排序**（`sim/purity.test.ts` 在守：Map 的迭代序不保證）。
    let best: EntityId | null = null;
    for (const id of [...world.status.keys()].sort((a, b) => a - b)) {
      if (id === mover) continue;
      const list = world.status.get(id);
      if (!list) continue;
      if (list.effects.some((st) => st.statusId === e.markStatusId &&
            (!world.markedBlink.requireOwnMark || st.sourceId === ctx.origin))) {
        best = id;
        break;
      }
    }
    if (best === null) return null;
    const m = world.transform.get(best);
    return m ? { x: m.pos.x, z: m.pos.z } : null;
  }
  if (e.to === "caster") {
    const c = world.transform.get(ctx.caster);
    return c ? { x: c.pos.x, z: c.pos.z } : null;
  }
  if (e.to === "point") {
    // 82-02 虛空瞬動讀 `GetOrderPointLoc`。沒有施法點（例如這支技被寫成單體
    // 指向）→ 沒有目的地，⛔ 不要退化成「原地」：一個 0 距離的瞬移與壞掉的
    // 瞬移在畫面上一模一樣。
    return ctx.point ? { x: ctx.point.x, z: ctx.point.z } : null;
  }
  // "targetUnit" —— 貼上目標（7 支，最大宗）。
  const anchor = resolved[0];
  // 見檔頭：`applyTo:"target"` + `to:"targetUnit"` = 「每個目標瞬移到它自己
  // 身上」，那不是一件事 —— 跳過，⛔ 不要退化成 0 距離的位移。
  if (anchor === undefined || anchor === mover) return null;
  const t = world.transform.get(anchor);
  return t ? { x: t.pos.x, z: t.pos.z } : null;
}

export const blinkEffect: EffectKindSpec<"blink"> = {
  apply(e, ctx, bakeList) {
    const { world } = ctx;
    // 候選集合走**同一份** shape 解析（⛔ 不要在這裡重新發明「圓怎麼取人」）。
    const resolved = shapeTargets(e, ctx);
    // ⚠️ 預設是 **self**（契約層：「誰移動：施法者（預設）」）。集結／拉人那
    // 三支才寫 `applyTo: "target"`。
    const movers = (e.applyTo ?? "self") === "target" ? resolved : [ctx.caster];

    // 一次 cast 烘一次（同 `leap.onLand`）—— 不是每個 mover 各烘一次，否則一支
    // 集結三個隊友的技能會把同一個條件解算三遍。
    const onArrive =
      e.onArrive !== undefined && e.onArrive.length > 0 ? bakeList(e.onArrive, ctx) : undefined;

    // `movers` 來自 `shapeTargets`（已經是全序）或是單一個施法者 —— 不是 Map，
    // 不需要再排序，重排反而會與其他 handler 分家。
    for (const mover of movers) {
      const mt = world.transform.get(mover);
      if (mt === undefined) continue;
      const hp = world.health.get(mover);
      if (hp !== undefined && !hp.alive) continue; // 屍體不瞬移（同 knockback）

      const dest = destinationOf(e, ctx, mover, resolved);
      if (dest === null) continue;

      // 落在目的地**前面** `stopShortUnits`。⚠️ 它是一個**體位級的偏移**
      // （150 wc3 ≈ 2.75 GGD），不是一段射程，所以刻意**不**經過 #136 的
      // `abilityRange` 係數 —— 那個係數縮的是「打得到多遠」，把它套在偏移上會
      // 讓「停在對方面前」這件事隨著全域射程設定漂移。
      let aim = dest;
      // ⭐【固定距離】GH#838 —— 先做這一格：它**取代**「走到目的地」而不是修飾它。
      //    JASS `PolarProjectionBJ(origin, d, angleTo(dest))`（38 處用這個形狀）。
      //    ⚠️ schema 已經把它與 `stopShortUnits` 定為互斥，所以這裡不必考慮兩格
      //    同時存在 —— 但順序仍然寫成 if/else，免得將來有人放寬 refine 之後
      //    得到一個「兩格都有作用」的靜默組合。
      const fixed = e.distanceUnits ?? 0;
      if (fixed > 0) {
        const dx = dest.x - mt.pos.x;
        const dz = dest.z - mt.pos.z;
        const l2 = dx * dx + dz * dz;
        // 目的地就在腳下 ⇒ 沒有方向可言。⛔ 不要退化成「往某個預設方向飛」——
        // 一個朝任意方向的 10 單位瞬移，比不瞬移糟糕得多。
        if (l2 > 1e-12) {
          const l = Math.sqrt(l2);
          aim = { x: mt.pos.x + (dx / l) * fixed, z: mt.pos.z + (dz / l) * fixed };
        }
      } else {
      const gap = e.stopShortUnits ?? 0;
      if (gap > 0) {
        const dx = dest.x - mt.pos.x;
        const dz = dest.z - mt.pos.z;
        const l2 = dx * dx + dz * dz;
        if (l2 > 1e-12) {
          const l = Math.sqrt(l2);
          // 已經比 `gap` 更近 → travel 夾成 0（原地），⛔ 不是往後退：
          // 「停在對方前面 2.75」不該在貼身時把人推開。
          const travel = l - gap > 0 ? l - gap : 0;
          aim = { x: mt.pos.x + (dx / l) * travel, z: mt.pos.z + (dz / l) * travel };
        }
      }
      }

      // ⭐ 承重：同一個 tick 內位置就變了（中間位置一格都不存在）。
      const landed = teleportBody(world, mover, aim);
      if (landed === null) continue;

      // GH#354 —— 位移的統一時刻（見 effects/dash.ts）。⚠️ 在 `landed === null`
      // 那道閘**之後**：瞬移被地形擋掉時什麼都沒發生，不該觸發「位移後⋯」。
      world.emit("displace", { id: mover, mode: "blink" });

      // 抵達之後**立刻**執行，同一個 tick。`point` 換成落點，`targets` 不動。
      if (onArrive !== undefined) {
        runEffects(onArrive, { ...ctx, point: { x: landed.x, z: landed.z } });
      }
    }
  },

  /** 見檔頭「`bake` 為什麼有」—— `blink` 自己可以是別人的延遲 payload。 */
  bake(e, ctx, bakeList) {
    return e.onArrive === undefined ? e : { ...e, onArrive: bakeList(e.onArrive, ctx) };
  },
};
