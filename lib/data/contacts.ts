import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbContact } from '@/lib/supabase/types';
import { isUuid } from '@/lib/validation/uuid';

export type ContactInput = Partial<Omit<DbContact, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & {
  full_name: string;
};

export async function listContacts(userId: string, q?: string): Promise<DbContact[]> {
  const sb = createSupabaseAdmin();
  let query = sb.from('contacts').select('*').eq('user_id', userId);
  if (q?.trim()) query = query.ilike('full_name', `%${sanitiseFilterValue(q)}%`);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data as DbContact[]) ?? [];
}

export async function getContact(userId: string, contactId: string): Promise<DbContact | null> {
  if (!isUuid(contactId)) return null;
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('contacts').select('*')
    .eq('id', contactId).eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as DbContact) ?? null;
}

export async function createContact(userId: string, input: ContactInput): Promise<DbContact> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('contacts')
    .insert({ user_id: userId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbContact;
}

export async function updateContact(userId: string, contactId: string, input: Partial<ContactInput>): Promise<DbContact> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('contacts').update(input)
    .eq('id', contactId).eq('user_id', userId)
    .select('*').single();
  if (error) throw error;
  return data as DbContact;
}

/**
 * Create the contacts a matter needs, reusing any the caller already picked.
 * Returns contact ids in the same order as `inputs`.
 */
export async function resolveContacts(
  userId: string,
  inputs: Array<{ contact_id?: string } & Partial<ContactInput>>,
): Promise<string[]> {
  return Promise.all(
    inputs.map(async (input) => {
      if (input.contact_id) {
        const existing = await getContact(userId, input.contact_id);
        if (!existing) throw new Error(`Contact ${input.contact_id} not found`);
        return existing.id;
      }
      const { contact_id: _ignored, ...rest } = input;
      if (!rest.full_name?.trim()) throw new Error('Every party needs a name');
      const created = await createContact(userId, rest as ContactInput);
      return created.id;
    }),
  );
}

export interface ConflictHit {
  contact: Pick<DbContact, 'id' | 'full_name' | 'aka_names' | 'mobile' | 'email'>;
  matters: Array<{ matter_id: string; title: string; role: string; side: string }>;
}

/**
 * Conflict check: has this advocate already acted for — or against — anyone
 * named here?
 *
 * Run before the engagement, not after. Checks aliases too, because the classic
 * failure is a clean result from searching only the current legal name while a
 * former or trading name sits in the file under a different spelling.
 */
export async function conflictCheck(userId: string, names: string[]): Promise<ConflictHit[]> {
  const wanted = names.map((n) => n.trim()).filter((n) => n.length >= 3);
  if (wanted.length === 0) return [];

  const sb = createSupabaseAdmin();
  const clauses = wanted.flatMap((n) => {
    const safe = sanitiseFilterValue(n);
    return safe ? [`full_name.ilike.%${safe}%`, `aka_names.cs.{"${safe}"}`] : [];
  });
  if (clauses.length === 0) return [];

  const { data: contacts, error } = await sb
    .from('contacts')
    .select('id, full_name, aka_names, mobile, email')
    .eq('user_id', userId)
    .or(clauses.join(','));
  if (error) throw error;
  if (!contacts?.length) return [];

  const { data: links, error: linkErr } = await sb
    .from('matter_parties')
    .select('contact_id, role, side, matters!inner(id, title, user_id)')
    .in('contact_id', contacts.map((c) => c.id))
    .eq('matters.user_id', userId);
  if (linkErr) throw linkErr;

  const byContact = new Map<string, ConflictHit['matters']>();
  for (const link of (links ?? []) as any[]) {
    const list = byContact.get(link.contact_id) ?? [];
    list.push({ matter_id: link.matters.id, title: link.matters.title, role: link.role, side: link.side });
    byContact.set(link.contact_id, list);
  }

  // A contact with no matter link is a bare address-book entry, not a conflict.
  return (contacts as ConflictHit['contact'][])
    .map((contact) => ({ contact, matters: byContact.get(contact.id) ?? [] }))
    .filter((hit) => hit.matters.length > 0);
}

/**
 * PostgREST parses `or=(...)` as a comma-separated list, so a comma, paren or
 * quote inside a value would break out of its clause. Names legitimately carry
 * them ("Sharma & Sons (P) Ltd."), so drop those characters and the ilike
 * wildcards rather than reject the name.
 */
function sanitiseFilterValue(value: string): string {
  return value.replace(/[,()"'%\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
