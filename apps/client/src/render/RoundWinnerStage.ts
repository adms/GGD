/**
 * RoundWinnerStage — the ROUND-WIN half of the victory presentation (#143 model
 * + #93 灰色底/嘲諷台詞). At each ROUND-end it:
 *
 *   1. drops a GREY WASH over the arena (灰色底) — the colour drains out of the
 *      world while the winner keeps it,
 *   2. stands the round WINNER's champion model in the CENTRE of the screen
 *      (front-view) for a few seconds, above that wash,
 *   3. speaks that champion's own flavoured TAUNT and prints it as a subtitle.
 *
 * The wash is a DOM layer, not a Babylon post-process: the death-spectator
 * greyscale (#85) is a per-player, entity-driven effect on the scene, and wiring
 * a second, unrelated gate into it is how both end up stuck on. Every colour,
 * duration and z-index comes from render/victoryPresentation, which is also what
 * the match-win beat reads — so 灰色底 and 暗色底 can never converge.
 *
 * It reuses the champ-select / store model viewer (render/StorePreview, the
 * #129 loader + auto-framing) on its OWN overlay canvas + engine, so there is
 * NO new glb loader here: it renders whatever ModelDoc it is handed, orbiting a
 * grounded, framed figure on a dark card — lighter than the full match-win
 * settlement front-view (#93/#25), which stays the match-end owner.
 *
 * GameApp owns the TRIGGER (the phase edge into `resolution`, resolving the
 * winner from the SAME authoritative seats/teams the #142 VO reads); this class
 * owns only the overlay lifecycle, the model swap and the taunt, and reads no
 * state — pure presentation, deterministic-agnostic. It is LAZY: no canvas, no
 * WebGL context and no audio element exist until the first `show()`, and
 * `clear()` tears the whole thing back down so an idle round costs nothing.
 *
 * Headless-testable: the canvas, element and previewer factories plus the taunt
 * port are injectable, so the lifecycle (mount → show → swap → clear → dispose),
 * the wash and the taunt selection unit-test in the node env without a DOM, a
 * WebGL context or a single sound.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-03 —— 「回合勝利出現的 3d model 是勝利角色 但現在不是」(v0.9.27 迴歸)
 * ═══════════════════════════════════════════════════════════════════════════
 * 三件事一起讓「誰贏了」讀不出來,三件都變成 `config.victory-podium@1` 的欄位:
 *
 *   · **站位**(`podiumLayout`)。卡片位置本來只是 member index 的函式,所以三個人
 *     時螢幕正中央站的是**第二名** —— 而第二名依定義是這一回合倒下的人。
 *     出貨值改成 `centreFirst`(金正中、銀左、銅右)。
 *   · **大小 / 疊層**(`winnerScale`)。三張卡本來同尺寸、無 z-order。
 *   · **動作**(`clipGold` / `clipSilver` / `clipBronze`)。`StorePreview` 裡的
 *     `play("idle")` 是全檔唯一的 `.play(`,一個硬字串,而商店 / 選角試鏡 / 頒獎台
 *     共用那一支 previewer —— 所以「勝利」和「站在商店裡」播的是同一個剪輯。
 *     出貨值:金 `celebrate`、銀銅 `idle`。
 *
 * 而在此之前那份 config **完全沒有執行期消費端**:`resolveVictoryPodium` 是全 repo
 * 零呼叫端的,`planRoundWinnerShow` 的 `cfg` 預設值是寫死的常數。見
 * {@link victoryPodiumPolicy}。
 */
import type { ModelDoc } from "@ggd/shared/content";
import { Configs } from "@ggd/shared/content/registries";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import type { ClipState } from "./ClipAnimator";
import { StorePreview } from "./StorePreview";
import {
  victoryPresentation,
  ROUND_SUBTITLE_Z,
  ROUND_WASH_FADE_MS,
  ROUND_WASH_Z,
} from "./victoryPresentation";
import { victoryTaunts, type PlayTauntOptions, type VictoryTauntLine } from "../audio/victoryTaunt";
import { crownSvg, CROWN_PALETTE, type CrownMedal } from "./victoryCrown";
import {
  DEFAULT_VICTORY_PODIUM,
  VICTORY_PODIUM_SPACING_MAX,
  VICTORY_PODIUM_SPACING_MIN,
  resolveVictoryPodium,
  type ConfigVictoryPodiumDoc,
  type VictoryPodiumClip,
  type VictoryPodiumLayout,
  type VictoryPodiumPolicy,
  type VictoryRoundWinLine,
} from "@ggd/shared/content/schema/victoryPodium";
import { roundVictoryPodium, type PodiumSeatView } from "../ui/panels/victoryPodium";
import {
  roundEndQuoteChampion,
  roundWinnerTeamChampions,
  type RoundTeamView,
} from "../ui/panels/settlementModel";

/**
 * 現行的頒獎台政策 —— `content/config/victory-podium.json`,經
 * `resolveVictoryPodium` 解出來的那一份 (GH#257)。
 *
 * ⚠️ **這一支就是「後台改得到畫面」的那一段。** 在 2026-08-03 之前
 * `resolveVictoryPodium` 是全 repo **零 production 呼叫端**的:那份 JSON 存在、
 * 進了版控、進了 `zConfigDoc` union、進了 bundle —— 而 `planRoundWinnerShow` 的
 * `cfg` 預設值是寫死的 `DEFAULT_VICTORY_PODIUM` 常數。也就是說操作者把
 * `podiumSize` 改成 5、存檔、部署,畫面上還是三個人(失敗形態 ②:算出來了但
 * 從沒送到)。
 *
 * 讀 `Configs` 登錄表而不是 `ContentDb`:`render/**` 不持有 ContentDb,而登錄表
 * 正是 `ContentLoader` 在開機時把驗證過的文件放進去的地方 —— 也就是 game shard
 * `/healthz` 的 `content.ok` 讀的那一份。內容還沒載完 / 整份載失敗(骨架路徑)時
 * `tryGet` 回 undefined,於是退回出貨預設,**不是**退回一個空的頒獎台。
 *
 * 每一回合重讀一次(不是模組載入時算一次):內容在第一次 `resolution` 之前才載完
 * 是正常的,而快取一個「還沒載到」的答案會讓整場都用預設值。
 */
export function victoryPodiumPolicy(): VictoryPodiumPolicy {
  const doc = Configs.tryGet("victory-podium") as { schema?: string } | undefined;
  return resolveVictoryPodium(
    doc?.schema === "config.victory-podium@1" ? (doc as ConfigVictoryPodiumDoc) : null,
  );
}

/**
 * 名次 → 螢幕上的第幾格 (GH#257)。`out[memberIndex] = slotIndex`。
 *
 * `rank` 是 v0.9.27 寫死的那一種:`slot === index`,所以三個人時**正中央那一格
 * 是第二名**。玩家的眼睛先看中間,於是「誰贏了」讀起來是錯的 —— owner 2026-08-03
 * 「回合勝利出現的 3d model 是勝利角色 但現在不是」。
 *
 * `centreFirst` / `soloWinner` 把第一名放中間那一格(`floor((n-1)/2)`),之後
 * 左、右、左、右交錯填,越界的偏移直接跳過。n=3 → `[1, 0, 2]`(金正中、銀左、
 * 銅右);n=1 → `[0]`;n=2 → `[0, 1]`。純函式,所以「金在哪一格」測得到。
 */
export function podiumSlotOrder(total: number, layout: VictoryPodiumLayout): number[] {
  const n = Math.max(1, Math.floor(total));
  if (layout === "rank") return Array.from({ length: n }, (_, i) => i);
  const mid = Math.floor((n - 1) / 2);
  const out: number[] = [];
  for (let step = 0; out.length < n && step < 4 * n + 8; step++) {
    const k = Math.ceil(step / 2);
    const slot = step === 0 ? mid : mid + (step % 2 === 1 ? -k : k);
    if (slot >= 0 && slot < n && !out.includes(slot)) out.push(slot);
  }
  return out;
}

/**
 * 三張卡的**疏密** (GH#545)。owner 2026-08-22:
 * > 「勝利結算三個3d model 角色**靠在一起不要分那麼開**」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼「分那麼開」不是一個誰調錯的數字,而是一個結構性的形狀
 * ═══════════════════════════════════════════════════════════════════════════
 * 在這一格出現之前,每一格的中心是 `((slot + 0.5) / n) * 100` **百分比** ——
 * 也就是三張卡把**整個視窗寬度**均分,永遠是 16.7% / 50% / 83.3%。而卡片的
 * 寬度是 `min(vh, vw)`,在寬螢幕上由**高度**決定。兩者的單位不同,於是同一份
 * 設定在不同長寬比下疏密完全不一樣(量到的:16:9 桌機上卡片約 10.8vw、間距
 * 33.3vw ⇒ **相隔約 3.1 個卡片寬**;直式手機上卡片 29.3vw ⇒ 只隔 1.1 個)。
 * owner 在桌機上看到的正是那個 3.1。
 *
 * ⚠️ 所以修法**不是**把 `0.5` 抄進算式,而是把「間距是幾分之一格」變成一格
 * 政策(第一守則:決策點做成後台欄位),並讓卡片寬度的 vw 上限跟著它收 ——
 * 否則在寬度受限的直式視窗上調緊間距會讓三張卡直接疊在一起。
 *
 * `spacing === 1` **與 2026-08-22 之前逐字同解**,所以它同時是「回到舊畫面」
 * 的那一格。
 *
 * ⭐ 上下界**從 Zod 那一份來**（`VICTORY_PODIUM_SPACING_MIN/MAX`）——
 * ⛔ 在 2026-08-22 之前這裡是兩個手抄的字面值，也就是第四個住處：
 * owner 哪天把上界從 1.5 放寬，Zod 收得下而畫面照樣夾在 1.5，
 * 而**兩邊看起來都對**（第二守則：不要在測試/客戶端再抄一份出貨值）。
 */
export const PODIUM_SPACING_MIN = VICTORY_PODIUM_SPACING_MIN;
export const PODIUM_SPACING_MAX = VICTORY_PODIUM_SPACING_MAX;

/**
 * ⚠️ 這是「**內容載不到**」那條路的值（2026-08-01 骨架事故那一條），
 * ⛔ 不是這一格的家 —— 家是 `content/config/victory-podium.json` ＋
 * `DEFAULT_VICTORY_PODIUM.podiumSpacing` ＋ 後台的 `VICTORY_PODIUM_SPEC`（三個住處都在了）。
 * 語意和 `DEFAULT_VICTORY_PODIUM` 對其他欄位的角色一致。
 */
export const PODIUM_SPACING_FALLBACK = DEFAULT_VICTORY_PODIUM.podiumSpacing;

/**
 * 政策 → 間距倍率。缺席 ⇒ 退回出貨預設;超界 ⇒ 夾回去
 * （0 會讓三個人疊成一個人 —— 而「三個人站上台」讀起來變成「只有一個人贏了」，
 * 正好是這一格要修的相反面）。
 *
 * ⚠️ 兩層都要（第一守則）：Zod 那一格是**拒**（越界存不進後台），這裡是**夾**
 * （一份舊的 / 手改的文件不會把三張卡推出視窗）。
 */
export function podiumSpacing(cfg: VictoryPodiumPolicy): number {
  const raw = cfg.podiumSpacing;
  const v = typeof raw === "number" && Number.isFinite(raw) ? raw : PODIUM_SPACING_FALLBACK;
  return Math.min(PODIUM_SPACING_MAX, Math.max(PODIUM_SPACING_MIN, v));
}

/**
 * 第 `slot` 格的中心,橫向百分比。中間那一格永遠落在 50%(奇數人數時字面上的
 * `50`),兩側對稱地往外推 `pitch = (100 / n) * spacing`。
 */
export function podiumSlotCentrePct(slot: number, total: number, spacing: number): number {
  const n = Math.max(1, total);
  const pitch = (100 / n) * spacing;
  const off = slot - (n - 1) / 2;
  return Math.round((50 + off * pitch) * 1000) / 1000;
}

/** 名次 → 該播哪一個剪輯。沒有冠的台階(第四名以後 / 舊呼叫端)一律站姿。 */
export function podiumClipFor(
  medal: CrownMedal | null | undefined,
  cfg: VictoryPodiumPolicy,
): VictoryPodiumClip {
  if (medal === "gold") return cfg.clipGold;
  if (medal === "silver") return cfg.clipSilver;
  if (medal === "bronze") return cfg.clipBronze;
  return "idle";
}

/** The slice of StorePreview this stage drives (injectable for headless tests). */
export interface WinnerPreview {
  /**
   * `opts.championId` carries the w3x vertex tint through (task #263);
   * `opts.clip` is WHICH animation plays on the card (GH#257) — before that
   * existed every card played `idle`, so a round win looked exactly like a
   * champion standing in the shop.
   */
  show(
    doc: ModelDoc,
    opts?: { championId?: string | null; clip?: ClipState; relativeScale?: number },
  ): Promise<void> | void;
  dispose(): void;
}

/** The slice of the taunt layer this stage drives (injectable for headless tests). */
export interface RoundTauntPort {
  playRound(
    championId: string,
    round: number,
    opts?: PlayTauntOptions,
  ): Promise<VictoryTauntLine | null>;
  cancel(): void;
}

/**
 * Who won this round, from the caller's already-resolved authoritative read.
 * Both fields feed the DETERMINISTIC taunt pick (audio/victoryTaunt), so every
 * client hears the same line about the same loser. Omitted ⇒ no taunt, no
 * subtitle: the grey wash and the model still play.
 */
export interface RoundWinnerContext {
  championId?: string;
  round?: number;
}

/** One member of the winning team, as {@link RoundWinnerStage.showTeam} takes them. */
export interface WinnerEntry {
  doc: ModelDoc;
  /** carries the w3x vertex tint through to the previewer (task #263) */
  championId?: string;
  /**
   * GH#368 — this champion's INTENTIONAL size multiplier on top of height
   * normalization. Absent ⇒ 1, the common height. It rides the entry rather
   * than being looked up in the stage because this class reads no content.
   */
  relativeScale?: number;
  /**
   * 這一位的存活名次(1-based)與皇冠階級 (GH#257)。
   *
   * ⚠️ **由呼叫端算好傳進來,這個類別一格都不排。** 名次的唯一推導處是
   * `sim/stats/roundSurvival.rankSurvival`,範圍規則在
   * `ui/panels/victoryPodium`。這裡再排一次就會有第二份金銀銅,而玩家沒有
   * 辦法分辨哪一份是真的(同 `roundVictory.ts` 對 `gradeRound` 的理由)。
   *
   * 兩個都是 optional:省略 = 沒有皇冠,單一勝利者的舊呼叫端因此完全不變。
   */
  place?: number;
  medal?: CrownMedal | null;
  /**
   * 這一張卡要播的剪輯 (GH#257)。省略 = `idle`(舊呼叫端完全不變)。
   * 由 {@link planRoundWinnerShow} 依名次從政策算好,理由和 `place`/`medal` 一樣:
   * 這個類別一格都不決定,否則會出現第二份「誰在慶祝」的答案。
   */
  clip?: VictoryPodiumClip;
}

export interface RoundWinnerStageOptions {
  /** element the overlay layers are mounted into (production: document.body). */
  host: HTMLElement | null;
  /** overlay-canvas factory (default: document.createElement("canvas")). */
  createCanvas?: () => HTMLCanvasElement;
  /**
   * overlay-div factory (default: document.createElement, or null with no DOM —
   * a null layer is simply skipped, so the stage still works headless).
   */
  createElement?: (tag: string) => HTMLElement | null;
  /** previewer factory (default: new StorePreview(canvas)). */
  createPreview?: (canvas: HTMLCanvasElement) => WinnerPreview;
  /** taunt layer (default: the process-wide victoryTaunts; null disables VO). */
  taunt?: RoundTauntPort | null;
  /**
   * 回合勝利第一名說什麼 (GH#256) —— `taunt` / `quote` / `both`。
   *
   * 預設是 `DEFAULT_VICTORY_PODIUM.roundWinLine`,也就是 `both`,**也就是現行
   * 出貨行為**:名言在 t=0 由 `ui/RoundEndVoice` 放,嘲諷在 t=2200ms 由這裡放
   * (`ROUND_TAUNT_DELAY_MS`,`victoryPresentation.test.ts` 釘住這個順序)。
   *
   * ⚠️ 這一格只管**嘲諷要不要放**。名言的擁有者仍然是 `RoundEndVoice` ——
   * 它有自己的相位邊緣觸發,而且在這個舞台因為模型還沒載好而完全不出現的那
   * 幾拍**仍然會發聲**。把名言搬進來會讓「模型載不到」順手把語音也一起靜音
   * (失敗形態 ②)。兩邊讀的是同一個政策物件,所以決策只有一處。
   */
  roundWinLine?: VictoryRoundWinLine;
}

/**
 * 皇冠徽章 —— 釘在該張卡片的正上方,壓在灰底之上。
 *
 * `slot` 是**畫面上的第幾格**,不是名次 —— 在 `centreFirst` 之下金冠的 slot 是
 * 中間那一格。冠和卡片吃同一個 slot,所以冠永遠在自己那張卡的正上方。
 */
function styleCrown(
  el: HTMLElement | null,
  slot: number,
  total: number,
  scale = 1,
  spacing = 1,
): void {
  const s = el?.style;
  if (!s) return;
  const n = Math.max(1, total);
  const centre = podiumSlotCentrePct(slot, n, spacing);
  s.position = "fixed";
  s.left = `${centre}%`;
  // 卡片的中心在 46%、高度上限 min(56vh…),所以冠要往上讓開卡片的上緣。
  s.top = "13%";
  s.transform = "translate(-50%, -50%)";
  s.width = `min(${Math.round((11 / Math.max(1, n / 3)) * scale)}vh, ${Math.round((22 / n) * scale)}vw)`;
  // 金冠和它的卡片一起疊上一層,否則放大後的金卡會蓋住自己的冠。
  s.zIndex = String(ROUND_SUBTITLE_Z + (scale > 1 ? 1 : 0));
  s.pointerEvents = "none";
  s.filter = "drop-shadow(0 4px 10px rgba(0,0,0,0.7))";
}

/** 卡片的基礎 z-index。放大的那一張(金冠)踩 +1,所以它疊在鄰居上面。 */
const CARD_Z = 6;

/**
 * Position one winner's canvas within the ROW of them.
 *
 * The owner asked for the whole team, not the MVP alone (2026-07-27:
 * 「勝利的時候應該秀隊伍三人的模組」) — a 3v3v3v3 round is won by three people
 * and presenting only the top scorer quietly told the other two they were
 * scenery. So the card became a row.
 *
 * ⚠️ `slot` is WHERE ON SCREEN this card goes, and it is NOT the member index.
 * Until 2026-08-03 it was, and that is exactly the defect the owner reported
 * (「回合勝利出現的 3d model 是勝利角色 但現在不是」): with three cards the
 * middle of the screen — the first place anyone looks — held member[1], the
 * SECOND place, who by definition is somebody who went down this round.
 * {@link podiumSlotOrder} owns that mapping now, so the row order is a config
 * field instead of an accident of the loop counter.
 *
 * `scale` is the same story for SIZE: three identically-sized cards with no
 * z-order made "who won" readable only from the crown's colour.
 *
 * Sized from the count, not from a constant: one winner keeps the full-width
 * portrait the single-model beat always had, and three share the width without
 * anyone falling off a phone. Every dimension is clamped so a large
 * `winnerScale` cannot push a card past the viewport.
 *
 * Fixed to the viewport, above the world-anchored HP bars (#anchor-layer, z 5)
 * and below the HUD (#hud-root, z 10); never intercepts input.
 */
/** ⭐ 匯出給  —— 它以前掃這個檔的原始碼（失敗形態⑥）。 */
export function styleOverlayCanvas(
  canvas: HTMLCanvasElement,
  slot: number,
  total: number,
  scale = 1,
  spacing = 1,
): void {
  const s = canvas.style;
  if (!s) return; // headless fake — nothing to style
  const n = Math.max(1, total);
  const k = scale > 0 ? scale : 1;
  const vh = (v: number): number => Math.min(88, Math.round(v * k));
  const vw = (v: number): number => Math.min(96, Math.round(v * k));
  // ⚠️ GH#545: the vw cap follows the SPACING, not just the count. The vh cap
  // wins on a wide screen (so tightening the row leaves desktop cards alone),
  // but on a width-limited viewport the vw cap is what is actually drawn —
  // leaving it at 88/n there means a tighter row simply overlaps into a pile.
  // `spacing === 1` ⇒ 94/n > 88/n ⇒ min() picks 88/n ⇒ byte-identical to the
  // pre-#545 sizes. The height cap keeps the card's aspect (96/88).
  const capW = Math.min(88 / n, ((100 / n) * spacing) * 0.94);
  const capH = capW * (96 / 88);
  // width per card: the solo card keeps its old size; a row divides the space.
  const w = n === 1 ? `min(${vh(40)}vh, ${vw(84)}vw)` : `min(${vh(34 / n + 8)}vh, ${vw(capW)}vw)`;
  const h = n === 1 ? `min(${vh(54)}vh, ${vw(96)}vw)` : `min(${vh(46 / n + 10)}vh, ${vw(capH)}vw)`;
  // centre of this card's SLOT, as a percentage across the viewport
  const centre = podiumSlotCentrePct(slot, n, spacing);
  s.position = "fixed";
  s.left = `${centre}%`;
  s.top = "46%";
  s.transform = "translate(-50%, -50%)";
  s.width = w;
  s.height = h;
  s.zIndex = String(k > 1 ? CARD_Z + 1 : CARD_Z);
  s.pointerEvents = "none";
  s.borderRadius = "14px";
  s.outline = "none";
  s.boxShadow = "0 18px 60px rgba(0, 0, 0, 0.55)";
}

/**
 * 灰色底 — full-viewport desaturating scrim UNDER the winner's card. Two
 * independent mechanisms (backdrop-filter + a flat grey gradient) so the beat
 * reads even where backdrop-filter is unsupported. Never intercepts input.
 *
 * Mounts TRANSPARENT and is raised by `raiseWash` over ROUND_WASH_FADE_MS: a
 * dead spectator is still looking through the #85 death greyscale on this very
 * frame, and that effect ramps out over exactly the same interval. Crossfading
 * instead of stacking is the precedence rule (see victoryPresentation).
 */
function styleWash(el: HTMLElement | null): void {
  const s = el?.style;
  if (!s) return;
  const spec = victoryPresentation("round");
  s.position = "fixed";
  s.inset = "0";
  s.zIndex = String(ROUND_WASH_Z);
  s.pointerEvents = "none";
  s.background = spec.background;
  s.backdropFilter = spec.backdropFilter;
  (s as unknown as Record<string, string>)["webkitBackdropFilter"] = spec.backdropFilter;
  s.opacity = "0";
  s.transition = `opacity ${ROUND_WASH_FADE_MS}ms linear`;
}

/**
 * Kick the wash's opacity to 1 on a later frame so the transition above
 * actually runs (setting it in the same style pass would jump). rAF where the
 * browser has it, a macrotask otherwise, and a straight assignment in an
 * environment with neither — never a silent no-fade.
 */
function raiseWash(el: HTMLElement | null, stillCurrent: () => boolean): void {
  if (!el?.style) return;
  const bump = (): void => {
    if (stillCurrent() && el.style) el.style.opacity = "1";
  };
  const g = globalThis as unknown as {
    requestAnimationFrame?: (cb: () => void) => unknown;
    setTimeout?: (cb: () => void, ms: number) => unknown;
  };
  if (typeof g.requestAnimationFrame === "function") g.requestAnimationFrame(bump);
  else if (typeof g.setTimeout === "function") g.setTimeout(bump, 0);
  else bump();
}

/** The taunt subtitle, pinned under the winner's card and over the wash. */
function styleSubtitle(el: HTMLElement | null): void {
  const s = el?.style;
  if (!s) return;
  s.position = "fixed";
  s.left = "50%";
  s.bottom = "18%";
  s.transform = "translateX(-50%)";
  s.zIndex = String(ROUND_SUBTITLE_Z);
  s.pointerEvents = "none";
  s.maxWidth = "min(78vw, 720px)";
  s.textAlign = "center";
  s.fontSize = "clamp(15px, 2.2vh, 22px)";
  s.fontWeight = "700";
  s.lineHeight = "1.5";
  s.color = "#f4f6fb";
  s.textShadow = "0 2px 10px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)";
  s.letterSpacing = "0.5px";
}

export class RoundWinnerStage {
  private readonly host: HTMLElement | null;
  private readonly createCanvas: () => HTMLCanvasElement;
  private readonly createElement: (tag: string) => HTMLElement | null;
  private readonly createPreview: (canvas: HTMLCanvasElement) => WinnerPreview;
  private readonly taunt: RoundTauntPort | null;
  private readonly roundWinLine: VictoryRoundWinLine;
  private canvases: HTMLCanvasElement[] = [];
  /** 皇冠徽章,index-aligned with {@link canvases} (GH#257) */
  private crowns: HTMLElement[] = [];
  private wash: HTMLElement | null = null;
  private subtitle: HTMLElement | null = null;
  private previews: WinnerPreview[] = [];
  private disposed = false;
  /** monotonic show id — a late taunt never subtitles a later/cleared round */
  private showSeq = 0;

  constructor(opts: RoundWinnerStageOptions) {
    this.host = opts.host;
    this.createCanvas = opts.createCanvas ?? (() => document.createElement("canvas"));
    this.createElement =
      opts.createElement ??
      ((tag) => (typeof document !== "undefined" ? document.createElement(tag) : null));
    this.createPreview = opts.createPreview ?? ((c) => new StorePreview(c));
    this.taunt = opts.taunt === undefined ? victoryTaunts : opts.taunt;
    this.roundWinLine = opts.roundWinLine ?? DEFAULT_VICTORY_PODIUM.roundWinLine;
  }

  /**
   * 目前掛在台上的皇冠階級,由左到右(observability / tests)。
   * 沒有皇冠的台階是 `""`。
   */
  get medals(): string[] {
    return this.crowns.map((c) => c.getAttribute?.("data-medal") ?? "");
  }

  /** True while a winner is currently on the stage. */
  get active(): boolean {
    return this.previews.length > 0;
  }

  /** How many champions are currently standing on the stage (observability / tests). */
  get memberCount(): number {
    return this.previews.length;
  }

  /** The taunt currently subtitled (observability / tests). */
  get subtitleText(): string {
    return this.subtitle?.textContent ?? "";
  }

  /**
   * Present `doc` centre-screen on the grey wash, and — when `ctx` names the
   * winning champion — speak + subtitle that champion's taunt. Lazily spins up
   * the overlay layers on first use, then swaps the model on later shows. Never
   * throws (the model load and the taunt both self-degrade to nothing).
   */
  /**
   * Single-champion convenience: the whole winning team is one person.
   * Kept so callers (and tests) that only ever have one model stay unchanged.
   */
  show(doc: ModelDoc, ctx: RoundWinnerContext = {}): void {
    this.showTeam([{ doc, championId: ctx.championId }], ctx);
  }

  /**
   * Stand the winning TEAM on the grey wash — one card per member, in the order
   * given — and speak the taunt for `ctx.championId` (the round's MVP, resolved
   * by the caller from the same authoritative state the VO reads).
   *
   * Layers are rebuilt whenever the member COUNT changes rather than reused: a
   * canvas's size is baked into its Babylon engine at construction, so a
   * three-card row cannot be produced by restyling one full-width card. Same
   * count on a later round reuses everything and just swaps the models.
   *
   * Never throws — every model load and the taunt all self-degrade to nothing.
   */
  showTeam(
    members: readonly WinnerEntry[],
    ctx: RoundWinnerContext = {},
    cfg: VictoryPodiumPolicy = victoryPodiumPolicy(),
  ): void {
    if (this.disposed || members.length === 0) return;
    const spec = victoryPresentation("round");

    if (this.canvases.length !== members.length) {
      // count changed (or first show) — tear the canvases down and rebuild.
      // The wash and subtitle are count-independent, so they survive: dropping
      // and re-adding the wash would re-run its fade from transparent and blink
      // the arena back to full colour mid-beat.
      for (const p of this.previews) p.dispose();
      for (const c of this.canvases) c.remove();
      for (const c of this.crowns) c.remove();
      this.previews = [];
      this.canvases = [];
      this.crowns = [];

      if (!this.wash) {
        // wash FIRST so it is under the cards in both z-index and DOM order
        const wash = this.createElement("div");
        styleWash(wash);
        if (wash) this.host?.appendChild(wash);
        this.wash = wash;
        // hand the screen over from the #85 death greyscale as a CROSSFADE
        raiseWash(wash, () => this.wash === wash);
      }

      for (let i = 0; i < members.length; i++) {
        const canvas = this.createCanvas();
        this.host?.appendChild(canvas);
        this.canvases.push(canvas);
        this.previews.push(this.createPreview(canvas));
        // 皇冠徽章:一張卡一個,建在卡片**之後**所以在 DOM 順序上蓋過它。
        // 沒有名次的台階仍然建一個空節點,index 才會和卡片對齊 —— 少建一個
        // 會讓第二名的冠飄到第三張卡上。
        const crown = this.createElement("div");
        if (crown) {
          this.host?.appendChild(crown);
          this.crowns.push(crown);
        }
      }

      if (!this.subtitle) {
        const subtitle = this.createElement("div");
        styleSubtitle(subtitle);
        if (subtitle) this.host?.appendChild(subtitle);
        this.subtitle = subtitle;
      }
    }

    // 版面每一次都重算,不是只在圖層重建時算:人數沒變但**政策變了**
    // (操作者把 podiumLayout 從 rank 切成 centreFirst)的那一回合,圖層是重用的,
    // 所以只在建立時套用會讓那個欄位看起來完全沒作用(失敗形態 ②)。
    const slots = podiumSlotOrder(members.length, cfg.podiumLayout);
    // GH#545 owner「靠在一起不要分那麼開」—— 疏密和站位一樣每一次都重算。
    const spacing = podiumSpacing(cfg);
    // #263: hand each winner's championId to its previewer so the w3x art
    // colour is painted here too. Before this the card showed the RAW mesh —
    // 黑化Saber won a round and stood there as a plain gold Saber.
    members.forEach((m, i) => {
      // 金冠那一張放大並疊到上層;其餘 1.0。`place` 缺席(舊的單人呼叫端)也是 1.0。
      const scale = m.place === 1 ? cfg.winnerScale : 1;
      const slot = slots[i] ?? i;
      const canvas = this.canvases[i];
      if (canvas) styleOverlayCanvas(canvas, slot, members.length, scale, spacing);
      styleCrown(this.crowns[i] ?? null, slot, members.length, scale, spacing);
      void this.previews[i]?.show(m.doc, {
        championId: m.championId ?? null,
        clip: m.clip ?? "idle",
        relativeScale: m.relativeScale,
      });
      this.paintCrown(this.crowns[i] ?? null, m);
    });

    const seq = ++this.showSeq;
    this.setSubtitle("");
    const champ = ctx.championId;
    // GH#256:`quote` 模式下嘲諷不放 —— 那一拍的聲音是 `ui/RoundEndVoice` 的名言。
    if (this.roundWinLine === "quote") return;
    if (!champ || !this.taunt) return;
    // The line is picked deterministically from replicated state, so every
    // client hears the SAME joke; it is delayed past the round-end 名言 so the
    // two voices never talk over each other (render/victoryPresentation).
    //
    // ONE taunt for the team, not three: three champions barking over each
    // other is noise, and the line is written as a jeer at the loser rather
    // than a self-introduction. It belongs to the MVP the caller resolved.
    //
    // The subtitle is driven by `onSpeak`, NOT by the returned promise: the
    // promise resolves as soon as the line is CHOSEN (next microtask), so
    // subtitling from it would print the punchline ~2.2 s before the voice says
    // it — on top of the very 名言 the delay exists to clear.
    void this.taunt
      .playRound(champ, ctx.round ?? 0, {
        delayMs: spec.voiceDelayMs,
        onSpeak: (line) => {
          if (seq !== this.showSeq) return; // a newer round (or a clear) took over
          if (line.text) this.setSubtitle(line.text);
        },
      })
      .catch(() => {});
  }

  private setSubtitle(text: string): void {
    if (this.subtitle) this.subtitle.textContent = text;
  }

  /**
   * 把一頂皇冠畫進 `el`。沒有名次的台階被**清空**(而不是留著上一回合那一頂)——
   * 名次是每回合重算的,而卡片在人數沒變時是重用的,所以不清就會出現「這一回合
   * 只有兩個人上台,但第三頂銅冠還掛在那裡」。
   *
   * `data-medal` 不是裝飾:它是這個功能唯一可以在 headless 下讀回來的證據,
   * `roundPodium.test.ts` 讀的就是它 + `innerHTML` 裡真的那三個顏色。
   */
  private paintCrown(el: HTMLElement | null, m: WinnerEntry): void {
    if (!el) return;
    const medal = m.medal ?? null;
    const place = m.place ?? 0;
    if (!medal || place <= 0) {
      el.innerHTML = "";
      el.setAttribute?.("data-medal", "");
      el.setAttribute?.("data-place", "");
      return;
    }
    el.innerHTML = crownSvg(medal, place);
    el.setAttribute?.("data-medal", medal);
    el.setAttribute?.("data-place", String(place));
    // 讀螢幕的人拿得到的那一份 —— 皇冠是這個畫面上唯一表達名次的東西。
    el.setAttribute?.("aria-label", `第 ${place} 名 · ${CROWN_PALETTE[medal].label}`);
  }

  /** Tear the stage down (dispose the previewer + remove every overlay layer). */
  /**
   * 收掉這一次表演。
   *
   * ⚠️ **`cancelVoice` 預設 true 是為了 dispose，⛔ 不是為了「時間到了」。**
   * owner 2026-08-14：「回合勝利 語音還沒播完 就會進商店 語音也被截斷」——
   * 根因就在這裡：`cancel()` 會 `el.pause()`，而呼叫端在**畫面**的節拍結束時
   * 就收掉整個舞台，把還在講的那句話一起按停。
   *
   * 實測（`ffprobe` 60 支嘲諷剪輯）：嘲諷在 **2200ms** 才開口、舊的節拍在
   * **3600ms** 結束 ⇒ 只有 **1.4 秒**空檔，而剪輯中位 **3.29 秒**
   * ⇒ **59/60（98%）被切在一半**。
   *
   * ⭐ 所以**預設是不按停** —— 收畫面歸收畫面，聲音自己講完。
   * 一句嘲諷最長 4.64 秒、從 resolution 的第 2.2 秒起算 ⇒ 最晚 6.9 秒結束，
   * 而中場有 25 秒 ⇒ ⛔ 不可能溢到下一回合。
   *
   * ⚠️ **預設值是這樣選的**：危險的那一邊要付出額外打字。原本反過來
   * （預設按停、呼叫端要記得傳 `{cancelVoice:false}`），而**一個要靠呼叫端記得
   * 的安全性等於沒有安全性** —— 實測把 GameApp 那一行的參數拿掉，
   * 整批測試照樣全綠（失敗形態③）。現在拿掉參數得到的是**正確**行為，
   * 要按停必須明講，而唯一明講的地方是 {@link dispose}。
   */
  clear(opts: { cancelVoice?: boolean } = {}): void {
    this.showSeq += 1; // any in-flight taunt resolution is now stale
    if (opts.cancelVoice === true) this.taunt?.cancel();
    for (const p of this.previews) p.dispose();
    this.previews = [];
    for (const c of this.canvases) c.remove();
    this.canvases = [];
    for (const c of this.crowns) c.remove();
    this.crowns = [];
    for (const el of [this.wash, this.subtitle]) el?.remove();
    this.wash = null;
    this.subtitle = null;
  }

  /** Idempotent teardown; safe to call from GameApp.dispose more than once. */
  dispose(): void {
    this.disposed = true;
    // ⭐ **唯一**要按停嘴巴的地方：離開比賽／換場。一句嘲諷不可以跟著你走出
    // 這一場（那才是 `cancel()` 當初存在的理由）。
    this.clear({ cancelVoice: true });
  }
}

/**
 * 一次回合結束表演的完整參數 —— {@link RoundWinnerStage.showTeam} 的兩個引數。
 * `null` = 這一拍不演(觀戰 / 輪空 / 決勝回合 / 一個模型都載不到)。
 */
export interface RoundWinnerShowPlan {
  members: WinnerEntry[];
  ctx: RoundWinnerContext & { championId: string; round: number };
  /**
   * 這一拍用的政策,原封不動帶回來。呼叫端可以把它交給
   * {@link RoundWinnerStage.showTeam} 的第三個引數,讓「挑人」與「擺位」讀的
   * 是**同一次**登錄表快照;不傳的話舞台自己再讀一次(同一拍,同解)。
   */
  cfg: VictoryPodiumPolicy;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GH#265 —— 「為什麼我最後活著 勝利的還是顯示別的隊伍」(owner, 2026-08-03)
 *
 * 伺服器**有**權威答案而且**有送出**:`MatchController.checkCombatEnd` 在「某一區
 * 有一邊被清空」的那一 tick 就記下 `duelWinners[zone]`,`net/snapshot.ts` 把它鏡到
 * `MatchState.duels[].winner`。頒獎台卻一格都沒讀 —— 它只拿到 seats/teams,自己
 * **重新推導**一次誰贏。
 *
 * 兩個獨立推導不可能靠修其中一個變一致,而它們必然分岔,因為它們回答的不是同一題:
 *
 *   · 伺服器答的是「**這一區**誰贏」—— 一回合兩個 zone,兩個答案。
 *   · `roundLeaderChampion` 答的是「所有 `WON` 的隊伍裡**戰績最好**的那一隊」——
 *     一回合一個答案,而且它會被 `lives` / `teamId` 決定。
 *
 * 於是 4 隊 2 區時:你這一區贏了(命 1),另一區也有人贏(命 3)→ 排序把命 3 那隊
 * 排前面 → 上台的是**你沒打過的那三個人**。這正是 owner 看到的畫面。
 *
 * ⚠️ 這跟「部署後置條件只驗名詞抓不到相容性故障」是同一個形狀:兩邊各自都對,
 * 沒有任何東西驗**兩者一致**。所以修法不是改推導,是**讓客戶端讀已經送過來的那一格**,
 * 並且加一條配對式守衛(`roundWinnerZone.test.ts`)。
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 伺服器對「誰贏了這一場決鬥」的權威答案,以及**要演哪一區**。
 *
 * `duels` 是 `HudState.duels`(= `MatchState.duels` 的逐欄投影);`zone` 是本機
 * 玩家自己那一區(`net/RoomStore.localDuelZone`,讀實體的 zone,所以死掉/觀戰時
 * 屍體仍然帶著正確的區)。
 *
 * ⚠️ **`zone` 從哪裡來是一個決策點,不是一個常數。** 「觀戰別的 zone 時要演誰」
 * 有兩個都說得通的答案(你自己那一區的勝負 / 你鏡頭正在看的那一區的勝負),
 * 而 #269 的「前往觀戰」讓後者是真的存在的狀態。這裡不替 owner 選 ——
 * `GameApp` 傳什麼就演什麼,選擇留給 `config.victory-podium@1` 的
 * `podiumZoneSource` 欄位(第二階段落地)。
 */
export interface RoundWinnerAuthority {
  /** 逐區勝負(`HudState.duels`)。空 = 這一份快照沒帶配對。 */
  duels: readonly { zone: number; winner: number }[];
  /** 要演哪一區的勝負。-1 = 不知道(觀眾 / 還沒生成 / 決賽單場)。 */
  zone: number;
}

/**
 * 這一區的勝方 teamId,或 `-1` =「伺服器沒有給答案」。
 *
 * -1 有三種來源,三種都必須 fail-open 退回推導而不是把舞台清空:決賽單場
 * (`pairings` 是空的)、還沒定勝負的快照(`winner < 0`)、以及本機玩家沒有區可歸。
 * 「壞掉的權威來源不可以弄壞一場表演」—— 但 fail-open 的代價是靜默,所以
 * `roundWinnerZone.test.ts` 的三條裡有一條就在釘這個退路真的還在。
 */
export function authoritativeRoundWinner(authority: RoundWinnerAuthority): number {
  if (authority.zone < 0) return -1;
  const duel = authority.duels.find((d) => d.zone === authority.zone);
  return duel && duel.winner >= 0 ? duel.winner : -1;
}

/**
 * 把「這一區的勝方」壓成 `roundOutcome` 裡**唯一**的 `WON`。
 *
 * 為什麼是改投影而不是加參數:`roundVictoryPodium` / `roundLeaderChampion` /
 * `roundEndQuoteChampion` 三支都已經擁有一整套辛苦換來的規則(輪空隊用
 * MEMBERSHIP 排除、勝者優先於參戰者、沒鎖英雄的隊往下遞)。把「哪一隊」forked
 * 成第二套規則正是 model 與 VO 會分岔的那條路。它們讀的都是 `roundOutcome`,
 * 所以只要那一欄說的是伺服器的答案,三支就自動一致。
 *
 * 只動兩種格子,其餘原封不動:
 *   · 權威勝方 → `WON`(本來就是 `WON` 就不動)
 *   · 其他隊的 `WON` → `FOUGHT`(它是**別區**的勝方,對這一拍而言只是「有上場」)
 *
 * ⛔ **`NONE` 一格都不碰。** 那是 #173 分辨「輪空」與「被團滅」的唯一訊號,
 * 兩者在座位上讀起來 byte-identical。
 *
 * 認不得那個 teamId(舊快照 / 手刻 fixture)時整份原樣回傳 —— 寧可退回舊行為,
 * 也不要造出一份沒有任何 `WON` 的隊伍表。
 */
function teamsScopedToWinner(
  teams: readonly RoundTeamView[],
  winnerTeamId: number,
): readonly RoundTeamView[] {
  if (winnerTeamId < 0) return teams;
  if (!teams.some((t) => t.teamId === winnerTeamId)) return teams;
  return teams.map((t) => {
    if (t.teamId === winnerTeamId) {
      return t.roundOutcome === ROUND_OUTCOME.WON ? t : { ...t, roundOutcome: ROUND_OUTCOME.WON };
    }
    return t.roundOutcome === ROUND_OUTCOME.WON ? { ...t, roundOutcome: ROUND_OUTCOME.FOUGHT } : t;
  });
}

/**
 * HUD 投影 → 這一拍要演什麼 (GH#257).
 *
 * ⚠️ **為什麼這段從 `GameApp.updateRoundWinner` 搬出來:** 它原本就寫在那個方法裡,
 * 而 `GameApp` 抓 Babylon engine / canvas / socket,headless 起不來 —— 於是唯一
 * 驗得到它的方式是掃 `GameApp.ts` 的原始碼字串(失敗形態 ⑥)。稽核實測:把整段
 * podium 用法從 `updateRoundWinner` 拿掉(podium 恆為 `[]`),1292 條 client 測試
 * **全綠**。搬成一支純函式之後,`roundWinnerPlan.test.ts` 就能餵真的 seats/teams
 * 進 `hudStore`、把回傳值交給真的 `RoundWinnerStage`,斷言**舞台真的收到**存活順序
 * 與金銀銅 —— 行為,不是字串。
 *
 * 五件事在這裡決定,五件都可以獨立壞掉:
 *
 *   1. **上台的人與順序** = `roundVictoryPodium`(存活順序 + 金銀銅 + 範圍政策)。
 *      拿不到 `roundDeathTick` 的舊快照 → podium 是空的 → 退回
 *      `roundWinnerTeamChampions`(「全員平手,照擊殺數排」),**不是**退回空舞台。
 *   2. **模型載不到的人被丟掉**,不是讓他留一張空白卡:三張卡缺一張讀起來像 bug,
 *      而兩張卡的這一拍仍然是正確的。皇冠跟著各自的 `place` 走,所以掉了銀牌那位
 *      不會把銅牌那位偷偷升成銀冠。
 *   3. **嘲諷仍然屬於回合 MVP**(`roundEndQuoteChampion`),不是金冠。兩者常常同一位
 *      但不必然:台詞是寫給敗方聽的,而且 `audio/victoryTaunt` 用 championId+round
 *      雜湊,每個客戶端算出同一句。改用 podium[0] 會**靜默換掉**全場聽到的那個笑話。
 *   4. **每一位播哪一個剪輯**(`podiumClipFor`)。出貨是金 `celebrate` / 銀銅 `idle` ——
 *      三個人一起慶祝就等於沒有說出誰是第一。退回路徑(沒有名次)一律 `idle`。
 *   5. **`soloWinner` 只演金冠一位**。截在這裡而不是在舞台上,因為它決定的是
 *      **演誰**;舞台只負責把交給它的人擺好。
 *   6. **哪一隊上台**(GH#265)—— 這一件**不推導**,讀 `authority`:伺服器逐區記下
 *      的那個 teamId。上面五件都是「在勝方裡怎麼演」,這一件是「勝方是誰」,
 *      而它是唯一一件客戶端沒有資格自己算的。見檔案中段 GH#265 那一段。
 *
 * ⚠️ `authority` **不是 optional**,而且刻意排在 `cfg` 前面。它一旦可以省略,
 * 出貨呼叫端就可以在測試全綠的情況下把它悄悄拿掉(失敗形態 ③ —— 這一支函式
 * 本身就是因為那件事真的發生過才存在的)。現在拿掉它 typecheck 直接紅。
 *
 * ⚠️ `cfg` 的預設值是 `victoryPodiumPolicy()` —— **`content/config/victory-podium.json`
 * 本人**,不是 code 裡的常數。`GameApp.updateRoundWinner` 不傳它,所以走的就是
 * 這個預設。在 2026-08-03 之前它是 `DEFAULT_VICTORY_PODIUM`,於是那份 JSON 是死的。
 */
export function planRoundWinnerShow(
  seats: readonly PodiumSeatView[],
  teams: readonly RoundTeamView[],
  round: number,
  docFor: (championId: string) => ModelDoc | null,
  authority: RoundWinnerAuthority,
  cfg: VictoryPodiumPolicy = victoryPodiumPolicy(),
  /**
   * GH#368 — the per-champion size multiplier, so the card shows the size the
   * player just fought at. Optional and defaulting to 1 (= the common
   * normalized height), which is exactly what every caller got before.
   */
  relFor: (championId: string) => number = () => 1,
): RoundWinnerShowPlan | null {
  // GH#265 —— 先把伺服器的逐區答案壓進這一份投影,再交給既有的選擇器。
  // 底下三個呼叫(`roundVictoryPodium` / `roundWinnerTeamChampions` /
  // `roundEndQuoteChampion`)全部吃 `scoped`,所以「哪一隊上台」只有一個答案。
  const scoped = teamsScopedToWinner(teams, authoritativeRoundWinner(authority));
  const podium = roundVictoryPodium(seats, scoped, cfg);
  const fallback = podium.length > 0 ? [] : roundWinnerTeamChampions(seats, scoped);

  const members: WinnerEntry[] = [];
  for (const p of podium) {
    const doc = docFor(p.championId);
    if (doc) {
      members.push({
        doc,
        championId: p.championId,
        place: p.place,
        medal: p.medal,
        clip: podiumClipFor(p.medal, cfg),
        relativeScale: relFor(p.championId),
      });
    }
  }
  for (const id of fallback) {
    const doc = docFor(id);
    // 退回路徑沒有名次,所以沒有冠、也沒有慶祝 —— 給第一位 `celebrate` 會是在
    // 一個「大家平手」的排序上宣稱誰贏了。
    if (doc) members.push({ doc, championId: id, clip: "idle", relativeScale: relFor(id) });
  }
  if (members.length === 0) return null;

  // `soloWinner`:只留第一名(#143 原始的單人特寫)。截在這裡而不是在舞台上,
  // 因為它決定的是**演誰**,而舞台只負責把交給它的人擺好。
  const shown = cfg.podiumLayout === "soloWinner" ? members.slice(0, 1) : members;

  const championId =
    roundEndQuoteChampion(seats, scoped) ?? podium[0]?.championId ?? fallback[0] ?? "";
  return { members: shown, ctx: { championId, round }, cfg };
}
