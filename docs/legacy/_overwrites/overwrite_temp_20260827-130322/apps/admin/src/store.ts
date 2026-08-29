/**
 * Admin console store — session + navigation. Data-heavy pages fetch their own
 * rows locally (useState); the store owns auth/boot/logout and the active page.
 * Vanilla Zustand + a React hook, mirroring the client's store shape.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import {
  api,
  listPendingAccounts,
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
} from "./api";
import { ApiError, verifyAdmin } from "./session";
/**
 * ⭐ **出貨註冊表**（GH#807）—— 通用設定引擎每一頁的唯一來源。
 *
 * ⚠️ 這是一個**值**的 import，不只是型別：下面的 `SESSION_REQUIRED_PAGES` 也從它
 * 推導。⛔ 沒有循環風險 —— `configForms.ts` 與它底下的 `engine` / `specs/*` 一份都
 * 不 import 這個檔（唯一反向的 `configDocCoverage.ts` 不在這條鏈上）。
 * ⚠️ 也沒有新的 bundle 成本：`ui/App.tsx` 早就 eager import 了 `specForPage`。
 */
import { CONFIG_DOC_SPECS } from "./configForms";

export type Screen = "boot" | "login" | "console";

/**
 * 通用設定引擎的路由 key，**從註冊表推導**。
 *
 * ⛔ 這裡刻意不寫 `string` —— 那會讓 `Page` 整個塌掉（任何打錯的路由名都能通過）。
 * 承重的是 `configForms.ts` 上那個 `as const`：拿掉它，這一行會靜靜地變成 `string`。
 */
export type ConfigDocPage = (typeof CONFIG_DOC_SPECS)[number]["page"];

export type Page =
  | "hub"
  | "players"
  | "matches"
  | "announcements"
  | "curation"
  /**
   * 內容覆蓋層 (task #189) — SHIPS IN PRODUCTION, unlike every other content
   * route below. It reads and writes the platform's durable `data/` overlay
   * through the admin API (JWT + AdminOnly + audited), so it is safe by
   * AUTHORISATION rather than by absence, and it is the only way to change
   * content on ggd.adms.ai. Session-gated below for the same reason.
   */
  | "contentOverlay"
  /**
   * 內容管理 (task #102) — DEV BUILDS ONLY. The page module is reached through
   * an `import.meta.env.DEV`-guarded dynamic import in ui/App.tsx, so a
   * production admin build never emits it; naming the route here costs one
   * string literal and keeps navigation type-safe.
   */
  | "content"
  /**
   * The 內容·素材管理 back-office routes (owner directive 2026-07-25). Each is a
   * per-collection view over the SAME ContentPage editor engine (or, for
   * `audio`/`newHero`, a sibling dev page in the same chunk). ALL are DEV BUILDS
   * ONLY — reached exclusively through App's `import.meta.env.DEV`-guarded
   * dynamic import of ./ContentPage — and ALL stay OUT of
   * SESSION_REQUIRED_PAGES so the loopback no-login editing parity with
   * "content"/"voiceGen" holds. `audio` iframes the two audition pages (read-only
   * cross-origin) + the same-origin voice board; `champions`/`abilities`/`items`
   * /`vfx`/`arenas` route the editor; `newHero` is the 新英雄模板 wizard.
   */
  | "audio"
  | "champions"
  | "newHero"
  | "abilities"
  | "items"
  | "vfx"
  | "arenas"
  /**
   * 鑄形工坊 (Project Voxel Forge, task #229) — the 體素角色生成器 studio. Same
   * dev chunk, same gate, same absence from SESSION_REQUIRED_PAGES as every
   * other 內容·素材管理 route: it authors a `model@1` document and writes it
   * through the one contentApi write path, adding none of its own.
   */
  | "voxelStudio"
  | "combatEnv"
  /**
   * 基礎加成 (`config/base-bonus.json`): 每位英雄一開始就多拿的固定數值。
   * 與 combatEnv 分開的頁面,因為那一頁每格是**倍率**、這一頁每格是**加數**,
   * 而且這裡的值刻意不參與倍率計算 (owner 2026-07-28)。
   */
  | "baseBonus"
  /**
   * 屬性上限 (`config/stat-caps.json`, GH#286): 每條屬性的一般上限 / 解鎖上限。
   * 又是自己一頁,因為 combatEnv 是倍率、baseBonus 是加數、這裡是天花板 ——
   * 三種語意共用一張表格的話,操作者沒有線索分辨他填的 4.0 是哪一種。
   */
  | "statCaps"
  /**
   * 戰鬥手感 (`config/combat-feel.json`, GH#193/#216): 擊退 / 打就站定 / 面向鎖 /
   * 卡住就自動接敵。第四頁，因為它調的既不是倍率、加數，也不是天花板 —— 每一格
   * 是**一條規則的參數**（比例門檻 / tick 數 / 布林開關）。在它之前這份文件是
   * 完全沒有後台入口的四張決策表，而 `autoEngage.enabled` 正是 owner 還沒裁決
   * 的那個決策（「玩家撞牆時要不要讓系統接手」）。寫入走 `putOverlayDoc`。
   */
  | "combatFeel"
  /**
   * 傳說武器三選一 (`config/arena-rules.json` 的 `itemDraft`, GH#249): 候選武器
   * 不足時卡片要發短、借別的獎池、還是重複補滿。與 mobWaves 同一份文件、不同區塊,
   * 所以是自己一頁 —— 一頁編輯一整份 arena-rules 會讓兩條 lane 互相蓋掉對方。
   * 寫入走 `putOverlayDoc`,所以它在 SESSION_REQUIRED_PAGES 裡。
   */
  | "itemDraft"
  /**
   * 對戰設定 (`config/config.match.json`): 回合時鐘（選角／中場／戰鬥／結算秒數、
   * 起始隊伍生命）與火圈。⚠️ 這份文件的 32 個數字欄位裡只有 13 個真的有消費端 ——
   * 其餘（起始金錢、經驗、背包格數、隊伍數、模擬頻率…）在頁面上是**唯讀**的，
   * 因為真正在用的數字是編譯期常數。寫入走 `putOverlayDoc`。
   */
  | "matchConfig"
  /**
   * 商店經濟 (`config/store.json`, owner 2026-07-30): 英雄解鎖的**統一價** +
   * **免費名單**。自己一頁,因為在它之前 `config/store.json` 是唯一一份
   * **完全沒有後台入口**的 config —— 改價得編 content、rebuild、重啟容器,而
   * Go 與 client 還各自寫死一份 300。它也不屬於上面那三頁的任何一種語意:
   * 那三頁調的是英雄在場上的數值,這一頁調的是玩家要花多少水晶才拿得到英雄。
   */
  | "storeEconomy"
  /**
   * 英雄上下架 (`config/roster.json`, GH#336): **下架**（手動與隨機兩條路都擋）
   * 與**隱藏**（彩蛋 —— 隨機抽得到、手動選不到，owner 2026-08-17）兩張 id 清單。
   * 自己一頁而不是走通用引擎：那個引擎畫的是**固定形狀的純量葉**，這裡要的是
   * 「兩份會長大的英雄 id 清單 × textarea」（與 arenaPool 同一個形狀）。
   * ⚠️ 這一頁**必須同時**擁有兩張清單 —— 存檔寫的是整份文件，而 `retiredChampions`
   * 是 `.strict()` 必填，只寫一半會讓那七位下架英雄靜靜復活。寫入走 `putOverlayDoc`。
   */
  | "roster"
  /**
   * 變身外觀 (`config/form-visuals.json`, #249 GH#288): 變身態的顏色 / 大小 /
   * 球體掛件。自己一頁,因為 26 對變身裡有 21 對**前後同一個模型** —— 這三樣
   * 是唯一能讓玩家看出變身的東西,而其中顏色與大小在 w3x 裡是空的,只能由
   * 操作者決定。寫入同樣走 `putOverlayDoc`,所以下面要 session-gate。
   */
  | "formVisuals"
  /**
   * 五級距總覽 (owner 2026-08-21「後台設定及說明⋯全部都是推導動態即時產生」) ——
   * 四軸一頁，每一格 **卡面值 → 實際值**。
   *
   * ⭐ 它是**唯讀**的，也是這五頁裡唯一一頁**不編輯任何文件**的：上面四頁各自
   * 編一份 config，而這一頁把四份攤平再乘上現在生效的 combat-env 倍率。分開的
   * 理由和 itemDraft / mobWaves 那一組一樣 —— 一頁同時寫四份文件，兩條 lane 會
   * 互相蓋掉對方。
   *
   * ⚠️ 刻意**不**在 SESSION_REQUIRED_PAGES 裡：它一格都不寫，而且沒有 session
   * 時會退回同源的出貨 JSON（`/content/config/*.json`）並在畫面上標出來 ——
   * 與 hub / modelBudget 同一類的唯讀主控台。
   */
  | "tierOverview"
  /**
   * ⚠️ 不吃五級距的傷害節點 (owner #534「①②③ 作為例外在後台跳出警告就好」) ——
   * 唯讀，和 tierOverview 同一類，所以同樣**不**在 SESSION_REQUIRED_PAGES 裡。
   */
  | "damageTierWarnings"
  /**
   * 📜 詠唱>1秒清單（GH#682）＋ 💨 移速加成清單（GH#683）—— 唯讀，資料是
   * `pnpm speedlists:build` 產生的 `tools/skill-lists/lists.json`（build-time
   * import，與 docs 的兩份 md 共用同一次計算）。一格都不寫，也不打任何 API，
   * 所以和 tierOverview 同一類，⛔ 不在 SESSION_REQUIRED_PAGES。
   */
  | "castTimeList"
  /**
   * 🔴 LIVE 對照·視覺化 13 頁（GH#775，dev-chunk：apps/admin/src/ui/live/）。
   * 資料全部走 /__live/<dataset>（每次請求當場算 —— owner 2026-08-26:
   * 「內容都要 script 實時動態產生，不是靜態內容」）。production build 不含。
   */
  /** 🗺 導覽地圖（GH#776）—— 121 頁的「平面」入口。⛔ 不進 SESSION_REQUIRED_PAGES：
   *  它無 session 也完整可用（結構是本機資料），只有覆蓋層徽章那一欄降級。 */
  | "navMap"
  /**
   * 🧑‍⚖️ 一頁批次後台驗收（GH#669/#785）—— owner:「你還是沒告訴我去後台哪裡審查」。
   * ⛔ 不進 SESSION_REQUIRED_PAGES：帳本是本機檔，dev middleware 直接供應。
   */
  | "featureReview"
  | "liveMdlFamilies"
  | "liveParallelBoard"
  | "liveJassVfx"
  | "liveLocustOrbs"
  | "liveMechTemplates"
  | "liveVfxTemplates"
  | "liveSfxMap"
  | "liveRadarOrigins"
  | "liveRadarAbilities"
  | "liveSkillAuthoring"
  | "liveExRoots"
  | "liveTreasures"
  | "liveSkill90"
  | "liveLaneFences"   // 🚧 GH#754 誰能跟誰同時做（從票的 Files/modules 推導）
  | "msBuffList"
  /**
   * 圖示工坊 (owner 2026-08-17) —— 多選 + 批次重畫。
   * ⚠️ 它的請求走 daemon（`/icon-api`），⛔ 不是 overlay，所以它**不在** gate 名單裡：
   * daemon 自己只收 loopback，而這一頁在遠端本來就會顯示「服務未啟動」。
   */
  | "iconWorkshop"
  /** GH#324 —— 地圖驗證報告（唯讀）。 */
  | "mapReport"
  /** GH#324 —— 場地輪替（勾選哪幾張進輪替）。 */
  | "arenaPool"
  /**
   * GH#322 —— 每級加成（2026-08-13 平衡批新開的三份 config 之一）。
   * ⚠️ 同一批的 減傷天花板 / 位移級距 走通用引擎，所以它們在下面的 `ConfigDocPage`
   * 裡；這一份的 `perLevel` 是 `z.record`（鍵不固定），引擎列不出「有哪些鍵」，
   * 所以 owner 撞到「這頁無法顯示」之後它變成自己一頁（GH#790）。
   */
  | "perLevelBonus"
  /**
   * 鑄技工坊 · 特效綁定 (`config/vfx-bindings`, tasks #205 / #230 / #272) —— 每支
   * 技能綁哪一個**家族原型** + 六段 per-invocation 參數 (scale / tint / alpha /
   * timeScale / 高度 / 錨點骨)。自己一頁，因為它問的是「這一招該長什麼樣」而不是
   * 任何一種數值：595 支技能現在畫的是依技能中文名猜出來的替身，這一頁是把它們
   * 換成原作真的畫過的東西的唯一入口。寫入同樣走 `putOverlayDoc`，所以下面要
   * session-gate。
   */
  | "vfxForge"
  /**
   * 新英雄轉生設計 (owner 2026-08-13) —— 六步把一位新英雄從無到有做出來：
   * 名稱說明 → 選出身/路線**自動生成**三圍與其他屬性 → 手動客製 → 警告（⛔ 只警告
   * 不擋）→ 從鑄技工坊挑天生/Q/W/E/R/EX → 產出草稿上架。
   *
   * 與 新英雄模板（dev-only 的 `newHero`）不同的是**方向**：那一頁要作者自己把每
   * 一格數字填出來，這一頁從「出身」把整張卡生出來（`content/heroForge.ts` 的
   * 反向流程），所以它是 owner 用的設計頁，不是 dev 用的建檔頁。
   *
   * 讀 `/content`（不需要 session）但寫 `putOverlayDoc`（需要），所以下面要
   * session-gate —— 和 鑄技工坊 · 特效綁定 同一條規則。
   */
  | "heroForge"
  /**
   * 殭屍波系統 (roguelite mob waves, task #215) — the ONLY route that edits
   * `config/arena-rules.json`'s `mobWaves` block: 出怪節奏 / 逐回合上限 /
   * 殭屍能力數值 / 擊殺獎勵 / 由誰擔任. Like 內容覆蓋層 and 體素鑄造廠 its save
   * is a `putOverlayDoc` — the platform's admin-only durable data/ overlay — so
   * it SHIPS IN THE PRODUCTION BUNDLE (eagerly imported in ui/App.tsx) and is
   * session-gated below; it never touches the loopback content-api.
   */
  | "mobWaves"
  /**
   * 系統運維 (server ops) — the operational numbers: 同時對戰上限 + 快照頻率
   * writable, everything else visible and read-only with its safety class.
   */
  | "serverOps"
  | "ai"
  /**
   * The two asset consoles (task #102). Both READ measurements published by
   * tasks #97 / #99 / #101 and neither computes one of its own.
   */
  | "modelBudget"
  | "iconTracking"
  /**
   * 體素外觀對照表 (task #231) — the 驗收 surface for the per-champion generated
   * voxel skins. Unlike its two siblings above it MEASURES NOTHING EXTERNAL: it
   * computes every look at view time from /content + the shared generator, so
   * there is no report for it to read and nothing for it to go stale against.
   */
  | "voxelSkins"
  /**
   * 體素鑄造廠 (task #229) — the production-shippable 體素角色生成器. Unlike
   * "voxelStudio" above it is NOT in the dev chunk: it is a top-level static
   * import in ui/App.tsx and it IS in SESSION_REQUIRED_PAGES, because its save
   * goes through the platform's admin-only content-overlay API (#189) rather
   * than the loopback content-api. Bake + download work without a session; only
   * the write needs one.
   */
  | "voxelForge"
  /**
   * 體素條碼 (特徵生成 batch one, docs/_體素特徵生成規格.md) — the 11-slot colour
   * barcode editor. EAGER and session-gated for the same reason as its two
   * neighbours: its save is a `putOverlayDoc` into the platform's admin-only
   * durable overlay (config/voxel-barcodes). It produces NO pixels — the preview
   * is a stack of CSS divs and the atlas is painted locally by voxel:build — so
   * it drags no graphics dependency into the production bundle.
   */
  | "voxelBarcode"
  | "voxelBody"
  /**
   * 角色語音生成 (owner spec step 4) — DEV BUILDS ONLY, same shape as "content":
   * the page module is reached through an `import.meta.env.DEV`-guarded dynamic
   * import in ui/App.tsx, so a production admin build never emits it (nor its
   * nav label). It talks to the loopback voice-gen daemon on 127.0.0.1:8788
   * through the admin vite server's `/voice-api` proxy — a local
   * content-authoring tool with no platform session, exactly like the content
   * editor, so it is NOT in SESSION_REQUIRED_PAGES below.
   */
  | "voiceGen"
  /**
   * M幣 / 藍水晶 發放 (tasks #118, #225, #214) — admin-granted currency. M幣 now
   * goes through the audited /admin/accounts/{id}/mcoin; the unaudited
   * /wallet/admin/grant-mcoin it used to call is deleted.
   */
  | "mcoinGrant"
  /**
   * 邀請碼 (task #174) — mint / list / revoke the single-use registration invite
   * codes that are the private deploy's only front door. Platform-admin-backed,
   * so it is session-gated below and NOT reachable through the loopback drop-in.
   */
  | "invites"
  /**
   * 帳號審核 (task #126) — the private-deploy approval queue. THE blocker for
   * remote family play: a relative who registers lands `pending` and cannot
   * reach a room until an operator approves them here. Platform-admin-backed
   * (it reads and writes durable accounts), so it is session-gated below.
   */
  | "approvals"
  /**
   * Quick Approval (task #242) — every decision that is blocked on the OWNER,
   * on one page, cleared with one submit: the roster the version-controlled
   * starter set declares but this deploy has not enabled, champions enabled
   * with half their ability slots, champions enabled that no list ever
   * declared, and the #126 account queue. It OWNS NO STATE — every row is
   * derived at view time from the same public/admin endpoints the other pages
   * use, and every write goes through those pages' existing audited seams
   * (POST /curation/whitelist/bulk with an always-empty `disable`, POST
   * /admin/accounts/{id}/approve).
   *
   * Platform-admin-backed, so it is session-gated below — and unlike the
   * content routes it is EAGERLY imported in ui/App.tsx, because a Quick
   * Approval that vanishes from a production build cannot do its job.
   */
  | "quickApproval"
  /**
   * 對戰回放 (task #175) — the owner's playtest feedback channel. Lists match
   * recordings and opens them in the reused game renderer. Platform-admin-backed
   * (recordings carry player names), so session-gated below.
   */
  | "replays"
  /**
   * 傷害排行榜 (#636) — top 單發傷害(Redis zset,game shard 收場時寫入)。
   * 唯讀報表;platform-admin proxy 供資料,所以 session-gated。
   */
  | "damageBoard"
  /**
   * 資料搬遷 (task #243) — the whole-platform ZIP export/import. SHIPS IN
   * PRODUCTION and is session-gated below, both for the same reason: a
   * migration tool that only works on localhost cannot migrate a host, and one
   * export is every family member's password hash plus every unredeemed invite
   * code. #162's loopback no-login does NOT extend here — the page's two
   * dangerous actions re-confirm the operator's own password, and there is no
   * password to re-confirm without a real account.
   */
  | "dataMigration"
  | "audit"
  /**
   * ⭐ 通用設定引擎的 59 頁 —— **從出貨註冊表推導**（GH#807，第〇·七守則的
   * 「一行接線」病）。在它之前每一份 `content/config/*.json` 都要在這裡再打一次
   * 路由名，而那一行是**機械的**：59 份 spec、59 個路由名，一個字都不差。
   *
   * ⚠️ 每一頁「為什麼是自己一頁 / 誰讀它 / 存檔什麼時候生效」的散文**沒有消失**，
   * 它住在那一頁自己的 spec 上（`configForms/specs/*.ts` 的 `title` / `intro` /
   * `consumer` / `effect`）—— 那裡本來就比這裡完整，而這裡是它的第二份住處
   * （第〇·四守則：⛔ 同一份知識不要有兩個住處，因為第二份必然過期）。
   *
   * ⛔ **NAV 的順序沒有被自動化**：那個陣列的順序是一個**決定**（導覽列由上到下),
   * 交給資料夾／字母序會讓它漂。⇒ 這是「一行接線」病裡**不該**推導的那一種。
   */
  | ConfigDocPage;

export interface AdminAccount {
  id: string;
  username: string;
}

export interface BootOptions {
  /** override the dev drop-in decision (tests); defaults to the vite DEV flag */
  devDropIn?: boolean;
}

export interface AppState {
  screen: Screen;
  page: Page;
  account: AdminAccount | null;
  authBusy: boolean;
  authError: string | null;
  /** set when a valid login is authenticated but lacks the admin role */
  notAuthorized: boolean;
  /**
   * DEV drop-in (task #102). When true the console opens STRAIGHT INTO the
   * content/codex editor with NO login, and only the platform-backed player-ops
   * pages are gated (see pageRequiresSession). In a production build vite folds
   * `import.meta.env.DEV` to false → the original hard login wall is restored,
   * and the content editor chunk does not even exist to drop into.
   */
  devDropIn: boolean;
  /**
   * 帳號審核 queue depth (task #126) — how many accounts are waiting right now.
   *
   * THIS IS CHROME, not page data, which is why it is the one count that lives
   * in the store while every table fetches its own rows. It drives the badge on
   * the nav rail and the banner on the players list, so a relative who
   * registered is visible from whatever page the owner happens to be on. The
   * whole failure this task fixes was approval state being reachable only if
   * you already knew to go looking for it.
   *
   * -1 means "not established yet" (pre-session, or every probe so far failed)
   * and renders as no badge — distinct from 0, which is a known-empty queue.
   */
  pendingCount: number;

  boot(opts?: BootOptions): Promise<void>;
  /**
   * Re-probe the queue depth. Safe to call from anywhere and at any time: with
   * no operator session it resets to -1 without touching the network, and a
   * failed probe LEAVES THE LAST KNOWN COUNT ALONE rather than showing 0 — a
   * transient 502 must not make a waiting relative disappear from the nav.
   */
  refreshPendingCount(): Promise<void>;
  doLogin(username: string, password: string): Promise<void>;
  doLogout(): Promise<void>;
  /** raise the operator login screen (e.g. from a gated page's 登入 button) */
  showLogin(): void;
  /** dev-only: dismiss the login screen back to the console (content editor) */
  cancelLogin(): void;
  navigate(page: Page): void;
}

/**
 * Pages backed by the Go PLATFORM admin API (argon2id + JWT + AdminOnly). These
 * are the player-ops / operations surfaces: they mutate accounts, wallets, MMR,
 * announcements, the content whitelist, the AI proxy config and the global
 * combat-env table. They CANNOT function without a real admin session — the
 * platform rejects an unauthenticated caller — so they stay gated even in the
 * dev drop-in. Everything NOT in this set is served over loopback with no
 * platform session: the content/codex editor (champions/abilities/items via the
 * content-api) and the read-only local consoles (hub, model-budget, icon-track).
 */
const SESSION_REQUIRED_PAGES: ReadonlySet<Page> = new Set<Page>([
  "contentOverlay",
  // #534：「不吃五級距的傷害節點」是**唯讀警告頁**，⛔ 但仍然 gate ——
  // 與 mapReport 同一條規則：它讀的是 content overlay（`damage-tier-exemptions`），
  // 而 loopback 免登入模式下那個讀取會 401，畫出來的會是一張「零個豁免」的空表 ——
  // 那比沒有頁更糟：操作者會以為**真的沒有例外**，然後照著調級距。
  "damageTierWarnings",
  "players",
  "approvals",
  // #242: every one of its writes is platform-admin-backed (curation bulk +
  // account approve), so without this the loopback dev drop-in would render it
  // with `account === null` and every submit would 401 — a failure that looks
  // like a platform bug rather than a missing sign-in.
  "quickApproval",
  "matches",
  "announcements",
  "curation",
  // #189: backed by the platform's admin-only overlay API. Deliberately NOT in
  // the loopback drop-in — this one writes what every player sees on the
  // deployed host, so it takes a real operator session like every other
  // platform-backed page.
  // #229: its save is a `putOverlayDoc` — the same admin-JWT, audited platform
  // writer 內容覆蓋層 uses — so without a session every 寫入覆蓋層 would 401 and
  // read as a broken page rather than a missing sign-in.
  "voxelForge",
  // 體素條碼: same `putOverlayDoc` writer, so the same rule. An EAGER page left
  // out of this set is worse than a gated one — it renders a fully interactive
  // editor to a signed-out operator, who fills in eleven colours and then
  // discovers on 儲存 that there was never a session to write with.
  "voxelBarcode",
  "voxelBody",
  "ai",
  "combatEnv",
  "baseBonus",
  // 屬性上限: 同樣是 `putOverlayDoc` 寫入,沒有 session 會 401。
  "statCaps",
  // 戰鬥手感 / 對戰設定: 同上 —— eager page + `putOverlayDoc`,沒有 session 每一次
  // 儲存都 401,而畫面看起來只是「壞掉」而不是「沒登入」。
  "combatFeel",
  "matchConfig",
  // 商店經濟: 同上 —— eager page + `putOverlayDoc`,沒有 session 每一次儲存都 401。
  "storeEconomy",
  // 英雄上下架 (GH#336): 同上 —— eager page + `putOverlayDoc`。⛔ 漏掉 gate 的話,
  // 登出的操作者會把兩張名單編完才在儲存時發現從頭到尾就沒有可以寫入的 session,
  // 而這一頁存不下去的後果是「他以為那位英雄已經下架了」。
  "roster",
  // 變身外觀: 同上 —— eager page + `putOverlayDoc`,沒有 session 每一次儲存都 401。
  "formVisuals",
  // GH#332 —— 同上。⛔ 漏掉 gate 的話登出的操作者會填完整張表才發現存不下去。
  "mapReport",
  "arenaPool",
  // GH#322 —— 2026-08-13 平衡批新開的三頁。三頁都走 `putOverlayDoc`（沒有 session
  // 一律 401），⛔ 漏掉 gate 的話登出的操作者會填完整張表才發現存不下去。
  "perLevelBonus",
  // 鑄技工坊: 同上。它讀 /content(不需要 session)但寫 `putOverlayDoc`(需要),
  // 少了這一行,登出的操作者會看到一個完全可以編輯的表格,填完十列才在儲存時
  // 發現從頭到尾就沒有可以寫入的 session。
  "vfxForge",
  // 新英雄轉生設計: 同上 —— 它一次寫 5~7 份文件(技能在前、英雄最後),沒有 session
  // 會在第一份就 401,而畫面上看起來像「草稿壞了」而不是「沒登入」。
  "heroForge",
  // 殭屍波系統: its save is a `putOverlayDoc` — the same admin-JWT, audited
  // platform writer 內容覆蓋層 and 體素鑄造廠 use — so without a session every
  // 儲存 would 401 and read as a broken page rather than a missing sign-in.
  "mobWaves",
  // 傳說武器三選一: 同一條 `putOverlayDoc` 寫入路徑(而且寫的是同一份 arena-rules
  // 文件),所以同一條規則 —— 沒有 session 每一次儲存都會 401。
  "itemDraft",
  "serverOps",
  "mcoinGrant",
  "invites",
  "replays",
  "damageBoard",
  // #243: the archive page. NOT reachable through the loopback drop-in — its
  // export and commit both re-confirm the caller's OWN password against their
  // account, so there is nothing to check without a real session. This is not a
  // weakening of loopbackOnly; it is a refusal to extend it.
  "dataMigration",
  "audit",
  // ⭐ 通用設定引擎的 59 頁 —— **從出貨註冊表推導**（GH#807）。
  // 在它之前這裡有 59 列手打的路由名，而它們**全部**是同一個理由：那一族共用
  // `ui/ConfigDocPage` 一個元件、同一條 `putOverlayDoc` 寫入路徑 ⇒ 沒有 session
  // 一律 401。⇒ 59/59 沒有例外 ⇒ 它是**機械的**，⛔ 不是一個決定。
  //
  // ⛔ 漏掉一列的後果就是這一段存在的理由：登出的操作者會看到一頁**完全可以編輯**
  // 的表單，填完十格才在儲存時吃 401 —— 看起來像壞掉，不像沒登入。推導之後
  // 「忘了加那一行」這個缺陷**不再存在**。
  //
  // ⚠️ 推導只**加**閘，⛔ 不會讓任何一頁變成不設防：它往集合裡塞東西，拿不走。
  // 刻意不 gate 的唯讀頁（tierOverview / damageTierWarnings / mapReport 的對照組…）
  // 本來就不在 `CONFIG_DOC_SPECS` 裡。
  ...CONFIG_DOC_SPECS.map((s) => s.page),
]);

/** True when `page` needs a real platform admin session to do anything. */
export function pageRequiresSession(page: Page): boolean {
  return SESSION_REQUIRED_PAGES.has(page);
}

/**
 * The dev drop-in flag, read through the repo's guarded `import.meta.env.DEV`
 * shape so plain-node vitest never throws. This is the SAME statically
 * substitutable signal the content editor's own gate uses (contentApi.ts) — no
 * runtime hostname / localStorage sniffing — so a production build folds the
 * whole no-login path away rather than deciding it at runtime.
 */
export function contentEditorDropInEnabled(): boolean {
  try {
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function errText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "something went wrong";
}

export const appStore = createStore<AppState>()((set, get) => ({
  screen: "boot",
  page: "hub",
  account: null,
  authBusy: false,
  authError: null,
  notAuthorized: false,
  devDropIn: false,
  pendingCount: -1,

  async refreshPendingCount() {
    if (get().account === null) {
      set({ pendingCount: -1 });
      return;
    }
    try {
      // pageSize 1 — only `total` is wanted, and it is the FULL pending count
      // server-side, so the badge is exact without paging through the queue.
      const res = await listPendingAccounts(1, 1);
      set({ pendingCount: typeof res.total === "number" ? res.total : 0 });
    } catch {
      // Deliberately silent and deliberately non-destructive. An older platform
      // build has no /admin/accounts/pending (404) and a flaky network 502s;
      // neither is worth an error banner on an unrelated page, and neither is
      // evidence that the queue is empty.
    }
  },

  async boot(opts) {
    const devDropIn = opts?.devDropIn ?? contentEditorDropInEnabled();
    // Where a session-less console lands: the content editor in dev, otherwise
    // the hub (only reached post-login in a production build).
    const landing: Page = devDropIn ? "champions" : "hub";
    set({ devDropIn });

    if (!api.hasSession) {
      // No session. In dev, drop straight into the content editor with the
      // player-ops pages gated; in prod, keep the hard login wall.
      if (devDropIn) set({ screen: "console", page: landing, account: null, notAuthorized: false });
      else set({ screen: "login" });
      return;
    }
    try {
      const { account } = await apiMe();
      const isAdmin = await verifyAdmin(api);
      if (!isAdmin) {
        // Authenticated but not an operator. Content editing is a loopback
        // capability, not a role — so in dev we still open the console (account
        // stays null ⇒ player-ops stays gated); in prod, back to the wall.
        if (devDropIn) set({ screen: "console", page: landing, account: null, notAuthorized: true });
        else set({ screen: "login", notAuthorized: true, account: null });
        return;
      }
      set({ screen: "console", page: "hub", account, notAuthorized: false });
    } catch {
      api.setTokens(null);
      if (devDropIn) set({ screen: "console", page: landing, account: null, notAuthorized: false });
      else set({ screen: "login" });
    }
  },

  async doLogin(username, password) {
    set({ authBusy: true, authError: null, notAuthorized: false });
    try {
      const resp = await apiLogin(username, password);
      api.setTokens(resp.tokens);
      const isAdmin = await verifyAdmin(api);
      if (!isAdmin) {
        api.setTokens(null);
        set({ authBusy: false, notAuthorized: true });
        return;
      }
      set({
        screen: "console",
        page: "hub",
        account: resp.account,
        authBusy: false,
        authError: null,
        notAuthorized: false,
      });
    } catch (err) {
      set({ authBusy: false, authError: errText(err) });
    }
  },

  async doLogout() {
    try {
      const token = api.refreshToken;
      if (token) await apiLogout(token);
    } catch {
      /* best effort */
    }
    api.setTokens(null);
    // In dev, sign-out returns to the no-login content editor (not a wall);
    // in prod it drops back to the login screen as before. Either way the
    // approval queue depth goes back to "unknown" — it is operator-visible
    // information about real people and must not outlive the session.
    if (get().devDropIn) {
      set({ screen: "console", account: null, page: "champions", notAuthorized: false, pendingCount: -1 });
    } else {
      set({ screen: "login", account: null, page: "hub", notAuthorized: false, pendingCount: -1 });
    }
  },

  showLogin() {
    set({ screen: "login", authError: null });
  },

  cancelLogin() {
    // Only meaningful in the dev drop-in, where a console exists behind the
    // login screen to return to. In prod the login screen is a hard wall.
    if (get().devDropIn) set({ screen: "console", authError: null, notAuthorized: false });
  },

  navigate(page) {
    set({ page });
  },
}));

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector);
}
