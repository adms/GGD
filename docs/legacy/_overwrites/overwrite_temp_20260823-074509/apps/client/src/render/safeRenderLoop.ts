/**
 * ⛔⛔ **一個 throw 會讓 Babylon 的 render loop 永久停掉**（GH#609）。
 *
 * ── 量到的，⛔ 不是推測 ────────────────────────────────────────────────────
 * `@babylonjs/core@7.54.3` `Engines/abstractEngine.js:411-418`：
 *
 *     _renderLoop(timestamp) {
 *       this._processFrame(timestamp);          // ← 使用者的 callback 在這裡跑
 *       if (this._activeRenderLoops.length > 0 && this._frameHandler === 0) {
 *         this._frameHandler = this._queueNewFrame(...);   // ← 重排在**之後**
 *       }
 *     }
 *
 * 而 `_processFrame`（:390）在呼叫 callback **之前**就把 `_frameHandler` 設成 0。
 * ⇒ 一個例外在重排**之前**逃出去，`_frameHandler` 就**永遠**停在 0。
 * 真的跑過的探針（NullEngine）：3 幀之後死透，`_frameHandler = 0` 而
 * `_activeRenderLoops.length = 1` —— 迴圈還登記著，只是再也不會被叫。
 *
 * ⚠️ **競技場不受影響**，而那是**架構決定的、⛔ 不是運氣**：`GameApp.frame`
 * 用自己的 rAF，而且**先排下一幀、再做事**（`GameApp.ts:1590` 排、`:1595` 做）
 * ⇒ 同一個探針量到 20 次連續 throw 跑完 61 幀。`render/Renderer.ts` 的檔頭
 * 逐字寫著 Babylon 自己的 `runRenderLoop` 沒有被用。
 *
 * ⇒ ⭐ 但**登入畫面 / 回合間場 / 商店預覽 / 地面試看**四個場景**真的**用它。
 * 它們一旦 throw 就是**整個畫面凍住**，而使用者看到的是「當掉了」。
 *
 * ── ⚠️ fail-open 沒錯，**靜默**才是缺陷（第二守則）─────────────────────────
 * 把 freeze 換成 skip 會讓它**更難被發現**（畫面看起來正常）。所以這一支
 * ⛔ 不只是 try/catch —— 它把每一次都記進 `perfBus.renderLoopErrors`，
 * 而那一格**非零時會畫在畫面上**（`ui/PerfOverlay.tsx` 的健康度徽章，
 * ⛔ 不受 `showPerfOverlay` 那個預設關掉的開關管）。
 */
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { perfBus } from "../perfBus";

/** 同一個場景最多印幾次 console —— ⛔ 每幀一行會把 console 洗掉。 */
const MAX_LOGGED = 3;

export function runRenderLoopSafely(
  engine: Pick<AbstractEngine, "runRenderLoop">,
  frame: () => void,
  label: string,
): void {
  let logged = 0;
  engine.runRenderLoop(() => {
    try {
      frame();
    } catch (err) {
      perfBus.renderLoopErrors++;
      if (logged < MAX_LOGGED) {
        logged++;
        // eslint-disable-next-line no-console
        console.error(`[render:${label}] 這一幀擲了例外 —— 迴圈保住了，畫面掉一幀`, err);
      }
    }
  });
}
