'use client';

import { useRef, useState } from 'react';
import IconButton from '@/components/IconButton';
import { IconExternal, IconTrash } from '@/components/Icons';

export interface MatterDocument {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  kind: string;
  description: string | null;
  uploaded_at: string;
}

const KINDS: Array<[string, string]> = [
  ['evidence', 'Evidence'],
  ['vakalatnama', 'Vakalatnama'],
  ['court_order', 'Court order'],
  ['correspondence', 'Correspondence'],
  ['id_proof', 'ID proof'],
  ['agreement', 'Agreement'],
  ['invoice', 'Invoice'],
  ['other', 'Other'],
];

/**
 * Supporting documents on a matter. Files sit in a private bucket; opening one
 * asks the server for a short-lived signed URL rather than holding a link.
 */
export default function DocumentsPanel({ matterId, initial }: { matterId: string; initial: MatterDocument[] }) {
  const [documents, setDocuments] = useState(initial);
  const [kind, setKind] = useState('evidence');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        body.append('kind', kind);
        if (description) body.append('description', description);

        const res = await fetch(`/api/matters/${matterId}/documents`, { method: 'POST', body });
        const data = await res.json();
        if (!res.ok) throw new Error(`${file.name}: ${data.error}`);
        setDocuments((d) => [data.document, ...d]);
      }
      setDescription('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  async function open(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/documents/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(doc: MatterDocument) {
    if (!window.confirm(`Delete "${doc.file_name}"? The file is removed from storage and cannot be recovered.`)) return;
    setError('');
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      setDocuments((d) => d.filter((x) => x.id !== doc.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700 }}>
        Supporting documents <span className="muted">({documents.length})</span>
      </div>

      <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
        <div className="split" style={{ gap: 12 }}>
          <div className="field"><label>Document kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field"><label>Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dishonour memo dated 28.05.2026" />
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragging ? 'var(--brand)' : 'var(--line)'}`,
            borderRadius: 10, padding: 20, textAlign: 'center', cursor: 'pointer',
            background: dragging ? 'var(--brand-soft)' : 'transparent',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{busy ? 'Uploading…' : 'Drop files here, or click to choose'}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            PDF, images, Word, Excel or text · up to 25 MB each · stored privately
          </div>
        </div>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt" />

        {error && <div style={{ color: 'crimson', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </div>

      {documents.length === 0 && <div className="muted" style={{ padding: 16, fontSize: 13.5 }}>Nothing uploaded yet.</div>}

      {documents.map((d) => (
        <div className="row" key={d.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {KINDS.find(([v]) => v === d.kind)?.[1] ?? d.kind}
              {d.size_bytes != null && ` · ${prettyBytes(d.size_bytes)}`}
              {' · '}{new Date(d.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {d.description && ` · ${d.description}`}
            </div>
          </div>
          <div className="icon-actions">
            <IconButton label="Open document" onClick={() => open(d.id)}><IconExternal /></IconButton>
            <IconButton label="Delete document" danger onClick={() => remove(d)}><IconTrash /></IconButton>
          </div>
        </div>
      ))}
    </div>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
