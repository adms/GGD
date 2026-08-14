/**
 * 地圖驗證報告 —— **唯讀**（GH#324 Phase 4）。
 *
 * ⛔ 這一頁刻意**沒有**儲存鈕。地圖幾何的唯一來源是 `content/maps/*.json`，
 * 改完要跑 `pnpm map:gen`；後台存檔**不會**觸發產生器，所以 override 會與線上
 * 實際載入的 `arena@1` **靜默分岔** —— 那是「後台 override 蓋掉 content」的最壞版本。
 * owner 2026-08-14 確認過這條界線。
 *
 * ⚠️ 這一頁畫的是**產生器的輸出**（`config.map-report@1`），
 * 而 `map:check` 保證它永遠等於產生器現在會算出來的東西 ⇒ 它腐爛不了。
 */
import { useEffect, useState } from "react";
import { Panel } from "./widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getShippedDoc } from "../api";
import {
  zConfigMapReportDoc,
  type MapReportRow,
} from "@ggd/shared/content/schema/mapReportDoc";

const num = (v: number): string => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

export function MapReportPage(): JSX.Element {
  const [rows, setRows] = useState<MapReportRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getShippedDoc("config", "map-report")
      .then((r) => {
        if (!live) return;
        const parsed = zConfigMapReportDoc.safeParse(r.doc);
        if (!parsed.success) {
          setErr("報告文件不存在或格式不符 —— 跑一次 `pnpm map:gen` 再 `pnpm content:build`。");
          return;
        }
        setRows(parsed.data.maps);
      })
      .catch((e: unknown) => {
        if (live) setErr(String(e));
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Panel title="🗺️ 地圖驗證報告（唯讀）">
      <div style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
        每一張動漫競技場的九項體檢。⚙️ 這份是 <code>pnpm map:gen</code> 產生的 ——
        <strong>這一頁沒有儲存鈕是刻意的</strong>：地圖幾何的唯一來源是{" "}
        <code>content/maps/*.json</code>，後台存檔不會觸發產生器，改在這裡只會讓後台與
        線上實際載入的場地靜默分岔。
        <br />
        ⚠️ <strong>連通性／出生點／互動點可達／對戰分區數</strong>是正確性，產生器一律
        拒絕輸出；其餘是品味項，由「小地圖規格」那一頁的 severity 決定。
      </div>

      {err !== null && <div style={{ color: DANGER }}>{err}</div>}
      {rows === null && err === null && <div style={{ color: TEXT_DIM }}>讀取中…</div>}

      {rows !== null && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                {["地圖", "模板", "尺寸", "區域", "斷開", "死路", "迴圈", "瓶頸", "捷徑", "互動點", "橫跨", "分區", ""].map(
                  (h) => (
                    <th key={h} style={{ borderBottom: `1px solid ${PANEL_BORDER}`, padding: "6px 8px" }}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.mapId} style={{ color: TEXT_MAIN }}>
                  <td style={{ padding: "6px 8px" }}>{m.mapId}</td>
                  <td style={{ padding: "6px 8px", color: TEXT_DIM }}>{m.template}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {m.cols}×{m.rows}
                    <span style={{ color: TEXT_DIM }}>
                      {" "}
                      = {m.worldW}×{m.worldD}
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px" }}>{m.regions}</td>
                  <td style={{ padding: "6px 8px", color: m.disconnectedAreas === 1 ? TEXT_MAIN : DANGER }}>
                    {m.disconnectedAreas}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{m.deadEnds}</td>
                  <td style={{ padding: "6px 8px" }}>{m.loops}</td>
                  <td style={{ padding: "6px 8px" }}>{m.chokepoints}</td>
                  <td style={{ padding: "6px 8px" }}>{m.shortcuts}</td>
                  <td style={{ padding: "6px 8px" }}>{m.interactions}</td>
                  <td style={{ padding: "6px 8px" }}>{num(m.estimatedTraversalSec)} 秒</td>
                  <td style={{ padding: "6px 8px" }}>{m.duelZones}</td>
                  <td style={{ padding: "6px 8px", color: m.ok ? OK : DANGER }}>
                    {m.ok ? "✓" : "✗"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.some((m) => m.issues.length > 0) && (
            <div style={{ marginTop: 14 }}>
              {rows.flatMap((m) =>
                m.issues.map((i, k) => (
                  <div
                    key={`${m.mapId}-${k}`}
                    style={{ color: i.kind === "hard" ? DANGER : GOLD, fontSize: 13, padding: "2px 0" }}
                  >
                    {i.kind === "hard" ? "⛔" : "⚠️"} <strong>{m.mapId}</strong> [{i.check}] {i.message}
                  </div>
                )),
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
