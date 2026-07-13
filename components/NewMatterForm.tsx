'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconFolder } from '@/components/Icons';
import PartyFields, { emptyParty, type PartyForm } from '@/components/PartyFields';
import { MATTER_TYPES, getMatterType, PARTY_ROLE_LABEL, type FactField } from '@/lib/legal/matterTypes';

/**
 * Guided matter intake.
 *
 * The matter is the base entity: everything the advocate types here is read
 * back by drafting, review and e-signature, so it is asked for once and never
 * again. Each step saves into local state only — the matter is written in one
 * request at the end, and a half-entered cause title never reaches the database.
 */

const STEPS = ['Basics', 'Parties', 'Case facts', 'Filing'] as const;

interface ConflictHit {
  contact: { id: string; full_name: string };
  matters: Array<{ matter_id: string; title: string; role: string; side: string }>;
}

export default function NewMatterForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [typeCode, setTypeCode] = useState(MATTER_TYPES[0].code);
  const type = getMatterType(typeCode)!;

  const [basics, setBasics] = useState({
    title: '', court: '', court_complex: '', district: '', state: '', client_ref: '', description: '',
  });
  const [titleTouched, setTitleTouched] = useState(false);

  const [parties, setParties] = useState<PartyForm[]>(() => [
    emptyParty('client', MATTER_TYPES[0].roles.client),
    emptyParty('opposite', MATTER_TYPES[0].roles.opposite),
  ]);

  const [facts, setFacts] = useState<Record<string, string>>({});
  const [relief, setRelief] = useState({ relief_sought: '', suit_value: '' });
  const [filing, setFiling] = useState({
    cnr: '', case_type: '', case_number: '', case_year: '', filing_number: '', filed_on: '', next_hearing_date: '',
  });

  const [conflicts, setConflicts] = useState<ConflictHit[] | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // Changing the matter type reslots the default roles; a party the advocate has
  // deliberately re-roled (say, a Third Party) is left as it is.
  function changeType(code: string) {
    const next = getMatterType(code)!;
    const prev = getMatterType(typeCode)!;
    setTypeCode(code);
    setFacts({});
    setParties((ps) => ps.map((p) => {
      const wasDefault = p.role === (p.side === 'client' ? prev.roles.client : prev.roles.opposite);
      if (!wasDefault) return p;
      return { ...p, role: p.side === 'client' ? next.roles.client : next.roles.opposite };
    }));
    setBasics((b) => ({ ...b, court: next.courts.includes(b.court) ? b.court : '' }));
  }

  const suggestedTitle = useMemo(() => {
    const surname = (n: string) => n.trim().split(/\s+/).pop() ?? '';
    const client = surname(parties.find((p) => p.side === 'client')?.contact.full_name ?? '');
    const opposite = surname(parties.find((p) => p.side === 'opposite')?.contact.full_name ?? '');
    if (!client) return '';
    const versus = opposite ? `${client} vs ${opposite}` : client;
    return `${versus} — ${type.label}`;
  }, [parties, type.label]);

  const title = titleTouched || !suggestedTitle ? basics.title : suggestedTitle;
  const canSave = title.trim().length >= 2;

  async function runConflictCheck() {
    const names = parties.map((p) => p.contact.full_name.trim()).filter((n) => n.length >= 3);
    if (names.length === 0) { setConflicts([]); return; }
    setCheckingConflicts(true);
    try {
      const res = await fetch('/api/matters/conflict-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      });
      const data = await res.json();
      setConflicts(res.ok ? (data.hits ?? []) : []);
    } catch {
      setConflicts([]);   // a failed check must not block intake; it just proves nothing
    } finally {
      setCheckingConflicts(false);
    }
  }

  function next() {
    setError('');
    if (step === 1) void runConflictCheck();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function save() {
    if (!canSave) { setError('Give the matter a title.'); setStep(0); return; }
    const named = parties.filter((p) => p.contact.full_name.trim().length >= 2);
    // `basics.title` is the raw input; `title` is it or the suggestion. Drop the
    // former so an untouched input cannot overwrite the suggested title.
    const { title: _rawTitle, ...basicsRest } = basics;
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/matters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          matter_type_code: typeCode,
          ...basicsRest,
          ...relief,
          ...filing,
          facts,
          parties: named.map(toPartyPayload),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create matter');
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  function reset() {
    setStep(0); setTypeCode(MATTER_TYPES[0].code); setTitleTouched(false);
    setBasics({ title: '', court: '', court_complex: '', district: '', state: '', client_ref: '', description: '' });
    setParties([emptyParty('client', MATTER_TYPES[0].roles.client), emptyParty('opposite', MATTER_TYPES[0].roles.opposite)]);
    setFacts({}); setRelief({ relief_sought: '', suit_value: '' });
    setFiling({ cnr: '', case_type: '', case_number: '', case_year: '', filing_number: '', filed_on: '', next_hearing_date: '' });
    setConflicts(null);
  }

  if (!open) {
    return <button className="cta brand" onClick={() => setOpen(true)}><IconFolder /> New matter</button>;
  }

  const clientParties = parties.filter((p) => p.side === 'client');
  const oppositeParties = parties.filter((p) => p.side === 'opposite');
  const updateParty = (key: string, next: PartyForm) =>
    setParties((ps) => ps.map((p) => (p.key === key ? next : p)));
  const removeParty = (key: string) => setParties((ps) => ps.filter((p) => p.key !== key));

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div className="flexb" style={{ marginBottom: 14 }}>
        <div className="gap8 wrap" style={{ display: 'flex' }}>
          {STEPS.map((label, i) => (
            <button
              key={label} type="button"
              className={`chip ${i === step ? 'on' : ''}`}
              onClick={() => setStep(i)}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>
        <button className="tb-btn" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)} title="Close">✕</button>
      </div>

      {/* ---------------------------------------------------------- 1 · Basics */}
      {step === 0 && (
        <>
          <div className="field"><label>Matter type *</label>
            <select value={typeCode} onChange={(e) => changeType(e.target.value)}>
              {MATTER_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            {type.act && (
              <small className="muted">
                Arises under {type.act}{type.section ? `, s.${type.section}` : ''}. Parties will be called{' '}
                {PARTY_ROLE_LABEL[type.roles.client]} and {PARTY_ROLE_LABEL[type.roles.opposite]}.
              </small>
            )}
          </div>

          <div className="field"><label>Matter title *</label>
            <input
              value={title}
              onChange={(e) => { setTitleTouched(true); setBasics({ ...basics, title: e.target.value }); }}
              placeholder="e.g. Sharma vs Kapoor — Cheque Bounce"
            />
            {!titleTouched && suggestedTitle && <small className="muted">Suggested from the party names. Type to override.</small>}
          </div>

          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>Court / forum</label>
              <select value={basics.court} onChange={(e) => setBasics({ ...basics, court: e.target.value })}>
                <option value="">— not decided yet —</option>
                {type.courts.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field"><label>Court complex</label>
              <input value={basics.court_complex} onChange={(e) => setBasics({ ...basics, court_complex: e.target.value })} placeholder="e.g. Metropolitan Court, Saket" />
            </div>
          </div>

          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>District</label>
              <input value={basics.district} onChange={(e) => setBasics({ ...basics, district: e.target.value })} /></div>
            <div className="field"><label>State</label>
              <input value={basics.state} onChange={(e) => setBasics({ ...basics, state: e.target.value })} /></div>
          </div>

          <div className="field"><label>Your reference number</label>
            <input value={basics.client_ref} onChange={(e) => setBasics({ ...basics, client_ref: e.target.value })} placeholder="Your firm's internal file number" /></div>

          <div className="field"><label>Notes (optional)</label>
            <textarea rows={2} value={basics.description} onChange={(e) => setBasics({ ...basics, description: e.target.value })} placeholder="Anything the file should remember" /></div>
        </>
      )}

      {/* --------------------------------------------------------- 2 · Parties */}
      {step === 1 && (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Enter each party once, in full. Every notice, plaint and cause title is built from exactly these details.
          </p>

          <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Your side</div>
          {clientParties.map((p, i) => (
            <PartyFields key={p.key} party={p} index={i} total={clientParties.length}
              onChange={(n) => updateParty(p.key, n)} onRemove={() => removeParty(p.key)} />
          ))}
          <button type="button" className="chip" style={{ marginBottom: 18 }}
            onClick={() => setParties((ps) => [...ps, emptyParty('client', type.roles.client)])}>
            + Add another {PARTY_ROLE_LABEL[type.roles.client].toLowerCase()}
          </button>

          <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Opposite side</div>
          {oppositeParties.map((p, i) => (
            <PartyFields key={p.key} party={p} index={i} total={oppositeParties.length}
              onChange={(n) => updateParty(p.key, n)} onRemove={() => removeParty(p.key)} />
          ))}
          <button type="button" className="chip"
            onClick={() => setParties((ps) => [...ps, emptyParty('opposite', type.roles.opposite)])}>
            + Add another {PARTY_ROLE_LABEL[type.roles.opposite].toLowerCase()}
          </button>
        </>
      )}

      {/* ------------------------------------------------------ 3 · Case facts */}
      {step === 2 && (
        <>
          {checkingConflicts && <p className="muted" style={{ fontSize: 13 }}>Checking for conflicts…</p>}
          {conflicts !== null && conflicts.length > 0 && <ConflictBanner hits={conflicts} />}
          {conflicts !== null && conflicts.length === 0 && !checkingConflicts && (
            <div className="tag t-success" style={{ display: 'inline-block', marginBottom: 14 }}>
              ✓ No conflict found against your existing matters
            </div>
          )}

          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            These facts ground every draft and every answer the AI gives on this matter.
          </p>

          {type.facts.map((f) => (
            <FactInput key={f.key} field={f} value={facts[f.key] ?? ''}
              onChange={(v) => setFacts((x) => ({ ...x, [f.key]: v }))} />
          ))}

          <div className="field"><label>Relief sought</label>
            <textarea rows={2} value={relief.relief_sought} onChange={(e) => setRelief({ ...relief, relief_sought: e.target.value })}
              placeholder="What you are asking the court to order" /></div>
          <div className="field"><label>Suit valuation (₹)</label>
            <input type="number" min={0} value={relief.suit_value} onChange={(e) => setRelief({ ...relief, suit_value: e.target.value })} />
            <small className="muted">Order VII r.1(i) CPC — decides jurisdiction and court fee.</small>
          </div>
        </>
      )}

      {/* ---------------------------------------------------------- 4 · Filing */}
      {step === 3 && (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            All optional — most matters are opened before they are filed. Come back and fill this in once the case is numbered.
          </p>

          <div className="field"><label>CNR number</label>
            <input value={filing.cnr} onChange={(e) => setFiling({ ...filing, cnr: e.target.value.toUpperCase() })}
              maxLength={16} placeholder="RJJP010012342024" />
            <small className="muted">The 16-character identifier that stays with a case through transfers and bench changes.</small>
          </div>

          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>Case type</label>
              <input value={filing.case_type} onChange={(e) => setFiling({ ...filing, case_type: e.target.value })} placeholder="e.g. CC, CS, CRL.M.C." /></div>
            <div className="field"><label>Case number</label>
              <input value={filing.case_number} onChange={(e) => setFiling({ ...filing, case_number: e.target.value })} /></div>
          </div>
          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>Year</label>
              <input type="number" value={filing.case_year} onChange={(e) => setFiling({ ...filing, case_year: e.target.value })} placeholder="2026" /></div>
            <div className="field"><label>Filing number</label>
              <input value={filing.filing_number} onChange={(e) => setFiling({ ...filing, filing_number: e.target.value })} /></div>
          </div>
          <div className="split" style={{ gap: 12 }}>
            <div className="field"><label>Filed on</label>
              <input type="date" value={filing.filed_on} onChange={(e) => setFiling({ ...filing, filed_on: e.target.value })} /></div>
            <div className="field"><label>Next hearing</label>
              <input type="date" value={filing.next_hearing_date} onChange={(e) => setFiling({ ...filing, next_hearing_date: e.target.value })} /></div>
          </div>
        </>
      )}

      {error && <div style={{ color: 'crimson', fontSize: 13, margin: '8px 0' }}>{error}</div>}

      <div className="flexb" style={{ marginTop: 16, gap: 8 }}>
        <button type="button" className="cta" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </button>
        <div className="gap8" style={{ display: 'flex' }}>
          {step < STEPS.length - 1 && (
            <button type="button" className="cta" onClick={save} disabled={saving || !canSave}
              title="Save what you have; the rest can be filled in later">
              {saving ? 'Saving…' : 'Save & finish later'}
            </button>
          )}
          {step < STEPS.length - 1
            ? <button type="button" className="cta brand" onClick={next}>Next</button>
            : <button type="button" className="cta brand" onClick={save} disabled={saving || !canSave}>
                {saving ? 'Creating…' : 'Create matter'}
              </button>}
        </div>
      </div>
    </div>
  );
}

function FactInput({ field, value, onChange }: { field: FactField; value: string; onChange: (v: string) => void }) {
  const label = <label>{field.label}{field.required && ' *'}</label>;
  return (
    <div className="field">
      {label}
      {field.type === 'textarea' && <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />}
      {field.type === 'select' && (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options?.map((o) => <option key={o}>{o}</option>)}
        </select>
      )}
      {field.type === 'date' && <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />}
      {(field.type === 'amount' || field.type === 'number') && (
        <input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
      )}
      {field.type === 'text' && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />}
      {field.help && <small className="muted">{field.help}</small>}
    </div>
  );
}

function ConflictBanner({ hits }: { hits: ConflictHit[] }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: 'crimson' }}>
      <div className="tag t-danger" style={{ marginBottom: 8, display: 'inline-block' }}>⚠ Possible conflict of interest</div>
      <p style={{ fontSize: 13, marginBottom: 8 }}>
        You have acted in matters involving {hits.length === 1 ? 'this name' : 'these names'} before. Check before you accept the engagement.
      </p>
      {hits.map((h) => (
        <div key={h.contact.id} style={{ fontSize: 13, marginBottom: 6 }}>
          <b>{h.contact.full_name}</b>
          {h.matters.map((m) => (
            <div key={m.matter_id} className="muted" style={{ fontSize: 12.5, marginLeft: 12 }}>
              {m.title} — appeared as {m.role.replace(/_/g, ' ')} on the {m.side} side
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function toPartyPayload(p: PartyForm) {
  const c = p.contact;
  const aka = c.aka_names.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    role: p.role,
    side: p.side,
    advocate_name: p.advocate_name,
    address_for_service: p.address_for_service,
    contact: p.contactId
      ? { id: p.contactId }
      : {
          entity_type: c.entity_type, salutation: c.salutation, full_name: c.full_name.trim(),
          aka_names: aka.length ? aka : undefined,
          age: c.age, gender: c.gender, relation_type: c.relation_type, relation_name: c.relation_name,
          occupation: c.occupation, address_line: c.address_line, village_town: c.village_town,
          taluka: c.taluka, district: c.district, state: c.state, pincode: c.pincode,
          mobile: c.mobile, email: c.email, pan: c.pan, aadhaar_last4: c.aadhaar_last4,
          is_minor: c.is_minor, is_unsound_mind: c.is_unsound_mind,
        },
  };
}
