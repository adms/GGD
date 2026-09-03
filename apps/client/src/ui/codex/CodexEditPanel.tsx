/**
 * CodexEditPanel — the editing UI of the 內容圖鑑 (task #96), and the state that
 * makes a save recoverable.
 *
 * NOTHING IMPORTS THIS FILE STATICALLY. It is the single dynamic entry point of
 * the editor: CodexPage loads it behind a bare `import.meta.env.DEV` guard, and
 * it in turn pulls in ./codexEdit (the network module) and ./codexEditModel.
 * Vite folds that branch away at build time, so a production bundle contains
 * neither this component, nor its strings, nor any /content-api URL — the
 * editor is ABSENT, not disabled. CodexDetail knows only codexEditContext.ts,
 * a `createContext(null)` whose value stays null when this never loads.
 * codexEditGate.test.ts proves it, including by building and grepping dist/.
 *
 * THE SAVE IS TWO STEPS, ON PURPOSE. There is no version control in this repo
 * (task #65) and the project has already lost irreplaceable files to an
 * in-place overwrite, so 儲存 never writes immediately:
 *
 *   1. 儲存 → the server dry-run validates every document in the write plan
 *      with the SAME zod schemas the game loader uses, and the panel shows a
 *      field-by-field DIFF of exactly what is about to change, including the
 *      mirrored champion write an ability edit drags along;
 *   2. 確認寫入 → the writes go out. The server snapshots the previous bytes
 *      first, and 復原 puts the newest snapshot back — from this same panel.
 *
 * Draft state is keyed by entry id and thrown away when the selection changes:
 * a half-typed edit must never leak onto another document.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";
import { Btn } from "../platform/widgets";
import {
  applyEdits,
  collectionOf,
  diffDocs,
  formatField,
  getAt,
  parseField,
  writePlan,
  type DocChange,
  type FieldKind,
  type WritePlanStep,
} from "./codexEditModel";
import { createCodexEdit, type BackupEntry, type CodexEditApi, type EditIssue } from "./codexEdit";
import { EditContext, type DetailEdit } from "./codexEditContext";
import type { CodexData, CodexEntry } from "@ggd/shared/codex/codexTypes";

/** Everything a field input needs, kept internal to this dev-only module. */
interface FieldState {
  readonly draft: Readonly<Record<string, unknown>>;
  readonly errors: ReadonlyMap<string, string>;
  readonly raw: ReadonlyMap<string, string>;
  readonly setField: (path: string, kind: FieldKind, raw: string) => void;
  readonly busy: boolean;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "3px 6px",
  borderRadius: 5,
  border: "1px solid #2c3448",
  background: "#0c1017",
  color: TEXT_MAIN,
  fontSize: 12,
  outline: "none",
  fontFamily: "inherit",
};

/** The input a <Row label path=…> renders in place of its read-only children. */
function FieldEditor({
  path,
  kind,
  edit,
}: {
  path: string;
  kind: FieldKind;
  edit: FieldState;
}): React.JSX.Element {
  const error = edit.errors.get(path);
  const value = edit.raw.get(path) ?? formatField(kind, getAt(edit.draft, path));
  const common = {
    value,
    disabled: edit.busy,
    onChange: (e: { target: { value: string } }) => edit.setField(path, kind, e.target.value),
    style: { ...inputStyle, borderColor: error ? "#e06a6a" : "#2c3448" },
  };
  return (
    <div>
      {kind === "multiline" ? (
        <textarea {...common} rows={4} spellCheck={false} />
      ) : kind === "boolean" ? (
        <select {...common} style={{ ...common.style, width: "auto" }}>
          <option value="">（未設定）</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input {...common} spellCheck={false} />
      )}
      <div style={{ fontSize: 10, color: error ? "#f08c8c" : TEXT_DIM, marginTop: 1 }}>
        {error ?? HINT[kind]}
      </div>
    </div>
  );
}

const HINT: Record<FieldKind, string> = {
  text: "",
  multiline: "",
  number: "",
  integer: "整數",
  boolean: "",
  stringList: "以逗號分隔",
  numberList: "每級一個值，以逗號分隔",
};

// ---------------------------------------------------------------------------

interface DraftState {
  edits: Record<string, unknown>;
  raw: Record<string, string>;
  localErrors: Record<string, string>;
  /** whole-document replacement from the raw-JSON editor (null = use the doc) */
  whole: Record<string, unknown> | null;
  wholeError: string | null;
}

const EMPTY_DRAFT: DraftState = { edits: {}, raw: {}, localErrors: {}, whole: null, wholeError: null };

/** The write surface, built once. Inert unless this module was dev-loaded. */
const API: CodexEditApi = createCodexEdit();

export interface CodexEditSessionProps {
  entry: CodexEntry;
  data: CodexData;
  /** re-read /content after a write, so the page shows the file it just wrote */
  onSaved: () => void;
  /** the read-only detail body, rendered inside this session's context */
  children: React.ReactNode;
  /** style for the scroll container the body lives in */
  bodyStyle: React.CSSProperties;
}

/**
 * Owns one entry's draft, renders the save/undo bar, and provides the edit
 * context to the detail body. CodexDetail refers to this ONLY through a prop
 * whose value comes from CodexPage's dev-gated dynamic import, so a production
 * build never instantiates — or even contains — this component.
 */
export function CodexEditSession({
  entry,
  data,
  onSaved,
  children,
  bodyStyle,
}: CodexEditSessionProps): React.JSX.Element {
  // The module-level API is always present here; `enabled` is the gate, and it
  // is false only if something imported this module outside the dev chain.
  const api = API;
  const available = api.enabled;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DraftState>(EMPTY_DRAFT);
  const [issues, setIssues] = useState<readonly EditIssue[]>([]);
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(null);
  const [pending, setPending] = useState<readonly WritePlanStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<readonly BackupEntry[]>([]);

  // a new selection is a NEW document: never carry a half-typed edit across.
  useEffect(() => {
    setState(EMPTY_DRAFT);
    setIssues([]);
    setStatus(null);
    setPending(null);
    setBackups([]);
  }, [entry.id]);

  const draft = useMemo(
    () => applyEdits(state.whole ?? (entry.doc as Record<string, unknown>), state.edits),
    [entry.doc, state.edits, state.whole],
  );

  const championDoc = useMemo(() => {
    if (entry.kind !== "ability" || entry.championId === null) return null;
    return data.champions.find((c) => c.id === entry.championId)?.doc ?? null;
  }, [entry, data.champions]);

  const changes: DocChange[] = useMemo(
    () => diffDocs(entry.doc, draft),
    [entry.doc, draft],
  );
  const dirty = changes.length > 0;

  const setField = useCallback((path: string, kind: FieldKind, raw: string) => {
    setStatus(null);
    setPending(null);
    setState((prev) => {
      const parsed = parseField(kind, raw);
      const next: DraftState = {
        ...prev,
        edits: { ...prev.edits },
        raw: { ...prev.raw, [path]: raw },
        localErrors: { ...prev.localErrors },
      };
      if (parsed.ok) {
        next.edits[path] = parsed.value;
        delete next.localErrors[path];
      } else {
        next.localErrors[path] = parsed.error;
      }
      return next;
    });
  }, []);

  const setWhole = useCallback((json: string) => {
    setStatus(null);
    setPending(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      setState((prev) => ({ ...prev, wholeError: e instanceof Error ? e.message : String(e) }));
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setState((prev) => ({ ...prev, wholeError: "最外層必須是一個 JSON 物件" }));
      return;
    }
    // a whole-document replacement supersedes the per-field edits typed so far
    setState({
      edits: {},
      raw: {},
      localErrors: {},
      whole: parsed as Record<string, unknown>,
      wholeError: null,
    });
  }, []);

  const errors = useMemo(() => {
    const m = new Map<string, string>();
    for (const issue of issues) m.set(issue.path, issue.message);
    for (const [path, msg] of Object.entries(state.localErrors)) m.set(path, msg);
    return m;
  }, [issues, state.localErrors]);

  const fieldState: FieldState = useMemo(
    () => ({ draft, errors, raw: new Map(Object.entries(state.raw)), setField, busy }),
    [draft, errors, state.raw, setField, busy],
  );

  const edit: DetailEdit | null =
    open && available
      ? {
          renderField: (path, kind) => <FieldEditor path={path} kind={kind} edit={fieldState} />,
          draft,
          setWhole,
          wholeError: state.wholeError,
        }
      : null;

  const discard = useCallback(() => {
    setState(EMPTY_DRAFT);
    setIssues([]);
    setPending(null);
    setStatus(null);
  }, []);

  /** STEP 1 — dry-run every write and show the diff. Nothing is written. */
  const review = useCallback(async () => {
    if (!available) return;
    setBusy(true);
    setStatus(null);
    try {
      const steps = writePlan(entry.kind, entry.id, draft, championDoc);
      const found: EditIssue[] = [];
      for (const step of steps) {
        const res = await api.validate(
          step.collection === "items" ? "item" : step.collection === "champions" ? "champion" : "ability",
          step.id,
          step.doc,
        );
        if (res.error !== null) {
          setStatus({ text: res.error, tone: "err" });
          setIssues([]);
          return;
        }
        found.push(...res.issues);
      }
      setIssues(found);
      if (found.length > 0) {
        setStatus({ text: `有 ${found.length} 個欄位不符合 schema，尚未寫入任何檔案。`, tone: "err" });
        setPending(null);
        return;
      }
      setPending(steps);
      setStatus({ text: "驗證通過。以下是即將寫入的變更 —— 確認後才會動到檔案。", tone: "warn" });
    } finally {
      setBusy(false);
    }
  }, [api, draft, entry.kind, entry.id, championDoc]);

  /** STEP 2 — actually write. The server snapshots each file before overwriting. */
  const commit = useCallback(async () => {
    if (!available || pending === null) return;
    setBusy(true);
    try {
      const out = await api.save(pending);
      if (!out.ok) {
        setIssues(out.issues);
        setStatus({
          text:
            (out.error ?? `有 ${out.issues.length} 個欄位不符合 schema`) +
            (out.written.length > 0
              ? `　⚠ 已寫入 ${out.written.length} 份檔案後失敗，請用「復原」還原：${out.written.map((w) => `${w.collection}/${w.id}`).join("、")}`
              : "　（沒有任何檔案被修改）"),
          tone: "err",
        });
        return;
      }
      const mirrored = out.written.filter((w) => w.reason === "mirror");
      setStatus({
        text:
          `已寫入 ${out.written.length} 份檔案（${out.contentVersion ?? "cv_?"}）` +
          (mirrored.length > 0 ? `，含英雄內嵌技能同步 ${mirrored.map((w) => w.id).join("、")}` : "") +
          "。舊內容已備份，可用「復原」還原。",
        tone: "ok",
      });
      setPending(null);
      setState(EMPTY_DRAFT);
      setIssues([]);
      onSaved();
    } finally {
      setBusy(false);
    }
  }, [api, pending, onSaved]);

  /** Undo the most recent save of THIS document (the mirror is restored too). */
  const undo = useCallback(async () => {
    if (!available) return;
    setBusy(true);
    try {
      const collection = collectionOf(entry.kind);
      const res = await api.restore(collection, entry.id);
      if (!res.ok) {
        setStatus({ text: res.error ?? "沒有可還原的備份", tone: "err" });
        return;
      }
      let note = `已還原 ${collection}/${entry.id} 的上一版（${res.restored ?? "?"}）。`;
      if (championDoc !== null && typeof championDoc["id"] === "string") {
        const mirror = await api.restore("champions", championDoc["id"] as string);
        if (mirror.ok) note += `英雄內嵌副本也已還原（${mirror.restored ?? "?"}）。`;
      }
      setStatus({ text: note, tone: "ok" });
      setState(EMPTY_DRAFT);
      setIssues([]);
      setPending(null);
      onSaved();
    } finally {
      setBusy(false);
    }
  }, [api, entry.kind, entry.id, championDoc, onSaved]);

  const loadBackups = useCallback(async () => {
    if (!available) return;
    setBackups(await api.backups(collectionOf(entry.kind), entry.id));
  }, [api, entry.kind, entry.id]);

  /**
   * Opening the editor probes the dev content-api once. Without this the first
   * 檢視變更 against a service that simply is not running fails with a raw
   * transport error; naming the command to start it is the difference between
   * a confusing bug and a two-second fix.
   */
  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        void api.probe().then((up) => {
          if (!up) {
            setStatus({
              text:
                "這個位址沒有內容寫入通道。遊戲用的 dev server（:39527）會發佈到區域網路，" +
                "所以刻意不代理 /content-api —— 內容編輯請開只綁定本機的後台：" +
                "http://127.0.0.1:60721/admin/ （並先執行 `pnpm dev:editor` 啟動 content-api）。閱讀不受影響。",
              tone: "err",
            });
          }
        });
      }
      return !wasOpen;
    });
    discard();
  }, [api, discard]);

  return (
    <EditContext.Provider value={edit}>
      {available && (
        <EditBar
          open={open}
          busy={busy}
          dirty={dirty}
          changes={changes}
          pending={pending}
          status={status}
          backups={backups}
          onToggle={toggle}
          onReview={() => void review()}
          onCommit={() => void commit()}
          onDiscard={discard}
          onUndo={() => void undo()}
          onLoadBackups={() => void loadBackups()}
        />
      )}
      <div style={bodyStyle}>{children}</div>
    </EditContext.Provider>
  );
}

// ⭐ 語意色彩預覽（task #114）—— **2026-09-03 拆掉**（GH#757）：
//   `descriptionRoles` 全 repo 零份內容有值 ⇒ 這個預覽器**從來沒有東西可預覽**。
//   整條鏈另存在 `docs/legacy/_retired-chains/role-markup-114.md`。

// ---------------------------------------------------------------------------

function EditBar({
  open,
  busy,
  dirty,
  changes,
  pending,
  status,
  backups,
  onToggle,
  onReview,
  onCommit,
  onDiscard,
  onUndo,
  onLoadBackups,
}: {
  open: boolean;
  busy: boolean;
  dirty: boolean;
  changes: readonly DocChange[];
  pending: readonly WritePlanStep[] | null;
  status: { text: string; tone: "ok" | "warn" | "err" } | null;
  backups: readonly BackupEntry[];
  onToggle: () => void;
  onReview: () => void;
  onCommit: () => void;
  onDiscard: () => void;
  onUndo: () => void;
  onLoadBackups: () => void;
}): React.JSX.Element {
  const tone = status?.tone === "ok" ? "#47cc6a" : status?.tone === "warn" ? GOLD : "#f08c8c";
  return (
    <div
      style={{
        marginTop: 10,
        border: `1px solid ${open ? GOLD + "66" : "#2c3448"}`,
        borderRadius: 8,
        background: open ? "#141a26" : "transparent",
        padding: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Btn small kind={open ? "primary" : "ghost"} onClick={onToggle} title="本機開發版限定：直接改寫 content/ 下的 JSON">
          {open ? "✎ 編輯中" : "✎ 編輯"}
        </Btn>
        {open && (
          <>
            <Btn small onClick={onReview} disabled={busy || !dirty} title="先驗證並顯示即將寫入的差異，不會動到檔案">
              檢視變更
            </Btn>
            <Btn small kind="primary" onClick={onCommit} disabled={busy || pending === null} title="寫入 content/（寫入前自動備份舊檔）">
              確認寫入
            </Btn>
            <Btn small onClick={onDiscard} disabled={busy || !dirty}>
              放棄
            </Btn>
            <Btn small kind="danger" onClick={onUndo} disabled={busy} title="還原這份文件的上一個備份">
              ⟲ 復原上一次儲存
            </Btn>
            <Btn small onClick={onLoadBackups} disabled={busy} title="列出這份文件的備份歷史">
              備份歷史
            </Btn>
          </>
        )}
        {open && (
          <span style={{ fontSize: 10, color: TEXT_DIM }}>
            {dirty ? `${changes.length} 處變更` : "尚未修改"}
          </span>
        )}
      </div>

      {open && !dirty && pending === null && status === null && (
        <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 6, lineHeight: 1.5 }}>
          直接修改下面帶輸入框的欄位。此功能只存在於本機開發版，且後端只接受來自本機的寫入；
          每次寫入前都會自動備份舊檔，可隨時復原。
        </div>
      )}

      {status && (
        <div style={{ fontSize: 11, color: tone, marginTop: 6, lineHeight: 1.5 }}>{status.text}</div>
      )}

      {open && pending !== null && <DiffTable changes={changes} steps={pending} />}

      {open && backups.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 3 }}>備份歷史（最新在上）</div>
          {backups.slice(0, 12).map((b) => (
            <div key={b.file} style={{ fontSize: 10.5, color: TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>
              {new Date(b.at).toLocaleString()} · {b.bytes} bytes · {b.file}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffTable({
  changes,
  steps,
}: {
  changes: readonly DocChange[];
  steps: readonly WritePlanStep[];
}): React.JSX.Element {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 4 }}>
        即將寫入 {steps.length} 份檔案：
        {steps.map((s) => `${s.collection}/${s.id}${s.reason === "mirror" ? "（同步內嵌副本）" : ""}`).join("、")}
      </div>
      <div
        style={{
          maxHeight: 200,
          overflow: "auto",
          border: "1px solid #202838",
          borderRadius: 6,
          background: "#0b0e16",
          padding: 6,
        }}
      >
        {changes.map((c) => (
          <div key={c.path} style={{ fontSize: 10.5, lineHeight: 1.5, fontFamily: "ui-monospace, monospace" }}>
            <span style={{ color: GOLD }}>{c.path || "(root)"}</span>{" "}
            <span style={{ color: "#e08878" }}>{c.before}</span>{" "}
            <span style={{ color: TEXT_DIM }}>→</span>{" "}
            <span style={{ color: "#47cc6a" }}>{c.after}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
