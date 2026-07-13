'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PartyFields, { emptyParty, type PartyForm } from '@/components/PartyFields';
import { getMatterType, PARTY_ROLE_LABEL, type PartyRole } from '@/lib/legal/matterTypes';
import { formatAddress, relationLabel } from '@/lib/legal/causeTitle';
import IconButton from '@/components/IconButton';
import { IconMinus } from '@/components/Icons';
import type { MatterPartyWithContact } from '@/lib/supabase/types';

/** The cause title, editable: implead a respondent, drop a party struck off. */
export default function PartiesPanel({ matterId, matterTypeCode, parties }: {
  matterId: string;
  matterTypeCode: string | null;
  parties: MatterPartyWithContact[];
}) {
  const router = useRouter();
  const type = getMatterType(matterTypeCode);
  const [adding, setAdding] = useState<PartyForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const groups = groupBySide(parties);

  async function removeParty(party: MatterPartyWithContact) {
    const name = party.contact.full_name;
    if (!window.confirm(`Remove ${name} from this matter?\n\nThe contact stays in your address book and in any other matter.`)) return;
    setError('');
    const res = await fetch(`/api/matters/${matterId}/parties/${party.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setError((await res.json()).error);
  }

  async function saveNew() {
    if (!adding || adding.contact.full_name.trim().length < 2) { setError('Give the party a name.'); return; }
    setBusy(true); setError('');
    try {
      const c = adding.contact;
      const aka = c.aka_names.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch(`/api/matters/${matterId}/parties`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parties: [{
            role: adding.role, side: adding.side,
            advocate_name: adding.advocate_name, address_for_service: adding.address_for_service,
            contact: adding.contactId ? { id: adding.contactId } : { ...c, aka_names: aka.length ? aka : undefined },
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add the party');
      setAdding(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="flexb" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontWeight: 700 }}>Parties <span className="muted">({parties.length})</span></span>
        {!adding && type && (
          <div className="gap8" style={{ display: 'flex' }}>
            <button className="chip" onClick={() => setAdding(emptyParty('client', type.roles.client))}>
              + {PARTY_ROLE_LABEL[type.roles.client]}
            </button>
            <button className="chip" onClick={() => setAdding(emptyParty('opposite', type.roles.opposite))}>
              + {PARTY_ROLE_LABEL[type.roles.opposite]}
            </button>
          </div>
        )}
      </div>

      {error && <div style={{ color: 'crimson', fontSize: 13, padding: '8px 16px' }}>{error}</div>}

      {groups.map(({ side, list }) => (
        <div key={side} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <div className={`tag ${side === 'client' ? 't-brand' : 't-grey'}`} style={{ marginBottom: 8, display: 'inline-block' }}>
            {side === 'client' ? 'Your side' : side === 'opposite' ? 'Opposite side' : 'Other'}
          </div>
          {list.map((p) => (
            <div className="flexb" key={p.id} style={{ marginBottom: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {list.length > 1 ? `${p.party_no}. ` : ''}
                  {[p.contact.salutation, p.contact.full_name].filter(Boolean).join(' ')}
                  {' '}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    ({PARTY_ROLE_LABEL[p.role as PartyRole] ?? p.role})
                  </span>
                  {p.contact.is_minor && <span className="tag t-danger" style={{ marginLeft: 8 }}>Minor</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {[
                    p.contact.age && `aged about ${p.contact.age} years`,
                    p.contact.relation_type && p.contact.relation_name && `${relationLabel(p.contact.relation_type)} ${p.contact.relation_name}`,
                    p.contact.occupation,
                  ].filter(Boolean).join(' · ')}
                </div>
                {formatAddress(p.contact) && <div className="muted" style={{ fontSize: 12.5 }}>R/o {formatAddress(p.contact)}</div>}
                {(p.contact.mobile || p.contact.email) && (
                  <div className="muted" style={{ fontSize: 12.5 }}>{[p.contact.mobile, p.contact.email].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <IconButton label={`Remove ${p.contact.full_name}`} danger onClick={() => removeParty(p)}><IconMinus /></IconButton>
            </div>
          ))}
        </div>
      ))}

      {adding && (
        <div style={{ padding: 16 }}>
          <PartyFields party={adding} index={0} total={1}
            onChange={setAdding} onRemove={() => setAdding(null)} />
          <div className="gap8" style={{ display: 'flex' }}>
            <button className="cta brand" onClick={saveNew} disabled={busy}>{busy ? 'Adding…' : 'Add party'}</button>
            <button className="cta" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        </div>
      )}

      {parties.length === 0 && !adding && (
        <div className="muted" style={{ padding: 16, fontSize: 13.5 }}>No parties recorded on this matter.</div>
      )}
    </div>
  );
}

function groupBySide(parties: MatterPartyWithContact[]) {
  const order = ['client', 'opposite', 'other'];
  return order
    .map((side) => ({ side, list: parties.filter((p) => p.side === side).sort((a, b) => a.party_no - b.party_no) }))
    .filter((g) => g.list.length > 0);
}
