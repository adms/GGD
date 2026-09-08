import { createContext, useContext } from "react";
import type { RawInputs } from "../store";

export const RawInputContext = createContext<{
  values: RawInputs;
  set(path: string, text: string, kind: "json" | "number"): void;
} | null>(null);
export const useRawInputs = () => useContext(RawInputContext);

export function rawInputErrors(values: RawInputs): Record<string, string[]> {
  return Object.fromEntries(Object.entries(values).flatMap(([path, value]) => {
    try {
      if (value.kind === "json") JSON.parse(value.text);
      else if (value.text.trim() && !Number.isFinite(Number(value.text))) throw new Error("請填入完整的數字");
      return [];
    } catch (error) { return [[path, [String(error)]]]; }
  }));
}
