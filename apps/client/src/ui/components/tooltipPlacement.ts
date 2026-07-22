/**
 * Floating-tooltip placement math (pure, node-testable — no DOM).
 *
 * The tooltip is anchored to the hovered element's rect and OFFSET so the
 * cursor (which sits inside that rect) never covers it: it renders on ONE side
 * of the anchor — above by default — and its box never intersects the anchor's
 * vertical band. Near a screen edge it FLIPS to the opposite side; horizontally
 * it centers over the anchor and CLAMPS inside the viewport. The React
 * `Tooltip` component measures the rects and feeds them here.
 */
export type TooltipSide = "top" | "bottom";

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TooltipSize {
  width: number;
  height: number;
}
export interface ViewportSize {
  width: number;
  height: number;
}

export interface TooltipPlacementInput {
  /** hovered element's bounding rect (viewport coords) */
  anchor: AnchorRect;
  /** measured tooltip box */
  tooltip: TooltipSize;
  viewport: ViewportSize;
  /** vertical gap between the anchor edge and the tooltip (keeps the cursor clear) */
  gap?: number;
  /** minimum distance kept from every viewport edge */
  margin?: number;
  /** preferred side; flips to the opposite when it won't fit */
  prefer?: TooltipSide;
}

export interface TooltipPlacement {
  /** viewport-fixed left (px) */
  left: number;
  /** viewport-fixed top (px) */
  top: number;
  /** side actually chosen after the edge-flip */
  side: TooltipSide;
}

export const TOOLTIP_GAP = 10;
export const TOOLTIP_MARGIN = 8;

/**
 * Resolve where a tooltip of `tooltip` size should sit relative to `anchor`.
 * Guarantees (for a tooltip that fits on at least one side):
 *   - the box is fully ABOVE or BELOW the anchor — never over the anchor/cursor;
 *   - it stays within `margin` of the viewport edges.
 * When neither side has room the side with the most room is chosen (still
 * clearing the anchor) and the box may extend past an edge.
 */
export function computeTooltipPlacement(input: TooltipPlacementInput): TooltipPlacement {
  const { anchor, tooltip, viewport } = input;
  const gap = input.gap ?? TOOLTIP_GAP;
  const margin = input.margin ?? TOOLTIP_MARGIN;
  const prefer = input.prefer ?? "top";

  // --- vertical: pick a side whose box clears the anchor entirely ---
  const fitsTop = anchor.y - gap - tooltip.height >= margin;
  const fitsBottom = anchor.y + anchor.height + gap + tooltip.height <= viewport.height - margin;

  let side: TooltipSide = prefer;
  if (prefer === "top" && !fitsTop) side = fitsBottom ? "bottom" : "top";
  else if (prefer === "bottom" && !fitsBottom) side = fitsTop ? "top" : "bottom";

  if (!fitsTop && !fitsBottom) {
    // neither side fits — take the roomier one (box still clears the anchor)
    const roomTop = anchor.y - margin;
    const roomBottom = viewport.height - margin - (anchor.y + anchor.height);
    side = roomTop >= roomBottom ? "top" : "bottom";
  }

  const top =
    side === "top"
      ? anchor.y - gap - tooltip.height
      : anchor.y + anchor.height + gap;

  // --- horizontal: center on the anchor, then clamp inside the viewport ---
  const anchorCenterX = anchor.x + anchor.width / 2;
  let left = anchorCenterX - tooltip.width / 2;
  const maxLeft = viewport.width - margin - tooltip.width;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;

  return { left, top, side };
}
