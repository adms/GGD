/**
 * guardianRecoilBus —— 「守衛塔**自己**動一下」這件事的接線（GH#567）。
 *
 * owner 2026-08-23：「請補上該物件**伸縮抖一下**然後出現**投射物飛向被攻擊方**
 * 的攻擊效果吧」。投射物住在 `GuardianVolleyFx`（特效層自己畫得出來），
 * 但「伸縮」動的是**守衛的模型**，而模型住在 `render/views/GuardianView`。
 *
 * ⚠️ 這兩層之間**沒有**現成的通道：`VfxContext` 只給得到座標
 * （`entityPos`），⛔ 給不到 `TransformNode`。把 `EntityViewRegistry` 注進
 * 特效層會讓特效層開始擁有實體視圖（那是一條會長很大的新相依），
 * 所以這裡走的是**最小的那一種**：一張以 entityId 為 key 的脈衝表 ——
 * 特效層**寫**，`GuardianView.update()` 每幀**讀**。
 *
 * ⭐ 它是純資料 + 純函式：沒有 Babylon、沒有 scene、沒有 RNG，
 * 所以「發射了 ⇒ 塔的縮放真的變了」可以被純測試釘住。
 *
 * ⛔ 這不是一個「全域可變狀態」的偷懶版本：脈衝**自己會過期**
 * （`nowMs − startMs >= durMs` 就從表裡刪掉），而且 `clearGuardianRecoils()`
 * 掛在回合邊界上 —— 一張只長不縮的表正是 GH#270 那一族的形狀。
 */
import { recoilScale, wakeScale, RECOIL_IDENTITY, type RecoilScale } from "./guardianVolley";

interface Pulse {
  startMs: number;
  durMs: number;
  /** 發射（幅度全開）還是醒來（幅度一半） */
  kind: "fire" | "wake";
}

const pulses = new Map<number, Pulse>();

/**
 * 開一發脈衝。同一座塔已經在動的話**覆蓋**它（⛔ 不排隊）：
 * 齊射的節奏比動畫快時，排隊會讓塔一直在演上一發，而玩家要看的是**這一發**。
 */
export function pulseGuardian(id: number, nowMs: number, durMs: number, kind: Pulse["kind"]): void {
  if (!Number.isFinite(id) || !(durMs > 0)) return;
  pulses.set(id, { startMs: nowMs, durMs, kind });
}

/** 這一幀這座塔的縮放倍率（沒有脈衝 = 恆等，⛔ 不配置物件）。 */
export function guardianRecoilAt(id: number, nowMs: number): RecoilScale {
  const p = pulses.get(id);
  if (!p) return RECOIL_IDENTITY;
  const u = (nowMs - p.startMs) / p.durMs;
  if (u >= 1 || u < 0) {
    pulses.delete(id);
    return RECOIL_IDENTITY;
  }
  return p.kind === "wake" ? wakeScale(u) : recoilScale(u);
}

/** 回合邊界 / 離場：把表清空（⛔ 不要讓它跨回合長大）。 */
export function clearGuardianRecoils(): void {
  pulses.clear();
}

/** 測試/診斷用：現在有幾座塔在動。 */
export function guardianRecoilCount(): number {
  return pulses.size;
}
