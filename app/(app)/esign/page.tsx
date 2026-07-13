'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import EsignDocumentPicker from '@/components/EsignDocumentPicker';
import { IconSign, IconCheck, IconWarn, IconShield, IconSend, IconDownload } from '@/components/Icons';

type Method = 'manual' | 'aadhaar' | 'dsc' | 'docusign';

const METHODS: { id: Method; h: string; p: string }[] = [
  { id: 'manual', h: 'Simple signature', p: 'Affix your signature to the PDF — works now' },
  { id: 'aadhaar', h: 'Aadhaar eSign (OTP)', p: 'IT Act valid · needs ASP key' },
  { id: 'dsc', h: 'DSC token', p: 'For court e-filing · needs setup' },
  { id: 'docusign', h: 'DocuSign', p: 'International · needs key' },
];

/** What each provider actually does, shown when its method is selected. */
const PROCESS: Record<Exclude<Method, 'manual'>, { title: string; steps: string[]; note: string }> = {
  aadhaar: {
    title: 'Aadhaar eSign — how it works',
    steps: [
      'The document is uploaded to a licensed ASP/ESP (Leegality or Digio).',
      'The signer enters their Aadhaar/VID and receives an OTP on the Aadhaar-linked mobile.',
      'On OTP verification, C-DAC/NSDL issues a one-time certificate and signs the PDF (PKCS#7).',
      'A signed PDF + audit trail comes back, legally valid under §3A of the IT Act, 2000.',
    ],
    note: 'Add LEEGALITY_API_KEY or DIGIO_CLIENT_ID / DIGIO_CLIENT_SECRET to enable.',
  },
  dsc: {
    title: 'DSC (Digital Signature Certificate) — how it works',
    steps: [
      'The advocate holds a Class 3 DSC on a USB crypto-token (from a licensed CA: eMudhra, Capricorn, etc.).',
      'The token plugs into the machine; a host utility (emBridge / NIC signer) exposes it to the browser.',
      'The document hash is signed on the token — the private key never leaves it.',
      'The signed PDF is what court e-filing (CIS / e-Courts) requires from an advocate.',
    ],
    note: 'DSC signing runs on the signer’s own machine with the CA’s host utility; the app records the result.',
  },
  docusign: {
    title: 'DocuSign — how it works',
    steps: [
      'An envelope is created via the DocuSign eSignature API with the document and signer roles.',
      'Each signer gets an email link and signs in the DocuSign UI.',
      'DocuSign returns the completed PDF and a certificate of completion.',
      'Best for cross-border agreements; for Indian court filing prefer DSC.',
    ],
    note: 'Add DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID and the private key to enable.',
  },
};

interface DraftDoc { id: string; title: string; body: string; docType: string | null }
interface PartyOption { name: string; role: string }

export default function EsignPage() {
  const padRef = useRef<SignaturePadHandle>(null);

  const [draft, setDraft] = useState<DraftDoc | null>(null);
  const [matterId, setMatterId] = useState<string | null>(null);
  const [docName, setDocName] = useState('');
  const [signerOptions, setSignerOptions] = useState<PartyOption[]>([]);

  const [method, setMethod] = useState<Method>('manual');
  const [sigMode, setSigMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedName, setTypedName] = useState('');
  const [uploadedSig, setUploadedSig] = useState<string | null>(null);
  const [signer, setSigner] = useState({ name: '', designation: 'Advocate', place: '' });

  const [elig, setElig] = useState<{ eligible: boolean; reason: string } | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string; status: string; documentId?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Loads a draft as the document to sign, and its matter's parties as signer
  // suggestions. Shared by the deep link (?draft=) and the in-page picker.
  async function loadDraft(draftId: string, matter: string | null) {
    setResult(null);
    setMatterId(matter);
    try {
      const d = await (await fetch(`/api/drafts/${draftId}`)).json();
      if (d?.draft) {
        setDraft({ id: d.draft.id, title: d.draft.title, body: d.draft.body ?? '', docType: d.draft.doc_type });
        setDocName(d.draft.title || d.draft.doc_type || 'Document');
      }
    } catch { /* ignore */ }
    if (matter) {
      fetch(`/api/matters/${matter}/parties`).then((r) => (r.ok ? r.json() : null)).then((d) => {
        const parties = (d?.parties ?? []).map((p: any) => ({ name: p.contact?.full_name, role: p.role })).filter((p: any) => p.name);
        setSignerOptions(parties);
      }).catch(() => {});
    }
  }

  // Load whatever was passed from the draft workspace, and prefill the signer
  // from the advocate's own profile — they issue the notice.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const draftId = q.get('draft');
    const matter = q.get('matter');
    if (draftId) void loadDraft(draftId, matter);
    else if (matter) setMatterId(matter);

    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.user) setSigner({ name: d.user.name || '', designation: d.user.designation || 'Advocate', place: d.user.city || '' });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!docName) return;
    fetch('/api/esign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', documentName: docName }) })
      .then((r) => r.json()).then(setElig).catch(() => {});
  }, [docName]);

  useEffect(() => {
    (async () => {
      const map: Record<string, boolean> = {};
      for (const m of METHODS) {
        try {
          const r = await fetch('/api/esign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', method: m.id }) });
          map[m.id] = (await r.json()).live;
        } catch { map[m.id] = m.id === 'manual'; }
      }
      setStatusMap(map);
    })();
  }, []);

  async function signManually() {
    setBusy(true); setResult(null);
    try {
      let imageDataUrl: string | undefined;
      let typed: string | undefined;
      if (sigMode === 'draw') {
        if (padRef.current?.isEmpty()) throw new Error('Draw your signature first.');
        imageDataUrl = padRef.current?.toDataURL();
      } else if (sigMode === 'upload') {
        if (!uploadedSig) throw new Error('Upload a signature image first.');
        imageDataUrl = uploadedSig;
      } else {
        if (!typedName.trim()) throw new Error('Type your name first.');
        typed = typedName.trim();
      }
      if (!signer.name.trim()) throw new Error('Enter the signer’s name.');

      const res = await fetch('/api/esign/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draft?.id, matterId, documentName: docName,
          signerName: signer.name, designation: signer.designation, place: signer.place,
          imageDataUrl, typedName: typed,
        }),
      });

      if (res.headers.get('content-type')?.includes('application/pdf')) {
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${docName.replace(/[^\w\d\- ]+/g, '').slice(0, 50) || 'document'} (signed).pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
        setResult({ ok: true, status: 'signed', message: 'Signed PDF downloaded' + (matterId ? ' and filed under the matter.' : '.'), documentId: res.headers.get('X-Document-Id') ?? undefined });
      } else {
        const d = await res.json();
        throw new Error(d.message || d.error || 'Could not sign.');
      }
    } catch (err) {
      setResult({ ok: false, status: 'error', message: (err as Error).message });
    } finally { setBusy(false); }
  }

  async function sendProvider() {
    setBusy(true); setResult(null);
    try {
      const r = await fetch('/api/esign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send', method, documentName: docName, matterId,
          signers: signerOptions.length ? signerOptions.map((s) => ({ name: s.name, method })) : [{ name: signer.name, method }],
        }),
      });
      setResult(await r.json());
    } catch {
      setResult({ ok: false, status: 'error', message: 'e-Sign service unavailable.' });
    } finally { setBusy(false); }
  }

  const eligible = !!elig?.eligible;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconSign width={13} height={13} /> e-Signature</div>
        <h1>Send for signing</h1>
        <p>Affix a signature now, or route to Aadhaar eSign / DSC / DocuSign — with an automatic IT Act Schedule I check.</p>
      </div>

      <div className="split" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        {/* Document being signed */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="flexb" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontWeight: 700 }}>Document</span>
            {draft && <button className="chip" onClick={() => { setDraft(null); setDocName(''); }}>Change</button>}
          </div>
          {draft ? (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600 }}>{draft.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>{draft.docType}</div>
              </div>
              <div className="doc-preview scroll" style={{ maxHeight: 360, overflowY: 'auto', whiteSpace: 'pre-wrap', padding: '18px 22px', fontSize: 12.5 }}>
                {draft.body.replace(/\[\[([^\]]+)\]\]/g, '$1')}
              </div>
            </>
          ) : (
            <EsignDocumentPicker onPickDraft={(draftId, matter) => void loadDraft(draftId, matter)} />
          )}

          {elig && (
            <div className={`callout ${eligible ? 'ok' : 'warn'}`} style={{ margin: 16 }}>
              <div className="eic">{eligible ? <IconCheck width={20} height={20} style={{ color: 'var(--success)' }} /> : <IconWarn width={20} height={20} style={{ color: 'var(--accent-ink)' }} />}</div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{eligible ? 'Eligible for e-signature' : 'Not eligible under Schedule I'}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{elig.reason}</div>
              </div>
            </div>
          )}
        </div>

        {/* Method + signing */}
        <div className="card" style={{ padding: 20 }}>
          <div className="method-grid">
            {METHODS.map((m) => (
              <button key={m.id} className={`method ${method === m.id ? 'sel' : ''}`} onClick={() => setMethod(m.id)} disabled={!eligible}>
                <div className="flexb"><h4>{m.h}</h4>{statusMap[m.id] ? <span className="tag t-success">Live</span> : <span className="lock">needs key</span>}</div>
                <p>{m.p}</p>
              </button>
            ))}
          </div>

          {method === 'manual' && (
            <div style={{ marginTop: 18 }}>
              <div className="callout" style={{ background: 'var(--brand-soft)', marginBottom: 14 }}>
                <div className="eic"><IconShield width={18} height={18} style={{ color: 'var(--brand)' }} /></div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  A <b>simple electronic signature</b> affixed to the PDF and sealed with a document hash — right for notices and letters.
                  For court e-filing use <b>DSC</b>; for identity-bound signing use <b>Aadhaar eSign</b>.
                </div>
              </div>

              <div className="gap8 wrap" style={{ display: 'flex', marginBottom: 12 }}>
                {(['draw', 'type', 'upload'] as const).map((m) => (
                  <button key={m} type="button" className={`chip ${sigMode === m ? 'on' : ''}`} onClick={() => setSigMode(m)}>
                    {m === 'draw' ? 'Draw' : m === 'type' ? 'Type' : 'Upload'}
                  </button>
                ))}
              </div>

              {sigMode === 'draw' && (
                <div>
                  <div className="flexb" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Draw your signature</label>
                    <button className="chip" onClick={() => padRef.current?.clear()}>Clear</button>
                  </div>
                  <SignaturePad ref={padRef} />
                </div>
              )}
              {sigMode === 'type' && (
                <div className="field"><label>Type your name as signature</label>
                  <input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Rajesh Sharma" />
                  {typedName && <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 26, color: 'var(--brand)', marginTop: 8 }}>{typedName}</div>}
                </div>
              )}
              {sigMode === 'upload' && (
                <div className="field"><label>Upload a signature image (PNG/JPG)</label>
                  <input type="file" accept="image/png,image/jpeg" onChange={(e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const reader = new FileReader(); reader.onload = () => setUploadedSig(reader.result as string); reader.readAsDataURL(f);
                  }} />
                  {uploadedSig && <img src={uploadedSig} alt="signature" style={{ maxHeight: 70, marginTop: 8 }} />}
                </div>
              )}

              <div className="split" style={{ gap: 12, marginTop: 12 }}>
                <div className="field"><label>Signer name</label>
                  <input value={signer.name} onChange={(e) => setSigner({ ...signer, name: e.target.value })} list="signer-opts" />
                  <datalist id="signer-opts">
                    {signerOptions.map((s) => <option key={s.name} value={s.name}>{s.role}</option>)}
                  </datalist>
                </div>
                <div className="field"><label>Place</label>
                  <input value={signer.place} onChange={(e) => setSigner({ ...signer, place: e.target.value })} placeholder="New Delhi" /></div>
              </div>

              <button className="cta brand block" style={{ marginTop: 8 }} onClick={signManually} disabled={busy || !eligible}>
                <IconSign /> {busy ? 'Signing…' : 'Sign & download PDF'}
              </button>
            </div>
          )}

          {method !== 'manual' && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>{PROCESS[method].title}</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
                {PROCESS[method].steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <div className={`callout ${statusMap[method] ? 'ok' : 'warn'}`} style={{ marginTop: 14 }}>
                <div className="eic">{statusMap[method]
                  ? <IconCheck width={18} height={18} style={{ color: 'var(--success)' }} />
                  : <IconWarn width={18} height={18} style={{ color: 'var(--accent-ink)' }} />}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {statusMap[method] ? 'Provider keys detected — a real request will be created.' : PROCESS[method].note}
                </div>
              </div>
              <button className="cta brand block" style={{ marginTop: 12 }} onClick={sendProvider} disabled={busy || !eligible || !statusMap[method]}>
                <IconSend /> {busy ? 'Sending…' : 'Send for signature'}
              </button>
            </div>
          )}

          {result && (
            <div className={`callout ${result.ok ? 'ok' : 'warn'}`} style={{ marginTop: 16 }}>
              <div className="eic">{result.ok ? <IconCheck width={20} height={20} style={{ color: 'var(--success)' }} /> : <IconWarn width={20} height={20} style={{ color: 'var(--accent-ink)' }} />}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{result.status === 'signed' ? 'Signed ✓' : result.status === 'sent' ? 'Request sent' : result.status === 'blocked' ? 'Blocked' : 'Notice'}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{result.message}</div>
                {result.ok && matterId && (
                  <Link href={`/matters/${matterId}`} className="chip" style={{ marginTop: 8, display: 'inline-flex', textDecoration: 'none' }}>
                    <IconDownload width={13} height={13} /> View in matter folder
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="gap8 muted" style={{ fontSize: 12, marginTop: 16, display: 'flex', alignItems: 'center' }}>
            <IconShield width={15} height={15} style={{ color: 'var(--success)' }} /> Audit trail recorded on every signature
          </div>
        </div>
      </div>
    </>
  );
}
