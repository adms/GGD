/**
 * Tooltip — a floating, cursor-safe HUD tooltip. Wraps an anchor element and,
 * on hover/focus, portals a panel to <body> positioned via the pure
 * `computeTooltipPlacement` math: ABOVE the anchor by default, flipping below
 * near a screen edge and clamping inside the viewport, so the pointer (which is
 * over the anchor) never covers it. Renders at a very high z-index above the
 * whole HUD. Replaces the native `title=` tooltips on the ability bar, EX
 * button, augment-draft cards and shop rows.
 *
 * The panel content is the ability/item NAME (full, numbered) + optional
 * DESCRIPTION and a row of meta chips (cast type / cooldown / mana). The client
 * vitest env is node (no DOM), so — like the rest of ui/ — only the extracted
 * pure helper (`tooltipPlacement`) is unit-tested; this shell wires it to DOM.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { computeTooltipPlacement, type TooltipSide } from "./tooltipPlacement";
import { parseRoleMarkup, ROLE_COLOR } from "./abilityText";
import { PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

/** above AudioToggle's Z_TOP (2147483000) menu — the tooltip tops everything. */
const Z_TOOLTIP = 2147483001;

export interface TooltipMeta {
  label: string;
  value: string;
}

export interface TooltipProps {
  /** bold header line — the full (still numbered) ability/item name */
  title: string;
  /** description paragraph (newlines preserved) */
  body?: string;
  /** small key→value chips under the title (cast type / cooldown / mana / key) */
  meta?: TooltipMeta[];
  /** preferred side; default "top" (above the anchor, cursor-safe) */
  side?: TooltipSide;
  /** the anchor content the tooltip describes */
  children: ReactNode;
  /** wrapper style — set to preserve the anchor's layout (flex child, block…) */
  style?: CSSProperties;
  /** suppress the tooltip (renders the wrapper + children only) */
  disabled?: boolean;
}

const PANEL_STYLE: CSSProperties = {
  maxWidth: 280,
  padding: "8px 10px",
  background: "rgba(10, 13, 20, 0.97)",
  border: PANEL_BORDER,
  borderRadius: 8,
  boxShadow: "0 6px 20px rgba(0,0,0,0.55)",
  color: TEXT_MAIN,
  fontSize: 12,
  lineHeight: 1.4,
  pointerEvents: "none",
  whiteSpace: "normal",
};

export function Tooltip({
  title,
  body,
  meta,
  side = "top",
  children,
  style,
  disabled,
}: TooltipProps): React.JSX.Element {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const hasContent = !!(title || body || (meta && meta.length > 0));

  // Measure the anchor + freshly-rendered panel and resolve the placement.
  // Runs in a layout effect so the panel is positioned before the browser
  // paints (no flash at 0,0 — it starts hidden until `pos` is known).
  useLayoutEffect(() => {
    if (!open) {
      if (pos !== null) setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const placement = computeTooltipPlacement({
      anchor: { x: a.left, y: a.top, width: a.width, height: a.height },
      tooltip: { width: p.width, height: p.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      prefer: side,
    });
    setPos({ left: placement.left, top: placement.top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side, title, body]);

  const show = disabled ? undefined : (): void => setOpen(true);
  const hide = disabled ? undefined : (): void => setOpen(false);

  const panel =
    open && !disabled && hasContent
      ? createPortal(
          <div
            ref={panelRef}
            role="tooltip"
            style={{
              position: "fixed",
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? "visible" : "hidden",
              zIndex: Z_TOOLTIP,
              ...PANEL_STYLE,
            }}
          >
            <div style={{ fontWeight: "bold" }}>{title}</div>
            {meta && meta.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {meta.map((m) => (
                  <span key={m.label} style={{ fontSize: 11, color: TEXT_DIM }}>
                    {m.label} <span style={{ color: TEXT_MAIN }}>{m.value}</span>
                  </span>
                ))}
              </div>
            )}
            {body && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  color: "#c8d0e0",
                  whiteSpace: "pre-wrap",
                }}
              >
                {/* task #114: render `[c=role]…[/c]` role markup as normalised
                    coloured runs; a plain string yields one uncoloured run. */}
                {parseRoleMarkup(body).map((seg, i) => (
                  <span key={i} style={seg.role ? { color: ROLE_COLOR[seg.role] } : undefined}>
                    {seg.text}
                  </span>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={{ display: "inline-block", ...style }}
    >
      {children}
      {panel}
    </div>
  );
}
