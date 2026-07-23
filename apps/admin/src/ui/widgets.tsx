/** Small theme-consistent building blocks for the admin console. */
import { useState } from "react";
import {
  ACCENT,
  ACCENT_BG,
  DANGER,
  DANGER_BG,
  OK,
  PANEL_BG,
  PANEL_BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  WARN,
} from "./theme";

export function Panel(props: {
  title?: string;
  right?: React.ReactNode;
  style?: React.CSSProperties;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 12,
        padding: 16,
        color: TEXT_MAIN,
        ...props.style,
      }}
    >
      {(props.title || props.right) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: "bold", letterSpacing: 1.2, textTransform: "uppercase", color: TEXT_DIM }}>
            {props.title}
          </div>
          {props.right}
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
  const base: React.CSSProperties = {
    padding: props.small ? "4px 10px" : "8px 16px",
    borderRadius: 8,
    fontSize: props.small ? 11 : 13,
    fontWeight: 600,
    cursor: props.disabled ? "default" : "pointer",
    opacity: props.disabled ? 0.45 : 1,
    color: TEXT_MAIN,
    background: "#171d2b",
    border: "1px solid #2c3448",
    ...props.style,
  };
  if (kind === "primary") {
    base.background = ACCENT_BG;
    base.border = `1px solid ${ACCENT}`;
  } else if (kind === "danger") {
    base.background = DANGER_BG;
    base.border = `1px solid ${DANGER}`;
  }
  return (
    <button onClick={props.onClick} disabled={props.disabled} title={props.title} style={base}>
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
  /** Renders read-only and visually dimmed (e.g. a knob whose range admits one value). */
  disabled?: boolean;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <input
      value={props.value}
      type={props.type ?? "text"}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onEnter?.();
      }}
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #2c3448",
        background: props.disabled ? "#0b0e16" : "#10141f",
        color: TEXT_MAIN,
        opacity: props.disabled ? 0.55 : 1,
        fontSize: 13,
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

export function TextArea(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}): React.JSX.Element {
  return (
    <textarea
      value={props.value}
      placeholder={props.placeholder}
      rows={props.rows ?? 4}
      onChange={(e) => props.onChange(e.target.value)}
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
        resize: "vertical",
        fontFamily: "inherit",
      }}
    />
  );
}

const STATUS_COLOR: Record<string, string> = { up: OK, down: DANGER, checking: WARN, unknown: TEXT_DIM };

export function StatusDot(props: { status: string }): React.JSX.Element {
  const label = props.status === "up" ? "🟢" : props.status === "down" ? "🔴" : props.status === "checking" ? "🟡" : "⚪";
  return (
    <span title={props.status} style={{ color: STATUS_COLOR[props.status] ?? TEXT_DIM, fontSize: 12 }}>
      {label}
    </span>
  );
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

export function ErrorBanner(props: { text?: string | null; onDismiss?: () => void }): React.JSX.Element | null {
  if (!props.text) return null;
  return (
    <div
      style={{
        background: DANGER_BG,
        border: `1px solid ${DANGER}`,
        borderRadius: 8,
        padding: "8px 12px",
        color: "#f6b7b3",
        fontSize: 12,
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <span>{props.text}</span>
      {props.onDismiss && (
        <button onClick={props.onDismiss} style={{ background: "none", border: "none", color: "#f6b7b3", cursor: "pointer" }}>
          ✕
        </button>
      )}
    </div>
  );
}

/** Confirm dialog for destructive actions. */
export function ConfirmDialog(props: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ background: PANEL_BG, border: PANEL_BORDER, borderRadius: 12, padding: 20, width: 380, maxWidth: "90vw" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: TEXT_MAIN }}>{props.title}</div>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 18 }}>{props.body}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn onClick={props.onCancel}>Cancel</Btn>
          <Btn kind={props.danger ? "danger" : "primary"} onClick={props.onConfirm}>
            {props.confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function useToggle(initial = false): [boolean, () => void, (v: boolean) => void] {
  const [v, setV] = useState(initial);
  return [v, () => setV((x) => !x), setV];
}
