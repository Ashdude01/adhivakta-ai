'use client';

import { useState } from 'react';
import Link from 'next/link';
import IconButton from '@/components/IconButton';
import { IconEye, IconPen, IconDownload, IconFilePdf, IconRename, IconTrash, IconPlus } from '@/components/Icons';

export interface MatterDraft {
  id: string;
  title: string | null;
  doc_type: string | null;
  status: string;
  language: string | null;
  created_at: string;
}

/** Drafts filed under the matter: read, rename, export or discard. */
export default function DraftsPanel({ matterId, initial }: { matterId: string; initial: MatterDraft[] }) {
  const [drafts, setDrafts] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function preview(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/drafts/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBody(data.draft.body || '(empty draft)');
      setOpenId(id);
    } catch (err) {
      setError((err as Error).message);
    } finally { setLoading(false); }
  }

  async function rename(draft: MatterDraft) {
    const title = window.prompt('Rename this draft', draft.title ?? '');
    if (!title?.trim()) return;
    const res = await fetch(`/api/drafts/${draft.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (res.ok) setDrafts((d) => d.map((x) => (x.id === draft.id ? { ...x, title: title.trim() } : x)));
    else setError((await res.json()).error);
  }

  async function remove(draft: MatterDraft) {
    if (!window.confirm(`Delete "${draft.title}"? Every version of it goes too.`)) return;
    const res = await fetch(`/api/drafts/${draft.id}`, { method: 'DELETE' });
    if (res.ok) setDrafts((d) => d.filter((x) => x.id !== draft.id));
    else setError((await res.json()).error);
  }

  async function exportFile(draft: MatterDraft, format: 'docx' | 'pdf') {
    setError('');
    const payload = { draftId: draft.id, format };
    let res = await fetch('/api/drafts/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (res.status === 409) {
      const info = await res.json();
      if (!window.confirm(`${info.message}\n\nExport anyway? Your override will be recorded in the audit log.`)) return;
      res = await fetch('/api/drafts/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, override: true }),
      });
    }
    if (!res.ok) { setError('Export failed'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = `${(draft.title ?? 'draft').replace(/[^\w\d\- ]+/g, '').slice(0, 50)}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setDrafts((d) => d.map((x) => (x.id === draft.id ? { ...x, status: 'exported' } : x)));
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="flexb" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontWeight: 700 }}>Drafts <span className="muted">({drafts.length})</span></span>
        <IconButton label="New draft" href={`/draft?matter=${matterId}`}><IconPlus /></IconButton>
      </div>

      {error && <div style={{ color: 'crimson', fontSize: 13, padding: '8px 16px' }}>{error}</div>}
      {drafts.length === 0 && <div className="muted" style={{ padding: 16, fontSize: 13.5 }}>No drafts yet for this matter.</div>}

      {drafts.map((d) => (
        <div key={d.id}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{d.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {d.doc_type} · {d.language} · {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <div className="gap8" style={{ display: 'flex', alignItems: 'center' }}>
              <span className={`tag ${d.status === 'exported' ? 't-success' : 't-grey'}`}>{d.status}</span>
              <div className="icon-actions">
                <IconButton label={openId === d.id ? 'Hide preview' : 'Preview'} onClick={() => preview(d.id)} disabled={loading}><IconEye /></IconButton>
                <IconButton label="Open in editor" href={`/draft?matter=${matterId}&draft=${d.id}`}><IconPen /></IconButton>
                <IconButton label="Export Word (.docx)" onClick={() => exportFile(d, 'docx')}><IconDownload /></IconButton>
                <IconButton label="Export PDF" onClick={() => exportFile(d, 'pdf')}><IconFilePdf /></IconButton>
                <IconButton label="Rename" onClick={() => rename(d)}><IconRename /></IconButton>
                <IconButton label="Delete draft" danger onClick={() => remove(d)}><IconTrash /></IconButton>
              </div>
            </div>
          </div>
          {openId === d.id && (
            <pre className="scroll" style={{
              margin: 0, padding: '12px 16px', maxHeight: 260, overflowY: 'auto',
              whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5,
              borderTop: '1px solid var(--line)', background: 'var(--brand-soft)',
            }}>{body}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
