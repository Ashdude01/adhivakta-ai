'use client';

import { useState, useRef, useEffect } from 'react';
import { IconSpark, IconSend, IconUpload, IconDoc } from '@/components/Icons';

const SAMPLE = `IN THE COURT OF THE JUDICIAL MAGISTRATE — REPLY AFFIDAVIT (Kapoor)

Page 14 — Reply on merits
4. That the respondent denies that any legally enforceable debt was owed to the complainant. The amount referred to was an advance for a property transaction that stood cancelled, and the cheque was issued only as security.
5. That without prejudice, the present complaint is barred by limitation as the notice was issued beyond the statutory period prescribed under the Act.

Page 15 — Handwritten endorsement (recognised via OCR)
"Received the said cheque on 10.05.2026 towards full and final settlement — A. Kapoor"
6. That the respondent reserves the right to file a counter-claim for damages and harassment.`;

type Msg = { role: 'user' | 'ai'; content: string; cites?: string[] };

function highlight(text: string) {
  const rules: [RegExp, string][] = [
    [/barred by limitation|beyond the statutory period/gi, 'risk'],
    [/as security|advance for a property/gi, ''],
    [/full and final settlement/gi, ''],
  ];
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  rules.forEach(([re, cls]) => { html = html.replace(re, (m) => `<span class="hl ${cls}">${m}</span>`); });
  return html.replace(/\n/g, '<br/>');
}

export default function ReviewPage() {
  const [context, setContext] = useState(SAMPLE);
  const [filename, setFilename] = useState('Kapoor_Reply_Affidavit.txt');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [matters, setMatters] = useState<{ id: string; title: string }[]>([]);
  const [matterId, setMatterId] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages, loading]);
  useEffect(() => {
    fetch('/api/matters').then((r) => r.json()).then((d) => setMatters(d.matters ?? [])).catch(() => {});
  }, []);

  async function runReview() {
    setLoading(true); setReviewed(true);
    setMessages([{ role: 'ai', content: 'Reading the document…' }]);
    try {
      const res = await fetch('/api/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, filename, matterId: matterId || null }),
      });
      const data = await res.json();
      setSessionId(data.sessionId ?? null);
      setMessages([{ role: 'ai', content: data.text }]);
    } catch {
      setMessages([{ role: 'ai', content: 'Review service unavailable.' }]);
    } finally { setLoading(false); }
  }

  async function ask() {
    const q = input.trim();
    if (!q) return;
    const history = messages.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput(''); setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context, history, sessionId }),
      });
      const data = await res.json();
      const cites = (data.citations ?? []).map((c: { seq: number }) => `¶ ${c.seq}`);
      setMessages((m) => [...m, { role: 'ai', content: data.text, cites }]);
    } catch {
      setMessages((m) => [...m, { role: 'ai', content: 'Chat service unavailable.' }]);
    } finally { setLoading(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    if (f.type === 'text/plain' || f.name.endsWith('.txt')) {
      setContext(await f.text());
    } else {
      setContext(`[${f.name} uploaded. For PDFs/scans, OCR text extraction activates once you add an OCR provider key. Paste the text here to review now.]`);
    }
    setMessages([]); setReviewed(false); setSessionId(null);
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconSpark width={13} height={13} /> Document Review & Chat</div>
        <h1>Chat with your case file</h1>
        <p>Upload a file (or use the sample), let the AI read it, then ask anything — answers cite the page/paragraph.</p>
      </div>

      <div className="review-grid">
        <div className="card docview scroll">
          <div className="flexb" style={{ marginBottom: 8 }}>
            <span className="tag t-grey"><IconDoc width={12} height={12} style={{ verticalAlign: '-2px' }} /> {filename}</span>
            <div className="gap8">
              <select value={matterId} onChange={(e) => setMatterId(e.target.value)}
                style={{ fontSize: 12, maxWidth: 160 }} title="File this review under a matter">
                <option value="">— no matter —</option>
                {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <button className="chip" onClick={() => fileRef.current?.click()}><IconUpload width={14} height={14} /> Upload</button>
              <button className="cta brand" style={{ padding: '7px 12px' }} onClick={runReview} disabled={loading}>
                <IconSpark /> {reviewed ? 'Re-review' : 'Review'}
              </button>
              <input ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx" hidden onChange={onFile} />
            </div>
          </div>
          <div dangerouslySetInnerHTML={{ __html: highlight(context) }} />
        </div>

        <div className="card chatpanel">
          <div className="chat-head">
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,var(--brand-2),var(--brand))', display: 'grid', placeItems: 'center' }}>
              <IconSpark width={16} height={16} style={{ color: '#fff' }} />
            </div>
            <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>Ask about this document</div><div className="muted" style={{ fontSize: 11 }}>grounded in the file</div></div>
          </div>

          <div className="chat-body scroll" ref={bodyRef}>
            {messages.length === 0 && !loading && (
              <div className="msg ai"><div className="bubble">Press <b>Review</b> to have me read the file, or just ask a question below. (Works offline; add a free AI key for deeper reasoning.)</div></div>
            )}
            {messages.map((m, i) => (
              <div className={`msg ${m.role}`} key={i}>
                {m.role === 'ai' && <div className="who">Erolt AI</div>}
                <div className="bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                {m.role === 'ai' && m.cites && m.cites.length > 0 && (
                  <div className="gap8" style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap' }}>
                    {m.cites.map((c, j) => <span key={j} className="cite" title="Grounded in this paragraph of the file">{c}</span>)}
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="msg ai"><div className="bubble typing"><span></span><span></span><span></span></div></div>}
          </div>

          <div className="chat-input">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} placeholder="Ask anything about this file…" />
            <button className="send-btn" onClick={ask} disabled={loading}><IconSend /></button>
          </div>
        </div>
      </div>
    </>
  );
}
