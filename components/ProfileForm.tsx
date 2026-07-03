'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { IconUser, IconCheck, IconLogout } from '@/components/Icons';

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  firm_name: string | null;
  phone: string | null;
  bar_council_id: string | null;
  avatar_url: string | null;
};

const inputCls =
  'w-full rounded-[11px] border border-line-2 bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition focus:border-brand focus:bg-surface focus:shadow-[0_0_0_4px_var(--brand-soft)]';
const labelCls = 'mb-1.5 block text-[12px] font-bold text-ink';

export default function ProfileForm({ user }: { user: ProfileUser }) {
  const [form, setForm] = useState({
    name: user.name || '',
    firm_name: user.firm_name || '',
    phone: user.phone || '',
    bar_council_id: user.bar_council_id || '',
    avatar_url: user.avatar_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const initials = (form.name || 'AA')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          firm_name: form.firm_name || null,
          phone: form.phone || null,
          bar_council_id: form.bar_council_id || null,
          avatar_url: form.avatar_url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error || 'Could not save your profile.');
      else setSaved(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="page-head">
        <div className="eyebrow"><IconUser width={13} height={13} /> Profile</div>
        <h1>Manage your profile</h1>
        <p>Update your details. These appear on drafts, the workspace header and your account.</p>
      </div>

      {/* Identity card */}
      <div className="mb-5 flex items-center gap-4 rounded-[var(--r-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-sm)]">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-accent to-brand text-xl font-bold text-on-brand">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold text-ink">{form.name || 'Advocate'}</div>
          <div className="truncate text-[13px] text-muted">{user.email}</div>
        </div>
        <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-[11px] font-bold uppercase text-brand">
          {user.plan} plan
        </span>
      </div>

      {/* Editable details */}
      <form onSubmit={save} className="rounded-[var(--r-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-4 font-serif text-[17px] text-ink">Details</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Full name</label>
            <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Email (read-only)</label>
            <input className={`${inputCls} cursor-not-allowed opacity-60`} value={user.email} readOnly />
          </div>
          <div>
            <label className={labelCls}>Firm / Chamber</label>
            <input className={inputCls} value={form.firm_name} onChange={(e) => set('firm_name', e.target.value)} placeholder="Sharma & Associates" />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 …" />
          </div>
          <div>
            <label className={labelCls}>Bar Council ID</label>
            <input className={inputCls} value={form.bar_council_id} onChange={(e) => set('bar_council_id', e.target.value)} placeholder="e.g. R/1234/2015" />
          </div>
          <div>
            <label className={labelCls}>Avatar URL</label>
            <input className={inputCls} value={form.avatar_url} onChange={(e) => set('avatar_url', e.target.value)} placeholder="https://…" />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-danger bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">{error}</div>
        )}
        {saved && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success bg-success-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-success">
            <IconCheck width={15} height={15} /> Profile saved.
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="inline-flex items-center gap-2 rounded-[11px] border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-danger transition hover:border-danger"
          >
            <IconLogout width={16} height={16} /> Sign out
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[11px] bg-linear-to-r from-brand-2 to-brand px-5 py-2.5 text-[13px] font-bold text-on-brand shadow-[var(--shadow)] transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
