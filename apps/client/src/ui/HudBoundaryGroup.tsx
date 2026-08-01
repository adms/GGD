/**
 * HudBoundaryGroup — 把一群 HUD 成員**各自**包進自己的 error boundary。
 *
 * ── 為什麼不是「一個 boundary 包住整棵樹」 ──────────────────────────────
 *
 * `e0af4758` 已經在 `<MatchOverlay />` 外面放了一個 boundary，它把
 * 「一次 render 例外 = 這個分頁的介面永久死亡」降級成「這一場的介面死掉，
 * 換一場會回來」。那是對的，但**還不夠**：獵兇工作流在活的比賽裡實測，
 * 讓 `PhaseTimer` 丟例外之後
 *
 *     #hud-root 子節點  13 → 1
 *
 * —— 玩家看到的**仍然是「所有介面一起消失」**，只是多了一行字。因為那一個
 * boundary 的粒度就是整個 `<MatchOverlay />`：商店、血條、倒數、小地圖全部
 * 是它的子孫，一起被卸載。
 *
 * 這個模組把粒度切到**面板**：37 個成員各有各的 boundary，`PhaseTimer` 炸掉
 * 只帶走 `PhaseTimer`，其餘 36 個照常畫。
 *
 * ── 為什麼是「自動包」而不是「一個一個手寫 <HudErrorBoundary>」 ────────
 *
 * 手寫 37 次的版本六個月後一定會漏 —— 新面板寫進 JSX 的人不會記得那一層，
 * 而漏掉的症狀正是這次的缺陷（那一格炸掉帶走整片）。所以這裡用
 * `Children.map` 把**每一個直接子元素**各自套一層，新元件寫進 JSX 就自動被包，
 * **沒有第二個地方要記得改**。
 *
 * ⚠️ **必須遞迴穿透 Fragment。** `HudRoot` 的成員有一半住在
 * `{inGame && !couch && (<>…13 個…</>)}` 這種條件群組裡。不遞迴的話那 13 個
 * 共用一層 boundary，等於商店掛掉還是帶走血條 —— 缺陷原封不動地留在最大的
 * 那一群裡。`hudBoundaryGroup.test.tsx` 的「fragment 群組」那一條在守這件事。
 *
 * ── 標籤為什麼是一張表，不是 `fn.name` ────────────────────────────────
 *
 * 我實際 grep 過出貨的 bundle（`apps/client/dist/assets/index-*.js`）：
 * `MerchantShop` / `PhaseTimer` / `ZombieWaveBar` / `BossHealthBar` 出現次數
 * **都是 0**。`vite.config.ts` 沒設 `build.minify`，走 esbuild 預設壓縮，
 * top-level 函式名會被改掉。所以用 `type.name` 取標籤，正式站上會顯示
 * 「介面 A 發生錯誤」—— 又一次靜默降級。
 *
 * 表放在**元件已經被 import 的那個檔**（`HudRoot` / `AppRoot`）而不是集中在
 * 這裡：集中就要再寫一份 37 行的 import 清單，那份清單本身就會 drift。
 */
import React, { Children, Fragment, isValidElement, type ReactNode } from "react";
import { HudErrorBoundary } from "./HudErrorBoundary";
import type { HudRetryScope } from "./hudErrorModel";

/** 元件 → 玩家看得懂的位置名。key 是 import 進來的元件本身，不是它的名字。 */
export type HudBoundaryLabels = ReadonlyMap<unknown, string>;

export interface HudBoundaryGroupProps {
  readonly labels: HudBoundaryLabels;
  /** 這個值一變，**壞掉的**那些子樹重新掛載再試一次（見 HudErrorBoundary）。 */
  readonly resetKey?: string | number;
  /** 這一組的 resetKey 是「下一回合」還是「換一場」（見 hudErrorModel）。 */
  readonly retryScope?: HudRetryScope;
  readonly children: ReactNode;
}

/**
 * 找出這個子元素該顯示什麼名字。
 *
 * 三段，一段比一段不精確，但**沒有一段是回 undefined 的** —— fallback 上寧可
 * 寫「未命名面板」也不能寫不出東西來：那就退回這次要修的那個症狀
 * （東西不見了，而且沒有一個字解釋）。
 */
export function hudBoundaryLabel(node: React.ReactElement, labels: HudBoundaryLabels): string {
  const known = labels.get(node.type);
  if (known !== undefined) return known;
  // 原生元素（`MatchOverlay` 的離開鈕就是一個裸 <div data-hud-slot="leave">）——
  // 用它宣告的 HUD 槽位當 key，那是它在版面契約裡本來就有的身分 (#42/#107)。
  // 同一張表可以用槽位字串當 key，所以裸元素也拿得到中文名，不必開第二張表。
  const slot = (node.props as { "data-hud-slot"?: unknown })?.["data-hud-slot"];
  if (typeof slot === "string" && slot.length > 0) return labels.get(slot) ?? slot;
  return "未命名面板";
}

/** 這個節點是不是 Fragment（`<>…</>` 或 `<React.Fragment>`）。 */
function isFragment(node: React.ReactElement): boolean {
  return node.type === Fragment;
}

function wrapNode(
  node: ReactNode,
  labels: HudBoundaryLabels,
  resetKey: string | number | undefined,
  retryScope: HudRetryScope | undefined,
): ReactNode {
  // false / null / undefined / 字串 —— 條件群組沒開的那些。原樣放回去，
  // 包住一個 `false` 只會多一層沒有意義的 boundary。
  if (!isValidElement(node)) return node;

  // ⚠️ Fragment 要**穿透**，不是包住。包住的話整個條件群組共用一層，
  // 這個模組就白寫了（見檔頭）。
  if (isFragment(node)) {
    const inner = (node.props as { children?: ReactNode }).children;
    return (
      <Fragment key={node.key ?? undefined}>
        {Children.map(inner, (c) => wrapNode(c, labels, resetKey, retryScope))}
      </Fragment>
    );
  }

  const label = hudBoundaryLabel(node, labels);
  // key 也掛一份在 boundary 上。⚠️ **這是防禦性的，不是必要的** ——
  // 我用突變量過：把這個 `key=` 拿掉、把 `Children.map` 換成裸陣列 map、
  // 甚至兩個同時拿掉，`<CheatConsole key={matchEpoch} />` 的重掛行為
  // **都還在**。因為 `node` 是原封不動傳下去的，它自己的 key 就足以讓 React
  // 重掛那個單一子元素。三條路徑各自都夠。
  // 留著它是因為便宜且讓外層身分跟著子元素走；但不要以為它是那個行為的來源。
  return (
    <HudErrorBoundary key={node.key ?? undefined} label={label} resetKey={resetKey} retryScope={retryScope}>
      {node}
    </HudErrorBoundary>
  );
}

/**
 * 把每一個直接子元素（含 Fragment 裡的）各自包進一個 `HudErrorBoundary`。
 *
 * 用法：把既有 `return (<>…</>)` 的內容原封不動塞進來就好，一個成員都不用改。
 */
export function HudBoundaryGroup({
  labels,
  resetKey,
  retryScope,
  children,
}: HudBoundaryGroupProps): React.JSX.Element {
  return <>{Children.map(children, (c) => wrapNode(c, labels, resetKey, retryScope))}</>;
}
