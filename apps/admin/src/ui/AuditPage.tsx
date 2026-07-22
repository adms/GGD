/** Audit log viewer — the append-only record of every admin mutation. */
import { useEffect, useState } from "react";
import * as apiFns from "../api";
import { ApiError } from "../session";
import type { AuditEntry } from "../types";
import { Btn, ErrorBanner, Panel } from "./widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "./theme";

const ACTION_LABEL: Record<string, string> = {
  mcoin_adjust: "M COIN adjust",
  mmr_set: "MMR set",
  ban: "Ban",
  unban: "Unban",
  announcement_create: "Announcement created",
  announcement_update: "Announcement updated",
  announcement_delete: "Announcement deleted",
};

export function AuditPage(): React.JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 50;

  async function load(p = 1): Promise<void> {
    setError(null);
    try {
      const res = await apiFns.listAudit(p, pageSize);
      setEntries(res.entries);
      setTotal(res.total);
      setPage(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "load failed");
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Panel
      title={`Audit log · ${total}`}
      right={
        <Btn small onClick={() => void load(page)}>
          Refresh
        </Btn>
      }
    >
      <ErrorBanner text={error} onDismiss={() => setError(null)} />
      {entries.length === 0 ? (
        <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 10 }}>No audit entries.</div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: error ? 10 : 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                <th style={th}>When</th>
                <th style={th}>Action</th>
                <th style={th}>Target</th>
                <th style={th}>Detail</th>
                <th style={th}>Admin</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} style={{ borderTop: "1px solid #232c40" }}>
                  <td style={{ ...td, color: TEXT_DIM, whiteSpace: "nowrap" }}>{fmt(e.ts)}</td>
                  <td style={{ ...td, color: GOLD }}>{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td style={{ ...td, fontFamily: "monospace" }}>{e.targetId.slice(0, 12)}…</td>
                  <td style={td}>{detail(e)}</td>
                  <td style={{ ...td, fontFamily: "monospace", color: TEXT_DIM }}>{e.adminId.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, color: TEXT_DIM, fontSize: 12 }}>
        <Btn small disabled={page <= 1} onClick={() => void load(page - 1)}>
          ← Prev
        </Btn>
        <span>
          Page {page} / {maxPage}
        </span>
        <Btn small disabled={page >= maxPage} onClick={() => void load(page + 1)}>
          Next →
        </Btn>
      </div>
    </Panel>
  );
}

function detail(e: AuditEntry): string {
  if (!e.detail) return "—";
  return Object.entries(e.detail)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("  ");
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 8px", color: TEXT_MAIN };
