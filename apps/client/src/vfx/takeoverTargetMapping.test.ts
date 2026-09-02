/**
 * ⭐⭐ **事件 → 接管目標的映射**（Codex 2026-09-02 抓到的缺陷）。
 *
 * ⛔⛔ 缺陷的形狀:`claimTakeover` 讀 `frame.victim`,
 * ⭐ 而 `TriggerFrame.victim` 的註解逐字寫著「**只有 `comboStrike` 帶得到**」
 * ⇒ 一段宣告 `replaces: "target.reaction"` 的腳本在 `projectileHit` /
 * `reflectSuccess` 上**登記不到任何人** ⇒ `heldBy` 永遠 false ⇒
 * ⭐ **取代語意在那兩類上靜默失效**:預設演出照播,而作者以為自己接管了。
 *
 * ⚠️ ⭐ **為什麼既有的兩條守衛都是綠的** —— 綠燈假來源⑪:
 * · `presentationTriggersWired` 問「有沒有人播」（有）
 * · `channelTakeover.test` 問「帳本本身對不對」（對）
 * ⛔ **沒有人問接縫**:那一則事件的接管**登記在誰身上**。
 *
 * ⭐ 這一支跑**真的 `VfxScriptPlayer`**,餵**真的事件形狀**,
 * 讀**真的帳本** —— ⛔ 不是自己造一份 frame（失敗形態⑤）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { VfxScriptPlayer } from "./VfxScriptPlayer";
import { channelTakeover } from "../render/channelTakeover";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";

const ABILITY = "godie-e002.q";
const PROJ = "proj.test";

/** ⭐ 一份**真的**通過 schema 的腳本:三個觸發器各一段,全部接管受方通道。 */
const script = {
  schema: "vfx-script@1",
  id: "vfxscript.takeover-test",
  abilityId: ABILITY,
  segments: [
    { kind: "anim", on: "strike", pulse: "hurt", replaces: "target.reaction" },
    { kind: "anim", on: "projectileHit", pulse: "hurt", replaces: "target.reaction" },
    { kind: "anim", on: "reflectSuccess", pulse: "guard", replaces: "target.reaction" },
  ],
} as unknown as VfxScriptDoc;

function player(): VfxScriptPlayer {
  return new VfxScriptPlayer({
    scriptFor: (id: string) => (id === ABILITY ? script : undefined),
    projectileIdsOf: (id: string) => (id === ABILITY ? new Set([PROJ]) : new Set<string>()),
    allScripts: () => [script],
    entityPos: () => ({ x: 0, z: 0 }),
    dispatch: () => {},
    enabled: () => true,
  } as never);
}

const ev = (type: string, data: Record<string, unknown>) =>
  ({ type, tick: 1, data }) as never;

describe("事件 → 接管目標的映射", () => {
  beforeEach(() => channelTakeover.reset());

  it("⭐ `comboStrike` → 接管**那一段的受害者**", () => {
    player().onEvent(ev("comboStrike", { caster: 1, origin: `ability:${ABILITY}`, index: 1, victim: 7 }), 0);
    expect(channelTakeover.heldBy(7, "target.reaction", 0), "⛔ 受害者沒被接管").toBe(true);
    expect(channelTakeover.heldBy(1, "target.reaction", 0), "⛔ 接管跑到施法者身上了").toBe(false);
  });

  it("⭐⭐ `projectileHit` → 接管**被命中的人**（⛔ 這一條在修之前是紅的）", () => {
    player().onEvent(ev("projectileHit", { id: 9, owner: 1, target: 7, projectileId: PROJ }), 0);
    expect(
      channelTakeover.heldBy(7, "target.reaction", 0),
      "⛔ 被命中的人沒被接管 ⇒ 專屬腳本與預設 hurt **兩條都會播**",
    ).toBe(true);
  });

  it("⭐⭐ `reflectSuccess` → 接管**反彈者自己**（⛔ 不是攻擊者）", () => {
    player().onEvent(
      ev("reflectSuccess", { reflector: 7, attacker: 1, origin: `ability:${ABILITY}` }),
      0,
    );
    // ⭐ 空間上的「目標」是攻擊者,⛔ 而做出反應的身體是防禦者自己
    expect(channelTakeover.heldBy(7, "target.reaction", 0), "⛔ 反彈者沒被接管").toBe(true);
    expect(channelTakeover.heldBy(1, "target.reaction", 0), "⛔ 接管跑到攻擊者身上了").toBe(false);
  });

  it("⭐ **反方向**:沒有 `replaces` 的腳本⛔ 不接管任何人", () => {
    const plain = { ...script, segments: [{ kind: "anim", on: "projectileHit", pulse: "hurt" }] } as unknown as VfxScriptDoc;
    new VfxScriptPlayer({
      scriptFor: () => plain,
      projectileIdsOf: () => new Set([PROJ]),
      allScripts: () => [plain],
      entityPos: () => ({ x: 0, z: 0 }),
      dispatch: () => {},
      enabled: () => true,
    } as never).onEvent(ev("projectileHit", { id: 9, owner: 1, target: 7, projectileId: PROJ }), 0);
    expect(
      channelTakeover.heldBy(7, "target.reaction", 0),
      "⛔ 沒宣告 replaces 卻接管了 ⇒ 出貨的 10 份 script 會被靜默壓制",
    ).toBe(false);
  });
});
