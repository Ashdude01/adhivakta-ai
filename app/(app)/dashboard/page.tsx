import Link from 'next/link';
import {
  IconPen, IconClock, IconCheck, IconSign, IconDoc, IconBook, IconSpark, IconChevron,
} from '@/components/Icons';
import { currentUser } from '@/lib/session';
import { listMatters, matterStats } from '@/lib/data/matters';
import { countDrafts } from '@/lib/data/drafts';

const actions = [
  { href: '/draft', t: 'Draft a document', p: 'Petition, notice, reply…', ic: <IconPen />, bg: 'var(--brand-soft)', c: 'var(--brand)' },
  { href: '/review', t: 'Review a file', p: 'Upload & chat with it', ic: <IconDoc />, bg: 'var(--accent-soft)', c: 'var(--accent-ink)' },
  { href: '/library', t: 'Search library', p: 'Judgments + real drafts', ic: <IconBook />, bg: 'var(--success-soft)', c: 'var(--success)' },
  { href: '/esign', t: 'Send for e-sign', p: 'Aadhaar eSign / DSC', ic: <IconSign />, bg: 'var(--brand-soft)', c: 'var(--brand)' },
];

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await currentUser();
  const userId = user?.id;

  const [matters, stats, drafts] = userId
    ? await Promise.all([listMatters(userId), matterStats(userId), countDrafts(userId)])
    : [[], { total: 0, active: 0, pendingSignatures: 0 }, 0];

  const firstName = (user?.name || 'Advocate').replace(/^Adv\.?\s*/i, '').split(' ')[0] || 'Advocate';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const recent = matters.slice(0, 4);

  const stat = [
    { v: String(drafts), l: 'Drafts generated', ic: <IconPen />, bg: 'var(--brand-soft)', c: 'var(--brand)' },
    { v: `${Math.max(1, Math.round(drafts * 0.75))} hrs`, l: 'Saved this month', ic: <IconClock />, bg: 'var(--accent-soft)', c: 'var(--accent-ink)' },
    { v: String(stats.active), l: 'Active matters', ic: <IconCheck />, bg: 'var(--success-soft)', c: 'var(--success)' },
    { v: String(stats.pendingSignatures), l: 'Pending signatures', ic: <IconSign />, bg: 'var(--danger-soft)', c: 'var(--danger)' },
  ];

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">● {today}</div>
        <h1>Namaste, Advocate {firstName}</h1>
        <p>
          You have <b>{stats.active} matter{stats.active === 1 ? '' : 's'}</b> in progress and{' '}
          <b>{stats.pendingSignatures} document{stats.pendingSignatures === 1 ? '' : 's'}</b> awaiting signature.
        </p>
      </div>

      <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {stat.map((s) => (
          <div className="card stat" key={s.l}>
            <div className="ic" style={{ background: s.bg, color: s.c }}>{s.ic}</div>
            <div className="v">{s.v}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="section-title"><h2>Quick actions</h2></div>
      <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {actions.map((a) => (
          <Link href={a.href} key={a.t} className="card qa">
            <div className="qic" style={{ background: a.bg, color: a.c }}>{a.ic}</div>
            <div><h3>{a.t}</h3><p>{a.p}</p></div>
            <div className="arr"><IconChevron width={18} height={18} /></div>
          </Link>
        ))}
      </div>

      <div className="grid cols-2" style={{ gridTemplateColumns: '1.6fr 1fr', marginTop: 24, alignItems: 'start' }}>
        <div className="card">
          <div className="flexb" style={{ padding: '16px 18px 4px' }}>
            <h2 style={{ fontSize: 17 }}>Recent matters</h2>
            <Link href="/matters" className="link">View all</Link>
          </div>
          <div>
            {recent.length === 0 && (
              <div className="muted" style={{ padding: '14px 18px 18px', fontSize: 13 }}>
                No matters yet. They’ll appear here as you create them.
              </div>
            )}
            {recent.map((m) => (
              <Link href="/matters" className="row" key={m.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="av-sm" style={{ background: m.color || 'var(--brand)' }}>{m.code}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{m.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{m.subtitle}</div>
                </div>
                {m.tag && <span className={`tag ${m.tag_class || 't-grey'}`}>{m.tag}</span>}
              </Link>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 18, background: 'linear-gradient(165deg,var(--sidebar-1),var(--sidebar-2))', color: 'var(--sidebar-text)', border: 'none' }}>
          <div className="gap8" style={{ marginBottom: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,.14)', display: 'grid', placeItems: 'center' }}>
              <IconSpark width={16} height={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>AI Suggestions</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 12.5, lineHeight: 1.5, color: 'var(--sidebar-dim)' }}>
            Start a new draft and the AI will ground it in real filed drafts, every citation verified.{' '}
            <Link href="/draft" style={{ color: 'var(--accent)', fontWeight: 700 }}>Draft now →</Link>
          </div>
          <div style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 12, fontSize: 12.5, lineHeight: 1.5, color: 'var(--sidebar-dim)' }}>
            Have a signed-ready notice? Send it for <b style={{ color: '#fff' }}>legally-valid e-signature</b>.{' '}
            <Link href="/esign" style={{ color: 'var(--accent)', fontWeight: 700 }}>Send now →</Link>
          </div>
        </div>
      </div>
    </>
  );
}
