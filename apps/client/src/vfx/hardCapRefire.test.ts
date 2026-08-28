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
import { readFileSync, readdirSync } from "node:fs";
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

  it("⭐ **每一個**重新點燃池化資源的地方都要通知碼表（⛔ 掃全樹推導，不是一張名單）", () => {
    // ⚠️ 這一條是**掃出貨原始碼**的（失敗形態⑥的例外：這裡問的正是「有沒有人
    //    在這一行旁邊忘了那一行」，而那不是行為，是**接線的完整性**）。
    //
    // ⭐⭐ 2026-08-28 owner 追問：「應該不只光束砲家族，你根因有修正到**所有特效**
    //    無法多次播放嗎？」—— 而第一版的答案是「不知道」：它是一張**寫死四個檔**
    //    的名單 ⇒ 第五個池出現時**什麼都不會紅**（CLAUDE.md：閘要從出貨的東西
    //    **推導**，⛔ 不是掃一張名單／一個資料夾）。
    // ⇒ 這一版**掃整棵 `apps/client/src`**：任何檔案同時有「池」與「重新點燃」
    //    兩個簽章，就必須有 `noteVfxRefired(` 的**呼叫** —— 否則要在下面的豁免表上
    //    帶一個**能被反駁的理由**。
    //
    // ⚠️ 掃描器的母體有多大（⛔ 不是只有光束砲）：`config.vfx-cleanup@1.vfxHardCapScope`
    //    出貨是 **"scene"** ⇒ 它看**場景裡每一顆**粒子系統，只扣掉 `markVfxPersistent`
    //    與 8 個豁免前綴。所以漏掉一個池 = 那一族的**每一支技能**在連續戰鬥中被砍頭。
    const POOL = /\bpool\b|\bfree\b|freeList|psPool/;
    const REFIRE = /\.start\(\)|manualEmitCount\s*=|setEnabled\(true\)/;

    /** 有池有重燃、⛔ 但**不歸這支掃描器管**的檔 —— 每一列要能被反駁。 */
    const EXEMPT: Record<string, string> = {
      // ── ① 做的是 mesh，而且名字不在 `modelfx-` 前綴 ⇒ mesh 半邊掃不到它 ──
      "render/EntityViewRegistry.ts": "英雄/怪物的 view 池（`champ-*` / `mob-*` 節點）—— 掃描器的 mesh 半邊只認 MODEL_FX_NODE_PREFIX",
      "render/shadows/ShadowLayer.ts": "影子貼片池，⛔ 非 modelfx- 前綴、⛔ 非粒子",
      "render/views/ChampionView.ts": "英雄模型與掛件，⛔ 非 modelfx- 前綴",
      "vfx/GroundDecalPool.ts": "地面貼花 `vfx-decal` 是 CreateGround 的 mesh，⛔ 非 modelfx- 前綴",
      "vfx/WhirlwindFx.ts": "旋風是 CreateCylinder 的 mesh，⛔ 非粒子、⛔ 非 modelfx- 前綴",
      "vfx/ChickenFireworkFx.ts":
        "烤雞煙火是 mesh 工具包（該檔檔頭逐字「WHY THIS IS NOT a ParticleSystem」），名字 `vfx-chicken-firework` ⛔ 非 modelfx- 前綴",
      // ── ② 常駐／別的場景 ⇒ 掃描器一開始就跳過 ──
      "vfx/AmbientVfx.ts":
        "走 particleFactory 且文件是 `ambient` ⇒ `markVfxPersistent` ⇒ 掃描器**永遠不碰**（vfxHardCap 檔頭點名它）",
      "render/intermission/IntermissionScene.ts":
        "`intermission-motes` 在豁免前綴上，而且它是**另一個 Scene**（掃描吃的是比賽場景）",
    };

    const ROOT = join(REPO, "apps/client/src");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(full);
      }
      return out;
    };

    const missing: string[] = [];
    const staleExempt = new Set(Object.keys(EXEMPT));
    let scanned = 0;
    for (const full of walk(ROOT)) {
      const rel = full.slice(ROOT.length + 1);
      const raw = readFileSync(full, "utf8");
      // ⚠️⚠️ **把 import 行與註解剝掉再問**（2026-08-28 的教訓）：第一版寫的是
      //    `src.includes("noteVfxRefired")` —— 而 **import 行就滿足它** ⇒ 把呼叫
      //    整行拿掉，守衛仍然是綠的。判準要問的是「有沒有一個**呼叫**」。
      const src = raw
        .split("\n")
        .filter((l) => !/^\s*(import|\/\/|\*|\/\*)/.test(l))
        .join("\n");
      if (!POOL.test(src) || !REFIRE.test(src)) continue;
      scanned++;
      if (/noteVfxRefired\s*\(/.test(src)) {
        staleExempt.delete(rel); // 已經接了 ⇒ 不需要豁免
        continue;
      }
      if (EXEMPT[rel] !== undefined) {
        staleExempt.delete(rel);
        continue;
      }
      missing.push(rel);
    }

    // GUARD THE GUARD：簽章寫壞了會讓母體變成 0，而那時上面的迴圈一個檔都不查。
    expect(scanned, "⛔ 掃描母體是空的 —— 兩個簽章寫壞了，這條守衛在空轉").toBeGreaterThan(4);
    expect(
      missing,
      "⛔ 這些檔有『池 ＋ 重新點燃』卻沒有通知三秒碼表 ⇒ 那一族在連續戰鬥中會被砍掉正在播的那一發。\n" +
        "  接上 `noteVfxRefired(<被重燃的那個物件>)`，或在 EXEMPT 上補一列**能被反駁的理由**：\n  " +
        missing.join("\n  "),
    ).toEqual([]);
    expect(
      [...staleExempt],
      "⛔ 這些豁免過期了（那個檔已經不符合簽章，或已經自己接上了）—— 刪掉它們",
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
