/**
 * AbilityDescriptionOverlay — the full ability description panel that floats
 * across the TOP of the screen while a player PRESSES-AND-HOLDS an ability button
 * (task #152). Desktop mouse-hold and touch finger-hold both funnel through the
 * ui/abilityHold seam; this panel simply renders whatever slot is held.
 *
 * It is NOT the anchored cursor Tooltip — it is a wide, screen-top banner — but
 * it reuses the SAME content source (docDescription + the shared meta chips, via
 * `describeHeldAbility`) and the SAME role-markup colouring, so the held panel can
 * never disagree with the tile's hover tooltip. Cost/cooldown finals track the
 * live combat-env table through `useDisplayEnv`, exactly like the tooltip.
 *
 * Rendered as a child of the owning bar (AbilityBar on desktop, TouchControls on
 * touch — mutually exclusive per platform); `position: fixed` lifts it to the top
 * of the viewport regardless of the parent's placement, and `pointerEvents: none`
 * keeps it from ever swallowing a press.
 */
import { useHud } from "../net/RoomStore";
import { useDisplayEnv } from "./displayFinal";
import { useHeldAbility, describeHeldAbility } from "./abilityHold";
import { metaValue } from "./components/Tooltip";
import { parseRoleMarkup, rescaleAbilityProse, ROLE_COLOR, WC3_PROSE_CAPTION } from "./components/abilityText";
import { PASSIVE_ACCENT, PASSIVE_SLOT_LABEL } from "./passiveSlot";
import { PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

const EX_ACCENT = "#f2a13c";
/** above the HUD chrome; still below the Tooltip's max-z so a hover tooltip wins. */
const Z_OVERLAY = 2000;

export function AbilityDescriptionOverlay(): React.JSX.Element | null {
  const slot = useHeldAbility();
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  // live combat-env table — the cost/cooldown chips render post-multiplier finals
  // and this also keeps the imperative displayFinal singleton fresh for the
  // floor range-ring preview while the panel is up (esp. on touch).
  const env = useDisplayEnv();

  if (slot === null || !seat) return null;
  const info = describeHeldAbility(seat, slot);
  if (!info) return null;

  // slot badge: amber = EX, violet = the 天生技 sixth slot, blue = Q/W/E/R
  const badgeColor = slot === "EX" ? EX_ACCENT : slot === "PASSIVE" ? PASSIVE_ACCENT : "#8fb4ff";
  const badgeText = info.slot === "PASSIVE" ? PASSIVE_SLOT_LABEL : info.slot;

  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 24px)",
        maxWidth: 620,
        padding: "10px 16px",
        background: "rgba(10, 13, 20, 0.94)",
        border: PANEL_BORDER,
        borderRadius: 10,
        boxShadow: "0 8px 26px rgba(0,0,0,0.55)",
        color: TEXT_MAIN,
        zIndex: Z_OVERLAY,
        pointerEvents: "none",
        boxSizing: "border-box",
      }}
    >
      {/* header: slot badge + clean ability name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            flex: "0 0 auto",
            minWidth: 26,
            height: 22,
            padding: "0 7px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 5,
            border: `1px solid ${badgeColor}`,
            color: badgeColor,
            fontSize: 13,
            fontWeight: "bold",
            lineHeight: 1,
          }}
        >
          {badgeText}
        </span>
        <span style={{ fontSize: 17, fontWeight: "bold" }}>{info.name}</span>
      </div>

      {/* meta chips: cast type / cooldown / mana (+ EX hotkey) */}
      {info.meta.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
          {info.meta.map((m) => (
            <span key={m.label} style={{ fontSize: 12, color: TEXT_DIM }}>
              {m.label} <span style={{ color: TEXT_MAIN }}>{metaValue(m, env)}</span>
            </span>
          ))}
        </div>
      )}

      {/* description body — cooldown literals rescaled to the live combat-env
          final (說明數值最終化); role-markup colours normalised (task #114) */}
      {info.body && (
        <>
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.5,
              color: "#c8d0e0",
              whiteSpace: "pre-wrap",
            }}
          >
            {parseRoleMarkup(rescaleAbilityProse(info.body, env)).map((seg, i) => (
              <span key={i} style={seg.role ? { color: ROLE_COLOR[seg.role] } : undefined}>
                {seg.text}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 5, fontSize: 11, color: TEXT_DIM }}>{WC3_PROSE_CAPTION}</div>
        </>
      )}
    </div>
  );
}
