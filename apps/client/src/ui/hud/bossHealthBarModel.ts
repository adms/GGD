/**
 * 殭屍王長血條 (#247, owner 2026-08-01 實戰回饋:「殭屍王 要像其他遊戲 BOSS 一樣
 * 亮長血條」).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ① 診斷:缺的**不是**資訊,是那三個決策沒有欄位
 * ═════════════════════════════════════════════════════════════════════════════
 * 「王是哪一隻」早就到得了客戶端,而且不是靠協定的一個 bit:`mobBossSpawn` 事件
 * 帶著王的 entity id(sim/mobBoss.ts),`RoomStore.recordMobBossEvent` 存成
 * `hud.mobBoss.bossId`,`GameApp` 每一幀用它去快照裡查那一列、寫成
 * `frameBus.mobBoss`(entityId / zone / x / z / hpPct)。小地圖的紅點
 * (`minimapBossMarker`)就是這樣畫出來的。
 *
 * 也就是說 **`ENTITY_FLAG` 最後一格不必花**、`defineTypes` 不必 append —— 這一
 * 條的失敗形態 ② 已經被上一輪關掉了。這個檔要做的只有兩件事:
 *   · 把那條資訊變成螢幕上一條長血條(以前只有小地圖上一顆 5 px 的點);
 *   · 把 owner 那句話裡的三個決策變成後台欄位,而不是三個寫死的選擇。
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ② 三個欄位在哪裡、怎麼到這裡
 * ═════════════════════════════════════════════════════════════════════════════
 *   content/config/arena-rules.json  `mobWaves.boss.healthBar{,Anchor,Reveal}`
 *     → schema/config.ts (Zod + DEFAULT_MOB_WAVES_CONFIG)
 *     → sim/mobs.mobRulesFromConfig → `MobBossRules`
 *     → sim/mobs.mobVisualJson       → `MatchState.mobVisualJson`
 *     → net/RoomStore `hud.mobVisualJson` → `parseMobVisualJson`
 *     → {@link bossHealthBarSpec}(這個檔)→ `BossHealthBar.tsx`
 *
 * 守衛讀的是**最後一段真的畫出來的 DOM**,不是「config 說要顯示」——
 * `bossHealthBar.test.ts` 用 `renderToStaticMarkup` 把數字讀回來。中間任何一段
 * 斷掉(欄位沒進 json、json 沒進 store、spec 算了但沒畫)都會紅。
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ③ 位置:為什麼是「借用既有的中央走廊」而不是自己開一塊
 * ═════════════════════════════════════════════════════════════════════════════
 * #107 的安全區契約:沒有任何常駐 chrome 可以被蓋住。這條血條是**常駐**的
 * (王活多久它就在多久),所以它不能像 KillCombo 那樣被當成 transient 忽略。
 *
 * 它用的是 `mobBossModel.mobBossObstacles` —— 也就是降臨橫幅**已經在用的那一份
 * 障礙物清單** —— 而不是自己列一份。理由跟 `mobBossCollisions` 的註解相反方向
 * 但同一件事:那份清單是「這塊走廊被誰占著」的唯一答案,兩份會漂。
 *
 * 讓位順序(誰蓋誰):
 *   長血條(常駐)> 降臨橫幅 / 分紅面板(4.6s / 8.2s)> 連殺計數器(transient)
 * 橫幅讓位靠 `mobBossRect({ barRect })`,連殺讓位靠 `killComboRect({ bossBarRect })`
 * —— 兩個都是那兩個檔**已經有的**推擠機制,這裡只是多餵一個矩形進去。
 */
import {
  HUD_GAP,
  HUD_SLOTS,
  hudRectsOverlap,
  hudSlotRect,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";
import { ABILITY_CLUSTER_H, TOP_CENTRE_BAND_END } from "../controlLegendModel";
import { mobBossObstacles } from "./mobBossModel";
import type { BossHealthBarAnchor, BossHealthBarReveal } from "@ggd/shared/sim/mobs";
import type { MobBossMarker } from "../../frameBus";

/** Bar height in px — one title line over one 10px track, plus padding. */
export const BOSS_BAR_H = 38;
/** Below this the numbers cannot be read at all → nothing is drawn. */
export const BOSS_BAR_MIN_W = 220;
/** Preferred width. A raid bar is WIDE — that is the whole visual statement. */
export const BOSS_BAR_PREF_W = 620;

/** 殭屍王 crimson — the SAME literal the minimap pip uses, so one king, one colour. */
export const BOSS_BAR_COLOR = "#ff2d55";
/** The bar's own title. Reuses the 降臨 banner's word so the two agree. */
export const BOSS_BAR_TITLE = "殭屍王";

/**
 * Everything the component needs to paint, or `null` for 「don't draw」.
 *
 * Split spec-from-draw exactly like `minimapBossMarker`: every observable
 * decision (whether, where, how full, what number) is plain data, so a test can
 * assert on it without a DOM — and then the component test asserts the DOM
 * really carries it, which is the half that catches 失敗形態 ①③.
 */
export interface BossHealthBarSpec {
  rect: HudRect;
  /** 0..1 fill */
  hpPct: number;
  hp: number;
  maxHp: number;
  anchor: BossHealthBarAnchor;
}

/**
 * 這台客戶端這一幀該不該亮長血條 —— **只回答「該不該」**,位置在下面。
 *
 * 每一個 `false` 都是一個真的情況,而且理由各自不同:
 *   · 場上沒有活著的王(`marker === null`)—— `GameApp` 每一幀重建它,王死了就是
 *     null,所以這裡不需要第二個 alive 旗標;
 *   · 後台把它關掉了(`healthBar: false`);
 *   · **王在別的戰場**。跟降臨橫幅同一條規矩(`bossVisibleInZone`):兩個王事件
 *     是廣播給整場的,但王只生在一個 duel zone。差別是這一條**不 fail open** ——
 *     橫幅是一次性的頭條,寧可多播;長血條是**常駐**的,一條永遠掛在螢幕上、
 *     講一場你不在的仗的血條,比沒有更糟。所以 zone 不明時不畫。
 *   · `reveal === "sighted"` 而你正在看別的戰場(#269 之後鏡頭是玩家自己切的)。
 */
export function bossHealthBarVisible(
  marker: MobBossMarker | null,
  opts: {
    enabled: boolean;
    reveal: BossHealthBarReveal;
    /** the local player's own duel zone, -1 = unresolved */
    localZone: number;
    /** what the combat camera is looking at (frameBus.cameraView); null = 不知道 */
    camera: BossSightCamera | null;
  },
): boolean {
  if (!marker || !opts.enabled) return false;
  // ⚠️ NOT fail-open, unlike `bossVisibleInZone`. See the doc above.
  if (marker.zone < 0 || opts.localZone < 0) return false;
  if (marker.zone !== opts.localZone) return false;
  if (opts.reveal === "sighted" && !bossInSight(marker, opts.camera)) return false;
  return true;
}

/** The camera facts {@link bossInSight} needs — a subset of `CameraGroundView`. */
export interface BossSightCamera {
  targetX: number;
  targetZ: number;
  /** eye distance from the target along the sightline (world units) */
  dolly: number;
}

/**
 * 「王進視野了嗎」 —— for the `"sighted"` reveal mode ONLY.
 *
 * ⚠️ 這是一個**近似**,而且必須說出來(第三守則):它是「以鏡頭注視點為圓心、
 * `dolly` 為半徑的圓」,不是視錐(frustum)測試。畫面四角會略微保守。
 *
 * 為什麼不做真的視錐:那要 `fovRad` / `aspect` / `pitchRad` 三個角度和一串三角
 * 函式,而這一格的用途是給 owner 一個「不要一召喚就亮」的選項,不是像素精確的
 * 可見性判定 —— 一個半徑就足以區分「王還在對面遠處」與「王走到你面前」。
 *
 * `camera === null`(鏡頭還沒註冊、還在載入)⇒ **當作看得到**。這一格是
 * 「什麼時候亮」,不是一道權限;不知道鏡頭在哪就把血條藏起來,會讓功能看起來壞掉。
 */
export function bossInSight(marker: MobBossMarker, camera: BossSightCamera | null): boolean {
  if (!camera) return true;
  const r = camera.dolly;
  if (!(r > 0)) return true;
  const dx = marker.worldX - camera.targetX;
  const dz = marker.worldZ - camera.targetZ;
  return dx * dx + dz * dz <= r * r;
}

export interface BossBarPlacementOpts {
  touch: boolean;
  legendUp: boolean;
  couchPlayers?: number;
  anchor: BossHealthBarAnchor;
}

/**
 * The rectangle the bar may paint in, or `null` when this viewport has no room.
 *
 * `null` MEANS NOTHING IS DRAWN, not 「draw it anyway at 0,0」 (#107) — the same
 * contract `mobBossRect` and `killComboRect` both state.
 *
 * `"top"`    hangs under the phase-timer cluster (WoW/FF14 團隊首領條)
 * `"bottom"` sits directly over the ability cluster (魂系首領條)
 *
 * The side scan is copied in SHAPE from `mobBossRect` but reads the SAME
 * obstacle list — anything straddling the centre line in this y-band means there
 * is no centred gap at all, and the honest answer is to draw nothing.
 */
export function bossHealthBarRect(
  viewport: HudViewport,
  opts: BossBarPlacementOpts,
): HudRect | null {
  const mid = viewport.width / 2;
  const corridorTop = TOP_CENTRE_BAND_END + HUD_GAP;
  const corridorBottom = viewport.height - ABILITY_CLUSTER_H - HUD_GAP;
  if (corridorBottom - corridorTop < BOSS_BAR_H) return null;

  const y = opts.anchor === "bottom" ? corridorBottom - BOSS_BAR_H : corridorTop;
  const h = BOSS_BAR_H;

  let left = 0;
  let right = 0;
  for (const { rect: r } of mobBossObstacles(viewport, {
    touch: opts.touch,
    legendUp: opts.legendUp,
    couchPlayers: opts.couchPlayers,
    wantH: h,
    minH: h,
  })) {
    if (r.y >= y + h || r.y + r.h <= y) continue; // no vertical overlap
    if (r.x < mid && r.x + r.w > mid) return null; // no centred gap at all
    if (r.x + r.w <= mid) left = Math.max(left, r.x + r.w);
    else right = Math.max(right, viewport.width - r.x);
  }

  const halfFree = Math.min(mid - left, mid - right) - HUD_GAP;
  const w = Math.min(BOSS_BAR_PREF_W, halfFree * 2);
  if (w < BOSS_BAR_MIN_W) return null;
  return { x: Math.round((viewport.width - w) / 2), y: Math.round(y), w: Math.round(w), h };
}

/**
 * Everything the bar actually paints, or null.
 *
 * ONE entry point, for the reason `mobBossOverlayRect` states: the renderer AND
 * the two things that yield to this bar (the 降臨 banner, the 連殺 counter) must
 * resolve the SAME rectangle, so they all call this and pass `spec?.rect` on.
 */
export function bossHealthBarSpec(
  marker: MobBossMarker | null,
  viewport: HudViewport,
  opts: BossBarPlacementOpts & {
    enabled: boolean;
    reveal: BossHealthBarReveal;
    localZone: number;
    camera: BossSightCamera | null;
  },
): BossHealthBarSpec | null {
  if (!bossHealthBarVisible(marker, opts)) return null;
  const rect = bossHealthBarRect(viewport, opts);
  if (!rect) return null;
  const m = marker!;
  const maxHp = Math.max(0, m.maxHp);
  const hp = Math.max(0, Math.min(maxHp, m.hp));
  return {
    rect,
    // Recomputed from hp/maxHp rather than trusting `hpPct`: the two must never
    // disagree on the ONE screen that shows both the fill and the numbers.
    hpPct: maxHp > 0 ? hp / maxHp : 0,
    hp,
    maxHp,
    anchor: opts.anchor,
  };
}

/**
 * 「276,944 / 276,944」 — thousands separated, because a 276944 with no commas is
 * a number nobody reads mid-fight.
 */
export function bossHpText(hp: number, maxHp: number): string {
  return `${group(hp)} / ${group(maxHp)}`;
}

function group(n: number): string {
  const v = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  const s = String(v);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return out;
}

/**
 * Everything the resolved rect really touches — empty is the only passing answer.
 *
 * ⚠️ DELIBERATELY NOT BUILT FROM {@link mobBossObstacles}, for the reason
 * `mobBossCollisions` / `killComboCollisions` both state: checking a placement
 * against the very list the placement consulted is a tautology. The duplication
 * IS the guard.
 */
export function bossHealthBarCollisions(
  viewport: HudViewport,
  opts: BossBarPlacementOpts,
): string[] {
  const rect = bossHealthBarRect(viewport, opts);
  if (!rect) return [];
  const hits: string[] = [];
  for (const s of HUD_SLOTS) {
    if (s.transient) continue;
    if (hudRectsOverlap(rect, hudSlotRect(s.id as HudSlotId, viewport, opts.touch))) hits.push(s.id);
  }
  return hits.sort();
}
