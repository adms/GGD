/**
 * castAnnounce — the ONE place a pressed ability button is turned into an
 * answer, wired to the live HUD store.
 *
 * `ui/castFeedback` is the pure half (reason → sentence, snapshot → certain
 * refusal). This is the impure half: it reads the local seat out of the Zustand
 * RoomStore, assembles the {@link CastPredictInput}, and — when the press is
 * certainly refused — pushes the notice and starts the button's deny shake.
 *
 * WHY IT HANGS OFF `abilityActivationCue` AND NOT OFF EACH INPUT HANDLER
 * ---------------------------------------------------------------------
 * `ui/abilityCue` already documents itself as the ONE shared activation cue
 * fired from EVERY input path — desktop tile, touch arc, keyboard Q/W/E/R/F,
 * gamepad. Hanging the announcement off that same funnel means the KEYBOARD
 * (the path the owner actually pressed in the playtest) gets the sentence for
 * free, and `input/InputCapture` / `input/GamepadInput` need no change at all.
 * It also inherits the funnel's 70ms de-dupe, so a tile press that races its own
 * keyboard shortcut still produces exactly one line.
 *
 * It also FIXES the cue's sound on those paths: `InputCapture` only knew
 * `denied: !ability` (rank 0), so pressing a learned-but-cooling or
 * mana-starved ability played the happy click — a lie. The announcement's
 * verdict now decides the tone.
 */
import { TICK_HZ } from "@ggd/shared/constants";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { isPassiveOnly } from "@ggd/shared/sim/abilities/abilityPassives";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { ChampionAbilitySlot, CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { hudStore } from "../net/RoomStore";
import {
  castRejectNotice,
  castRejectionFromEvent,
  isCastFeedbackEvent,
  isChampionAbilitySlot,
  noteCastConfirmed,
  noteCastDenied,
  notePassiveProcFlash,
  predictCastReject,
  pushCastNotice,
  type CastEventLike,
  type CastNotice,
} from "./castFeedback";
import { notePassiveProc, passiveHookIcdSeconds, passiveProcAbilityId } from "./passiveProc";
import { INNATE_INERT_NOTE, passiveSlotView } from "./passiveSlot";
import { stripAbilityNumber } from "./components/abilityText";

const CORE_INDEX: Record<CoreAbilitySlot, number> = { Q: 0, W: 1, E: 2, R: 3 };

/**
 * ────────────────────── THE SIXTH SLOT IS LIVE (was a seam) ──────────────────
 * Whether an ACTIVE 天生技 (innateKind === "active") can actually be cast.
 *
 * TRUE, since the innate cast path landed end to end. What "end to end" means,
 * because this flag was false for a long time WHILE most of the path existed —
 * every one of these had to be true at once, and the last three are what this
 * change added:
 *
 *   1. `shared/sim/intents` — `CastableSlot = AbilitySlot | "PASSIVE"`, carried
 *      by `Command.castAbility`.                                        (had it)
 *   2. `shared/sim/abilities` — `abilityInstanceFor` resolves the sixth slot,
 *      `castAbility` runs it through the one validation ladder, the cooldown
 *      ticks, `innateCastBlock` keeps the permanent half uncastable.    (had it)
 *   3. `game-server/net/validateInput` — the ingress whitelist now includes
 *      "PASSIVE". It did NOT, so a well-formed innate cast off a real client was
 *      DROPPED at the door with no error: the sim was ready and unreachable.
 *   4. `client/GameApp.abilityForSeat` — resolves PASSIVE via `championPassive`,
 *      for `innateKind: "active"` only.
 *   5. A BINDING ON EVERY INPUT TREE — keyboard **D** (`input/InputCapture`, the
 *      WC3 D-slot key this ability family is literally named after), the touch
 *      天生 button (`ui/TouchControls`) and gamepad d-pad-up
 *      (`input/GamepadInput`). Keyboard-only would have shipped a feature two
 *      of three input paths silently lack.
 *
 * So `announceCastAttempt("PASSIVE")` no longer short-circuits for an active
 * innate: it falls through to the normal rank/cooldown/mana prediction, exactly
 * like Q. `components/AbilityBar` reads this same flag for the pointer cursor,
 * the D caption and the cast fill.
 *
 * The constant stays rather than being inlined: it is the ONE place the UI asks
 * "is the sixth slot a button?", and a future hero class or game mode that has
 * to answer differently should have exactly one thing to change.
 */
export const INNATE_ACTIVE_CASTABLE = true;

/**
 * Said when an ACTIVE innate is pressed while {@link INNATE_ACTIVE_CASTABLE} is
 * false. Unreachable today by design — kept so switching the flag back off
 * degrades to an honest sentence instead of a silent tile.
 */
export const INNATE_PENDING_TEXT = "天生主動技 · 等級 1 起自動擁有（施放尚未開放）";

/** The de-duped verdict for one press: what it said, or null when it looked fine. */
export type CastAnnouncement = CastNotice | null;

/**
 * Announce one press. Returns the notice that was pushed, or null when the
 * client has no grounds to refuse — in which case the press stays silent here
 * and is confirmed by the server's `castBegin` / `abilityCast` instead.
 *
 * Never throws: a champion the registry does not know, a seat that has not
 * materialised, a slot the hero does not own — all resolve to "say nothing",
 * because a spurious refusal is worse than the silence this module exists to
 * remove.
 */
export function announceCastAttempt(slot: ChampionAbilitySlot): CastAnnouncement {
  const hud = hudStore.getState();
  const seat = hud.localSeatId === null ? null : hud.seats.find((s) => s.seatId === hud.localSeatId);
  if (!seat || !seat.championId) return null;
  // NO CHAMPION ON THE FIELD → nothing to cast and nothing to explain. This is
  // the champ-select / pre-spawn gate: a seat there reads `alive === false` for
  // an entirely different reason, and announcing 「陣亡中，無法施放」 while the
  // player is still picking a hero would be a brand-new lie of exactly the kind
  // this lane exists to delete. `entityId > 0` is the same liveness test
  // `syncHudFromState` uses to resolve `localEntityId`.
  if (!(seat.entityId > 0)) return null;
  const champ = Champions.tryGet(seat.championId as ChampionId);
  if (!champ) return null;

  // ── the sixth slot ─────────────────────────────────────────────────────
  if (slot === "PASSIVE") {
    const innate = passiveSlotView(seat.championId);
    if (!innate) return null;
    const name = innate.displayName;
    if (innate.innateKind !== "active") {
      // A pure passive is not a failure — it is a tile that was never a button.
      // It still ANSWERS, because a press with no answer is the whole bug.
      //
      // TWO different answers, because there are two different truths. 「永久生效」
      // is a PROMISE, and for 29 of the 48 permanent innates it is false: their
      // doc carries no modifier, hook or aura, so the champion spawns with the
      // tile lit and literally nothing attached (`passiveSlotView.effective`).
      // Saying "permanently in effect" there would be this campaign's own bug
      // wearing a reassuring sentence, so an inert innate says so instead.
      if (!innate.effective) {
        return push({
          slot: "PASSIVE",
          abilityName: name,
          text: `${name}：${INNATE_INERT_NOTE}`,
          sfx: null,
          secondsLeft: 0,
          seq: 0,
        });
      }
      return push(castRejectNotice("PASSIVE", "passive", { abilityName: name, silent: true }));
    }
    if (!INNATE_ACTIVE_CASTABLE) {
      return push({
        slot: "PASSIVE",
        abilityName: name,
        text: `${name}：${INNATE_PENDING_TEXT}`,
        sfx: null,
        secondsLeft: 0,
        seq: 0,
      });
    }
    // once the sim lane lands: fall through to the normal prediction below
  }

  const view = resolveSlot(seat, champ, slot);
  if (!view) return null;

  const predicted = predictCastReject({
    rank: view.rank,
    cooldownTicks: view.cooldownTicks,
    tickHz: TICK_HZ,
    manaCost: view.manaCost,
    mana: hud.localMana,
    alive: hud.localAlive,
    passive: view.passive,
  });
  if (!predicted) {
    // ⭐⭐ GH#725（舊 #119）—— **這裡就是「按下的那一幀」。**
    // 客戶端剛剛跑完一次完整的預測（等級／冷卻／魔力／生死／被動）而**沒有理由拒絕**
    // ⇒ 這一按幾乎一定會成立。在此之前這個分支只是 `return null`（＝「不要罵他」），
    // ⛔ 一個字都沒寫下來,於是冷卻圈要等一趟 RTT 才開始轉。
    // ⚠️ ⛔ 這裡**不重算**任何規則 —— 規則的唯一住處是上面那一次 `predictCastReject`。
    noteCooldownPrediction({ seatId: seat.seatId, slot });
    return null;
  }

  return push(
    castRejectNotice(slot, predicted.reason, {
      abilityName: view.name,
      secondsLeft: predicted.secondsLeft,
      // the press path plays its own cue via abilityActivationCue — asking for
      // a second beep here would double every refusal.
      silent: true,
    }),
  );
}

/**
 * Fold ONE drained sim event into the cast-feedback path. This is the whole
 * client-side surface of the server half — `GameApp`'s event drain calls it
 * exactly the way it calls `recordShopEvent`, and everything else lives in
 * `ui/`.
 *
 *   • `castRejected` → the AUTHORITATIVE refusal. It is what carries the
 *     reasons the client cannot predict (out-of-range / bad-target / stunned /
 *     recovery), and it overwrites a local prediction for the same press
 *     because the server is right.
 *   • `castBegin` / `abilityCast` → the ACCEPTED half: the confirm rim on the
 *     button. Without it an instant, no-channel ability confirmed nothing at
 *     all on the bar (playtest P7).
 *
 * Events for other players are dropped: `castRejected` rides the shared
 * broadcast channel exactly like `buyRejected`, and whose cast failed is a
 * private matter.
 */
export function recordCastEvent(ev: CastEventLike, localEntityId: number | null, nowMs: number): void {
  if (localEntityId === null) return;
  // ⭐ GH#576 —— 被動觸發那一下，**在** `isCastFeedbackEvent` 的閘之前：被動不走
  // castBegin/abilityCast，它藏在 `buffApply` / `damage` / `heal` … 的 `origin` 裡。
  // ⛔ 放在閘後面等於這整條線一次都不會跑（失敗形態③：可以整段刪掉而測試全綠）。
  recordPassiveProc(ev, localEntityId, nowMs);
  if (!isCastFeedbackEvent(ev.type)) return;
  if (ev.type === "castRejected") {
    const slot = typeof ev.data.slot === "string" ? ev.data.slot : "";
    const name = isChampionAbilitySlot(slot) ? slotDisplayName(slot) : "";
    const notice = castRejectionFromEvent(ev, localEntityId, name);
    if (notice) {
      pushCastNotice(notice);
      noteCastDenied(notice.slot, nowMs);
    }
    return;
  }
  // castBegin / abilityCast — the sim accepted it.
  const caster = ev.data.caster ?? ev.data.source ?? ev.data.id;
  if (typeof caster !== "number" || caster !== localEntityId) return;
  const slot = typeof ev.data.slot === "string" ? ev.data.slot : "";
  if (!isChampionAbilitySlot(slot)) return;
  noteCastConfirmed(slot, nowMs);
}

/**
 * ⭐ GH#576 —— 一個外送事件 → **我的哪一格被動剛剛作用了**（owner 2026-08-23：
 * 「被動技 觸發作用的時候 還是要閃一下圖示」）。
 *
 * 三道閘，缺一就會閃錯格：
 *  ① `origin` 認得出來是 hook 來的（`ui/passiveProc.passiveProcAbilityId`）——
 *     主動施放的 `ability:<id>` 在那裡就被擋掉，⛔ 不會讓一次施放閃兩下；
 *  ② 那一發是**我**發的（`source`/`caster` === 本機實體）—— 這些事件走的是共享
 *     廣播通道，全場每一個人的 buffApply 都會流過這裡；
 *  ③ 那支技能真的坐在我的某一格上 —— 一件道具／增益卡的 hook 也帶 `origin`，
 *     而它沒有格子可閃。
 */
function recordPassiveProc(ev: CastEventLike, localEntityId: number, nowMs: number): void {
  const abilityId = passiveProcAbilityId(ev.data.origin);
  if (abilityId === null) return;
  const owner = ev.data.source ?? ev.data.caster;
  if (typeof owner !== "number" || owner !== localEntityId) return;
  const hud = hudStore.getState();
  const seat = hud.localSeatId === null ? null : hud.seats.find((s) => s.seatId === hud.localSeatId);
  if (!seat || !seat.championId) return;
  const champ = Champions.tryGet(seat.championId as ChampionId);
  if (!champ) return;
  const slot = slotOfAbility(seat, champ, abilityId);
  if (slot === null) return;
  const icdSec = passiveHookIcdSeconds(Abilities.tryGet(abilityId as AbilityId));
  if (notePassiveProc(slot, icdSec, nowMs)) notePassiveProcFlash(slot, nowMs);
}

/** 這支技能坐在本機英雄的哪一格上，⛔ 不是我的就回 null（道具／增益卡沒有格子）。 */
function slotOfAbility(
  seat: SeatLike,
  champ: ChampionLike,
  abilityId: string,
): ChampionAbilitySlot | null {
  if (seat.exAbilityId === abilityId) return "EX";
  if (passiveSlotView(seat.championId)?.id === abilityId) return "PASSIVE";
  for (const slot of ["Q", "W", "E", "R"] as const) {
    if (champ.abilities[slot]?.id === abilityId) return slot;
  }
  return null;
}

/** Display name for a slot on the LOCAL champion, or "" when unresolvable. */
function slotDisplayName(slot: ChampionAbilitySlot): string {
  const hud = hudStore.getState();
  const seat = hud.localSeatId === null ? null : hud.seats.find((s) => s.seatId === hud.localSeatId);
  if (!seat || !seat.championId) return "";
  const champ = Champions.tryGet(seat.championId as ChampionId);
  if (!champ) return "";
  return resolveSlot(seat, champ, slot)?.name ?? "";
}

/** Publish + start the button shake. Split out so every branch does both. */
function push(notice: CastNotice): CastNotice {
  const stamped = notice.seq === 0 ? { ...notice, seq: nextLocalSeq() } : notice;
  pushCastNotice(stamped);
  noteCastDenied(stamped.slot, nowMs());
  return stamped;
}

let localSeq = 1_000_000;
function nextLocalSeq(): number {
  return ++localSeq;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

interface SlotView {
  name: string;
  rank: number;
  cooldownTicks: number;
  manaCost: number;
  passive: boolean;
}

type SeatLike = ReturnType<typeof hudStore.getState>["seats"][number];
type ChampionLike = NonNullable<ReturnType<typeof Champions.tryGet>>;

/** Everything the prediction needs about ONE slot, or null when it has none. */
function resolveSlot(
  seat: SeatLike,
  champ: ChampionLike,
  slot: ChampionAbilitySlot,
): SlotView | null {
  if (slot === "EX") {
    if (!seat.exAbilityId) return null; // this hero has no EX at all
    const def = Abilities.tryGet(seat.exAbilityId as AbilityId);
    if (!def) return null;
    return {
      name: stripAbilityNumber(def.name),
      rank: seat.exRank,
      cooldownTicks: seat.exCooldown ?? 0,
      manaCost: def.manaCost[0] ?? 0,
      passive: isPassiveOnly(def),
    };
  }
  if (slot === "PASSIVE") {
    const innate = passiveSlotView(seat.championId);
    if (!innate) return null;
    return {
      name: innate.displayName,
      rank: 1, // owned from level 1 — never learned, so never "not-learned"
      // the sixth slot's REAL remaining cooldown off the wire. It was hard-coded
      // to 0 while the slot was uncastable, which was harmless then and would be
      // a lie now: the active innates carry 40–60 s cooldowns, and a prediction
      // that always says "ready" would let every press inside that window travel
      // to the server just to be refused — feedback arriving a round-trip late,
      // for a reason the client is holding in its hand.
      cooldownTicks: seat.passiveCooldown ?? 0,
      manaCost: innate.manaCost ?? 0,
      passive: innate.innateKind !== "active",
    };
  }
  const def = champ.abilities[slot];
  if (!def) return null;
  const i = CORE_INDEX[slot];
  const rank = seat.abilityRanks[i] ?? 0;
  return {
    name: stripAbilityNumber(def.name),
    rank,
    cooldownTicks: seat.cooldowns[i] ?? 0,
    // the cost of the rank ABOUT TO BE CAST (rank-1 values before it is learned)
    manaCost: def.manaCost[Math.max(0, rank - 1)] ?? 0,
    passive: isPassiveOnly(def),
  };
}
