/**
 * modelFxRig —— `spawnModelFx` 的 BABYLON 那一半:**一隻 .glb 沿路徑移動**。
 *
 * ⚠️ 這是 GGD 第一個「模型即特效」的通道。既有的三條通道全部是粒子/幾何:
 *   · `vfx/particleFactory` + `render/vfx/W3xEmitterRig` —— PRE2 粒子
 *   · `vfx/RibbonTrail` —— 刀光
 *   · `vfx/Telegraph` / `castBeam` —— 程序生成的幾何
 * 沒有任何一個能演「一顆會滾的球體從 A 飛到 B」,因為那在原作裡是一隻**單位**。
 *
 * ── 這個檔案為什麼**不**自己造一套池子的規矩 ──────────────────────────────
 * #131(卡在角落的白色爆光)的根因是一個**沒有主人**的連續發射器:掛著它的骨頭被
 * 模型置換 dispose 掉,Babylon 把它重新掛回 WORLD 的 (0,0,0),於是它在場中央一直
 * 燒到整場結束。`W3xEmitterRig` 為此立了三條規矩,這裡逐條照抄(⛔ 不是重寫):
 *   ① **每一個活著的實例都有硬壽命上限**(`maxEffectSec`),忘了收也會自己死;
 *   ② **free-list 而不是 dispose/new**,所以重複施放不配置記憶體;
 *   ③ **`dispose()` 走一份登錄表**,⛔ 不是只收「我記得的那幾個」。
 *
 * ⭐ 而且 free-list 有**上界**(`maxPooledPerModel`)。一個沒有上界的池子在
 * 「一場 20 分鐘、十幾支技能各生 20 顆」之後就是一份永遠不還的記憶體 ——
 * 它不會像 #131 那樣被看見,所以更難查。
 *
 * ── ⛔ 這裡不算傷害,也不排落點特效 ────────────────────────────────────────
 * 約定介面上的 `onArrive` / `onTouch` 帶的是 `EffectDef[]`,那是**引擎**(L1)在
 * 權威側解算的。客戶端自己解算命中 = 失敗形態⑤,⛔ 永遠不做。
 *
 * ⭐ **落點爆炸也不在這裡**（2026-08-23 移除,GH#606）。舊版有一個 `onArriveFx`
 * 視覺回呼,而唯一的呼叫端讀的是 `ev.data.arriveVfxKey` —— **零個寫入端的幽靈
 * 欄位**,所以那條回呼從第一天起就沒有響過一次。⛔ 修法不是補上那個欄位:
 * 落點特效寫在技能 JSON 的 `onArrive: [{ kind: "spawnVfx", … }]` 就好,它走
 * sim 的延遲班表 ⇒ **特效與傷害在同一 tick 同一點**。客戶端再排一次是第二個
 * 住處,而且會跟傷害差幾幀（第〇·四／第〇·五守則）。
 */
import type { ModelDoc } from "@ggd/shared/content";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  modelFxAxisCorrection,
  modelFxPoseFromWire,
  modelFxWireLifeSec,
  type ModelFxLongAxis,
  type ModelFxSpawnEvent,
  type ModelFxSpawnInstance,
} from "./modelFxPath";
import { noteVfxRefired } from "../vfx/vfxHardCap";

/** 一個 `model@1` 文件裡這個 rig 需要的三格。 */
export interface ModelFxModelDoc {
  glbPath: string;
  scale?: number;
  /**
   * ⭐ 這一份 .glb 的長軸烘在哪一軸（`model@1.fxLongAxis`）。缺席 ⇒ ⛔ 不修正。
   * ⚠️ 它是**模型**的性質不是技能的：同一份 `netherstrike.glb` 被兩支技能引用，
   * 兩邊必須拿到同一個答案（第〇·四守則）。
   */
  fxLongAxis?: ModelFxLongAxis;
  /** ⭐ 移動特效離地多高（`model@1.fxSpawnHeight`）。缺席 ⇒ 0 ＝ 今天的行為。 */
  fxSpawnHeight?: number;
  /**
   * ⭐ 這一份外觀的頂點著色（`model@1.fxTint`，線性 RGB 各 0…1）。缺席 ⇒ ⛔ 不著色。
   * ⚠️ 原作把它掛在 locust dummy 的**單位型別**上（w3u `Art - Vertex Colour`
   * ＋ `SetUnitVertexColor`），而 GGD 這一側在 2026-08-23 之前**整格不存在** ——
   * 於是 38-002 究極暴走黑龍波的兩具 dummy（原作 `[0,0,0]` 純黑）以素材原色出場。
   */
  fxTint?: readonly [number, number, number];
  /**
   * ⭐ 這一份外觀的透明度（`model@1.fxAlpha`，0…1）。缺席 ⇒ 1 ＝ 今天的行為。
   * 原作只存在 runtime（57 個 `SetUnitVertexColorBJ` 呼叫點，w3u 無此欄）——
   * 這一格是**模型級恆定半透明**那一半（GH#688 Phase 4 機制②）。
   */
  fxAlpha?: number;
  /**
   * ⭐ 這一份 .glb 的**邏輯狀態 → 軌名**對照（`model@1.clipMap`）。
   *
   * ⚠️ 它**本來就存在**（英雄動畫走的就是它），所以 `spawnModelFx.clip` ⛔ 不開
   * 第二份對照表（第〇·四守則）：`clip:"death"` 在 `flamestrike1` 解成 `death`、
   * 在 `darkraor` 解成 `Death` —— 大小寫與命名慣例是**這份 .glb 的**性質，
   * ⛔ 不是引用它的技能該知道的事。
   */
  clipMap?: ModelDoc["clipMap"];
}

/**
 * ⭐ 這個 rig 對一條 `AnimationGroup` 需要的**四格**（GH#689）。
 *
 * ⚠️ 刻意是結構型別而 ⛔ 不 import `AnimationGroup`：這個檔對 Babylon 的具體依賴
 * 只有 `TransformNode`（其餘全是 `import type`），而守衛餵進來的是**真的**
 * Babylon 物件 —— 結構型別讓「真物件」與「量測探針」共用同一條路，
 * ⛔ 不是讓測試可以塞一份假的（那是失敗形態⑤）。
 */
export interface ModelFxAnimGroup {
  name: string;
  speedRatio: number;
  play(loop?: boolean): unknown;
  stop(): unknown;
  dispose(): unknown;
}

/**
 * ⭐【剪輯解名】`spawnModelFx.clip` → 這一具實例上**要播的那幾條軌**（GH#689）。
 *
 * 兩段，順序有意義：
 *  ① **先查 `clipMap`** —— 那是「這份 .glb 把 idle/death 叫做什麼」的唯一住處。
 *  ② 查不到才把 `clip` 當**軌名逐字**（WC3 的 `birth` 這種不在六格裡的一次性序列）。
 *
 * ⚠️ ⭐ **比對必須容忍前綴**（量到的，⛔ 不是推測）：`instantiateModelsToScene`
 * 把每一條軌 clone 成 `nameFunction(原名)`，所以場上那條叫
 * `modelfx-7-death`，⛔ 不叫 `death` —— 逐字比對一條都不會中，而那會是
 * 「填了 clip、畫面上沒動、沒有任何錯誤」的失敗形態②（`ChampionView` 的掛件
 * 動畫踩過同一個坑，GH#392）。⇒ 完全相同 → 不分大小寫的字尾，兩段。
 *
 * ⛔ 名字對不上就**一條都不播** —— 不猜一條給它（與 `attachment@1.anim` 同規矩）。
 */
export function fxClipTargets<T extends { name: string }>(
  groups: readonly T[],
  clip: string,
  clipMap?: ModelDoc["clipMap"],
): T[] {
  const mapped = (clipMap as Record<string, string | undefined> | undefined)?.[clip];
  const want = mapped ?? clip;
  const exact = groups.filter((g) => g.name === want);
  if (exact.length > 0) return exact;
  const lower = want.toLowerCase();
  return groups.filter((g) => g.name.toLowerCase().endsWith(lower));
}

/**
 * ⭐ 近黑 tint 的**退路門檻**（GH#697）—— `max(r,g,b)` 低於它就 ⛔ 不碰自發光。
 *
 * ⚠️ 它是**量出來的**，⛔ 不是挑一個好看的數：`UNIT_TINTS.json` 588 隻單位解出
 * 72 種相異頂點色，由低到高排是 **0.0（20 隻）· 0.0392（`nntg` 的 10/255）·
 * 0.1176 · 0.1961 · …** —— 0.0392 與 0.1176 之間那道**三倍寬的空隙**就是
 * 「作者要它幾乎不見」與「作者要它暗一點」的分界。0.05 落在空隙裡。
 *
 * ⭐ 一鍵 rollback：把它調成 `1.1` ⇒ 每一格 tint 都走不到自發光 ＝ 2026-08-25
 * 之前的行為，逐位元不變。（⚠️ 它還 ⛔ 不是後台欄位 —— `content/config/**` 與
 * admin 都不在本 lane 的柵欄裡，見 `docs/_reports/C7_temp_20260825.md`。）
 */
/**
 * @deprecated 2026-08-25 起這是**後台一格**（`config.vfx-cleanup@1.fxTintEmissiveFloor`）——
 * 這個常數只留作 config 讀不到時的退路（三個住處:content json + Zod DEFAULT + admin）。
 */
export const FX_TINT_EMISSIVE_FLOOR = 0.05;

/**
 * 生效中的染色下限。⭐ 由 `ContentDb.load()` 設定（與 `setOneShotMaxLifeSec` /
 * `setFamilyTuning` **同一條路**）——⛔ 不在這裡 import 設定模組:那條 import 會
 * 造成迴圈（實測:四條守衛同時說「tint 沒有到達畫面」而不是報錯,失敗形態最難查的那種）。
 */
let emissiveFloor = FX_TINT_EMISSIVE_FLOOR;

/** 後台那一格（`config.vfx-cleanup@1.fxTintEmissiveFloor`）⇒ 這裡。`undefined` = 回出貨預設。 */
export function setFxTintEmissiveFloor(v: number | undefined): void {
  emissiveFloor = typeof v === "number" && Number.isFinite(v) ? v : FX_TINT_EMISSIVE_FLOOR;
}

/** 🔆 出貨預設：stock glow 材質走**加法**混合（GH#767）。 */
const STOCK_GLOW_ADDITIVE_DEFAULT = true;
let stockGlowAdditive = STOCK_GLOW_ADDITIVE_DEFAULT;

/** 後台那一格（`config.vfx-cleanup@1.stockGlowAdditive`）⇒ 這裡。`undefined` = 回出貨預設。 */
export function setStockGlowAdditive(v: boolean | undefined): void {
  stockGlowAdditive = typeof v === "boolean" ? v : STOCK_GLOW_ADDITIVE_DEFAULT;
}

/**
 * Babylon `Constants.ALPHA_ONEONE` —— **`SRC + DEST`**，⛔ 不乘 src alpha。
 * ⛔ 這裡不 import Babylon 常數（見上面那條迴圈註解），⭐ 但守衛
 * `stockGlowAdditive.test.ts` 用**真的** `Constants.ALPHA_ONEONE` 比對這一格 ——
 * 字面值再錯一次會當場紅，⛔ 不會再有「兩個住處抄同一個錯值」的形狀。
 *
 * ⚠️⚠️ **⛔ 不可以用 `ALPHA_ADD`（＝1）** —— 這一格 2026-08-26 первый版就踩過：
 * Babylon 的 `ALPHA_ADD` 是 **`SRC_ALPHA × SRC + DEST`**（仍然乘 alpha），
 * 而 `w3xlib/gltf.py` 的 luma-key 正是**把亮度搬進了 alpha**（`alpha := max(R,G,B)`）
 * ⇒ 乘回去等於把剛剛加上來的亮度**再乘掉一次**。
 *
 * ⚠️⚠️ **⛔ 也不可以是 `0`** —— GH#780（拳四郎黑色閃電）的根因逐字：
 * v0.28.5 這一格寫了 `0` 並注記「ALPHA_ONEONE」，⭐ 而 Babylon 7.54.3 的
 * `Engines/constants.js` 逐行是 **`ALPHA_DISABLE = 0` · `ALPHA_ONEONE = 6`**。
 * `Extensions/engine.alpha.js` 的 `case 0` 是 `alphaBlend = false`＋`depthMask = true`
 * ⇒ 材質被丟進透明桶卻**不透明畫出還寫深度** ⇒ luma-key 搬進 alpha 的去背
 * **整格被忽略**，閃電貼圖的黑底直接上畫面 ＝ owner 看到的「黑色閃電沒有去背」。
 * ⭐ 當時量到的「亮度 237.2」是**不透明**給的（亮 texel 不再乘 alpha），
 * ⛔ 不是加法 —— 量尺的數字對了，機制的結論錯了；黑底那一半量尺沒有看。
 * `case 6` 才是 `blendFunc(ONE, ONE)`：黑 texel 加 0＝透明，亮度照樣全額。
 *
 * ⭐ 早前量到的（20-03，同一組 tick 的同一幀）：
 *   BLEND 亮度中位 **75.4** → `ALPHA_ADD` **86.9**（只 +15%）→ 不乘 alpha **237.2**
 *   （owner 原作擷圖 **246–254**）。全白飽和像素 1,493 → 7,706 → **57,787**。
 * ⇒ WC3 的 additive filter mode **完全忽略 alpha**，所以只有 `ONEONE` 是翻譯，
 *   `ALPHA_ADD` 是**近似**（第一守則那條紅線）。
 */
const BJS_ALPHA_ONEONE = 6;
/**
 * Babylon `Constants.ALPHA_ADD` —— **`SRC_ALPHA × SRC + DEST`**。
 *
 * ⭐ 這正是 WC3 對 fm3/fm4 的**逐字** blendFunc（`(SRC_ALPHA, ONE)`，mdx-m3-viewer
 * 的 layer 表）—— 加法，但 **src 先乘 alpha**。它與 {@link BJS_ALPHA_ONEONE} 的分工
 * 見 {@link applyStockGlowAdditive} 檔頭：**宣告了透明度**（材質 alpha < 1，
 * 來源是 `model@1.fxAlpha` 或節點級 `alpha`）的發光材質走這一格 ——
 * ⛔ 一個宣告了 alpha 的材質配一個**忽略 alpha** 的混合模式，就是
 * 「寫了但不會發生」（第一·五守則）：#669 批核頁登記的 rollback 開關
 * （`tpl-locust-orb.alpha` → 0 ＝ 整族隱形）在 ONEONE 下**逐位元是死的**。
 */
const BJS_ALPHA_ADD = 1;
/** Babylon `Material.MATERIAL_ALPHABLEND` —— 沒有它 `needAlphaBlending()` 是 false ⇒ 混合模式**不會被讀**。 */
const BJS_ALPHABLEND = 2;

/**
 * 🔆 **把原作的 additive 混合補回來**（GH#767）。
 *
 * ── 為什麼這是一個**缺的機制**，⛔ 不是一格口味參數 ──────────────────────
 * 原作那一族（`filter_mode >= 3` 且無不透明底層）在 WC3 裡是 **additive**：
 * 光是**加**到背景上的。`w3xlib/gltf.py` 的 `gltf_texture_luma()` 檔頭**自己承認**
 * 它只是「approximates WC3 additive blending in **plain glTF BLEND**」——
 * 而 alpha 混合的結果**永遠 ≤ 兩者的最大值**，於是兩件原作會發生的事
 * **結構上不可能發生**：①暗地板上的光束非常亮 ②**兩層疊起來更亮**。
 *
 * ⭐ 量到的（20-03，2026-08-26）：亮度中位 BLEND **75.4** → **237.2**（原作擷圖 246–254）；
 * ⚠️ 中間還踩過一次 `ALPHA_ADD`（86.9，只 +15%）—— 見 {@link BJS_ALPHA_ONEONE} 的檔頭。
 *
 * ⛔ **判準從材質自己推導**（與 {@link applyFxTint} 同一條）：`emissiveColor` 非全黑
 * ⇒ 這是轉檔的 glow 分支。不透明 body 的自發光是全黑 ⇒ **一格都不會被碰到**。
 *
 * ⚠️ 這裡讀的是**最終**掛在 mesh 上的那份材質（`applyFxTint` 之後才呼叫）——
 * 對**原始**素材物件寫的斷言不管有沒有生效都會過（`views/mobTint.test.ts` 檔頭）。
 *
 * ── ⭐【GH#767 的洞，2026-08-28 量到】ONEONE 對**宣告了透明度**的材質是錯的 ────
 * owner（第三次）：「Rider, 木乃香 施展技能底下魔法陣依然沒有去背」。
 * A/B 實測（beam-audition `?ability=godie-hvsh.r` / `godie-etyr.q`）：
 * 出貨預設（一律 ONEONE）⇒ 地面魔法陣（midchilder／oblivion／tome，2–3 個
 * primitive 疊在同一平面、emissiveStrength 2.0、albedo 同貼圖再疊一次）
 * **每一片都以全額 RGB 相加 ⇒ 疊爆成一大團實心白**；`?additive=0` 與
 * `ALPHA_ADD` 都是正確的粉紫魔法陣。⛔ 而光束家族（20-03/59-04）的
 * 246–254 亮度驗收**只在 ONEONE 下成立**（ALPHA_ADD 量到 86.9）。
 * ⇒ ⭐ 分工不是家族名單，是**材質自己的宣告**：alpha < 1（`model@1.fxAlpha`
 * 或節點級 `alpha`，applyFxTint 已乘進最終材質）＝「這一份的透明度有語意」
 * ⇒ 混合模式必須**讀 alpha**（{@link BJS_ALPHA_ADD}＝WC3 fm3 的逐字 blendFunc）；
 * 沒宣告 ⇒ 維持 ONEONE（光束驗收不動）。
 *
 * @returns 真的被改成加法的材質數（0 = 這一具沒有 glow 材質，或開關關著）。
 */
export function applyStockGlowAdditive(root: TransformNode): number {
  if (!stockGlowAdditive) return 0;
  let painted = 0;
  for (const mesh of root.getChildMeshes(false)) {
    const mat = (mesh as { material?: unknown }).material as
      | (Record<string, unknown> & { name?: string })
      | null
      | undefined;
    if (!mat) continue;
    const e = mat["emissiveColor"] as { r: number; g: number; b: number } | undefined;
    if (!e || (e.r <= 0 && e.g <= 0 && e.b <= 0)) continue;
    const a = mat["alpha"];
    mat["alphaMode"] =
      typeof a === "number" && a < 1 ? BJS_ALPHA_ADD : BJS_ALPHA_ONEONE;
    // ⚠️ 只設 alphaMode 是**寫了但不會發生**：PBR 的不透明素材被載入器鎖成
    //    `transparencyMode: OPAQUE`，而 `needAlphaBlending()` 回 false 時
    //    混合模式那一格**根本不會被讀**（同 `applyFxTint` 的 fxAlpha 那一段）。
    if ("transparencyMode" in mat) mat["transparencyMode"] = BJS_ALPHABLEND;
    painted++;
  }
  return painted;
}

/**
 * 把 `fxTint` 乘進這一棵子樹上每一份素材**看得見的那一格顏色**。
 *
 * ⚠️ ⭐ **一定要先 clone 素材。** `instantiateModelsToScene({doNotInstantiate:true})`
 * 複製的是節點，⛔ 不是素材 —— 同一個 `AssetContainer` 出來的每一具共用同一個
 * `Material` 物件。⛔ 就地改它 = 這個 modelKey 的**每一具**（含未來別的技能引用它時）
 * 一起變色，而且 `dispose()` 之後那份污染還留在容器裡。
 *
 * ── ⭐【GH#697】「看得見的那一格」**不是同一格** —— 依材質分流 ─────────────
 * 2026-08-25 V6 lane 現場量到：出貨節點寫 `tint:[1,0,0]`，**畫面上的閃電是藍的**。
 * 根因是 stock 特效模型走 `w3xlib/gltf.py` 的 **additive glow** 分支
 * （`fm>=3 且無不透明底層`）：它把貼圖掛成 `emissiveTexture`、`emissiveFactor`
 * 設 `[1,1,1]`、`KHR_materials_emissive_strength=2.0`。而 PBR 的最終色是
 * `finalEmissive = vEmissiveColor × emissiveTex × …`（量的是出貨那支
 * `pbrBlockFinalUnlitComponents`）⇒ ⭐ **顏色住 `emissiveColor`**，
 * 而 `albedoColor` 在那一族**沒有 baseColorFactor**（載入器給 1,1,1）、
 * 只在有光照時貢獻一點點 ⇒ 乘它逐位元等於沒發生（第一·五守則）。
 *
 * ⭐ 判準**從材質自己推導**，⛔ 不是一張模型名單：`emissiveColor` 亮著（非全黑）
 * ⇒ 這份材質的顏色住自發光 ⇒ 乘它。全 repo 404 份 glb 量到的分佈：
 * **152 個 emissive-textured/BLEND（全部是 glow 分支）· 4 個 emissive-factor-only
 * （兩者都逐字叫 `Glow`）· 其餘 684 個 emissiveColor 全黑** ——
 * ⇒ 不透明 body **一格都不會被碰到**（乘 0 是恆等，而這裡連乘都不乘）。
 *
 * ⚠️ ⭐ **黑色剪影那條退路保留著**（{@link FX_TINT_EMISSIVE_FLOOR}）。原作的
 * `SetUnitVertexColor` 在純黑（`[0,0,0]`）時對**不透明**幾何畫出來的是黑色剪影，
 * ⛔ 不是「消失」；而把 0 乘進加法層會讓一具**全 glow** 的模型整個不見
 * ——那是失敗形態①，而且它與「顏色正確」在測試上長得一模一樣。
 * ⛔ 這不是假設：出貨的 `imported.blackhole`（5/5 材質全 glow）與
 * `imported.darkraor`（3 份材質裡 1 份 glow）**兩份文件的 `fxTint` 都是 `[0,0,0]`**。
 * ⇒ 近黑 tint 走舊路（只乘 albedo）：body 仍是黑剪影、glow 仍在，逐位元不變。
 *
 * ⚠️ 斷言要讀**最終**物件：這裡把 clone 指回 `mesh.material`，所以任何對**原始**
 * 素材物件寫的斷言，不管有沒有生效都會過（見 `views/mobTint.test.ts` 的檔頭）。
 */
export function applyFxTint(
  root: TransformNode,
  tint: readonly [number, number, number],
  alpha?: number,
): number {
  // ⭐ 這一發的 tint 有沒有「讓任何一個通道透過來」。⛔ 用 max ⛔ 不用亮度：
  //    `[0.1176,0,0]` 的亮度只有 0.025，用亮度會把一格**飽和的暗紅**誤判成近黑。
  const letsLightThrough =
    Math.max(tint[0], tint[1], tint[2]) > emissiveFloor;
  let painted = 0;
  for (const mesh of root.getChildMeshes(false)) {
    const mat = (mesh as { material?: unknown }).material as
      | { clone?: (n: string) => unknown; name?: string }
      | null
      | undefined;
    if (!mat || typeof mat.clone !== "function") continue;
    const copy = mat.clone(`${mat.name ?? "mat"}-fxtint`) as
      | (Record<string, unknown> & { name?: string })
      | null;
    if (!copy) continue;
    // ⭐ 兩種素材各自的漫反射欄位名（StandardMaterial / PBRMaterial）。
    for (const key of ["diffuseColor", "albedoColor"] as const) {
      const c = copy[key] as { r: number; g: number; b: number } | undefined;
      if (!c) continue;
      c.r *= tint[0];
      c.g *= tint[1];
      c.b *= tint[2];
    }
    // ⭐【GH#697 分流】自發光亮著 = 這份材質的顏色住在這裡（luma-key 過的 stock
    //    特效、`Glow` 材質）⇒ 乘它。全黑 ⇒ ⛔ 一格都不碰（不透明 body 走這條）。
    //    ⚠️ 近黑 tint 也 ⛔ 不碰 —— 見 `FX_TINT_EMISSIVE_FLOOR` 的黑剪影退路。
    if (letsLightThrough) {
      const e = copy["emissiveColor"] as { r: number; g: number; b: number } | undefined;
      if (e && (e.r > 0 || e.g > 0 || e.b > 0)) {
        e.r *= tint[0];
        e.g *= tint[1];
        e.b *= tint[2];
      }
    }
    // ⭐【模型級透明度】`model@1.fxAlpha`（GH#688 Phase 4 機制②）——
    //    **材質 alpha 乘法**，⛔ 不是 visibility 開關：0.5 的幻影要看得到後面的
    //    地板。乘法（⛔ 不是覆寫）保住素材自己已有的半透明層次。
    // ⚠️ glTF 載入器把不透明素材鎖成 `transparencyMode: OPAQUE`（PBR）——
    //    只改 `alpha` 那一格是**寫了但不會發生**（第一·五守則的形狀），
    //    所以 <1 時一併解鎖成 ALPHABLEND（=2，PBRMaterial.PBRMATERIAL_ALPHABLEND）。
    if (alpha !== undefined && alpha < 1) {
      const a = copy["alpha"];
      copy["alpha"] = (typeof a === "number" ? a : 1) * alpha;
      if ("transparencyMode" in copy) copy["transparencyMode"] = 2;
    }
    (mesh as { material?: unknown }).material = copy;
    painted++;
  }
  return painted;
}

/**
 * ⛔⛔ **出貨路徑上「`model@1` → 這個 rig」的唯一接縫**（GH#607）。
 *
 * ── 它為什麼是一個具名函式而不是一段 inline lambda ──────────────────────────
 * 2026-08-23 量到：`GameApp.ts` 的 `modelDocFor` 接縫**手挑欄位**
 * （`{ glbPath: doc.glbPath, scale: doc.scale }`）⇒ `fxLongAxis` /
 * `fxSpawnHeight` 在那一行被丟掉。於是 owner 逐字要的「**90 度橫放的 beam**」
 * 軸修正**從第一天起就沒有生效過**，而且每一具移動模型都貼在 y=0 拖行。
 *
 * ⚠️ **每一個零件都是對的**（第一·五守則的形狀）：`model@1` 兩格都存了
 * （`imported.netherstrike` 宣告 `fxLongAxis:"y"`、`imported.fireblast` 宣告
 * `"x"`）、`spawn()` 兩格都讀了、`modelFxAxis.test.ts` 兩格都驗了 ——
 * 缺的只有**中間那一段**，而它是一個沒有人測過的投影（失敗形態⑧）。
 *
 * ⭐ 所以修法⛔ 不是「把那兩格補進那個字面值」——下一格照樣會漏。
 * 修法是**不要投影**：整份文件走過去，「rig 讀得到哪幾格」由
 * {@link ModelFxModelDoc} 這個**子集型別**說了算，⛔ 不由呼叫端各自抄一份。
 * ⇒ 之後在 `model@1` 上加第三格 fx 欄位時，**零行接線**。
 */
export function modelFxDocFor(doc: ModelDoc | null | undefined): ModelFxModelDoc | null {
  return doc ?? null;
}

export interface ModelFxRigOptions {
  /** modelKey → model@1 文件（GameApp 從 contentDb 餵）。null = 這個 key 沒有模型 */
  resolveModel(modelKey: string): ModelFxModelDoc | null;
  /** glb 載入（出貨是 `AssetManager.load`；測試注入 stub，headless 不解碼） */
  loadContainer(glbPath: string): Promise<AssetContainer | null>;
  /** 同時最多幾個實例（含所有技能）。超過就不生 —— ⛔ 不排隊，排隊會遲到 */
  maxLive?: number;
  /** 每個 modelKey 的 free-list 上界 */
  maxPooledPerModel?: number;
  /** ⭐ 所有 free-list 加起來的上界（⛔ 沒有它，per-key 上限乘上無界的 key 數 = 無界） */
  maxPooledTotal?: number;
  /** 任何實例的硬壽命上限（秒）。忘了收也會死 */
  maxEffectSec?: number;
  /**
   * ⭐ GH#838 M11 —— 沿路拖尾：在模型**當下的位置**放一發 vfx。
   * 注入而不是在這裡拿 `VfxSystem`：rig 知道「模型現在在哪」，⛔ 不知道
   * 「一份 vfx 文件怎麼變成粒子」（同 `resolveModel` / `loadContainer` 的理由）。
   * 缺席 ⇒ 拖尾是 no-op（headless 測試的樣子，⛔ 不是整支功能不生效）。
   */
  spawnTrail?(vfxId: string, x: number, y: number, z: number): void;
}

/** 出貨預設 —— ⚠️ 這幾格是**預算**不是平衡值，所以住這裡是對的（第〇·四守則的豁免）。 */
const DEFAULT_MAX_LIVE = 48;
const DEFAULT_MAX_POOLED_PER_MODEL = 12;
/**
 * ⭐ free-list 的**全域**上界（GH#429）。
 *
 * ⚠️ `maxPooledPerModel` 看起來像一個上界，⛔ 但它不是 —— 那正是 GH#270 逐字
 * 記下來的教訓（`VfxSystem.resetForRound` 的註解）：
 * 「**per-key 上限只有在 key 的數量有上界時才構成上界**」。
 * 而 modelKey 的數量在一場比賽裡是**一直增加**的：英雄升級解鎖 R/EX、第 3 回合起
 * 殭屍加入、每回合換地圖（#145）。實測（`modelFxRig.test.ts` 的前身探針，
 * 每回合 3 個新 modelKey、8 個回合）：場景裡的 `modelfx-*` TransformNode 是
 * **72 → 144 → 216 → … → 576**，逐回合 +72，而且回合邊界一個都沒還回去。
 */
const DEFAULT_MAX_POOLED_TOTAL = 48;
const DEFAULT_MAX_EFFECT_SEC = 8;

/**
 * 一個實例的**兩層**節點。
 *
 * ⭐ 兩層是必要的，⛔ 不是潔癖：`root` 演「它在哪、往哪走、滾多快」，
 * `axis` 演「這份網格當初朝哪一軸建」。掛成父子之後合成順序是
 * `Ry(yaw) ∘ Rz(roll) ∘ A` —— 翻滾繞的是**已經橫放好的長軸**。
 * ⛔ 併成一層（把修正加進 `rotation`）做不到這件事：Babylon 的 euler 是
 * yaw∘pitch∘roll 固定順序，修正只能擠在 roll **外面**，於是每滾一圈光束就
 * 甩離航線一次。
 */
interface ModelFxNodes {
  root: TransformNode;
  axis: TransformNode;
}

/**
 * ⭐【這一發的外觀】節點級 `tint`／`alpha` 蓋過 `model@1` 的 `fxTint`／`fxAlpha`
 * （GH#693）。⛔ **不相乘** —— 原作的 `SetUnitVertexColor` 是覆寫語意，相乘會讓
 * 「把一具紅 dummy 染成藍」得到黑。
 */
interface ModelFxAppearance {
  tint?: readonly [number, number, number];
  alpha?: number;
}

/**
 * free-list 的 key。⚠️ ⭐ **外觀要進 key**，⛔ 不可以只用 `modelKey`：
 * 著色是在 `fillGeometry` 把材質 **clone 之後烘進去**的，所以一個染成紅色的節點
 * 回到池子裡之後，下一發（可能是同一份 glb 的**白色**版本）撈到它就會拿到紅的
 * —— 而畫面上那是「顏色偶爾不對」，⛔ 沒有任何錯誤訊息（失敗形態①）。
 * ⛔ 也不可以「重用時再套一次」：`applyFxTint` 是**乘進現有材質**，重套會複利。
 */
function poolKeyOf(modelKey: string, look: ModelFxAppearance): string {
  if (look.tint === undefined && look.alpha === undefined) return modelKey;
  return `${modelKey}|${look.tint ? look.tint.join(",") : ""}|${look.alpha ?? ""}`;
}

/**
 * ⭐ GH#838 M3 —— 升空曲線取樣（逐段線性，兩端夾住）。
 *
 * ⚠️ 純函式住這裡而不是 class 裡：`modelFxRig.test.ts` 要驗得到它，而且它與
 * Babylon 一點關係都沒有。⛔ keys 假設**已排序**（schema 的 refine 保證）——
 * 這裡不再排一次：每幀排序一個陣列是 N 個實例 × 60fps 的浪費。
 */
export function sampleHeightKeys(
  keys: readonly { t: number; h: number }[],
  ageSec: number,
): number {
  if (keys.length === 0) return 0;
  const first = keys[0]!;
  if (ageSec <= first.t) return first.h;
  const last = keys[keys.length - 1]!;
  if (ageSec >= last.t) return last.h;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (ageSec > b.t) continue;
    const a = keys[i - 1]!;
    const span = b.t - a.t;
    if (span <= 0) return b.h;
    return a.h + ((b.h - a.h) * (ageSec - a.t)) / span;
  }
  return last.h;
}

interface LiveModelFx {
  root: TransformNode;
  axis: TransformNode;
  modelKey: string;
  /** ⭐ 回收要放回**同一個外觀**的 free-list（見 {@link poolKeyOf}）。 */
  poolKey: string;
  /** ⭐ 容器晚到時的回填要用同一份外觀，⛔ 不是模型文件的預設色。 */
  look: ModelFxAppearance;
  /** ⭐ sim 解算完的**這一具**（⛔ 不是整發的 spec —— 客戶端不再自己算路徑，GH#606） */
  inst: ModelFxSpawnInstance;
  y: number;
  /** ⭐ GH#838 M3 —— 升空曲線（秒→高度，逐段線性）。缺席 ⇒ 固定在 {@link y}。 */
  heightKeys?: readonly { t: number; h: number }[];
  /** ⭐ GH#838 M11 —— 沿路拖尾的 vfx 與間隔；`trailNext` 是下一發的年齡（秒）。 */
  trailVfxId?: string;
  trailIntervalSec?: number;
  trailNext?: number;
  spinDegPerSec?: number;
  /**
   * ⭐ 這一發要播的剪輯與速率（GH#689）。⚠️ 它必須存在**這裡**而不是只在
   * `spawn()` 的區域變數裡：容器晚到時的回填（`ensureContainer` 的①c）是在
   * 幾百毫秒之後才拿到 `AnimationGroup` 的，那一刻只剩下 `live` 這一份資料
   * —— 少了它，**每一支技能的第一次施放**都會有模型但不播動畫（而第二次以後
   * 正常，所以它看起來像「偶爾沒動」，⛔ 不像缺陷）。
   */
  clip?: string;
  clipTimeScale?: number;
  ageSec: number;
  lifeSec: number;
}

export class ModelFxRig {
  /** modelKey → 閒置的實例節點對 */
  private readonly pool = new Map<string, ModelFxNodes[]>();
  /** 這個 rig 造過的**每一個**節點（dispose 走這一份，⛔ 不是走 live） */
  private readonly born: TransformNode[] = [];
  /**
   * ⭐ 每一具實例（以它的 `axis` 節點為身分）從容器 clone 出來的 AnimationGroup。
   *
   * ⚠️ ⭐ **AnimationGroup 不是節點** —— `instantiateModelsToScene` 把容器的整份
   * 動畫清單 clone 進 `scene.animationGroups`（量到：2 → 4），而
   * `root.dispose(false, true)` **一條都不會收**。⇒ 少了這一份登錄表，每一次
   * `retire()` 都在場景的每幀動畫清單上多留一條孤兒軌（`ChampionView` 的
   * `formAttachGroups`／`ClipAnimator` 逐字同一個理由，#223 / GH#288）。
   * ⛔ 它也不能塞進 `ModelFxNodes`：那個結構同時被別的 lane 在改，而這一份
   * 只有這四個地方讀得到（fill / start / release / retire）。
   */
  private readonly clipGroups = new Map<TransformNode, ModelFxAnimGroup[]>();
  private readonly live: LiveModelFx[] = [];
  private readonly containers = new Map<string, AssetContainer | null>();
  private readonly loading = new Set<string>();
  private disposed = false;
  /**
   * 🧹 GH#819 —— `hardReset()` 的世代戳。in-flight 的 `loadContainer` 醒來時
   * 世代不同＝那一批引用已經被整批放掉，⛔ 不可以把（可能已被快取端 purge 的）
   * 舊容器塞回新世代的 map。
   */
  private generation = 0;

  private readonly maxLive: number;
  private readonly maxPooledPerModel: number;
  private readonly maxPooledTotal: number;
  private readonly maxEffectSec: number;
  /** ⚠️ 單調遞增的流水號。⛔ 不可以用 `born.length` —— 回收會把它縮回去，於是
   *  兩個同時活著的節點會拿到**同一個名字**，而守衛正是照名字在場景上數的。 */
  private serial = 0;

  constructor(
    private readonly scene: Scene,
    private readonly opts: ModelFxRigOptions,
  ) {
    this.maxLive = opts.maxLive ?? DEFAULT_MAX_LIVE;
    this.maxPooledPerModel = opts.maxPooledPerModel ?? DEFAULT_MAX_POOLED_PER_MODEL;
    this.maxPooledTotal = opts.maxPooledTotal ?? DEFAULT_MAX_POOLED_TOTAL;
    this.maxEffectSec = opts.maxEffectSec ?? DEFAULT_MAX_EFFECT_SEC;
  }

  /** 目前活著的實例數（守衛量這個 —— 池子不長大的證據）。 */
  get liveCount(): number {
    return this.live.length;
  }

  /** 所有 free-list 加起來（守衛量這個 —— 回收真的有發生的證據）。 */
  get pooledCount(): number {
    let n = 0;
    for (const list of this.pool.values()) n += list.length;
    return n;
  }

  /**
   * 放一支 `spawnModelFx`。回傳實際生出來的實例數（0 = 沒模型 / 撞預算）。
   *
   * ⚠️ 撞到 `maxLive` 時**直接不生**,⛔ 不排隊 —— 一個遲到的特效比沒有更糟
   * (它會在事情結束之後才出現)。這與 `emitterBudget` 的 fail-fast 同一個立場。
   */
  /**
   * ⭐ 吃 **`modelFxSpawn` 的線路酬載**（GH#606）。
   *
   * ⛔ 舊簽章是 `spawn(spec, at)` —— 而**出貨路徑從來沒有那樣呼叫過它**：
   * sim 送的是 `{ caster, modelKey, instances, … }`，客戶端讀的是 `ev.data.spec`，
   * 兩邊從第一天起就對不上。⚠️ 而 `modelFxRig.test.ts` 一直是綠的，因為
   * **它自己造了一個 spec 餵進來**（第二守則失敗形態⑤：被測的不是出貨的那個）。
   */
  spawn(ev: ModelFxSpawnEvent): number {
    if (this.disposed) return 0;
    const doc = this.opts.resolveModel(ev.modelKey);
    if (!doc) return 0;
    this.ensureContainer(ev.modelKey, doc.glbPath);

    const room = Math.max(0, this.maxLive - this.live.length);
    const n = Math.min(ev.instances.length, room);
    const lifeSec = modelFxWireLifeSec(ev.instances, this.maxEffectSec);

    // ⭐ 初始姿態:把這份網格烘出來的長軸擺到行進軸上(owner 的「90 度橫放的 beam」)。
    // ⚠️ 它掛在**內**層,所以 `spinDegPerSec` 的翻滾繞的是已經橫放好的那根長軸。
    const axisEuler = modelFxAxisCorrection(doc.fxLongAxis);

    // ⭐ GH#693 —— 這一發的外觀：節點級 `tint`/`alpha` **取代** `model@1` 的那兩格。
    //    ⛔ 不相乘（`SetUnitVertexColor` 是覆寫語意），⛔ 也不是「有 tint 就連 alpha
    //    一起換掉」—— 兩格各自獨立退回模型的預設。
    const look: ModelFxAppearance = {
      ...(ev.tint !== undefined ? { tint: ev.tint } : {}),
      ...(ev.alpha !== undefined ? { alpha: ev.alpha } : {}),
    };
    const poolKey = poolKeyOf(ev.modelKey, look);

    let made = 0;
    for (let i = 0; i < n; i++) {
      const inst = ev.instances[i];
      if (!inst) break;
      const nodes = this.acquire(ev.modelKey, doc, poolKey, look);
      if (!nodes) break;
      const { root, axis } = nodes;
      // ⭐ GH#702 —— 非等向縮放。⛔ 在此之前這一行是 `setAll(…)` ＝ **結構上**
      //    表達不了「一道細長的光束」：`revivehuman.glb` 的包圍盒是
      //    10.751 × 16.757 × 10.751（長寬比 **1.56 : 1**），等向放大它得到的是一顆
      //    愈來愈大的方塊 —— 而 owner 2026-08-23 要的是「橫放的光束砲」。
      //    （原作那條又長又窄的光帶住在 `.mdx` 的 `PRE2` 粒子裡，而
      //    `convert_stock_model.py` 只轉 geoset ⇒ GGD 只拿得到核心。）
      // ⚠️ 掛在 **`root`** ⛔ 不是 `axis`：`axis` 子節點才是「模型自己的座標系」，
      //    它已經照 `model@1.fxLongAxis` 把長軸轉到 `+Z`。Babylon 的合成順序是
      //    `S_axis · R_axis · S_root · R_root` ⇒ `root.scaling` 作用在**已經橫放好**
      //    的座標系上：`+Z` 恆為行進軸、`+X` 橫向、`+Y` 上。⇒ 第三格的意思
      //    ⛔ 不會因為換一份 .glb 而改變，而且它與 `roll`（spinDegPerSec，同樣繞
      //    `Z`）可交換 —— 翻滾不會把拉長的光束甩歪。
      // ⭐ 缺席 ⇒ [1,1,1] ⇒ 與 `setAll` 逐位元同義（＝一鍵 rollback）。
      const s = (doc.scale ?? 1) * (ev.scale ?? 1);
      const ax = ev.scaleAxis;
      if (ax === undefined) root.scaling.setAll(s);
      else root.scaling.set(s * ax[0], s * ax[1], s * ax[2]);
      axis.rotation.set(axisEuler.x, axisEuler.y, axisEuler.z);
      root.setEnabled(true);
      // ⭐ GH#842（第四個池，mesh 半邊）—— 這一發是**新的一次演出**，三秒碼表歸零。
      // `vfxHardCap` 的 mesh 碼表只在「某次掃描**觀察到**節點 disabled」時歸零，
      // 而 release 發生在 frame N 的 `modelFx.tick`（`VfxSystem.update` **先**掃描
      // （:2680）**後** tick（:2683）），重用＋re-enable 發生在 frame N+1 的事件
      // drain（在 update **之前**跑）⇒ 掃描永遠看不到 disabled 的那一格 ⇒ 碼表從
      // 第一發起算，第二發在 3 秒門檻被 `setEnabled(false)` —— 光束砲家族
      // 「施展兩次特效就缺失」的 mesh 半邊。多人共用池（poolKey＝modelKey+look，
      // 跨施法者）時機率更高。新造的節點沒有碼表，這一行對它無害（delete 空鍵）。
      noteVfxRefired(root);
      const item: LiveModelFx = {
        root,
        axis,
        modelKey: ev.modelKey,
        poolKey,
        look,
        inst,
        // ⭐ GH#673-③ —— 離地**跟施放縮放連動**,⛔ 不是絕對值:埋掉的量 ∝ 渲染尺寸。
        //    Peer session 量到的兩個點就在同一條比例線上（ev.scale 2.5 ⇒ 半高 2.62 要
        //    抬 ~2.7;08-03 的 4.5 ⇒ 半高 ~4.7）⇒ fxSpawnHeight 定義為「施放縮放 1 時
        //    的離地」,這裡乘上 ev.scale。⚠️ 這個語意變更是免費的:fieldAdoption 普查
        //    證明 netherstrike 是**第一個**採用者,沒有別的消費端要遷移。
        y: (doc.fxSpawnHeight ?? 0) * (ev.scale ?? 1) + (ev.heightU ?? 0),
        ...(ev.heightKeys !== undefined && ev.heightKeys.length > 0
          ? { heightKeys: ev.heightKeys }
          : {}),
        ...(ev.trailVfxId !== undefined
          ? {
              trailVfxId: ev.trailVfxId,
              trailIntervalSec: Math.max(0.02, ev.trailIntervalSec ?? 0.06),
              trailNext: 0,
            }
          : {}),
        ...(ev.spinDegPerSec !== undefined ? { spinDegPerSec: ev.spinDegPerSec } : {}),
        // ⭐ GH#689 —— 剪輯那兩格。⚠️ `clip` 缺席時**整段不存在** ⇒ 一條軌都不
        //    碰 ＝ 2026-08-25 之前的行為，逐位元不變（rollback：內容清空這一格）。
        ...(ev.clip !== undefined
          ? {
              clip: ev.clip,
              ...(ev.clipTimeScale !== undefined ? { clipTimeScale: ev.clipTimeScale } : {}),
            }
          : {}),
        ageSec: 0,
        lifeSec,
      };
      this.applyPose(item);
      // ⭐ 幾何已經在（重用／容器早就載好）⇒ 現在就起播；還沒到的那幾具由
      //    `ensureContainer` 的回填在容器落地的當下補播（同一支 `startClip`）。
      this.startClip(item, doc);
      this.live.push(item);
      made++;
    }
    return made;
  }

  /**
   * 推進每一個活著的實例。
   *
   * ⚠️ 走**倒序**,因為回收會就地移除 —— 正序 splice 會跳過下一個
   * (那正是 GH#270 孤兒發射器盤點時抓到的形狀)。
   */
  tick(dtMs: number): void {
    if (this.disposed) return;
    const dt = dtMs / 1000;
    for (let k = this.live.length - 1; k >= 0; k--) {
      const item = this.live[k]!;
      item.ageSec += dt;
      const pose = this.applyPose(item);
      // ⭐ M11 沿路拖尾：在**這一幀模型真的所在的點**放一發（⛔ 不是重算軌跡 ——
      //    那會是第二個住處，而它會跟畫面差幾幀）。
      // ⚠️ 迴圈是「補到追上」而不是 `if`：一幀掉到 100ms 時要補三發，
      //    ⛔ 不是只放一發然後拖尾出現一個洞。上限 8 發防背景分頁醒來時的暴衝。
      if (item.trailVfxId !== undefined && this.opts.spawnTrail) {
        const gap = item.trailIntervalSec ?? 0.06;
        let guard = 0;
        while ((item.trailNext ?? 0) <= item.ageSec && guard++ < 8) {
          this.opts.spawnTrail(item.trailVfxId, pose.x, pose.y, pose.z);
          item.trailNext = (item.trailNext ?? 0) + gap;
        }
      }
      if (item.ageSec >= item.lifeSec) {
        this.live.splice(k, 1);
        this.release(item);
      }
    }
  }

  /**
   * 每一具活著的實例**現在**在哪（測試用）。
   *
   * ⭐ 它存在的理由是 GH#606：守衛必須問「模型有沒有真的出現在 sim 算的那條線上」，
   * 而那個答案只在 Babylon 節點上。⛔ 讀 `spec` 之類的輸入回答不了 ——
   * 那正是舊守衛全綠的方式（失敗形態⑤）。
   */
  livePositions(): { x: number; y: number; z: number }[] {
    return this.live.map((i) => ({ x: i.root.position.x, y: i.root.position.y, z: i.root.position.z }));
  }

  /** 回合邊界:全部收回 free-list（⛔ 不 dispose —— 下一回合還要用）。 */
  resetForRound(): void {
    for (const item of this.live) this.release(item);
    this.live.length = 0;
  }

  /**
   * 回合邊界:把**所有** free-list 加起來修剪到 `cap`（GH#429）。
   *
   * ⭐ 這是 `AmbientVfx.drainPools()` 與 `VfxSystem` 的 `pool.clear()` 同一件事:
   * 「只會長不會縮的池子在回合邊界整個還回去」。⛔ 少了它，上一回合那幾支技能的
   * modelKey 會**永遠**各留 `maxPooledPerModel` 個帶著 glb 幾何的隱藏節點在場上。
   *
   * `cap` 由呼叫端從 `vfxCleanupPolicy` 推導（`Infinity` = 完全不修剪，止血閥），
   * ⛔ 不在這裡讀 config —— 這一層不知道內容從哪來（同 `resolveModel` 的立場）。
   */
  trimPoolTo(cap: number): void {
    if (this.disposed || Number.isNaN(cap)) return;
    for (const [key, free] of [...this.pool]) {
      while (this.pooledCount > cap && free.length > 0) {
        const nodes = free.pop()!;
        this.disposeClipGroups(nodes.axis); // ⭐ 軌不是節點,`retire` 收不到它們
        this.retire(nodes.root);
      }
      // ⛔ 空的 free-list 也要除名:`pool` 的 key 數本身就是那個無界的東西。
      if (free.length === 0) this.pool.delete(key);
    }
  }

  /**
   * 收掉這個 rig 造過的**每一個**節點。
   *
   * ⛔⛔ GH#558① —— **容器不 dispose，只放手。** 在此之前這裡有一行
   * `for (const c of this.containers.values()) c?.dispose();`，而那些容器是
   * `loadContainer`（出貨＝`AssetManager.load`，**per-Scene 共用快取**）借來的：
   * rig 在這裡 dispose 它們，快取端的 Promise 仍然指著同一份物件 ⇒ 之後每一個
   * 消費者（ChampionView 替身升級、場地佈景、下一個 rig）拿到的都是屍體，
   * 而畫面上那是「模型偶爾不出現」，⛔ 沒有任何錯誤訊息。
   * ⇒ 容器的 dispose 權在**建它的那一端**（`AssetManager.purgeFxContainers()`
   * 或 scene 整個收掉時），⛔ 不在借用者手上。
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.live.length = 0;
    this.pool.clear();
    // ⭐ GH#689 —— 軌**先**收（趁它們的目標還活著），與 `ChampionView.dispose()`
    //    對 `clipAnimator` / `formAttachGroups` 的順序逐字相同。
    for (const groups of this.clipGroups.values()) for (const g of groups) g.dispose();
    this.clipGroups.clear();
    for (const root of this.born) this.disposeInstanceTree(root);
    this.born.length = 0;
    this.containers.clear(); // ⛔ 只放手 —— 見上面 GH#558① 的檔頭
    this.loading.clear();
  }

  /**
   * 🧹 GH#819 —— **回合間完整清理**：把這個 rig 造過的每一個節點、軌與 free-list
   * 全部收掉，並放掉所有容器引用 —— 但 rig **繼續可用**（下一發 `spawn`／`warm`
   * 會重新向 loader 要容器）。
   *
   * 與 `dispose()` 的差別只有一個：不設 `disposed`。與 `resetForRound()` 的差別
   * 是力道 —— 那一支把活著的收回 free-list（幾何留著），這一支連 free-list 與
   * 幾何一起 dispose（`purgeBetweenRounds("soft"/"full")` 的「幾何」那一段）。
   * ⛔ 容器同樣**只放手不 dispose**（GH#558①）—— 要真的丟共用快取，走
   * `AssetManager.purgeFxContainers()`（它才是建立者）。
   */
  hardReset(): void {
    if (this.disposed) return;
    this.generation++; // in-flight 的載入醒來時發現世代不同 ⇒ 放手
    this.live.length = 0;
    this.pool.clear();
    for (const groups of this.clipGroups.values()) for (const g of groups) g.dispose();
    this.clipGroups.clear();
    for (const root of this.born) this.disposeInstanceTree(root);
    this.born.length = 0;
    this.containers.clear();
    this.loading.clear();
  }

  // ── 內部 ──────────────────────────────────────────────────────────────────

  private applyPose(item: LiveModelFx): ReturnType<typeof modelFxPoseFromWire> {
    // ⭐ GH#838 M3 —— 升空曲線：有 keys 就照年齡內插，⛔ 沒有就是固定高度
    //    （逐位元同這一格出現以前）。基準是同一個 `item.y`（模型自己的
    //    fxSpawnHeight×scale ＋ heightU），所以曲線是**疊上去**的。
    const y = item.heightKeys ? item.y + sampleHeightKeys(item.heightKeys, item.ageSec) : item.y;
    const pose = modelFxPoseFromWire(
      item.inst,
      { y, ...(item.spinDegPerSec !== undefined ? { spinDegPerSec: item.spinDegPerSec } : {}) },
      item.ageSec,
    );
    item.root.position.set(pose.x, pose.y, pose.z);
    // yaw 繞世界 Y,roll 繞模型自己的前方軸(Babylon 的 Z)。
    // ⭐ 長軸修正住在**子**節點(`axis`)上,所以這裡的 roll 繞的是**已經橫放好的**
    //    那根長軸 —— 翻滾光束會沿著自己滾,⛔ 不是每滾一圈甩離航線一次。
    item.root.rotation.set(0, pose.yawRad, pose.rollRad);
    return pose;
  }

  /**
   * 🔥 GH#703 —— 進場預熱：把出貨內容會用到的 modelKey 先載進容器快取。
   * ⛔ 少了這一步，「第一次施放」會死在 glb 下載完成之前（0.1–2 秒的演出 vs
   * 389KB 的下載）—— 回填醒來時場上已經沒有活著的實例，玩家第一次看到這支
   * 技能時模型不存在，而之後每一次都好好的。
   * fire-and-forget：`loadContainer` 本來就是非同步的，⛔ 不擋首次繪製。
   */
  warm(keys: readonly string[]): void {
    for (const key of keys) {
      const doc = this.opts.resolveModel(key);
      if (doc) this.ensureContainer(key, doc.glbPath);
    }
  }

  private ensureContainer(modelKey: string, glbPath: string): void {
    if (this.containers.has(modelKey) || this.loading.has(modelKey)) return;
    this.loading.add(modelKey);
    const gen = this.generation;
    void this.opts
      .loadContainer(glbPath)
      .then((c) => {
        // 🧹 GH#819 / GH#558① —— 世代不同（hardReset 過）或整個 rig 收掉了：
        // **放手**就好。⛔ 不 dispose —— 這份容器屬於 loader 的共用快取
        // （出貨是 `AssetManager` 的 per-Scene cache），rig 只是借用者；
        // 在這裡 dispose 等於把一份**別的消費者還讀得到**的快取條目變成屍體。
        if (this.disposed || gen !== this.generation) return;
        this.loading.delete(modelKey);
        this.containers.set(modelKey, c);
        // ⭐ GH#673-①c —— 首發那幾具是在容器**之前**生的空殼,現在補幾何。
        //    ⛔ 不補的話「第一次施放沒有特效」,而那正是玩家最會注意的那一次
        //    (acquire 檔頭的承諾在此之前沒有任何人兌現)。
        if (c) {
          for (const item of this.live) {
            if (item.modelKey !== modelKey || item.axis.getChildren().length > 0) continue;
            const doc = this.opts.resolveModel(modelKey);
            // ⭐ GH#693 —— 回填要用**這一發**的外觀（`item.look`），⛔ 不是模型的預設色:
            //    首發那幾具正是玩家最會注意的那一次，用錯色比晚幾幀更明顯。
            if (doc) {
              this.fillGeometry(modelKey, item.axis, doc, item.look);
              // ⭐ GH#689 —— 幾何是**現在**才到的，所以剪輯也要**現在**才起播：
              //    `spawn()` 那一次呼叫 `startClip` 時這一具身上一條軌都還沒有。
              this.startClip(item, doc);
            }
          }
        }
      })
      .catch(() => {
        if (this.disposed || gen !== this.generation) return;
        this.loading.delete(modelKey);
        this.containers.set(modelKey, null);
      });
  }

  /**
   * 拿一個實例根節點:先掏 free-list,空了才造。
   *
   * ⚠️ glb 還在串流時**照樣**回一個空的 root —— 特效於是準時出現在正確的位置上,
   * 幾何晚幾幀補進來。⛔ 反過來(等載入完再生)會讓技能的第一次施放沒有特效,
   * 而那正是玩家最會注意的那一次。
   */
  /**
   * ⭐ GH#673-① —— 把容器的幾何灌進一個(還)空的實例。
   *
   * 三個呼叫端,三種時機同一份程式:
   *   a. `acquire` 造新節點且容器已載 —— 原本唯一會發生的那條路
   *   b. `acquire` 從池子撈到**空殼** —— 首發造出的空節點被 release 進池子之後,
   *      每一次重用都還是空的(⚠️ 2026-08-24 量到:第 2 發、glb 已載 6 秒,照樣整發
   *      看不見)。「幾何晚幾幀補進來」那句註解在此之前**是假的** —— 沒有任何
   *      程式碼做補這件事(第三守則)。
   *   c. 容器**載完的當下**回填還活著的空實例 —— 首發那一具就是在這裡補的。
   */
  private fillGeometry(
    modelKey: string,
    axis: TransformNode,
    doc: ModelFxModelDoc,
    look: ModelFxAppearance = {},
  ): boolean {
    const container = this.containers.get(modelKey);
    if (!container) return false;
    const serial = this.serial++;
    const inst = container.instantiateModelsToScene(
      (n) => `modelfx-${serial}-${n}`,
      false,
      { doNotInstantiate: true },
    );
    for (const node of inst.rootNodes) node.parent = axis;
    // ⭐ GH#689 —— 剪輯：`instantiateModelsToScene` **會**把容器的 AnimationGroup
    //    一起 clone（量到，`doNotInstantiate:true` 下也一樣），而且軌的目標已經
    //    重新指到這一具的 clone 節點上 ⇒ ⛔ 不必自己 clone group。
    // ⚠️ 但它們**不在** `axis` 底下（不是節點），所以要自己記帳 —— 見 `clipGroups`。
    const groups = inst.animationGroups as unknown as ModelFxAnimGroup[];
    if (groups.length > 0) {
      // 空 glb（rootNodes 0 個）會讓 `getChildren().length === 0` 永遠成立 ⇒ 這一支
      // 可能被同一個 axis 呼叫第二次。⛔ 前一批不收就是孤兒軌。
      const prev = this.clipGroups.get(axis);
      if (prev) for (const g of prev) g.dispose();
      this.clipGroups.set(axis, groups);
    }
    // ⭐ fxTint／fxAlpha 共用同一個入口（clone-材質那一套規矩只寫一份）：
    //    只有 fxAlpha 時 tint 用 [1,1,1]（乘 1 ＝ 不著色）。
    // ⭐ GH#693 —— **這一發**的 tint／alpha 取代模型文件的那兩格（⛔ 不相乘）。
    const tint = look.tint ?? doc.fxTint;
    const alpha = look.alpha ?? doc.fxAlpha;
    if (tint || alpha !== undefined) applyFxTint(axis, tint ?? [1, 1, 1], alpha);
    // 🔆 GH#767 —— 原作的 additive 混合。⭐ 一定要在 `applyFxTint` **之後**：
    //    它會 clone 材質再指回 mesh，寫在前面就是寫到一份被丟掉的舊物件上。
    applyStockGlowAdditive(axis);
    return true;
  }

  /**
   * ⭐【播剪輯】GH#689 —— 把這一具的 `clip` 起播，回傳真的動起來的軌數。
   *
   * ── 三件被量出來、⛔ 不是推測的事 ────────────────────────────────────────
   * ① `speedRatio` 要在 `play()` **之前**設：setter 會把值推進每一個 animatable，
   *    而 `play()` 內部用的正是 `this._speedRatio`。
   * ② ⛔ **不可以用 `start()`** —— Babylon 的 `start()` 在群組已經 started 時
   *    **整支 early-return**（量到：`start(true, 0.9)` 之後 speedRatio 仍是 0.5）。
   *    池子重用時那正好是「第二發起，動畫停在上一發結束的那一幀」。
   *    `play()` 走 `stop() → start()` / `restart()`，兩條路都對。
   * ③ 沒被指名的軌**從來不起播**（clone 出來是 stopped 的），所以「只播一條」
   *    不需要先把別的停掉。
   *
   * `clip` 缺席 ⇒ 立刻回 0，⛔ 一條軌都不碰（今天的行為，逐位元不變）。
   */
  private startClip(item: LiveModelFx, doc: ModelFxModelDoc): number {
    if (item.clip === undefined) return 0;
    const groups = this.clipGroups.get(item.axis);
    if (groups === undefined || groups.length === 0) return 0;
    const targets = fxClipTargets(groups, item.clip, doc.clipMap);
    // ⭐ 原作的 dummy 序列是**循環**的（`birth`→`stand` 一直播到單位被移除），
    //    而凍播那一族（0.15×）在 dummy 的壽命內根本走不到剪輯結尾 ⇒ 循環與否
    //    對它沒有差別。⛔ 所以這裡不開第三格 `clipLoop`（沒有內容需要它）。
    for (const g of targets) {
      g.speedRatio = item.clipTimeScale ?? 1;
      g.play(true);
    }
    return targets.length;
  }

  /**
   * 回收前把這一具的軌**停掉**（GH#689）。
   *
   * ⚠️ ⛔ 少了它，池子重用會拿到一條**還在跑**的軌：`play()` 對已經在跑的群組是
   * `restart()`（沒事），但 `clip` 缺席的下一發**完全不呼叫** `startClip`
   * ⇒ 那一具會播著上一支技能的動畫（而它看起來只是「特效怪怪的」）。
   */
  private stopClip(axis: TransformNode): void {
    const groups = this.clipGroups.get(axis);
    if (groups === undefined) return;
    for (const g of groups) g.stop();
  }

  /** 真的收掉這一具的軌（⛔ 不是節點 —— `root.dispose()` 收不到它們）。 */
  private disposeClipGroups(axis: TransformNode): void {
    const groups = this.clipGroups.get(axis);
    if (groups === undefined) return;
    for (const g of groups) g.dispose();
    this.clipGroups.delete(axis);
  }

  private acquire(
    modelKey: string,
    doc: ModelFxModelDoc,
    poolKey: string = modelKey,
    look: ModelFxAppearance = {},
  ): ModelFxNodes | null {
    const free = this.pool.get(poolKey);
    const reused = free?.pop();
    if (reused) {
      // ⭐ GH#673-①b —— 池子裡的可能是首發留下的空殼:現在容器到了就補。
      if (reused.axis.getChildren().length === 0)
        this.fillGeometry(modelKey, reused.axis, doc, look);
      return reused;
    }

    const serial = this.serial++;
    const root = new TransformNode(`modelfx-${modelKey}-${serial}`, this.scene);
    this.born.push(root);
    // ⭐ 內層 = 長軸修正。⚠️ 它是**節點**不是一次性的旋轉:實例會被回收重用,
    // 而下一次施放的模型可能是另一份 .glb(另一個 free-list),所以修正要跟著節點走。
    // 名字帶 `axis-` 是刻意的 —— 守衛從**出貨的場景樹**上把它撈出來量,
    // ⛔ 不是靠一個只有測試會呼叫的存取器(失敗形態⑤)。
    const axis = new TransformNode(`modelfx-axis-${modelKey}-${serial}`, this.scene);
    axis.parent = root;
    // 容器還在串流時 fillGeometry 回 false —— 空節點照樣回去(特效準時出現在
    // 正確位置),⭐ 但幾何**真的**會晚幾幀補進來:容器載完的 callback 會回填(①c)。
    this.fillGeometry(modelKey, axis, doc, look);
    return { root, axis };
  }

  private release(item: LiveModelFx): void {
    item.root.setEnabled(false);
    // ⭐ GH#689 —— 回收＝停播。⚠️ 一條沒停的軌在 free-list 裡**還在每幀被推進**
    //    （`setEnabled(false)` 只關渲染，⛔ 不關動畫），而下一次重用會看到它停在
    //    一個沒有人選過的幀上。
    this.stopClip(item.axis);
    let free = this.pool.get(item.poolKey);
    if (!free) {
      free = [];
      this.pool.set(item.poolKey, free);
    }
    // ⭐ 上界:free-list 滿了就**真的收掉**這一個,並且從 `born` 裡除名。
    // ⛔ 不可以只是「不放回池子」—— 那個節點會變成沒有人指得到的孤兒,
    //    活到 dispose() 為止,而一場 20 分鐘的比賽會積出幾百個(#131 的慢動作版)。
    // ⭐ **兩**道閘。⚠️ 只有 per-model 那一道是不夠的（GH#429）——
    //    見 `DEFAULT_MAX_POOLED_TOTAL` 的註解與量到的 72/回合。
    if (free.length < this.maxPooledPerModel && this.pooledCount < this.maxPooledTotal) {
      free.push({ root: item.root, axis: item.axis });
      return;
    }
    this.disposeClipGroups(item.axis);
    this.retire(item.root);
  }

  /** 真的收掉一個實例節點並從 `born` 除名（⛔ 不可以只是「不放回池子」—— 那是孤兒）。 */
  private retire(root: TransformNode): void {
    const at = this.born.indexOf(root);
    if (at >= 0) this.born.splice(at, 1);
    this.disposeInstanceTree(root);
  }

  /**
   * 🧹 GH#782 —— 收一棵實例子樹：**只收 rig 自己 clone 的材質，⛔ 不碰共用快取**。
   *
   * ── 在此之前這裡是 `root.dispose(false, true)`，而那個 `true` 是**兩個缺陷**──
   * ① 無 tint 的實例：mesh 上掛的是**容器的共用來源材質**（`instantiateModelsToScene`
   *    with `cloneMaterials:false` 直接沿用，Babylon `assetContainer.js` L475 還會把它
   *    re-add 進 `scene.materials`）⇒ `dispose(…, true)` 把**這個 modelKey 之後每一發**
   *    共用的材質整個殺掉 —— 池子一滿（trimPoolTo / release 溢位）就觸發，而畫面上
   *    跟「這支特效本來就沒材質」一模一樣（失敗形態①）。
   * ② 有 tint 的實例：mesh 上是 `-fxtint` clone，⛔ 但 **clone 與來源共用貼圖** ——
   *    `dispose(…, true)` 的 forceDisposeTextures 把來源材質的貼圖一起陪葬，
   *    同 key 的其他實例與之後每一發全部變黑。
   * ⇒ 判準：**rig 造的（節點、`-fxtint` clone）rig 收；容器的（來源材質/貼圖/幾何）
   *    由建它的那一端收**（GH#558①：出貨＝`AssetManager.purgeFxContainers()`，
   *    ⛔ rig 的 `dispose()` 不再碰容器）。
   * `-fxtint` 是 `applyFxTint` 的命名契約（`${mat.name}-fxtint`），守衛
   * `modelFxRigRoundLeak.test.ts` 兩個方向都鎖：clone 要離場、來源要活著。
   */
  private disposeInstanceTree(root: TransformNode): void {
    for (const mesh of root.getChildMeshes(false)) {
      const holder = mesh as {
        material?: { name?: string; dispose?: (fe?: boolean, ft?: boolean) => void } | null;
      };
      const m = holder.material;
      if (m && typeof m.dispose === "function" && (m.name ?? "").endsWith("-fxtint")) {
        holder.material = null;
        // ⭐ (true, **true**)：clone 的貼圖是 `Material.clone()` **複製出來的自有份**
        //    （Babylon 預設 `cloneTexturesOnlyOnce` 會 clone 貼圖，⛔ 不是共用參照 ——
        //    守衛①量到 +1 貼圖/clone），⛔ 不收就是逐 clone 的貼圖洩漏。
        //    來源材質自己的貼圖不在這份 clone 身上，所以這個 `true` 碰不到它。
        m.dispose(true, true);
      }
    }
    root.dispose(false);
  }
}
