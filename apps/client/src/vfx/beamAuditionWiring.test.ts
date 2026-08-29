/**
 * 🔬 GH#715 **第五道縫** —— 施法不會被 `step()` 的清空吃掉。
 *
 * ⚠️ 票的 Scope 列的是**五**道縫（`setAbilityVfxBindings` ⊕ `setFamilyTuning` ⊕
 * `setAbilityArtBindings` ⊕ ctx 帶 `vfxDoc` ⊕ **這一道**），而交付的守衛只有**四**道
 * （前四道在 `auditionCalibrates.test.ts`）—— ⭐ 漏掉的正好是**承重**那一道：
 * 前四道全部補齊時，這一道破掉仍然讓整頁**每一個讀數都是 0**，⛔ 而沒有東西會紅。
 *
 * ⭐ 這一支**跑真的那一段**（`pumpTicks` 是出貨的那一支），⛔ 不是掃字串 ——
 * 失敗形態⑥逐字是「用掃原始碼字串代替行為」。
 * ⚠️ 第五道縫的**另一半**（`castOnce()` 把施法遞延到 tick **內**）住在
 * `beamAuditionWorld.ts`，它要真的內容載入才建得起來 ⇒ 那一半只能掃字串，
 * ⛔ 而這裡把它說清楚，不假裝兩半一樣強。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { pumpTicks } from "./beamAudition";

/** 一份照 `SimWorld` 行為的假世界：`step()` 的**第一行**就清空 `events`。 */
function fakeWorld(): { step: () => void; events: string[] } {
  const events: string[] = [];
  let tick = 0;
  return {
    events,
    step: (): void => {
      events.length = 0; // ⭐ `SimWorld.step()` 的第一行，逐字
      tick++;
      if (tick === 1) events.push("abilityCast"); // castOnce 把施法遞延進第一個 tick 內
      // ⭐ 任意一個**中間**的 tick 就足以證明這件事（出貨的 cast resolve ≈37，
      //    ⛔ 但這條斷言不依賴那個數字 —— 它是別人的住處，這裡只要「不是最後一個」）。
      if (tick === 37) events.push("modelFxSpawn");
    },
  };
}

describe("GH#715 第五道縫：一次 step(n) 裡**每一 tick** 的事件都要到得了消費端", () => {
  it("跑真的 pumpTicks ⇒ 第 1 與第 37 tick 的事件都收得到", () => {
    const w = fakeWorld();
    const seen: string[] = [];
    let settled = 0;
    const got = pumpTicks(40, {
      step: w.step,
      drain: () => {
        seen.push(...w.events);
        return w.events.filter((e) => e === "modelFxSpawn").length;
      },
      settle: () => {
        settled++;
      },
    });
    // ⛔ 把 drain 移到迴圈外 ⇒ 只讀得到第 40 tick（空的）⇒ seen 是 []、got 是 0，
    //    而那個 0 在頁面上長得就像「這支技能沒有視覺」。
    expect(seen, "中間 tick 的事件被下一個 step() 清掉了 ⇒ 整頁讀數會全是 0").toEqual([
      "abilityCast",
      "modelFxSpawn",
    ]);
    expect(got, "modelFxSpawn 的計數也一起消失").toBe(1);
    expect(settled, "vfx.update 要**每 tick** 跑一次，⛔ 不是整段跑完一次").toBe(40);
  });

  it("另一半：`castOnce()` 把施法遞延到 `world.step()` **內**（⛔ 不是兩個 step 之間）", () => {
    const src = stripComments(
      readFileSync(fileURLToPath(new URL("./beamAuditionWorld.ts", import.meta.url)), "utf8"),
    );
    const at = src.indexOf("castOnce(): void {");
    expect(at, "beamAuditionWorld 沒有 castOnce").toBeGreaterThan(0);
    const body = src.slice(at, at + 600);
    expect(body, "castOnce 沒有包住 w.step ⇒ abilityCast 在任何人讀到它之前就被清掉").toContain(
      ".step = ",
    );
    const runAt = body.indexOf("runCast()");
    const origAt = body.indexOf("orig(intents)");
    expect(origAt, "包住之後沒有把原本那一 tick 跑完").toBeGreaterThan(0);
    expect(
      runAt,
      "施法要在 orig(intents) **之後** —— 在它之前的話，那個 step 會把 abilityCast 清掉",
    ).toBeGreaterThan(origAt);
  });
});
