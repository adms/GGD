/**
 * ⛔⛔ GH#816 / GH#760 —— **每一間用 `MatchState` 的房，都必須在 `onJoin` 給 client 一份 view。**
 *
 * ── 這條閘補的是哪一個洞 ───────────────────────────────────────────────────
 * #816 已經有兩條閘，而它們**組合起來仍然是空的**（失敗形態⑪：兩條對的守衛，
 * 中間的接縫沒有人站）：
 *
 *   · `packages/shared/src/protocol/viewGatedDelivery.test.ts`
 *       證明「**空的 view** ⇒ 這一格不上線」——⛔ 它不看房間。
 *   · `apps/client/src/net/viewGatedEntities.test.ts`
 *       證明「客戶端讀到缺席時活得下來」——⛔ 它的 state 是自己造的。
 *
 * ⇒ 兩條都管不到**伺服器端根本沒給 view** 這一種。而那一種**更糟**：
 * `zoneView.ts` 逐字寫著「`SchemaSerializer.applyPatches` 對 `client.view == null`
 * 的客戶端送的是共用的 `encoder.encode(it)`，它只走 `root.changes`」⇒
 * ⭐ **沒有 view 的客戶端一個實體都收不到**（⛔ 不是「收到全部」），而且是**永久**的
 * —— #816 那次至少只壞在 champSelect，這一種壞一整場。
 *
 * ── ⭐ 量到的（2026-08-30，⛔ 不是推理）────────────────────────────────────
 * 把 `MatchRoom.onJoin` 最後那一行 `this.zoneViews.onJoin(client)` **拿掉**，
 * 跑 `apps/game-server/src/{rooms,net}/`：**44 個檔 / 216 條測試全部綠。**
 * ⇒ 在此之前，這件事只由三處**散文**守著（`schema.ts` 的「每一間房都必須指派
 * view」、`zoneView.ts` 的「為什麼每一個 client 都一定要有 view」、`ReplayRoom`
 * 的「它**不是**可有可無」）—— 而散文不會變紅（第三守則）。
 *
 * ── ⚠️ 為什麼順序也算在內 ──────────────────────────────────────────────────
 * `ReplayRoom.onJoin` 把它放在**第一行**（refusal 的 early-return 之前）；
 * `MatchRoom.onJoin` 把它放在**最後一行**，前面有 ~50 行座位解析。
 * ⇒ 之後任何一個**不呼叫 `client.leave()` 的 early return** 都會送出一個沒有
 * view 的連線，而上面那 216 條測試不會有任何一條紅。這條閘問的正是這個：
 * **「onJoin 走完而沒有被踢掉的 client，手上有沒有 view」**，⛔ 不是「原始碼裡
 * 有沒有出現 `zoneViews.onJoin` 這串字」（失敗形態⑥）。
 *
 * 紅了要改什麼：⛔ 不是這條測試 —— 去看被指名的那一間房的 `onJoin`，
 * 把 `this.zoneViews.onJoin(client)` 補回去（或移到早於那個 early return）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { StateView } from "@colyseus/schema";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { ReplayRoom } from "./ReplayRoom";
import { Whitelist } from "../curation/whitelist";

/** 一個**沒有** view 的連線 —— 起點必須是空的，否則下面量到的是夾具不是房間。 */
function fakeClient(sessionId: string): { sessionId: string; userData: Record<string, unknown>; view?: StateView; leave: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  return { sessionId, userData: {}, leave: vi.fn(), send: vi.fn() };
}

/** onJoin 走完之後，這個 client 手上必須是一份真的 `StateView`。 */
function expectViewed(room: string, client: { view?: StateView; leave: { mock: { calls: unknown[] } } }): void {
  expect(client.leave.mock.calls.length, `${room}: 這條測試要驗的是「被收下的」連線，而它被踢掉了`).toBe(0);
  expect(
    client.view,
    `⛔ ${room}.onJoin 走完了而 client.view 還是 undefined ⇒ ` +
      "`SchemaSerializer` 會送不含 view-tagged 欄位的共用編碼 ⇒ 這位玩家**一個實體都收不到**（整場）。\n" +
      "  ⇒ 去把 `this.zoneViews.onJoin(client)` 補回該房的 onJoin（且要早於任何 early return），\n" +
      "  ⛔ 不是改這條測試。",
  ).toBeInstanceOf(StateView);
}

/** 出貨原始碼裡**真的**繼承 `Room<MatchState>` 的類別名（⛔ 不是手抄的名單）。 */
function shippingMatchStateRooms(): string[] {
  const dir = __dirname;
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
    const src = readFileSync(join(dir, f), "utf8");
    for (const m of src.matchAll(/export\s+class\s+(\w+)\s+extends\s+Room<MatchState>/g)) out.push(m[1]!);
  }
  return out.sort();
}

describe("每一間用 MatchState 的房都要在 onJoin 指派 view (GH#816)", () => {
  it("⭐ MatchRoom：onJoin 走完的連線手上有 StateView", async () => {
    const room = new MatchRoom() as unknown as {
      setSimulationInterval: () => void;
      onMessage: () => void;
      onCreate(o: MatchRoomOptions): Promise<void>;
      onJoin(c: unknown, o: object): void;
      onDispose(): void;
    };
    room.setSimulationInterval = (): void => {};
    room.onMessage = (): void => {};
    await room.onCreate({ matchId: "gh816-view", seed: 1, whitelist: Whitelist.allowAll(), combatEnv: {} });

    const client = fakeClient("gh816-match");
    expect(client.view, "前置條件壞了：夾具自己就帶著 view ⇒ 下面量到的不是房間做的事").toBeUndefined();
    room.onJoin(client, {});
    expectViewed("MatchRoom", client);
    room.onDispose();
  });

  it("⭐ ReplayRoom：連**被拒**的那條路也要先給 view（順序，⛔ 不只是有呼叫）", () => {
    const room = new ReplayRoom() as unknown as {
      onJoin(c: unknown): void;
      refusal: { code: string } | null;
    };
    // 逐字重現出貨的 early-return：`onJoin` 在 refusal 之後就 `return` 了。
    room.refusal = { code: "not-found" };

    const client = fakeClient("gh816-replay");
    expect(client.view, "前置條件壞了：夾具自己就帶著 view").toBeUndefined();
    room.onJoin(client);
    expect(client.send.mock.calls.length, "前置條件壞了：走到的不是 refusal 那條路").toBeGreaterThan(0);
    expect(
      client.view,
      "⛔ ReplayRoom 在 refusal 的 early-return 之前沒有給 view ⇒ 回放畫面一個實體都不會出現。",
    ).toBeInstanceOf(StateView);
  });

  it("⭐ 反方向：出貨原始碼裡的 Room<MatchState> 一間都不可以漏掉上面的驗收", () => {
    const shipping = shippingMatchStateRooms();
    // ⛔ 分母不可以是空的 —— regex 失效時這條會變成一個永遠綠的空斷言（失敗形態⑨）。
    expect(shipping.length, "掃不到任何 Room<MatchState> ⇒ 上面兩條的分母是假的").toBeGreaterThan(0);
    expect(
      shipping,
      "⭐ 多了一間用 MatchState 的房，而上面沒有它的 onJoin 驗收。\n" +
        "  ⇒ 幫它加一條（照 MatchRoom 那條的樣子），⛔ 不是把它加進這份名單就算了 ——\n" +
        "  沒有 view 的房，玩家進去是一座空競技場。",
    ).toEqual(["MatchRoom", "ReplayRoom"]);
  });
});
