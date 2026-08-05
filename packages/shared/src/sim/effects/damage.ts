/**
 * `damage` — queue a damage packet against every resolved target.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { Stat } from "../stats/statTypes";
import { resolveScaling } from "./effect";
import { bankedAddend, casterAttrs, casterStats, comboAddend } from "./effectCommon";
import { DAMAGE_QUEUE_MAX_PASSES } from "./reflectLimits";
import { distanceScaleAmount, resourcePctAmount } from "./dynamicTerms";

export const damageEffect: EffectKindSpec<"damage"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const stats = casterStats(ctx);
    // COMBO WINDOW: resolved ONCE, before the target loop — the JASS reads
    // `udg_MoonCombo` once (j:34189) and bakes the result into
    // `udg_MoonDamage`, so every unit in the blast takes the same boosted
    // number. Reading it per target would be a different spell.
    //
    // Reaching here with a `comboBonus` still attached means this damage is
    // IMMEDIATE (an instant cast, or the resolve tick of a cast time) — for
    // those, apply time IS cast time and this is the correct reading. Every
    // DEFERRED payload had the term resolved and stripped at launch by
    // `bakeCastTimeConditionals`, so it can never be re-asked late.
    const comboAdd = comboAddend(e, ctx);
    // 存款加成 (owner 2026-07-31「現存 MP 的 20% 傷害」) —— resolved ONCE, next
    // to the combo window and for the same reason: the number was frozen when
    // the mana was burned, so asking it per target could only ever return the
    // same answer, and asking it late is what the bank exists to avoid.
    const bankedAdd = bankedAddend(e, ctx);
    // ───────────────────────────────────────────────────────────────────────
    // [反彈] —— 「剛剛打中我的那一下」的一個百分比
    // ───────────────────────────────────────────────────────────────────────
    // 解算一次,跟 combo/存款同一層:分母是**一發封包**,不是每個受害者各一份。
    //
    // ⚠️ 三個 EARLY RETURN,而且是 `return` 不是「加 0」——
    //
    //  ① 沒有 `ctx.incoming`:這一次執行不是由一發傷害觸發的(技能、投射物命中、
    //     DoT tick、`spawnProjectile.onHit` 這種延遲 payload)。一個帶
    //     `incomingPct` 的效果**就是一個反彈**;沒有東西可反彈時只付 `flat`
    //     那一項,出來的是一件跟文案不同的道具。整條不做才誠實。
    //     (`zHookDef` 在**載入時**就擋掉掛錯事件的文件,所以正常內容走不到這
    //      一行 —— 它守的是延遲 payload 與直接呼叫 `runEffects` 的路徑。)
    //
    //  ② 深度到頂 —— 終止性證明本身。
    //
    //  ③ 這個 tick 的排空輪數已經不夠讓反彈落地(`whenTooLate: "drop"`)。
    //
    // ─────────────── 終止性(A 反彈給 B、B 再反彈回 A,會不會停?) ───────────
    // 每一發封包帶 `reflectDepth`,原始攻擊是 0(欄位不存在 = 0)。這裡生出來
    // 的封包一律是 `trig.reflectDepth + 1`,**嚴格遞增**。閘門是
    // `trig.reflectDepth > maxDepth → return`,所以能被生出來的封包深度
    // <= maxDepth + 1,而 `maxDepth <= REFLECT_MAX_CHAIN_DEPTH`(Zod 夾住)。
    // 上界 + 嚴格遞增 ⇒ 鏈長有限 ⇒ 一定終止。
    //
    // 預設 `maxDepth = 0`:原始攻擊(深度 0)反彈得出去,反彈本身(深度 1)被
    // `1 > 0` 擋下 —— 兩個都戴反射之盾的人互毆,剛好交換一次就結束。
    //
    // ────────── 「同一個 tick 之內」是**閘門 ③** 保證的,不是算術 ──────────
    // ⚠️ 2026-08-01 更正。以前這裡宣稱「深度 d 的封包在第 d 輪解算,所以
    // `REFLECT_MAX_CHAIN_DEPTH = DAMAGE_QUEUE_MAX_PASSES - 2` 就夠了」。那個
    // 推導假設鏈從第 0 輪起跳,而 **hook 排出來的封包不是**:一個
    // `on: onDamageDealt` 的 [On-Hit] 效果在第 0 輪被觸發、封包第 1 輪才落地,
    // 從它起跳的反彈鏈整條往後平移一輪,尾巴就留在佇列裡等下一個 tick
    // (實測見 `incomingReflect.test.ts`「排空預算」那一段)。
    //
    // 所以現在讀的是**實際落地的輪次** `trig.resolvePass`:反彈會在
    // `resolvePass + 1` 輪落地,而排空只跑到第 `DAMAGE_QUEUE_MAX_PASSES - 1` 輪。
    // 塞不下時按 `whenTooLate` 處置 —— 預設 `"drop"`(不發),`"spill"` 是舊行為。
    const incPct = e.incomingPct;
    let reflectAdd = 0;
    let reflectDepth: number | undefined;
    let skipGlobalDamageMult: boolean | undefined;
    if (incPct !== undefined) {
      const trig = ctx.incoming;
      if (trig === undefined) return; // ①
      if (trig.reflectDepth > (incPct.maxChainDepth ?? 0)) return; // ②
      if (
        trig.resolvePass + 1 >= DAMAGE_QUEUE_MAX_PASSES &&
        (incPct.whenTooLate ?? "drop") === "drop"
      ) {
        return; // ③
      }
      const col =
        incPct.perRank[Math.min(Math.max(1, ctx.rank), incPct.perRank.length) - 1] ?? 0;
      // `basis` 是**欄位**,不是我在這裡挑的分支 —— 三個讀數封包上都有,預設
      // `"mitigated"` 的三條理由寫在 `effect.ts` 的 `incomingPct` 說明上。
      const basis = incPct.basis ?? "mitigated";
      const src = basis === "raw" ? trig.raw : basis === "hpLost" ? trig.hpLost : trig.mitigated;
      reflectAdd = src * col;
      reflectDepth = trig.reflectDepth + 1;
      // 乘兩次的修正。三個讀數都已經過了 `combatEnv.damageDealt`,所以這一發
      // 反彈封包預設**免除**排空迴圈裡的那一行,反彈比才會剛好等於文案寫的
      // 百分比(在任何一個 k 下)。要讓它跟著旋鈕走是內容的決定,不是這裡的
      // 分支 —— `applyGlobalDamageMult`,預設 false。
      skipGlobalDamageMult = incPct.applyGlobalDamageMult !== true;
    }
    // 百分比生命傷害 (`hpPct`) — resolved PER TARGET, unlike everything else in
    // this handler, because the denominator is the VICTIM's own health. The rank
    // column is read once, outside the loop; clamped like `Scaling.perRank`'s
    // neighbours so a rank past the authored column keeps the top row.
    const pctCol = e.hpPct;
    const pct =
      pctCol === undefined
        ? 0
        : (pctCol.perRank[
            Math.min(Math.max(1, ctx.rank), pctCol.perRank.length) - 1
          ] ?? 0);
    // 資源百分比項 / 距離項 —— 兩個都是 PER TARGET,理由跟 `hpPct` 完全一樣:
    // 分母是某一個**身體**的條、或某一對**座標**的距離,一次 AoE 的每個受害者
    // 本來就該算出不同的數字。所以它們在迴圈裡,而 combo/存款/反彈在迴圈外。
    //
    // ⚠️ 兩個都可以是 0(滿血的虛哭神去、貼臉的炎神弩下限),而 0 在下面會被
    // 「不發空封包」那一條吃掉 —— 見那裡的說明。
    const resTerm = e.resourcePct;
    const distTerm = e.distanceScale;
    const attrs = casterAttrs(ctx);
    for (const target of ctx.targets) {
      let amount =
        resolveScaling(stats, e.amount, ctx.rank, attrs) + comboAdd + bankedAdd + reflectAdd;
      if (pctCol !== undefined && pct > 0) {
        const hp = world.health.get(target);
        if (hp) amount += (pctCol.basis === "current" ? hp.hp : hp.maxHp) * pct;
      }
      if (resTerm !== undefined) {
        amount += resourcePctAmount(world, ctx.caster, target, resTerm, ctx.rank);
      }
      if (distTerm !== undefined) {
        amount += distanceScaleAmount(world, ctx.caster, target, distTerm);
      }
      let crit = false;
      if (e.canCrit) {
        const cc = stats[Stat.CritChance] ?? 0;
        if (cc > 0 && ctx.rng.chance(cc)) {
          crit = true;
          amount *= stats[Stat.CritDamage] || 1.75;
        }
      }
      // 反彈了 0 就**不發封包**。這不是最佳化:一發 0 的封包照樣會
      // `world.emit("damage")`(攻擊者頭上跳一個 0)、照樣再觸發雙方的
      // onDamageTaken / onDamageDealt,也就是一件「沒有發生的事」被當成發生了 ——
      // 跟 `combat/damage.ts` 對免疫封包用 `continue` 而不是 `amount = 0` 同一個
      // 理由。護盾全吃掉的一擊配 `basis: "hpLost"` 就是這個情況。
      // 只在有 `incomingPct` 時檢查,所以既有的每一份文件行為完全不變。
      //
      // ⚠️ `resourcePct` / `distanceScale` 也走這一條,而且對它們更要緊:
      // 虛哭神去的算式在**滿血時就是 0**(已損失 0%),而它掛在 onBasicAttack 上,
      // 所以少了這一行,一個滿血的玩家每一次揮刀都會在對方頭上跳一個「0」、
      // 每一次都白白觸發雙方的 onDamageTaken/onDamageDealt。炎神弩貼臉時是 10
      // (不是 0),所以它照發 —— 這一條擋的是「沒有發生的事」,不是小數字。
      if ((incPct !== undefined || resTerm !== undefined || distTerm !== undefined) && amount <= 0) {
        continue;
      }
      world.damageQueue.push({
        source: ctx.caster,
        target,
        amount,
        // 省略 = 後台「傷害規則」頁的預設（出貨 magic）。
        // ⛔ 讀 `world.damageRules` 而不是寫死一個字串 —— 見 sim/damageRules.ts 檔頭。
        type: e.damageType ?? world.damageRules.defaultAbilityDamageType,
        crit,
        origin: ctx.origin,
        ...(reflectDepth !== undefined ? { reflectDepth } : {}),
        ...(skipGlobalDamageMult === true ? { skipGlobalDamageMult: true } : {}),
        // 「回復己方 MP 該傷害量」—— 只是把**指示**掛在封包上;真正付款的是
        // `combat/damage.ts`,因為只有那裡知道全域倍率 / 護甲魔抗 / 格擋 / 護盾
        // 之後真的掉了多少。在這裡算會拿到「打算打多少」,而文案講的是打中了多少。
        ...(e.refund !== undefined ? { refund: e.refund } : {}),
      });
      // 【反彈成功】—— owner 2026-08-05:「onReflect／反彈成功時 這個也要」。
      // ⛔ 位置是刻意的:**在 push 之後**,也就是上面三道閘(沒有觸發封包 /
      // 超過鏈深 / 排空預算來不及)全部沒有攔下來的時候。任何更早的位置都會讓
      // 「反彈時回血」實際上變成「被打時回血」,而畫面上看不出差別。
      // ⚠️ 這裡**不** import `fireHooks` —— 那會關上 effectRegistry 檔頭警告的
      // 那個環。只 push,由 `systems/ReflectHookSystem.ts` 在同一個 tick 稍後轉成
      // hook(逐字照抄 `onStunned` 的作法)。
      if (reflectDepth !== undefined) {
        world.pendingReflectHooks.push({ reflector: ctx.caster, victim: target });
      }
    }
  },

  bake(e, ctx) {
    if (e.comboBonus === undefined) return e;
    const add = comboAddend(e, ctx);
    // The conditional is CONSUMED here either way: a payload that leaves this
    // function still carrying `comboBonus` would be re-asked the question at
    // landing, which is the bug. Dropping it is the fix, not an optimisation.
    const { comboBonus: _resolved, ...rest } = e;
    if (add === 0) return rest;
    return { ...rest, amount: { ...e.amount, flat: (e.amount.flat ?? 0) + add } };
  },
};
