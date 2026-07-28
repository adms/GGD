/**
 * 體素身體 (GH#31) — the operator's switch for「這位英雄穿體素還是穿自己的模型」。
 *
 * owner, 2026-07-28:「請你都先用暴雪的 3d model，要替換成體素是我從後台設定套用
 * 才生效」.
 *
 * WHY THIS PAGE IS SEPARATE FROM 體素外觀對照表. That page answers 「他長什麼樣」
 * — palette, face, hair, motifs — and its data lives in the shipped sidecar.
 * This one answers 「他穿哪一具身體」, and its answer MUST outlive a deploy, so it
 * is the only one of the two that writes through the durable overlay. Merging
 * them would have quietly put the body switch in a file that every
 * `docker compose build` restores.
 *
 * All logic is in `../voxelBody`, which is where the tests live. This file is
 * the view.
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn, Badge } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import { loadCollection } from "../content";
import {
  BODY_COLLECTION,
  BODY_DOC_ID,
  bodyRows,
  bodySummary,
  emptyBodiesDoc,
  extractBodies,
  forgetBody,
  setBody,
  type BodyRow,
  type ChampionLite,
  type VoxelBodiesDoc,
} from "../voxelBody";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function VoxelBodyPage(): JSX.Element {
  const [doc, setDoc] = useState<VoxelBodiesDoc>(emptyBodiesDoc());
  const [champs, setChamps] = useState<ChampionLite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // LIVE FIRST — the overlay is what the shard actually loads. The repo's
        // shipped copy is the truth only when the overlay has no entry yet.
        const overlaid = (await getOverlayDoc(BODY_COLLECTION, BODY_DOC_ID)) as unknown;
        let full: unknown = overlaid ?? null;
        if (!full) {
          const shipped = await getShippedDoc(BODY_COLLECTION, BODY_DOC_ID);
          if (shipped.present && shipped.doc) full = shipped.doc;
        }
        const bodies = extractBodies(full);
        setDoc({ ...emptyBodiesDoc(), bodies });
      } catch (err) {
        setApiErr(errText(err));
      }
      try {
        const rows = await loadCollection("champions");
        setChamps(
          rows.map((r: { id: string }) => ({
            id: r.id,
            name: (r as { name?: string }).name,
            modelKey: (r as { modelKey?: string }).modelKey,
          })),
        );
      } catch (err) {
        setApiErr((prev) => prev ?? errText(err));
      }
    })();
  }, []);

  const rows = useMemo(() => bodyRows(champs, doc.bodies), [champs, doc]);
  const sum = useMemo(() => bodySummary(rows), [rows]);

  const write = async (next: VoxelBodiesDoc, id: string, msg: string): Promise<void> => {
    setBusy(id);
    setApiErr(null);
    try {
      const head = await putOverlayDoc(BODY_COLLECTION, BODY_DOC_ID, next as unknown as Record<string, unknown>);
      setDoc(next);
      setFlash(`✓ ${msg}（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="體素身體">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        每位共用替身英雄穿<b style={{ color: TEXT_MAIN }}>體素身體</b>還是
        <b style={{ color: TEXT_MAIN }}>自己的 3D 模型</b>。預設是「有自己的模型就用模型」——
        40 位的原始 Warcraft III 模型已經抽出來了,只有真的沒有模型的才留在體素上。
        這裡改的設定寫進耐久覆蓋層,<b style={{ color: OK }}>撐得過重新部署</b>。
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, fontSize: 13 }}>
        <span style={{ color: TEXT_MAIN }}>替身英雄 {sum.total}</span>
        <span style={{ color: ACCENT }}>穿自己的模型 {sum.model}</span>
        <span style={{ color: GOLD }}>穿體素 {sum.voxel}</span>
        <span style={{ color: TEXT_DIM }}>後台設定過 {sum.touched}</span>
        <span style={{ color: WARN }}>沒有可用模型 {sum.noModelAvailable}</span>
      </div>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r: BodyRow) => (
          <div
            key={r.championId}
            data-testid={`body-row-${r.championId}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 10px",
              border: `1px solid ${PANEL_BORDER}`,
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            <span style={{ color: TEXT_MAIN, minWidth: 210 }}>{r.name}</span>
            <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 130 }}>{r.championId}</code>

            {r.effective ? (
              <Badge color={GOLD}>體素</Badge>
            ) : (
              <Badge color={ACCENT}>3D 模型</Badge>
            )}
            {r.origin === "overlay" ? (
              <Badge color={OK}>後台設定</Badge>
            ) : (
              <Badge color={TEXT_DIM}>預設</Badge>
            )}
            {!r.hasBlizzardModel && (
              <span title="沒有抽出對應的 Warcraft III 模型,關掉體素會退回共用替身臉">
                <Badge color={WARN}>無可用模型</Badge>
              </span>
            )}

            <span style={{ flex: 1 }} />
            <Btn
              disabled={busy !== null}
              onClick={() =>
                void write(
                  setBody(doc, r.championId, !r.effective),
                  r.championId,
                  `${r.name} 改成${!r.effective ? "體素" : "自己的模型"}`,
                )
              }
            >
              {busy === r.championId ? "…" : r.effective ? "改用 3D 模型" : "改用體素"}
            </Btn>
            {r.origin === "overlay" && (
              <Btn
                disabled={busy !== null}
                onClick={() =>
                  void write(forgetBody(doc, r.championId), r.championId, `${r.name} 回到預設`)
                }
              >
                回到預設
              </Btn>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
