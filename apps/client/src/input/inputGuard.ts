/**
 * ⭐【誤觸防護】—— 遊戲中把「按下去會把玩家踢出比賽」的那些鍵擋住。
 *
 * owner 2026-08-14：「遊戲中 滑鼠右鍵 WIN鍵等按鍵要鎖住避免誤觸影響體驗」。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 先講**擋得掉什麼、擋不掉什麼** —— 這一段比程式重要
 * ---------------------------------------------------------------------------
 *
 * | 誤觸 | 擋得掉？ | 怎麼擋 |
 * |---|---|---|
 * | 右鍵選單（HUD 上） | ✅ | `contextmenu` preventDefault。⚠️ 遊戲畫布**早就擋了**（右鍵是移動/攻擊指令），漏的是 HUD／面板那一半 |
 * | 中鍵自動捲動 | ✅ | `auxclick` + `pointerdown` button 1 |
 * | 滑鼠側鍵「上一頁／下一頁」 | ✅ | button 3/4 |
 * | Backspace 返回上一頁 | ✅ | 只在非輸入框時擋 |
 * | Ctrl+W / Ctrl+R / Ctrl+T | ⚠️ **半個** | 瀏覽器保留鍵，⛔ 網頁擋不掉。只能靠 `beforeunload` 讓「關閉／重整」跳確認框 |
 * | **Win / Super 鍵** | ⛔ **一般視窗擋不掉** | 作業系統層。**唯一**辦法是**全螢幕 + Keyboard Lock API**（`navigator.keyboard.lock()`，Chromium 限定） |
 * | Alt+Tab / Cmd+Tab | ⛔ 同上 | 同上 |
 *
 * ⛔ **所以不要宣稱「Win 鍵鎖住了」。** 這個模組能做的是：
 *    ① 非全螢幕 —— 擋掉所有網頁擋得掉的，Win 鍵**照樣會跳出開始選單**
 *    ② 全螢幕 + `keyboard.lock()` 成功 —— 連 Win / Alt+Tab 都吃得下來
 *    `state()` 會如實回報現在是哪一種，HUD 才有辦法誠實地告訴玩家。
 *
 * ---------------------------------------------------------------------------
 * 第一守則：這三個都是**決策點**，不是數字 —— 全部可切換
 * ---------------------------------------------------------------------------
 * · `blockContextMenu`  右鍵選單（HUD 上）
 * · `blockNavKeys`      中鍵／側鍵／Backspace 這些「會離開頁面」的
 * · `confirmOnLeave`    關閉分頁前跳確認框
 * · `keyboardLock`      全螢幕時要不要吃掉 Win/Alt+Tab（⚠️ 它會讓玩家**離不開**，
 *                       所以預設 on 但**只在全螢幕**生效，退出全螢幕自動解除）
 */

/** 誤觸防護的開關組。全部可調 —— ⛔ 不要在這個檔裡寫死任何一項。 */
export interface InputGuardConfig {
  /** 右鍵選單（遊戲畫布以外的地方）。 */
  blockContextMenu: boolean;
  /** 中鍵自動捲動、滑鼠側鍵上一頁/下一頁、Backspace 返回。 */
  blockNavKeys: boolean;
  /** 關閉／重整分頁前跳瀏覽器確認框。 */
  confirmOnLeave: boolean;
  /** 全螢幕時鎖住 Win / Alt+Tab（⚠️ 只在全螢幕有效，Chromium 限定）。 */
  keyboardLock: boolean;
}

export const DEFAULT_INPUT_GUARD: InputGuardConfig = {
  blockContextMenu: true,
  blockNavKeys: true,
  // ⚠️ 預設 **off**：一個「你確定要離開嗎」的框在**非比賽中**是純騷擾。
  // 開關給出去，由呼叫端在「真的在打」的時候才打開（見 GameApp 的接線）。
  confirmOnLeave: false,
  keyboardLock: true,
};

/** 現在真的擋到什麼 —— HUD 要用它誠實顯示，⛔ 不要用 config 當狀態。 */
export interface InputGuardState {
  /** 瀏覽器層的那些（右鍵／中鍵／側鍵／Backspace）擋著。 */
  webGuardsActive: boolean;
  /** 現在是全螢幕。 */
  fullscreen: boolean;
  /** `navigator.keyboard.lock()` 真的成功了 —— 只有這時 Win 鍵才吃得掉。 */
  systemKeysLocked: boolean;
  /** 這個瀏覽器有沒有 Keyboard Lock API（沒有就永遠鎖不了系統鍵）。 */
  keyboardLockSupported: boolean;
}

/** 會「離開頁面」的滑鼠按鍵：1 = 中鍵（autoscroll）、3/4 = 側鍵（上/下一頁）。 */
const NAV_BUTTONS = new Set([1, 3, 4]);

/** 在這些元素裡 Backspace 是正常的刪字，⛔ 不可以擋。 */
function isTextEntry(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (el === null || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}

interface KeyboardLockApi {
  lock?: (keys?: string[]) => Promise<void>;
  unlock?: () => void;
}

/**
 * 要求鎖住的鍵。⚠️ **列舉而不是全鎖**：`lock()` 不帶參數會吃掉**所有**鍵，
 * 包含 F5／開發者工具，那在自家測試機上是搬石頭砸腳。
 */
const LOCKED_KEYS = [
  "MetaLeft",
  "MetaRight", // Win / Command
  "AltLeft",
  "AltRight", // Alt+Tab 的那一半
  "Tab",
  "Escape", // 全螢幕退出仍可長按 Esc（瀏覽器保留這條逃生路）
  "ContextMenu",
];

export interface InputGuard {
  /** 換一組開關（後台改了設定、或進出比賽）。 */
  update(cfg: InputGuardConfig): void;
  /** 現在真的擋到什麼。 */
  state(): InputGuardState;
  /** 進全螢幕並嘗試鎖系統鍵。回傳**實際**結果，⛔ 不是「送出請求了」。 */
  enterFullscreen(): Promise<InputGuardState>;
  dispose(): void;
}

/**
 * 裝上誤觸防護。
 *
 * ⚠️ 監聽掛在 `doc`（整份文件）而不是遊戲畫布 —— 漏掉的正是 HUD 那一半，
 *    而 HUD 佔了畫面下緣一整條，是最容易右鍵按到的地方。
 */
export function installInputGuard(
  doc: Document,
  win: Window,
  initial: InputGuardConfig = DEFAULT_INPUT_GUARD,
): InputGuard {
  let cfg = { ...initial };
  let locked = false;
  const disposers: (() => void)[] = [];

  const kb = (win.navigator as unknown as { keyboard?: KeyboardLockApi }).keyboard;
  const lockSupported = typeof kb?.lock === "function";

  const on = <T extends Event>(
    target: EventTarget,
    type: string,
    fn: (ev: T) => void,
    opts?: AddEventListenerOptions,
  ): void => {
    target.addEventListener(type, fn as EventListener, opts);
    disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };

  // ── 右鍵選單 ──────────────────────────────────────────────────────────
  on<MouseEvent>(doc, "contextmenu", (ev) => {
    if (cfg.blockContextMenu) ev.preventDefault();
  });

  // ── 中鍵自動捲動 / 側鍵上一頁下一頁 ────────────────────────────────────
  // ⚠️ 兩個事件都要擋：`auxclick` 是導覽真正發生的地方，
  //    `pointerdown` 才擋得掉中鍵那顆「自動捲動小圓盤」（它在按下的瞬間就出現）。
  const blockNavButton = (ev: MouseEvent | PointerEvent): void => {
    if (cfg.blockNavKeys && NAV_BUTTONS.has(ev.button)) ev.preventDefault();
  };
  on<PointerEvent>(doc, "pointerdown", blockNavButton, { capture: true });
  on<MouseEvent>(doc, "auxclick", blockNavButton, { capture: true });

  // ── Backspace 返回上一頁 ──────────────────────────────────────────────
  on<KeyboardEvent>(
    doc,
    "keydown",
    (ev) => {
      if (!cfg.blockNavKeys) return;
      if (ev.key !== "Backspace") return;
      if (isTextEntry(ev.target)) return; // ⛔ 打字中的刪字不可以擋
      ev.preventDefault();
    },
    { capture: true },
  );

  // ── 關閉／重整前確認 ─────────────────────────────────────────────────
  on<BeforeUnloadEvent>(win, "beforeunload", (ev) => {
    if (!cfg.confirmOnLeave) return;
    ev.preventDefault();
    // 舊瀏覽器要求 returnValue 有值才跳框；文字本身現代瀏覽器不顯示。
    ev.returnValue = "";
  });

  // ── 全螢幕狀態變了 → 系統鍵鎖跟著上/下 ────────────────────────────────
  const isFullscreen = (): boolean => doc.fullscreenElement !== null;

  const syncLock = (): void => {
    const want = cfg.keyboardLock && isFullscreen();
    if (want && !locked && lockSupported) {
      // ⚠️ 失敗是**正常**的（權限、非 Chromium、非全螢幕）。吞掉例外但
      //    ⛔ 不要假裝成功 —— `locked` 只在 resolve 之後才變 true。
      void kb!.lock!(LOCKED_KEYS).then(
        () => {
          locked = true;
        },
        () => {
          locked = false;
        },
      );
    } else if (!want && locked) {
      kb?.unlock?.();
      locked = false;
    }
  };
  on(doc, "fullscreenchange", syncLock);

  return {
    update(next: InputGuardConfig): void {
      cfg = { ...next };
      syncLock();
    },
    state(): InputGuardState {
      return {
        webGuardsActive: cfg.blockContextMenu || cfg.blockNavKeys,
        fullscreen: isFullscreen(),
        systemKeysLocked: locked,
        keyboardLockSupported: lockSupported,
      };
    },
    async enterFullscreen(): Promise<InputGuardState> {
      const el = doc.documentElement;
      if (!isFullscreen() && typeof el.requestFullscreen === "function") {
        try {
          await el.requestFullscreen();
        } catch {
          /* 使用者拒絕或瀏覽器不給 —— state() 會如實回報沒進去 */
        }
      }
      if (cfg.keyboardLock && isFullscreen() && lockSupported && !locked) {
        try {
          await kb!.lock!(LOCKED_KEYS);
          locked = true;
        } catch {
          locked = false;
        }
      }
      return this.state();
    },
    dispose(): void {
      if (locked) {
        kb?.unlock?.();
        locked = false;
      }
      for (const d of disposers.splice(0)) d();
    },
  };
}

/**
 * ⭐ 回合開始要不要把跟隨鎖扣回來（owner 2026-08-14「有幾場沒有拉回來」）。
 *
 * 抽成純函式**只為了它測得到** —— 原本這 4 行埋在 `GameApp` 的每幀迴圈裡，
 * 而那裡沒有辦法在測試中構造（要真的 Babylon + MatchState + viewports）。
 * ⛔ 埋在裡面的判斷 = 一條沒有守衛的規則，而這條規則正是缺陷本身。
 *
 * 三個輸入就是三個真實情境：
 * · `inCombat` 現在是不是戰鬥中
 * · `wasInCombat` 上一幀是不是 —— **edge** 就是這兩個的差
 * · `spectating` 死亡觀戰中（#85 刻意給的自由視角，⛔ 不可以搶）
 */
export function shouldRelockFollow(
  inCombat: boolean,
  wasInCombat: boolean,
  spectating: boolean,
): boolean {
  if (!inCombat) return false; // 不在戰鬥，沒有「回合開始」這回事
  if (wasInCombat) return false; // ⛔ 只在 edge，每幀扣會讓玩家整場不能平移
  if (spectating) return false; // 觀戰的自由視角由 setDead 擁有
  return true;
}
