import { create } from "zustand";
import { ORIGINS, type HeroProject, type Origin } from "@ggd/shared/content";
import { migrateHeroProject } from "@ggd/shared/content/heroForge/migration";
import { enqueueDraft } from "../drafts/session";
import type { LocalDraft } from "../drafts/repository";
import type { RawInputs } from "../store";
import { createHeroProject } from "./projectModel";

export interface HeroDraftPayload {
  project: HeroProject;
  rawInputs: RawInputs;
  mode: "quick" | "visual" | "advanced";
  /** A choice made before the first valid six-slot plan is still draft data. */
  origin: Origin;
  originalIconRefs?: Record<string, string>;
  cloud?: { accountId: string; revision: number; localFingerprint?: string };
  source?: { workId: string; submissionId: string; packageDigest: string; authorId: string };
  submission?: { operationId: string; packageDigest: string; allowAttributionRemix: boolean; id?: string };
}
interface HeroState {
  key: string | null;
  value: HeroDraftPayload | null;
  restored: boolean;
  past: HeroDraftPayload[];
  future: HeroDraftPayload[];
  start(): void;
  open(draft: LocalDraft): void;
  commit(value: HeroDraftPayload): void;
  undo(): void;
  redo(): void;
}

function persist(key: string, value: HeroDraftPayload): void { enqueueDraft(key, "hero", value); }
export const useHeroStore = create<HeroState>((set, get) => ({
  key: null, value: null, restored: false, past: [], future: [],
  start() {
    const project = createHeroProject(`hero-${crypto.randomUUID()}`);
    const value: HeroDraftPayload = { project, rawInputs: {}, mode: "quick", origin: "鬥士" };
    const key = `hero/${project.projectId}`;
    set({ key, value, restored: false, past: [], future: [] }); persist(key, value);
  },
  open(draft) {
    const payload = draft.payload as HeroDraftPayload;
    if (draft.kind !== "hero" || !payload?.project || !payload.project.sections || !payload.project.brief || typeof payload.project.projectId !== "string") {
      throw new Error("這份英雄草稿結構不完整，請從我的作品匯出原始資料或恢復備份。");
    }
    // Draft text can be incomplete; schema migration concerns structural versions.
    const project = payload.project.schema === "ggd-hero-project@2" ? payload.project : migrateHeroProject(payload.project).project;
    set({ key: draft.key, value: { project, rawInputs: payload.rawInputs ?? {}, mode: ["quick", "visual", "advanced"].includes(payload.mode) ? payload.mode : "quick", origin: ORIGINS.includes(payload.origin) ? payload.origin : project.acceptedPlan?.origin ?? "鬥士", originalIconRefs: payload.originalIconRefs ?? {}, ...(payload.cloud ? { cloud: payload.cloud } : {}), ...(payload.source ? { source: payload.source } : {}), ...(payload.submission ? { submission: payload.submission } : {}) }, restored: true, past: [], future: [] });
  },
  commit(value) {
    const current = get(); if (!current.key || !current.value) return;
    set({ value, past: [...current.past, current.value].slice(-100), future: [] }); persist(current.key, value);
  },
  undo() {
    const current = get(); const snapshot = current.past.at(-1); if (!snapshot || !current.value || !current.key) return;
    const value = { ...snapshot, project: { ...snapshot.project, revision: current.value.project.revision + 1 } };
    set({ value, past: current.past.slice(0, -1), future: [current.value, ...current.future].slice(0, 100) }); persist(current.key, value);
  },
  redo() {
    const current = get(); const snapshot = current.future[0]; if (!snapshot || !current.value || !current.key) return;
    const value = { ...snapshot, project: { ...snapshot.project, revision: current.value.project.revision + 1 } };
    set({ value, past: [...current.past, current.value].slice(-100), future: current.future.slice(1) }); persist(current.key, value);
  },
}));
