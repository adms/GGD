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
  // ⭐ 2026-08-28（GH#838 N1）—— 這兩列的 golden **刻意往前動了一格**：
  //    加上 `offsetForwardU: 2.75`（＝原作 150 wc3u ÷54.5）。
  //    出處：`Trig_Turtle_Power_*` 的 `PolarProjectionBJ(GetUnitLoc(caster), 150.00,
  //    GetUnitFacing(caster))`（war3map.j 31903/31905/31924）—— 09-04 的光束/鑽頭/
  //    火柱在**槍口**，⛔ 不在腳下，而 GGD 在那一版之前畫在腳下。
  // ⚠️ 為什麼是**更新 golden** 而不是把這一格排除在比對外（`alpha` 那一格的做法）：
  //    `alpha` 有自己的兩方向對帳守衛（census 有值沒回填⇒紅、回填沒出處⇒紅），
  //    ⛔ 而 `offsetForwardU` 沒有那樣一份母體 —— 把它排除掉，這張表就對**未來
  //    任何一次意外改到它**失明。⇒ golden 跟著**刻意的**改動走，並在這裡留下出處，
  //    意外的改動照樣紅。
  ["godie-o00x.r", "tpl-locust-line", {"kind": "spawnModelFx", "shape": "single", "path": "static", "count": 6, "spacing": 2, "lifeSec": 2, "modelKey": "w3x.stock.flamestrike1", "offsetForwardU": 2.75}],
  ["godie-ogrh.r", "tpl-locust-line", {"kind": "spawnModelFx", "shape": "single", "path": "static", "count": 6, "spacing": 2, "lifeSec": 2, "modelKey": "w3x.stock.flamestrike1", "offsetForwardU": 2.75}],
  ["godie-u010.e", "tpl-locust-travel", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.blackhole", "path": "forward", "speed": 30.0, "distance": 14.0, "spinDegPerSec": 720.0, "scale": 0.6}],
  ["godie-uvng.e", "tpl-locust-travel", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.blackhole", "path": "forward", "speed": 30.0, "distance": 14.0, "spinDegPerSec": 720.0, "scale": 0.6}],
  ["godie-u010.ex", "tpl-locust-swarm", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.blackhole", "path": "radial", "count": 3, "distance": 8.0, "speed": 7.7, "spinDegPerSec": 720.0, "scale": 0.6}],
  ["godie-uvng.ex", "tpl-locust-swarm", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.blackhole", "path": "radial", "count": 3, "distance": 8.0, "speed": 7.7, "spinDegPerSec": 720.0, "scale": 0.6}],
  // ⭐ GH#698 —— o00E「打雷」那一族（`tpl-locust-strike`）。golden 一樣是
  //    `git show HEAD:content/abilities/<id>.json` 撈出來的那幾行，⛔ 不是回推的。
  //    ⚠️ 六個節點收攏之後只剩 `preset` ＋ `modelKey`（＋真的不同的那幾格），
  //    而載入結果與收攏前**逐格相同** —— 那是「等價 retrofit」這句話裡的等價。
  // ⚠️ GH#705（2026-08-25）：20-04 鏡射本體之後,這一側與 godie-e002.r 同形 ——
  //    anchor 從 "point"（舊 w3x 落地打擊版）變 "self"（Avalon 反彈盾罩在施法者身上）。
  //    ⛔ 這是刻意的內容改動,不是 retrofit 漂移;golden 跟著設計走。
  ["godie-e00l.r", "tpl-locust-strike", {"kind": "spawnModelFx", "shape": "single", "path": "static", "anchor": "self", "modelKey": "w3x.stock.monsoonbolttarget", "scale": 6.0, "lifeSec": 2.0, "clip": "idle", "tint": [0.3922, 0.0, 0.0]}],
  ["godie-e00x.r", "tpl-locust-strike", {"kind": "spawnModelFx", "shape": "single", "path": "static", "anchor": "target", "modelKey": "w3x.stock.monsoonbolttarget", "scale": 8.0, "lifeSec": 1.0, "clip": "idle"}],
  ["godie-h020.e", "tpl-locust-strike", {"kind": "spawnModelFx", "shape": "single", "path": "static", "anchor": "point", "modelKey": "w3x.stock.monsoonbolttarget", "scale": 8.0, "lifeSec": 1.0, "clip": "idle"}],
  ["godie-hjai.e", "tpl-locust-strike", {"kind": "spawnModelFx", "shape": "single", "path": "static", "anchor": "point", "modelKey": "w3x.stock.monsoonbolttarget", "scale": 8.0, "lifeSec": 1.0, "clip": "idle"}],
  ["godie-u00l.r", "tpl-locust-strike", {"kind": "spawnModelFx", "shape": "single", "path": "static", "anchor": "target", "modelKey": "w3x.stock.monsoonbolttarget", "scale": 10.0, "lifeSec": 1.0, "clip": "idle", "tint": [1.0, 0.0, 0.0]}],
  ["godie-umal.r", "tpl-locust-strike", {"kind": "spawnModelFx", "shape": "single", "path": "static", "anchor": "self", "modelKey": "w3x.stock.monsoonbolttarget", "scale": 10.0, "lifeSec": 1.0, "clip": "idle", "tint": [1.0, 0.0, 0.0]}],
  // ⭐ 這兩支的 golden **不是**「改動前的自己」（它們改動前是 `effects: []`）——
  //    它是 `git show 874c4e1e^:` 撈出來的那一份、以及**變身對子另一邊**的酬載。
  //    ⇒ #698 之前它們的節點被 `mergeExpansion()` 洗掉,所以先被**刪除**（874c4e1e）;
  //    現在保留機制在了,它們回來,而且必須逐格等於當初被刪掉的那一份。
  ["godie-udea.ex", "tpl-locust-strike", {"kind": "spawnModelFx", "shape": "single", "path": "static", "anchor": "self", "modelKey": "w3x.stock.monsoonbolttarget", "scale": 6.0, "lifeSec": 2.0, "clip": "idle", "tint": [0.3922, 0.0, 0.0]}],
  ["godie-udre.r", "tpl-locust-orb", {"kind": "spawnModelFx", "shape": "single", "modelKey": "imported.heromusashimiyamoto", "path": "orbit", "count": 1, "distance": 0.1, "speed": 1.0, "lifeSec": 2.5, "soundKey": "wc3.blademasterwhirlwind", "arriveSoundKey": "wc3.orcdissipate1"}],
];

const LOCUST_IDS = [
  "tpl-locust-orb",
  "tpl-locust-line",
  "tpl-locust-travel",
  "tpl-locust-swarm",
  // ⭐ GH#698 —— 第五族。⚠️ 它與 `tpl-locust-orb` 是**同一個 census 群
  //    （static-single 165 隻）的兩種編碼**：orb 的 `orbit + 環半徑 0.1` 是為了
  //    六支既有節點的逐位元等價留下的 legacy 形狀。完整推導（含「為什麼不是在
  //    orb 加一格 anchor」的實測欄位數）在 `expand.ts` 的第 25 條註解。
  "tpl-locust-strike",
];

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

  it("① 家族數 ≤6，全族 enabled 而且展開得出來（編輯器挑得到）", () => {
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

  it("② 既有節點改成引用模板之後，載入結果與改動前逐格相同", () => {
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
        // ⭐ GH#690 追加 `alpha`：它**不是演出幾何**，而且 golden 刻意保持
        //    `git show HEAD:` 的逐字原文（那是「逐位元等價」這句話的出處）——
        //    把 census 回填的透明度補進 golden 就會讓這張表變成一份「我照著回推的」
        //    副本。⇒ 這一格由它自己的兩方向對帳守衛管
        //    （`content/runtimeAlphaBackfill.test.ts`：census 有值沒回填 ⇒ 紅、
        //     回填的值沒有 census 出處 ⇒ 紅），⛔ 不是這裡放它一馬。
        if (k !== "preset" && k !== "onTouch" && k !== "onArrive" && k !== "alpha") got[k] = v;
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
