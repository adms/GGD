/**
 * 🪜 **五級距總覽** —— 四軸一頁，每一格 **卡面值 → 實際值**。
 *
 * owner 2026-08-21：「**後台設定及說明**⋯都要一起更新喔（**全部都是推導動態即時產生**）」
 *
 * 這個檔**只負責畫**。所有數字由 `../tierOverview` 現算（守衛
 * `tierOverview.test.ts` 拿出貨 resolver 對答案），⛔ 這裡一個字面值都沒有。
 *
 * ⚠️ 三段來源，優先序寫在畫面上而不是註解裡：
 *   1. **線上覆蓋層**（`/content-overlay/bundle`）—— 玩家真的吃到的那一份。要 session。
 *   2. **出貨 JSON**（`/content/config/*.json`，同源靜態）—— 沒有 session 也讀得到。
 *   3. **程式內建預設** —— 兩條都失敗時。⭐ 這一格會被**標紅**：
 *      一張「跟線上不一定一樣」的表比看不到還糟（fail-open 沒錯，靜默才是缺陷）。
 *
 * ⚠️ 這一頁**唯讀**。要改哪一格，每一列右邊都印著它住在哪一頁 ——
 * 一頁同時能編四份文件的話，兩條 lane 會互相蓋掉對方（同 `itemDraft` 那一頁的理由）。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Badge } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { getCombatEnv, getOverlayDoc } from "../api";
import {
  SKILL_TIER_NAMES,
  SOURCE_ZH,
  TIER_OVERVIEW_DOC_IDS,
  buildTierAxes,
  cellsOf,
  disabledAxes,
  fmtTier,
  overviewSourceLine,
  type TierOverviewDocId,
  type TierOverviewInput,
  type TierSource,
} from "../tierOverview";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const SOURCE_COLOR: Record<TierSource, string> = {
  overlay: OK,
  shipped: ACCENT,
  default: DANGER,
};

/** 同源靜態的出貨文件。⚠️ 沒有 session 也讀得到 —— 這一頁的保底就靠它。 */
async function fetchShipped(id: TierOverviewDocId): Promise<unknown> {
  const r = await fetch(`/content/config/${id}.json`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as unknown;
}

/** 一份文件：覆蓋層 → 出貨 JSON → 放棄（讓 `buildTierAxes` 退回內建預設並標紅）。 */
async function loadDoc(
  id: TierOverviewDocId,
): Promise<{ doc: unknown; source: TierSource } | null> {
  try {
    const overlay = await getOverlayDoc("config", id);
    if (overlay) return { doc: overlay, source: "overlay" };
  } catch {
    /* 沒有 session 就走下一條 —— ⛔ 不要因此讓整頁空白 */
  }
  try {
    return { doc: await fetchShipped(id), source: "shipped" };
  } catch {
    return null;
  }
}

function Th(props: { children: React.ReactNode; align?: "left" | "right" }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "6px 10px",
        fontSize: 10,
        letterSpacing: 0.8,
        color: TEXT_DIM,
        textAlign: props.align ?? "left",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </th>
  );
}

export function TierOverviewPage(): React.JSX.Element {
  const [input, setInput] = useState<TierOverviewInput>({ docs: {}, source: {}, env: null });
  const [loading, setLoading] = useState(true);
  const [envSource, setEnvSource] = useState<TierSource | null>(null);

  useEffect(() => {
    void (async () => {
      const docs: Partial<Record<TierOverviewDocId, unknown>> = {};
      const source: Partial<Record<TierOverviewDocId, TierSource>> = {};
      for (const id of TIER_OVERVIEW_DOC_IDS) {
        if (id === "combat-env") continue;
        const got = await loadDoc(id);
        if (got) {
          docs[id] = got.doc;
          source[id] = got.source;
        }
      }
      // combat-env 走它自己的 admin 端點（那才是玩家吃到的那一份）；
      // 沒有 session 就退回同源的出貨 JSON，兩條都失敗才留 null。
      let env: Record<string, number> | null = null;
      let es: TierSource | null = null;
      try {
        env = (await getCombatEnv()).multipliers as unknown as Record<string, number>;
        es = "overlay";
      } catch {
        try {
          const raw = (await fetchShipped("combat-env")) as { multipliers?: Record<string, number> };
          if (raw && typeof raw.multipliers === "object") {
            env = raw.multipliers;
            es = "shipped";
          }
        } catch {
          /* 留 null —— 實際值那一欄會是空的，⛔ 不用 1.0 假裝中性 */
        }
      }
      setInput({ docs, source, env });
      setEnvSource(es);
      setLoading(false);
    })();
  }, []);

  const axes = useMemo(() => buildTierAxes(input), [input]);
  const off = disabledAxes(axes);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1180 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>五級距總覽 · 卡面值 → 實際值</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, lineHeight: 1.7 }}>
          技能的四把尺（<b style={{ color: TEXT_MAIN }}>冷卻 · 傷害 · 施法距離 · AoE 半徑</b>）
          共用同一組級距名「{SKILL_TIER_NAMES.join(" / ")}」。技能 JSON 只填級距名，
          <b style={{ color: TEXT_MAIN }}>這幾頁決定那個名字是多少</b>。
          <br />
          ⚠️ 左邊那個數字是<b style={{ color: GOLD }}>卡面值</b>（後台填的、卡片上印的），
          右邊才是<b style={{ color: OK }}>玩家實際碰到的值</b>。兩者不一樣，因為
          「戰鬥系統」頁的全域倍率會在最後乘一次 —— owner 2026-08-19 對冷卻表明說
          「<b style={{ color: TEXT_MAIN }}>不計入系統倍率及減少 CD 等效果</b>」，
          那句話讓卡面表正確，同時讓它讀起來像謊話（後台寫 60 秒、遊戲裡等更短）。
          <br />
          ⛔ 這一頁<b style={{ color: TEXT_MAIN }}>唯讀</b>，而且每一個數字都是<b style={{ color: TEXT_MAIN }}>當場算的</b>：
          級距表讀現在生效的文件、倍率讀現在生效的 combat-env，⛔ 沒有任何一格是手抄的。
          要改哪一格，看每一列右邊寫的那一頁。
        </div>
      </div>

      {loading && <div style={{ fontSize: 12, color: TEXT_DIM }}>讀取中…</div>}

      {!loading && (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            padding: "10px 14px",
            borderRadius: 10,
            border: PANEL_BORDER,
            fontSize: 12,
            color: TEXT_DIM,
          }}
        >
          <span>資料來源：{overviewSourceLine(axes)}</span>
          <span style={{ color: PANEL_BORDER }}>|</span>
          <span>
            全域倍率：
            {envSource === null ? (
              <b style={{ color: DANGER }}>讀不到 —— 右欄「實際值」留白，⛔ 不用 1.0 假裝中性</b>
            ) : (
              <b style={{ color: SOURCE_COLOR[envSource] }}>{SOURCE_ZH[envSource]}</b>
            )}
          </span>
          {off.length > 0 && (
            <Badge color={WARN}>
              {off.length} 軸的級距開關是關的：{off.map((a) => a.zh).join("、")}
            </Badge>
          )}
        </div>
      )}

      {!loading &&
        axes.map((axis) => {
          const cells = cellsOf(axis, input.env);
          const mult = input.env && axis.envKey ? input.env[axis.envKey] : undefined;
          return (
            <Panel
              key={axis.key}
              title={`${axis.zh}（${axis.unit}）`}
              right={
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: SOURCE_COLOR[axis.source] }}>{SOURCE_ZH[axis.source]}</span>
                  <span style={{ color: TEXT_DIM }}>→ 去「{axis.pageZh}」頁改</span>
                  {!axis.enabled && <Badge color={WARN}>級距關閉中</Badge>}
                </div>
              }
            >
              <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 10, lineHeight: 1.7 }}>
                {axis.affects}
                <br />
                單格可填範圍 <b style={{ color: TEXT_MAIN }}>{fmtTier(axis.min)} ～ {fmtTier(axis.max)}</b>
                （⚠️ 上界不是防手滑的柵欄，是這一軸物理上讀得通的邊界）。
                {axis.envKey && (
                  <>
                    {" "}實際值 ＝ 卡面 ×「戰鬥系統」頁的<b style={{ color: TEXT_MAIN }}>{axis.envZh}</b>
                    {mult === undefined ? "（現在讀不到）" : `（現值 ${fmtTier(mult)}）`}
                    {axis.floor !== null && `，再被「${axis.floorZh}」的 ${fmtTier(axis.floor)} 秒夾一次`}。
                  </>
                )}
                {!axis.enabled && (
                  <>
                    <br />
                    <b style={{ color: WARN }}>⚠️ 這一軸現在是關的：</b>
                    {axis.disabledMeans}
                  </>
                )}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr>
                      <Th>級距</Th>
                      {cells.map((c) => (
                        <Th key={c.tier} align="right">
                          {c.tier}
                        </Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: "6px 10px", borderTop: PANEL_BORDER, fontSize: 12, color: GOLD }}>
                        卡面值
                      </td>
                      {cells.map((c) => (
                        <td
                          key={c.tier}
                          style={{
                            padding: "6px 10px",
                            borderTop: PANEL_BORDER,
                            fontSize: 13,
                            fontFamily: MONO,
                            textAlign: "right",
                            color: GOLD,
                          }}
                        >
                          {fmtTier(c.card)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={{ padding: "6px 10px", borderTop: PANEL_BORDER, fontSize: 12, color: OK }}>
                        實際值
                      </td>
                      {cells.map((c) => (
                        <td
                          key={c.tier}
                          style={{
                            padding: "6px 10px",
                            borderTop: PANEL_BORDER,
                            fontSize: 13,
                            fontFamily: MONO,
                            textAlign: "right",
                            color: c.live === null ? TEXT_DIM : c.floored ? WARN : OK,
                          }}
                          title={c.floored ? "被秒數地板夾住了 —— 卡面再往下調也不會更短" : undefined}
                        >
                          {c.live === null ? "—" : fmtTier(c.live)}
                          {c.floored ? " ⚑" : ""}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })}

      {!loading && (
        <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.8 }}>
          ⚠️ <b style={{ color: TEXT_MAIN }}>位移級距</b>（衝刺／擊退）刻意不在這張表上：
          它的兩張表各自帶速度與安全係數，而且<b style={{ color: TEXT_MAIN }}>不吃技能範圍倍率</b> ——
          放進來的話「實際值」那一欄對它會變成一個恆等式，也就是一欄看起來有算、其實沒算的數字。
          它在「位移級距」那一頁。
          <br />
          ⚠️ 級距<b style={{ color: TEXT_MAIN }}>靠攏發生在註冊時</b>，⛔ 內容 JSON 不會被改寫：
          技能檔裡填的仍然是級距名（或原本的手寫數字），這張表只決定那個名字現在換算成多少。
        </div>
      )}
    </div>
  );
}
