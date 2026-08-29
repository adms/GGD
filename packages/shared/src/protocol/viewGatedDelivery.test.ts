/**
 * ⛔⛔ GH#816 / GH#760 —— **空的 view-gated 集合根本不上線**，客戶端讀到 `undefined`。
 * `schema.ts` 那一段散文是下一個標 `view()` 的人唯一會讀的東西；這裡把它變成會紅的測試。
 *
 * ⭐ **為什麼是 `Reflection`，⛔ 不是 `new MatchState()`**：伺服器端的
 * `new MatchState()` 會把 `entities` 初始化成真的 `MapSchema` ⇒ ⛔ 在它上面永遠量不到
 * 這個缺陷。而出貨的客戶端根本沒有這個類別 —— `net/RoomConnection.ts` 逐字寫著
 * 「we deliberately do NOT pass the shared MatchState class as rootSchema」，
 * colyseus.js 從握手的 `Reflection` **動態**造類別，而那一份**不預先初始化集合欄位**。
 * ⇒ 這裡跑的是出貨的整條路，⛔ 一段夾具都沒有：真的 `Encoder` → 真的 `Reflection`
 * 握手與還原 → 真的 `encodeAllView` → 真的 `decode`。
 *
 * ⚠️ 這正是 GH#816 說「每一條既有守衛都是綠的」的原因：夾具**自己造** state ⇒
 * 造得出 `size: 0`，⛔ 造不出「伺服器選擇不送」（失敗形態⑤）。
 *
 * 紅了要改什麼：①「空 view ⇒ 缺席」紅 ⇒ Colyseus 改了行為（好消息），要改的是
 * `schema.ts` 那一段散文與 `net/viewGatedEntities.ts` 的存在理由，⛔ 不是這條測試。
 * ②「非空 view ⇒ 送得到」紅 ⇒ 剔除壞了，去看 `net/zoneView.ts`。
 */
import { describe, expect, it } from "vitest";
import { Encoder, Reflection, StateView } from "@colyseus/schema";
import { EntityState, MatchState, viewGatedFieldNames } from "./schema";

/** 伺服器端：一份 `MatchState` ＋ 它的 `Encoder`（＝ `SchemaSerializer` 握的那一個）。 */
function server(): { state: MatchState; encoder: Encoder<MatchState> } {
  const state = new MatchState();
  state.phase = "champSelect";
  return { state, encoder: new Encoder(state) };
}

/**
 * 出貨的那一條路跑一次：握手 → 動態造客戶端類別 → 對這一份 view 編碼全量 → 解碼。
 * 回傳客戶端**真的**拿到的那個 state 物件。
 */
function deliverTo(encoder: Encoder<MatchState>, view: StateView): Record<string, unknown> {
  const client = Reflection.decode<MatchState>(Reflection.encode(encoder));
  const buf = Buffer.allocUnsafe(Encoder.BUFFER_SIZE);
  const shared = { offset: 1 };
  encoder.encodeAll(shared, buf);
  const bytes = encoder.encodeAllView(view, shared.offset, { ...shared }, buf);
  client.decode(Buffer.from(bytes), { offset: 1 });
  return client.state as unknown as Record<string, unknown>;
}

describe("view-gated 集合：空的時候根本不上線 (GH#816)", () => {
  it("⭐ 空 view ⇒ 每一格 view-gated 欄位都是 `undefined`，⛔ 不是 size 0 的空集合", () => {
    const gated = viewGatedFieldNames();
    // ⛔ 分母不可以是空的 —— 名單推導壞掉時這條測試會變成一個永遠綠的空迴圈
    //    （失敗形態⑨：一個結構上不可能紅的閘）。
    expect(gated.length, "viewGatedFieldNames() 推不出任何欄位 ⇒ 下面整段是空的").toBeGreaterThan(0);

    const { encoder } = server();
    const state = deliverTo(encoder, new StateView());

    for (const field of gated) {
      expect(
        state[field],
        `\`${field}\` 是 view-gated 而 view 是空的 ⇒ 客戶端應該讀到 undefined。\n` +
          "  這一條紅了代表 Colyseus 改了行為（空集合也送了）——\n" +
          "  ⇒ 要改的是 packages/shared/src/protocol/schema.ts 的那一段散文，⛔ 不是這條測試。",
      ).toBeUndefined();
    }

    // ⭐ 對照組：**沒有** view tag 的集合欄位照樣上線（空的也上線）。
    //    少了這一半，一份「什麼都沒解碼到」的壞快照也會讓上面全綠（單邊的尺）。
    expect(gated).not.toContain("seats");
    expect((state.seats as { size?: number } | undefined)?.size, "seats 沒有 view tag ⇒ 空的也要送").toBe(0);
    expect((state.duels as { length?: number } | undefined)?.length, "duels 沒有 view tag ⇒ 空的也要送").toBe(0);
    expect(state.phase, "純量欄位當然要送").toBe("champSelect");
  });

  it("⭐ 另一個方向：view 裡有東西 ⇒ 這一格就上線了（⛔ 不是永遠缺席）", () => {
    const { state: server0, encoder } = server();
    const e = new EntityState();
    e.id = 7;
    e.zone = 0;
    server0.entities.set(String(e.id), e);

    const view = new StateView();
    view.add(e as never);
    const state = deliverTo(encoder, view);

    const entities = state.entities as { size?: number; get?: (k: string) => { id: number } | undefined } | undefined;
    expect(entities, "view 裡有實體卻沒送 ⇒ 剔除壞了，去看 net/zoneView.ts").toBeDefined();
    expect(entities?.size).toBe(1);
    expect(entities?.get?.("7")?.id).toBe(7);
  });
});
