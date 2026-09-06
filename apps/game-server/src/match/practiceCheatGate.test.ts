/**
 * 練習面板的**閘**（GH#365）—— 這是這一批唯一的靈魂層守衛，因為它是安全性。
 *
 * owner 的要求：「只在練習模式開放。正式對局必須完全關閉，而且是**伺服器端擋**」。
 *
 * ⭐ 所以這支測試刻意**不**驗任何 UI。判準是：一個手動送 WebSocket 訊息的人，
 * 在正式對局裡送不送得動這些指令。面板藏不藏得起來與這件事**完全無關** ——
 * 一條驗「按鈕沒有顯示」的測試對一個把閘刪掉的實作是全綠的（失敗形態④）。
 *
 * 兩件事各一段：
 *   ① `cheatsEnabled` 的三個參數在**正式對局**上算出 false（純函式，微秒級）；
 *   ② `MatchRoom` 的訊息處理器**真的讀它** —— 閘關著的時候，一則長得完全合法的
 *      MSG.CHEAT **連 `applyCheat` 都碰不到**。
 *
 * ⛔ ② 為什麼斷言「`applyCheat` 有沒有被呼叫」而不是「世界有沒有變」：閘的職責
 * 逐字就是「不要讓它進到控制器」。斷言世界沒變的話，一個「進得去但剛好失敗」的
 * 實作也會綠 —— 而那個實作在下一個 cheat kind 上就會漏。
 *
 * 突變（已驗）：拿掉 `rooms/MatchRoom.ts` 的 `if (!this.cheatsAllowed) return;`
 * ⇒ ②「正式對局」那一條紅（`applyCheat` 被呼叫了 1 次）；反向那一條仍然綠。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { asSeatId } from "@ggd/shared/ids";
import { MSG } from "@ggd/shared/protocol/messages";
import { cheatsEnabled } from "./cheatGate";
import { Whitelist } from "../curation/whitelist";
import { MatchRoom, type MatchRoomOptions } from "../rooms/MatchRoom";

const SEAT0 = asSeatId(0);

interface Room {
  onCreate(o: MatchRoomOptions): Promise<void>;
  onDispose(): void;
  setSimulationInterval: () => void;
  onMessage: (type: string, h: (c: unknown, m: unknown) => void) => void;
  cheatsAllowed: boolean;
  seatBySession: Map<string, number>;
  ctl: { applyCheat: (...a: unknown[]) => boolean; takeCheatRejection: () => string };
}

/** 一間真的 `MatchRoom`，`applyCheat` 換成一支會記帳的替身。 */
async function room(id: string, cheatsAllowed: boolean): Promise<{ r: Room; calls: unknown[][]; fire: () => void }> {
  const handlers = new Map<string, (c: unknown, m: unknown) => void>();
  const r = new MatchRoom() as unknown as Room;
  r.setSimulationInterval = (): void => {};
  r.onMessage = (t, h): void => void handlers.set(t, h);
  await r.onCreate({ matchId: id, seed: 1, whitelist: Whitelist.allowAll(), combatEnv: {} });
  r.cheatsAllowed = cheatsAllowed;
  r.seatBySession.set("sess", SEAT0);
  const calls: unknown[][] = [];
  r.ctl.applyCheat = (...a: unknown[]): boolean => {
    calls.push(a);
    return true;
  };
  const client = { sessionId: "sess", send: (): void => {} };
  // 一則**完全合法**的指令。被擋下來的理由必須是「這間房不准」，
  // ⛔ 不可以是「這則訊息本來就有問題」。
  const fire = (): void => handlers.get(MSG.CHEAT)!(client, { cheat: { kind: "setLevel", level: 18 } });
  return { r, calls, fire };
}

describe("測試碼的伺服器端閘（GH#365 · 只在練習房開放）", () => {
  it("① 正式對局：有 shared secret 且不是練習房 ⇒ 閘是關的", () => {
    cover("cheat-practice-server-gate");
    // 正式站永遠有 shared secret，所以這三格就是線上的全部可能。
    expect(cheatsEnabled("shared-secret", undefined, false)).toBe(false); // 正式對局
    expect(cheatsEnabled("shared-secret", undefined, true)).toBe(true); // 練習房
    expect(cheatsEnabled("shared-secret", "0", true)).toBe(false); // 營運總開關蓋過練習房
  });

  it("★ ② 閘關著時，一則合法的 MSG.CHEAT **連控制器都碰不到**", async () => {
    cover("cheat-practice-server-gate");
    const { r, calls, fire } = await room("gate-shut", false);
    fire();
    expect(calls, "正式對局裡的作弊訊息被套用了 —— 伺服器端的閘沒有擋").toHaveLength(0);
    r.onDispose();
  });

  it("⭐ 反向：閘開著（練習房）時**同一則訊息**會被套用", async () => {
    cover("cheat-practice-server-gate");
    const { r, calls, fire } = await room("gate-open", true);
    fire();
    expect(calls, "練習房裡的作弊訊息沒有被套用 —— ② 驗到的其實是別的東西").toHaveLength(1);
    r.onDispose();
  });
});
