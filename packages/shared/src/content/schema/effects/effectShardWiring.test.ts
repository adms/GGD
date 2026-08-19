/**
 * ⭐ #467 ② 的閘 —— effect kind 分片的**四向**對帳。
 *
 * 分片把 40 個 kind 從兩個大檔攤成 80 個小檔，而攤開之後多了一種**新的**壞法：
 * 加一個檔、忘了接線。⚠️ 最糟的那一種是**靜默的**：`refine` 沒接進派發表時，
 * 跨欄位錯誤整個消失，一份壞內容照樣載得進去（失敗形態②）。
 *
 * ⛔ 這也是「從目錄推導」那句話真正的落點：`index.ts` 沒有辦法在**型別層**讀資料夾
 * （見它的檔頭），所以推導由**這一支**做 —— 它真的 `readdir`。
 *
 * ⚠️ 四邊都讀**執行期的真東西**，⛔ 沒有一邊是掃原始碼字串（失敗形態⑥）：
 *   ① 檔案系統：`schema/effects/*.ts`      ② Zod：`zEffectDefUnion.options`
 *   ③ 註冊表：`EFFECT_HANDLERS` 的鍵        ④ TS union：`sim/effects/variants/*.ts`
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EFFECT_HANDLERS } from "../../../sim/effects/effectRegistry";
import { EFFECT_REFINERS, zEffectDef, zEffectDefUnion } from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));
const kindsIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.startsWith("_") && f !== "index.ts" && !f.includes(".test."))
    .map((f) => f.slice(0, -3))
    .sort();

const schemaFiles = kindsIn(HERE);
const variantFiles = kindsIn(resolve(HERE, "../../../sim/effects/variants"));
const unionKinds = zEffectDefUnion.options.map((o) => o.shape.kind.value).sort();
const registryKinds = Object.keys(EFFECT_HANDLERS).sort();

describe("effect kind shard wiring", () => {
  it("檔案 == Zod 聯集 == 註冊表 == TS union（四向，加一個檔忘了註冊就紅）", () => {
    expect(unionKinds).toEqual(schemaFiles);
    expect(registryKinds).toEqual(schemaFiles);
    expect(variantFiles).toEqual(schemaFiles);
  });

  it("每個檔 export 的 z.object 就是它檔名那個 kind（⛔ 不是靠檔名相信它）", async () => {
    for (const kind of schemaFiles) {
      const mod = (await import(`./${kind}.ts`)) as Record<string, unknown>;
      const schema = mod[`z${kind.charAt(0).toUpperCase()}${kind.slice(1)}`] as
        | { shape?: { kind?: { value?: string } } }
        | undefined;
      expect(schema?.shape?.kind?.value, `${kind}.ts`).toBe(kind);
    }
  });

  it("有 refine 的 kind 全部接進派發表，沒有多也沒有少", async () => {
    const exporting: string[] = [];
    for (const kind of schemaFiles) {
      const mod = (await import(`./${kind}.ts`)) as Record<string, unknown>;
      if (typeof mod.refine === "function") {
        exporting.push(kind);
        // 派發表裡的必須**是同一個函式**，不是「某個同名的東西」。
        expect(EFFECT_REFINERS[kind as keyof typeof EFFECT_REFINERS], kind).toBe(mod.refine);
      }
    }
    expect(Object.keys(EFFECT_REFINERS).sort()).toEqual(exporting.sort());
  });

  it("遞迴的結真的接回 _shared —— 巢狀效果被**走到了**", () => {
    // `weightedBranch.branches[].effects` 走的就是 `_shared.zEffectDef` 那條線。
    // 沒接上的話這裡會 throw（⛔ 刻意不 fail-open 成「什麼巢狀都收」）。
    const wrap = (amount: unknown) => ({
      kind: "weightedBranch",
      shape: "single",
      branches: [{ weight: 1, effects: [{ kind: "heal", amount }] }],
    });
    expect(zEffectDef.safeParse(wrap({ flat: 1 })).success).toBe(true);
    const bad = zEffectDef.safeParse(wrap({ nope: 1 }));
    // ⭐ 斷言在**路徑**上：只有真的遞迴下去才會指到 branches[0].effects[0].amount。
    expect(bad.success).toBe(false);
    expect(bad.success === false && bad.error.issues[0]?.path).toEqual([
      "branches", 0, "effects", 0, "amount",
    ]);
  });
});
