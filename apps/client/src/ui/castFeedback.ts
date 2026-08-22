/**
 * castFeedback — the answer to 「我按了 Q，什麼都沒發生」 (playtest P7).
 *
 * ---------------------------------------------------------------------------
 * THE DEBT THIS CLOSES
 * ---------------------------------------------------------------------------
 * The sim has ALWAYS known exactly why a cast failed. `castAbility` returns a
 * precise `CastResult` — "not-learned" / "cooldown" / "no-mana" / "stunned" /
 * "out-of-range" / "bad-target" / "recovery" / "passive" / "dead" — and
 * `CommandSystem` faithfully re-emits it:
 *
 *     const result = castAbility(world, entity, cmd.slot, cmd.target);
 *     if (result !== "ok") world.emit("castRejected", { entity, slot, reason: result });
 *
 * and then the reason died in two places at once:
 *   1. `apps/game-server/src/net/eventFanout.ts` never listed `castRejected`,
 *      so the event was filtered out before it ever reached a socket;
 *   2. nothing on the client subscribed to it anyway.
 *
 * Net effect in the owner's playtest: pressing Q on an unlearned / cooling /
 * mana-starved ability produced NO ability, NO message and NO refusal — the
 * game and a dropped packet were indistinguishable. This is the exact shape of
 * the bug task #60 fixed for the SHOP (`buyRejected` → 金幣不足); this module is
 * the same fix for the ability bar, and it deliberately mirrors
 * `ui/panels/shopFeedback` line for line so the two read as one idea.
 *
 * ---------------------------------------------------------------------------
 * TWO SOURCES, ON PURPOSE — PREDICT NOW, CORRECT LATER
 * ---------------------------------------------------------------------------
 * A server round-trip is 1–2 frames of nothing, and "nothing" is precisely the
 * failure being fixed. So a press is answered TWICE:
 *
 *   • {@link predictCastReject} runs on the press, from the seat snapshot the
 *     HUD already holds. It only ever returns a reason the client is CERTAIN
 *     about — rank 0, cooldown ticks remaining, mana below the rank's cost,
 *     champion dead, tile is passive-only. It NEVER guesses "out-of-range" or
 *     "bad-target": those depend on the sim's own pick and the authoritative
 *     positions, and a wrong refusal is worse than a late one.
 *
 *   • {@link castRejectionFromEvent} folds the server's `castRejected` in when
 *     it lands, which is where the aiming reasons (out-of-range / bad-target /
 *     stunned / recovery) actually come from. It overwrites a prediction for
 *     the same slot rather than queueing behind it — the server is right.
 *
 * A press the client cannot fault stays SILENT here and is confirmed instead by
 * {@link noteCastConfirmed} when `castBegin` / `abilityCast` comes back for the
 * local entity. So every press lands in exactly one of two buckets: a confirm
 * flash, or a sentence saying why not.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STORE IS A PLAIN BOX AND NOT ZUSTAND
 * ---------------------------------------------------------------------------
 * The per-slot FLASH is read every animation frame by the ability bar's
 * existing rAF loop (client-08: per-frame data never passes through React), so
 * it is a mutable record with a pure sampler, exactly like `frameBus`. The
 * NOTICE is discrete (one per press) and does drive a React render, so it gets
 * a minimal subscribe/notify box — kept here rather than in `net/RoomStore`
 * because it is UI-side feedback with no server projection behind it.
 *
 * Pure + node-testable: no React, no DOM, no audio calls. Callers play the SFX.
 */
import type { ChampionAbilitySlot } from "@ggd/shared/sim/intents";
// ⭐ GH#576 —— 被動觸發那一下閃多久是後台欄位（`config.ui-cues@1`），
// ⛔ 不是這個檔裡的第三個 `*_FLASH_MS` 常數。
import { uiCues } from "./uiCuesConfig";

/**
 * Every reason a cast can be refused. Mirrors `CastResult` from
 * shared/sim/abilities/abilitySystem minus "ok" — kept as a local union rather
 * than an import of the sim type so an UNKNOWN future reason degrades to the
 * generic sentence instead of failing a type check in the HUD.
 */
export type CastRejectReason =
  | "not-learned"
  | "dead"
  | "stunned"
  | "silenced"
  | "cooldown"
  | "no-mana"
  | "out-of-range"
  | "bad-target"
  | "passive"
  | "recovery";

/**
 * Reason → sentence. Each says what the player must DO about it, in their own
 * terms. None of them is a code: an unrecognised reason falls through to
 * {@link GENERIC_REJECT} rather than leaking an identifier onto the HUD.
 */
export const CAST_REJECT_TEXT: Record<CastRejectReason, string> = {
  "not-learned": "尚未學習（用技能上的 ＋ 加點）",
  dead: "陣亡中，無法施放",
  stunned: "被控制中，無法施放",
  // 【沉默】C1（#278）—— 與被控制分開的字，因為玩家仍然走得動、打得到。
  silenced: "被沉默，無法施放技能",
  cooldown: "冷卻中",
  "no-mana": "魔力不足",
  "out-of-range": "距離太遠",
  "bad-target": "沒有可施放的目標",
  passive: "這是被動技，永久生效，不需施放",
  recovery: "招式後搖中（剛才那招落空了）",
};

/** Shown when the server sends a reason this build does not know about. */
export const GENERIC_REJECT = "現在無法施放";

/** The 効果音ラボ refusal beep — the same clip the shop rejects with. */
export const CAST_DENY_SFX = "uiDenied";

/** How long a cast notice stays on screen. Matches the shop toast's TTL. */
export const CAST_NOTICE_TTL_MS = 2200;

/** How long the on-button confirm rim / deny shake plays. */
export const CAST_FLASH_MS = 320;
export const CAST_DENY_FLASH_MS = 420;

/** One line of cast feedback, ready to render and to play. */
export interface CastNotice {
  /** which button it belongs to — the bar shakes THAT tile */
  readonly slot: ChampionAbilitySlot;
  /** ability display name, already stripped of its hero-number prefix ("" if unknown) */
  readonly abilityName: string;
  /** the sentence shown to the player (Traditional Chinese, UI chrome) */
  readonly text: string;
  /** audio-map.json event key, or null when the caller already played one */
  readonly sfx: string | null;
  /** seconds left on the cooldown, when the reason is "cooldown" (else 0) */
  readonly secondsLeft: number;
  /** bumped per notice so an IDENTICAL repeat still re-triggers the render */
  readonly seq: number;
}

export interface CastRejectOptions {
  /** display name to prefix the sentence with */
  abilityName?: string;
  /** remaining cooldown, folded into the "cooldown" sentence as 「還有 N 秒」 */
  secondsLeft?: number;
  /** caller already played the deny cue (the press path does) → don't ask twice */
  silent?: boolean;
}

let noticeSeq = 0;

/**
 * PURE: reason → the notice to show. The slot travels with it so the bar can
 * shake the button the player actually pressed rather than the whole bar.
 */
export function castRejectNotice(
  slot: ChampionAbilitySlot,
  reason: string,
  opts: CastRejectOptions = {},
): CastNotice {
  const base = CAST_REJECT_TEXT[reason as CastRejectReason] ?? GENERIC_REJECT;
  const secondsLeft = Math.max(0, opts.secondsLeft ?? 0);
  // 「冷卻中」 alone makes the player press again to find out how long; the
  // number is the whole difference between a wall and a wait.
  const detail =
    reason === "cooldown" && secondsLeft > 0 ? `${base}（還有 ${Math.ceil(secondsLeft)} 秒）` : base;
  const name = opts.abilityName ?? "";
  return {
    slot,
    abilityName: name,
    text: name ? `${name}：${detail}` : detail,
    sfx: opts.silent ? null : CAST_DENY_SFX,
    secondsLeft,
    seq: ++noticeSeq,
  };
}

// ---------------------------------------------------------------- prediction

/** Everything the client can be CERTAIN about at press time. */
export interface CastPredictInput {
  /** learned rank; 0 = unlearned. EX passes its `exRank`, the innate passes 1. */
  rank: number;
  /** remaining cooldown TICKS for this slot (seat.cooldowns / seat.exCooldown) */
  cooldownTicks: number;
  /** ticks per second, so this stays pure (callers pass TICK_HZ) */
  tickHz: number;
  /** mana cost of the rank about to be cast (0 when free/unknown) */
  manaCost: number;
  /** the local champion's current mana */
  mana: number;
  /** false while the local champion is down */
  alive: boolean;
  /** the tile is passive-only (isPassiveOnly) — there is nothing to cast */
  passive: boolean;
}

/** What the prediction found: a certain reason, plus the number to say. */
export interface CastPrediction {
  readonly reason: CastRejectReason;
  readonly secondsLeft: number;
}

/**
 * PURE, CONSERVATIVE: the reason this press is certainly refused, or null when
 * the client has no grounds to refuse it (which includes every case that needs
 * the sim's own pick — those arrive later on `castRejected`).
 *
 * Order matters and matches `castAbility`'s own gate order, so a predicted
 * reason is never contradicted by the server's: not-learned → dead → passive →
 * cooldown → no-mana. (`castAbility` checks stun and recovery in between; the
 * client does not replicate either, so it simply stays quiet and lets the
 * server's event speak.)
 */
export function predictCastReject(input: CastPredictInput): CastPrediction | null {
  if (input.rank <= 0) return { reason: "not-learned", secondsLeft: 0 };
  if (!input.alive) return { reason: "dead", secondsLeft: 0 };
  if (input.passive) return { reason: "passive", secondsLeft: 0 };
  if (input.cooldownTicks > 0) {
    const hz = input.tickHz > 0 ? input.tickHz : 1;
    return { reason: "cooldown", secondsLeft: input.cooldownTicks / hz };
  }
  if (input.manaCost > 0 && input.mana < input.manaCost) {
    return { reason: "no-mana", secondsLeft: 0 };
  }
  return null;
}

// ------------------------------------------------------------- server events

/** The minimal event shape this module reads (matches protocol EventMessage). */
export interface CastEventLike {
  type: string;
  data: Record<string, unknown>;
}

/** Sim event types this module consumes — the drain's cheap pre-filter. */
const CAST_FEEDBACK_EVENTS = new Set(["castRejected", "castBegin", "abilityCast"]);

/** True when this event is one the cast-feedback path wants. */
export function isCastFeedbackEvent(type: string): boolean {
  return CAST_FEEDBACK_EVENTS.has(type);
}

/**
 * PURE: a `castRejected` event → the notice to show, or null when the event is
 * for somebody else (rejections are broadcast on the shared channel, exactly
 * like `buyRejected`, and whose cast failed is a private matter).
 *
 * `silent: true` is NOT set here: an authoritative refusal that the client did
 * not predict — out-of-range, bad-target, stunned — is the first time the
 * player learns anything, so it gets its own beep.
 */
export function castRejectionFromEvent(
  ev: CastEventLike,
  localEntityId: number | null,
  abilityName = "",
): CastNotice | null {
  if (ev.type !== "castRejected" || localEntityId === null) return null;
  const actor = ev.data.entity ?? ev.data.caster ?? ev.data.id;
  if (typeof actor !== "number" || actor !== localEntityId) return null;
  const slot = typeof ev.data.slot === "string" ? ev.data.slot : "";
  if (!isChampionAbilitySlot(slot)) return null;
  const reason = typeof ev.data.reason === "string" ? ev.data.reason : "";
  return castRejectNotice(slot, reason, { abilityName });
}

const SLOT_NAMES: readonly string[] = ["Q", "W", "E", "R", "EX", "PASSIVE"];

/** Narrow an off-the-wire string to a slot name. */
export function isChampionAbilitySlot(v: string): v is ChampionAbilitySlot {
  return SLOT_NAMES.includes(v);
}

// ------------------------------------------------------------- notice store

type NoticeListener = (notice: CastNotice | null) => void;

let current: CastNotice | null = null;
const listeners = new Set<NoticeListener>();

/** The live notice, or null once it has been cleared. */
export function getCastNotice(): CastNotice | null {
  return current;
}

/** Push a notice, replacing whatever was on screen (the newest press wins). */
export function pushCastNotice(notice: CastNotice): void {
  current = notice;
  for (const l of [...listeners]) l(notice);
}

/** Drop the current notice (TTL expiry, round change, teardown). */
export function clearCastNotice(): void {
  if (current === null) return;
  current = null;
  for (const l of [...listeners]) l(null);
}

/** Subscribe to notice changes; returns the unsubscribe. */
export function subscribeCastNotice(listener: NoticeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// -------------------------------------------------------------- flash store

/**
 * What one slot's button is doing right now.
 *
 * ⭐ `"proc"`（GH#576）＝「這一格的**被動**剛剛作用了」。⛔ 它刻意不是 `"confirm"`：
 * confirm 回答的是「我按的那一下出去了」，而被動沒有人按 —— 兩者同色會讓玩家
 * 以為自己誤觸了一顆按不下去的按鈕。它的長度來自後台（`passiveFlashMs`）。
 */
export type CastFlashKind = "confirm" | "deny" | "proc";

interface Flash {
  kind: CastFlashKind;
  startMs: number;
}

const flashes = new Map<ChampionAbilitySlot, Flash>();

/**
 * A cast the SIM accepted — `castBegin` / `abilityCast` came back for the local
 * entity. This is the half the playtest missed most: an instant ability with no
 * channel produced no cast-fill and no cooldown sweep the player could catch,
 * so the button never confirmed anything. A confirm rim says 「這招出去了」
 * independently of whatever the VFX lane draws in the world.
 */
export function noteCastConfirmed(slot: ChampionAbilitySlot, nowMs: number): void {
  flashes.set(slot, { kind: "confirm", startMs: nowMs });
}

/** A refused press — the button shakes red instead of confirming. */
export function noteCastDenied(slot: ChampionAbilitySlot, nowMs: number): void {
  flashes.set(slot, { kind: "deny", startMs: nowMs });
}

/**
 * ⭐ GH#576 —— 這一格的**被動**剛剛作用了（owner:「被動技 觸發作用的時候
 * 還是要閃一下圖示」）。
 *
 * ⛔ 節流**不在這裡** —— 它在 `ui/passiveProc.notePassiveProc()`，因為節流的另一半
 * （內部冷卻的起點）也在那裡，而兩件事必須用同一筆紀錄決定，⛔ 不是兩張表。
 */
export function notePassiveProcFlash(slot: ChampionAbilitySlot, nowMs: number): void {
  flashes.set(slot, { kind: "proc", startMs: nowMs });
}

export interface CastFlashSample {
  readonly kind: CastFlashKind;
  /** 1 at the instant of the press, decaying to 0 at the end of the window */
  readonly strength: number;
}

/**
 * PURE-ish sampler for the render loop: what to paint on `slot` right now, or
 * null when that button has nothing to say. Expired entries are dropped as they
 * are sampled, so the map never grows past the six live slots.
 */
export function sampleCastFlash(slot: ChampionAbilitySlot, nowMs: number): CastFlashSample | null {
  const f = flashes.get(slot);
  if (!f) return null;
  const window =
    f.kind === "deny"
      ? CAST_DENY_FLASH_MS
      : f.kind === "proc"
        ? uiCues().passiveFlashMs // ⭐ 後台可調（GH#576）
        : CAST_FLASH_MS;
  const elapsed = nowMs - f.startMs;
  if (elapsed < 0 || elapsed >= window) {
    flashes.delete(slot);
    return null;
  }
  return { kind: f.kind, strength: 1 - elapsed / window };
}

/**
 * Horizontal shake offset (px) for a denied button. A refusal has to be
 * readable with the sound muted and with the player's eyes on their champion,
 * so it MOVES: three decaying oscillations inside the deny window.
 */
export function denyShakeOffset(strength: number): number {
  return Math.sin(strength * Math.PI * 6) * 3 * strength;
}

/**
 * Clear every flash and the live notice. Round teardown + TESTS.
 *
 * Subscribers are deliberately KEPT: the notice line is a mounted component and
 * dropping its subscription here would silently deafen the HUD for the rest of
 * the match — the exact class of bug this whole module exists to remove. It is
 * notified of the clear instead.
 */
export function resetCastFeedback(): void {
  flashes.clear();
  noticeSeq = 0;
  clearCastNotice();
}
