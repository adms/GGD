import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CollectionName } from "@ggd/shared/content";
import { Sidebar, DocList } from "./views/Sidebar";
import { EditorView } from "./views/EditorView";
import { ForgePage } from "./forge/ForgePage";
import { useEditorStore } from "./store";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** The editor has two top-level modes: per-doc CRUD, and the 鑄技工坊 flow. */
type Mode = { kind: "collection"; collection: CollectionName | null } | { kind: "forge" };

export function App() {
  const [mode, setMode] = useState<Mode>({ kind: "collection", collection: "champions" });
  const clearSelection = useEditorStore((s) => s.clearSelection);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <Sidebar
          active={mode.kind === "collection" ? mode.collection : null}
          forgeActive={mode.kind === "forge"}
          onPick={(c) => {
            setMode({ kind: "collection", collection: c });
            clearSelection();
          }}
          onPickForge={() => {
            setMode({ kind: "forge" });
            clearSelection();
          }}
        />
        {mode.kind === "forge" ? (
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
