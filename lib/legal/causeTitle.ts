import type { DbContact, MatterPartyWithContact } from '@/lib/supabase/types';
import { PARTY_ROLE_LABEL, type PartyRole } from '@/lib/legal/matterTypes';

/**
 * Pure formatters for Indian cause titles and memos of parties.
 *
 * No server imports — the intake form renders a live preview with these, and
 * the AI prompt builder feeds them the same contacts, so what the advocate sees
 * while typing is exactly what the model is told.
 */

/** Courts write these as S/o, not S/O. */
const RELATION_DISPLAY: Record<string, string> = {
  's/o': 'S/o', 'd/o': 'D/o', 'w/o': 'W/o', 'h/o': 'H/o', 'c/o': 'C/o',
};

export function relationLabel(relation: string | null | undefined): string {
  return relation ? RELATION_DISPLAY[relation] ?? relation : '';
}

/** "12, MG Road, Civil Lines, Jaipur, Rajasthan – 302001" */
export function formatAddress(c: Pick<DbContact,
  'address_line' | 'village_town' | 'taluka' | 'district' | 'state' | 'pincode'>): string {
  const line = [c.address_line, c.village_town, c.taluka, c.district, c.state]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
  return c.pincode ? `${line} – ${c.pincode}` : line;
}

/**
 * The "description" Order VII r.1(b)–(d) CPC asks for, in the order a court
 * expects to read it: name, age, relation, occupation, residence — followed by
 * the minority / unsound-mind statement r.1(d) makes mandatory.
 */
export function describeParty(c: DbContact): string {
  const bits: string[] = [];

  const name = [c.salutation?.trim(), c.full_name.trim()].filter(Boolean).join(' ');
  bits.push(name);

  if (c.entity_type !== 'individual') {
    const address = formatAddress(c);
    return address ? `${name}, a ${entityLabel(c.entity_type)}, having its office at ${address}` : name;
  }

  if (c.age) bits.push(`aged about ${c.age} years`);
  if (c.relation_type && c.relation_name) {
    bits.push(`${RELATION_DISPLAY[c.relation_type] ?? c.relation_type} ${c.relation_name}`);
  }
  if (c.occupation) bits.push(`Occupation: ${c.occupation}`);

  const address = formatAddress(c);
  if (address) bits.push(`R/o ${address}`);

  let out = bits.join(', ');

  if (c.is_minor || c.is_unsound_mind) {
    const condition = c.is_minor ? 'a minor' : 'a person of unsound mind';
    out += `, ${condition}`;
  }
  return out;
}

function entityLabel(type: DbContact['entity_type']): string {
  switch (type) {
    case 'company': return 'company incorporated under the Companies Act, 2013';
    case 'partnership': return 'partnership firm';
    case 'proprietorship': return 'sole proprietorship concern';
    case 'huf': return 'Hindu Undivided Family';
    case 'trust': return 'trust';
    case 'society': return 'registered society';
    case 'government': return 'government authority';
    default: return 'juristic person';
  }
}

export interface CauseTitleGroup {
  role: string;
  roleLabel: string;
  side: string;
  parties: Array<{ no: number; description: string; contact: DbContact }>;
}

/** Groups parties by role, preserving party_no, ready to render or print. */
export function groupByRole(parties: MatterPartyWithContact[]): CauseTitleGroup[] {
  const groups = new Map<string, CauseTitleGroup>();
  for (const p of parties) {
    if (!p.contact) continue;
    const g = groups.get(p.role) ?? {
      role: p.role,
      roleLabel: PARTY_ROLE_LABEL[p.role as PartyRole] ?? titleCase(p.role),
      side: p.side,
      parties: [],
    };
    g.parties.push({ no: p.party_no, description: describeParty(p.contact), contact: p.contact });
    groups.set(p.role, g);
  }
  for (const g of groups.values()) g.parties.sort((a, b) => a.no - b.no);
  // Client side first — that is how the advocate reads their own file.
  return [...groups.values()].sort((a, b) => sideRank(a.side) - sideRank(b.side));
}

function sideRank(side: string): number {
  return side === 'client' ? 0 : side === 'opposite' ? 1 : 2;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * A full memo of parties:
 *
 *   1. Rajesh Sharma, aged about 45 years, S/o Mohan Lal, …   …Complainant
 *
 *      Versus
 *
 *   1. Anil Kapoor, aged about 52 years, S/o Suresh Kapoor, … …Accused
 */
export function renderCauseTitle(parties: MatterPartyWithContact[]): string {
  const groups = groupByRole(parties);
  if (groups.length === 0) return '';

  return groups
    .map((g) => {
      const numbered = g.parties.length > 1;
      const lines = g.parties.map((p, i) => {
        const prefix = numbered ? `${i + 1}. ` : '';
        const suffix = i === g.parties.length - 1
          ? `\t…${g.roleLabel}${numbered ? 's' : ''}`
          : '';
        return `${prefix}${p.description}${suffix}`;
      });
      return lines.join('\n');
    })
    .join('\n\n\tVersus\n\n');
}

/** "Sharma vs Kapoor" — the short handle used for matter titles and file names. */
export function shortCaseName(parties: MatterPartyWithContact[]): string {
  const groups = groupByRole(parties);
  const first = groups[0]?.parties[0]?.contact.full_name;
  const second = groups[1]?.parties[0]?.contact.full_name;
  if (!first) return '';
  const surname = (n: string) => n.trim().split(/\s+/).pop() ?? n;
  return second ? `${surname(first)} vs ${surname(second)}` : surname(first);
}
