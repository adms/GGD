/**
 * `applyBuff` — attach a timed ModifierSource (optionally a STACKING one).
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import type { SimWorld } from "../SimWorld";
import type { EntityId } from "../../ids";
import { attachSource, detachSource } from "../stats/statPipeline";
import { sourceGrants } from "../stats/sourceGrants";
import { ModOp, type ModifierSource } from "../stats/modifiers";
import { allModifiersDownward } from "../negativePolarity";
import type { StatsComp } from "../stats/statsComp";
import type { Stat } from "../stats/statTypes";
import type { EffectOf } from "./effectKind";

/**
 * ⭐ S4b —— **這一份來源自己**貢獻了多少（`maxStat.basis: "thisSource"`）。
 *
 * 折法與 `statPipeline.recomputeStats` 的那一段**逐項相同**（`value × stacks`、
 * `PercentMult` 線性），只是把 base 換成 0：問的是「這份增益疊出來的量」而不是
 * 「這個人的面板現在是多少」。
 *
 * ⚠️ 一份**只有百分比**的來源在這裡是 0 —— 百分比疊出來的絕對量取決於底值，
 * 而底值正是 `basis: "final"` 讀的那個東西。所以那種卡的上限要用 `final` 寫，
 * 這一格算得出來的是 80-00「每次擊殺 +1 攻擊距離、上限 10」那個形狀。
 */
function sourceStatAmount(src: ModifierSource, stat: Stat): number {
  const stacks = src.stacks ?? 1;
  let flat = 0;
  let pctAdd = 0;
  let pctMult = 1;
  for (const m of src.modifiers ?? []) {
    if (m.stat !== stat) continue;
    if (m.op === ModOp.Flat) flat += m.value * stacks;
    else if (m.op === ModOp.PercentAdd) pctAdd += m.value * stacks;
    else if (m.op === ModOp.PercentMult) pctMult *= 1 + m.value * stacks;
  }
  return flat * (1 + pctAdd) * pctMult;
}

/**
 * ⭐ S4b —— 這條加成**已經頂到天花板**了嗎（頂到就拒絕再疊）。
 *
 * ⚠️ 語意是**只 refuse、不回收也不夾取**，逐字沿用 `grantAttribute.maxAttribute`
 * 的既有先例：最後一層可能小幅越線，換到的是「玩家不會看到自己的數字被倒扣」。
 * ⛔ 拒絕的是**整發**（含這份 buff 的其他 modifier）—— 「這條加成加到 X 就停」
 * 的自然讀法是那一發不再生效，而不是把同一份來源拆成生效的一半與不生效的一半。
 */
function maxStatReached(
  sc: StatsComp,
  cap: NonNullable<EffectOf<"applyBuff">["maxStat"]>,
  existing: ModifierSource | undefined,
): boolean {
  const now =
    cap.basis === "thisSource"
      ? existing === undefined
        ? 0
        : sourceStatAmount(existing, cap.stat)
      : // 省略 = `final` = 玩家面板上那個最終值（#125「顯示的就是拿到的」）。
        (sc.final[cap.stat] ?? 0);
  return now >= cap.value;
}

/**
 * ⭐ G5（`state.exclusive-group@1`）—— 「身上同一組只會有一份」。
 *
 * 回 `false` = **這一份不要掛**（`exclusiveOnExisting: "reject"` 且同組已經有人）。
 *
 * ⛔ 為什麼不是 `stackKey`：同 key 的第二次施加只把 `stacks` 加一，並且沿用
 * **第一份** source 的 `modifiers`（本檔上面那段疊層路徑），所以「戰型 A → 戰型 B」
 * 會拿到 A 的數值配 B 的名字。互斥要的是**換掉整份來源**，不是加一層。
 *
 * ⛔ 這裡也不是「三個 3D 形態」：換身體仍然走 `championForm` /
 * `transform.counterpartId`。本函式只動 gameplay state（`sc.sources` 這一層），
 * 15-02/03/04 三支要的「屬性不再相乘」全部發生在這裡。
 *
 * `keepId` 是這一發**自己**要用的 source id：疊層路徑的第二發與第一發同 id，
 * 少了這個排除，一支同時填 `stackKey` 與 `exclusiveGroup` 的技能會在每一次疊層
 * 時先把自己整份拔掉，層數永遠停在 1 —— 而畫面上跟正常一模一樣（失敗形態②）。
 *
 * 過期的來源不算數（`buffExpirySystem` 是在它自己的相位收的，同一 tick 內可能
 * 還躺在陣列上）；`expiresAtTick === undefined` = 永久 = 一定算數。
 */
function enforceExclusiveGroup(
  world: SimWorld,
  target: EntityId,
  group: string,
  onExisting: "replace" | "reject" | undefined,
  keepId: string,
): boolean {
  const sc = world.stats.get(target);
  if (!sc) return true;
  const held = sc.sources.filter(
    (s) =>
      s.exclusiveGroup === group &&
      s.id !== keepId &&
      (s.expiresAtTick === undefined || s.expiresAtTick > world.tick),
  );
  if (held.length === 0) return true;
  // 省略 = `"replace"`（抄 `shield.onExisting` 的預設）：新的接手。
  if ((onExisting ?? "replace") === "reject") return false;
  for (const s of held) detachSource(world, target, s.id);
  return true;
}

export const applyBuffEffect: EffectKindSpec<"applyBuff"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // rank-indexed variant wins when authored (WC3 buff columns are per
    // ability level); clamp past the last entry so a GGD maxRank beyond the
    // native level count keeps the highest authored row instead of vanishing.
    const rk = e.perRank?.[Math.min(Math.max(1, ctx.rank), e.perRank.length) - 1];
    const modifiers = rk?.modifiers ?? e.modifiers;
    const duration = rk?.duration ?? e.duration;
    /**
     * ⭐ GH#662 —— **極性在這裡定案，⛔ 不在淨化發生的那一刻**。
     *
     * 位置是承重的：`ModifierSource.polarity` 的語意逐字是「住在**施加的那一刻**
     * 寫下的欄位，不是事後推導的」。在 `clearPools` 那一頭推論的話，同一份來源
     * 對「淨化」與對「免疫」會各推一次，而它們遲早分歧（`condition.ts` 已經為
     * 同型的問題留過警告）。這裡推一次，全引擎讀同一格。
     *
     * ⚠️ 讀的是**解析後**的 `modifiers`（perRank 贏過扁平那一組）—— 一支
     * 逐階授予的減速在 rank 3 才變成純負向是真的會發生的，讀 `e.modifiers`
     * 會對那幾階說謊。
     *
     * ⛔ **兩格一起推，不是只推極性**：出貨 28 份標了 `polarity:"debuff"` 的
     * applyBuff **每一份**也都寫了 `dispellable: true`，也就是作者一直在手動
     * 繞過 `buffDefaultDispellable`（出貨 false）。只推極性的話會撞上那道閘，
     * 結果**一筆都拔不掉**，而畫面上跟沒修一模一樣（失敗形態②）。
     * ⚠️ 作者明寫的 `dispellable: false` 仍然贏 —— 內部冷卻記帳那一族
     *（`devour-cooldown`）就是靠它不被自我淨化吃掉。
     */
    const inferDebuff =
      world.dispelRules.inferDebuffFromNegativeModifiers &&
      e.polarity === undefined &&
      allModifiersDownward(modifiers);
    const polarity = inferDebuff ? "debuff" : e.polarity;
    const dispellable = inferDebuff ? (e.dispellable ?? true) : e.dispellable;
    /**
     * ⭐ S4a —— `undefined` = **永久**。`ModifierSource.expiresAtTick` 缺席時
     * `buffExpirySystem` 的 `s.expiresAtTick !== undefined &&` 那一半就永遠不會
     * 收它（引擎層從第一天就做得到，缺的一直是 authoring 面）。
     * ⛔ 這裡不可以退回 `?? 0`：那會讓一份 `permanent: true` 的文件掛上一個
     * **同一 tick 就過期**的增益 —— schema 收得下、卡片寫著永久、遊戲裡什麼都
     * 沒有（失敗形態②）。
     * ⚠️ `permanent` 與 `duration` 互斥且必填其一（schema 的 `refineApplyBuff`），
     * 所以 `duration === undefined && permanent !== true` 進不到這裡。
     */
    const expiresAtTick =
      e.permanent === true || duration === undefined
        ? undefined
        : world.tick + Math.round(duration / world.dt);
    /**
     * ⭐ GH#354 / G3 —— 「永久，但只到這一回合結束」。
     *
     * ⚠️ 只有在真的沒有到期 tick 時才掛：一份帶秒數的增益本來就會自己到期，
     * 標上它只會多一個永遠不會被讀到的旗標（schema 的 refine 也把這種寫法擋在
     * 載入時，這裡是同一條規矩的第二道 —— 引擎不可以依賴 schema 曾經跑過）。
     * ⛔ 這裡**不**換算成任何 tick：回合長度是 host 相位機的事，見檔頭。
     */
    const roundScoped = expiresAtTick === undefined && e.permanentScope === "round";
    /**
     * ⭐ S9b —— 落在誰身上。省略 = `ctx.targets` = 今天（240 份既有文件逐位元
     * 不變）。它解鎖的是「**一條** hook 讀敵人狀態、增益自己」：拆成兩條 hook
     * 的話 ICD 記在 `src.hookLastFired[hi]`（逐 hook 一格）、機率也逐 hook 各抽
     * 一次，所以「30% 機率對帶恐懼的敵人追加傷害**並且**自己加攻速」寫成兩條會
     * 有 9% 的情況只發生一半，而畫面上看不出來。
     * ⛔ 與其他九個 kind 用同一格語意（`applyStatus` / `restore` / `blink` …）。
     */
    const subjects = e.applyTo === "self" ? [ctx.caster] : ctx.targets;
    for (const target of subjects) {
      // ⭐ S4b —— 天花板在**任何一條掛載路徑之前**問，而且問的是**這個身體**
      // （`final` 逐英雄不同，`thisSource` 逐身體各自疊）。頂到了就整發不生效。
      if (e.maxStat !== undefined) {
        const sc0 = world.stats.get(target);
        if (!sc0) continue;
        const held =
          e.stackKey !== undefined
            ? sc0.sources.find((s) => s.id === `buff:stack:${e.stackKey}`)
            : undefined;
        if (maxStatReached(sc0, e.maxStat, held)) continue;
      }
      // ⭐ G5 —— 互斥組先結算，**在任何一條掛載路徑之前**。位置是刻意的：拔除
      // 必須發生在新的那一份掛上之前，否則「先掛再拔」會有一個 tick 的縫，而
      // `statRecomputeSystem` 在那個縫裡就會把兩份乘起來一次。
      const selfId =
        e.stackKey !== undefined ? `buff:stack:${e.stackKey}` : `buff:${ctx.origin}#${world.tick}`;
      if (
        e.exclusiveGroup !== undefined &&
        !enforceExclusiveGroup(world, target, e.exclusiveGroup, e.exclusiveOnExisting, selfId)
      ) {
        continue; // `reject`：同組已經有一份，這一發整個不生效。
      }
      // #244 STACKING PATH: one source per key, `stacks` counts applications.
      // Fixes the same-tick collision the id below has (two mobs killed by one
      // AoE on one tick used to overwrite each other and only pay once) and
      // keeps the source list O(1) instead of one entry per proc.
      if (e.stackKey !== undefined) {
        const sc = world.stats.get(target);
        if (!sc) continue;
        // ⛔ 一份 id，不是兩份 —— `selfId` 就是這一格（見上）。兩份字面值分歧的
        // 那一天，互斥組會把疊層來源當成「別人」而每次疊層都先拔掉自己。
        const id = selfId;
        const existing = sc.sources.find((s) => s.id === id);
        if (existing) {
          const cap = e.maxStacks ?? Number.POSITIVE_INFINITY;
          existing.stacks = Math.min((existing.stacks ?? 1) + 1, cap);
          // ⭐ S4a：永久那一份**不回寫**到期時間。少了這道判斷，一份永久的疊層
          // 增益會在作者混用時被寫回一個有限的到期 tick —— 而 80-00「每次擊殺
          // +1 層、永久」正是走疊層路徑的那個形狀。
          if (expiresAtTick !== undefined) existing.expiresAtTick = expiresAtTick;
          sc.dirty = true;
        } else {
          attachSource(world, target, {
            id,
            kind: "buff",
            modifiers,
            // ⭐ G4 —— 這一份 buff 是**第幾階的施放**授予的，`fireHooks` 讀它來
            // 決定 hook payload 的 rank。⚠️ 疊層路徑也要帶（理由與下面 `hooks`
            // 逐字相同）；同一格的既有 source 不回寫，因為第一次施放的那一階才是
            // 這一疊的身分（`hookLastFired` 也是那一份）。
            grantRank: Math.max(1, ctx.rank),
            // Carried on the STACKING path too — dropping it here would make
            // `hooks` silently inert the moment an author also set `stackKey`
            // (失敗形態 ②). One shared source ⇒ one shared `hookLastFired`,
            // which is the honest reading of "one stack of one buff".
            ...(e.hooks !== undefined ? { hooks: e.hooks } : {}),
            // 【淨化】的兩格 —— GH#295。⚠️ 疊層路徑也要帶，理由與上面 `hooks`
            // 同一條：一支技能一旦也填了 `stackKey`，這兩格就會靜默失效，
            // 而畫面上跟正常一模一樣（失敗形態 ②）。
            // ⭐ GH#662 —— 走上面推論過的那兩格，⛔ 不是 `e.*`：疊層路徑漏掉推論的話，
            // 一支同時也填了 `stackKey` 的減速就是免疫不掉的那一支,而它與不填 stackKey 的
            // 鄰居畫面上一模一樣（與上面 hooks / statusId 逐字相同的形狀）。
            dispellable,
            polarity,
            // 格擋 / 暴擊來源（GH#299 第 2 · 6 條）。⚠️ 疊層路徑也要帶，理由與
            // 上面 `hooks` 逐字相同：一支技能一旦也填了 `stackKey`，這兩格就會
            // 靜默失效，而畫面上跟正常一模一樣（失敗形態 ②）。
            // ⛔ 一份轉發，不是四份 —— 見 `stats/sourceGrants.ts` 檔頭。
            ...sourceGrants(e),
            // ⭐ G5 —— 掛在**來源**上，因為互斥是那一份來源的性質；聚合成
            // `sc.final` 的那一刻它就沒了（同 `grantRank` / `evasionScope`）。
            ...(e.exclusiveGroup !== undefined ? { exclusiveGroup: e.exclusiveGroup } : {}),
            // ⭐ G10 —— 這一份來源**同時是那個具名標記**。⚠️ 疊層路徑也要帶：
            // 少了這一行，一支同時填了 `stackKey` 的【破甲】會有數值而沒有標記，
            // 於是「他身上有沒有破甲」永遠讀 false，而護甲確實在掉（失敗形態②）。
            // ⭐ 疊層路徑上 `stacks` 直接就是 `condition.status.minStacks` 問的
            // 那個層數 —— 一個計數器，不是兩個。
            ...(e.statusId !== undefined ? { statusId: e.statusId } : {}),
            ...(expiresAtTick !== undefined ? { expiresAtTick } : {}),
            // ⭐ GH#354 / G3 —— 疊層路徑也要帶，理由與上面 `hooks` / `statusId`
            // 逐字相同：一支技能一旦也填了 `stackKey`，這一格就會靜默失效，
            // 於是一份本來只有一回合的疊層增益整場留著（失敗形態②）。
            // ⚠️ 同一格的既有 source **不回寫** —— 與 `expiresAtTick` 同一條
            // （第一次施放寫下的身分才是這一疊的身分）。
            ...(roundScoped ? { roundScoped: true } : {}),
            stacks: 1,
            ...(e.stackVisual ? { visualStacks: true } : {}),
          });
        }
        continue;
      }
      // ⭐ GH#354 / G1 —— **複利疊層也要吃得到 `maxStacks`**（owner 2026-08-17 的
      // 20 件 [EX解放] 裡有 8 件是這個形狀：「每層 ×1.04，最多 6 層」）。
      //
      // ⚠️ 在這一行之前，`maxStacks` 的夾取**只寫在上面 `if (e.stackKey !== undefined)`
      // 區塊裡**，所以不填 stackKey 的那條路（＝真正的複利路徑，N 份來源乘起來就是
      // (1+v)^N，見 `ModOp.PercentMult` 的檔頭）完全不讀它。後果是作者只能二選一：
      //   · 填 stackKey → 有上限，但 `statPipeline` 折算成 `1 + v×stacks`（**線性**）
      //   · 不填        → 真的複利，但**沒有上限**，而且 schema 收得下 `maxStacks`
      //                   ⇒ 卡片上寫著「最多 6 層」，遊戲裡疊到無限（失敗形態②）
      //
      // ⛔ 修法**不是**讓折算式變複利（那會改掉每一張既有的疊層卡）。這裡只補上
      // 缺的那一半：同一個 origin 已經掛了幾份，滿了就 refuse。
      // ⚠️ 用 **id 前綴**數，⛔ 不是數 `sources.length` —— 一個單位身上同時有道具、
      // 技能、增益卡的來源，數全部會讓別人的 buff 把這一張的額度吃掉。
      if (e.maxStacks !== undefined) {
        const sc = world.stats.get(target);
        if (sc) {
          const prefix = `buff:${ctx.origin}#`;
          let held = 0;
          for (const src of sc.sources) if (src.id.startsWith(prefix)) held++;
          // ⚠️ `>=` 不是 `>`：`maxStacks: 6` 是「最多六份」，第七份要被擋掉。
          if (held >= e.maxStacks) continue;
        }
      }
      attachSource(world, target, {
        id: selfId,
        kind: "buff",
        modifiers,
        // ⭐ G4 —— 見上面疊層路徑那一格：`fireHooks` 以這一階求值這份 buff 帶的
        // hook payload，所以「rank 3 的大招給的增益，它的觸發也是 rank 3 的量」。
        grantRank: Math.max(1, ctx.rank),
        // A buff may also grant a TEMPORARY PROC (`hooks`). `fireHooks` already
        // walks `src.hooks` and already skips a source past its
        // `expiresAtTick`, so the window needs no second clock — and because
        // `hookLastFired` is per-source-INSTANCE, an `internalCooldown` on one
        // of these reads 「這次施放最多觸發幾次」, not a global cooldown.
        ...(e.hooks !== undefined ? { hooks: e.hooks } : {}),
        // 【淨化】能不能拔掉這一份增益（GH#295），以及它的極性。
        // ⛔ 兩格都是**施加時寫下**（就是本函式開頭那兩行），⛔ 不是在淨化那一頭
        // 才推導 —— 一個來源可以同時帶 `{ms,+0.3}` 與 `{armor,-0.5}`，
        // 而**混了方向的一律不推論**（`allModifiersDownward` 對它們回 false）。
        // 缺席的語意：`dispellable` → `dispelRules.buffDefaultDispellable`（出貨
        // false）；`polarity` → 無極性 = 有方向的淨化拔不到它。
        // ⭐ GH#662 —— 推論過的那兩格（見本函式開頭）。
        dispellable,
        polarity,
        // 【限時格擋 / 限時暴擊來源】(GH#299 第 2 · 6 條) —— 主動技能與「接下來
        // N 秒」兩個授權格的同一個答案。到期走這份 buff 自己的 `expiresAtTick`
        // （`blockCutFor` 與 `rankedGrants` 都已經在跳過過期的 source），所以
        // 這裡沒有第二個時鐘。⛔ 一份轉發 —— 見 `stats/sourceGrants.ts` 檔頭。
        ...sourceGrants(e),
        // ⭐ G5 —— 同上，掛在來源上。
        ...(e.exclusiveGroup !== undefined ? { exclusiveGroup: e.exclusiveGroup } : {}),
        // ⭐ G10 —— 標記與數值是同一個物件（檔頭）。到期／淨化／detach 只有一次
        // 串接，因為沒有第二個物件可以忘記拆。
        ...(e.statusId !== undefined ? { statusId: e.statusId } : {}),
        ...(expiresAtTick !== undefined ? { expiresAtTick } : {}),
        // ⭐ GH#354 / G3 —— 「永久，但只到這一回合結束」。owner 的 20 件裡
        // 5 件寫著「本回合內」而沒有秒數，這是它們唯一寫得出來的形狀。
        ...(roundScoped ? { roundScoped: true } : {}),
      });
    }
    // ONE discrete `buffApply` cue for the status-up (audio COMBAT-AUDIO): the
    // client plays the 增益 cast on the first buffed target. Fired only when a
    // buff actually attached, so an empty target set makes no sound.
    // ⭐ S9b —— 讀 `subjects` 而不是 `ctx.targets`：一發 `applyTo:"self"` 的自我
    // 增益在沒有目標時仍然掛得上，音效卻靜音的話，玩家會以為技能沒放出去。
    if (subjects.length > 0) {
      world.emit("buffApply", {
        source: ctx.caster,
        target: subjects[0],
        origin: ctx.origin,
      });
    }
  },
};
