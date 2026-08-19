/**
 * W3X ABILITY ART — abilities bound to the effect the ORIGINAL map really used.
 *
 * WHY THIS EXISTS. `fx.prim.*` (task #79) gives every ability a LEGIBLE look:
 * element in colour, shape in silhouette. That baseline stays — it covers all
 * 615 bound abilities and it is what makes 「哪招是哪招」 answerable at all.
 * What it cannot do is give a SIGNATURE cast its own identity: one holy nova
 * looks like every other holy nova. This table promotes the abilities where
 * the map's own art survives the import, so those casts read as themselves.
 *
 * PROVENANCE — every row is derived, never guessed. The source is
 * `tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json` (regenerate with
 * `python3 tools/w3x-import/build_vfx_bindings.py`), which joins the map's
 * `war3map.w3a` art fields, its `war3map.w3h` buff art and the literal model
 * strings in `war3map.j`. A row exists ONLY when the art reached the ability
 * through `w3a-override` (the author set the field himself), `w3h-override`
 * or `jass-literal` (the author named the model in a spawn call). Art that is
 * merely INHERITED from a Blizzard stock ability is never promoted — it is not
 * evidence of intent, and the model is not in this repo anyway.
 *
 * THE #230 SWEEP. `tools/w3x-import/build_vfx_census.py` re-ran this derivation
 * over EVERY champion × EVERY slot and found four ability rows that pass every
 * filter below and had simply been missed: 38-01 邪王炎殺劍 (both 飛影 docs, on
 * `flamessmoke`) and 12-002 仙氣發勁 (both 天地志狼 docs, on `supershinythingy`).
 * They are added; nothing else moved. The census also proves the table is not
 * merely incomplete but CORRECT about what it excludes — see `unrenderable` in
 * `content/assets/vfx/w3x-ability-provenance.json`.
 *
 * THE RENDERABILITY GATE — why only 34 of 668. Three filters, in order:
 *   1. the art must be a MAP-IMPORTED model (`IN_REPO_*`). 1305 of the 1529
 *      resolved art entries are retail Blizzard `.mdl` paths we cannot ship
 *      (#81/#116) — those abilities keep the primitive.
 *   2. the model must carry PRE2/RIBB emitters that shipped as content docs.
 *   3. EVERY emitter must be anchored to the MODEL ROOT. This is the filter
 *      that does the real work. `divinering` (20 emitters on `BlizParticle*`
 *      nodes) and `earthtornado2` / `lightningtornado` (13 of 14 on `evilbox*`
 *      spinner nodes) get their entire shape from the model's own animated
 *      node hierarchy. Replayed as world-position particle systems they would
 *      all fire from one point — a blob, not a ring or a tornado. Binding
 *      those would make legibility WORSE, so they stay on the primitive.
 *
 * ONE CAST = ONE EFFECT = SEVERAL EMITTERS. A WC3 effect is a SET of emitters
 * (`frostnova` is 4), but `vfxKey` resolves to exactly one doc. So the ability's
 * `vfxKey` carries the family's dominant emitter — which also drives the cast
 * pillar's tint — and `extraVfxDocIds()` carries the rest, which `VfxSystem`
 * fires alongside it. Cost is bounded: `frontLoadDoc` collapses each authored
 * continuous stream into ONE burst capped at `MAX_FRONT_LOAD_BURST`, so a
 * 6-emitter family costs about what 6 primitives cost, not its authored rate.
 *
 * GENERATION. Where the `fx.w3x.*` re-derivation (task #183) covers a family it
 * is preferred over the older `godie-*` pass — same emitters, more precisely
 * recovered parameters. Families it does not cover keep `godie-*`.
 *
 * This module is DATA + lookups. It imports nothing from `@babylonjs/*`, so it
 * stays importable from Node tests and the doc generator. It is not, however,
 * side-effect free any more: `setFamilyTuning` MINTS the console's tuned family
 * docs into `VfxDefs` (see THE TUNING SEAM below) — that write is the whole
 * reason a family knob does anything at all.
 */
import { VfxDefs, type ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import type { VfxGroundDecal } from "@ggd/shared/content/schema/vfx";
import { abilityVfxKeys } from "./bindings";
import { abilityArtRows, onAbilityArtBindingsChanged } from "./abilityArtContent";
import {
  bakedFamilyKeys,
  nearestBakedFamilyKey,
  requiredFamilyDocs,
  resolveFamilyArt,
  type ResolvedFamilyArt,
} from "./familyTuning";
// GH#439 —— 家族原型自己宣告的原作模型（`models`），就是 stock emitter 的來源。
import { W3X_ART_FAMILIES, type W3xArtFamily } from "./w3xArtFamilies";

/** One ability's promoted w3x effect. */
export interface W3xAbilityArt {
  /** the w3x model stem the effect came from, e.g. "frostnova" */
  readonly family: string;
  /** the map's own ability rawcode this art was read off */
  readonly w3aId: string;
  /** how the art reached the ability (see PROVENANCE above) */
  readonly provenance: "w3a-override" | "w3h-override" | "jass-literal";
  /** which channel carried it — w3a art slot, buff record, or a JASS call */
  readonly via: string;
  /** dominant emitter — this is the ability's `vfxKey` */
  readonly primary: string;
  /** the family's remaining emitters, fired alongside the primary */
  readonly extra: readonly string[];
  /**
   * #205 —— the console's PER-ABILITY art overrides for this cast, if any.
   *
   * ⚠️ This interface is the ONLY channel between the family layer and the
   * renderer, and until now it had no slot for these: `familyRow()` built a
   * `W3xAbilityArt` out of a `ResolvedFamilyArt` and every field the interface
   * did not declare **evaporated on that line**. That is why
   * `config.vfx-families@1.abilities.<id>.alpha` / `.timeScale` were dead knobs
   * — validated by the console, stored in the overlay, read by nobody.
   *
   * Absent on every `w3xAbilityArtRows()` row (the 34 promotions) and on
   * any family row the operator has not touched, and an absent value plays the
   * doc UNCHANGED (`applyVfxOverrides` returns the same object), so shipped
   * content is bit-identical to before.
   */
  readonly alpha?: number;
  readonly timeScale?: number;
  /**
   * #251 —— 這一招要播在離地多高（世界單位），家族原型的基準高度疊上原圖
   * `SetUnitFlyHeight` 之後的結果。
   *
   * ⚠️ 這一行以前不存在，所以 `resolveFamilyArt()` 算好的 `heightY` 在
   * `familyRow()` 那一行**蒸發** —— 和上面 α / 時間倍率同一個形狀的第②號故障，
   * 只是空間那兩格（`heightY` / `anchor`）當時還沒修。實測（2026-08-01，
   * 91 支 `shockwaveRing` → 105 個 emitter）世界 Y 的直方圖是單獨一格 `{1.0}`，
   * 而 config 要的是 0.15：**貼地的環全部浮在胸口**。
   *
   * `w3xAbilityArtRows()` 那 34 支晉升沒有這一格（它們沒有家族原型，也就沒有
   * 「應該多高」這個答案），`familyCastHeightY` 對 absent 一律回平面高度。
   *
   * `anchor` 仍然是死的 —— 見 `DEAD_FAMILY_KNOBS`。
   */
  readonly heightY?: number;
  /**
   * GH#439 —— 這一招在地上留下哪一種痕跡，或 undefined。
   *
   * ⚠️ 量到的缺口：`VfxSystem` 對**每一顆** `abilityCast` 都蓋一張 decal，而
   * `castScorchSpec()` 不分技能回同一張焦痕 —— 91 支地面衝擊波和其餘 570 支的
   * 印子逐位元組相同，「地面震裂」在畫面上因此不存在。
   *
   * ABSENT 的兩種來源都走出貨焦痕（＝這一版之前一位元不差的行為）：
   * ①`w3xAbilityArtRows()` 那 34 支晉升（沒有家族原型，也就沒有「這一族留什麼
   * 痕跡」這個答案）②操作者沒碰過那個家族。
   */
  readonly groundDecal?: VfxGroundDecal;
  /**
   * GH#392 —— 這一招的特效**掛在施法者模型的哪一個掛點**（WC3 的
   * `Art - Target Attachment Point`：`chest` / `hand,left` / `weapon` / …），
   * 或 undefined ＝ 播在世界座標（＝這一版之前每一支技能的行為）。
   *
   * ⚠️ 量到的缺口（2026-08-20）：`resolveFamilyArt()` 從 2026-07-30 起就解得出
   * 這一格 —— **出貨的 62 支家族列每一支都有** —— 而它在 `familyRow()` 那一行
   * 蒸發，於是後台的「掛點」欄位是一格存得起來、驗得過、下游沒有人讀的死旋鈕。
   * 這是 α / 時間倍率（#205）、`heightY`（#251）、`groundDecal`（GH#439）
   * **第四次**同一個第②號故障。
   *
   * ⭐ 掛上去之後 (a) 附著 (b) **每幀跟著骨骼走** (c) 特效自己的 KP2E/KP2V
   * 動畫軌照播 —— 三件事都是 `W3xEmitterRig` 早就做完的（`em.mesh.parent =
   * anchor`＋`sampleTrack`），⛔ 這裡沒有新增第二條附著實作。缺的一直只是
   * 「戰鬥路徑從來沒有把**節點**交給它」：`W3xCastFx.play()` 一律
   * `atPosition(x,y,z)`，所以骨骼附著只在兩個試聽頁活著（失敗形態③）。
   */
  readonly anchor?: string;
}

/**
 * 晉升表 —— **資料在 `content/config/vfx-ability-art.json` 的
 * `bindings.<id>.promoted`**（GH#384），這裡只做讀取。
 *
 * ⚠️ 這 34 列是**人挑的**（可渲染性閘的三道過濾，見上面），沒有上游可以重新推導 ——
 * 所以 `content/` 就是它們的家，⛔ 不是一份「產生器的快取」。搬家前的逐列註記
 * （每一支為什麼被晉升、`extra` 為什麼是那幾個 emitter）另存在
 * `docs/legacy/_vfx-ability-art-authoring-notes.md`。
 */
export function w3xAbilityArtRows(): Readonly<Record<string, W3xAbilityArt>> {
  if (promotedCache) return promotedCache;
  const out: Record<string, W3xAbilityArt> = {};
  for (const [abilityId, row] of Object.entries(abilityArtRows())) {
    const p = row.promoted;
    if (!p) continue;
    out[abilityId] = {
      family: p.family,
      w3aId: p.w3aId,
      provenance: p.provenance,
      via: p.via,
      primary: p.primary,
      extra: p.extra,
    };
  }
  promotedCache = out;
  return out;
}

let promotedCache: Readonly<Record<string, W3xAbilityArt>> | null = null;

/**
 * THE SECOND SOURCE — evidence-bound FAMILY PROTOTYPES (`w3xFamilyArt.ts`).
 *
 * `w3xAbilityArtRows()` above can only promote an ability whose art SHIPPED as
 * emitter docs, which is 34 of 668. The other proven abilities point at
 * Blizzard stock models this repo does not have, so they get the family
 * PROTOTYPE the owner asked for — the same shape, rescaled/recoloured with the
 * map's own per-call-site numbers — instead of a shape guessed from their name.
 *
 * It is folded in HERE, inside `w3xArtFor`, and that is the whole integration:
 * `VfxSystem.playCastVfx` already routes anything `w3xArtFor` claims through
 * the rig (rung 1) → pooled docs (rung 2) → the `fx.prim.*` fallback (rung 3) →
 * a spark (rung 4). A family row needs none of those rungs changed. If this
 * function stopped answering, 258 casts would silently drop back to their name
 * classification — which is why `familyArtIntegration.test.ts` asserts against
 * `w3xArtFor` itself rather than against the table.
 *
 * The family row carries NO `extra`: a prototype is one emitter by
 * construction, unlike a real WC3 effect which is a set.
 */
/**
 * GH#439 —— 一個家族原型的**原作 emitter** 文件 id。
 *
 * 每個原型早就宣告了它的證據模型（`W3X_ART_FAMILIES[f].models`，例如
 * `shockwaveRing` = `["warstompcaster", "thunderclapcaster"]`）。
 * `tools/w3x-import/extract_stock_vfx.py` 把那些**零售 MPQ**模型的 PRE2 參數
 * 抽成 `fx.w3x.stock.<模型>.p<NN>` 文件（純數字 + CC0 替代貼圖，⛔ 沒有一個
 * Blizzard 位元組），這裡就是把兩邊接起來的那一條**規則**。
 *
 * ⭐ 它是規則不是表：**21 個家族共用同一句話**「這一族播它自己宣告的原作
 * 模型的 emitter」。⛔ 沒有一張逐 id 或逐家族的白名單，所以哪一天抽取器
 * （`--min-refs`）多收一個模型，那一族自動拿到它的原作藝術，⛔ 不必改程式。
 *
 * ⚠️ 這裡**不查內容庫**（這個模組是純資料，不能讀 `ContentDb`），所以它產出
 * 的是**候選** id。真正播放的 `VfxSystem.playCastVfx` 對每一個 id 做
 * `this.doc(id)`，查不到就跳過 —— 也就是說沒被抽取的模型逐位元不影響行為。
 * 上界 3 = 目前任何一個原作模型抽出來的最多 emitter 數（stampedemissiledeath）；
 * 抽取器印出的 doc 數超過它時，多的那幾個不會被播 —— ⛔ 這是刻意的上界，
 * 不是「剛好夠」：一次施法多幾十個粒子系統是 `emitterBudget` 在擋的東西。
 */
const MAX_STOCK_EMITTERS_PER_MODEL = 3;

function stockEmitterIds(family: W3xArtFamily): readonly string[] {
  const cached = stockIdCache.get(family);
  if (cached) return cached;
  const out: string[] = [];
  for (const model of W3X_ART_FAMILIES[family]?.models ?? []) {
    for (let i = 0; i < MAX_STOCK_EMITTERS_PER_MODEL; i++) {
      out.push(`fx.w3x.stock.${model}.p${String(i).padStart(2, "0")}`);
    }
  }
  stockIdCache.set(family, out);
  return out;
}
const stockIdCache = new Map<string, readonly string[]>();

let familyRowCache: Map<string, W3xAbilityArt> | null = null;

// ⭐ 內容換了就兩個快取一起作廢。⛔ 只清一個 = 晉升表換了而家族列還是舊的，
// 而那種漂移在畫面上看起來完全正常（失敗形態⑤）。
onAbilityArtBindingsChanged(() => {
  promotedCache = null;
  familyRowCache = null;
});

function familyRow(abilityId: string): W3xAbilityArt | undefined {
  familyRowCache ??= new Map();
  const hit = familyRowCache.get(abilityId);
  if (hit) return hit;
  const resolved = resolveFamilyArt(abilityId, activeFamilyTuning);
  if (!resolved) return undefined;
  const row: W3xAbilityArt = {
    family: resolved.family,
    w3aId: resolved.evidence?.w3aId ?? "",
    provenance: familyProvenance(resolved.evidence?.provenance),
    via: resolved.evidence ? `family:${resolved.evidence.via}` : "family:console",
    primary: playableFamilyKey(resolved),
    // GH#439 —— 這一族宣告的原作模型的 emitter。⚠️ 這一行以前是 `extra: []`，
    // 註解寫著「a prototype is one emitter by construction」—— 那句話對**原型**
    // 是真的，但它讓 66 支動地跺永遠拿不到 `WarStompCaster` 本人的脈衝，
    // 而那顆模型是全 repo 引用第一名（150 個引用點）。
    extra: stockEmitterIds(resolved.family),
    // #205 —— 這兩行以前不存在,所以 `resolveFamilyArt` 算好的 per-ability
    // α / 時間倍率在這一行蒸發。ABSENT ≠ 1:沒設就不寫,下游走 identity。
    ...(resolved.alpha !== undefined ? { alpha: resolved.alpha } : {}),
    ...(resolved.timeScale !== undefined ? { timeScale: resolved.timeScale } : {}),
    // #251 —— 空間那一格。同一行、同一個第②號故障:少了它,`resolveFamilyArt`
    // 每一支都算出來的 `heightY` 在這裡蒸發,91 支貼地的衝擊波環全部浮在
    // y=1.0。**要不要採用**是 `familyCastHeightY` 讀 config 決定的,不是這裡。
    heightY: resolved.heightY,
    // GH#439 —— 地面痕跡那一格。少了它,`resolveFamilyArt` 讀出來的 `groundDecal`
    // 會在這一行蒸發 —— 和 α / 時間倍率 / heightY **同一個**第②號故障。
    ...(resolved.groundDecal !== undefined ? { groundDecal: resolved.groundDecal } : {}),
    // GH#392 —— 掛點那一格。同一行、**第四次**同一個第②號故障：少了它，
    // `resolveFamilyArt` 對 62 支解出來的 `anchor`（原圖自己的
    // `Casterattach*`／後台覆寫）在這裡蒸發，於是那 62 支的特效永遠播在
    // 腳底的世界座標，⛔ 不會跟著胸口／手／武器動。
    ...(resolved.anchor !== undefined ? { anchor: resolved.anchor } : {}),
  };
  familyRowCache.set(abilityId, row);
  return row;
}

/**
 * `W3xAbilityArt.provenance` predates this layer and names only the three
 * AUTHOR-SET channels. The family layer also carries `jass-spawn` and
 * `stock-inherited`, which have no slot in that union, so they are narrowed to
 * their nearest sibling here — `jass-spawn` → `jass-literal` (both ARE JASS
 * call sites), `stock-inherited` → `jass-literal` only because the union offers
 * nothing weaker.
 *
 * ⚠️ That narrowing LOSES information, so nothing may report provenance off
 * this field. The unnarrowed truth is `w3xFamilyArtRows()[id].provenance` and that
 * is what `w3xFamilyArt.test.ts` and any report must read. This function exists
 * solely so the old struct still type-checks.
 */
function familyProvenance(p: string | undefined): W3xAbilityArt["provenance"] {
  return p === "w3a-override" ? "w3a-override" : p === "w3h-override" ? "w3h-override" : "jass-literal";
}

// ---------------------------------------------------------------------------
// THE TUNING SEAM — why a family knob used to DELETE the effect
// ---------------------------------------------------------------------------
/**
 * ⚠️ REPRODUCED, then fixed (GH#230 L2).
 *
 * `fx.fam.*` docs are pre-baked FILES whose id encodes (family, colour,
 * quantised scale). The runtime resolves a KEY and hands it to
 * `ContentDb.vfxFor`. So every console knob that MOVES the key —
 * `families.*.scale`, `families.*.element`, per-ability `tint` / `w3xScale` —
 * used to compute a key with no file behind it:
 *
 *     vfxFor(key) = null → `playCastVfx`'s doc set is empty → rung 1 refuses
 *     (`docs.length === 0`) → rung 3 → the generic `fx.prim.*` stand-in.
 *
 * MEASURED: nudging `families.shockwaveRing.scale` 1 → 1.3 makes ALL 91
 * shockwave-ring keys miss the 78 baked files. The operator asks for a slightly
 * bigger ring and the family art of 91 abilities disappears.
 *
 * TWO LAYERS FIX IT, in this order:
 *
 *  A. MINT (`mintTunedFamilyDocs`, below). The tuned doc is BUILT — by the same
 *     `buildFamilyDocTuned` the generator uses — and registered into `VfxDefs`,
 *     which is exactly the map `ContentDb.vfxFor` reads. The knob then really
 *     applies at runtime instead of depending on someone re-running the
 *     generator, and that includes the knobs which do NOT move the key at all
 *     (`alpha` / `timeScale` / `primitive`), which were previously inert.
 *
 *  B. SNAP (`playableFamilyKey`, below). When the registry cannot answer — the
 *     degraded `ContentDb.loadByFetch` path, or any caller that reads art before
 *     content boot — fall back to the nearest BAKED doc of the SAME FAMILY and
 *     say so in the console. The effect is then "not tuned yet", never "gone".
 *
 * ⛔ What must NEVER be done here is to hide or clamp the knob. The owner asked
 * for 「用編輯器的方式彈性調整複用」; a knob that silently refuses to move is the
 * same betrayal as one that deletes the art.
 */

/** The console's live tuning doc, installed by the composition root. */
let activeFamilyTuning: ConfigVfxFamiliesDoc | null = null;

/** keys we have already complained about, so a cast does not spam the console */
const snapWarned = new Set<string>();

/**
 * Does the live registry actually carry the family docs?
 *
 * This is the discriminator between the two content paths, and it has to be a
 * PROBE rather than a flag: `ContentDb.load()` either registered the whole
 * content tree into `VfxDefs` (`fromRegistries`) or fell back to
 * `loadByFetch`, which fills a private map `VfxDefs` never sees. Minting into a
 * registry nothing reads would look like a fix and change nothing on screen
 * (failure ②), so when the probe says no we do not mint — we snap instead, and
 * a snapped key is a BAKED key, which is the one thing that path can serve.
 */
function registryCarriesFamilyDocs(): boolean {
  for (const k of bakedFamilyKeys()) return VfxDefs.tryGet(k) !== undefined;
  return false;
}

/**
 * Build + register every doc the current tuning asks for. Returns how many were
 * actually written (0 when nothing moved), which the guards read.
 *
 * A doc identical to the one already registered is skipped so the shipped
 * config — which `generateFamilyContent.ts` derives from the very same
 * constants — costs nothing and cannot shadow the bytes on disk with a
 * different object.
 */
export function mintTunedFamilyDocs(doc: ConfigVfxFamiliesDoc | null): number {
  // No console doc = shipped defaults = the files on disk are already right.
  if (!doc) return 0;
  if (!registryCarriesFamilyDocs()) return 0;
  let minted = 0;
  for (const [id, built] of requiredFamilyDocs(doc)) {
    const current = VfxDefs.tryGet(id);
    if (current && JSON.stringify(current) === JSON.stringify(built)) continue;
    VfxDefs.register(built);
    minted += 1;
  }
  return minted;
}

/**
 * The key this row may actually PLAY — the tuned one when something can serve
 * it, else the nearest baked doc of the same family.
 *
 * Returning the tuned key when neither can be verified is deliberate: with an
 * empty registry there is no information, and `VfxSystem`'s rung 3 still has
 * the ability's `fx.prim.*` under it.
 */
function playableFamilyKey(r: ResolvedFamilyArt): string {
  const tuned = r.vfxKey;
  const live = registryCarriesFamilyDocs();
  if (live && VfxDefs.tryGet(tuned)) return tuned;
  const baked = nearestBakedFamilyKey(r.family, r.colour, r.docScale);
  if (!baked || baked === tuned) return tuned;
  if (live && !VfxDefs.tryGet(baked)) return tuned;
  if (!snapWarned.has(tuned)) {
    snapWarned.add(tuned);
    console.warn(
      `[vfx-families] 「${tuned}」沒有對應的預烘特效文件，這次先退回同家族的「${baked}」——` +
        `特效不會消失，但這組調整要重新產生 doc 才會真的變大/變色：` +
        `pnpm exec tsx apps/client/src/render/vfx/generateFamilyContent.ts && pnpm content:build`,
    );
  }
  return baked;
}

/**
 * Install (or clear) the `config.vfx-families@1` overrides. Clears the memo, so
 * an admin save takes effect on the next cast without a reload — and mints the
 * docs that save now needs (layer A above; without it the save would delete the
 * art of every ability whose key moved).
 */
export function setFamilyTuning(doc: ConfigVfxFamiliesDoc | null): void {
  activeFamilyTuning = doc;
  familyRowCache = null;
  snapWarned.clear();
  mintTunedFamilyDocs(doc);
}

/** The promoted effect for an ability, or undefined when it keeps its primitive. */
export function w3xArtFor(abilityId: string | undefined): W3xAbilityArt | undefined {
  if (!abilityId) return undefined;
  return w3xAbilityArtRows()[abilityId] ?? familyRow(abilityId);
}

/**
 * GH#391 —— 這一支技能自己的**方位覆寫**(`config.vfx-families@1.abilities.<id>`
 * 的 `pitchDeg` / `facingDeg`)。沒有覆寫時 `undefined`,呼叫端因此走一位元不差的
 * 舊路徑。
 *
 * ⚠️ 這兩格在 2026-08-19 之前是**死旋鈕**,而且死得比 `alpha`/`timeScale` 當年更
 * 隱蔽:後台 `vfxForge.ts` 有欄位、有上下界、有標籤、有說明、有 `configFromForm`
 * 的往返,Zod 收得下,存檔會成功 —— 而 `playCastVfx` 的 `tune()` 只讀 `alpha` 與
 * `timeScale`,所以操作者填的仰角**從來沒有離開過那份 JSON**。第一·五守則點名的
 * 「說了但不會發生」,每一個零件都是對的,只有它們的組合是空的。
 *
 * ⭐ 這裡刻意**不**綁 `w3xArtFor`:一支沒有被晉升、沒有家族列的技能(41 支揮砍裡
 * 有 16 支是這樣)照樣要拿得到自己的仰角。方位是**這一次施法**的性質,不是
 * 「有沒有原作藝術」的性質 —— 綁在一起的話,覆寫就會在最需要它的那一半技能上
 * 靜靜地失效。
 */
export function abilityOrientOverrideFor(
  abilityId: string | undefined,
): { readonly pitchDeg?: number; readonly facingDeg?: number } | undefined {
  if (!abilityId) return undefined;
  const row = activeFamilyTuning?.abilities?.[abilityId];
  if (!row) return undefined;
  const { pitchDeg, facingDeg } = row;
  if (pitchDeg === undefined && facingDeg === undefined) return undefined;
  return {
    ...(pitchDeg !== undefined ? { pitchDeg } : {}),
    ...(facingDeg !== undefined ? { facingDeg } : {}),
  };
}

/**
 * The family's NON-primary emitter docs for an ability. The primary already
 * plays through `vfxKey`, so firing these completes the original effect
 * instead of showing 1-of-N of it. Empty for single-emitter families.
 */
export function extraVfxDocIds(abilityId: string | undefined): readonly string[] {
  return w3xArtFor(abilityId)?.extra ?? [];
}

/** memoized `abilityVfxKeys()` — the roster classification, built once */
let primitiveKeys: Record<string, string> | null = null;

/**
 * THE PRIMITIVE THIS ROW OVERRODE — the fallback when the promoted art cannot
 * be played.
 *
 * A promoted ability's content `vfxKey` names the w3x doc, so if that doc does
 * not resolve (content not rebuilt, an older `contentVersion` still served, the
 * doc withdrawn) the ability has NOTHING left to draw. That silent no-op is the
 * exact failure this whole batch exists to remove, so the baseline
 * classification in `./bindings` — the `fx.prim.<element>.<shape>` key the row
 * overrode — is recovered here and played instead.
 *
 * Returns undefined for the 17 OFF-ROSTER rows (duplicate hero numbers outside
 * `data/curation/whitelist.json`). They have no `bindings` row because they
 * were never classified — and they are also not castable in a match, since a
 * champion outside the whitelist cannot be picked. Callers still owe those a
 * visible cue; `VfxSystem` degrades them to a hit spark rather than to silence.
 */
export function primitiveFallbackFor(abilityId: string | undefined): string | undefined {
  // A FAMILY row needs this rung at least as much as a promoted row: its
  // `fx.fam.*` doc is generated content, so a stale `contentVersion` or a
  // missed `pnpm content:build` leaves it unresolvable — and 258 silent casts
  // is a far bigger hole than 34. Same `bindings` classification, same rung 3.
  if (!abilityId || !w3xArtFor(abilityId)) return undefined;
  primitiveKeys ??= abilityVfxKeys();
  return primitiveKeys[abilityId];
}
