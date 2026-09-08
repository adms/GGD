/**
 * ⭐⭐ GH#761 AC② —— **模型特效掛得到骨頭**（原作的 `attachedModels`）。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * `spawnModelFx` 表達得出「生幾具、多大、走什麼路徑」，
 * ⛔ **而表達不出「掛在誰的哪一根骨頭上」** —— `anchor` 只有腳下三選一。
 * ⇒ ⭐ 原作那一族「劍掛在手上、光環掛在胸口」的模型特效**寫不出來**，
 * ⛔ 只能靠 `attachment@1` 的**常駐**綁定去逼近（⇒ 它一直亮著）。
 *
 * ── ⭐ 詞彙逐字照抄 `spawnVfx`，⛔ 不發明第二套 ────────────────────────────
 * `bone` / `attach` / `boneOn` 那一組在 GH#809 就定案了。
 * ⛔ 兩套骨頭詞彙 ＝ 編輯器要問兩次「掛哪裡」，而它們遲早會分岔。
 *
 * ── ⭐ GH#1080 —— 值域**一份**，這條守衛讀**真的東西** ──────────────────────
 * 在此之前 anchor 的值域有三份手抄（Zod enum · `variants/spawnModelFx.ts` 的 union ·
 * `modelFxPlacement.ts` 的 union），而這個檔用 `readFileSync` **掃原始碼字串**把三份釘在
 * 一起（第二守則失敗形態⑥）。現在：Zod enum 從 `MODEL_FX_ANCHORS` 推導（下面第①條讀
 * Zod 的 `options`），兩個 sim 型別與它**相等**由 `tsc` 逼（{@link simAgrees} 那兩行 ——
 * ⚠️ vitest 不做型別檢查，這一半的閘是 `pnpm typecheck`），擺位層「bone 當 self」讀真的
 * `modelFxInstancesFromFrame`（⛔ 不再找註解裡有沒有「渲染層」三個字）。
 *
 * MUTATION LOG：schema 的 `"bone"` 從 anchor 列舉拿掉 → ①紅（GH#761 當時跑過）。
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { MODEL_FX_ANCHORS, zSpawnModelFx, type ModelFxAnchor } from "./spawnModelFx";
import { zSpawnVfx } from "./spawnVfx";
import type { SpawnModelFxVariant } from "../../../sim/effects/variants/spawnModelFx";
import { modelFxInstancesFromFrame, type ModelFxPlacementParams } from "../../../sim/effects/modelFxPlacement";

/** 兩個型別**互相**可指派 ＝ 相等（少一個成員或多一個成員都是 `false`）。 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
// ⭐ AC④「三份型別一起動」的閘住在 tsc：sim 的兩份 union 漂了，這兩行就是 TS2322。
const simAgrees: Same<NonNullable<SpawnModelFxVariant["anchor"]>, ModelFxAnchor> = true;
const placementAgrees: Same<NonNullable<ModelFxPlacementParams["anchor"]>, ModelFxAnchor> = true;

const enumOptions = (s: z.ZodTypeAny): readonly string[] | undefined => {
  while (s instanceof z.ZodOptional) s = s.unwrap();
  return s instanceof z.ZodEnum ? (s.options as readonly string[]) : undefined;
};
const STATIC = { kind: "spawnModelFx", shape: "single", modelKey: "w3x.stock.revivehuman", path: "static", lifeSec: 2 };

describe("GH#761 AC② spawnModelFx 掛得到骨頭", () => {
  it("★ ⭐ schema 的 `anchor` 值域＝`MODEL_FX_ANCHORS`（含 bone），並收得下 `attach` / `boneOn`", () => {
    expect(enumOptions(zSpawnModelFx.shape.anchor)).toEqual([...MODEL_FX_ANCHORS]);
    expect(MODEL_FX_ANCHORS, "⛔ anchor 沒有 bone").toContain("bone");
    const bone = zSpawnModelFx.safeParse({ ...STATIC, anchor: "bone", attach: "hand,right", boneOn: "victim" });
    expect(bone.success, "⛔ 掛骨頭那一組（anchor:bone ＋ attach ＋ boneOn）schema 收不下").toBe(true);
  });

  it("★ ⭐ **三份型別一起動**（AC④：sim 的兩份 union ≡ tuple —— 閘在 tsc，這裡只是它的落點）", () => {
    expect(simAgrees && placementAgrees).toBe(true);
  });

  it("★ ⭐ 詞彙**與 `spawnVfx` 同一組**（⛔ 不是第二套）", () => {
    expect(enumOptions(zSpawnVfx.shape.at), "⛔ spawnVfx 的 at 沒有 bone").toContain("bone");
    expect(enumOptions(zSpawnModelFx.shape.boneOn), "⛔ boneOn 的值域兩邊分岔了").toEqual(
      enumOptions(zSpawnVfx.shape.boneOn),
    );
    for (const s of [zSpawnVfx, zSpawnModelFx]) {
      expect(s.shape.attach.unwrap(), "⛔ attach 少了（或不是字串）").toBeInstanceOf(z.ZodString);
    }
  });

  it("⭐ 擺位層**把 bone 當 self**（骨頭掛點是渲染層的事；⛔ 一個沉默的 fallthrough 會被讀成缺陷）", () => {
    const frame = { origin: { x: 0, z: 0 }, facing: { x: 1, z: 0 }, point: { x: 3, z: 0 } };
    const at = (anchor: ModelFxAnchor) => modelFxInstancesFromFrame({ path: "static", anchor }, frame);
    expect(at("bone")).toEqual(at("self"));
    expect(at("bone")).not.toEqual(at("point"));
  });
});
