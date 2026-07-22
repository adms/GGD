/**
 * AI 生成設定 (AI provider config) page — configures the platform's server-side
 * AI proxy: an enabled toggle, a base URL + model per capability (image / text /
 * tts / music, each independently live or stubbed), and a WRITE-ONLY API key
 * field (shows the masked stored value as a placeholder, replaced only when the
 * admin types a new one). Save posts to the admin-gated `/admin/ai/config`. A
 * clear status badge shows configured vs stub-mode.
 *
 * The key never leaves the server: the GET only ever returns a masked hint, and
 * this page only SENDS a key when the admin actually typed one. All
 * parse/status/payload/validation logic is pure (../ai.ts, unit-tested); this
 * file is presentation + wiring only.
 */
import { useEffect, useMemo, useState } from "react";
import { getAiConfig, putAiConfig } from "../api";
import {
  emptyAiConfig,
  formFromConfig,
  formValid,
  imageStatus,
  musicStatus,
  providerStatus,
  statusReason,
  textStatus,
  toSavePayload,
  ttsStatus,
  validateForm,
  type AiConfigForm,
  type AiConfigMasked,
} from "../ai";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

function Field(props: {
  label: string;
  sub?: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 2 }}>{props.label}</div>
      {props.sub && <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>{props.sub}</div>}
      {props.children}
      {props.error && <div style={{ fontSize: 11, color: WARN, marginTop: 4 }}>{props.error}</div>}
    </label>
  );
}

export function AiSettingsPage(): React.JSX.Element {
  const [config, setConfig] = useState<AiConfigMasked>(emptyAiConfig());
  const [form, setForm] = useState<AiConfigForm>(() => formFromConfig(emptyAiConfig()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await getAiConfig();
        setConfig(cfg);
        setForm(formFromConfig(cfg));
      } catch (err) {
        setApiErr(
          `讀取 AI 設定失敗：${err instanceof Error ? err.message : String(err)}（平台 API 尚未提供 /admin/ai/config？）`,
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const errors = useMemo(() => validateForm(form), [form]);
  const valid = formValid(form);
  const status = providerStatus(config);

  const patch = (p: Partial<AiConfigForm>): void => {
    setForm((f) => ({ ...f, ...p }));
    setFlash(null);
  };

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const saved = await putAiConfig(toSavePayload(form));
      setConfig(saved);
      setForm(formFromConfig(saved)); // reseed → key box empty again, untouched
      setFlash({
        ok: true,
        text:
          providerStatus(saved) === "configured"
            ? "✓ 已儲存 — AI 供應商已設定，可正式生成。"
            : "✓ 已儲存 — 目前為佔位模式（stub），編輯器仍可產生占位圖與文字。",
      });
    } catch (err) {
      setFlash(null);
      setApiErr(`儲存失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>AI 生成設定 · AI provider</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
          設定編輯器用來生成 icon 圖片、AI 填空文字、語音（TTS）與音樂（BGM）的供應商。四種能力各自獨立設定，可以只開其中幾項。
          API 金鑰只存在伺服器端，前端與編輯器永遠拿不到完整金鑰。 未設定時系統以「佔位模式（stub）」運作 —
          圖片與文字仍可產生占位內容；語音與音樂則回報未設定，由本地工具產生。
        </div>
      </div>

      <ErrorBanner text={apiErr} onDismiss={() => setApiErr(null)} />

      <Panel
        title="供應商狀態 · Provider status"
        right={
          status === "configured" ? (
            <Badge color={OK}>configured</Badge>
          ) : (
            <Badge color={WARN}>stub mode</Badge>
          )
        }
      >
        <div style={{ fontSize: 12, color: status === "configured" ? OK : WARN, marginBottom: 10 }}>
          {loading ? "載入中…" : statusReason(config)}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CapChip label="圖片生成 image" ready={imageStatus(config) === "ready"} />
          <CapChip label="文字生成 text" ready={textStatus(config) === "ready"} />
          <CapChip label="語音生成 tts" ready={ttsStatus(config) === "ready"} />
          <CapChip label="音樂生成 music" ready={musicStatus(config) === "ready"} />
          {config.hasKey && (
            <span style={{ fontSize: 11, color: TEXT_DIM, alignSelf: "center" }}>
              金鑰：<code style={{ color: TEXT_MAIN }}>{config.apiKeyMasked || "••••"}</code>（已儲存於伺服器端）
            </span>
          )}
        </div>
      </Panel>

      <Panel title="設定 · Configuration">
        <Field label="啟用 AI 生成 · Enabled">
          <button
            onClick={() => patch({ enabled: !form.enabled })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: form.enabled ? "#0b0e16" : TEXT_DIM,
              background: form.enabled ? OK : "#171d2b",
              border: `1px solid ${form.enabled ? OK : "#2c3448"}`,
            }}
          >
            {form.enabled ? "● 已啟用" : "○ 未啟用（佔位模式）"}
          </button>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field
            label="圖片端點 · Image base URL"
            sub="OpenAI 相容：/images/generations"
            error={errors.imageBaseUrl}
          >
            <TextInput
              value={form.imageBaseUrl}
              onChange={(v) => patch({ imageBaseUrl: v })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="圖片模型 · Image model">
            <TextInput
              value={form.imageModel}
              onChange={(v) => patch({ imageModel: v })}
              placeholder="gpt-image-1 / dall-e-3"
            />
          </Field>
          <Field
            label="文字端點 · Text base URL"
            sub="OpenAI /chat/completions 或 Anthropic /messages"
            error={errors.textBaseUrl}
          >
            <TextInput
              value={form.textBaseUrl}
              onChange={(v) => patch({ textBaseUrl: v })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="文字模型 · Text model">
            <TextInput
              value={form.textModel}
              onChange={(v) => patch({ textModel: v })}
              placeholder="gpt-4o-mini / claude-3-5-haiku"
            />
          </Field>
          <Field label="語音端點 · TTS base URL" sub="OpenAI 相容：/audio/speech" error={errors.ttsBaseUrl}>
            <TextInput
              value={form.ttsBaseUrl}
              onChange={(v) => patch({ ttsBaseUrl: v })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="語音模型 · TTS model">
            <TextInput value={form.ttsModel} onChange={(v) => patch({ ttsModel: v })} placeholder="gpt-4o-mini-tts" />
          </Field>
          <Field label="音樂端點 · Music base URL" sub="BGM 生成：/audio/music" error={errors.musicBaseUrl}>
            <TextInput
              value={form.musicBaseUrl}
              onChange={(v) => patch({ musicBaseUrl: v })}
              placeholder="https://api.example.com/v1"
            />
          </Field>
          <Field label="音樂模型 · Music model">
            <TextInput value={form.musicModel} onChange={(v) => patch({ musicModel: v })} placeholder="music-1" />
          </Field>
        </div>

        <Field label="預設語音 · TTS voice" sub="請求未指定 voice 時使用；留空則由供應商決定。">
          <TextInput value={form.ttsVoice} onChange={(v) => patch({ ttsVoice: v })} placeholder="shimmer / nova" />
        </Field>

        <Field
          label="API 金鑰 · API key（write-only）"
          sub={
            config.hasKey
              ? "已有儲存金鑰。留空 = 保留現有金鑰；輸入新值 = 取代；清空並儲存 = 移除。"
              : "尚未設定金鑰。請貼上你自己的供應商金鑰（僅存於伺服器端，不會回傳）。"
          }
        >
          <TextInput
            value={form.apiKeyInput}
            onChange={(v) => patch({ apiKeyInput: v, apiKeyTouched: true })}
            type="password"
            placeholder={config.hasKey ? `保留現有（${config.apiKeyMasked || "••••"}）` : "sk-…"}
          />
          {form.apiKeyTouched && (
            <div style={{ fontSize: 11, color: form.apiKeyInput.trim() === "" ? WARN : ACCENT, marginTop: 4 }}>
              {form.apiKeyInput.trim() === "" ? "儲存後將移除現有金鑰" : "儲存後將以新金鑰取代"}
            </div>
          )}
        </Field>
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
        <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: TEXT_DIM }}>
          {config.updatedAt ? <span>最後更新 {config.updatedAt}</span> : <span style={{ color: GOLD }}>尚未設定</span>}
        </div>
        {flash && <div style={{ fontSize: 12, color: flash.ok ? OK : WARN, maxWidth: 460 }}>{flash.text}</div>}
        <Btn kind="primary" onClick={() => void onSave()} disabled={busy || loading || !valid}>
          {busy ? "儲存中…" : "儲存 Save"}
        </Btn>
      </div>
    </div>
  );
}

function CapChip(props: { label: string; ready: boolean }): React.JSX.Element {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 6,
        color: props.ready ? "#0b0e16" : TEXT_DIM,
        background: props.ready ? OK : "#171d2b",
        border: `1px solid ${props.ready ? OK : "#2c3448"}`,
      }}
    >
      {props.label}: {props.ready ? "live" : "stub"}
    </span>
  );
}
