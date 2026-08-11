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

export type Screen = "boot" | "login" | "console";
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
   * 變身外觀 (`config/form-visuals.json`, #249 GH#288): 變身態的顏色 / 大小 /
   * 球體掛件。自己一頁,因為 26 對變身裡有 21 對**前後同一個模型** —— 這三樣
   * 是唯一能讓玩家看出變身的東西,而其中顏色與大小在 w3x 裡是空的,只能由
   * 操作者決定。寫入同樣走 `putOverlayDoc`,所以下面要 session-gate。
   */
  | "formVisuals"
  /**
   * ── schema 長出來的四頁 (E2) ──────────────────────────────────────────────
   * `content/config/` 下有十一份文件**完全沒有後台入口**。這四份是其中有真正
   * 消費端、而且是 owner 會想改的決策點的那幾份；它們共用 `ui/ConfigDocPage`
   * 一個元件，欄位結構從 Zod schema 走出來，中文名稱與「它影響什麼」逐格手寫在
   * `configForms.ts`（少寫一格測試就紅）。
   *
   * 為什麼是四個路由而不是一個「設定」頁掛下拉選單：它們問的是四個不相干的
   * 問題（模型下載哪一階 / 回合之間回收多少記憶體 / 打中噴多少血 / 兩道盾誰先
   * 被吃掉），塞在一起操作者就得先猜自己要找的東西被歸到哪一類。
   *
   * 四頁都走 `putOverlayDoc`，所以下面都要 session-gate。
   */
  /**
   * 對戰錄影 (`config/replay.json`, owner 2026-08-02「請幫我預設打開」):
   * 錄不錄影、多久落地一次、留幾份留幾天。
   */
  | "replayPolicy"
  /** 畫質分級 (`config/model-lod.json`): 四個畫質 preset 各自抓哪一階 .glb。 */
  | "modelLod"
  /** 特效回收 (`config/vfx-cleanup.json`): 回合邊界把共用特效池回收到什麼程度。 */
  | "vfxCleanup"
  /** 濺血程度 (`config/gore.json`): 打中噴多少血 —— 家裡有人在看時的那個開關。 */
  | "gore"
  /**
   * 傷害數字配色 (`config/damage-colors.json`, owner 2026-08-01): 物理紅／
   * 魔法紫／真實白／治療綠。自己一頁,因為在它出現之前客戶端只判斷「是不是
   * 魔法」—— 真實傷害的數字和物理傷害**逐像素相同**,[無視] 在畫面上唯一的
   * 證據是「對面死得比較快」。
   */
  | "damageColors"
  /**
   * 護盾規則 (`config/shield.json`): 一個人身上同時有兩道盾時,一發傷害先花掉
   * 哪一道。自己一頁而不是併進 戰鬥手感,因為手感那一頁的欄位是
   * `deriveFields(zConfigCombatFeelDoc)` 推導出來的而那支推導器只認得
   * number / boolean —— 這一格是 enum。
   */
  | "shieldRules"
  /**
   * 格擋規則 (`config/block.json`): 一個人身上同時有兩件 [格擋] 傳說武器時,
   * 它們獨立各抽各的(owner 2026-07-31 的裁決,出貨值)還是只有最強的那一件會
   * 擋。自己一頁而不是併進 護盾規則,因為那是**兩份文件** —— 併進去等於把
   * `config.shield@1` 升版,而一份線上已經存過 overlay 的文件升版,代價是操作者
   * 存過的值要遷移。
   */
  | "blockRules"
  /**
   * 暴擊規則 (`config/crit.json`, GH#302): 一次攻擊上有多條暴擊時怎麼合成
   * (owner 2026-08-09「每一條暴擊獨立算完傷害再帶入下一條」,出貨 multiply)、
   * 總倍率上限、最多算幾條。自己一頁而不是併進 格擋規則,同 護盾規則 的理由 ——
   * 那是**兩份文件**,併進去等於把 `config.block@1` 升版,而一份線上已經存過
   * overlay 的文件升版,代價是操作者存過的值要遷移。
   */
  | "critRules"
  | "berserkRules"
  | "dispelRules"
  | "cooldownRules"
  // AoE 四級距 (owner 2026-08-11「原則上不寫範圍數字」): 同一個 `ConfigDocPage`
  // 元件、同一條 `putOverlayDoc`。刻意排在 冷卻規則 旁邊 —— 兩者都是「技能的
  // 尺」，操作者會一起找。
  | "aoeTiers"
  // 英雄屬性正規化 (owner 2026-08-12): 小/中/大 的三格 + 角色定位對照表。
  // 極小/極大 不在這裡 —— 它們是硬上下限，住「屬性上限」頁。
  | "statNormalization"
  | "woundRules"
  | "weaknessRules"
  | "damageRules"
  /**
   * 增益卡敵方過濾 (`config/augment-filter.json`, 批 1 決策點 1-1): 殭屍算不算
   * hook 上 `victim: "enemyChampion"` 的敵人。自己一頁而不是併進 戰鬥系統,
   * 同 護盾規則 的理由 —— 戰鬥系統那一份是純數值倍率表(而且 Go 平台有一份
   * key 對 key 的鏡射在守),塞一個 boolean 進去是同時改三個語言的形狀。
   */
  | "augmentEnemyFilter"
  | "stealthRules"
  /**
   * 嘲弄規則 (`config/taunt.json`): 誰拉得動誰、拉多久、以及嘲弄能不能從**玩家
   * 自己手上**把目標搶走。自己一頁而不是併進 戰鬥手感,同 護盾規則 的理由
   * (`conflictMode` 是 enum,而手感那一頁的推導器只認得 number / boolean)。
   */
  | "tauntRules"
  /**
   * 體型與射程 (`config/body-scale.json`, GH#252): 身體放大倍數怎麼換算成普攻
   * 射程。自己一頁而不是併進 戰鬥系統,理由是 戰鬥系統 那一張表的每一格都是
   * 「一個 stat × 一個常數」,而這一頁是一條**公式**(1 + (體型−1) × 係數)加上
   * 兩個夾值 —— 塞進去會讓那張表多出三格語意不同的東西。
   */
  | "bodyScale"
  /**
   * 回血規則 (`config/regen.json`, GH#253): 百分比回血與英雄卡固定回血的關係、
   * 以及有沒有保底。同上,它是規則不是倍率。
   */
  | "regenRules"
  | "arenaFire"
  /**
   * 勝利煙火 (`config/victory-fx`, #93 / #235) —— owner 2026-08-02「請你直接取消
   * 煙火(變成後台開關)」。回合小煙火與吃雞烤雞煙火各一格,出貨都是關的。
   */
  | "victoryFx"
  /**
   * 回合頒獎台 (`config/victory-podium`, GH#257 / GH#256) —— 回合分出勝負時中央
   * 那一排 3D 模型站幾個人、誰站正中間、誰在慶祝、第一名說什麼。
   * ⚠️ 這一頁的到期條件是**機器數出來的**：`configDocCoverage.ts` 上原本有一列
   * DEFERRED 說「`resolveVictoryPodium` 零 production 呼叫端，開後台頁等於存了
   * 不生效」，而 `RoundWinnerStage.victoryPodiumPolicy()` 在 2026-08-03 接上去
   * 之後那一列就過期了 —— 守衛自己紅，逼人補這一頁。
   */
  | "victoryPodium"
  /**
   * 殭屍王出場演出 (`config/boss-intro`, owner 2026-08-02「殭屍王出場 會音效+大字
   * 講該英雄的名言，然後跳出該英雄的描述及攻略注意要點及弱點等提示，五秒後提示
   * 淡出消失」)。停留秒數／淡出秒數／描述字數上限／要點與弱點的條數上限。
   * ⚠️ 逐英雄的文案表不在這一頁編輯（`champions`，儲存時原封不動帶著走）——
   * 王的臉是 `mobWaves.boss.championSource` 抽的，出貨是隨機，所以那張表天生
   * 是不完整的，而缺一位的正確表現是少畫幾段，不是空白面板。
   */
  | "bossIntro"
  /**
   * 道具卡片排版 (`config/item-card`, owner 2026-08-02「卡片道具的排版連在一起
   * 不好閱讀，關於效果及數值的部分應該要特殊顏色表示」)。四個分類的名稱與顏色、
   * 數值色、解說色，加上三張「方括號裡的字算哪一類」的對照表。
   * ⚠️ 它是唯一一份**帶著可編輯對照表**的 `ConfigDocPage`（`spec.tables`）——
   * 因為 owner 那天真正要改的是「`[On-Hit]` 算主動還是被動」，而那是表的一列，
   * 不是一個純量欄位。
   */
  | "itemCard"
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
   * 資料搬遷 (task #243) — the whole-platform ZIP export/import. SHIPS IN
   * PRODUCTION and is session-gated below, both for the same reason: a
   * migration tool that only works on localhost cannot migrate a host, and one
   * export is every family member's password hash plus every unredeemed invite
   * code. #162's loopback no-login does NOT extend here — the page's two
   * dangerous actions re-confirm the operator's own password, and there is no
   * password to re-confirm without a real account.
   */
  | "dataMigration"
  | "audit";

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
  // 變身外觀: 同上 —— eager page + `putOverlayDoc`,沒有 session 每一次儲存都 401。
  "formVisuals",
  // 畫質分級 / 特效回收 / 濺血程度 (E2): 同一個 `ConfigDocPage` 元件、同一條
  // `putOverlayDoc` 寫入路徑,所以同一條規則。少了這三行,登出的操作者會看到三頁
  // 完全可以編輯的表單,改完才在儲存時發現從頭到尾就沒有可以寫入的 session。
  // 對戰錄影 (owner 2026-08-02): 同一個 `ConfigDocPage` 元件、同一條
  // `putOverlayDoc`,所以同一條 session 規則。
  "replayPolicy",
  "modelLod",
  "vfxCleanup",
  "gore",
  // 傷害數字配色: 同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "damageColors",
  // 護盾規則: 第四頁,同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`,所以
  // 同一條規則。
  "shieldRules",
  // 格擋規則: 第五頁,同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "blockRules",
  // 暴擊規則 (GH#302): 同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "critRules",
  "berserkRules",
  "dispelRules",
  "cooldownRules",
  // AoE 四級距: 同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "aoeTiers",
  // 英雄屬性正規化: 同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "statNormalization",
  "woundRules",
  "weaknessRules",
  "damageRules",
  // 增益卡敵方過濾: 同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "augmentEnemyFilter",
  "stealthRules",
  // 嘲弄規則: 第六頁,同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "tauntRules",
  // 體型與射程 / 回血規則 (GH#252 / GH#253): 同一個 `ConfigDocPage` 元件、同一條
  // `putOverlayDoc`,所以同一條 session 規則。
  "bodyScale",
  "regenRules",
  // 場地環境火焰 (GH#251): 同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "arenaFire",
  // 勝利煙火 (#93 / #235): 同一個 `ConfigDocPage` 元件、同一條 `putOverlayDoc`。
  "victoryFx",
  // 回合頒獎台 (GH#257 / GH#256): 同上,同一個元件、同一條 `putOverlayDoc`。
  "victoryPodium",
  // 殭屍王出場演出 (owner 2026-08-02): 同一個 `ConfigDocPage` 元件、同一條
  // `putOverlayDoc`,所以同一條規則。
  "bossIntro",
  // 道具卡片排版 (owner 2026-08-02): 同一個 `ConfigDocPage` 元件、同一條
  // `putOverlayDoc`。這一頁的三張對照表也走同一條寫入路徑,所以沒有 session 時
  // 操作者可以改完 32 列 markers 才在儲存時吃 401。
  "itemCard",
  // 鑄技工坊: 同上。它讀 /content(不需要 session)但寫 `putOverlayDoc`(需要),
  // 少了這一行,登出的操作者會看到一個完全可以編輯的表格,填完十列才在儲存時
  // 發現從頭到尾就沒有可以寫入的 session。
  "vfxForge",
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
  // #243: the archive page. NOT reachable through the loopback drop-in — its
  // export and commit both re-confirm the caller's OWN password against their
  // account, so there is nothing to check without a real session. This is not a
  // weakening of loopbackOnly; it is a refusal to extend it.
  "dataMigration",
  "audit",
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
