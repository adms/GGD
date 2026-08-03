/**
 * 特殊殭屍頭上的小血條 —— 純模型 (owner 2026-08-03「特殊殭屍 頭上應該要有小血條
 * 顯示即時血量」).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ 出貨簡史（2026-08-03，GH#268）—— 這條路曾經**兩端都沒接**
 * ═════════════════════════════════════════════════════════════════════════════
 * v0.9.28 出貨時這個檔頭寫著「`GameApp` 的每幀錨點掃描直接呼叫 `mobBarAnchorFor`」。
 * **那句話是假的**（第三守則），而它就是「修過而且沒生效」的原因：`GameApp` 全檔
 * 沒有任何 `mobBars` 參照、`HudRoot` 沒有 import `MobHealthBars`。伺服器真的把
 * `ENTITY_FLAG.MOB_ELITE` 寫進快照（`snapshot.ts`，`mobEliteWire.test.ts` 證明過線），
 * 客戶端把它丟掉 —— 整包功能可以從 repo 刪掉而畫面一個像素都不變（**失敗形態 ③
 * 的教科書範例**），而且是在已經付掉 `ENTITY_FLAG` 最後一格（32768，不可逆）之後。
 *
 * 現在兩端都接上了：
 *   · 寫入者 `GameApp.updateFrameBus` 的每幀掃描（`KIND_MOB` 分支，連 L3 zone cull），
 *     呼叫的就是下面的 {@link mobBarAnchorFor} / {@link mobBarAnchorY}；
 *   · 讀取者 `HudRoot` 掛的 `<MobHealthBars />`。
 *
 * ⚠️ **守衛比散文重要**：擋住這件事再發生的是
 * `ui/hud/mobHealthBarWiring.test.ts` 的守衛 B（在 jsdom 掛出貨的 `HudRoot`，
 * 斷言渲染樹上真的有 `data-mob-bar` 節點）。v0.9.28 缺的就是那一條 ——
 * 有它的話那次的假成功當場就會被抓到。
 *
 * ⚠️ 而 owner 抱怨的「殭屍王的血條」是**另一條**路：長血條
 * （`BossHealthBar` ← `frameBus.mobBoss`）。它以前的存續條件是
 * `hud.mobBoss?.kind === "spawn" ? bossId : -1` —— 一顆**一場只有一個槽**的事件
 * （`RoomStore`）。自 #288 起**每一隻特殊殭屍死掉也會發 `mobBossSlain`**
 * （`sim/systems/MobSystem.ts`），所以任何一區的任何一隻精英死掉，都會把那一格翻成
 * `"slain"` → `bossId = -1` → 本區那隻**滿血的王**的長血條立刻消失。修法是把
 * 「當前活著的王」（`hud.mobBossLive`）與「最後一則結算」（`hud.mobBoss`）拆成
 * 兩個欄位，判斷收在 `frameBus.mobBossMarkerFor`，守衛 A 驗它。
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ① 為什麼這是一個新檔，而不是把小怪塞進 `hasOverheadBar`
 * ═════════════════════════════════════════════════════════════════════════════
 * `hasOverheadBar(kind)` 只看 kind，而**眼前這個決定是 per-entity 的**：同一個
 * `ENTITY_KIND.MOB` 裡，一般殭屍不要血條（第 9 回合一區 50 隻，50 條血條就是把
 * 畫面糊掉），特殊殭屍與殭屍王要。那個判斷讀的是快照上的
 * `ENTITY_FLAG.MOB_ELITE`（`isEliteMob`），也就是**這一輪才存在的資訊**。
 *
 * 而且冠軍那條血條的幾何是寫死在 `WorldAnchorLayer` 裡的（`BAR_W = 64`、6px 高、
 * `top:-14px`）。owner 要的四個數字（寬、高、離頭頂多高、血量低於多少才顯示）
 * 是**四個決策點**，第一守則說決策點要落後台，所以它們是欄位，不是常數。
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ② 設定值從哪裡來 —— **2026-08-03 起這條路已經打通**（第三守則：這一段以前
 *    寫著「還沒有任何設定值真的送到這裡」，那句話現在是假的，所以改掉）
 * ═════════════════════════════════════════════════════════════════════════════
 * 既有的小怪外觀頻道是 `MatchState.mobVisualJson`（`MobVisualTable`，殭屍王長血條
 * 的三格就騎在上面）。這四格走的是同一條路，而且**每一段都接上了**：
 *
 *   content/config/arena-rules.json  `mobWaves.healthBar`（出貨值）
 *     → schema/config.ts  Zod（上下界都有）+ DEFAULT_MOB_WAVES_CONFIG.healthBar
 *     → sim/mobs.ts       MobRules.eliteHealthBar → MobVisualTable → mobVisualJson
 *     → parseMobVisualJson（逐欄位降級）→ {@link mobHealthBarConfigFrom}
 *     → apps/admin/src/mobWaves.ts 的五個後台欄位（「精英小怪血條」那一組）
 *
 * 守衛：`packages/shared/src/sim/mobEliteHealthBarWire.test.ts`（作者填的五格
 * 原封不動到得了解碼端；突變驗過會紅）。
 *
 * `GameApp` 把這五格裡的 `yOffset` 用在投影高度上（跟著 `mobVisualJson` 一起重算，
 * 不是每幀 parse）；其餘四格由 `mobHealthBar.tsx` 自己讀 store。
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ③ 這個檔只回答「畫不畫、多大、在哪」，不碰 DOM
 * ═════════════════════════════════════════════════════════════════════════════
 * 跟 `bossHealthBarModel` 同一個切法：每一個可觀察的決定都是純資料，元件只負責
 * 把它畫出來，而 `mobHealthBar.test.ts` 兩邊都驗 —— 模型算對了跟玩家看得到是
 * 兩件事（失敗形態 ①③）。
 */
import { isEliteMob } from "@ggd/shared/protocol/schema";
import type { AnchorPose, MobBarAnchor } from "../../frameBus";

/**
 * 四個後台決策（＋主開關）。名字與 owner 的說法一一對應。
 *
 * ⚠️ 上下界寫在這裡是**第二道**防線，不是唯一一道：真正該擋在編輯發生的當下的是
 * Zod（見上面的 needsOthers 路線）。這裡夾住，是因為這條路上任何一段（舊 shard、
 * 手改的 override、壞掉的 JSON）都可能餵進 NaN 或 500，而一條 500px 寬的血條會
 * 蓋掉半個畫面。
 */
export interface MobHealthBarConfig {
  /** 精英小怪頭上到底畫不畫血條。出貨 true。 */
  showHealthBar: boolean;
  /** 血條寬度（CSS px）。 */
  barWidth: number;
  /** 血條高度（CSS px）。 */
  barHeight: number;
  /**
   * 血條離**頭頂**多高（世界單位，往上為正）。
   * 給的是世界高度而不是 px offset，因為特殊殭屍的體型倍率是 2、王是 5 —— 一個
   * 固定的 px 偏移在王頭上會埋進胸口。
   */
  yOffset: number;
  /**
   * 血量低於這個比例才顯示。出貨 1.0 = 只要是精英就一直顯示。
   * 0.5 = 只有半血以下才亮（想要「快死了才提示」的玩法時用）。
   */
  showThreshold: number;
}

/**
 * 出貨值。⚠️ 一旦 `mobWaves.healthBar` 進了 `content/config/arena-rules.json`
 * 與 `schema/config.ts` 的 `DEFAULT_*`，這裡的四個數字必須跟那兩處**一模一樣**，
 * 否則就是 CLAUDE.md 說的三處漂移。
 *
 * 為什麼是 34 × 5：冠軍血條是 64 × 6，精英殭屍要比玩家小一號才不會被誤讀成一個
 * 玩家（波峰時畫面上同時有 12 個玩家），但又要在 2× 體型的身上一眼看得到。
 * `yOffset` 0.35u ≈ 頭頂上一個拳頭。
 */
export const SHIPPED_MOB_HEALTH_BAR: MobHealthBarConfig = {
  showHealthBar: true,
  barWidth: 34,
  barHeight: 5,
  yOffset: 0.35,
  showThreshold: 1,
};

/** 精英小怪血條的顏色 —— 刻意不在四隊色盤裡，也不是王的長血條那個緋紅。 */
export const MOB_BAR_COLOR = "#ff8a3d";

const LIMITS = {
  barWidth: [8, 200],
  barHeight: [1, 40],
  yOffset: [-2, 6],
  showThreshold: [0, 1],
} as const;

function clampNum(v: unknown, key: keyof typeof LIMITS, fallback: number): number {
  const [lo, hi] = LIMITS[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 從已經解析好的 `mobVisualJson` 表（或任何帶著這些 key 的物件）取出這四格。
 *
 * 逐欄位降級，跟 `parseMobVisualJson` 同一條規矩：一台跑在舊 shard 前面的客戶端
 * 拿到的是**出貨值**，不是一張歸零的表 —— 歸零會把整個功能靜默刪掉而且全綠
 * （失敗形態 ③）。
 */
export function mobHealthBarConfigFrom(table: unknown): MobHealthBarConfig {
  if (typeof table !== "object" || table === null) return SHIPPED_MOB_HEALTH_BAR;
  const o = table as Record<string, unknown>;
  return {
    showHealthBar:
      typeof o.mobHealthBar === "boolean" ? o.mobHealthBar : SHIPPED_MOB_HEALTH_BAR.showHealthBar,
    barWidth: clampNum(o.mobHealthBarWidth, "barWidth", SHIPPED_MOB_HEALTH_BAR.barWidth),
    barHeight: clampNum(o.mobHealthBarHeight, "barHeight", SHIPPED_MOB_HEALTH_BAR.barHeight),
    yOffset: clampNum(o.mobHealthBarYOffset, "yOffset", SHIPPED_MOB_HEALTH_BAR.yOffset),
    showThreshold: clampNum(
      o.mobHealthBarShowThreshold,
      "showThreshold",
      SHIPPED_MOB_HEALTH_BAR.showThreshold,
    ),
  };
}

/**
 * 快照那一列身上，這條血條需要的全部欄位。刻意是**結構型**而不是 `EntityState`：
 * 這個檔在 `ui/`，不該去 import Colyseus 的 schema 類別，而 `GameApp` 手上那一列
 * 剛好就是這個形狀。
 */
export interface MobBarRow {
  id: number;
  kind: number;
  flags: number;
  /**
   * ⚠️ 屍體不可以有血條，而「還在不在」必須在**這裡**判斷，不是在 `GameApp` 裡。
   * 小怪死掉那一 tick 仍然可能出現在快照上（`MobSystem` 是先結算再 despawn），
   * 而一條掛在屍體上的滿血條比沒有血條更難懂。
   */
  alive: boolean;
  hp: number;
  maxHp: number;
  zone: number;
}

/**
 * 一列快照 → 一筆 `frameBus.mobBars`，或 null（＝這一隻不該有血條）。
 *
 * ⚠️ **「哪一隻算精英」這個判斷只有這裡一個實作**，守衛驅動的也是它 —— 如果判斷
 * 抄在 `GameApp` 裡、測試自己再抄一份，那就是失敗形態 ⑤：被測的不是出貨的那個。
 * `GameApp.updateFrameBus` 的 `KIND_MOB` 分支直接呼叫這個函式。
 *
 * 判準是 `isEliteMob(kind, flags)`，也就是伺服器投影寫進 `ENTITY_FLAG.MOB_ELITE`
 * 的那一格 —— 不是體型、不是 modelKey、不是 hp 大小。那三個都是**設定值**：後台
 * 把特殊殭屍的 `sizeMult` 調成 1 的那一天，用體型猜身分的實作就會靜靜地停止工作。
 */
export function mobBarAnchorFor(
  row: MobBarRow,
  pose: AnchorPose,
  world: { x: number; z: number },
): MobBarAnchor | null {
  if (!isEliteMob(row.kind, row.flags)) return null;
  if (!row.alive) return null;
  const maxHp = Math.max(0, row.maxHp);
  const hp = Math.max(0, Math.min(maxHp, row.hp));
  return {
    entityId: row.id,
    zone: row.zone,
    hpPct: maxHp > 0 ? hp / maxHp : 0,
    hp,
    maxHp,
    worldX: world.x,
    worldZ: world.z,
    pose,
  };
}

/**
 * 一隻**體型倍率 1** 的小怪身體有多高（GGD 單位）。
 * `render/overheadAnchors` 的檔頭說「champions are ~1.8u tall」，而小怪的模型就是
 * 從英雄解析出來的（GH#192），所以用同一個數字。
 */
export const MOB_BODY_HEIGHT_U = 1.8;

/**
 * 這一隻小怪的血條該從哪一個世界高度投影 —— `GameApp` 的
 * `project(x, mobBarAnchorY(sizeMult, cfg), z)` 用的就是這個數字。
 *
 * ⚠️ `sizeMult` 是快照 `EntityState.mana` 那一格（GH#192 的體型倍率）。它必須進
 * 這條公式，不然 `yOffset` 就是一個**寫了但沒人讀**的欄位：一般殭屍 0.68、特殊
 * 2、王 5 —— 一個固定高度會讓王的血條掛在牠的膝蓋上。
 */
export function mobBarAnchorY(sizeMult: number, cfg: MobHealthBarConfig): number {
  const s = Number.isFinite(sizeMult) && sizeMult > 0 ? sizeMult : 1;
  return MOB_BODY_HEIGHT_U * s + clampNum(cfg.yOffset, "yOffset", SHIPPED_MOB_HEALTH_BAR.yOffset);
}

/** 一條真的要畫出來的血條 —— 元件拿到的全部東西。 */
export interface MobBarSpec {
  entityId: number;
  /** CSS px, 已經夾過界 */
  width: number;
  height: number;
  /** 0..1 填充比例 */
  hpPct: number;
  /** 螢幕座標（錨點投影的結果） */
  sx: number;
  sy: number;
}

/**
 * 這一隻精英小怪這一幀該不該亮血條 —— **只回答該不該**。
 *
 * 每一個 false 都是一個真的情況：
 *   · 後台關掉了（`showHealthBar: false`）；
 *   · 這具身體沒有血量上限（`maxHp <= 0`，例如快照還沒補齊的那一幀）——
 *     畫一條 0/0 的空條比不畫更難懂；
 *   · 投影說它不在畫面上（`pose.visible === false`）——鏡頭後面的血條會浮在
 *     螢幕邊緣（失敗形態 ①，畫在畫面外）；
 *   · 血量還在門檻之上（`showThreshold < 1` 的玩法）。
 *
 * ⚠️ 「死了」不在這個清單裡，因為它在更早一關就被擋掉了：`mobBarAnchorFor` 的
 * `row.alive` 判斷不會替屍體建錨點，而 `frameBus.mobBars` 每一幀從快照重建。
 *
 * ⚠️ **這張清單上沒有「血量」這一項，而且不可以有**（GH#268）。血條的存續條件
 * 只能綁在**那具身體還在不在**，不能綁在任何比身體短命的東西上 —— 一顆事件、
 * 一個 aggro 集合、一個 target 欄位、或是「最近有沒有被打」。owner 兩次回報的
 * 「殭屍王血量在死之前就消失」就是長血條綁到了一顆單槽事件上。
 * `showThreshold` 是唯一的例外，而它是**後台明說要的玩法**，出貨 1.0 = 全程顯示。
 * 守衛：`mobHealthBar.test.ts`「王從滿血掉到 1%」那一條。
 */
export function mobBarVisible(bar: MobBarAnchor, cfg: MobHealthBarConfig): boolean {
  if (!cfg.showHealthBar) return false;
  if (!(bar.maxHp > 0)) return false;
  if (!bar.pose.visible) return false;
  return bar.hpPct <= cfg.showThreshold;
}

/** 一條血條的完整規格，或 null（＝不畫）。 */
export function mobBarSpec(bar: MobBarAnchor, cfg: MobHealthBarConfig): MobBarSpec | null {
  if (!mobBarVisible(bar, cfg)) return null;
  const maxHp = Math.max(0, bar.maxHp);
  const hp = Math.max(0, Math.min(maxHp, bar.hp));
  return {
    entityId: bar.entityId,
    width: clampNum(cfg.barWidth, "barWidth", SHIPPED_MOB_HEALTH_BAR.barWidth),
    height: clampNum(cfg.barHeight, "barHeight", SHIPPED_MOB_HEALTH_BAR.barHeight),
    // 從 hp/maxHp 重算，不信 `hpPct`：同一條血條上填充與數字不可以互相矛盾
    // （跟 `bossHealthBarSpec` 同一條理由）。
    hpPct: maxHp > 0 ? hp / maxHp : 0,
    sx: bar.pose.sx,
    sy: bar.pose.sy,
  };
}

/** 這一幀所有要畫的血條，順序穩定（依 entityId），方便元件用 key 對位。 */
export function mobBarSpecs(
  bars: readonly MobBarAnchor[],
  cfg: MobHealthBarConfig,
): MobBarSpec[] {
  const out: MobBarSpec[] = [];
  for (const b of bars) {
    const s = mobBarSpec(b, cfg);
    if (s) out.push(s);
  }
  out.sort((a, b) => a.entityId - b.entityId);
  return out;
}
