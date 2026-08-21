/**
 * AimResolver — maps an ability slot's castType (from the SHARED ability defs)
 * plus the current cursor/self state onto the exact CastTarget shape the sim
 * consumes. Quick-cast semantics: resolve at the instant of keydown.
 * Pure TS — unit-testable (client-05).
 *
 * ⚠️ ONE exception to "pure", and it is deliberate: {@link setCursorlessAim}.
 * See its doc — a pad has NO cursor, and the preview centre has to come from
 * somewhere. Everything the sim actually receives (`resolveCastTarget` /
 * `buildCastCommand`) is still a pure function of its arguments.
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

// ---------------------------------------------------------------------------
// 無游標瞄準（手把）—— GH#512
// ---------------------------------------------------------------------------

/**
 * 手把目前的瞄準方向（單位向量），⛔ 沒有手把在瞄準時為 null。
 *
 * ⭐ **為什麼這是一個暫存器而不是一個參數**：`resolveAoeCenter` 唯一的呼叫端
 * （`GameApp.resolveHoldPreview`）餵給它的 `cursorGround` 是**滑鼠**落點 ——
 * `cursor.inside` 只有 `mousemove` 寫得到它。純手把玩家從來沒動過滑鼠，
 * 於是 `cursorGround` 退回 `self`，**長按預覽的 AoE 圈就畫在自己腳下**，
 * 而技能會飛到瞄準方向上（GH#512）。那比沒有圈更糟：玩家會照著它站位。
 *
 * ⚠️ 滑鼠那條路本身就是一個全域可變的游標 store（`ui/cursor`）；
 * 這一格是它在**無游標輸入**上的對應物，寫入者只有 `GamepadInput` 的
 * `PadDescribeHold`（跟 `ui/abilityHold` 同一個生命週期：按住寫、放開清）。
 */
let cursorlessAim: Vec2 | null = null;

/**
 * 手把這一幀**軟鎖定**到誰 —— `ctx.nearestEnemy(self, reach, aimDir)` 的結果，
 * ⛔ null = 沒有鎖到人（GH#519）。
 *
 * ⭐ **為什麼它必須離開 `GamepadInput` 的區域變數**：在此之前那一次挑選只發生在
 * **按下的那一瞬間**，挑完直接包成 command 送走 —— 於是「這一發會打誰」這個答案
 * 在畫面上**一格都沒有出現過**，玩家按下去才知道打錯人（GH#519 的原文）。
 * 把它publish 成暫存器之後，`resolveAoeCenter` 就能在**按住的每一幀**回答
 * 「圈圈畫在誰腳下」，而搖桿方向的偏壓（`pickNearestUnit`）本身就是換目標的手勢，
 * ⛔ 不必新增一顆循環鍵。
 */
let cursorlessTarget: number | null = null;

/**
 * 手把按住技能鍵時每幀寫入；放開／拔掉手把寫 null。零向量視同 null。
 *
 * ⚠️ **它同時清掉軟鎖定目標**（GH#519）。兩格是**同一個生命週期**：`PadDescribeHold`
 * 放開技能鍵時只呼叫得到這一支，而一個活過放開那一刻的目標會讓標記留在畫面上
 * 指著一個沒有人在瞄的敵人 —— 那比沒有標記更糟（同 GH#415 對「畫錯位置的圈」的裁決）。
 */
export function setCursorlessAim(dir: Vec2 | null): void {
  cursorlessAim = dir && (dir.x !== 0 || dir.z !== 0) ? normalize(dir) : null;
  if (!cursorlessAim) cursorlessTarget = null;
}

/** 目前的手把瞄準方向（測試與偵錯用）。 */
export function getCursorlessAim(): Vec2 | null {
  return cursorlessAim;
}

/**
 * 手把每幀 publish 它軟鎖定到的實體。⛔ 只在 `setCursorlessAim` 已經寫過方向時
 * 才有意義 —— 放開技能鍵那一支會把這一格一起清掉。
 */
export function setCursorlessTarget(entityId: number | null): void {
  cursorlessTarget = entityId ?? null;
}

/** 目前的手把軟鎖定目標（渲染標記與測試用）。 */
export function getCursorlessTarget(): number | null {
  return cursorlessTarget;
}

/**
 * 把「滑鼠落點」換成「手把瞄準方向上的落點」。沒有手把在瞄準 → 原樣回傳。
 *
 * ⚠️ 距離用的是**傳進來的 `ability.range`**，而 `resolveHoldPreview` 餵的正是
 * **乘過 `envFactor("abilityRange")` 之後**的那一個 ⇒ 圈心永遠落在玩家真的
 * 打得到的最遠處，⛔ 不是一個寫死的距離。
 *
 * ⛔ 傳進來的 `hoveredEntityId` 一律丟掉：它是用**滑鼠**落點挑出來的實體，
 * 手把在瞄準時那個 pick 跟玩家的意圖無關。
 *
 * ⭐ 取而代之的是**手把自己 publish 的軟鎖定目標**（{@link setCursorlessTarget}，
 * GH#519）。在此之前這裡寫死 `null`，於是 `targeted` 技能在手把長按時
 * `resolveCastTarget` 一律回 null ⇒ 沒有落點 ⇒ 沒有圈 ⇒
 * **畫面上沒有任何東西說出這一發會打誰**，而按下去送出的那一發卻鎖著某個人。
 * ⚠️ 沒鎖到人時它仍然是 null —— 沒有目標就不畫圓，畫一個錯的比不畫更糟。
 */
function withCursorlessAim(ability: AimAbility, ctx: AimContext): AimContext {
  const dir = cursorlessAim;
  if (!dir) return ctx;
  return {
    selfPos: ctx.selfPos,
    cursorGround: add(ctx.selfPos, { x: dir.x * ability.range, z: dir.z * ability.range }),
    hoveredEntityId: cursorlessTarget,
  };
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
  // ⭐ 手把在瞄準時，圓心的來源是**搖桿方向**而不是滑鼠（GH#512）。
  const aimed = withCursorlessAim(ability, ctx);
  const target = resolveCastTarget(ability, aimed);
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
      return aimed.selfPos;
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
