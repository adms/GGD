/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

/**
 * knockback — 擊退 (lane P4). Shoves the target along a direction. Writes
 * the EXISTING `nav.override` (`DashOverride` with `kind: "knockback"`), so
 * it adds no SimWorld field — see effects/knockback.ts.
 */
export interface KnockbackVariant {
  kind: "knockback";
  /**
   * GGD units of displacement **AT GAP 0** — a FLOOR, not a fixed length.
   * The gap subtraction (GH#193) still runs on top of it, exactly as it
   * does for the author's `hitFeel.knockbackMag` in combat/damage.ts. See
   * effects/knockback.ts for why "the author's number is what you get at
   * touching distance" is the one semantic the whole game shares.
   */
  distance: number;
  /** units per second the body travels while shoved */
  speed: number;
  /**
   * Direction source: away from the caster (default), along the caster's
   * facing, or toward the caster (a PULL). A DECISION POINT.
   */
  from?: "caster" | "facing" | "pull";
  /** who gets shoved: each resolved target (default) or the caster (a recoil) */
  applyTo?: "target" | "self";
  /**
   * 「這一擊的重量」in DAMAGE units, fed through GH#193's own law
   * (`combatFeel.knockbackRaw`) against the victim's health, so an authored
   * shove obeys 「傷害佔受傷者生命百分比」 and the operator's live
   * `minPct` / `maxBodies` / `bodyUnit` knobs. It deals NO damage — pair it
   * with a `damage` effect if the ability also hurts.
   *
   * ABSENT = the flat `distance` floor only.
   */
  impactPower?: number;
  /**
   * Which health `impactPower` is a percentage OF. A DECISION POINT.
   *
   * "max" (default) = the shipped global rule — 打脆皮飛得遠、打坦克推不動。
   * "current" = 殘血更容易被擊飛. combat/damage.ts rejected "current" for
   * the GLOBAL rule (an invisible execute mechanic nobody asked for); as an
   * opt-in on ONE authored ability it is a visible design choice, which is
   * why it is a field with the owner-stated default rather than a branch.
   */
  hpBasis?: "max" | "current";
  /**
   * Subtract the caster↔victim gap (GH#193). DEFAULT TRUE — owner:
   * 「並減去雙方距離」. false exists only so an operator can author a pull
   * or a fixed-length launcher, where "the further away, the less you move"
   * is backwards. Never flip the default: see combatFeel.ts's
   * 「這個減法不是 bug」.
   */
  subtractGap?: boolean;
  /**
   * 擊飛 — apex height in GGD units. > 0 makes the shove a PARABOLA
   * (`LeapOverride`, the #247 integrator) instead of a ground slide, so the
   * body crosses walls, leaves the planar physics world and is rendered in
   * the air. 0 / absent = the ground slide.
   */
  launchHeight?: number;
  /**
   * ⭐ 擊飛的**落點**（owner 2026-08-09 / GH#301-1）。
   *
   * 規範原本寫「落點與飛行時間由系統推算，作者指定不了」。owner 推翻了它，
   * 但同時把它**簡化成四檔**：
   *
   *   · `"short"`   一小段
   *   · `"default"` 預設 —— 也就是今天的行為（由 `distance` / `impactPower`
   *                 / gap 減法推算出來的那個長度）
   *   · `"long"`    一大段
   *   · `"toEdge"`  到底部 —— 推到**決鬥區邊緣**（不是地圖邊緣）
   *
   * ⛔ **不是自由數字，而且這是 owner 明講的簡化**：「應該要可以[指定落點]，
   * 但簡化成 一小段 / 預設 / 一大段 / 到底部 四種」。一格自由距離會讓每一張
   * 卡都要重新決定一次「多遠算遠」，四檔讓它變成一格下拉選單。
   *
   * ABSENT = 今天的行為（等同 `"default"`）—— 所有既有內容一格不變。
   *
   * ⛔⛔ **四檔的實際距離不可以是這支引擎裡的常數**（CLAUDE.md 第一守則）。
   * 它們是 owner 每週會改的那種數字，所以必須住在
   * `config.combat-feel@1` 的 `knockback` 群組底下（那裡已經有 `minPct` /
   * `maxBodies` / `bodyUnit` 三個同族旋鈕），三個住處 + admin 欄位一起補。
   * 實作 #301-1 的那一路：如果你在 `effects/knockback.ts` 裡寫下
   * `const SHORT = 4`，那就是越線了。
   * ⚠️ 契約層（2026-08-09）**沒有**動 `schema/config.ts`：加一格 config 欄位
   * 要連 `content/config/combat-feel.json` 與 admin 表單一起動，而那超出
   * 「只改型別與 schema」的範圍。這是一筆**明確交接**的債，不是漏掉的。
   */
  launchDistance?: "short" | "default" | "long" | "toEdge";
  /**
   * 期間不可控制. DEFAULT TRUE. Writes `world.knockdown` for the flight, the
   * one channel every actor already reads (abilitySystem rejects the cast,
   * BasicAttackSystem the swing, CastResolveSystem interrupts, movementHold
   * roots AND freezes turning). The override alone only takes the FEET.
   */
  uncontrollable?: boolean;
  /** extra 不可控制 ticks AFTER landing (the 爬起來 window). Needs `uncontrollable`. */
  getupTicks?: number;
}
