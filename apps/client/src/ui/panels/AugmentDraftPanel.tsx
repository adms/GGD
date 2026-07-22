/**
 * AugmentDraftPanel — the 3-choose-1 draft (task #110). SeatState.offers →
 * pickOffer command. ONE panel serves every draft: silver/gold/prismatic
 * augment rounds, legendary WEAPON rounds and the orb gacha all arrive as the
 * same OfferState and render here, discriminated only by `offer.tier`.
 *
 * THREE THINGS THIS PANEL OWES THE PLAYER (all requested):
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
 */
import { useHud } from "../../net/RoomStore";
import { audioSystem } from "../../audio";
import { hudActions } from "../actions";
import { GlyphTile } from "../components/GlyphTile";
import { Tooltip } from "../components/Tooltip";
import { SfxButton } from "../SfxButton";
import { resolveChoice } from "./resolveChoice";
import { DRAFT_CONFIRM_SFX, tierColor, tierLabel } from "./draftCardStyle";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

export function AugmentDraftPanel(): React.JSX.Element | null {
  const offers = useHud((s) => {
    if (s.localSeatId === null) return null;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.offers ?? null;
  });
  if (!offers || offers.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 90,
        transform: "translateX(-50%)",
        width: 460,
        padding: 14,
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 12,
        color: TEXT_MAIN,
        pointerEvents: "auto",
      }}
    >
      {offers.map((offer) => {
        const accent = tierColor(offer.tier);
        return (
          <div key={offer.offerId}>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: "bold", color: accent, letterSpacing: "0.06em" }}>
                {tierLabel(offer.tier)}
              </span>
              <span style={{ fontSize: 11, color: TEXT_DIM }}> · 三選一</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {offer.choices.map((choice, idx) => {
                const { name, desc, icon } = resolveChoice(choice);
                return (
                  <Tooltip
                    key={choice}
                    title={name}
                    body={desc}
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
                          transition: "box-shadow 0.25s ease, transform 80ms ease",
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
                      <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.3 }}>{desc}</div>
                    </SfxButton>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
