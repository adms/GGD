/**
 * 角色語音生成 — the owner's spec step 4: 「將上述流程做成後台 UI 頁面，方便日後
 * 增加新角色可以手動一鍵生成與試聽」.
 *
 * DEV BUILDS ONLY. Reached through an `import.meta.env.DEV`-guarded dynamic
 * import in App.tsx, exactly like the content editor — so a production admin
 * build does not merely hide this page, it does not CONTAIN it, down to the nav
 * label (`VOICE_NAV` travels with this chunk).
 *
 * ── THE FOUR THINGS THIS PAGE MUST NOT GET WRONG ────────────────────────────
 *
 * 1. SCALE. 48 champions × 46 lines = 2,208 clips. The overview is 48 rows off
 *    ONE ~6 KB rollup; a champion's 46 lines are fetched only when opened; the
 *    cross-roster line view is windowed (`windowSlice`); audio is `preload
 *    ="none"` and only ever requested on play. Nothing here renders 2,208 rows
 *    and nothing here fetches 2,208 files.
 *
 * 2. PROGRESS MUST BE LEGIBLE AT ROSTER SCALE. The owner asked for this
 *    repeatedly (#97 exists for the icon side for exactly this reason). So:
 *    a per-champion segmented bar on every one of the 48 rows, a roster
 *    headline bar, and a live job panel with per-line current position and a
 *    measured ETA — never a bare global spinner.
 *
 * 3. ONE PLAYER AT A TIME. `useOnePlayer` owns a single `<audio>` for the whole
 *    page; opening a second clip stops the first.
 *
 * 4. THE STUB IS UNMISTAKABLE. While IndexTTS is still being installed the
 *    daemon returns fake clips, and a fake must never be able to pass as real
 *    output. This page carries three of the four stub layers: the page-top
 *    banner, the per-row red STUB chip (and one on the player), and the
 *    exclusion of stub clips from every 已完成 figure — plus the 驗收 button is
 *    disabled with the reason spelled out. The daemon 409s it anyway.
 *
 * NOTHING IS COUNTED HERE. Every number comes from ../voice/voiceModel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Btn, ErrorBanner, Panel, TextArea, TextInput } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { useVoiceGen, JOB_POLL_MS } from "../voice/useVoiceGen";
import * as api from "../voice/voiceApi";
import {
  CATEGORY_COUNT,
  schemaDrift,
  type LineSpec,
} from "../voice/categories";
import { DEMO_BANNER } from "../voice/demoData";
import {
  EMPTY_COUNTS,
  STATE_LABEL,
  canApproveLine,
  canGenerateLine,
  canPromoteTake,
  countsPartitionOk,
  etaMsOf,
  flattenLoaded,
  formatEta,
  inconsistentChampions,
  isJobActive,
  jobPercent,
  matchesFilter,
  progressOf,
  referenceGate,
  rosterSkipEstimate,
  rosterTotals,
  windowSlice,
  type ChampionStatus,
  type Job,
  type LineCounts,
  type LineRecord,
  type LineState,
  type RosterEntry,
  type StateFilter,
} from "../voice/voiceModel";

/** The nav entry — lives in THIS chunk so a prod build lacks even the label. */
export const VOICE_NAV = { page: "voiceGen", label: "角色語音生成", emoji: "🎙️" } as const;

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const TRACK = "#131a28";
const STUB_RED = "#ff5a4d";
/** The demo's own colour — never the stub's red, never a normal panel colour. */
const DEMO_PURPLE = "#a77bf0";

/** Segment colours. `stub` is hatched red and can never read as progress. */
const SEG: { key: keyof LineCounts; label: string; color: string; hatch?: boolean }[] = [
  { key: "approved", label: "已驗收", color: OK },
  { key: "generated", label: "待驗收", color: ACCENT },
  { key: "generating", label: "生成中", color: WARN },
  { key: "stub", label: "STUB 假音", color: STUB_RED, hatch: true },
  { key: "rejected", label: "已退回", color: GOLD },
  { key: "failed", label: "生成失敗", color: DANGER },
  { key: "pending", label: "待生成", color: "#3d4560" },
  { key: "noText", label: "待撰稿", color: "#2b3247" },
];

const STATE_COLOR: Record<LineState, string> = {
  approved: OK,
  generated: ACCENT,
  generating: WARN,
  stub: STUB_RED,
  rejected: GOLD,
  failed: DANGER,
  pending: "#7d88a5",
  noText: TEXT_DIM,
};

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// --------------------------------------------------------------- primitives --

/**
 * The per-champion progress bar. Eight segments, drawn in the order a line
 * travels — so a row's shape alone tells the owner where that champion is
 * stuck, at 48 rows, without reading a single number.
 */
function SegBar({ counts, height }: { counts: LineCounts; height: number }): React.JSX.Element {
  const denom = Math.max(1, counts.total);
  return (
    <div
      style={{
        display: "flex",
        height,
        borderRadius: height / 2,
        background: TRACK,
        border: PANEL_BORDER,
        overflow: "hidden",
        flex: 1,
        minWidth: 80,
      }}
    >
      {SEG.map((s) => {
        const n = counts[s.key];
        if (n <= 0) return null;
        return (
          <div
            key={s.key}
            title={`${s.label} ${n}`}
            style={{
              width: `${(n / denom) * 100}%`,
              background: s.hatch
                ? `repeating-linear-gradient(135deg, ${s.color}dd 0 5px, ${s.color}55 5px 10px)`
                : s.color,
              transition: "width 320ms ease-out",
            }}
          />
        );
      })}
    </div>
  );
}

function StateChip({ state }: { state: LineState }): React.JSX.Element {
  if (state === "stub") return <StubChip />;
  return <Badge color={STATE_COLOR[state]}>{STATE_LABEL[state]}</Badge>;
}

/** The per-clip stub marker. Deliberately the loudest thing in any row. */
function StubChip(): React.JSX.Element {
  return (
    <span
      title="這是假音（1kHz 測試音），不是語音引擎的產出"
      style={{
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: 1,
        color: "#1a0d0c",
        background: STUB_RED,
        borderRadius: 5,
        padding: "1px 6px",
        whiteSpace: "nowrap",
      }}
    >
      STUB 假音
    </span>
  );
}

function Reason({ text }: { text: string }): React.JSX.Element | null {
  if (text === "") return null;
  return <span style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.6 }}>{text}</span>;
}

// -------------------------------------------------------------- the banners --

function StubBanner(): React.JSX.Element {
  return (
    <div
      style={{
        background: "#3a1512",
        border: `2px solid ${STUB_RED}`,
        borderRadius: 10,
        padding: "10px 14px",
        color: "#ffd9d4",
        fontSize: 13,
        lineHeight: 1.8,
        fontWeight: 700,
      }}
    >
      ⚠ 語音引擎未就緒：以下全部為 STUB 假音，不可驗收
      <div style={{ fontSize: 11, fontWeight: 400, color: "#f0b5ae", marginTop: 4 }}>
        目前產生的是 1kHz 測試音（檔名帶 <code style={{ fontFamily: MONO }}>.stub.</code>），只用來證明整條流程通得過。
        真正的 IndexTTS 由另一條線安裝中；引擎上線後這條橫幅會自己消失，屆時再重新生成一次即可。
        假音不列入「已驗收」，也不會被寫成正式音檔。
      </div>
    </div>
  );
}

/**
 * The DEMO banner. Deliberately a different colour and different wording from
 * the stub-engine banner above: they are two distinct lies the page could tell,
 * and conflating them would make one of them invisible.
 */
function DemoBanner(): React.JSX.Element {
  return (
    <div
      style={{
        background: "#231a33",
        border: `2px dashed ${DEMO_PURPLE}`,
        borderRadius: 10,
        padding: "10px 14px",
        color: "#e2d3ff",
        fontSize: 13,
        lineHeight: 1.8,
        fontWeight: 700,
      }}
    >
      {DEMO_BANNER}
      <div style={{ fontSize: 11, fontWeight: 400, color: "#bda9dd", marginTop: 4 }}>
        角色與名字取自本專案既有的白名單與名言語音包，狀態與文稿是依角色 id
        決定性亂數產生的，所以每次看到的都一樣。這個模式下沒有任何寫入按鈕。關掉它就回到真實資料。
      </div>
    </div>
  );
}

function ModeBanner({ mode, detail }: { mode: api.ServiceMode; detail: string | null }): React.JSX.Element | null {
  if (mode === "live") return null;
  const text = mode === "off" ? api.VOICE_API.offMessage : (detail ?? api.VOICE_API.noDaemonMessage);
  return (
    <div
      style={{
        background: "#2a2413",
        border: `1px solid ${WARN}`,
        borderRadius: 10,
        padding: "9px 13px",
        color: "#f0dCA8",
        fontSize: 12,
        lineHeight: 1.8,
      }}
    >
      🔌 {text}
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3 }}>
        唯讀模式：本頁不會顯示任何「生成」按鈕，因為現在按了也不會有任何事發生。
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- job panel --

function JobRow({
  job,
  now,
  onCancel,
  live,
}: {
  job: Job;
  now: number;
  onCancel: (id: string) => void;
  live: boolean;
}): React.JSX.Element {
  const active = isJobActive(job);
  const eta = etaMsOf(job, now);
  return (
    <div style={{ borderTop: PANEL_BORDER, paddingTop: 8, marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
        <Badge color={active ? ACCENT : job.state === "failed" ? DANGER : TEXT_DIM}>
          {job.state === "queued"
            ? "排隊中"
            : job.state === "running"
              ? "執行中"
              : job.state === "done"
                ? "已完成"
                : job.state === "failed"
                  ? "失敗"
                  : "已取消"}
        </Badge>
        <span style={{ fontSize: 12, color: TEXT_MAIN }}>
          {job.kind === "script" ? "撰稿" : "語音"} ·{" "}
          {job.scope === "roster" ? "全部角色" : job.scope === "champion" ? "整組" : "單句"}
        </span>
        <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>{job.jobId}</span>
        <div style={{ flex: 1 }} />
        {active && live && (
          <Btn small kind="danger" onClick={() => onCancel(job.jobId)}>
            取消
          </Btn>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            position: "relative",
            flex: 1,
            height: 12,
            borderRadius: 6,
            background: TRACK,
            border: PANEL_BORDER,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              right: "auto",
              width: `${jobPercent(job)}%`,
              background: `linear-gradient(90deg, #3f6ba0 0%, ${ACCENT} 100%)`,
              transition: "width 320ms ease-out",
            }}
          />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT_MAIN, minWidth: 108, textAlign: "right" }}>
          {job.done} / {job.total}
        </span>
        <span style={{ fontSize: 11, color: TEXT_DIM, minWidth: 96, textAlign: "right" }}>
          剩餘 {formatEta(eta)}
        </span>
      </div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {job.current && (
          <span>
            目前：<b style={{ color: TEXT_MAIN }}>{job.current.championId}</b> / {job.current.lineId}
          </span>
        )}
        <span>成功 {job.ok}</span>
        {job.stub > 0 && <span style={{ color: STUB_RED }}>STUB {job.stub}</span>}
        {job.skipped > 0 && <span style={{ color: WARN }}>跳過 {job.skipped}（缺參考音／缺文稿）</span>}
        {job.failed > 0 && <span style={{ color: DANGER }}>失敗 {job.failed}</span>}
      </div>
      {job.errors.length > 0 && (
        <ul style={{ margin: "5px 0 0 16px", padding: 0, fontSize: 11, color: DANGER, lineHeight: 1.7 }}>
          {job.errors.slice(0, 5).map((e, i) => (
            <li key={i}>
              {e.championId}/{e.lineId} — {e.message}
            </li>
          ))}
          {job.errors.length > 5 && <li style={{ color: TEXT_DIM }}>…還有 {job.errors.length - 5} 筆</li>}
        </ul>
      )}
    </div>
  );
}

// --------------------------------------------------------------- line editor --

function LineRow({
  championId,
  spec,
  record,
  reference,
  live,
  player,
  editing,
  onEdit,
  onSaveText,
  onGenerate,
  onReview,
  onPromote,
  busy,
}: {
  championId: string;
  spec: LineSpec;
  record: LineRecord | null;
  reference: ChampionStatus["reference"];
  live: boolean;
  player: ReturnType<typeof useVoiceGen>["player"];
  editing: boolean;
  onEdit: (lineId: string | null) => void;
  onSaveText: (lineId: string, text: string | null) => void;
  onGenerate: (lineId: string) => void;
  onReview: (lineId: string, decision: "approved" | "rejected") => void;
  onPromote: (lineId: string, take: number) => void;
  busy: boolean;
}): React.JSX.Element {
  const state: LineState = record?.state ?? "noText";
  const [draft, setDraft] = useState(record?.text ?? "");
  useEffect(() => {
    if (editing) setDraft(record?.text ?? "");
  }, [editing, record?.text]);

  const gen = canGenerateLine(reference, record);
  const approve = canApproveLine(record);
  const stub = state === "stub" || record?.current?.stub === true;
  const key = `${championId}/${spec.lineId}`;
  const playing = player.nowPlaying === key;
  const url = api.clipUrl(championId, spec.lineId);
  const canPlay = record?.current !== null && record?.current !== undefined && url !== null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "168px 1fr 118px 218px",
        gap: 10,
        alignItems: "start",
        padding: "7px 8px",
        borderTop: PANEL_BORDER,
        background: stub ? "#231412" : "transparent",
      }}
    >
      {/* 類別 */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: TEXT_MAIN, fontWeight: 600 }}>
          {spec.label}
          {spec.variantLabel && (
            <span style={{ color: ACCENT, fontFamily: MONO, marginLeft: 5, fontSize: 11 }}>
              {spec.variantLabel}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: TEXT_DIM, fontFamily: MONO }}>{spec.lineId}</div>
        {record?.abilityName && (
          <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 2 }}>技能：{record.abilityName}</div>
        )}
      </div>

      {/* 文稿 — always visible next to the audio, editable in place */}
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <TextArea value={draft} onChange={setDraft} rows={2} placeholder={spec.hint} />
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Btn small kind="primary" disabled={busy} onClick={() => onSaveText(spec.lineId, draft.trim() === "" ? null : draft)}>
                儲存文稿
              </Btn>
              <Btn small disabled={busy} onClick={() => onEdit(null)}>
                取消
              </Btn>
              <span style={{ fontSize: 10, color: TEXT_DIM }}>
                建議長度 ≤ {spec.maxSeconds} 秒 · {spec.hint}
              </span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => live && onEdit(spec.lineId)}
            title={live ? "點一下改文稿" : "唯讀模式"}
            style={{
              textAlign: "left",
              width: "100%",
              background: "transparent",
              border: "1px solid transparent",
              borderRadius: 6,
              padding: "2px 4px",
              cursor: live ? "text" : "default",
              color: record?.text ? TEXT_MAIN : WARN,
              fontSize: 12.5,
              lineHeight: 1.7,
              fontFamily: "inherit",
            }}
          >
            {record?.text ?? "（待撰稿）"}
            {record?.textSource && (
              <span style={{ fontSize: 10, color: TEXT_DIM, marginLeft: 6 }}>
                {record.textSource === "ai" ? "AI 草稿" : record.textSource === "imported" ? "匯入" : "手寫"}
              </span>
            )}
          </button>
        )}
        {record?.lastError && (
          <div style={{ fontSize: 10, color: DANGER, marginTop: 3 }}>錯誤：{record.lastError}</div>
        )}
      </div>

      {/* 狀態 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <StateChip state={state} />
        {record?.current && (
          <span style={{ fontSize: 10, color: TEXT_DIM, fontFamily: MONO }}>
            take {record.current.take}
            {record.current.seconds !== null ? ` · ${record.current.seconds.toFixed(1)}s` : ""}
          </span>
        )}
      </div>

      {/* 操作 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <Btn
            small
            disabled={!canPlay}
            title={canPlay ? "試聽（同時只播一句）" : "還沒有音檔"}
            onClick={() => url !== null && player.play(key, url, stub)}
          >
            {playing ? "⏸ 停止" : "▶ 試聽"}
          </Btn>
          {live && (
            <Btn
              small
              kind="primary"
              disabled={!gen.ok || busy}
              title={gen.ok ? "重新生成這一句" : gen.reason}
              onClick={() => onGenerate(spec.lineId)}
            >
              ⟳ 生成
            </Btn>
          )}
          {live && (
            <Btn
              small
              disabled={!approve.ok || busy}
              title={approve.ok ? "驗收這一句" : approve.reason}
              onClick={() => onReview(spec.lineId, "approved")}
            >
              ✓ 驗收
            </Btn>
          )}
          {live && record?.current && state !== "pending" && (
            <Btn small disabled={busy} title="退回，狀態回到待生成" onClick={() => onReview(spec.lineId, "rejected")}>
              ✗ 退回
            </Btn>
          )}
        </div>
        {playing && stub && <StubChip />}
        {!gen.ok && <Reason text={gen.reason} />}
        {gen.ok && !approve.ok && record?.current !== null && <Reason text={approve.reason} />}
        {record && record.takes.length > 1 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: TEXT_DIM }}>takes</span>
            {record.takes.map((t) => {
              const promote = canPromoteTake(t);
              const tkey = `${key}#${t.take}`;
              const turl = api.clipUrl(championId, spec.lineId, t.take);
              return (
                <span key={t.take} style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
                  <button
                    onClick={() => turl !== null && player.play(tkey, turl, t.stub)}
                    title={`試聽 take ${t.take}${t.stub ? "（STUB 假音）" : ""}`}
                    style={{
                      fontSize: 10,
                      fontFamily: MONO,
                      padding: "1px 5px",
                      borderRadius: 5,
                      cursor: "pointer",
                      color: t.stub ? "#1a0d0c" : TEXT_MAIN,
                      background: t.stub ? STUB_RED : player.nowPlaying === tkey ? "#1b2338" : "#141a28",
                      border: PANEL_BORDER,
                    }}
                  >
                    t{t.take}
                    {t.stub ? "·假" : ""}
                  </button>
                  {live && (
                    <button
                      onClick={() => promote.ok && onPromote(spec.lineId, t.take)}
                      disabled={!promote.ok || busy}
                      title={promote.ok ? `採用 take ${t.take}` : promote.reason}
                      style={{
                        fontSize: 10,
                        padding: "1px 4px",
                        borderRadius: 5,
                        cursor: promote.ok ? "pointer" : "default",
                        opacity: promote.ok ? 1 : 0.35,
                        color: TEXT_MAIN,
                        background: "#171d2b",
                        border: PANEL_BORDER,
                      }}
                    >
                      採用
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------- reference editor --

function ReferencePanel({
  championId,
  status,
  live,
  busy,
  player,
  act,
  reload,
}: {
  championId: string;
  status: ChampionStatus | null;
  live: boolean;
  busy: boolean;
  player: ReturnType<typeof useVoiceGen>["player"];
  act: ReturnType<typeof useVoiceGen>["act"];
  reload: () => void;
}): React.JSX.Element {
  const [candidates, setCandidates] = useState<api.RefCandidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [licence, setLicence] = useState("");
  const [licenceUrl, setLicenceUrl] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ref = status?.reference ?? null;
  const gate = referenceGate(ref);
  const key = `ref/${championId}`;

  const loadCandidates = useCallback(() => {
    setLoadingCandidates(true);
    void api.referenceCandidates(championId).then((res) => {
      setCandidates(res.ok && res.data !== null ? res.data : []);
      setLoadingCandidates(false);
    });
  }, [championId]);

  const upload = useCallback(
    (file: File) => {
      if (licence.trim() === "") return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const base64 = result.slice(result.indexOf(",") + 1);
        void act(
          "上傳參考音",
          () =>
            api.uploadReference(championId, {
              base64,
              filename: file.name,
              sourceKind: "upload",
              licence: licence.trim(),
              licenceUrl,
              note,
            }),
          championId,
        ).then((ok) => {
          if (ok) reload();
        });
      };
      reader.readAsDataURL(file);
    },
    [act, championId, licence, licenceUrl, note, reload],
  );

  return (
    <Panel
      title="參考語音（IndexTTS prompt audio）"
      right={
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          單聲道 WAV · 24kHz · 3–15 秒 · 峰值 ≤ −1.0 dBFS · 不要有配樂
        </span>
      }
    >
      {ref === null ? (
        <div style={{ fontSize: 12, color: WARN, lineHeight: 1.8, marginBottom: 10 }}>
          這名角色還沒有參考音 —— 所有 {status ? Object.keys(status.lines).length : 0} 句都無法生成。
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <Btn small onClick={() => player.play(key, api.referenceUrl(championId), false)}>
            {player.nowPlaying === key ? "⏸ 停止" : "▶ 試聽參考音"}
          </Btn>
          <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
            {ref.seconds.toFixed(1)}s · {ref.sampleRate}Hz · {ref.sha256.slice(0, 10)}
          </span>
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            來源 {ref.sourceKind === "repo" ? "本專案素材" : ref.sourceKind === "upload" ? "上傳" : "外部"}
            {ref.source ? `（${ref.source}）` : ""}
          </span>
          <Badge color={gate.ok ? OK : DANGER}>{gate.ok ? "可用於生成" : "不可用"}</Badge>
          {ref.licence !== "" && <span style={{ fontSize: 11, color: TEXT_DIM }}>授權 {ref.licence}</span>}
          {live && (
            <Btn small kind="danger" disabled={busy} onClick={() => void act("移除參考音", () => api.deleteReference(championId), championId)}>
              移除
            </Btn>
          )}
        </div>
      )}
      {!gate.ok && <Reason text={gate.reason} />}

      {live && (
        <div style={{ borderTop: PANEL_BORDER, paddingTop: 10, marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <Btn small onClick={loadCandidates} disabled={loadingCandidates}>
                {loadingCandidates ? "尋找中…" : "從本專案既有素材挑一段"}
              </Btn>
              <span style={{ fontSize: 10, color: TEXT_DIM }}>
                名言／名字語音包裡已經有的片段；不會自動選，一定要你按。
              </span>
            </div>
            {candidates !== null && candidates.length === 0 && (
              <div style={{ fontSize: 11, color: TEXT_DIM }}>沒有找到可用的既有素材。</div>
            )}
            {candidates !== null && candidates.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {candidates.map((c) => (
                  <div key={c.path} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}>
                    <span style={{ flex: 1, color: TEXT_MAIN, fontFamily: MONO, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.label || c.path}
                    </span>
                    <span style={{ color: TEXT_DIM }}>{c.seconds.toFixed(1)}s</span>
                    <Btn
                      small
                      disabled={busy}
                      onClick={() =>
                        void act("設定參考音", () => api.selectReference(championId, { path: c.path }), championId).then(
                          (ok) => ok && reload(),
                        )
                      }
                    >
                      採用
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: TEXT_MAIN, fontWeight: 700 }}>或上傳一段音檔</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <TextInput value={licence} onChange={setLicence} placeholder="授權（必填，例如 own-work / CC0 / CC-BY-4.0）" />
              <TextInput value={licenceUrl} onChange={setLicenceUrl} placeholder="授權連結（選填）" />
              <TextInput value={note} onChange={setNote} placeholder="備註（選填）" />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                style={{ fontSize: 11, color: TEXT_DIM }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
                disabled={licence.trim() === "" || busy}
              />
              {licence.trim() === "" && (
                <Reason text="外部來源的參考音必須先填授權才能上傳 —— 沒有授權的素材是版權責任，不是待辦事項。" />
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// -------------------------------------------------------------- champion pane --

function ChampionDetail({
  entry,
  v,
  onClose,
}: {
  entry: RosterEntry;
  v: ReturnType<typeof useVoiceGen>;
  onClose: () => void;
}): React.JSX.Element {
  const status = v.loaded.get(entry.championId) ?? null;
  const loading = v.loadingChampions.has(entry.championId);
  const error = v.championErrors.get(entry.championId) ?? null;
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<StateFilter>("all");
  const live = v.mode === "live";
  const busy = v.busy !== null;
  const ref = status?.reference ?? null;

  const rows = useMemo(
    () => v.lines.filter((s) => matchesFilter(status?.lines[s.lineId]?.state ?? "noText", filter)),
    [v.lines, status, filter],
  );

  const reload = useCallback(() => v.loadChampion(entry.championId, true), [v, entry.championId]);

  const generateOne = useCallback(
    (lineId: string) => {
      void v.act(
        "生成單句",
        () => api.enqueue({ kind: "voice", scope: "line", championId: entry.championId, lineIds: [lineId], force: true }),
        entry.championId,
      );
    },
    [v, entry.championId],
  );

  return (
    <Panel
      title={`逐句：${entry.name}`}
      right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>{entry.championId}</span>
          <Btn small onClick={reload}>
            ↻ 重讀
          </Btn>
          <Btn small onClick={onClose}>
            收合
          </Btn>
        </div>
      }
    >
      <ReferencePanel
        championId={entry.championId}
        status={status}
        live={live}
        busy={busy}
        player={v.player}
        act={v.act}
        reload={reload}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0 6px" }}>
        <span style={{ fontSize: 11, color: TEXT_DIM }}>篩選</span>
        {(["all", "needsWork", "noText", "pending", "generated", "stub", "approved", "failed"] as StateFilter[]).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 6,
                cursor: "pointer",
                color: filter === f ? TEXT_MAIN : TEXT_DIM,
                background: filter === f ? "#1b2338" : "#141a28",
                border: filter === f ? `1px solid ${ACCENT}` : PANEL_BORDER,
              }}
            >
              {f === "all" ? "全部" : f === "needsWork" ? "需處理" : STATE_LABEL[f as LineState]}
            </button>
          ),
        )}
        <div style={{ flex: 1 }} />
        {live && (
          <Btn
            small
            kind="primary"
            disabled={busy || !referenceGate(ref).ok}
            title={referenceGate(ref).ok ? "生成這名角色所有缺漏的句子" : referenceGate(ref).reason}
            onClick={() =>
              void v.act(
                "整組生成",
                () =>
                  api.enqueue({
                    kind: "voice",
                    scope: "champion",
                    championId: entry.championId,
                    onlyMissing: true,
                  }),
                entry.championId,
              )
            }
          >
            ⟳ 一鍵生成這名角色缺漏的 {entry.counts.total - entry.counts.approved} 句
          </Btn>
        )}
      </div>

      {loading && <div style={{ fontSize: 12, color: TEXT_DIM, padding: 8 }}>讀取這名角色的 {v.lines.length} 句…</div>}
      {error !== null && <ErrorBanner text={error} />}

      {!loading && (
        <div style={{ border: PANEL_BORDER, borderRadius: 8, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "168px 1fr 118px 218px",
              gap: 10,
              padding: "6px 8px",
              background: "#101623",
              fontSize: 10,
              color: TEXT_DIM,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            <span>類別</span>
            <span>文稿（點一下可改）</span>
            <span>狀態</span>
            <span>試聽 / 操作</span>
          </div>
          {rows.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: TEXT_DIM }}>這個篩選條件下沒有句子。</div>
          )}
          {rows.map((spec) => (
            <LineRow
              key={spec.lineId}
              championId={entry.championId}
              spec={spec}
              record={status?.lines[spec.lineId] ?? null}
              reference={ref}
              live={live}
              player={v.player}
              editing={editing === spec.lineId}
              onEdit={setEditing}
              busy={busy}
              onSaveText={(lineId, text) => {
                void v
                  .act(
                    "儲存文稿",
                    () => api.setLineText(entry.championId, lineId, { text, textSource: "authored" }),
                    entry.championId,
                  )
                  .then((ok) => ok && setEditing(null));
              }}
              onGenerate={generateOne}
              onReview={(lineId, decision) => {
                void v.act(
                  decision === "approved" ? "驗收" : "退回",
                  () => api.reviewLine(entry.championId, lineId, decision),
                  entry.championId,
                );
              }}
              onPromote={(lineId, take) => {
                void v.act("採用 take", () => api.promoteTake(entry.championId, lineId, take), entry.championId);
              }}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------ cross-roster ---

const FLAT_ROW_H = 30;

/**
 * The flat "every loaded line, filtered by state" view. WINDOWED: only the
 * ~30 rows in the viewport exist in the DOM, so this stays usable if every one
 * of the 48 champions is open at once (2,208 rows).
 *
 * It deliberately lists only champions ALREADY LOADED — a flat view that
 * triggered 48 detail fetches would be exactly the un-scalable thing the page
 * exists to avoid, so it says how many are loaded instead.
 */
function FlatLineView({ v }: { v: ReturnType<typeof useVoiceGen> }): React.JSX.Element {
  const [filter, setFilter] = useState<StateFilter>("needsWork");
  const [scrollTop, setScrollTop] = useState(0);
  const height = 360;
  const rows = useMemo(
    () => flattenLoaded(v.roster, v.lines, v.loaded, filter),
    [v.roster, v.lines, v.loaded, filter],
  );
  const win = windowSlice(rows.length, FLAT_ROW_H, scrollTop, height);

  return (
    <Panel
      title="跨角色逐句檢視"
      right={
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          已載入 {v.loaded.size} / {v.roster?.champions.length ?? 0} 名角色 · 命中 {rows.length} 句（畫面只畫{" "}
          {Math.max(0, win.end - win.start)} 列）
        </span>
      }
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {(["needsWork", "all", "noText", "pending", "stub", "generated", "approved", "failed"] as StateFilter[]).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 6,
                cursor: "pointer",
                color: filter === f ? TEXT_MAIN : TEXT_DIM,
                background: filter === f ? "#1b2338" : "#141a28",
                border: filter === f ? `1px solid ${ACCENT}` : PANEL_BORDER,
              }}
            >
              {f === "all" ? "全部" : f === "needsWork" ? "需處理" : STATE_LABEL[f as LineState]}
            </button>
          ),
        )}
      </div>
      {v.loaded.size === 0 ? (
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>
          還沒有展開任何角色。這個檢視只列出「已經載入」的角色 —— 為了不在一頁裡送出 48 次請求、拉進 2,208
          句，展開哪一位，這裡就多哪一位。
        </div>
      ) : (
        <div
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          style={{ height, overflowY: "auto", border: PANEL_BORDER, borderRadius: 8, background: "#0f131e" }}
        >
          <div style={{ height: win.padTop }} />
          {rows.slice(win.start, win.end).map((r) => {
            const key = `${r.championId}/${r.spec.lineId}`;
            const url = api.clipUrl(r.championId, r.spec.lineId);
            const stub = r.state === "stub";
            return (
              <div
                key={key}
                style={{
                  height: FLAT_ROW_H,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 8px",
                  borderBottom: "1px solid #161d2b",
                  fontSize: 11.5,
                  background: stub ? "#231412" : "transparent",
                }}
              >
                <span style={{ width: 168, color: TEXT_MAIN, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {r.championName}
                </span>
                <span style={{ width: 120, color: TEXT_DIM, fontFamily: MONO, overflow: "hidden", whiteSpace: "nowrap" }}>
                  {r.spec.lineId}
                </span>
                <span style={{ flex: 1, color: r.record?.text ? TEXT_DIM : WARN, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {r.record?.text ?? "（待撰稿）"}
                </span>
                <StateChip state={r.state} />
                <Btn
                  small
                  disabled={r.record?.current == null || url === null}
                  onClick={() => url !== null && v.player.play(key, url, stub)}
                >
                  {v.player.nowPlaying === key ? "⏸" : "▶"}
                </Btn>
              </div>
            );
          })}
          <div style={{ height: win.padBottom }} />
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ the page --

export function VoiceGenPage(): React.JSX.Element {
  const v = useVoiceGen();
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  // A page driven by fabricated data offers NO write, whatever the daemon says.
  const live = v.mode === "live" && !v.demo;

  // one clock for every ETA on the page
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const totals = useMemo(() => rosterTotals(v.roster), [v.roster]);
  const prog = progressOf(totals);
  const skip = useMemo(() => rosterSkipEstimate(v.roster), [v.roster]);
  const bad = useMemo(() => inconsistentChampions(v.roster), [v.roster]);
  const drift = useMemo(() => schemaDrift(v.schema), [v.schema]);
  const perChampion = v.lines.length;
  const champions = v.roster?.champions.length ?? 0;
  const expectedClips = perChampion * champions;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = v.roster?.champions ?? [];
    if (q === "") return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.championId.toLowerCase().includes(q),
    );
  }, [v.roster, query]);

  const openEntry = useMemo(
    () => (open === null ? null : (v.roster?.champions.find((c) => c.championId === open) ?? null)),
    [open, v.roster],
  );

  const toggle = useCallback(
    (id: string) => {
      setOpen((cur) => {
        if (cur === id) return null;
        v.loadChampion(id);
        return id;
      });
    },
    [v],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1180 }}>
      {/* ---- header ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, color: TEXT_MAIN }}>角色語音生成</h1>
        <Badge color={v.stubEngine ? STUB_RED : OK}>{v.stubEngine ? "STUB 假音引擎" : "IndexTTS"}</Badge>
        <Badge color={live ? OK : WARN}>{live ? "可寫入" : "唯讀"}</Badge>
        {v.health && v.health.engine.version !== "" && (
          <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
            {v.health.engine.name} {v.health.engine.version}
            {v.health.engine.device ? ` · ${v.health.engine.device}` : ""}
            {v.health.engine.warm ? " · 已預熱" : ""}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
          {v.streaming
            ? `即時連線中${v.lastEventAt ? ` · ${new Date(v.lastEventAt).toLocaleTimeString()}` : ""}`
            : `每 ${Math.round(JOB_POLL_MS / 1000)} 秒輪詢（SSE 未連上）`}
        </span>
        <Btn small onClick={v.refresh} disabled={v.refreshing}>
          {v.refreshing ? "更新中…" : "↻ 重新整理"}
        </Btn>
        <Btn
          small
          disabled={v.demoBusy}
          title="用假資料把整個頁面撐到 48 位角色的規模，證明它在真的資料進來時撐得住"
          style={v.demo ? { border: `1px solid ${DEMO_PURPLE}`, background: "#241a36" } : undefined}
          onClick={() => v.setDemo(!v.demo)}
        >
          {v.demoBusy ? "建立示範資料…" : v.demo ? "🧪 關閉示範資料" : "🧪 示範資料"}
        </Btn>
      </div>

      {v.demo && <DemoBanner />}
      {v.stubEngine && !v.demo && <StubBanner />}
      {!v.demo && <ModeBanner mode={v.mode} detail={v.rosterError} />}
      <ErrorBanner text={v.actionError} onDismiss={v.clearActionError} />
      <ErrorBanner text={v.player.error} />

      {/* ---- schema honesty ---- */}
      <Panel title="語音分類表">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: TEXT_MAIN }}>
          <Badge color={v.schema.fromDisk ? OK : WARN}>
            {v.schema.fromDisk ? "讀自 CATEGORIES.json" : "內建快照，尚未讀到 CATEGORIES.json"}
          </Badge>
          <span>
            分類 <b style={{ fontFamily: MONO }}>{v.schema.categories.length}</b> 類
          </span>
          <span>
            展開後每位角色 <b style={{ fontFamily: MONO }}>{perChampion}</b> 句
          </span>
          {champions > 0 ? (
            <span>
              全部 <b style={{ fontFamily: MONO, color: GOLD }}>{expectedClips}</b> 段（{champions} 位角色）
            </span>
          ) : (
            <span style={{ color: WARN }}>還沒讀到角色清單，所以總段數還算不出來</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.9, marginTop: 8 }}>
          你列的清單以「、」切開是 <b style={{ color: TEXT_MAIN }}>{CATEGORY_COUNT}</b> 類，不是 42
          類；我沒有為了湊數字自己補一類。要補的話改{" "}
          <code style={{ fontFamily: MONO, color: TEXT_MAIN }}>
            content/assets/audio/voices/lines/CATEGORIES.json
          </code>{" "}
          一個檔案就好，本頁的數字會跟著變。
          <br />
          其中「喊出技能名稱」展開成 Q/W/E/R/EX 五句（被動不會喊），「回應隊友OK/NO」展開成 2 句，所以每位角色是{" "}
          {perChampion} 句
          {champions > 0
            ? ` —— ${champions} 位角色就是 ${expectedClips} 段，比原本估的 2,016 多。`
            : "（角色清單讀到之後才會有總數）。"}
        </div>
        {(drift.added.length > 0 || drift.removed.length > 0 || drift.relabelled.length > 0) && (
          <div style={{ fontSize: 11, color: WARN, marginTop: 8, lineHeight: 1.8 }}>
            磁碟上的分類表與內建快照不同：
            {drift.added.length > 0 && <> 新增 {drift.added.join("、")};</>}
            {drift.removed.length > 0 && <> 移除 {drift.removed.join("、")};</>}
            {drift.relabelled.map((r) => (
              <span key={r.id}>
                {" "}
                {r.id}「{r.was}」→「{r.now}」;
              </span>
            ))}
          </div>
        )}
      </Panel>

      {/* ---- roster headline ---- */}
      <Panel
        title="全部角色進度"
        right={
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            已驗收 ÷ 應有段數。STUB 假音不計入已完成。
          </span>
        }
      >
        {!countsPartitionOk(totals) && (
          <div style={{ fontSize: 12, color: DANGER, marginBottom: 8, lineHeight: 1.8 }}>
            ⚠ 這一頁的統計對不起來（各狀態加總 ≠ 總數）
            {bad.length > 0 && <>，出問題的角色：{bad.slice(0, 6).join("、")}{bad.length > 6 ? "…" : ""}</>}
            。在修好之前，下面的百分比不可信。
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <SegBar counts={totals} height={18} />
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              fontFamily: MONO,
              minWidth: 84,
              textAlign: "right",
              color: prog.percent >= 99.9 ? OK : GOLD,
            }}
          >
            {pct(prog.percent)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: TEXT_DIM, marginBottom: 10 }}>
          {SEG.map((s) => (
            <span key={s.key}>
              <span
                style={{
                  display: "inline-block",
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: s.color,
                  marginRight: 5,
                  verticalAlign: "middle",
                }}
              />
              {s.label} <b style={{ color: s.key === "stub" && totals.stub > 0 ? STUB_RED : TEXT_MAIN }}>{totals[s.key]}</b>
            </span>
          ))}
          <span>
            應有 <b style={{ color: TEXT_MAIN }}>{totals.total}</b>
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {live && (
            <Btn
              kind="primary"
              disabled={v.busy !== null}
              title="把所有還沒驗收、且有參考音與文稿的句子排進生成佇列"
              onClick={() =>
                void v.act("全部生成", () =>
                  api.enqueue({ kind: "voice", scope: "roster", onlyMissing: true, concurrency: 2 }),
                )
              }
            >
              ⟳ 一鍵生成全部缺漏（約 {Math.max(0, totals.total - totals.approved - skip.noReference)} 段）
            </Btn>
          )}
          {skip.championsWithoutReference.length > 0 && (
            <span style={{ fontSize: 11, color: WARN }}>
              {skip.championsWithoutReference.length} 位角色沒有參考音，合計 {skip.noReference} 段會被跳過
            </span>
          )}
          {totals.noText > 0 && (
            <span style={{ fontSize: 11, color: WARN }}>{totals.noText} 句因為還沒有文稿會被跳過</span>
          )}
          {v.busy !== null && <span style={{ fontSize: 11, color: TEXT_DIM }}>{v.busy}…</span>}
        </div>
      </Panel>

      {/* ---- jobs ---- */}
      <Panel
        title="生成工作"
        right={
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            {v.jobs.active.length > 0 ? `${v.jobs.active.length} 個進行中` : "目前沒有進行中的工作"}
          </span>
        }
      >
        {v.jobs.active.length === 0 && v.jobs.recent.length === 0 && (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>還沒有任何生成工作。</div>
        )}
        {v.jobs.active.map((j) => (
          <JobRow
            key={j.jobId}
            job={j}
            now={now}
            live={live}
            onCancel={(id) => void v.act("取消工作", () => api.cancelJob(id))}
          />
        ))}
        {v.jobs.recent.slice(0, 5).map((j) => (
          <JobRow key={j.jobId} job={j} now={now} live={live} onCancel={() => undefined} />
        ))}
      </Panel>

      {/* ---- the 48 rows ---- */}
      <Panel
        title={`角色清單（${filtered.length} / ${champions}）`}
        right={
          <div style={{ width: 220 }}>
            <TextInput value={query} onChange={setQuery} placeholder="搜尋角色名稱 / id" />
          </div>
        }
      >
        {v.booting ? (
          <div style={{ fontSize: 12, color: TEXT_DIM, padding: 8 }}>讀取角色清單…</div>
        ) : champions === 0 ? (
          <div style={{ fontSize: 12, color: WARN, lineHeight: 1.8 }}>
            還沒有 ROSTER.json —— 語音服務啟動後會產生一份；在那之前這頁沒有角色可以顯示。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.map((c) => {
              const p = progressOf(c.counts);
              const isOpen = open === c.championId;
              return (
                <div
                  key={c.championId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 6px",
                    borderTop: PANEL_BORDER,
                    background: isOpen ? "#131b2b" : "transparent",
                  }}
                >
                  <button
                    onClick={() => toggle(c.championId)}
                    style={{
                      width: 210,
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      color: TEXT_MAIN,
                      cursor: "pointer",
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: 0,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                    title={c.championId}
                  >
                    {isOpen ? "▾ " : "▸ "}
                    {c.name}
                  </button>
                  <span
                    title={c.hasReference ? "已有參考音" : "沒有參考音 —— 這名角色一句都生不出來"}
                    style={{ fontSize: 11, width: 58, color: c.hasReference ? OK : DANGER }}
                  >
                    {c.hasReference ? "參考音 ✓" : "無參考音"}
                  </span>
                  <SegBar counts={c.counts} height={10} />
                  <span style={{ width: 92, textAlign: "right", fontFamily: MONO, fontSize: 11, color: TEXT_MAIN }}>
                    {c.counts.approved} / {c.counts.total}
                  </span>
                  <span style={{ width: 50, textAlign: "right", fontSize: 11, color: TEXT_DIM }}>
                    {pct(p.percent)}
                  </span>
                  {c.counts.stub > 0 ? (
                    <span style={{ width: 74, textAlign: "right" }}>
                      <StubChip />
                    </span>
                  ) : (
                    <span style={{ width: 74 }} />
                  )}
                  <Btn small onClick={() => toggle(c.championId)}>
                    {isOpen ? "收合" : "開啟"}
                  </Btn>
                  {live && (
                    <Btn
                      small
                      kind="primary"
                      disabled={!c.hasReference || v.busy !== null}
                      title={c.hasReference ? "生成這名角色所有缺漏的句子" : "沒有參考音，先設定參考音"}
                      onClick={() =>
                        void v.act(
                          "整組生成",
                          () =>
                            api.enqueue({
                              kind: "voice",
                              scope: "champion",
                              championId: c.championId,
                              onlyMissing: true,
                            }),
                          c.championId,
                        )
                      }
                    >
                      整組生成
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {openEntry !== null && (
        <ChampionDetail entry={openEntry} v={v} onClose={() => setOpen(null)} />
      )}

      <FlatLineView v={v} />

      <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.8, paddingBottom: 20 }}>
        資料來源：<code style={{ fontFamily: MONO }}>/voice-api</code>（127.0.0.1:8788，
        <code style={{ fontFamily: MONO }}>tools/voice-gen/src/serve.mjs</code>）與{" "}
        <code style={{ fontFamily: MONO }}>/content/assets/audio/voices/</code>。本頁只有在開發版本存在；
        授權靠的是「連得到」而不是「偵測到」—— 服務只綁 127.0.0.1，管理台也只綁 127.0.0.1。
      </div>
    </div>
  );
}

/** Root export, matching ContentPageRoot's shape. */
export function VoiceGenPageRoot(): React.JSX.Element {
  return <VoiceGenPage />;
}

/** Kept for the empty-counts fallback in tests / degraded renders. */
export const ZERO_COUNTS = EMPTY_COUNTS;
