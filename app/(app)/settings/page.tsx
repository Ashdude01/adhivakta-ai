'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTheme, THEMES } from '@/components/ThemeProvider';
import { IconPalette, IconCheck, IconSpark, IconUser } from '@/components/Icons';

const AI_MODELS = [
  { label: 'Demo (offline)', tier: 'free' },
  { label: 'Google Gemini', tier: 'free' },
  { label: 'Groq · Meta Llama 3', tier: 'free' },
  { label: 'OpenRouter', tier: 'free' },
  { label: 'Hugging Face', tier: 'free' },
  { label: 'OpenAI GPT', tier: 'paid' },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();

  // Apply the theme immediately and persist the choice to the user's profile.
  function chooseTheme(id: string) {
    setTheme(id as any);
    fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: id }),
    }).catch(() => {});
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconPalette width={13} height={13} /> Settings</div>
        <h1>Settings</h1>
        <p>Personalise your workspace. Theme changes apply instantly across the whole app.</p>
      </div>

      <div className="section-title"><h2>Appearance · Theme</h2></div>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button key={t.id} className={`theme-card ${theme === t.id ? 'sel' : ''}`} onClick={() => chooseTheme(t.id)}>
            <div className="swatches">
              {t.swatches.map((s, i) => <span className="sw" key={i} style={{ background: s }} />)}
            </div>
            <div className="tn">{t.name}{theme === t.id && <IconCheck width={15} height={15} style={{ color: 'var(--brand)' }} />}</div>
          </button>
        ))}
      </div>

      <div className="section-title"><h2>AI Model</h2></div>
      <div className="card" style={{ padding: 18 }}>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          The active model is set by <code>AI_PROVIDER</code> in your <code>.env.local</code>. Start with a free model; switch anytime.
        </div>
        <div className="gap8 wrap">
          {AI_MODELS.map((m) => (
            <span key={m.label} className={`tag ${m.tier === 'free' ? 't-success' : 't-accent'}`} style={{ padding: '6px 11px' }}>
              <IconSpark width={11} height={11} style={{ verticalAlign: '-1px' }} /> {m.label} · {m.tier}
            </span>
          ))}
        </div>
      </div>

      <div className="section-title"><h2>Account</h2></div>
      <div className="card" style={{ padding: 18 }}>
        <div className="flexb" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{session?.user?.name || 'Advocate'}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{session?.user?.email || '—'}</div>
          </div>
          <Link className="cta ghost" href="/profile"><IconUser /> Manage profile</Link>
        </div>
      </div>
    </>
  );
}
