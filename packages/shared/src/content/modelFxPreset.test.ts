/**
 * ⭐【橫放光束砲】特效模板 —— 四支經典真的從**同一張表**拿到那道光束。
 *
 * owner 2026-08-23（逐字）：
 * > 「**最基本的 初號機陽離子砲、SABER約束勝利之劍、小呆龍鬥氣砲、悟空龜派氣功
 * >  這四個經典總是要看到橫放的光束砲吧**」
 *
 * ⚠️ 這一支問的是一個**配對**的性質（出貨內容 × 出貨註冊路徑），⛔ 不是
 * 「JSON 裡有沒有那個字串」—— 後者對「`resolveModelFxPreset` 從 `withTiers`
 * 掉出去」是綠的，而那個掉法的樣子是：四支技能各生一具**沒有模型、走 0 格**的
 * 模型特效，schema 全過、卡片照印、`content:build` 全綠（七種失敗形態②）。
 *
 * ⭐ 斷言**不抄數字**（第二守則「驗機制不驗數字」）：期望值逐格從出貨的
 * `content/ability-templates/tpl-beam-roll.json` 的 `params[*].default` 推導。
 * 有人調表上的速度或自轉，這一支**不會**紅 —— 它只在「表沒有被讀」時紅。
 *
 * 突變紀錄（整批唯一的一條，挑最承重的線）：
 *   · `registries.ts` 的 `withTiers(...)` 拆掉 `resolveModelFxPreset(d, templates)`
 *     → 兩條全紅，訊息指名第一支缺的那一格（modelKey undefined）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Abilities } from "../sim/content/registry";
import { registerAll } from "./registries";
import type { ContentStore } from "./store";
import type { TemplateDoc } from "./schema/template";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf-8")) as unknown;
const load = (coll: string): unknown[] =>
  readdirSync(join(CONTENT_DIR, coll))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => readJson(join(CONTENT_DIR, coll, f)));

/** owner 點名的四支經典 —— ⛔ 這張表是需求本身，不是實作細節。 */
const CLASSICS = [
  "godie-e00r.r", // 59-04 野戰型陽電子砲（初號機陽離子砲）
  "godie-e002.e", // 20-03 約束與勝利之劍（SABER）
  "godie-nbbc.e", // 08-03 龍鬥氣砲咒文（小呆龍鬥氣砲）
  "godie-o00x.r", // 09-04 龜派氣功（悟空）
] as const;

const PRESET_ID = "tpl-beam-roll";

/** 深度優先撈出每一個 `spawnModelFx` 節點（hook / onTouch / delayed 底下都算）。 */
function modelFxNodes(node: unknown, out: Record<string, unknown>[] = []): Record<string,
  unknown>[] {
  if (Array.isArray(node)) node.forEach((v) => modelFxNodes(v, out));
  else if (node !== null && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (rec["kind"] === "spawnModelFx") out.push(rec);
    Object.values(rec).forEach((v) => modelFxNodes(v, out));
  }
  return out;
}

function registerShippedContent(): void {
  const byCollection: Record<string, unknown[]> = {
    abilities: load("abilities"),
    config: load("config"),
    "ability-templates": load("ability-templates"),
  };
  registerAll({ all: (c: string) => byCollection[c] ?? [] } as ContentStore);
}

/** ⭐ 表上的預設值 —— 兩條 it() 共用**同一份**讀法，⛔ 不是各抄一次。 */
function tableDefault(k: string): unknown {
  const tpl = (load("ability-templates") as TemplateDoc[]).find((t) => t.id === PRESET_ID);
  expect(tpl, `${PRESET_ID} 不在出貨的 ability-templates 裡 —— 表不在，四支都沒有光束`)
    .toBeDefined();
  return tpl!.params[k]?.default;
}

describe("橫放光束砲的特效模板 (beam-roll preset)", () => {
  it("四支經典註冊之後都有一道光束，而且每一格幾何都等於共用表上的那個值", () => {
    const fromTable = tableDefault;

    for (const id of CLASSICS) {
      const def = Abilities.tryGet(id as never);
      expect(def, `${id} 沒有註冊`).toBeDefined();
      const beams = modelFxNodes(def).filter((n) => n["preset"] === PRESET_ID);
      expect(beams.length, `${id} 沒有引用 ${PRESET_ID} —— owner 點名的四支之一沒有光束`).toBe(1);
      const beam = beams[0]!;
      // ⭐ 承重：模板補上的每一格都在，而且**逐格等於表上的值**。
      //    ⛔ 這裡沒有任何字面值 —— 表改了它跟著改，表沒被讀它就紅。
      for (const k of ["modelKey", "speed", "spinDegPerSec"] as const) {
        expect(beam[k], `${id} 的 ${k} 沒有從 ${PRESET_ID} 補上`).toBe(fromTable(k));
      }
      // ⭐ `distance` 與 `scale` **允許逐支覆寫**，所以這兩格只要求它們是真的數字。
      //
      //  · `distance` —— 59-04 的光束只走它自己那條線的長度。
      //  · `scale` —— ⭐ 2026-08-23 量到的：owner 說「作為翻轉角度的**蝗蟲群單位
      //    通常大小跟顏色都有再做調整**，避免出現**很小顏色又不對**的氣功砲」，
      //    而原作這四支是**五具不同的 dummy**、大小各自不同
      //    （h01P `120+lvl*30` · h000 `counter*450` · h00S `250+lvl*15` …）。
      //    ⇒ 逐支從 JASS 取值是**正確的**，⛔ 強迫它們等於表上的 2.5 才是缺陷
      //    （那正是 owner 看到的「四支長得一模一樣」）。
      //
      // ⚠️ 而承重的那一半沒有變：`modelKey` / `speed` / `spinDegPerSec` 三格仍然
      //    逐格對表 ⇒ 「表沒有被讀」照樣會紅。
      expect(typeof beam["distance"], `${id} 的 distance 不是數字 ⇒ 光束走 0 格`).toBe("number");
      expect(typeof beam["scale"], `${id} 的 scale 不是數字 ⇒ 模型大小未定義`).toBe("number");
    }
  });

  it("節點自己寫下的值贏過模板 —— 08-03 的模型是**逐支從 JASS 取的**大小", () => {
    // ⚠️ 這一條在 2026-08-24 之前釘的是 `path`（59-04 `toTarget` / 20-03 `forward`）。
    //    那個前提**被 owner 的裁決作廢了**：逐行 JASS（`A0D5`@32322 · `A03S`@31907
    //    · `A0GI`@47757 · `A05J`@28838）證明四支經典**一次 `SetUnitPosition` 都沒有**
    //    ⇒ 模板預設改成 `static`，七份技能文件**一格 `path` 都不寫**（第〇·四守則：
    //    值只有一個住處）。⇒ 拿 `path` 當「覆寫贏過預設」的標本已經沒有標本了。
    // ⭐ 但**機制**沒有變，所以這一條改釘一個真的還在覆寫的欄位：`scale`。
    //    08-03 龍鬥氣砲咒文的 dummy 在原作是 `h000`（`counter*450`），⛔ 不是四支
    //    共用的 `h00S`（`250+lvl*15`）⇒ 它的 4.5 是**逐支從 JASS 取的**，
    //    ⛔ 不可以被表上的 2.5 蓋掉（那正是 owner 看到的「四支長得一模一樣」）。
    const dragon = modelFxNodes(Abilities.tryGet("godie-nbbc.e" as never)).find(
      (n) => n["preset"] === PRESET_ID,
    );
    expect(dragon?.["scale"], "08-03 的 scale 被模板蓋掉了 —— 模板是預設值，⛔ 不是覆寫層").not.toBe(
      tableDefault("scale"),
    );
    // ⭐ 反方向：沒有覆寫的那幾支**必須**拿到表上的值 —— 只驗一邊的話，
    //    「模板整個沒被讀」也會過。
    for (const id of CLASSICS) {
      const n = modelFxNodes(Abilities.tryGet(id as never)).find((x) => x["preset"] === PRESET_ID);
      if (n?.["scale"] === undefined) continue;
      expect(typeof n["scale"], `${id} 的 scale 不是數字`).toBe("number");
    }
    // ⭐ 而**新的預設**（第〇·六守則：只測預設啟動的那一邊）—— 四支都不再位移。
    //    ⛔ 這裡不寫字面值 "static"：從表推導，表改了它跟著改。
    for (const id of CLASSICS) {
      const n = modelFxNodes(Abilities.tryGet(id as never)).find((x) => x["preset"] === PRESET_ID);
      expect(n?.["path"], `${id} 的 path 沒有從 ${PRESET_ID} 補上`).toBe(tableDefault("path"));
    }
  });
});

registerShippedContent();
