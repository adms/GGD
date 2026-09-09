/**
 * `applyStatus` — attach / refresh a status marker (CC, combo window, …).
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ GH#304 —— 它同時是**計數器的 ±N**，而且「一個 id 在一個身體上只有一個
 *    計數器」
 *
 * owner 2026-08-09：「疊層機制 可能會 1. 隨觸發 2. 隨時間 3. 隨回合
 * 增加/減少」。軸①②的答案就是這個 kind：把它掛在 `HookEvent` 上
 *（`onBasicAttack` / `onDamageTaken` / … 15 個）＝隨觸發，掛在 `onInterval` 上
 * 配 `internalCooldown` ＝隨時間。三條軸的分工寫在 `sim/marks.ts` 檔頭⑤。
 *
 * ── ⛔ 為什麼要「路由到標記」，而不是各疊各的 ────────────────────────────
 * 這個 repo 有**兩個**層數儲存：`world.marks`（具名標記）與
 * `world.status[].stacks`（狀態層數）。它們的**身分空間是同一個** —— 兩邊的
 * key 都是「一份既有文件的 id」（`sim/marks.ts` ②：標記的身分是借來的），
 * 而 `net/snapshot.ts` 的 `namedCounters` 早就把同一個 id 的兩邊**相加**送給
 * 客戶端。
 *
 * 所以在這一段之前，一個作者寫「每次普攻 +1 層【十二道試煉】」會得到：
 *   · HUD 顯示 13 —— 看起來完全正確；
 *   · `lethalSaveFor` 讀的是 `MarkState.count`，還是 12 —— **那一層是假的**，
 *     它一次都救不了人。
 * 這正是 CLAUDE.md 失敗形態②最貴的變體：卡片、後台、HUD 三個地方都同意，
 * 只有真正的判定不同意。所以 id 撞上一個**已經在這個身體上**的標記時，
 * 增減走 {@link adjustMarkCount}，狀態那半整段跳過。
 *
 * ⚠️ 路由的閘是 `stacks !== undefined`，不是「id 是不是標記」。少了這個閘，
 * 一個 statusId 剛好與某人身上的標記同名的【暈眩】會被吞掉 —— 而暈眩不見
 * 比多一層更難查。
 */
import type { EffectKindSpec } from "./effectKind";
import { rankScalar } from "../perRank";
import { recordCc } from "../stats/matchStats";
import { refusesControl } from "./invulnerable";
import { blockingImmunitySource, spendImmunityCharge } from "../statusTagImmunity";
import { detachSource } from "../stats/statPipeline";
import { Statuses } from "../content/registry";
import { clampMarkCount } from "../markLimits";
import { adjustMarkCount } from "../marks";
import type { SimWorld } from "../SimWorld";
import type { EntityId } from "../../ids";
import type { DamageType } from "./effect";

/**
 * ⭐ GH#1085 —— 一次性護盾**擋下一份狀態**時送到客戶端的那一拍。
 *
 * 形狀**逐字**照 `combat/damage.ts::emitImmune` 的 `immune`（`x`/`z` 讀受害者、
 * `amount` 0 因為沒有任何東西落地、`dmgType: "magic"` 因為擋下的是卡面的「負性**魔法**」）——
 * 客戶端在 `net/RoomConnection.ts` 用 `recordEvade(ev.data, "immune")` 接它，
 * 畫成打擊點的「免疫」浮字。⛔ 不開第二個事件名：`immuneControl` 在
 * `apps/client/src/vfx/worldCues.ts` 的 `WORLD_CUE_OUT_OF_SCOPE` 裡**零消費端**
 *（那是寫下來的決定），而一個沒有人畫的事件就是失敗形態②。
 * `statusId` 是這一拍多出來的一格（哪一份狀態被擋下），既有讀端不讀它。
 */
export interface StatusWardBlockEvent {
  target: EntityId;
  source: EntityId;
  amount: 0;
  dmgType: DamageType;
  origin: string;
  statusId: string;
  x: number;
  z: number;
}

/**
 * 施加者是不是受害者的**敵方**（一次性護盾只對敵方的狀態反應；卡面的「對方」）。
 * 自己 ⇒ 不是；隊伍不同 ⇒ 是；查不到隊伍的那一邊當成「不同」（一個沒有隊伍的施加者
 * —— 環境／中立 —— 不是自己人）。
 */
function appliedByHostile(world: SimWorld, caster: EntityId, target: EntityId): boolean {
  if (caster === target) return false;
  return world.team.get(caster)?.teamId !== world.team.get(target)?.teamId;
}

export const applyStatusEffect: EffectKindSpec<"applyStatus"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // ⭐ G2（GH#299）—— 三格逐階欄位在**進迴圈之前**解一次：階數是這一次施放的
    // 屬性，不是每個受害者各自不同的東西（同 `damage.ts` 對 combo/存款的處理）。
    // ⛔ 讀取一律走 `rankScalar`，不要手寫 `typeof x === "number" ? …`。
    const duration = rankScalar(e.duration, ctx.rank) ?? 0;
    const moveSpeedMult = rankScalar(e.moveSpeedMult, ctx.rank);
    const missChance = rankScalar(e.missChance, ctx.rank);
    const expiresAtTick = world.tick + Math.round(duration / world.dt);
    // hard/soft CC (stun/root/slow) applied to an enemy scores ccAppliedTicks
    //
    // ⭐ 恐懼**算** CC，而它上面那位鄰居 `berserk` 刻意不算 —— 兩者的差別不是
    // 「有多硬」，是**誰授權的**（`sim/fear.ts` 決策 3）：
    //   · 暴走是自我增益帶 downside，所以一個魔免 buff 不該讓初號機自己的暴走
    //     落不到自己身上；
    //   · 恐懼是**敵人塞過來的**純減益，而且比同一行裡已經算 CC 的
    //     `moveSpeedMult < 1` 更徹底地拿走控制權。免控擋得掉 30% 減速卻擋不掉
    //     「這 3 秒你不能操作」，那個組合對玩家無法解釋。
    // 加在這一行（而不是四個 CC 讀取點）換到兩件事：免控會拒絕**掛上**並發
    // `immuneControl` 讓玩家看見，而且恐懼的時間會進 `ccAppliedTicks` 戰績。
    const isCc =
      e.stun === true ||
      e.root === true ||
      e.feared === true ||
      // ⭐【繳械】S8 —— 與 `feared` 同一列、同一個論證：敵人塞過來的純減益，
      // 而且拿走的是「打不打得出去」這半個操作。免控擋得掉暈眩卻擋不掉繳械，
      // 那個組合對玩家無法解釋。進這一行也讓它的秒數記進 `ccAppliedTicks` 戰績。
      e.disarmed === true ||
      (moveSpeedMult !== undefined && moveSpeedMult < 1) ||
      // ⭐ GH#1041 ——【致盲】【詛咒】那一族：普攻會打空。判準**從資料推導**
      //（`missChance > 0` ＝ 這個狀態拿走了「打不打得中」這半個操作），⛔ 不是
      // 一張 `blind`/`curse` 的字串名單 —— 名單會過期，第三份走 missChance 的
      // 狀態上架時它會安靜地漏掉；推導不會。`> 0` 而不是 `!== undefined`：一份
      // 寫了 `missChance: 0` 的文件沒有拿走任何東西（同 condition.ts 的 `miss` tag）。
      // 進這一行的兩個後果與繳械逐字相同：免控拒絕**掛上**並發 `immuneControl`、
      // 秒數記進 `ccAppliedTicks`。閘：`ccImmunityCoversMissChance.test.ts`。
      (missChance !== undefined && missChance > 0);
    // `applyTo: "self"` is the COMBO-WINDOW form: the marker belongs on the
    // caster even though the ability's own targeting resolved enemies (07-02
    // 者、皆、陣 is unit-targeted and still sets udg_MoonCombo, j:34438).
    const subjects = e.applyTo === "self" ? [ctx.caster] : ctx.targets;
    for (const target of subjects) {
      const st = world.status.get(target);
      if (!st) continue;
      // ── 免控 (GH#289 lane P3) ────────────────────────────────────────────
      // THE ONLY LINE lane P3 adds outside its own files, and it is here rather
      // than at the four CC READ sites (movementHold / abilitySystem /
      // CastResolveSystem / BasicAttackSystem) on purpose: refusing the ATTACH
      // makes every one of those consumers correct without any of them knowing
      // immunity exists — which is also how WC3 models it (the spell simply
      // fails to affect the unit).
      //
      // Two deliberate narrowings:
      //   · only `isCc` — a combo WINDOW / marker is not control, so a 免控
      //     buff must never eat 蒼月潮's own `moon-combo` marker (that would
      //     silently delete 07-03 列、在、前's bonus damage);
      //   · only when the subject is NOT the caster — WC3 immunity refuses the
      //     ENEMY's spells; a self-applied marker or self-root is your own.
      if (isCc && target !== ctx.caster && refusesControl(world, target)) {
        // ② the player must SEE the refusal, not just not-be-stunned.
        world.emit("immuneControl", { target, source: ctx.caster, statusId: e.statusId, origin: ctx.origin });
        continue;
      }
      // ── 選擇性狀態免疫 (GH#656 殭屍王) ──────────────────────────────────
      // owner 2026-08-24：「殭屍王**免疫負面狀態** 包含**暈眩 緩慢 詛咒 致盲**
      // 但**可被吸血、暴擊、淨化跟其他技能標記與疊層**」。
      //
      // ⭐ 它與上面那道免控閘是**兩個不同的問題**，⛔ 不是同一個的加強版：
      //   · 免控問「這個**效果**拿不拿得走操作權」（讀 e.stun / e.root /
      //     moveSpeedMult / missChance…）—— ⚠️ 在 GH#1041 之前那一行**漏掉詛咒與
      //     致盲**（兩支走 missChance），2026-09-06 補上；
      //   · 這一道問「這**一類**狀態掛不掛得上這具身體」（讀 status 文件的 tags）。
      // 前者是限時授予（`invulnerable.durationSec` 必填），後者是常駐身分。
      //
      // ⛔ 三個刻意的窄化，每一個都對應 owner 明說要**保留**的那一半：
      //   · 只擋 `applyStatus` 這一條掛載路徑 —— 傷害管線（吸血／暴擊）完全沒碰；
      //   · 位置在 `adjustMarkCount` 路由**之前**，但判準是 tag：出貨 28 份不帶
      //     `cc` 的狀態（破甲／破魔／禁療／重創／連段窗／存款計數）逐份照掛；
      //   · ⛔ 完全不碰 `clearPools` —— 免疫擋的是**掛上來**，不是**被拔走**，
      //     所以「殭屍王可被淨化」仍然成立。
      //
      // ⚠️ ⛔ 不排除 `target === ctx.caster`（免控那一行有排除）：一具「不吃暈眩」
      // 的身體不會因為暈眩是自己給的就吃得下去 —— 免控排除自己是因為它模仿的是
      // WC3「拒絕**敵人的**法術」，而這一格是**身體本身的性質**。
      //
      // ⭐ GH#1085 —— 同一道閘的**一次性**變體（`statusImmunity.charges`，07-01 臨、兵、鬥
      // 「可抵擋對方負性魔法」＝原作 ANss Spell Shield）：擋下就扣一次，扣到 0 把那份來源
      // 整個拔掉（護盾消失）。⚠️ 與無限次的兩個差別都寫在 `blockingImmunitySource`：
      // 只對**敵方**施加的反應（自己的代價型減益不打破自己的護盾）、常駐免疫先答不消耗。
      const sc = world.stats.get(target);
      const ward =
        sc === undefined
          ? undefined
          : blockingImmunitySource(
              sc.sources,
              world.tick,
              Statuses.tryGet(e.statusId)?.tags,
              appliedByHostile(world, ctx.caster, target),
            );
      if (ward !== undefined) {
        // ② 同上：玩家必須**看得見**被免疫了，⛔ 不是「就是沒被暈到」。
        // 共用 `immuneControl` 這條頻道，⛔ 不開第二個事件 —— 客戶端已經有
        // 那一條的消費端，而新事件要走 `eventFanout` 白名單（失敗形態⑧）。
        world.emit("immuneControl", { target, source: ctx.caster, statusId: e.statusId, origin: ctx.origin });
        const grant = ward.statusImmunity;
        if (grant !== undefined && grant.charges !== undefined) {
          // ⭐ 承重那一行：少了它護盾永遠擋得住 —— 「第二發 ⇒ 中」那條守衛會紅。
          const spent = spendImmunityCharge(grant);
          // 一次性護盾的那一拍走 `immune`（打擊點的「免疫」浮字），理由見 StatusWardBlockEvent。
          const tt = world.transform.get(target);
          const beat: StatusWardBlockEvent = {
            target,
            source: ctx.caster,
            amount: 0,
            dmgType: "magic",
            origin: ctx.origin,
            statusId: e.statusId,
            x: tt?.pos.x ?? 0,
            z: tt?.pos.z ?? 0,
          };
          world.emit("immune", { ...beat });
          if (spent) detachSource(world, target, ward.id);
        }
        continue;
      }
      // ⭐ GH#304 —— 「一個 id 在一個身體上只有一個計數器」。這個身體身上已經有
      // 同名的**具名標記**時，層數的增減走標記那一套（`max` / `spent` /
      // `perStackLost` / 免死都掛在它上面），狀態那半整段跳過。理由見檔頭。
      //
      // ⛔ 位置在免控閘**之後**：一發被免疫拒絕的效果不該動對方的計數器。
      if (e.stacks !== undefined && world.marks.get(target)?.has(e.statusId) === true) {
        adjustMarkCount(world, target, e.statusId, e.stacks);
        continue;
      }
      // refresh rule: same status id + origin replaces (no stacking in skeleton)
      const existing = st.effects.find(
        (s) => s.statusId === e.statusId && s.sourceId === ctx.origin,
      );
      // ⭐ GH#304 —— 減層**不建立**新的一筆。身上沒有這個狀態時「-1 層」的正確
      // 答案是「什麼都不做」，不是「掛一筆 0 層的狀態」（那會讓 `hasStatus` 從此
      // 為真、讓計數器列上長出一個 ×0，而作者要的只是把不存在的東西再減一次）。
      if (existing === undefined && e.stacks !== undefined && e.stacks < 0) continue;
      let addedTicks = 0;
      /** 這一次施加**真的把層數推高了**嗎 —— 見下面 `statusApplied` 那一段。 */
      let stacksGrew = false;
      if (existing) {
        // ⭐ GH#304 —— 續不續期是一格欄位（`refresh`），而**減層一律不續期**。
        // 少了這一行，一個掛在 `onInterval` 上每 3 秒 +1 層的計數器會每次都把
        // 到期時間推到滿，於是「20 秒內疊到 5 層」變成「永久 5 層」——
        // 一個在畫面上跟正確行為一模一樣的故障（失敗形態②）。
        const keepWindow =
          e.refresh === "keep" || (e.stacks !== undefined && e.stacks < 0);
        addedTicks = keepWindow ? 0 : Math.max(0, expiresAtTick - existing.expiresAtTick);
        if (!keepWindow) {
          existing.expiresAtTick = Math.max(existing.expiresAtTick, expiresAtTick);
        }
        /**
         * ⭐ 層數累加（GH#301-5）。
         *
         * ⛔ **只有作者明寫 `stacks` 的那些卡才累加。** 沒寫 = 這不是一支疊層的
         * 狀態 = 續期就只是續期，跟這一行之前逐字相同。這個條件不是保守，它是
         * 相容性本身：出貨的 28 份狀態沒有一份寫了 `stacks`，無條件累加會讓
         * 每一次重複施加的【暈眩】【減速】默默變成 2 層、3 層 —— 沒有人會在
         * 畫面上看出來，但任何一顆問層數的條件葉從此對它們全部說謊。
         *
         * 上界走 `clampMarkCount`（`sim/markLimits.ts`，同一份表、同一個夾取），
         * ⛔ 不抄字面值 999：schema 的 `.max(MARK_MAX_COUNT)` 擋的是**一次施加**
         * 寫得太大，這裡擋的是**累加**爬過頭，兩道守的是同一個上界。
         */
        if (e.stacks !== undefined) {
          const before = existing.stacks ?? 1;
          existing.stacks = clampMarkCount(before + e.stacks);
          stacksGrew = existing.stacks > before;
          // ⭐ GH#304 —— **層數掉到 0 就把這一筆拿掉**。
          //
          // ⛔ 這不是一個決策點，是這個 repo 已經寫死的語意：`stacks` 的欄位說明
          // （兩個檔都有）明講「0 層等於沒有」。留著一筆 0 層的狀態會讓
          // `hasStatus` 從此為真、讓 `condition.target-status@1` 對「他身上還有
          // 【破甲】嗎」說謊、讓客戶端的計數器列上留一個 ×0 —— 三個消費端一起錯，
          // 而畫面上跟「還剩一層」長得幾乎一樣。
          //
          // ⚠️ 只有**扣到 0** 才拿掉（`before > 0`）：一筆本來就是 0 層的狀態
          // 不存在，所以這一行碰不到既有內容 —— 出貨的 28 份 status 沒有一份寫
          // `stacks`，`before` 對它們永遠是 1。
          //
          // ⛔ **不發事件**：`statusExpirySystem` 自然到期時也不發（`grep -n emit
          // systems/StatusSystem.ts` = 零筆），狀態列走的是每 tick 的快照投影
          // （`net/snapshot.ts` 的 `statusIds`）而不是事件流。在這裡發明一個
          // 沒有人監聽的事件名只會是一個假訊號。
          if (existing.stacks === 0) {
            const at = st.effects.indexOf(existing);
            if (at >= 0) st.effects.splice(at, 1);
            continue;
          }
        }
      } else {
        addedTicks = Math.max(0, expiresAtTick - world.tick);
        st.effects.push({
          statusId: e.statusId,
          sourceId: ctx.origin,
          expiresAtTick,
          // ⭐ 層數（GH#301-5）。作者沒寫 = `undefined`，讀取端一律當 1
          // （`statusStacks`）。⛔ 這裡**不要**寫 `e.stacks ?? 1`：那會讓 28 份
          // 出貨狀態全部長出一格「1」，然後「這一份有沒有在疊層」就永遠分不出來，
          // 而上面那道「沒寫就不累加」的相容性閘會失去它的判準。
          stacks: e.stacks !== undefined ? clampMarkCount(e.stacks) : undefined,
          moveSpeedMult,
          root: e.root,
          stun: e.stun,
          missChance,
          // 暴走 (59-00). 它跟著 status 一起到期,所以「永久失去方向盤」在結構上
          // 不可能發生 —— 見 components.ts 的 `StatusEffect.berserk`。
          berserk: e.berserk,
          // 恐懼 —— 暴走的鏡像（`sim/fear.ts`）。同樣跟著 status 到期,所以
          // 「永久嚇到不能玩」在結構上不可能發生。
          feared: e.feared,
          // 增益還是減益 —— A4b(#278) 把這條線接上。
          // ⛔ 不從 `moveSpeedMult` 之類的欄位猜:1.3 的加速與 0.7 的減速在結構上
          // 一模一樣。答案住在 `status-effect@1` 文件裡(14/14 都填了),
          // 而 sim 透過 `Statuses` 登錄表讀它。查不到 = undefined = 有方向的
          // 淨化拔不到它(`clearPools.polarityPasses`:「不知道」不當成「是」)。
          polarity: Statuses.tryGet(e.statusId)?.polarity,
          // 可不可以被淨化拔掉 —— GH#295。缺席時 `clearPools` 讀
          // `dispelRules.statusDefaultDispellable`（出貨 true），所以這一格是
          // 「作者明講不可驅散」的**唯一**寫法。不寫這一行 = schema 收得下、
          // 後台畫得出來、而引擎永遠讀不到（失敗形態 ②）。
          dispellable: e.dispellable,
          // C4 睡眠 —— 受傷即提早解除這一筆（`sim/statusBreak.ts`）。
          // C1 沉默 / C2 混亂（#278）。
          silenced: e.silenced,
          // ⭐【繳械】S8 —— 打不出普通攻擊。少了這一行，schema 收得下、後台畫得
          // 出來、而 `BasicAttackSystem` 永遠讀不到（失敗形態②）。
          disarmed: e.disarmed,
          targetsAllies: e.targetsAllies,
          breakOnDamage: e.breakOnDamage,
          breakOnDamageMin: e.breakOnDamageMin,
          // 【重創】A6 —— 三格獨立（治療 / 吸血係數 / 自然回復）。
          healingTakenMult: e.healingTakenMult,
          lifestealMult: e.lifestealMult,
          regenMult: e.regenMult,
        });
      }
      if (isCc) recordCc(world, ctx.caster, target, addedTicks);
      // 【狀態被套用的當下】(GH#300) —— `systems/WorldHookSystem.ts` 把它轉成
      // `onStatusApplied`。emit 而不是 `fireHooks`，理由與下面那個 `stunApplied`
      // 逐字相同（import 環）。
      //
      // ⛔ **續期不重觸發**。少了這道閘，一支每 tick 續期的減速會讓「狀態掛上時
      // 獲得 X」每秒發 30 次 —— 與 `onStunned` 當初窄化的理由一模一樣。
      // ⛔ 也在免控那道 `continue` **之後**：被免控拒絕掛上的那一筆不算套用成功，
      // 否則「敵人中了狀態就追加」會在對方完全免疫時照樣發動。
      //
      // ─────────────────────────────────────────────────────────────────────
      // ⭐ 決策點（B×D 交互，2026-08-09 整合時裁決）：**疊上第 2 層算不算「被套用」？**
      //
      // 算 —— 但只有**層數真的長高**的那一次算，純續期不算。三種寫法都試過：
      //
      //   ① 只有第一次算（`!existing`）：`stacks` 從此只有第一層看得見，
      //      「疊到 N 層引爆」這種卡**寫不出來** —— 而那正是 owner 在 #299 第 8 條
      //      要層數的理由（「會連動技能 ID 或狀態疊層」）。做了一個數字卻沒有任何
      //      時刻可以掛在上面，就是失敗形態②。
      //   ② 每一次施加都算：把上面那道「續期不重觸發」的閘整個拆掉，
      //      一支每 tick 續期的減速又會每秒發 30 次。
      //   ③（選這個）**新掛上** ∪ **層數真的增加**。
      //
      // ⭐ ③ 為什麼在相容性上是安全的：`stacksGrew` 只可能在作者**明寫了
      // `stacks`** 的卡上為真（上面那個 `e.stacks !== undefined` 閘），而出貨的
      // 28 份狀態沒有一份寫 —— 所以既有內容一次都不會多發一則。
      // ⭐ 而且它用的是 `> before` 而不是「有沒有寫 stacks」：夾到上限（999）
      // 之後再疊不會發，因為那一刻身上的層數**沒有變**，而這則事件說的是
      // 「這個人身上的層數變了」，不是「有人又打了一發」。
      if (!existing || stacksGrew) {
        world.emit("statusApplied", { target, source: ctx.caster, statusId: e.statusId, origin: ctx.origin });
      }
      // 被暈眩的那一刻 (勇者小呆 08-00 龍紋記憶). Emitted, NOT dispatched: firing
      // `fireHooks` from here would close the import ring
      // applyStatus → hooks → effectRunner → effectRegistry → applyStatus, which
      // effectRegistry.ts's own header warns about (the bite is not a compile
      // error, it is an `undefined` handler under the wrong bundler order). So
      // this is a plain event and `systems/CcHookSystem.ts` turns it into the
      // `onStunned` hook, one step later in the same tick.
      //
      // ONLY when a stun actually ATTACHED: a refreshed stun does not re-trigger
      // (`existing` branch above sets no new marker, and re-firing would let a
      // chain-stun re-double 小呆's attributes every tick).
      if (e.stun === true && !existing) {
        world.pendingStunHooks.push({ victim: target, source: ctx.caster });
        world.emit("stunApplied", { target, source: ctx.caster, statusId: e.statusId, origin: ctx.origin });
      }
    }
  },
};
