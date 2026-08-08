/**
 * `applyBuff` — attach a timed ModifierSource (optionally a STACKING one).
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { attachSource } from "../stats/statPipeline";

export const applyBuffEffect: EffectKindSpec<"applyBuff"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // rank-indexed variant wins when authored (WC3 buff columns are per
    // ability level); clamp past the last entry so a GGD maxRank beyond the
    // native level count keeps the highest authored row instead of vanishing.
    const rk = e.perRank?.[Math.min(Math.max(1, ctx.rank), e.perRank.length) - 1];
    const modifiers = rk?.modifiers ?? e.modifiers;
    const duration = rk?.duration ?? e.duration;
    const expiresAtTick = world.tick + Math.round(duration / world.dt);
    for (const target of ctx.targets) {
      // #244 STACKING PATH: one source per key, `stacks` counts applications.
      // Fixes the same-tick collision the id below has (two mobs killed by one
      // AoE on one tick used to overwrite each other and only pay once) and
      // keeps the source list O(1) instead of one entry per proc.
      if (e.stackKey !== undefined) {
        const sc = world.stats.get(target);
        if (!sc) continue;
        const id = `buff:stack:${e.stackKey}`;
        const existing = sc.sources.find((s) => s.id === id);
        if (existing) {
          const cap = e.maxStacks ?? Number.POSITIVE_INFINITY;
          existing.stacks = Math.min((existing.stacks ?? 1) + 1, cap);
          existing.expiresAtTick = expiresAtTick;
          sc.dirty = true;
        } else {
          attachSource(world, target, {
            id,
            kind: "buff",
            modifiers,
            // Carried on the STACKING path too — dropping it here would make
            // `hooks` silently inert the moment an author also set `stackKey`
            // (失敗形態 ②). One shared source ⇒ one shared `hookLastFired`,
            // which is the honest reading of "one stack of one buff".
            ...(e.hooks !== undefined ? { hooks: e.hooks } : {}),
            // 【淨化】的兩格 —— GH#295。⚠️ 疊層路徑也要帶，理由與上面 `hooks`
            // 同一條：一支技能一旦也填了 `stackKey`，這兩格就會靜默失效，
            // 而畫面上跟正常一模一樣（失敗形態 ②）。
            dispellable: e.dispellable,
            polarity: e.polarity,
            expiresAtTick,
            stacks: 1,
            ...(e.stackVisual ? { visualStacks: true } : {}),
          });
        }
        continue;
      }
      attachSource(world, target, {
        id: `buff:${ctx.origin}#${world.tick}`,
        kind: "buff",
        modifiers,
        // A buff may also grant a TEMPORARY PROC (`hooks`). `fireHooks` already
        // walks `src.hooks` and already skips a source past its
        // `expiresAtTick`, so the window needs no second clock — and because
        // `hookLastFired` is per-source-INSTANCE, an `internalCooldown` on one
        // of these reads 「這次施放最多觸發幾次」, not a global cooldown.
        ...(e.hooks !== undefined ? { hooks: e.hooks } : {}),
        // 【淨化】能不能拔掉這一份增益（GH#295），以及它的極性。
        // ⛔ 兩格都是**施加時寫下**，不從 `modifiers` 推導：一個來源可以同時帶
        // `{ms,+0.3}` 與 `{armor,-0.5}`，任何啟發式都會在某一張卡上錯。
        // 缺席的語意：`dispellable` → `dispelRules.buffDefaultDispellable`（出貨
        // false）；`polarity` → 無極性 = 有方向的淨化拔不到它。
        dispellable: e.dispellable,
        polarity: e.polarity,
        expiresAtTick,
      });
    }
    // ONE discrete `buffApply` cue for the status-up (audio COMBAT-AUDIO): the
    // client plays the 增益 cast on the first buffed target. Fired only when a
    // buff actually attached, so an empty target set makes no sound.
    if (ctx.targets.length > 0) {
      world.emit("buffApply", {
        source: ctx.caster,
        target: ctx.targets[0],
        origin: ctx.origin,
      });
    }
  },
};
