import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **同一顆特效同時住在 `ability@1` 與 `vfx-script@1` ⇒ 每一次觸發生兩發。**
 *
 * ⭐ 2026-08-30 量到（GH#809 的複驗抓到的）：
 *   `godie-hart.r` 的 ThunderClapCaster 每一刀生 **兩發** ——
 *   · `content/abilities/godie-hart.r.json` 的 `spawnVfx{at:"bone", boneOn:"victim"}`（受擊者胸口）
 *   · `content/vfx-scripts/godie-hart.r.json` 的 `vfx{on:"strike", at:"target"}`（受擊者腳下）
 *   ⭐ 兩層是**加成**的：sim 送一發（`spawnVfx`），客戶端腳本再播一發（`VfxScriptPlayer.ts:191`）。
 *
 * ⚠️ ⭐ 而它在 headless 測試裡**與正常長得一模一樣** —— 兩邊的事件都送出去了、
 *   兩邊的守衛都綠、`content:build` 綠。⛔ 只有真的在畫面上看才分得出來。
 *
 * ⇒ ⭐ 這條閘問的是**兩個名詞的關係**（⛔ 不是「這一份對不對」）：
 *   「**同一支技能的兩個作者面，有沒有在講同一顆 vfx？**」
 *
 * ⚠️ ⭐ 兩個面**各自都是對的設計**：
 *   `ability@1` 是 sim 的權威（傷害時序綁著它）· `vfx-script@1` 是 #838 特效工坊的作者面。
 *   ⛔ **錯的是它們的組合** —— 而沒有任何一邊看得到另一邊。
 */

const REPO = join(import.meta.dirname, "../../../..");
const AB = join(REPO, "content/abilities");
const VS = join(REPO, "content/vfx-scripts");

/** 一份文件裡出現的每一個 vfxId（⛔ 不管它藏多深）。 */
const vfxIds = (doc: unknown): Set<string> => {
  const out = new Set<string>();
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k === "vfxId" && typeof v === "string") out.add(v);
      else walk(v);
    }
  };
  walk(doc);
  return out;
};

/** ⭐ 棘輪：⛔ 只能變短。每一格要寫得出**為什麼兩邊都該有**。 */
const BOTH_ON_PURPOSE: Record<string, string> = {};

describe("同一顆 vfx 不可以同時住在 ability 與 vfx-script（GH#809 複驗）", () => {
  it("⭐ 量尺先自證：兩個目錄都讀得到，且抽得出 vfxId", () => {
    expect(existsSync(VS), "content/vfx-scripts/ 不見了 —— 路徑過期").toBe(true);
    const scripts = readdirSync(VS).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    expect(scripts.length, "一份 vfx-script 都沒讀到 ⇒ 這條閘在空轉").toBeGreaterThan(0);

    // ⭐ 反方向：一份沒有 vfxId 的文件⛔不可以被抽出東西
    expect(vfxIds({ kind: "damage", amount: { flat: 1 } }).size).toBe(0);
    // ⭐ 正方向：藏在三層底下的也要抽得到
    expect(vfxIds({ a: [{ b: { vfxId: "x" } }] }).has("x")).toBe(true);
  });

  it("★ 每一支有腳本的技能，兩個作者面不可以指到同一顆 vfx", () => {
    const dup: string[] = [];
    for (const f of readdirSync(VS)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const script = JSON.parse(readFileSync(join(VS, f), "utf8")) as { abilityId?: string };
      const aid = script.abilityId;
      if (aid === undefined) continue;
      const abFile = join(AB, `${aid}.json`);
      if (!existsSync(abFile)) continue;

      const inScript = vfxIds(script);
      const inAbility = vfxIds(JSON.parse(readFileSync(abFile, "utf8")));
      for (const id of inScript) {
        if (!inAbility.has(id)) continue;
        const key = `${aid}::${id}`;
        if (key in BOTH_ON_PURPOSE) continue;
        dup.push(`${aid}  ${id}\n      · ability:    content/abilities/${aid}.json\n      · vfx-script: content/vfx-scripts/${f}`);
      }
    }

    expect(
      dup,
      [
        "⛔⛔ 同一顆 vfx 同時住在**兩個作者面** ⇒ 每一次觸發**生兩發**：",
        ...dup.map((d) => `   ${d}`),
        "",
        "⚠️ ⭐ 兩層是**加成**的：sim 送一發（`spawnVfx`），客戶端腳本再播一發",
        "   （`apps/client/src/vfx/VfxScriptPlayer.ts:191` 對 `on:\"strike\"` 有處理）。",
        "   ⛔ 而它在 headless 測試裡**與正常長得一模一樣**。",
        "",
        "⭐ 修法：**留一份**。",
        "   · 傷害時序綁著它 ⇒ 留 `ability@1`（sim 的權威），刪腳本那一段",
        "   · 純演出、與傷害無關 ⇒ 留 `vfx-script@1`，刪 ability 那一格",
        "   ⛔ **不要兩邊都留然後把其中一邊調暗** —— 那是兩個住處，下一輪會漂。",
        "",
        "⭐ 真的兩邊都該有（例：同一顆 vfx 在不同時點各出現一次）",
        "   ⇒ 進 BOTH_ON_PURPOSE 並寫一個**能被反駁的**理由。",
      ].join("\n"),
    ).toEqual([]);
  });
});
