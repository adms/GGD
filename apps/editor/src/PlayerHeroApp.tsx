import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DraftLibrary } from "./drafts/DraftLibrary";
import { initializeDraftSession, useDraftSession } from "./drafts/session";
import { useHeroStore } from "./hero/store";

const HeroPage = lazy(() => import("./hero/HeroPage").then((module) => ({ default: module.HeroPage })));

type PlayerMode = "hero" | "works";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function playerModeFromPathname(pathname: string): PlayerMode {
  return pathname.replace(/\/$/, "").endsWith("/works") ? "works" : "hero";
}

export function pathnameForPlayerMode(mode: PlayerMode, baseUrl = "/editor/"): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return mode === "works" ? `${base}works` : `${base}hero-forge`;
}

/** Public player surface. The Vite player build selects this entry instead of the content-authoring App. */
export function App() {
  const [mode, setMode] = useState<PlayerMode>(() => playerModeFromPathname(window.location.pathname));
  const ready = useDraftSession((state) => state.ready);

  useEffect(() => { void initializeDraftSession(); }, []);
  useEffect(() => {
    const syncLocation = () => {
      const nextMode = playerModeFromPathname(window.location.pathname);
      const canonicalPath = pathnameForPlayerMode(nextMode, import.meta.env.BASE_URL);
      if (window.location.pathname !== canonicalPath) window.history.replaceState(null, "", canonicalPath);
      setMode(nextMode);
    };
    syncLocation();
    const onPopState = () => syncLocation();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (nextMode: PlayerMode) => {
    const pathname = pathnameForPlayerMode(nextMode, import.meta.env.BASE_URL);
    if (pathname !== window.location.pathname) window.history.pushState(null, "", pathname);
    setMode(nextMode);
  };

  if (!ready) return <main className="editor-empty">正在恢復本機英雄作品…</main>;

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app player-hero-app" data-ggd-app="player-hero-forge">
        <nav className="sidebar player-hero-nav" aria-label="玩家英雄創作">
          <h1>GGD 英雄鑄造器</h1>
          <p>建立英雄、保存版本並提交後台審查。</p>
          <button type="button" className={mode === "hero" ? "active" : ""} onClick={() => navigate("hero")}>創作英雄</button>
          <button type="button" className={mode === "works" ? "active" : ""} onClick={() => navigate("works")}>我的作品</button>
        </nav>
        {mode === "hero" ? (
          <Suspense fallback={<main className="editor-empty">載入英雄鑄造器…</main>}><HeroPage /></Suspense>
        ) : (
          <DraftLibrary
            heroOnly
            onOpenDocument={() => undefined}
            onOpenHero={(draft) => { useHeroStore.getState().open(draft); navigate("hero"); }}
          />
        )}
      </div>
    </QueryClientProvider>
  );
}
