/**
 * 系統運維 (server ops) page — the operational SERVER numbers.
 *
 * Two things happen here, and they are different things:
 *
 *  1. TWO EDITABLE KNOBS. 同時對戰上限 (maxRooms) and 快照頻率 (snapshotHz).
 *     Every bound, unit, safety badge and 何時生效 line is rendered from the
 *     descriptor the PLATFORM serves, so this file declares no limits of its
 *     own and cannot show a range the validator does not enforce.
 *  2. AN INVENTORY OF EVERYTHING ELSE, read-only. Tick rate, phase durations,
 *     the economy block, the rate-limit policy, the match TTL, the security
 *     flags — each with its current value, its safety class, how it actually
 *     changes, and why it is not a box. Before this page an operator could not
 *     see any of these numbers anywhere; making them visible is most of the
 *     value, and keeping them read-only is most of the safety.
 *
 * Every row shows THREE states, because for a next-match knob they differ:
 * 編輯中 (unsaved), 已儲存 (what the platform stores), 生效中 (what is actually
 * running — and for 快照頻率 the honest answer includes "matches already in
 * progress keep what they started with").
 *
 * All parse/validate/payload logic is pure (../serverOps.ts, unit-tested); this
 * file is presentation + wiring only.
 */
import { useEffect, useMemo, useState } from "react";
import { getServerOps, putServerOps } from "../api";
import {
  APPLY_NOTE,
  DRAINING_NOTE,
  SAFETY_LABEL,
  SAFETY_TONE,
  changedKeys,
  coupledSnapshotWarning,
  effectFor,
  emptyOpsPayload,
  formFromPayload,
  formValid,
  interpFloorLine,
  isLocked,
  loadErrorText,
  lockedNote,
  nonDefaultKeys,
  resetAll,
  resetField,
  saveErrorText,
  setField,
  toSavePayload,
  validateForm,
  type OpsDescriptor,
  type OpsForm,
  type OpsPayload,
  type OpsSafety,
} from "../serverOps";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

function toneColor(safety: OpsSafety): string {
  const tone = SAFETY_TONE[safety];
  return tone === "ok" ? OK : tone === "warn" ? WARN : TEXT_DIM;
}

export function ServerOpsPage(): React.JSX.Element {
  const [payload, setPayload] = useState<OpsPayload>(emptyOpsPayload());
  const [form, setForm] = useState<OpsForm>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const p = await getServerOps();
        setPayload(p);
        setForm(formFromPayload(p));
      } catch (err) {
        setApiErr(`${loadErrorText(err)}（平台 API 尚未提供 /admin/server-ops？）`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const errors = useMemo(() => validateForm(payload, form), [payload, form]);
  const valid = formValid(payload, form);
  const dirty = useMemo(() => changedKeys(payload, form), [payload, form]);
  const tuned = useMemo(() => nonDefaultKeys(payload, form), [payload, form]);
  const coupled = useMemo(() => coupledSnapshotWarning(payload, form), [payload, form]);

  const patch = (next: OpsForm): void => {
    setForm(next);
    setFlash(null);
  };

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const saved = await putServerOps(toSavePayload(payload, form));
      setPayload(saved);
      setForm(formFromPayload(saved));
      setFlash({ ok: true, text: `✓ 已儲存 — ${APPLY_NOTE}` });
    } catch (err) {
      setFlash(null);
      setApiErr(saveErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const renderKnob = (d: OpsDescriptor): React.JSX.Element => {
    const eff = effectFor(payload, form, d);
    const err = errors[d.key] ?? "";
    return (
      <div
        key={d.key}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "12px 14px",
          border: PANEL_BORDER,
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, color: TEXT_MAIN, fontSize: 14 }}>{d.zhLabel}</div>
          <Badge color={toneColor(d.safety)}>{SAFETY_LABEL[d.safety]}</Badge>
          <code style={{ fontSize: 11, color: TEXT_DIM }}>{d.key}</code>
          {d.env ? <code style={{ fontSize: 11, color: TEXT_DIM }}>{d.env}</code> : null}
        </div>

        <div style={{ fontSize: 12, color: TEXT_DIM }}>{d.zhNote}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ width: 140 }}>
            <TextInput
              value={form[d.key] ?? ""}
              onChange={(v) => patch(setField(form, d.key, v))}
              placeholder={String(d.default)}
              disabled={isLocked(d)}
            />
          </div>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>{d.unit}</span>
          {isLocked(d) ? (
            <span style={{ fontSize: 11.5, color: WARN }}>{lockedNote(d)}</span>
          ) : (
            <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
              可調整範圍 {d.min} ～ {d.max}
              {d.integer ? "（整數）" : ""} ・ 內建預設 {d.default}
            </span>
          )}
          <Btn onClick={() => patch(resetField(form, d))} kind="ghost" disabled={isLocked(d)}>
            重設
          </Btn>
        </div>

        {err ? <div style={{ fontSize: 12, color: WARN }}>{err}</div> : null}

        {/* SAVED vs IN EFFECT — different things for a next-match knob. */}
        <div style={{ fontSize: 12, color: ACCENT }}>{eff.effect}</div>
        <div style={{ fontSize: 11.5, color: TEXT_DIM }}>
          已儲存：{eff.saved}
          {d.unit}
          {eff.savedIsDefault ? "（= 內建預設值）" : ""} ・ {d.zhApplies}
        </div>

        {/* The interpolation coupling: shown as a derived line, never as a
            second editable field. Two free boxes let an operator ship a
            stuttering game in one save. */}
        {d.key === "snapshotHz" && interpFloorLine(form) ? (
          <div style={{ fontSize: 11.5, color: TEXT_DIM }}>
            {interpFloorLine(form)} ・ 目前客戶端編譯值 {payload.clientInterpDelayMs} ms
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>系統運維 · Server ops</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
          伺服器運作參數。<b style={{ color: TEXT_MAIN }}>可編輯的只有下面兩項</b>
          ；其餘數值在下方「唯讀清單」中列出目前值與變更方式。每一項都標示生效時機：
          「立即生效」/「下一場生效」/「需重啟」。
        </div>
      </div>

      <ErrorBanner text={apiErr} onDismiss={() => setApiErr(null)} />

      <div
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: `1px solid ${GOLD}`,
          background: "#231d10",
          color: GOLD,
          fontSize: 12.5,
          fontWeight: 700,
          lineHeight: 1.6,
        }}
      >
        {APPLY_NOTE}
        <div style={{ fontWeight: 500, marginTop: 4 }}>{DRAINING_NOTE}</div>
      </div>

      {coupled ? (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${WARN}`,
            background: "#2a2113",
            color: WARN,
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          {coupled}
        </div>
      ) : null}

      <Panel title="可調整參數">
        {loading ? (
          <div style={{ color: TEXT_DIM, fontSize: 13 }}>載入中…</div>
        ) : payload.descriptors.length === 0 ? (
          <div style={{ color: TEXT_DIM, fontSize: 13 }}>平台未回傳任何可調整參數。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {payload.descriptors.map(renderKnob)}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 14,
            flexWrap: "wrap",
          }}
        >
          <Btn onClick={() => void onSave()} kind="primary" disabled={busy || !valid || loading}>
            {busy ? "儲存中…" : "儲存"}
          </Btn>
          <Btn onClick={() => patch(resetAll(payload))} kind="ghost" disabled={busy || loading}>
            全部重設為預設值
          </Btn>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>
            {payload.stored ? "" : "尚未設定過（目前使用內建預設值） ・ "}
            {dirty.length > 0 ? `${dirty.length} 項未儲存` : "沒有未儲存的變更"}
            {tuned.length > 0 ? ` ・ ${tuned.length} 項與預設不同` : ""}
          </span>
          {flash ? (
            <span style={{ fontSize: 12, color: flash.ok ? OK : WARN }}>{flash.text}</span>
          ) : null}
        </div>
      </Panel>

      <Panel title="唯讀清單 · 其他運作數值">
        <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 10 }}>
          這些數值同樣是「詳細數字」，但不開放後台修改。每一列說明它現在是多少、要怎麼改、以及為什麼不放在上面。
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {payload.info.map((it) => (
            <div
              key={it.key}
              style={{ padding: "10px 12px", border: PANEL_BORDER, borderRadius: 10 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, color: TEXT_MAIN, fontSize: 13 }}>{it.zhLabel}</div>
                <Badge color={toneColor(it.safety)}>{SAFETY_LABEL[it.safety]}</Badge>
                <span style={{ fontSize: 13, color: ACCENT, fontWeight: 700 }}>{it.value}</span>
              </div>
              <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
                如何變更：{it.zhHow}
              </div>
              <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>
                為什麼不開放：{it.zhWhy}
              </div>
              <code style={{ fontSize: 11, color: TEXT_DIM }}>{it.where}</code>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
