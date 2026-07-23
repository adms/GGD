/**
 * 模型預算 — every model with its triangle count, texture size and VRAM cost,
 * WHERE IT IS USED, and the same-screen budget with its limit and warning line.
 *
 * THE NUMBERS ARE NOT MEASURED HERE. They are read from task #99's published
 * report; this file is presentation only (see assets/modelBudget.ts for why).
 * When the report is absent the page does not go blank and it does not
 * improvise: it lists the model documents that exist in the content tree, marks
 * every metric 「未量測」, and names the exact thing that has to be run. A budget
 * page that fills its columns with zeroes is worse than an empty one, because
 * zeroes get believed.
 */
import { useMemo, useState } from "react";
import { Panel, Btn, TextInput, Badge } from "./widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { useModelBudget } from "../assets/useModelBudget";
import {
  BUDGET_CANDIDATE_URLS,
  ageText,
  buildOptimiseWorklist,
  budgetHealth,
  fmtBytes,
  fmtInt,
  isOverThreshold,
  limitFor,
  overThresholdModels,
  sortModelsHeavyToLight,
  verdictFor,
  type BudgetLimit,
  type BudgetModelRow,
  type BudgetScreen,
  type BudgetVerdict,
  type HealthLevel,
} from "../assets/modelBudget";

const LEVEL_COLOR: Record<HealthLevel, string> = {
  missing: DANGER,
  stale: WARN,
  unknown: TEXT_DIM,
  ok: OK,
};
const LEVEL_LABEL: Record<HealthLevel, string> = {
  missing: "尚未發布",
  stale: "已過期",
  unknown: "無法判斷",
  ok: "一致",
};

const VERDICT_COLOR: Record<BudgetVerdict, string> = {
  over: DANGER,
  warn: WARN,
  ok: OK,
  unknown: TEXT_DIM,
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function Cell(props: { children: React.ReactNode; dim?: boolean; align?: "left" | "right" }): React.JSX.Element {
  return (
    <td
      style={{
        padding: "6px 10px",
        borderTop: PANEL_BORDER,
        fontSize: 12,
        color: props.dim ? TEXT_DIM : TEXT_MAIN,
        textAlign: props.align ?? "left",
        fontFamily: props.align === "right" ? MONO : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </td>
  );
}

function Th(props: { children: React.ReactNode; align?: "left" | "right" }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "6px 10px",
        fontSize: 10,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: TEXT_DIM,
        textAlign: props.align ?? "left",
        fontWeight: 700,
      }}
    >
      {props.children}
    </th>
  );
}

/** One metric against its budget line. Prints the limit it used, or says none. */
function MetricCell(props: {
  value: number | null;
  limit: BudgetLimit | undefined;
  format: (n: number | null) => string;
  /** the report's OWN verdict for this axis — authoritative over the coarse line */
  verdict?: BudgetVerdict;
}): React.JSX.Element {
  const v = props.verdict && props.verdict !== "unknown" ? props.verdict : verdictFor(props.value, props.limit);
  const limitText =
    props.limit === undefined
      ? "無上限"
      : `上限 ${props.limit.limit === null ? "—" : props.format(props.limit.limit)}` +
        (props.limit.warn === null ? "" : ` · 警戒 ${props.format(props.limit.warn)}`);
  return (
    <td
      style={{
        padding: "6px 10px",
        borderTop: PANEL_BORDER,
        textAlign: "right",
        fontFamily: MONO,
        fontSize: 12,
        color: VERDICT_COLOR[v],
        whiteSpace: "nowrap",
      }}
      title={limitText}
    >
      {props.format(props.value)}
      {v === "over" ? " ⛔" : v === "warn" ? " ⚠" : ""}
    </td>
  );
}

function ScreenCard(props: {
  screen: BudgetScreen;
  limitOf: (screen: BudgetScreen, key: string) => BudgetLimit | undefined;
}): React.JSX.Element {
  const { screen } = props;
  const rows: { key: string; label: string; value: number | null; fmt: (n: number | null) => string }[] = [
    { key: "triangles", label: "三角面", value: screen.triangles, fmt: fmtInt },
    { key: "textureBytes", label: "貼圖", value: screen.textureBytes, fmt: fmtBytes },
    { key: "vramBytes", label: "VRAM", value: screen.vramBytes, fmt: fmtBytes },
    { key: "drawCalls", label: "Draw calls", value: screen.drawCalls, fmt: fmtInt },
  ];
  return (
    <div style={{ border: PANEL_BORDER, borderRadius: 10, padding: 12, minWidth: 260, flex: "1 1 280px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_MAIN, marginBottom: 2 }}>{screen.label}</div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8 }}>
        {screen.models.length > 0
          ? `${screen.models.length} 個模型 · 合計 ${screen.models.reduce((n, m) => n + m.count, 0)} 個實例`
          : "報告沒有列出這個畫面包含哪些模型"}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r) => {
            const lim = props.limitOf(screen, r.key);
            const v = verdictFor(r.value, lim);
            return (
              <tr key={r.key}>
                <td style={{ fontSize: 11, color: TEXT_DIM, padding: "3px 0" }}>{r.label}</td>
                <td style={{ fontSize: 12, fontFamily: MONO, textAlign: "right", color: VERDICT_COLOR[v] }}>
                  {r.fmt(r.value)}
                </td>
                <td
                  style={{
                    fontSize: 10,
                    color: TEXT_DIM,
                    textAlign: "right",
                    paddingLeft: 8,
                    fontFamily: MONO,
                  }}
                >
                  {lim === undefined
                    ? "無上限"
                    : `/ ${lim.limit === null ? "—" : r.fmt(lim.limit)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {screen.note && <div style={{ fontSize: 11, color: WARN, marginTop: 6 }}>{screen.note}</div>}
    </div>
  );
}

const OVER_METRIC_LABEL: Record<string, string> = {
  triangles: "三角面",
  drawCalls: "Draw call",
  maxTextureEdge: "貼圖邊長",
  animChannels: "動畫通道",
};

/** One over-threshold asset: what it breached, and whether the offline optimiser
 *  can shrink it (texture/geometry) or it needs re-authoring (draw calls / anim). */
function OverRow(props: { row: BudgetModelRow; queued: boolean }): React.JSX.Element {
  const { row } = props;
  const over = Object.entries(row.verdicts)
    .filter(([, v]) => v === "over")
    .map(([k]) => k);
  return (
    <tr>
      <Cell>
        <span style={{ fontFamily: MONO, color: TEXT_MAIN }}>{row.id}</span>
        {row.worstCount !== null && row.worstCount > 1 && (
          <span style={{ marginLeft: 6, fontSize: 10, color: TEXT_DIM }}>×{row.worstCount} 同框</span>
        )}
      </Cell>
      <Cell dim>{row.role || "—"}</Cell>
      <Cell align="right">{fmtBytes(row.vramBytes)}</Cell>
      <Cell align="right">{fmtInt(row.triangles)}</Cell>
      <Cell>
        <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {over.map((k) => (
            <Badge key={k} color={DANGER}>
              {OVER_METRIC_LABEL[k] ?? k}
            </Badge>
          ))}
        </span>
      </Cell>
      <Cell>
        {props.queued ? (
          <Badge color={OK}>已可最佳化</Badge>
        ) : (
          <span title="只超在 draw call 或動畫通道上，減面／縮圖無法處理，需重製模型">
            <Badge color={WARN}>需重製</Badge>
          </span>
        )}
      </Cell>
    </tr>
  );
}

export function ModelBudgetPage(): React.JSX.Element {
  const {
    report,
    live,
    recon,
    indexFailed,
    tried,
    loading,
    checkedAt,
    pinnedUrl,
    setPinnedUrl,
    reload,
  } = useModelBudget();
  const [urlDraft, setUrlDraft] = useState(pinnedUrl);
  const [filter, setFilter] = useState("");

  const notes = useMemo(
    () => budgetHealth({ report, recon, tried, indexFailed }),
    [report, recon, tried, indexFailed],
  );
  const worst: HealthLevel = notes.some((n) => n.level === "missing")
    ? "missing"
    : notes.some((n) => n.level === "stale")
      ? "stale"
      : notes.some((n) => n.level === "unknown")
        ? "unknown"
        : "ok";

  /**
   * Rows to render, HEAVY → LIGHT. Measured models lead, sorted by the cost that
   * actually fills a frame (VRAM, then triangles); live docs the report never
   * measured trail behind, alphabetical, each marked 未量測. A budget table that
   * buried the heaviest asset in an alphabetical list would hide the one row an
   * operator opened the page to find.
   */
  const rows = useMemo(() => {
    const byId = new Map(report?.models.map((m) => [m.id, m]) ?? []);
    const measured = report ? sortModelsHeavyToLight(report.models).map((m) => m.id) : [];
    const unmeasured = live.map((m) => m.id).filter((id) => !byId.has(id)).sort();
    const ids = [...measured, ...unmeasured];
    const q = filter.trim().toLowerCase();
    return ids
      .filter((id) => q === "" || id.toLowerCase().includes(q))
      .map((id) => ({ id, row: byId.get(id) ?? null, liveDoc: live.find((m) => m.id === id) ?? null }));
  }, [report, live, filter]);

  const totals = useMemo(() => {
    const models = report?.models ?? [];
    const sum = (pick: (m: (typeof models)[number]) => number | null): number | null => {
      const vals = models.map(pick).filter((n): n is number => n !== null);
      return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
    };
    return {
      triangles: sum((m) => m.triangles),
      textureBytes: sum((m) => m.textureBytes),
      vramBytes: sum((m) => m.vramBytes),
    };
  }, [report]);

  // ---- the offline-optimise worklist ----
  const overModels = useMemo(() => overThresholdModels(report), [report]);
  const worklist = useMemo(() => buildOptimiseWorklist(report), [report]);
  const queuedIds = useMemo(() => new Set(worklist.items.map((i) => i.id)), [worklist]);
  const brokenCount = useMemo(() => (report?.models.filter((m) => m.broken !== "").length ?? 0), [report]);
  const [queuedAt, setQueuedAt] = useState<{ n: number; at: number } | null>(null);

  /**
   * Produce the optimise worklist and hand it to the operator as a file. The
   * console cannot (and must not) write into the content tree or run a
   * destructive pass — it PRODUCES the worklist; the offline optimiser (#115)
   * consumes it. tools/model-budget/worklist.ts writes the identical schema, so
   * either the downloaded file or a fresh CLI run drives the same optimiser.
   */
  const queueOptimise = (): void => {
    const wl = buildOptimiseWorklist(report);
    const blob = new Blob([JSON.stringify(wl, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "optimize-worklist.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setQueuedAt({ n: wl.totals.queued, at: Date.now() });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1180 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, color: TEXT_MAIN }}>模型預算</h1>
        <Badge color={LEVEL_COLOR[worst]}>{LEVEL_LABEL[worst]}</Badge>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
          {loading
            ? "讀取中…"
            : checkedAt === null
              ? "尚未讀取"
              : `上次讀取 ${new Date(checkedAt).toLocaleTimeString()}`}
        </span>
        <Btn small onClick={reload} title="重新抓取報告與內容索引">
          ↻ 重新讀取
        </Btn>
      </div>

      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
        每一個三角面數、貼圖大小、VRAM 與「用在哪裡」都是<strong style={{ color: TEXT_MAIN }}>任務 #99 量測</strong>
        後發布的結果，本頁只負責顯示，不自己數 —— 兩套數字一旦不一致，兩套都不能用。本頁自己算的只有一件事：
        報告涵蓋的模型與內容樹裡實際存在的模型是否一致，也就是這份報告有沒有過期。
      </div>

      {/* ---- 狀態判定：本頁的數字現在可不可信 ---- */}
      <Panel title="資料狀態">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Badge color={LEVEL_COLOR[n.level]}>{LEVEL_LABEL[n.level]}</Badge>
              <div style={{ fontSize: 12, color: TEXT_MAIN, lineHeight: 1.7 }}>
                {n.text}
                {n.fix && (
                  <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3 }}>
                    ➜ {n.fix}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, borderTop: PANEL_BORDER, paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>
            報告來源：
            {report ? (
              <code style={{ color: TEXT_MAIN }}>{report.url}</code>
            ) : (
              <span style={{ color: WARN }}>找不到（已依序嘗試 {tried.length} 個位置）</span>
            )}
            {report?.generatedAt && (
              <>
                {" · 產生於 "}
                <span style={{ color: TEXT_MAIN }}>{report.generatedAt}</span>
                {checkedAt !== null && ageText(report.generatedAt, checkedAt) !== "" && (
                  <span> （{ageText(report.generatedAt, checkedAt)}）</span>
                )}
              </>
            )}
            {report?.generatedBy && <> · 產生者 <code>{report.generatedBy}</code></>}
            {report?.schema && <> · schema <code>{report.schema}</code></>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: TEXT_DIM, minWidth: 96 }}>指定報告網址</span>
            <div style={{ flex: "1 1 320px", minWidth: 240 }}>
              <TextInput
                value={urlDraft}
                onChange={setUrlDraft}
                onEnter={() => setPinnedUrl(urlDraft)}
                placeholder={BUDGET_CANDIDATE_URLS[0]}
              />
            </div>
            <Btn small kind="primary" onClick={() => setPinnedUrl(urlDraft)}>
              套用
            </Btn>
            <Btn
              small
              onClick={() => {
                setUrlDraft("");
                setPinnedUrl("");
              }}
              disabled={pinnedUrl === ""}
            >
              清除
            </Btn>
          </div>
          <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 6, fontFamily: MONO }}>
            預設探測順序：{BUDGET_CANDIDATE_URLS.join(" → ")}
          </div>
        </div>
      </Panel>

      {/* ---- 同畫面預算 ---- */}
      <Panel
        title="同畫面預算"
        right={
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            上限與警戒線由報告提供，本頁不設定也不猜測
          </span>
        }
      >
        {report && report.screens.length > 0 ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {report.screens.map((s) => (
              <ScreenCard key={s.id} screen={s} limitOf={(sc, key) => limitFor(report, sc, key)} />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>
            報告尚未提供同畫面預算，因此無法回答「一場戰鬥同時出現這些模型會不會爆」。
            這一段刻意留白 —— 由本頁自行湊一個「大概的畫面」等於發明了一個沒有人量測過的上限。
          </div>
        )}
      </Panel>

      {/* ---- 超出門檻的資產 · 離線最佳化 ---- */}
      <Panel
        title="超出門檻的資產 · 離線最佳化"
        right={
          <Btn
            small
            kind="primary"
            onClick={queueOptimise}
            disabled={worklist.items.length === 0}
            title={
              worklist.items.length === 0
                ? "沒有可由離線最佳化處理的資產"
                : `產生 optimize-worklist.json（${worklist.items.length} 個資產）`
            }
          >
            ⬇ 排入離線最佳化（{worklist.items.length}）
          </Btn>
        }
      >
        {report === null ? (
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>
            報告尚未發布，因此無法判斷哪些資產超出門檻，也就沒有可排入的最佳化清單。
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>
                超出硬上限 <b style={{ color: overModels.length > 0 ? DANGER : OK, fontFamily: MONO }}>{overModels.length}</b>
              </span>
              <span>
                可離線最佳化 <b style={{ color: TEXT_MAIN, fontFamily: MONO }}>{worklist.items.length}</b>
              </span>
              <span>
                預估可省 VRAM <b style={{ color: GOLD, fontFamily: MONO }}>{fmtBytes(worklist.totals.estVramSavedBytes)}</b>
              </span>
              {brokenCount > 0 && <span style={{ color: WARN }}>破圖／零面 {brokenCount}（無法最佳化，需重製）</span>}
            </div>

            <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7, marginBottom: 12 }}>
              「排入離線最佳化」只<strong style={{ color: TEXT_MAIN }}>產生一份工作清單</strong>
              （<code>optimize-worklist.json</code>，schema <code>{worklist.schema}</code>），本頁不改動任何內容、也不執行破壞性流程。
              真正的貼圖縮放與減面由離線最佳化工具（#115）在獨立產出樹進行，原始檔永不就地覆寫。清單只排入「工具真的能縮小的」資產
              —— 只超在 draw call 或動畫通道上的資產無法自動處理，另外標為需重製。
              {queuedAt !== null && (
                <div style={{ color: OK, marginTop: 6 }}>
                  ✓ 已產生 worklist（{queuedAt.n} 個資產），於 {new Date(queuedAt.at).toLocaleTimeString()} 下載。
                </div>
              )}
              <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6, fontFamily: MONO }}>
                離線執行：pnpm --filter @ggd/model-budget budget:worklist --optimize
              </div>
            </div>

            {overModels.length === 0 ? (
              <div style={{ fontSize: 12, color: OK }}>目前沒有任何資產超出硬上限。</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr>
                      <Th>資產</Th>
                      <Th>角色</Th>
                      <Th align="right">VRAM</Th>
                      <Th align="right">三角面</Th>
                      <Th>超出項目</Th>
                      <Th>離線最佳化</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {overModels.map((m) => (
                      <OverRow key={m.id} row={m} queued={queuedIds.has(m.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* ---- 每個模型 ---- */}
      <Panel
        title={`每個模型（${recon.measured.length} / ${recon.liveTotal} 已量測）`}
        right={
          <div style={{ width: 220 }}>
            <TextInput value={filter} onChange={setFilter} placeholder="篩選模型 id…" />
          </div>
        }
      >
        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>
            合計三角面 <b style={{ color: TEXT_MAIN, fontFamily: MONO }}>{fmtInt(totals.triangles)}</b>
          </span>
          <span>
            合計貼圖 <b style={{ color: TEXT_MAIN, fontFamily: MONO }}>{fmtBytes(totals.textureBytes)}</b>
          </span>
          <span>
            合計 VRAM <b style={{ color: TEXT_MAIN, fontFamily: MONO }}>{fmtBytes(totals.vramBytes)}</b>
          </span>
          <span style={{ color: GOLD }}>
            尚未量測 {recon.unmeasured.length}
          </span>
          {recon.orphaned.length > 0 && (
            <span style={{ color: WARN }}>報告中已不存在的模型 {recon.orphaned.length}</span>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <Th>模型</Th>
                <Th align="right">三角面</Th>
                <Th align="right">頂點</Th>
                <Th align="right">貼圖</Th>
                <Th align="right">貼圖數</Th>
                <Th align="right">VRAM</Th>
                <Th align="right">Draw</Th>
                <Th>用在哪裡</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, row, liveDoc }) => (
                <tr key={id}>
                  <Cell>
                    <span style={{ fontFamily: MONO, color: row ? TEXT_MAIN : TEXT_DIM }}>{id}</span>
                    {liveDoc === null && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: WARN }}>（內容樹已無此文件）</span>
                    )}
                    {row?.note && (
                      <div style={{ fontSize: 10, color: WARN }}>{row.note}</div>
                    )}
                  </Cell>
                  {row === null ? (
                    <td
                      colSpan={7}
                      style={{
                        padding: "6px 10px",
                        borderTop: PANEL_BORDER,
                        fontSize: 11,
                        color: TEXT_DIM,
                      }}
                    >
                      尚未量測 —— 這一列來自內容樹的模型文件清單，不是量測結果。
                    </td>
                  ) : (
                    <>
                      <MetricCell
                        value={row.triangles}
                        limit={limitFor(report, null, "triangles")}
                        format={fmtInt}
                        verdict={row.verdicts.triangles}
                      />
                      <Cell align="right" dim>
                        {fmtInt(row.vertices)}
                      </Cell>
                      <MetricCell
                        value={row.textureBytes}
                        limit={limitFor(report, null, "textureBytes")}
                        format={fmtBytes}
                      />
                      <Cell align="right" dim>
                        {fmtInt(row.textureCount)}
                      </Cell>
                      <MetricCell
                        value={row.vramBytes}
                        limit={limitFor(report, null, "vramBytes")}
                        format={fmtBytes}
                      />
                      <MetricCell
                        value={row.drawCalls}
                        limit={limitFor(report, null, "drawCalls")}
                        format={fmtInt}
                        verdict={row.verdicts.drawCalls}
                      />
                      <Cell dim>
                        {row.usedBy.length === 0 ? (
                          <span style={{ color: WARN }}>報告未追蹤使用位置</span>
                        ) : (
                          <span title={row.usedBy.join("\n")}>
                            {row.usedBy.slice(0, 3).join("、")}
                            {row.usedBy.length > 3 ? ` …+${row.usedBy.length - 3}` : ""}
                          </span>
                        )}
                      </Cell>
                    </>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <Cell dim>
                    {indexFailed ? "讀不到內容索引。" : "沒有符合篩選的模型。"}
                  </Cell>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
