/**
 * markModel —— 【具名標記】的顯示層（GH#278 / 52-00【十二道試煉】）。
 *
 * owner:「[試煉] 可以是任意技能的標記 like [風王結界] [縮地]」
 *      「都可以任意替換設定為 [技能編號/buff/debuff狀態]」
 *
 * 所以一個標記**沒有自己的名字**：它的 `markId` 就是一份既有文件的 id（一個技能
 * 編號，或一個 status-effect id），名稱與圖示要去那份文件上拿。這一條是這個檔案
 * 存在的主要理由 —— #202「商店顯示 raw item ID」就是漏掉這一步的樣子，而標記比
 * 道具更容易踩：`godie-hapm.passive` 畫在血條旁邊，玩家完全讀不出那是「試煉」。
 *
 * ⚠️ 數字**不住在這裡**。層數是 sim 算的（`packages/shared/src/sim/marks.ts`），
 * 走 `markChanged` / `lethalSaved` 兩顆事件上線，這裡只做「wire → 螢幕」的投影。
 * 12 這個初始層數是 owner 每週在改的內容值，它住在 ability 文件裡，不在這一層，
 * 也不在這一層的測試裡。
 *
 * 全部是純函式（無 DOM、無 store、無計時器），跟 `selfStatusModel` 同一個形狀。
 */
import { StatusEffects } from "@ggd/shared/content/registries";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";

/** store 裡一個標記的樣子（RoomStore.HudState.marks 的元素）。 */
export interface MarkView {
  /** 一份既有文件的 id：技能編號 或 status-effect id */
  markId: string;
  /** 目前層數（sim 給的，含 0 —— 0 是「你沒有免死了」這個很重要的訊息） */
  count: number;
  /** 每次收到事件 +1，讓 React 重播那一格的閃動 */
  seq: number;
  /** 最後一次免死攔截發生的 `performance.now()` 時刻；沒發生過是 null */
  savedAtMs: number | null;
}

/**
 * 免死攔截之後那一格要亮多久。純表演值 —— 它決定的只是「什麼時候停止畫」，
 * 跟 sim 的內部冷卻（`MarkLethalRule.internalCooldown`）沒有關係，也不可以被
 * 拿來推論它。
 */
export const MARK_SAVE_FLASH_MS = 1800;

/** 一次畫幾格就不再是「一眼看得懂」。 */
export const MARK_MAX_ROWS = 4;

/** 標記借來的那份文件的門面。 */
export interface MarkIdentity {
  /** 中文名；查不到才退回 markId */
  label: string;
  /** content/ 相對路徑；沒有就 null（呼叫端畫字母替身） */
  icon: string | null;
  /** 這個 id 在登錄表裡找得到嗎 —— 呼叫端可以據此低調處理 */
  known: boolean;
}

/**
 * markId → 名稱 / 圖示。
 *
 * 順序是 abilities 先、status-effects 後，因為 owner 的例子（[風王結界][縮地]）
 * 全是技能編號；兩個登錄表的 id 空間不重疊，所以順序其實只影響查表次數。
 *
 * ⚠️ **查不到不可以爆炸，也不可以留白**。標記是可以指向任何文件的，而內容是
 * live bind-mount：一份還沒上線的文件會讓這裡查空。退回 `markId` 是難看但誠實，
 * 空字串則是「那一格消失了」——後者才是缺陷。
 */
export function markIdentity(markId: string): MarkIdentity {
  const ability = Abilities.tryGet(markId as AbilityId);
  if (ability) return { label: ability.name, icon: ability.icon ?? null, known: true };
  const status = StatusEffects.tryGet(markId);
  if (status) return { label: status.name, icon: status.iconKey ?? null, known: true };
  return { label: markId, icon: null, known: false };
}

/** HUD 上真的畫出來的一列。 */
export interface MarkRow {
  /** React key */
  markId: string;
  label: string;
  icon: string | null;
  count: number;
  /** 剛剛才靠這個標記免死 —— 那一格要亮 */
  saving: boolean;
  /** 一層都不剩了：下一次致命傷就是真的死 */
  empty: boolean;
  seq: number;
}

/**
 * PURE：把**快照上的**具名計數器（GH#304 的 `SeatState.counterIds` /
 * `counterCounts`）變成這一支已經在畫的 {@link MarkView}。
 *
 * ⭐ **層數的數字從這裡來，不再從事件來。** 事件是瞬間的：一個中途加入或重連
 * 的客戶端沒有事件歷史，於是十二道試煉的 12 條命在 socket 眨一下之後從 HUD 上
 * 整個消失。快照沒有這個問題 —— 它是**狀態**，第一份 patch 就帶著全部。
 *
 * 事件（`RoomStore.recordMarkEvent`）留下來的只剩一件事：`savedAtMs` ——
 * 「剛剛靠它免死了」那一下的閃動。那是一個**表演**，本來就不該在重連之後還亮
 * 著，所以它正確地只活在事件裡。`seq` 同理（重播閃動用）。
 *
 * ⚠️ 兩條陣列 index-aligned。少一半的那一筆是投影缺陷，不是計數器 —— 丟掉，
 * 跟 `selfStatusModel` 對「有 tick 沒 id」的處理一字不差。
 */
export function markViewsFromWire(
  counterIds: readonly string[] | undefined,
  counterCounts: readonly number[] | undefined,
  flashes: readonly MarkView[],
): MarkView[] {
  if (!counterIds || counterIds.length === 0) return [];
  const views: MarkView[] = [];
  for (let i = 0; i < counterIds.length; i++) {
    const markId = counterIds[i];
    if (!markId) continue;
    const count = counterCounts?.[i];
    if (count === undefined || !Number.isFinite(count) || count < 0) continue;
    const flash = flashes.find((f) => f.markId === markId);
    views.push({
      markId,
      count: Math.trunc(count),
      seq: flash?.seq ?? 0,
      savedAtMs: flash?.savedAtMs ?? null,
    });
  }
  return views;
}

/**
 * PURE：這一幀該畫哪幾列。
 *
 * 排序是「快用完的排前面」（層數少的優先），因為玩家在戰鬥中要問的是
 *「我還剩幾條命」，不是「我身上有幾種標記」。同層數再用 markId 穩定排序。
 */
export function markRows(marks: readonly MarkView[], nowMs: number): MarkRow[] {
  const rows: MarkRow[] = [];
  for (const m of marks) {
    if (!m.markId) continue;
    const id = markIdentity(m.markId);
    const age = m.savedAtMs === null ? Number.POSITIVE_INFINITY : nowMs - m.savedAtMs;
    rows.push({
      markId: m.markId,
      label: id.label,
      icon: id.icon,
      count: m.count,
      saving: age >= 0 && age < MARK_SAVE_FLASH_MS,
      empty: m.count <= 0,
      seq: m.seq,
    });
  }
  rows.sort((a, b) => (a.count !== b.count ? a.count - b.count : a.markId < b.markId ? -1 : 1));
  return rows.slice(0, MARK_MAX_ROWS);
}

/**
 * 免死攔截當下浮在身上的那一行字：「試煉 ×11」。
 *
 * 名字來自文件，數字來自事件 —— 兩邊都不是這裡寫死的。乘號用全形 `×` 而不是
 * `x`，因為它跟中文名同寬，在浮動文字那個字級下不會歪一格。
 */
export function markSaveText(markId: string, remaining: number): string {
  return `${markIdentity(markId).label} ×${Math.max(0, Math.trunc(remaining))}`;
}

/** 顏色一處定義，面板與守衛不可能各講各的。 */
export const MARK_COLORS = {
  saving: "#ffe08a",
  empty: "#ff4d6d",
  normal: "#8fd3ff",
} as const;

export function markColor(row: MarkRow): string {
  if (row.saving) return MARK_COLORS.saving;
  if (row.empty) return MARK_COLORS.empty;
  return MARK_COLORS.normal;
}
