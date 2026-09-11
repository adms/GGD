import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zAiMode, type AiMode } from "@ggd/shared/content";

const AI_PREFERENCE_SCHEMA = "ggd-ai-preference@1" as const;

export interface AiPreferenceState { readonly mode: AiMode; readonly configured: boolean }

export function readAiPreference(userData: string): AiPreferenceState {
  try {
    const value = JSON.parse(readFileSync(join(userData, "ai-preference.json"), "utf8")) as Record<string, unknown>;
    if (value.schema !== AI_PREFERENCE_SCHEMA) return { mode: "off", configured: false };
    return { mode: zAiMode.parse(value.mode), configured: true };
  } catch { return { mode: "off", configured: false }; }
}

export function writeAiPreference(userData: string, mode: AiMode): void {
  mkdirSync(userData, { recursive: true });
  const target = join(userData, "ai-preference.json");
  const temporary = `${target}.partial`;
  writeFileSync(temporary, `${JSON.stringify({ schema: AI_PREFERENCE_SCHEMA, mode: zAiMode.parse(mode) }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, target);
}
