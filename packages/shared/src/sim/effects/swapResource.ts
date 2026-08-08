/**
 * `swapResource` —— **交換雙方的一項資源**。
 *
 * 擋住 44-002 交換筆記本「讓自己跟指定的敵人[現存生命]作[交換]」。
 *
 * ── 計畫 §16.16 建議的模型（照做） ───────────────────────────────────────
 * 在 cast resolve 的那個 tick **原子交換**雙方的當前值，各自夾到
 * `[clampMin, 自己的上限]`，**目標失效則全招失敗**。
 *
 * ── ⛔ 為什麼不走傷害／治療佇列 ──────────────────────────────────────────
 * 交換不是傷害也不是治療：走 `damageQueue` 會吃護甲、會觸發 onDamageTaken、
 * 會被護盾吃掉一半 —— 交換完的兩條血條就不再是對方原本的那一條，而卡上寫著
 * 「交換」。走 `healTarget` 則會被【重創】的 `healingTakenMult` 打折。
 * 所以這裡直接寫 `hp.hp`，而**這是安全的**：`clampMin` 的預設 1 保證交換
 * 永遠不會殺人，因此不需要死亡路徑（`devour` 需要，因為它就是要殺人）。
 * ⚠️ 把 `clampMin` 設成 0 就打開了「交換到 0 血」—— 那時死亡由既有的
 * `deathSystem` 在同一 tick 稍後解算，仍然只有一條死亡定義。
 *
 * ── 三個決策點都是欄位（第一守則） ───────────────────────────────────────
 * ① `resource`        交換哪一項（health / mana）
 * ② `clampMin`        夾住的下限（預設 1 = §16.16 的建議，不殺人）
 * ③ `onInvalidTarget` 目標失效時：`"abort"`（預設，全招失敗）或 `"skip"`
 *
 * ── 原子性 ────────────────────────────────────────────────────────────────
 * `"abort"` 是**先驗後改**：任何一個解析出來的目標不合格 → 一格都不動。
 * 邊改邊檢查的寫法會留下「換了一半」的世界狀態，而那是一種沒有人寫得出
 * 卡片文案的東西。
 *
 * ── purity ────────────────────────────────────────────────────────────────
 * 無 rng、無時鐘、無三角函式；目標順序由 `shapeTargets` 給的全序決定。
 */
import type { EffectKindSpec } from "./effectKind";
import { shapeTargets } from "./shapeTargets";

export const swapResourceEffect: EffectKindSpec<"swapResource"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const mine = world.health.get(ctx.caster);
    if (!mine?.alive) return;

    const floor = e.clampMin ?? 1;
    const isMana = (e.resource ?? "health") === "mana";
    const read = (h: { hp: number; mana: number }): number => (isMana ? h.mana : h.hp);
    const capOf = (h: { maxHp: number; maxMana: number }): number =>
      isMana ? h.maxMana : h.maxHp;

    const targets = shapeTargets(e, ctx).filter((id) => id !== ctx.caster);
    const ok = targets.filter((id) => world.health.get(id)?.alive === true);

    // 「目標失效則全招失敗」—— 先驗，一個不合格就整段不做。
    if ((e.onInvalidTarget ?? "abort") === "abort" && ok.length !== targets.length) return;
    if (ok.length === 0) return;

    for (const id of ok) {
      const theirs = world.health.get(id)!;
      const a = read(mine);
      const b = read(theirs);
      // 原子：兩個讀數都先取好，再各自夾到**自己的**上限。
      const toMe = Math.max(floor, Math.min(b, capOf(mine)));
      const toThem = Math.max(floor, Math.min(a, capOf(theirs)));
      if (isMana) {
        mine.mana = toMe;
        theirs.mana = toThem;
      } else {
        mine.hp = toMe;
        theirs.hp = toThem;
      }
    }
  },
};
