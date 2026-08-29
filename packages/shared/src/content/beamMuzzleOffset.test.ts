/**
 * 🔫【光束砲的**槍口偏移**】—— `offsetForwardU` 逐支對得上 JASS（GH#721）。
 *
 * GH#838 N1 做出了 `offsetForwardU` 這個標籤，**只填了 09-04 龜派氣功** ——
 * 而 `Trig_Turtle_Power`(j:31898)、`Trig_Excalibur`(j:32315)、`Trig_SunFire`(j:26786)
 * 是**逐行同型**的三支觸發器：同一句 `PolarProjectionBJ(caster, **150.00**, angle)`，
 * 光束與爆殼**兩具都**生在那個點上。⇒ 2026-08-30 量到 20-03 ×4 與 90-04 ×2 個節點
 * 的光束畫在**施法者腳下**（`modelFxPlacement.ts` 的 `e.offsetForwardU ?? 0`）。
 * ⭐ 正是規矩 4：「逐支覆寫只證明了那一支，而預設仍在服務其他每一支」——
 *   這一次那個「預設」是**缺席 ⇒ 0**。
 *
 * ⚠️ 它**進不了家族預設**（⛔ 不是懶）：`offsetForwardU` 不在 `tpl-beam-roll.params`
 * 也不在 `modelFxPreset.ts` 的 `PRESET_FIELDS`，⭐ 而且家族母體本來就不一致 ——
 * 59-04 `Trig_ElecPower`(j:47757) 是 `GetUnitLoc(caster)` ⇒ **真的是 0**。
 * ⇒ 逐支是對的住處，而「不漏掉任何一支」要靠這一條閘，⛔ 不是靠記得。
 *
 * 三條（🟢 假綠燈⑫：只從一頭走的掃描結構上失明）：
 *  ① 表→樹：每一個節點等於它自己那一行 JASS 的量值。
 *  ② 樹→表：出貨樹上每一個 tpl-beam-roll 節點都要在表上 —— ⭐ 新加一支光束砲
 *     而沒有量過生成點 ⇒ 紅（那正是 20-03 這次被漏掉的路）。
 *  ③ 行為（⛔ 不是屬性）：餵進**出貨的**擺位核心，斷言 origin 沿面向前移。
 *
 * ── 突變紀錄 ──────────────────────────────────────────────────────────────
 *  · `modelFxPlacement.ts:127` 的
 *    `offsetAlongFacing(frame.origin, frame.facing, e.offsetForwardU ?? 0)`
 *    改成 `frame.origin`（＝這一格沒有人讀）→ ③ 紅，逐支指名 10 個節點
 *    （「godie-e002.e#0：origin 沒有沿面向前移 —— 期望 2.75，量到 0」）。
 *    ⚠️ 那一行**真的**在夾具下被執行到：①② 只讀 JSON，只有 ③ 呼叫它。
 */
import { describe, it, expect } from "vitest";
import { shippedDocs } from "./__fixtures__/shippedContent";
import { resolveModelFxPreset } from "./modelFxPreset";
import { zTemplateDoc, type TemplateDoc } from "./schema/template";
import { modelFxInstancesFromFrame } from "../sim/effects/modelFxPlacement";

/** 150 wc3u × `GGD_PER_WC3`(11/600, templates/expand.ts) = 2.75。 */
const M = 2.75;

/** 逐支的量值＋出處。⛔ 沒有一格是回推的：都是那支自己的光束 dummy 吃的那個 loc。 */
const JASS: Record<string, { u: number; why: string }> = {
  "godie-e002.e": { u: M, why: "20-03 A0D5 Trig_Excalibur j:32315 PolarProjection(caster,150) → j:32324/32327 兩具都在 LocPoint3" },
  "godie-e00l.e": { u: M, why: "同上（20-03 變身態雙胞胎；編號是 join key）" },
  "godie-ogrh.r": { u: M, why: "09-04 A03S Trig_Turtle_Power j:31898 → j:31907/31909 兩具都在 LocPoint3" },
  "godie-o00x.r": { u: M, why: "同上（09-04 變身態）" },
  "godie-hgam.r": { u: M, why: "90-04 A0R4 Trig_SunFire j:26786 → j:26790 在 LocPoint3" },
  "godie-h02r.r": { u: M, why: "同上（90-04 變身態）" },
  "godie-e00r.r": { u: 0, why: "59-04 A0GI Trig_ElecPower j:47757 CreateNUnitsAtLoc(1,'h01P',…,**GetUnitLoc(caster)**,…) ⇒ 原作就在腳下，0 是量到的" },
  "godie-nbbc.e": { u: 0, why: "08-03 A05J j:28838 是 PolarProjection(caster,**150×i**) i=1..10 ⇒ 偏移與 spacing 綁在一起，而 GGD 的 spacing 是刻意縮小的 1.2 ⇒ 要與 spacing 一起裁決，⛔ 不是單獨補 2.75" },
  "godie-n01c.e": { u: 0, why: "同上（08-03 變身態）" },
};

type Node = Record<string, unknown>;

/** 出貨樹上每一個 `preset:"tpl-beam-roll"` 節點（已補完模板預設）。 */
function beamNodes(): Array<{ id: string; i: number; node: Node }> {
  const tpl = new Map<string, TemplateDoc>();
  for (const d of shippedDocs("ability-templates")) tpl.set(String(d["id"]), zTemplateDoc.parse(d));
  const out: Array<{ id: string; i: number; node: Node }> = [];
  for (const raw of shippedDocs("abilities")) {
    const doc = resolveModelFxPreset(raw, tpl) as Node;
    let i = 0;
    for (const e of (doc["effects"] ?? []) as Node[]) {
      if (e["kind"] === "spawnModelFx" && e["preset"] === "tpl-beam-roll") {
        out.push({ id: String(doc["id"]), i: i++, node: e });
      }
    }
  }
  return out;
}

describe("光束砲的槍口偏移：JASS 的 PolarProjection 逐支翻成 offsetForwardU（GH#721）", () => {
  const nodes = beamNodes();

  it("① 表→樹：每一個節點都等於它自己那一行 JASS 的量值", () => {
    expect(nodes.length, "出貨樹上零個 tpl-beam-roll 節點 —— 這條閘是空的").toBeGreaterThan(0);
    const bad = nodes.flatMap(({ id, i, node }) => {
      const want = JASS[id];
      if (want === undefined) return []; // ② 負責喊
      const got = (node["offsetForwardU"] as number | undefined) ?? 0;
      return got === want.u ? [] : [`${id}#${i}：期望 ${want.u}（${want.why}），出貨是 ${got}`];
    });
    expect(bad, `槍口偏移與 JASS 對不上 —— 光束畫在錯的地方:\n${bad.join("\n")}`).toEqual([]);
  });

  it("② 樹→表：新加的光束砲一定要先量過生成點，⛔ 不可以靜默吃 0", () => {
    const unmeasured = [...new Set(nodes.map((n) => n.id))].filter((id) => JASS[id] === undefined);
    expect(
      unmeasured,
      `這幾支引用 tpl-beam-roll 卻沒有量過生成點 ⇒ 正在吃「缺席 ⇒ 0」這個沒有出處的預設。` +
        `讀那支的觸發器，把 CreateNUnitsAtLoc 吃的 loc 補進本檔:\n${unmeasured.join("\n")}`,
    ).toEqual([]);
    const gone = Object.keys(JASS).filter((id) => !nodes.some((n) => n.id === id));
    expect(gone, `表上這幾支已不在出貨樹上:\n${gone.join("\n")}`).toEqual([]);
  });

  it("③ 行為：出貨的擺位核心真的把整組實例沿面向推出去", () => {
    const frame = { origin: { x: 0, z: 0 }, facing: { x: 1, z: 0 }, targetPos: { x: 9, z: 0 } };
    const bad = nodes.flatMap(({ id, i, node }) => {
      const want = JASS[id]?.u ?? 0;
      const first = modelFxInstancesFromFrame(node, frame)[0];
      if (first === undefined) return [`${id}#${i}：擺位核心一具都沒生出來`];
      return Math.abs(first.origin.x - want) > 1e-6 || Math.abs(first.origin.z) > 1e-6
        ? [`${id}#${i}：origin 沒有沿面向前移 —— 期望 ${want}，量到 ${first.origin.x}`]
        : [];
    });
    expect(bad, `槍口偏移沒有到達出貨的擺位鏈:\n${bad.join("\n")}`).toEqual([]);
  });
});
