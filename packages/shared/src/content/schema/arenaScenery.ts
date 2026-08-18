/**
 * `scenery` —— 一張場地的**視覺身分**：配色 · 打光 · 裝飾散佈（GH#362）。
 *
 * owner 2026-08-18：
 *
 * > 每個地圖還是**太少特殊獨有場景裝飾**了，請你放更多該場景的特色裝飾品及物件，
 * > 增加更多沉浸感與特色區別（**包含打光也應該有變化區別，不是靜態不會變動的光**，
 * > **地板與牆壁顏色**等應該都要有該場景特色）
 *
 * ## ⭐ 為什麼是一份 schema，⛔ 不是「為每張圖寫一段 TS」
 *
 * 第零守則⑨：**如果第二張圖跟第一張只差參數，停手，先抽模板。** 13 張場地的
 * 「場景特色」逐字比對之後只有三軸不同 —— 什麼顏色、什麼燈、擺什麼東西 ——
 * 所以引擎裡只該有**三個機制**，而 13 張圖是**一張 13 列的參數表**。
 *
 * ```
 *   機制（這個檔 + 三個 render 接縫）      內容（arena@1 / map@1 的 scenery 區塊）
 *   ────────────────────────────────      ────────────────────────────────────
 *   palette   → 地板／牆／天光／地光／虛空   「無限城是靛藍配朱紅」
 *   lighting  → 主光＋補光＋**一條波形**     「雷雨：storm 波、週期 6.4 秒」
 *   props     → 一條散佈規則展開成 N 件      「沿著 0.9R 的環擺 18 根柱子」
 * ```
 *
 * ⛔ 看到「`if (arena.id === "arena.nazarick")`」就是越線了。
 *
 * ## ⚠️ 這一格只住在 `ArenaDoc`，⛔ 不在 `ArenaDef`
 *
 * 與 `backdrop` 同一個結構性理由（見 `arena.ts` 的 `zBackdrop` 檔頭）：
 * `arenaDefFromDoc()` 不看這一格 ⇒ **sim 在型別上就拿不到它** ⇒
 * 一個顏色永遠不可能變成一次碰撞判定。比「寫一條測試檢查它沒影響 sim」強一級。
 *
 * ## ⚠️ 缺席 = 今天的樣子，⛔ 不是「黑畫面」
 *
 * 每一格都有 `DEFAULT_SCENERY_*`，而那些預設值**逐字等於出貨前寫死在
 * `render/Lighting.ts` 與 `render/ArenaGround.ts` 裡的數字**。所以沒宣告
 * `scenery` 的場地一個像素都不會變 —— 這是 13 張圖逐張填參數期間的安全網。
 */
import { z } from "zod";
// ⚠️ **型別 only** —— 執行期沒有這條邊（`arena.ts` 反過來 import 本檔的 zod
// 值），型別 import 會被編譯器整條抹掉，所以兩個檔之間沒有 runtime 迴圈。
import type { DecorDef } from "./arena";

const zHex = (what: string): z.ZodString =>
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "顏色要寫成 #rrggbb")
    .describe(what);

// ---------------------------------------------------------------------------
// ① 配色 —— 地板 / 牆壁 / 天光 / 地光 / 虛空
// ---------------------------------------------------------------------------

/**
 * ⚠️ 這五格是**乘上去的染色**，⛔ 不是「換一張貼圖」。
 *
 * 地面貼圖組由 `groundStyle` 決定（7 種，各自有 painter 與 PNG）。染色是**另一軸**：
 * 同一張 `stone` 貼圖，芙莉蓮迷宮染成冷灰藍、納薩力克染成血紅、大聖杯洞窟染成
 * 金綠 —— 三張圖看起來完全是三個地方，而**沒有多下載一個位元組**。
 * ⛔ 反過來（為了顏色去新增一個 groundStyle）代價是一整組 4 張 PNG 加一個 painter，
 * 見 `groundStyle.ts` 的「新增一個 id 是有代價的」。
 */
export const zSceneryPalette = z
  .object({
    floor: zHex(
      "地板染色。#ffffff = 不染（貼圖原樣）。⚠️ 這是**乘法**，所以只會讓地板變暗／偏色，⛔ 沒辦法讓它變亮。",
    ).default("#ffffff"),
    wall: zHex(
      "邊界牆（kerb）與外圈裙邊的染色。⭐ 刻意與地板**分開**：owner 要的是「地板與牆壁顏色」兩件事，而一圈與地板不同色的牆正是「這裡是被造出來的場地」最強的訊號。",
    ).default("#9e99a1"),
    sky: zHex(
      "天光（半球光的上半）。⭐ 這一格決定**陰影裡**是什麼顏色 —— 冷藍 = 月夜／地牢，暖橘 = 夕照／火場。",
    ).default("#e6ebff"),
    ground: zHex(
      "地光（半球光的下半，地面反彈回來的光）。⚠️ 要跟 `floor` 同一個色系，否則英雄的下半身會出現一圈和地板無關的顏色。",
    ).default("#2e2938"),
    void: zHex(
      "圓盤外的底色（`scene.clearColor`）。⚠️ 有 `backdrop` 的場地大部分會被蓋掉，這一格是**最外圈之外**那一塊。",
    ).default("#0b0e14"),
  })
  .strict();

// ---------------------------------------------------------------------------
// ② 打光 —— owner：「不是靜態不會變動的光」
// ---------------------------------------------------------------------------

/**
 * 光的**波形**。⭐ 這是這條 issue 的核心：出貨前整個遊戲只有一顆固定強度、
 * 固定角度的方向光，13 張場地共用它 —— 也就是 owner 說的「靜態不會變動的光」。
 *
 * ⚠️ 五種波形**全部是 `t` 的純函式**（正弦組合，零亂數、零狀態）。理由有兩個：
 * ① 可以逐點斷言（`sceneryLightAt` 有守衛）；
 * ② 重連 / 重建場地不會讓光跳一下 —— 相位只跟時間有關，不跟「這一趟從什麼時候開始」有關。
 */
export const SCENERY_LIGHT_WAVES = ["none", "breathe", "flicker", "sweep", "storm"] as const;
export type SceneryLightWave = (typeof SCENERY_LIGHT_WAVES)[number];

/** 給人看的名字 —— 後台欄位提示與地圖編輯器的下拉選單共用同一份。 */
export const SCENERY_LIGHT_WAVE_LABELS: Record<SceneryLightWave, string> = {
  none: "不動（出貨前所有場地的樣子）",
  breathe: "呼吸 —— 一條慢正弦，明暗來回（神殿 / 森林 / 水底）",
  flicker: "搖曳 —— 三條快慢不同的正弦疊起來，像火把或燭火在抖",
  sweep: "掃掠 —— 主光的方位角來回擺，影子跟著轉（雲隙陽光 / 探照燈）",
  storm: "雷雨 —— 長時間偏暗，週期性爆出一下極亮（無限城 / 城牆之夜）",
};

export const zSceneryLighting = z
  .object({
    keyColor: zHex("主光（方向光）的顏色。⭐ 場景「幾點鐘、什麼天氣」幾乎全由這一格決定。").default(
      "#fff5e0",
    ),
    keyIntensity: z
      .number()
      .min(0)
      .max(3)
      .default(0.9)
      .describe(
        "主光強度。0.9 = 出貨值。⚠️ 上界 3 擋掉把「百分比」填成 90 的誤填 —— 那會讓整張圖全白。",
      ),
    keyYawDeg: z
      .number()
      .min(0)
      .max(360)
      .default(311)
      .describe("主光的方位角（度，0 = 從北邊照過來，順時針）。⭐ 它決定影子往哪邊倒。"),
    keyPitchDeg: z
      .number()
      .min(5)
      .max(89)
      .default(62)
      .describe(
        "主光的仰角（度）。89 = 正上方（正午，幾乎沒有影子）；15 = 貼著地平線（黃昏，長影子）。⚠️ 下界 5 是因為再低就會從地板下面照上來。",
      ),
    fillIntensity: z
      .number()
      .min(0)
      .max(3)
      .default(0.75)
      .describe(
        "補光（半球光）強度。0.75 = 出貨值。⭐ 這一格控制**對比**：調低 = 陰影更黑更戲劇化，調高 = 平光、看得清楚但沒有氣氛。",
      ),
    wave: z
      .enum(SCENERY_LIGHT_WAVES)
      .default("none")
      .describe(
        "光怎麼變動。⚠️ `none` 是**出貨前的樣子**，owner 2026-08-18 明說那不是他要的；每一張出貨場地都應該挑一個非 none 的。",
      ),
    periodSec: z
      .number()
      .min(0.4)
      .max(120)
      .default(8)
      .describe(
        "波形跑完一圈幾秒。⚠️ 太快（<1.5 秒）在非火焰場景會像壞掉的日光燈；一場對戰約 40 秒，所以 >40 的週期玩家一場只看得到半個循環。",
      ),
    intensityAmp: z
      .number()
      .min(0)
      .max(1)
      .default(0)
      .describe(
        "強度擺幅。0 = 亮度不動（就算 wave 不是 none，也只有角度／顏色在動）；1 = 波谷時主光完全熄滅。⚠️ 0.15–0.35 是「看得出來在動但不吵」的區間。",
      ),
    yawSweepDeg: z
      .number()
      .min(0)
      .max(180)
      .default(0)
      .describe(
        "主光方位角的擺幅（度，左右各這麼多）。⭐ 這是**影子會動**的那一格 —— 亮度變化在俯視角很含蓄，影子轉起來一眼就看得到。",
      ),
    peakColor: zHex(
      "波峰時主光偏向的顏色（不填 = 全程 `keyColor`）。⭐ 這一格把「亮度變化」升級成「氣氛變化」：雷雨的波峰偏慘白、火場的波峰偏橙紅。",
    ).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// ③ 裝飾散佈 —— 一條規則 = N 件道具
// ---------------------------------------------------------------------------

/**
 * ⭐ **一條規則展開成 N 件道具**，⛔ 不是在 JSON 裡手打 N 列 `decor`。
 *
 * 出貨的 `arena.godie` 有 **50 列**逐字重複的櫻花樹（每一列只有 x/z/scale 不同），
 * 那正是第零守則⑨說的「到處改改改」。同一批東西寫成一條 `count: 50` 的規則之後：
 * 改一個數字就是改整片林子，而不是改 50 行。
 *
 * ⚠️ 展開結果**逐字就是 `DecorDef`**，所以下游（視線壓扁、接觸陰影、火焰掛載、
 * LOD、淡出）一行都不用改 —— 這條規則只是 decor 的**產生器**，⛔ 不是第二條渲染路徑。
 *
 * ⚠️ **視覺 only，沒有碰撞。** 與 `decor` 完全同一件事：sim 只看 `obstacles`。
 * ⇒ 擺在打鬥圈正中央的柱子玩家會直接穿過去。⭐ 所以 `band` 的出貨用法一律貼著
 * 邊緣（0.84–0.99），那裡既看得到又不會有人想從中間穿過。
 */
export const zSceneryPropScatter = z
  .object({
    model: z
      .string()
      .regex(/^assets\//, "模型路徑要從 assets/ 開始")
      .describe("道具模型路徑（content/ 底下），例如 `assets/models/props/pillar.glb`。"),
    count: z
      .number()
      .int()
      .min(1)
      .max(64)
      .describe(
        "每個對戰分區擺幾件。⚠️ 一張場地有 2 個分區，所以場上實際是這個數字的兩倍；上限 64 擋掉把 16 打成 160。",
      ),
    bandFrom: z
      .number()
      .min(0)
      .max(1)
      .default(0.86)
      .describe(
        "散佈環的內緣，**場地半徑的比例**。0 = 正中央、1 = 貼著牆。⚠️ 低於 0.7 就會擺進打鬥區，而道具**沒有碰撞** —— 玩家會穿過去。",
      ),
    bandTo: z
      .number()
      .min(0)
      .max(1)
      .default(0.97)
      .describe("散佈環的外緣（同樣是比例）。⚠️ 必須 ≥ bandFrom；兩者相等 = 一圈完美的環。"),
    arcFromDeg: z
      .number()
      .min(0)
      .max(360)
      .default(0)
      .describe("只擺在這個角度區間裡（度）。⭐ 用來做「只有北側有觀眾席」這種不對稱佈局。"),
    arcSpanDeg: z
      .number()
      .min(1)
      .max(360)
      .default(360)
      .describe("角度區間有多寬（度）。360 = 繞滿一圈。"),
    scaleMin: z.number().positive().max(20).default(1).describe("縮放下界（每件在上下界之間抽）。"),
    scaleMax: z
      .number()
      .positive()
      .max(20)
      .default(1)
      .describe("縮放上界。⚠️ 必須 ≥ scaleMin；兩者相等 = 每件一樣大。"),
    facing: z
      .enum(["faceIn", "random", "fixed"])
      .default("faceIn")
      .describe(
        "朝向。faceIn = 面向場地中心（觀眾席／火把／旗幟要的）；random = 亂轉（樹、石頭）；fixed = 全部用 rotQuarter。⚠️ 旋轉只有四分之一圈四檔（跟 `decor` 同口徑，資料裡不出現弧度）。" +
          "⛔ 刻意**沒有** `faceOut`：出貨的 19 個布景模型裡沒有一個「背對場地」是對的，而一個沒有人用的選項就是 S8（機制上線、內容 0 筆）。真的需要時再加一列，兩行的事。",
      ),
    rotQuarter: z
      .number()
      .int()
      .min(0)
      .max(3)
      .default(0)
      .describe("facing = fixed 時用的固定朝向（四分之一圈）。"),
    seed: z
      .number()
      .int()
      .min(0)
      .max(9999)
      .default(0)
      .describe(
        "亂數種子。⭐ 同一個種子永遠展開出同一批座標（重建場地不會跳位）；換一個數字就換一套擺法。同一張圖的兩條規則要給**不同**的種子，否則兩批道具會疊在一起。",
      ),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.bandTo < r.bandFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bandTo"],
        message: `bandTo (${r.bandTo}) 必須 ≥ bandFrom (${r.bandFrom})`,
      });
    }
    if (r.scaleMax < r.scaleMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scaleMax"],
        message: `scaleMax (${r.scaleMax}) 必須 ≥ scaleMin (${r.scaleMin})`,
      });
    }
  });

export const zArenaScenery = z
  .object({
    palette: zSceneryPalette.optional(),
    lighting: zSceneryLighting.optional(),
    /** ⚠️ 上限 8 條規則 —— 再多就不是「這張圖的特色」而是一整座城市了。 */
    props: z.array(zSceneryPropScatter).max(8).default([]),
  })
  .strict();

export type ArenaScenery = z.infer<typeof zArenaScenery>;
export type SceneryPalette = z.infer<typeof zSceneryPalette>;
export type SceneryLighting = z.infer<typeof zSceneryLighting>;
export type SceneryPropScatter = z.infer<typeof zSceneryPropScatter>;

/**
 * 出貨前寫死在渲染層的那一組值。⚠️ 每一格都要和
 * `render/Lighting.ts` / `render/ArenaGround.ts` 的常數對得起來 ——
 * 對不起來的時候，「沒宣告 scenery 的場地」會在這一版**偷偷變樣**。
 */
export const DEFAULT_SCENERY_PALETTE: SceneryPalette = zSceneryPalette.parse({});
export const DEFAULT_SCENERY_LIGHTING: SceneryLighting = zSceneryLighting.parse({});

// ---------------------------------------------------------------------------
// 純函式 —— 兩個，都沒有 Babylon、都可以逐點斷言
// ---------------------------------------------------------------------------

/** `#rrggbb` → 0..1 的 rgb。⛔ 不做錯誤處理：schema 已經擋掉非法字串。 */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** 決定性雜湊 → [0,1)。⚠️ 與 `ArenaGround.kerbCrestOffset` 同一個手法（正弦取小數）。 */
function hash01(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const DEG = Math.PI / 180;

/**
 * 波形 → [-1, 1]。⭐ 五種形狀**只差這一個 switch**，⛔ 不是五段各自的動畫程式。
 */
export function sceneryWave(kind: SceneryLightWave, tSec: number, periodSec: number): number {
  const p = tSec / periodSec; // 已經跑了幾圈（含小數）
  switch (kind) {
    case "none":
      return 0;
    case "breathe":
      return Math.sin(2 * Math.PI * p);
    case "flicker":
      // 三條快慢不同、互質頻率的正弦 —— 疊起來永遠不會整齊重複，看起來就是「抖」。
      return (
        0.58 * Math.sin(2 * Math.PI * p) +
        0.29 * Math.sin(2 * Math.PI * 2.7 * p + 1.3) +
        0.13 * Math.sin(2 * Math.PI * 6.1 * p + 2.6)
      );
    case "sweep":
      // 與 breathe 同形但相位差 90°，讓「角度在掃」與「亮度在變」不同步 ——
      // 同步的話看起來像整個場景在閃，而不是光源在移動。
      return Math.cos(2 * Math.PI * p);
    case "storm": {
      // 長時間貼在 -1（陰暗），週期性爆一下。指數 24 讓亮的那一段只佔約 12% 的週期。
      const f = p - Math.floor(p);
      const spike = Math.pow(Math.max(0, Math.sin(Math.PI * f)), 24);
      return -1 + 2 * spike;
    }
  }
}

/** `sceneryLightAt` 吐出來的一幀光。⚠️ 這是**最終值**，呼叫端直接寫進燈就好。 */
export interface SceneryLightSample {
  keyIntensity: number;
  fillIntensity: number;
  /** 主光顏色，0..1 rgb（已經在 keyColor↔peakColor 之間內插完） */
  key: { r: number; g: number; b: number };
  /** 主光方向（指向被照物的單位向量，y 永遠是負的） */
  dir: { x: number; y: number; z: number };
}

/**
 * 這一刻的光。**純函式** —— 同樣的 `(lighting, tSec)` 永遠得到同一幀，
 * 所以守衛可以直接比對兩個時間點，⛔ 不必開一個 Babylon 場景跑幀。
 */
export function sceneryLightAt(lighting: SceneryLighting, tSec: number): SceneryLightSample {
  const w = sceneryWave(lighting.wave, tSec, lighting.periodSec);
  const base = hexToRgb01(lighting.keyColor);
  const peak = lighting.peakColor === undefined ? base : hexToRgb01(lighting.peakColor);
  // 把 [-1,1] 拉到 [0,1] 當作「有多靠近波峰」，再乘上擺幅當作混色比例。
  const mix = ((w + 1) / 2) * lighting.intensityAmp;
  const yaw = (lighting.keyYawDeg + lighting.yawSweepDeg * w) * DEG;
  const pitch = lighting.keyPitchDeg * DEG;
  const cp = Math.cos(pitch);
  return {
    // (1 + amp·w) ≥ 0 恆成立（amp ≤ 1、w ≥ -1）⇒ 強度不可能變成負的。
    keyIntensity: lighting.keyIntensity * (1 + lighting.intensityAmp * w),
    // ⚠️ 補光只跟著動一半：兩盞燈同幅度一起變 = 整個畫面在調亮度，
    //    那看起來像螢幕壞了，不像場景裡有東西在發生。
    fillIntensity: lighting.fillIntensity * (1 + lighting.intensityAmp * w * 0.5),
    key: {
      r: base.r + (peak.r - base.r) * mix,
      g: base.g + (peak.g - base.g) * mix,
      b: base.b + (peak.b - base.b) * mix,
    },
    dir: { x: cp * Math.sin(yaw), y: -Math.sin(pitch), z: cp * Math.cos(yaw) },
  };
}

/** `expandSceneryProps` 要的最小分區形狀（⛔ 不拖進整個 `ZoneDef`）。 */
export interface SceneryZone {
  center: { x: number; z: number };
  boundaryRadius: number;
  bounds?: { kind: "disc" } | { kind: "rect"; halfW: number; halfD: number };
}

/**
 * 把散佈規則展開成**逐件的 `DecorDef`**。決定性：同樣的輸入永遠同樣的輸出。
 *
 * 擺法是「等分 + 抖動」而不是純亂數：`count` 件平均分在 `arcSpan` 上，每一件
 * 再在自己那一格裡抖一下。⭐ 純亂數在 12 件這種數量下會肉眼可見地結塊，
 * 而「一圈柱子」結塊看起來就是壞掉。
 *
 * ⚠️ 矩形場地（GH#324 的新圖）用**橢圓映射**貼著矩形擺，⛔ 不是用外接圓 ——
 * 外接圓在矩形上會把四個角的道具丟到牆外面去。
 */
export function expandSceneryProps(
  scenery: ArenaScenery | undefined,
  zones: readonly SceneryZone[],
  /** 每個分區的硬上限（後台政策）。⚠️ 砍的是**規則順序的後面**，所以作者把最重要的規則寫在前面。 */
  maxPerZone: number,
): DecorDef[] {
  if (!scenery || scenery.props.length === 0 || maxPerZone <= 0) return [];
  const out: DecorDef[] = [];
  zones.forEach((zone, zi) => {
    let placed = 0;
    const rect = zone.bounds?.kind === "rect" ? zone.bounds : null;
    scenery.props.forEach((rule, ri) => {
      for (let i = 0; i < rule.count; i++) {
        if (placed >= maxPerZone) return;
        const slot = (i + 0.5) / rule.count;
        const jitter = (hash01(rule.seed + ri * 7.13, i + zi * 131) - 0.5) / rule.count;
        const theta = (rule.arcFromDeg + (slot + jitter) * rule.arcSpanDeg) * DEG;
        const t =
          rule.bandFrom +
          (rule.bandTo - rule.bandFrom) * hash01(rule.seed + ri * 3.77 + 19, i + zi * 57 + 3);
        const s =
          rule.scaleMin +
          (rule.scaleMax - rule.scaleMin) * hash01(rule.seed + ri * 5.19 + 41, i + zi * 91 + 7);
        const dx = Math.sin(theta);
        const dz = Math.cos(theta);
        const x = zone.center.x + (rect ? rect.halfW : zone.boundaryRadius) * t * dx;
        const z = zone.center.z + (rect ? rect.halfD : zone.boundaryRadius) * t * dz;
        // 四分之一圈四檔：0 = +Z，順時針。faceIn 是「背對外面」＝ faceOut + 2。
        const outQuarter = Math.round(theta / (Math.PI / 2)) & 3;
        const rotQuarter =
          rule.facing === "fixed"
            ? rule.rotQuarter
            : rule.facing === "random"
              ? Math.floor(hash01(rule.seed + ri * 11.31 + 83, i + zi * 17 + 5) * 4) & 3
              : (outQuarter + 2) & 3;
        out.push({ model: rule.model, x, z, rotQuarter, scale: s });
        placed++;
      }
    });
  });
  return out;
}
