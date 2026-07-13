'use client';

import { useState } from 'react';
import IconButton from '@/components/IconButton';
import { IconList, IconX, IconSign } from '@/components/Icons';

export interface MatterSignature {
  id: string;
  document_name: string;
  method: string;
  status: string;
  signed_at: string | null;
  created_at: string;
}

interface EsignEvent { id: string; event: string; at: string }

/** Signature requests on the matter: status, event trail, withdraw if unsigned. */
export default function SignaturesPanel({ matterId, initial }: { matterId: string; initial: MatterSignature[] }) {
  const [requests, setRequests] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [events, setEvents] = useState<EsignEvent[]>([]);
  const [signers, setSigners] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setError('');
    try {
      const res = await fetch(`/api/esign/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvents(data.events ?? []);
      setSigners(Array.isArray(data.request?.signers) ? data.request.signers.map((s: any) => s?.name ?? s?.email ?? String(s)) : []);
      setOpenId(id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function withdraw(request: MatterSignature) {
    if (!window.confirm(`Withdraw the signature request for "${request.document_name}"?`)) return;
    setError('');
    const res = await fetch(`/api/esign/${request.id}`, { method: 'DELETE' });
    if (res.ok) setRequests((r) => r.filter((x) => x.id !== request.id));
    else setError((await res.json()).error);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="flexb" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontWeight: 700 }}>Signatures <span className="muted">({requests.length})</span></span>
        <IconButton label="Send for signature" href={`/esign?matter=${matterId}`}><IconSign /></IconButton>
      </div>

      {error && <div style={{ color: 'crimson', fontSize: 13, padding: '8px 16px' }}>{error}</div>}
      {requests.length === 0 && <div className="muted" style={{ padding: 16, fontSize: 13.5 }}>Nothing sent for signature yet.</div>}

      {requests.map((r) => (
        <div key={r.id}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{r.document_name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {r.method}
                {' · '}
                {r.signed_at
                  ? `signed ${new Date(r.signed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : `sent ${new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </div>
            </div>
            <div className="gap8" style={{ display: 'flex', alignItems: 'center' }}>
              <span className={`tag ${r.status === 'signed' ? 't-success' : 't-grey'}`}>{r.status}</span>
              <div className="icon-actions">
                <IconButton label={openId === r.id ? 'Hide trail' : 'Event trail'} onClick={() => toggle(r.id)}><IconList /></IconButton>
                {r.status !== 'signed' && <IconButton label="Withdraw request" danger onClick={() => withdraw(r)}><IconX /></IconButton>}
              </div>
            </div>
          </div>

          {openId === r.id && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 12.5 }}>
              {signers.length > 0 && (
                <div style={{ marginBottom: 8 }}><b>Signers:</b> {signers.join(', ')}</div>
              )}
              {events.length === 0
                ? <span className="muted">No events recorded.</span>
                : events.map((e) => (
                    <div key={e.id} className="muted">
                      {new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — {e.event}
                    </div>
                  ))}
              {r.status === 'signed' && (
                <div style={{ marginTop: 8 }} className="muted">
                  A signed request is kept permanently — it is the record that the document was executed.
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
