'use client';

import { useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import { IconUser, IconCheck, IconLogout, IconScale } from '@/components/Icons';
import { letterheadLines, missingForNotice, type Advocate } from '@/lib/legal/letterhead';

type ProfileUser = Advocate & {
  id: string;
  email: string;
  role: string;
  plan: string;
  avatar_url: string | null;
};

const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Jammu & Kashmir', 'Other',
];

export default function ProfileForm({ user }: { user: ProfileUser }) {
  const [form, setForm] = useState({
    name: user.name || '',
    designation: user.designation || 'Advocate',
    firm_name: user.firm_name || '',
    enrolment_no: user.enrolment_no || '',
    bar_council: user.bar_council || '',
    office_address: user.office_address || '',
    city: user.city || '',
    state: user.state || '',
    pincode: user.pincode || '',
    phone: user.phone || '',
    alt_phone: user.alt_phone || '',
    avatar_url: user.avatar_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const advocate: Advocate = { ...form, email: user.email };
  const preview = useMemo(() => letterheadLines(advocate), [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = useMemo(() => missingForNotice(advocate), [form]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = (form.name || 'AA').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error || 'Could not save your profile.');
      else setSaved(true);
    } catch {
      setError('Network error — please try again.');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="page-head">
        <div className="eyebrow"><IconUser width={13} height={13} /> Profile</div>
        <h1>Manage your profile</h1>
        <p>These particulars form your letterhead — every legal notice and pleading is issued under them.</p>
      </div>

      {/* Identity */}
      <div className="card flexb" style={{ padding: 18, marginBottom: 16, gap: 14 }}>
        <div className="gap8" style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 700, fontSize: 20, background: 'linear-gradient(135deg, var(--accent), var(--brand))', color: 'var(--on-brand)' }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.name || 'Advocate'}</div>
            <div className="muted" style={{ fontSize: 13 }}>{user.email}</div>
          </div>
        </div>
        <span className="tag t-brand" style={{ textTransform: 'uppercase' }}>{user.plan} plan</span>
      </div>

      {/* Notice-readiness banner */}
      {missing.length === 0 ? (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: 'var(--success)' }}>
          <span className="tag t-success"><IconCheck width={13} height={13} /> Letterhead complete</span>
          <span className="muted" style={{ fontSize: 13, marginLeft: 10 }}>Your profile has everything a legal notice needs.</span>
        </div>
      ) : (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: 'var(--accent)' }}>
          <div className="tag t-danger" style={{ marginBottom: 6, display: 'inline-block' }}>Letterhead incomplete</div>
          <div style={{ fontSize: 13 }}>
            A legal notice needs: {missing.map((m, i) => <span key={m}><b>{m}</b>{i < missing.length - 1 ? ', ' : ''}</span>)}.
          </div>
        </div>
      )}

      <form onSubmit={save}>
        {/* Live letterhead preview */}
        <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 13 }}>
            <IconScale width={13} height={13} style={{ verticalAlign: -1, marginRight: 6 }} /> Letterhead preview
          </div>
          <div style={{ padding: '22px 16px', textAlign: 'center', fontFamily: 'var(--font-display, Georgia, serif)' }}>
            {preview.length === 0
              ? <span className="muted" style={{ fontSize: 13 }}>Fill your details below to see your letterhead.</span>
              : preview.map((l, i) => (
                  <div key={i} style={{ fontWeight: l.strong ? 700 : 400, fontSize: l.strong ? 15 : 12.5, color: l.strong ? 'var(--text)' : 'var(--muted)', lineHeight: 1.6 }}>
                    {l.text}
                  </div>
                ))}
            {preview.length > 0 && <div style={{ borderBottom: '2px solid var(--text)', margin: '12px 40px 0' }} />}
          </div>
        </div>

        <Section title="Practice & Bar">
          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>Full name *</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Adv. Rajesh Sharma" /></div>
            <div className="field"><label>Designation</label>
              <select value={form.designation} onChange={(e) => set('designation', e.target.value)}>
                <option>Advocate</option>
                <option>Senior Advocate</option>
                <option>Advocate-on-Record</option>
              </select>
            </div>
          </div>
          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>Bar Council enrolment number *</label>
              <input value={form.enrolment_no} onChange={(e) => set('enrolment_no', e.target.value)} placeholder="e.g. D/1234/2015" />
              <small className="muted">Without this, a notice carries no professional authority.</small>
            </div>
            <div className="field"><label>Bar Council</label>
              <input value={form.bar_council} onChange={(e) => set('bar_council', e.target.value)} placeholder="e.g. Bar Council of Delhi" /></div>
          </div>
          <div className="field"><label>Firm / Chamber</label>
            <input value={form.firm_name} onChange={(e) => set('firm_name', e.target.value)} placeholder="Sharma & Associates" /></div>
        </Section>

        <Section title="Office address">
          <div className="field"><label>Chamber / office address *</label>
            <textarea rows={2} value={form.office_address} onChange={(e) => set('office_address', e.target.value)} placeholder="Chamber No. 12, District Court Complex, Tis Hazari" /></div>
          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>City *</label>
              <input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="New Delhi" /></div>
            <div className="field"><label>State</label>
              <select value={form.state} onChange={(e) => set('state', e.target.value)}>
                <option value="">—</option>
                {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="field" style={{ maxWidth: 200 }}><label>Pincode *</label>
            <input inputMode="numeric" maxLength={6} value={form.pincode} onChange={(e) => set('pincode', e.target.value)} placeholder="110054" /></div>
        </Section>

        <Section title="Contact">
          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>Phone *</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98290 00000" /></div>
            <div className="field"><label>Alternate phone</label>
              <input value={form.alt_phone} onChange={(e) => set('alt_phone', e.target.value)} placeholder="Office landline" /></div>
          </div>
          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>Email (read-only)</label>
              <input value={user.email} readOnly style={{ opacity: 0.6, cursor: 'not-allowed' }} /></div>
            <div className="field"><label>Avatar URL</label>
              <input value={form.avatar_url} onChange={(e) => set('avatar_url', e.target.value)} placeholder="https://…" /></div>
          </div>
        </Section>

        {error && <div style={{ color: 'crimson', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {saved && (
          <div className="tag t-success" style={{ marginBottom: 10, display: 'inline-flex' }}>
            <IconCheck width={14} height={14} /> Profile saved
          </div>
        )}

        <div className="flexb" style={{ gap: 10, marginTop: 4 }}>
          <button type="button" className="cta" style={{ color: 'crimson' }} onClick={() => signOut({ callbackUrl: '/login' })}>
            <IconLogout width={16} height={16} /> Sign out
          </button>
          <button type="submit" className="cta brand" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}
