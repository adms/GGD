/**
 * demoData — THE STUB THAT DRIVES THIS PAGE UNTIL THE REAL SERVICE EXISTS.
 *
 * WHY IT EXISTS. The voice-gen daemon and IndexTTS are being installed by a
 * sibling lane. Until `tools/voice-gen/src/serve.mjs` is up there is no
 * `ROSTER.json`, so the page's honest degraded state is a correct but
 * undemonstrable "0 位角色" — and nobody can see whether a 48 × 46 = 2,208-clip
 * console actually holds together at that size. This module fabricates that
 * scale so the layout, the windowing, the per-champion progress bars, the
 * one-player-at-a-time rule and every disabled-with-a-reason button are
 * provable TODAY, and so the day the daemon lands the only thing that changes
 * is where the bytes came from.
 *
 * WHY IT CANNOT BE MISTAKEN FOR REAL WORK — the same rule as the stub engine
 * (`apps/platform/internal/ai/music.go`: a convincing fake is worse than
 * nothing), applied to DATA rather than to audio:
 *
 *   1. it is OFF by default and only ever turned on by an explicit click;
 *   2. while it is on the page carries its own banner, distinct from the
 *      STUB-engine one, and every write button is gone (there is nothing to
 *      write to — `demoWriteRefusal()` is the single answer to any attempt);
 *   3. every fabricated script is prefixed `（示範文稿）`, so a demo string can
 *      never be read as authored copy;
 *   4. no clip exists, so nothing can be auditioned, promoted or approved: the
 *      demo populates STATE, never bytes;
 *   5. it is deterministic (seeded per champion id) — the roster counts are
 *      computed from the very lines the detail view renders, so the page's own
 *      partition self-check passes for the same reason it will pass on real
 *      data, not because the demo was tuned to satisfy it.
 *
 * It lives in the dev-only voice chunk, so a production build contains none of
 * it — see the gate in ui/App.tsx.
 */
import type { LineSpec } from "./categories";
import {
  countsFor,
  type ChampionStatus,
  type LineRecord,
  type LineState,
  type ReferenceRecord,
  type VoiceRoster,
} from "./voiceModel";

/** Shown whenever the demo is driving the page. Never shares wording with the engine banner. */
export const DEMO_BANNER =
  "🧪 示範資料（DEMO）：這些角色、狀態與文稿全部是假的，只用來證明這個頁面在 2,208 段的規模下能用。沒有任何音檔存在，也不會寫入任何檔案。";

export const DEMO_TEXT_PREFIX = "（示範文稿）";

/** The one answer to any write attempted while the demo is driving. */
export function demoWriteRefusal(): string {
  return "現在顯示的是示範資料，沒有可以寫入的對象。請先啟動語音服務（node tools/voice-gen/src/serve.mjs）。";
}

/** Where the demo gets champion names + genders: a pack that already ships. */
export const QUOTES_URL = "/content/assets/audio/voices/quotes/quotes.json";

export interface DemoChampion {
  readonly championId: string;
  readonly name: string;
  readonly gender: string;
  readonly lang: string;
}

/** Deterministic 32-bit hash of a string — so a champion's demo never wobbles. */
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, seeded, and identical on every machine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The mix of states the demo paints. Weighted to look like work IN PROGRESS —
 * a roster that is all-green would prove nothing about the bars, and one that
 * is all-grey would prove nothing about the segments.
 */
const MIX: readonly { state: LineState; weight: number }[] = [
  { state: "noText", weight: 26 },
  { state: "pending", weight: 20 },
  { state: "stub", weight: 16 },
  { state: "generated", weight: 12 },
  { state: "approved", weight: 14 },
  { state: "rejected", weight: 5 },
  { state: "failed", weight: 4 },
  { state: "generating", weight: 3 },
];
const MIX_TOTAL = MIX.reduce((n, m) => n + m.weight, 0);

function pickState(r: number): LineState {
  let acc = r * MIX_TOTAL;
  for (const m of MIX) {
    acc -= m.weight;
    if (acc <= 0) return m.state;
  }
  return "noText";
}

const DEMO_REFERENCE: ReferenceRecord = {
  sha256: "0".repeat(64),
  seconds: 6.5,
  sampleRate: 24000,
  source: "（示範）assets/audio/voices/quotes/*.mp3",
  sourceKind: "repo",
  licence: "",
  licenceUrl: "",
  note: "示範資料，不是真的參考音",
  addedAt: 0,
};

/**
 * One champion's fabricated status. Deterministic in `championId`, so the
 * counts computed here and the rows rendered later cannot disagree.
 */
export function demoStatus(champ: DemoChampion, lines: readonly LineSpec[]): ChampionStatus {
  const seed = hash32(champ.championId);
  const rand = rng(seed);
  // ~1 champion in 5 deliberately has NO reference clip, so the page's
  // "cannot generate, and here is why" path is visible rather than theoretical
  const hasReference = seed % 5 !== 0;
  const out: Record<string, LineRecord> = {};

  for (const spec of lines) {
    let state = pickState(rand());
    // a line with no reference can never have got past 待撰稿/待生成
    if (!hasReference && state !== "noText") state = "pending";
    const hasText = state !== "noText";
    const hasClip = state === "stub" || state === "generated" || state === "approved" || state === "rejected";
    const stub = state === "stub";
    out[spec.lineId] = {
      lineId: spec.lineId,
      categoryId: spec.categoryId,
      variant: spec.variant,
      text: hasText ? `${DEMO_TEXT_PREFIX}${spec.label}${spec.variantLabel ? `・${spec.variantLabel}` : ""}` : null,
      textSource: hasText ? "ai" : null,
      lang: champ.lang,
      state,
      current: hasClip
        ? {
            take: 1,
            engine: stub ? "stub" : "indextts",
            engineVersion: "demo",
            stub,
            bytes: null,
            seconds: Math.round(rand() * 25 + 6) / 10,
            lufs: -16,
            hash: "demo",
            at: 0,
          }
        : null,
      takes: hasClip ? [{ take: 1, engine: stub ? "stub" : "indextts", stub, seconds: null, at: 0, error: null }] : [],
      review: state === "approved" ? { decision: "approved", note: "", at: 0 } : null,
      lastError: state === "failed" ? "（示範）參考音長度不足" : null,
      abilityId: spec.categoryId === "skill-name" ? `${champ.championId}.${spec.variant ?? ""}` : null,
      abilityName:
        spec.categoryId === "skill-name" ? `（示範）${spec.variantLabel} 技能名稱` : null,
    };
  }
  return {
    championId: champ.championId,
    lang: champ.lang,
    gender: champ.gender,
    reference: hasReference ? DEMO_REFERENCE : null,
    lines: out,
  };
}

/**
 * The whole fabricated world: a status per champion plus the rollup, whose
 * counts are COMPUTED from those statuses rather than invented alongside them.
 */
export function demoWorld(
  champions: readonly DemoChampion[],
  lines: readonly LineSpec[],
): { roster: VoiceRoster; statuses: Map<string, ChampionStatus> } {
  const statuses = new Map<string, ChampionStatus>();
  for (const c of champions) statuses.set(c.championId, demoStatus(c, lines));
  return {
    statuses,
    roster: {
      categoryCount: new Set(lines.map((l) => l.categoryId)).size,
      lineCount: lines.length,
      generatedAt: 0,
      // the demo can never claim a real engine
      engine: { name: "demo", version: "", stub: true },
      champions: champions.map((c) => {
        const st = statuses.get(c.championId) ?? null;
        return {
          championId: c.championId,
          name: c.name,
          hasReference: st?.reference !== null,
          referenceSha256: st?.reference?.sha256 ?? null,
          lang: c.lang,
          gender: c.gender,
          counts: countsFor(lines, st),
          updatedAt: 0,
        };
      }),
    },
  };
}

/**
 * Read champion names + genders out of the 名言 pack that already ships
 * (`quotes.json`), narrowed to `only` when the curation whitelist could be
 * read. The demo does NOT keep a roster of its own — it borrows the one the
 * repo already has, so a fabricated champion can never appear.
 */
export function demoChampionsFromQuotes(
  raw: unknown,
  only: readonly string[] | null,
): DemoChampion[] {
  if (raw === null || typeof raw !== "object") return [];
  const quotes = (raw as { quotes?: unknown }).quotes;
  if (quotes === null || typeof quotes !== "object") return [];
  const allow = only === null || only.length === 0 ? null : new Set(only);
  const out: DemoChampion[] = [];
  for (const [championId, v] of Object.entries(quotes as Record<string, unknown>)) {
    if (allow !== null && !allow.has(championId)) continue;
    const e = (v ?? {}) as Record<string, unknown>;
    out.push({
      championId,
      name: typeof e["name"] === "string" && e["name"] !== "" ? e["name"] : championId,
      gender: typeof e["gender"] === "string" ? e["gender"] : "neutral",
      lang: "ja-JP",
    });
  }
  out.sort((a, b) => a.championId.localeCompare(b.championId));
  return out;
}
