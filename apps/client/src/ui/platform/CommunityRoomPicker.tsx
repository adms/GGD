import { useEffect, useState } from "react";
import { zHeroListRow, type HeroListRow } from "@ggd/shared/content/communityHero";
import { MAX_COMMUNITY_HEROES, type CommunityTarget } from "@ggd/shared/content/communityRoom";
import { getContentAssetVersion } from "../../content/assetVersion";
import { clientCommunityIdentity } from "../../content/communityIdentity";
import { api } from "./api";
import { Btn } from "./widgets";
import type { Room } from "./types";

export function communityCompatibility(target?: CommunityTarget): string | null {
  const identity = clientCommunityIdentity();
  if (!identity) return "此客戶端尚未支援社群英雄，請更新遊戲。";
  if (!target || target.gameRevision !== identity.gameRevision || target.processorFingerprint !== identity.processorFingerprint || target.migrationFingerprint !== identity.migrationFingerprint || target.contentVersion !== getContentAssetVersion()) return "此作品與目前遊戲版本不相容，需由作者更新並重新送審。";
  return null;
}

export function CommunityRoomPicker({ room, host, onChange }: { room: Room; host: boolean; onChange(settings: { allowCommunityHeroes?: boolean; communityWorkIds?: string[] }): Promise<void> }) {
  const [rows, setRows] = useState<HeroListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    void api.request("/hero-works/published", { auth: false }).then((raw) => {
      const next = zHeroListRow.array().max(1000).parse(raw);
      if (current) { setRows(next); setError(null); }
    }).catch((error: unknown) => { if (current) setError(String(error)); });
    return () => { current = false; };
  }, [room.id, refresh]);
  const selected = new Set(room.communityWorkIds ?? []);
  const save = async (settings: Parameters<typeof onChange>[0]) => { setBusy(true); try { await onChange(settings); } finally { setBusy(false); } };
  return <section aria-label="社群英雄" style={{ marginBlock: 10, padding: 10, border: "1px solid #52617b", borderRadius: 8, fontSize: 12 }}>
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={room.allowCommunityHeroes === true} disabled={!host || busy || room.status !== "open" || (!rows.length && !room.allowCommunityHeroes)} onChange={(event) => void save({ allowCommunityHeroes: event.target.checked })} />本房間允許社群英雄</label>
    <p>房主選用已發布作品；開局會固定版本，新版會用於下一場。社群對局不計入正式排行，也不發放貨幣或積分。</p>
    {error ? <p role="alert">{error}</p> : null}
    <Btn small kind="ghost" onClick={() => setRefresh((value) => value + 1)}>重新整理已發布作品</Btn>
    {!rows.length ? <p>目前沒有開放選用的社群英雄。</p> : null}
    {room.allowCommunityHeroes ? <div style={{ maxHeight: 220, overflowY: "auto" }}>
      {rows.map((hero) => {
        const incompatible = communityCompatibility(hero.target);
        return <label key={hero.workId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
          <input aria-label={`選用 ${hero.name}`} type="checkbox" checked={selected.has(hero.workId)} disabled={!host || busy || room.status !== "open" || (!selected.has(hero.workId) && (!!incompatible || selected.size >= MAX_COMMUNITY_HEROES))} onChange={(event) => void save({ communityWorkIds: event.target.checked ? [...selected, hero.workId] : [...selected].filter((id) => id !== hero.workId) })} />
          {hero.portraitPath ? <img alt={`${hero.name} 肖像`} width={40} height={40} src={`/api/v1/hero-works/${encodeURIComponent(hero.workId)}/portrait`} /> : <span aria-label="尚未選用肖像" style={{ width: 40, textAlign: "center" }}>◇</span>}
          <span><b>{hero.name}</b> · 社群作品<br />作者 {hero.authorName ?? hero.accountId} · 版本 {hero.packageDigest.slice(7, 15)}<br />{incompatible ?? "與目前遊戲相容"}</span>
        </label>;
      })}
      {[...selected].filter((id) => !rows.some((row) => row.workId === id)).map((id) => <p key={id} role="alert">選用的作品已下架或不再公開。{host ? <Btn small onClick={() => void save({ communityWorkIds: [...selected].filter((item) => item !== id) })}>移除此作品</Btn> : "請房主重新選用。"}</p>)}
    </div> : null}
  </section>;
}
