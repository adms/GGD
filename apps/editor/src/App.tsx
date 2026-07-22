import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CollectionName } from "@ggd/shared/content";
import { Sidebar, DocList } from "./views/Sidebar";
import { EditorView } from "./views/EditorView";
import { useEditorStore } from "./store";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  const [collection, setCollection] = useState<CollectionName | null>("champions");
  const clearSelection = useEditorStore((s) => s.clearSelection);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <Sidebar
          active={collection}
          onPick={(c) => {
            setCollection(c);
            clearSelection();
          }}
        />
        {collection ? <DocList collection={collection} /> : null}
        <EditorView />
      </div>
    </QueryClientProvider>
  );
}
