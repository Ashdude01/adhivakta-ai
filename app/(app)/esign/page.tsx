'use client';

import { useEffect, useRef, useState } from 'react';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import { IconSign, IconCheck, IconWarn, IconShield, IconSend, IconPlus } from '@/components/Icons';

type Method = 'manual' | 'aadhaar' | 'dsc' | 'docusign';
const METHODS: { id: Method; h: string; p: string }[] = [
  { id: 'manual', h: 'Manual signature', p: 'Draw to sign — works now' },
  { id: 'aadhaar', h: 'Aadhaar eSign (OTP)', p: 'IT Act valid · needs ASP key' },
  { id: 'dsc', h: 'DSC token', p: 'For court e-filing · needs setup' },
  { id: 'docusign', h: 'DocuSign', p: 'International · needs key' },
];

export default function EsignPage() {
  const [docName, setDocName] = useState('Verma_MACT_Claim_Notice.pdf');
  const [method, setMethod] = useState<Method>('manual');
  const [elig, setElig] = useState<{ eligible: boolean; reason: string } | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string; status: string } | null>(null);
  const [sending, setSending] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    fetch('/api/esign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', documentName: docName }) })
      .then((r) => r.json()).then(setElig).catch(() => {});
  }, [docName]);

  useEffect(() => {
    (async () => {
      const map: Record<string, boolean> = {};
      for (const m of METHODS) {
        try {
          const r = await fetch('/api/esign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', method: m.id }) });
          const d = await r.json(); map[m.id] = d.live;
        } catch { map[m.id] = m.id === 'manual'; }
      }
      setStatusMap(map);
    })();
  }, []);

  async function send() {
    setSending(true); setResult(null);
    let signatureDataUrl: string | undefined;
    if (method === 'manual') {
      if (padRef.current?.isEmpty()) { setResult({ ok: false, status: 'pending', message: 'Please draw your signature first.' }); setSending(false); return; }
      signatureDataUrl = padRef.current?.toDataURL();
    }
    try {
      const r = await fetch('/api/esign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send', method, documentName: docName, signatureDataUrl,
          signers: [
            { name: 'Mr. Rajesh Sharma', email: 'rajesh@email.com', method },
            { name: 'Adv. R. Sharma', method: 'dsc' },
          ],
        }),
      });
      setResult(await r.json());
    } catch {
      setResult({ ok: false, status: 'error', message: 'e-Sign service unavailable.' });
    } finally { setSending(false); }
  }

  const stepDone = !!elig?.eligible;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconSign width={13} height={13} /> e-Signature</div>
        <h1>Send for legally valid signing</h1>
        <p>Aadhaar eSign & DSC under the IT Act, 2000 — with an automatic Schedule I eligibility check. Manual signing works right now.</p>
      </div>

      <div className="card" style={{ padding: 24, maxWidth: 860 }}>
        <div className="stepper">
          <div className="step done"><div className="num">✓</div><div className="stxt">Document</div><div className="line" /></div>
          <div className={`step ${stepDone ? 'done' : 'cur'}`}><div className="num">{stepDone ? '✓' : '2'}</div><div className="stxt">Eligibility</div><div className="line" /></div>
          <div className="step cur"><div className="num">3</div><div className="stxt">Method & Signers</div><div className="line" /></div>
          <div className="step"><div className="num">4</div><div className="stxt">Send</div></div>
        </div>

        <div className="field"><label>Document</label><input value={docName} onChange={(e) => setDocName(e.target.value)} /></div>

        {elig && (
          <div className={`callout ${elig.eligible ? 'ok' : 'warn'}`}>
            <div className="eic">{elig.eligible ? <IconCheck width={20} height={20} style={{ color: 'var(--success)' }} /> : <IconWarn width={20} height={20} style={{ color: 'var(--accent-ink)' }} />}</div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{elig.eligible ? '✓ Eligible for e-signature' : 'Not eligible under Schedule I'}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{elig.reason}</div>
            </div>
          </div>
        )}

        <div className="flexb" style={{ margin: '18px 0 12px' }}><h2 style={{ fontSize: 16 }}>Choose method</h2></div>
        <div className="method-grid">
          {METHODS.map((m) => {
            const live = statusMap[m.id];
            return (
              <button key={m.id} className={`method ${method === m.id ? 'sel' : ''}`} onClick={() => setMethod(m.id)} disabled={!elig?.eligible}>
                <div className="flexb"><h4>{m.h}</h4>{live ? <span className="tag t-success">Live</span> : <span className="lock">needs key</span>}</div>
                <p>{m.p}</p>
              </button>
            );
          })}
        </div>

        {method === 'manual' && (
          <div style={{ marginTop: 18 }}>
            <div className="flexb" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700 }}>Draw your signature</label>
              <button className="chip" onClick={() => padRef.current?.clear()}>Clear</button>
            </div>
            <SignaturePad ref={padRef} />
          </div>
        )}

        {method !== 'manual' && (
          <div className="callout warn" style={{ marginTop: 18 }}>
            <div className="eic"><IconWarn width={20} height={20} style={{ color: 'var(--accent-ink)' }} /></div>
            <div><div style={{ fontWeight: 700, marginBottom: 2 }}>{statusMap[method] ? 'Provider ready' : 'Provider not configured'}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {statusMap[method] ? 'Keys detected — a real request will be created.' : 'Add the provider keys in .env to enable this method. The flow is fully built and will work once keys are set.'}
              </div></div>
          </div>
        )}

        <div className="flexb" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 12 }}>
          <div className="gap8 muted" style={{ fontSize: 12.5 }}><IconShield width={16} height={16} style={{ color: 'var(--success)' }} /> End-to-end encrypted · audit trail recorded</div>
          <button className="cta brand" style={{ padding: '12px 20px' }} onClick={send} disabled={sending || !elig?.eligible}>
            <IconSend /> {sending ? 'Sending…' : method === 'manual' ? 'Sign & record' : 'Send for signature'}
          </button>
        </div>

        {result && (
          <div className={`callout ${result.ok ? 'ok' : 'warn'}`} style={{ marginTop: 16 }}>
            <div className="eic">{result.ok ? <IconCheck width={20} height={20} style={{ color: 'var(--success)' }} /> : <IconWarn width={20} height={20} style={{ color: 'var(--accent-ink)' }} />}</div>
            <div><div style={{ fontWeight: 700, marginBottom: 2 }}>{result.status === 'signed' ? 'Signed ✓' : result.status === 'sent' ? 'Request sent' : 'Notice'}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{result.message}</div></div>
          </div>
        )}
      </div>
    </>
  );
}
