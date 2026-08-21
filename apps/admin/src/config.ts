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

/* ══════════════════════════════════════════════════════════════════════════
 * GH#496 —— 「戰鬥回放 出現的是 localhost 無法觀看」
 * ══════════════════════════════════════════════════════════════════════════
 *
 * owner 2026-08-21：「後台 **戰鬥回放 出現的是 localhost 無法觀看**」
 *
 * ── 根因（量到的，不是猜的）────────────────────────────────────────────────
 * `ReplaysPage` 呼叫的是 `resolveHubLinks(env)` —— **少了第二個參數**。而它的
 * 預設值是 `"dev"`，於是那一頁在**正式站上**也拿 `DEV_DEFAULTS`，也就是
 * `http://localhost:39527`。其餘三個呼叫端（ConsoleHub / AudioAuditionPage /
 * App）每一個都寫了 `raw.PROD ? "prod" : "dev"`，只有這一頁漏了。
 *
 * ⚠️ **不是「hub link 沒設定」**。`VITE_CLIENT_URL` 在這個 repo 裡從頭到尾沒有
 * 任何地方設定過（沒有 .env、compose 沒有 build arg、host-deploy.sh 沒有），
 * 那是**刻意的**：正式站的每一個面都在同一個 nginx 後面，所以 PROD_PRESET 給的
 * 是同源路徑 `/`。少的是「問 PROD_PRESET」這個動作，不是一個環境變數。
 *
 * ── 為什麼舊的 `?? "http://localhost:39527"` 修不好它 ────────────────────
 * 那一行是**死碼** —— `resolveHubLinks` 永遠回傳一張含 `client` 的表，`??` 那一
 * 邊到不了。它看起來像個 fallback，所以它把真正的 bug（少一個參數）藏了起來，
 * 而且**兩種狀態長得一模一樣**：設定好了、跟根本沒問，畫面上都是一個連結。
 *
 * ⇒ 所以下面這個函式做兩件事：問對 preset，**而且回報自己是不是不可能通**。
 */

/** 這個網址指向本機嗎（loopback / 未指定位址）？ */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "::" || /^127\./.test(h);
}

export interface ReplayClientBase {
  /** 「觀看」要開的網址前綴。 */
  url: string;
  /**
   * 非 null ＝ 這個網址在這個環境下**不可能通**，畫面上要用紅字說出來。
   *
   * ⛔ 一行 console.warn 不算（CLAUDE.md：fail-open 沒錯，**靜默**才是缺陷）。
   */
  warning: string | null;
}

/**
 * 回放檢視器的 client 網址前綴 —— 而且會**自己說出**它是不是壞的 (GH#496)。
 *
 * ⭐ 判斷用的是**兩個名詞的關係**，不是一個名詞：「client 指向本機」本身不是
 * 錯的（開發機上那才是對的），錯的是「**後台自己不在本機，client 卻指向本機**」。
 * 只看其中一半的檢查在這個故障面前必然是綠的 —— 那正是 2026-08-02 四項後置條件
 * 全綠而網站不能玩的形狀（`ggd-pairwise-postconditions`）。
 *
 * @param env         `import.meta.env` 那一包
 * @param isProd      `import.meta.env.PROD`
 * @param adminHref   後台自己的網址（`window.location.href`）
 */
export function resolveReplayClientBase(env: HubEnv, isProd: boolean, adminHref: string): ReplayClientBase {
  const link = resolveHubLinks(env, isProd ? "prod" : "dev").find((l) => l.key === "client");
  if (!link || link.url.trim() === "") {
    return {
      url: adminHref,
      warning: "找不到遊戲客戶端的網址（Console Hub 的 client 卡片不存在）——「觀看」會開到後台自己身上。請設定 VITE_CLIENT_URL。",
    };
  }
  const url = link.url;
  let clientHost: string | null = null;
  let adminHost: string | null = null;
  try {
    // 相對網址（PROD_PRESET 的 "/"）要以後台自己的位址為基準解析,
    // 否則同源的正確設定會被誤判成「量不到主機名」。
    clientHost = new URL(url, adminHref).hostname;
    adminHost = new URL(adminHref).hostname;
  } catch {
    return { url, warning: null }; // 解析不出來就別亂喊 —— 假警報比沒有警報更糟
  }
  if (isLoopbackHost(clientHost) && !isLoopbackHost(adminHost)) {
    return {
      url,
      warning:
        `這個後台開在 ${adminHost}，但回放連結指向本機 ${clientHost} —— 點下去只會連到你自己的電腦，看不到這場錄影。` +
        `（成因：這一頁沒有拿到正式站的網址預設值，或 VITE_CLIENT_URL 設成了本機位址。）`,
    };
  }
  return { url, warning: null };
}
