/**
 * game/contextualVoiceDispatch —— 從 `GameApp.ts` 搬出來的語音派送（GH#737 那一輪）。
 *
 * ⭐ **為什麼搬**：`GameApp.ts` 有一條會紅的棘輪（`< 4,000 行`，訊息逐字寫著
 * 「新東西請放進 `game/`，⛔ 不要塞回這個檔」）。這個方法 148 行，⭐ 而它只用到
 * **6 個** `this.*` ⇒ 全部注入得了，⛔ 沒有一個是它非住在那個類別裡不可的理由。
 *
 * ⛔ 行為一個位元組都沒有改：整段是原封搬過來的，`this.x` → `deps.x` 而已。
 */
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { playContextualVoice } from "../audio/contextualVoice";
import {
  damageVoiceCandidate,
  deathVoiceCandidate,
  plainVoiceCandidate,
  type VoiceCandidate,
} from "../audio/voiceAudience";
import { championIdForEntity } from "./gameAppQueries";

/**
 * ⭐ 這個函式需要的**六件事** —— `GameApp` 本身就滿足它（⇒ 呼叫端傳 `this`）。
 * ⛔ 刻意不 import GameApp：那會把剛拆開的相依繞回去。
 */
export interface ContextualVoiceDeps {
  audioTeamOf: (id: number) => number | null;
  entityMaxHp: (id: number) => number;
  listenerDistance: (x: number | null, z: number | null) => number | null;
  noteLocalCombat: () => void;
  queueVoiceCandidate: (c: VoiceCandidate | null) => void;
  voiceWhere: (id: number) => { pos: { x: number; z: number } | null; distance: number | null };
}

/**
 * CONTEXTUAL VOICE dispatch for one drained event (task: voice-lines-utilize;
 * audience widened by #223).
 * Maps combat events to the acting champion's own cloned category clip:
 *   • abilityCast (non-PASSIVE) → skill-name.<slot>, spoken by the CASTER.
 *   • damage with crit         → crit, spoken by the ATTACKER (source).
 *   • damage to ANY champion   → hurt / hurt-heavy, spoken by the VICTIM, by
 *                                the fraction of the VICTIM'S OWN max-hp the
 *                                blow took. #223: this used to be gated to
 *                                `target === localId`, so hitting an enemy
 *                                produced no grunt at all — the arena only
 *                                ever spoke in your voice.
 *   • death of ANY champion    → defeat, spoken by the corpse (#223).
 *   • block / healed / dodge   → still LOCAL-ONLY, deliberately: they are
 *                                answers to YOUR input, and an enemy's parry
 *                                is already carried by the SFX layer.
 * The two widened categories are QUEUED, not played: they are scored by
 * audio/voiceAudience and dispatched best-first after the batch drains, so the
 * arena-wide 1.2 s voice slot is spent on the line that matters most instead
 * of on whichever packet arrived first. The kill-N / first-blood / victory
 * lines live in AudioDirector / the settlement panels (they key off the
 * discrete tally + phase edges, not the per-frame drain). CLIENT-ONLY:
 * contextualVoice picks with a client rng and rides audioSystem.playClip, so
 * this never affects sim/determinism.
 */
export function dispatchContextualVoice(
deps: ContextualVoiceDeps,
ev: EventMessage,
localId: number | null,
): void {
  const d = ev.data;
  if (ev.type === "abilityCast") {
    const slot = typeof d.slot === "string" ? d.slot : null;
    if (!slot || slot === "PASSIVE") return; // 天生技 does not shout a skill name
    const caster = Number(d.caster);
    // #259 — QUEUED, not played. Twelve champions rotating abilities used to
    // shout twelve skill names dead centre at full level; the shout belongs to
    // the caster's BODY. It has to go through the post-camera flush to be
    // placed at all (the drain is step 1, the camera moves in step 5), and
    // `plainVoiceCandidate` keeps probScale at 1 so how OFTEN it fires is
    // exactly what it was.
    deps.queueVoiceCandidate(
      plainVoiceCandidate({
        champId: championIdForEntity(caster),
        category: `skill-name.${slot.toLowerCase()}`,
        speaker: caster,
        counterpart: null,
        localId,
        teamOf: deps.audioTeamOf,
        ...deps.voiceWhere(caster),
      }),
    );
    return;
  }
  if (ev.type === "damage") {
    const source = Number(d.source);
    const target = Number(d.target);
    if (d.crit === true) {
      // No genuine non-crit heavy-swing signal exists, so attack-heavy rides
      // the crit edge: 二擇一 (client Math.random) between the existing "crit"
      // line and "attack-heavy" so a crit fires exactly ONE of them, never both
      // (voice-binding-design.md §三). Own buckets → no shared cooldown.
      // #259: spoken by the ATTACKER, so it is placed on the ATTACKER's body —
      // not on the victim's x/z that the same packet carries.
      deps.queueVoiceCandidate(
        plainVoiceCandidate({
          champId: championIdForEntity(source),
          category: Math.random() < 0.5 ? "crit" : "attack-heavy",
          speaker: source,
          counterpart: Number.isFinite(target) ? target : null,
          localId,
          teamOf: deps.audioTeamOf,
          ...deps.voiceWhere(source),
        }),
      );
    }
    // block is gated to the LOCAL defender: a hit you fully/partly warded off.
    if (d.blocked === true && localId !== null && target === localId) {
      const blocker = championIdForEntity(target);
      if (blocker) playContextualVoice(blocker, "block");
    }
    // #223 — hurt fans out to EVERY champion, weighted by audience. The
    // damage packet carries the VICTIM's own transform (damage.ts emits
    // world.transform.get(target)), so the listener distance is free and
    // needs no entity lookup and no frame-order-sensitive views.posOf read.
    deps.queueVoiceCandidate(
      damageVoiceCandidate({
        champId: championIdForEntity(target),
        speaker: target,
        counterpart: Number.isFinite(source) ? source : null,
        localId,
        teamOf: deps.audioTeamOf,
        amount: typeof d.amount === "number" ? d.amount : 0,
        victimMaxHp: deps.entityMaxHp(target),
        killingBlow: d.killingBlow === true,
        distance: deps.listenerDistance(
          typeof d.x === "number" ? d.x : null,
          typeof d.z === "number" ? d.z : null,
        ),
        // #259 — the same packet coordinates, kept RAW this time instead of
        // being folded into probScale and discarded. `damage.ts` emits the
        // victim's own transform, and the victim is who speaks a hurt line.
        pos:
          typeof d.x === "number" && typeof d.z === "number" ? { x: d.x, z: d.z } : null,
      }),
    );
    if (localId !== null && target === localId) {
      deps.noteLocalCombat(); // reset the hum idle latch — you are in a fight
    }
    return;
  }
  if (ev.type === "heal") {
    // healed — only when YOUR champion is the one restored (discrete heals only;
    // per-tick regen is never emitted, revive rides reviveComplete elsewhere).
    const target = Number(d.target);
    if (localId !== null && target === localId) {
      const champ = championIdForEntity(target);
      if (champ) playContextualVoice(champ, "healed");
      deps.noteLocalCombat(); // being healed counts as activity
    }
    return;
  }
  // ⭐ `immune`（無敵 / 型別連擊免疫）走**同一個分支**：從玩家的角度這兩件事
  // 一模一樣（「那一發沒有讓我掉血」），而語音與「這算戰鬥活動」的判定也一樣。
  // ⛔ 不要為它另開一段 —— 兩段會分岔，而分岔的那一天只有其中一種會發聲。
  if (ev.type === "evade" || ev.type === "immune") {
    // dodge — a total miss on YOUR champion. The `evade` event rides the same
    // queuedEvents drain as damage (RoomConnection.bind pushes it to both the
    // frame queue and the WorldAnchorLayer sighting buffer), so this is the
    // clean seam — no socket-callback fanout, no double-drain of the buffer.
    const target = Number(d.target);
    if (localId !== null && target === localId) {
      const champ = championIdForEntity(target);
      if (champ) playContextualVoice(champ, "dodge");
      deps.noteLocalCombat(); // dodging is combat activity
    }
    return;
  }
  // ⭐ GH#441 —— `knockdown` 的觸發點。語音包 51 位英雄都有這一格，而在這之前
  // **沒有任何地方叫它**（政策表自己寫著 `dispatched: false`）。事件本來就在線上
  // （`EVENT_SPATIAL.knockdown` + `FANNED_OUT_EVENT_TYPES`），說話的是**被放倒的
  // 那一個**，⛔ 不是把他放倒的人。
  if (ev.type === "knockdown") {
    const floored = Number(d.target);
    if (Number.isFinite(floored)) {
      deps.queueVoiceCandidate(
        plainVoiceCandidate({
          champId: championIdForEntity(floored),
          category: "knockdown",
          speaker: floored,
          counterpart: typeof d.source === "number" ? d.source : null,
          localId,
          teamOf: deps.audioTeamOf,
          ...deps.voiceWhere(floored),
        }),
      );
    }
    return;
  }
  if (ev.type === "death") {
    // #223 — ANY champion's death cries out (the same id deathFocus.noteDeath
    // consumes). `killer` is what makes "the enemy YOU just killed" its own
    // band: that cry is the confirmation of your kill, so it preempts.
    const id = Number(d.id);
    const killer = typeof d.killer === "number" ? d.killer : null;
    deps.queueVoiceCandidate(
      deathVoiceCandidate({
        champId: championIdForEntity(id),
        speaker: id,
        counterpart: killer,
        localId,
        teamOf: deps.audioTeamOf,
        ...deps.voiceWhere(id),
      }),
    );
  }
}
