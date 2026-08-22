/**
 * ⭐ GH#603 —— 常駐特效的**時機**：EX 魔法陣要在「**EX 技學習到時**」才出現。
 *
 * owner 2026-08-23：「**EX 技學習到時**，底下魔法陣記得要顯示跟 JASS 一樣」。
 *
 * ⚠️ GH#539 那條守衛驗的是「掛得上去」，而**一個永遠成立的條件與一個正確的條件
 * 在它面前一模一樣** —— 所以這一支驗的是**兩個時刻**，而且讀的是最終的帳本
 * （`liveKeys` ＋ 句柄自己的 `cancelled`），⛔ 不是「port.attach 被呼叫了」。
 *
 * 夾具走**出貨的內容檔**（`content/champions/godie-h020.json` 與它的 EX 文件），
 * ⛔ 不是一個手寫的、長得像的物件（失敗形態⑤：被測的不是出貨的那個）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  PersistentVfxChannel,
  persistentVfxKeysFor,
  persistentVfxRequests,
  type LearnedSlots,
  type PersistentVfxHandle,
  type PersistentVfxPort,
} from "./persistentVfx";
import type { PersistentVfx } from "@ggd/shared/content/schema/ability";

const CONTENT = join(__dirname, "../../../../../content");
const read = (rel: string): unknown => JSON.parse(readFileSync(join(CONTENT, rel), "utf-8"));

const CHAMPION = read("champions/godie-h020.json");
const RESOLVE = (id: string): unknown => read(`abilities/${id}.json`);

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
const seat = (exRank: number): LearnedSlots => ({ abilityRanks: [0, 0, 0, 0], exRank });

/** 出貨文件 → 現在該掛的請求（`when` 缺席，所以閘就是「學到了沒」）。 */
function desired(learned: LearnedSlots | null): ReturnType<typeof persistentVfxRequests> {
  const keys = persistentVfxKeysFor(CHAMPION, RESOLVE, learned) ?? [];
  return persistentVfxRequests(
    "godie-h020.ex",
    keys.map((vfxKey) => ({ vfxKey }) as PersistentVfx),
    () => true,
  );
}

describe("EX 魔法陣的時機 (GH#603)", () => {
  it("exRank 0 ⇒ 場上**沒有**魔法陣；學到之後 ⇒ 它出現；再退回 0 ⇒ 句柄真的被殺掉", () => {
    const port = new FakePort();
    const channel = new PersistentVfxChannel(port);

    // ① 還沒學 —— ⛔ 不是「掛上去但看不見」，是**根本沒有這一份請求**。
    expect(desired(seat(0))).toEqual([]);
    channel.sync("h1", ROOT, desired(seat(0)));
    expect(channel.liveKeys("h1"), "EX 還沒解鎖，腳下不該有東西").toEqual([]);
    expect(port.handed).toHaveLength(0);

    // ② 學到了 —— 原作的 `udg_EX_Mode = true` 之後才 AddSpecialEffectTarget。
    const on = desired(seat(1));
    expect(on.map((r) => r.vfxKey)).toContain("attach.ex.midchilder-aura");
    channel.sync("h1", ROOT, on);
    expect(channel.liveKeys("h1")).toEqual(on.map((r) => r.key));

    // ③ 反向：條件不再成立 ⇒ 句柄 cancel + 帳本忘掉它（⛔ 不是 alpha=0）。
    channel.sync("h1", ROOT, desired(seat(0)));
    expect(port.handed[0]!.cancelled).toBe(true);
    expect(channel.liveKeys("h1")).toEqual([]);
  });

  it("seat 還沒同步（null）⇒ fail-closed，但天生技那一格不受影響", () => {
    expect(persistentVfxKeysFor(CHAMPION, RESOLVE, null) ?? []).toEqual([]);
  });
});
