/**
 * 體素鑄造廠 — the 體素角色生成器 that actually SHIPS (owner directive #229).
 *
 * See `../assets/voxelFoundry.ts` for why this exists next to 鑄形工坊 rather
 * than instead of it. In one line: 鑄形工坊 is dev-only by design and enforced
 * absent from production by `contentGate.test.ts`, so the owner has never been
 * able to open it on the machine he actually uses. This page obeys the three
 * production constraints — no Babylon, no loopback write, and it emits the real
 * .glb — and `voxelFoundryBundle.test.ts` pins it INTO the `vite build` output
 * the same way #242 pinned Quick Approval.
 *
 * WHAT AN OPERATOR DOES HERE, IN ORDER:
 *   1. pick a starting point — one of the five shipped archetypes, or any of
 *      the 43 champions that currently borrow a shared mesh (#226's census);
 *   2. look at the figure, and at WHY it is that colour (#231's explanation,
 *      per axis, naming the word or the ability effect that decided it);
 *   3. 鑄造 — bake it in the browser, and read the triangle count and byte size
 *      against the KayKit character it replaces;
 *   4. 下載 the .glb, and/or 寫入覆蓋層 so the `model@1` doc points at it.
 *
 * Steps 3 and 4 are deliberately separate. The overlay stores DOCUMENTS; the
 * binary has to reach `content/assets/` on the host. The page says so with the
 * exact path and the exact sha256 rather than letting an operator wonder why
 * the champion did not change in game.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { explainVoxelSkin, type SkinExplanation } from "@ggd/shared/content/voxelSkin";
import { archetypeForModelDoc, type VoxelLook } from "@ggd/shared/voxel";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { putOverlayDoc } from "../api";
import { useVoxelSkinSheet } from "../assets/useVoxelSkinSheet";
import {
  ARCHETYPE_LOOKS,
  FOUNDRY_COLLECTION,
  RETIRED_MODELS,
  baselineModel,
  canForge,
  fmtBytes,
  fmtInt,
  forge,
  foundryDocId,
  foundryIssues,
  lookForSource,
  saveNotice,
  type ForgeResult,
  type LookSource,
} from "../assets/voxelFoundry";
import { figureReadout, paintFigure } from "./voxelFoundryPaint";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** The nav label. Written HERE, in the eagerly-imported shell — the bundle test greps for it. */
export const FOUNDRY_NAV_LABEL = "體素鑄造廠";
/** The action label the bundle test greps for; changing it changes that test. */
export const FOUNDRY_FORGE_LABEL = "鑄造模型";
export const FOUNDRY_SAVE_LABEL = "寫入覆蓋層";

function Preview(props: { look: VoxelLook }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    if (ref.current) {
      setOk(paintFigure(ref.current, props.look, { background: "#0b0e16", ruler: true }));
    }
  }, [props.look]);
  if (!ok) {
    return (
      <div style={{ color: TEXT_DIM, fontSize: 12, padding: 12 }}>
        這個瀏覽器沒有 2D canvas，無法預覽——但鑄造與下載仍然可用。
      </div>
    );
  }
  return (
    <canvas
      ref={ref}
      width={280}
      height={340}
      style={{ border: PANEL_BORDER, borderRadius: 6, background: "#0b0e16", maxWidth: "100%" }}
    />
  );
}

function Row(props: { k: string; v: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
      <span style={{ color: TEXT_DIM }}>{props.k}</span>
      <span style={{ color: TEXT_MAIN, fontFamily: MONO }}>{props.v}</span>
    </div>
  );
}

/** #231 — the per-axis 「為什麼是這個顏色」 panel. */
function WhyPanel(props: { explanation: SkinExplanation }): React.JSX.Element {
  const ex = props.explanation;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, color: TEXT_DIM }}>
        技能元素 <b style={{ color: TEXT_MAIN }}>{ex.element}</b>
        （次要 {ex.elementSecondary}）· 色帶{" "}
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            background: ex.elementBandHex,
            borderRadius: 2,
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        />{" "}
        <span style={{ fontFamily: MONO }}>{ex.elementBandHex}</span>
        {ex.salt > 1 && <> · salt {ex.salt}（撞外觀重抽）</>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {ex.axes.map((a) => (
          <div
            key={a.axis}
            style={{
              display: "grid",
              gridTemplateColumns: "78px 90px 1fr",
              gap: 8,
              fontSize: 11,
              alignItems: "baseline",
            }}
          >
            <span style={{ color: TEXT_DIM }}>{a.label}</span>
            <span style={{ color: TEXT_MAIN, fontFamily: MONO }}>
              {a.value.startsWith("#") && (
                <span
                  style={{
                    display: "inline-block",
                    width: 9,
                    height: 9,
                    background: a.value,
                    borderRadius: 2,
                    marginRight: 4,
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                />
              )}
              {a.value}
            </span>
            <span style={{ color: TEXT_DIM }}>
              <Badge
                color={
                  a.layer === "L1-override" ? WARN : a.layer === "L4-hash" ? TEXT_DIM : OK
                }
              >
                {a.layer}
              </Badge>{" "}
              {a.reason}
              {a.evidence !== null && (
                <b style={{ color: GOLD }}> ← {a.evidence}</b>
              )}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: TEXT_DIM }}>
        比對字串：<span style={{ fontFamily: MONO }}>{ex.haystack}</span>
      </div>
    </div>
  );
}

export function VoxelFoundryPage(): React.JSX.Element {
  const sheet = useVoxelSkinSheet();
  const [sourceKey, setSourceKey] = useState<string>("archetype:knight");
  const [name, setName] = useState("");
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The 43 borrowers, from the SAME census the tests pin. */
  const borrowers = useMemo(() => sheet.rows.filter((r) => r.sharedStandIn), [sheet.rows]);

  const source: LookSource = useMemo(() => {
    if (sourceKey.startsWith("champion:")) {
      const id = sourceKey.slice("champion:".length);
      const row = sheet.rows.find((r) => r.championId === id);
      const modelKey = row?.modelKey ?? "";
      return {
        kind: "champion",
        championId: id,
        modelKey,
        archetype: archetypeForModelDoc(modelKey) ?? "knight",
      };
    }
    return { kind: "archetype", key: sourceKey.slice("archetype:".length) };
  }, [sourceKey, sheet.rows]);

  const look = useMemo(() => lookForSource(source), [source]);
  const readout = useMemo(() => figureReadout(look), [look]);

  const explanation = useMemo((): SkinExplanation | null => {
    if (source.kind !== "champion") return null;
    const row = sheet.rows.find((r) => r.championId === source.championId);
    if (!row) return null;
    return explainVoxelSkin(row.input, { salt: row.salt, override: row.override });
  }, [source, sheet.rows]);

  // Selecting a different source invalidates a previous bake — showing last
  // run's byte count next to this run's figure would be the exact kind of quiet
  // lie this page exists to stop.
  useEffect(() => {
    setResult(null);
    setNotice(null);
  }, [sourceKey]);

  const suggestedName =
    source.kind === "champion" ? source.championId : `blocky-${source.key}`;
  const effectiveName = name.trim() === "" ? suggestedName : name;
  const docId = foundryDocId(effectiveName);

  const doForge = useCallback(() => {
    setError(null);
    setNotice(null);
    const r = forge(effectiveName, look);
    if (r === null) {
      setError(`無法用「${effectiveName}」產生合法的 id`);
      return;
    }
    setResult(r);
  }, [effectiveName, look]);

  const doDownload = useCallback(() => {
    if (!result) return;
    // `bakeLook` returns a plain Uint8Array precisely so this is possible at all
    // — a node Buffer would be a valid byte array and an invalid BlobPart. The
    // copy into a fresh ArrayBuffer is not defensive padding: a `Uint8Array` is
    // typed over `ArrayBufferLike`, which admits `SharedArrayBuffer`, and `Blob`
    // does not accept one. Copying makes the buffer's type exact.
    const buf = new ArrayBuffer(result.bytes.length);
    new Uint8Array(buf).set(result.bytes);
    const blob = new Blob([buf], { type: "model/gltf-binary" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const doSave = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await putOverlayDoc(FOUNDRY_COLLECTION, result.id, result.doc);
      setNotice(saveNotice(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [result]);

  const issues = foundryIssues(effectiveName, result);
  const baseline = baselineModel();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title={`${FOUNDRY_NAV_LABEL} — 在瀏覽器裡直接產生方塊人模型`}>
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
          這一頁跑的是遊戲出貨用的同一套產生器（<span style={{ fontFamily: MONO }}>@ggd/shared/voxel</span>
          ），不是另一份長得很像的。每次鑄造都會報出三角面數與檔案大小，並跟它取代掉的
          {" "}{baseline.label} 比較——比被取代的還重就是失敗，不是細節。
        </div>
      </Panel>

      <ErrorBanner text={error} onDismiss={() => setError(null)} />
      <ErrorBanner text={sheet.error} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Panel title="1 · 起點">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>
            <label style={{ fontSize: 12, color: TEXT_DIM }}>
              原型（出貨中的五個）
              <select
                value={sourceKey}
                onChange={(e) => setSourceKey(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  background: "#0b0e16",
                  color: TEXT_MAIN,
                  border: PANEL_BORDER,
                  borderRadius: 4,
                  padding: "6px 8px",
                }}
              >
                <optgroup label="原型">
                  {Object.keys(ARCHETYPE_LOOKS).map((k) => (
                    <option key={k} value={`archetype:${k}`}>
                      blocky-{k}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={`借用共用模組的英雄（${borrowers.length}）`}>
                  {borrowers.map((r) => (
                    <option key={r.championId} value={`champion:${r.championId}`}>
                      {r.fullName || r.championId} · {r.modelKey}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label style={{ fontSize: 12, color: TEXT_DIM }}>
              名字（會變成 id）
              <TextInput
                value={name}
                onChange={setName}
                placeholder={suggestedName}
                style={{ marginTop: 4 }}
              />
            </label>
            <div style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
              id: {docId || "（尚未命名）"}
            </div>
            {sheet.loading && (
              <div style={{ fontSize: 11, color: TEXT_DIM }}>讀取英雄名單中…</div>
            )}
          </div>
        </Panel>

        <Panel title="2 · 預覽（純 2D canvas，沒有 3D 引擎）">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Preview look={look} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 190 }}>
              <Row k="量到的身高" v={`${readout.height.toFixed(3)} u`} />
              <Row k="doc.scale" v={readout.docScale.toFixed(3)} />
              <Row k="方塊數" v={readout.boxes} />
              <Row k="三角面" v={fmtInt(readout.triangles)} />
              <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 6, lineHeight: 1.6 }}>
                身高 1.8u 是 #150 的正規化目標；方塊人整個身形都畫在
                0..32 voxel-px 的框裡，所以 doc.scale 是誠實的 1.0。
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {explanation !== null && (
        <Panel title="為什麼是這個顏色（#231 的推導依據）">
          <WhyPanel explanation={explanation} />
        </Panel>
      )}

      <Panel title={`3 · ${FOUNDRY_FORGE_LABEL}`}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Btn onClick={doForge}>{FOUNDRY_FORGE_LABEL}</Btn>
          <Btn onClick={doDownload} disabled={result === null}>
            下載 .glb
          </Btn>
          <Btn
            onClick={() => void doSave()}
            disabled={result === null || saving || !canForge(effectiveName, result)}
          >
            {saving ? "寫入中…" : FOUNDRY_SAVE_LABEL}
          </Btn>
        </div>

        {issues.length > 0 && (
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12 }}>
            {issues.map((i) => (
              <li key={i.text} style={{ color: i.level === "error" ? DANGER : WARN }}>
                {i.text}
              </li>
            ))}
          </ul>
        )}

        {notice !== null && (
          <div style={{ marginTop: 10, fontSize: 12, color: OK, lineHeight: 1.7 }}>{notice}</div>
        )}

        {result !== null && (
          <div style={{ marginTop: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 250 }}>
              <Row k="三角面" v={fmtInt(result.stats.triangles)} />
              <Row k="頂點" v={fmtInt(result.stats.vertices)} />
              <Row k="檔案大小" v={fmtBytes(result.stats.bytes)} />
              <Row k="貼圖（內嵌 PNG）" v={fmtBytes(result.stats.textureBytes)} />
              <Row k="骨架 / 動畫" v={`${result.stats.joints} joints · ${result.stats.clips} clips`} />
              <Row k="繪製呼叫" v={`${result.stats.meshes} mesh / ${result.stats.materials} mat`} />
              <Row k="sha256" v={result.stats.sha256.slice(0, 16)} />
              <Row k="模型路徑" v={result.glbPath} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 300 }}>
              <div style={{ fontSize: 12, color: result.budget.ok ? OK : DANGER }}>
                {result.budget.summary}
              </div>
              {result.budget.rows.map((r) => (
                <Row
                  key={r.label}
                  k={r.label}
                  v={
                    <span style={{ color: r.ok ? OK : DANGER }}>
                      {r.label === "檔案大小" ? fmtBytes(r.generated) : fmtInt(r.generated)} /{" "}
                      {r.label === "檔案大小" ? fmtBytes(r.replaced) : fmtInt(r.replaced)} ={" "}
                      {(r.ratio * 100).toFixed(1)}%
                    </span>
                  }
                />
              ))}
              <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 6, lineHeight: 1.6 }}>
                比較基準是被退場的四個 KayKit 角色裡最輕的那個（
                {RETIRED_MODELS.map((m) => `${m.key} ${fmtInt(m.triangles)}tri`).join(" · ")}）。
                贏最重的沒有意義，贏最輕的才代表四個都贏。
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="這一頁不做的事">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>
          <li>
            不上傳、不匯入任何第三方模型或貼圖——整頁沒有檔案選擇器，幾何全部來自
            <span style={{ fontFamily: MONO }}> boxman.ts </span>的數字表。
          </li>
          <li>
            寫入的是<b style={{ color: ACCENT }}>文件</b>，不是二進位檔。.glb 請用上面的「下載」
            拿走，再放到主機的 <span style={{ fontFamily: MONO }}>content/assets/</span> 下。
          </li>
          <li>不改 <span style={{ fontFamily: MONO }}>_standin-overrides.json</span> 的 relativeScale——那是 owner 調過的設定值。</li>
        </ul>
      </Panel>
    </div>
  );
}
