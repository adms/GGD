import { lazy, Suspense, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CollectionName } from "@ggd/shared/content";
import { Sidebar, DocList } from "./views/Sidebar";
import { EditorView } from "./views/EditorView";
import { ForgePage } from "./forge/ForgePage";
import { useEditorStore } from "./store";

const VfxForgePage = lazy(() =>
  import("./vfx-forge/VfxForgePage").then((m) => ({ default: m.VfxForgePage })),
);
const ExportCenterPage = lazy(() =>
  import("./export-center/ExportCenterPage").then((m) => ({ default: m.ExportCenterPage })),
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** Top-level authoring flows. VFX Forge proposes only vfx-scripts; Promote owns live writes. */
type Mode =
  | { kind: "collection"; collection: CollectionName | null }
  | { kind: "forge" }
  | { kind: "vfx-forge" }
  | { kind: "export" };

export function App() {
  const [mode, setMode] = useState<Mode>({ kind: "collection", collection: "champions" });
  const clearSelection = useEditorStore((s) => s.clearSelection);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <Sidebar
          active={mode.kind === "collection" ? mode.collection : null}
          forgeActive={mode.kind === "forge"}
          vfxForgeActive={mode.kind === "vfx-forge"}
          exportActive={mode.kind === "export"}
          onPick={(c) => {
            setMode({ kind: "collection", collection: c });
            clearSelection();
          }}
          onPickForge={() => {
            setMode({ kind: "forge" });
            clearSelection();
          }}
          onPickVfxForge={() => {
            setMode({ kind: "vfx-forge" });
            clearSelection();
          }}
          onPickExport={() => {
            setMode({ kind: "export" });
            clearSelection();
          }}
        />
        {mode.kind === "export" ? (
          <Suspense fallback={<main className="editor-empty">載入匯出中心…</main>}>
            <ExportCenterPage />
          </Suspense>
        ) : mode.kind === "vfx-forge" ? (
          <Suspense fallback={<main className="editor-empty">載入特效工坊…</main>}>
            <VfxForgePage />
          </Suspense>
        ) : mode.kind === "forge" ? (
          <ForgePage />
        ) : (
          <>
            {mode.collection ? <DocList collection={mode.collection} /> : null}
            <EditorView />
          </>
        )}
      </div>
    </QueryClientProvider>
  );
}
