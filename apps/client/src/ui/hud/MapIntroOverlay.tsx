/**
 * MapIntroOverlay —— 戰鬥開場報地名（owner 2026-08-14）。
 *
 * > 「新的七個地圖已經上線 但戰鬥開始的時候不會顯示這是什麼地圖，
 * >  請你記得要顯示出來」
 *
 * 兩塊，和 `BossIntroOverlay` 同一個形狀：
 *   · {@link MapIntroView} —— **純表現**。props 進、markup 出，沒有 store 沒有
 *     時鐘 ⇒ 守衛用 `renderToStaticMarkup` 把**畫面上的字**讀回來。
 *   · {@link MapIntroOverlay} —— HudRoot 掛的那個：閘、過期輪詢、擺放。
 *
 * ⚠️ 全程 `pointer-events: none`。開場提示一出現戰鬥就開始了，一個吃掉點擊的
 * 提示比看不到提示糟得多（這條也是從殭屍王演出照抄的）。
 *
 * ⚠️ **報的是 `frameBus.arenaName` 而不是 `mapId`**：mapId 是 `arena.infinity-castle`
 * 這種給機器看的字串，玩家要看的是「無限城」。名字與 id 在 `GameApp` 是同一行
 * 寫進 frameBus 的，所以不可能報成上一張圖的名字。
 */
import React, { useEffect, useState } from "react";
import { comboNowMs, useHud } from "../../net/RoomStore";
import { frameBus } from "../../frameBus";
import { HUD_Z } from "./hudLayout";
import {
  MAP_INTRO_POLL_MS,
  mapIntroLifetime,
  mapIntroRules,
  type MapIntroLifetime,
} from "./mapIntroModel";

/** 純表現：`renderToStaticMarkup` 讀得回來的那一塊。 */
export function MapIntroView({
  name,
  life,
}: {
  name: string;
  life: MapIntroLifetime;
}): React.JSX.Element {
  return (
    <div
      data-map-intro
      data-map-intro-phase={life.phase}
      style={{
        position: "fixed",
        top: "16%",
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        opacity: life.opacity,
        // ⛔ 永遠不吃點擊 —— 見檔頭。
        pointerEvents: "none",
        zIndex: HUD_Z.screen,
        // ⚠️ 淡出靠的是 opacity 這個 prop（模型算的），⛔ 不是 CSS transition：
        //    後台把 fadeSec 調 0 的時候，CSS 動畫會讓它照樣淡 0.3 秒。
        textAlign: "center",
        userSelect: "none",
      }}
    >
      <span
        style={{
          fontSize: 12,
          letterSpacing: "0.42em",
          textIndent: "0.42em",
          color: "rgba(226,232,240,0.72)",
          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
        }}
      >
        戰場
      </span>
      <span
        style={{
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "#f4f7ff",
          textShadow: "0 2px 10px rgba(0,0,0,0.95), 0 0 26px rgba(120,160,255,0.35)",
        }}
      >
        {name}
      </span>
      <span
        style={{
          width: 132,
          height: 2,
          background:
            "linear-gradient(90deg, rgba(120,160,255,0) 0%, rgba(150,185,255,0.85) 50%, rgba(120,160,255,0) 100%)",
        }}
      />
    </div>
  );
}

/**
 * 閘：只在**戰鬥階段**、只在有地圖名字的時候畫，並且用「這一回合戰鬥是什麼時候
 * 開始的」當計時起點。
 *
 * ⚠️ 起點取的是 **phase 變成 combat 的那一刻**，⛔ 不是元件掛載的那一刻 ——
 * HudRoot 是常駐的，用掛載時間會讓提示只在進遊戲的第一回合出現一次。
 * ⚠️ `round` 也進相依，所以**每一回合都會重報**：地圖是每回合可能換的
 * （`arena-pool` 輪替），而玩家最需要知道「這回合在哪打」的時機正是開場。
 */
export function MapIntroOverlay(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const couch = useHud((s) => s.localPlayers.length > 1);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => comboNowMs());

  useEffect(() => {
    setStartedAt(phase === "combat" ? comboNowMs() : null);
  }, [phase, round]);

  useEffect(() => {
    const iv = setInterval(() => setNow(comboNowMs()), MAP_INTRO_POLL_MS);
    return () => clearInterval(iv);
  }, []);

  // ⚠️ 分割畫面關掉：兩個人共用一塊螢幕時，一個橫跨全寬的大字會蓋住兩邊。
  if (phase !== "combat" || couch) return null;
  const name = frameBus.arenaName;
  if (!name) return null;
  const life = mapIntroLifetime(startedAt, now, mapIntroRules());
  if (!life) return null;
  return <MapIntroView name={name} life={life} />;
}
