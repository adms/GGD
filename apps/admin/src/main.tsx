import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
const HeroReviewPreview = lazy(() => import("./ui/HeroReviewPreview").then((module) => ({ default: module.HeroReviewPreview })));
const heroReviewId = new URLSearchParams(window.location.search).get("heroReview");

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {heroReviewId ? <Suspense fallback={<p>正在載入審查預覽…</p>}><HeroReviewPreview submissionId={heroReviewId} /></Suspense> : <App />}
    </StrictMode>,
  );
}
