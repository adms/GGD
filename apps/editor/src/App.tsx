import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "./views/Sidebar";
import { useEditorStore } from "./store";
import { appModeFromPathname, pathnameForAppMode, PLAYER_ONLY, type AppMode } from "./appRoute";
import { DraftLibrary } from "./drafts/DraftLibrary";
import { documentPayload, initializeDraftSession, restoreDocumentDraft, useDraftSession } from "./drafts/session";
import { useHeroStore } from "./hero/store";
import { AiFirstLaunch } from "./hero/AiFirstLaunch";
import type { CollectionName } from "@ggd/shared/content";

const HeroPage = lazy(() => import("./hero/HeroPage").then((module) => ({ default: module.HeroPage })));

// ⭐⭐ GH#1270 —— 內部流程的頁面在**玩家版裡連位元組都沒有**。
// `PLAYER_ONLY` 是**編譯期**常數（vite `define`）⇒ 這三行在 `--mode player` 下摺成 `null`，
// 而那幾個 `import()` 變成**到不了的程式碼** ⇒ rollup ⛔ 不會產出那些 chunk。
// ⚠️ 判準是「玩家拿得到的位元組裡有沒有它」，⛔ 不是「按鈕有沒有藏起來」。
const VfxForgePage = PLAYER_ONLY ? null : lazy(() =>
  import("./vfx-forge/VfxForgePage").then((m) => ({ default: m.VfxForgePage })),
);
const ExportCenterPage = PLAYER_ONLY ? null : lazy(() =>
  import("./export-center/ExportCenterPage").then((m) => ({ default: m.ExportCenterPage })),
);
const ForgePage = PLAYER_ONLY ? null : lazy(() =>
  import("./forge/ForgePage").then((m) => ({ default: m.ForgePage })),
);
/** 集合瀏覽器（內容編輯器的本體）—— 同上：玩家版裡不存在。 */
const CollectionBrowser = PLAYER_ONLY ? null : lazy(() =>
  import("./views/CollectionBrowser").then((m) => ({ default: m.CollectionBrowser })),
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  const [mode, setMode] = useState<AppMode>(() => appModeFromPathname(window.location.pathname));
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const ready = useDraftSession((s) => s.ready);

  useEffect(() => { void initializeDraftSession(); }, []);
  useEffect(() => {
    if (!ready || mode.kind !== "collection" || useEditorStore.getState().docId) return;
    const latest = useDraftSession.getState().drafts.find((draft) => documentPayload(draft)?.collection === mode.collection);
    if (latest) restoreDocumentDraft(latest);
  }, [ready, mode]);

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

  if (!ready) return <main className="editor-empty">正在恢復本機草稿…</main>;

  return (
    <QueryClientProvider client={queryClient}>
      <AiFirstLaunch />
      <div className="app">
        {/* ⭐ GH#1270：玩家版**不傳**內部流程的 handler ⇒ Sidebar 那幾顆按鈕連渲染都不渲染
            （它本來就是「沒有 handler 就不畫」的形狀）。⛔ 不是用 CSS 藏起來。 */}
        <Sidebar
          active={mode.kind === "collection" ? mode.collection : null}
          worksActive={mode.kind === "works"}
          onPickWorks={() => navigate({ kind: "works" })}
          heroActive={mode.kind === "hero"}
          onPickHero={() => navigate({ kind: "hero" })}
          {...(PLAYER_ONLY
            ? {}
            : {
                forgeActive: mode.kind === "forge",
                vfxForgeActive: mode.kind === "vfx-forge",
                exportActive: mode.kind === "export",
                onPick: (c: CollectionName) => {
                  navigate({ kind: "collection", collection: c });
                },
                onPickForge: () => {
                  navigate({ kind: "forge" });
                },
                onPickVfxForge: () => {
                  navigate({ kind: "vfx-forge" });
                },
                onPickExport: () => {
                  navigate({ kind: "export" });
                },
              })}
        />
        {mode.kind === "hero" ? (
          <Suspense fallback={<main className="editor-empty">載入英雄工坊…</main>}><HeroPage /></Suspense>
        ) : mode.kind === "works" ? (
          <DraftLibrary onOpenDocument={(collection) => navigate({ kind: "collection", collection })} onOpenHero={(draft) => { useHeroStore.getState().open(draft); navigate({ kind: "hero" }); }} />
        ) : mode.kind === "export" && ExportCenterPage ? (
          <Suspense fallback={<main className="editor-empty">載入匯出中心…</main>}>
            <ExportCenterPage />
          </Suspense>
        ) : mode.kind === "vfx-forge" && VfxForgePage ? (
          <Suspense fallback={<main className="editor-empty">載入特效工坊…</main>}>
            <VfxForgePage />
          </Suspense>
        ) : mode.kind === "forge" && ForgePage ? (
          <Suspense fallback={<main className="editor-empty">載入鑄技工坊…</main>}>
            <ForgePage />
          </Suspense>
        ) : CollectionBrowser ? (
          <Suspense fallback={<main className="editor-empty">載入內容編輯器…</main>}>
            <CollectionBrowser collection={mode.kind === "collection" ? mode.collection : null} />
          </Suspense>
        ) : (
          // 玩家版走不到這裡（路由只認 hero／works），留一個誠實的空畫面而不是白頁。
          <main className="editor-empty">這一頁不在玩家版裡。</main>
        )}
      </div>
    </QueryClientProvider>
  );
}
