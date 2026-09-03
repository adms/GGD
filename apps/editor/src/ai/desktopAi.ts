import { useCallback, useEffect, useState } from "react";
import {
  LOCAL_AI_STATUS_SCHEMA,
  zLocalAiStatus,
  type AiMode,
  type LocalAiStatus,
  type LocalModelControlRequest,
} from "@ggd/shared/content";

interface DesktopAiBridge {
  getStatus(): Promise<unknown>;
  setPreference(mode: AiMode): Promise<unknown>;
  controlModel(action: LocalModelControlRequest["action"]): Promise<unknown>;
  onStatus(listener: (status: unknown) => void): () => void;
}

declare global {
  interface Window { ggdAi?: DesktopAiBridge }
}

const BROWSER_STATUS: LocalAiStatus = {
  schema: LOCAL_AI_STATUS_SCHEMA,
  preference: "off",
  preferenceConfigured: true,
  desktopAvailable: false,
  model: {
    id: "qwen3-14b-q4-k-m",
    displayName: "Qwen3-14B Q4_K_M",
    state: "not-installed",
    expectedBytes: 9_001_752_960,
    downloadedBytes: 0,
    digest: "500a8806e85ee9c83f3ae08420295592451379b4f8cf2d0f41c15dffeb6b81f0",
    errorCode: null,
  },
  inference: { enabled: false, backend: "none", reasonCode: "DESKTOP_BRIDGE_UNAVAILABLE" },
  byok: {
    configured: false,
    remembered: false,
    baseUrl: null,
    origin: null,
    protocol: "auto",
    models: [],
    selectedModel: null,
    modelDiscovery: "unknown",
    structuredOutput: "unknown",
    disclosureAccepted: false,
    connection: { state: "idle", message: null },
  },
};

export function useDesktopAi() {
  const [status, setStatus] = useState<LocalAiStatus>(BROWSER_STATUS);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const bridge = window.ggdAi;
    if (!bridge) return;
    const accept = (raw: unknown) => {
      const parsed = zLocalAiStatus.safeParse(raw);
      if (parsed.success) setStatus(parsed.data);
    };
    void bridge.getStatus().then(accept).catch((reason) => setError(String(reason)));
    return bridge.onStatus(accept);
  }, []);
  const setPreference = useCallback(async (mode: AiMode) => {
    if (!window.ggdAi) return;
    setError(null);
    try { setStatus(zLocalAiStatus.parse(await window.ggdAi.setPreference(mode))); }
    catch (reason) { setError(String(reason)); }
  }, []);
  const controlModel = useCallback(async (action: LocalModelControlRequest["action"]) => {
    if (!window.ggdAi) return;
    setError(null);
    try { setStatus(zLocalAiStatus.parse(await window.ggdAi.controlModel(action))); }
    catch (reason) { setError(String(reason)); }
  }, []);
  return { status, error, setPreference, controlModel };
}
