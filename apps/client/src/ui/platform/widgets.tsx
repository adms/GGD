/** Small shared building blocks for the platform screens (theme-consistent). */
import { useState } from "react";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, GOLD } from "../theme";
import { buttonSfx } from "../buttonSfx";

export const ACCENT = "#6f8fe0";
export const ACCENT_BG = "#2c3f6b";
export const DANGER = "#e5483f";
export const OK = "#47cc6a";

export function Panel(props: {
  title?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 12,
        padding: 14,
        color: TEXT_MAIN,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...props.style,
      }}
    >
      {props.title && (
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
          {props.title}
        </div>
      )}
      {props.children}
    </div>
  );
}

export function Btn(props: {
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "ghost" | "danger";
  small?: boolean;
  title?: string;
  style?: React.CSSProperties;
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
      className={cls}
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

export function TextInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <input
      value={props.value}
      type={props.type ?? "text"}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onEnter?.();
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
