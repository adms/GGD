/**
 * Ability passives — the sync between `AbilityDef.passive` and the entity's
 * `ModifierSource` list.
 *
 * WC3's permanent passives (Critical Strike `AOcr`, Bash `AHbh`, the aura
 * family `AOae`/`AHab`, the attribute buttons `Aamk` …) have `Cool = 0`: they
 * are never cast, they are simply ON once the hero has learned them, and their
 * columns are authored per ability LEVEL. This module is the whole port:
 *
 *   rank 0            -> no source
 *   rank N (N >= 1)   -> one source `abilityPassive:<abilityId>` carrying
 *                        `passive.ranks[N-1]` (clamped to the last entry)
 *
 * It reuses `attachSource`/`detachSource`, so passives ride the same stat
 * pipeline and hook dispatch as items and augments — no new code path, nothing
 * to keep in sync at damage time, and the sync is a pure function of the
 * ability ranks (deterministic, replay-safe).
 *
 * The SIXTH slot rides the same path. A champion's 天生技 (`slot: "PASSIVE"`,
 * `innateKind: "passive"`) is nothing more than an ability whose rank is 1 from
 * spawn, so it needs no new machinery at all — only that `passiveSlot` be
 * included in the sweep below.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilityDef, AbilityPassive } from "../content/defs";
import type { ModifierSource } from "../stats/modifiers";
import { Abilities } from "../content/registry";
import { attachSource, detachSource } from "../stats/statPipeline";
import { hasSourceGrant, sourceGrants } from "../stats/sourceGrants";
import {
  applyAugmentToCritStrike,
  applyAugmentToHooks,
  applyAugmentToModifiers,
  collectAugmentOps,
} from "./abilityAugment";

/** Stable, collision-free source id for one ability's passive. */
export function abilityPassiveSourceId(abilityId: string): string {
  return `abilityPassive:${abilityId}`;
}

/**
 * ⭐ G13-2 —— 一支【切換】技**開著的期間**那一份來源的 id。
 *
 * 刻意和 {@link abilityPassiveSourceId} 分開：70-00 紮根同時是一支切換技與一支
 * 天生技，兩份 payload 可以同時存在（「常駐的芬多精光環」＋「紮根期間防禦×2」），
 * 共用一個 id 的話後掛的那一份會把前一份**擠掉**，而畫面上只是「數字小一點」。
 */
export function abilityToggleSourceId(abilityId: string): string {
  return `abilityToggleOn:${abilityId}`;
}

/** True when the ability can only ever be passive (no castable effects). */
export function isPassiveOnly(def: AbilityDef): boolean {
  return def.passive !== undefined && def.effects.length === 0;
}

/**
 * The champion's 天生技 innate, and it is the PERMANENT-BUFF kind — the ~48 of
 * 108 whose WC3 record has no cooldown and a `[被動]`/`[靈氣]` tag (auras,
 * evasion, on-hit procs, regen, per-kill growth). These apply through
 * `passive.ranks[0]` from spawn and can never be cast.
 */
export function isPassiveInnate(def: AbilityDef): boolean {
  return def.slot === "PASSIVE" && def.innateKind === "passive";
}

/**
 * The champion's 天生技 innate, ACTIVE kind — the ~60 that are real D-slot casts
 * with a cooldown. Owned from level 1 exactly the same way, and CASTABLE since
 * the sixth slot joined `CastableSlot` (see `abilities/innateActive.ts`): they
 * fire through the ordinary `castAbility` ladder and pay a real cooldown.
 *
 * What they must NEVER do is attach a permanent ModifierSource — an active
 * innate is a cast, not a free aura, so `syncAbilityPassives` skips them.
 * Exported so a HUD / sweep can tell the two halves of the slot apart.
 */
export function isActiveInnate(def: AbilityDef): boolean {
  return def.slot === "PASSIVE" && def.innateKind === "active";
}

/**
 * DOUBLE-APPLICATION GUARD.
 *
 * Before the sixth slot existed, seven champion docs carried the 天生技 inline as
 * `champion.passive` — a bare hook/modifier block with no slot, no rank and no
 * ability id. Five of those seven (godie-hart 01-00 怒斬, godie-huth 28-00 無限再生,
 * godie-h02u 92-00 憂鬱的眼神, godie-h02k 89-00 憤怒的門牙, godie-h01u 80-00 飛將神弓)
 * now ALSO have a standalone `<id>.passive` doc carrying THE SAME ABILITY. Wiring
 * the innate on without this guard would hand 無限再生 +24 hp/s instead of +12 and
 * give 怒斬 two independent 15 % proc rolls per swing.
 *
 * The other two (thorne "Barkskin", sela "Kindling") are demo-skeleton champions
 * with no `NN-00` and no `passiveAbility`, so their legacy block is the ONLY
 * definition and must survive untouched.
 *
 * Resolution follows the project's standing rule (see `registerChampion`): THE
 * STANDALONE DOC IS THE SOURCE OF TRUTH. When one exists and is the permanent
 * kind, the inline block is its superseded shadow and is not attached. When the
 * innate is `"active"` the inline block is NOT superseded — an active innate
 * grants no permanent buff, so dropping it would silently delete a real effect.
 */
export function innateSupersedesLegacyPassive(champ: {
  passive?: unknown;
  passiveAbility?: string;
}): boolean {
  if (!champ.passive || champ.passiveAbility === undefined) return false;
  const innate = Abilities.tryGet(champ.passiveAbility as never) as AbilityDef | undefined;
  return innate !== undefined && isPassiveInnate(innate) && innate.passive !== undefined;
}

/**
 * 一份 rank 區塊 → 一個 `ModifierSource`（或 null = 這個 rank 什麼都不給）。
 *
 * ⭐ 2026-08-10：參數化成 `(p, sourceId)`，因為現在有**兩種**載體走這條路 ——
 * `AbilityDef.passive`（天生技 / 被動技，永久）與 `AbilityToggle.whileOn`
 *（切換技開著的期間）。⛔ 不是兩份程式：形態閘、空值測試、六種授予的轉發、
 * 跨技能強化的四個面全部只有一份，所以「開著期間才有的格擋」不用等第二次接線
 *（第零守則⑨：N 個同型 = K 個模板）。
 */
function rankBlock(
  world: SimWorld,
  id: EntityId,
  def: AbilityDef,
  p: AbilityPassive,
  rank: number,
  sourceId: string,
): ModifierSource | null {
  if (rank <= 0 || p.ranks.length === 0) return null;
  const block = p.ranks[Math.min(rank, p.ranks.length) - 1]!;
  // 形態閘 (task #249). Absent / "any" = attached in both bodies, which is every
  // passive authored before the field existed.
  //
  // Read STRAIGHT off `world.championForm` rather than through
  // `ChampionFormSystem.championFormIndex`: that module imports THIS one (its
  // `setBody` calls `syncAbilityPassives`, which is what makes this gate live),
  // and importing back would close a genuine runtime cycle. The expression is
  // the same one-liner that helper is, and `championForm.test.ts` pins the
  // contract that absence means the base body.
  const want = block.whileForm ?? "any";
  if (want !== "any") {
    const inAlternate = (world.championForm.get(id)?.index ?? 0) === 1;
    if ((want === "alternate") !== inAlternate) return null;
  }
  // An AURA-ONLY passive is a real passive: `79-00 靈壓` grants its carrier no
  // stat at all, it only debuffs everyone standing near them. Without `auras`
  // in this emptiness test the source would never be attached and the aura
  // would never be emitted (auraSystem reads the ATTACHED sources).
  //
  // 隱形 / 真視 is the SECOND payload that grants nothing on the stat table
  // (`vision`, sim/stealth.ts). It has to be in this emptiness test for the
  // same reason `auras` had to be: 27-00 永久性的隱形術 and 16-00 通靈能力 have
  // an EMPTY `modifiers` array by design — there is no stat for 「看不看得見」 —
  // so without this clause the source would never attach, `stealthSystem` would
  // never find a grant, and the whole feature would be dead content with every
  // test still green (failure form ②).
  // 【跨技能強化】—— 持有者身上有沒有別的技能指名改寫**這一支**的數字
  // （59-001 改 59-00 的門檻、77-002 改 77-02 的機率…）。
  //
  // ⭐ 位置是刻意的：就在 source 被組出來的前一刻，套在**這一份 clone** 上。
  // 理由和 `whileForm` 形態閘完全相同 —— `syncAbilityPassives` 是 detach +
  // attach，而它在升級 / EX 解鎖 / 變身時都會重跑，所以「學會強化技的那一刻
  // 被強化的那支就變強」不需要第二條通知路徑。
  // ⛔ 不可以就地改 `block.hooks`：那是註冊表裡的那一份，改下去會跨英雄、跨場次。
  //
  // ⭐ 2026-08-10（G6）—— 這裡從**一面**變成**三面**：hooks（機率／持續／係數）、
  // modifiers（`op:"modifierValue"` 改加成量）、grants（暴擊來源的機率）。
  // 上一版註解說的「只有這一個 seam 接上了」已經過期 —— 主動施放那一面在
  // `abilitySystem.ts::castAbility` 與 `systems/CastResolveSystem.ts`。
  // ⛔ 三行都走 `abilityAugment.ts` 的同一組 applier，不是三段就地展開的 if。
  const augmentOps = collectAugmentOps(world, id, def.id);
  const hooks = applyAugmentToHooks(block.hooks, augmentOps);
  const modifiers = applyAugmentToModifiers(block.modifiers, augmentOps);
  const critStrike = applyAugmentToCritStrike(block.critStrike, augmentOps);

  if (
    !modifiers?.length &&
    !hooks?.length &&
    !block.auras?.length &&
    !block.vision &&
    // 飛行 is the THIRD payload with an empty `modifiers` array by design
    // (04-00 翔封界 grants no stat at all — see sim/flight.ts). Same clause,
    // same reason as `auras` and `vision`: without it the source never attaches,
    // `flightSystem` never finds a grant, and the whole feature is dead content
    // with every test still green (failure form ②).
    !block.flight &&
    // 格擋 is the FOURTH payload with an empty `modifiers` array by design, and
    // the two docs that need it are BOTH 招牌被動 whose whole text is the block:
    // 20-00 銀色甲胄 「有30%[機率][格擋]100%魔法([AP])傷害」 and 79-002 虛化.
    // Same clause, same reason: without it the source never attaches,
    // `blockCutFor` never finds a grant, and 「技能授予格擋」 is dead content
    // with every test still green (failure form ②).
    //
    // ⭐ 2026-08-09：`!block.block` 換成 `!hasSourceGrant(block)`（GH#299 第 2 條）。
    // ⛔ 不是「多加一個 `&& !block.critStrike`」—— 那是這條註解已經寫過四次的
    // 同一個坑（auras / vision / flight / block 各踩一次），而每一次都是**加一格
    // 就要記得回來改這裡**。第七個授予出現時，只要它進了 `SourceGrantFields`，
    // 這一行不用再動一次。
    !hasSourceGrant(block)
  )
    return null;
  return {
    id: sourceId,
    kind: "passive",
    // ⭐ G4 —— **這一份來源是第幾階授予的**。`fireHooks` 讀它來決定 hook payload
    // 的 rank（在它之前那裡寫死 `rank: 1`）。
    //
    // ⚠️ 這是四條載體裡**唯一**真的有「階」的那一條，也是抄寫稅的來源：少了它，
    // 一支七階被動的作者要在 `passive.ranks[]` 的每一階各抄一份同樣的 hook 只為了
    // 換掉裡面那個數字，而抄漏一階不會紅（那一階安靜地付第 1 欄）。
    // ⛔ 不從 `world.abilities` 回頭查 —— 理由寫在 `fireHooks` 的那一行上。
    grantRank: Math.max(1, rank),
    ...(modifiers ? { modifiers: modifiers as typeof block.modifiers } : {}),
    ...(hooks ? { hooks: hooks as typeof block.hooks } : {}),
    ...(block.auras ? { auras: block.auras } : {}),
    ...(block.vision ? { vision: block.vision } : {}),
    ...(block.flight ? { flight: block.flight } : {}),
    // 格擋 rides the source untouched, exactly as `vision` / `flight` do —— 這是
    // 「技能也能授予格擋」的**整條**接線,而不是第二套 block 邏輯。
    // 讀它的只有 `combat/damage.ts` 的佇列抽乾迴圈(透過 `combat/block.ts::
    // blockCutFor`),它走 `StatsComp.sources` 而**不看 `kind`**,所以一支技能
    // 授予的格擋與 `economy/itemSource.ts` 寫進來的那一份走同一條鏈、同一組
    // 型別過濾、同一個致死判定、同一個內部冷卻。⛔ 不要在 sim 裡為技能格擋開
    // 第二條分支:那會變成「兩個可以各自為真的東西」。
    //
    // ⚠️ `internalCooldown` 的記帳(`ModifierSource.blockLastFired`)住在
    // **source 上**,而 `syncAbilityPassives` 是 detach + attach —— 所以每一次
    // 升級 / EX 解鎖 / 變身都會把這個來源的格擋冷卻**歸零**(那正是
    // `economy/itemSource.ts::syncItemSources` 之所以改成 IN PLACE 的同一個
    // 缺陷形態)。今天出貨的兩支技能格擋都**沒有** `internalCooldown`
    // (20-00 與 79-002 的文案都只寫機率),所以這是**當下不可觀測**的;
    // 一旦有人 author 了一支帶 ICD 的技能格擋,修法是把舊 source 的
    // `blockLastFired` 在重新掛上時搬過去(純量,沒有索引可以錯位 ——
    // 見 `stats/modifiers.ts` 對這一格的說明),不是在這裡加第二個時鐘。
    //
    // ⭐ 2026-08-09:`critStrike` 從這裡一起轉發(GH#299 第 2 條)——
    // 「一條自己的機率 + 自己的倍率」的暴擊來源在此之前只有道具寫得出來。
    // ⛔ 一份轉發,不是兩行 —— 見 `stats/sourceGrants.ts` 檔頭。
    ...sourceGrants(block),
    // ⭐ G6-4 —— 【跨技能強化】改寫過的暴擊機率覆蓋上去。位置在 `sourceGrants`
    // **之後**是承重的：那一份轉發的是註冊表裡的原值，寫在前面會被它蓋回去，
    // 而畫面上只是「機率沒有上升」（失敗形態②）。
    // ⛔ 不要改成在 `sourceGrants` 之前 —— 沒有強化時 `critStrike === block.critStrike`
    // （同一個參照），所以這一行對 1,900 份既有文件逐鍵不變。
    ...(critStrike !== undefined ? { critStrike } : {}),
  };
}

/**
 * Reconcile every ability-passive source on `id` with the entity's CURRENT
 * ability ranks. Idempotent: safe to call on spawn, on rank-up and on EX
 * unlock. Iterates Q/W/E/R then EX in fixed order so the `sources` array (and
 * therefore Override resolution + hook firing order) is deterministic.
 */
export function syncAbilityPassives(world: SimWorld, id: EntityId): void {
  const ab = world.abilities.get(id);
  if (!ab) return;

  const instances: { abilityId: string; rank: number }[] = [];
  for (const slot of ["Q", "W", "E", "R"] as const) {
    const inst = ab.slots[slot];
    instances.push({ abilityId: inst.abilityId, rank: inst.rank });
  }
  if (ab.exSlot) instances.push({ abilityId: ab.exSlot.abilityId, rank: ab.exSlot.rank });
  // The 天生技 innate goes LAST and unconditionally: it is rank 1 from spawn, so
  // unlike Q/W/E/R there is no "not learned yet" state to wait for. Fixed
  // position keeps `sources` ordering (and therefore Override resolution + hook
  // firing order) deterministic.
  if (ab.passiveSlot)
    instances.push({ abilityId: ab.passiveSlot.abilityId, rank: ab.passiveSlot.rank });

  for (const inst of instances) {
    const def = Abilities.tryGet(inst.abilityId as never) as AbilityDef | undefined;
    if (!def?.passive) continue;
    // An ACTIVE innate is a real cast, not a permanent buff — so by DEFAULT its
    // `passive` block is not attached (a 40 s nuke must not become a free aura).
    //
    // ⭐ G13-1（2026-08-10）—— 但那是一個**決策**，不是一條物理定律，and WC3 真的
    // 有這一族：70-00 紮根 = 15 秒冷卻的 D 槽主動技 **加上**一圈常駐芬多精光環。
    // 在這一格出現之前，那種天生技的 passive 區塊**永遠掛不上去**（實測
    // `stats.sources` 是空的），所以「切換開著時 防禦×2」這種**相對**加成在
    // 天生技槽位上結構性寫不出來。第一守則：決策點變欄位，預設值選今天的行為。
    // ⛔ `!== "attach"` 而不是 `=== "skip"` —— 省略要走 skip 那一邊。
    if (isActiveInnate(def) && def.innateActivePassive !== "attach") continue;
    const sourceId = abilityPassiveSourceId(def.id);
    const want = rankBlock(world, id, def, def.passive, inst.rank, sourceId);
    // Always detach first: a rank-up must REPLACE the previous rank's block,
    // never stack with it.
    detachSource(world, id, sourceId);
    if (want) attachSource(world, id, want);
  }
}

/**
 * ⭐ G13-2 —— 一支【切換】技**打開**的那一刻，掛上 `toggle.whileOn` 那一份加成。
 *
 * 由 `abilities/toggle.ts::enterToggle` 呼叫，也就是**唯一的開啟出口**。
 * 缺席 `whileOn` = 嚴格 no-op（連 detach 都只是找不到就回 false），所以出貨的
 * 兩支切換技在內容補上這一格之前逐位元不變。
 *
 * ⚠️ 它走的是**和天生技一模一樣的** {@link rankBlock}：同一個形態閘、同一組
 * 六種授予轉發、同一組跨技能強化。所以「紮根期間才有的格擋」「風王結界期間
 * 才有的 on-attack orb」不需要第二次接線 —— 那正是 `whileOn` 重用
 * `AbilityPassive` 而不是另開一份 `EffectDef[]` 的整個理由。
 *
 * ⚠️ 已知邊界（schema 明說）：`syncAbilityPassives` **不碰**這條來源，所以
 * 開著的時候升級不換 rank。⛔ 不要順手在 `syncAbilityPassives` 裡補一格 ——
 * 那會讓「升級」變成一條會偷偷重置切換態的路徑。
 */
export function attachToggleWhileOn(
  world: SimWorld,
  id: EntityId,
  def: AbilityDef,
  rank: number,
): void {
  const w = def.toggle?.whileOn;
  const sourceId = abilityToggleSourceId(def.id);
  // 先 detach：重複開啟（理論上 `enterToggle` 擋掉了）不可以疊兩份。
  detachSource(world, id, sourceId);
  if (!w) return;
  const want = rankBlock(world, id, def, w, rank, sourceId);
  if (want) attachSource(world, id, want);
}

/**
 * ⭐ G13-2 —— 關閉時卸下那一份加成。由 `toggle.ts::exitToggle`（**唯一**的關閉
 * 出口，手動與 MP 不足自動關閉共用）呼叫，所以「關掉之後加成還留著」在結構上
 * 不可能發生。
 *
 * `whileOnDuringExit` 決定的**只是順序**（在 `onExit` 之前還是之後卸下），
 * 不是「會不會卸下」—— 見 `sim/content/defs.ts` 上那一格。
 */
export function detachToggleWhileOn(world: SimWorld, id: EntityId, abilityId: string): void {
  detachSource(world, id, abilityToggleSourceId(abilityId));
}
