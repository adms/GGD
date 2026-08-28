/**
 * GH#842 —— 「常常打一打，動畫就消失沒有播完」（owner 2026-08-28）。
 *
 * ⭐ 這一條釘住的是**碼表的語意**：owner 的三秒鐵則（2026-08-23）逐字是
 * 「不管什麼特效⋯**產生後**生命週期最多維持三秒」——
 * 主詞是**一次演出**，⛔ 不是「這個 emitter 物件連續活了多久」。
 *
 * ── 為什麼在戰鬥中才發作 ────────────────────────────────────────────────
 * `VfxSystem` 的粒子系統是**按 doc id 池化**的（cap 4，滿了就偷 LRU）。
 * 池化實例被重新點燃時**不會排空**，於是 `isAlive()` 一直是 true
 * ⇒ `ACTIVE_SINCE` 從**第一次**點燃就沒有歸零過
 * ⇒ 連續戰鬥 3 秒後，掃描對**正在播的那一發**做 `stop()+reset()`。
 *
 * ⇒ 獨自站著放技能：中間會排空，碼表歸零，⭐ 看起來完全正常。
 *   打起來：同一顆 emitter 每半秒被再點一次 ⇒ **每三秒砍一次**，
 *   而砍掉的是玩家眼前正在播的那一段。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markVfxManaged, sweepVfxHardCap, noteVfxRefired } from "./vfxHardCap";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 一顆會回報「還有粒子在飛」的假 emitter（池化實例的樣子）。 */
function fakePs(name: string): {
  name: string;
  stopped: number;
  reset: () => void;
  stop: () => void;
  isAlive: () => boolean;
  isStarted: () => boolean;
  isStopping: () => boolean;
} {
  const ps = {
    name,
    stopped: 0,
    alive: true,
    reset(): void {},
    stop(): void {
      ps.stopped++;
    },
    isAlive: () => ps.alive,
    isStarted: () => true,
    isStopping: () => false,
  };
  return ps as never;
}

describe("GH#842 三秒鐵則的碼表 —— 主詞是「一次演出」⛔不是「這個 emitter 活了多久」", () => {
  it("⭐ 池化實例被重新點燃 ⇒ 碼表歸零（⛔ 不可以砍掉正在播的那一發）", () => {
    const ps = fakePs("vfx-preset-hit");
    markVfxManaged(ps);
    const scene = { particleSystems: [ps as never], transformNodes: [] };
    // t=0 第一次點燃
    sweepVfxHardCap(scene as never, 0, { maxLifeSec: 3, scope: "managed" });
    // 戰鬥中：每 0.5 秒再點一次（池化 ⇒ ⛔ 從來沒排空）
    for (let t = 0.5; t <= 5; t += 0.5) {
      noteVfxRefired(ps); // ⭐ 這一發是**新的一次演出**
      sweepVfxHardCap(scene as never, t, { maxLifeSec: 3, scope: "managed" });
    }
    expect(
      (ps as unknown as { stopped: number }).stopped,
      "⛔ 連續戰鬥中被砍掉了 —— 那正是「打一打動畫就消失」",
    ).toBe(0);
  });

  it("⭐ 但真的播超過三秒的**單一一發**仍然要被砍（owner 的鐵則沒有被放寬）", () => {
    const ps = fakePs("vfx-preset-long");
    markVfxManaged(ps);
    const scene = { particleSystems: [ps as never], transformNodes: [] };
    sweepVfxHardCap(scene as never, 0, { maxLifeSec: 3, scope: "managed" });
    // ⛔ 沒有再點燃 —— 同一發一直播
    sweepVfxHardCap(scene as never, 3.1, { maxLifeSec: 3, scope: "managed" });
    expect(
      (ps as unknown as { stopped: number }).stopped,
      "一發播了 3.1 秒卻沒有被回收 —— 三秒鐵則破了",
    ).toBe(1);
  });

  it("⭐ **每一個**重新點燃池化粒子的地方都要通知碼表（⛔ 漏一個＝那一族照樣消失）", () => {
    // ⚠️ 這一條是**掃出貨原始碼**的（失敗形態⑥的例外：這裡問的正是「有沒有人
    //    在這一行旁邊忘了那一行」，而那不是行為，是接線的完整性）。
    // ⇒ 判準：「重新點燃池化實例」的那一行旁邊，同一個檔裡必須看得到
    //    `noteVfxRefired` 的**呼叫**。每個池的重新點燃長相不同 ⇒ 逐檔一個簽章。
    // ⭐ 2026-08-28 owner「技能施展兩次特效就會缺失 例如光束砲家族」——
    //    GH#842 修了前兩個池之後**還有兩個**：W3xEmitterRig（release 不排空 ⇒
    //    isAlive 恆 true ⇒ 碼表不歸零）與 ModelFxRig（release 在掃描之後、
    //    reuse 在下一幀掃描之前 ⇒ 掃描永遠看不到 disabled）。
    const files: { rel: string; refire: RegExp }[] = [
      { rel: "apps/client/src/vfx/VfxSystem.ts", refire: /manualEmitCount\s*=|fireBurst\(/ },
      { rel: "apps/client/src/vfx/vfxPresets.ts", refire: /manualEmitCount\s*=|fireBurst\(/ },
      // 池化 emitter 重新點燃（acquire 的 pooled 分支）
      { rel: "apps/client/src/render/vfx/W3xEmitterRig.ts", refire: /manualEmitCount\s*=/ },
      // mesh 半邊：free-list 重用後 re-enable（spawn 的唯一一處）
      { rel: "apps/client/src/render/modelFxRig.ts", refire: /setEnabled\(true\)/ },
    ];
    const missing: string[] = [];
    for (const { rel, refire } of files) {
      const raw = readFileSync(join(REPO, rel), "utf8");
      // ⚠️⚠️ **把 import 行與註解剝掉再問**（2026-08-28 的教訓）：
      //    第一版寫的是 `src.includes("noteVfxRefired")` —— 而 **import 行就滿足它**
      //    ⇒ 把呼叫整行拿掉，這條守衛仍然是綠的（失敗形態⑥：掃字串代替行為）。
      //    ⭐ 判準要問的是「有沒有一個**呼叫**」，⛔ 不是「這個名字有沒有出現」。
      const src = raw
        .split("\n")
        .filter((l) => !/^\s*(import|\/\/|\*|\/\*)/.test(l))
        .join("\n");
      if (refire.test(src) && !/noteVfxRefired\s*\(/.test(src)) missing.push(rel);
    }
    expect(
      missing,
      `這些檔重新點燃池化粒子卻沒有通知三秒碼表 ⇒ 那一族在連續戰鬥中會被砍掉正在播的那一發：\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("🟣 mesh 半邊：release→reuse 落在同一個掃描間隔內 ⇒ 掃描看不到 disabled ⇒ spawn 要自己通知碼表", () => {
    // owner 2026-08-28：「技能施展兩次特效就會缺失 例如光束砲家族」。
    //
    // ── 為什麼 mesh 半邊「排空歸零」那條路**結構上走不到** ─────────────────
    // `vfxHardCap` 的 mesh 碼表只在「某次掃描**觀察到**節點 disabled」時歸零。
    // 而出貨的順序是：frame N 的 `VfxSystem.update` **先**掃描（:2680）**後**
    // `modelFx.tick`（:2683，release ⇒ setEnabled(false)）；frame N+1 的事件
    // drain（在 update **之前**跑）重用 ⇒ setEnabled(true)。
    // ⇒ 每一次掃描看到的都是 enabled ⇒ 碼表從**第一發**起算 ⇒ 第二發在
    //    3 秒門檻被 setEnabled(false) 砍頭。修法＝`ModelFxRig.spawn()` 重用時
    //    呼叫 `noteVfxRefired(root)`（這條守衛釘的就是那個語意）。
    const node = {
      name: "modelfx-beam-0", // rig 的命名契約 ⇒ 掃描器把它當這一族的頂層節點
      parent: null,
      enabled: true,
      sweepDisables: 0,
      isEnabled: () => node.enabled,
      setEnabled(v: boolean): void {
        if (!v && node.enabled) node.sweepDisables++;
        node.enabled = v;
      },
    };
    const scene = { particleSystems: [], transformNodes: [node as never] };
    // 第一發：t=0 點燃，t=2.9 還在播
    sweepVfxHardCap(scene as never, 0, { maxLifeSec: 3, scope: "managed" });
    sweepVfxHardCap(scene as never, 2.9, { maxLifeSec: 3, scope: "managed" });
    // release（frame N，掃描之後）→ 下一幀 spawn 重用（frame N+1，掃描之前）——
    // ⚠️ 直接寫欄位，⛔ 不走 setEnabled()：模擬的正是「掃描沒有觀察到那一格」
    node.enabled = false;
    node.enabled = true;
    noteVfxRefired(node); // ⭐ 修復的那一行：spawn 對重用的 root 說「新的一次演出」
    // 第二發 3 秒內 ⇒ ⛔ 不可以被砍（沒有上面那行，3.1-0 ≥ 3 就砍了）
    sweepVfxHardCap(scene as never, 3.1, { maxLifeSec: 3, scope: "managed" });
    expect(
      node.sweepDisables,
      "⛔ 第二發被掃掉了 —— 那正是「施展兩次特效就會缺失」的 mesh 半邊",
    ).toBe(0);
    // 而第二發**自己**仍然吃三秒鐵則（owner 的鐵則沒有被放寬）
    sweepVfxHardCap(scene as never, 6.2, { maxLifeSec: 3, scope: "managed" });
    expect(node.sweepDisables, "一發播超過 3 秒卻沒被回收 —— 鐵則破了").toBe(1);
  });
});
