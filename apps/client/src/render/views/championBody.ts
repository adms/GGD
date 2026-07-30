/**
 * championBody —— 「這個 entity **現在**穿的是哪一具身體」，以及四個完全由那個
 * 答案決定的渲染輸入（#223 的後半）。
 *
 * ---------------------------------------------------------------------------
 * 為什麼這一段程式碼住在這裡，而不是繼續住在 GameApp
 * ---------------------------------------------------------------------------
 * `seat.championId` 在選角那一刻凍住，**變身不會動它**（變身是 in-place 換
 * body：同一個 seat、同一個 entity、同一條血）。所以任何拿 seat 直接去查
 * 「這具身體該長什麼樣」的解析器，對變身態一律答錯。
 *
 * 這四條縫本來各自寫在 `GameApp` 的 `new EntityViewRegistry(...)` 引數裡，
 * 而 `GameApp` **在測試裡建構不出來**（`new Engine(canvas)` 要真的 WebGL，
 * 建構子還會開 Colyseus session；全 repo `grep -rn "new GameApp" --include=
 * "*.test.ts"` 零命中）。於是那些縫是**裸的**：可以整行還原成形態盲、
 * 4504 條測試零紅。第一次修 #223 的時候就是這樣過關的——而且不只守衛是空的，
 * **修法本身當時是死的**：
 *
 *     modelDocFor: (key, seatId) => this.modelDocFor(key, seatId),
 *
 * registry 傳的是 `(e.key, e.seatId, form)` 三個引數，這個兩參數的箭頭函式把
 * 第三個**靜靜吃掉**，`formIndex` 於是永遠拿預設值 0。TypeScript 允許用較短的
 * 箭頭函式滿足較長的簽章，所以 typecheck 全綠、測試全綠、功能是零。
 * （失敗形態 ②「算出來了但從沒送到」＋ ③「可以整行刪掉但測試全綠」。）
 *
 * 把四條縫搬進這個**沒有 Babylon engine、沒有 canvas、沒有網路**的工廠之後：
 *   · 出貨的那一份可以被測試直接建構並餵進真的 `EntityViewRegistry`；
 *   · 引數丟失那一類 bug 不可能再發生 —— 函式是工廠自己生的，不是轉接的；
 *   · 「把它們還原成形態盲」只有一個地方可以下手（本檔的 `bodyChampionIdFor`
 *     ／`modelDocFor`），而那個地方有守衛（`formAwareModelResolve.test.ts`
 *     第 2 組：四條縫各一條 `it`，所以「只還原其中一條」也擋得住）。
 *
 * GameApp 剩下的只有**資料來源**（seat 表、ContentDb、裝備造型替換）和四行
 * identity 轉接。⚠️ 那四行**不可以**包成箭頭函式 —— 包裝正是當年那個 bug 的
 * 形狀，而且會把決策搬回那個測不到的檔案。`formAwareModelResolve.test.ts` 的
 * 「組裝點」那一組把它釘死成 `this.championBody.<hook>,` 一字不差。
 *
 * ---------------------------------------------------------------------------
 * 四條縫為什麼都要形態感知（各自的理由不一樣）
 * ---------------------------------------------------------------------------
 *  1. `voxelSkinFor` —— 生成的體素皮膚是**這具身體的身分**（調色盤／臉／服裝
 *     全部從 championId 雜湊出來）。用 seat 那一隻等於把本體的臉貼到第二形態
 *     上。26 對裡 26 對都受影響，因為兩個 id 一定不同。
 *  2. `modelOverrideFor` —— `_standin-overrides.json` 的相對大小與 #226 的
 *     方塊人外觀都按 championId 記。**但這一條是「缺省即繼承」**：26 個變身態
 *     一個都沒有自己的欄位，直接改問變身態會讓拳四郎變身後從 1.65 掉回 1.0。
 *     w3u 自己的語意就是「這個單位沒寫這一格 = 沿用 base 的」。
 *  3. `modelDocFor` —— 見下面那段量測。這一條的效果**遠比第一次修它的人以為的
 *     小**，而且沒有保底的話會**倒退**。
 *  4. `championTintFor` —— 英雄自己的 w3x 頂點色。**2026-07-30 才補上的第四
 *     條**：在那之前 GameApp 直接寫 `championTintForId(championIdForSeat(...))`，
 *     而本檔與 `formVisual.ts` 的註解都已經宣稱它經由形態跳轉 —— 註解說謊了。
 *     實測 26 對只有 1 對兩半顏色不同（#06 傑·富力士 綠→灰），所以它是一個
 *     真的、但只有一位英雄看得到的缺陷。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 事實更正：`modelDocFor` 這一條到底影響幾對（2026-07-30 重量）
 * ---------------------------------------------------------------------------
 * 第一次修 #223 的人（以及當時的四份註解）寫的是：
 *
 *     「#06 傑·富力士 `godie-u034` 與 #61 克勞薩 `godie-u011` 都是
 *       `champ.thorne`，所以 overlay 會把本體的 WC3 模型裝回變身態身上。」
 *
 * **出貨內容正好相反。** 拿真的 `CHAMPION_FORM_PAIRS` × 真的
 * `content/champions/*.json` × 真的 `content/models/*.json` 逐對算
 * （26/26，`formAwareModelResolve.test.ts` 的第 4 組測試就是這份普查本身）：
 *
 *     godie-ucrl（本體）= champ.thorne          godie-u034（變身）= imported.herobiggon
 *     godie-u012（本體）= champ.thorne          godie-u011（變身）= champ.skin.barbarian
 *
 * 穿共用替身的是**本體**（#06 的變身態不是），而 #61 兩半雖然都穿替身，穿的也
 * 不是同一個。`imported.herobiggon` 的 glbPath 在 `assets/models/imported/`
 * 底下，`resolve()` 第一行 `hasDedicatedShippedModel` 就 return，**champId 根本
 * 不會被讀到** —— #06 那個「缺陷」在物理上不可能發生。
 *
 * 真正的分佈（`e.key` = 變身態的 modelKey，因為 snapshot 每 tick 用
 * `Champions.get(championId).modelKey` 重算）：
 *   · **20 對**：變身態穿自己的匯入模型 → overlay 從不出手，改不改一樣。
 *   · **6 對**（26/30/40/61/70/87）：變身態穿共用替身，overlay 會出手。
 *
 * ⚠️ 而在那 6 對上，光把 id 換成形態感知的**會讓 5 對變差**，因為決定「要不要
 * 採用 glb」的是另一個判斷：`defaultPrefersVoxelBody(modelKey, championId)`。
 * 它問的是 `BLIZZARD_MODEL_CHAMPIONS`（overlay 抽取的 40 個**可選**單位），而
 * 變身態一個都不在裡面 —— 所以形態感知的 `voxelSkinFor` 一問，
 * `ChampionView.tryUpgradeToGlb` 就在 `preferVoxelBody` 那一行 return，
 * `godie-h00w / o030 / n01b / u011 / e010` 會從 `Harf/Orkn/Nman/U012/E00S.glb`
 * 一起掉成程序生成的體素身體。**那是掛在「修復」名義下的美術退步。**
 *
 * 所以這個修法是三件事一起，缺一件就退步：
 *   (a) 四條縫形態感知（本檔）；
 *   (b) `defaultPrefersVoxelBody` 缺省即繼承對半的答案
 *       （`packages/shared/src/content/voxelSkin/types.ts`）；
 *   (c) `resolve(…, inheritFrom)` 缺省即繼承本體的 overlay 單位
 *       （`blizzardOverlay.ts`）—— 這一條是 61 克勞薩專用：w3u 給那兩半不同的
 *       模型路徑（U011 是 collision.mdl，一個沒有幾何的 dummy），所以
 *       `SHARED_MODEL_COUNTERPART` 這張**事實表**依法不能為它加一列。
 *
 * ---------------------------------------------------------------------------
 * 收益有多大：**兩個基準要分開講**（2026-07-30 重量，52 具身體逐具跑）
 * ---------------------------------------------------------------------------
 * ⚠️ 這一段前一版寫「沒有任何一對變差，而且 **6 對變好**」。那個 6 是**混了
 * 兩個基準**算出來的，會讓人以為這個修法讓 6 具身體變漂亮了。實際不是。
 *
 * 基準 A —— **#223 之前真正出貨的行為**（四條縫全形態盲、沒有兩張保底）：
 *   · 退步 **0** 具；
 *   · 進步 **2** 具，而且都是同一位英雄 —— 87 曹操孟德的兩半
 *     （`godie-o02n` 本體與 `godie-o02o` 變身態），兩具都從程序生成的體素
 *     身體換成 `O02O.glb`。它本來就一直穿著方塊人，而 overlay 早就解析得出
 *     那個模型，只是 `defaultPrefersVoxelBody` 把門關著。
 *   · 其餘 50 具**完全不動**。
 *
 * 基準 B —— **「只把三條縫改成形態感知、不加保底」的那個中途狀態**：
 *   · 相對它，最終版救回 5 具（`godie-h00w / o030 / n01b / u011 / e010`
 *     從體素身體回到 `Harf / Orkn / Nman / U012 / E00S.glb`）。
 *   但那 5 具在基準 A 底下本來就是好的 —— 那是**這個修法自己會造成的退步被
 *   補起來**，不是收益。把它當成收益就是拿自己挖的坑當政績。
 *
 * 所以誠實的一句話是：**這個修法對「畫哪一具 glb」幾乎沒有收益（52 具裡動
 * 2 具，都是曹操），它真正的價值在另外三條縫** —— `voxelSkinFor`（26 對
 * 26 對的臉都會換）、`modelOverrideFor`（#226 方塊人外觀）、`championTintFor`
 * （#06 傑·富力士 的綠→灰）。而兩張保底是**必要條件**，不是裝飾。
 *
 * 這三個數字（0 退步 / 2 進步 / 兩張保底各自拿掉會退步幾具）都由
 * `formAwareModelResolve.test.ts` 第 3 組用真的 overlay ＋真的
 * `defaultPrefersVoxelBody` 逐具跑出來，不是抄在註解裡的。
 */
import type { ModelDoc, FormVisual } from "@ggd/shared/content";
import type { VoxelSkinOverride, VoxelSkinRecipe } from "@ggd/shared/content/voxelSkin";
import { formIndexFromFlags } from "@ggd/shared/protocol/schema";
import {
  mobModelSizeOverride,
  relativeScaleOf,
  type EntityViewState,
  type ModelDocOverride,
} from "../EntityViewRegistry";
import { ARCHETYPE_BY_MODEL_KEY, voxelLookFor } from "./voxelLook";
import { voxelSkinForId } from "./voxelSkinFor";
import { championTintForId } from "./championTint";
import type { ModelTint } from "./modelTint";
import { composeFormTint, formAwareChampionId, formScaleMultiplier } from "./formVisual";

/** The ContentDb reads these hooks need (all keyed by championId / modelKey). */
export interface ChampionBodyContent {
  /** `content/models/<modelKey>.json` */
  modelFor(modelKey: string): ModelDoc | null;
  /** `content/models/_standin-overrides.json`, keyed by championId */
  standinOverrideFor(championId: string): ModelDocOverride | null;
  /** hand-authored voxel-skin sidecar + the operator's body choice */
  voxelSkinOverrideFor(championId: string): VoxelSkinOverride | null;
  /** 變身外觀（顏色／大小／掛件）—— 只有 `Emeu` 那一半有 */
  formVisualFor(alternateChampionId: string | null): FormVisual | null;
}

/** The one method these hooks need off `BlizzardOverlayModels` (injected so a test drives the REAL class). */
export interface ChampionBodyOverlay {
  resolve(
    shipped: ModelDoc | null,
    champId: string | null | undefined,
    inheritFrom?: string | null,
  ): ModelDoc | null;
}

export interface ChampionBodyDeps {
  /**
   * The seat table read — **FORM-BLIND ON PURPOSE**. This is the raw
   * `seat.championId`, frozen at champ-select; the form hop is this module's
   * job and must not be pre-applied by the caller, or the two would drift.
   */
  championIdForSeat(seatId: number | undefined): string | null;
  /** equipped-skin substitution (LOCAL seat only) — modelKey → modelKey */
  resolveModelKey(modelKey: string, seatId: number | undefined): string;
  content: ChampionBodyContent;
  overlay: ChampionBodyOverlay;
}

/** The four `ViewContentHooks` entries plus the two lookups GameApp still needs. */
export interface ChampionBodyHooks {
  modelDocFor(modelKey: string, seatId?: number, formIndex?: number): ModelDoc | null;
  voxelSkinFor(e: EntityViewState): VoxelSkinRecipe | null | undefined;
  modelOverrideFor(e: EntityViewState): ModelDocOverride | null;
  /**
   * 這個 entity **現在**的 championId —— 變身態時是 `Emeu` 那一半。
   * `championTintFor` / `formAttachmentFor` 也要問同一份，所以它是導出的：
   * 兩邊各寫一次就是兩份會漂移的實作（失敗形態 ⑤）。
   */
  bodyChampionIdFor(e: EntityViewState): string | null;
  /** 這具身體的變身外觀，或 null（基本型一律 null）。 */
  formVisualFor(e: EntityViewState): FormVisual | null;
  /**
   * 這具身體的 w3x 頂點色 × 變身色（#49 × #249）。
   *
   * 第四條縫，理由和前三條一樣，但**它是 2026-07-30 才補上的**：在那之前
   * GameApp 寫的是 `championTintForId(this.championIdForSeat(e.seatId))`，
   * 而本檔與 `formVisual.ts` 的註解都已經宣稱它「經由同一個形態跳轉」——
   * 註解說謊，實作是形態盲的。
   *
   * 重量（26 對 × `content/champions/*.json` 的 `tint` 欄）：**只有 1 對**
   * 兩半的顏色不同 —— #06 傑·富力士，本體 `[0.3922, 1, 0.3922]`（綠），
   * 變身態 `godie-u034` `[0.3922, 0.3922, 0.3922]`（灰）。形態盲的時候變身
   * 之後那具 `herobiggon.glb` 被漆成本體的綠色。其餘 25 對兩半同色，這條
   * 分支對它們是 no-op。
   *
   * ⚠️ 不會和 `FormVisual.tint` 重複計算：後者來自
   * `config.form-visuals@1`（操作者寫的**增量**顏色），前者來自英雄文件自己
   * 的 w3x 頂點色，兩者是不同的資料來源，`composeFormTint` 相乘是正確的。
   *
   * `undefined` = 座位表還沒填好（照傳，呼叫端下一幀再問）。
   */
  championTintFor(e: EntityViewState): ModelTint | null | undefined;
}

/**
 * Build the four form-aware body hooks.
 *
 * Pure over its deps: no Babylon, no HUD store, no fetch — which is exactly why
 * the guard can construct the SHIPPED object and feed it to a real
 * `EntityViewRegistry` (see the module header for the failure this closes).
 */
export function championBodyHooks(deps: ChampionBodyDeps): ChampionBodyHooks {
  const { content, overlay } = deps;

  /** The championId a seat is wearing at `formIndex` (0 = the picked hero). */
  const idForSeatForm = (seatId: number | undefined, formIndex: number): string | null =>
    formAwareChampionId(deps.championIdForSeat(seatId), formIndex);

  /**
   * THE FORM HOP. `e.flags` is the ONLY channel that carries it — `e.key` is
   * byte-identical in both halves of 4 of the 6 pairs the overlay can touch, so
   * a resolver that watched the modelKey would see nothing at all. Reverting
   * this line to `deps.championIdForSeat(e.seatId)` is the bypass
   * `formAwareModelResolve.test.ts` group 2 exists to catch.
   */
  const bodyChampionIdFor = (e: EntityViewState): string | null =>
    idForSeatForm(e.seatId, formIndexFromFlags(e.flags ?? 0));

  const formVisualFor = (e: EntityViewState): FormVisual | null =>
    content.formVisualFor(bodyChampionIdFor(e));

  const modelDocFor = (modelKey: string, seatId?: number, formIndex = 0): ModelDoc | null => {
    const resolved = deps.resolveModelKey(modelKey, seatId);
    const doc = content.modelFor(resolved);
    if (resolved !== modelKey) return doc; // equipped skin is an explicit choice
    // WHICH BODY IS ON SCREEN, not which hero the seat picked. `inheritFrom`
    // is the base id: a 變身態 with no overlay unit of its own keeps the model
    // the player was looking at one second ago instead of dropping to a
    // generic blocky stand-in (measured: that is 克勞薩, and it is the ONLY
    // pair this whole branch moves — see the module header).
    const seated = deps.championIdForSeat(seatId);
    return overlay.resolve(doc, idForSeatForm(seatId, formIndex), seated);
  };

  const voxelSkinFor = (e: EntityViewState): VoxelSkinRecipe | null | undefined => {
    const championId = bodyChampionIdFor(e);
    return voxelSkinForId(championId, content.voxelSkinOverrideFor(championId ?? ""));
  };

  const modelOverrideFor = (e: EntityViewState): ModelDocOverride | null => {
    // A MOB HAS NO SEAT (#262), so the championId hop below answers null and
    // #150's normalization would render all three zombie kinds at 1.8u. Same
    // seam, one branch earlier; `mobModelSizeOverride` is null for every
    // non-mob, so champions are untouched.
    const mob = mobModelSizeOverride(e, modelDocFor(e.key));
    if (mob) return mob;
    const seatedId = deps.championIdForSeat(e.seatId);
    const championId = bodyChampionIdFor(e) ?? seatedId;
    if (!championId) return null;
    // 缺省即繼承 —— `_standin-overrides.json` is keyed by championId, and
    // MEASURED on the shipped file (2026-07-30, 26 pairs): **6** of the 26
    // alternates carry an entry of their own (godie-h00w / o030 / n01b / e010 /
    // o02o / h02u) and **5** carry none while their base does. So the `??` is
    // not decoration on either side:
    //   · own entry WINS — without that, 30 電車癡漢's whole transform (usca
    //     1.00 → 3.00) and 70 紮根's deliberate shrink (1.10 → 1.00) vanish.
    //   · base INHERITED when absent — without that, those 5 fall to the 1.0
    //     default: 25 拳四郎 1.65→1.0, 61 克勞薩 1.20→1.0, and in the other
    //     direction 58 皮卡丘 0.60→1.0 and 90 妙蛙種子 0.62→1.0 (i.e. 61%
    //     BIGGER mid-fight).
    // w3u's own semantics is "this unit does not write that field ⇒ it uses the
    // base's", so authoring an entry for one of those 5 takes effect with no
    // code change. `formAwareModelResolve.test.ts` group 3 re-derives both
    // counts from the real file rather than trusting this comment.
    const shipped =
      content.standinOverrideFor(championId) ??
      (seatedId ? content.standinOverrideFor(seatedId) : null);
    // #249 GH#288 —— the transform's size delta MULTIPLIES the #77/#150
    // relativeScale rather than replacing it, so a hero that is already an
    // exception (小叮噹 0.65) transforms to 0.65 × mult. A mult of 1 makes this
    // whole branch a no-op.
    const formScale = formScaleMultiplier(formVisualFor(e));
    const base: ModelDocOverride | null =
      formScale === 1
        ? shipped
        : { ...(shipped ?? {}), relativeScale: relativeScaleOf(shipped) * formScale };
    // #226: 44 champions share four generated blocky meshes, so the per-champion
    // LOOK is seeded from the championId here — the one place that can resolve
    // entity → champion. An imported champion wears its own art and gets none.
    const archetype = ARCHETYPE_BY_MODEL_KEY[e.key];
    if (!archetype) return base;
    return { ...(base ?? {}), voxel: voxelLookFor(championId, archetype) };
  };

  const championTintFor = (e: EntityViewState): ModelTint | null | undefined =>
    composeFormTint(championTintForId(bodyChampionIdFor(e)), formVisualFor(e));

  return {
    modelDocFor,
    voxelSkinFor,
    modelOverrideFor,
    bodyChampionIdFor,
    formVisualFor,
    championTintFor,
  };
}
