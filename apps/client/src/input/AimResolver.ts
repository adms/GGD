/**
 * AimResolver — maps an ability slot's castType (from the SHARED ability defs)
 * plus the current cursor/self state onto the exact CastTarget shape the sim
 * consumes. Quick-cast semantics: resolve at the instant of keydown.
 * Pure TS — unit-testable (client-05).
 */
import { asEntityId } from "@ggd/shared/ids";
import type { CastTarget, CastableSlot, Command } from "@ggd/shared/sim/intents";
import type { AbilityDef } from "@ggd/shared/sim/content/defs";
import { add, clampLen, normalize, sub, type Vec2 } from "@ggd/shared/sim/math/vec2";

export type AimAbility = Pick<AbilityDef, "castType" | "range">;

export interface AimContext {
  selfPos: Vec2;
  cursorGround: Vec2;
  /** entity under the cursor (already filtered to valid targets), if any */
  hoveredEntityId?: number | null;
}

/** Resolve a castType into a CastTarget; null = no valid target (don't send). */
export function resolveCastTarget(ability: AimAbility, ctx: AimContext): CastTarget | null {
  switch (ability.castType) {
    case "self":
      return { type: "self" };
    case "skillshot":
    case "dash": {
      const dir = normalize(sub(ctx.cursorGround, ctx.selfPos));
      if (dir.x === 0 && dir.z === 0) return null;
      return { type: "dir", dir };
    }
    case "ground": {
      // clamp to range client-side (LoL behavior; the server clamps too)
      const off = clampLen(sub(ctx.cursorGround, ctx.selfPos), ability.range);
      return { type: "point", point: add(ctx.selfPos, off) };
    }
    case "targeted": {
      if (ctx.hoveredEntityId === null || ctx.hoveredEntityId === undefined) return null;
      return { type: "entity", entityId: asEntityId(ctx.hoveredEntityId) };
    }
  }
}

/**
 * 範圍指示圈（AoE）的**圓心**，GH#415。
 *
 * owner 2026-08-19：
 * > 「技能**範圍指示**應該是在**我的滑鼠上**，⛔ 不是以英雄自身座標為圓心來顯示
 * >  （**技能施展距離**才是）」
 *
 * 在此之前 `AimIndicator` 把兩個圈都畫在施法者腳下，所以玩家看到「我腳下有一個
 * 大圈」而真正會被炸到的是**滑鼠那一圈**。⚠️ 那比沒有指引更糟：它畫了一個**位置
 * 錯誤**的圈，而玩家會照著它站位。
 *
 * ⭐ **這支函式刻意從 `resolveCastTarget` 推導，⛔ 不自己再寫一次夾取。**
 * `ground` 的落點本來就已經被 `clampLen(..., range)` 夾在施法距離內，而那正是
 * 伺服器會收到的那一個點。自己再算一次 = 兩份夾取，而它們會在某一次改動之後
 * 分岔 —— 指示圈畫在 A、技能落在 B，且**兩邊看起來都是對的**（失敗形態⑤）。
 * ⇒ 圓心永遠等於「這一發真的會打去哪」，因為它就是同一個物件。
 *
 * 回傳 null = 這一發不該畫圓：
 *   · `skillshot` / `dash` —— 那是走廊不是圓（GH#415 明說不管這一項）
 *   · `targeted` 而游標下沒有合法目標 —— 沒有目標就沒有落點
 *
 * @param entityPos 查一個實體現在在哪（`targeted` 用）。查不到 → null。
 */
export function resolveAoeCenter(
  ability: AimAbility,
  ctx: AimContext,
  entityPos?: (id: number) => Vec2 | null,
): Vec2 | null {
  const target = resolveCastTarget(ability, ctx);
  if (target === null) return null;
  switch (target.type) {
    // ⭐ 已經夾過了 —— 這就是伺服器會收到的點。
    case "point":
      return target.point;
    // 目標身上。⚠️ 查不到位置就不畫，⛔ 不要退回施法者腳下 ——
    //   那正是這張 issue 在修的那個謊。
    case "entity":
      return entityPos?.(target.entityId as unknown as number) ?? null;
    case "self":
      return ctx.selfPos;
    // 走廊，不是圓。
    case "dir":
      return null;
  }
}

/**
 * Build the exact castAbility Command for a slot, or null if untargetable.
 *
 * `CastableSlot`, not `AbilitySlot`: the sixth slot (the level-1 天生技) is cast
 * through this same resolver — an active innate has a real `castType` and
 * `range` like any other ability, so it needs no aiming rules of its own.
 */
export function buildCastCommand(slot: CastableSlot, ability: AimAbility, ctx: AimContext): Command | null {
  const target = resolveCastTarget(ability, ctx);
  return target ? { kind: "castAbility", slot, target } : null;
}
