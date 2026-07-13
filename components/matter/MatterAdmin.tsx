'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMatterType, MATTER_TYPES, type FactField } from '@/lib/legal/matterTypes';

export interface EditableMatter {
  id: string;
  title: string;
  matter_type_code: string | null;
  status: string;
  court: string | null;
  court_complex: string | null;
  district: string | null;
  state: string | null;
  client_ref: string | null;
  description: string | null;
  relief_sought: string | null;
  suit_value: number | null;
  facts: Record<string, unknown>;
  cnr: string | null;
  case_type: string | null;
  case_number: string | null;
  case_year: number | null;
  filing_number: string | null;
  filed_on: string | null;
  next_hearing_date: string | null;
}

export interface Footprint {
  drafts: number; esignRequests: number; reviewSessions: number; documents: number; parties: number;
}

const STATUSES = ['active', 'draft', 'filed', 'reviewing', 'sign_pending', 'completed'];

/** Edit a matter's particulars, or close the file for good. */
export default function MatterAdmin({ matter, footprint }: { matter: EditableMatter; footprint: Footprint }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const type = getMatterType(matter.matter_type_code);
  const [f, setF] = useState({
    title: matter.title,
    status: matter.status,
    court: matter.court ?? '',
    court_complex: matter.court_complex ?? '',
    district: matter.district ?? '',
    state: matter.state ?? '',
    client_ref: matter.client_ref ?? '',
    description: matter.description ?? '',
    relief_sought: matter.relief_sought ?? '',
    suit_value: matter.suit_value?.toString() ?? '',
    cnr: matter.cnr ?? '',
    case_type: matter.case_type ?? '',
    case_number: matter.case_number ?? '',
    case_year: matter.case_year?.toString() ?? '',
    filing_number: matter.filing_number ?? '',
    filed_on: matter.filed_on ?? '',
    next_hearing_date: matter.next_hearing_date ?? '',
  });
  const [facts, setFacts] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(matter.facts ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])),
  );

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/matters/${matter.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        // matter_type_code goes along so the server validates `facts` against
        // the right schema; the type itself is not editable here.
        body: JSON.stringify({ ...f, matter_type_code: matter.matter_type_code ?? undefined, facts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  async function remove() {
    const carries = [
      footprint.parties && `${footprint.parties} ${footprint.parties === 1 ? 'party' : 'parties'}`,
      footprint.documents && `${footprint.documents} uploaded ${footprint.documents === 1 ? 'document' : 'documents'}`,
    ].filter(Boolean).join(' and ');

    const keeps = [
      footprint.drafts && `${footprint.drafts} draft(s)`,
      footprint.esignRequests && `${footprint.esignRequests} signature request(s)`,
      footprint.reviewSessions && `${footprint.reviewSessions} review session(s)`,
    ].filter(Boolean).join(', ');

    const message = [
      `Delete the matter "${matter.title}"?`,
      carries && `\nThis permanently deletes ${carries}.`,
      keeps && `\n${keeps} will be kept but detached from this matter.`,
      '\nThis cannot be undone.',
    ].filter(Boolean).join('\n');

    if (!window.confirm(message)) return;
    if (window.prompt('Type DELETE to confirm.') !== 'DELETE') return;

    setDeleting(true); setError('');
    try {
      const res = await fetch(`/api/matters/${matter.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not delete');
      router.push('/matters');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  if (!open) {
    return (
      <div className="gap8" style={{ display: 'flex', flexWrap: 'wrap' }}>
        <button className="cta" onClick={() => setOpen(true)}>Edit matter</button>
        <button className="cta" onClick={remove} disabled={deleting} style={{ color: 'crimson' }}>
          {deleting ? 'Deleting…' : 'Delete matter'}
        </button>
        {error && <div style={{ color: 'crimson', fontSize: 13, width: '100%' }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div className="flexb" style={{ marginBottom: 12 }}>
        <span className="tag t-brand">Edit matter</span>
        <button className="tb-btn" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)}>✕</button>
      </div>

      <div className="field"><label>Matter title *</label>
        <input value={f.title} onChange={(e) => set('title', e.target.value)} /></div>

      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>Status</label>
          <select value={f.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>Court / forum</label>
          <select value={f.court} onChange={(e) => set('court', e.target.value)}>
            <option value="">— not decided yet —</option>
            {(type?.courts ?? MATTER_TYPES[MATTER_TYPES.length - 1].courts).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>Court complex</label>
          <input value={f.court_complex} onChange={(e) => set('court_complex', e.target.value)} /></div>
        <div className="field"><label>Your reference</label>
          <input value={f.client_ref} onChange={(e) => set('client_ref', e.target.value)} /></div>
      </div>
      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>District</label>
          <input value={f.district} onChange={(e) => set('district', e.target.value)} /></div>
        <div className="field"><label>State</label>
          <input value={f.state} onChange={(e) => set('state', e.target.value)} /></div>
      </div>

      {type && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 8px' }}>Case facts</div>
          {type.facts.map((field: FactField) => (
            <div className="field" key={field.key}>
              <label>{field.label}</label>
              {field.type === 'textarea' && <textarea rows={3} value={facts[field.key] ?? ''} onChange={(e) => setFacts({ ...facts, [field.key]: e.target.value })} />}
              {field.type === 'select' && (
                <select value={facts[field.key] ?? ''} onChange={(e) => setFacts({ ...facts, [field.key]: e.target.value })}>
                  <option value="">—</option>
                  {field.options?.map((o) => <option key={o}>{o}</option>)}
                </select>
              )}
              {field.type === 'date' && <input type="date" value={facts[field.key] ?? ''} onChange={(e) => setFacts({ ...facts, [field.key]: e.target.value })} />}
              {(field.type === 'amount' || field.type === 'number') && <input type="number" min={0} value={facts[field.key] ?? ''} onChange={(e) => setFacts({ ...facts, [field.key]: e.target.value })} />}
              {field.type === 'text' && <input value={facts[field.key] ?? ''} onChange={(e) => setFacts({ ...facts, [field.key]: e.target.value })} />}
            </div>
          ))}
        </>
      )}

      <div className="field"><label>Relief sought</label>
        <textarea rows={2} value={f.relief_sought} onChange={(e) => set('relief_sought', e.target.value)} /></div>
      <div className="field"><label>Suit valuation (₹)</label>
        <input type="number" min={0} value={f.suit_value} onChange={(e) => set('suit_value', e.target.value)} /></div>

      <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 8px' }}>Filing &amp; tracking</div>
      <div className="field"><label>CNR number</label>
        <input value={f.cnr} onChange={(e) => set('cnr', e.target.value.toUpperCase())} maxLength={16} placeholder="RJJP010012342024" /></div>
      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>Case type</label>
          <input value={f.case_type} onChange={(e) => set('case_type', e.target.value)} /></div>
        <div className="field"><label>Case number</label>
          <input value={f.case_number} onChange={(e) => set('case_number', e.target.value)} /></div>
      </div>
      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>Year</label>
          <input type="number" value={f.case_year} onChange={(e) => set('case_year', e.target.value)} /></div>
        <div className="field"><label>Filing number</label>
          <input value={f.filing_number} onChange={(e) => set('filing_number', e.target.value)} /></div>
      </div>
      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>Filed on</label>
          <input type="date" value={f.filed_on} onChange={(e) => set('filed_on', e.target.value)} /></div>
        <div className="field"><label>Next hearing</label>
          <input type="date" value={f.next_hearing_date} onChange={(e) => set('next_hearing_date', e.target.value)} /></div>
      </div>

      <div className="field"><label>Notes</label>
        <textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>

      {error && <div style={{ color: 'crimson', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <button className="cta brand block" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
    </div>
  );
}
