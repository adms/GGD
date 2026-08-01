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
import { createPortal } from "react-dom";
import { PANEL_BORDER, TEXT_DIM } from "./theme";
import {
  hudErrorFallbackText,
  recordHudError,
  shouldAutoRetry,
  type HudErrorRecord,
  type HudRetryScope,
} from "./hudErrorModel";

/**
 * 所有 fallback 標記共用的那一條直欄。
 *
 * ⚠️ 為什麼需要它：`HudBoundaryGroup` 之後畫面上有 **47 個** boundary，而每一個
 * fallback 都是 `position:absolute; left:8; top:8`。同時壞掉三個的話，三張標記
 * **疊在同一個座標上** —— 玩家看到一張，以為只壞了一個地方。這正是這次缺陷的
 * 家族特徵（「一次崩潰常常會連帶讓相鄰的面板也炸」，見 hudErrorModel 的
 * HUD_ERROR_LOG_CAP 註解）。
 *
 * 用 portal 把每一張標記送進同一個 flex 直欄，讓**瀏覽器的版面**去排它們 ——
 * 比在每個 boundary 裡自己算 index 可靠：算 index 需要一份模組級的「目前有誰
 * 壞著」清單，而清單變動不會觸發別人重繪，排出來的位置會留洞。
 */
const STRIP_ID = "hud-error-strip";

function hudErrorStrip(): HTMLElement | null {
  // node 環境（`renderToStaticMarkup` 的那 40 幾個測試）沒有 document。
  // 那條路徑本來就到不了這裡（React 在 SSR 不執行 boundary），但這個守衛讓
  // 「到不了」不必是一個假設。
  if (typeof document === "undefined") return null;
  const found = document.getElementById(STRIP_ID);
  if (found) return found;
  const el = document.createElement("div");
  el.id = STRIP_ID;
  // 左上角，往下堆。⚠️ 不可以用 `bottom:` —— 底部 10px 是版本徽章的 band
  // (#66)，`hud/versionBadgeBand.test.ts` 會抓任何侵入它的東西。
  el.style.cssText =
    "position:absolute;left:8px;top:8px;display:flex;flex-direction:column;" +
    "gap:4px;align-items:flex-start;pointer-events:none;z-index:60";
  (document.getElementById("hud-root") ?? document.body).appendChild(el);
  return el;
}

export interface HudErrorBoundaryProps {
  /** 出事時要告訴玩家「哪裡」壞了。用玩家看得懂的話，不是元件名。 */
  readonly label: string;
  /**
   * 這個值一變就重新掛載子樹再試一次（相位切換、換一場）。
   * ⚠️ 沒有它的話，一次瞬間的例外會讓這一塊整場都是壞的 —— 見檔頭 ②。
   */
  readonly resetKey?: string | number;
  /**
   * `resetKey` 代表的是「下一回合」還是「換一場」。fallback 的字要跟它一致 ——
   * 見 hudErrorModel 的 {@link HudRetryScope}（寫錯會叫玩家等一個不會來的重試）。
   */
  readonly retryScope?: HudRetryScope;
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
  /**
   * 這一格總共炸過幾次。跨越 resetKey 重置**不歸零** —— 重試上限就是靠它。
   *
   * ⚠️ **刻意是實例欄位，不是 React state。** `render()` 裡的重置是直接寫
   * `this.state`（為了在切相位的那一格就重試，不先閃一格 fallback），而直接寫
   * 繞過了 React 的更新佇列 —— React 內部的 memoizedState 看不到它。兩套機制放
   * 在同一個物件上會互相打架：我實測過把計數放進 state 的版本，連炸六次
   * `failCount` **一次都沒有加上去**，上限形同不存在（而測試會很開心地綠著，
   * 因為文案永遠停在「會自動重試」）。實例欄位不經過那個佇列，所以兩者互不干擾。
   */
  private failCount = 0;

  static getDerivedStateFromError(): HudErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.failCount += 1;
    // ⚠️ 這一行**不是**多餘的，即使 `getDerivedStateFromError` 已經回了
    // `{failed:true}`。我實測過拿掉它的版本：`componentDidCatch` 有跑
    // （崩潰紀錄確實多一筆），但 fallback **從來沒有被 commit** ——
    // `#hud-root` 是空的，玩家看到的還是「什麼都沒有」。
    // 在 `flushSync` 之下 React 對 render 期間例外的恢復要靠這個更新才會落地。
    // 少了它，這個 boundary 會退化成「安靜地把整塊吞掉」，也就是這次要修的症狀。
    this.setState({ failed: true });
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

  /**
   * resetKey 變了就把 failed 清掉，讓子樹重新掛載再試一次。
   *
   * ⚠️ **這裡曾經是寫在 `render()` 裡的直接 `this.state = {...}` 賦值**（為了
   * 避免切相位那一格閃一下 fallback）。那個版本**不會動**：我加了 log 實測，
   * resetKey 從 k0 換到 k4 五次，`render()` 每次都看到 `failed=true` 走進重置
   * 分支，但下一次 render 又是 `failed=true`，崩潰計數從頭到尾停在 1 ——
   * React 在每次 render 前會把 `instance.state` 指回它自己的 memoizedState，
   * 所以 render 期間的直接賦值會被丟掉。結果是**重試從來沒有真的發生過**，
   * 而「壞掉會自己回來」是這個 boundary 存在的一半理由。
   *
   * 換成 `componentDidUpdate` + `setState` —— React 記錄得到的那條路。
   * 代價是壞掉的那一格會多顯示一個 frame 才重試，換到的是它真的會重試。
   */
  override componentDidUpdate(prev: HudErrorBoundaryProps): void {
    if (prev.resetKey === this.props.resetKey) return;
    // ⚠️ 只有還沒用完重試額度時才清。用完了就停在 fallback ——
    // 這次兇手的形狀是「某個狀態一旦出現就持續成立」，對它無限重試只是
    // 每個相位切換都再炸一次、再灌一次 console、再重掛一次子樹。
    if (this.state.failed && shouldAutoRetry(this.failCount)) {
      this.setState({ failed: false });
    }
  }

  override render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;

    const exhausted = !shouldAutoRetry(this.failCount);
    const chip = (
      <div
        data-hud-error={this.props.label}
        style={{
          // ⚠️ 位置由 #hud-error-strip 那條 flex 直欄決定，這裡**不再**自己寫
          // `position:absolute; top:8`：47 個 boundary 各自釘死在同一個座標上，
          // 同時壞三個就會疊成一張，玩家以為只壞了一處。
          padding: "4px 10px",
          border: PANEL_BORDER,
          borderRadius: 6,
          color: TEXT_DIM,
          fontSize: 11,
          pointerEvents: "none",
          whiteSpace: "nowrap",
          background: exhausted ? "rgba(150,20,20,0.85)" : "rgba(120,20,20,0.55)",
        }}
      >
        {hudErrorFallbackText(this.props.label, exhausted, this.props.retryScope ?? "round")}
      </div>
    );

    // 送進共用直欄；拿不到 DOM（node 測試環境）就原地畫，**絕不回 null**。
    const strip = hudErrorStrip();
    return strip ? createPortal(chip, strip) : chip;
  }
}
