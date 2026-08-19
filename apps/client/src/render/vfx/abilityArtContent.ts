/**
 * 逐技能特效綁定的**唯一住址**（GH#384）—— `config.vfx-ability-art@1` 的讀取端。
 *
 * ⚠️ 在這之前，617 筆「這支技能 id → 這組特效參數」住在三張 TypeScript 常數表裡
 * （`bindings.ts` 325 筆分類 · `w3xFamilyArt.ts` 258 筆證據 · `w3xAbilityArt.ts`
 * 34 筆晉升）。三張表都是**內容**，而它們的住址讓兩件事同時是真的：
 *
 *   · 改一支技能的特效 = 一次完整部署（client 是 build 時烘進映像的）
 *   · ⛔ 外部編輯器看不到它們，**而且不會知道自己漏了**（第〇·五守則的對外契約紅線）
 *
 * ⭐ **這一支只做「讀」。** 逐 id 的資料一筆都不在這裡 —— 它們在
 * `content/config/vfx-ability-art.json`。守衛
 * `artTablesLiveInContent.test.ts` 掃 AST，把任何一筆塞回 TS 就會紅。
 *
 * THE SEAM。與 `setFamilyTuning` 同一條縫、同一個呼叫端（`ContentDb.load()`），
 * 所以三個消費模組（`bindings` / `w3xFamilyArt` / `w3xAbilityArt`）的函式簽章
 * 一個都沒有變 —— ⛔ 這次搬家不改任何渲染路徑。
 *
 * ⚠️ FAIL-LOUD，不是 fail-open。文件缺席時每一支技能都會掉回通用替身，而那看起來
 * 跟「特效沒做好」一模一樣（第二守則：fail-open 沒錯，**靜默**才是缺陷）。
 * 所以 {@link setAbilityArtBindings} 收到 null／空表時會吼一行到 console，
 * 而那一行的形狀刻意與部署煙霧測試在讀的 `[client] content loaded:` 同一族。
 */
import type { ConfigVfxAbilityArtDoc, VfxAbilityArtRow } from "@ggd/shared/content";

const EMPTY: Readonly<Record<string, VfxAbilityArtRow>> = Object.freeze({});

let rows: Readonly<Record<string, VfxAbilityArtRow>> = EMPTY;

/** 每一次換文件都要作廢的衍生檢視（⛔ 不可以只作廢一半，那是漂移的來源）。 */
let derivedCaches: (() => void)[] = [];

/**
 * 註冊一個「文件換了就要重算」的快取清除器。
 *
 * ⭐ 消費模組自己記得清自己的快取是**做不到的**：它們沒有辦法知道文件何時換。
 * 所以清除的責任收在這裡一個地方，⛔ 不是散在三個模組各記一次。
 */
export function onAbilityArtBindingsChanged(invalidate: () => void): void {
  derivedCaches.push(invalidate);
}

/**
 * 出貨內容裡那一份，或 null（檔案不存在／schema 不合）。
 *
 * ⛔ null **不是**「沒有特效」的合法狀態 —— 它是一次內容載入失敗，
 * 而它的後果（每一支技能掉回通用替身）在畫面上與「還沒做特效」無法區分。
 */
export function setAbilityArtBindings(doc: ConfigVfxAbilityArtDoc | null | undefined): void {
  const next = doc?.bindings ?? null;
  if (!next || Object.keys(next).length === 0) {
    console.error(
      "[client] vfx ability art bindings MISSING (content/config/vfx-ability-art.json) — " +
        "every cast falls back to the generic placeholder. This is a content load failure, not a look.",
    );
    rows = EMPTY;
  } else {
    rows = next;
  }
  for (const invalidate of derivedCaches) invalidate();
}

/** 技能 id → 這一支的三層綁定。⛔ 唯讀。 */
export function abilityArtRows(): Readonly<Record<string, VfxAbilityArtRow>> {
  return rows;
}

/** 這一支技能的那一列，或 undefined。 */
export function abilityArtRow(abilityId: string | undefined): VfxAbilityArtRow | undefined {
  return abilityId ? rows[abilityId] : undefined;
}

/** ⚠️ 測試專用：把註冊表清空回未載入狀態。 */
export function resetAbilityArtBindingsForTest(): void {
  rows = EMPTY;
  for (const invalidate of derivedCaches) invalidate();
}
