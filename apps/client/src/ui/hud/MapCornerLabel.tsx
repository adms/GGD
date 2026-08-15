/**
 * 地名**常駐**小字（owner 2026-08-15：「場地名稱可以一直顯示在角落小字」）。
 *
 * ⚠️ 這跟 `MapIntroOverlay` 是**兩件事**：那個是開場大字、幾秒後消失；
 * 這個是整場都在的小標籤。合成一個的話「關掉開場演出」會連這個一起關掉。
 *
 * ⭐ 名字讀 **`frameBus.arenaName`**，⛔ 不自己 `Arenas.tryGet(mapId)` ——
 * 那份解析已經在 `GameApp.applyArena` 裡跟 `arenaId` **同一行**寫進 frameBus，
 * 所以走它就不可能報成上一張圖的名字（跟開場提示同一個理由）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⭐【為什麼它**不是**一個 HUD slot】—— 這一段是量出來的，不是設計偏好
 *
 * 我先後把它宣告成左下與右下的 slot，兩次都撞牆，而且撞的是**不同的**牆：
 *
 * | 放哪 | 撞到什麼 |
 * |---|---|
 * | 左下 order 0 | ① 跟手把晶片同號 ② 左下那道側翼是 **#187 控制圖例**的地盤，多 22px 就讓它從「直欄」退成「橫條」 |
 * | 右下 order 3 | 780×360（#151 的 breakpoint）整欄**溢出**，`hudBottomCluster` 與 `killCombo` 一起紅 |
 *
 * ⇒ 結論不是「換一個角」，是**每一個角都已經有預算了** ——
 * 而一行地名不值得從任何既有功能手上拿走空間。
 *
 * ⭐ 所以它畫在**小地圖自己那塊裡**：貼著小地圖的上緣，`pointerEvents: none`。
 * 佔用的新版面空間是 **0**（那 208×208 已經是保留下來的），而語意上這裡才是
 * 它的家 —— **小地圖畫的就是這張圖，地名是它的標題。**
 * 蓋到的是地形貼圖最上緣一條，⛔ 不是任何要讀的 UI。
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { frameBus } from "../../frameBus";
import { useHud } from "../../net/RoomStore";
import { HUD_Z, hudSlot, hudSlotStyle } from "./hudLayout";
import { hudTouch } from "./HudSlot";
import { MAP_INTRO_POLL_MS, mapCornerLabelRules, type MapCornerLabelRules } from "./mapIntroModel";

/** DOM 標記 —— 守衛靠它確認畫面上真的有這個東西。 */
export const MAP_CORNER_LABEL_SLOT = "map-name";
/** 高度（12px 字 + 上下 padding）。 */
export const MAP_CORNER_LABEL_HEIGHT = 20;

/** 小地圖那一格的尺寸 + 它解析出來的定位邊。⛔ 從版面表讀，不抄 208 / 116。 */
export interface MinimapBox {
  readonly width: number;
  readonly height: number;
  readonly style: CSSProperties;
}

export function minimapBox(touch = hudTouch()): MinimapBox {
  const spec = hudSlot("minimap");
  return {
    width: (touch && spec.touchWidth) || spec.width || 0,
    height: (touch && spec.touchHeight) || spec.height || 0,
    style: hudSlotStyle("minimap", touch),
  };
}

export interface MapCornerLabelViewProps {
  readonly name: string;
  readonly rules: MapCornerLabelRules;
  readonly box: MinimapBox;
}

/** PURE view —— 守衛用 `renderToStaticMarkup` 把**畫面上的字**讀回來。 */
export function MapCornerLabelView({
  name,
  rules,
  box,
}: MapCornerLabelViewProps): React.JSX.Element {
  const s = box.style;
  const px = (v: unknown): number => (typeof v === "number" ? v : 0);
  // 貼小地圖框的**上緣內側**：沿用它解析出來的那一組邊，往上推整個地圖高度
  // 再扣掉自己的高度。⚠️ 這樣小地圖搬家（手機從右下搬到左上）它會自動跟著走。
  const pin: CSSProperties =
    s.bottom !== undefined
      ? { right: px(s.right), left: s.left === undefined ? undefined : px(s.left),
          bottom: px(s.bottom) + box.height - MAP_CORNER_LABEL_HEIGHT }
      : { right: s.right === undefined ? undefined : px(s.right),
          left: s.left === undefined ? undefined : px(s.left), top: px(s.top) };

  return (
    <div
      data-slot={MAP_CORNER_LABEL_SLOT}
      style={{
        position: "absolute",
        ...pin,
        width: box.width,
        height: MAP_CORNER_LABEL_HEIGHT,
        // ⚠️ 要比小地圖高一層才看得到 —— 小地圖是 canvas，會蓋住同層的東西。
        zIndex: HUD_Z.slot + 1,
        // ⛔ 純資訊，不可以吃掉點擊 —— 底下就是小地圖，它要能被點。
        pointerEvents: "none",
        opacity: rules.opacity,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        padding: "0 6px",
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        // 上緣一條漸層 —— 讓字浮在地形上，而不是壓一個實心方塊在地圖上。
        background: "linear-gradient(to bottom, rgba(6,8,16,0.86), rgba(6,8,16,0))",
        color: "#cfe0ff",
        fontSize: 12,
        lineHeight: 1,
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textShadow: "0 1px 3px rgba(0,0,0,0.95)",
      }}
    >
      {name}
    </div>
  );
}

/**
 * ⚠️ 為什麼要 poll：`frameBus` 是**可變物件**不是 store，換圖時 React 不會被通知。
 * 沿用開場提示的節奏（100ms）—— 一個地名不需要每幀，而換圖是每回合一次的事。
 */
export function MapCornerLabel(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const [name, setName] = useState<string | null>(() => frameBus.arenaName);

  useEffect(() => {
    const iv = setInterval(() => setName(frameBus.arenaName), MAP_INTRO_POLL_MS);
    return () => clearInterval(iv);
  }, []);
  // 換回合時立刻抓一次，⛔ 不要等下一個 poll 週期（新圖的頭 100ms 會報舊名字）。
  useEffect(() => setName(frameBus.arenaName), [round]);

  const rules = mapCornerLabelRules();
  if (!rules.enabled) return null;
  // 只在戰鬥中報。商店／選人畫面上「你在哪打」既沒有意義也會擠到別的面板。
  if (phase !== "combat") return null;
  if (!name) return null;
  return <MapCornerLabelView name={name} rules={rules} box={minimapBox()} />;
}
