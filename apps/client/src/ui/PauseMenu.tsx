/**
 * PauseMenu — the in-match menu overlay. Opens on Esc or the ☰ button and
 * offers Resume / Restart match / Leave to menu. All teardown routes through
 * the same clean path: leaving flips the platform store's `screen` (main.tsx
 * disposes the GameApp → leaves every room, stops the Babylon engine, cancels
 * the rAF loop, resets the stores); Restart bumps matchEpoch (offline = fresh
 * SimWorld, round 1). This composes with the top-right Leave button.
 */
import { useEffect, useState } from "react";
import { useApp } from "./platform/store";
import { openCodex } from "./codex/CodexRoute";
import { SfxButton } from "./SfxButton";
import { hudTouch } from "./hud/HudSlot";
import { HUD_Z, hudSlotHeight } from "./hud/hudLayout";
import { useHudSlotPlacement } from "./hud/useHudPanels";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

function typingInField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

const menuBtn: React.CSSProperties = {
  minHeight: 42,
  padding: "10px 16px",
  borderRadius: 9,
  cursor: "pointer",
  background: "#1b2233",
  border: "1px solid #2c3448",
  color: TEXT_MAIN,
  fontSize: 15,
  width: "100%",
  textAlign: "left",
};

export function PauseMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const touch = hudTouch();
  // the button IS the slot: size it from the registry so the tap target and
  // the space the stack reserves for it can never drift apart
  const size = hudSlotHeight("menu", touch);
  // A left-docked shop covers the top-left ☰: relocate it to the top-right
  // column (the dock never reaches there). Under a full terminal panel
  // (match-end, which provides its own 返回大廳) the button hides — Esc still
  // opens the menu, so the player is never trapped.
  const { hidden: menuHidden, style: menuStyle } = useHudSlotPlacement("menu", touch);
  const isOffline = useApp((s) => s.match?.mode === "offline");
  const restartMatch = useApp((s) => s.restartMatch);
  const returnToLobby = useApp((s) => s.returnToLobby);
  const account = useApp((s) => s.account);

  // Esc toggles the menu (ignored while typing in a field, e.g. cheat search)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (typingInField(e.target)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* menu button — top-left slot 0, relocates under a left-docked panel
          (see ui/hud/hudLayout + useHudPanels) */}
      {!menuHidden && (
        <SfxButton
          onClick={() => setOpen(true)}
          title="menu (Esc)"
          aria-label="open menu"
          data-hud-slot="menu"
          style={{
            ...menuStyle,
            pointerEvents: "auto",
            minWidth: size,
            minHeight: size,
            borderRadius: 9,
            cursor: "pointer",
            background: PANEL_BG,
            border: PANEL_BORDER,
            color: TEXT_MAIN,
            fontSize: 18,
          }}
        >
          ☰
        </SfxButton>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(6,9,15,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
            zIndex: HUD_Z.modal,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            // task #197 — the pad focus layer scopes to the pause menu (top
            // priority: it opens over everything). Start opens it in combat; the
            // Resume button below carries data-pad-back so B closes it.
            data-pad-scope="pause"
            data-pad-scope-priority="50"
            style={{
              width: 300,
              maxWidth: "90vw",
              padding: 20,
              background: PANEL_BG,
              border: PANEL_BORDER,
              borderRadius: 14,
              color: TEXT_MAIN,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: "bold", marginBottom: 4 }}>暫停選單 Menu</div>

            <SfxButton onClick={() => setOpen(false)} style={menuBtn} data-pad-back>
              ▶ Resume 繼續
            </SfxButton>

            <SfxButton
              onClick={() => {
                setOpen(false);
                restartMatch();
              }}
              style={menuBtn}
              title={isOffline ? "clear battlefield & restart round 1" : "online: returns to lobby (host authority needed)"}
            >
              ↻ Restart match 清空戰場重新開始
            </SfxButton>

            {/* 內容圖鑑 (task #71) — opens over the live match; the codex is a
                hash-routed overlay, so nothing about the match is torn down. */}
            <SfxButton
              onClick={() => {
                setOpen(false);
                openCodex();
              }}
              style={menuBtn}
              title="所有道具 / 英雄 / 技能的完整資料"
            >
              📖 內容圖鑑 Codex
            </SfxButton>

            <SfxButton
              onClick={() => {
                setOpen(false);
                void returnToLobby();
              }}
              style={menuBtn}
            >
              ⏻ Leave to menu {account ? "返回大廳" : "返回"}
            </SfxButton>

            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>
              {isOffline
                ? "離線：Restart 會清空戰場、重開第 1 回合。"
                : "線上：Restart 需主機權限，將返回大廳。"}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
