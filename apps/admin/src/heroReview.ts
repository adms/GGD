import { z } from "zod";
import { zHeroControl, zHeroListRow, zHeroReviewView } from "@ggd/shared/content/communityHero";
import { api } from "./api";

export const heroReviewApi = {
  async queue(query = "", status = "", offset = 0) {
    const params = new URLSearchParams({ q: query, status, offset: String(offset) });
    return z.object({ items: z.array(zHeroListRow), total: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative() }).parse(await api.request(`/admin/hero-submissions?${params}`));
  },
  async read(id: string) { return zHeroReviewView.parse(await api.request(`/admin/hero-submissions/${encodeURIComponent(id)}`)); },
  async package(id: string) { return api.binaryResponse(`/admin/hero-submissions/${encodeURIComponent(id)}/package`); },
  async decide(id: string, body: { expectedRevision: number; status: "returned" | "rejected"; reason: string; problems: { slot?: string; field?: string; message: string }[] }) {
    return api.request(`/admin/hero-submissions/${encodeURIComponent(id)}/decide`, { body });
  },
  async publish(id: string, body: HeroPublishRequest) {
    return zHeroControl.parse(await api.request(`/admin/hero-submissions/${encodeURIComponent(id)}/publish`, { body }));
  },
  async unpublish(workId: string, body: { operationId: string; reason: string; expectedRevision: number }) {
    return zHeroControl.parse(await api.request(`/admin/hero-works/${encodeURIComponent(workId)}/unpublish`, { body }));
  },
};
export interface HeroPublishRequest { operationId: string; action: "publish" | "restore"; reason: string; expectedRevision: number }
