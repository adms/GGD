import { useDesktopAi } from "../ai/desktopAi";
import { AiSetupCards } from "./AiSetupCards";

export function AiFirstLaunch() {
  const ai = useDesktopAi();
  if (!ai.status.desktopAvailable || ai.status.preferenceConfigured) return null;
  return <div className="hero-ai-welcome-backdrop" role="presentation">
    <section className="hero-ai-welcome" role="dialog" aria-modal="true" aria-labelledby="hero-ai-welcome-title">
      <h1 id="hero-ai-welcome-title">英雄鑄造要使用哪種協助？</h1>
      <p>這只決定建議來源；模板、驗證、模擬與封包都不依賴 AI。之後可隨時更改。</p>
      <AiSetupCards value={ai.status.preference} onChange={() => undefined} />
      <small>選「本機 14B」不會立刻下載；你仍要按「下載模型」確認 8.38 GiB 下載。</small>
    </section>
  </div>;
}
