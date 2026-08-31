/**
 * game/commsWheelRunner —— 把 {@link CommsWheelState} 接到輸入層與音訊層（GH#731）。
 *
 * ⭐ 這個檔存在的唯一理由是 `GameApp.ts` 的 **<4,000 行棘輪**：
 * 決策（幾何、狀態機）住 `commsWheel.ts`、接線住這裡，`GameApp` 只留**兩行**。
 *
 * ⚠️ ⭐ 輪盤的**每一格都是 config**（`config.ui-cues@1` 的 `commsWheel`）——
 * 這個檔裡沒有任何一句寫著「retreat 要播哪一句」。
 */
import { playContextualVoice } from "../audio/contextualVoice";
import { recordCommsWheel } from "../net/RoomStore";
import { uiCues } from "../ui/uiCuesConfig";
import { CommsWheelState, type CommsWheelConfig } from "./commsWheel";

const FALLBACK: CommsWheelConfig = { enabled: false, holdKey: "KeyV", entries: [] };

export interface CommsWheelRunner {
  /** 攤進 `InputCapture` 的 deps（⭐ 三個 optional 欄位）。 */
  readonly inputDeps: {
    onCommsKeyDown: (code: string, at: { x: number; y: number }) => boolean;
    onCommsKeyUp: (code: string) => void;
    onCommsCancel: () => void;
    onCommsPointerMove: (x: number, y: number) => void;
  };
  /** 給 HUD 畫用。 */
  readonly state: CommsWheelState;
  /** 指標移動（`GameApp` 的既有 pointer 迴圈餵它）。 */
  pointerMove(x: number, y: number): void;
}

/**
 * @param champId 現在這位玩家的英雄（⭐ 沒有英雄就沒有語音包）。
 */
export function commsWheelRunner(champId: () => string | null): CommsWheelRunner {
  // ⚠️ ⭐ config 每次讀 —— 後台改了不必重開房（`uiCues()` 就是現值）。
  const state = new CommsWheelState(FALLBACK);
  const sync = (): CommsWheelState => {
    state.setConfig(uiCues().commsWheel ?? FALLBACK);
    return state;
  };
  // ⭐ 把「畫它需要的那幾個數字」推進 HUD store —— ⛔ 讓 HUD 不必 import GameApp。
  // ⚠️ ⭐ `centre` 用**同一個物件參考**（開一次只建一次）——
  // `recordCommsWheel` 靠參考相等判斷「沒變」，⛔ 每次新建一個 {x,y} 會讓它每幀都寫。
  let centreRef: { x: number; y: number } | null = null;
  const publish = (): void => {
    const c = state.centre;
    if (c === null) centreRef = null;
    else if (centreRef === null || centreRef.x !== c.x || centreRef.y !== c.y) centreRef = c;
    recordCommsWheel(
      centreRef ? { centre: centreRef, entries: state.entries, hovered: state.hoveredIndex } : null,
    );
  };
  return {
    state,
    pointerMove: (x, y) => state.pointerMove(x, y),
    inputDeps: {
      onCommsKeyDown: (code, at) => {
        const taken = sync().keyDown(code, at);
        publish();
        return taken;
      },
      onCommsKeyUp: (code) => {
        const picked = state.keyUp(code);
        const id = champId();
        // ⛔ 死區＝null＝取消，⛔ 沒有英雄＝沒有語音包 —— 兩種都靜靜不播。
        if (picked && id) playContextualVoice(id, picked.voiceCategory as never);
        publish();
      },
      onCommsCancel: () => {
        state.cancel();
        publish();
      },
      onCommsPointerMove: (x, y) => {
        state.pointerMove(x, y);
        publish();
      },
    },
  };
}
