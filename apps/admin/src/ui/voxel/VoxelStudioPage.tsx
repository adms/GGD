/**
 * 鑄形工坊 (Project Voxel Forge) — the 體素角色生成器 studio, owner directive
 * #229. Sibling of 鑄技工坊 (Project Skill Forge): that one forges 技 (skills),
 * this one forges 形 (form).
 *
 * ── IT DRIVES THE SAME GENERATOR THE GAME SHIPS ─────────────────────────────
 * Every shape decision on this page comes from `@ggd/shared/voxel` — the same
 * `buildFigure` / `sampleClip` / `toModelDoc` that the offline bake
 * (`tools/voxel-gen`, task #226) and the client consume. There is no
 * admin-only look-alike generator anywhere in this directory; `voxelMeshes.ts`
 * is a mechanical translation of the shared figure into Babylon nodes and makes
 * no shape decisions of its own. That is the owner's 「不要 fork 第二個產生器」
 * requirement, expressed as an import graph rather than a promise.
 *
 * ── THE SAVE IS THE EXISTING GATE, UNCHANGED ────────────────────────────────
 * This page adds NO write path. It constructs `createContentEditApi()` inside
 * the dev chunk (the NewHeroPage pattern), plans exactly one `models` write,
 * dry-run validates it server-side with the shared zod schemas, shows the diff,
 * and only then writes — undo snapshot first, contentVersion back. It never
 * names `/content-api/` (that literal lives only in `editModel.docUrl`), so the
 * contentGate walk that proves `contentApi.ts` is the console's only mutating
 * module stays green without modification. A production build contains none of
 * this: the chunk is unreachable behind App.tsx's `import.meta.env.DEV` guard
 * and is therefore never emitted.
 *
 * ── TWO PHASES, SAID OUT LOUD ───────────────────────────────────────────────
 * Saving writes PARAMETERS. The .glb is produced offline by `pnpm voxel:gen`,
 * which is deterministic and sha256-pinned. The studio therefore writes no
 * binary at all, so the content-api's image allowlist is untouched and no
 * upload route exists — and the page says so in a banner rather than letting an
 * operator wonder why the champion did not change in game.
 *
 * ── IP ──────────────────────────────────────────────────────────────────────
 * All geometry is axis-aligned boxes emitted from numbers written for this
 * project. There is no import, upload or file-picker control on this page and
 * `@babylonjs/loaders` is not a dependency of this app, so the studio is
 * structurally incapable of ingesting a third-party model, skin or texture.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  CLIP_STATES,
  DEFAULT_LOOK,
  buildFigure,
  lookForChampion,
  lookFromArchetype,
  toModelDoc,
  type ClipState,
  type VoxelLook,
} from "@ggd/shared/voxel";
import { diffDocs } from "@ggd/shared/content/editModel";
import { createContentEditApi, type ContentEditApi, type EditIssue } from "../../contentApi";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "../widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import {
  ArchetypePicker,
  PaletteControls,
  PropControls,
  ProportionControls,
  ScalarControls,
  SectionTitle,
} from "./controls";
import { useDebounced } from "./useDebounced";
import {
  BAKE_COMMAND,
  STUDIO_COLLECTION,
  bakeNotice,
  canSave,
  studioDocId,
  studioGlbPath,
  studioIssues,
  studioReadout,
  studioWritePlan,
} from "./studioModel";

/** The nav entry — lives in this dev chunk so a prod build lacks even the label. */
export const VOXEL_NAV = { page: "voxelStudio", label: "鑄形工坊", emoji: "🧱" } as const;

/**
 * Babylon behind a second lazy boundary so opening 英雄管理 does not pull ~1 MB
 * of engine into the dev content chunk. Convenience, not security: the gate is
 * App.tsx's DEV-guarded `import("./ContentPage")`.
 */
const VoxelCanvas = lazy(async () => {
  const m = await import("./VoxelCanvas");
  return { default: m.VoxelCanvas };
});

/** The four team colours, mirrored from ChampionView.TEAM_COLORS (#49). */
const TEAM_COLORS: readonly (readonly [number, number, number])[] = [
  [0.25, 0.45, 0.95],
  [0.92, 0.28, 0.25],
  [0.28, 0.8, 0.42],
  [0.95, 0.78, 0.22],
];
const TEAM_LABEL = ["藍", "紅", "綠", "金"];

const CLIP_LABEL: Readonly<Record<ClipState, string>> = {
  idle: "待機",
  run: "跑動",
  attack: "攻擊",
  cast: "施法",
  hurt: "受擊",
  death: "死亡",
};

const NARROW_QUERY = "(max-width: 980px)";

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => globalThis.matchMedia?.(NARROW_QUERY).matches ?? false,
  );
  useEffect(() => {
    const mq = globalThis.matchMedia?.(NARROW_QUERY);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent): void => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

/** Dev-chunk root: the write API is constructed HERE, never in the shell. */
export function VoxelStudioPageRoot(props: {
  onNavigate?: (page: string, selectId?: string) => void;
}): React.JSX.Element {
  const api = useMemo(() => createContentEditApi(), []);
  return <VoxelStudioPage api={api} onNavigate={props.onNavigate} />;
}

type Phase = "edit" | "confirm";
type Tone = "ok" | "err";

export interface VoxelStudioPageProps {
  api: ContentEditApi;
  onNavigate?: (page: string, selectId?: string) => void;
}

export function VoxelStudioPage({ api, onNavigate }: VoxelStudioPageProps): React.JSX.Element {
  const narrow = useIsNarrow();

  const [look, setLook] = useState<VoxelLook>(DEFAULT_LOOK);
  const [name, setName] = useState("");
  const [seedId, setSeedId] = useState("");

  const [clip, setClip] = useState<ClipState>("idle");
  const [playing, setPlaying] = useState(true);
  const [phaseT, setPhaseT] = useState(0);
  const [team, setTeam] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [showCollision, setShowCollision] = useState(false);

  const [step, setStep] = useState<Phase>("edit");
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<readonly EditIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null);
  const [existing, setExisting] = useState<Record<string, unknown> | null>(null);

  // The preview lags the sliders by 120 ms so dragging stays smooth; the DOC is
  // computed from the LIVE look, so the JSON pane never shows a stale document.
  const previewLook = useDebounced(look, 120);
  const figure = useMemo(() => buildFigure(previewLook), [previewLook]);
  const readout = useMemo(() => studioReadout(look), [look]);

  const id = studioDocId(name);
  const doc = useMemo(
    () => (id === "" ? null : toModelDoc(id, look)),
    [id, look],
  );
  const preIssues = useMemo(() => studioIssues(name, look), [name, look]);
  const saveable = canSave(name, look) && api.enabled && !busy;

  /** #64's flash is a pulse, not a toggle — hold it for the same beat the game does. */
  const pulseFlash = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
  }, []);

  const resetSave = useCallback(() => {
    setStep("edit");
    setIssues([]);
    setError(null);
  }, []);

  /** Step 1 — plan + server dry-run. Nothing is written here. */
  const check = useCallback(async () => {
    if (doc === null) return;
    setBusy(true);
    setIssues([]);
    setError(null);
    setStatus(null);
    try {
      const prior = await api.fetchDoc(STUDIO_COLLECTION, id);
      setExisting(prior.doc);
      const v = await api.validate(
        STUDIO_COLLECTION,
        id,
        doc as unknown as Record<string, unknown>,
      );
      if (v.error !== null) {
        setError(v.error);
        return;
      }
      if (!v.ok) {
        setIssues(v.issues);
        return;
      }
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  }, [api, doc, id]);

  /** Step 2 — the write. One step, `models`, through the same gate as everything else. */
  const write = useCallback(async () => {
    if (doc === null) return;
    setBusy(true);
    setError(null);
    try {
      const steps = studioWritePlan(id, look);
      const outcome =
        existing === null
          ? await api
              .create(STUDIO_COLLECTION, id, doc as unknown as Record<string, unknown>)
              .then((r) => ({
                ok: r.ok,
                issues: r.issues,
                error: r.error,
                contentVersion: r.contentVersion,
              }))
          : await api.save(steps).then((r) => ({
              ok: r.ok,
              issues: r.issues,
              error: r.error,
              contentVersion: r.contentVersion,
            }));
      if (!outcome.ok) {
        setIssues(outcome.issues);
        setError(outcome.error);
        return;
      }
      setStatus({ text: bakeNotice(id, outcome.contentVersion), tone: "ok" });
      setStep("edit");
      setExisting(doc as unknown as Record<string, unknown>);
    } finally {
      setBusy(false);
    }
  }, [api, doc, existing, id, look]);

  const changes = useMemo(
    () => (doc === null ? [] : diffDocs(existing ?? undefined, doc).slice(0, 40)),
    [existing, doc],
  );

  const columns = narrow ? "1fr" : "300px minmax(0, 1fr) 320px";

  return (
    <div style={{ padding: narrow ? 12 : 18, color: TEXT_MAIN }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>🧱 鑄形工坊</h1>
      <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 12 }}>
        體素角色生成器。這裡調的每一個數字，就是遊戲裡那隻方塊人真正吃的參數——
        預覽用的是與離線烘焙 (<code>{BAKE_COMMAND}</code>) 完全相同的產生器。
      </div>

      {!api.enabled && <ErrorBanner text={api.offMessage} />}
      <ErrorBanner text={error} onDismiss={() => setError(null)} />

      <div style={{ display: "grid", gridTemplateColumns: columns, gap: 14, alignItems: "start" }}>
        {/* ---- left: the controls -------------------------------------- */}
        <Panel title="參數">
          <SectionTitle>原型</SectionTitle>
          <ArchetypePicker
            value={look.archetype}
            onPick={(key) => {
              setLook(lookFromArchetype(key));
              resetSave();
            }}
          />

          <SectionTitle>體型</SectionTitle>
          <ProportionControls look={look} onChange={(l) => { setLook(l); resetSave(); }} />
          <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4 }}>
            實測身高 {readout.height.toFixed(2)}u → 遊戲內固定 1.80u（#150 自動正規化，
            model@1.scale = {readout.docScale.toFixed(3)}）
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 11 }}>
            {readout.boxCount} 個方塊 / {readout.triCount} 三角面
          </div>

          <SectionTitle>配色</SectionTitle>
          <PaletteControls look={look} onChange={(l) => { setLook(l); resetSave(); }} />

          <SectionTitle>部件</SectionTitle>
          <PropControls look={look} onChange={(l) => { setLook(l); resetSave(); }} />

          <SectionTitle>動作與碰撞</SectionTitle>
          <ScalarControls look={look} onChange={(l) => { setLook(l); resetSave(); }} />

          <SectionTitle>以英雄 ID 生成</SectionTitle>
          <div style={{ display: "flex", gap: 6 }}>
            <TextInput value={seedId} onChange={setSeedId} placeholder="champ.sela" />
            <Btn
              onClick={() => {
                if (seedId.trim() === "") return;
                setLook(lookForChampion(seedId.trim(), look.archetype));
                resetSave();
              }}
            >
              生成
            </Btn>
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4 }}>
            用與遊戲相同的決定性種子還原某隻英雄的外觀，再手動微調。
          </div>
        </Panel>

        {/* ---- centre: the live preview -------------------------------- */}
        <Panel title="預覽">
          <Suspense
            fallback={
              <div style={{ color: TEXT_DIM, fontSize: 12, padding: 40, textAlign: "center" }}>
                載入 3D 預覽…
              </div>
            }
          >
            <VoxelCanvas
              figure={figure}
              clip={clip}
              playing={playing}
              phase={phaseT}
              teamTint={team === null ? null : (TEAM_COLORS[team] ?? null)}
              flash={flash}
              showCollision={showCollision}
              collisionRadius={look.collisionRadius}
              height={narrow ? 300 : 420}
            />
          </Suspense>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {CLIP_STATES.map((state) => (
              <Btn
                key={state}
                kind={clip === state ? "primary" : "ghost"}
                onClick={() => {
                  setClip(state);
                  setPlaying(true);
                }}
              >
                {CLIP_LABEL[state]}
              </Btn>
            ))}
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4 }}>
            六個動作永遠都在——clipMap 由產生器完整產生，不會有點不到的按鈕。
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <Btn kind="ghost" onClick={() => setPlaying((p) => !p)}>
              {playing ? "暫停" : "播放"}
            </Btn>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={phaseT}
              onChange={(e) => {
                setPlaying(false);
                setPhaseT(Number(e.target.value));
              }}
              style={{ flex: 1, accentColor: ACCENT }}
            />
            <span style={{ color: TEXT_DIM, fontSize: 11, width: 40, textAlign: "right" }}>
              {(phaseT * 100).toFixed(0)}%
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <Btn kind={team === null ? "primary" : "ghost"} onClick={() => setTeam(null)}>
              原色
            </Btn>
            {TEAM_LABEL.map((label, i) => (
              <Btn
                key={label}
                kind={team === i ? "primary" : "ghost"}
                onClick={() => setTeam(i)}
              >
                {label}隊
              </Btn>
            ))}
            <Btn kind="ghost" onClick={pulseFlash}>
              受擊閃光
            </Btn>
            <Btn kind="ghost" onClick={() => setShowCollision((v) => !v)}>
              {showCollision ? "隱藏碰撞圓柱" : "顯示碰撞圓柱"}
            </Btn>
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 6 }}>
            金色標尺就是 1.8u。人一定會剛好碰到頂——那是 #150 的保證，不是你的工作。
          </div>
        </Panel>

        {/* ---- right: the document + the save --------------------------- */}
        <Panel title="輸出">
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 4 }}>名稱</div>
            <TextInput
              value={name}
              onChange={(v) => {
                setName(v);
                resetSave();
              }}
              placeholder="例：zombie-grunt"
            />
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 11, marginBottom: 2 }}>
            id：<code style={{ color: TEXT_MAIN }}>{id === "" ? "（尚未命名）" : id}</code>
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 11, marginBottom: 10 }}>
            模型檔：
            <code style={{ color: TEXT_MAIN }}>{id === "" ? "—" : studioGlbPath(id)}</code>
            <br />
            （路徑由 id 推導，不可手填——填進 imported/ 底下會被自動轉 90°）
          </div>

          {preIssues.map((issue, i) => (
            <div
              key={i}
              style={{
                color: issue.level === "error" ? DANGER : WARN,
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              {issue.level === "error" ? "✖" : "▲"} {issue.text}
            </div>
          ))}

          {issues.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: DANGER, fontSize: 12, marginBottom: 4 }}>
                伺服器 schema 檢查未通過：
              </div>
              {issues.map((issue, i) => (
                <div key={i} style={{ color: DANGER, fontSize: 11 }}>
                  {issue.path}：{issue.message}
                </div>
              ))}
            </div>
          )}

          {status !== null && (
            <div
              style={{
                color: status.tone === "ok" ? OK : DANGER,
                fontSize: 12,
                border: PANEL_BORDER,
                borderRadius: 6,
                padding: 8,
                marginBottom: 8,
                lineHeight: 1.6,
              }}
            >
              {status.text}
            </div>
          )}

          {step === "edit" ? (
            <Btn kind="primary" disabled={!saveable} onClick={() => void check()}>
              檢查並預覽
            </Btn>
          ) : (
            <div>
              <div style={{ color: GOLD, fontSize: 12, marginBottom: 6 }}>
                即將覆蓋這些內容（{STUDIO_COLLECTION}/{id}）
              </div>
              <div
                style={{
                  maxHeight: 200,
                  overflow: "auto",
                  border: PANEL_BORDER,
                  borderRadius: 6,
                  padding: 6,
                  marginBottom: 8,
                }}
              >
                {changes.length === 0 ? (
                  <div style={{ color: TEXT_DIM, fontSize: 11 }}>（沒有變更）</div>
                ) : (
                  changes.map((c) => (
                    <div key={c.path} style={{ fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: TEXT_DIM }}>{c.path}</span>{" "}
                      <span style={{ color: DANGER }}>{c.before}</span>{" "}
                      <span style={{ color: OK }}>→ {c.after}</span>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn kind="primary" disabled={busy} onClick={() => void write()}>
                  確認寫入
                </Btn>
                <Btn kind="ghost" disabled={busy} onClick={resetSave}>
                  取消
                </Btn>
              </div>
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <Badge color={preIssues.some((i) => i.level === "error") ? DANGER : OK}>
              {preIssues.some((i) => i.level === "error") ? "尚未可存" : "model@1 合法"}
            </Badge>
          </div>

          <SectionTitle>文件內容</SectionTitle>
          <pre
            style={{
              maxHeight: 260,
              overflow: "auto",
              fontSize: 10,
              lineHeight: 1.5,
              color: TEXT_DIM,
              background: "#0b0e16",
              border: PANEL_BORDER,
              borderRadius: 6,
              padding: 8,
              margin: 0,
            }}
          >
            {doc === null ? "（先取個名字）" : JSON.stringify(doc, null, 2)}
          </pre>

          <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 8, lineHeight: 1.7 }}>
            存檔寫的是<b>參數</b>；.glb 由離線烘焙產生（決定性、sha256 釘住）。
            所以這頁一個 byte 的二進位都不會寫，content-api 的圖片白名單也不必放寬。
            {onNavigate !== undefined && (
              <>
                {" "}
                做好之後到{" "}
                <a
                  href="#champions"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate("champions");
                  }}
                  style={{ color: ACCENT }}
                >
                  英雄管理
                </a>{" "}
                把某隻英雄的 modelKey 指過來——但要先跑完烘焙，不然 modelTexture 測試會紅。
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
