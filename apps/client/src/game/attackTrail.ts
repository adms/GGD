/**
 * game/attackTrail —— 揮擊殘影**由攻擊事件觸發**（GH#725 AC⑥ / 舊 #39）。
 *
 * ── ⭐ 在此之前的形狀 ────────────────────────────────────────────────────────
 * `content/config/ambient-vfx.json` 有 **22 個** 綁定，⛔ 而它們是 **model-keyed
 * 的 ambient**（常駐掛在模型上），⛔ 不是「揮劍的那一刻放一道刀光」。
 * ⇒ 票文逐字：「**大多數英雄揮劍仍無殘影**」。
 *
 * ── ⭐ 這一版的判準：**武器 tag**，⛔ 不是一張 model key 名單 ──────────────
 * 英雄卡上早就有武器 tag（量到：`katana` 13 · `sword` 12 · `greatsword` 4 ·
 * `claw` 5 · `fist` 12 · `bow` 4 · `thrown` 4）。
 * ⇒ 覆蓋率從「有人手動綁的 22 個」變成「**有武器 tag 的都有**」，
 * ⛔ 而新英雄上架時不必再有人記得去加一列。
 *
 * ⚠️ ⭐ 對照表**整份是資料**（`config.ambient-vfx@1` 的 `attackTrail`）——
 * 這個檔裡沒有任何一句寫著「katana 要放哪一道光」。
 */

/** 一個武器 tag 的殘影設定。 */
export interface AttackTrailEntry {
  /** 放哪一份 `vfx@1`。 */
  readonly vfxId: string;
  /** 相對身體的高度（揮擊的高度）。 */
  readonly y?: number;
}

export interface AttackTrailConfig {
  readonly enabled: boolean;
  /** 武器 tag → 殘影。⭐ 順序＝優先序（第一個對上的贏）。 */
  readonly byWeaponTag: readonly (AttackTrailEntry & { readonly tag: string })[];
  /**
   * 兩次殘影之間至少隔多久（毫秒）。
   * ⚠️ ⭐ 攻速上限是 **10**（CLAUDE.md），⇒ 沒有節流的話一秒十道刀光疊在一起，
   * 而那比完全沒有更難讀 —— ⛔ 這不是體感微調，是承重的。
   */
  readonly minGapMs: number;
}

/**
 * 這一具身體揮擊時該放哪一道殘影。`null` ＝ 沒有武器 tag（拳／弓／沒標）。
 *
 * ⚠️ ⭐ 只讀 tag，⛔ 不讀 modelKey —— 那正是舊做法擋住 49 位英雄的地方。
 */
export function trailForTags(
  cfg: AttackTrailConfig,
  tags: readonly string[] | undefined,
): AttackTrailEntry | null {
  if (!cfg.enabled || !tags || tags.length === 0) return null;
  const owned = new Set(tags);
  for (const row of cfg.byWeaponTag) if (owned.has(row.tag)) return row;
  return null;
}

/**
 * 節流器。⭐ 逐**身體**記時 —— ⛔ 不是全域一個閘：
 * 兩位英雄同時揮劍時，全域節流會讓其中一位靜靜地沒有刀光。
 */
export class AttackTrailThrottle {
  private readonly lastMs = new Map<number, number>();

  /** 這一具身體現在可不可以放？可以就記時並回 true。 */
  allow(entityId: number, nowMs: number, minGapMs: number): boolean {
    const prev = this.lastMs.get(entityId);
    if (prev !== undefined && nowMs - prev < minGapMs) return false;
    this.lastMs.set(entityId, nowMs);
    return true;
  }

  /** 換一場／身體退場。 */
  forget(entityId: number): void {
    this.lastMs.delete(entityId);
  }

  reset(): void {
    this.lastMs.clear();
  }
}
