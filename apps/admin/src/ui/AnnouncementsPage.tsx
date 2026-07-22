/** Announcements — list + create/edit/delete with an active toggle and a live
 * preview of what players will see in the public feed. */
import { useEffect, useState } from "react";
import * as apiFns from "../api";
import { ApiError } from "../session";
import { draftFrom, emptyDraft, toggleActive, validateDraft, type AnnouncementDraft } from "../announce";
import type { Announcement } from "../types";
import { Badge, Btn, ConfirmDialog, ErrorBanner, Panel, TextArea, TextInput } from "./widgets";
import { DANGER, OK, TEXT_DIM, TEXT_MAIN } from "./theme";

export function AnnouncementsPage(): React.JSX.Element {
  const [items, setItems] = useState<Announcement[]>([]);
  const [draft, setDraft] = useState<AnnouncementDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Announcement | null>(null);

  async function load(): Promise<void> {
    setError(null);
    try {
      setItems((await apiFns.listAnnouncements()).announcements);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const validation = validateDraft(draft);

  async function save(): Promise<void> {
    if (!validation.ok) return;
    try {
      if (draft.id) await apiFns.updateAnnouncement(draft.id, draft.title, draft.body, draft.active);
      else await apiFns.createAnnouncement(draft.title, draft.body, draft.active);
      setDraft(emptyDraft);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "save failed");
    }
  }

  async function remove(a: Announcement): Promise<void> {
    try {
      await apiFns.deleteAnnouncement(a.id);
      setConfirmDel(null);
      if (draft.id === a.id) setDraft(emptyDraft);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "delete failed");
      setConfirmDel(null);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
      <Panel title={`Announcements · ${items.length}`}>
        <ErrorBanner text={error} onDismiss={() => setError(null)} />
        {items.length === 0 && <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 10 }}>No announcements yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: error ? 10 : 0 }}>
          {items.map((a) => (
            <div key={a.id} style={{ border: "1px solid #232c40", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 700, color: TEXT_MAIN }}>{a.title}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {a.active ? <Badge color={OK}>active</Badge> : <Badge color={TEXT_DIM}>draft</Badge>}
                  <Btn small onClick={() => setDraft(draftFrom(a))}>
                    Edit
                  </Btn>
                  <Btn small kind="danger" onClick={() => setConfirmDel(a)}>
                    Delete
                  </Btn>
                </div>
              </div>
              <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6, whiteSpace: "pre-wrap" }}>{a.body}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={draft.id ? "Edit announcement" : "New announcement"}>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>Title</div>
        <TextInput value={draft.title} onChange={(title) => setDraft({ ...draft, title })} placeholder="e.g. Season 2 launches Friday" />
        {validation.errors.title && <div style={{ color: DANGER, fontSize: 11, marginTop: 3 }}>{validation.errors.title}</div>}

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 4px" }}>Body</div>
        <TextArea value={draft.body} onChange={(body) => setDraft({ ...draft, body })} rows={5} placeholder="Message shown to players…" />
        {validation.errors.body && <div style={{ color: DANGER, fontSize: 11, marginTop: 3 }}>{validation.errors.body}</div>}

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: TEXT_MAIN, margin: "12px 0" }}>
          <input type="checkbox" checked={draft.active} onChange={() => setDraft(toggleActive(draft))} />
          Active (shown to players)
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="primary" disabled={!validation.ok} onClick={() => void save()}>
            {draft.id ? "Save changes" : "Publish"}
          </Btn>
          {draft.id && <Btn onClick={() => setDraft(emptyDraft)}>Cancel</Btn>}
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "16px 0 6px" }}>Live preview (player feed)</div>
        <div style={{ border: "1px solid #232c40", borderRadius: 8, padding: 12, opacity: draft.active ? 1 : 0.5 }}>
          <div style={{ fontWeight: 700, color: TEXT_MAIN }}>{draft.title || "Untitled"}</div>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, whiteSpace: "pre-wrap" }}>{draft.body || "…"}</div>
          {!draft.active && <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 6 }}>(inactive — hidden from players)</div>}
        </div>
      </Panel>

      {confirmDel && (
        <ConfirmDialog
          title={`Delete "${confirmDel.title}"?`}
          body="This removes the announcement permanently."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => void remove(confirmDel)}
        />
      )}
    </div>
  );
}
