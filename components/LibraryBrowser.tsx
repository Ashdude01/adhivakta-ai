'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIB_KIND_TABS, LibItem } from '@/lib/data/cases';
import { COURT_GROUPS, OTHER_COURT_LABEL } from '@/lib/data/indianCourts';
import {
  IconSearch, IconPlus, IconChevron, IconX, IconCheck,
  IconScale, IconPen, IconBuilding, IconCalendar, IconFilter,
} from '@/components/Icons';

type PiiFinding = { kind: string; original: string; replacement: string };
type Sort = 'recent' | 'cited' | 'year';

const PAGE_SIZE = 24;
const CURRENT_YEAR = new Date().getFullYear();

type Filters = {
  q: string;
  kind: '' | 'judgment' | 'draft';
  courts: string[];
  yearFrom: string;
  yearTo: string;
  sort: Sort;
};

const EMPTY_FILTERS: Filters = { q: '', kind: '', courts: [], yearFrom: '', yearTo: '', sort: 'recent' };

function buildParams(f: Filters, offset: number) {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.kind) params.set('kind', f.kind);
  f.courts.forEach((c) => params.append('court', c));
  if (f.yearFrom.trim()) params.set('yearFrom', f.yearFrom.trim());
  if (f.yearTo.trim()) params.set('yearTo', f.yearTo.trim());
  if (f.sort !== 'recent') params.set('sort', f.sort);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  return params;
}

const EMPTY_FORM = {
  kind: 'draft' as 'draft' | 'judgment',
  title: '', courtSelect: '', customCourt: '',
  citation: '', year: '', outcome: '', tags: '', excerpt: '', fullText: '',
};

export default function LibraryBrowser({ initialItems }: { initialItems: LibItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<LibItem[]>(initialItems);
  const [total, setTotal] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server-side search + filter — the corpus can run into the thousands after a
  // bulk ingest, so filtering only ever happens on the server, never on a
  // preloaded full list. A monotonically-increasing request id (not just an
  // AbortController) guards against an out-of-order response from an older
  // keystroke overwriting a newer one, since abort() has no effect on a
  // fetch that already settled.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(0), filters.q ? 300 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.kind, filters.courts.join('|'), filters.yearFrom, filters.yearTo, filters.sort]);

  async function runSearch(offset: number) {
    const myRequestId = ++requestIdRef.current;
    offset === 0 ? setLoading(true) : setLoadingMore(true);
    try {
      const res = await fetch(`/api/library?${buildParams(filters, offset)}`);
      const data = await res.json();
      if (myRequestId !== requestIdRef.current) return; // a newer search superseded this one
      if (!res.ok) return;
      setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
      setTotal(data.total ?? null);
    } catch (err) {
      if (myRequestId === requestIdRef.current) console.error('Library search failed:', err);
    } finally {
      if (myRequestId === requestIdRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }

  function openItem(id: string) {
    router.push(`/library/${id}`);
  }

  const filtersActive = !!filters.kind || filters.courts.length > 0 || !!filters.yearFrom || !!filters.yearTo || filters.sort !== 'recent';

  const canLoadMore = total != null && items.length < total;

  return (
    <>
      <div className="lib-toolbar">
        <div className="search" style={{ flex: 1 }}>
          <IconSearch />
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search by case name, citation, section, keyword…"
          />
          {filters.q && (
            <button className="icon-btn" onClick={() => setFilters((f) => ({ ...f, q: '' }))} aria-label="Clear search">
              <IconX width={13} height={13} />
            </button>
          )}
        </div>
        <button className="cta brand" onClick={() => setShowForm(true)}>
          <IconPlus width={15} height={15} /> Add case
        </button>
      </div>

      <LibraryFilters filters={filters} setFilters={setFilters} filtersActive={filtersActive} />

      <div className="lib-summary muted">
        {loading && items.length === 0 ? 'Searching…' : total != null ? `${total.toLocaleString('en-IN')} result${total === 1 ? '' : 's'}` : ''}
      </div>

      <div className="grid cols-3 lib-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {items.map((it) => <Card key={it.id} it={it} onOpen={() => openItem(it.id)} />)}

        {!loading && items.length === 0 && (
          <div className="lib-empty muted">
            No results. Try a different search, or widen your court/year filters.
          </div>
        )}
      </div>

      {loading && items.length > 0 && <div className="muted" style={{ padding: '16px 4px', fontSize: 12.5 }}>Searching…</div>}

      {!loading && canLoadMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <button className="chip" onClick={() => runSearch(items.length)} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load more (${items.length} of ${total})`}
          </button>
        </div>
      )}

      {showForm && (
        <AddCaseModal
          onClose={() => setShowForm(false)}
          onAdded={(item) => { setItems((prev) => [item, ...prev]); setTotal((t) => (t == null ? t : t + 1)); }}
        />
      )}
    </>
  );
}

// ============================================================
// Filter bar — kind tabs, multi-select court popover, year-range
// popover, sort. Industry-standard pattern: popovers hold the
// detailed controls so the bar itself stays to one compact row.
// ============================================================

function LibraryFilters({
  filters, setFilters, filtersActive,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  filtersActive: boolean;
}) {
  const [openPopover, setOpenPopover] = useState<'court' | 'year' | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenPopover(null);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpenPopover(null); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onEsc); };
  }, []);

  const courtLabel = filters.courts.length === 0
    ? 'All courts'
    : filters.courts.length === 1 ? filters.courts[0] : `${filters.courts.length} courts`;

  const yearLabel = filters.yearFrom || filters.yearTo
    ? `${filters.yearFrom || 'Any'}–${filters.yearTo || 'Any'}`
    : 'Any year';

  return (
    <div className="lib-filters" ref={rootRef}>
      <div className="gap8 wrap" style={{ flex: 1 }}>
        {LIB_KIND_TABS.map((t) => (
          <button
            key={t.value}
            className={`chip ${filters.kind === t.value ? 'on' : ''}`}
            onClick={() => setFilters((f) => ({ ...f, kind: t.value }))}
          >
            {t.label}
          </button>
        ))}

        <div className="filter-pop-wrap">
          <button
            className={`chip filter-trigger ${filters.courts.length > 0 ? 'on' : ''}`}
            onClick={() => setOpenPopover((p) => (p === 'court' ? null : 'court'))}
          >
            <IconBuilding width={13} height={13} /> {courtLabel}
            <IconChevron width={11} height={11} style={{ transform: openPopover === 'court' ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
          </button>
          {openPopover === 'court' && (
            <CourtPopover
              selected={filters.courts}
              onChange={(courts) => setFilters((f) => ({ ...f, courts }))}
              onClose={() => setOpenPopover(null)}
            />
          )}
        </div>

        <div className="filter-pop-wrap">
          <button
            className={`chip filter-trigger ${(filters.yearFrom || filters.yearTo) ? 'on' : ''}`}
            onClick={() => setOpenPopover((p) => (p === 'year' ? null : 'year'))}
          >
            <IconCalendar width={13} height={13} /> {yearLabel}
            <IconChevron width={11} height={11} style={{ transform: openPopover === 'year' ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
          </button>
          {openPopover === 'year' && (
            <YearPopover
              yearFrom={filters.yearFrom}
              yearTo={filters.yearTo}
              onChange={(yearFrom, yearTo) => setFilters((f) => ({ ...f, yearFrom, yearTo }))}
            />
          )}
        </div>

        {filtersActive && (
          <button className="chip" onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }))} style={{ color: 'var(--text-muted)' }}>
            <IconX width={12} height={12} /> Clear filters
          </button>
        )}
      </div>

      <label className="sort-select">
        <IconFilter width={12} height={12} />
        <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as Sort }))}>
          <option value="recent">Newest first</option>
          <option value="year">Year decided</option>
          <option value="cited">Most cited</option>
        </select>
      </label>
    </div>
  );
}

function CourtPopover({ selected, onChange, onClose }: { selected: string[]; onChange: (courts: string[]) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const groups = COURT_GROUPS
    .map((g) => ({ ...g, courts: g.courts.filter((c) => c.toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.courts.length > 0);

  function toggle(court: string) {
    onChange(selected.includes(court) ? selected.filter((c) => c !== court) : [...selected, court]);
  }

  return (
    <div className="filter-pop">
      <div className="filter-pop-search">
        <IconSearch width={13} height={13} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a court…" />
      </div>
      <div className="filter-pop-list">
        {groups.length === 0 && <div className="muted" style={{ padding: '10px 12px', fontSize: 12.5 }}>No matching court.</div>}
        {groups.map((g) => (
          <div key={g.label} className="filter-pop-group">
            <div className="filter-pop-group-label">{g.label}</div>
            {g.courts.map((c) => (
              <label key={c} className="filter-pop-item">
                <span className={`chk ${selected.includes(c) ? 'on' : ''}`}>{selected.includes(c) && <IconCheck width={10} height={10} />}</span>
                <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} style={{ display: 'none' }} />
                {c}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="filter-pop-foot">
        <button className="link" onClick={() => onChange([])} disabled={selected.length === 0}>Clear</button>
        <button className="link" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function YearPopover({ yearFrom, yearTo, onChange }: { yearFrom: string; yearTo: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="filter-pop" style={{ width: 240 }}>
      <div style={{ padding: 14 }}>
        <div className="gap8" style={{ alignItems: 'center' }}>
          <input
            type="number" inputMode="numeric" placeholder="From" min={1950} max={CURRENT_YEAR}
            value={yearFrom} onChange={(e) => onChange(e.target.value, yearTo)}
            style={{ width: '100%' }}
          />
          <span className="muted">–</span>
          <input
            type="number" inputMode="numeric" placeholder="To" min={1950} max={CURRENT_YEAR}
            value={yearTo} onChange={(e) => onChange(yearFrom, e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div className="gap8 wrap" style={{ marginTop: 10 }}>
          <button type="button" className="chip" onClick={() => onChange(String(CURRENT_YEAR - 1), '')}>Last year</button>
          <button type="button" className="chip" onClick={() => onChange(String(CURRENT_YEAR - 5), '')}>Last 5 yrs</button>
          <button type="button" className="chip" onClick={() => onChange('', '')}>Any time</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Case card — minimalist: kind + court, title, citation/year
// (what a lawyer needs to cite it), a short excerpt, then tags
// and the social-proof footer.
// ============================================================

function Card({ it, onOpen }: { it: LibItem; onOpen: () => void }) {
  const isDraft = it.kind === 'draft';
  return (
    <div
      className="card lib-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      <div className="lib-card-top">
        <span className={`tag ${isDraft ? 't-accent' : 't-brand'}`}>
          {isDraft ? <><IconPen width={11} height={11} /> Draft</> : <><IconScale width={11} height={11} /> Judgment</>}
        </span>
        {it.verified && <span className="tag t-success"><IconCheck width={11} height={11} /></span>}
      </div>

      <div className="lt">{it.title}</div>

      <div className="meta">
        <IconBuilding width={12} height={12} style={{ flexShrink: 0, opacity: .6 }} />
        <span>{it.court || 'Court not specified'}</span>
        {it.citation && <span>· {it.citation}</span>}
        {it.year && <span>· {it.year}</span>}
      </div>

      <div className="excerpt">{it.excerpt || 'No description yet.'}</div>

      {it.tags.length > 0 && (
        <div className="gap8 wrap" style={{ marginTop: 2 }}>
          {it.tags.slice(0, 3).map((t) => <span key={t} className="tag t-grey">{t}</span>)}
          {it.tags.length > 3 && <span className="muted" style={{ fontSize: 11 }}>+{it.tags.length - 3}</span>}
        </div>
      )}

      <div className="foot">
        {isDraft && it.author && <span className="muted" style={{ fontSize: 11 }}>by {it.author}</span>}
        {isDraft && it.outcome && <span className="muted" style={{ fontSize: 11 }}>· {it.outcome}</span>}
        {it.sourceUrl && (
          <a href={it.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }} onClick={(e) => e.stopPropagation()}>
            Source ↗
          </a>
        )}
        <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
          {isDraft ? `Used ${it.uses ?? 0}×` : `Cited ${it.cited ?? 0}×`}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Add case — modal. Robust court picker (every Indian court,
// grouped), explicit Judgment/Draft type (judgments skip the PII
// pipeline — they're public documents), citation + year fields.
// ============================================================

function AddCaseModal({ onClose, onAdded }: { onClose: () => void; onAdded: (item: LibItem) => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ anonymisedText: string; report: PiiFinding[] } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setError('');

    const resolvedCourt = form.courtSelect === OTHER_COURT_LABEL ? form.customCourt.trim() : form.courtSelect;
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (form.courtSelect === OTHER_COURT_LABEL && !resolvedCourt) { setError('Please specify the court name.'); return; }

    // Full-text draft contributions must go through the anonymise → confirm steps.
    if (form.kind === 'draft' && form.fullText.trim() && !preview) { runAnonymiser(); return; }
    if (form.kind === 'draft' && preview && !confirmed) { setError('Tick the confirmation box after reviewing the redactions.'); return; }

    setSaving(true); setNotice('');
    try {
      const yearNum = form.year.trim() ? parseInt(form.year, 10) : undefined;
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: form.kind,
          title: form.title.trim(),
          court: resolvedCourt || undefined,
          citation: form.citation.trim() || undefined,
          year: Number.isFinite(yearNum) ? yearNum : undefined,
          outcome: form.outcome.trim() || undefined,
          excerpt: form.excerpt.trim() || undefined,
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
        setForm(EMPTY_FORM);
        setPreview(null); setConfirmed(false);
      } else {
        onAdded(data.item as LibItem);
        onClose();
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal card">
        <div className="modal-head">
          <h2>Add to library</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconX width={16} height={16} /></button>
        </div>

        <form onSubmit={contribute} className="modal-body">
          <div className="gap8" style={{ marginBottom: 16 }}>
            <button type="button" className={`chip ${form.kind === 'draft' ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, kind: 'draft' }))}>
              <IconPen width={13} height={13} /> Practitioner draft
            </button>
            <button type="button" className={`chip ${form.kind === 'judgment' ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, kind: 'judgment' }))}>
              <IconScale width={13} height={13} /> Judgment
            </button>
          </div>

          <div className="field">
            <label>Title</label>
            <input
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={form.kind === 'judgment' ? 'e.g. Dashrath Rupsingh Rathod v. State of Maharashtra' : 'e.g. §138 Legal Notice — Insufficient Funds'}
              required
            />
          </div>

          <div className="grid cols-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label>Court</label>
              <select
                value={form.courtSelect}
                onChange={(e) => setForm({ ...form, courtSelect: e.target.value })}
              >
                <option value="">Select court…</option>
                {COURT_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.courts.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Year decided / filed</label>
              <input
                type="number" inputMode="numeric" min={1950} max={CURRENT_YEAR}
                value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder={String(CURRENT_YEAR)}
              />
            </div>
          </div>

          {form.courtSelect === OTHER_COURT_LABEL && (
            <div className="field">
              <label>Specify court</label>
              <input
                value={form.customCourt} onChange={(e) => setForm({ ...form, customCourt: e.target.value })}
                placeholder="e.g. Patiala House District Court, New Delhi" required
              />
            </div>
          )}

          <div className="grid cols-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label>Citation <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              <input
                value={form.citation} onChange={(e) => setForm({ ...form, citation: e.target.value })}
                placeholder="(2024) 3 SCC 1"
              />
            </div>
            <div className="field">
              <label>Outcome <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              <input
                value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                placeholder={form.kind === 'judgment' ? 'Allowed / Dismissed' : 'Settled / Granted'}
              />
            </div>
          </div>

          <div className="field">
            <label>Sections / tags <span className="muted" style={{ fontWeight: 400 }}>(comma-separated)</span></label>
            <input
              value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="§138, Notice, Cheque Bounce"
            />
          </div>

          <div className="field">
            <label>Short description</label>
            <textarea
              rows={2} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              placeholder={form.kind === 'judgment' ? 'What this judgment holds, in one or two lines.' : 'What this draft is and when to use it.'}
            />
          </div>

          {form.kind === 'draft' && (
            <div className="field">
              <label>Full draft text <span className="muted" style={{ fontWeight: 400 }}>(optional — runs the PII anonymiser)</span></label>
              <textarea
                rows={5} value={form.fullText}
                onChange={(e) => { setForm({ ...form, fullText: e.target.value }); setPreview(null); setConfirmed(false); }}
                placeholder="Paste the filed draft. Names, phone numbers, cheque/case numbers, Aadhaar/PAN etc. are auto-redacted before anything is shared."
              />
            </div>
          )}

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

          <div className="modal-foot">
            <button type="button" className="chip" onClick={onClose}>Cancel</button>
            <button className="cta brand" type="submit" disabled={saving}>
              {saving ? 'Working…'
                : form.kind === 'draft' && form.fullText.trim() && !preview ? 'Anonymise & preview'
                : preview ? 'Contribute (publishes after checks)'
                : 'Add to library'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
