/**
 * React context that lets deep form widgets (TextField) reach the AI 填空
 * feature without threading a callback through every FieldProps. The provider
 * reads the CURRENT draft from the store at call time and builds the
 * field-scoped prompt/context, so widgets only need the field's leaf key.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useEditorStore } from "../store";
import { aiFillText, type TextGenResult } from "./client";
import { buildTextPrompt } from "./prompt";

export interface AiFillContextValue {
  /** call POST /ai/text for `field`, built from the live draft; returns text. */
  fill(field: string): Promise<TextGenResult>;
}

const AiFillContext = createContext<AiFillContextValue | null>(null);

export function AiFillProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AiFillContextValue>(
    () => ({
      fill: (field) => aiFillText(buildTextPrompt(field, useEditorStore.getState().draft)),
    }),
    [],
  );
  return <AiFillContext.Provider value={value}>{children}</AiFillContext.Provider>;
}

export function useAiFill(): AiFillContextValue | null {
  return useContext(AiFillContext);
}
