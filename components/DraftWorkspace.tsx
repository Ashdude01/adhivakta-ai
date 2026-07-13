'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconSpark, IconDownload, IconFilePdf, IconSign, IconStop } from '@/components/Icons';
import ModelPicker, { type Selection } from '@/components/ModelPicker';
import MatterPicker, { type MatterOption } from '@/components/MatterPicker';
import { readSse } from '@/lib/sseClient';
import { lineDiff, diffStat } from '@/lib/diff';
import { isNoticeDocType } from '@/lib/legal/noticeStandards';
import { missingForNotice } from '@/lib/legal/letterhead';

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

/** Inline actions. `whole` commands ignore any selection. */
const COMMANDS = [
  { label: 'Make stronger', whole: false },
  { label: 'Simplify the language', whole: false },
  { label: 'Add an interest claim', whole: true },
  { label: 'Translate to हिन्दी', whole: true },
  { label: 'Shorten', whole: false },
  { label: 'Check and tighten citations', whole: true },
];

interface VerifierClaim { claim: string; source_kind: string; verified: boolean; verify_url: string | null; note?: string }
interface VerifierReport { checked: number; passed: number; failed: number; claims: VerifierClaim[] }
interface Version { id: string; version_no: number; content: string; source: string; provider: string | null; created_at: string }

type Tab = 'edit' | 'preview' | 'history';
// idle → thinking (request sent, no token yet) → writing (tokens flowing).
type Phase = 'idle' | 'thinking' | 'writing';

export default function DraftWorkspace() {
  const router = useRouter();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [form, setForm] = useState({
    docType: DOC_TYPES[0], client: '', opposite: '', amount: '', dates: '',
    language: 'English', matterId: '',
  });
  const [fromMatter, setFromMatter] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [model, setModel] = useState<Selection | null>(null);

  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const streaming = phase !== 'idle';
  const [error, setError] = useState('');
  const [meta, setMeta] = useState<{ provider: string; model: string; mock: boolean; fellBack?: boolean } | null>(null);
  const [report, setReport] = useState<VerifierReport | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [compareTo, setCompareTo] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('preview');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  // Letterhead fields a notice still needs, computed from the advocate's profile.
  const [letterheadMissing, setLetterheadMissing] = useState<string[]>([]);

  const dirty = text !== savedText && text.trim().length > 0;

  // Follow the text as it streams — but only while the reader is already at the
  // bottom. The moment they scroll up to re-read something, stop yanking them
  // back down (the behaviour ChatGPT and Claude both use).
  useEffect(() => {
    const el = previewRef.current;
    if (el && phase === 'writing' && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [text, phase]);

  function onPreviewScroll() {
    const el = previewRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  const loadVersions = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/drafts/${id}`);
      if (!res.ok) return;
      const d = await res.json();
      setVersions(d.versions ?? []);
    } catch { /* history is a nicety; never block the editor on it */ }
  }, []);

  useEffect(() => {
    fetch('/api/matters').then((r) => r.json()).then((d) => setMatters(d.matters ?? [])).catch(() => {});
    // Warn early if the letterhead is not notice-ready, before a notice is asked for.
    fetch('/api/profile').then((r) => r.json()).then((d) => {
      if (d.user) setLetterheadMissing(missingForNotice(d.user));
    }).catch(() => {});

    // Deep links from the matter folder: ?matter=<id> pre-selects the matter,
    // ?draft=<id> re-opens an existing draft with its version history.
    const query = new URLSearchParams(window.location.search);
    const linkedMatter = query.get('matter');
    if (linkedMatter) setForm((f) => ({ ...f, matterId: linkedMatter }));

    const linkedDraft = query.get('draft');
    if (!linkedDraft) return;
    fetch(`/api/drafts/${linkedDraft}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Draft not found'))))
      .then((d) => {
        const body = d.draft.body ?? '';
        setDraftId(d.draft.id);
        setText(body);
        setSavedText(body);
        setVersions(d.versions ?? []);
        if (d.draft.doc_type) setForm((f) => ({ ...f, docType: d.draft.doc_type }));
        if (d.draft.language) setForm((f) => ({ ...f, language: d.draft.language }));
        // The stored verdict belongs to the newest version.
        setReport(d.versions?.[0]?.verifier_report ?? null);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  // Selecting a matter fills the particulars intake already captured.
  useEffect(() => {
    if (!form.matterId) { setFromMatter(false); return; }
    let cancelled = false;
    fetch(`/api/matters/${form.matterId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((d) => {
        if (cancelled || !d.prefill) return;
        setForm((f) => ({ ...f, ...d.prefill }));
        setFromMatter(true);
      })
      .catch(() => { if (!cancelled) setFromMatter(false); });
    return () => { cancelled = true; };
  }, [form.matterId]);

  /** One code path for a fresh draft and for a revision — the server decides. */
  async function run(command?: { label: string; whole: boolean }) {
    if (streaming) return;
    const controller = new AbortController();
    abortRef.current = controller;
    stickToBottom.current = true;
    setPhase('thinking'); setError(''); setReport(null);

    const selection = command && !command.whole ? text.slice(sel.start, sel.end) : '';
    const revising = Boolean(command && text.trim());
    if (!revising) { setText(''); setTab('preview'); }

    let streamed = '';
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...form,
          matterId: form.matterId || null,
          instructions,
          provider: model?.provider,
          model: model?.model,
          ...(revising ? { draftId, baseText: text, selection, command: command!.label } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);

      if (revising) setText('');
      for await (const ev of readSse(res)) {
        if (ev.event === 'meta') setMeta(ev.data);
        else if (ev.event === 'delta') {
          // First token: leave the "thinking" state and start showing text.
          setPhase((p) => (p === 'thinking' ? 'writing' : p));
          streamed += ev.data.text;
          setText(streamed);
        }
        else if (ev.event === 'error') setError(ev.data.message);
        else if (ev.event === 'done') {
          if (ev.data.text) { streamed = ev.data.text; setText(streamed); }
          setSavedText(streamed);
          setReport(ev.data.verifierReport ?? null);
          if (ev.data.draftId) { setDraftId(ev.data.draftId); void loadVersions(ev.data.draftId); }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setPhase('idle');
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setPhase('idle');
  }

  async function saveEdit() {
    if (!draftId || !dirty) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not save');
      setSavedText(text);
      if (d.verifierReport) setReport(d.verifierReport);
      await loadVersions(draftId);
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  async function exportFile(format: 'docx' | 'pdf') {
    setExporting(true);
    try {
      const payload = { draftId, text, title: form.docType, format };
      let res = await fetch('/api/drafts/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        const info = await res.json();
        if (!window.confirm(`${info.message}\n\nExport anyway? Your override will be recorded in the audit log.`)) return;
        res = await fetch('/api/drafts/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, override: true }),
        });
      }
      if (!res.ok) throw new Error('export failed');
      download(await res.blob(), `${form.docType.replace(/[^\w\d ]+/g, '').slice(0, 50) || 'draft'}.${format}`);
    } catch {
      download(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'draft.txt');
    } finally { setExporting(false); }
  }

  const selectedVersion = versions.find((v) => v.version_no === compareTo);
  const previousVersion = selectedVersion
    ? versions.find((v) => v.version_no === selectedVersion.version_no - 1)
    : undefined;

  return (
    <div className="split">
      {/* ------------------------------------------------ intake + controls */}
      <div className="card" style={{ padding: 20 }}>
        <span className="tag t-brand" style={{ marginBottom: 14, display: 'inline-block' }}>Step 1 · Intake</span>

        <div className="field"><label>Document type</label>
          <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
            {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>

        {isNoticeDocType(form.docType) && letterheadMissing.length > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 14, borderColor: 'var(--accent)' }}>
            <div className="flexb">
              <span className="tag t-danger">Letterhead incomplete</span>
              <Link href="/profile" style={{ fontSize: 12.5 }}>Complete profile ↗</Link>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: 6 }}>
              A notice is issued under your letterhead. Missing: {letterheadMissing.join(', ')} — the draft will leave bracketed placeholders for these.
            </small>
          </div>
        )}

        <MatterPicker matters={matters} value={form.matterId}
          onChange={(id) => setForm((f) => ({ ...f, matterId: id }))} />

        {fromMatter && (
          <div className="card" style={{ padding: 12, marginBottom: 14 }}>
            <div className="flexb">
              <span className="tag t-success">✓ Particulars from the matter</span>
              <Link href={`/matters/${form.matterId}`} style={{ fontSize: 12.5 }}>Edit matter ↗</Link>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: 6 }}>
              The full cause title, addresses and case facts go to the AI — not just the names below.
            </small>
          </div>
        )}

        <fieldset disabled={fromMatter} style={{ border: 0, padding: 0, margin: 0, opacity: fromMatter ? 0.65 : 1 }}>
          <div className="field"><label>Your client (sender)</label>
            <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="e.g. Rajesh Sharma" /></div>
          <div className="field"><label>Opposite party</label>
            <input value={form.opposite} onChange={(e) => setForm({ ...form, opposite: e.target.value })} placeholder="e.g. Anil Kapoor" /></div>
          <div className="field"><label>Amount (₹)</label>
            <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="4,50,000" /></div>
          <div className="field"><label>Key dates</label>
            <input value={form.dates} onChange={(e) => setForm({ ...form, dates: e.target.value })} /></div>
        </fieldset>

        <div className="field"><label>Language</label>
          <div className="gap8 wrap">
            {['English', 'हिन्दी', 'मराठी'].map((l) => (
              <button key={l} type="button" className={`chip ${form.language === l ? 'on' : ''}`}
                onClick={() => setForm({ ...form, language: l })}>{l}</button>
            ))}
          </div>
        </div>

        <ModelPicker value={model} onChange={setModel} />

        <div className="field"><label>Extra instructions (optional)</label>
          <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. emphasise the dishonour memo" /></div>

        {streaming ? (
          <button className="cta block" onClick={stop}><IconStop width={14} height={14} /> Stop generating</button>
        ) : (
          <button className="cta brand block" onClick={() => run()}>
            <IconSpark /> {text ? 'Regenerate draft' : 'Generate draft'}
          </button>
        )}
      </div>

      {/* ---------------------------------------------------- document surface */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="flexb" style={{ padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
          <div className="gap8 wrap" style={{ display: 'flex' }}>
            {(['preview', 'edit', 'history'] as Tab[]).map((t) => (
              <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}
                disabled={t === 'history' && versions.length === 0}>
                {t === 'preview' ? 'Preview' : t === 'edit' ? 'Edit' : `History (${versions.length})`}
              </button>
            ))}
            {streaming && (
              <span className="writing-status">
                <span className="writing-dots"><i /><i /><i /></span>
                {phase === 'thinking' ? 'Thinking…' : 'Writing…'}
              </span>
            )}
            {dirty && !streaming && <span className="tag t-danger">Unsaved edits</span>}
            {report && report.checked > 0 && (
              report.failed === 0
                ? <span className="tag t-success">✓ {report.passed}/{report.checked} citations verified</span>
                : <span className="tag t-danger">⚠ {report.failed} unverified</span>
            )}
            {meta && (
              <span className="muted" style={{ fontSize: 12 }} title={meta.fellBack ? 'Your chosen model was busy; a free sibling wrote this instead.' : undefined}>
                {meta.mock ? 'offline demo' : `${meta.provider} · ${meta.model}`}{meta.fellBack ? ' (fallback)' : ''}
              </span>
            )}
          </div>
          <div className="gap8" style={{ display: 'flex' }}>
            {dirty && draftId && (
              <button className="cta" style={{ padding: '8px 13px' }} onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save version'}
              </button>
            )}
            <button className="tb-btn" style={{ width: 34, height: 34 }} onClick={() => exportFile('docx')}
              disabled={!text || exporting || streaming} title="Export Word (.docx)"><IconDownload /></button>
            <button className="tb-btn" style={{ width: 34, height: 34 }} onClick={() => exportFile('pdf')}
              disabled={!text || exporting || streaming} title="Export PDF"><IconFilePdf /></button>
            <button className="cta" style={{ padding: '8px 13px' }} disabled={!text || streaming}
              onClick={() => router.push(`/esign?${new URLSearchParams({ ...(form.matterId ? { matter: form.matterId } : {}), ...(draftId ? { draft: draftId } : {}) })}`)}>
              <IconSign /> Send to sign
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 16px', background: 'color-mix(in srgb, crimson 10%, transparent)', fontSize: 13 }}>
            <b>AI provider error:</b> {error}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Nothing was replaced with demo text — what you see above is only what the model actually wrote.
            </div>
          </div>
        )}

        {tab === 'preview' && (
          <div ref={previewRef} onScroll={onPreviewScroll} className="doc-preview scroll"
            style={{ maxHeight: 460, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
            {phase === 'thinking' && !text ? (
              <div>
                <div className="writing-status" style={{ marginBottom: 14 }}>
                  <span className="writing-dots"><i /><i /><i /></span>
                  Reading the matter and composing the draft…
                </div>
                <div className="skeleton-line" style={{ width: '92%' }} />
                <div className="skeleton-line" style={{ width: '98%' }} />
                <div className="skeleton-line" style={{ width: '85%' }} />
                <div className="skeleton-line" style={{ width: '70%' }} />
              </div>
            ) : text ? (
              <>
                {renderWithCitations(text, report)}
                {phase === 'writing' && <span className="caret" />}
              </>
            ) : (
              <span className="muted">Fill the form and press <b>Generate draft</b>. The draft appears here as the AI writes it.</span>
            )}
          </div>
        )}

        {tab === 'edit' && (
          <textarea
            ref={editorRef}
            className="doc-preview scroll"
            style={{ width: '100%', maxHeight: 460, minHeight: 320, border: 0, resize: 'vertical', fontFamily: 'inherit' }}
            value={text}
            disabled={streaming}
            onChange={(e) => setText(e.target.value)}
            onSelect={(e) => {
              const el = e.currentTarget;
              setSel({ start: el.selectionStart, end: el.selectionEnd });
            }}
            placeholder="The generated draft appears here and is fully editable."
          />
        )}

        {tab === 'history' && (
          <VersionHistory
            versions={versions}
            selected={compareTo}
            onSelect={setCompareTo}
            selectedVersion={selectedVersion}
            previousVersion={previousVersion}
            onRestore={(content) => { setText(content); setTab('edit'); }}
          />
        )}

        {report && report.checked > 0 && tab !== 'history' && (
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

        {text && !streaming && tab !== 'history' && (
          <div className="ai-toolbar">
            {sel.end > sel.start && (
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center', marginRight: 4 }}>
                {sel.end - sel.start} chars selected →
              </span>
            )}
            {COMMANDS.map((c) => (
              <button key={c.label} className="ai-pill" onClick={() => run(c)}
                title={c.whole ? 'Applies to the whole document' : 'Applies to your selection, or the whole document'}>
                ✦ {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VersionHistory({ versions, selected, onSelect, selectedVersion, previousVersion, onRestore }: {
  versions: Version[];
  selected: number | null;
  onSelect: (v: number) => void;
  selectedVersion?: Version;
  previousVersion?: Version;
  onRestore: (content: string) => void;
}) {
  const rows = selectedVersion && previousVersion
    ? lineDiff(previousVersion.content, selectedVersion.content)
    : null;
  const stat = rows ? diffStat(rows) : null;

  return (
    <div style={{ display: 'flex', maxHeight: 460 }}>
      <div className="scroll" style={{ width: 190, borderRight: '1px solid var(--line)', overflowY: 'auto' }}>
        {versions.map((v) => (
          <button key={v.id} className="row" onClick={() => onSelect(v.version_no)}
            style={{
              width: '100%', textAlign: 'left', border: 0, cursor: 'pointer',
              background: v.version_no === selected ? 'var(--line)' : 'none',
            }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>v{v.version_no}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {v.source === 'human' ? 'You' : v.source === 'ai-command' ? 'AI edit' : 'AI'}
                {' · '}
                {new Date(v.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {!selectedVersion && <div className="muted" style={{ fontSize: 13 }}>Pick a version to see what changed.</div>}

        {selectedVersion && (
          <>
            <div className="flexb" style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                {previousVersion
                  ? <>Changes from v{previousVersion.version_no} → v{selectedVersion.version_no} · <span style={{ color: 'seagreen' }}>+{stat!.added}</span> <span style={{ color: 'crimson' }}>−{stat!.removed}</span></>
                  : 'First version — nothing to compare against.'}
              </div>
              <button className="chip" onClick={() => onRestore(selectedVersion.content)}>Restore into editor</button>
            </div>

            <pre style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
              {rows
                ? rows.map((r, i) => (
                    <div key={i} style={{
                      background: r.type === 'add' ? 'color-mix(in srgb, seagreen 16%, transparent)'
                        : r.type === 'del' ? 'color-mix(in srgb, crimson 14%, transparent)' : 'transparent',
                      textDecoration: r.type === 'del' ? 'line-through' : 'none',
                    }}>
                      {r.type === 'add' ? '+ ' : r.type === 'del' ? '− ' : '  '}{r.text || ' '}
                    </div>
                  ))
                : selectedVersion.content}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

function renderWithCitations(text: string, report: VerifierReport | null) {
  const byClaim = new Map((report?.claims ?? []).map((c) => [c.claim, c]));
  return text.split(/(\[\[[^\]]+\]\])/g).map((p, i) => {
    const m = p.match(/^\[\[(.+)\]\]$/);
    if (!m) return <span key={i}>{p}</span>;
    const c = byClaim.get(m[1].trim());
    if (c && !c.verified) {
      return (
        <span className="cite" key={i}
          style={{ background: 'color-mix(in srgb, crimson 14%, transparent)', borderColor: 'crimson' }}
          title={c.note || 'Could not verify this citation'}>⚠ {m[1]}</span>
      );
    }
    if (c?.verify_url) {
      return <a className="cite" key={i} href={c.verify_url} target="_blank" rel="noreferrer" title="Verified — open source">{m[1]} ↗</a>;
    }
    return <span className="cite" key={i} title="Verified source">{m[1]}</span>;
  });
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
