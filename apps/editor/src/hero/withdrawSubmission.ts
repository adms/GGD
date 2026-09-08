import { zHeroControl, type HeroReviewView } from "@ggd/shared/content/communityHero";
import { heroPlatform, useHeroAccount } from "./communitySession";

export function canWithdrawHero(review: HeroReviewView, accountId?: string): boolean {
  return !!accountId && review.snapshot.accountId === accountId && review.status === "pending" && review.publication.pendingSubmission === review.snapshot.id && !review.publication.reviews[review.snapshot.id];
}

export async function withdrawHeroSubmission(review: HeroReviewView, accountId: string): Promise<HeroReviewView> {
  if (useHeroAccount.getState().account?.id !== accountId || !canWithdrawHero(review, accountId)) throw new Error("只有作者可以撤回目前尚未審查的候選，請先更新投稿結果。");
  const control = zHeroControl.parse(await heroPlatform.request(`/hero-submissions/${encodeURIComponent(review.snapshot.id)}/withdraw`, { body: { expectedRevision: review.publication.revision } }));
  if (useHeroAccount.getState().account?.id !== accountId) throw new Error("登入帳號已切換；請登入原帳號查詢撤回結果。");
  if (control.workId !== review.snapshot.workId || !Object.values(control.operations).some((operation) => operation.action === "withdraw" && operation.status === "withdrawn" && operation.submissionId === review.snapshot.id && operation.requestedBy === accountId && operation.expectedRevision === review.publication.revision) || control.pendingSubmission === review.snapshot.id || control.reviews[review.snapshot.id]) throw new Error("撤回回應無法驗證，請重新查詢投稿結果。");
  return { snapshot: review.snapshot, publication: control, status: "withdrawn" };
}
