'use client';

import { useEffect, useRef, useState } from 'react';
import { PARTY_ROLES, PARTY_ROLE_LABEL, type PartyRole } from '@/lib/legal/matterTypes';

export interface ContactForm {
  entity_type: string;
  salutation: string;
  full_name: string;
  aka_names: string;      // comma-separated in the form, split on submit
  age: string;
  gender: string;
  relation_type: string;
  relation_name: string;
  occupation: string;
  address_line: string;
  village_town: string;
  taluka: string;
  district: string;
  state: string;
  pincode: string;
  mobile: string;
  email: string;
  pan: string;
  aadhaar_last4: string;
  is_minor: boolean;
  is_unsound_mind: boolean;
}

export interface PartyForm {
  key: string;
  side: 'client' | 'opposite';
  role: PartyRole;
  /** Set when an existing contact was picked; its fields are then read-only. */
  contactId?: string;
  contact: ContactForm;
  advocate_name: string;
  address_for_service: string;
}

export function emptyContact(): ContactForm {
  return {
    entity_type: 'individual', salutation: '', full_name: '', aka_names: '',
    age: '', gender: '', relation_type: '', relation_name: '', occupation: '',
    address_line: '', village_town: '', taluka: '', district: '', state: '', pincode: '',
    mobile: '', email: '', pan: '', aadhaar_last4: '',
    is_minor: false, is_unsound_mind: false,
  };
}

export function emptyParty(side: PartyForm['side'], role: PartyRole): PartyForm {
  return {
    key: Math.random().toString(36).slice(2),
    side, role, contact: emptyContact(), advocate_name: '', address_for_service: '',
  };
}

const ENTITY_TYPES = [
  ['individual', 'Individual'], ['company', 'Company'], ['partnership', 'Partnership firm'],
  ['proprietorship', 'Proprietorship'], ['huf', 'HUF'], ['trust', 'Trust'],
  ['society', 'Society'], ['government', 'Government'],
] as const;

const RELATION_TYPES = [
  ['s/o', 'S/o (son of)'], ['d/o', 'D/o (daughter of)'], ['w/o', 'W/o (wife of)'],
  ['h/o', 'H/o (husband of)'], ['c/o', 'C/o (care of)'],
] as const;

interface SavedContact {
  id: string;
  full_name: string;
  mobile: string | null;
  district: string | null;
}

interface Props {
  party: PartyForm;
  index: number;
  total: number;
  onChange: (next: PartyForm) => void;
  onRemove: () => void;
}

/**
 * One party's details — the "name, description and place of residence" that
 * Order VII r.1 CPC requires, collected once here so no draft ever asks again.
 */
export default function PartyFields({ party, index, total, onChange, onRemove }: Props) {
  const [showMore, setShowMore] = useState(false);
  const c = party.contact;
  const isIndividual = c.entity_type === 'individual';

  const setContact = (k: keyof ContactForm, v: string | boolean) =>
    onChange({ ...party, contact: { ...c, [k]: v } });

  const roleLabel = PARTY_ROLE_LABEL[party.role];
  const heading = total > 1 ? `${roleLabel} No. ${index + 1}` : roleLabel;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12, background: 'var(--bg-soft, transparent)' }}>
      <div className="flexb" style={{ marginBottom: 12 }}>
        <span className={`tag ${party.side === 'client' ? 't-brand' : 't-grey'}`}>{heading}</span>
        <div className="gap8" style={{ display: 'flex', alignItems: 'center' }}>
          {party.contactId && (
            <button
              type="button" className="chip"
              onClick={() => onChange({ ...party, contactId: undefined })}
              title="Edit these details as a new contact instead of using the saved one"
            >
              Saved contact · detach
            </button>
          )}
          <button type="button" className="tb-btn" style={{ width: 30, height: 30 }} onClick={onRemove} title="Remove this party">✕</button>
        </div>
      </div>

      {!party.contactId && (
        <ContactSearch
          onPick={(picked) => onChange({
            ...party,
            contactId: picked.id,
            contact: { ...c, full_name: picked.full_name, mobile: picked.mobile ?? '', district: picked.district ?? '' },
          })}
        />
      )}

      <fieldset disabled={!!party.contactId} style={{ border: 0, padding: 0, margin: 0, opacity: party.contactId ? 0.65 : 1 }}>
        <div className="split" style={{ gap: 12 }}>
          <div className="field"><label>Party is a</label>
            <select value={c.entity_type} onChange={(e) => setContact('entity_type', e.target.value)}>
              {ENTITY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field"><label>Role</label>
            <select value={party.role} onChange={(e) => onChange({ ...party, role: e.target.value as PartyRole })}>
              {PARTY_ROLES.map((r) => <option key={r} value={r}>{PARTY_ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        </div>

        <div className="field"><label>{isIndividual ? 'Full name *' : 'Name of the entity *'}</label>
          <input value={c.full_name} onChange={(e) => setContact('full_name', e.target.value)}
            placeholder={isIndividual ? 'e.g. Rajesh Sharma' : 'e.g. Sharma & Sons Pvt. Ltd.'} />
        </div>

        {isIndividual && (
          <>
            <div className="split" style={{ gap: 12 }}>
              <div className="field"><label>Age</label>
                <input type="number" min={1} max={129} value={c.age} onChange={(e) => setContact('age', e.target.value)} placeholder="45" />
              </div>
              <div className="field"><label>Gender</label>
                <select value={c.gender} onChange={(e) => setContact('gender', e.target.value)}>
                  <option value="">—</option><option value="male">Male</option>
                  <option value="female">Female</option><option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="split" style={{ gap: 12 }}>
              <div className="field"><label>Relation</label>
                <select value={c.relation_type} onChange={(e) => setContact('relation_type', e.target.value)}>
                  <option value="">—</option>
                  {RELATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field"><label>Father&apos;s / husband&apos;s / guardian&apos;s name</label>
                <input value={c.relation_name} onChange={(e) => setContact('relation_name', e.target.value)} placeholder="e.g. Mohan Lal" />
              </div>
            </div>

            <div className="field"><label>Occupation</label>
              <input value={c.occupation} onChange={(e) => setContact('occupation', e.target.value)} placeholder="e.g. Businessman" />
            </div>
          </>
        )}

        <div className="field"><label>Address</label>
          <textarea rows={2} value={c.address_line} onChange={(e) => setContact('address_line', e.target.value)}
            placeholder="House / street / locality" />
        </div>
        <div className="split" style={{ gap: 12 }}>
          <div className="field"><label>Village / town</label>
            <input value={c.village_town} onChange={(e) => setContact('village_town', e.target.value)} /></div>
          <div className="field"><label>Taluka / tehsil</label>
            <input value={c.taluka} onChange={(e) => setContact('taluka', e.target.value)} /></div>
        </div>
        <div className="split" style={{ gap: 12 }}>
          <div className="field"><label>District</label>
            <input value={c.district} onChange={(e) => setContact('district', e.target.value)} /></div>
          <div className="field"><label>State</label>
            <input value={c.state} onChange={(e) => setContact('state', e.target.value)} /></div>
        </div>
        <div className="split" style={{ gap: 12 }}>
          <div className="field"><label>Pincode</label>
            <input inputMode="numeric" maxLength={6} value={c.pincode} onChange={(e) => setContact('pincode', e.target.value)} placeholder="302001" /></div>
          <div className="field"><label>Mobile</label>
            <input value={c.mobile} onChange={(e) => setContact('mobile', e.target.value)} placeholder="+91 98290 00000" /></div>
        </div>

        <button type="button" className="chip" style={{ marginBottom: 10 }} onClick={() => setShowMore((s) => !s)}>
          {showMore ? '− Fewer details' : '+ More details'}
        </button>

        {showMore && (
          <>
            <div className="split" style={{ gap: 12 }}>
              <div className="field"><label>Salutation</label>
                <input value={c.salutation} onChange={(e) => setContact('salutation', e.target.value)} placeholder="Mr. / Smt. / M/s" /></div>
              <div className="field"><label>Email</label>
                <input type="email" value={c.email} onChange={(e) => setContact('email', e.target.value)} /></div>
            </div>
            <div className="field"><label>Also known as</label>
              <input value={c.aka_names} onChange={(e) => setContact('aka_names', e.target.value)}
                placeholder="Maiden name, trading name, former name — separate with commas" />
              <small className="muted">Conflict checks search these too. A clean result from the current name alone means little.</small>
            </div>
            <div className="split" style={{ gap: 12 }}>
              <div className="field"><label>PAN</label>
                <input value={c.pan} onChange={(e) => setContact('pan', e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" /></div>
              <div className="field"><label>Aadhaar — last 4 digits only</label>
                <input inputMode="numeric" maxLength={4} value={c.aadhaar_last4} onChange={(e) => setContact('aadhaar_last4', e.target.value)} placeholder="1234" />
                <small className="muted">We never store a full Aadhaar number.</small>
              </div>
            </div>
            <div className="field"><label>Address for service</label>
              <textarea rows={2} value={party.address_for_service}
                onChange={(e) => onChange({ ...party, address_for_service: e.target.value })}
                placeholder="If different from the address above (Order VI r.14A CPC)" />
            </div>
            <div className="field"><label>Opposing advocate</label>
              <input value={party.advocate_name} onChange={(e) => onChange({ ...party, advocate_name: e.target.value })} />
            </div>

            {isIndividual && (
              <div className="field">
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={c.is_minor} onChange={(e) => setContact('is_minor', e.target.checked)} style={{ width: 'auto' }} />
                  This party is a minor
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={c.is_unsound_mind} onChange={(e) => setContact('is_unsound_mind', e.target.checked)} style={{ width: 'auto' }} />
                  This party is of unsound mind
                </label>
                <small className="muted">
                  Order VII r.1(d) CPC requires this to be stated in the plaint, and such a party sues through a guardian or next friend.
                </small>
              </div>
            )}
          </>
        )}
      </fieldset>
    </div>
  );
}

/** Type a name; pick a contact this advocate already has on file. */
function ContactSearch({ onPick }: { onPick: (c: SavedContact) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SavedContact[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/contacts?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => { setResults(d.contacts ?? []); setOpen(true); })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="field" style={{ position: 'relative' }}>
      <label>Reuse a saved contact</label>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your existing clients and parties…" />
      {open && results.length > 0 && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: 200, overflowY: 'auto' }}>
          {results.map((r) => (
            <button
              key={r.id} type="button" className="row" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}
              onClick={() => { onPick(r); setOpen(false); setQ(''); }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{[r.mobile, r.district].filter(Boolean).join(' · ') || 'No contact details'}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
