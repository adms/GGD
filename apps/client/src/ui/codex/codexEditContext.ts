/**
 * codexEditContext — the ONLY thing CodexDetail knows about editing, and
 * deliberately the smallest possible thing: a React context whose value is
 * null in every production build.
 *
 * WHY THIS FILE EXISTS. CodexDetail must keep working with no editor at all, so
 * it may not statically import the editor. But `<Row>` still has to be able to
 * render an input when a session IS open. The resolution is that the context
 * value carries its own RENDERER (`renderField`): the detail view calls it, and
 * never learns what a field editor is made of. Everything heavy — the draft
 * state, the diff, the save/undo bar, the network module — lives in
 * CodexEditPanel.tsx, which is reached exclusively through the
 * `import.meta.env.DEV`-guarded dynamic import in CodexPage.
 *
 * So this module contributes a `createContext(null)` and a `useContext` to a
 * production bundle. Nothing else from the editor survives the build —
 * codexEditGate.test.ts's opt-in build test greps dist/ to prove it.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { FieldKind } from "./codexEditModel";

/** What an open edit session offers the read-only detail view. */
export interface DetailEdit {
  /** render the input for one doc path (the detail view supplies the label) */
  readonly renderField: (path: string, kind: FieldKind) => ReactNode;
  /** the document as it would be written right now — what 原始文件 shows */
  readonly draft: Readonly<Record<string, unknown>>;
  /** replace the whole draft from raw JSON (the un-normalised-field escape hatch) */
  readonly setWhole: (json: string) => void;
  readonly wholeError: string | null;
}

export const EditContext = createContext<DetailEdit | null>(null);

/** null ⇒ read-only, which is always the case in a production build. */
export function useDetailEdit(): DetailEdit | null {
  return useContext(EditContext);
}
