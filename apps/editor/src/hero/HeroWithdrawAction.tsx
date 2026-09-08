import { useEffect, useRef, useState } from "react";
import { zHeroReviewView, type HeroReviewView } from "@ggd/shared/content/communityHero";
import { ApiError } from "../../../admin/src/session";
import { heroPlatform, useHeroAccount } from "./communitySession";
import { canWithdrawHero, withdrawHeroSubmission } from "./withdrawSubmission";

export function HeroWithdrawAction({ review, disabled, onChange }: { review: HeroReviewView; disabled?: boolean; onChange(review: HeroReviewView): void }) {
  const { account } = useHeroAccount();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0); const inFlight = useRef(false);
  useEffect(() => { generation.current++; setMessage(null); return () => { generation.current++; }; }, [review.snapshot.id, account?.id]);
  const withdraw = async () => {
    if (!account || inFlight.current) return;
    const token = generation.current; const accountId = account.id;
    const current = () => token === generation.current && accountId === useHeroAccount.getState().account?.id;
    inFlight.current = true; setBusy(true); setMessage(null);
    try { const result = await withdrawHeroSubmission(review, accountId); if (current()) onChange(result); }
    catch (error) {
      if (current()) setMessage(String(error));
      if (current() && error instanceof ApiError && error.status === 409) {
        try {
          const latest = zHeroReviewView.parse(await heroPlatform.request(`/hero-submissions/${encodeURIComponent(review.snapshot.id)}`));
          if (current() && latest.snapshot.id === review.snapshot.id && latest.snapshot.accountId === accountId) onChange(latest);
        } catch { /* Preserve the original CAS error; never retry withdrawal against an unseen revision. */ }
      }
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <div>
    {canWithdrawHero(review, account?.id) ? <>
      <p>撤回會結束這份候選的待審狀態，原稿、投稿紀錄與先前發布版都會保留。修改草稿建立新修訂後，才能重新投稿。</p>
      <button type="button" disabled={disabled || busy} onClick={() => void withdraw()}>撤回這份待審稿</button>
    </> : review.status === "withdrawn" ? <p>這份候選已由作者撤回；可修改草稿建立新修訂，再提交審查。</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
