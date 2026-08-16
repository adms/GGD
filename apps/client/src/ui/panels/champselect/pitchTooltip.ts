/**
 * pitchTooltip —— 滑鼠移到英雄上時那張**簡短介紹**（owner 2026-08-16）。
 *
 * ```
 * 揍敵客桀諾｜鬥士 (近戰・中距離)      ← 標題：⭐ 全部推導，一格都沒存
 *   攻速・暗殺・追擊                   ← 核心玩法（英雄卡 `playstyle`）
 *   高速貼住指定目標，以密集攻擊…       ← 選角說明（英雄卡 `pitch`）
 * ```
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 這是**新增的一層，不是取代** —— owner 2026-08-16：「不要取代或刪除舊內容與格式」
 * ─────────────────────────────────────────────────────────────────────────────
 * 底下這些**全部原樣留著**，這張 tooltip 只是多長出來的一片：
 *   · 英雄卡的 `description`（w3x 匯入的 故事／推薦玩家／上手度／角色成長）
 *   · 卡片上那行 `role · tags`（`marksman · wc3-import · …`）
 *   · 英靈殿身分區的 `近戰 · N 個技能格`
 *   · 身分標題的出身徽章（{@link originBadge}）與玩法 tab 的「系統推斷」
 *
 * ⚠️ 尤其**不要**把它跟 `originBadge` 合併看待。兩者輸入不同：
 * 出身徽章讀三圍推導、講「屬性骨架」；這一張讀 owner 手寫的設計意圖、
 * 講「你要怎麼玩他」。海克力斯的「多次復活・消耗敵方資源」在三圍裡看不出來，
 * 在技能標籤裡也看不出來 —— 它只存在於 owner 的腦子裡，所以它是**內容**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 標題那一行為什麼是推導的（而不是第三個手填欄位）
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 的表把「鬥士 (近戰・中 1.6)」寫成一欄，最省事是整串存進英雄卡。
 * ⛔ 但攻擊距離**已經有一張對照表**（owner 2026-08-16：「我們已經有個對照表
 * 你應該知道」）——出身住 `champion@1.origin`、尺標住 `scaleByOrigin`、
 * 級距住 `byOrigin.range`、絕對值住 `bandsByScale`。再抄一份給人看的字串
 * 就是**第五個住處**，而它跟前面四個之間沒有任何守衛。
 *
 * 那四個東西**這個月各動過一次**（出身 36/49 位重指派、尺標從 `attackType`
 * 換成出身、級距表重寫、移速上限改兩次）⇒ 抄下來的字串會在第一次改動之後
 * 開始說謊，而且是**玩家看得到、測試看不到**的謊。
 *
 * ⇒ 這裡只查表。owner 把砲手的射程級距從「極大」改成「大」，整排 tooltip 自己變。
 */
import { Configs } from "@ggd/shared/content";
import {
  STAT_NORMALIZATION_DOC_ID,
  statNormalizationFromDoc,
} from "@ggd/shared/content/statNormalization";
import {
  PLAYSTYLE_SEPARATOR,
  championPitchOf,
  type ChampionPitch,
} from "@ggd/shared/content/championPitch";
import { splitChampionName } from "../../codex/codexData";

/** 核心玩法那一行的顏色。⛔ 刻意沿用出身徽章的藍 —— 兩者都是「身分」不是「觀察」。 */
export const PITCH_ACCENT = "#8fb8e0";

export interface PitchTooltip {
  /** `揍敵客桀諾｜鬥士 (近戰・中距離)` */
  title: string;
  /**
   * `鬥士 (近戰・中距離)` —— 標題**去掉短名**的那一半。
   *
   * ⚠️ 給的是英靈殿那種「名字已經印在上面一行」的版面：那裡再印一次短名是重複，
   * 但出身與距離仍然要有。⛔ 不要為此在呼叫端切 {@link title} 的字串。
   */
  headlineTail: string;
  /** `攻速・暗殺・追擊`；⛔ 沒填就是 `null`（整行不畫，不編一組） */
  playstyleLine: string | null;
  /** 選角說明；⛔ 沒填就是 `null`（不編一句） */
  pitch: string | null;
  /** 三行全是空的 ⇒ 呼叫端整張 tooltip 不畫（`disabled`） */
  empty: boolean;
}

/** ⚠️ owner 的範例用全形直線分隔短名與出身。 */
export const TITLE_SEPARATOR = "｜";

/**
 * 純函式：英雄卡 + 正規化設定 → tooltip 的三行。
 *
 * ⚠️ 短名走 `splitChampionName` —— 那是「稱號 - 全名」的**唯一**一條規則，
 * 跟圖鑑、身分標題、大廳商店共用。⛔ 不要在這裡再寫一個 `split(" - ")`。
 */
export function pitchTooltipFrom(
  def: Parameters<typeof championPitchOf>[0] & { name?: unknown },
  cfg: Parameters<typeof championPitchOf>[1],
): PitchTooltip {
  const p: ChampionPitch = championPitchOf(def, cfg);
  const rawName = typeof def.name === "string" ? def.name.trim() : "";
  const shortName = rawName === "" ? "" : splitChampionName(rawName).fullName;
  const title =
    shortName === "" ? p.headline : `${shortName}${TITLE_SEPARATOR}${p.headline}`;
  const playstyleLine =
    p.playstyle.length === 0 ? null : p.playstyle.join(PLAYSTYLE_SEPARATOR);
  return {
    title,
    headlineTail: p.headline,
    playstyleLine,
    pitch: p.pitch,
    // ⛔ 標題永遠有東西（出身是推導的，不會缺），所以「空」的判準是**內容那兩行**。
    //   兩行都沒有時只剩一個出身標籤 —— 那是玩家在卡片上已經看得到的資訊，
    //   為它彈一張 tooltip 只是擋住畫面。
    empty: playstyleLine === null && p.pitch === null,
  };
}

/** 現行設定 —— 從**內容**讀（第一守則：改一格是後台的事，不是一次部署）。 */
export function pitchTooltipForChampion(
  def: Parameters<typeof pitchTooltipFrom>[0],
): PitchTooltip {
  return pitchTooltipFrom(def, statNormalizationFromDoc(Configs.tryGet(STAT_NORMALIZATION_DOC_ID)));
}
