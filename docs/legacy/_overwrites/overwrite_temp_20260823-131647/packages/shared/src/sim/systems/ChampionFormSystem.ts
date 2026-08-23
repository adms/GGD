/**
 * ChampionFormSystem (task #249 變身) — owns the 第二形態 body swap: entering a
 * form, the ABSOLUTE-tick expiry, and the three forced reverts (death, combat
 * end, an unresolvable body).
 *
 * ---------------------------------------------------------------------------
 * WHAT A TRANSFORM IS HERE
 * ---------------------------------------------------------------------------
 * The source map's 26 transforms are WC3 **Metamorphosis** pairs — `Eme1`
 * (normal unit rawcode) ⇄ `Emeu` (alternate unit rawcode) — and every alternate
 * is a COMPLETE second unit definition in `war3map.w3u`: its own hp, armor,
 * attack speed, attack range, movement type and model (content/championForms.ts
 * carries the shipped table and the direction proof). So a transform is not a
 * buff: it is "resolve this entity through the OTHER champion doc from now on".
 *
 * The swap is therefore IN PLACE — same `EntityId`, same `ChampionComp` (level,
 * xp, gold, items, augments, 三圍, stat-path progress), same `AbilitiesComp`
 * (cooldowns keep running), same `Health` object. Only the champion id changes.
 *
 * ---------------------------------------------------------------------------
 * THE TWO IDS THAT MUST MOVE TOGETHER — the trap this module exists to not be
 * ---------------------------------------------------------------------------
 * A champion's id is stored TWICE, and the two have different readers:
 *
 *   `ChampionComp.championId`  — read by the snapshot every tick
 *                                (`Champions.get(champ.championId).modelKey`,
 *                                apps/game-server/src/net/snapshot.ts), by the
 *                                hit-feel lookups in combat/damage.ts and
 *                                BasicAttackSystem, and by offer eligibility.
 *   `StatsComp.championId`     — read by `recomputeStats`
 *                                (`Champions.get(sc.championId)`,
 *                                stats/statPipeline.ts). It is the ONLY input
 *                                that decides the entity's base stats.
 *
 * Writing only the first gives a body that LOOKS transformed and fights with
 * the old form's hp/armor/attack speed/range — the entire point of the feature,
 * silently missing, with every "did the model change?" test green. Both are
 * written by {@link setBody} and nowhere else.
 *
 * ---------------------------------------------------------------------------
 * THE REGISTRY GUARD — why every path goes through `Champions.tryGet`
 * ---------------------------------------------------------------------------
 * `Registry.get()` THROWS on an unregistered id (sim/content/registry.ts), and
 * the snapshot calls it for every champion entity EVERY TICK. So a swap to a
 * body with no champion doc does not "fail to render" — it takes the whole room
 * down, once per tick, forever. Every write here is gated on a successful
 * `Champions.tryGet` of the DESTINATION id; a miss changes nothing and answers
 * the player through the existing P7 cast-feedback path (`castRejected`, task
 * #181) instead of throwing.
 *
 * ---------------------------------------------------------------------------
 * ABSOLUTE TICK, NEVER A COUNTDOWN
 * ---------------------------------------------------------------------------
 * `expiresTick` is an absolute tick, like `facingLock` / `StatusEffect
 * .expiresAtTick` / `ModifierSource.expiresAtTick` and unlike a per-tick
 * decrement. That is what makes the expiry independent of HOW MANY times the
 * system ran: a replay seek, a paused host, a tick the system is skipped on —
 * none of them can stretch a 20-second 洨者聖臨 into 21. {@link FORM_NEVER_EXPIRES}
 * is the sentinel for the three forms that never time out (20-01 風王結界 and
 * 70-00 紮根 are toggles, 61-00 百連我殺 is a death-state morph).
 *
 * Determinism: no rng, no clock, no float accumulation — the only arithmetic is
 * `world.tick + Math.round(durationSec / world.dt)`.
 */
import type { ChampionId, EntityId } from "../../ids";
import type { CastableSlot } from "../intents";
import type { SimWorld } from "../SimWorld";
import { Champions } from "../content/registry";
import { syncAbilityPassives } from "../abilities/abilityPassives";
import { syncItemSources } from "../economy/itemSource";

/**
 * `expiresTick` sentinel for a form that never times out on its own — the two
 * w3x TOGGLES and the death-state morph. A negative tick can never be reached
 * by `world.tick >= expiresTick` from tick 0, so the check needs no branch of
 * its own beyond the explicit one below (kept explicit for readability).
 */
export const FORM_NEVER_EXPIRES = -1;

/**
 * 【變身唯一狀態】的碰撞規則 —— 完整契約寫在 `content/schema/champion.ts` 的
 * `zTransformLink.reenter`，這裡是 sim 側的鏡子。
 */
export type FormReenterRule = "restart" | "keepLongest" | "reject";

/**
 * 缺省的碰撞規則。⛔ 這不是「我覺得 restart 比較好」，三個理由都是外部的：
 *
 * ① owner 的文案（15-02 疾風迅雷 / 15-03 獄炎煉我 / 15-04 雷天大壯，逐字
 *    「([變身]為唯一狀態不可疊加)」）只說了**不可疊加**，沒說贏家的計時器從哪
 *    裡算。沒說的那一半就是決策點，決策點要是欄位而不是這裡的一行（第一守則）。
 * ② `restart` 就是 2026-08-08 之前**出貨的行為** —— `expiresTick` 本來就無條件
 *    重算。把預設釘在現況上，26 對已上架的變身一對都不會改變行為，
 *    所以這一批的風險只落在**主動選了另外兩個值**的文件上。
 * ③ WC3 Metamorphosis 重施本來就是重新計時，與來源地圖一致。
 */
export const DEFAULT_FORM_REENTER: FormReenterRule = "restart";

/**
 * `castRejected.reason` for 「你已經在形態中，而這支英雄選了 `reject`」。
 *
 * 與 {@link FORM_REJECT_REASON} 分開，因為兩者要玩家做的事完全相反：`no-form`
 * 是「這招對這支英雄沒有目的地」（永遠不會成功），`form-busy` 是「等它結束再按」
 * （等一下就會成功）。共用一個字串會讓 HUD 永遠說不出正確的那一句。
 * 客戶端還不認得它時走既有的 `GENERIC_REJECT` 退路，所以玩家今天仍有回饋。
 */
export const FORM_BUSY_REASON = "form-busy";

/**
 * 變身 state — present EXACTLY while the entity is NOT in its base body.
 *
 * ABSENCE MEANS BASE FORM, and reverting DELETES the entry rather than setting
 * `index` back to 0. That is the `airborne` contract verbatim (SimWorld.ts:
 * "created at takeoff, DELETED at landing"), and it is what keeps
 * `digest()` honest: a champion that transformed and reverted is in exactly the
 * same STATE as one that never transformed, so it must hash the same. A digest
 * is a state hash, not a history hash.
 */
export interface ChampionFormComp {
  /** which half of the w3x pair the body currently is: 0 = `Eme1`, 1 = `Emeu`. */
  index: 0 | 1;
  /** the `Eme1` champion id to go home to — captured when the form was entered. */
  baseId: ChampionId;
  /** ABSOLUTE tick at which the form lapses, or {@link FORM_NEVER_EXPIRES}. */
  expiresTick: number;
}

/** Direction of a requested change (mirrors `EffectDef.championForm.to`). */
export type ChampionFormTarget = "alternate" | "base" | "toggle";

/**
 * `castRejected.reason` for a transform that cannot resolve a destination body.
 *
 * NOT in `CastResult` (abilities/abilitySystem.ts): that union is the answer of
 * the PRE-CAST gate ladder, and this refusal is discovered later, when the
 * effect runs. The client's `castRejectNotice` falls back to `GENERIC_REJECT`
 * (「現在無法施放」) for a reason it does not know, so the player still gets a
 * line and a deny beep today; giving it its own sentence is a one-line follow-up
 * in apps/client/src/ui/castFeedback.ts.
 */
export const FORM_REJECT_REASON = "no-form";

/** Provenance for the refusal event — what the effect context knows. */
export interface ChampionFormOrigin {
  /** casting slot, so the HUD can shake the button that was pressed */
  slot?: CastableSlot;
  /** e.g. "ability:godie-harf.ex" */
  origin: string;
}

/** 0 = base body, 1 = alternate body. Absence of the component IS 0. */
export function championFormIndex(world: SimWorld, id: EntityId): 0 | 1 {
  return world.championForm.get(id)?.index ?? 0;
}

/**
 * The champion id this entity would become for `to`, or `undefined` when there
 * is no such body.
 *
 * `undefined` covers all four real misses and deliberately does not distinguish
 * them, because the answer is the same in every case — refuse and touch
 * nothing: the hero has no `transform` link at all, the link has no
 * `counterpartId` (a form the importer never shipped), the counterpart names a
 * champion with no registered doc, or "go home" was asked of a body that is
 * already home.
 */
function destinationFor(
  world: SimWorld,
  id: EntityId,
  to: ChampionFormTarget,
): { nextId: ChampionId; nextIndex: 0 | 1 } | undefined {
  const champ = world.champion.get(id);
  if (!champ) return undefined;
  const form = world.championForm.get(id);
  const index = form?.index ?? 0;
  // "toggle" is resolved against the CURRENT body first, so one authored effect
  // serves both halves of a w3x toggle ability (A0DZ 風王結界 / A0O6 紮根).
  const want: "alternate" | "base" =
    to === "toggle" ? (index === 1 ? "base" : "alternate") : to;

  if (want === "base") {
    if (form === undefined) return undefined; // already home — nothing to do
    return Champions.tryGet(form.baseId) === undefined
      ? undefined
      : { nextId: form.baseId, nextIndex: 0 };
  }

  // → alternate. Already there is NOT a miss: WC3 re-casting a metamorphosis
  // refreshes its duration, so the caller updates `expiresTick` in place.
  if (index === 1) return { nextId: champ.championId, nextIndex: 1 };
  const counterpart = Champions.tryGet(champ.championId)?.transform?.counterpartId;
  if (counterpart === undefined) return undefined;
  // ⛔⛔ **下架的變身態進不去**（2026-08-23）—— owner 2026-08-22：
  //    「變身帶來許多問題，因此我想要**開啟變身態盡可能下架**」。
  //
  // ⚠️ 在這一行之前，`roster.json` 的 `retiredChampions` 只擋**選人**，
  //    而變身態本來就 `role:"alternate"` 不可被選 ⇒ 對那 5 個而言下架是 **no-op**，
  //    入口一直開著（實測仍有 4 支技能變得進去）。`roster.json` 的 note
  //    自己寫著「接線點只有一處、一行」—— ⭐ 就是這一行。
  //
  // ⭐ 退場方式與其他四種 miss **逐字相同**（回 `undefined` = 拒絕並且什麼都不碰），
  //    ⛔ 不是靜默地變成半個變身態。呼叫端因此不會 emit `championForm`，
  //    也不會動 FORM bits ⇒ 客戶端逐位元組看不到任何變化。
  if (world.retiredChampionIds.has(counterpart)) return undefined;
  return Champions.tryGet(counterpart) === undefined
    ? undefined
    : { nextId: counterpart, nextIndex: 1 };
}

/**
 * 這個實體的碰撞規則 —— 一律讀 **base 身體**那一份 doc。
 *
 * 為什麼不是讀「當前身體」：alternate 身體依 schema 的契約**不可獨立挑選**
 * （`role: "alternate"`），玩家挑的、後台編輯的都是 base 那一份；而 base id 在
 * 形態中仍然拿得到（`ChampionFormComp.baseId`）。schema 也記著一對的兩半帶
 * **相同**的 w3x 事實，所以這個選擇不改變 26 對的答案 —— 它只是讓「該去改哪一
 * 份文件」有唯一解，不會出現「改了 base 卻沒生效，因為碰撞發生在 alternate 上」。
 */
function reenterRuleFor(world: SimWorld, id: EntityId): FormReenterRule {
  const baseId = world.championForm.get(id)?.baseId ?? world.champion.get(id)?.championId;
  if (baseId === undefined) return DEFAULT_FORM_REENTER;
  return Champions.tryGet(baseId)?.transform?.reenter ?? DEFAULT_FORM_REENTER;
}

/**
 * 兩個 ABSOLUTE tick 到期，哪一個比較晚。
 *
 * ⚠️ `FORM_NEVER_EXPIRES` 必須**特判**：它是 -1，直接丟進大小比較會變成「最早
 * 到期」，於是 `keepLongest` 會把一個永不到期的切換（風王結界 / 紮根）靜默降級
 * 成立刻過期 —— 正好是它要防的那種靜默削弱，方向還反了。
 */
function laterExpiry(a: number, b: number): number {
  if (a === FORM_NEVER_EXPIRES || b === FORM_NEVER_EXPIRES) return FORM_NEVER_EXPIRES;
  return a > b ? a : b;
}

/**
 * THE ONLY writer of a champion's body. Writes BOTH id copies (see the module
 * header) and marks the stat cache dirty so the next `statRecomputeSystem` pass
 * rebuilds the base stats from the new doc.
 *
 * `recomputeStats` preserves the hp/mana RATIO across a maximum change, so a
 * champion at 40 % who grows into a bigger body stays at 40 % — the LoL
 * level-up/buy behaviour, applied here for free rather than re-implemented.
 */
function setBody(
  world: SimWorld,
  id: EntityId,
  nextId: ChampionId,
  nextIndex: 0 | 1,
  baseId: ChampionId,
  expiresTick: number,
): void {
  const champ = world.champion.get(id);
  const sc = world.stats.get(id);
  if (!champ || !sc) return;
  champ.championId = nextId;
  sc.championId = nextId;
  sc.dirty = true;
  if (nextIndex === 0) world.championForm.delete(id);
  else world.championForm.set(id, { index: 1, baseId, expiresTick });
  // 形態閘 (AbilityPassiveRank.whileForm) — a passive authored 「只在變身時」 has
  // to be ATTACHED and DETACHED by something, and this is the only honest
  // place: `setBody` is the sole writer of the body (see the module header), so
  // routing the re-sync through it means the cast, the timed expiry, the death
  // revert, `revertToBaseForm` and `endCombatChampionForms` all inherit it
  // without a single one of them knowing the gate exists.
  //
  // ORDER IS LOAD-BEARING: it runs AFTER `world.championForm` is written,
  // because `rankBlock` reads that map to decide. Called before the emit so an
  // event listener that reads `world.stats` sees the finished body.
  //
  // `syncAbilityPassives` is IDEMPOTENT and detaches-then-attaches only the
  // ability-passive sources, so a champion with no `whileForm` anywhere lands
  // on exactly the sources it already had — 26 transform pairs, no behaviour
  // change until a doc opts in.
  syncAbilityPassives(world, id);
  // 職業限定閘 on an ITEM's static modifiers (貫雷槍 godie-i01g:「近戰攻擊距離+4；
  // 遠戰攻擊距離+2」). Same argument as the line above, and the same place, for a
  // measured reason: THREE of the shipped transform pairs cross the melee/ranged
  // line — godie-e007↔godie-ewar, godie-n01b↔godie-nman, godie-o02l↔godie-ofar —
  // so without this a lance bought in the base body keeps the wrong bonus for the
  // whole transform, while `Champions.get(sc.championId)` and every panel say the
  // body changed. It re-resolves IN PLACE (see economy/itemSource.ts) so item
  // internal cooldowns are not refreshed by transforming.
  syncItemSources(world, id);
  world.emit("championForm", {
    id,
    championId: nextId,
    index: nextIndex,
    baseId,
    expiresTick,
  });
}

/**
 * Enter / leave a form. The effect runner's whole `championForm` handler.
 *
 * Returns true when the body changed (or an existing form's duration was
 * refreshed). On false NOTHING was written and a `castRejected` rides out on
 * the shared P7 channel — the caster pressed a button and is owed an answer,
 * and silence here is indistinguishable from the ability doing nothing.
 */
export function applyChampionForm(
  world: SimWorld,
  id: EntityId,
  to: ChampionFormTarget,
  durationSec: number | undefined,
  from: ChampionFormOrigin,
): boolean {
  const dest = destinationFor(world, id, to);
  if (dest === undefined) {
    world.emit("castRejected", {
      entity: id,
      slot: from.slot,
      reason: FORM_REJECT_REASON,
      origin: from.origin,
    });
    return false;
  }
  const current = world.championForm.get(id);
  const baseId = current?.baseId ?? world.champion.get(id)!.championId;
  let expiresTick =
    dest.nextIndex === 0 || durationSec === undefined
      ? FORM_NEVER_EXPIRES
      : world.tick + Math.round(durationSec / world.dt);

  // 【變身唯一狀態】的碰撞 —— 已經在形態中，又被要求進入形態。
  //
  // ⚠️ 互斥本身**不是這一段在做的**，而且不需要任何程式：`world.championForm`
  // 一個實體只有一格，而身體只有一個 `championId`（`setBody` 是唯一的寫入者），
  // 所以第二個形態在結構上不可能與第一個並存 —— 沒有一支技能需要自己檢查
  // 「我是不是已經變身了」。守衛：`sim/championFormExclusive.test.ts`。
  //
  // 這一段補的是互斥**必然**帶來、而 owner 文案沒說的那個決策：贏家的計時器
  // 從哪裡算。2026-08-08 之前它被寫死成 restart，代價是一個 1 秒的形態可以把一
  // 個還剩 59 秒的形態砍成 1 秒，而畫面上兩者長得一模一樣。
  if (current !== undefined && dest.nextIndex === 1) {
    const rule = reenterRuleFor(world, id);
    if (rule === "reject") {
      world.emit("castRejected", {
        entity: id,
        slot: from.slot,
        reason: FORM_BUSY_REASON,
        origin: from.origin,
      });
      return false;
    }
    if (rule === "keepLongest") expiresTick = laterExpiry(current.expiresTick, expiresTick);
  }
  setBody(world, id, dest.nextId, dest.nextIndex, baseId, expiresTick);
  return true;
}

/**
 * Force this entity back into its `Eme1` body. No-op when it is already there.
 *
 * The unresolvable-base branch is the belt to the module header's braces: the
 * only way to store a `baseId` is to have resolved it when the form was
 * entered, so a registry that lost it mid-match is not reachable today. If it
 * ever were, the component MUST still be dropped — leaving it would re-enter
 * this branch every tick forever — while the body stays where it is, because
 * writing an id the registry does not know is the one thing that crashes the
 * room (see the module header).
 */
export function revertToBaseForm(world: SimWorld, id: EntityId): void {
  const form = world.championForm.get(id);
  if (form === undefined) return;
  if (Champions.tryGet(form.baseId) === undefined) {
    world.championForm.delete(id);
    return;
  }
  setBody(world, id, form.baseId, 0, form.baseId, FORM_NEVER_EXPIRES);
}

/**
 * Per-tick: expire timed forms and force the dead back to their base body.
 *
 * DEATH FIRST, and unconditionally: a corpse (and the #220 dissolve, and the
 * revive that may follow) must be the hero the player picked, not a body whose
 * ability list and stat sheet nobody selected. It is checked before the clock
 * because a killed 洨者聖臨 must not stay transformed for the remaining 18
 * seconds of its duration.
 *
 * Iterates a KEY SNAPSHOT because `revertToBaseForm` deletes from the very map
 * being walked. Insertion order is transform order, which is identical on every
 * replica (the sim is deterministic), and the reverts are independent of each
 * other — but the digest folds this state in `transform` (id) order regardless,
 * so nothing observable depends on it.
 */
export function championFormSystem(world: SimWorld): void {
  if (world.championForm.size === 0) return;
  for (const id of [...world.championForm.keys()]) {
    const form = world.championForm.get(id);
    if (form === undefined) continue;
    const hp = world.health.get(id);
    if (hp === undefined || !hp.alive) {
      revertToBaseForm(world, id);
      continue;
    }
    if (form.expiresTick !== FORM_NEVER_EXPIRES && world.tick >= form.expiresTick) {
      revertToBaseForm(world, id);
    }
  }
}

/**
 * Combat exit: everybody goes home. Owner's rule for the mechanic is that a
 * form is a WITHIN-ROUND state — the next round starts from the picked hero, so
 * a toggle left on (風王結界 / 紮根 never time out) cannot leak across the
 * intermission and into a fresh duel.
 *
 * Idempotent and safe to call when nothing is transformed, exactly like
 * `endCombatMobs` / `endCombatGuardians` / `endCombatCoins`. Same seam as
 * those: the MATCH HOST calls it on combat exit.
 */
export function endCombatChampionForms(world: SimWorld): void {
  for (const id of [...world.championForm.keys()]) revertToBaseForm(world, id);
}
