/**
 * AugmentDraftPanel — the 3-choose-1 draft (task #110). SeatState.offers →
 * pickOffer command. ONE panel serves every draft: silver/gold/prismatic
 * augment rounds, legendary WEAPON rounds and the orb gacha all arrive as the
 * same OfferState and render here, discriminated only by `offer.tier`.
 *
 * FOUR THINGS THIS PANEL OWES THE PLAYER (all requested):
 *
 *  1. A LoL-Arena flourish — 「炫彩一點…有微微發光流轉特效」. Each card is a
 *     `kind="card"` SfxButton, so it inherits the shared cyber-glow family
 *     (buttonFx.css) with a SUBTLE tier-tinted light flowing around its border.
 *     The tier colour rides in on the `--ggd-card-glow` custom property.
 *
 *  2. A MANDATORY icon — 「卡片一定要包含 icon 圖示」. Only ~13% of content has
 *     real art and generation is blocked, so MOST cards have none. Every card
 *     therefore renders a GlyphTile: a deterministic, id-seeded procedural glyph
 *     with a tier-coloured frame that has the same silhouette and weight as a
 *     real icon, and yields to the real PNG automatically the moment one lands
 *     (GlyphTile layers <IconImg> over the glyph — nothing here has to know
 *     whether the file exists). NEVER a ragged empty hole on the round's biggest
 *     decision.
 *
 *  3. A tech confirm — 「選定也會有厲害的科技音效」. Picking a card plays the
 *     weighty, mechanical `draftConfirm` lock-in cue (audio-map.json), authored
 *     to sit apart from the cyber hover and the countdown bells.
 *
 *  4. A REVEAL that sounds like a reveal (#110 sparkle + #82 gacha). Each card
 *     flips face-up in turn with a `draftCardReveal` sparkle; a legendary offer
 *     (the bought 傳說寶珠 gacha roll and the scheduled free legendary-weapon
 *     round both project as tier `weapon`) opens on a `legendaryRoll` spin
 *     build-up and lands the reveal on a `legendaryWin` jackpot. All the timing
 *     lives in the pure {@link revealSchedule}; this panel just fires each cue
 *     and flips the matching card. `playSfx` no-ops on an unmapped key, so the
 *     new cues degrade to silence until the audio-map phase wires their clips —
 *     and stay silent in test mode (the mixer is locked), same as draftConfirm.
 *
 * AND, since the 2026-07-24 playtest (P2), a FIFTH thing: it owns the screen
 * while it is up. It used to pin `top: 90` — landing on the merchant tip box —
 * and share the screen with the shop list, the countdown and Ready up, so four
 * surfaces asked for attention at once and nothing said which came first.
 *
 * It now (i) really centres, which is what its #107 registry row always
 * declared (`edge: "center"`), so it clears the tip box's band by construction
 * rather than by a pixel that happened to work at one resolution, and (ii)
 * paints a scrim at `INTERMISSION_Z.focusScrim` that demotes and click-blocks
 * everything it out-ranks. WHY the draft and not the shop: the draft is the one
 * surface here that is irreversible AND expiring — miss it and the round is
 * played without an augment, with no undo and no re-open — while browsing is
 * voluntary, resumable and completely intact the instant a card is picked. The
 * whole order, and the reasoning per band, is in panels/intermissionLayout.ts.
 */
import { useEffect, useState } from "react";
import { useHud } from "../../net/RoomStore";
import type { OfferView } from "../../net/RoomStore";
import { audioSystem } from "../../audio";
import { hudActions } from "../actions";
import { GlyphTile } from "../components/GlyphTile";
import { Tooltip } from "../components/Tooltip";
import { SfxButton } from "../SfxButton";
import { resolveChoice } from "./resolveChoice";
import { DRAFT_CONFIRM_SFX, tierColor, tierLabel, weaponEffectDescription } from "./draftCardStyle";
import { isLegendaryOffer, revealSchedule } from "./draftReveal";
import { FOCUS_FADE_MS, FOCUS_HINT, FOCUS_SCRIM_BG, INTERMISSION_Z } from "./intermissionLayout";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

export function AugmentDraftPanel(): React.JSX.Element | null {
  const offers = useHud((s) => {
    if (s.localSeatId === null) return null;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.offers ?? null;
  });
  if (!offers || offers.length === 0) return null;

  return (
    <>
      {/* THE FOCUS SCRIM (playtest P2). It takes pointer events on purpose: a
          merely-dimmed shop card still invites the click, and a Ready press
          with an unanswered offer silently throws the augment away. Both come
          back untouched the instant a card is picked, and the prep clock —
          lifted above this scrim by PrepClock — still ends the phase on its
          own, so nobody can be stuck behind it. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: INTERMISSION_Z.focusScrim,
          background: FOCUS_SCRIM_BG,
          pointerEvents: "auto",
          animation: `ggdFocusIn ${FOCUS_FADE_MS}ms ease-out both`,
        }}
      >
        <style>{"@keyframes ggdFocusIn{from{opacity:0}to{opacity:1}}"}</style>
      </div>
      <div
        // task #197 — the pad focus layer scopes to this panel: the draft scrim
        // MUST be answerable by a pad, or a keyboard-less player loses the
        // augment. High priority so it wins over any other scope beneath it.
        data-pad-scope="augment-draft"
        data-pad-scope-priority="40"
        style={{
          position: "absolute",
          // BOTH axes — the panel's #107 registry row declares `edge: "center"`
          // and hudPanelRect resolves that to ((H − h) / 2). Pinning a literal
          // top was the declaration/reality mismatch that put the card stack on
          // the merchant tip box's band.
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: INTERMISSION_Z.focus,
          width: 460,
          maxWidth: "92vw",
          padding: 14,
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 12,
          color: TEXT_MAIN,
          pointerEvents: "auto",
        }}
      >
        {offers.map((offer) => (
          // keyed by offerId so a new offer REMOUNTS the reveal — every fresh
          // roll replays its build-up / sparkles / jackpot from the top.
          <DraftOffer key={offer.offerId} offer={offer} />
        ))}
        {/* the answer to 「四件事同時要注意力」: say which one is first, and
            promise the rest is coming back. */}
        <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: TEXT_DIM }}>
          {FOCUS_HINT}
        </div>
      </div>
    </>
  );
}

/**
 * ONE draft offer: its tier header and the three choice cards, owning the reveal
 * sequence. On mount it schedules {@link revealSchedule} — a legendary offer
 * fires `legendaryRoll` at once, each card flips face-up on its own
 * `draftCardReveal` sparkle, and a legendary lands on `legendaryWin`. `revealed`
 * counts how many cards have flipped; a card below that count is face-up, the
 * rest are dimmed and lifted until their turn.
 */
function DraftOffer({ offer }: { offer: OfferView }): React.JSX.Element {
  const accent = tierColor(offer.tier);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const legendary = isLegendaryOffer(offer.tier);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const step of revealSchedule(offer.choices.length, legendary)) {
      timers.push(
        setTimeout(() => {
          if (step.cardIndex !== undefined) {
            // flip THIS card face-up (monotonic: a late timer never un-reveals)
            setRevealed((n) => Math.max(n, step.cardIndex! + 1));
          }
          audioSystem.playSfx(step.event);
        }, step.atMs),
      );
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
    // remount-per-offer (see the key above) makes offerId the only real dep;
    // choices/tier are fixed for a given offerId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.offerId]);

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: "bold", color: accent, letterSpacing: "0.06em" }}>
          {tierLabel(offer.tier)}
        </span>
        <span style={{ fontSize: 11, color: TEXT_DIM }}> · 三選一</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {offer.choices.map((choice, idx) => {
          const { name, desc, icon } = resolveChoice(choice);
          // Weapon cards must state what the weapon DOES, not just its cost:
          // pull the shop's concrete effect+stat read of the same item, and
          // keep resolveChoice's text for augments/abilities (they already
          // carry a description) and for a bare item (its cost).
          const cardDesc = weaponEffectDescription(choice) ?? desc;
          const faceUp = idx < revealed;
          return (
            <Tooltip
              key={choice}
              title={name}
              body={cardDesc}
              style={{ flex: 1, minWidth: 0, display: "flex" }}
            >
              <SfxButton
                kind="card"
                // encode the chosen index so the server applies THIS card
                // (host accepts "offerId#idx"; plain id falls back to choice 0)
                onClick={() => {
                  audioSystem.playSfx(DRAFT_CONFIRM_SFX);
                  hudActions.sendCommand({ kind: "pickOffer", offerId: `${offer.offerId}#${idx}` });
                }}
                style={
                  {
                    // tier tint for the flowing border glow (.ggd-btn--card)
                    "--ggd-card-glow": accent,
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 8px 12px",
                    borderRadius: 12,
                    cursor: "pointer",
                    background: "linear-gradient(180deg, #1b2233 0%, #12172a 100%)",
                    border: `1px solid ${accent}44`,
                    color: TEXT_MAIN,
                    textAlign: "center",
                    // the reveal flip: a face-down card sits dimmed + lifted, then
                    // settles opaque the instant its draftCardReveal sparkle fires.
                    // pointer-events off while hidden so a card cannot be hovered
                    // or picked before the player can actually see it.
                    opacity: faceUp ? 1 : 0,
                    pointerEvents: faceUp ? "auto" : "none",
                    transform: faceUp ? "translateY(0)" : "translateY(8px)",
                    transition:
                      "box-shadow 0.25s ease, transform 0.28s ease, opacity 0.28s ease",
                  } as React.CSSProperties
                }
              >
                {/* MANDATORY icon: real art when present, else a deterministic
                    tier-framed glyph — never an empty hole. */}
                <GlyphTile
                  seed={choice}
                  icon={icon ?? null}
                  label={name}
                  accent={accent}
                  size={46}
                  radius={10}
                />
                <div style={{ fontSize: 12.5, fontWeight: "bold", color: accent, lineHeight: 1.15 }}>
                  {name}
                </div>
                <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.3 }}>{cardDesc}</div>
              </SfxButton>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
