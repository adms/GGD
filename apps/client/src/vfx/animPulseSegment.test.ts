/**
 * GH#838 M4 —— 動畫脈衝段（受害者定格）的守衛。
 *
 * 原作 01-04／20-002 每一刀都對目標播死亡動畫並凍在 10% 速。⭐ 零新渲染機制：
 * `ChampionView.pulse(kind, now, {clipWindowMs})` 的剪輯窗本來就會拉長剪輯。
 *
 * ⭐ 驗**機制**：段真的打到**受害者**（⛔ 不是施法者）、拉長參數真的送出去、
 * 沒有注入 `pulseAnim` 時是安靜的 no-op（headless 測試的樣子）。
 * 突變（2026-08-28）：把 player 的 `this.deps.pulseAnim?.(…)` 拿掉 ⇒ ①② 紅。
 */
import { describe, it, expect } from "vitest";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxScriptPlayer } from "./VfxScriptPlayer";

const DOC = zVfxScriptDoc.parse({
  id: "t-anim",
  schema: "vfx-script@1",
  abilityId: "godie-hart.r",
  segments: [
    { kind: "anim", on: "strike", at: "target", pulse: "hurt", clipWindowMs: 900 },
    { kind: "anim", on: "strike", at: "caster", pulse: "cast" },
  ],
});

/** 一則真形狀的逐段錨（欄位名逐字同 sim 的 `ComboStrikeEvent`）。 */
const STRIKE = {
  type: "comboStrike",
  tick: 7,
  data: { caster: 11, origin: "ability:godie-hart.r", index: 1, count: 7, finisher: false, zone: 0, victim: 22, x: 1, z: 2 },
} as unknown as EventMessage;

function run(pulseAnim?: VfxScriptPlayerDepsPulse): { id: number; kind: string; win?: number }[] {
  const got: { id: number; kind: string; win?: number }[] = [];
  const player = new VfxScriptPlayer({
    scriptFor: (id) => (id === "godie-hart.r" ? DOC : undefined),
    allScripts: () => [DOC],
    projectileIdsOf: () => new Set(),
    entityPos: () => ({ x: 0, z: 0 }),
    dispatch: () => {},
    enabled: () => true,
    ...(pulseAnim
      ? {
          pulseAnim: (id: number, kind: "attack" | "cast" | "hurt", opts?: { clipWindowMs?: number }) => {
            got.push({ id, kind, ...(opts?.clipWindowMs !== undefined ? { win: opts.clipWindowMs } : {}) });
          },
        }
      : {}),
  });
  player.onEvent(STRIKE, 0);
  player.update(0);
  return got;
}
type VfxScriptPlayerDepsPulse = true;

describe("GH#838 M4 動畫脈衝段", () => {
  it("① at:\"target\" 打到**受害者**（⛔ 不是施法者 —— 打錯人畫面上看起來只是「沒反應」）", () => {
    const got = run(true);
    const onVictim = got.find((g) => g.id === 22);
    expect(onVictim, `收到的是 ${JSON.stringify(got)}`).toBeDefined();
    expect(onVictim!.kind).toBe("hurt");
  });

  it("② 剪輯窗真的送出去（拉長＝慢動作定格，那是這一段存在的理由）", () => {
    const got = run(true);
    expect(got.find((g) => g.id === 22)?.win, "clipWindowMs 沒有送到 view").toBe(900);
  });

  it("③ at:\"caster\" 打到施法者，且兩段互不干擾", () => {
    const got = run(true);
    expect(got.find((g) => g.id === 11)?.kind).toBe("cast");
    expect(got.length).toBe(2);
  });

  it("④ 沒有注入 pulseAnim ⇒ 安靜 no-op（⛔ 不擲例外帶走同一批後面的事件）", () => {
    expect(() => run(undefined)).not.toThrow();
  });
});
