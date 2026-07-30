/**
 * GoldLevel — the bottom-right personal readout: YOUR FACE, your gold, your
 * level.
 *
 * ---------------------------------------------------------------------------
 * THE PORTRAIT (owner, 2026-07-30)
 * ---------------------------------------------------------------------------
 * 「自己的英雄角色 icon 在戰鬥場景 要顯示在右下角等級金錢區域」 — and the operative
 * word is 「區域」: it is ONE group, not a portrait floating next to a number.
 * So it lives INSIDE this box as the leading cell of a flex row rather than
 * claiming a slot of its own, which also keeps it out of the bottom-right
 * column's height budget — at 780×360 that column already runs 10→348 of 360
 * and a new 64 px row would push the equipment bar clean off the top of the
 * screen (failure shape ①).
 *
 * ⚠️ NOT EVERY CHAMPION HAS AN ICON. `content/assets/icons/champions/` is
 * incomplete (tasks #72 / #178 are still counting), so the portrait is a
 * <GlyphTile>: the raster is layered OVER a deterministic seeded glyph and
 * `IconImg` renders null on an absent or 404 src, so a missing file degrades to
 * a coloured 「亞」 tile instead of a broken-image box. Nothing here has to know
 * in advance which champions shipped art.
 *
 * ⚠️ 變身 SHOWS THE FACE ON SCREEN, not the one you picked. `seat.championId`
 * freezes at champ-select; the form comes off the entity's FORM bits
 * (`SeatView.formIndex`) and the counterpart id from the same shared helper the
 * model resolvers use. That is a DECISION, not a fact, so it is a field —
 * `heroPortrait: "current-form" | "base" | "off"` in ui/hud/hudBottomCluster,
 * defaulting to the owner's answer (玩家看到的是誰就顯示誰).
 *
 * ---------------------------------------------------------------------------
 * THE SLOT (unchanged, and still the reason the box is not hard-pinned)
 * ---------------------------------------------------------------------------
 * It claims the "gold-level" slot at the bottom of the bottom-right stack
 * (#107). It used to hard-pin `right:14 / bottom:14` against `HUD_EDGE = 10`
 * while its registry row reserved only 56px of height — and the box is really
 * 61px tall once the "+N skill pt" line appears, so its far edge landed at 75px
 * against the minimap's band start of 74. A measured 1px overlap that nothing
 * could catch, because an unmanaged slot is invisible to the layout guard.
 * Reading the position from the registry makes the pin and the reservation the
 * same fact; the row now reserves the measured worst case.
 */
import { counterpartFormId } from "@ggd/shared/content";
import { useHud } from "../../net/RoomStore";
import { hudTouch } from "../hud/HudSlot";
import { hudSlotStyle } from "../hud/hudLayout";
import { heroPortraitChampionId, hudClusterTuning } from "../hud/hudBottomCluster";
import { championIconUrl } from "../icons";
import { GlyphTile } from "./GlyphTile";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";

export function GoldLevel(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const touch = hudTouch();
  if (!seat) return null;
  const tuning = hudClusterTuning();
  const shownId = heroPortraitChampionId(
    seat.championId,
    seat.formIndex ?? 0,
    seat.championId ? (counterpartFormId(seat.championId) ?? null) : null,
    tuning,
  );
  const def = shownId ? Champions.tryGet(shownId as ChampionId) : null;
  return (
    <div
      data-hud-slot="gold-level"
      style={{
        ...hudSlotStyle("gold-level", touch),
        display: "flex",
        // coarse pointers stack it — see the `touchWidth` note on the slot row:
        // the touch bottom-right corner has height to spare and no width.
        flexDirection: touch ? "column" : "row",
        alignItems: touch ? "flex-end" : "center",
        gap: 8,
        padding: "8px 10px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        color: TEXT_MAIN,
        fontSize: 12,
        textAlign: "right",
      }}
    >
      {shownId && (
        /* the marker carries WHICH champion is shown, so the guard can assert
           the 變身 answer rather than merely that a tile exists (failure ⑦) */
        <span data-hud-hero-portrait={shownId} style={{ display: "flex", flexShrink: 0 }}>
          <GlyphTile
            seed={shownId}
            src={championIconUrl(shownId)}
            label={def?.name ?? shownId}
            size={tuning.heroPortraitPx}
          />
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ color: GOLD, fontSize: 15, fontWeight: "bold" }}>{seat.gold} g</div>
        <div>
          Lv {seat.level}
          <span style={{ color: TEXT_DIM }}> · {seat.xp} xp</span>
        </div>
        {seat.unspentPoints > 0 && (
          <div style={{ color: GOLD, fontSize: 10 }}>+{seat.unspentPoints} skill pt</div>
        )}
      </div>
    </div>
  );
}
