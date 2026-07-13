'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconSearch, IconFolder, IconDoc, IconEye, IconChevron } from '@/components/Icons';

interface MatterRow { id: string; title: string; code?: string | null; matter_type?: string | null; subtitle?: string | null }
interface DraftRow { id: string; title: string | null; doc_type: string | null; status: string; created_at: string }
interface DocRow { id: string; file_name: string; mime_type: string | null; kind: string }

/**
 * Finds a document to sign when the user lands on e-sign without one.
 *
 * Search a matter, open it, and pick from its drafts (which can be signed) or
 * its uploaded files (which can be previewed). This is the same "matter is the
 * base" idea as the rest of the app — you always sign something that lives in a
 * matter folder.
 */
export default function EsignDocumentPicker({ onPickDraft }: { onPickDraft: (draftId: string, matterId: string) => void }) {
  const [matters, setMatters] = useState<MatterRow[]>([]);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/matters').then((r) => r.json()).then((d) => setMatters(d.matters ?? [])).catch(() => {});
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return matters;
    return matters.filter((m) => [m.title, m.matter_type, m.subtitle, m.code].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [matters, query]);

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setLoading(true); setError(''); setDrafts([]); setDocs([]);
    try {
      const [dr, dc] = await Promise.all([
        fetch(`/api/matters/${id}/drafts`).then((r) => (r.ok ? r.json() : { drafts: [] })),
        fetch(`/api/matters/${id}/documents`).then((r) => (r.ok ? r.json() : { documents: [] })),
      ]);
      setDrafts(dr.drafts ?? []);
      setDocs(dc.documents ?? []);
    } catch {
      setError('Could not load this matter’s documents.');
    } finally { setLoading(false); }
  }

  async function previewUpload(docId: string) {
    try {
      const d = await (await fetch(`/api/documents/${docId}`)).json();
      if (d.url) window.open(d.url, '_blank', 'noopener');
    } catch { /* ignore */ }
  }

  return (
    <div style={{ padding: 16 }}>
      <div className="matter-search" style={{ border: '1px solid var(--line)', borderRadius: 10, marginBottom: 12 }}>
        <IconSearch width={15} height={15} style={{ color: 'var(--muted)', flex: 'none' }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a matter by name, type or court…" autoFocus />
      </div>

      {error && <div style={{ color: 'crimson', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {results.length === 0 && <div className="muted" style={{ fontSize: 13, padding: 8 }}>No matters match “{query}”.</div>}

      <div className="scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
        {results.map((m) => (
          <div key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
            <button type="button" className="row" onClick={() => toggle(m.id)}
              style={{ width: '100%', textAlign: 'left', border: 0, cursor: 'pointer', background: 'none' }}>
              {m.code && <span className="matter-code">{m.code}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                {(m.matter_type || m.subtitle) && <div className="muted" style={{ fontSize: 11.5 }}>{m.matter_type ?? m.subtitle}</div>}
              </div>
              <IconChevron width={14} height={14} style={{ color: 'var(--muted)', transform: openId === m.id ? 'rotate(90deg)' : 'none', transition: '.15s' }} />
            </button>

            {openId === m.id && (
              <div style={{ padding: '4px 8px 12px 8px' }}>
                {loading && <div className="muted" style={{ fontSize: 12.5, padding: 8 }}>Loading…</div>}

                {!loading && drafts.length === 0 && docs.length === 0 && (
                  <div className="muted" style={{ fontSize: 12.5, padding: 8 }}>No drafts or documents in this matter yet.</div>
                )}

                {drafts.length > 0 && <div className="muted" style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px' }}>DRAFTS — signable</div>}
                {drafts.map((d) => (
                  <div key={d.id} className="row" style={{ paddingLeft: 8 }}>
                    <IconDoc width={15} height={15} style={{ color: 'var(--brand)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{d.doc_type}</div>
                    </div>
                    <button className="chip" onClick={() => onPickDraft(d.id, m.id)}>Select</button>
                  </div>
                ))}

                {docs.length > 0 && <div className="muted" style={{ fontSize: 11, fontWeight: 700, padding: '8px 8px 4px' }}>UPLOADED FILES</div>}
                {docs.map((d) => (
                  <div key={d.id} className="row" style={{ paddingLeft: 8 }}>
                    <IconFolder width={15} height={15} style={{ color: 'var(--muted)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{d.kind}</div>
                    </div>
                    <button className="chip" onClick={() => previewUpload(d.id)} title="Open in a new tab"><IconEye width={13} height={13} /> Preview</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
