import { createElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { mount } from "@ggd/shared/testkit/headlessUi";
import { zHeroControl, type HeroReviewView } from "@ggd/shared/content/communityHero";
import { ApiError } from "../../../admin/src/session";
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
vi.mock("./communitySession", async (original) => {
  const actual = await original<typeof import("./communitySession")>();
  return { ...actual, useHeroAccount: Object.assign(() => actual.useHeroAccount.getState(), actual.useHeroAccount) };
});
import { heroPlatform, useHeroAccount } from "./communitySession";
import { HeroWithdrawAction } from "./HeroWithdrawAction";
import { canWithdrawHero, withdrawHeroSubmission } from "./withdrawSubmission";

const digest = `sha256:${"0".repeat(64)}`;
const now = "2026-09-06T00:00:00Z";
function fixture() {
  // The action reads only snapshot identity; full package inspection has its own boundary tests.
  const publication = zHeroControl.parse({ schema: "ggd-hero-publication@1", workId: "hero-one", revision: 7, publicationEpoch: 0, pendingSubmission: "submission-one", pendingSubmittedAt: now, submissions: ["submission-one"], published: null, reviews: {}, operations: {}, history: [] });
  const review = { snapshot: { id: "submission-one", workId: "hero-one", accountId: "alice" }, publication, status: "pending" } as HeroReviewView;
  const control = { ...publication, revision: 8, pendingSubmission: "", operations: { withdrawal: { id: "withdrawal", action: "withdraw", status: "withdrawn", submissionId: "submission-one", inputDigest: digest, expectedPublished: digest, expectedRevision: 7, guardRevision: 0, decisionId: "", reason: "作者撤回待審", requestedBy: "alice", completedAt: now } } };
  return { review, control };
}
beforeEach(() => { vi.restoreAllMocks(); useHeroAccount.setState({ account: { id: "alice", username: "author" }, ready: true }); });

it("submits the displayed revision and validates the author operation without inventing an admin decision", async () => {
  const { review, control } = fixture(); const request = vi.spyOn(heroPlatform, "request").mockResolvedValue(control);
  const changed = vi.fn(); const view = mount(createElement(HeroWithdrawAction, { review, onChange: changed }));
  expect(view.text()).toContain("先前發布版都會保留");
  view.click("撤回這份待審稿"); expect(() => view.click("撤回這份待審稿")).toThrow("disabled"); await view.flush();
  expect(request).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledWith("/hero-submissions/submission-one/withdraw", { body: { expectedRevision: 7 } });
  expect(changed).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalledWith({ snapshot: review.snapshot, publication: control, status: "withdrawn" });
  expect(changed.mock.calls[0]![0].decision).toBeUndefined();
});

it.each(["published", "returned", "rejected", "publishing", "withdrawn", "superseded"] as const)("never offers withdrawal for a %s candidate", (status) => {
  const { review } = fixture(); review.status = status;
  const view = mount(createElement(HeroWithdrawAction, { review, onChange: vi.fn() }));
  expect(view.hosts().some((node) => node.type === "button")).toBe(false);
});

it("rejects another account and rejects a forged control receipt", async () => {
  const { review, control } = fixture(); const request = vi.spyOn(heroPlatform, "request").mockResolvedValue({ ...control, workId: "different" });
  expect(canWithdrawHero(review, "bob")).toBe(false);
  await expect(withdrawHeroSubmission(review, "bob")).rejects.toThrow("只有作者"); expect(request).not.toHaveBeenCalled();
  await expect(withdrawHeroSubmission(review, "alice")).rejects.toThrow("無法驗證");
});

it("does not retry against an unseen revision after a conflict, even when refresh fails", async () => {
  const { review } = fixture(); const changed = vi.fn();
  const request = vi.spyOn(heroPlatform, "request").mockRejectedValueOnce(new ApiError(409, "hero_conflict", "review already changed")).mockRejectedValueOnce(new Error("offline"));
  const view = mount(createElement(HeroWithdrawAction, { review, onChange: changed })); view.click("撤回這份待審稿"); await view.flush();
  expect(request.mock.calls).toEqual([["/hero-submissions/submission-one/withdraw", { body: { expectedRevision: 7 } }], ["/hero-submissions/submission-one"]]);
  expect(view.text()).toContain("review already changed"); expect(changed).not.toHaveBeenCalled();
});

it("does not apply an old account's withdrawal result after switching accounts", async () => {
  const { review, control } = fixture(); let finish!: (value: unknown) => void;
  vi.spyOn(heroPlatform, "request").mockImplementation(() => new Promise((resolve) => { finish = resolve; }) as never);
  const changed = vi.fn(); const view = mount(createElement(HeroWithdrawAction, { review, onChange: changed })); view.click("撤回這份待審稿");
  useHeroAccount.setState({ account: { id: "bob", username: "other" } }); finish(control); await view.flush();
  expect(changed).not.toHaveBeenCalled();
});
