'use client';

import { useMemo, useState } from 'react';
import { LIB_FILTERS, LibItem } from '@/lib/data/cases';
import { IconSearch, IconPlus } from '@/components/Icons';

type PiiFinding = { kind: string; original: string; replacement: string };

export default function LibraryBrowser({ initialItems }: { initialItems: LibItem[] }) {
  const [items, setItems] = useState<LibItem[]>(initialItems);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', court: '', outcome: '', excerpt: '', tags: '', fullText: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // anonymiser preview state (plan §6.3: anonymise → contributor confirms → moderate → publish)
  const [preview, setPreview] = useState<{ anonymisedText: string; report: PiiFinding[] } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const results = useMemo(() => {
    return items.filter((it) => {
      if (filter === '⚖️ Judgments' && it.kind !== 'judgment') return false;
      if (filter === '📝 Community drafts' && it.kind !== 'draft') return false;
      if (filter === 'Supreme Court' && it.court !== 'Supreme Court') return false;
      if (filter === 'High Courts' && it.court === 'Supreme Court') return false;
      if (filter === '§138' && !it.tags.some((t) => t.includes('138'))) return false;
      if (q) {
        const blob = (it.title + it.excerpt + it.tags.join(' ') + (it.author || '')).toLowerCase();
        if (!blob.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, q, filter]);

  async function runAnonymiser() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/library/anonymise', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: form.fullText }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Anonymiser failed.'); return; }
      setPreview(data);
      setConfirmed(false);
    } catch {
      setError('Network error — please try again.');
    } finally { setSaving(false); }
  }

  async function contribute(e: React.FormEvent) {
    e.preventDefault();
    // Full-text contributions must go through the anonymise → confirm steps.
    if (form.fullText.trim() && !preview) { runAnonymiser(); return; }
    if (preview && !confirmed) { setError('Tick the confirmation box after reviewing the redactions.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          court: form.court || undefined,
          outcome: form.outcome || undefined,
          excerpt: form.excerpt || undefined,
          tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          anonymisedText: preview?.anonymisedText || undefined,
          rawText: preview ? form.fullText : undefined,
          confirmedRedactions: confirmed || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not add to library.');
      } else if (data.held) {
        setNotice(data.reason);
        setForm({ title: '', court: '', outcome: '', excerpt: '', tags: '', fullText: '' });
        setPreview(null); setConfirmed(false);
      } else {
        setItems((prev) => [data.item as LibItem, ...prev]);
        setForm({ title: '', court: '', outcome: '', excerpt: '', tags: '', fullText: '' });
        setPreview(null); setConfirmed(false);
        setShowForm(false);
        if (data.creditsAwarded) setNotice(`Published! +${data.creditsAwarded} contributor credit awarded.`);
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="search" style={{ maxWidth: '100%', marginBottom: 14, padding: '12px 16px' }}>
        <IconSearch />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cheque bounce limitation period notice…" />
      </div>

      <div className="gap8 wrap" style={{ marginBottom: 20 }}>
        {LIB_FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <button
          className="chip"
          style={{ marginLeft: 'auto', borderColor: 'var(--brand)', color: 'var(--brand)' }}
          onClick={() => setShowForm((s) => !s)}
        >
          <IconPlus width={14} height={14} /> Add to library
        </button>
      </div>

      {showForm && (
        <form className="card" style={{ padding: 18, marginBottom: 20 }} onSubmit={contribute}>
          <div className="section-title" style={{ margin: '0 0 12px' }}><h2 style={{ fontSize: 16 }}>Contribute a draft</h2></div>
          <div className="field"><label>Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. §138 Legal Notice — Insufficient Funds" required /></div>
          <div className="grid cols-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label>Court / State</label>
              <input value={form.court} onChange={(e) => setForm({ ...form, court: e.target.value })} placeholder="Kerala HC" /></div>
            <div className="field"><label>Outcome</label>
              <input value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} placeholder="Settled" /></div>
          </div>
          <div className="field"><label>Tags (comma-separated)</label>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="§138, Notice, Cheque Bounce" /></div>
          <div className="field"><label>Short description</label>
            <textarea rows={2} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} placeholder="What this draft is and when to use it." /></div>
          <div className="field"><label>Full draft text (optional — runs the PII anonymiser)</label>
            <textarea rows={5} value={form.fullText}
              onChange={(e) => { setForm({ ...form, fullText: e.target.value }); setPreview(null); setConfirmed(false); }}
              placeholder="Paste the filed draft. Names, phone numbers, cheque/case numbers, Aadhaar/PAN etc. are auto-redacted before anything is shared." /></div>

          {preview && (
            <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--brand-soft)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                PII anonymiser — {preview.report.length} redaction{preview.report.length === 1 ? '' : 's'}
              </div>
              {preview.report.length > 0 ? (
                <div style={{ fontSize: 12.5, marginBottom: 8, maxHeight: 140, overflowY: 'auto' }}>
                  {preview.report.map((r, i) => (
                    <div key={i}><s className="muted">{r.original}</s> → <b>{r.replacement}</b> <span className="muted">({r.kind})</span></div>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>No PII patterns detected — please still read the preview carefully.</div>
              )}
              <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto', background: 'var(--bg)', padding: 10, borderRadius: 8, marginBottom: 10 }}>
                {preview.anonymisedText}
              </div>
              <label style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                <span>I have reviewed the redactions. I remain responsible for my client&apos;s confidentiality and consent to sharing this anonymised draft with the community.</span>
              </label>
            </div>
          )}

          {error && <div className="callout warn" style={{ padding: 12, marginBottom: 12 }}><div className="muted" style={{ fontSize: 12.5 }}>{error}</div></div>}
          {notice && <div className="callout" style={{ padding: 12, marginBottom: 12 }}><div style={{ fontSize: 12.5 }}>{notice}</div></div>}
          <button className="cta brand" type="submit" disabled={saving}>
            {saving ? 'Working…'
              : form.fullText.trim() && !preview ? 'Anonymise & preview'
              : preview ? 'Contribute (publishes after checks)'
              : 'Add to library'}
          </button>
        </form>
      )}

      {!showForm && notice && (
        <div className="callout" style={{ padding: 12, marginBottom: 16 }}><div style={{ fontSize: 12.5 }}>{notice}</div></div>
      )}

      <div className="grid cols-3" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {results.map((it) => <Card key={it.id} it={it} />)}

        <button
          className="card lib-card"
          style={{ background: 'var(--brand-soft)', borderColor: 'var(--brand)', alignItems: 'flex-start', justifyContent: 'center' }}
          onClick={() => setShowForm(true)}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
            <IconPlus style={{ color: 'var(--on-brand)' }} />
          </div>
          <div className="lt" style={{ color: 'var(--brand)' }}>Contribute your draft</div>
          <div className="excerpt">Share an anonymised draft you&apos;ve filed. Earn credits &amp; help the community.</div>
        </button>

        {results.length === 0 && (
          <div className="muted" style={{ padding: 20 }}>No results. Try a different search or filter.</div>
        )}
      </div>
    </>
  );
}

function Card({ it }: { it: LibItem }) {
  const isDraft = it.kind === 'draft';
  return (
    <div className="card lib-card" style={isDraft ? { borderColor: 'var(--accent)' } : undefined}>
      <span className={`tag ${isDraft ? 't-accent' : 't-brand'}`} style={{ alignSelf: 'flex-start' }}>
        {isDraft ? '📝 Community Draft' : `⚖️ ${it.court}`}
      </span>
      <div className="lt">{it.title}</div>
      <div className="meta">
        {it.citation && <span>{it.citation}</span>}
        {it.author && <span>by {it.author}</span>}
        {it.outcome && <span>· Outcome: {it.outcome}</span>}
        {!it.citation && !it.author && <span>{it.court}</span>}
      </div>
      <div className="excerpt">{it.excerpt}</div>
      <div className="foot">
        {it.verified && <span className="tag t-success">✓ {isDraft ? 'PII removed' : 'Verified'}</span>}
        {it.sourceUrl && (
          <a href={it.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>Verify ↗</a>
        )}
        <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
          {isDraft ? `Used ${it.uses ?? 0}×` : `Cited ${it.cited ?? 0}×`}
        </span>
      </div>
    </div>
  );
}
