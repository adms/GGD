/**
 * 體素條碼 · Voxel barcode — the console page for 特徵生成 batch one
 * (docs/_體素特徵生成規格.md §5.1).
 *
 * THE OWNER'S MODEL, IN ONE SENTENCE: a character is a standing rectangle, and
 * the top-to-bottom stack of flat colour bands IS that character. 香吉士 =
 * 黃髮／膚／黑西裝／黑鞋。魯夫 = 草帽褐＋紅帽帶＋黑帽緣／膚／紅背心／藍短褲／
 * 膚色小腿／褐涼鞋。
 *
 * ONE PIXEL IS PRODUCED HERE: NONE. The page edits JSON and nothing else. Its
 * preview is a stack of `<div style="height:N%;background:#hex">` — no canvas,
 * no image decode, no Babylon, no shared texture code. That is not a shortcut,
 * it is the design's best property: the barcode's visual representation IS a
 * stack of coloured divs, so the console is what-you-see-is-what-you-get with
 * zero graphics dependencies, and the owner's 「貼圖在地端生成」 constraint costs
 * nothing. Painting happens in `voxel:build` on the operator's own machine.
 *
 * WHERE A SAVE GOES. `PUT /api/v1/content-overlay/docs/config/voxel-barcodes` —
 * the platform's durable data/ overlay (#189), admin JWT, audited. Same writer
 * 內容覆蓋層 / 體素鑄造廠 / 殭屍波系統 use, which is why this page is EAGERLY
 * imported (it must exist in the production bundle: a barcode editor that only
 * runs on localhost cannot author the host the family plays on) and why it is in
 * SESSION_REQUIRED_PAGES (without a session every 儲存 would 401 and read as a
 * broken page rather than a missing sign-in).
 *
 * WHY NOT THE SEED FILE. `content/models/_voxel-barcodes.json` is a sidecar; the
 * overlay's id regex forbids a leading underscore, so that key cannot be written
 * at all. See ../voxelBarcode's header for the two-layer resolution this
 * produces — and note that it is what makes the badge on this page a FACT about
 * the data rather than a decoration.
 *
 * All parse / validate / normalise / preview logic is pure (../voxelBarcode,
 * unit-tested under node); this file is presentation + wiring.
 */
import { useEffect, useMemo, useState } from "react";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import { CONTENT_BASE, loadCollection } from "../content";
import {
  BARCODE_COLLECTION,
  BARCODE_DOC_ID,
  BARCODE_SEED_PATH,
  BARCODE_SLOTS,
  BARCODE_SLOT_PART,
  FACE_LABELS,
  FACE_SLOTS,
  FINE_BAND_NOTE,
  HIP_JOINT_NOTE,
  ORIGIN_LABEL,
  PART_LABELS,
  PERSISTENCE_NOTE,
  PIXEL_NOTE,
  SIM_GAP_NOTE,
  SLEEVE_LABELS,
  SLEEVE_ORDER,
  SLOT_LABELS,
  championChoices,
  championLabel,
  docToForm,
  extractBarcodes,
  forgetBarcode,
  formToDoc,
  formValid,
  formatFrac,
  isDirty,
  loadErrorText,
  maxPairwiseDeltaEOf,
  normalizeForm,
  patchBarcodeDoc,
  presentSlots,
  previewStack,
  resolveBarcode,
  saveErrorText,
  setBand,
  sleevePreview,
  totalFracOf,
  validateForm,
  type BarcodeForm,
  type BarcodeOrigin,
  type BarcodeSlot,
  type ChampionOption,
  type FaceSlot,
  type PreviewRow,
  type SleeveKind,
  type VoxelBarcode,
} from "../voxelBarcode";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

/** Height of the preview column, in px. The band heights are % OF THIS. */
const PREVIEW_H = 460;

export function VoxelBarcodePage(): React.JSX.Element {
  /** the FULL overlay doc — every other champion's barcode rides along on save */
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [overlay, setOverlay] = useState<Record<string, VoxelBarcode>>({});
  /** the shipped seed, read from the /content mount (never written by this page) */
  const [seed, setSeed] = useState<Record<string, VoxelBarcode>>({});
  const [roster, setRoster] = useState<ChampionOption[]>([]);
  const [champId, setChampId] = useState("");
  const [form, setForm] = useState<BarcodeForm>(() => docToForm(null, ""));
  /** the barcode the form was seeded from — what 未儲存 is measured against */
  const [saved, setSaved] = useState<VoxelBarcode | null>(null);
  const [origin, setOrigin] = useState<BarcodeOrigin>("none");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      let seedMap: Record<string, VoxelBarcode> = {};
      let overlayMap: Record<string, VoxelBarcode> = {};
      try {
        // The SEED first and on its own: it is a static file on the same origin,
        // it cannot 401, and a champion still previews from it when the platform
        // is unreachable.
        const res = await fetch(`${CONTENT_BASE}/${BARCODE_SEED_PATH}`);
        if (res.ok) seedMap = extractBarcodes(await res.json());
      } catch {
        // no seed → every champion reads as 還沒有條碼, which is the truth
      }
      try {
        // LIVE FIRST: the overlay is what the shard actually loads. Only when
        // this doc has no overlay entry does the repo version become the truth.
        const overlaid = (await getOverlayDoc(BARCODE_COLLECTION, BARCODE_DOC_ID)) as
          | Record<string, unknown>
          | null;
        let full = overlaid ?? null;
        if (!full) {
          const shipped = await getShippedDoc(BARCODE_COLLECTION, BARCODE_DOC_ID);
          if (shipped.present && shipped.doc && typeof shipped.doc === "object") {
            full = shipped.doc as Record<string, unknown>;
          }
        }
        overlayMap = extractBarcodes(full);
        setDoc(full);
        setOverlay(overlayMap);
      } catch (err) {
        setApiErr(loadErrorText(err));
      }
      setSeed(seedMap);

      let rosterRows: ChampionOption[] = [];
      try {
        rosterRows = (await loadCollection("champions")).map((r) => ({ id: r.id, name: r.name }));
        setRoster(rosterRows);
      } catch {
        // /content unreachable — the picker falls back to the ids that already
        // carry a barcode, which is still enough to edit them
      }

      // Open on a champion that HAS a barcode, so the first paint shows the
      // owner what the model already produces rather than a blank figure.
      const authored = [...Object.keys(overlayMap), ...Object.keys(seedMap)];
      const first =
        authored[0] ?? championChoices(rosterRows, overlayMap, seedMap)[0]?.id ?? "";
      if (first !== "") {
        const r = resolveBarcode(first, overlayMap, seedMap);
        setChampId(first);
        setForm(docToForm(r.barcode, first));
        setSaved(r.barcode);
        setOrigin(r.origin);
      }
      setLoading(false);
    })();
  }, []);

  const choices = useMemo(
    () => championChoices(roster, overlay, seed),
    [roster, overlay, seed],
  );
  const errors = useMemo(() => validateForm(form), [form]);
  const valid = formValid(form);
  const rows = useMemo(() => previewStack(form), [form]);
  const arms = sleevePreview(form);
  const dirty = isDirty(form, saved);
  const total = totalFracOf(form);
  const maxDe = maxPairwiseDeltaEOf(form);

  const selectChampion = (id: string): void => {
    const r = resolveBarcode(id, overlay, seed);
    setChampId(id);
    setForm(docToForm(r.barcode, id));
    setSaved(r.barcode);
    setOrigin(r.origin);
    setFlash(null);
  };

  const patch = (next: BarcodeForm): void => {
    setForm(next);
    setFlash(null);
  };

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      // THE PAYLOAD IS BUILT FROM `form`. Not from `saved`, not from the seed —
      // that substitution is 規格 §8's mutation 5 and v0.9.1's real defect, and
      // voxelBarcodeSave.test.ts drives the page and reads this object back.
      const barcode = formToDoc(form);
      const next = patchBarcodeDoc(doc, barcode);
      const head = await putOverlayDoc(BARCODE_COLLECTION, BARCODE_DOC_ID, next);
      setDoc(next);
      setOverlay(extractBarcodes(next));
      setSaved(barcode);
      setOrigin("overlay");
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(saveErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onRevert = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const next = forgetBarcode(doc, champId);
      const head = await putOverlayDoc(BARCODE_COLLECTION, BARCODE_DOC_ID, next);
      const nextOverlay = extractBarcodes(next);
      setDoc(next);
      setOverlay(nextOverlay);
      const r = resolveBarcode(champId, nextOverlay, seed);
      setForm(docToForm(r.barcode, champId));
      setSaved(r.barcode);
      setOrigin(r.origin);
      setFlash(`✓ 已移除後台版本（generation ${head.generation}）—— 這個角色回到出貨預設值`);
    } catch (err) {
      setFlash(null);
      setApiErr(saveErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1120 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>
          體素條碼 · Voxel barcode
        </div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, lineHeight: 1.7 }}>
          一個角色從頭到腳的色塊，就是那個角色的特徵主視覺。
          填 11 格顏色與佔比，右邊的預覽就是那個角色本人。
          <br />
          {PIXEL_NOTE}
        </div>
      </div>

      <ErrorBanner text={apiErr} onDismiss={() => setApiErr(null)} />

      <Note tone="ok" icon="💾" title="改了會不會被部署蓋掉？不會。">
        {PERSISTENCE_NOTE}
      </Note>

      <Note tone="warn" icon="⚠️" title="現在只存，還沒有畫成貼圖">
        {SIM_GAP_NOTE}
      </Note>

      <Panel
        title="選一個角色"
        right={
          loading ? (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>載入中…</span>
          ) : (
            <Badge color={origin === "overlay" ? WARN : origin === "seed" ? OK : TEXT_DIM}>
              {ORIGIN_LABEL[origin]}
            </Badge>
          )
        }
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={champId}
            disabled={busy || loading}
            data-field="champion"
            onChange={(e) => selectChampion(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid #2c3448",
              background: "#10141f",
              color: TEXT_MAIN,
              fontSize: 13,
              minWidth: 280,
            }}
          >
            {champId !== "" && !choices.some((c) => c.id === champId) && (
              <option value={champId}>{champId}</option>
            )}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name === c.id ? c.id : `${c.name}（${c.id}）`}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
            {origin === "overlay"
              ? "這個角色的條碼是後台改過的，蓋過出貨版。"
              : origin === "seed"
                ? "這個角色目前吃 content/models/_voxel-barcodes.json 的出貨版。"
                : "這個角色還沒有條碼 —— 存了就會有。"}
          </span>
        </div>
      </Panel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 260px",
          gap: 14,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Note tone="warn" icon="🧵" title="細帶不是雜訊">
            {FINE_BAND_NOTE}
          </Note>

          {(["head", "torso", "legs"] as const).map((part) => (
            <Panel key={part} title={PART_LABELS[part]}>
              {part === "legs" && (
                <div style={{ fontSize: 11.5, color: GOLD, marginBottom: 8, lineHeight: 1.7 }}>
                  {HIP_JOINT_NOTE}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {BARCODE_SLOTS.filter((s) => BARCODE_SLOT_PART[s] === part).map((slot) => (
                  <SlotRow
                    key={slot}
                    slot={slot}
                    form={form}
                    disabled={busy}
                    hexError={errors.bands[`${slot}.hex`]}
                    fracError={errors.bands[`${slot}.frac`]}
                    onChange={(p) => patch(setBand(form, slot, p))}
                  />
                ))}
              </div>
            </Panel>
          ))}

          <Panel title="袖子 · 手臂不是色帶，是規則">
            <div style={{ fontSize: 11.5, color: TEXT_DIM, marginBottom: 8, lineHeight: 1.7 }}>
              條碼是身體的中軸剖面，手臂不在上面。所以手臂的顏色是從這條規則推出來的，
              不用另外填。
            </div>
            <select
              value={form.sleeve}
              disabled={busy}
              data-field="sleeve"
              onChange={(e) => patch({ ...form, sleeve: e.target.value as SleeveKind })}
              style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid #2c3448",
                background: "#10141f",
                color: TEXT_MAIN,
                fontSize: 12.5,
                width: "100%",
                maxWidth: 420,
              }}
            >
              {SLEEVE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SLEEVE_LABELS[s]}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: ACCENT, marginTop: 8 }}>
              {arms === null
                ? "缺少這條規則需要的顏色（長袖要有上衣、裸露要有膚色）—— 手臂會沒有顏色"
                : `推出來的手臂：上半 ${arms.upper} · 下半 ${arms.lower}`}
            </div>
          </Panel>

          <Panel title="臉部 · 只畫在頭的正面">
            <div style={{ fontSize: 11.5, color: TEXT_DIM, marginBottom: 8, lineHeight: 1.7 }}>
              多拉A夢的黑眼＋紅鼻不是環繞全身的帶，是貼在頭部正面的圖案。
              所以它們不在上面 11 格裡，而在這裡。
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {FACE_SLOTS.map((f) => (
                <FaceRow
                  key={f}
                  face={f}
                  form={form}
                  disabled={busy}
                  error={errors.face[f]}
                  onChange={(next) => patch(next)}
                />
              ))}
            </div>
          </Panel>

          <Panel title="備註（只給人看，不會被畫出來）">
            <TextInput
              value={form.note}
              onChange={(v) => patch({ ...form, note: v })}
              disabled={busy}
              dataField="note"
              placeholder="例：黑腹卷是索隆的辨識點，不要因為只有 8% 就拿掉"
            />
          </Panel>
        </div>

        {/* ------------------------------------------------------------------
            THE PREVIEW. A stack of divs, top of head first, each `height` a
            percentage of this column and each `background` the authored hex.
            No image processing of any kind — see the file header.
           ------------------------------------------------------------------ */}
        <div style={{ position: "sticky", top: 12 }}>
          <Panel title="預覽 · 這就是那個角色">
            <div
              data-field="barcode-preview"
              style={{
                height: PREVIEW_H,
                width: "100%",
                borderRadius: 8,
                overflow: "hidden",
                border: PANEL_BORDER,
                background: "#0b0e16",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {rows.map((row) => (
                <PreviewBand key={row.slot} row={row} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 8, lineHeight: 1.7 }}>
              帶數 <b style={{ color: TEXT_MAIN }}>{presentSlots(form).length}</b> · 佔比總和{" "}
              <b style={{ color: Math.abs(total - 1) > 1e-3 ? WARN : OK }}>{formatFrac(total)}</b>{" "}
              · 帶間最大 ΔE <b style={{ color: maxDe < 25 ? WARN : OK }}>{maxDe.toFixed(1)}</b>
            </div>
            <Btn
              small
              disabled={busy || Math.abs(total - 1) <= 1e-3}
              onClick={() => patch(normalizeForm(form))}
              title="等比例縮放所有佔比，讓總和變成 1.0"
              style={{ marginTop: 8, width: "100%" }}
            >
              正規化佔比
            </Btn>
          </Panel>
        </div>
      </div>

      {errors.general.length > 0 && (
        <Panel title="還不能存">
          {errors.general.map((g) => (
            <div key={g} style={{ fontSize: 12, color: WARN, lineHeight: 1.8 }}>
              ● {g}
            </div>
          ))}
        </Panel>
      )}

      {errors.warnings.length > 0 && (
        <Panel title="提醒（不擋儲存）">
          {errors.warnings.map((w) => (
            <div key={w} style={{ fontSize: 11.5, color: TEXT_DIM, lineHeight: 1.8 }}>
              · {w}
            </div>
          ))}
        </Panel>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderRadius: 10,
          border: PANEL_BORDER,
          background: "#141a28",
          position: "sticky",
          bottom: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: TEXT_DIM }}>
          {champId === "" ? (
            <span>還沒有選角色</span>
          ) : dirty ? (
            <span style={{ color: WARN }}>● {championLabel(champId, choices)} 有未儲存的變更</span>
          ) : (
            <span>沒有未儲存的變更</span>
          )}
        </div>
        {origin === "overlay" && (
          <Btn
            small
            disabled={busy || loading}
            onClick={() => void onRevert()}
            title="刪掉這個角色的後台版本，回到出貨預設值"
          >
            改回出貨預設值
          </Btn>
        )}
        {flash && <div style={{ fontSize: 12, color: OK, maxWidth: 480 }}>{flash}</div>}
        <Btn
          kind="primary"
          onClick={() => void onSave()}
          disabled={busy || loading || !valid || champId === ""}
        >
          {busy ? "儲存中…" : "儲存 Save"}
        </Btn>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bits ----

/**
 * One band of the preview.
 *
 * The `style` here IS the assertion surface: `voxelBarcodeSave.test.ts` reads
 * `backgroundColor` and `height` off this node and additionally refuses
 * `display:none` / `opacity:0` / `height:0`. Nothing about the colour is carried
 * on a `data-*` attribute, because an attribute is not a pixel.
 */
function PreviewBand(props: { row: PreviewRow }): React.JSX.Element {
  const { row } = props;
  return (
    <div
      style={{
        height: `${row.heightPct}%`,
        backgroundColor: row.hex,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
      title={`${SLOT_LABELS[row.slot].zh} ${row.hex} ${row.heightPct.toFixed(1)}%`}
    >
      <span
        style={{
          fontSize: 9,
          padding: "0 4px",
          color: "#ffffff",
          textShadow: "0 0 3px #000, 0 0 3px #000",
          whiteSpace: "nowrap",
        }}
      >
        {SLOT_LABELS[row.slot].zh}
      </span>
    </div>
  );
}

/** One slot: 有/無 · colour swatch · hex box · frac box. */
function SlotRow(props: {
  slot: BarcodeSlot;
  form: BarcodeForm;
  disabled: boolean;
  hexError?: string;
  fracError?: string;
  onChange: (patch: { present?: boolean; hex?: string; frac?: string }) => void;
}): React.JSX.Element {
  const spec = SLOT_LABELS[props.slot];
  const band = props.form.bands[props.slot];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 76px 40px 110px 92px",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid #1b2233",
        opacity: band.present ? 1 : 0.55,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_MAIN }}>
          {spec.zh}
          {spec.fine && (
            <span style={{ color: GOLD, marginLeft: 6, fontSize: 10.5 }}>細帶</span>
          )}
          <code style={{ fontSize: 10.5, color: TEXT_DIM, marginLeft: 8, fontWeight: 400 }}>
            {props.slot}
          </code>
        </div>
        <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 1 }}>{spec.note}</div>
        <div style={{ fontSize: 11, color: ACCENT, marginTop: 2 }}>例：{spec.example}</div>
        {props.hexError && <div style={{ fontSize: 11, color: WARN }}>{props.hexError}</div>}
        {props.fracError && <div style={{ fontSize: 11, color: WARN }}>{props.fracError}</div>}
      </div>

      <select
        value={band.present ? "yes" : "no"}
        disabled={props.disabled}
        data-field={`band.${props.slot}.present`}
        onChange={(e) => props.onChange({ present: e.target.value === "yes" })}
        style={selectStyle}
      >
        <option value="yes">有</option>
        <option value="no">無</option>
      </select>

      <input
        type="color"
        value={normalizeSwatch(band.hex)}
        disabled={props.disabled || !band.present}
        data-field={`band.${props.slot}.swatch`}
        onChange={(e) => props.onChange({ hex: e.target.value })}
        style={{
          width: 38,
          height: 30,
          padding: 0,
          borderRadius: 6,
          border: "1px solid #2c3448",
          background: "#10141f",
        }}
      />

      <TextInput
        value={band.hex}
        onChange={(v) => props.onChange({ hex: v })}
        disabled={props.disabled || !band.present}
        dataField={`band.${props.slot}.hex`}
        placeholder="#rrggbb"
        style={{
          padding: "6px 8px",
          textAlign: "center",
          borderColor: props.hexError ? WARN : "#2c3448",
        }}
      />

      <TextInput
        value={band.frac}
        onChange={(v) => props.onChange({ frac: v })}
        type="number"
        disabled={props.disabled || !band.present}
        dataField={`band.${props.slot}.frac`}
        placeholder="0.20"
        style={{
          padding: "6px 8px",
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
          borderColor: props.fracError ? WARN : "#2c3448",
        }}
      />
    </div>
  );
}

/** One face decal colour. `nose` additionally has a 有/無, because 多數角色沒有. */
function FaceRow(props: {
  face: FaceSlot;
  form: BarcodeForm;
  disabled: boolean;
  error?: string;
  onChange: (next: BarcodeForm) => void;
}): React.JSX.Element {
  const { form, face } = props;
  const optional = face === "nose";
  const present = optional ? form.noseP : true;
  const value = face === "eye" ? form.eye : face === "nose" ? form.nose : form.mouth;
  const set = (hex: string): BarcodeForm =>
    face === "eye"
      ? { ...form, eye: hex }
      : face === "nose"
        ? { ...form, nose: hex }
        : { ...form, mouth: hex };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 76px 40px 110px",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid #1b2233",
        opacity: present ? 1 : 0.55,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_MAIN }}>
        {FACE_LABELS[face]}
        {props.error && (
          <span style={{ fontSize: 11, color: WARN, marginLeft: 8, fontWeight: 400 }}>
            {props.error}
          </span>
        )}
      </div>

      {optional ? (
        <select
          value={present ? "yes" : "no"}
          disabled={props.disabled}
          data-field="face.nose.present"
          onChange={(e) => props.onChange({ ...form, noseP: e.target.value === "yes" })}
          style={selectStyle}
        >
          <option value="yes">有</option>
          <option value="no">無</option>
        </select>
      ) : (
        <span style={{ fontSize: 11, color: TEXT_DIM }}>必填</span>
      )}

      <input
        type="color"
        value={normalizeSwatch(value)}
        disabled={props.disabled || !present}
        data-field={`face.${face}.swatch`}
        onChange={(e) => props.onChange(set(e.target.value))}
        style={{
          width: 38,
          height: 30,
          padding: 0,
          borderRadius: 6,
          border: "1px solid #2c3448",
          background: "#10141f",
        }}
      />

      <TextInput
        value={value}
        onChange={(v) => props.onChange(set(v))}
        disabled={props.disabled || !present}
        dataField={`face.${face}`}
        placeholder="#rrggbb"
        style={{
          padding: "6px 8px",
          textAlign: "center",
          borderColor: props.error ? WARN : "#2c3448",
        }}
      />
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #2c3448",
  background: "#10141f",
  color: TEXT_MAIN,
  fontSize: 12.5,
  width: "100%",
};

/**
 * `<input type="color">` refuses anything but a lowercase `#rrggbb` and silently
 * shows black otherwise. The TEXT box remains the source of truth (it is what
 * `validateForm` judges), so the swatch gets a safe stand-in while a half-typed
 * hex is on screen rather than dragging the value to #000000.
 */
function normalizeSwatch(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex.trim()) ? hex.trim().toLowerCase() : "#000000";
}

function Note(props: {
  tone: "ok" | "warn";
  icon: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const color = props.tone === "ok" ? OK : GOLD;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${color}`,
        background: props.tone === "ok" ? "#0f1f16" : "#231d10",
        color,
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      <span style={{ fontSize: 15 }}>{props.icon}</span>
      <div>
        <b>{props.title}</b>
        <div style={{ color: TEXT_DIM, marginTop: 2 }}>{props.children}</div>
      </div>
    </div>
  );
}
