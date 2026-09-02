/**
 * `zId` / `zRef` —— id 與跨集合參照的**葉模組**（從 `schema/common.ts` 原封搬出）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼它必須是自己一個檔（⛔ 不是潔癖，是**量到的**：GH#936）
 *
 * `schema/condition.ts` 的兩個 leaf（`zStatusIdLeaf` / `zEquipmentItemLeaf`）在
 * **模組求值當下**就呼叫 `zRef(...)`，而它是從 `./common` 拿到那支函式的。
 * ⇒ 只要 `common.ts` **反過來**去 import `condition.ts`（`ratios[].when` 需要
 * `zEffectCondition`），就形成一條 ESM 循環：
 *
 *   common.ts 開始求值 → 先跑相依 condition.ts → condition.ts 拿 common.ts
 *   的**半成品** → 呼叫還在 TDZ 的 `zRef` → 💥
 *
 * ⚠️ 這是**量到的，⛔ 不是推測**（2026-09-02，實測探針）：
 *   `TypeError: zRef is not a function` —— 整個 schema 層在 import 時就炸。
 *
 * ⭐ 解法是把 `zRef` 這一族搬到**兩邊都在上面**的葉模組，然後
 * **`condition.ts` 直接 import 這裡** ⇒ ⭐ **迴圈整條消失**（`common → condition
 * → ref` 是一條單向鏈），⛔ 不是「讓迴圈活下來」。
 * `common.ts` 仍然 re-export 這五個名字當**門面**（CLAUDE.md 拆檔三條件之一），
 * 於是全 repo 100+ 個 `from ".../schema/common"` 的 import 端**一個都不用改**
 * （含 `tools/skill-spec/gen_spec.ts` 那條寫死路徑的）。
 *
 * ⚠️ ⭐ **門面救不了 `condition.ts` 自己**，而這一點也是量到的：vite/vitest 的
 * SSR transform 把 **import 全部提到最前面**，卻把 `export {}` 的 `defineProperty`
 * 留在**模組本體** ⇒ 迴圈回來的那一刻 `common.zRef` 還沒定義。
 * ⭐ 真 ESM 的 indirect binding 撐得住這件事，⛔ 而我們跑的不是真 ESM ——
 * 所以「re-export 沒有 TDZ」這個**正確的 ESM 知識**在這裡會給出錯的結論。
 *
 * ⛔ **不要把這個檔的 export 搬回 `common.ts`**，也 ⛔ **不要把 `condition.ts`
 * 的那條 import 改回 `./common`** —— 兩者都會讓上面那個 TypeError 回來，
 * 而它的症狀是「整個 content schema 突然 import 不起來」，看起來完全不像循環引用。
 * 閘：`schemaImportCycle.test.ts`（⭐ 兩個方向各先 import 一次）。
 *
 * ⚠️ 這個檔**只准 import `zod`**。多一條 import 就可能把循環接回來。
 */
import { z } from "zod";

/** filename stem == id; dots allowed for namespaced ids like "sela.q". */
export const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

export const zId = z
  .string()
  .min(1)
  .max(64)
  .regex(ID_RE, "id must be lowercase [a-z0-9] with . _ - separators");

/** Same as zId but typed as a branded id (ChampionId, AbilityId, …). */
export const zIdFor = <T extends string>(): z.ZodType<T, z.ZodTypeDef, string> =>
  zId as unknown as z.ZodType<T, z.ZodTypeDef, string>;

/**
 * `zRef(target)` — an id that must exist in another collection. The target is
 * carried in the schema description ("ref:items" / soft "ref?:vfx") so the
 * editor walker can render a RefSelect and the REFERENCES table stays honest.
 * Soft refs only WARN when dangling (e.g. vfx that hasn't been authored yet).
 */
export const zRef = <T extends string = string>(
  target: string,
  opts?: { soft?: boolean },
  // NoInfer: without it, TS would contextually infer T = any from ZodRawShape
  // when zRef is used inside a z.object() literal without an explicit type arg.
): z.ZodType<NoInfer<T>, z.ZodTypeDef, string> =>
  zId.describe(`${opts?.soft ? "ref?" : "ref"}:${target}`) as unknown as z.ZodType<
    NoInfer<T>,
    z.ZodTypeDef,
    string
  >;

/** Parse a walker-facing description back into ref metadata. */
export function refFromDescription(
  description: string | undefined,
): { target: string; soft: boolean } | null {
  if (!description) return null;
  const m = /^(ref\??):(.+)$/.exec(description);
  if (!m) return null;
  return { target: m[2]!, soft: m[1] === "ref?" };
}

/**
 * ⭐⭐ **可施放的槽位** —— 2026-09-02 從 `common.ts` 搬進來（GH#943 撞到的）。
 *
 * ⛔⛔ **這條迴圈回來過一次。** GH#937（條件葉 `recentCast`）需要槽位，
 * 而它從 `./common` 拿 ⇒ ⭐ **`common → condition → common` 的迴圈當場重建**，
 * 症狀逐字是 `ReferenceError: Cannot access 'zCastableSlot' before initialization`
 * —— 整個 `content:build` 在 import 時就炸。
 *
 * ⇒ ⭐ 與 `zRef` **同一個理由、同一個解法**：搬到兩邊都在上面的葉模組。
 * ⚠️ `common.ts` 仍 re-export 它當門面 ⇒ ⛔ 既有 import 端一個都不用改。
 *
 * ⚠️ ⛔ **不要**再從 `./common` import 它到 `condition.ts` —— 那會第三次重建迴圈。
 * ⭐ 閘：`schemaImportCycle.test.ts`。
 */
export const zCastableSlot = z.enum(["Q", "W", "E", "R", "EX", "PASSIVE"]);

