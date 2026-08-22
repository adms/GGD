// @vitest-environment jsdom
/**
 * ⭐【一場比賽的出口與入口都要乾淨】GH#585 · GH#586 · GH#587 · GH#597 · GH#591 · GH#596
 *
 * > owner 2026-08-23：「不管是**出口**還是**入口**還是**每回合進商店前**⋯
 * >  你**寧願多次清理乾淨開始回合 也不要漏清到**」
 *
 * ⚠️ 為什麼是 import **出貨的 `main.tsx`**：`clientGlobals.ts` 與
 * `resetAudioForNewMatch()` 都已經有自己的行為守衛，⛔ 但它們驗不到「**有沒有人
 * 呼叫**」—— 那正是這四張票的內容（零件做好了而接線是死碼＝失敗形態③）。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * M1（本批承重）`main.tsx` 的 `stopMatch()` 拿掉 `resetClientGlobals();`
 *    ⇒ 🔴「第 1 次離場之後大廳還留著上一場的提示」expected 'Q' to be null。
 */
import { describe, it, expect, vi } from "vitest";
// ⚠️ `?raw` 而不是 `readFileSync` —— jsdom 底下 `import.meta.url` 是 http:，
//    而 `process.cwd()` 取決於誰在哪裡打 vitest。這一條讓 vite 自己去解析路徑。
import GAME_APP_SRC from "./GameApp.ts?raw";
import { cover } from "@ggd/shared/testkit/cover";
import { appStore, type MatchLaunch } from "./ui/platform/store";
import { getCastNotice, pushCastNotice } from "./ui/castFeedback";
import { getHeldAimSlot, setHeldAbility } from "./ui/abilityHold";

const ctl = vi.hoisted(() => ({
  built: 0,
  disposeThrows: false,
  join: (): Promise<void> => Promise.resolve(),
  audioReset: 0,
}));

vi.mock("./GameApp", () => ({
  GameApp: class {
    constructor() {
      ctl.built++;
    }
    start(): void {}
    connect(): Promise<void> {
      return ctl.join();
    }
    connectPlatform(): Promise<void> {
      return ctl.join();
    }
    dispose(): void {
      if (ctl.disposeThrows) throw new Error("拆到一半爆了");
    }
  },
}));
vi.mock("./ui/platform/AppRoot", () => ({ AppRoot: () => null }));
vi.mock("./ui/replay/ReplayApp", async (orig) => ({
  ...(await orig<typeof import("./ui/replay/ReplayApp")>()),
  parseReplayHash: () => null,
}));
vi.mock("react-dom/client", async (orig) => ({
  ...(await orig<typeof import("react-dom/client")>()),
  createRoot: () => ({ render() {}, unmount() {} }),
}));
vi.mock("./render/modelLod", async (orig) => ({
  ...(await orig<typeof import("./render/modelLod")>()),
  loadModelLodManifest: async () => {},
}));
vi.mock("./content/bootContent", async (orig) => ({
  ...(await orig<typeof import("./content/bootContent")>()),
  isContentReady: () => true,
  ensureContentLoaded: async () => ({ ok: true, championCount: 9, contentVersion: "cv_test", transport: "bundle" }),
}));
// ⭐ 只換掉一個 export（⛔ 不是整個 barrel）—— `ui/*` 那一側還在用真的音訊模組。
vi.mock("./audio", async (orig) => ({
  ...(await orig<typeof import("./audio")>()),
  resetAudioForNewMatch: () => void ctl.audioReset++,
}));

const MATCH = { mode: "offline", localPlayers: 1, skinOverrides: new Map() } as unknown as MatchLaunch;
const enter = (): void => appStore.setState({ screen: "match", match: MATCH });
const leave = (): void => appStore.setState({ screen: "lobby", match: null });

// ⚠️ 這個 runner 的 jsdom `localStorage` 是壞的（`getItem is not a function`），
//    而開機序列有三支會讀它。⛔ 不是被測的東西 ⇒ 換一顆記憶體版。
const mem = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    length: 0,
    key: () => null,
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  },
});
document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="hud-root"></div>';
await import("./main");

describe("進出房間都清乾淨 (match-lifecycle-wiring-585)", () => {
  it("★ 第 N 次進場等於第 1 次 —— 入口與出口**各清一次**", () => {
    cover("match-lifecycle-wiring-585");
    for (let i = 1; i <= 3; i++) {
      enter();
      expect(getCastNotice(), `第 ${i} 次進場應該是乾淨的開始`).toBeNull();
      expect(getHeldAimSlot(), `第 ${i} 次進場地板上 ⛔ 不該亮著上一場的範圍圈`).toBeNull();
      // 這一場把模組層全域弄髒（HUD 卸載 ⛔ 不會清它們）
      pushCastNotice({ slot: "Q", abilityName: "", text: "魔力不足", sfx: null, secondsLeft: 0, seq: i });
      setHeldAbility("Q");
      leave();
      expect(getCastNotice(), `第 ${i} 次離場後大廳／商店 ⛔ 不該留著上一場那句提示`).toBeNull();
      expect(getHeldAimSlot(), `第 ${i} 次離場後 ⛔ 不該留著上一場按住的技能格`).toBeNull();
      expect(ctl.audioReset, "入口一次 + 出口一次（owner:「寧願多次清理乾淨」）").toBe(i * 2);
    }
  });

  it("GH#587 上一場晚到的 join 失敗踢不掉這一場 · GH#597 dispose 丟例外仍然進得去下一場", async () => {
    cover("match-lifecycle-wiring-587");
    let rejectA!: (e: Error) => void;
    ctl.join = () => new Promise<void>((_, rej) => (rejectA = rej));
    enter(); // A —— join 還沒落地
    ctl.join = () => Promise.resolve();
    ctl.disposeThrows = true; // GH#597：離開時 `dispose()` 丟例外
    leave();
    const builtBefore = ctl.built;
    enter(); // B —— 練習模式
    expect(ctl.built, "GH#597：`app` 沒有先放閂 ⇒ 這個分頁從此只有 F5 能救").toBe(builtBefore + 1);
    rejectA(new Error("A 的 join 這時候才 reject"));
    await Promise.resolve();
    await Promise.resolve();
    expect(appStore.getState().screen, "GH#587：**上一場**的失敗把**這一場**踢回大廳了").toBe("match");
    ctl.disposeThrows = false;
    leave();
  });

  it("GH#591 `dispose()` 退訂 state patch · GH#596 非預期斷線有一條回大廳的出路", () => {
    cover("match-lifecycle-wiring-591");
    // ⚠️ 掃原始碼是**這兩條唯一**做得到的：`new GameApp()` 要一顆真的 Babylon
    //    engine + Colyseus session，全 repo 零測試建得起它（`championBody.ts` 檔頭
    //    已經記著這件事）。⇒ 兩條各驗一個**唯一**的字串，改名就紅。
    expect(GAME_APP_SRC, "GH#591：訂閱不退 ⇒ 整棵 dispose 過的 Babylon scene 被釘在 heap 上").toContain(
      "this.boundRoom?.onStateChange.remove(this.onPatch)",
    );
    expect(GAME_APP_SRC, "GH#596：`onDisconnect` 全 repo 零指派點 ⇒ 斷線後玩家卡在死畫面").toContain(
      "appStore.getState().matchDisconnected(code)",
    );
  });
});
