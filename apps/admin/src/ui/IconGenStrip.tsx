/**
 * IconGenStrip — the 內容管理 surface for task #186:「後台新增英雄、技能、武器、
 * 道具…這些時，也自動動態生成適合的 icon」.
 *
 * ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
 * A document with no icon renders as a GlyphTile LETTER TILE (「鐵」「疾」「B」).
 * That is not a cosmetic gap — it is the project's most-repeated complaint,
 *「根本不知道哪招是哪招」, arriving through a side door. #110 made card icons
 * mandatory on the draft screen for exactly this reason, so every un-iconed doc
 * the console creates walks that regression back in. The fix belongs at the
 * CREATE seam, not in a batch run somebody has to remember to start.
 *
 * ── WHY A STRIP AND NOT A MODAL ─────────────────────────────────────────────
 * Generation is seconds to minutes on MPS. Blocking ＋新增 on it would trade a
 * missing icon for an unusable console, so the save completes instantly and the
 * art lands after: the strip is the progress surface, polled the same way #97's
 * live coverage bar recomputes from /content. Nothing here can delay a write.
 *
 * ── THE THREE STATES, ALL OF WHICH SPEAK ────────────────────────────────────
 *   live      daemon up on a machine that can render → art arrives by itself.
 *   readonly  dev build, but the daemon is unreachable OR reports no torch/MPS
 *             (the family host). The strip says art is PENDING and prints the
 *             command that starts the service. It never spins forever and it
 *             never writes a placeholder — a letter tile the owner can see beats
 *             a gradient that looks finished.
 *   off       not a dev build. The strip renders nothing at all, because the
 *             whole 內容管理 chunk is absent from a production build.
 * A REFUSAL is also a state that speaks: blocked / author-art / already-done are
 * printed as sentences, so「我按了為什麼沒圖」always has an answer on screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isIconable,
  jobLine,
  modeMessage,
  serviceMode,
  type IconApi,
  type IconHealth,
  type IconJob,
  type IconServiceMode,
  type JobLists,
  type SkipReason,
} from "../icons/iconApi";
import { Btn } from "./widgets";
import { DANGER, OK, PANEL_BORDER, TEXT_DIM, WARN } from "./theme";

/** Same 4s cadence #97's coverage bar polls at — visible, not chatty. */
const POLL_MS = 4000;
/** Keep polling this long after the last request, so a queued job is still seen. */
const TAIL_MS = 20 * 60 * 1000;

const EMPTY: JobLists = { active: [], recent: [] };

interface Note {
  readonly key: string;
  readonly text: string;
  readonly tone: "ok" | "warn" | "err";
}

export interface IconGen {
  readonly mode: IconServiceMode;
  readonly health: IconHealth | null;
  readonly message: string;
  readonly active: readonly IconJob[];
  readonly recent: readonly IconJob[];
  readonly notes: readonly Note[];
  /** fire-and-forget: NEVER await this on a save path */
  readonly request: (collection: string, id: string, force?: boolean) => void;
  readonly refresh: () => void;
}

/**
 * The live handle. `request` returns void on purpose — an `await`able version
 * of it is an invitation to block ＋新增 on a GPU, which is the one thing this
 * feature must never do.
 */
export function useIconGen(api: IconApi, onIconWritten?: () => void): IconGen {
  const [health, setHealth] = useState<IconHealth | null>(null);
  const [lists, setLists] = useState<JobLists>(EMPTY);
  const [notes, setNotes] = useState<readonly Note[]>([]);
  const untilRef = useRef(0);
  const doneRef = useRef<Set<string>>(new Set());
  const alive = useRef(true);
  const written = useRef(onIconWritten);
  written.current = onIconWritten;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (!api.enabled) return;
    void api.health().then((r) => {
      if (alive.current) setHealth(r.ok ? r.data : null);
    });
  }, [api]);

  useEffect(() => refresh(), [refresh]);

  const pollJobs = useCallback(() => {
    if (!api.enabled) return;
    void api.jobs().then((r) => {
      if (!alive.current || !r.ok || r.data === null) return;
      setLists(r.data);
      // A job that just reached `done` wrote a file (and, off the augment path,
      // an `icon` field). Tell the caller so the list re-reads and the art
      // actually appears — otherwise the owner sees a success line next to a
      // letter tile, which reads as a lie.
      for (const j of r.data.recent) {
        if (j.state === "done" && !doneRef.current.has(j.id)) {
          doneRef.current.add(j.id);
          written.current?.();
        }
      }
    });
  }, [api]);

  useEffect(() => {
    if (!api.enabled) return;
    const tick = (): void => {
      // Only poll while there is something to watch: an idle console must not
      // hammer a socket that may not even be listening.
      if (lists.active.length > 0 || Date.now() < untilRef.current) pollJobs();
    };
    const h = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(h);
  }, [api.enabled, lists.active.length, pollJobs]);

  const note = useCallback((key: string, text: string, tone: Note["tone"]) => {
    setNotes((prev) => [...prev.filter((n) => n.key !== key), { key, text, tone }].slice(-6));
  }, []);

  const request = useCallback(
    (collection: string, id: string, force = false): void => {
      if (!api.enabled) return;
      if (!isIconable(collection)) return; // loot-tables have no art; stay silent
      untilRef.current = Date.now() + TAIL_MS;
      void api.enqueue({ collection, id, force }).then((r) => {
        if (!alive.current) return;
        if (r.ok) {
          pollJobs();
          return;
        }
        // A refusal is an OUTCOME, not an error to swallow. Say it.
        note(`${collection}/${id}`, `${id}：${refusalText(r.reason, r.error)}`,
             r.reason === null ? "err" : "warn");
        refresh();
      });
    },
    [api, note, pollJobs, refresh],
  );

  const mode = serviceMode(health);
  return {
    mode,
    health,
    message: modeMessage(mode, health),
    active: lists.active,
    recent: lists.recent,
    notes,
    request,
    refresh,
  };
}

function refusalText(reason: SkipReason | null, error: string | null): string {
  switch (reason) {
    case "blocked":
      return "在版權暫停名單裡，不產圖（要先由人決定改成原創或維持文字後備）。";
    case "author-art":
      return "已經有 w3x／手選的圖，不覆蓋。";
    case "already-done":
      return "已經有這一代方法畫好的圖了。";
    case "no-icons":
      return "這個分類沒有圖示慣例。";
    case "no-doc":
      return "找不到這份文件。";
    default:
      return error ?? "未知錯誤。";
  }
}

// ---------------------------------------------------------------------------

/** The always-visible status line + whatever is in flight. */
export function IconGenStrip(props: { gen: IconGen }): React.JSX.Element | null {
  const { gen } = props;
  if (gen.mode === "off") return null;
  const tone = gen.mode === "live" ? OK : WARN;
  return (
    <div
      style={{
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        lineHeight: 1.7,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: tone, fontWeight: 600 }}>
          自動產圖 {gen.mode === "live" ? "運作中" : "待補"}
        </span>
        <Btn small onClick={gen.refresh}>
          重新檢查
        </Btn>
      </div>
      <div style={{ color: gen.mode === "live" ? TEXT_DIM : WARN }}>{gen.message}</div>
      {gen.health !== null && gen.health.blocked > 0 && (
        <div style={{ color: TEXT_DIM }}>
          版權暫停名單 {gen.health.blocked} 筆 —— 這些 id 不會被自動產圖。
        </div>
      )}
      {gen.active.map((j) => {
        const line = jobLine(j);
        return (
          <div key={j.id} style={{ color: WARN }}>
            {line.text}
          </div>
        );
      })}
      {gen.recent.slice(0, 3).map((j) => {
        const line = jobLine(j);
        return (
          <div
            key={j.id}
            style={{ color: line.tone === "ok" ? OK : line.tone === "warn" ? TEXT_DIM : DANGER }}
          >
            {line.text}
          </div>
        );
      })}
      {gen.notes.map((n) => (
        <div key={n.key} style={{ color: n.tone === "err" ? DANGER : TEXT_DIM }}>
          {n.text}
        </div>
      ))}
    </div>
  );
}

/**
 * The manual escape hatch on one document: 補圖 for anything that never got art
 * (the 16 known `name:"none"` abilities among them), and 重畫 to redraw OUR OWN
 * previous generation. There is deliberately no button that can overwrite w3x
 * or hand-picked art — the daemon refuses that outright, `force` or not.
 */
export function IconGenButton(props: {
  gen: IconGen;
  collection: string;
  id: string;
  /** true when the doc already carries a generated icon */
  hasIcon: boolean;
}): React.JSX.Element | null {
  const { gen, collection, id, hasIcon } = props;
  if (gen.mode === "off" || !isIconable(collection)) return null;
  const busy = gen.active.some((j) => j.docId === id);
  if (gen.mode !== "live") {
    return (
      <span style={{ fontSize: 11, color: WARN }}>
        圖示待補（產圖服務未啟動）
      </span>
    );
  }
  return (
    <Btn small onClick={() => gen.request(collection, id, hasIcon)} disabled={busy}>
      {busy ? "產圖中…" : hasIcon ? "重畫圖示" : "補圖示"}
    </Btn>
  );
}
