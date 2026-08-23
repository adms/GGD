/**
 * ⛔ **一張寫著「[主動]」的卡，按下去必須真的跑一段效果。**（GH#563）
 *
 * ── 這個檔為什麼存在（owner 2026-08-23 逐字裁決）────────────────────────────
 *
 * > 應該要有空陣列檢查放在 build 裡面硬卡關 => effects 是空陣列的上架技能要在
 * > content:build 就被擋下來，**⛔ 不是一條事後才紅的測試**
 *
 * 在此之前這條規則**只**住在 `abilityPressPayload.test.ts` 裡，而那是一條**事後**
 * 才紅的測試：內容作者（或 Codex 編輯器）存了一支空技能、跑 `pnpm content:build`
 * 會 **EXIT 0**，`bundle.json` 照樣把它烘進去，要等到有人剛好跑那一支 vitest 才知道。
 * ⇒ 規則抽到這裡，**測試與 `scripts/buildIndexes.ts` 讀同一支函式**，
 * 於是它在**編輯發生的當下**響（CLAUDE.md：「只在遠離現場的地方響的警報不是守衛」）。
 *
 * ⚠️ 抽出來的是**規則**，⛔ 不是把測試搬家 —— 測試留著，它與 build 共用這一支，
 * 所以兩邊不可能分岔（分岔正是「同一份知識兩個住處」那條守則要防的東西）。
 *
 * ── 它問的一句話 ──────────────────────────────────────────────────────────
 *
 * **這一格按下去，`runEffects` 會不會拿到東西？**
 *
 * ⚠️ GH#563 的原始前提是**錯的**，而錯法本身就是這條閘存在的理由：票上寫
 * 「四張上架卡的 `effects` 是空陣列」。實測那四支的 `effects` 在**磁碟上**是空的，
 * 內容住在 `template.ref` 裡，`registerAll` 會把它展開（`content/templates/resolve.ts`）。
 * 掃磁碟 JSON 會得到 **69 個假的空技能** —— 失敗形態⑤「被測的不是出貨的那個」。
 * ⇒ ⭐ 這條閘讀的是**登錄表裡那一份**（呼叫端要先 `registerAll(store)`）。
 *
 * ── 判準：⛔ 保守，寧可漏報不可誤報 ────────────────────────────────────────
 *
 * 只收**證明得出來**的那一種：`sim/abilities/abilitySystem.ts`
 * `if (isPassiveOnly(def)) return "passive"` —— `isPassiveOnly` 逐字是
 * 「有 `passive` 區塊而且 `effects.length === 0`」，所以空 `effects` 的那一格
 * **在付出任何成本之前**就被擋掉，按下去連冷卻都不會轉。
 *
 * ⭐ **豁免是推導的，⛔ 不是一張手寫清單**（`tag.startsWith("主動")`）：
 *   · `[被動]` / `[靈氣]` —— 載體是 `passive`，`effects` 空是**正確**的慣用法
 *     （出貨樹上 69 支如此）。它們的標籤不以 `主動` 開頭 ⇒ 天然不收
 *   · ⛔ `[輔助]`（83 支）刻意不收 —— 出貨內容裡它有兩個讀法，`godie-h02u.passive`
 *     與 `godie-o02p.passive` 是掛著 `[輔助]` 的**天生被動**，收了就是兩筆誤報
 *   · ⛔ `[切換]` 不收 —— 切換技的載體是 `toggle.whileOn`，⛔ 不是 `effects`
 *
 * ⚠️ 剖析之前先剝掉 `「…」`（第〇·六守則②，角色對白不是效果）—— 這裡用
 * `descriptionClaims.mechanicsText`，⛔ 不自己再寫一份正則。
 *
 * ── 棘輪：⛔ 只准降 ────────────────────────────────────────────────────────
 * {@link KNOWN} 今天是**空的**（全樹 0 支）。冒出新的一支 → `content:build` 非零離開；
 * 名單上的修好了 → 測試紅。⛔ 要放行新的一列必須先開 issue 並把編號寫在那一列上。
 */
import type { AbilityDef } from "../sim/content/defs";
import { Abilities, Champions, championPassive } from "../sim/content/registry";
import { leadTags, mechanicsText } from "./descriptionClaims";

/** 一支「卡面說主動，而引擎收不到效果」的技能。 */
export interface PressPayloadHit {
  /** `<abilityId>|active-card-nothing-on-press` —— 棘輪與訊息共用的鍵。 */
  readonly key: string;
  /** 人看的定位：`英雄名（英雄 id）槽位`。 */
  readonly where: string;
  /** 為什麼它按下去不會發生事。 */
  readonly why: string;
}

/**
 * ⛔ 只准變短。一列一個，每一列要有 issue 編號（第零守則⑧：順手發現的缺陷開票，
 * ⛔ 不當場修，⛔ 也不無聲放行）。
 */
export const KNOWN: readonly { key: string; why: string; issue: string }[] = [];

type Def = AbilityDef & { description?: string };

/**
 * 卡面承諾「按下去會發生事」的標籤 —— 從標籤文字**推導**，⛔ 不是白名單。
 * 回傳那個標籤（進錯誤訊息用），沒有就 `undefined`。
 */
export const promisesPress = (desc: string | undefined): string | undefined =>
  leadTags(mechanicsText(desc ?? "")).find((t) => t.startsWith("主動"));

/**
 * 掃**登錄表**（⛔ 不是磁碟 JSON）裡每一位英雄的 PASSIVE/Q/W/E/R/EX 六格。
 *
 * ⚠️ 呼叫**之前**必須先 `registerAll(store)` —— 沒有那一步，模板技能的 `effects`
 * 全部是空的，這支會回報 69 個幽靈（失敗形態⑤）。
 */
export function findActiveCardsWithNoPayload(): PressPayloadHit[] {
  const hits: PressPayloadHit[] = [];
  for (const cid of Champions.ids().sort()) {
    const c = Champions.get(cid);
    const ex = (c as unknown as { exAbility?: string }).exAbility;
    const slots: Readonly<Record<string, Def | undefined>> = {
      PASSIVE: championPassive(cid) as Def | undefined,
      Q: c.abilities.Q as Def | undefined,
      W: c.abilities.W as Def | undefined,
      E: c.abilities.E as Def | undefined,
      R: c.abilities.R as Def | undefined,
      EX: ex ? (Abilities.tryGet(ex as never) as Def | undefined) : undefined,
    };
    for (const [slot, def] of Object.entries(slots)) {
      if (!def) continue;
      const tag = promisesPress(def.description);
      if (tag === undefined) continue;
      if ((def.effects ?? []).length > 0) continue;
      hits.push({
        key: `${def.id}|active-card-nothing-on-press`,
        where: `${c.name}（${cid}）${slot}`,
        why:
          `卡面標籤列寫著 [${tag}]，而展開後的 effects 是空的 —— ` +
          `abilitySystem.ts 的 isPassiveOnly() 會把這一次施放擋成 "passive"，按下去不會執行任何東西`,
      });
    }
  }
  return hits;
}

/** 扣掉 {@link KNOWN} 之後真正該擋下的那些。 */
export function unknownPressPayloadHits(hits: readonly PressPayloadHit[]): PressPayloadHit[] {
  const allowed = new Set(KNOWN.map((k) => k.key));
  return hits.filter((h) => !allowed.has(h.key));
}

/**
 * 給 `content:build` 印的那一段。⚠️ 訊息要**指名那一支技能與那個標籤**，
 * ⛔ 不是「有 N 支壞了」—— 第一行錯誤指著別的東西正是 2026-08-01 那次的代價。
 */
export function pressPayloadFailureReport(hits: readonly PressPayloadHit[]): string {
  const lines = hits.map((h) => `  - ${h.key}\n      ${h.where}\n      ${h.why}`);
  return (
    `\n✖ ${hits.length} 支上架技能的卡面說「主動」而引擎收不到任何效果 ` +
    `—— 索引與 bundle 都沒有重建：\n\n${lines.join("\n")}\n\n` +
    "這是第一·五守則的紅線：卡面上不可以有「說了但不會發生」的字。\n" +
    "三條出路（照順序試）：① 補上真的會跑的 effects（或 template.ref）\n" +
    "② 這一支其實是被動 ⇒ 把標籤列從 [主動…] 改成 [被動]／[靈氣]\n" +
    "③ 真的要暫時放行 ⇒ 先開 issue，再把那一列寫進 " +
    "packages/shared/src/content/abilityPressPayload.ts 的 KNOWN（要帶票號）\n"
  );
}
