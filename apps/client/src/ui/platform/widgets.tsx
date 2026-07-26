/** Small shared building blocks for the platform screens (theme-consistent). */
import { forwardRef, useEffect, useRef, useState } from "react";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, GOLD } from "../theme";
import { buttonSfx } from "../buttonSfx";
import type { StoreCurrency } from "./currency";

export const ACCENT = "#6f8fe0";
export const ACCENT_BG = "#2c3f6b";
export const DANGER = "#e5483f";
export const OK = "#47cc6a";

export interface PanelProps {
  title?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  /**
   * Pointer hooks (task #258): the lobby 英靈殿 defers its 60-second rotation
   * while the player has the pointer on the card. Optional, so every existing
   * Panel is byte-identical in behaviour.
   */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** `data-*` hooks for screenshot probes / e2e selectors. */
  [dataAttr: `data-${string}`]: unknown;
}

/**
 * forwardRef so a caller can observe the panel itself (the showcase attaches an
 * IntersectionObserver to stop its WebGL context while scrolled off-screen).
 */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { title, style, children, onMouseEnter, onMouseLeave, ...rest },
  ref,
): React.JSX.Element {
  const dataProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (k.startsWith("data-")) dataProps[k] = v;
  return (
    <div
      ref={ref}
      {...dataProps}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 12,
        padding: 14,
        color: TEXT_MAIN,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 12,
            fontWeight: "bold",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: TEXT_DIM,
            marginBottom: 10,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
});

export function Btn(props: {
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "ghost" | "danger";
  small?: boolean;
  title?: string;
  style?: React.CSSProperties;
  /**
   * DEFAULTS TO "button" ON PURPOSE. A <button> with no type attribute is
   * type="submit" per HTML — harmless while nothing is wrapped in a <form>,
   * but AuthScreen now IS a form (see TextInput's autofill note), and there a
   * bare Btn means clicking "Create account" (a mode tab) submits the form and
   * reloads the whole SPA. Every Btn in the app is a plain action button; the
   * one real submit button opts in explicitly with type="submit".
   */
  type?: "button" | "submit";
  /**
   * Optional handle to the underlying <button>, so a gamepad-driven screen can
   * move DOM focus onto it (#197 — the QR device-login panel focuses buttons
   * with the D-pad). Opt-in and unused by every existing caller.
   */
  btnRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}): React.JSX.Element {
  const kind = props.kind ?? "ghost";
  // Skin (gradient / trim / glow) comes from the shared buttonFx.css `.ggd-btn`
  // class; only GEOMETRY stays inline here so callers' `style` still wins.
  const base: React.CSSProperties = {
    padding: props.small ? "4px 10px" : "8px 16px",
    borderRadius: 8,
    fontSize: props.small ? 11 : 13,
    fontWeight: 600,
    cursor: props.disabled ? "default" : "pointer",
    opacity: props.disabled ? 0.45 : 1,
    ...props.style,
  };
  const cls = `ggd-btn ggd-btn--${kind}`;
  // hover + click SFX for every Btn across the app (login/lobby/shop/settings/
  // ranked/draft/…). Disabled buttons get no handlers. A tiny press-scale gives
  // tactile visual feedback on top of the sound.
  const sfx = props.disabled ? undefined : buttonSfx(props.onClick);
  return (
    <button
      ref={props.btnRef}
      className={cls}
      type={props.type ?? "button"}
      onClick={sfx ? sfx.onClick : props.onClick}
      onPointerEnter={sfx?.onPointerEnter}
      disabled={props.disabled}
      title={props.title}
      style={{ transition: "transform 80ms ease", ...base }}
      onPointerDown={(e) => {
        if (!props.disabled) e.currentTarget.style.transform = "scale(0.95)";
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = "";
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = "";
      }}
    >
      {props.children}
    </button>
  );
}

/**
 * ---- THE AUTOFILL PROBE (task #185) ------------------------------------------
 *
 * Chrome tells nobody when it autofills. It sets .value and — in the common
 * case — dispatches an `input` event React understands, but a password manager
 * (or Chrome's own on-load fill) can also write the value with NO event at all.
 * A controlled React input then re-renders with value="" and silently WIPES what
 * was filled. The only reliable notification is a CSS side-channel: Chrome
 * applies the `:-webkit-autofill` pseudo-class to a filled field, so giving that
 * pseudo-class an animation makes the browser fire a real `animationstart` at
 * the exact moment of the fill. That is what this stylesheet is for.
 *
 * It also restates the field's own colours under `:-webkit-autofill`: Chrome
 * force-paints a pale background on filled inputs, which on this dark panel
 * would turn the login box white the first time autofill works. The inset
 * box-shadow is the only way to override it (background-color is ignored).
 */
const AUTOFILL_ANIM = "ggdAutofillStart";
let autofillProbeInstalled = false;
function installAutofillProbe(): void {
  if (autofillProbeInstalled || typeof document === "undefined") return;
  autofillProbeInstalled = true;
  const el = document.createElement("style");
  el.setAttribute("data-ggd", "autofill-probe");
  el.textContent =
    `@keyframes ${AUTOFILL_ANIM}{from{opacity:1}to{opacity:1}}` +
    `input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus{` +
    `animation-name:${AUTOFILL_ANIM};animation-duration:1ms;` +
    `-webkit-text-fill-color:${TEXT_MAIN};caret-color:${TEXT_MAIN};` +
    `-webkit-box-shadow:0 0 0 1000px #10141f inset;box-shadow:0 0 0 1000px #10141f inset;}`;
  document.head.appendChild(el);
}

/**
 * Belt-and-braces re-checks for managers that neither fire an event nor trip the
 * `:-webkit-autofill` pseudo-class (Firefox, some extensions). Cheap: a handful
 * of string comparisons in the first second and a half of the screen's life.
 */
const AUTOFILL_RECHECK_MS = [0, 60, 250, 700, 1500] as const;

export function TextInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  style?: React.CSSProperties;
  /**
   * ---- PASSWORD-MANAGER IDENTITY (task #185) ---------------------------------
   * All optional, all additive — existing callers (FriendsPanel, RoomListPanel,
   * RoomView) pass none of them and are unchanged.
   *
   * These exist because a browser cannot fill a box it cannot NAME. Without
   * `name` / `id` / `autoComplete` an input's only identity is its placeholder,
   * which is the weakest signal Chrome has, so a saved credential has nothing to
   * bind to on the next visit. DELETING THESE ATTRIBUTES BREAKS EVERY PASSWORD
   * MANAGER AND LOOKS PERFECTLY FINE IN DEV — there is no error, no warning, and
   * no visual difference; the box is simply empty forever. See AuthScreen for
   * which value each field carries and why.
   */
  name?: string;
  id?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  spellCheck?: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement | null>(null);
  /** Latest props for listeners installed once on mount (never re-bound). */
  const live = useRef({ value: props.value, onChange: props.onChange });
  live.current.value = props.value;
  live.current.onChange = props.onChange;
  /** The last non-empty value the BROWSER put in the box behind React's back. */
  const filledRef = useRef("");
  /** Has a real React change (typing, paste, event-firing autofill) ever landed? */
  const sawChangeRef = useRef(false);

  useEffect(() => {
    installAutofillProbe();
    const el = ref.current;
    if (el === null) return;
    /**
     * Adopt a DOM value React never heard about. Guarded on non-empty and
     * different, so it can only ever run in the divergent case: it cannot clear
     * a field the user is typing in, and it cannot fight the parent's own
     * transform (e.g. the invite code's uppercase) into a loop.
     */
    const adopt = (): void => {
      const v = el.value;
      if (v === "" || v === live.current.value) return;
      filledRef.current = v;
      live.current.onChange(v);
    };
    const onAnim = (e: AnimationEvent): void => {
      if (e.animationName === AUTOFILL_ANIM) adopt();
    };
    el.addEventListener("animationstart", onAnim);
    el.addEventListener("change", adopt); // managers that fire change but not input
    const timers = AUTOFILL_RECHECK_MS.map((ms) => window.setTimeout(adopt, ms));
    return () => {
      el.removeEventListener("animationstart", onAnim);
      el.removeEventListener("change", adopt);
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  /**
   * Runs after EVERY commit (no dep array, on purpose): if a re-render landed
   * between the browser's silent fill and our adopt, React will have written
   * value="" straight over it. Put it back. Only ever fires while no real change
   * event has been seen — so a user who autofills and then deliberately clears
   * the box (which DOES fire one) is never fought.
   */
  useEffect(() => {
    if (sawChangeRef.current || props.value !== "") return;
    // Prefer what is in the box right now; fall back to what we saw filled
    // before a render wiped it.
    const dom = ref.current?.value ?? "";
    const recover = dom !== "" ? dom : filledRef.current;
    if (recover === "") return;
    live.current.onChange(recover);
  });

  return (
    <input
      ref={ref}
      value={props.value}
      type={props.type ?? "text"}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      name={props.name}
      id={props.id}
      autoComplete={props.autoComplete}
      autoCapitalize={props.autoCapitalize}
      spellCheck={props.spellCheck}
      onChange={(e) => {
        sawChangeRef.current = true;
        props.onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        // preventDefault ONLY when this input owns Enter: inside a <form> the
        // key would otherwise ALSO trigger implicit submission and run submit()
        // a second time. stopPropagation does not stop that — it is a default
        // action, not a listener. Callers without onEnter keep native behaviour.
        if (e.key === "Enter" && props.onEnter) {
          e.preventDefault();
          props.onEnter();
        }
        e.stopPropagation(); // never leak typing into game hotkeys
      }}
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #2c3448",
        background: "#10141f",
        color: TEXT_MAIN,
        fontSize: 13,
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

export function FieldError(props: { text?: string | null }): React.JSX.Element | null {
  if (!props.text) return null;
  return <div style={{ color: "#f08c8c", fontSize: 11, marginTop: 3 }}>{props.text}</div>;
}

export function Badge(props: { color: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: props.color,
        border: `1px solid ${props.color}`,
        borderRadius: 6,
        padding: "1px 6px",
      }}
    >
      {props.children}
    </span>
  );
}

export function MCoin(props: { amount: number; size?: number }): React.JSX.Element {
  return (
    <span style={{ color: GOLD, fontWeight: 700, fontSize: props.size ?? 13, whiteSpace: "nowrap" }}>
      Ⓜ {props.amount.toLocaleString()}
    </span>
  );
}

/** 藍水晶 blue — the earn-by-playing currency (#118/#204). Distinct from M幣 gold. */
export const CRYSTAL_BLUE = "#4ec3ff";

/**
 * 藍水晶 chip: icon + number, shown in the lobby HUD beside M幣. The 🔷 is
 * inherently blue so it reads as "crystal" without relying on the text colour,
 * and it carries a title so a first-time family member learns what it is on
 * hover. This is the earn-by-playing currency that unlocks champions — a
 * separate wallet from the admin-granted cosmetic M幣.
 */
export function Crystal(props: { amount: number; size?: number }): React.JSX.Element {
  return (
    <span
      title="藍水晶 — 打場免費賺，用來解鎖英雄（與造型幣 M幣 分開）"
      style={{ color: CRYSTAL_BLUE, fontWeight: 700, fontSize: props.size ?? 13, whiteSpace: "nowrap" }}
    >
      🔷 {props.amount.toLocaleString()}
    </span>
  );
}

/**
 * Price chip driven by the ROW's currency (task #227).
 *
 * The store used to hardcode `<MCoin>` on every price, including champions —
 * which are unlocked with 藍水晶. Rendering through the row's own `currency`
 * means the glyph a player reads and the wallet the server debits come from one
 * fact, so they cannot drift apart again.
 */
export function Price(props: {
  currency: StoreCurrency;
  amount: number;
  size?: number;
}): React.JSX.Element {
  const size = props.size ?? 13;
  return props.currency === "crystal" ? (
    <Crystal amount={props.amount} size={size} />
  ) : (
    <MCoin amount={props.amount} size={size} />
  );
}

const PRESENCE_COLOR: Record<string, string> = {
  online: OK,
  "in-lobby": OK,
  "in-match": GOLD,
  offline: "#4a5266",
};

export function PresenceDot(props: { state: string }): React.JSX.Element {
  return (
    <span
      title={props.state || "offline"}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: PRESENCE_COLOR[props.state] ?? PRESENCE_COLOR.offline,
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

/** Unescape the entities Go's html.EscapeString produces (render-safe: React re-escapes). */
export function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Copyable one-line code box. */
export function CodeBox(props: { value: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
      <code
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 11,
          background: "#10141f",
          border: "1px solid #2c3448",
          borderRadius: 6,
          padding: "4px 8px",
          color: TEXT_MAIN,
        }}
      >
        {props.value}
      </code>
      <Btn
        small
        onClick={() => {
          void navigator.clipboard?.writeText(props.value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Btn>
    </div>
  );
}
