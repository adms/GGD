/**
 * 內容管理 — browse / view / edit / save 英雄・技能・武器道具 (task #102).
 *
 * This is the MANAGEMENT view of the content tree. The player-facing codex
 * (#71, the `#codex` overlay) stays exactly as it is: a read-only 圖鑑 over the
 * same data. One data layer, two views — admin edits, codex displays.
 *
 * DEV-ONLY BY CONSTRUCTION. This module is reached from App.tsx exclusively
 * through an `import.meta.env.DEV`-guarded dynamic import, so rollup never
 * emits the chunk into a production admin build. It is not hidden there, it is
 * absent. `contentGate.test.ts` pins that, including an opt-in test that runs a
 * real `vite build` and greps dist/.
 *
 * ── THE THREE THINGS THAT MAKE A CONTENT EDITOR SAFE HERE ───────────────────
 *
 * 1. NO VERSION CONTROL (task #65). This repo has none and has already lost
 *    irreplaceable files once. So saving is deliberately a TWO-STEP: the user
 *    presses 檢查並預覽, sees a leaf-level diff of exactly what is about to be
 *    overwritten (plus any mirror write), and only then presses 確認寫入. The
 *    server additionally snapshots the old bytes before touching them, and the
 *    undo list right under the diff restores any snapshot — the panel that made
 *    a bad edit is the panel that undoes it.
 *
 * 2. THE MIRROR RULE. Every Q/W/E/R ability lives TWICE: standalone in
 *    abilities/, and embedded in its champion under `abilities[<slot>]`. The
 *    SIM reads the embedded copy. Saving only the standalone doc would look
 *    like it worked and change nothing in game, so an ability save is planned
 *    as BOTH writes (writePlan), both are validated before either is written,
 *    and the plan is shown in the confirmation so the second write is never a
 *    surprise.
 *
 * 3. contentVersion (cv_…). Client and server COMPARE this hash. Any write
 *    changes it, which means a match already in flight is now running content
 *    that no longer matches the disk. Rather than let that desync happen
 *    silently, the header shows the live cv_ and a save reports the NEW one
 *    with an explicit "重開一場才會生效" warning.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEdits,
  diffDocs,
  embeddedSlotOf,
  formatField,
  getAt,
  parseField,
  type DocChange,
  type EditCollection,
  type FieldKind,
  type WritePlanStep,
} from "@ggd/shared/content/editModel";
import { TEAM_SIZE } from "@ggd/shared/constants";
import { createContentEditApi, type BackupEntry, type ContentEditApi, type EditIssue } from "../contentApi";
import { createIconApi, type IconApi } from "../icons/iconApi";
import { IconGenButton, IconGenStrip, useIconGen, type IconGen } from "./IconGenStrip";
import { loadCollection, contentAssetUrl } from "../content";
import type { ContentRow } from "../curation";
import {
  COLLECTION_LABEL,
  fieldGroups,
  uncoveredKeys,
  type FieldSpec,
} from "../contentFields";
import { AudioAuditionPage } from "./AudioAuditionPage";
import { NewHeroPageRoot } from "./NewHeroPage";
import { VoxelStudioPageRoot } from "./voxel/VoxelStudioPage";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import {
  ACCENT,
  DANGER,
  GOLD,
  OK,
  PANEL_BG,
  PANEL_BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  WARN,
} from "./theme";

// 三選一強化 (augments) are the DRAFT abilities — editable as their OWN tab,
// distinct from champion 技能, per the owner (task #70 rule 3). 三選一抽獎池
// (loot-tables) are the ITEM draft POOLS: the owner curates which items the
// weapon 3-choose-1 offers from here. ⚠️ As of 2026-08-01 the card rolls
// `legendary-weapons` only — `quest-rewards` is RETIRED (still editable here,
// but no round may schedule it; see arena-rules.retiredLootTables). This is
// the DEFAULT tab set (no `only` prop); each nav route passes its own `only`.
const ALL_TABS: readonly EditCollection[] = [
  "champions",
  "abilities",
  "items",
  "augments",
  "loot-tables",
  "vfx",
  "arenas",
];

// Collections the owner may CREATE via the inline ＋新增 box. `augments` (task
// #70 rule 3: 「隨機三選一的技能應該也要在後台單獨被編輯」) plus the two authored
// collections `vfx` / `arenas` (task #205): both are hand-authored or
// _index-driven, so a new doc from a schema-valid skeleton is a legitimate act.
// champions is NOT here — it is create-only through the 新英雄模板 wizard
// (a bare {id} champion 422s, and a single-doc champion would dangle its
// ability refs). abilities/items/loot-tables stay edit-only.
export const CREATABLE: ReadonlySet<EditCollection> = new Set<EditCollection>(["augments", "vfx", "arenas"]);

// Collections the owner may DELETE. Split OUT of CREATABLE (which used to gate
// both) so the two policies can differ: everything creatable here is also
// deletable (recoverable — the server snapshots bytes before unlinking), but
// champions would be creatable-via-wizard-yet-not-deletable if it were here.
// Deleting an arena only shrinks the reindex-driven random-arena pool; deleting
// a vfx only drops a soft-ref target — neither breaks the bundle build.
export const DELETABLE: ReadonlySet<EditCollection> = new Set<EditCollection>(["augments", "vfx", "arenas"]);

/** A blank, schema-valid skeleton for a freshly-created document. */
export function skeletonDoc(collection: EditCollection, id: string): Record<string, unknown> {
  if (collection === "augments") {
    return {
      id,
      schema: "augment@1",
      name: id,
      description: "（請填寫說明）",
      tier: "silver",
      weight: 10,
      tags: [],
    };
  }
  if (collection === "vfx") {
    // minimal-valid vfx@1 — a bare {id} 422s. continuous ⇒ rate required;
    // lifetimeSec/size/color/blendMode are all mandatory. The rgba tuples and
    // any gradient stops are then tuned via the raw-JSON escape hatch.
    return {
      id,
      schema: "vfx@1",
      emitter: { shape: "point" },
      mode: "continuous",
      rate: 20,
      lifetimeSec: { min: 0.5, max: 1 },
      size: { start: 0.2, end: 0 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      blendMode: "additive",
    };
  }
  if (collection === "arenas") {
    // minimal-valid arena@1 — one zone with a 2-side spawn tuple, both spawns
    // and (empty) obstacles inside boundaryRadius so zZoneDef's superRefine
    // passes. zones[] payload is then authored via the raw-JSON editor.
    return {
      id,
      schema: "arena@1",
      name: id,
      groundStyle: "stone",
      decor: [],
      zones: [
        {
          id: "z0",
          center: { x: 0, z: 0 },
          boundaryRadius: 40,
          obstacles: [],
          // ⭐ GH#325 —— 每側必須有 **TEAM_SIZE** 個出生點，⛔ 不是 1 個。
          //    在此之前這份骨架是「schema 合法」的，⛔ 而消費端讀
          //    `spawns[side][slot % TEAM_SIZE]` ⇒ slot 1/2 取到 `undefined`。
          //    ⚠️ 從 import 的 `TEAM_SIZE` 推導，⛔ 不抄字面 3（那是第二個住處）。
          spawns: [
            Array.from({ length: TEAM_SIZE }, (_, i) => ({ x: -10, z: (i - (TEAM_SIZE - 1) / 2) * 4 })),
            Array.from({ length: TEAM_SIZE }, (_, i) => ({ x: 10, z: (i - (TEAM_SIZE - 1) / 2) * 4 })),
          ],
        },
      ],
    };
  }
  return { id };
}

interface Draft {
  /** path → parsed JSON value (undefined = remove the key) */
  readonly edits: Readonly<Record<string, unknown>>;
  /** path → exactly what the user typed (so a half-typed number survives a rerender) */
  readonly raw: Readonly<Record<string, string>>;
  /** path → why that text could not be parsed */
  readonly parseErrors: Readonly<Record<string, string>>;
  /** whole-document override from the raw-JSON editor */
  readonly whole: Record<string, unknown> | null;
  readonly wholeError: string | null;
}

const EMPTY_DRAFT: Draft = { edits: {}, raw: {}, parseErrors: {}, whole: null, wholeError: null };

type Tone = "ok" | "warn" | "err";

export interface ContentPageProps {
  /** the dev-only write API (injected in tests) */
  api: ContentEditApi;
  /** the dev-only icon-generation daemon client (#186; injected in tests) */
  icons?: IconApi;
  /**
   * Restrict this instance to a subset of collections. One nav route → one
   * `only` list over the SAME editor engine (英雄管理 = ["champions"], 技能管理 =
   * ["abilities","augments"], 武器道具管理 = ["items","loot-tables"], 特效管理 =
   * ["vfx"], 場景物件管理 = ["arenas"]). When it has a single member the tab bar
   * hides entirely. Omitted = all collections (the legacy 內容管理 behaviour),
   * kept so nothing that constructs a bare ContentPage breaks.
   */
  only?: readonly EditCollection[];
}

/**
 * The nav entry, exported from the DEV-ONLY chunk rather than written in the
 * shell. It would be harmless in App.tsx — the entry is only added when this
 * module loaded, which cannot happen in production — but the literal itself
 * would survive into the bundle, and "內容管理 appears in a prod build" is
 * exactly the kind of grep result that makes someone doubt the gate. Absence
 * should be total, not almost.
 */
export const CONTENT_NAV = { page: "content", label: "內容管理", emoji: "📚" } as const;

/**
 * The per-collection nav ROUTES this dev chunk contributes, in the owner's
 * 內容·素材管理 order. Each carries the `only` list it mounts ContentPage with.
 * `audio` (AudioAuditionPage) and `newHero` (NewHeroPage) render OTHER
 * components in this same chunk — see `renderContentDevPage`. Exported so the
 * App shell can splice them into the nav BY NAME while the label + route stay
 * inside the dev-only chunk (a production build lacks the strings entirely,
 * same discipline as CONTENT_NAV).
 */
export interface ContentRoute {
  readonly page: string;
  readonly label: string;
  readonly emoji: string;
  /** collections when this route mounts the ContentPage editor; absent for audio/newHero */
  readonly only?: readonly EditCollection[];
}

export const CONTENT_SECTION = "內容·素材管理";

export const CONTENT_ROUTES: readonly ContentRoute[] = [
  { page: "audio", label: "音樂音效素材管理", emoji: "🎵" },
  { page: "champions", label: "英雄管理", emoji: "🦸", only: ["champions"] },
  { page: "newHero", label: "新英雄模板", emoji: "✨" },
  { page: "abilities", label: "技能管理", emoji: "🔮", only: ["abilities", "augments"] },
  { page: "items", label: "武器道具管理", emoji: "⚔️", only: ["items", "loot-tables"] },
  { page: "vfx", label: "特效管理", emoji: "🎆", only: ["vfx"] },
  { page: "arenas", label: "場景物件管理", emoji: "🏟️", only: ["arenas"] },
  // 鑄形工坊 (Project Voxel Forge, task #229) — the sibling of 鑄技工坊
  // (Project Skill Forge): that one forges 技 (skills), this one forges 形
  // (form). Like `audio`/`newHero` it renders its OWN component rather than the
  // ContentPage editor, so it carries no `only` list.
  { page: "voxelStudio", label: "鑄形工坊", emoji: "🧱" },
];

/**
 * Render whichever dev content page the shell asks for. Lives in the dev chunk
 * so the eagerly-loaded App never names ContentPage / NewHeroPage /
 * AudioAuditionPage / ../contentApi. `onNavigate` lets the 新英雄模板 wizard
 * deep-link into 英雄管理 after a successful create.
 */
export function renderContentDevPage(
  page: string,
  onNavigate?: (page: string, selectId?: string) => void,
): React.JSX.Element | null {
  if (page === "audio") return <AudioAuditionPage />;
  if (page === "newHero") return <NewHeroPageRoot onNavigate={onNavigate} />;
  if (page === "voxelStudio") return <VoxelStudioPageRoot onNavigate={onNavigate} />;
  const route = CONTENT_ROUTES.find((r) => r.page === page && r.only !== undefined);
  if (route === undefined) return null;
  return <ContentPageRoot only={route.only} />;
}

/**
 * What App.tsx's dev-gated dynamic import actually mounts. Constructing the
 * write API HERE — inside the lazily-imported chunk — is the point: nothing in
 * the eagerly-loaded shell so much as names ../contentApi, so a production
 * build has no reference to pull the module in.
 */
export function ContentPageRoot({ only }: { only?: readonly EditCollection[] } = {}): React.JSX.Element {
  const api = useMemo(() => createContentEditApi(), []);
  const icons = useMemo(() => createIconApi(), []);
  return <ContentPage api={api} icons={icons} only={only} />;
}

export function ContentPage({ api, icons, only }: ContentPageProps): React.JSX.Element {
  const TABS = useMemo<readonly EditCollection[]>(
    () => (only && only.length > 0 ? only : ALL_TABS),
    [only],
  );
  const [tab, setTab] = useState<EditCollection>(() => TABS[0] ?? "champions");
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const [cv, setCv] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [createMsg, setCreateMsg] = useState<{ text: string; tone: Tone } | null>(null);
  const [creating, setCreating] = useState(false);

  // ---- the browse list -----------------------------------------------------
  // Read through the STATIC /content mount, not the content-api: the list must
  // still render when the dev service is down (browsing is not editing), and
  // that path is the one already proven at 554-doc scale by the curation page.
  const reloadList = useCallback(
    (which: EditCollection) => {
      setLoading(true);
      setListError(null);
      setRows([]);
      loadCollection(which, { onProgress: (r) => setRows(r) })
        .then((r) => setRows(r))
        .catch((e: unknown) => setListError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    },
    [],
  );

  // ---- auto icon generation (task #186) ------------------------------------
  // The console must not create letter tiles. `useIconGen` owns a queue+poll
  // against the loopback icon daemon; `gen.request` is FIRE-AND-FORGET by
  // contract, so nothing below can put a GPU on the save path. When a job
  // finishes it wrote a WebP (and, off the augment path, the doc's `icon`
  // field), so the list re-reads and the art actually appears.
  const iconApi = useMemo(() => icons ?? createIconApi(), [icons]);
  const gen = useIconGen(
    iconApi,
    useCallback(() => reloadList(tab), [reloadList, tab]),
  );

  useEffect(() => {
    reloadList(tab);
    setSelectedId(null);
    setNewId("");
    setCreateMsg(null);
  }, [tab, reloadList]);

  const refreshStatus = useCallback(() => {
    void api.probe().then(setApiUp);
    void api.contentVersion().then(setCv);
  }, [api]);

  useEffect(() => refreshStatus(), [refreshStatus]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return rows;
    return rows.filter((r) => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [rows, query]);

  // ---- create a NEW document (augments) ------------------------------------
  const createNew = useCallback(() => {
    const id = newId.trim();
    if (id === "") return;
    if (rows.some((r) => r.id === id)) {
      setCreateMsg({ text: `已經有一個叫 ${id} 的了，換個 id。`, tone: "err" });
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    void (async () => {
      const r = await api.create(tab, id, skeletonDoc(tab, id));
      setCreating(false);
      if (!r.ok) {
        const detail = r.issues.length > 0 ? r.issues.map((i) => `${i.path} ${i.message}`).join("；") : r.error;
        setCreateMsg({ text: `新增失敗：${detail ?? "未知錯誤"}`, tone: "err" });
        return;
      }
      setCreateMsg({
        text:
          `已新增 ${id}，右邊直接編輯。` +
          (gen.mode === "live"
            ? "圖示已排入自動產生，不用等它。"
            : gen.mode === "readonly"
              ? "（圖示待補：產圖服務未啟動，先用文字方塊顯示。）"
              : ""),
        tone: "ok",
      });
      setNewId("");
      reloadList(tab);
      refreshStatus();
      setSelectedId(id);
      // #186 — THE SEAM. Fired AFTER the doc exists and AFTER the success
      // message is on screen, and never awaited: a two-pass render is
      // seconds-to-minutes and the owner is mid-typing. A failed or skipped
      // generation leaves a perfectly valid document; it can never leave a
      // half-created one, because the document is already written.
      gen.request(tab, id);
    })();
  }, [api, tab, newId, rows, reloadList, refreshStatus, gen]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      <Header
        apiUp={apiUp}
        cv={cv}
        offMessage={api.enabled ? null : api.offMessage}
        onRefresh={refreshStatus}
      />

      {TABS.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <Btn key={t} kind={t === tab ? "primary" : "ghost"} onClick={() => setTab(t)}>
              {COLLECTION_LABEL[t]}
              <span style={{ color: TEXT_DIM, marginLeft: 6, fontWeight: 400 }}>
                {t === tab ? rows.length : ""}
              </span>
            </Btn>
          ))}
        </div>
      )}

      <ErrorBanner text={listError} />

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, minHeight: 0, flex: 1 }}>
        <Panel title={`${COLLECTION_LABEL[tab]} 清單`} style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <TextInput value={query} onChange={setQuery} placeholder="搜尋 id 或名稱…" />
          {CREATABLE.has(tab) && api.enabled && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <TextInput value={newId} onChange={setNewId} placeholder={`新${COLLECTION_LABEL[tab]} id`} />
                <Btn small kind="primary" onClick={createNew} disabled={creating || newId.trim() === ""}>
                  ＋新增
                </Btn>
              </div>
              {createMsg !== null && (
                <div
                  style={{
                    fontSize: 11,
                    color: createMsg.tone === "ok" ? OK : createMsg.tone === "warn" ? WARN : DANGER,
                  }}
                >
                  {createMsg.text}
                </div>
              )}
            </div>
          )}
          {/* #186: the auto-icon progress surface. Rendered for EVERY tab, not
              only the creatable one — 補圖 applies to any doc that lost its art,
              and the「服務沒開，圖示待補」sentence must be visible before the
              owner wonders why nothing happened. Absent entirely when the gate
              is off (IconGenStrip returns null). */}
          <div style={{ marginTop: 8 }}>
            <IconGenStrip gen={gen} />
          </div>
          <div style={{ fontSize: 11, color: TEXT_DIM, margin: "8px 0" }}>
            {loading ? "載入中…" : `${filtered.length} / ${rows.length}`}
          </div>
          <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
            {filtered.map((r) => (
              <ListRow
                key={r.id}
                row={r}
                active={r.id === selectedId}
                onClick={() => setSelectedId(r.id)}
              />
            ))}
          </div>
        </Panel>

        <div style={{ minHeight: 0, overflow: "auto" }}>
          {selectedId === null ? (
            <Panel title="詳細內容">
              <div style={{ color: TEXT_DIM, fontSize: 13 }}>
                從左邊挑一個{COLLECTION_LABEL[tab]}，右邊會顯示完整欄位並可直接編輯。
              </div>
            </Panel>
          ) : (
            <DocEditor
              key={`${tab}:${selectedId}`}
              api={api}
              gen={gen}
              collection={tab}
              id={selectedId}
              canDelete={DELETABLE.has(tab)}
              onSaved={() => {
                reloadList(tab);
                refreshStatus();
              }}
              onDeleted={() => {
                setSelectedId(null);
                reloadList(tab);
                refreshStatus();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header(props: {
  apiUp: boolean | null;
  cv: string | null;
  offMessage: string | null;
  onRefresh: () => void;
}): React.JSX.Element {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18, color: TEXT_MAIN }}>內容管理</h2>
        <Badge color={props.apiUp === true ? OK : props.apiUp === false ? DANGER : TEXT_DIM}>
          content-api {props.apiUp === true ? "已連線" : props.apiUp === false ? "未連線" : "檢查中"}
        </Badge>
        {props.cv !== null && <Badge color={GOLD}>{props.cv}</Badge>}
        <Btn small onClick={props.onRefresh}>
          重新檢查
        </Btn>
      </div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6, lineHeight: 1.7 }}>
        編輯只在本機（127.0.0.1）成立：這個主控台的 dev server 綁定 loopback 並拒絕 --host，
        content-api 也只聽 loopback 並逐次檢查連線對端。遊戲用的 :39527 沒有這條路由，所以
        手機連進來也拿不到寫入權限。
      </div>
      {props.apiUp === false && (
        <div style={{ fontSize: 12, color: WARN, marginTop: 6 }}>
          content-api 沒有回應——清單仍可瀏覽，但無法儲存。啟動方式：
          <code style={{ marginLeft: 6 }}>pnpm --filter @ggd/content-api dev</code>
        </div>
      )}
      {props.offMessage !== null && (
        <div style={{ fontSize: 12, color: DANGER, marginTop: 6 }}>{props.offMessage}</div>
      )}
    </div>
  );
}

function ListRow(props: {
  row: ContentRow;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const icon = contentAssetUrl(props.row.icon);
  return (
    <button
      onClick={props.onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 8px",
        marginBottom: 2,
        borderRadius: 6,
        border: props.active ? `1px solid ${ACCENT}` : "1px solid transparent",
        background: props.active ? "#1b2338" : "transparent",
        color: props.active ? TEXT_MAIN : TEXT_DIM,
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      {icon !== null ? (
        <img src={icon} alt="" width={22} height={22} style={{ borderRadius: 4, flexShrink: 0 }} />
      ) : (
        <span style={{ width: 22, height: 22, flexShrink: 0 }} />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {props.row.name}
        <span style={{ color: TEXT_DIM, marginLeft: 6, fontSize: 10 }}>{props.row.id}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// one document: load → edit → preview → confirm → write
// ---------------------------------------------------------------------------

function DocEditor(props: {
  api: ContentEditApi;
  /** #186 — the icon daemon handle, so one document can ask for its own art */
  gen: IconGen;
  collection: EditCollection;
  id: string;
  canDelete: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}): React.JSX.Element {
  const { api, collection, id } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [issues, setIssues] = useState<readonly EditIssue[]>([]);
  const [pending, setPending] = useState<readonly WritePlanStep[] | null>(null);
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null);
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<readonly BackupEntry[]>([]);
  const [championDoc, setChampionDoc] = useState<Record<string, unknown> | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ---- load the LIVE bytes, never the cached /content copy ------------------
  const reload = useCallback(() => {
    setLoadError(null);
    setDraft(EMPTY_DRAFT);
    setIssues([]);
    setPending(null);
    void api.fetchDoc(collection, id).then((r) => {
      if (!alive.current) return;
      setDoc(r.doc);
      setLoadError(r.error);
    });
    void api.backups(collection, id).then((b) => {
      if (alive.current) setBackups(b);
    });
  }, [api, collection, id]);

  useEffect(() => reload(), [reload]);

  // ---- the mirror twin: an ability's champion -------------------------------
  // ids follow `<championId>.<slot>` ("godie-e001.q"), so the owner is a string
  // slice — but the AUTHORITY is embeddedSlotOf() below, which reads the
  // champion's actual `abilities` map. A guessed id that turns out not to embed
  // this ability simply produces no mirror step.
  useEffect(() => {
    if (collection !== "abilities") {
      setChampionDoc(null);
      return;
    }
    const dot = id.lastIndexOf(".");
    if (dot <= 0) {
      setChampionDoc(null);
      return;
    }
    void api.fetchDoc("champions", id.slice(0, dot)).then((r) => {
      if (alive.current) setChampionDoc(r.doc);
    });
  }, [api, collection, id]);

  const working = useMemo(
    () => (doc === null ? null : applyEdits(draft.whole ?? doc, draft.edits)),
    [doc, draft.edits, draft.whole],
  );

  const changes: DocChange[] = useMemo(
    () => (doc === null || working === null ? [] : diffDocs(doc, working)),
    [doc, working],
  );
  const dirty = changes.length > 0;
  const hasParseErrors = Object.keys(draft.parseErrors).length > 0;

  const mirrorSlot = useMemo(
    () => (collection === "abilities" ? embeddedSlotOf(championDoc, id) : null),
    [collection, championDoc, id],
  );

  const setField = useCallback((path: string, kind: FieldKind, text: string) => {
    setStatus(null);
    setPending(null);
    setDraft((prev) => {
      const parsed = parseField(kind, text);
      const raw = { ...prev.raw, [path]: text };
      const edits = { ...prev.edits };
      const parseErrors = { ...prev.parseErrors };
      if (parsed.ok) {
        edits[path] = parsed.value;
        delete parseErrors[path];
      } else {
        parseErrors[path] = parsed.error;
      }
      return { ...prev, raw, edits, parseErrors };
    });
  }, []);

  const setWhole = useCallback((text: string) => {
    setStatus(null);
    setPending(null);
    setDraft((prev) => {
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return { ...prev, wholeError: "最外層必須是 JSON 物件" };
        }
        // a whole-document paste supersedes the field edits: keeping both would
        // silently re-apply stale inputs over the pasted text.
        return {
          edits: {},
          raw: {},
          parseErrors: {},
          whole: parsed as Record<string, unknown>,
          wholeError: null,
        };
      } catch (e) {
        return { ...prev, wholeError: e instanceof Error ? e.message : String(e) };
      }
    });
  }, []);

  const discard = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setIssues([]);
    setPending(null);
    setStatus(null);
  }, []);

  // ---- step 1: dry-run validate and build the write plan -------------------
  const preview = useCallback(() => {
    if (working === null) return;
    setBusy(true);
    setStatus(null);
    const steps = api.plan(collection, id, working, championDoc);
    void (async () => {
      const found: EditIssue[] = [];
      let transport: string | null = null;
      for (const step of steps) {
        const r = await api.validate(step.collection, step.id, step.doc);
        if (r.error !== null) transport = r.error;
        found.push(...r.issues);
      }
      if (!alive.current) return;
      setBusy(false);
      setIssues(found);
      if (transport !== null) {
        setStatus({ text: transport, tone: "err" });
        setPending(null);
        return;
      }
      if (found.length > 0) {
        setStatus({ text: `${found.length} 個欄位不符合 schema，尚未寫入任何東西。`, tone: "err" });
        setPending(null);
        return;
      }
      setPending(steps);
      setStatus({ text: "檢查通過。確認下面的差異後再寫入。", tone: "ok" });
    })();
  }, [api, collection, id, working, championDoc]);

  // ---- step 2: write ------------------------------------------------------
  const commit = useCallback(() => {
    if (pending === null) return;
    setBusy(true);
    void (async () => {
      const outcome = await api.save(pending);
      if (!alive.current) return;
      setBusy(false);
      setIssues(outcome.issues);
      if (!outcome.ok) {
        const partial =
          outcome.written.length > 0
            ? `⚠ 已經寫入 ${outcome.written.length} 個檔案就失敗了，內容可能不一致。備份：` +
              outcome.written.map((w) => w.backup ?? "（無）").join(", ")
            : "";
        setStatus({ text: `${outcome.error ?? "寫入失敗"} ${partial}`.trim(), tone: "err" });
        return;
      }
      setPending(null);
      setStatus({
        text:
          `已寫入 ${outcome.written.length} 個檔案` +
          (outcome.contentVersion !== null
            ? `，新的 contentVersion = ${outcome.contentVersion}。進行中的對戰仍在跑舊內容，要重開一場才會生效。`
            : "。"),
        tone: "ok",
      });
      props.onSaved();
      reload();
    })();
  }, [api, pending, props, reload]);

  const restore = useCallback(
    (file?: string) => {
      setBusy(true);
      void (async () => {
        const r = await api.restore(collection, id, file);
        if (!alive.current) return;
        setBusy(false);
        setStatus(
          r.ok
            ? {
                text:
                  `已復原 ${r.restored ?? "最近一次備份"}` +
                  (r.contentVersion !== null ? `，contentVersion = ${r.contentVersion}` : ""),
                tone: "ok",
              }
            : { text: r.error ?? "復原失敗", tone: "err" },
        );
        if (r.ok) {
          props.onSaved();
          reload();
        }
      })();
    },
    [api, collection, id, props, reload],
  );

  const deleteThis = useCallback(() => {
    setBusy(true);
    void (async () => {
      const r = await api.remove(collection, id);
      if (!alive.current) return;
      setBusy(false);
      setConfirmDelete(false);
      if (!r.ok) {
        setStatus({ text: r.error ?? "刪除失敗", tone: "err" });
        return;
      }
      // deleted — the parent clears the selection and reloads the list. The
      // server snapshotted the bytes first, so this is recoverable from the
      // 備份／復原 panel of any sibling doc if it was a mistake.
      props.onDeleted();
    })();
  }, [api, collection, id, props]);

  if (loadError !== null && doc === null) {
    return (
      <Panel title={id}>
        <ErrorBanner text={loadError} />
        <Btn small onClick={reload}>
          重試
        </Btn>
      </Panel>
    );
  }
  if (doc === null || working === null) {
    return (
      <Panel title={id}>
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>載入中…</div>
      </Panel>
    );
  }

  const issueFor = (path: string): string[] =>
    issues.filter((i) => i.path === path).map((i) => i.message);
  const extras = uncoveredKeys(collection, doc);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel
        title={`${COLLECTION_LABEL[collection]}／${typeof doc["name"] === "string" ? doc["name"] : id}`}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <Badge color={dirty ? WARN : TEXT_DIM}>{dirty ? `${changes.length} 處未儲存` : "未修改"}</Badge>
          {mirrorSlot !== null && (
            <Badge color={ACCENT}>
              連動寫入 champions/{String(championDoc?.["id"] ?? "?")} 的 {mirrorSlot} 槽
            </Badge>
          )}
          {collection === "abilities" && mirrorSlot === null && (
            <Badge color={TEXT_DIM}>沒有嵌入副本（EX 或未掛在英雄上）</Badge>
          )}
          <div style={{ flex: 1 }} />
          {/* #186. `hasIcon` drives BOTH the label and the force flag, so 重畫
              can only ever redraw art this pipeline made — the daemon refuses to
              overwrite w3x / hand-picked art whatever this sends. Augments have
              no `icon` field by schema, so they always read 補圖示 and the daemon
              answers 已經有圖 if the conventional WebP is already there. */}
          <IconGenButton
            gen={props.gen}
            collection={collection}
            id={id}
            hasIcon={typeof doc["icon"] === "string" && doc["icon"] !== ""}
          />
          <Btn small onClick={reload} disabled={busy}>
            重新載入
          </Btn>
          <Btn small onClick={discard} disabled={busy || !dirty}>
            捨棄修改
          </Btn>
          <Btn small kind="primary" onClick={preview} disabled={busy || !dirty || hasParseErrors || !api.enabled}>
            檢查並預覽
          </Btn>
          {props.canDelete && api.enabled && (
            confirmDelete ? (
              <>
                <Btn small kind="danger" onClick={deleteThis} disabled={busy}>
                  確認刪除
                </Btn>
                <Btn small onClick={() => setConfirmDelete(false)} disabled={busy}>
                  取消
                </Btn>
              </>
            ) : (
              <Btn small kind="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                刪除
              </Btn>
            )
          )}
        </div>

        {hasParseErrors && (
          <div style={{ color: DANGER, fontSize: 12, marginBottom: 8 }}>
            有欄位還不是合法的值，先修好才能預覽。
          </div>
        )}
        {status !== null && (
          <div
            style={{
              fontSize: 12,
              marginBottom: 10,
              color: status.tone === "ok" ? OK : status.tone === "warn" ? WARN : DANGER,
            }}
          >
            {status.text}
          </div>
        )}

        {fieldGroups(collection).map((group) => (
          <section key={group.title} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 8 }}>
              {group.title}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {group.fields.map((spec) => (
                <FieldRow
                  key={spec.path}
                  spec={spec}
                  value={getAt(working, spec.path)}
                  raw={draft.raw[spec.path]}
                  parseError={draft.parseErrors[spec.path]}
                  issues={issueFor(spec.path)}
                  disabled={busy || !api.enabled}
                  onChange={(text) => setField(spec.path, spec.kind, text)}
                />
              ))}
            </div>
          </section>
        ))}

        {extras.length > 0 && (
          <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.7 }}>
            這份文件另外有 <span style={{ color: WARN }}>{extras.join("、")}</span>{" "}
            沒有對應的表單欄位（結構太深，例如技能的 effects 或英雄的 abilities）。
            要改它們請用下面的「原始 JSON」——一樣會經過同一套 schema 驗證。
          </div>
        )}
      </Panel>

      {issues.length > 0 && <IssuePanel issues={issues} />}

      {pending !== null && (
        <ConfirmPanel
          steps={pending}
          changes={changes}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={commit}
        />
      )}

      <Panel title="原始 JSON（進階，整份覆蓋）">
        <Btn small onClick={() => setRawOpen((v) => !v)}>
          {rawOpen ? "收起" : "展開"}
        </Btn>
        {rawOpen && (
          <>
            <textarea
              defaultValue={JSON.stringify(working, null, 2)}
              onChange={(e) => setWhole(e.target.value)}
              spellCheck={false}
              rows={24}
              disabled={!api.enabled}
              style={{
                width: "100%",
                marginTop: 8,
                boxSizing: "border-box",
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${draft.wholeError === null ? "#2c3448" : DANGER}`,
                background: "#10141f",
                color: TEXT_MAIN,
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            />
            {draft.wholeError !== null && (
              <div style={{ color: DANGER, fontSize: 12 }}>JSON 解析失敗：{draft.wholeError}</div>
            )}
          </>
        )}
      </Panel>

      <BackupPanel
        backups={backups}
        busy={busy || !api.enabled}
        onRestore={restore}
        onRefresh={() => void api.backups(collection, id).then((b) => alive.current && setBackups(b))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function FieldRow(props: {
  spec: FieldSpec;
  value: unknown;
  raw: string | undefined;
  parseError: string | undefined;
  issues: readonly string[];
  disabled: boolean;
  onChange: (text: string) => void;
}): React.JSX.Element {
  const { spec } = props;
  // the user's own text wins while they are typing; otherwise render the stored
  // value. Without this a half-typed "1." collapses to "1" under their cursor.
  const shown = props.raw ?? formatField(spec.kind, props.value);
  const bad = props.parseError !== undefined || props.issues.length > 0;
  const common: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 9px",
    borderRadius: 7,
    border: `1px solid ${bad ? DANGER : "#2c3448"}`,
    background: spec.readOnly === true ? "#0c1018" : "#10141f",
    color: spec.readOnly === true ? TEXT_DIM : TEXT_MAIN,
    fontSize: 12,
    outline: "none",
    fontFamily: "inherit",
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 10, alignItems: "start" }}>
      <label style={{ fontSize: 12, color: TEXT_DIM, paddingTop: 7 }}>{spec.label}</label>
      <div>
        {spec.kind === "multiline" || spec.kind === "json" ? (
          <textarea
            value={shown}
            rows={spec.kind === "json" ? 10 : 5}
            readOnly={spec.readOnly === true}
            disabled={props.disabled}
            onChange={(e) => props.onChange(e.target.value)}
            style={{ ...common, resize: "vertical", lineHeight: 1.6 }}
          />
        ) : (
          <input
            value={shown}
            readOnly={spec.readOnly === true}
            disabled={props.disabled}
            onChange={(e) => props.onChange(e.target.value)}
            style={common}
          />
        )}
        {spec.hint !== undefined && (
          <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 3 }}>{spec.hint}</div>
        )}
        {props.parseError !== undefined && (
          <div style={{ fontSize: 11, color: DANGER, marginTop: 3 }}>{props.parseError}</div>
        )}
        {props.issues.map((m) => (
          <div key={m} style={{ fontSize: 11, color: DANGER, marginTop: 3 }}>
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

function IssuePanel(props: { issues: readonly EditIssue[] }): React.JSX.Element {
  return (
    <Panel title="Schema 驗證問題（尚未寫入任何檔案）">
      <div style={{ display: "grid", gap: 6 }}>
        {props.issues.map((i, n) => (
          <div key={`${i.path}:${n}`} style={{ fontSize: 12, color: DANGER }}>
            <code style={{ color: GOLD }}>{i.path === "" ? "(整份文件)" : i.path}</code> — {i.message}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ConfirmPanel(props: {
  steps: readonly WritePlanStep[];
  changes: readonly DocChange[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  return (
    <Panel title="即將覆蓋這些內容">
      <div style={{ fontSize: 12, color: WARN, marginBottom: 10, lineHeight: 1.7 }}>
        這個專案還沒有版本控制（#65），寫下去就是直接覆蓋磁碟上的檔案。伺服器會在覆蓋前先備份，
        下面的「備份／復原」可以還原——但請先看清楚差異。
      </div>

      <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 6 }}>
        寫入計畫（{props.steps.length} 個檔案）
      </div>
      <div style={{ display: "grid", gap: 4, marginBottom: 14 }}>
        {props.steps.map((s) => (
          <div key={`${s.collection}/${s.id}`} style={{ fontSize: 12, color: TEXT_MAIN }}>
            <code>{`content/${s.collection}/${s.id}.json`}</code>
            <span style={{ color: s.reason === "mirror" ? ACCENT : TEXT_DIM, marginLeft: 8 }}>
              {s.reason === "mirror" ? "連動：模擬器讀的是英雄裡的嵌入副本" : "主要編輯"}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 6 }}>
        差異（{props.changes.length} 處）
      </div>
      <div style={{ display: "grid", gap: 6, maxHeight: 320, overflow: "auto", marginBottom: 14 }}>
        {props.changes.map((c) => (
          <div key={c.path} style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
            <div style={{ color: GOLD }}>{c.path === "" ? "(整份文件)" : c.path}</div>
            <div style={{ color: DANGER, wordBreak: "break-all" }}>- {c.before}</div>
            <div style={{ color: OK, wordBreak: "break-all" }}>+ {c.after}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind="danger" onClick={props.onConfirm} disabled={props.busy}>
          確認寫入
        </Btn>
        <Btn onClick={props.onCancel} disabled={props.busy}>
          取消
        </Btn>
      </div>
    </Panel>
  );
}

function BackupPanel(props: {
  backups: readonly BackupEntry[];
  busy: boolean;
  onRestore: (file?: string) => void;
  onRefresh: () => void;
}): React.JSX.Element {
  return (
    <Panel title="備份／復原（沒有 git，這就是你的 undo）">
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <Btn small onClick={props.onRefresh} disabled={props.busy}>
          重新整理
        </Btn>
        <Btn
          small
          kind="primary"
          onClick={() => props.onRestore()}
          disabled={props.busy || props.backups.length === 0}
        >
          復原上一次儲存
        </Btn>
      </div>
      {props.backups.length === 0 ? (
        <div style={{ fontSize: 12, color: TEXT_DIM }}>還沒有備份（這份文件尚未被這裡覆蓋過）。</div>
      ) : (
        <div style={{ display: "grid", gap: 4, maxHeight: 220, overflow: "auto" }}>
          {props.backups.map((b) => (
            <div
              key={b.file}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 11,
                color: TEXT_DIM,
                borderBottom: PANEL_BORDER,
                paddingBottom: 4,
              }}
            >
              <code style={{ color: TEXT_MAIN }}>{b.file}</code>
              <span>{b.at > 0 ? new Date(b.at).toLocaleString() : ""}</span>
              <span>{b.bytes} bytes</span>
              <div style={{ flex: 1 }} />
              <Btn small onClick={() => props.onRestore(b.file)} disabled={props.busy}>
                復原這一份
              </Btn>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 8, background: PANEL_BG }}>
        復原本身也會先備份目前的內容，所以「復原的復原」也還在。
      </div>
    </Panel>
  );
}
