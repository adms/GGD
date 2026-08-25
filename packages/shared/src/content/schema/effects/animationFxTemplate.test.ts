/**
 * ⭐【動畫特效三支】的檢查閘 —— owner 2026-08-22 逐字：
 *
 * > 「**Saber約束勝利之劍(翻滾光束), 依文世界終結(圓周噴發大冰塊),
 * >  莉娜龍破斬(一直線火球衝擊波後目的地火焰大爆炸) 都是動畫特效**，
 * >  產出技能與特效模板還有**檢查script**，別忘了還有**特效文字**」
 *
 * 它問三件**隔壁那支問不到**的事（`modelFxPreset.test.ts` 問的是「表有沒有被
 * 讀」，這一支問「讀進來的東西對不對」）：
 *
 * | # | 問什麼 | 壞掉的樣子 |
 * |---|---|---|
 * | ① | ⛔ **同一個數字有沒有第二個住處** | 節點把模板已經有的 `speed: 27.5` 再抄一份 ⇒ 改表那天這一支不動，而**沒有東西會紅**（第〇·四守則） |
 * | ② | 補完之後**參數在不在界內、缺不缺格** | `path` 沒補到 ⇒ 一具走 0 格的模型：技能放得出來、傷害照打、畫面上什麼都沒有（失敗形態②） |
 * | ③ | **特效文字**唸得完嗎 | 詠唱字幕的最後一句排在 `castTimeSec` **之後** ⇒ 技能已經炸了字才冒出來，而卡面、schema、`content:build` 全綠 |
 *
 * ⭐ 斷言**一個數字都不抄**（第二守則「驗機制不驗數字」）：界線逐格讀出貨的
 * `content/ability-templates/tpl-*.json` 的 `params[*].min/max`，預設值讀
 * `params[*].default`。owner 調表上任何一格，這一支**不會**紅。
 *
 * 突變紀錄（整批唯一的一條，挑最承重的線）：
 *   · `content/abilities/godie-h020.e.json` 的 spawnModelFx 節點加回
 *     `"speed": 27.5` → ①紅，訊息指名 `godie-h020.e` 的 `speed` 與
 *     `tpl-line-blast`。（那正是這一批要消滅的形狀。）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveModelFxPreset } from "../../modelFxPreset";
import type { TemplateDoc } from "../template";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../../content");
const load = (coll: string): Array<Record<string, unknown>> =>
  readdirSync(join(CONTENT, coll))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(CONTENT, coll, f), "utf-8")) as Record<string, unknown>);

const TEMPLATES = new Map<string, TemplateDoc>(
  (load("ability-templates") as unknown as TemplateDoc[]).map((t) => [t.id, t]),
);

/** 模板補得到的每一格演出幾何（與 `content/modelFxPreset.ts` 同一份名單）。 */
const GEOMETRY = [
  "modelKey", "path", "speed", "distance", "count", "spinDegPerSec", "scale",
  "touchRadius", "touchSide",
] as const;

/**
 * ⚠️ ①號檢查（⛔ 沒有第二個住處）唯一的豁免，而它**帶著一個能被反駁的理由**
 * （CLAUDE.md 第〇·四守則：「例外要帶理由⋯一個能被反駁的理由，⛔ 不是『還沒收』」）。
 *
 * `path` 是這一族**唯一**一格「共用的是它看起來是什麼、逐支的是它往哪裡去」的
 * 參數 —— `content/modelFxPreset.ts` 的檔頭逐字寫著同一句，而出貨的反例就在
 * 表上：59-04 陽電子砲的原作是「面向**目標點**」（`toTarget`），其餘三支經典是
 * 「沿**面向**直線」（`forward`）。⇒ 逐支寫出 `path` 是**宣告意圖**，⛔ 不是抄一份
 * 算得出來的值：模板改掉預設的那天，這六支要維持原樣才是對的。
 *
 * ⭐ 反駁它的方法：哪天這一族每一支的 `path` 都等於模板預設（＝再也沒有人覆寫
 * 它），這一格就該從豁免表拿掉，而拿掉之後這條守衛會立刻指名那六支。
 *
 * ⭐ **第二格豁免：`modelKey`（GH#693）**，理由是「它根本不是幾何」——
 * `modelFxStagingContract.test.ts` ⑤ 的原話逐字：「`modelKey` 是**身分**不是幾何：
 * 它有預設值是為了讓稀疏文件載得起來，⛔ 不是為了讓四支不同英雄的招式長成同一具
 * 模型」。而**同一份檔案的 ④ 第二條斷言反過來要求**：兩支以上共用同一張模板時，
 * 每一支都要寫出自己的 `modelKey`（否則就是「把兩支技能收斂成同一具模型」）。
 * ⇒ 兩條規矩對同一格說相反的話，而身分那一條贏：一格「碰巧等於模板 exemplar 的」
 * `modelKey` ⛔ 不是抄了一個算得出來的值，它是「這一支就是要用這具模型」。
 * （量到的：`tpl-locust-line` 的兩支採用者都是 `w3x.stock.flamestrike1` ——
 *  那是原作 h006 的模型，⛔ 不是模板挑的。）
 * ⭐ 反駁它的方法：哪天 `modelKey` 真的變成模板擁有的幾何（＝技能不再宣告自己的
 * 模型），這一格就該從豁免表拿掉，而 ④ 那條會立刻接手指名。
 */
const DUP_EXEMPT = new Set<string>(["path", "modelKey"]);

type Node = Record<string, unknown>;
/** 一份文件裡的每一個 `spawnModelFx`（任意深度：onTouch / onArrive / delayed / hooks）。 */
function collect(n: unknown, kind: string, out: Node[] = [], depth = 0): Node[] {
  if (Array.isArray(n)) for (const x of n) collect(x, kind, out, depth);
  else if (n !== null && typeof n === "object") {
    const r = n as Node;
    if (r["kind"] === kind) out.push(r);
    for (const v of Object.values(r)) collect(v, kind, out, depth + 1);
  }
  return out;
}
/** 每一段 `floatingText` 與它累積的延遲（`delayed` 會疊）。 */
function chant(n: unknown, at = 0, out: Array<[number, Node]> = []): Array<[number, Node]> {
  if (Array.isArray(n)) for (const x of n) chant(x, at, out);
  else if (n !== null && typeof n === "object") {
    const r = n as Node;
    if (r["kind"] === "floatingText") out.push([at, r]);
    const next = r["kind"] === "delayed" ? at + Number(r["delaySec"] ?? 0) : at;
    for (const [k, v] of Object.entries(r)) if (k !== "kind") chant(v, next, out);
  }
  return out;
}

/** 出貨的每一份技能（standalone 與英雄內嵌的抄本都算）。 */
const DOCS: Array<{ id: string; doc: Node }> = [
  ...load("abilities").map((d) => ({ id: String(d["id"]), doc: d })),
  ...load("champions").flatMap((c) =>
    Object.values((c["abilities"] ?? {}) as Record<string, Node>).map((a) => ({
      id: `${String(c["id"])}(內嵌).${String(a["slot"] ?? "?")}`,
      doc: a,
    })),
  ),
];
const USERS = DOCS.filter(({ doc }) =>
  collect(doc, "spawnModelFx").some((m) => typeof m["preset"] === "string"),
);

describe("動畫特效模板 —— 引用它的每一支技能", () => {
  it("找得到出貨的模板與引用它們的技能（空集合放行 = 這條守衛等於沒開）", () => {
    expect(TEMPLATES.size).toBeGreaterThan(0);
    expect(USERS.length).toBeGreaterThan(0);
  });

  it("⛔ 不把模板已經有的那一格再抄一份（第〇·四：同一個數字沒有第二個住處）", () => {
    const dup: string[] = [];
    for (const { id, doc } of USERS)
      for (const m of collect(doc, "spawnModelFx")) {
        const t = TEMPLATES.get(String(m["preset"] ?? ""));
        if (t === undefined) continue;
        for (const k of GEOMETRY)
          if (
            !DUP_EXEMPT.has(k) &&
            m[k] !== undefined &&
            JSON.stringify(m[k]) === JSON.stringify(t.params[k]?.default)
          )
            dup.push(`${id}.${k} = ${JSON.stringify(m[k])}（${t.id} 已經有這一格）`);
      }
    expect(dup.join("\n"), `⛔ 這些格子是模板的第二個住處 —— 改表那天它們不會動:\n${dup.join("\n")}`)
      .toBe("");
  });

  it("補完之後每一格都在、而且在模板宣告的界內（缺一格 = 一具走 0 格的隱形模型）", () => {
    const bad: string[] = [];
    for (const { id, doc } of USERS)
      for (const m of collect(resolveModelFxPreset(doc, TEMPLATES), "spawnModelFx")) {
        // ⭐ 2026-08-25：**同一份文件可以同時有「用模板的」與「自己寫全的」節點**
        //    （悟空 09-04：主體走 tpl-beam-roll,火柱是手寫 static 節點）。
        //    沒有 preset 的節點由 `zSpawnModelFx` 的 refine 守著（它必須自帶
        //    modelKey/path/身分欄,缺了載入就被拒）⇒ 這一條只管**引用了模板**的那些。
        //    ⛔ 在此之前它假設「文件裡有一個 preset ⇒ 每一個節點都有 preset」,
        //    而那個假設 2026-08-25 被真的內容推翻了。
        //    ⚠️ 那個火柱節點該不該也變成模板 = GH#693（owner:「所有這些球體、蝗蟲群
        //    特效都要變成模板」）—— 到時它就會被這條守衛涵蓋。
        if (m["preset"] === undefined) continue;
        const t = TEMPLATES.get(String(m["preset"]));
        if (t === undefined) {
          bad.push(`${id}: preset "${String(m["preset"])}" 指到一份不存在的模板`);
          continue;
        }
        // ⭐ 「哪幾格非有不可」是 **`path` 的函數**（GH#693），⛔ 不是一張固定名單：
        //    `static` **不位移** —— `speed`/`distance` 在它底下是死欄位（`tpl-beam-roll`
        //    的那兩格自己標著 `inert:「static ⇒ 不位移,speed 讀不到」`）。硬要求它們
        //    等於逼每一張定點模板都宣告兩個沒有人讀的數字，而那正是第一·五守則
        //    在擋的形狀。定點那一族真正的終止條件是 `lifeSec`，所以改要求它。
        const need =
          m["path"] === "static"
            ? ["modelKey", "path", "lifeSec"]
            : ["modelKey", "path", "speed", "distance"];
        if (m["onTouch"] !== undefined) need.push("touchRadius");
        if (m["path"] === "radial" || m["path"] === "orbit") need.push("count");
        for (const k of need) if (m[k] === undefined) bad.push(`${id}: ${t.id} 補不出 ${k}`);
        for (const k of GEOMETRY) {
          const slot = t.params[k];
          if (typeof m[k] !== "number" || slot === undefined) continue;
          const v = m[k] as number;
          if ((slot.min !== undefined && v < slot.min) || (slot.max !== undefined && v > slot.max))
            bad.push(`${id}: ${k}=${v} 超出 ${t.id} 宣告的 [${slot.min}, ${slot.max}]`);
        }
      }
    expect(bad.join("\n"), bad.join("\n")).toBe("");
  });

  it("⭐ 特效文字：詠唱唸得完 —— 每一句同一個樣子、等距、而且在施法結束前冒出來", () => {
    const bad: string[] = [];
    for (const { id, doc } of USERS) {
      const lines = chant(doc["effects"]).sort((a, b) => a[0] - b[0]);
      if (lines.length < 2) continue; // 一句喊聲不是詠唱，沒有節奏可言
      const look = new Set(
        lines.map(([, n]) =>
          JSON.stringify([n["colorRgb"], n["sizeScale"], n["riseSpeed"], n["durationSec"]]),
        ),
      );
      if (look.size !== 1) bad.push(`${id}: 詠唱字幕有 ${look.size} 種長相 —— 中間那句被人單獨調過`);
      const gaps = new Set(
        lines.slice(1).map(([a], i) => Math.round((a - lines[i]![0]) * 1000) / 1000),
      );
      if (gaps.size !== 1) bad.push(`${id}: 詠唱間隔不等距 ${[...gaps].join("/")} —— 那是算得出來的值被逐句手寫`);
      const cast = doc["castTimeSec"];
      const last = lines[lines.length - 1]![0];
      if (typeof cast === "number" && last > cast)
        bad.push(`${id}: 最後一句排在 ${last}s，而吟唱只有 ${cast}s —— 技能已經炸了字才冒出來`);
    }
    expect(bad.join("\n"), bad.join("\n")).toBe("");
  });
});
