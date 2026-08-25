/**
 * ⭐【蝗蟲群／球體特效模板化】GH#693 的守衛。
 *
 * owner 2026-08-25（逐字）：
 * > 「[重要]記得**所有這些球體、蝗蟲群特效 都要變成模板，可以被編輯器複用、
 * >  成為JSON設定模板標籤**」
 *
 * 三條，各自對應票上的一條驗收：
 *  ① **模板數 ≤6**，而且四個家族**展開得出來**（編輯器新建一張卡挑得到 ⇒ 預設值
 *     必須展開成一支能跑的技能；`paramsSchema.test` 那一支已經逐格驗過預設值，
 *     這裡只釘「這四個 id 真的在出貨樹上而且是 enabled」）。
 *  ② **≥3 支既有技能改成引用模板之後逐位元等價** —— 拿**改動前**的節點原文當
 *     golden，餵**出貨的** `resolveModelFxPreset` 逐格比對。
 *     ⚠️ 這不是「看起來一樣」：golden 是 `git show HEAD:` 撈出來的那幾行 JSON。
 *     ⛔ 比對刻意不含 JSON 的**鍵順序** —— 沒有任何消費端讀它（Zod 依名取值），
 *     而 `fillOne` 是把缺的格 append 上去的，順序必然不同。
 *  ③ **顏色與透明度真的到達展開結果**（票上的突變驗收：把 tint 從展開器拿掉
 *     ⇒ 展開結果失色 ⇒ 紅）。
 *
 * ── 突變紀錄（一批一條，挑最承重的線）───────────────────────────────────────
 *  · `expand.ts` 的 `modelFxFamily` 拿掉
 *    `...(has(t, p, "tint") ? { tint: rgb(t, p, "tint") } : {})`
 *    → ③ 紅：「tpl-locust-orb：顏色沒有到達展開結果」（四族各一次）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { resolveModelFxPreset } from "../modelFxPreset";
import { defaultParamsFor } from "./paramsSchema";
import { expand, isExpandable } from "./expand";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

function templates(): TemplateDoc[] {
  const dir = join(CONTENT, "ability-templates");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
}

/**
 * ⭐ **改動前**的那幾行 JSON（`git show HEAD:content/abilities/<id>.json`）——
 * 這是「逐位元等價」那句話裡的**位元**。⛔ 不是我照著模板預設回推的。
 * 子效果陣列（`onTouch`/`onArrive`）⛔ 不在裡面：`resolveModelFxPreset` 只填**這一層**
 * 的純量格，那兩串它一個位元組都不碰。
 */
const RETROFIT: ReadonlyArray<readonly [string, string, Record<string, unknown>]> = [
  ["godie-e00x.q", "tpl-locust-orb", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.earthtornado2", "path": "orbit", "count": 1, "distance": 0.1, "speed": 1.0, "lifeSec": 2.5, "soundKey": "wc3.blademasterwhirlwind"}],
  ["godie-etyr.q", "tpl-locust-orb", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.oblivionaura", "path": "orbit", "count": 2, "distance": 1.0, "speed": 1.0, "lifeSec": 2.5, "soundKey": "wc3.blademasterwhirlwind"}],
  ["godie-h01o.e", "tpl-locust-orb", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.deathwave", "path": "orbit", "count": 1, "distance": 0.1, "speed": 1.0, "lifeSec": 2.5, "soundKey": "wc3.crushingwavecaster1"}],
  ["godie-u01u.r", "tpl-locust-orb", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.heromusashimiyamoto", "path": "orbit", "count": 1, "distance": 0.1, "speed": 1.0, "lifeSec": 2.5, "soundKey": "wc3.blademasterwhirlwind", "arriveSoundKey": "wc3.orcdissipate1"}],
  ["godie-o00x.r", "tpl-locust-line", {"kind": "spawnModelFx", "shape": "single", "path": "static", "count": 6, "spacing": 2, "lifeSec": 2, "modelKey": "w3x.stock.flamestrike1"}],
  ["godie-ogrh.r", "tpl-locust-line", {"kind": "spawnModelFx", "shape": "single", "path": "static", "count": 6, "spacing": 2, "lifeSec": 2, "modelKey": "w3x.stock.flamestrike1"}],
  ["godie-u010.e", "tpl-locust-travel", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.blackhole", "path": "forward", "speed": 30.0, "distance": 14.0, "spinDegPerSec": 720.0, "scale": 0.6}],
  ["godie-uvng.e", "tpl-locust-travel", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.blackhole", "path": "forward", "speed": 30.0, "distance": 14.0, "spinDegPerSec": 720.0, "scale": 0.6}],
  ["godie-u010.ex", "tpl-locust-swarm", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.blackhole", "path": "radial", "count": 3, "distance": 8.0, "speed": 7.7, "spinDegPerSec": 720.0, "scale": 0.6}],
  ["godie-uvng.ex", "tpl-locust-swarm", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.blackhole", "path": "radial", "count": 3, "distance": 8.0, "speed": 7.7, "spinDegPerSec": 720.0, "scale": 0.6}],
];

const LOCUST_IDS = ["tpl-locust-orb", "tpl-locust-line", "tpl-locust-travel", "tpl-locust-swarm"];

/** 深度優先撈出一份文件裡每一個 `spawnModelFx` 節點。 */
function modelFxNodes(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((v) => modelFxNodes(v, out));
  else if (node !== null && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (rec["kind"] === "spawnModelFx") out.push(rec);
    Object.values(rec).forEach((v) => modelFxNodes(v, out));
  }
  return out;
}

describe("蝗蟲群／球體特效模板（GH#693）", () => {
  const all = templates();
  const locust = all.filter((t) => t.id.startsWith("tpl-locust-"));

  it("① 家族數 ≤6，四族全部 enabled 而且展開得出來（編輯器挑得到）", () => {
    expect(
      locust.map((t) => t.id).sort(),
      "出貨的 tpl-locust-* 與 expand.ts 的家族鍵對不上",
    ).toEqual([...LOCUST_IDS].sort());
    // ⭐ 票上的硬上限：「一支技能一個模板＝沒有模板」。
    expect(locust.length, "locust 模板超過 6 個 —— 先合併，⛔ 不是再開一份").toBeLessThanOrEqual(6);
    for (const t of locust) {
      expect(t.status, `${t.id} 不是 enabled ⇒ 編輯器挑不到`).toBe("enabled");
      expect(isExpandable(t.family), `${t.id} 的家族 ${t.family} 沒有展開路徑`).toBe(true);
    }
  });

  it("② 十個既有節點改成引用模板之後，載入結果與改動前逐格相同", () => {
    const byId = new Map(all.map((t) => [t.id, t]));
    for (const [abilityId, preset, before] of RETROFIT) {
      const doc = JSON.parse(
        readFileSync(join(CONTENT, "abilities", `${abilityId}.json`), "utf8"),
      ) as Record<string, unknown>;
      const filled = resolveModelFxPreset(doc, byId);
      const node = modelFxNodes(filled).find((n) => n["preset"] === preset);
      expect(node, `${abilityId} 沒有引用 ${preset} —— retrofit 掉了`).toBeDefined();
      const got: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node!)) {
        if (k !== "preset" && k !== "onTouch" && k !== "onArrive") got[k] = v;
      }
      expect(got, `${abilityId} 引用 ${preset} 之後演出幾何變了 —— ⛔ 這不是等價的 retrofit`)
        .toEqual(before);
    }
  });

  it("③ 顏色與透明度真的到達展開結果，而且純演出模板⛔ 不長出傷害", () => {
    for (const t of locust) {
      const p = { ...defaultParamsFor(t), tint: [0.2, 0.4, 0.6], alpha: 0.5 };
      const fx = expand(t, p).effects[0] as unknown as Record<string, unknown>;
      expect(fx["tint"], `${t.id}：顏色沒有到達展開結果 —— 一格只有表單看得到的 tint`)
        .toEqual([0.2, 0.4, 0.6]);
      expect(fx["alpha"], `${t.id}：透明度沒有到達展開結果`).toBe(0.5);
      expect(
        fx["onTouch"],
        `${t.id} 自動長出了傷害 —— 純演出模板⛔ 不可以替引用它的技能加一份沒有人裁決過的傷害`,
      ).toBeUndefined();
    }
  });
});
