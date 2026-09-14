/**
 * valhallaCard —— 英靈殿卡片上**要印的字**，抽成純函式（GH#1258）。
 *
 * ⭐ 為什麼抽出來：卡片的完整版只在 `advance()`（一個 useEffect）跑過之後才畫得出來，
 * `renderToStaticMarkup` 只拿得到骨架 ⇒ 閘要驗「英靈殿名單上每一位印出來的字」就得跑
 * **出貨的**這幾支，⛔ 不是在測試裡再抄一份判斷（失敗形態⑤／⑥）。
 * `ValhallaPanel.tsx` 與 `valhallaShippedRoster.test.ts` 讀的是同一份。
 *
 * ── 三個被修掉的病（2026-09-14 英靈殿稽核，GH#1258）──────────────────────
 *  ① 出身／距離行被 tooltip 的 `empty` 判準連帶藏掉 —— `empty` 問的是「內容那兩行都沒填」，
 *     而出身行是**推導的、永遠有值**（`pitchTooltip.ts` 的 `headlineTail`）。
 *     ⇒ 81 位沒填 `playstyle`／`pitch` 的新英雄連出身都不見了。
 *     ⭐ 現在：出身行永遠畫；`playstyle`／`pitch` 有才畫（⛔ 不填佔位字，`championPitch.ts` 的規矩）。
 *  ② 技能列印 `rawName`（`20-02 感知能力`）與字面 `PASSIVE` —— 選人畫面早就用
 *     `slotLabel(slot)` ＋ `name`（去編號）那一組，英靈殿沒讀它。
 *  ③ 故事區的字 —— 見 {@link valhallaBlurb}；開發者流程樣板是**內容**的問題，
 *     修在內容（GH#1258 另一個 commit），閘在 `valhallaShippedRoster.test.ts`。
 */
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import { championDisplayFor } from "./championDisplay";
import {
  championDescription,
  parseDescriptionSections,
} from "../panels/champselect/championProfile";
import { slotLabel, type SkillRow } from "../panels/skillDetails";
import { pitchTooltipForChampion } from "../panels/champselect/pitchTooltip";

/** 技能列的一顆標籤：「天生」/「Q」… ＋ 去編號的技能名。 */
export interface ValhallaSkillChip {
  /** React key —— 仍用編號名（它是唯一的），⛔ 但不印出來 */
  key: string;
  label: string;
  name: string;
}

export function valhallaSkillChip(row: Pick<SkillRow, "slot" | "name" | "rawName">): ValhallaSkillChip {
  return { key: `${row.slot}-${row.rawName}`, label: slotLabel(row.slot), name: row.name };
}

/** 故事框的字：地圖的「故事」段；沒有分段標題時整份描述；都沒有時退回顯示層的 blurb。 */
export function valhallaBlurb(def: ChampionDef): string {
  const description = championDescription(def);
  const sections = parseDescriptionSections(description);
  const story = sections.story ?? (sections.hasSections ? "" : (description ?? ""));
  return story || championDisplayFor(def.id).blurb;
}

/** 身分區的出身行（永遠有）＋ 兩行內容（沒填就是 null）。 */
export interface ValhallaPitchLine {
  /** `鬥士 (近戰・中距離)` —— 推導的，⛔ 不會缺 */
  headline: string;
  playstyleLine: string | null;
  pitch: string | null;
}

export function valhallaPitchLine(def: ChampionDef): ValhallaPitchLine {
  const tip = pitchTooltipForChampion(def);
  return { headline: tip.headlineTail, playstyleLine: tip.playstyleLine, pitch: tip.pitch };
}
