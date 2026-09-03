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
import { rescaleAbilityProse, WC3_PROSE_CAPTION } from "./abilityText";
import {
  tokenizeDescription,
  PALETTE_HEX,
} from "@ggd/shared/content/import/descriptionTokens";
import { displayFinalText, useDisplayEnv, type DisplayFactor } from "../displayFinal";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

/** above AudioToggle's Z_TOP (2147483000) menu — the tooltip tops everything. */
const Z_TOOLTIP = 2147483001;

/**
 * A key→value chip under the title. Two mutually-exclusive value forms:
 *   • a literal `value` string (cast type, an un-scaled cost, a raw label), or
 *   • a `base` number + the combat-env `factor` that scales it — the chip then
 *     renders the POST-MULTIPLIER final (task #125), live against the current
 *     table, so 冷卻 base 35s under `cooldown: 0.25` shows `8.75s`, never 35s.
 * When both are present the scaled final wins.
 */
export interface TooltipMeta {
  label: string;
  value?: string;
  /** pre-multiplier value; rendered as `base × env[factor]` when set. */
  base?: number;
  /** which combat-env factor scales `base` (`"none"`/omitted → not scaled). */
  factor?: DisplayFactor;
  /** unit appended after a scaled final (e.g. "s"). */
  unit?: string;
}

/** Resolve a meta chip to its display string against the live env table. */
export function metaValue(m: TooltipMeta, env: CombatEnvMultipliers): string {
  if (m.factor !== undefined && typeof m.base === "number") {
    return displayFinalText(m.base, m.factor, { env, unit: m.unit });
  }
  return m.value ?? "";
}

export interface TooltipProps {
  /** bold header line — the full (still numbered) ability/item name */
  title: string;
  /** description paragraph (newlines preserved) */
  body?: string;
  /**
   * A pre-rendered body, for callers that need STRUCTURE the string path cannot
   * carry — today that is `<ItemCardBody>` (owner 2026-08-02「卡片道具的排版連在
   * 一起不好閱讀」), which colours `[標記]` chips and 數值 tokens and puts every
   * 效能 line on its own row.
   *
   * When set it REPLACES the `body` block entirely, including the
   * `WC3_PROSE_CAPTION` footnote — that caption is about the ability-prose
   * rescale (`rescaleAbilityProse`), which does not run on a node body, so
   * printing it here would be a claim about something that did not happen
   * (第三守則). `body` is still what a11y / plain-text callers pass; a caller
   * giving both gets the node, and should pass `body` only as the flat fallback.
   */
  bodyNode?: ReactNode;
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
  bodyNode,
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
  // live combat-env table — meta chips carrying {base, factor} render the
  // post-multiplier FINAL and re-render when an operator changes the table.
  const env = useDisplayEnv();

  const hasContent = !!(title || body || bodyNode || (meta && meta.length > 0));

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
                    {m.label} <span style={{ color: TEXT_MAIN }}>{metaValue(m, env)}</span>
                  </span>
                ))}
              </div>
            )}
            {bodyNode ? (
              <div style={{ marginTop: 6 }}>{bodyNode}</div>
            ) : (
              body && (
              <>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11.5,
                    color: "#c8d0e0",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {/* cooldown literals rescaled to the live combat-env final
                      (說明數值最終化)。
                      ⭐ 2026-09-03（GH#757）：語意色彩鏈（task #114）拆掉了 ——
                      `descriptionRoles` 全 repo 零份內容有值，⛔ 而它與這一行的
                      `rescaleAbilityProse` 有正則衝突（先 rescale 再 parse，救不了）
                      ⇒ 餵它會讓冷卻顯示 60 而不是 18。另存見
                      `docs/legacy/_retired-chains/role-markup-114.md`。 */}
                  {/* ⭐⭐ GH#935 —— 說明 token 的**七色分群**。
                      ⭐ 資料來源是 `ggd-presentation-token-manifest@1`（274 個 token /
                      2,650 次出現），⛔ 不是散在這裡的色碼；
                      ⭐ 而它**先 rescale 再 tokenize** 是安全的：token 是完整的
                      `[…]`，⛔ 而 rescale 的正則錨在「數字緊貼關鍵字」——兩者不相交
                      （⚠️ 那正是 #757 的 role markup 做不到的事）。 */}
                  {tokenizeDescription(rescaleAbilityProse(body, env)).map((n, i) =>
                    n.kind === "text" ? (
                      <span key={i}>{n.text}</span>
                    ) : (
                      <span key={i} style={{ color: PALETTE_HEX[n.palette] }}>
                        [{n.label}]
                      </span>
                    ),
                  )}
                </div>
                <div style={{ marginTop: 4, fontSize: 10, color: TEXT_DIM }}>{WC3_PROSE_CAPTION}</div>
              </>
              )
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
