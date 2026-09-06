import type { CommunityTarget } from "@ggd/shared/content/communityRoom";
declare const __GGD_COMMUNITY_RUNTIME__: Omit<CommunityTarget, "contentVersion"> | null;

export function clientCommunityIdentity(): Omit<CommunityTarget, "contentVersion"> | null {
  return typeof __GGD_COMMUNITY_RUNTIME__ === "undefined" ? null : __GGD_COMMUNITY_RUNTIME__;
}
