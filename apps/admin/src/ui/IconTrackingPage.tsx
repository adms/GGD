/**
 * ICON 生成追蹤 — live coverage per kind, live provider status, the pinned style
 * spec rendered from its source, the contact-sheet plan, and the cost with its
 * authorisation state.
 *
 * NOTHING ON THIS PAGE IS MEASURED HERE.
 *   coverage / exclusions   task #97 + #72   (codexCoverage.ts, codexPlan.ts)
 *   style spec / prompts    task #101        (assetConsoleData.ts, emitted from
 *                                             #72's real Python functions)
 *   provider readiness      task #101        (platform /api/v1/ai/readiness)
 *   cost + authorisation    task #101        (the runner's own pricing table)
 * This file is presentation, plus the ONE thing only a consolidated page can
 * own: whether those feeds agree (assets/iconTracking.ts → trackingNotes).
 *
 * THE API KEY IS NEVER HERE. Not displayed, not accepted, not logged, not
 * stored. The readiness projection is booleans plus a reason code; the remedy
 * for "no provider" is a button that navigates to AI 生成設定, where the key is
 * typed once and never leaves the server.
 */
import { useMemo, useState } from "react";
import { Panel, Btn, Badge } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { useApp } from "../store";
import { useIconTracking, POLL_MS } from "../assets/useIconTracking";
import {
  AI_SETTINGS_PAGE,
  KIND_LABEL,
  tierCounts,
  trackingNotes,
  worstLevel,
  type NoteLevel,
} from "../assets/iconTracking";
import {
  useProviderReadiness,
  useStyleSpec,
} from "../../../client/src/ui/assets/useAssetConsole";
import {
  EMIT_COMMAND,
  authorisation,
  canGenerateImages,
  estimateCost,
  operatorAction,
  pricedModels,
  pricedQualities,
  usd,
  type SubjectMode,
  type Tier,
} from "@ggd/shared/assetConsole/assetConsoleData";
import {
  COVERAGE_KINDS,
  type CoverageBucket,
} from "@ggd/shared/codex/codexCoverage";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const COVERED = "#57c98a";
const BLOCKED = "#a37bd8";
const TRACK = "#131a28";

const LEVEL_COLOR: Record<NoteLevel, string> = {
  blocked: DANGER,
  stale: WARN,
  unknown: TEXT_DIM,
  ok: OK,
};
const LEVEL_LABEL: Record<NoteLevel, string> = {
  blocked: "不可信",
  stale: "已過期",
  unknown: "無法判斷",
  ok: "一致",
};

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/**
 * One bar. Fill is covered/needed; the BLOCKED band (real content whose art
 * nobody may generate yet) rides at the far right so it can never be mistaken
 * for progress while still being visible as part of the denominator.
 */
function Bar({ bucket, height }: { bucket: CoverageBucket; height: number }): React.JSX.Element {
  const denom = Math.max(1, bucket.needed);
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: height / 2,
        background: TRACK,
        border: PANEL_BORDER,
        overflow: "hidden",
        flex: 1,
        minWidth: 60,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          right: "auto",
          width: `${(bucket.covered / denom) * 100}%`,
          background: `linear-gradient(90deg, #3f9c6d 0%, ${COVERED} 100%)`,
          transition: "width 420ms ease-out",
        }}
      />
      {bucket.blocked > 0 && (
        <div
          title="版權暫停：真的需要圖示，但現在不能生成"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: `${(bucket.blocked / denom) * 100}%`,
            background: `repeating-linear-gradient(135deg, ${BLOCKED}bb 0 5px, ${BLOCKED}44 5px 10px)`,
          }}
        />
      )}
    </div>
  );
}

function KindRow({ kind, bucket }: { kind: string; bucket: CoverageBucket }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
      <div style={{ width: 84, flexShrink: 0, color: TEXT_MAIN }}>{KIND_LABEL[kind] ?? kind}</div>
      <Bar bucket={bucket} height={10} />
      <div style={{ width: 96, flexShrink: 0, textAlign: "right", fontFamily: MONO, color: TEXT_MAIN }}>
        {bucket.covered} / {bucket.needed}
      </div>
      <div style={{ width: 52, flexShrink: 0, textAlign: "right", color: TEXT_DIM }}>
        {pct(bucket.percent)}
      </div>
      <div style={{ width: 84, flexShrink: 0, textAlign: "right", color: TEXT_DIM }}>
        {bucket.excluded > 0 ? `排除 ${bucket.excluded}` : `共 ${bucket.total}`}
      </div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <pre
      style={{
        margin: 0,
        padding: "8px 10px",
        background: "#0d1119",
        border: PANEL_BORDER,
        borderRadius: 8,
        fontSize: 11,
        lineHeight: 1.6,
        color: TEXT_MAIN,
        fontFamily: MONO,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowX: "auto",
      }}
    >
      {children}
    </pre>
  );
}

export function IconTrackingPage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  const [applyCandidates, setApplyCandidates] = useState(false);
  const [tier, setTier] = useState<Tier>("tier1");
  const [subject, setSubject] = useState<SubjectMode>("derived");
  const [model, setModel] = useState("gpt-image-1");
  const [quality, setQuality] = useState("low");
  const [showSlot, setShowSlot] = useState(0);

  const t = useIconTracking(applyCandidates);
  const provider = useProviderReadiness();
  const spec = useStyleSpec();

  const notes = useMemo(
    () =>
      trackingNotes({
        scan: t.scan,
        coverage: t.coverage,
        plan: t.plan,
        spec: spec.spec,
        freshness: spec.freshness,
        probe: provider.probe,
        bytesScanned: t.icons !== null,
      }),
    [t.scan, t.coverage, t.plan, spec.spec, spec.freshness, provider.probe, t.icons],
  );
  const worst = worstLevel(notes);

  const tiers = tierCounts(t.plan, t.coverage);
  const pricing = spec.spec?.pricing ?? null;
  const est = estimateCost({ ...tiers, tier, model, quality, subject, pricing });
  const auth = authorisation(provider.probe, est);
  const action = operatorAction(provider.probe);
  const models = pricedModels(pricing);
  const qualities = pricedQualities(pricing, model);

  const all = t.coverage.all;
  const slots = spec.spec?.contactSheet.slots ?? [];
  const slot = slots[Math.min(showSlot, Math.max(0, slots.length - 1))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1180 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, color: TEXT_MAIN }}>ICON 生成追蹤</h1>
        <Badge color={LEVEL_COLOR[worst]}>{LEVEL_LABEL[worst]}</Badge>
        <div style={{ flex: 1 }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: TEXT_DIM }}>
          <input type="checkbox" checked={t.auto} onChange={(e) => t.setAuto(e.target.checked)} />
          每 {Math.round(POLL_MS / 1000)} 秒自動更新
        </label>
        <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
          {t.checking
            ? "檢查中…"
            : t.lastCheckedAt === null
              ? "尚未檢查"
              : `上次檢查 ${new Date(t.lastCheckedAt).toLocaleTimeString()}`}
        </span>
        <Btn small onClick={t.checkNow}>
          ↻ 立即檢查
        </Btn>
      </div>

      {/* ---- 狀態判定 ---- */}
      <Panel title="資料狀態">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Badge color={LEVEL_COLOR[n.level]}>{LEVEL_LABEL[n.level]}</Badge>
              <div style={{ fontSize: 12, color: TEXT_MAIN, lineHeight: 1.7 }}>
                {n.text}
                {n.fix && <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3 }}>➜ {n.fix}</div>}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ---- 覆蓋率 ---- */}
      <Panel
        title="圖示覆蓋率"
        right={
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            分母＝從 /content 讀到的實際筆數 · 分子＝宣告了 icon 且抓得到
          </span>
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <Bar bucket={all} height={18} />
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: all.percent >= 99.9 ? COVERED : GOLD,
              fontFamily: MONO,
              minWidth: 84,
              textAlign: "right",
            }}
          >
            {pct(all.percent)}
          </div>
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM, display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
          <span>
            已完成 <b style={{ color: COVERED }}>{all.covered}</b>
          </span>
          <span title="還沒有圖示，而且沒有被排除">
            待補 <b style={{ color: all.backlog > 0 ? GOLD : COVERED }}>{all.backlog}</b>
          </span>
          {all.blocked > 0 && (
            <span title="需要圖示，但現在不能生成（第三方版權）">
              版權暫停 <b style={{ color: BLOCKED }}>{all.blocked}</b>
            </span>
          )}
          <span>
            需要圖示 <b style={{ color: TEXT_MAIN }}>{all.needed}</b>
          </span>
          <span title="計畫判定「不需要圖示」的筆數 —— 不算缺漏，是決定">
            排除 <b style={{ color: TEXT_MAIN }}>{all.excluded}</b>
          </span>
          <span>
            內容總筆數 <b style={{ color: TEXT_MAIN }}>{all.total}</b>
          </span>
          {all.broken > 0 && (
            <span style={{ color: DANGER }}>宣告了 icon 但載不到 {all.broken}（不計入已完成）</span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {COVERAGE_KINDS.map((kind) => (
            <KindRow key={kind} kind={kind} bucket={t.coverage.byKind[kind]} />
          ))}
        </div>

        <div style={{ marginTop: 12, borderTop: PANEL_BORDER, paddingTop: 10, fontSize: 11, color: TEXT_DIM }}>
          {t.plan ? (
            <>
              排除依據：任務 #72 的 <code style={{ color: TEXT_MAIN }}>content/config/icon-plan.json</code>（
              {t.plan.templateVersion}）—— 本頁不自行判定。
              {Object.values(t.plan.dropped)
                .filter((b) => b.ids.length > 0)
                .map((b) => ` ${b.label} ${b.ids.length}`)
                .join("、")}
            </>
          ) : (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: WARN }}>
              <input
                type="checkbox"
                checked={applyCandidates}
                onChange={(e) => setApplyCandidates(e.target.checked)}
              />
              先用候選規則試算（空說明 / 名稱=ID，{t.coverage.candidateTotal} 筆，僅供參考、非 #72 的判定）
            </label>
          )}
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn small onClick={t.scanBytes} disabled={t.scanningBytes || t.scan.state !== "ready"}>
            {t.scanningBytes ? "掃描中…" : "掃描圖檔位元組"}
          </Btn>
          <span style={{ fontSize: 10, color: TEXT_DIM }}>
            {t.icons === null
              ? "尚未抓過圖檔本體 —— 「載不到」與「重複的圖」都還是未知。"
              : `已雜湊 ${t.icons.hashes.size} 個圖檔 · 抓不到 ${t.icons.failed.length} 個 · 位元組完全相同的群組 ${t.duplicates.size} 組`}
          </span>
        </div>

        <div style={{ marginTop: 8, fontSize: 10, color: TEXT_DIM }}>
          本頁開啟後已重讀 {t.rereadTotal} 份文件
          {t.pendingReread > 0 ? ` · 還有 ${t.pendingReread} 份排隊中` : ""} · 資料來自 /content，與遊戲讀的是同一份
        </div>
      </Panel>

      {/* ---- 供應商狀態 ---- */}
      <Panel
        title="供應商狀態"
        right={
          <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
            {provider.checkedAt === null
              ? "詢問中…"
              : `上次詢問 ${new Date(provider.checkedAt).toLocaleTimeString()}`}
          </span>
        }
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <Badge
            color={
              provider.probe.state === "unreachable"
                ? TEXT_DIM
                : canGenerateImages(provider.probe)
                  ? OK
                  : WARN
            }
          >
            {provider.probe.state === "loading"
              ? "查詢中"
              : provider.probe.state === "unreachable"
                ? "問不到"
                : canGenerateImages(provider.probe)
                  ? "已設定"
                  : "佔位模式 STUB"}
          </Badge>
          <span style={{ fontSize: 13, color: TEXT_MAIN }}>{action.headline}</span>
        </div>
        {action.steps.length > 0 && (
          <ol style={{ margin: "0 0 10px 18px", padding: 0, fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>
            {action.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
        {provider.probe.state === "ok" && !provider.probe.readiness.loopback && (
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8 }}>
            這台機器不是開發機，平台只回傳布林值、不說明缺哪一項（刻意如此）。
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn small kind="primary" onClick={() => navigate("ai")}>
            前往 {AI_SETTINGS_PAGE}
          </Btn>
          <Btn small onClick={provider.refresh}>
            ↻ 重新詢問
          </Btn>
          <span style={{ fontSize: 10, color: TEXT_DIM }}>
            本頁不顯示、不接受、不記錄任何 API 金鑰；平台只回傳布林值與原因碼。
          </span>
        </div>
      </Panel>

      {/* ---- 成本與授權 ---- */}
      <Panel title="成本與授權狀態">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: TEXT_DIM }}>
            範圍{" "}
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
              style={{ background: "#10141f", color: TEXT_MAIN, border: PANEL_BORDER, borderRadius: 6, padding: "3px 6px" }}
            >
              <option value="tier1">tier1（現在畫面上會出現的）{` ${tiers.tier1}`}</option>
              <option value="tier2">tier2{` ${tiers.tier2}`}</option>
              <option value="both">全部{` ${tiers.tier1 + tiers.tier2}`}</option>
            </select>
          </label>
          <label style={{ fontSize: 11, color: TEXT_DIM }}>
            模型{" "}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{ background: "#10141f", color: TEXT_MAIN, border: PANEL_BORDER, borderRadius: 6, padding: "3px 6px" }}
            >
              {models.length === 0 && <option value={model}>{model}</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 11, color: TEXT_DIM }}>
            品質{" "}
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              style={{ background: "#10141f", color: TEXT_MAIN, border: PANEL_BORDER, borderRadius: 6, padding: "3px 6px" }}
            >
              {qualities.length === 0 && <option value={quality}>{quality}</option>}
              {qualities.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 11, color: TEXT_DIM }}>
            主體句{" "}
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectMode)}
              style={{ background: "#10141f", color: TEXT_MAIN, border: PANEL_BORDER, borderRadius: 6, padding: "3px 6px" }}
            >
              <option value="derived">rules（離線詞庫，免費）</option>
              <option value="text">text（每張多一次 /ai/text）</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: TEXT_MAIN, marginBottom: 10 }}>
          <span>
            張數 <b style={{ fontFamily: MONO }}>{est.images}</b>
          </span>
          <span>
            單價{" "}
            <b style={{ fontFamily: MONO }}>{est.rate === null ? "價目表沒有這一組" : usd(est.rate)}</b>
          </span>
          {est.textCalls > 0 && (
            <span>
              文字呼叫 <b style={{ fontFamily: MONO }}>{est.textCalls}</b>（{usd(est.textUsd)}）
            </span>
          )}
          <span style={{ color: GOLD }}>
            估計總額 <b style={{ fontFamily: MONO, fontSize: 15 }}>{usd(est.totalUsd)}</b>
          </span>
          {est.quotedAsOf && <span style={{ color: TEXT_DIM }}>價目報價時點 {est.quotedAsOf}</span>}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
          <Badge color={auth.billable ? WARN : OK}>{auth.billable ? "可能產生費用" : "不可能產生費用"}</Badge>
          <div style={{ fontSize: 12, color: TEXT_MAIN, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700 }}>{auth.headline}</div>
            <div style={{ color: TEXT_DIM }}>{auth.detail}</div>
          </div>
        </div>
        <Mono>{auth.command}</Mono>
        <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 6 }}>
          本頁不會執行它 —— 授權是在指令列上做的動作，不是網頁上的一個按鈕。
        </div>
      </Panel>

      {/* ---- 樣式規格 ---- */}
      <Panel
        title="釘住的美術方向（樣式規格）"
        right={
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            {spec.spec ? `${spec.spec.templateVersion} · ${spec.spec.generatedAt}` : "未發布"}
          </span>
        }
      >
        {spec.spec === null ? (
          <div style={{ fontSize: 12, color: WARN, lineHeight: 1.8 }}>
            {spec.error ?? "樣式規格尚未發布。"}
            <div style={{ marginTop: 8 }}>
              <Mono>{EMIT_COMMAND}</Mono>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, color: TEXT_DIM }}>
              這一段不是打字打上去的：<code>emit_style_spec.py</code> 直接呼叫 #72 的{" "}
              <code>prompt.build_prompt</code> / <code>prompt.derive</code> 產生，所以 #72 一改，這裡就會過期並顯示警告。
            </div>
            <div>
              <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 3 }}>PREFIX（永不外包給模型）</div>
              <Mono>{spec.spec.template.prefix}</Mono>
            </div>
            <div>
              <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 3 }}>NEGATIVE</div>
              <Mono>{spec.spec.template.negative}</Mono>
            </div>
            <div>
              <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 3 }}>組成方式</div>
              <Mono>{spec.spec.template.shape}</Mono>
            </div>
            <div>
              <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 3 }}>規則</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: TEXT_MAIN, lineHeight: 1.8 }}>
                {spec.spec.rules.map((r) => (
                  <li key={r.id}>
                    <code style={{ color: ACCENT }}>{r.id}</code> — {r.text}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ fontSize: 10, color: TEXT_DIM }}>
              來源檔：
              {spec.spec.sources.map((s) => (
                <span key={s.path} style={{ marginRight: 10, fontFamily: MONO }}>
                  {s.path}@{s.sha256.slice(0, 8)}
                </span>
              ))}
              {spec.freshness.state === "fresh" && <span style={{ color: OK }}>· 與磁碟一致</span>}
              {spec.freshness.state === "stale" && <span style={{ color: WARN }}>· 已過期</span>}
              {spec.freshness.state === "unknown" && <span>· 無法驗證</span>}
            </div>
            <div>
              <Btn small onClick={spec.reload}>
                ↻ 重新讀取規格
              </Btn>
            </div>
          </div>
        )}
      </Panel>

      {/* ---- 對照表計畫 ---- */}
      <Panel
        title={`對照表計畫（contact sheet · ${slots.length} 格）`}
        right={
          spec.spec ? (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>{spec.spec.contactSheet.note}</span>
          ) : null
        }
      >
        {slots.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>樣式規格尚未發布，因此沒有對照表計畫。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {slots.map((s, i) => (
                <button
                  key={`${s.id}-${i}`}
                  onClick={() => setShowSlot(i)}
                  title={`${s.probe} — ${s.name || s.id}`}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    fontSize: 10,
                    fontFamily: MONO,
                    cursor: "pointer",
                    color: i === showSlot ? TEXT_MAIN : TEXT_DIM,
                    background: i === showSlot ? "#1b2338" : "#141a28",
                    border: i === showSlot ? `1px solid ${ACCENT}` : PANEL_BORDER,
                  }}
                >
                  {i + 1}. {s.probe}
                  {s.found ? "" : " ⛔"}
                </button>
              ))}
            </div>
            {slot && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: TEXT_MAIN }}>
                  <b>{slot.name || slot.id}</b>{" "}
                  <span style={{ color: TEXT_DIM, fontFamily: MONO }}>
                    {slot.family}/{slot.id}
                  </span>{" "}
                  <Badge color={slot.confidence === "low" ? WARN : TEXT_DIM}>{slot.signal || "?"}</Badge>
                </div>
                <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.8 }}>{slot.why}</div>
                <div>
                  <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 3 }}>
                    主體句（說明 {slot.descriptionChars} 字）
                  </div>
                  <Mono>{slot.subject}</Mono>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 3 }}>送出的完整提示詞</div>
                  <Mono>{slot.prompt}</Mono>
                </div>
              </div>
            )}
            {spec.spec && (
              <div>
                <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 3 }}>產生這 16 格的指令</div>
                <Mono>{spec.spec.contactSheet.runCommand}</Mono>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
