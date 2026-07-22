/**
 * 戰鬥系統 (combat environment) page — tunes the GLOBAL multiplier table that
 * scales every combat quantity in the sim: 冷卻 / 傷害 / 防禦 / 生命 / 速度 /
 * 治療 / 護盾 / 暴擊 …. 1.0 is neutral (legacy behaviour); the rows are grouped,
 * each with a 中文 label, the raw engine key, a step-0.05 numeric input and a
 * per-row 重設. A global 全部重設 puts the whole table back to 1.0.
 *
 * The one thing an operator must understand is printed next to Save: a change
 * takes effect for the NEXT match only — matches in progress keep the table
 * they started with, which is what makes this dynamic config deterministic-safe
 * (the game-server snapshots the table at room creation).
 *
 * All parse/validate/payload logic is pure (../combatEnv.ts, unit-tested); this
 * file is presentation + wiring only.
 */
import { useEffect, useMemo, useState } from "react";
import { getCombatEnv, putCombatEnv } from "../api";
import {
  APPLY_NOTE,
  COMBAT_ENV_GROUPS,
  COMBAT_ENV_LABELS,
  MAX_FACTOR,
  MIN_FACTOR,
  NEUTRAL,
  STEP,
  changedKeys,
  emptyCombatEnvDoc,
  formFromDoc,
  formValid,
  loadErrorText,
  nonNeutralKeys,
  parseFactor,
  resetAll,
  resetField,
  saveErrorText,
  setField,
  stepField,
  toSavePayload,
  validateForm,
  type CombatEnvDoc,
  type CombatEnvForm,
  type CombatEnvKey,
} from "../combatEnv";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

export function CombatEnvPage(): React.JSX.Element {
  const [doc, setDoc] = useState<CombatEnvDoc>(emptyCombatEnvDoc());
  const [form, setForm] = useState<CombatEnvForm>(() => formFromDoc(emptyCombatEnvDoc()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const d = await getCombatEnv();
        setDoc(d);
        setForm(formFromDoc(d));
      } catch (err) {
        setApiErr(`${loadErrorText(err)}（平台 API 尚未提供 /admin/combat-env？）`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const errors = useMemo(() => validateForm(form), [form]);
  const valid = formValid(form);
  const dirty = useMemo(() => changedKeys(form, doc), [form, doc]);
  const tuned = useMemo(() => nonNeutralKeys(form), [form]);

  const patch = (next: CombatEnvForm): void => {
    setForm(next);
    setFlash(null);
  };

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const saved = await putCombatEnv(toSavePayload(form));
      setDoc(saved);
      setForm(formFromDoc(saved));
      setFlash({ ok: true, text: `✓ 已儲存 — ${APPLY_NOTE}` });
    } catch (err) {
      setFlash(null);
      setApiErr(saveErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 860 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>戰鬥系統 · Combat environment</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
          全域戰鬥倍率表：每個數值都是一個乘算係數，<b style={{ color: TEXT_MAIN }}>1 = 預設</b>（與原本完全相同）。
          例如「造成傷害 1.2」= 全場傷害提高 20%，「技能冷卻時間 0.8」= 冷卻縮短 20%。可調整範圍 {MIN_FACTOR}～{MAX_FACTOR}。
        </div>
      </div>

      <ErrorBanner text={apiErr} onDismiss={() => setApiErr(null)} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 10,
          border: `1px solid ${GOLD}`,
          background: "#231d10",
          color: GOLD,
          fontSize: 12.5,
          fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 15 }}>⏱️</span>
        <span>{APPLY_NOTE}</span>
      </div>

      <Panel
        title="倍率表 · Multipliers"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {loading ? (
              <span style={{ fontSize: 11, color: TEXT_DIM }}>載入中…</span>
            ) : tuned.length > 0 ? (
              <Badge color={WARN}>{tuned.length} 項已調整</Badge>
            ) : (
              <Badge color={OK}>全部預設</Badge>
            )}
            <Btn small onClick={() => patch(resetAll())} disabled={loading || busy} title="把所有倍率設回 1.0">
              全部重設 1.0
            </Btn>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {COMBAT_ENV_GROUPS.map((group) => (
            <div key={group.title}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: ACCENT,
                  marginBottom: 6,
                  borderBottom: PANEL_BORDER,
                  paddingBottom: 4,
                }}
              >
                {group.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {group.keys.map((key) => (
                  <Row
                    key={key}
                    envKey={key}
                    value={form[key]}
                    error={errors[key]}
                    saved={doc.multipliers[key] ?? NEUTRAL}
                    disabled={loading || busy}
                    onChange={(v) => patch(setField(form, key, v))}
                    onStep={(d) => patch(stepField(form, key, d))}
                    onReset={() => patch(resetField(form, key))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

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
        }}
      >
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: TEXT_DIM }}>
          {doc.updatedAt ? <span>最後更新 {doc.updatedAt}</span> : <span style={{ color: GOLD }}>尚未調整過（全部預設）</span>}
          {dirty.length > 0 && <span style={{ color: WARN, marginLeft: 10 }}>● {dirty.length} 項未儲存</span>}
        </div>
        {!valid && <div style={{ fontSize: 12, color: WARN }}>有欄位不合法，請修正後再儲存</div>}
        {flash && <div style={{ fontSize: 12, color: flash.ok ? OK : WARN, maxWidth: 460 }}>{flash.text}</div>}
        <Btn kind="primary" onClick={() => void onSave()} disabled={busy || loading || !valid}>
          {busy ? "儲存中…" : "儲存 Save"}
        </Btn>
      </div>
    </div>
  );
}

/** One multiplier row: 中文 label + engine key, numeric input, ± , 重設. */
function Row(props: {
  envKey: CombatEnvKey;
  value: string;
  error?: string;
  saved: number;
  disabled: boolean;
  onChange: (v: string) => void;
  onStep: (delta: number) => void;
  onReset: () => void;
}): React.JSX.Element {
  const label = COMBAT_ENV_LABELS[props.envKey];
  const n = parseFactor(props.value);
  const neutral = n === NEUTRAL;
  const unsaved = n === null || n !== props.saved;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 132px auto",
        alignItems: "center",
        gap: 10,
        padding: "7px 0",
        borderBottom: "1px solid #1b2233",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_MAIN }}>
          {label.zh}
          <code style={{ fontSize: 10.5, color: TEXT_DIM, marginLeft: 8, fontWeight: 400 }}>{props.envKey}</code>
          {unsaved && <span style={{ color: WARN, marginLeft: 6, fontSize: 11 }}>●</span>}
        </div>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 1 }}>{label.note}</div>
        {props.error && <div style={{ fontSize: 11, color: WARN, marginTop: 2 }}>{props.error}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Btn small disabled={props.disabled} onClick={() => props.onStep(-STEP)} title={`-${STEP}`} style={{ padding: "4px 8px" }}>
          −
        </Btn>
        <TextInput
          value={props.value}
          onChange={props.onChange}
          type="number"
          style={{
            textAlign: "center",
            padding: "6px 4px",
            fontVariantNumeric: "tabular-nums",
            borderColor: props.error ? WARN : neutral ? "#2c3448" : ACCENT,
            color: props.error ? WARN : neutral ? TEXT_MAIN : ACCENT,
            fontWeight: neutral ? 400 : 700,
          }}
        />
        <Btn small disabled={props.disabled} onClick={() => props.onStep(STEP)} title={`+${STEP}`} style={{ padding: "4px 8px" }}>
          +
        </Btn>
      </div>

      <Btn
        small
        disabled={props.disabled || neutral}
        onClick={props.onReset}
        title="設回 1.0"
        style={{ minWidth: 54 }}
      >
        重設
      </Btn>
    </div>
  );
}
