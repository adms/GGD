// @vitest-environment jsdom
/**
 * ⭐【一場比賽的出口與入口都要乾淨】GH#585 · #586 · #587 · #597 · #591 · #596
 *
 * > owner 2026-08-23：「不管是**出口**還是**入口**還是**每回合進商店前**⋯
 * >  你**寧願多次清理乾淨開始回合 也不要漏清到**」
 *
 * ⚠️ 為什麼 import **出貨的 `main.tsx`**：零件（`clientGlobals` / `resetAudioForNewMatch`）
 * 各自都有行為守衛，⛔ 但它們驗不到「**有沒有人呼叫**」—— 而這四張票的內容正是
 * 「零件做好了、接線沒接 ⇒ 死碼」（失敗形態③）。
 * 突變（實跑，本批承重）：`stopMatch()` 拿掉 `resetClientGlobals();` ⇒ 🔴
 * 「第 1 次離場後大廳／商店 ⛔ 不該留著上一場那句提示」expected {…} to be null。
 */
import { describe, it, expect, vi } from "vitest";
import GAME_APP_SRC from "./GameApp.ts?raw"; // `?raw`：jsdom 的 `import.meta.url` 是 http:
import { cover } from "@ggd/shared/testkit/cover";
import { appStore, type MatchLaunch } from "./ui/platform/store";
import { getCastNotice, pushCastNotice } from "./ui/castFeedback";
import { getHeldAimSlot, setHeldAbility } from "./ui/abilityHold";

const ctl = vi.hoisted(() => ({ built: 0, throws: false, join: (): Promise<void> => Promise.resolve(), audio: 0 }));

vi.mock("./GameApp", () => ({
  GameApp: class {
    constructor() { ctl.built++; }
    start(): void {}
    connect(): Promise<void> { return ctl.join(); }
    connectPlatform(): Promise<void> { return ctl.join(); }
    dispose(): void { if (ctl.throws) throw new Error("拆到一半爆了"); }
  },
}));
vi.mock("./ui/platform/AppRoot", () => ({ AppRoot: () => null }));
type M = Record<string, unknown>; // ⭐ 其餘一律 spread 原模組只換一個 export（整包替換會讓真模組少東西）
vi.mock("./ui/replay/ReplayApp", async (o) => ({ ...(await o<M>()), parseReplayHash: () => null }));
vi.mock("react-dom/client", async (o) => ({ ...(await o<M>()), createRoot: () => ({ render() {}, unmount() {} }) }));
vi.mock("./render/modelLod", async (o) => ({ ...(await o<M>()), loadModelLodManifest: async () => {} }));
vi.mock("./content/bootContent", async (o) => ({
  ...(await o<M>()),
  isContentReady: () => true,
  ensureContentLoaded: async () => ({ ok: true, championCount: 9, contentVersion: "cv_test", transport: "bundle" }),
}));
vi.mock("./audio", async (o) => ({ ...(await o<M>()), resetAudioForNewMatch: () => void ctl.audio++ }));

const MATCH = { mode: "offline", localPlayers: 1, skinOverrides: new Map() } as unknown as MatchLaunch;
const enter = (): void => appStore.setState({ screen: "match", match: MATCH });
const leave = (): void => appStore.setState({ screen: "lobby", match: null });

// ⚠️ 這個 runner 的 jsdom `localStorage` 壞掉（`getItem is not a function`）而開機序列會讀它。
const mem = new Map<string, string>();
const ls = { length: 0, key: () => null, clear: () => mem.clear(), getItem: (k: string) => mem.get(k) ?? null };
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { ...ls, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
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
      expect(ctl.audio, "入口一次 + 出口一次（owner:「寧願多次清理乾淨」）").toBe(i * 2);
    }
  });

  it("GH#587 上一場晚到的 join 失敗踢不掉這一場 · GH#597 dispose 丟例外仍然進得去下一場", async () => {
    cover("match-lifecycle-wiring-587");
    let rejectA!: (e: Error) => void;
    ctl.join = () => new Promise<void>((_, rej) => (rejectA = rej));
    enter(); // A —— join 還沒落地
    ctl.join = () => Promise.resolve();
    ctl.throws = true; // GH#597：離開時 `dispose()` 丟例外
    leave();
    const before = ctl.built;
    enter(); // B —— 練習模式
    expect(ctl.built, "GH#597：`app` 沒有先放閂 ⇒ 這個分頁從此只有 F5 能救").toBe(before + 1);
    rejectA(new Error("A 的 join 這時候才 reject"));
    await Promise.resolve();
    await Promise.resolve();
    expect(appStore.getState().screen, "GH#587：**上一場**的失敗把**這一場**踢回大廳了").toBe("match");
    ctl.throws = false;
    leave();
  });

  it("GH#591 `dispose()` 退訂 state patch · GH#596 非預期斷線有一條回大廳的出路", () => {
    cover("match-lifecycle-wiring-591");
    // ⚠️ 掃原始碼是這兩條**唯一**做得到的：`new GameApp()` 要真的 Babylon engine +
    //    Colyseus session，全 repo 零測試建得起它（`render/views/championBody.ts` 檔頭）
    expect(GAME_APP_SRC, "GH#591：訂閱不退 ⇒ dispose 過的整棵 Babylon scene 被釘在 heap 上").toContain(
      "this.boundRoom?.onStateChange.remove(this.onPatch)",
    );
    expect(GAME_APP_SRC, "GH#596：`onDisconnect` 全 repo 零指派點 ⇒ 斷線後玩家卡在死畫面").toContain(
      "appStore.getState().matchDisconnected(code)",
    );
  });
});
