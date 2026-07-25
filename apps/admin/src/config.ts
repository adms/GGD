/**
 * Console Hub link configuration — the "收編所有網址" requirement: one card per
 * GGD surface, each with a URL and a health-check URL. URLs come from Vite env
 * (VITE_*) with sensible dev defaults; a PROD preset collapses everything to
 * same-origin paths (behind nginx: /, /editor/, /api/, /admin/). Pure and
 * unit-tested — no import.meta access here so it runs under node/vitest.
 */

export interface HubLink {
  key: string;
  /** localized (zh-Hant) label */
  label: string;
  /** English sublabel */
  sub: string;
  /** where the card navigates */
  url: string;
  /** URL the health ping hits (GET/HEAD with timeout); null = no ping */
  healthUrl: string | null;
  emoji: string;
}

/** Env bag (a subset of import.meta.env), all optional strings. */
export type HubEnv = Record<string, string | undefined>;

const DEV_DEFAULTS = {
  client: "http://localhost:39527",
  editor: "http://127.0.0.1:5174/editor/",
  testDashboard: "http://localhost:5199",
  contentApi: "http://127.0.0.1:8787",
  api: "http://localhost:8080",
  admin: "http://127.0.0.1:60721/admin/",
  docs: "/admin/docs",
} as const;

/** Same-origin production preset (everything behind the nginx edge). */
const PROD_PRESET = {
  client: "/",
  editor: "/editor/",
  testDashboard: "/test/",
  contentApi: "", // content-api is dev-only; hidden in prod
  api: "/api",
  admin: "/admin/",
  docs: "/admin/docs",
} as const;

function pick(env: HubEnv, key: string, fallback: string): string {
  const v = env[key];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

/**
 * Resolve the hub links. mode "prod" starts from same-origin defaults, "dev"
 * from localhost defaults; explicit VITE_* env always wins over either. The
 * health URL for the platform API is its /api/v1/healthz endpoint.
 */
export function resolveHubLinks(env: HubEnv = {}, mode: "dev" | "prod" = "dev"): HubLink[] {
  const base = mode === "prod" ? PROD_PRESET : DEV_DEFAULTS;

  const client = pick(env, "VITE_CLIENT_URL", base.client);
  const editor = pick(env, "VITE_EDITOR_URL", base.editor);
  const testDashboard = pick(env, "VITE_TEST_DASHBOARD_URL", base.testDashboard);
  const contentApi = pick(env, "VITE_CONTENT_API_URL", base.contentApi);
  const api = pick(env, "VITE_PLATFORM_API_URL", base.api);
  const admin = pick(env, "VITE_ADMIN_URL", base.admin);
  const docs = pick(env, "VITE_DOCS_URL", base.docs);

  // audition pages are static files on the client origin (apps/client/public/)
  const clientBase = client.endsWith("/") ? client : `${client}/`;
  const links: HubLink[] = [
    { key: "client", label: "遊戲", sub: "Game client / lobby", url: client, healthUrl: client, emoji: "🎮" },
    {
      key: "voiceProgress",
      label: "語音生成看板",
      sub: "Live multi-worker progress",
      url: `${admin.endsWith("/") ? admin : `${admin}/`}voice-progress.html`,
      healthUrl: null,
      emoji: "📊",
    },
    {
      key: "voiceAudition",
      label: "角色語音試聽",
      sub: "Voice-line audition (51 champs × 46)",
      url: `${clientBase}voice-audition.html`,
      healthUrl: null,
      emoji: "🎙️",
    },
    {
      key: "bgmAudition",
      label: "音樂音效試聽",
      sub: "BGM / SFX audition",
      url: `${clientBase}bgm-audition.html`,
      healthUrl: null,
      emoji: "🎵",
    },
    // #230. The census is COMPUTED, and it is computed in the client's asset
    // console from the shipped content + the archaeology sidecar. Linking there
    // rather than re-implementing it here is deliberate: two implementations of
    // one count is how a console starts lying (AssetConsolePage's own rule).
    {
      key: "vfxCensus",
      label: "特效真實引用普查",
      sub: "Every champion × ability: the map's real VFX vs what is bound",
      url: `${clientBase}#assets`,
      healthUrl: null,
      emoji: "🎆",
    },
    { key: "editor", label: "內容編輯器", sub: "Content editor", url: editor, healthUrl: editor, emoji: "🛠️" },
    { key: "testDashboard", label: "測試台", sub: "Test dashboard", url: testDashboard, healthUrl: testDashboard, emoji: "🧪" },
    { key: "api", label: "平台 API 健康", sub: "Platform API health", url: `${api}/v1/healthz`, healthUrl: `${api}/v1/healthz`, emoji: "❤️" },
    { key: "login", label: "玩家登入/大廳", sub: "Player login / lobby", url: client, healthUrl: client, emoji: "🔑" },
    { key: "docs", label: "說明文件", sub: "Docs (README / REPORT)", url: docs, healthUrl: null, emoji: "📖" },
    { key: "admin", label: "本後台", sub: "This console", url: admin, healthUrl: `${api}/v1/healthz`, emoji: "🗄️" },
  ];

  // content-api is dev-only; only surface a card when a URL exists.
  if (contentApi.trim() !== "") {
    links.splice(3, 0, {
      key: "contentApi",
      label: "內容 API",
      sub: "Content API (dev)",
      url: contentApi,
      healthUrl: contentApi,
      emoji: "📦",
    });
  }
  return links;
}
