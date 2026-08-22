/**
 * GH#539 —— 常駐特效的**承重**主張只有一條：**條件消失時它真的不見了**。
 *
 * ⚠️ 會沒用的斷言：「`port.attach` 被呼叫了一次」。整個 `sync` 可以只做加法、
 * 一行移除都不寫，那條斷言照樣綠（失敗形態 ③）。所以這裡讀的是**句柄自己的
 * `cancelled`**（＝真的被殺了，⛔ 不是 alpha=0）**加上** `liveKeys`（＝帳本也
 * 忘掉它了，否則條件重新成立時不會重掛）。
 *
 * 夾具走**出貨的 `zPersistentVfx`**，⛔ 不是手寫一個長得像的物件 ——
 * 掛點的預設值因此是出貨的那個常數（失敗形態 ⑤）。
 */
import { describe, it, expect } from "vitest";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { zPersistentVfx } from "@ggd/shared/content/schema/ability";
import {
  PersistentVfxChannel,
  persistentVfxRequests,
  type PersistentVfxHandle,
  type PersistentVfxPort,
} from "./persistentVfx";

class FakeHandle implements PersistentVfxHandle {
  cancelled = false;
  cancel(): void {
    this.cancelled = true;
  }
  get alive(): boolean {
    return !this.cancelled;
  }
}

class FakePort implements PersistentVfxPort {
  readonly handed: FakeHandle[] = [];
  attach(): PersistentVfxHandle {
    const h = new FakeHandle();
    this.handed.push(h);
    return h;
  }
}

const ROOT = {} as TransformNode;
/** EX 解鎖後腳下的魔法陣 —— `when` 缺席 = 「這支技能在身上就掛著」。 */
const SPEC = zPersistentVfx.parse({ vfxKey: "attach.ex.midchilder-aura" });

describe("persistentVfx", () => {
  it("條件成立→掛在出貨預設掛點；條件消失→句柄真的被 cancel 且帳本忘掉它（⛔ 不是 alpha=0）", () => {
    const port = new FakePort();
    const channel = new PersistentVfxChannel(port);

    const on = persistentVfxRequests("godie-h020.ex", [SPEC], () => true);
    expect(on).toHaveLength(1);
    expect(on[0]!.attach).toBe("origin");

    channel.sync("e1", ROOT, on);
    const handle = port.handed[0]!;
    expect(channel.liveKeys("e1")).toEqual([on[0]!.key]);
    expect(handle.cancelled).toBe(false);

    // 同一份 desired 再來一次：⛔ 不重掛（重掛會閃一下，而且是一次洩漏）
    channel.sync("e1", ROOT, on);
    expect(port.handed).toHaveLength(1);

    // 條件消失 —— EX 被收走 / 換形態
    const off = persistentVfxRequests("godie-h020.ex", [SPEC], () => false);
    expect(off).toEqual([]);
    channel.sync("e1", ROOT, off);

    expect(handle.cancelled).toBe(true);
    expect(channel.liveKeys("e1")).toEqual([]);

    // 條件重新成立 → 重新掛得起來（帳本沒忘掉的話這裡會是 1）
    channel.sync("e1", ROOT, on);
    expect(port.handed).toHaveLength(2);
    expect(channel.liveKeys("e1")).toEqual([on[0]!.key]);
  });

  it("換了一具身體：舊句柄先被 cancel，⛔ 不留在即將被 dispose 的節點底下", () => {
    const port = new FakePort();
    const channel = new PersistentVfxChannel(port);
    const on = persistentVfxRequests("godie-h020.ex", [SPEC], () => true);

    channel.sync("e1", ROOT, on);
    channel.sync("e1", {} as TransformNode, on);

    expect(port.handed[0]!.cancelled).toBe(true);
    expect(port.handed[1]!.cancelled).toBe(false);
    expect(channel.liveKeys("e1")).toHaveLength(1);
  });
});
