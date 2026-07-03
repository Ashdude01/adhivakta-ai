import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconFolder, IconSpark, IconSign, IconSearch } from '@/components/Icons';
import { currentUserId } from '@/lib/session';
import { getMatter, matterFolder } from '@/lib/data/matters';

export const dynamic = 'force-dynamic';

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Matter folder (plan flow: "Matter folder: drafts, uploads, signed copies, chat history")
export default async function MatterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) notFound();

  const matter = await getMatter(userId!, id);
  if (!matter) notFound();

  const folder = await matterFolder(userId!, id);
  const keyDates = Object.entries(matter.key_dates ?? {});

  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconFolder width={13} height={13} /> <Link href="/matters" style={{ color: 'inherit' }}>My Matters</Link> / {matter.code}</div>
        <h1>{matter.title}</h1>
        <p>{matter.subtitle}</p>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="gap8 wrap" style={{ display: 'flex' }}>
          {matter.matter_type && <span className="tag t-brand">{matter.matter_type}</span>}
          {matter.court && <span className="tag t-grey">{matter.court}</span>}
          <span className={`tag ${matter.tag_class || 't-grey'}`}>{matter.status}</span>
        </div>
        {(matter.parties?.client || matter.parties?.opposite) && (
          <div style={{ marginTop: 12, fontSize: 14 }}>
            {matter.parties?.client && <div><b>Client:</b> {matter.parties.client}</div>}
            {matter.parties?.opposite && <div><b>Opposite party:</b> {matter.parties.opposite}</div>}
          </div>
        )}
        {keyDates.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 14 }}>
            {keyDates.map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}
          </div>
        )}
        {matter.description && <p className="muted" style={{ marginTop: 10, fontSize: 13.5 }}>{matter.description}</p>}
        <div className="gap8" style={{ display: 'flex', marginTop: 14, flexWrap: 'wrap' }}>
          <Link href="/draft" className="cta brand" style={{ textDecoration: 'none' }}><IconSpark /> Draft a document</Link>
          <Link href="/review" className="cta" style={{ textDecoration: 'none' }}><IconSearch /> Review a file</Link>
          <Link href="/esign" className="cta" style={{ textDecoration: 'none' }}><IconSign /> Get it signed</Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700 }}>
          Drafts <span className="muted">({folder.drafts.length})</span>
        </div>
        {folder.drafts.length === 0 && <div className="muted" style={{ padding: 16, fontSize: 13.5 }}>No drafts yet for this matter.</div>}
        {folder.drafts.map((d: any) => (
          <div className="row" key={d.id}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{d.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{d.doc_type} · {d.language} · {fmtDate(d.created_at)}</div>
            </div>
            <span className={`tag ${d.status === 'exported' ? 't-success' : 't-grey'}`}>{d.status}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700 }}>
          Signatures <span className="muted">({folder.esignRequests.length})</span>
        </div>
        {folder.esignRequests.length === 0 && <div className="muted" style={{ padding: 16, fontSize: 13.5 }}>Nothing sent for signature yet.</div>}
        {folder.esignRequests.map((e: any) => (
          <div className="row" key={e.id}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{e.document_name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{e.method} · {fmtDate(e.created_at)}</div>
            </div>
            <span className={`tag ${e.status === 'signed' ? 't-success' : 't-grey'}`}>{e.status}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700 }}>
          Document reviews <span className="muted">({folder.reviewSessions.length})</span>
        </div>
        {folder.reviewSessions.length === 0 && <div className="muted" style={{ padding: 16, fontSize: 13.5 }}>No files reviewed under this matter yet.</div>}
        {folder.reviewSessions.map((r: any) => (
          <div className="row" key={r.id}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{r.filename || 'Untitled document'}</div>
              <div className="muted" style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
