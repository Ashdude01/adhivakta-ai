'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconFolder } from '@/components/Icons';

const MATTER_TYPES = [
  'Cheque Bounce — NI Act §138',
  'Money Recovery Suit',
  'Consumer Complaint',
  'Motor Accident Claim (MACT)',
  'Rent & Eviction',
  'Bail / Criminal',
  'Family / Matrimonial',
  'Other',
];

const COURTS = [
  'District Court', 'Magistrate Court', 'Sessions Court', 'High Court',
  'Consumer Forum', 'MACT', 'Rent Control', 'Other / Not yet filed',
];

// Guided matter intake (plan §3 flow: matter type, parties, court, key dates).
export default function NewMatterForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    title: '', matterType: MATTER_TYPES[0], client: '', opposite: '',
    court: COURTS[0], keyDate: '', keyDateLabel: 'Cheque dishonour date', description: '',
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (f.title.trim().length < 2) { setError('Give the matter a title.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/matters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: f.title,
          code: f.matterType.includes('138') ? '138' : f.matterType.slice(0, 2).toUpperCase(),
          subtitle: `${f.matterType} · ${f.court}`,
          court: f.court,
          matter_type: f.matterType,
          description: f.description || undefined,
          parties: { client: f.client || undefined, opposite: f.opposite || undefined },
          key_dates: f.keyDate ? { [f.keyDateLabel]: f.keyDate } : undefined,
          status: 'active', tag: 'New', tag_class: 't-brand',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create matter');
      setOpen(false);
      setF({ ...f, title: '', client: '', opposite: '', keyDate: '', description: '' });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button className="cta brand" onClick={() => setOpen(true)}>
        <IconFolder /> New matter
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div className="flexb" style={{ marginBottom: 12 }}>
        <span className="tag t-brand">Guided intake</span>
        <button className="tb-btn" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)} title="Close">✕</button>
      </div>
      <div className="field"><label>Matter title *</label>
        <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Sharma vs Kapoor — Cheque Bounce" /></div>
      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>Matter type</label>
          <select value={f.matterType} onChange={(e) => set('matterType', e.target.value)}>
            {MATTER_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div className="field"><label>Court / forum</label>
          <select value={f.court} onChange={(e) => set('court', e.target.value)}>
            {COURTS.map((c) => <option key={c}>{c}</option>)}
          </select></div>
      </div>
      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>Client</label>
          <input value={f.client} onChange={(e) => set('client', e.target.value)} placeholder="Your client's name" /></div>
        <div className="field"><label>Opposite party</label>
          <input value={f.opposite} onChange={(e) => set('opposite', e.target.value)} placeholder="Opposite party's name" /></div>
      </div>
      <div className="split" style={{ gap: 12 }}>
        <div className="field"><label>Key date label</label>
          <input value={f.keyDateLabel} onChange={(e) => set('keyDateLabel', e.target.value)} /></div>
        <div className="field"><label>Key date</label>
          <input type="date" value={f.keyDate} onChange={(e) => set('keyDate', e.target.value)} /></div>
      </div>
      <div className="field"><label>Notes (optional)</label>
        <textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Brief facts of the matter" /></div>
      {error && <div style={{ color: 'crimson', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <button className="cta brand block" onClick={save} disabled={saving}>
        {saving ? 'Creating…' : 'Create matter'}
      </button>
    </div>
  );
}
