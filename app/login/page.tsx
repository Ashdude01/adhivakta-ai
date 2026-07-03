'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { IconSpark, IconShield } from '@/components/Icons';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('advocate@adhivakta.ai');
  const [password, setPassword] = useState('advocate123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (mode === 'signup') {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLoading(false);
        setError(data.error || 'Could not create your account.');
        return;
      }
    }

    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError('Invalid email or password.');
    else router.push('/dashboard');
  }

  const isSignup = mode === 'signup';

  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <div className="brand">
          <div className="logo">अ</div>
          <div><div className="bt">Adhivakta AI</div><div className="bs">Legal Workspace</div></div>
        </div>
        <div>
          <h1 style={{ fontSize: 34, color: '#fff', lineHeight: 1.15, marginBottom: 14 }}>
            More law<br />per lawyer.
          </h1>
          <p style={{ color: 'var(--sidebar-dim)', fontSize: 15, maxWidth: 360, lineHeight: 1.6 }}>
            AI drafting, a community case &amp; draft library, document review and legally-valid e-signature — built for India&apos;s advocates.
          </p>
        </div>
        <div className="gap8" style={{ color: 'var(--sidebar-dim)', fontSize: 12.5 }}>
          <IconShield width={16} height={16} /> DPDP-aligned · encrypted · citations you can verify
        </div>
      </div>

      <div className="auth-form">
        <form className="auth-box" onSubmit={submit}>
          <div className="eyebrow"><IconSpark width={13} height={13} /> {isSignup ? 'Create account' : 'Welcome back'}</div>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>{isSignup ? 'Sign up' : 'Sign in'}</h1>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 22 }}>
            {isSignup ? 'Create your advocate workspace in seconds.' : 'Use the demo credentials below or your own.'}
          </p>

          {isSignup && (
            <div className="field"><label>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Adv. Your Name" required /></div>
          )}
          <div className="field"><label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>

          {error && <div className="callout warn" style={{ padding: 12, marginBottom: 12 }}><div className="muted" style={{ fontSize: 12.5 }}>{error}</div></div>}

          <button className="cta brand block" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? (isSignup ? 'Creating…' : 'Signing in…') : (isSignup ? 'Create account' : 'Sign in')}
          </button>

          <div className="muted" style={{ fontSize: 12.5, marginTop: 16, textAlign: 'center' }}>
            {isSignup ? 'Already have an account? ' : "New here? "}
            <button
              type="button"
              className="link"
              style={{ background: 'none', border: 'none' }}
              onClick={() => { setError(''); setMode(isSignup ? 'signin' : 'signup'); }}
            >
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </div>
          {!isSignup && (
            <div className="muted" style={{ fontSize: 12, marginTop: 8, textAlign: 'center' }}>
              Demo: advocate@adhivakta.ai · advocate123
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
