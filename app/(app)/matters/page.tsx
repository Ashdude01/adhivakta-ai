import Link from 'next/link';
import { IconFolder } from '@/components/Icons';
import { currentUserId } from '@/lib/session';
import { listMatters } from '@/lib/data/matters';
import NewMatterForm from '@/components/NewMatterForm';

export const dynamic = 'force-dynamic';

export default async function MattersPage() {
  const userId = await currentUserId();
  const matters = userId ? await listMatters(userId) : [];

  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconFolder width={13} height={13} /> My Matters</div>
        <h1>All matters</h1>
        <p>Every case file, draft, review and signature in one place.</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <NewMatterForm />
      </div>
      <div className="card">
        {matters.length === 0 && (
          <div className="muted" style={{ padding: 20 }}>No matters yet — create one above.</div>
        )}
        {matters.map((m) => (
          <Link href={`/matters/${m.id}`} className="row" key={m.id} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="av-sm" style={{ background: m.color || 'var(--brand)' }}>{m.code}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{m.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{m.subtitle}</div>
            </div>
            {m.tag && <span className={`tag ${m.tag_class || 't-grey'}`}>{m.tag}</span>}
          </Link>
        ))}
      </div>
    </>
  );
}
