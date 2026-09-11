import type { AiMode } from "@ggd/shared/content";
import { useDesktopAi } from "../ai/desktopAi";

export function AiSetupCards({ value, onChange }: { value: AiMode; onChange(value: AiMode): void }) {
  const ai = useDesktopAi();
  const model = ai.status.model;
  const percent = Math.min(100, Math.round(model.downloadedBytes / model.expectedBytes * 100));
  const choose = (mode: AiMode) => {
    onChange(mode);
    void ai.setPreference(mode);
  };
  return (
    <section className="hero-ai-cards" aria-label="AI 模式">
      <button type="button" className={value === "off" ? "active" : ""} onClick={() => choose("off")}>
        <strong>不用 AI</strong><span>完整使用可驗證的模板建立英雄</span>
      </button>
      <button type="button" className={value === "local" ? "active" : ""} disabled={!ai.status.desktopAvailable} title={ai.status.desktopAvailable ? "只會下載固定且可驗證的模型檔" : "本機模型只在 macOS／Windows 桌面版提供"} onClick={() => choose("local")}>
        <strong>本機 14B</strong><span>按需下載 8.38 GiB；不需要 API key</span>
      </button>
      <button type="button" disabled title="E4 將加入 BYOK">
        <strong>自己的 API</strong><span>後續批次：OpenAI-compatible URL 與 key</span>
      </button>
      {ai.status.desktopAvailable ? <div className="hero-ai-model" role="status">
        <div><strong>{model.displayName}</strong><span>{model.state} · {percent}%</span></div>
        <progress max={model.expectedBytes} value={model.downloadedBytes} />
        <div className="hero-ai-actions">
          {(["not-installed", "partial", "paused"].includes(model.state)) ? <button type="button" onClick={() => void ai.controlModel(model.state === "not-installed" ? "start" : "resume")}>{model.state === "not-installed" ? "下載模型" : "繼續下載"}</button> : null}
          {model.state === "downloading" ? <button type="button" onClick={() => void ai.controlModel("pause")}>暫停</button> : null}
          {["downloading", "paused", "partial"].includes(model.state) ? <button type="button" onClick={() => void ai.controlModel("cancel")}>取消並刪除暫存</button> : null}
          {model.state === "broken" ? <button type="button" onClick={() => void ai.controlModel("repair")}>修復</button> : null}
          {model.state === "ready" ? <button type="button" onClick={() => void ai.controlModel("remove")}>刪除模型</button> : null}
        </div>
        {model.state === "ready" && !ai.status.inference.enabled ? <p>檔案已驗證；等待 E8 在同一 artifact 完成 Mac 與 RTX 4060 Ti 16GB Gate 後才啟用推論。</p> : null}
        {model.errorCode ? <p className="error">{model.errorCode}</p> : null}
        {ai.error ? <p className="error">{ai.error}</p> : null}
      </div> : null}
    </section>
  );
}
