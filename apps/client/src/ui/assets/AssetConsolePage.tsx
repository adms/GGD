/**
 * AssetConsolePage — 資產主控台 (#assets), task #101.
 *
 * WHY THIS PAGE IS A CONSOLE AND NOT A FOURTH REPORT
 * --------------------------------------------------
 * The user has now asked three times, escalating, for the same thing: 「請你把
 * 武器道具、英雄、技能都做成一頁列表…(動態即時非寫死)」 → 「你獨立做成一頁 model
 * 面數+貼圖大小 list 吧」 → 「這些內容應該也是獨立一頁動態內容」. They playtest
 * continuously and treat the running app as the source of truth, and they have
 * said outright that they want to VERIFY rather than trust:
 * 「讓我知道你真的有在作事而不是忘了」.
 *
 * Three tasks were converging on one question — "what is the real state of the
 * assets?" — and three separate hash routes would have been worse than one
 * console with sections. So this is the SHELL:
 *
 *   供應商        live, from the running platform (this file)
 *   圖示覆蓋率     #97's <IconCoverageBar>, IMPORTED, not reimplemented
 *   樣式規格       #72's prompt.py, rendered from a digest-guarded snapshot
 *   對照表         16 probe slots with their exact prompts
 *   費用與授權     the plan's counts x the runner's own price table
 *   模型預算       an empty, labelled seam for #99
 *
 * FILE OWNERSHIP: nothing here forks another task's logic. Coverage numbers come
 * from #97's component and #72's plan reader; the art direction comes from #72's
 * Python evaluated by tools/icon-console/emit_style_spec.py. If any of those
 * change, this page changes with them — that is the point. Two implementations
 * of one count is how a console starts lying.
 *
 * STALENESS IS THE FAILURE MODE. Every section states where its numbers came
 * from and when. The single section that CANNOT be computed at view time (the
 * style spec, which lives in Python) carries its own freshness check against a
 * live digest of its sources and shows a loud banner the moment it drifts.
 *
 * NEVER: this page does not display, accept, log or store an API key. It reads
 * booleans and an operator hint from an endpoint that has a test forbidding key
 * material. The key is typed into the admin console and stays server-side.
 */
import { useMemo, useState } from "react";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { HUD_Z } from "../hud/hudLayout";
import { Btn } from "../platform/widgets";
import { Tooltip } from "../components/Tooltip";
import { IconCoverageBar } from "../codex/IconCoverageBar";
import { useCodex } from "../codex/useCodex";
import { openCodex } from "../codex/CodexRoute";
import {
  useProviderReadiness,
  useStyleSpec,
  PROVIDER_POLL_MS,
  type ProviderState,
} from "./useAssetConsole";
import {
  EMIT_COMMAND,
  STYLE_SPEC_URL,
  authorisation,
  canGenerateImages,
  digestsAgree,
  estimateCost,
  operatorAction,
  pricedModels,
  pricedQualities,
  usd,
  type ContactSlot,
  type ProviderProbe,
  type StyleSpec,
  type Tier,
  type SubjectMode,
} from "@ggd/shared/assetConsole/assetConsoleData";

const OK = "#57c98a";
const WARN = "#e0a878";
const BAD = "#f08c8c";
const HELD = "#a37bd8";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// ------------------------------------------------------------- chrome -----

function Section({
  id,
  title,
  subtitle,
  right,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      id={id}
      style={{
        border: PANEL_BORDER,
        borderRadius: 10,
        background: "linear-gradient(180deg, #131a29 0%, #0e121b 100%)",
        padding: "12px 14px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: 1, color: TEXT_MAIN }}>
          {title}
        </h2>
        {subtitle && <span style={{ fontSize: 11, color: TEXT_DIM }}>{subtitle}</span>}
        <div style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

function Lamp({ color, label }: { color: string; label: string }): React.JSX.Element {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 8px ${color}`,
          flexShrink: 0,
        }}
      />
      <b style={{ color, fontSize: 12 }}>{label}</b>
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <code
      style={{
        fontFamily: MONO,
        fontSize: 11,
        background: "#0a0d14",
        border: "1px solid #232b3d",
        borderRadius: 4,
        padding: "1px 5px",
        color: "#c8d2e6",
        wordBreak: "break-all",
      }}
    >
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }): React.JSX.Element {
  return (
    <pre
      style={{
        margin: 0,
        fontFamily: MONO,
        fontSize: 11,
        lineHeight: 1.55,
        color: "#c8d2e6",
        background: "#0a0d14",
        border: "1px solid #232b3d",
        borderRadius: 6,
        padding: "8px 10px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 260,
        overflowY: "auto",
      }}
    >
      {children}
    </pre>
  );
}

// ----------------------------------------------------------- provider -----

function ProviderSection({ state }: { state: ProviderState }): React.JSX.Element {
  const { probe, polling, setPolling, refresh, checkedAt } = state;
  const action = operatorAction(probe);
  const live = canGenerateImages(probe);

  const lamp =
    probe.state === "loading" ? (
      <Lamp color={TEXT_DIM} label="查詢中" />
    ) : probe.state === "unreachable" ? (
      <Lamp color={BAD} label="平台無回應" />
    ) : live ? (
      <Lamp color={OK} label="可正式生成" />
    ) : (
      <Lamp color={WARN} label="佔位模式 STUB" />
    );

  const r = probe.state === "ok" ? probe.readiness : null;

  return (
    <Section
      id="asset-provider"
      title="供應商狀態"
      subtitle="即時讀自執行中的 platform，不是寫死的文字"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: TEXT_DIM }}
            title={`每 ${Math.round(PROVIDER_POLL_MS / 1000)} 秒重新查詢一次`}
          >
            <input type="checkbox" checked={polling} onChange={(e) => setPolling(e.target.checked)} />
            自動更新
          </label>
          <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
            {checkedAt === null ? "尚未查詢" : new Date(checkedAt).toLocaleTimeString()}
          </span>
          <Btn small onClick={refresh} title="立刻重新查詢供應商狀態">
            ↻ 立即檢查
          </Btn>
        </div>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {lamp}
        <span style={{ fontSize: 12, color: TEXT_MAIN }}>{action.headline}</span>
      </div>

      {r && (
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            fontSize: 11,
            color: TEXT_DIM,
            marginTop: 8,
          }}
        >
          <span>
            圖片 <b style={{ color: r.imageReady ? OK : WARN }}>{r.imageReady ? "就緒" : "stub"}</b>
          </span>
          <span>
            文字 <b style={{ color: r.textReady ? OK : WARN }}>{r.textReady ? "就緒" : "stub"}</b>
          </span>
          <span>
            語音 <b style={{ color: r.ttsReady ? OK : WARN }}>{r.ttsReady ? "就緒" : "stub"}</b>
          </span>
          <span>
            音樂 <b style={{ color: r.musicReady ? OK : WARN }}>{r.musicReady ? "就緒" : "stub"}</b>
          </span>
          {r.imageModel && (
            <span>
              模型 <b style={{ color: TEXT_MAIN }}>{r.imageModel}</b>
            </span>
          )}
          {r.imageHost && (
            <span>
              端點主機 <b style={{ color: TEXT_MAIN }}>{r.imageHost}</b>
            </span>
          )}
          {!r.loopback && <span style={{ color: WARN }}>非開發機：平台只回傳布林值，細節保留</span>}
        </div>
      )}

      {action.steps.length > 0 && (
        <div
          style={{
            marginTop: 10,
            border: `1px solid ${WARN}55`,
            borderRadius: 8,
            background: "#1a1710",
            padding: "9px 11px",
          }}
        >
          <div style={{ fontSize: 11, color: WARN, fontWeight: 700, marginBottom: 5 }}>
            操作員要做的事
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: TEXT_MAIN, lineHeight: 1.7 }}>
            {action.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {action.where && (
            <div style={{ marginTop: 6, fontSize: 11, color: TEXT_DIM }}>
              設定頁：
              <a href={action.where} target="_blank" rel="noreferrer" style={{ color: GOLD }}>
                {action.where}
              </a>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 9, fontSize: 10, color: TEXT_DIM, lineHeight: 1.7 }}>
        來源 <Code>GET /api/v1/ai/readiness</Code> —— 只有布林值與操作提示。
        API 金鑰永遠不會出現在這個端點、這個頁面或任何紀錄裡；金鑰在後台輸入後只存在伺服器端，
        連遮罩提示都只有管理員路由才拿得到。
      </div>
    </Section>
  );
}

// -------------------------------------------------------- style spec ------

function FreshnessBanner({ spec }: { spec: ReturnType<typeof useStyleSpec> }): React.JSX.Element | null {
  const f = spec.freshness;
  if (f.state === "fresh") {
    return (
      <div style={{ fontSize: 11, color: OK }}>
        ✓ 樣式規格與 <Code>tools/icon-gen/src/prompt.py</Code> 現在的內容一致（每次開啟本頁即時比對摘要）
      </div>
    );
  }
  if (f.state === "stale") {
    return (
      <div
        style={{
          border: `1px solid ${BAD}`,
          borderRadius: 8,
          background: "#1d1114",
          padding: "9px 11px",
        }}
      >
        <div style={{ fontSize: 12, color: BAD, fontWeight: 800 }}>
          ⚠ 樣式規格已過期 —— 下面顯示的美術指示不是現在的版本
        </div>
        <div style={{ fontSize: 11, color: TEXT_MAIN, marginTop: 5, lineHeight: 1.7 }}>
          這些來源檔在快照產生後又被改過：
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {f.drifted.map((d) => (
              <li key={d.path}>
                <Code>{d.path}</Code>{" "}
                {d.missing ? (
                  <span style={{ color: BAD }}>檔案不存在了</span>
                ) : (
                  <span style={{ color: TEXT_DIM }}>
                    快照 {d.specSha.slice(0, 12)} → 現在 {d.liveSha.slice(0, 12)}（{d.liveMtime}）
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 6 }}>
            重新產生：<Code>{EMIT_COMMAND}</Code>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        border: `1px solid ${WARN}55`,
        borderRadius: 8,
        background: "#1a1710",
        padding: "8px 10px",
        fontSize: 11,
        color: WARN,
        lineHeight: 1.7,
      }}
    >
      ⚠ 無法驗證新鮮度：{f.note}
      <div style={{ color: TEXT_DIM, marginTop: 3 }}>
        本頁只顯示快照自己記錄的產生時間 —— 請把它當成「可能過期」而不是「已確認最新」。
      </div>
    </div>
  );
}

function LexiconTable({ rows, cols }: { rows: readonly (readonly string[])[]; cols: string[] }): React.JSX.Element {
  return (
    <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #232b3d", borderRadius: 6 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, background: "#0f1420" }}>
            {cols.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: "left",
                  padding: "5px 8px",
                  color: TEXT_DIM,
                  fontWeight: 600,
                  borderBottom: "1px solid #232b3d",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r[0]}-${i}`} style={{ borderBottom: "1px solid #171d29" }}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "4px 8px",
                    color: j === 0 ? TEXT_MAIN : TEXT_DIM,
                    fontFamily: j === 0 ? undefined : MONO,
                    verticalAlign: "top",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LEXICON_META: readonly {
  key: string;
  label: string;
  cols: string[];
}[] = [
  { key: "nameNoun", label: "名稱 → 具體視覺名詞（中文，長詞優先）", cols: ["語素", "英文視覺主體"] },
  { key: "nameNounEn", label: "名稱 → 具體視覺名詞（手寫英文條目）", cols: ["關鍵字", "英文視覺主體"] },
  { key: "elementHue", label: "屬性 → 重點色（中文）", cols: ["語素", "重點色"] },
  { key: "elementHueEn", label: "屬性 → 重點色（英文）", cols: ["關鍵字", "重點色"] },
  { key: "itemArchetype", label: "道具分類 → 原型", cols: ["分類", "原型"] },
  { key: "statHue", label: "屬性數值 → 重點色 + 造型語彙", cols: ["屬性", "重點色", "造型"] },
  { key: "abilityComposition", label: "技能 [tag] → 構圖", cols: ["tag", "構圖"] },
  { key: "tagFallbackNoun", label: "詞庫沒命中時的 [tag] 預設主體", cols: ["tag", "預設主體"] },
];

function StyleSpecSection({ specState }: { specState: ReturnType<typeof useStyleSpec> }): React.JSX.Element {
  const { spec, loading, error } = specState;
  const [openLex, setOpenLex] = useState<string | null>(null);

  return (
    <Section
      id="asset-style"
      title="樣式規格"
      subtitle="由 tools/icon-gen/src/prompt.py 產生 —— 不是這一頁重打的文字"
      right={
        <Btn small onClick={specState.reload} title="重新讀取樣式規格與來源摘要">
          ↻ 重新讀取
        </Btn>
      }
    >
      {loading && <div style={{ fontSize: 11, color: TEXT_DIM }}>讀取中…</div>}
      {error && <div style={{ fontSize: 11, color: BAD }}>{error}</div>}
      {spec && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FreshnessBanner spec={specState} />

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: TEXT_DIM }}>
            <span>
              範本版本 <b style={{ color: TEXT_MAIN, fontFamily: MONO }}>{spec.templateVersion}</b>
            </span>
            <span>
              內容摘要 <b style={{ color: TEXT_MAIN, fontFamily: MONO }}>{spec.contentDigest}</b>
            </span>
            <span>快照產生於 {spec.generatedAt}</span>
          </div>

          <div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>
              提示詞組成 <Code>{spec.template.shape}</Code>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 4 }}>
              風格前綴 PREFIX（每一張圖都一字不差地帶著它，這是整組能看起來像一套的唯一原因）
            </div>
            <Pre>{spec.template.prefix}</Pre>
          </div>

          <div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 4 }}>
              負面約束 NEGATIVE
            </div>
            <Pre>{spec.template.negative}</Pre>
          </div>

          <div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 4 }}>
              說明 → 視覺主體的規則
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: TEXT_MAIN, lineHeight: 1.8 }}>
              {spec.rules.map((r) => (
                <li key={r.id}>{r.text}</li>
              ))}
            </ul>
          </div>

          <div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 5 }}>
              詞庫（比對順序就是規則本身，長詞／具體詞在前）
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {LEXICON_META.map((m) => {
                const rows = (spec.lexicon[m.key] ?? []) as readonly (readonly string[])[];
                return (
                  <Btn
                    key={m.key}
                    small
                    kind={openLex === m.key ? "primary" : "ghost"}
                    onClick={() => setOpenLex(openLex === m.key ? null : m.key)}
                  >
                    {m.label.split("（")[0]} ({rows.length})
                  </Btn>
                );
              })}
            </div>
            {openLex && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>
                  {LEXICON_META.find((m) => m.key === openLex)?.label}
                </div>
                <LexiconTable
                  rows={(spec.lexicon[openLex] ?? []) as readonly (readonly string[])[]}
                  cols={LEXICON_META.find((m) => m.key === openLex)?.cols ?? []}
                />
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 10, color: TEXT_DIM }}>
              比對前會先剝除的制式用語（{(spec.lexicon["boilerplate"] ?? []).length} 個）：
              <span style={{ fontFamily: MONO }}>
                {" "}
                {((spec.lexicon["boilerplate"] ?? []) as readonly string[]).join("、")}
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 4 }}>
              另一種主體來源：<Code>--subject=text</Code>
            </div>
            <Pre>{spec.textMode.instruction}</Pre>
            <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 4 }}>{spec.textMode.note}</div>
          </div>

          <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.7 }}>
            來源檔：
            {spec.sources.map((s) => (
              <span key={s.path} style={{ marginRight: 10 }}>
                <Code>{s.path}</Code> {s.sha256.slice(0, 12)}
              </span>
            ))}
            <br />
            快照路徑 <Code>{STYLE_SPEC_URL}</Code>，由 <Code>{EMIT_COMMAND}</Code> 產生。
          </div>
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------ contact sheet -----

function SlotCard({
  slot,
  index,
  live,
}: {
  slot: ContactSlot;
  index: number;
  live: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const confColor =
    slot.confidence === "high" ? OK : slot.confidence === "medium" ? GOLD : WARN;

  return (
    <div
      style={{
        border: "1px solid #232b3d",
        borderRadius: 8,
        background: "#0e121b",
        padding: "9px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: HELD }}>{slot.probe}</span>
      </div>

      {/* The image well. While no provider exists this is a PLAN, and it says so
          — a stub render here would be 16 FNV-seeded gradients, which validates
          nothing about art style and would be worse than an honest placeholder. */}
      <div
        style={{
          aspectRatio: "1 / 1",
          borderRadius: 6,
          border: "1px dashed #2c3448",
          background: "radial-gradient(circle at 50% 35%, #171f30 0%, #0b0e16 70%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 8,
        }}
      >
        <span style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.6 }}>
          {live ? "尚未執行對照表" : "尚無供應商"}
          <br />
          <span style={{ color: WARN }}>目前是計畫，不是圖</span>
        </span>
      </div>

      {slot.found ? (
        <>
          <div style={{ fontSize: 11, color: TEXT_MAIN, fontWeight: 700 }}>{slot.name || slot.id}</div>
          <div style={{ fontSize: 10, color: TEXT_DIM, fontFamily: MONO }}>
            {slot.id} · {slot.family} · {slot.descriptionChars} 字
          </div>
          <div style={{ fontSize: 10 }}>
            訊號 <span style={{ fontFamily: MONO, color: TEXT_MAIN }}>{slot.signal}</span> · 信心{" "}
            <span style={{ color: confColor, fontWeight: 700 }}>{slot.confidence}</span>
          </div>
          <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.6 }}>{slot.why}</div>
          <Btn small onClick={() => setOpen(!open)}>
            {open ? "收合提示詞" : "看完整提示詞"}
          </Btn>
          {open && (
            <>
              <div style={{ fontSize: 10, color: GOLD }}>SUBJECT</div>
              <Pre>{slot.subject}</Pre>
              <div style={{ fontSize: 10, color: GOLD }}>送出的完整字串（{slot.prompt.length} 字元）</div>
              <Pre>{slot.prompt}</Pre>
            </>
          )}
        </>
      ) : (
        <div style={{ fontSize: 10, color: WARN, lineHeight: 1.6 }}>
          目前的內容集裡找不到符合這個探針的文件 —— 這一格空著，而不是被悄悄換掉。
          <div style={{ color: TEXT_DIM, marginTop: 4 }}>{slot.why}</div>
        </div>
      )}
    </div>
  );
}

function ContactSheetSection({
  spec,
  live,
}: {
  spec: StyleSpec | null;
  live: boolean;
}): React.JSX.Element {
  return (
    <Section
      id="asset-sheet"
      title="對照表 CONTACT SHEET"
      subtitle={spec ? `${spec.contactSheet.size} 格 · ${spec.contactSheet.note}` : undefined}
    >
      {!spec && <div style={{ fontSize: 11, color: TEXT_DIM }}>樣式規格尚未產生。</div>}
      {spec && (
        <>
          <div
            style={{
              border: `1px solid ${HELD}55`,
              borderRadius: 8,
              background: "#151328",
              padding: "9px 11px",
              fontSize: 11,
              color: TEXT_MAIN,
              lineHeight: 1.75,
              marginBottom: 10,
            }}
          >
            <b style={{ color: HELD }}>這張表是刻意設計成會失敗的。</b>
            它不是 16 張好看的圖，而是 16 個探針：一筆說明幾乎是空的、一筆說明特別長、
            兩筆必須看起來像同一位英雄的招式、兩筆推導出的主體字串完全相同因此極可能畫出同一張圖。
            如果這 16 格都好看，才有理由把剩下的整批跑完；如果不好看，省下的是整批的錢。
            <div style={{ color: TEXT_DIM, marginTop: 5 }}>
              執行指令：<Code>{spec.contactSheet.runCommand}</Code>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: 10,
            }}
          >
            {spec.contactSheet.slots.map((s, i) => (
              <SlotCard key={`${s.probe}-${s.id}`} slot={s} index={i} live={live} />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

// --------------------------------------------------------------- cost -----

function CostSection({
  spec,
  tier1,
  tier2,
  probe,
  planDigest,
}: {
  spec: StyleSpec | null;
  tier1: number | null;
  tier2: number | null;
  probe: ProviderProbe;
  planDigest: string | null;
}): React.JSX.Element {
  const pricing = spec?.pricing ?? null;
  const models = pricedModels(pricing);
  const [model, setModel] = useState("gpt-image-1");
  const [quality, setQuality] = useState("low");
  const [tier, setTier] = useState<Tier>("tier1");
  const [subject, setSubject] = useState<SubjectMode>("derived");

  // The price table is #72's file and can change under us. Never render a
  // selector whose value is not in its own option list: fall back to the first
  // priced entry so the estimate always describes what the dropdown shows.
  const activeModel = models.length > 0 && !models.includes(model) ? (models[0] as string) : model;
  const qualities = pricedQualities(pricing, activeModel);
  const activeQuality =
    qualities.length > 0 && !qualities.includes(quality) ? (qualities[0] as string) : quality;

  const est = useMemo(
    () =>
      estimateCost({
        tier1: tier1 ?? 0,
        tier2: tier2 ?? 0,
        tier,
        model: activeModel,
        quality: activeQuality,
        subject,
        pricing,
      }),
    [tier1, tier2, tier, activeModel, activeQuality, subject, pricing],
  );
  // The authorisation copy is driven by the SAME probe the status lamp uses, so
  // the two can never contradict each other on screen.
  const auth = authorisation(probe, est);

  const sel: React.CSSProperties = {
    background: "#0d1119",
    color: TEXT_MAIN,
    border: "1px solid #2c3448",
    borderRadius: 5,
    fontSize: 11,
    padding: "3px 6px",
  };

  return (
    <Section
      id="asset-cost"
      title="費用與授權"
      subtitle="張數來自即時讀取的計畫檔，單價來自執行器自己的價目表"
    >
      {tier1 === null && (
        <div style={{ fontSize: 11, color: WARN, marginBottom: 8 }}>
          尚未讀到計畫檔的張數 —— 下面的估算會以 0 計。
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
        <label style={{ color: TEXT_DIM }}>
          範圍{" "}
          <select value={tier} onChange={(e) => setTier(e.target.value as Tier)} style={sel}>
            <option value="tier1">tier 1（上線面向 {tier1 ?? 0}）</option>
            <option value="tier2">tier 2（其餘 {tier2 ?? 0}）</option>
            <option value="both">全部 {(tier1 ?? 0) + (tier2 ?? 0)}</option>
          </select>
        </label>
        <label style={{ color: TEXT_DIM }}>
          模型{" "}
          <select
            value={activeModel}
            onChange={(e) => {
              setModel(e.target.value);
              const q = pricedQualities(pricing, e.target.value);
              if (!q.includes(quality) && q[0]) setQuality(q[0]);
            }}
            style={sel}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label style={{ color: TEXT_DIM }}>
          品質{" "}
          <select value={activeQuality} onChange={(e) => setQuality(e.target.value)} style={sel}>
            {qualities.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <label style={{ color: TEXT_DIM }}>
          主體來源{" "}
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value as SubjectMode)}
            style={sel}
          >
            <option value="derived">derived（離線推導，免費）</option>
            <option value="text">text（每張多一次 /ai/text）</option>
          </select>
        </label>
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          alignItems: "baseline",
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: TEXT_DIM }}>張數</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: TEXT_MAIN, fontFamily: MONO }}>
            {est.images}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_DIM }}>單價</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_MAIN, fontFamily: MONO }}>
            {est.rate === null ? "未知" : `$${est.rate.toFixed(4)}`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_DIM }}>估算總額</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: GOLD, fontFamily: MONO }}>
            {usd(est.totalUsd)}
          </div>
        </div>
        {est.textCalls > 0 && (
          <div>
            <div style={{ fontSize: 10, color: TEXT_DIM }}>其中文字呼叫</div>
            <div style={{ fontSize: 14, color: TEXT_MAIN, fontFamily: MONO }}>
              {est.textCalls} × ${(est.textUsd / Math.max(1, est.textCalls)).toFixed(4)} ={" "}
              {usd(est.textUsd)}
            </div>
          </div>
        )}
      </div>

      {!est.known && (
        <div style={{ fontSize: 11, color: WARN, marginTop: 6 }}>
          價目表沒有 {activeModel}/{activeQuality} 的單價 —— 執行器在這種情況會拒絕正式執行，而不是猜一個數字。
        </div>
      )}

      <div
        style={{
          marginTop: 11,
          border: `1px solid ${auth.billable ? WARN : OK}55`,
          borderRadius: 8,
          background: auth.billable ? "#1a1710" : "#101a14",
          padding: "9px 11px",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: auth.billable ? WARN : OK }}>
          {auth.headline}
        </div>
        <div style={{ fontSize: 11, color: TEXT_MAIN, marginTop: 4, lineHeight: 1.75 }}>
          {auth.detail}
        </div>
        <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 6 }}>
          整批執行指令（需要人明確輸入，本頁沒有、也不會有「開始生成」按鈕）：
          <div style={{ marginTop: 3 }}>
            <Code>{auth.command}</Code>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 8, lineHeight: 1.7 }}>
        單價是報價不是合約，
        {spec?.pricing?.quotedAsOf ? `以 ${spec.pricing.quotedAsOf} 的公開定價為準` : ""}
        ，這個 repo 無法驗證它 —— 授權整批之前請對照供應商自己的定價頁。
        {planDigest && !digestsAgree(spec, planDigest) && (
          <div style={{ color: BAD, marginTop: 4 }}>
            ⚠ 樣式規格記錄的內容摘要（{spec?.contentDigest}）與現在的計畫（{planDigest}）不同：
            內容已經變動過，張數是新的、對照表樣本是舊的。重新執行 <Code>{EMIT_COMMAND}</Code>。
          </div>
        )}
      </div>
    </Section>
  );
}

// --------------------------------------------------------------- page -----

export function AssetConsolePage({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { data, icons, plan, loading, error, reload } = useCodex();
  const specState = useStyleSpec();
  // ONE readiness poll for the whole page, shared by the status lamp, the
  // contact sheet and the authorisation copy. Two polls would be two answers.
  const providerState = useProviderReadiness();
  const { probe } = providerState;
  const live = canGenerateImages(probe);

  return (
    <div
      className="ggd-platform"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: HUD_Z.modal,
        display: "flex",
        flexDirection: "column",
        background: "radial-gradient(ellipse at 50% 0%, #131a2c 0%, #0b0e14 65%)",
        color: TEXT_MAIN,
        pointerEvents: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: PANEL_BORDER,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: 1.5 }}>資產主控台</h1>
        <Tooltip
          title="這一頁是什麼"
          body={
            "一個問題一頁：資產現在的真實狀態。供應商狀態即時讀自執行中的 platform，" +
            "覆蓋率沿用任務 #97 的計算，美術指示由任務 #72 的 prompt.py 產生。" +
            "唯一不是即時算出來的區塊（樣式規格）會自己比對來源摘要，過期就跳警告。"
          }
        >
          <span style={{ fontSize: 11, color: TEXT_DIM, borderBottom: `1px dotted ${TEXT_DIM}` }}>
            說明
          </span>
        </Tooltip>
        <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small onClick={() => document.getElementById("asset-provider")?.scrollIntoView({ behavior: "smooth" })}>
            供應商
          </Btn>
          <Btn small onClick={() => document.getElementById("asset-coverage")?.scrollIntoView({ behavior: "smooth" })}>
            覆蓋率
          </Btn>
          <Btn small onClick={() => document.getElementById("asset-style")?.scrollIntoView({ behavior: "smooth" })}>
            樣式規格
          </Btn>
          <Btn small onClick={() => document.getElementById("asset-sheet")?.scrollIntoView({ behavior: "smooth" })}>
            對照表
          </Btn>
          <Btn small onClick={() => document.getElementById("asset-cost")?.scrollIntoView({ behavior: "smooth" })}>
            費用
          </Btn>
        </nav>
        <div style={{ flex: 1 }} />
        <Btn small onClick={openCodex} title="開啟內容圖鑑">
          內容圖鑑 →
        </Btn>
        <Btn small onClick={reload} title="重新讀取 /content">
          ↻ 重新載入內容
        </Btn>
        <Btn small kind="danger" onClick={onClose}>
          關閉
        </Btn>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px 60px" }}>
        {/* Provider first: it decides whether anything else can happen at all. */}
        <ProviderSection state={providerState} />

        <Section
          id="asset-coverage"
          title="圖示覆蓋率"
          subtitle="沿用任務 #97 的元件與任務 #72 的分類 —— 本頁沒有第二套算法"
        >
          {error && <div style={{ fontSize: 11, color: BAD }}>讀取內容失敗：{error}</div>}
          {loading && <div style={{ fontSize: 11, color: TEXT_DIM }}>正在從 /content 讀取全部內容…</div>}
          {data && <IconCoverageBar data={data} icons={icons} />}
        </Section>

        <StyleSpecSection specState={specState} />

        <ContactSheetSection spec={specState.spec} live={live} />

        <CostSection
          spec={specState.spec}
          tier1={plan?.counts.tier1 ?? null}
          tier2={plan?.counts.tier2 ?? null}
          probe={probe}
          planDigest={plan?.contentDigest ?? null}
        />

        {/* SEAM for task #99. Declared, not faked: an empty section that names its
            owner is honest; a section filled with plausible triangle counts this
            page invented would be exactly the lie the console exists to prevent. */}
        <Section
          id="asset-models"
          title="模型預算"
          subtitle="任務 #99 的區塊 —— 尚未接上"
        >
          <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.8 }}>
            每個模型的三角面數、貼圖大小、被哪些畫面用到、以及同畫面上限，由任務 #99 量測。
            量測結果尚未發布，所以這裡是空的 —— 本頁不會自己估一組數字填進來。
            <div style={{ marginTop: 6 }}>
              接上方式：#99 發布量測檔後，在本檔案新增一個 <Code>&lt;Section id="asset-models"&gt;</Code>
              的內容元件，比照覆蓋率區塊 —— 引用 #99 的元件，不要在這裡重算。
            </div>
          </div>
        </Section>

        <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.8 }}>
          資料來源：<Code>/api/v1/ai/readiness</Code>（供應商狀態，即時）·{" "}
          <Code>/content</Code>（內容與圖示，即時）·{" "}
          <Code>/content/config/icon-plan.json</Code>（分類與張數，即時）·{" "}
          <Code>{STYLE_SPEC_URL}</Code>（樣式規格快照，附來源摘要比對）。
        </div>
      </div>
    </div>
  );
}
