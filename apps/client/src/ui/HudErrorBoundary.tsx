/**
 * HudErrorBoundary — 一個元件炸掉，不可以帶走整個介面。
 *
 * ── 為什麼有這個檔案 (2026-08-02) ─────────────────────────────────────────
 *
 * owner 回報四次，最後一次給了決定性的線索：
 *
 *   「戰鬥打到一半 所有介面突然都消失了 只剩下人物跟戰鬥場景」
 *   「**下一場戰鬥也是 介面沒有再回來了**」
 *
 * 第二句不是額外症狀，**它是機制的證據**：
 *
 *   · React 是 18.3.1，`main.tsx` 的 `root.render(<AppRoot />)` **只在開機
 *     呼叫一次**，而且 root 被 cache 在 `window.__ggdRoot` 上。
 *   · React 18 在 **render 期間**吃到未捕捉的例外時，會**卸載整個 root**。
 *   · 既然 `root.render` 不會再被呼叫，HUD 就**這個分頁剩下的時間都是死的** ——
 *     換一場、回大廳、再進場全都救不回來，只有重新整理頁面才會恢復。
 *
 * 在此之前 `apps/client/src` 裡 error boundary 的數量是 **0**
 * （`grep -rn "ErrorBoundary|componentDidCatch|getDerivedStateFromError"` → 零筆）。
 * 前一組工作流在活的比賽裡實測過：讓 `PhaseTimer` 丟例外，
 * `#hud-root` 的子節點數 **14 → 0**，而 `<canvas id="game-canvas">` 仍在。
 *
 * ── 這個檔案修的是什麼，不修什麼 ────────────────────────────────────────
 *
 * ⚠️ **它不修那個丟例外的元件** —— 兇手還沒找到（獵兇仍在進行）。
 * 它修的是**後果**：一次 render 例外從「整個分頁的介面永久死亡」
 * 降級成「那一塊壞掉、其餘照常、而且下一個相位會自己重試」。
 *
 * 這是刻意的取捨，理由是：**丟例外難免，永久死亡不該難免。** 就算今天的兇手被
 * 抓到修好，下一個 `.get(id)!` 拿到 undefined 還是會再來一次；沒有 boundary，
 * 每一次都是一整場報銷。
 *
 * ── 三個非做對不可的地方 ────────────────────────────────────────────────
 *
 * **① fallback 必須看得見。** 今天一整天的教訓都是「靜默降級」：內容全毀長得像
 * 正常、選人空的沒有訊息、沒英雄的 HUD 直接消失。一個 `return null` 的 boundary
 * 只是把「整個消失」換成「局部消失」，玩家仍然不知道發生什麼事 ——
 * 那是把失敗形態 ② 再犯一次。所以壞掉的位置會留下一個小標記。
 *
 * **② 要能自己回來。** React boundary 一旦 catch 就停在 fallback，不會自己重試。
 * 沒有重置的話，一次瞬間的例外會讓那個面板**整場**都是壞的 —— 只是把「永久」
 * 從分頁縮小到比賽，並沒有真的解決 owner 的痛。所以 `resetKey` 一變（相位切換、
 * 換一場）就重新掛載那棵子樹再試一次。
 *
 * **③ 錯誤要留得下來。** owner 在打，不會開 console，而 React 那行
 * 「The above error occurred in the <XXX> component」**只會印一次**
 * （root 死了就沒有下一次 render）。所以這裡把它存進一個模組級的清單，
 * 讓「介面上哪裡壞了」變成一個事後查得到的事實而不是一個錯過就沒有的瞬間。
 *
 * 純 React，沒有 store、沒有 Babylon —— 決策部分抽在 `./hudErrorModel`，
 * 因為 `apps/client` 沒有 jsdom / testing-library，能被真的跑起來驗的東西
 * 要放在不碰 React 的那一側。
 */
import React from "react";
import { PANEL_BORDER, TEXT_DIM } from "./theme";
import { hudErrorFallbackText, recordHudError, type HudErrorRecord } from "./hudErrorModel";

export interface HudErrorBoundaryProps {
  /** 出事時要告訴玩家「哪裡」壞了。用玩家看得懂的話，不是元件名。 */
  readonly label: string;
  /**
   * 這個值一變就重新掛載子樹再試一次（相位切換、換一場）。
   * ⚠️ 沒有它的話，一次瞬間的例外會讓這一塊整場都是壞的 —— 見檔頭 ②。
   */
  readonly resetKey?: string | number;
  readonly children: React.ReactNode;
}

interface HudErrorBoundaryState {
  readonly failed: boolean;
}

export class HudErrorBoundary extends React.Component<
  HudErrorBoundaryProps,
  HudErrorBoundaryState
> {
  override state: HudErrorBoundaryState = { failed: false };
  private seenKey: string | number | undefined = undefined;

  static getDerivedStateFromError(): HudErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // ⚠️ 這是唯一一次能抓到它的機會（檔頭 ③）。
    const rec: HudErrorRecord = {
      label: this.props.label,
      message: String(error?.message ?? error),
      componentStack: String(info?.componentStack ?? ""),
    };
    recordHudError(rec);
    // console 仍然要印 —— 開著 devtools 的人（例如正在抓這個 bug 的人）
    // 應該立刻看到，而不是只能從 UI 挖。
    console.error(`[hud] ${this.props.label} 崩潰，已隔離：`, error, info?.componentStack);
  }

  override render(): React.ReactNode {
    // resetKey 變了就把 failed 清掉，下一次 render 重新掛子樹。
    // 寫在 render 裡而不是 componentDidUpdate，是為了讓「切相位的那一格」
    // 就已經重試，而不是先閃一格 fallback。
    if (this.props.resetKey !== this.seenKey) {
      this.seenKey = this.props.resetKey;
      if (this.state.failed) {
        // eslint-disable-next-line react/no-direct-mutation-state -- render 期間的
        // 同步重置：走 setState 會多一次 render 並在同一格閃出 fallback。
        this.state = { failed: false };
      }
    }
    if (!this.state.failed) return this.props.children;

    return (
      <div
        data-hud-error={this.props.label}
        style={{
          position: "absolute",
          left: 8,
          // ⚠️ 放**上方**不是下方，而且是刻意的：底部那 10px 是版本徽章的
          // band（#66，每一個畫面都畫），`versionBadgeBand.test.ts` 會掃原始樹
          // 抓任何侵入它的 `bottom:` —— 我第一版寫 `bottom: 8` 就被它抓到了。
          // 上方同時也更醒目：玩家的視線在戰鬥中本來就偏上。
          top: 8,
          padding: "4px 10px",
          border: PANEL_BORDER,
          borderRadius: 6,
          color: TEXT_DIM,
          fontSize: 11,
          pointerEvents: "none",
          background: "rgba(120,20,20,0.55)",
        }}
      >
        {hudErrorFallbackText(this.props.label)}
      </div>
    );
  }
}
