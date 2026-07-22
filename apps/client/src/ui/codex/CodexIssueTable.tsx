/**
 * CodexIssueTable — the SUPPLEMENTARY broken-data table, pinned to the very
 * bottom of the codex.
 *
 * The user's ruling (2026-07-22): 「你提的 破損資料要顯眼地渲染出來，但在應該是
 * 獨立表格放到最底下僅供額外參考」. So:
 *   • the three browse sections above carry NO warning badges — browsing stays
 *     clean and readable;
 *   • everything lands here, grouped by issue type with a count per group, so
 *     it reads as a to-do list;
 *   • each row links back UP to the entry (which opens it in the detail pane
 *     and scrolls its section to the row);
 *   • big groups start collapsed — the report must never out-shout the codex.
 */
import { useState } from "react";
import { PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import type { CodexIssueGroup } from "./codexIssues";
import { issueTotal } from "./codexIssues";
import type { CodexKind, CodexRef } from "@ggd/shared/codex/codexTypes";
import type { IconScanState } from "./useCodex";

/** Groups larger than this start collapsed (still counted in the header). */
const AUTO_EXPAND_MAX = 40;

const KIND_LABEL: Record<CodexKind, string> = { item: "道具", champion: "英雄", ability: "技能" };

function Group({ group, onJump }: { group: CodexIssueGroup; onJump: (ref: CodexRef) => void }): React.JSX.Element {
  const [open, setOpen] = useState(group.issues.length <= AUTO_EXPAND_MAX);
  return (
    <div style={{ border: PANEL_BORDER, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          textAlign: "left",
          padding: "9px 12px",
          background: "#1a1320",
          border: "none",
          borderBottom: open ? PANEL_BORDER : "none",
          color: TEXT_MAIN,
          cursor: "pointer",
        }}
      >
        <span style={{ color: "#e0a878", fontSize: 12 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{group.label}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#f0b088",
            border: "1px solid #6a4530",
            borderRadius: 999,
            padding: "1px 8px",
          }}
        >
          {group.issues.length}
        </span>
      </button>
      {open && (
        <div>
          <div style={{ padding: "8px 12px", fontSize: 11, lineHeight: 1.6, color: TEXT_DIM, background: "#12141d" }}>
            {group.note}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                  <th style={{ padding: "5px 12px", fontWeight: 500, width: 60 }}>類型</th>
                  <th style={{ padding: "5px 8px", fontWeight: 500, width: 130 }}>ID</th>
                  <th style={{ padding: "5px 8px", fontWeight: 500 }}>名稱</th>
                  <th style={{ padding: "5px 8px", fontWeight: 500 }}>問題</th>
                  <th style={{ padding: "5px 12px", fontWeight: 500, width: 64 }} />
                </tr>
              </thead>
              <tbody>
                {group.issues.map((issue, i) => (
                  <tr key={`${issue.ref.kind}:${issue.ref.id}:${i}`} style={{ borderTop: "1px solid #1d2331" }}>
                    <td style={{ padding: "5px 12px", color: TEXT_DIM }}>{KIND_LABEL[issue.ref.kind]}</td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>
                      {issue.ref.id}
                    </td>
                    <td style={{ padding: "5px 8px", color: TEXT_MAIN, wordBreak: "break-word" }}>{issue.name}</td>
                    <td style={{ padding: "5px 8px", color: "#c8b0a0", wordBreak: "break-word" }}>{issue.detail}</td>
                    <td style={{ padding: "5px 12px", textAlign: "right" }}>
                      <button
                        onClick={() => onJump(issue.ref)}
                        title="跳到上方的該筆資料"
                        style={{
                          background: "transparent",
                          border: "1px solid #2c3448",
                          borderRadius: 5,
                          color: "#9fb0cc",
                          fontSize: 10.5,
                          padding: "2px 7px",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ↑ 檢視
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export interface CodexIssueTableProps {
  groups: readonly CodexIssueGroup[];
  iconScan: IconScanState;
  onJump: (ref: CodexRef) => void;
}

export function CodexIssueTable({ groups, iconScan, onJump }: CodexIssueTableProps): React.JSX.Element {
  return (
    <section id="codex-issues" style={{ marginTop: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          borderTop: "2px solid #4a2f3a",
          paddingTop: 12,
          marginBottom: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#f0b088" }}>破損資料報告</h2>
        <span style={{ fontSize: 12, color: TEXT_MAIN }}>共 {issueTotal(groups)} 筆</span>
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          僅供額外參考 — 不屬於上面的瀏覽內容，上方三區保持乾淨不加警告標記。
        </span>
        {iconScan !== "done" && (
          <span style={{ fontSize: 11, color: "#8d97ad" }}>
            {iconScan === "running" ? "（圖示位元組掃描中…重複圖示分組稍後補上）" : "（尚未掃描圖示位元組）"}
          </span>
        )}
      </div>
      {groups.length === 0 ? (
        <div style={{ fontSize: 12, color: TEXT_DIM }}>沒有偵測到破損資料。</div>
      ) : (
        groups.map((g) => <Group key={g.type} group={g} onJump={onJump} />)
      )}
    </section>
  );
}
