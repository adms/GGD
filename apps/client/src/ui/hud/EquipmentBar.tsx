/**
 * EquipmentBar — the persistent in-match equipment bar (task #44). A LoL-style
 * row of the LOCAL champion's owned items that stays up through combat, so the
 * player always sees what they carry without opening the shop.
 *
 * It is HUD chrome, so it claims a registry slot ("equipment") rather than
 * hard-coding a corner (task #107): desktop bottom-right, above the minimap
 * stack — the LoL item-bar corner; on coarse pointers it re-homes to the
 * top-right, because bottom-right is the touch ability arc (the exact reason the
 * minimap itself re-homes). Both are right-edge corners the left-docked shop
 * never reaches, so it needs no `displaced` policy.
 *
 * DISPLAY-ONLY: selling stays in the shop (blocked in combat anyway), so unlike
 * the shop's InventoryGrid these cells do not click-to-sell — they only surface
 * the icon + the detailed hover tooltip. All the display logic is the pure
 * `equipmentBar` model; this shell wires it to <Tooltip>/<GlyphTile>/the slot.
 */
import { Items } from "@ggd/shared/sim/content/registry";
import type { ItemId } from "@ggd/shared/ids";
import { useHud } from "../../net/RoomStore";
import { GlyphTile } from "../components/GlyphTile";
import { Tooltip } from "../components/Tooltip";
// owner 2026-08-02 的卡片排版,四個渲染點之一(#140 的裝備欄 hover 詳情)。
import { ItemCardBody } from "../components/ItemCardBody";
import { UNKNOWN_ITEM_LABEL } from "../panels/itemStats";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM } from "../theme";
import { hudSlotStyle, hudSlotWidth } from "./hudLayout";
import { hudTouch } from "./HudSlot";
import { buildEquipmentCells, equipmentCap, type EquipItemDef } from "./equipmentModel";

/** Merchant/shop accent — the item-bar warm gold (matches MerchantShop). */
const ACCENT = "#f2a13c";

/** Resolve an item id to the pure model's def shape (registry-backed). */
function lookupItem(id: string): EquipItemDef | undefined {
  return Items.tryGet(id as ItemId) as unknown as EquipItemDef | undefined;
}

export function EquipmentBar(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  if (!seat) return null;

  const touch = hudTouch();
  const cells = buildEquipmentCells(seat.items, lookupItem);
  const cap = equipmentCap(seat.items);
  // tile size is derived from the reserved width so the six cells + gaps always
  // fit the slot the registry hands us on either pointer type.
  const tile = touch ? 20 : 26;

  return (
    <div
      data-hud-slot="equipment"
      style={{
        ...hudSlotStyle("equipment", touch),
        width: hudSlotWidth("equipment", touch),
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: "4px 6px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: "bold", color: ACCENT }}>裝備</span>
        <span
          style={{
            fontSize: 10,
            color: cap.full ? "#e08a8a" : TEXT_DIM,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {cap.filled} / {cap.cap}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 3 }}>
        {cells.map((cell) => {
          if (cell.itemId === null) {
            return (
              <div
                key={cell.slot}
                style={{
                  aspectRatio: "1",
                  borderRadius: 6,
                  border: "1px dashed rgba(120,140,190,0.28)",
                  background: "rgba(255,255,255,0.02)",
                }}
              />
            );
          }
          return (
            <Tooltip
              key={cell.slot}
              title={cell.name ?? UNKNOWN_ITEM_LABEL}
              // 純文字仍然傳,當作沒有 DOM 時的回退;有 DOM 時 bodyNode 贏。
              body={cell.tooltipBody ?? undefined}
              bodyNode={
                cell.description ? (
                  <ItemCardBody description={cell.description} itemId={cell.itemId} fontSize={11.5} />
                ) : undefined
              }
              meta={cell.meta.length > 0 ? cell.meta.map((m) => ({ label: m.label, value: m.value })) : undefined}
              style={{ display: "block" }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 6,
                  border: `1px solid ${cell.unique ? `${ACCENT}aa` : "#63463a"}`,
                  background: "#2b2018",
                  overflow: "hidden",
                }}
              >
                <GlyphTile
                  seed={cell.itemId}
                  icon={cell.icon}
                  label={cell.name ?? UNKNOWN_ITEM_LABEL}
                  size={tile}
                  accent={cell.unique ? ACCENT : undefined}
                />
                {cell.unique && (
                  <span
                    aria-hidden
                    title="唯一"
                    style={{
                      position: "absolute",
                      top: -1,
                      right: 1,
                      fontSize: 9,
                      color: ACCENT,
                      textShadow: "0 0 3px #000",
                      lineHeight: 1,
                    }}
                  >
                    ◆
                  </span>
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
