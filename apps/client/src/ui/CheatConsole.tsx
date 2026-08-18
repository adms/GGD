/**
 * 練習／測試面板的 **chrome** —— 槽位、🐞 按鈕、backtick 開關、要不要出現。
 * 六個分頁的**內容**在 `./practice/PracticePanel.tsx`（GH#365）。
 *
 * 分成兩個檔是因為它們是兩個問題，而且會各自被改：
 * 「這顆按鈕該不該出現在這台機器的畫面上」是一個**環境**問題，
 * 「按下去有哪些東西可以調」是一個**內容**問題。
 *
 * 每一顆控制項都送 `hudActions.sendCheat` → `MSG.CHEAT`，套用在**送出者自己的
 * 座位**上。⛔ 這裡沒有任何安全性：伺服器自己 hard-gate（`match/cheatGate.ts`），
 * 而它從不相信客戶端說自己是離線／練習房。
 *
 * 它擁有右上角堆疊的**最後**一格（ui/hud/hudLayout）—— 舊的寫死 `top: 46`
 * 會撞到 `top: 44` 的設定齒輪。
 *
 * THE 🐞 BUTTON IS LOOPBACK-ONLY (playtest P9)，⭐ **練習房豁免**（GH#343）：
 * 一般離線場只在開發者自己的機器上顯示按鈕，藏在 LAN 機與正式站上；
 * 練習房裡沒有比賽可以被破壞，而 owner 要的正是「進去就能用測試碼」——
 * 藏起來等於這個功能在 ggd.adms.ai 上完全找不到（那台是 "public" 級）。
 * BACKTICK 在面板掛載的每一個地方都還在，所以什麼都沒有被拿走。
 */
import { useEffect, useState } from "react";
import { useApp } from "./platform/store";
import { cheatPanelButtonVisible, isCheatToggleKey } from "./cheats";
import { PracticePanel } from "./practice/PracticePanel";
import { SfxButton } from "./SfxButton";
import { hudTouch } from "./hud/HudSlot";
import { HUD_EDGE, HUD_Z, hudSlotHeight, hudSlotOffset, hudSlotStyle } from "./hud/hudLayout";
import { useHudSlotHidden } from "./hud/useHudPanels";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

function typingInField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

const btn: React.CSSProperties = {
  minHeight: 32,
  padding: "5px 10px",
  borderRadius: 7,
  cursor: "pointer",
  background: "#1b2233",
  border: "1px solid #2c3448",
  color: TEXT_MAIN,
  fontSize: 12,
};

export function CheatConsole(): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const touch = hudTouch();
  // backtick toggles the console (ignored while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (typingInField(e.target)) return;
      if (isCheatToggleKey(e.key)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // top-right dev tool: hides under a full terminal panel (match-end) so its 🐞
  // button never floats over the settlement screen.
  const hidden = useHudSlotHidden("cheats", touch);

  // P9 — does the button get to ADVERTISE itself? Only on the dev's own machine
  // (env tier "loopback", task #127's classifier). Read from the same store key
  // AppRoot gates the mount on, so the two decisions cannot drift apart.
  // ⭐ GH#365 —— 讀**整個 match 物件**（`cheatPanelButtonVisible`），⛔ 不是逐格
  // 挑幾個欄位傳進去：挑欄位正是 AppRoot 那個「漏掉 practice」缺陷的形狀。
  // 練習房（GH#343）豁免環境分級：那間房裡沒有比賽可以被破壞，而 owner 要的正是
  // 「進去就能用測試碼」—— 藏起來等於這個功能在 ggd.adms.ai 上完全找不到。
  const match = useApp((s) => s.match);
  const buttonVisible = cheatPanelButtonVisible(
    match,
    typeof window === "undefined" ? undefined : window.location.hostname,
  );

  if (hidden) return null;

  if (!open) {
    // P9: on anything but the developer's own machine the button is BURIED, not
    // removed — no 🐞 chip on a family member's live screen, while the backtick
    // handler above stays registered so the console is still one keystroke away
    // in every offline session. See cheats.ts `cheatButtonVisible`.
    if (!buttonVisible) return null;
    return (
      <SfxButton
        onClick={() => setOpen(true)}
        title="練習／測試面板 (`)"
        data-hud-slot="cheats"
        style={{
          ...hudSlotStyle("cheats", touch),
          pointerEvents: "auto",
          ...btn,
          minHeight: hudSlotHeight("cheats", touch),
          opacity: 0.85,
        }}
      >
        🐞 練習面板
      </SfxButton>
    );
  }

  return (
    <div
      data-hud-slot="cheats"
      style={{
        ...hudSlotStyle("cheats", touch, HUD_Z.expanded),
        // 六個分頁的清單（屬性 23 條、狀態 40 種）需要比舊的單欄清單寬一點。
        width: 360,
        maxWidth: "94vw",
        // stay inside the HUD layer (100% = #hud-root, safe-area counted once)
        maxHeight: `calc(100% - ${hudSlotOffset("cheats", touch) + HUD_EDGE}px)`,
        overflowY: "auto",
        padding: 14,
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 12,
        color: TEXT_MAIN,
        pointerEvents: "auto",
        boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: "bold", fontSize: 14 }}>🐞 練習／測試面板</div>
        <SfxButton onClick={() => setOpen(false)} style={btn} title="close (`)">
          ✕
        </SfxButton>
      </div>

      <PracticePanel />

      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 10 }}>
        {/* ⚠️ 這一行在 GH#343 之前寫「伺服器僅在 dev 模式套用作弊」，而那從那天起
            就是假的（第三守則）：練習房是第二道門，而且是正式站上唯一走得通的那一道。 */}
        伺服器只在 dev 模式或練習房套用（match/cheatGate.ts）。正式對局送過去一律被丟掉。
      </div>
    </div>
  );
}
