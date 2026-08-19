/**
 * blizzardVfxCredits — the per-clip Blizzard listing shown on the 版權聲明 page.
 *
 * Covers BOTH batches the owner released on 2026-08-19: the model-soundset
 * clips (GH#402) and task #78's ability-declared ones ("既有 60 個 wc3.* 沒一起搬
 * => move"). They share one directory, one `wc3.*` namespace and one ledger —
 * each row's `sources` says which upstream named it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ON THE CREDITS PAGE AT ALL
 * ---------------------------------------------------------------------------
 * Unlike 効果音ラボ (whose licence makes attribution OPTIONAL and whose rows are
 * therefore a courtesy), these 73 clips are listed because **the owner's
 * permission to ship them came with attribution as its CONDITION**:
 *
 *   > owner 2026-08-19 (GH#402):「請幫我註記取消這個規則，現在的線上已經是
 *   >  雙重審查只給認識的親友玩了，請**直接上架但註記來源就好** 不要ignore」
 *
 * So this listing is not decoration and not politeness — removing it removes
 * the basis on which the bytes are allowed to be in the repo at all. That still
 * does NOT make it `mandatory: true` in creditsData terms: that flag means a
 * LICENCE compels the display, and Blizzard's does not compel anything (it does
 * not grant redistribution either — see the honesty note below). The obligation
 * here is to the project owner's own condition, which is why the summary entry
 * carries the quote instead of the mandatory flag.
 *
 * ---------------------------------------------------------------------------
 * THE ROWS ARE IMPORTED, NEVER TRANSCRIBED
 * ---------------------------------------------------------------------------
 * sfxLabCredits.ts hand-authors its rows and pins them to the manifest with a
 * test, because those clips were acquired one at a time by different agents.
 * These 73 arrive from ONE generator in ONE pass, so the ledger it writes is
 * imported directly:
 *
 *   content/assets/audio/wc3/PROVENANCE.json   (byte-deterministic, --check'd)
 *
 * That removes the entire class of drift the sfxLab test has to defend against:
 * there is no second copy to disagree with the first. The cost is ~44 KB of
 * JSON in the bundle; the benefit is that a clip cannot exist without its row.
 *
 * `bound` is DERIVED in the generator (does any cue in vfx-families.json point
 * at this key?), never declared — same rule as sfxLabCredits' 使用中 badge, and
 * for the same reason: a hand-kept "is it wired" list is a claim that rots.
 *
 * NOTE: a LIST, not a soundboard. Never add a play button to these rows.
 */
import ledger from "../../../../../content/assets/audio/wc3/PROVENANCE.json";

export interface BlizzardVfxClip {
  /** audio-map sfx key, e.g. `wc3.criticalstrike`. */
  readonly key: string;
  /** Original path inside the retail MPQ. */
  readonly wc3Path: string;
  /** Which archive it was read from. */
  readonly archive: string;
  /** The WC3 sound label the mdx event resolves to. */
  readonly soundLabel: string;
  /** Ability docs that currently play it (empty ⇒ available to the editor). */
  readonly abilityDocs: readonly string[];
  /** Derived by the generator: does any cue point at this key today? */
  readonly bound: boolean;
  /** Which upstream(s) named this clip: model-soundset and/or ability-declared. */
  readonly sources: readonly string[];
  /** JASS `gg_snd_*` identifiers, when an ability declared it. */
  readonly ggSnd: readonly string[];
  readonly bytes: number;
}

interface LedgerShape {
  readonly clips: Record<string, BlizzardVfxClip>;
  readonly gaps: readonly { readonly kind: string; readonly why: string }[];
  readonly totalBytes: number;
}

const doc = ledger as unknown as LedgerShape;

/** Every committed clip, ordered by key so the page is stable across builds. */
export const BLIZZARD_VFX_CLIPS: readonly BlizzardVfxClip[] = Object.keys(doc.clips)
  .sort()
  .map((k) => doc.clips[k] as BlizzardVfxClip);

/** How many are actually reachable in game right now (the 使用中 count). */
export const BLIZZARD_VFX_BOUND_COUNT = BLIZZARD_VFX_CLIPS.filter((c) => c.bound).length;

export const BLIZZARD_VFX_TOTAL_MB = doc.totalBytes / 1048576;

/**
 * These clips are NOT warmed at boot and NOT in any scene preload bucket
 * (apps/client/src/audio/sfxManifest.ts deliberately leaves them out): they
 * lazy-load on first play via AudioSystem.playSfx. So the ~12 MB is a
 * pay-per-use cost, not a first-load cost — which is the only reason shipping
 * this many WAVs is acceptable at all.
 */
export const BLIZZARD_VFX_LOAD_POLICY = "lazy-on-first-play";

/**
 * The honest statement about what this is. Kept next to the data so a future
 * edit to the page cannot quietly soften it: Blizzard has granted nothing. The
 * clips are here on the owner's decision about HIS deploy (a double-screened
 * family site whose map he authored), not on a licence that permits it.
 */
export const BLIZZARD_VFX_TERMS =
  "以下音效的權利人為 Blizzard Entertainment，自使用者本機安裝的 Warcraft III 資料檔擷取，" +
  "未經任何轉檔或加工（22050 Hz 單聲道 PCM，逐位元組原樣）。" +
  "本專案並未取得 Blizzard 的散布授權；這些檔案隨本站提供，是基於站方（本專案作者，亦為原始地圖作者）" +
  "對其自身私人站台的決定 —— 線上為雙重審查、僅限親友的私人遊玩環境。" +
  "逐檔出處（來源封存檔、原始路徑、sha256）記於 content/assets/audio/wc3/PROVENANCE.md。";
