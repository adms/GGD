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
import { composeBodyVisual } from "@ggd/shared/content";
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
  /**
   * 變身外觀（顏色／大小／掛件）。
   *
   * ⭐ M1（GH#599）—— `key` 有**兩種**，而它們共用這一個查詢：變身態的
   * championId（`Emeu` 那一半 → `config.form-visuals@1.forms`）與**狀態 id**
   * （→ 同一份文件的 `statuses`）。`resolveFormVisual` 自己分辨，所以這條縫
   * ⛔ 不需要第二個 hook、⛔ ContentDb 也一個字都不用改。
   */
  formVisualFor(key: string | null): FormVisual | null;
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
  /**
   * ⭐ M1（GH#599）—— 這個座位身上**現在**掛著的狀態 id（`SeatState.statusIds`）。
   *
   * ⚠️ 它是**每一個座位都送**的：`net/snapshot.ts` 的座位迴圈跑 `ctl.seats` 全部，
   * 而 `MatchState.seats` 沒有任何 Colyseus filter ⇒ 客戶端手上已經有全場十二具
   * 身體的狀態清單（`RoomStore` 也早就逐座位收進 `SeatView.statusIds`）。
   * ⛔ 所以 M1 **不需要**新的線路欄位、不需要新的 ENTITY_FLAG bit、
   * 也不需要動 `apps/game-server/**`。
   *
   * OPTIONAL：缺席 = 一個狀態都沒有 ⇒ 這個模組逐位元退回 M1 之前的行為。
   * 理由和 `EntityViewState.isLocal` 一字不差 —— seat 表只有合成根（GameApp）
   * 拿得到，而 render/** 對 HUD store 是封閉的（client-08）。
   */
  statusIdsForSeat?(seatId: number | undefined): readonly string[];
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
  /**
   * 這具身體的變身外觀，或 null。
   *
   * ⭐ M1（GH#599）起它有**兩個來源**：形態（`Emeu` 那一半的 championId）與
   * **狀態**（`statusIdsForSeat`）。基本型 ＋ 身上沒有任何帶外觀的狀態 ⇒ null，
   * 也就是 M1 之前的全部行為。
   */
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

  /**
   * ⭐ M1（GH#599）—— 這具身體最後的變身外觀 = 形態那一份 **×** 狀態那幾份。
   *
   * 它是 M1 的**全部接線**：`formVisualFor` 已經是三個旋鈕的共同上游
   * （顏色 → `championTintFor`、大小 → `modelOverrideFor`、掛件 → GameApp 的
   * `formAttachmentFor`），所以狀態一旦餵進這一行，三樣**同時**活過來。
   * ⛔ 沒有第二處要改，也沒有第二份「哪一個旋鈕從哪裡來」的規則。
   *
   * 排序：多格狀態同時命中時掛件是「第一格贏」，而狀態在線路上的順序是施加順序
   * ⇒ 兩個客戶端可能不同。所以**命中超過一格才排序**（今天出貨 `statuses` 是空的，
   * 這一段每一幀的成本是一次長度檢查）。
   */
  const visualForSeatForm = (
    seatId: number | undefined,
    formIndex: number,
  ): FormVisual | null => {
    const fromForm = content.formVisualFor(idForSeatForm(seatId, formIndex));
    const ids = deps.statusIdsForSeat?.(seatId);
    if (!ids || ids.length === 0) return fromForm;
    let hits: { id: string; v: FormVisual }[] | null = null;
    for (const id of ids) {
      const v = content.formVisualFor(id);
      if (v) (hits ??= []).push({ id, v });
    }
    if (hits === null) return fromForm;
    if (hits.length > 1) hits.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return composeBodyVisual(
      fromForm,
      hits.map((h) => h.v),
    );
  };

  const formVisualFor = (e: EntityViewState): FormVisual | null =>
    visualForSeatForm(e.seatId, formIndexFromFlags(e.flags ?? 0));

  /**
   * ⭐ M3（GH#599）—— 這個座位**現在**該穿哪一具身體，或 null（＝穿 `e.key`）。
   *
   * ⚠️ 它和 `formVisualFor` 走的是**同一份**解析（`visualForSeatForm`），⛔ 不是
   * 第二條「哪一格贏」的規則 —— 顏色、大小、掛件、身體四樣一起從那一份出來，
   * 所以「多格狀態同時命中」的排序與「狀態取代形態」的取捨只有一個住處。
   *
   * ⚠️ 之所以吃 `(seatId, formIndex)` 而不是 `EntityViewState`：`modelDocFor` 是
   * registry 用 `(e.key, e.seatId, formIndex)` 三個純量呼叫的，它手上根本沒有
   * entity —— 那正是 #223 那個「箭頭函式把第三個引數靜靜吃掉」的介面。
   */
  const bodyModelKeyFor = (seatId: number | undefined, formIndex: number): string | null =>
    visualForSeatForm(seatId, formIndex)?.modelKey ?? null;

  const modelDocFor = (modelKey: string, seatId?: number, formIndex = 0): ModelDoc | null => {
    // ⭐ M3（GH#599）—— **狀態可以把整具身體換掉**（拳四郎大絕招變大型皮卡丘、
    // 妖狐 fox2→fox、皮卡→picacugy、傑富力士→herobiggon：量到的 4 對）。在這一行
    // 之前，換身體**只有**換一整份變身態 champion doc 做得到，於是 owner 2026-08-22
    // 要的「開啟變身態盡可能下架」對那 4 對結構性地不成立。
    //
    // ⚠️ 它餵的是 `resolveModelKey` 的**輸入**，⛔ 不是加一條 if：裝備造型表查不到
    // 這個新的 key ⇒ 原樣回傳 ⇒「變身贏過造型」是自然結果而不是第二條規則。
    // 而下面那行 `resolved !== modelKey` 的早退因此**同時**涵蓋兩種明寫的選擇
    // （造型替換與身體覆寫）—— 兩者都不該再讓 overlay 去 w3u 借一具。
    const overrideKey = bodyModelKeyFor(seatId, formIndex);
    const resolved = deps.resolveModelKey(overrideKey ?? modelKey, seatId);
    const doc = content.modelFor(resolved);
    if (resolved !== modelKey) return doc; // equipped skin / 身體覆寫 is an explicit choice
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
    const visual = formVisualFor(e);
    const formScale = formScaleMultiplier(visual);
    const base: ModelDocOverride | null =
      formScale === 1
        ? shipped
        : { ...(shipped ?? {}), relativeScale: relativeScaleOf(shipped) * formScale };
    // #226: 44 champions share four generated blocky meshes, so the per-champion
    // LOOK is seeded from the championId here — the one place that can resolve
    // entity → champion. An imported champion wears its own art and gets none.
    //
    // ⭐ M3（GH#599）—— 問的是**現在螢幕上那一具**的 modelKey，⛔ 不是 `e.key`。
    // `e.key` 是伺服器從座位選的英雄算出來的；狀態把身體換掉之後，方塊人外觀
    // （調色盤／臉／服裝）必須跟著**新的**那一具走 —— 否則會出現「身體換成了
    // 另一個 archetype，卻還戴著上一具的臉」，而那是**兩條算繪路只改一條**的
    // 標準症狀（⚠️ 今天在 EX 魔法陣那一題已經踩過同型：粒子等解鎖、模型從出生
    // 就掛著）。⛔ 這一行與 `modelDocFor` 那一行必須同進退。
    const archetype = ARCHETYPE_BY_MODEL_KEY[visual?.modelKey ?? e.key];
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
