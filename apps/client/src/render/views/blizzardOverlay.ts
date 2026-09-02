/**
 * blizzardOverlay — champion model fallback, gated on the full-asset flag.
 *
 * The original Warcraft III unit models are extracted from the developer's own
 * MPQ archives into the git-ignored runtime store `data/blizzard-overlay/`,
 * which lives OUTSIDE the deployable `content/` tree. It is served under the
 * stable URL prefix `/content/assets/blizzard-local/` by:
 *   • dev: the vite middleware `serveBlizzardOverlay()` (apps/client/vite.config.ts)
 *     / the dev nginx include (nginx/dev/blizzard-overlay.conf);
 *   • family deploy: nginx/tier/family/10-blizzard-overlay.server.conf, mounted
 *     only by docker/compose.family.yaml (task #177).
 *
 * WHETHER THIS MODULE FETCHES is decided by `fullAssetsEnabled()` (see below),
 * NOT by the build mode. It defaults to `import.meta.env.DEV`, so a plain
 * `vite build` still resolves to exactly what it resolved to before the overlay
 * existed and never issues the manifest request; a family build sets
 * VITE_GGD_FULL_ASSETS=1 and DOES fetch, and the deployed URLs serve 200.
 *
 * WHAT IT DOES
 * ------------
 * Most `godie-*` champions ship with no model of their own: their `modelKey`
 * points at one of the four generic KayKit stand-ins under
 * `assets/models/champions/` (mage / rogue / barbarian / knight), shared by
 * dozens of champions. For those — and only those — this resolver substitutes
 * the champion's real WC3 unit model from the overlay manifest
 * (`assets/blizzard-local/MANIFEST.json`, unitId → { champId, glb, clips, … };
 * the same manifest task #27's voice fallback reads for `clips.what`).
 *
 * DEGRADATION CONTRACT (unchanged behavior when the overlay is absent)
 * -------------------------------------------------------------------
 *   • probe disabled (fullAssetsEnabled() false) → the shipped doc, no fetch;
 *   • probe in flight, champion has no dedicated model → `null`, i.e. "not yet"
 *     — ChampionView keeps its procedural voxel figure and retries next frame
 *     (exactly what it does before ContentDb resolves), so a slow overlay can
 *     never make a champion pop from stand-in → WC3 model mid-match;
 *   • probe settled with no overlay (404 / bad JSON / no entry) → the shipped
 *     doc, i.e. today's stand-in;
 *   • champion HAS a dedicated shipped model → that model, always. The overlay
 *     never overrides authored content.
 *
 * 變身 FORMS RESOLVE BY W3U MODEL PATH, NOT BY THEIR OWN RAWCODE (task #249)
 * -------------------------------------------------------------------------
 * See `SHARED_MODEL_FORM_PAIRS` below.
 */
import type { ModelDoc } from "@ggd/shared/content";
import { BLIZZARD_LOCAL_GLB_PREFIX } from "./glbFacing";
import { fullAssetsEnabled } from "../../config/fullAssets";
import { ANIM_STATES } from "@ggd/shared/content/animPulse";

/** Manifest path relative to the content mount (same doc as championVoice). */
export const BLIZZARD_OVERLAY_MANIFEST_PATH = "assets/blizzard-local/MANIFEST.json";

/** Content mount the overlay is served under in dev. */
export const CONTENT_BASE = "/content/";

/**
 * glbPath prefix of the four generic KayKit stand-in characters
 * (mage/rogue/barbarian/knight). A champion pointed at one of these has no
 * model of its own — that is the ONLY case the overlay fills in.
 */
export const STOCK_CHAMPION_GLB_PREFIX = "assets/models/champions/";

/**
 * Doc `scale` for a synthesized overlay model.
 *
 * CORRECTED (task #61 audit). This constant used to be justified by "the
 * exporter already normalized every overlay glb to ~1.7 world units, so no
 * extra scaling" — that premise is FALSE. Measuring all 40 extracted glbs:
 * 28 land on exactly 1.700u, but 12 escaped the exporter's hero-height guard
 * (`10 < rawHeight < 500` in tools/w3x-import/w3xlib/models.py) and were baked
 * at the flat 1/36 prop factor instead — N00B (小叮噹's blue panda) measures
 * 6.672u, E00S 15.64u, H02S/H02Z 21.83u.
 *
 * The value stays 1 because it is no longer load-bearing: `ChampionView`
 * height-normalizes every adopted glb at load (#150 TARGET_HEIGHT) and only
 * falls back to `doc.scale` for a glb too degenerate to measure, and
 * ChampionView is the ONLY consumer of an overlay doc (GameApp.modelDocFor is
 * the single call site; the champ-select / store previews never see one). So 1
 * is the correct "unmeasurable degenerate" fallback — but it must NOT be read
 * as an assertion that the files are pre-normalized. Any future consumer that
 * uses `doc.scale` as an absolute has to measure, exactly as ChampionView does.
 */
export const OVERLAY_MODEL_SCALE = 1;

/** Matches the shipped champion docs; only the sim would use it. */
export const OVERLAY_COLLISION_RADIUS = 0.6;

/** WC3 default clip names — used when a manifest entry carries no clipMap. */
export const DEFAULT_W3X_CLIP_MAP: ModelDoc["clipMap"] = {
  idle: "Stand",
  run: "Walk",
  attack: "Attack",
  cast: "Spell",
  hurt: "Stand",
  death: "Death",
};

/** One extracted unit, as the merged MANIFEST.json describes it. */
export interface BlizzardOverlayUnit {
  unitId: string;
  champId: string;
  /** content-relative path, e.g. "assets/blizzard-local/models/E00R.glb" */
  glb: string;
  clipMap: ModelDoc["clipMap"];
}

/** champId → unit. Empty map = manifest present but useless (still "settled"). */
export type BlizzardOverlayIndex = ReadonlyMap<string, BlizzardOverlayUnit>;

/** One 變身 pair the source map gives ONE model, with the evidence attached. */
export interface SharedModelFormPair {
  /** Champion id of the NORMAL form (`Eme1`). */
  readonly baseId: string;
  /** Champion id of the ALTERNATE form (`Emeu`). */
  readonly alternateId: string;
  /**
   * The `umdl` BOTH halves resolve to, exactly as `war3map.w3u` writes it.
   * `null` = neither half overrides `umdl`, so both inherit whatever model
   * `w3uBaseUnit` carries in the stock SLK (ORKN/O030's case).
   */
  readonly w3uModel: string | null;
  /** Tail of the w3u `baseChain` — the stock unit both forms inherit from. */
  readonly w3uBaseUnit: string;
}

/**
 * THE 變身 RESOLUTION FIX (task #249).
 *
 * THE BUG. `unitFor`/`resolve` looked a champion up in the manifest by its OWN
 * id and gave up on a miss. The extractor keyed the manifest on the units it
 * pulled from the MPQs — the 40 PICKABLE heroes — so every 變身 body missed and
 * fell through to the shared voxel stand-in, and the earlier diagnosis ("those
 * four have no Blizzard model") was simply that miss misread. Resolving the
 * w3u base-unit chain shows the opposite: the map gives H00W the SAME
 * `units\human\HeroPaladin\HeroPaladin.mdl` as HARF, N01B the same
 * EarthPandarenBrewmaster as NMAN, E010 the same AncientProtector as E00S, and
 * O030 no `umdl` at all — it inherits ORKN's. The owner states the rule the
 * data confirms: 「基本上變身前後都是同一模型,但是附帶不同球體效果及 3D model
 * 顏色、大小、能力屬性變化而已」.
 *
 * THE FIX IS A RESOLUTION STRATEGY, NOT A FILE COPY. Nothing is written under
 * `data/blizzard-overlay/` (git-ignored runtime state, and copying would double
 * 84MB); the alternate simply resolves to the very same `glb` STRING its
 * counterpart resolves to. `overlaySharesCounterpartGlb` in the test asserts
 * exactly that identity, which is what makes the copy impossible to smuggle in.
 *
 * WHY AN EXPLICIT PAIR TABLE AND NOT "just follow `counterpartFormId`".
 * 6 of the map's 26 transform pairs give the two halves DIFFERENT models —
 * UCRL(HighElfPeasant)→U034(HeroBigGon), UMAL(VillagerMan1)→U00L(HeroPikachu),
 * U012→U011(collision.mdl, a geometry-less dummy), OFAR→O02L, OGRH→O00X,
 * NSJS→N00P. A blanket counterpart fallback would dress 傑·富力士's second form
 * in a High Elf Peasant. So the table lists ONLY the 20 pairs whose w3u model
 * path is identical, and it fails CLOSED: a pair that is not here never
 * inherits, it degrades to the stand-in.
 *
 * WHY IT IS A CONST AND NOT A 後台 KNOB (CLAUDE.md 第一守則 wants a reason).
 * These are not tunables — they are facts recovered from a frozen source map,
 * the same category as `CHAMPION_FORM_PAIRS` itself, which also ships as a
 * const. There is no operator decision to make: 「H00W's model path equals
 * HARF's」 is true or false, and only a re-import of `src_gogodieEX227s.w3x`
 * could change it. `blizzardOverlayForms.test.ts` therefore
 * re-derives this whole table from the tracked fixture
 * `tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json` and fails on any drift,
 * rather than trusting the list a human typed.
 *
 * Coverage comments record which half the manifest actually carries TODAY
 * (B = base, A = alternate); the other 16 pairs are inert until an extraction
 * covers one of their halves, which is the point of listing them.
 */
export const SHARED_MODEL_FORM_PAIRS: readonly SharedModelFormPair[] = [
  // 04: coverage --
  { baseId: "godie-hjai", alternateId: "godie-h020", w3uModel: "LinaInvers.mdl", w3uBaseUnit: "Hjai" },
  // 08: coverage --
  { baseId: "godie-nbbc", alternateId: "godie-n01c", w3uModel: "SD2.mdl", w3uBaseUnit: "Nbbc" },
  // 11: coverage --
  {
    baseId: "godie-udre",
    alternateId: "godie-u01u",
    w3uModel: "HeroMusashiMiyamoto.mdl",
    w3uBaseUnit: "Udre",
  },
  // 12: coverage --
  {
    baseId: "godie-ewar",
    alternateId: "godie-e007",
    w3uModel: "HeroLingTong.mdl",
    w3uBaseUnit: "Ewar",
  },
  // 19: coverage --
  {
    baseId: "godie-e00k",
    alternateId: "godie-e00z",
    w3uModel: "HeroKunoichi.mdl",
    w3uBaseUnit: "Ewrd",
  },
  // 20: coverage --
  { baseId: "godie-e002", alternateId: "godie-e00l", w3uModel: "HeroSaber.mdl", w3uBaseUnit: "Ewrd" },
  // 22: coverage --
  {
    baseId: "godie-e001",
    alternateId: "godie-e00n",
    w3uModel: "RenaRyugu2.mdl",
    w3uBaseUnit: "Ewrd",
  },
  // 26 豪洨天王 - 鄭先生: coverage B- — the pair this task was filed for
  {
    baseId: "godie-harf",
    alternateId: "godie-h00w",
    w3uModel: "units\\human\\HeroPaladin\\HeroPaladin.mdl",
    w3uBaseUnit: "Harf",
  },
  // 30 電車癡漢 - 臭作: coverage B- — neither half overrides `umdl`
  { baseId: "godie-orkn", alternateId: "godie-o030", w3uModel: null, w3uBaseUnit: "Orkn" },
  // 38: coverage --
  { baseId: "godie-uvng", alternateId: "godie-u010", w3uModel: "HeroHehi.mdl", w3uBaseUnit: "Uvng" },
  // 40 地獄歌神 - 憤怒的胖虎: coverage B-
  {
    baseId: "godie-nman",
    alternateId: "godie-n01b",
    w3uModel: "Units\\Creeps\\EarthPandarenBrewmaster\\EarthPandarenBrewmaster.mdl",
    w3uBaseUnit: "Nman",
  },
  // 42: coverage --
  { baseId: "godie-n003", alternateId: "godie-n01g", w3uModel: "Long.mdl", w3uBaseUnit: "Nbrn" },
  // 70 白木老樹精 - 白木卡迪那: coverage B-
  {
    baseId: "godie-e00s",
    alternateId: "godie-e010",
    w3uModel: "buildings\\nightelf\\AncientProtector\\AncientProtector.mdl",
    w3uBaseUnit: "Ecen",
  },
  // 76: coverage --
  { baseId: "godie-u00n", alternateId: "godie-u00o", w3uModel: "Luffe.mdl", w3uBaseUnit: "Udre" },
  // 77: coverage --
  { baseId: "godie-e00w", alternateId: "godie-e00x", w3uModel: "mfls.mdl", w3uBaseUnit: "Ewar" },
  // 79: coverage --
  { baseId: "godie-h01n", alternateId: "godie-h01o", w3uModel: "HeroIchigo.mdl", w3uBaseUnit: "Hmkg" },
  // 81: coverage --
  { baseId: "godie-o01z", alternateId: "godie-o02v", w3uModel: "niya.mdl", w3uBaseUnit: "Oshd" },
  // 87 曹操孟德 - 阿瞞大人: coverage -A — the ONE pair that inherits UPWARDS
  // (the manifest carries O02O, the alternate; the pickable base O02N is the
  // one that was falling through). Proof the fallback must be symmetric.
  {
    baseId: "godie-o02n",
    alternateId: "godie-o02o",
    w3uModel: "units\\demon\\ChaosWolfRider\\ChaosWolfRider.mdl",
    w3uBaseUnit: "Ofar",
  },
  // 90: coverage --
  { baseId: "godie-hgam", alternateId: "godie-h02r", w3uModel: "Bulbasaur.mdl", w3uBaseUnit: "Hgam" },
  // 92: coverage --
  { baseId: "godie-h02v", alternateId: "godie-h02u", w3uModel: "horse.mdl", w3uBaseUnit: "Hpal" },
];

/**
 * champId → the counterpart whose overlay glb it may inherit. BOTH directions,
 * because the map covers the base in three of the four live pairs and the
 * ALTERNATE in the fourth (godie-o02o → godie-o02n).
 */
export const SHARED_MODEL_COUNTERPART: ReadonlyMap<string, string> = new Map(
  SHARED_MODEL_FORM_PAIRS.flatMap((p) => [
    [p.baseId, p.alternateId] as const,
    [p.alternateId, p.baseId] as const,
  ]),
);

function asClipMap(v: unknown): ModelDoc["clipMap"] | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  // ⭐ GH#940 —— 從唯一住處取，⛔ 不再手抄。
  for (const k of ANIM_STATES) {
    const s = o[k];
    if (typeof s !== "string" || s.length === 0) return null;
    out[k] = s;
  }
  return out as unknown as ModelDoc["clipMap"];
}

/**
 * Tolerant parse of the merged manifest — `{ units: { [unitId]: { champId,
 * glb, clipMap } } }`. Returns null when the doc is not a manifest at all;
 * individual malformed units are skipped, never thrown on. Entries whose glb
 * is not under the overlay prefix are REJECTED: a manifest can only ever point
 * at the local-only overlay, never at shipped content or a foreign URL.
 */
export function blizzardOverlayFromDoc(doc: unknown): BlizzardOverlayIndex | null {
  if (!doc || typeof doc !== "object") return null;
  const units = (doc as { units?: unknown }).units;
  if (!units || typeof units !== "object") return null;
  const out = new Map<string, BlizzardOverlayUnit>();
  for (const [unitId, raw] of Object.entries(units as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as { champId?: unknown; glb?: unknown; clipMap?: unknown };
    if (typeof o.champId !== "string" || o.champId.length === 0) continue;
    if (typeof o.glb !== "string" || !o.glb.startsWith(BLIZZARD_LOCAL_GLB_PREFIX)) continue;
    // first entry wins — a champion is bound to exactly one unit
    if (out.has(o.champId)) continue;
    out.set(o.champId, {
      unitId,
      champId: o.champId,
      glb: o.glb,
      clipMap: asClipMap(o.clipMap) ?? DEFAULT_W3X_CLIP_MAP,
    });
  }
  return out;
}

/**
 * True when `doc` is a champion's OWN model (authored/imported), false when it
 * is missing or one of the shared KayKit stand-ins — the "no shipped model"
 * condition the overlay fills in.
 */
export function hasDedicatedShippedModel(doc: ModelDoc | null | undefined): boolean {
  if (!doc) return false;
  return !doc.glbPath.startsWith(STOCK_CHAMPION_GLB_PREFIX);
}

/**
 * `content/models/_overlay-hidden-geometry.json` —— glbPath → 要藏起來的 primitive
 * 索引（owner 2026-08-02「初號機跟拳四郎一樣 3d model 連著屍體一起」）。
 *
 * ⚠️ **為什麼宣告不能掛在 model 文件上**：blizzard-overlay 那 40 隻在磁碟上沒有
 * 自己的 `model@1` 文件 —— 它們的 ModelDoc 是這支檔案在執行期**合成**出來的
 * （`champion.ts:250` 的 tint 為了同一個理由被迫掛在 champion 上）。所以合成的
 * 那一刻是唯一的注入點，而宣告只能住在一個 sidecar。
 *
 * 它放在 `content/` 而不是 client 原始碼裡，是為了第一守則：`content/` 在主機上
 * 是 live bind-mount，operator 改一個索引存檔就生效，不必重建映像。
 */
export type OverlayHiddenGeometry = Readonly<Record<string, number[]>>;

/** 容錯解析：不是這個形狀就回空表（少藏一塊幾何 ≠ 值得擋住整個 overlay）。 */
export function overlayHiddenGeometryFromDoc(doc: unknown): OverlayHiddenGeometry {
  const models = (doc as { models?: unknown } | null)?.models;
  if (!models || typeof models !== "object") return {};
  const out: Record<string, number[]> = {};
  for (const [glb, entry] of Object.entries(models as Record<string, unknown>)) {
    const prims = (entry as { hiddenPrimitives?: unknown } | null)?.hiddenPrimitives;
    if (Array.isArray(prims) && prims.every((n) => typeof n === "number")) {
      out[glb] = prims as number[];
    }
  }
  return out;
}

/**
 * Synthesize the ModelDoc ChampionView needs for an overlay unit.
 *
 * ⚠️ `hidden` 是**必要的參數**，不是選配的裝飾：`ChampionView` 讀的是
 * `doc.hiddenPrimitives`，所以這裡不填，那 16 筆宣告就完全到不了渲染端
 * —— 資料在、schema 在、渲染端在，而玩家還是看得到屍體（失敗形態 ②）。
 */
export function overlayModelDoc(unit: BlizzardOverlayUnit, hidden?: OverlayHiddenGeometry): ModelDoc {
  const hiddenPrimitives = hidden?.[unit.glb];
  return {
    id: `blizzard-local.${unit.unitId.toLowerCase()}`,
    schema: "model@1",
    glbPath: unit.glb,
    scale: OVERLAY_MODEL_SCALE,
    collisionRadius: OVERLAY_COLLISION_RADIUS,
    clipMap: unit.clipMap,
    ...(hiddenPrimitives && hiddenPrimitives.length > 0 ? { hiddenPrimitives: [...hiddenPrimitives] } : {}),
  };
}

/** sidecar 的取得路徑 —— 走 `content/`，跟 `_standin-overrides.json` 同一個模式。 */
export const OVERLAY_HIDDEN_GEOMETRY_PATH = "/content/models/_overlay-hidden-geometry.json";

/**
 * Is this bundle allowed to look for the overlay at all?
 *
 * WAS `import.meta.env.DEV` — which constant-folds to `false` in every
 * `vite build` output, so a deployed client never issued the manifest request
 * no matter how many bytes were mounted behind nginx. #176 replaced it with an
 * explicit build flag that still DEFAULTS to `import.meta.env.DEV`, so local
 * development is unchanged and a family deploy can opt in with
 * VITE_GGD_FULL_ASSETS=1. See apps/client/src/config/fullAssets.ts for why this
 * is the layer that decides the outcome.
 */
const isDevBuild = fullAssetsEnabled;

function defaultFetch(url: string): Promise<Response> {
  if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
  return fetch(url);
}

export interface BlizzardOverlayOptions {
  /** probe the local-only overlay manifest (default: dev builds only) */
  enabled?: boolean;
  /** content mount base, default "/content/" */
  baseUrl?: string;
  fetchFn?: (url: string) => Promise<Response>;
  warn?: (msg: string, err?: unknown) => void;
}

/**
 * Single-flight, 404-tolerant probe of the overlay manifest plus the
 * synchronous resolve the EntityViewRegistry's `modelDocFor` hook needs.
 */
export class BlizzardOverlayModels {
  private readonly baseUrl: string;
  private readonly fetchFn: (url: string) => Promise<Response>;
  private readonly warn: (msg: string, err?: unknown) => void;
  /** null until the probe settles; then the (possibly empty) index. */
  private idx: BlizzardOverlayIndex | null = null;
  /** `_overlay-hidden-geometry.json` 的內容；載入前為空表（等於「沒有要藏的」）。 */
  private hidden: OverlayHiddenGeometry = {};
  private promise: Promise<BlizzardOverlayIndex | null> | null = null;

  readonly enabled: boolean;

  constructor(opts: BlizzardOverlayOptions = {}) {
    this.enabled = opts.enabled ?? isDevBuild();
    this.baseUrl = opts.baseUrl ?? CONTENT_BASE;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
    this.warn = opts.warn ?? ((msg, err) => console.warn(`[blizzard-overlay] ${msg}`, err ?? ""));
  }

  /** True once the probe has settled (or was never going to run). */
  get settled(): boolean {
    return !this.enabled || this.idx !== null;
  }

  /** Loaded index, or null while the probe is disabled/in flight. */
  get index(): BlizzardOverlayIndex | null {
    return this.enabled ? this.idx : null;
  }

  /** Cached single-flight probe. Resolves null when the overlay is absent. */
  load(): Promise<BlizzardOverlayIndex | null> {
    if (!this.enabled) return Promise.resolve(null);
    if (!this.promise) {
      // 兩份一起抓：宣告表跟 manifest 是同一個生命週期，晚到就等於沒到
      // （`resolve()` 在 idx 落地的那一刻就會開始合成 ModelDoc）。
      this.promise = Promise.all([this.fetchManifest(), this.fetchHiddenGeometry()]).then(
        ([doc, hidden]) => {
          const parsed = doc === null ? null : blizzardOverlayFromDoc(doc);
          this.hidden = hidden;
          // settle either way: a missing/garbage manifest must stop holding
          // champions back (they fall through to the shipped stand-in).
          this.idx = parsed ?? new Map<string, BlizzardOverlayUnit>();
          return parsed;
        },
      );
    }
    return this.promise;
  }

  /**
   * The overlay unit bound to a champion (null until loaded / not covered).
   *
   * A champion the manifest does not name directly may still inherit its
   * 變身 counterpart's unit — but ONLY through `SHARED_MODEL_COUNTERPART`, i.e.
   * only when `war3map.w3u` gives both halves the same model path. Every other
   * miss stays a miss and degrades to the shipped stand-in.
   */
  unitFor(champId: string | null | undefined): BlizzardOverlayUnit | null {
    if (!champId || !this.enabled) return null;
    const direct = this.idx?.get(champId);
    if (direct) return direct;
    const twin = SHARED_MODEL_COUNTERPART.get(champId);
    if (twin === undefined) return null;
    return this.idx?.get(twin) ?? null;
  }

  /**
   * The model doc a champion should render with. `shipped` is whatever the
   * authored content resolved to (null while ContentDb is still loading).
   * Returning null means "nothing to upgrade to yet" — the caller keeps its
   * procedural fallback and asks again next frame.
   *
   * `inheritFrom` (#223) — 缺省即繼承, THE 變身 SAFETY NET.
   * -----------------------------------------------------
   * When `champId` is the ALTERNATE body of a transform, it is very likely to
   * miss: the extractor keyed the manifest on the 40 PICKABLE units, so every
   * `Emeu` half is absent unless `SHARED_MODEL_COUNTERPART` covers it. Without
   * a fallback that miss is a VISIBLE DOWNGRADE — measured on the shipped
   * content, exactly one pair reaches this branch with a different answer,
   * `godie-u012 → godie-u011` (克勞薩), and it would drop from `U012.glb`
   * (the real HeroDreadLord mesh) to `blocky-barbarian.glb`, a generic
   * box-man, in the name of a "fix".
   *
   * The map cannot help here: w3u gives those two halves DIFFERENT model paths
   * (U011 is `collision.mdl`, a geometry-less dummy — WC3 itself draws
   * nothing), so `SHARED_MODEL_FORM_PAIRS` must NOT grow a row for them; that
   * table is recovered fact, re-derived from the fixture by
   * `blizzardOverlayForms.test.ts`. This parameter is the
   * separate, render-side rule instead: a body with no unit of its own keeps
   * the one the player was looking at a second ago. It is the SAME 缺省即繼承
   * rule `championBody.modelOverrideFor` applies to `_standin-overrides.json`.
   *
   * Per-champion escape hatch (no code change): `_standin-overrides.json`
   * accepts a `glbPath` keyed by championId, so an alternate that should look
   * like something else is authored in content, not special-cased here.
   */
  resolve(
    shipped: ModelDoc | null,
    champId: string | null | undefined,
    inheritFrom?: string | null,
  ): ModelDoc | null {
    // Authored content always wins; nothing to probe for.
    if (!this.enabled || hasDedicatedShippedModel(shipped)) return shipped;
    if (!champId && !inheritFrom) return shipped;
    if (this.idx === null) {
      void this.load(); // lazy kick-off: a caller can never forget to prime it
      return null; // hold the stand-in upgrade until the probe settles
    }
    const unit = this.unitFor(champId) ?? this.unitFor(inheritFrom);
    return unit ? overlayModelDoc(unit, this.hidden) : shipped;
  }

  /**
   * 抓 `content/models/_overlay-hidden-geometry.json`。失敗一律回空表 ——
   * 少藏一塊屍體幾何不值得擋住整個 overlay（那會讓 40 隻英雄退回體素替身）。
   */
  private async fetchHiddenGeometry(): Promise<OverlayHiddenGeometry> {
    try {
      const res = await this.fetchFn(OVERLAY_HIDDEN_GEOMETRY_PATH);
      if (!res.ok) return {};
      return overlayHiddenGeometryFromDoc((await res.json()) as unknown);
    } catch (err) {
      this.warn(`${OVERLAY_HIDDEN_GEOMETRY_PATH} failed to load (silent)`, err);
      return {};
    }
  }

  /** Fetch the manifest; null on 404 / bad JSON / network error. */
  private async fetchManifest(): Promise<unknown> {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`;
    try {
      const res = await this.fetchFn(base + BLIZZARD_OVERLAY_MANIFEST_PATH);
      if (!res.ok) return null; // 404 = overlay not extracted / not deployed
      return (await res.json()) as unknown;
    } catch (err) {
      this.warn(`${BLIZZARD_OVERLAY_MANIFEST_PATH} failed to load (silent)`, err);
      return null;
    }
  }
}

/** Process-wide probe (one manifest fetch per client session). */
export const blizzardOverlayModels = new BlizzardOverlayModels();
