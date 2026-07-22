/**
 * SettingsCorner — the gear button that opens the full SettingsScreen. Used
 * both in-match (a pause/settings entry) and from the lobby. Replaces the old
 * minimal quality picker; the grouped graphics + network controls now live in
 * SettingsScreen and apply live through the SettingsStore.
 *
 * Placement is DECLARED, never hard-coded: it owns the "settings" slot of the
 * top-right corner stack (ui/hud/hudLayout), so it can no longer land on top of
 * the cheat-console button the way the old fixed `top: 44` did.
 */
import { useState } from "react";
import { SettingsScreen } from "./SettingsScreen";
import { SfxButton } from "./SfxButton";
import { hudTouch } from "./hud/HudSlot";
import { hudSlotHeight, hudSlotStyle } from "./hud/hudLayout";
import { useHudSlotHidden } from "./hud/useHudPanels";
import { TEXT_DIM } from "./theme";

export function SettingsCorner(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const touch = hudTouch();
  const size = hudSlotHeight("settings", touch);
  // hides under a full terminal panel (match-end) rather than floating the gear
  // over the settlement screen; the panel provides its own navigation.
  const hidden = useHudSlotHidden("settings", touch);
  return (
    <>
      {!hidden && (
        <div
          data-hud-slot="settings"
          style={{ ...hudSlotStyle("settings", touch), pointerEvents: "auto" }}
        >
        <SfxButton
          className="ggd-tap"
          title="settings"
          sfxVolume={0.6}
          onClick={() => setOpen(true)}
          style={{
            width: size,
            height: size,
            borderRadius: 8,
            border: "1px solid #2c3448",
            background: "#171d2b",
            color: TEXT_DIM,
            cursor: "pointer",
            fontSize: 14,
            padding: 0,
          }}
        >
            ⚙
          </SfxButton>
        </div>
      )}
      {open && <SettingsScreen onClose={() => setOpen(false)} />}
    </>
  );
}
