/**
 * assetConsoleData — every pure decision the asset console makes, with no React
 * and no I/O, so all of it is node-tested
 * (apps/client/src/ui/assets/assetConsole.test.ts, which stays with the page it
 * was written for; apps/admin/src/assets/iconTracking.test.ts drives the same
 * functions from the other consumer).
 *
 * IT LIVES IN packages/shared because two consoles now make these decisions:
 * the client's 素材產生 page (task #101, where it was written) and 後台管理's ICON
 * 生成追蹤 (task #102). Both apps already depend on @ggd/shared, so one copy can
 * serve both — and one copy is the whole point, since a second cost formula or
 * a second freshness rule would make both answers untrustworthy.
 *
 * THE ONE RULE THIS FILE ENFORCES: nothing here invents a number. Counts come
 * from task #72's published plan (through #97's reader, @ggd/shared/codex/
 * codexPlan — never a second implementation), provider state comes from the
 * running platform, and
 * the art direction comes from the published style spec. What this module DOES
 * own is the arithmetic the page shows on top of those inputs — the cost
 * estimate, the freshness comparison, and the operator's next action — and each
 * of those is a pure function of its inputs so it can be checked in a test
 * instead of trusted.
 *
 * FRESHNESS IS A FIRST-CLASS RESULT, not an afterthought. `compareFreshness`
 * returns "unknown" as loudly as it returns "stale": a page that cannot verify
 * itself must say so rather than imply everything is fine.
 */

// ---------------------------------------------------------- provider ------

/** Operator-actionable reason codes, mirroring apps/platform/internal/ai/readiness.go. */
export type ReadinessReason = "ready" | "disabled" | "no-key" | "no-endpoint" | "no-model" | "";

export interface Readiness {
  readonly version: number;
  /** true when the platform gave us the dev-machine projection (with detail) */
  readonly loopback: boolean;
  readonly enabled: boolean;
  readonly imageReady: boolean;
  readonly textReady: boolean;
  readonly ttsReady: boolean;
  readonly musicReady: boolean;
  readonly reason: ReadinessReason;
  readonly imageModel: string;
  readonly imageHost: string;
  readonly updatedAt: string;
}

/** How the readiness fetch itself went — distinct from what it said. */
export type ProviderProbe =
  | { readonly state: "loading" }
  /** the platform answered */
  | { readonly state: "ok"; readonly readiness: Readiness; readonly at: number }
  /**
   * The platform did not give us an answer. `status` separates two states that
   * have completely different fixes and must never be conflated:
   *   404 → the platform IS running but its build predates /ai/readiness
   *         (restart it), and
   *   no status → nothing answered at all (start it).
   */
  | {
      readonly state: "unreachable";
      readonly error: string;
      readonly status: number | null;
      readonly at: number;
    };

const REASONS: readonly ReadinessReason[] = [
  "ready",
  "disabled",
  "no-key",
  "no-endpoint",
  "no-model",
];

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function bool(v: unknown): boolean {
  return v === true;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Tolerant parse of GET /api/v1/ai/readiness. Everything defaults to the
 * un-ready state: a malformed answer must never read as "a provider is live".
 */
export function parseReadiness(raw: unknown): Readiness {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reason = str(d["reason"]) as ReadinessReason;
  return {
    version: num(d["version"], 1),
    loopback: bool(d["loopback"]),
    enabled: bool(d["enabled"]),
    imageReady: bool(d["imageReady"]),
    textReady: bool(d["textReady"]),
    ttsReady: bool(d["ttsReady"]),
    musicReady: bool(d["musicReady"]),
    reason: REASONS.includes(reason) ? reason : "",
    imageModel: str(d["imageModel"]),
    imageHost: str(d["imageHost"]),
    updatedAt: str(d["updatedAt"]),
  };
}

/** Where the operator has to go, and what they have to do there. */
export interface OperatorAction {
  /** one-line verdict shown next to the status lamp */
  readonly headline: string;
  /** ordered, concrete steps — empty when nothing needs doing */
  readonly steps: readonly string[];
  /** the admin page that owns the fix, when there is one */
  readonly where: string;
}

const ADMIN_URL = "http://127.0.0.1:60721/admin/";
const ADMIN_PAGE = "後台管理 → AI 生成設定";

/**
 * The whole reason provider status is the FIRST thing on the page: "not ready"
 * is useless, "not ready because the master toggle is off, here is the switch"
 * is actionable. Never mentions, requests or displays a key value — the key is
 * typed into the admin console and never leaves the server.
 */
export function operatorAction(probe: ProviderProbe): OperatorAction {
  if (probe.state === "loading") {
    return { headline: "正在向平台詢問供應商狀態…", steps: [], where: "" };
  }
  if (probe.state === "unreachable") {
    if (probe.status === 404) {
      return {
        headline: "platform 正在執行，但這個組建沒有 /ai/readiness 路由",
        steps: [
          "重新建置並重新啟動 platform，讓它載入新增的唯讀狀態端點。",
          "在那之前本頁無法得知供應商狀態 —— 顯示的是「問不到」，不是「沒有供應商」。",
        ],
        where: "",
      };
    }
    return {
      headline: "platform 沒有回應 —— 無法得知供應商狀態",
      steps: [
        "確認 platform 服務正在執行（預設 http://localhost:8080）。",
        "這一格顯示的是「問不到」，不是「沒有供應商」——兩者必須分辨得出來。",
      ],
      where: "",
    };
  }
  const r = probe.readiness;
  if (r.imageReady) {
    return {
      headline: `已設定，可正式生成圖片${r.imageModel ? `（${r.imageModel}）` : ""}`,
      steps: [],
      where: "",
    };
  }
  const base: string[] = [];
  switch (r.reason) {
    case "disabled":
      base.push(`打開 ${ADMIN_PAGE} 的「啟用」開關。`);
      base.push("填入圖片端點（例如 https://api.openai.com/v1）與圖片模型（例如 gpt-image-1）。");
      base.push("在同一頁貼上供應商 API 金鑰並儲存。金鑰只存在伺服器端，本頁永遠不會顯示它。");
      break;
    case "no-key":
      base.push(`到 ${ADMIN_PAGE} 貼上供應商 API 金鑰並儲存。`);
      base.push("金鑰是唯寫的：儲存後平台只會回傳遮罩提示，本頁連遮罩都拿不到。");
      break;
    case "no-endpoint":
      base.push(`到 ${ADMIN_PAGE} 填入圖片端點，例如 https://api.openai.com/v1。`);
      break;
    case "no-model":
      base.push(`到 ${ADMIN_PAGE} 填入圖片模型，例如 gpt-image-1。`);
      break;
    default:
      // Off-loopback the platform withholds `reason` on purpose.
      base.push("目前不是從開發機讀取，平台只回傳布林值，不會說明缺哪一項。");
      base.push(`到開發機上開啟本頁，或直接到 ${ADMIN_PAGE} 檢查設定。`);
      break;
  }
  return {
    headline: "尚未設定供應商 —— 目前每一次生成都會回傳佔位圖（stub）",
    steps: base,
    where: r.reason === "" ? "" : ADMIN_URL,
  };
}

/**
 * Stub mode is not a soft failure — it silently produces FNV-seeded gradients
 * that look like output. Anything the page renders as "generated art" must be
 * gated on this.
 */
export function canGenerateImages(probe: ProviderProbe): boolean {
  return probe.state === "ok" && probe.readiness.imageReady;
}

// ------------------------------------------------------------ style spec ---

export interface SpecSource {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mtime: string;
}

export interface ContactSlot {
  readonly probe: string;
  readonly why: string;
  readonly found: boolean;
  readonly id: string;
  readonly family: string;
  readonly name: string;
  readonly description: string;
  readonly descriptionChars: number;
  readonly signal: string;
  readonly confidence: string;
  readonly subject: string;
  readonly prompt: string;
}

export interface StyleSpec {
  readonly generatedAt: string;
  readonly templateVersion: string;
  readonly contentDigest: string;
  readonly sources: readonly SpecSource[];
  readonly template: {
    readonly prefix: string;
    readonly negative: string;
    readonly shape: string;
    readonly example: string;
  };
  readonly textMode: { readonly field: string; readonly instruction: string; readonly note: string };
  readonly lexicon: Readonly<Record<string, readonly (readonly string[])[] | readonly string[]>>;
  readonly rules: readonly { readonly id: string; readonly text: string }[];
  readonly contactSheet: {
    readonly size: number;
    readonly runCommand: string;
    readonly note: string;
    readonly slots: readonly ContactSlot[];
  };
  readonly pricing: PricingTable;
}

export interface PricingTable {
  readonly quotedAsOf: string;
  readonly image: Readonly<Record<string, Readonly<Record<string, number | string>>>>;
  readonly text?: { readonly perCall?: number };
}

export const STYLE_SPEC_URL = "/content/assets/icon-console/style-spec.json";
export const STAMP_URL = "/icon-console/source-stamp";
export const READINESS_URL = "/api/v1/ai/readiness";
export const EMIT_COMMAND = "python3 tools/icon-console/emit_style_spec.py";

function pairs(raw: unknown): readonly (readonly string[])[] {
  return Array.isArray(raw)
    ? raw.filter((r): r is string[] => Array.isArray(r)).map((r) => r.map((x) => String(x)))
    : [];
}

function slot(raw: unknown): ContactSlot {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    probe: str(d["probe"]),
    why: str(d["why"]),
    found: bool(d["found"]),
    id: str(d["id"]),
    family: str(d["family"]),
    name: str(d["name"]),
    description: str(d["description"]),
    descriptionChars: num(d["descriptionChars"]),
    signal: str(d["signal"]),
    confidence: str(d["confidence"]),
    subject: str(d["subject"]),
    prompt: str(d["prompt"]),
  };
}

/** Parse the published spec. Returns null for anything that is not one. */
export function parseStyleSpec(raw: unknown): StyleSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d["schema"] !== "icon-console/style-spec@1") return null;
  const tpl = (d["template"] && typeof d["template"] === "object" ? d["template"] : {}) as Record<
    string,
    unknown
  >;
  const tm = (d["textMode"] && typeof d["textMode"] === "object" ? d["textMode"] : {}) as Record<
    string,
    unknown
  >;
  const cs = (d["contactSheet"] && typeof d["contactSheet"] === "object"
    ? d["contactSheet"]
    : {}) as Record<string, unknown>;
  const lexRaw = (d["lexicon"] && typeof d["lexicon"] === "object" ? d["lexicon"] : {}) as Record<
    string,
    unknown
  >;
  const lexicon: Record<string, readonly (readonly string[])[] | readonly string[]> = {};
  for (const [k, v] of Object.entries(lexRaw)) {
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      lexicon[k] = v as string[];
    } else {
      lexicon[k] = pairs(v);
    }
  }
  return {
    generatedAt: str(d["generatedAt"]),
    templateVersion: str(d["templateVersion"]),
    contentDigest: str(d["contentDigest"]),
    sources: Array.isArray(d["sources"])
      ? (d["sources"] as unknown[]).map((s) => {
          const e = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
          return {
            path: str(e["path"]),
            sha256: str(e["sha256"]),
            bytes: num(e["bytes"]),
            mtime: str(e["mtime"]),
          };
        })
      : [],
    template: {
      prefix: str(tpl["prefix"]),
      negative: str(tpl["negative"]),
      shape: str(tpl["shape"]),
      example: str(tpl["example"]),
    },
    textMode: {
      field: str(tm["field"]),
      instruction: str(tm["instruction"]),
      note: str(tm["note"]),
    },
    lexicon,
    rules: Array.isArray(d["rules"])
      ? (d["rules"] as unknown[]).map((r) => {
          const e = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
          return { id: str(e["id"]), text: str(e["text"]) };
        })
      : [],
    contactSheet: {
      size: num(cs["size"]),
      runCommand: str(cs["runCommand"]),
      note: str(cs["note"]),
      slots: Array.isArray(cs["slots"]) ? (cs["slots"] as unknown[]).map(slot) : [],
    },
    pricing: (d["pricing"] && typeof d["pricing"] === "object"
      ? (d["pricing"] as PricingTable)
      : { quotedAsOf: "", image: {} }) as PricingTable,
  };
}

// ------------------------------------------------------------ freshness ---

export interface StampEntry {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mtime: string;
  readonly exists: boolean;
}

export function parseStamp(raw: unknown): readonly StampEntry[] | null {
  if (!raw || typeof raw !== "object") return null;
  const list = (raw as Record<string, unknown>)["sources"];
  if (!Array.isArray(list)) return null;
  return list.map((s) => {
    const e = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return {
      path: str(e["path"]),
      sha256: str(e["sha256"]),
      bytes: num(e["bytes"]),
      mtime: str(e["mtime"]),
      exists: e["exists"] !== false,
    };
  });
}

export type FreshnessState = "fresh" | "stale" | "unknown";

export interface Drift {
  readonly path: string;
  readonly specSha: string;
  readonly liveSha: string;
  readonly liveMtime: string;
  readonly missing: boolean;
}

export interface Freshness {
  readonly state: FreshnessState;
  readonly drifted: readonly Drift[];
  /** why we cannot tell, when state is "unknown" */
  readonly note: string;
}

/**
 * Compare what the snapshot was built from against what those files contain
 * RIGHT NOW.
 *
 * "unknown" is a real answer and is rendered as prominently as "stale": in a
 * production build the live stamp endpoint does not exist, and pretending that
 * means "fresh" is precisely the silent-staleness bug this page was asked to
 * eliminate.
 */
export function compareFreshness(
  specSources: readonly SpecSource[],
  stamp: readonly StampEntry[] | null,
): Freshness {
  if (stamp === null) {
    return {
      state: "unknown",
      drifted: [],
      note: "此組建沒有即時來源檢查端點（僅開發伺服器提供），無法驗證樣式規格是否為最新。",
    };
  }
  if (specSources.length === 0) {
    return { state: "unknown", drifted: [], note: "樣式規格沒有記錄它的來源檔案摘要。" };
  }
  const live = new Map(stamp.map((s) => [s.path, s]));
  const drifted: Drift[] = [];
  for (const src of specSources) {
    const now = live.get(src.path);
    if (!now || !now.exists) {
      drifted.push({
        path: src.path,
        specSha: src.sha256,
        liveSha: "",
        liveMtime: "",
        missing: true,
      });
      continue;
    }
    if (now.sha256 !== src.sha256) {
      drifted.push({
        path: src.path,
        specSha: src.sha256,
        liveSha: now.sha256,
        liveMtime: now.mtime,
        missing: false,
      });
    }
  }
  return drifted.length === 0
    ? { state: "fresh", drifted: [], note: "" }
    : { state: "stale", drifted, note: "" };
}

/**
 * The plan the console renders counts from is fetched live, but the style spec
 * is a snapshot — so they can disagree about which content set they describe.
 * Surfacing that is cheap and catching it late is not.
 */
export function digestsAgree(spec: StyleSpec | null, planContentDigest: string | null): boolean {
  if (!spec || !planContentDigest) return true; // nothing to contradict
  return spec.contentDigest === planContentDigest;
}

// ----------------------------------------------------------------- cost ---

export type Tier = "tier1" | "tier2" | "both";
export type SubjectMode = "derived" | "text";

export interface CostInput {
  readonly tier1: number;
  readonly tier2: number;
  readonly tier: Tier;
  readonly model: string;
  readonly quality: string;
  readonly subject: SubjectMode;
  readonly pricing: PricingTable | null;
}

export interface CostEstimate {
  readonly images: number;
  /** USD per image, null when the table has no rate for model/quality */
  readonly rate: number | null;
  readonly imageUsd: number | null;
  readonly textCalls: number;
  readonly textUsd: number;
  readonly totalUsd: number | null;
  readonly quotedAsOf: string;
  readonly known: boolean;
}

export function imageRate(
  pricing: PricingTable | null,
  model: string,
  quality: string,
): number | null {
  const entry = pricing?.image?.[model];
  if (!entry) return null;
  const v = entry[quality];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The estimate, using the SAME formula as the runner
 * (tools/icon-gen/src/generate.py): rate x images, plus one text call per image
 * in --subject=text mode. Two implementations of one arithmetic is acceptable
 * only because the page prints the rate and the count it used, so a divergence
 * is visible rather than silent.
 */
export function estimateCost(input: CostInput): CostEstimate {
  const images =
    input.tier === "tier1"
      ? input.tier1
      : input.tier === "tier2"
        ? input.tier2
        : input.tier1 + input.tier2;
  const rate = imageRate(input.pricing, input.model, input.quality);
  const perCall = input.pricing?.text?.perCall ?? 0;
  const textCalls = input.subject === "text" ? images : 0;
  const textUsd = textCalls * perCall;
  const imageUsd = rate === null ? null : rate * images;
  return {
    images,
    rate,
    imageUsd,
    textCalls,
    textUsd,
    totalUsd: imageUsd === null ? null : imageUsd + textUsd,
    quotedAsOf: input.pricing?.quotedAsOf ?? "",
    known: rate !== null,
  };
}

export function usd(n: number | null): string {
  return n === null ? "—" : `$${n.toFixed(2)}`;
}

/** Model ids the price table actually knows, for the selector. */
export function pricedModels(pricing: PricingTable | null): readonly string[] {
  return pricing ? Object.keys(pricing.image ?? {}) : [];
}

/** Quality tiers priced for a model (skips the prose "note" field). */
export function pricedQualities(pricing: PricingTable | null, model: string): readonly string[] {
  const entry = pricing?.image?.[model];
  if (!entry) return [];
  return Object.entries(entry)
    .filter(([, v]) => typeof v === "number")
    .map(([k]) => k);
}

// -------------------------------------------------------- authorisation ---

export interface Authorisation {
  /** true only when a real provider could actually bill something */
  readonly billable: boolean;
  readonly headline: string;
  readonly detail: string;
  readonly command: string;
}

/**
 * The run is gated in THREE independent places and the page must say so, since
 * "nothing has been spent" is a claim the user is entitled to verify:
 *   1. no provider is configured    → every call returns a placeholder
 *   2. --i-have-confirmed-pricing   → refuses to bill without it
 *   3. --max-spend                  → refuses, and stops mid-run, above it
 */
export function authorisation(probe: ProviderProbe, est: CostEstimate): Authorisation {
  const cmd =
    `python3 tools/icon-gen/src/generate.py --tier 1 --quality low ` +
    `--max-spend ${Math.max(1, Math.ceil(est.totalUsd ?? 1))}.00 --i-have-confirmed-pricing`;
  if (!canGenerateImages(probe)) {
    return {
      billable: false,
      headline: "目前不可能產生任何費用",
      detail:
        "沒有設定供應商，所以每一次呼叫都走佔位分支（FNV 種子的漸層圖），一張真圖都還沒有生成過，" +
        "也沒有任何一次計費。設定供應商之後，下面的授權關卡才會開始有意義。",
      command: cmd,
    };
  }
  return {
    billable: true,
    headline: "供應商已就緒 —— 整批執行需要明確授權",
    detail:
      "執行器預設是 --dry-run，什麼都不呼叫。正式執行必須同時通過三道關卡：" +
      "傳入 --i-have-confirmed-pricing（表示你已對照供應商官方價目）、" +
      "估算不得超過 --max-spend，而且執行中一旦下一張會超過上限就會立刻停止。",
    command: cmd,
  };
}
