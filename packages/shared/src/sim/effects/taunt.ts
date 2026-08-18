/**
 * `taunt` — 嘲弄. Force enemies to auto-target the caster for a while.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHIPPED CARD THIS EXISTS FOR
 *
 * 鍊金術之盾 (content/items/godie-i06q.json):
 *   「[嘲弄] 每秒吸引周圍敵人優先攻擊自己，持續 0.5秒」
 *
 * 「每秒」 is NOT expressed here. It is `HookDef.internalCooldown: 1` on an
 * `onInterval` hook — the field that already exists, already sits in the
 * editor, and already scales with `combatEnv.itemCooldown` for an item source.
 * Inventing a second cadence concept on this effect would be the exact mistake
 * `systems/IntervalHookSystem.ts` DECISION 1 talks itself out of. So this
 * handler owns 「一發嘲弄」 and nothing else: WHO, HOW LONG.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES *NOT* OWN
 *
 * Not the state model (sim/taunt.ts), and not the question 「被嘲弄的人現在真的
 * 打得到嘲弄者嗎」 (`targeting.forcedTargetOf`, re-asked every tick). This file
 * only writes; every legality judgement is made at READ time so that a taunter
 * who dies, hides, or leaves the zone stops pulling on the same tick.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 單體 vs 範圍 IS ONE FIELD, NOT TWO KINDS
 *
 * `radius` absent = the effect's own resolved targets (an ability-targeted WC3
 * taunt); present = a circle around the CASTER (this item). They differ only in
 * WHO, never in WHAT, so splitting them into two kinds would duplicate the
 * duration/expiry/config half twice and give the editor two cards that mean the
 * same thing.
 *
 * The circle goes through `enemiesInCircle`, i.e. the SAME query every ability
 * AoE uses — so the team filter, the zone filter, the aliveOnly filter and the
 * 隱形擋不擋 AoE field are all inherited rather than re-derived. And the radius
 * goes through `resolveAbilityRadius`, i.e. `combatEnv.abilityRange`, for the
 * reason aura.ts DECISION 3 gives: an area that ignored the operator's range
 * budget would be the one exception nobody remembers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ [反向嘲諷]（戰鬥力探測器）—— 兩根**獨立**的軸，⛔ 不是一個「模式」
 *
 * 一發嘲弄有兩個問題，而它們在這一支之前是同一個答案（「敵人」「打我」）：
 *
 *   `side`         = 這個圓**拉誰**        → `bodiesInCircle`
 *   `forcedTarget` = 被拉的人**被迫打誰**  → `applyTaunt` 的第三個參數
 *
 * 合成一格（例如一個 `mode: "normal" | "reverse"` 的 enum）會少掉兩個真的組合：
 * 「拉敵人去打我的隊友」（護衛）與「拉隊友來打我」（挑釁）。兩格是四種，
 * 一格是兩種，而多出來的那兩種一行程式都不用寫。
 *
 * ⚠️ 兩格都**缺席**時這一支逐字等於它落地那天的樣子，所以出貨的鍊金術之盾
 * （`content/items/godie-i06q.json`）逐位元不變 —— 那是 `bodiesInCircle` 在
 * `side !== "allies"` 時直接回 `enemiesInCircle(...)` 的結構性保證。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * Draws nothing from `world.rng` — there is no roll to make. `enemiesInCircle`
 * returns ASCENDING entity ids (the `queryOverlap` guarantee) and the `sort`
 * below is a TOTAL order in EVERY one of `tauntRules.capOrder`'s three modes
 * (each ends on `id`), which matters because the cap cuts the list exactly
 * there — the same argument damageArea.ts makes for its own sort. Expiry is an
 * absolute tick, computed in sim/taunt.ts.
 */
import type { EntityId } from "../../ids";
import type { EffectKindSpec } from "./effectKind";
import { applyTaunt, type TauntCapOrder } from "../taunt";
import { bodiesInCircle, resolveAbilityRadius } from "../abilities/abilitySystem";
import { distSq } from "../math/vec2";

/**
 * 「這一發最多拉幾個人」 —— the AUTHORED number under the OPERATOR's ceiling.
 *
 * ⭐ 決策點做成欄位。The old shape was `clampTargets(raw)` against a hardcoded
 * `TAUNT_MAX_TARGETS = 20`, which meant the operator had exactly no say: a card
 * that omitted `maxTargets` pulled twenty bodies and there was no console
 * anywhere that could say otherwise. `tauntRules.maxTargetsCap` is BOTH ends of
 * that — the value an absent `maxTargets` resolves to, AND the ceiling an
 * authored one is clamped into — deliberately one number rather than two,
 * because two numbers answering 「一發最多拉幾個」 is a drift waiting to happen.
 */
function resolveCap(raw: number | undefined, operatorCap: number): number {
  if (raw === undefined || !Number.isFinite(raw)) return operatorCap;
  const n = Math.round(raw);
  if (n < 1) return 1;
  return n > operatorCap ? operatorCap : n;
}

/** One candidate for the cap, with every key the three orders need. */
interface Candidate {
  id: EntityId;
  d2: number;
  hp: number;
}

/**
 * ⭐ 決策點做成欄位:`maxTargetsCap` 砍人的時候**留下哪幾個**
 * (`tauntRules.capOrder`). Nearest-first was hardcoded with a comment defending
 * it; by CLAUDE.md's own test that comment was the evidence it is a field.
 *
 * ALL THREE ARE TOTAL ORDERS — every one of them ends on `id`, which is what
 * stops 「五隻殭屍裡拉哪三隻」 from becoming an artefact of
 * `Array.prototype.sort`'s implementation. `enemiesInCircle` already returns
 * ascending ids, so "id" is a plain no-op sort rather than a re-derivation.
 */
function compareBy(order: TauntCapOrder): (a: Candidate, b: Candidate) => number {
  switch (order) {
    case "lowestHp":
      return (a, b) => (a.hp !== b.hp ? a.hp - b.hp : a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id);
    case "id":
      return (a, b) => a.id - b.id;
    default:
      return (a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id);
  }
}

export const tauntEffect: EffectKindSpec<"taunt"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // The master switch is honoured HERE as well as in `applyTaunt`, so a
    // disabled mechanic costs nothing at all — no broad-phase query per pulse
    // on every shield holder in the match.
    if (!world.tauntRules.enabled) return;

    // ⭐ [反向嘲諷] —— 「被拉的人被迫打誰」。ABSENT = 施法者自己，也就是
    // `applyTaunt(world, s, ctx.caster, …)` 這一格從第一天起寫死的那個答案，
    // 所以出貨的鍊金術之盾走的是逐字相同的一條路。
    //
    // ⛔ 這裡**不**檢查 focus 打不打得到、是不是敵人、活不活著 —— 合法性是
    // `targeting.forcedTargetOf` 每一 tick 重問的問題（這個檔的檔頭與
    // sim/taunt.ts 的 `applyTaunt` 都寫著同一句）。寫入時檢查一次的代價是
    // 「一個 tick 之後才修好」的那種缺陷。
    const focus: EntityId | undefined =
      e.forcedTarget === "target" ? ctx.targets[0] : ctx.caster;
    // 指名了「打目標」卻一個目標都沒解析出來 = 沒有人可以被指向。⛔ 不要退回
    // 施法者：那會把一發反向嘲諷靜默變成一發正向嘲諷（失敗形態②的反面 ——
    // 卡片說「去打他」，場上是「都來打我」，而沒有任何東西會說出來）。
    if (focus === undefined) return;

    let subjects: readonly EntityId[];
    if (e.radius === undefined) {
      // 單體：`side` / `includeNeutrals` 在這一支沒有圓可以濾，所以不讀 ——
      // 主體就是這個效果自己解析出來的目標。
      subjects = ctx.targets;
    } else {
      const t = world.transform.get(ctx.caster);
      if (!t) return;
      const radius = resolveAbilityRadius(world, e.radius);
      if (!(radius > 0)) return;
      const found: Candidate[] = [];
      for (const id of bodiesInCircle(world, ctx.caster, t.pos, radius, {
        ...(e.side !== undefined ? { side: e.side } : {}),
        ...(e.includeNeutrals !== undefined ? { includeNeutrals: e.includeNeutrals } : {}),
      })) {
        const vt = world.transform.get(id);
        if (!vt) continue;
        found.push({ id, d2: distSq(t.pos, vt.pos), hp: world.health.get(id)?.hp ?? 0 });
      }
      // TOTAL ORDER (see `compareBy`) — WHICH order is `tauntRules.capOrder`.
      // The cap slices exactly here, so a non-total order would make "which 3
      // of the 5 zombies got pulled" an artefact of Array.prototype.sort.
      found.sort(compareBy(world.tauntRules.capOrder));
      const cap = resolveCap(e.maxTargets, world.tauntRules.maxTargetsCap);
      if (found.length > cap) found.length = cap;
      subjects = found.map((f) => f.id);
    }

    let pulled = 0;
    for (const s of subjects) {
      // ⭐ 第三個參數是 `focus`，⛔ 不是 `ctx.caster` —— 這一行**就是**反向嘲諷。
      // `applyTaunt` 自己擋掉 `s === focus`（自己嘲弄自己），所以 focus 剛好也在
      // 圓裡的時候不會生出一筆自我指向的紀錄。
      if (applyTaunt(world, s, focus, e.durationSec)) pulled++;
    }
    // ② THE PLAYER MUST BE ABLE TO SEE IT. A taunt has no health bar, no stat
    // panel row and no floating number — without an event the only evidence it
    // fired is enemies turning around, which is exactly the kind of thing that
    // looks like "the AI wandered off" when it silently stops working.
    // Only when somebody was actually pulled.
    if (pulled > 0) {
      world.emit("taunt", {
        // ⚠️ 反向嘲諷底下 `source` 仍然是**施法者**，⛔ 不是 focus。這個欄位的
        // 意思是「哪一具身體上要冒出那一圈特效」（VfxSystem 的 `taunt` case），
        // 而卡片講的是「我的探測器發出了指令」—— 特效長在持有者身上是對的。
        // 換成 focus 會讓一個**敵人**身上冒出我方道具的特效。
        source: ctx.caster,
        count: pulled,
        durationSec: e.durationSec,
        origin: ctx.origin,
      });
    }
  },
};
