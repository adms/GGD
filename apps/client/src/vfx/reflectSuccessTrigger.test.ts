import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VfxScriptPlayer } from "./VfxScriptPlayer";
import { VFX_SCRIPT_TRIGGERS, type VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";

/**
 * ⭐⭐ GH#885 —— **反彈成功接得上演出軸**。
 *
 * ── 為什麼這條票存在（⛔ 不是「多一個觸發器比較好」）────────────────────
 * owner 指名的驗收三招之一 **20-002 理想鄉EX** 是由**反彈成功**觸發的。
 * ⚠️ 而 2026-08-31 之前 `onReflectSuccess` **只走 `fireHooks`**（＝內容的效果鏈），
 * ⛔ **零 emit** ⇒ 客戶端完全不知道有這一刻發生過 ⇒ ⭐ 那一招在 schema 層**寫不出來**。
 *
 * ── ⭐ 這條守衛驗的是**四段接縫**，⛔ 不是任何一段自己 ──────────────────
 * ① schema 的觸發器列舉有它 ② sim 送得出來 ③ fanout 放行 ④ 播放器 fire 得出來
 * ⚠️ ⭐ 失敗形態⑪：四段各自對，而**接縫**沒有人驗 —— 那正是 `modelFxSpawn`
 * 「有 case 但第一行讀零寫入端的欄位」那一族的形狀。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");

describe("GH#885 反彈成功 → 演出軸（四段接縫）", () => {
  it("① schema 認得 `reflectSuccess`（⛔ 而 `blockSuccess` 刻意不在）", () => {
    expect(VFX_SCRIPT_TRIGGERS).toContain("reflectSuccess");
    // ⭐ 格擋今天**沒有正確的歸屬**（`damage` 事件的 origin 是攻擊者的技能，
    //   而格擋特效屬於防禦者）⇒ 加了就是一格「說了但不會發生」的欄位。正解在 GH#650。
    expect(VFX_SCRIPT_TRIGGERS as readonly string[]).not.toContain("blockSuccess");
  });

  it("② sim 真的送得出來 —— 讀出貨原始碼，⛔ 不是掃字串就算", () => {
    const src = readFileSync(join(REPO, "packages/shared/src/sim/systems/ReflectHookSystem.ts"), "utf8");
    expect(src).toContain('world.emit("reflectSuccess"');
    // ⭐ 三個欄位是播放器**真的會讀**的：歸屬、防禦者、攻擊者。
    for (const field of ["origin:", "reflector:", "attacker:"]) expect(src).toContain(field);
  });

  it("③ fanout 放行它（⛔ 不放行 = 算出來了但從沒送到客戶端）", () => {
    const src = readFileSync(join(REPO, "apps/game-server/src/net/eventFanout.ts"), "utf8");
    expect(src).toContain('"reflectSuccess"');
  });

  it("★ ④ 播放器拿真的事件形狀 fire 得出來 —— ⭐ 而歸屬走 `ability:` provenance", () => {
    const doc = {
      id: "godie-e002.ex", schema: "vfx-script@1", abilityId: "godie-e002.ex",
      segments: [{ kind: "floatingText", on: "reflectSuccess", text: "AVALON" }],
    } as unknown as VfxScriptDoc;
    const fired: string[] = [];
    const player = new VfxScriptPlayer({
      scriptFor: (id) => (id === "godie-e002.ex" ? doc : undefined),
      allScripts: () => [doc],
      projectileIdsOf: () => new Set(),
      entityPos: () => ({ x: 1, z: 2 }),
      dispatch: (ev) => fired.push((ev.data as { text?: string }).text ?? ev.type),
      enabled: () => true,
    });
    // ⭐ payload 的形狀逐欄抄自 `ReflectHookSystem` 的 emit 站。
    player.onEvent(
      { type: "reflectSuccess", tick: 7,
        data: { reflector: 11, attacker: 22, origin: "ability:godie-e002.ex", amount: 300, x: 1, z: 2 } } as never,
      0,
    );
    player.update(0);
    expect(fired, "⛔ 反彈成功沒有 fire ⇒ 理想鄉EX 的演出軸仍然是死的").toEqual(["AVALON"]);
  });

  it("⑤ 沒有腳本的反彈是**零成本路**（⛔ 不可以擲例外）", () => {
    const player = new VfxScriptPlayer({
      scriptFor: () => undefined, allScripts: () => [], projectileIdsOf: () => new Set(),
      entityPos: () => null, dispatch: () => {}, enabled: () => true,
    });
    expect(() =>
      player.onEvent(
        { type: "reflectSuccess", tick: 1, data: { reflector: 1, attacker: 2, origin: "ability:nope" } } as never,
        0,
      ),
    ).not.toThrow();
  });
});
