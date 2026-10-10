'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { DbLibraryItem, DbLibraryItemBlock, HighlightDTO, HighlightLinkType } from '@/lib/supabase/types';
import {
  IconDownload, IconPrinter, IconHighlighter, IconLink, IconExternal,
  IconTrash, IconX, IconRename, IconChevron,
} from '@/components/Icons';

const PAGE_SIZE = 100; // blocks per page — keeps very long judgments from rendering thousands of DOM nodes at once

type Pending = { blockId: string; start: number; end: number; quote: string; top: number; left: number };

/** Character offset of (node, offset) relative to container's text content, ignoring element boundaries. */
function textOffset(container: Node, node: Node, offset: number): number {
  let total = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let cur = walker.nextNode();
  while (cur) {
    if (cur === node) return total + offset;
    total += cur.textContent?.length ?? 0;
    cur = walker.nextNode();
  }
  return total;
}

function closestBlock(node: Node): HTMLElement | null {
  const el = node instanceof Element ? node : node.parentElement;
  return (el?.closest('[data-block-id]') as HTMLElement | null) ?? null;
}

function renderBlockContent(
  text: string,
  blockHighlights: HighlightDTO[],
  activeId: string | null,
  onClick: (id: string) => void,
) {
  if (blockHighlights.length === 0) return text;
  const sorted = [...blockHighlights].sort((a, b) => a.startOffset - b.startOffset);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((h) => {
    const s = Math.max(h.startOffset, cursor);
    const e = Math.min(h.endOffset, text.length);
    if (e <= s) return;
    if (s > cursor) nodes.push(text.slice(cursor, s));
    nodes.push(
      <mark
        key={h.id}
        className={`hl${activeId === h.id ? ' hl-active' : ''}`}
        data-highlight-id={h.id}
        onClick={(ev) => { ev.stopPropagation(); onClick(h.id); }}
      >
        {text.slice(s, e)}
      </mark>,
    );
    cursor = e;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export default function JudgmentDetail({
  item, blocks, initialHighlights, loggedIn,
}: {
  item: DbLibraryItem;
  blocks: DbLibraryItemBlock[];
  initialHighlights: HighlightDTO[];
  loggedIn: boolean;
}) {
  const [highlights, setHighlights] = useState<HighlightDTO[]>(initialHighlights);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [page, setPage] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [matters, setMatters] = useState<{ id: string; title: string }[]>([]);
  const docRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(blocks.length / PAGE_SIZE));
  const pageBlocks = blocks.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const blockIndex = useMemo(() => new Map(blocks.map((b, i) => [b.id, i])), [blocks]);
  const highlightsByBlock = useMemo(() => {
    const m = new Map<string, HighlightDTO[]>();
    highlights.forEach((h) => m.set(h.blockId, [...(m.get(h.blockId) ?? []), h]));
    return m;
  }, [highlights]);
  const active = highlights.find((h) => h.id === activeId) ?? null;

  useEffect(() => {
    if (!loggedIn) return;
    fetch('/api/matters').then((r) => r.json()).then((d) => setMatters(d.matters ?? [])).catch(() => {});
  }, [loggedIn]);

  // Watch the live selection; show a small "Highlight" button near it when it's a
  // clean, single-block selection. Clears itself on an empty/collapsed selection.
  useEffect(() => {
    if (!loggedIn) return;
    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPending(null); return; }
      const range = sel.getRangeAt(0);
      const docEl = docRef.current;
      if (!docEl || !docEl.contains(range.commonAncestorContainer)) { setPending(null); return; }
      const startBlock = closestBlock(range.startContainer);
      const endBlock = closestBlock(range.endContainer);
      if (!startBlock || startBlock !== endBlock) { setPending(null); return; }
      const start = textOffset(startBlock, range.startContainer, range.startOffset);
      const end = textOffset(startBlock, range.endContainer, range.endOffset);
      const quote = sel.toString().trim();
      if (end <= start || !quote) { setPending(null); return; }
      const rect = range.getBoundingClientRect();
      setPending({ blockId: startBlock.dataset.blockId!, start, end, quote, top: rect.top - 44, left: rect.left });
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [loggedIn]);

  async function createHighlightFromPending() {
    if (!pending) return;
    const body = { blockId: pending.blockId, startOffset: pending.start, endOffset: pending.end, quoteText: pending.quote };
    window.getSelection()?.removeAllRanges();
    setPending(null);
    try {
      const res = await fetch(`/api/library/${item.id}/highlights`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { console.error(data.error); return; }
      const h = data.highlight;
      const dto: HighlightDTO = {
        id: h.id, blockId: h.block_id, matterId: h.matter_id, startOffset: h.start_offset,
        endOffset: h.end_offset, quoteText: h.quote_text, color: h.color, createdAt: h.created_at,
        notes: [], links: [],
      };
      setHighlights((prev) => [...prev, dto]);
      setActiveId(dto.id);
    } catch (err) {
      console.error('Create highlight failed:', err);
    }
  }

  function openHighlight(id: string) {
    setActiveId(id);
    const h = highlights.find((x) => x.id === id);
    if (!h) return;
    const idx = blockIndex.get(h.blockId);
    if (idx != null) {
      const targetPage = Math.floor(idx / PAGE_SIZE);
      if (targetPage !== page) setPage(targetPage);
    }
    requestAnimationFrame(() => {
      document.querySelector(`[data-highlight-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function deleteActiveHighlight() {
    if (!active) return;
    const res = await fetch(`/api/highlights/${active.id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setHighlights((prev) => prev.filter((h) => h.id !== active.id));
    setActiveId(null);
  }

  async function setActiveMatter(matterId: string | null) {
    if (!active) return;
    setHighlights((prev) => prev.map((h) => (h.id === active.id ? { ...h, matterId } : h)));
    await fetch(`/api/highlights/${active.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matterId }),
    });
  }

  async function downloadPdf() {
    setPdfBusy(true); setPdfError('');
    try {
      const res = await fetch(`/api/library/${item.id}/pdf`);
      const data = await res.json();
      if (!res.ok) { setPdfError(data.error || 'No PDF available for this item.'); return; }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      setPdfError('Network error — please try again.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <>
      <div className="case-head no-print">
        <Link href="/library" className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <IconChevron width={13} height={13} style={{ transform: 'rotate(180deg)' }} /> Back to library
        </Link>
        <div className="case-head-row">
          <div style={{ minWidth: 0 }}>
            <h1>{item.title}</h1>
            <p className="case-meta">
              {item.court || item.kind}{item.citation ? ` · ${item.citation}` : ''}{item.year ? ` · ${item.year}` : ''}
              {!loggedIn && ' · Sign in to highlight text, add notes and links.'}
            </p>
          </div>
          <div className="case-actions">
            <button className="chip" onClick={downloadPdf} disabled={pdfBusy}>
              <IconDownload width={14} height={14} /> {pdfBusy ? 'Preparing…' : 'Download PDF'}
            </button>
            <button className="chip" onClick={() => window.print()}><IconPrinter width={14} height={14} /> Print</button>
          </div>
        </div>
        {pdfError && <div className="callout warn" style={{ padding: 10, marginTop: 10 }}><div className="muted" style={{ fontSize: 12 }}>{pdfError}</div></div>}
      </div>

      <div className="review-grid">
      <div className="card docview scroll" ref={docRef}>
        {pageBlocks.length === 0 && (
          <p className="muted">
            {item.full_text
              ? item.full_text
              : 'No extracted text is available for this item yet.'}
          </p>
        )}

        {pageBlocks.map((b) => (
          <p key={b.id} data-block-id={b.id} className="docblock">
            {renderBlockContent(b.text, highlightsByBlock.get(b.id) ?? [], activeId, openHighlight)}
          </p>
        ))}

        {totalPages > 1 && (
          <div className="flexb no-print" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <button className="chip" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Previous</button>
            <span className="muted" style={{ fontSize: 12 }}>Page {page + 1} of {totalPages}</span>
            <button className="chip" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next →</button>
          </div>
        )}
      </div>

      <div className="card chatpanel no-print">
        {!loggedIn ? (
          <div style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Highlights & notes</div>
            <p className="muted" style={{ fontSize: 12.5 }}>Sign in to select text in this judgment and add highlights, notes and hyperlinks.</p>
          </div>
        ) : active ? (
          <HighlightPanel
            key={active.id}
            highlight={active}
            matters={matters}
            onBack={() => setActiveId(null)}
            onDelete={deleteActiveHighlight}
            onSetMatter={setActiveMatter}
            onPatch={(patch) => setHighlights((prev) => prev.map((h) => (h.id === active.id ? { ...h, ...patch } : h)))}
          />
        ) : (
          <div style={{ padding: 16, overflowY: 'auto' }} className="scroll">
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Highlights & notes</div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Select any text on the left to highlight it, then add notes or links here.</p>
            {highlights.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5 }}>No highlights yet on this document.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {highlights.map((h) => (
                  <div key={h.id} className="hl-item" onClick={() => openHighlight(h.id)}>
                    <div className="quote">&ldquo;{h.quoteText.slice(0, 160)}{h.quoteText.length > 160 ? '…' : ''}&rdquo;</div>
                    <div className="hl-counts">
                      <span>{h.notes.length} note{h.notes.length === 1 ? '' : 's'}</span>
                      <span>{h.links.length} link{h.links.length === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {pending && (
        <button className="sel-toolbar" style={{ top: pending.top, left: pending.left }} onClick={createHighlightFromPending}>
          <IconHighlighter width={14} height={14} /> Highlight
        </button>
      )}
    </>
  );
}

// ============================================================
// Sidebar: one highlight's notes + links (add / view / modify)
// ============================================================

function HighlightPanel({
  highlight, matters, onBack, onDelete, onSetMatter, onPatch,
}: {
  highlight: HighlightDTO;
  matters: { id: string; title: string }[];
  onBack: () => void;
  onDelete: () => void;
  onSetMatter: (matterId: string | null) => void;
  onPatch: (patch: Partial<HighlightDTO>) => void;
}) {
  const [noteText, setNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  async function addNote() {
    const body = noteText.trim();
    if (!body) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/highlights/${highlight.id}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      onPatch({ notes: [...highlight.notes, { id: data.note.id, body: data.note.body, createdAt: data.note.created_at, updatedAt: data.note.updated_at }] });
      setNoteText('');
    } finally {
      setSavingNote(false);
    }
  }

  async function saveEditedNote(noteId: string) {
    const body = editingText.trim();
    if (!body) return;
    const res = await fetch(`/api/highlights/${highlight.id}/notes/${noteId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    });
    if (!res.ok) return;
    onPatch({ notes: highlight.notes.map((n) => (n.id === noteId ? { ...n, body } : n)) });
    setEditingNoteId(null);
  }

  async function deleteNote(noteId: string) {
    const res = await fetch(`/api/highlights/${highlight.id}/notes/${noteId}`, { method: 'DELETE' });
    if (!res.ok) return;
    onPatch({ notes: highlight.notes.filter((n) => n.id !== noteId) });
  }

  async function deleteLink(linkId: string) {
    const res = await fetch(`/api/highlights/${highlight.id}/links/${linkId}`, { method: 'DELETE' });
    if (!res.ok) return;
    onPatch({ links: highlight.links.filter((l) => l.id !== linkId) });
  }

  function addLinkResult(link: HighlightDTO['links'][number]) {
    onPatch({ links: [...highlight.links, link] });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="chat-head">
        <button className="icon-btn" onClick={onBack} title="Back to all highlights"><IconX width={16} height={16} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Highlight</div>
          <div className="muted" style={{ fontSize: 11 }}>notes &amp; links for this selection</div>
        </div>
        <button className="icon-btn danger" onClick={onDelete} title="Delete highlight"><IconTrash width={16} height={16} /></button>
      </div>

      <div className="chat-body scroll" style={{ display: 'block' }}>
        <div className="quote" style={{ marginBottom: 14 }}>&ldquo;{highlight.quoteText}&rdquo;</div>

        <div className="field">
          <label>File under matter</label>
          <select
            value={highlight.matterId ?? ''}
            onChange={(e) => onSetMatter(e.target.value || null)}
          >
            <option value="">— no matter —</option>
            {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>

        <div className="section-title" style={{ margin: '18px 0 8px' }}><h2 style={{ fontSize: 13 }}>Notes</h2></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {highlight.notes.map((n) => (
            <div key={n.id} className="note-item">
              {editingNoteId === n.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea rows={2} value={editingText} onChange={(e) => setEditingText(e.target.value)} />
                  <div className="gap8">
                    <button className="chip" onClick={() => saveEditedNote(n.id)}>Save</button>
                    <button className="chip" onClick={() => setEditingNoteId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  <div className="gap8" style={{ marginTop: 6 }}>
                    <button className="icon-btn" onClick={() => { setEditingNoteId(n.id); setEditingText(n.body); }} title="Edit"><IconRename width={13} height={13} /></button>
                    <button className="icon-btn danger" onClick={() => deleteNote(n.id)} title="Delete"><IconTrash width={13} height={13} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="field" style={{ marginBottom: 4 }}>
          <textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note on this selection…" />
        </div>
        <button className="cta brand block" disabled={savingNote || !noteText.trim()} onClick={addNote} style={{ marginBottom: 16 }}>
          Add note
        </button>

        <div className="section-title" style={{ margin: '4px 0 8px' }}><h2 style={{ fontSize: 13 }}>Links</h2></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {highlight.links.map((l) => {
            const linkText = l.label || l.targetTitle || (l.linkType === 'matter' ? 'Matter' : l.linkType === 'library_item' ? 'Library item' : l.externalUrl);
            const linkStyle: React.CSSProperties = { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
            return (
              <div key={l.id} className="link-item">
                {l.linkType === 'external' ? <IconExternal /> : <IconLink />}
                {l.linkType === 'external' && (
                  <a href={l.externalUrl ?? '#'} target="_blank" rel="noreferrer" style={linkStyle}>{linkText}</a>
                )}
                {l.linkType === 'library_item' && (
                  l.targetLibraryItemId
                    ? <Link href={`/library/${l.targetLibraryItemId}`} style={linkStyle} title="Open this library item">{linkText}</Link>
                    : <span style={linkStyle} className="muted">{linkText} (no longer available)</span>
                )}
                {l.linkType === 'matter' && (
                  l.targetMatterId
                    ? <Link href={`/matters/${l.targetMatterId}`} style={linkStyle} title="Open this matter">{linkText}</Link>
                    : <span style={linkStyle} className="muted">{linkText} (no longer available)</span>
                )}
                <button className="icon-btn danger" onClick={() => deleteLink(l.id)} title="Remove link"><IconTrash width={13} height={13} /></button>
              </div>
            );
          })}
        </div>
        <AddLinkForm highlightId={highlight.id} matters={matters} onAdded={addLinkResult} />
      </div>
    </div>
  );
}

function AddLinkForm({
  highlightId, matters, onAdded,
}: {
  highlightId: string;
  matters: { id: string; title: string }[];
  onAdded: (link: HighlightDTO['links'][number]) => void;
}) {
  const [linkType, setLinkType] = useState<HighlightLinkType>('external');
  const [label, setLabel] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [matterId, setMatterId] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [itemResults, setItemResults] = useState<{ id: string; title: string; court: string }[]>([]);
  const [itemPicked, setItemPicked] = useState<{ id: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (linkType !== 'library_item' || itemPicked) { setItemResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!itemQuery.trim()) { setItemResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/library?q=${encodeURIComponent(itemQuery)}&limit=5`);
      const data = await res.json().catch(() => null);
      if (data?.items) setItemResults(data.items);
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemQuery, linkType, itemPicked]);

  async function submit() {
    setError('');
    let payload: Record<string, unknown>;
    if (linkType === 'external') {
      if (!externalUrl.trim()) { setError('Enter a URL.'); return; }
      payload = { linkType, label: label || undefined, externalUrl: externalUrl.trim() };
    } else if (linkType === 'library_item') {
      if (!itemPicked) { setError('Search and pick a judgment/draft.'); return; }
      payload = { linkType, label: label || undefined, targetLibraryItemId: itemPicked.id };
    } else {
      if (!matterId) { setError('Pick a matter.'); return; }
      payload = { linkType, label: label || undefined, targetMatterId: matterId };
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/highlights/${highlightId}/links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error || 'Could not add link.'); return; }
      const l = data.link;
      onAdded({
        id: l.id, linkType: l.link_type, label: l.label, externalUrl: l.external_url,
        targetLibraryItemId: l.target_library_item_id, targetMatterId: l.target_matter_id,
        targetTitle: itemPicked?.title ?? matters.find((m) => m.id === matterId)?.title ?? null,
      });
      setLabel(''); setExternalUrl(''); setMatterId(''); setItemQuery(''); setItemPicked(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 12, background: 'var(--surface-2)' }}>
      <div className="gap8 wrap" style={{ marginBottom: 8 }}>
        {(['external', 'library_item', 'matter'] as HighlightLinkType[]).map((t) => (
          <button key={t} type="button" className={`chip ${linkType === t ? 'on' : ''}`}
            onClick={() => { setLinkType(t); setError(''); }}>
            {t === 'external' ? 'External URL' : t === 'library_item' ? 'Library item' : 'My matter'}
          </button>
        ))}
      </div>

      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" style={{ marginBottom: 8, width: '100%', border: '1px solid var(--line-2)', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, background: 'var(--surface)' }} />

      {linkType === 'external' && (
        <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…"
          style={{ marginBottom: 8, width: '100%', border: '1px solid var(--line-2)', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, background: 'var(--surface)' }} />
      )}

      {linkType === 'library_item' && (
        <div className="search-suggest" style={{ marginBottom: 8 }}>
          <input
            value={itemPicked ? itemPicked.title : itemQuery}
            onChange={(e) => { setItemPicked(null); setItemQuery(e.target.value); }}
            placeholder="Search judgments / drafts…"
            style={{ width: '100%', border: '1px solid var(--line-2)', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, background: 'var(--surface)' }}
          />
          {itemResults.length > 0 && !itemPicked && (
            <div className="search-suggest-list">
              {itemResults.map((r) => (
                <button key={r.id} type="button" className="search-suggest-opt"
                  onClick={() => { setItemPicked({ id: r.id, title: r.title }); setItemResults([]); }}>
                  {r.title} <span className="muted">· {r.court}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {linkType === 'matter' && (
        <select value={matterId} onChange={(e) => setMatterId(e.target.value)} style={{ marginBottom: 8, width: '100%' }}>
          <option value="">— pick a matter —</option>
          {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      )}

      {error && <div className="muted" style={{ fontSize: 11.5, color: 'var(--danger)', marginBottom: 6 }}>{error}</div>}
      <button className="chip" onClick={submit} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
        <IconLink width={13} height={13} /> {saving ? 'Adding…' : 'Add link'}
      </button>
    </div>
  );
}
