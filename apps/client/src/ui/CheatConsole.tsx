/**
 * CheatConsole — offline single-player testing aid. Toggle with the backtick
 * key (`) or the 🐞 button. Every control sends a MSG.CHEAT for the LOCAL
 * player's champion via hudActions.sendCheat; the server applies them ONLY in
 * dev mode (hard-gated) so this is inert against a real platform match. Only
 * mounted when the session is offline (AppRoot gates on match.mode).
 *
 * It owns the LAST slot of the top-right corner stack (ui/hud/hudLayout) — the
 * old hard-coded `top: 46` collided with the settings gear at `top: 44`.
 *
 * THE 🐞 BUTTON IS LOOPBACK-ONLY (playtest P9). It used to sit permanently on
 * the live screen of every offline session, including the family build — the
 * most inviting thing on screen for someone who has never played before. It is
 * now buried behind task #127's environment tier: shown on the dev's own
 * machine, hidden on the LAN box and on the deployed host. The BACKTICK still
 * opens the console anywhere the console mounts, so nothing was taken away.
 */
import { useEffect, useMemo, useState } from "react";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import type { AbilitySlot } from "@ggd/shared/sim/intents";
import { hudActions } from "./actions";
import { useApp } from "./platform/store";
import {
  cheat,
  cheatButtonVisible,
  clampLevel,
  filterEntries,
  isCheatToggleKey,
  type CheatListEntry,
} from "./cheats";
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
const btnOn: React.CSSProperties = { ...btn, background: "#2c5f3f", border: "1px solid #57c98a" };
const label: React.CSSProperties = { fontSize: 11, color: TEXT_DIM, margin: "10px 0 4px" };
const searchInput: React.CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "6px 10px",
  fontSize: 16, // 16px avoids iOS focus zoom
  borderRadius: 7,
  background: "#0f1420",
  border: "1px solid #2c3448",
  color: TEXT_MAIN,
  boxSizing: "border-box",
};

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div style={label}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}

/** Searchable registry picker (champions / items) → onPick(id). */
function SearchList({
  entries,
  placeholder,
  onPick,
}: {
  entries: readonly CheatListEntry[];
  placeholder: string;
  onPick: (id: string) => void;
}): React.JSX.Element {
  const [q, setQ] = useState("");
  const shown = useMemo(() => filterEntries(entries, q).slice(0, 200), [entries, q]);
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={searchInput}
      />
      <div
        style={{
          maxHeight: 150,
          overflowY: "auto",
          marginTop: 6,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
        }}
      >
        {shown.map((c) => (
          <SfxButton key={c.id} onClick={() => onPick(c.id)} style={{ ...btn, textAlign: "left" }} title={c.id}>
            {c.name}
          </SfxButton>
        ))}
        {shown.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: TEXT_DIM, padding: 6 }}>無符合項目</div>
        )}
      </div>
      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 3 }}>
        {shown.length} / {entries.length}
      </div>
    </div>
  );
}

export function CheatConsole(): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const touch = hudTouch();
  const [level, setLevel] = useState(18);
  const [gold, setGold] = useState(1000);
  const [god, setGod] = useState(false);
  const [zeroCd, setZeroCd] = useState(false);

  // registries are static after boot — snapshot once
  const champions = useMemo<CheatListEntry[]>(
    () => Champions.all().map((c) => ({ id: c.id, name: c.name, role: c.role, tags: c.tags })),
    [],
  );
  const items = useMemo<CheatListEntry[]>(
    () => Items.all().map((i) => ({ id: i.id, name: i.name, tags: i.tags })),
    [],
  );

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
  const mode = useApp((s) => s.match?.mode);
  const buttonVisible = cheatButtonVisible(
    mode,
    typeof window === "undefined" ? undefined : window.location.hostname,
  );

  const send = hudActions.sendCheat;
  const toggleGod = (): void => {
    const next = !god;
    setGod(next);
    send(cheat.godMode(next));
  };
  const toggleZeroCd = (): void => {
    const next = !zeroCd;
    setZeroCd(next);
    send(cheat.zeroCooldown(next));
  };

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
        title="cheats (`)"
        data-hud-slot="cheats"
        style={{
          ...hudSlotStyle("cheats", touch),
          pointerEvents: "auto",
          ...btn,
          minHeight: hudSlotHeight("cheats", touch),
          opacity: 0.85,
        }}
      >
        🐞 cheats
      </SfxButton>
    );
  }

  return (
    <div
      data-hud-slot="cheats"
      style={{
        ...hudSlotStyle("cheats", touch, HUD_Z.expanded),
        width: 320,
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
        <div style={{ fontWeight: "bold", fontSize: 14 }}>🐞 Cheats (offline)</div>
        <SfxButton onClick={() => setOpen(false)} style={btn} title="close (`)">
          ✕
        </SfxButton>
      </div>

      <Section title="等級 Level">
        <input
          type="range"
          min={1}
          max={18}
          value={level}
          onChange={(e) => setLevel(clampLevel(Number(e.target.value)))}
          style={{ flex: 1, minWidth: 120 }}
          aria-label="level"
        />
        <span style={{ fontSize: 12, width: 24, textAlign: "center" }}>{level}</span>
        <SfxButton onClick={() => send(cheat.setLevel(level))} style={btn}>
          Set Lv {level}
        </SfxButton>
      </Section>

      <Section title="經濟 Economy">
        <SfxButton onClick={() => send(cheat.grantGold(1000))} style={btn}>
          +1000 金
        </SfxButton>
        <input
          type="number"
          value={gold}
          onChange={(e) => setGold(Number(e.target.value))}
          style={{ ...searchInput, width: 80, minHeight: 30 }}
          aria-label="custom gold"
        />
        <SfxButton onClick={() => send(cheat.grantGold(gold))} style={btn}>
          +金
        </SfxButton>
        <SfxButton onClick={() => send(cheat.grantMCoin(1000))} style={btn} title="offline has no wallet — no-op">
          +M 幣*
        </SfxButton>
      </Section>

      <Section title="技能 Abilities">
        <SfxButton onClick={() => send(cheat.maxAbilities())} style={btn}>
          Max 全部
        </SfxButton>
        {(["Q", "W", "E", "R"] as AbilitySlot[]).map((slot) => (
          <SfxButton key={slot} onClick={() => send(cheat.rankAbility(slot))} style={btn}>
            +{slot}
          </SfxButton>
        ))}
        <SfxButton onClick={() => send(cheat.resetCooldowns())} style={btn}>
          冷卻歸零
        </SfxButton>
      </Section>

      <Section title="狀態 State">
        <SfxButton onClick={() => send(cheat.fullHeal())} style={btn}>
          補滿血魔
        </SfxButton>
        <SfxButton onClick={toggleGod} style={god ? btnOn : btn}>
          {god ? "🛡 無敵 ON" : "🛡 無敵"}
        </SfxButton>
        <SfxButton onClick={toggleZeroCd} style={zeroCd ? btnOn : btn} title="abilities never on cooldown">
          {zeroCd ? "⚡ 0 CD ON" : "⚡ 0 CD 釋放"}
        </SfxButton>
      </Section>

      <Section title="回合 Round">
        <SfxButton onClick={() => send(cheat.killEnemies())} style={btn}>
          清場 (殺敵)
        </SfxButton>
        <SfxButton onClick={() => send(cheat.skipPhase())} style={btn}>
          跳過階段
        </SfxButton>
        <SfxButton onClick={() => send(cheat.rerollOffers())} style={btn}>
          重抽 offer
        </SfxButton>
        <SfxButton onClick={() => send(cheat.spawnFlower())} style={btn} title="戰鬥階段生成治療花朵">
          生成花朵
        </SfxButton>
      </Section>

      <div style={label}>給予道具 Give item</div>
      <SearchList entries={items} placeholder="搜尋道具 search items…" onPick={(id) => send(cheat.giveItem(id))} />

      <div style={label}>切換英雄 Swap champion</div>
      <SearchList
        entries={champions}
        placeholder="搜尋英雄 search champions…"
        onPick={(id) => send(cheat.swapChampion(id))}
      />

      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 10 }}>
        * M 幣離線無錢包 — 無效果。伺服器僅在 dev 模式套用作弊。
      </div>
    </div>
  );
}
