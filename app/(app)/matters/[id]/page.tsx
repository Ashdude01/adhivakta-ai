import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconFolder, IconSpark, IconSign, IconSearch } from '@/components/Icons';
import { currentUserId } from '@/lib/session';
import { getMatterFull, matterFolder, matterFootprint } from '@/lib/data/matters';
import { listDocuments } from '@/lib/data/documents';
import { getMatterType, labelledFacts, formatFactValue, formatAmount } from '@/lib/legal/matterTypes';
import MatterAdmin from '@/components/matter/MatterAdmin';
import PartiesPanel from '@/components/matter/PartiesPanel';
import DocumentsPanel from '@/components/matter/DocumentsPanel';
import DraftsPanel from '@/components/matter/DraftsPanel';
import SignaturesPanel from '@/components/matter/SignaturesPanel';

export const dynamic = 'force-dynamic';

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The matter folder: the case's particulars, and everything filed under it. */
export default async function MatterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) notFound();

  const matter = await getMatterFull(userId, id);
  if (!matter) notFound();

  const [folder, documents, footprint] = await Promise.all([
    matterFolder(userId, id),
    listDocuments(userId, id),
    matterFootprint(userId, id),
  ]);

  const type = getMatterType(matter.matter_type_code);
  const facts = labelledFacts(matter.matter_type_code, matter.facts);
  const brief = facts.find((f) => f.key === 'brief_facts');
  const otherFacts = facts.filter((f) => f.key !== 'brief_facts');

  const caseRef = [
    matter.cnr && `CNR ${matter.cnr}`,
    matter.case_number && `${matter.case_type ?? 'Case'} No. ${matter.case_number}${matter.case_year ? `/${matter.case_year}` : ''}`,
    matter.filing_number && `Filing No. ${matter.filing_number}`,
  ].filter(Boolean) as string[];

  // Matters created before the parties table existed still carry the old blob.
  const legacyParties = matter.parties_list.length === 0 ? matter.parties : null;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <IconFolder width={13} height={13} /> <Link href="/matters" style={{ color: 'inherit' }}>My Matters</Link> / {matter.code}
        </div>
        <h1>{matter.title}</h1>
        <p>{matter.subtitle}</p>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="gap8 wrap" style={{ display: 'flex' }}>
          {matter.matter_type && <span className="tag t-brand">{matter.matter_type}</span>}
          {matter.court && <span className="tag t-grey">{matter.court}</span>}
          <span className={`tag ${matter.tag_class || 't-grey'}`}>{matter.status}</span>
          {matter.next_hearing_date && <span className="tag t-accent">Next hearing {fmtDate(matter.next_hearing_date)}</span>}
        </div>

        {(type?.act || caseRef.length > 0 || matter.client_ref) && (
          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            {type?.act && <div>Under {type.act}{type.section ? `, s.${type.section}` : ''}</div>}
            {caseRef.length > 0 && <div>{caseRef.join(' · ')}</div>}
            {matter.client_ref && <div>Your reference: {matter.client_ref}</div>}
          </div>
        )}

        <div className="gap8" style={{ display: 'flex', marginTop: 14, flexWrap: 'wrap' }}>
          <Link href={`/draft?matter=${matter.id}`} className="cta brand" style={{ textDecoration: 'none' }}><IconSpark /> Draft a document</Link>
          <Link href={`/review?matter=${matter.id}`} className="cta" style={{ textDecoration: 'none' }}><IconSearch /> Review a file</Link>
          <Link href={`/esign?matter=${matter.id}`} className="cta" style={{ textDecoration: 'none' }}><IconSign /> Get it signed</Link>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <MatterAdmin matter={matter} footprint={footprint} />
        </div>
      </div>

      {matter.parties_list.length > 0 && (
        <PartiesPanel matterId={matter.id} matterTypeCode={matter.matter_type_code} parties={matter.parties_list} />
      )}

      {legacyParties && (legacyParties.client || legacyParties.opposite) && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="tag t-grey" style={{ marginBottom: 8, display: 'inline-block' }}>Parties (recorded before structured intake)</div>
          {legacyParties.client && <div style={{ fontSize: 14 }}><b>Client:</b> {legacyParties.client}</div>}
          {legacyParties.opposite && <div style={{ fontSize: 14 }}><b>Opposite party:</b> {legacyParties.opposite}</div>}
        </div>
      )}

      {(otherFacts.length > 0 || brief || matter.relief_sought || matter.suit_value != null || matter.description) && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Case facts</div>
          {otherFacts.length > 0 && (
            <div style={{ fontSize: 14, marginBottom: brief ? 10 : 0 }}>
              {otherFacts.map((f) => <div key={f.key}><b>{f.label}:</b> {formatFactValue(f)}</div>)}
            </div>
          )}
          {brief && <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{brief.value}</p>}
          {matter.relief_sought && <div style={{ fontSize: 14 }}><b>Relief sought:</b> {matter.relief_sought}</div>}
          {matter.suit_value != null && <div style={{ fontSize: 14 }}><b>Suit valuation:</b> ₹{formatAmount(matter.suit_value)}</div>}
          {matter.description && <p className="muted" style={{ marginTop: 10, fontSize: 13.5 }}>{matter.description}</p>}
        </div>
      )}

      <DraftsPanel matterId={matter.id} initial={folder.drafts as never[]} />
      <SignaturesPanel matterId={matter.id} initial={folder.esignRequests as never[]} />
      <DocumentsPanel matterId={matter.id} initial={documents} />

      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700 }}>
          Document reviews <span className="muted">({folder.reviewSessions.length})</span>
        </div>
        {folder.reviewSessions.length === 0
          ? <div className="muted" style={{ padding: 16, fontSize: 13.5 }}>No files reviewed under this matter yet.</div>
          : folder.reviewSessions.map((r: any) => (
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
