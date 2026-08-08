/**
 * 契約層守衛（2026-08-09，GH#300）—— **效果上的條件與 hook 上的是同一組葉子。**
 *
 * owner 裁決讓 `condition` 從「hook 的一個欄位」變成「每一個效果都有的欄位」。這一批
 * 最容易犯的錯不是漏接，是**做出第二套條件系統**：兩份葉子清單看起來都對，而編輯器
 * 只看得到其中一份，於是「hook 上寫得出來、效果上寫不出來」變成一種沒有任何測試會
 * 紅的沉默不對稱。所以這裡只問兩件事，兩件都**從出貨的 schema 推導**、不抄名單：
 *   ① 每一個 kind 都帶 `condition`，而且是與 `zHookDef` **同一個 Zod 物件實例**
 *      （用物件識別比，不是用名字）。做了第二套那一刻，就算兩套碰巧等價這條也紅。
 *   ② 同一批探針走 `zEffectDef` 與 `zHookDef` 的**判決逐條相同**。
 *      ①是結構、②是行為，兩條一起才擋得住「換了一個等價的複製品」。
 *
 * ⚠️ 突變紀錄（2026-08-09，兩個都套用 → 紅 → 還原 → 綠）：
 *   · 從 `damage` 成員拿掉 `...EFFECT_COMMON_SHAPE` → ① 紅（指名 damage）。
 *     ⛔ 第一版的①是用 `safeParse` 加「有沒有 condition 這一格的 issue」判斷的，
 *     而 **同一個突變它是綠的** —— `.strict()` 的 `unrecognized_keys` issue 的
 *     `path` 是空陣列，不是 `["condition"]`。改成問結構才抓得到。
 *   · 把 `EFFECT_COMMON_SHAPE.condition` 換成 `z.any().optional()` → ①②都紅。
 *
 * ⛔ 行為（逐一過濾目標 / 空清單退化成整段閘 / 沒通過就不呼叫 handler）是 lane A 的
 * 承重守衛，要跑真的 `SimWorld`。這一條是體驗層的薄守衛（第零守則⑦）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import type { z } from "zod";
import { zEffectDef, zEffectDefUnion, zHookDef, zHookDefBase } from "./effect";

const TAG = "effect-level-condition";

/** 每個 kind 的最小可解析文件 —— 只填必填欄位，其餘交給 schema 的錯誤訊息。 */
const heal = { kind: "heal", amount: { flat: 10 } };
const hook = { on: "onAbilityHit", target: "self", effects: [heal] };

/** 探針：前 8 個必須被收，最後 1 個必須被拒（否則這條測試對任何實作都是綠的）。 */
const PROBES: readonly (readonly [string, unknown, boolean])[] = [
  ["chance", { kind: "chance", p: 0.5 }, true],
  ["stat/resource-percent", { kind: "stat", subject: "self", stat: "hp", mode: "percent", op: "<=", value: 0.35 }, true],
  ["stat/plain", { kind: "stat", subject: "target", stat: "ad", op: ">", value: 100 }, true],
  ["kind", { kind: "kind", subject: "target", is: "champion" }, true],
  ["status/id", { kind: "status", subject: "target", statusId: "fear" }, true],
  ["status/tag", { kind: "status", subject: "target", tag: "stun" }, true],
  ["equipment/item", { kind: "equipment", subject: "self", itemId: "godie-i06q" }, true],
  ["group/all+not", { all: [{ kind: "chance", p: 1 }, { not: { kind: "kind", subject: "target", is: "mob" } }] }, true],
  // 反面：百分比只在有分母的資源屬性上開放（schema/condition.ts DECISION 3）。
  // 少了它，一個「什麼都收」的假 condition 也會讓上面八條全綠（失敗形態 ④）。
  ["stat/percent-on-plain（必須被拒）", { kind: "stat", subject: "self", stat: "attackSpeed", mode: "percent", op: ">", value: 0.5 }, false],
];

describe("效果上的 condition（GH#300）", () => {
  /** `condition` 那一格底下真正在驗的 schema（剝掉 `.optional()` 的包裝）。 */
  const inner = (s: z.ZodTypeAny | undefined): unknown =>
    s === undefined ? undefined : (s as { _def: { innerType?: unknown } })._def.innerType;

  it("每一個 effect kind 都帶 condition，而且是 hook 上的那個**同一個實例**", () => {
    cover(TAG);
    const hookCondition = inner(zHookDefBase.shape.condition);
    // 夾具前提：hook 那一側真的有東西可以比（undefined 會讓下面整段空轉而全綠）。
    expect(hookCondition, "zHookDef 沒有 condition —— 這條測試的基準不見了").toBeDefined();
    const options = zEffectDefUnion.options;
    expect(options.length).toBeGreaterThan(20);
    const bad = options
      .map((o) => [o.shape.kind.value as string, inner(o.shape.condition)] as const)
      .filter(([, c]) => c !== hookCondition)
      .map(([kind]) => kind);
    expect(
      bad,
      "這些 kind 的 condition 不是 hook 上的那一個 —— 漏了 EFFECT_COMMON_SHAPE，或有人做了第二套",
    ).toEqual([]);
  });

  it("效果上與 hook 上的判決逐條相同 —— 同一組葉子，不是第二套", () => {
    cover(TAG);
    for (const [name, condition, ok] of PROBES) {
      const onEffect = zEffectDef.safeParse({ ...heal, condition }).success;
      const onHook = zHookDef.safeParse({ ...hook, condition }).success;
      expect(onHook, `${name}: hook 端的預期判決變了`).toBe(ok);
      expect(onEffect, `${name}: 效果端與 hook 端不同意 —— 有人做了第二套條件系統`).toBe(onHook);
    }
  });
});
