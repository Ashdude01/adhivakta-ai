'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconSpark, IconDownload, IconSign } from '@/components/Icons';

// s.138 launch wedge + common district-court documents (plan Appendix B)
const DOC_TYPES = [
  'Legal Notice — §138 NI Act (Cheque Bounce)',
  'Complaint u/s 138 NI Act — Magistrate Court',
  'Reply to §138 Demand Notice',
  'Vakalatnama',
  'Settlement Agreement — Cheque Dispute',
  'Plaint / Suit for Recovery',
  'Written Statement',
  'Bail Application',
  'Consumer Complaint',
  'Rent & Eviction Notice',
];

interface VerifierClaim {
  claim: string;
  source_kind: string;
  verified: boolean;
  verify_url: string | null;
  note?: string;
}
interface VerifierReport { checked: number; passed: number; failed: number; claims: VerifierClaim[] }
interface Matter { id: string; title: string; code: string }

function renderWithCitations(text: string, report: VerifierReport | null) {
  const byClaim = new Map((report?.claims ?? []).map((c) => [c.claim, c]));
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[\[(.+)\]\]$/);
    if (m) {
      const c = byClaim.get(m[1].trim());
      if (c && !c.verified) {
        return (
          <span className="cite" key={i} style={{ background: 'color-mix(in srgb, crimson 14%, transparent)', borderColor: 'crimson' }}
            title={c.note || 'Could not verify this citation'}>⚠ {m[1]}</span>
        );
      }
      if (c?.verify_url) {
        return (
          <a className="cite" key={i} href={c.verify_url} target="_blank" rel="noreferrer" title="Verified — open source">
            {m[1]} ↗
          </a>
        );
      }
      return <span className="cite" key={i} title="Verified source">{m[1]}</span>;
    }
    return <span key={i}>{p}</span>;
  });
}

export default function DraftPage() {
  const router = useRouter();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [form, setForm] = useState({
    docType: DOC_TYPES[0], client: 'Mr. Rajesh Sharma', opposite: 'Mr. Anil Kapoor',
    amount: '4,50,000', dates: '12 May 2026 / 28 May 2026', language: 'English', matterId: '',
  });
  const [instructions, setInstructions] = useState('');
  const [text, setText] = useState('');
  const [meta, setMeta] = useState<{ provider: string; mock: boolean } | null>(null);
  const [report, setReport] = useState<VerifierReport | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch('/api/matters').then((r) => r.json()).then((d) => setMatters(d.matters ?? [])).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate(extra = '') {
    setLoading(true);
    try {
      const res = await fetch('/api/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          matterId: form.matterId || null,
          instructions: (instructions + ' ' + extra).trim(),
        }),
      });
      const data = await res.json();
      setText(data.text || '');
      setMeta({ provider: data.provider, mock: data.mock });
      setReport(data.verifierReport ?? null);
      setDraftId(data.draftId ?? null);
    } catch {
      setText('Could not reach the drafting service. Is the dev server running?');
    } finally { setLoading(false); }
  }

  async function exportDocx() {
    setExporting(true);
    try {
      let res = await fetch('/api/drafts/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, text, title: form.docType, format: 'docx' }),
      });
      if (res.status === 409) {
        const info = await res.json();
        const go = window.confirm(
          `${info.message}\n\nExport anyway? Your override will be recorded in the audit log.`,
        );
        if (!go) return;
        res = await fetch('/api/drafts/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId, text, title: form.docType, format: 'docx', override: true }),
        });
      }
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${form.docType.replace(/[^\w\d ]+/g, '').slice(0, 50) || 'draft'}.docx`;
      a.click();
    } catch {
      // fall back to plain text download
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'draft.txt';
      a.click();
    } finally { setExporting(false); }
  }

  const pills = ['Make stronger', 'Add interest claim', 'Translate to हिन्दी', 'Shorten', 'Check citations'];

  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconSpark width={13} height={13} /> AI Drafting</div>
        <h1>Draft a legal document</h1>
        <p>Answer a few questions — the AI drafts it in correct Indian format, grounded in real filed drafts, every citation verified.</p>
      </div>

      <div className="split">
        <div className="card" style={{ padding: 20 }}>
          <span className="tag t-brand" style={{ marginBottom: 14, display: 'inline-block' }}>Step 1 · Intake</span>
          <div className="field"><label>Document type</label>
            <select value={form.docType} onChange={(e) => set('docType', e.target.value)}>
              {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="field"><label>Matter (optional)</label>
            <select value={form.matterId} onChange={(e) => set('matterId', e.target.value)}>
              <option value="">— no matter —</option>
              {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
          <div className="field"><label>Your client (sender)</label>
            <input value={form.client} onChange={(e) => set('client', e.target.value)} /></div>
          <div className="field"><label>Opposite party</label>
            <input value={form.opposite} onChange={(e) => set('opposite', e.target.value)} /></div>
          <div className="field"><label>Amount (₹)</label>
            <input value={form.amount} onChange={(e) => set('amount', e.target.value)} /></div>
          <div className="field"><label>Key dates</label>
            <input value={form.dates} onChange={(e) => set('dates', e.target.value)} /></div>
          <div className="field"><label>Language</label>
            <div className="gap8 wrap">
              {['English', 'हिन्दी', 'मराठी'].map((l) => (
                <button key={l} type="button" className={`chip ${form.language === l ? 'on' : ''}`} onClick={() => set('language', l)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field"><label>Extra instructions (optional)</label>
            <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. emphasise the dishonour memo" /></div>
          <button className="cta brand block" onClick={() => generate()} disabled={loading}>
            <IconSpark /> {loading ? 'Generating…' : 'Generate draft'}
          </button>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="flexb" style={{ padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
            <div className="gap8 wrap">
              {text ? <span className="tag t-success">✓ Draft generated</span> : <span className="tag t-grey">Awaiting input</span>}
              {report && report.checked > 0 && (
                report.failed === 0
                  ? <span className="tag t-success">✓ {report.passed}/{report.checked} citations verified</span>
                  : <span className="tag t-danger">⚠ {report.failed} citation{report.failed > 1 ? 's' : ''} unverified</span>
              )}
              {meta && <span className="muted" style={{ fontSize: 12 }}>{meta.mock ? 'offline demo' : `via ${meta.provider}`}</span>}
            </div>
            <div className="gap8">
              <button className="tb-btn" style={{ width: 34, height: 34 }} onClick={exportDocx} disabled={!text || exporting} title="Export DOCX"><IconDownload /></button>
              <button className="cta" style={{ padding: '8px 13px' }} onClick={() => router.push('/esign')}><IconSign /> Send to sign</button>
            </div>
          </div>

          <div className="doc-preview scroll" style={{ maxHeight: 440, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
            {text
              ? renderWithCitations(text, report)
              : <span className="muted">Fill the form and press <b>Generate draft</b>. In offline mode you&apos;ll get a ready Indian-format template; add a free AI key for fully written drafts.</span>}
          </div>

          {report && report.checked > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6, fontWeight: 700 }}>Citation verifier</div>
              {report.claims.map((c, i) => (
                <div key={i} className="gap8" style={{ fontSize: 12.5, padding: '3px 0', display: 'flex', alignItems: 'baseline' }}>
                  <span>{c.verified ? '✅' : '⚠️'}</span>
                  <span style={{ flex: 1 }}>
                    {c.claim}
                    {!c.verified && c.note && <span className="muted"> — {c.note}</span>}
                  </span>
                  {c.verify_url && <a href={c.verify_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Verify ↗</a>}
                </div>
              ))}
            </div>
          )}

          {text && (
            <div className="ai-toolbar">
              {pills.map((p) => (
                <button key={p} className="ai-pill" onClick={() => generate(p)} disabled={loading}>✦ {p}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
