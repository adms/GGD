import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar, DocList } from "./views/Sidebar";
import { EditorView } from "./views/EditorView";
import { ForgePage } from "./forge/ForgePage";
import { useEditorStore } from "./store";
import { appModeFromPathname, pathnameForAppMode, type AppMode } from "./appRoute";

const VfxForgePage = lazy(() =>
  import("./vfx-forge/VfxForgePage").then((m) => ({ default: m.VfxForgePage })),
);
const ExportCenterPage = lazy(() =>
  import("./export-center/ExportCenterPage").then((m) => ({ default: m.ExportCenterPage })),
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  const [mode, setMode] = useState<AppMode>(() => appModeFromPathname(window.location.pathname));
  const clearSelection = useEditorStore((s) => s.clearSelection);

  useEffect(() => {
    const onPopState = () => {
      setMode(appModeFromPathname(window.location.pathname));
      clearSelection();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [clearSelection]);

  const navigate = (nextMode: AppMode) => {
    const pathname = pathnameForAppMode(nextMode, import.meta.env.BASE_URL);
    if (pathname !== window.location.pathname) window.history.pushState(null, "", pathname);
    setMode(nextMode);
    clearSelection();
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <Sidebar
          active={mode.kind === "collection" ? mode.collection : null}
          forgeActive={mode.kind === "forge"}
          vfxForgeActive={mode.kind === "vfx-forge"}
          exportActive={mode.kind === "export"}
          onPick={(c) => {
            navigate({ kind: "collection", collection: c });
          }}
          onPickForge={() => {
            navigate({ kind: "forge" });
          }}
          onPickVfxForge={() => {
            navigate({ kind: "vfx-forge" });
          }}
          onPickExport={() => {
            navigate({ kind: "export" });
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
            {mode.collection ? <DocList key={mode.collection} collection={mode.collection} /> : null}
            <EditorView />
          </>
        )}
      </div>
    </QueryClientProvider>
  );
}
