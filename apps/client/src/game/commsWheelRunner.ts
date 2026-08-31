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
import { uiCues } from "../ui/uiCuesConfig";
import { CommsWheelState, type CommsWheelConfig } from "./commsWheel";

const FALLBACK: CommsWheelConfig = { enabled: false, holdKey: "KeyV", entries: [] };

export interface CommsWheelRunner {
  /** 攤進 `InputCapture` 的 deps（⭐ 三個 optional 欄位）。 */
  readonly inputDeps: {
    onCommsKeyDown: (code: string, at: { x: number; y: number }) => boolean;
    onCommsKeyUp: (code: string) => void;
    onCommsCancel: () => void;
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
  return {
    state,
    pointerMove: (x, y) => state.pointerMove(x, y),
    inputDeps: {
      onCommsKeyDown: (code, at) => sync().keyDown(code, at),
      onCommsKeyUp: (code) => {
        const picked = state.keyUp(code);
        const id = champId();
        // ⛔ 死區＝null＝取消，⛔ 沒有英雄＝沒有語音包 —— 兩種都靜靜不播。
        if (picked && id) playContextualVoice(id, picked.voiceCategory as never);
      },
      onCommsCancel: () => state.cancel(),
    },
  };
}
