/**
 * ⭐⭐ Round11Overlay —— 第十一回合・生存模式，玩家看得到的那一面（GH#1151 H）。
 *
 * 票逐字：「Client 實際顯示**模式橫幅**、**倒數**、**預警**、角色**換邊／旁觀**、
 *  掉落／三選一及結算明細；狀態由**服務端同步**，多客戶端重連後一致。」
 *
 * 兩塊，與 `MapIntroOverlay` / `MobBossOverlay` 同一個形狀：
 *   · {@link Round11OverlayView} —— **純表現**。props 進、markup 出，⛔ 沒有 store
 *     ⛔ 沒有時鐘 ⇒ 守衛用 `renderToStaticMarkup` 把**畫面上的字**讀回來。
 *   · {@link Round11Overlay} —— HudRoot 掛的那個：訂閱、過期輪詢。
 *
 * ⚠️ 全程 `pointer-events: none`。這一回合場上有五百隻殭屍，⭐ 一個吃掉點擊的
 * 提示比看不到提示糟得多。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 「狀態由服務端同步，多客戶端重連後一致」—— 這一條逐項對到什麼
 *
 * | 畫面上的東西 | 它的權威來源 | 重連之後 |
 * |---|---|---|
 * | 橫幅要不要出現 | `MatchState.round` vs `config.arena-rules@1 finalRound` | ⭐ 一致（快照重送） |
 * | 倒數 | `MatchState.phaseTicksLeft` | ⭐ 一致（⛔ 客戶端沒有第二個計時器） |
 * | 角色（換邊／旁觀） | `MatchState` 的 `alive` / `roundDeaths` 投影 | ⭐ 一致 —— ⚠️ **但它是推導的**，限制逐字寫在 `round11Model.round11SelfRole` |
 * | 紅圈預警 | `round11Bombardment` 事件（⛔ 不在快照上） | ⛔ **不一致**：重連期間錯過那一則就沒有圈 —— ⭐ 而那與紅圈的語意相符（它是一個**只有 10 秒**的瞬間），⛔ 不是一個要修的 bug |
 * | 提示列 | 三則事件 | 同上（提示本來就只活 6 秒） |
 *
 * ⛔⛔ **「掉落／三選一及結算明細」那一半今天沒有做** —— 見報告
 * `docs/_reports/r11-client-ui_temp_*.md` 的「⛔ 沒接上的」那一節。
 * ⭐ 這裡刻意**不放**任何提到它們的字（第一·五守則：⛔ 卡片上不可以有「說了但
 * 不會發生」的字）。
 */
import React, { useEffect, useState } from "react";
import { comboNowMs, useHud } from "../../net/RoomStore";
import { HUD_Z } from "./hudLayout";
import {
  ROUND11_POLL_MS,
  round11Rules,
  round11TeamAllDied,
  round11View,
  type Round11View,
} from "./round11Model";

/** 純表現：`renderToStaticMarkup` 讀得回來的那一塊。 */
export function Round11OverlayView({ view }: { view: Round11View | null }): React.JSX.Element | null {
  if (!view) return null;
  const bomb = view.bombardSecondsLeft;
  return (
    <div
      data-round11
      data-round11-role={view.role}
      style={{
        position: "fixed",
        top: "9%",
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        // ⛔ 永遠不吃點擊 —— 見檔頭。
        pointerEvents: "none",
        zIndex: HUD_Z.screen,
        textAlign: "center",
        userSelect: "none",
      }}
      role="status"
      aria-live="polite"
    >
      {/* ① 模式橫幅 —— ⛔ 空字串是一個合法設定（「不顯示橫幅」），所以連
          容器都不畫，⛔ 不是畫一條空的金色線。 */}
      {view.bannerOpacity !== null && view.bannerText.length > 0 && (
        <span
          data-round11-banner
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: "#ffe9a8",
            opacity: view.bannerOpacity,
            textShadow: "0 2px 10px rgba(0,0,0,0.95), 0 0 28px rgba(255,170,60,0.45)",
          }}
        >
          {view.bannerText}
        </span>
      )}
      {/* ② 倒數 —— ⭐ 數字來自伺服器的 `phaseTicksLeft`（⛔ 不是本機計時器）。
          後面那個「/ 10:00」是設定裡的總長，讓玩家知道自己在哪一段。 */}
      <span
        data-round11-clock
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
          padding: "3px 12px",
          borderRadius: 6,
          border: "1px solid rgba(255,190,90,0.5)",
          background: "rgba(28,18,8,0.82)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ fontSize: 11, letterSpacing: "0.2em", color: "rgba(255,220,160,0.8)" }}>
          生存
        </span>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#ffd98a" }}>{view.clockText}</span>
        <span style={{ fontSize: 11, color: "rgba(255,220,160,0.55)" }}>/ {view.totalText}</span>
      </span>
      {/* ③ 角色 —— 換邊操作殭屍王 / 旁觀。⛔ 還是英雄的時候什麼都不畫。 */}
      {view.roleText.length > 0 && (
        <span
          data-round11-role-pill
          style={{
            fontSize: 13,
            fontWeight: 700,
            padding: "2px 10px",
            borderRadius: 5,
            color: view.role === "boss" ? "#ffd0d0" : "#c8d4e4",
            border: `1px solid ${view.role === "boss" ? "rgba(230,70,70,0.75)" : "rgba(150,170,200,0.5)"}`,
            background: view.role === "boss" ? "rgba(58,10,10,0.88)" : "rgba(16,20,28,0.82)",
            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
          }}
        >
          {view.roleText}
        </span>
      )}
      {/* ④ 大轟炸預警 —— ⭐ 這一條是這個檔案存在的最硬的理由：轟炸打的是
          **最大生命的五成真傷**，而在這一行之前它沒有任何前兆。 */}
      {bomb !== null && (
        <span
          data-round11-bombard
          style={{
            fontSize: 15,
            fontWeight: 800,
            padding: "4px 14px",
            borderRadius: 6,
            color: "#ffdede",
            border: "1px solid rgba(255,70,70,0.85)",
            background: "rgba(70,8,8,0.9)",
            boxShadow: "0 0 18px rgba(255,60,60,0.45)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ⚠ 轟炸來襲 · {Math.ceil(bomb)} 秒後落下 —— 離開紅圈
        </span>
      )}
      {/* ⑤ 提示列 —— 寶具損壞 / 復活權 +1 / 殭屍升級。 */}
      {view.notices.map((n) => (
        <span
          key={n.seq}
          data-round11-notice={n.kind}
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 10px",
            borderRadius: 5,
            color: n.kind === "item" ? "#ffc9c9" : n.kind === "revive" ? "#c9ffd6" : "#e6d9a8",
            background: "rgba(10,12,16,0.8)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          {n.text}
        </span>
      ))}
    </div>
  );
}

export function Round11Overlay(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const secondsLeft = useHud((s) => s.phaseSecondsLeft);
  const alive = useHud((s) => s.localAlive);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);
  const bombard = useHud((s) => s.round11Bombard);
  const notices = useHud((s) => s.round11Notices);

  // 橫幅的起點取的是 **phase 變成 combat 的那一刻**（⛔ 不是掛載的那一刻）——
  // HudRoot 是常駐的，用掛載時間會讓橫幅只在進遊戲的第一回合出現一次。
  // 同 `MapIntroOverlay`，理由寫在那裡。
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => comboNowMs());
  useEffect(() => {
    setStartedAt(phase === "combat" ? comboNowMs() : null);
  }, [phase, round]);
  useEffect(() => {
    const iv = setInterval(() => setNow(comboNowMs()), ROUND11_POLL_MS);
    return () => clearInterval(iv);
  }, []);

  const seat = localSeatId === null ? undefined : seats.find((s) => s.seatId === localSeatId);
  return (
    <Round11OverlayView
      view={round11View({
        phase,
        round,
        secondsLeft,
        alive,
        roundDeaths: seat?.roundDeaths ?? 0,
        teamAllDied: seat === undefined ? false : round11TeamAllDied(seats, seat.teamId),
        bannerStartedAtMs: startedAt,
        bombard,
        notices,
        nowMs: now,
        rules: round11Rules(),
      })}
    />
  );
}
